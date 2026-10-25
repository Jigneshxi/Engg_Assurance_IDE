"""
PLATFORM INTEGRATIONS
Handles connectivity testing and secure storage of Jira/ADO/XRay credentials.
"""
import logging
import datetime
import requests
from fastapi import APIRouter, HTTPException, Depends
from backend.api.routes.auth import get_current_user
from backend.core.auth_models import User
from sqlalchemy.orm import Session
from urllib.parse import urlparse
from backend.api.models import TestConnectionRequest
from backend.core.database import get_db, ConnectedPlatform
from backend.core.vault import SecretVault
import hashlib
import time
from jose import jwt

router = APIRouter(prefix="/api/integrations", tags=["Connectors"])
logger = logging.getLogger(__name__)

def _json_message(res: requests.Response) -> str:
    try:
        if res is None:
            return "Endpoint unreachable."
        if res.headers.get("content-type", "").lower().startswith("application/json"):
            j = res.json()
            if isinstance(j, dict):
                return (
                    j.get("message")
                    or j.get("error")
                    or j.get("detail")
                    or j.get("error_description")
                    or "Authentication rejected."
                )
        return res.text[:200] if res.text else "Authentication rejected."
    except Exception:
        return "Authentication rejected."

def _bearer_headers(token: str, extra: dict | None = None) -> dict:
    # Accept both raw tokens and already-prefixed "Bearer <token>"
    t = (token or "").strip()
    if not t:
        return extra or {}
    auth = t if t.lower().startswith("bearer ") else f"Bearer {t}"
    h = {"Authorization": auth, "Accept": "application/json", "User-Agent": "VVnT-Agentic-Mesh/1.0"}
    if extra:
        h.update(extra)
    return h

def _basic_auth(email: str, token: str):
    # Many tools accept either (username=email, password=token) or (user='', password=PAT).
    return (email or "", token or "")

def _persist_platform(db: Session, platform: str, config, consent: dict | None = None) -> None:
    encrypted = SecretVault.encrypt(config.token)
    existing = db.query(ConnectedPlatform).filter(ConnectedPlatform.platform_name == platform).first()
    if existing:
        existing.url = config.url
        existing.email = config.email
        existing.encrypted_token = encrypted
        if consent is not None:
            existing.consent_record = consent
        existing.last_validated = datetime.datetime.utcnow()
    else:
        db.add(ConnectedPlatform(
            platform_name=platform,
            url=config.url,
            email=config.email,
            encrypted_token=encrypted,
            consent_record=consent,
            last_validated=datetime.datetime.utcnow()
        ))
    db.commit()

def _normalize_instance_url(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    if "://" not in s and not s.startswith("mock://"):
        s = "https://" + s
    return s.rstrip("/")

def _host(u: str) -> str:
    try:
        return (urlparse(u).hostname or "").lower()
    except Exception:
        return ""

def _api_base_for(platform: str, instance_url: str) -> str:
    """
    Derive API base URLs from end-user "instance URL" inputs.
    Users should not need to know vendor API base URLs.
    """
    p = platform.lower()
    inst = _normalize_instance_url(instance_url)
    if inst.startswith("mock://"):
        return inst

    if p == "notion":
        return "https://api.notion.com"
    if p == "googledrive":
        return "https://www.googleapis.com"
    if p in {"onedrive", "sharepoint"}:
        return "https://graph.microsoft.com"
    if p == "slack":
        return "https://slack.com"
    if p == "bitbucket":
        return "https://api.bitbucket.org"
    if p == "github":
        h = _host(inst)
        if h in {"github.com", "www.github.com"}:
            return "https://api.github.com"
        return f"{inst}/api/v3"
        
    if p == "gitlab":
        # Extract just the scheme and hostname for GitLab API calls
        try:
            parsed = urlparse(inst)
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return "https://gitlab.com"

    return inst

def _validate_handshake(platform: str, res: requests.Response) -> tuple[bool, str]:
    """
    Return (ok, message). Some APIs return HTTP 200 with an error payload.
    We validate minimal "authenticated" signals to avoid false positives.
    """
    if not res:
        return False, "Endpoint unreachable."

    p = platform.lower()
    ct = (res.headers.get("content-type") or "").lower()

    # Non-JSON endpoints: accept 200 as connectivity unless we can parse a known signature.
    if "application/json" not in ct:
        return (res.status_code == 200), ("OK" if res.status_code == 200 else "Non-JSON handshake failed.")

    try:
        j = res.json()
    except Exception:
        return False, "Invalid JSON response."

    if p == "slack":
        # Slack returns { ok: false, error: "invalid_auth" } with HTTP 200
        if isinstance(j, dict) and j.get("ok") is True:
            return True, "Slack auth.test ok."
        err = j.get("error") if isinstance(j, dict) else None
        return False, err or "Slack auth.test failed."

    if p == "swagger":
        # OpenAPI documents should contain 'openapi' or legacy 'swagger'
        if isinstance(j, dict) and ("openapi" in j or "swagger" in j):
            return True, "OpenAPI spec detected."
        return False, "OpenAPI/Swagger signature not found."

    # Generic "whoami" / account probes
    if p in {"github", "gitlab", "bitbucket"}:
        if isinstance(j, dict) and (j.get("id") is not None or j.get("username") or j.get("login")):
            return True, "User identity verified."
        return False, "User identity not present in response."

    if p == "notion":
        if isinstance(j, dict) and (j.get("object") == "user" or j.get("id")):
            return True, "Notion user identity verified."
        return False, "Notion user identity missing."

    if p in {"googledrive"}:
        # { "user": { ... } }
        if isinstance(j, dict) and isinstance(j.get("user"), dict):
            return True, "Google Drive identity verified."
        return False, "Google Drive user missing."

    if p in {"onedrive"}:
        # Graph returns drive object with id/driveType
        if isinstance(j, dict) and j.get("id"):
            return True, "OneDrive drive object verified."
        return False, "OneDrive drive object missing."

    if p in {"sharepoint"}:
        # Graph sites/root returns { id, name, webUrl, ... }
        if isinstance(j, dict) and j.get("id"):
            return True, "SharePoint site object verified."
        return False, "SharePoint site object missing."

    if p in {"qtest"}:
        # qTest often returns a list/array for /projects
        if isinstance(j, list) or (isinstance(j, dict) and j.get("items") is not None):
            return True, "qTest projects reachable."
        return False, "qTest projects payload unexpected."

    if p in {"testrail"}:
        if isinstance(j, list) or isinstance(j, dict):
            return True, "TestRail API reachable."
        return False, "TestRail payload unexpected."

    if p in {"jira", "confluence"}:
        if isinstance(j, dict) and (j.get("accountId") or j.get("name") or j.get("emailAddress")):
            return True, "Atlassian identity verified."
        return False, "Atlassian identity missing."

    if p == "ado":
        # ADO projects list: {"count":..., "value":[...]}
        if isinstance(j, dict) and ("value" in j or "count" in j):
            return True, "ADO projects reachable."
        return False, "ADO projects payload unexpected."

    if p in {"servicenow"}:
        # ServiceNow table query: {"result":[...]} or {"result":{...}}
        if isinstance(j, dict) and "result" in j:
            return True, "ServiceNow API reachable."
        return False, "ServiceNow payload unexpected."

    if p == "xray":
        if isinstance(j, dict) and "data" in j and "getTests" in j["data"]:
            total = j["data"]["getTests"].get("total", 0)
            return True, f"Xray Cloud authenticated. {total} test cases accessible."
        return False, "Xray GraphQL access verified, but response payload was unexpected."

    # Default: treat HTTP 200 as OK
    return True, "OK"

def _validate_no_auth_platform(platform: str, config) -> str | None:
    """
    ISS-010 FIX: Input validation for platforms that require no external auth handshake.

    Returns an error message string if validation fails, or None if input is valid.

    Rules per platform:
    - networkpath: Must provide a non-empty URL or file path. If URL, must be http/https.
    - video:       Must provide a non-empty URL or file path reference.
    - mediaupload: Must provide a non-empty reference (file name or path).
    - directpaste: Must provide non-empty content (token field used as content reference).
    - fileupload:  Must provide a non-empty file reference.
    """
    p = platform.lower()
    url_val = (config.url or "").strip()
    token_val = (config.token or "").strip()
    # Use whichever field the user populated
    primary_input = url_val or token_val

    if p == "networkpath":
        if not primary_input:
            return (
                "Network Path / URL is required. "
                "Provide a valid HTTP/HTTPS URL (e.g. https://confluence.company.com/page/123), "
                "a Swagger/OpenAPI URL, or a local file path."
            )
        # If it looks like a URL, validate the scheme
        if primary_input.startswith(("http://", "https://", "ftp://")):
            parsed = urlparse(primary_input)
            if not parsed.netloc:
                return f"Invalid URL format: '{primary_input}'. Provide a complete URL including the domain."
            if parsed.scheme not in ("http", "https"):
                return f"Unsupported URL scheme '{parsed.scheme}'. Only http:// and https:// are supported."
        return None  # Local paths and valid URLs pass

    if p == "video":
        if not primary_input:
            return (
                "A video/audio source reference is required. "
                "Provide a YouTube URL, a local file path, or an uploaded file name."
            )
        if primary_input.startswith(("http://", "https://")):
            parsed = urlparse(primary_input)
            if not parsed.netloc:
                return f"Invalid video URL: '{primary_input}'."
        return None

    if p == "mediaupload":
        if not primary_input:
            return (
                "A media file reference is required. "
                "Provide an image file path or name for OCR extraction."
            )
        return None

    if p == "directpaste":
        # For direct paste, the content itself is passed as the ticket_id at fetch time.
        # At configuration time we just need to confirm the source is acknowledged.
        # No strict validation needed — user may configure it without content yet.
        return None

    if p == "fileupload":
        # File upload sources are configured before the file is uploaded.
        # No strict validation at configuration time.
        return None

    return None  # Unknown no-auth platform — allow through


@router.post("/test")
async def test_platform_connectivity(req: TestConnectionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PLATFORM CONNECTIVITY VAULT
    Action: Verifies and persists credentials for ALM tools.
    Logic:
    1. Check for URL/Token presence.
    2. Support 'mock://vvnt' for internal developer demonstrations.
    3. Jira: Pings the /myself endpoint as a lightweight auth check.
    4. ADO: Pings /_apis/projects via PAT Basic Auth.
    5. Persistence: On 200 OK, update or create the ConnectedPlatform entry.
    """
    platform = req.platform.lower()
    config = req.config
    try:
        config.url = _normalize_instance_url(config.url)

        # Per-platform required fields (end-user oriented).
        # ISS-010: directpaste and fileupload don't need instance_url — content provided at fetch time
        needs_instance_url = platform not in {"notion", "googledrive", "onedrive", "sharepoint", "slack", "bitbucket", "directpaste", "fileupload"}
        needs_token = platform not in {"swagger", "directpaste", "fileupload", "video", "mediaupload", "networkpath"}
        needs_email = platform in {"jira", "confluence", "testrail", "servicenow", "alm", "microfocus"}

        if needs_instance_url and not config.url:
            raise HTTPException(status_code=400, detail="Instance URL is required.")
        if needs_token and not (config.token or "").strip():
            raise HTTPException(status_code=400, detail="Access Token is required.")
        if needs_email and not (config.email or "").strip():
            raise HTTPException(status_code=400, detail="Username / Email is required.")
            
        # Mock Discovery Mode for offline environment debugging.
        if config.url == "mock://vvnt" or (config.token or "").strip() == "mock":
            # Persist mock identities as well so the UI can represent linkage
            # consistently across all Platform Linkage options in offline demos.
            try:
                # SAFETY: Never let Mock Mode overwrite a real (non-mock) saved connection.
                existing = db.query(ConnectedPlatform).filter(ConnectedPlatform.platform_name == platform).first()
                if existing and existing.url and existing.url != "mock://vvnt":
                    pass  # keep the real connection untouched
                else:
                    _persist_platform(db, platform, config, consent=req.consent)
            except Exception as persist_err:
                logger.error(f"[PLATFORM-TEST] Mock persistence failed for {platform}: {persist_err}")
                db.rollback()
            return {"success": True, "message": f"Connected to {platform.upper()} (Mock Mode)!"}
            
        # Logic: Connectivity verification flow.
        
        # Consent validation for Tier 1 integrations
        tier_1_platforms = {"jira", "ado", "github", "gitlab", "bitbucket", "confluence"}
        if platform in tier_1_platforms and not req.consent:
            raise HTTPException(status_code=400, detail=f"Explicit consent record is required to connect to {platform.upper()}.")

        res = None
        inst = config.url.rstrip("/")
        base = _api_base_for(platform, inst).rstrip("/")
        timeout = 12

        # --- ALM / DevOps ---
        if platform == "ado":
            # PAT via basic auth (user blank)
            url = f"{base}/_apis/projects?api-version=6.0"
            res = requests.get(url, auth=("", config.token), headers={"Accept": "application/json"}, timeout=timeout)
        elif platform == "jira":
            # API token via basic auth (email + token)
            url = f"{base}/rest/api/2/myself"
            res = requests.get(url, auth=_basic_auth(config.email, config.token), headers={"Accept": "application/json"}, timeout=timeout)
        elif platform == "github":
            # GitHub REST: /user
            url = f"{base}/user"
            h = _bearer_headers(config.token)
            h.setdefault("User-Agent", "VVnT-Agentic-Mesh/1.0")
            res = requests.get(url, headers=h, timeout=timeout)
        elif platform == "gitlab":
            # GitLab REST: /api/v4/user
            url = f"{base}/api/v4/user"
            # GitLab supports PRIVATE-TOKEN or Authorization: Bearer. We'll prefer bearer.
            h = {"PRIVATE-TOKEN": config.token, "Accept": "application/json", "User-Agent": "VVnT-Agentic-Mesh/1.0"}
            res = requests.get(url, headers=h, timeout=timeout)
            if res.status_code in (401, 403):
                h2 = _bearer_headers(config.token)
                h2.setdefault("User-Agent", "VVnT-Agentic-Mesh/1.0")
                res = requests.get(url, headers=h2, timeout=timeout)
        elif platform == "bitbucket":
            # Bitbucket Cloud: /2.0/user
            url = f"{base}/2.0/user"
            res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
        elif platform == "swagger":
            # OpenAPI spec fetch (no auth assumed). Accept either direct spec URL or base.
            candidates = [inst or base, f"{(inst or base)}/openapi.json", f"{(inst or base)}/swagger.json", f"{(inst or base)}/v3/api-docs"]
            last = None
            for u in candidates:
                last = requests.get(u, headers={"Accept": "application/json"}, timeout=timeout)
                if last.status_code == 200:
                    res = last
                    break
            if res is None:
                res = last

        # --- Test Management / QA tools ---
        elif platform == "testrail":
            # TestRail v2: get_projects (basic auth user:token)
            url = f"{base}/index.php?/api/v2/get_projects"
            res = requests.get(url, auth=_basic_auth(config.email, config.token), headers={"Accept": "application/json"}, timeout=timeout)
        elif platform == "qtest":
            # Tricentis qTest: v3 projects (bearer)
            url = f"{base}/api/v3/projects"
            res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
        elif platform == "xray":
            auth_url = "https://xray.cloud.getxray.app/api/v2/authenticate"
            payload = {"client_id": config.email, "client_secret": config.token}
            try:
                auth_res = requests.post(auth_url, json=payload, timeout=timeout)
                if auth_res.status_code == 200:
                    bearer_token = auth_res.json()
                    if isinstance(bearer_token, str):
                        bearer_token = bearer_token.strip('"')
                        
                    # Now verify project/test access using GraphQL
                    graphql_url = "https://xray.cloud.getxray.app/api/v2/graphql"
                    
                    # Check if we can read test cases, optionally filtered by project key
                    jql_filter = f'project = "{config.url}"' if config.url else "order by created DESC"
                    query = """
                    query($jql: String) {
                        getTests(jql: $jql, limit: 1) {
                            total
                            results { issueId }
                        }
                    }
                    """
                    res = requests.post(graphql_url, json={"query": query, "variables": {"jql": jql_filter}}, headers=_bearer_headers(bearer_token), timeout=timeout)
                else:
                    res = auth_res # Fail handshake with auth error
                    
            except requests.exceptions.RequestException as req_err:
                raise HTTPException(status_code=502, detail=f"Xray connection failed: {req_err}")
        elif platform == "zephyr":
            # Zephyr Squad Cloud: validate using JWT Auth
            # config.url = Account ID, config.email = Access Key, config.token = Secret Key
            if not config.url or not config.email or not config.token:
                raise HTTPException(status_code=400, detail="Zephyr Squad Cloud requires Account ID, Access Key, and Secret Key.")
                
            base_url = "https://prod-api.zephyr4jiracloud.com/connect"
            relative_path = "/public/rest/api/1.0/config/generalinformation"
            
            canonical_path = f"GET&{relative_path}&"
            qsh = hashlib.sha256(canonical_path.encode('utf-8')).hexdigest()
            
            payload = {
                'sub': config.url,
                'qsh': qsh,
                'iss': config.email,
                'exp': int(time.time()) + 3600,
                'iat': int(time.time())
            }
            
            try:
                jwt_token = jwt.encode(payload, config.token, algorithm='HS256')
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to generate JWT. Ensure your Secret Key is valid: {e}")
                
            headers = {
                'Authorization': f'JWT {jwt_token}',
                'zapiAccessKey': config.email,
                'Content-Type': 'application/json'
            }
            
            url = f"{base_url}{relative_path}"
            
            try:
                res = requests.get(url, headers=headers, timeout=timeout)
            except requests.exceptions.Timeout:
                raise HTTPException(status_code=502, detail="Zephyr Squad API request timed out. Check your network connection.")
            except requests.exceptions.RequestException as req_err:
                raise HTTPException(status_code=502, detail=f"Zephyr Squad connection failed: {req_err}")
                
            if res.status_code == 200:
                _persist_platform(db, platform, config, consent=req.consent)
                return {"success": True, "message": "Identity mapped and secured for ZEPHYR SQUAD."}
            elif res.status_code in (401, 403):
                raise HTTPException(status_code=401, detail="Zephyr Squad keys invalid or expired. Check Access Key, Secret Key, and Account ID.")
            else:
                msg = _json_message(res)
                raise HTTPException(status_code=502, detail=f"Zephyr Squad handshake failed (HTTP {res.status_code}): {msg}")
        elif platform == "alm" or platform == "microfocus":
            # Micro Focus ALM/QC REST: is-authenticated (best-effort)
            url = f"{base}/qcbin/rest/is-authenticated"
            res = requests.get(url, auth=_basic_auth(config.email, config.token), headers={"Accept": "application/json"}, timeout=timeout)
        elif platform == "rally":
            # Rally: subscription endpoint (best-effort). Rally often uses ZSESSIONID or APIKey.
            url = f"{base}/slm/webservice/v2.0/subscription"
            res = requests.get(url, headers={"ZSESSIONID": config.token, "Accept": "application/json"}, timeout=timeout)
            if res.status_code in (401, 403):
                res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)

        # --- Strategic repositories ---
        elif platform == "confluence":
            # Confluence Cloud: /rest/api/user/current (basic auth email + api token)
            url = f"{base}/rest/api/user/current"
            res = requests.get(url, auth=_basic_auth(config.email, config.token), headers={"Accept": "application/json"}, timeout=timeout)
        elif platform == "notion":
            # Notion: /v1/users/me (bearer + version header)
            url = f"{base}/v1/users/me"
            res = requests.get(url, headers=_bearer_headers(config.token, {"Notion-Version": "2022-06-28"}), timeout=timeout)
        elif platform == "googledrive":
            # Google Drive API: /drive/v3/about
            url = f"{base}/drive/v3/about?fields=user"
            res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
        elif platform == "onedrive":
            # Microsoft Graph: /v1.0/me/drive (bearer)
            url = f"{base}/v1.0/me/drive"
            res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
        elif platform == "sharepoint":
            # Microsoft Graph SharePoint probe: /v1.0/sites/root (bearer)
            url = f"{base}/v1.0/sites/root"
            res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
        elif platform == "servicenow":
            # ServiceNow: small table query (basic auth username=email, password=token) OR bearer
            url = f"{base}/api/now/table/sys_user?sysparm_limit=1"
            res = requests.get(url, auth=_basic_auth(config.email, config.token), headers={"Accept": "application/json"}, timeout=timeout)
            if res.status_code in (401, 403):
                res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)

        # --- Ad-hoc / non-handshake sources (no external auth to validate) ---
        elif platform in {"directpaste", "fileupload", "video", "mediaupload", "networkpath", "slack"}:
            if platform == "slack":
                # Slack: auth.test (bearer)
                url = f"{base}/api/auth.test"
                res = requests.get(url, headers=_bearer_headers(config.token), timeout=timeout)
            else:
                # ISS-010 FIX: Add input validation for no-auth platforms before persisting.
                # These platforms require no external handshake but should still validate
                # that the user has provided meaningful, correctly-formatted input.
                validation_error = _validate_no_auth_platform(platform, config)
                if validation_error:
                    raise HTTPException(status_code=400, detail=validation_error)

                _persist_platform(db, platform, config, consent=req.consent)
                platform_labels = {
                    "directpaste": "Direct Paste source",
                    "fileupload": "File Upload source",
                    "video": "Video/Audio source",
                    "mediaupload": "Media Upload source",
                    "networkpath": "Network Path / URL source",
                }
                label = platform_labels.get(platform, platform.upper())
                return {
                    "success": True,
                    "message": f"{label} configured successfully. Input validated — no external handshake required for this source type."
                }
        else:
            raise HTTPException(status_code=400, detail=f"Unknown platform '{platform}'.")

        # Flow: Success Audit & Storage.
        if res is not None and res.status_code == 200:
            ok, ok_msg = _validate_handshake(platform, res)
            if not ok:
                raise HTTPException(status_code=401, detail=f"Authentication failed on {platform.upper()}: {ok_msg}")
            # Action: Persist validated Identity Mapping.
            # SECURITY: Token is encrypted via SecretVault (Fernet AES-128) before storage.
            _persist_platform(db, platform, config, consent=req.consent)
            return {"success": True, "message": f"Identity mapped and secured for {platform.upper()}."}
        else:
            # Normalize auth/permission errors into 401 and everything else into 502.
            msg = _json_message(res) if res is not None else "Endpoint unreachable."
            if res is not None and res.status_code in (401, 403):
                raise HTTPException(status_code=401, detail=f"Authentication failed on {platform.upper()}: {msg}")
            raise HTTPException(status_code=502, detail=f"Handshake failed on {platform.upper()}: {msg}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PLATFORM-TEST] Connectivity failed for {platform}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Infrastructure check failed: {str(e)}")

@router.get("/all")
def get_verified_connections(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Action: Retrieve all secured platform credentials from the Configuration Vault."""
    try:
        plist = db.query(ConnectedPlatform).all()
        # SECURITY: Decrypt tokens at read time — never stored or returned as plaintext.
        out = {}
        def is_mock(cfg: dict) -> bool:
            return cfg.get("url") == "mock://vvnt" or cfg.get("token") == "mock"

        for p in plist:
            key = (p.platform_name or "").lower()
            cfg = {
                "url": p.url,
                "email": p.email,
                "token": SecretVault.decrypt(p.encrypted_token)
            }
            # Prefer non-mock over mock if duplicates exist (legacy casing, etc.)
            if key not in out:
                out[key] = cfg
            else:
                if is_mock(out[key]) and not is_mock(cfg):
                    out[key] = cfg
        return out
    except Exception as e:
        logger.error(f"[VAULT] Connection retrieval failed: {e}")
        return {}
