"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - NETWORK PATH FETCHER (ISS-011 Fix)
================================================================================
Crawls a URL or network path and extracts structured requirement content.

Supported resource_id formats:
  - HTTP/HTTPS URL:       https://confluence.company.com/pages/12345
  - Swagger/OpenAPI URL:  https://api.company.com/swagger.json
  - Local network path:   \\\\server\\share\\requirements.txt
  - Local file path:      C:\\docs\\requirements.md
"""

import os
import re
import logging
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)

# Max content size to prevent memory issues with large pages
MAX_CONTENT_CHARS = 15000


def _check_dependencies() -> dict:
    """
    Check whether NetworkPathFetcher's required packages are available.

    Returns:
        {
            "available": bool,
            "missing": [...],
            "install_cmd": "pip install ...",
        }
    """
    missing = []

    try:
        import requests  # noqa: F401
    except ImportError:
        missing.append("requests")

    try:
        import bs4  # noqa: F401
    except ImportError:
        missing.append("beautifulsoup4")

    try:
        import yaml  # noqa: F401
    except ImportError:
        missing.append("pyyaml")

    return {
        "available": len(missing) == 0,
        "missing": missing,
        "install_cmd": ("pip install " + " ".join(missing)) if missing else "",
    }


class NetworkPathFetcher(BaseFetcher):
    """
    NETWORK PATH / URL ADAPTER
    Fetches and extracts requirement content from web URLs, Swagger specs,
    and local/network file paths.

    Strategy:
    1. Swagger/OpenAPI JSON — parse endpoints and schemas as requirements
    2. HTTP/HTTPS URL — fetch HTML, extract meaningful text via BeautifulSoup
    3. Local/UNC file path — read file content directly
    4. Graceful degradation — return structured error payload on failure
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        self.base_url = url
        self.token = token  # Optional: Bearer token for authenticated endpoints
        self.mock_path = mock_path

    def fetch(self, resource_id: str) -> dict:
        """
        Fetch and extract requirement content from a URL or file path.

        Args:
            resource_id: URL, Swagger endpoint, or file path.

        Returns:
            Normalized requirement dict with extracted content as description.
        """
        logger.info(f"[NETWORK-FETCHER] Processing network source: {resource_id[:80]}...")

        # Dependency gate — fail fast with a clear message if critical deps are missing
        dep_check = _check_dependencies()
        if not dep_check["available"]:
            msg = (
                f"Network path fetcher dependencies not installed. "
                f"Missing: {', '.join(dep_check['missing'])}. "
                f"Run: {dep_check['install_cmd']}"
            )
            logger.error(f"[NETWORK-FETCHER] {msg}")
            return self.normalize({
                "id": "NETWORK-DEPS-MISSING",
                "summary": "Network fetcher dependencies not installed",
                "description": msg,
                "acceptance_criteria": [f"Run: {dep_check['install_cmd']}"],
                "platform": "networkpath",
                "dep_check": dep_check,
            })

        # Route based on resource type
        if resource_id.lower().endswith((".json", ".yaml", ".yml")) or "swagger" in resource_id.lower() or "openapi" in resource_id.lower():
            return self._fetch_swagger(resource_id)

        if resource_id.startswith(("http://", "https://")):
            return self._fetch_url(resource_id)

        # Local or UNC path
        return self._fetch_local_path(resource_id)

    def _fetch_swagger(self, resource_id: str) -> dict:
        """Parse a Swagger/OpenAPI spec and extract endpoints as requirements."""
        try:
            import json as _json
            import requests
            import yaml

            if resource_id.startswith(("http://", "https://")):
                headers = {}
                if self.token:
                    headers["Authorization"] = f"Bearer {self.token}"
                resp = requests.get(resource_id, headers=headers, timeout=30)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                if "yaml" in content_type or resource_id.endswith((".yaml", ".yml")):
                    spec = yaml.safe_load(resp.text)
                else:
                    spec = resp.json()
            else:
                with open(resource_id, "r", encoding="utf-8") as f:
                    content = f.read()
                spec = yaml.safe_load(content) if resource_id.endswith((".yaml", ".yml")) else _json.loads(content)

            return self._parse_swagger_spec(spec, resource_id)

        except ImportError as e:
            missing = "pyyaml" if "yaml" in str(e) else "requests"
            logger.warning(f"[NETWORK-FETCHER] Missing dependency for Swagger parsing: {missing}")
            return self._error_payload(resource_id, f"Missing dependency: {missing}. Run: pip install {missing}")
        except Exception as e:
            logger.warning(f"[NETWORK-FETCHER] Swagger fetch failed: {e}")
            return self._fetch_url(resource_id) if resource_id.startswith("http") else self._error_payload(resource_id, str(e))

    def _parse_swagger_spec(self, spec: dict, source: str) -> dict:
        """Convert OpenAPI/Swagger spec into structured requirements."""
        title = spec.get("info", {}).get("title", "API Specification")
        version = spec.get("info", {}).get("version", "")
        api_desc = spec.get("info", {}).get("description", "")

        paths = spec.get("paths", {})
        endpoints = []
        acceptance_criteria = []

        for path, methods in paths.items():
            for method, details in methods.items():
                if method.lower() in ("get", "post", "put", "patch", "delete", "options"):
                    summary = details.get("summary", "") or details.get("description", "")
                    op_id = details.get("operationId", "")
                    tags = ", ".join(details.get("tags", []))
                    endpoint_desc = f"{method.upper()} {path}"
                    if summary:
                        endpoint_desc += f" — {summary}"
                    endpoints.append(endpoint_desc)

                    # Build acceptance criteria from response codes
                    responses = details.get("responses", {})
                    for code, resp_detail in responses.items():
                        resp_desc = resp_detail.get("description", "")
                        if resp_desc:
                            acceptance_criteria.append(
                                f"Given {method.upper()} {path} is called, "
                                f"When response code is {code}, "
                                f"Then: {resp_desc}"
                            )

        description = f"API: {title} {version}\n{api_desc}\n\nEndpoints:\n" + "\n".join(endpoints[:50])
        if not acceptance_criteria:
            acceptance_criteria = [f"Verify all {len(endpoints)} API endpoints respond correctly"]

        logger.info(f"[NETWORK-FETCHER] Parsed Swagger spec: {len(endpoints)} endpoints, {len(acceptance_criteria)} ACs")

        return self.normalize({
            "id": f"SWAGGER-{title[:30]}",
            "summary": f"API Spec: {title} ({len(endpoints)} endpoints)",
            "description": description[:MAX_CONTENT_CHARS],
            "acceptance_criteria": acceptance_criteria[:20],
            "platform": "swagger",
        })

    def _fetch_url(self, url: str) -> dict:
        """Fetch an HTTP/HTTPS URL and extract meaningful text content."""
        try:
            import requests
            from bs4 import BeautifulSoup

            headers = {"User-Agent": "VVNT-RequirementsFetcher/1.0"}
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"

            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")

            # JSON response — treat as structured data
            if "application/json" in content_type:
                try:
                    data = resp.json()
                    text = self._flatten_json(data)
                except Exception:
                    text = resp.text[:MAX_CONTENT_CHARS]
            else:
                # HTML — extract meaningful text
                soup = BeautifulSoup(resp.text, "html.parser")

                # Remove navigation, scripts, styles
                for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    tag.decompose()

                # Prefer main content areas
                main = soup.find("main") or soup.find("article") or soup.find("div", {"id": re.compile(r"content|main|body", re.I)})
                target = main if main else soup

                text = target.get_text(separator="\n", strip=True)
                # Collapse excessive whitespace
                text = re.sub(r"\n{3,}", "\n\n", text).strip()

            text = text[:MAX_CONTENT_CHARS]
            summary, description, acceptance_criteria = self._parse_requirement_text(text, url)

            logger.info(f"[NETWORK-FETCHER] URL fetched: {len(text)} chars from {url[:60]}")

            return self.normalize({
                "id": f"URL-{re.sub(r'[^a-zA-Z0-9]', '-', url[8:40])}",
                "summary": summary,
                "description": description,
                "acceptance_criteria": acceptance_criteria,
                "platform": "networkpath",
            })

        except ImportError as e:
            missing = "beautifulsoup4" if "bs4" in str(e) else "requests"
            return self._error_payload(url, f"Missing dependency: {missing}. Run: pip install {missing}")
        except Exception as e:
            logger.error(f"[NETWORK-FETCHER] URL fetch failed for {url}: {e}")
            return self._error_payload(url, str(e))

    def _fetch_local_path(self, path: str) -> dict:
        """Read a local or UNC network file path."""
        try:
            if not os.path.exists(path):
                return self._error_payload(path, f"Path not found: '{path}'")

            ext = os.path.splitext(path)[1].lower()
            text = ""

            if ext in (".txt", ".md", ".rst", ".csv"):
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    text = f.read()

            elif ext == ".pdf":
                try:
                    import PyPDF2
                    with open(path, "rb") as f:
                        reader = PyPDF2.PdfReader(f)
                        text = "\n".join(page.extract_text() or "" for page in reader.pages)
                except ImportError:
                    return self._error_payload(path, "PyPDF2 not installed. Run: pip install PyPDF2")

            elif ext == ".docx":
                try:
                    import docx
                    doc = docx.Document(path)
                    text = "\n".join(p.text for p in doc.paragraphs)
                except ImportError:
                    return self._error_payload(path, "python-docx not installed. Run: pip install python-docx")

            else:
                # Try reading as plain text
                try:
                    with open(path, "r", encoding="utf-8", errors="replace") as f:
                        text = f.read()
                except Exception:
                    return self._error_payload(path, f"Unsupported file format: {ext}")

            text = text[:MAX_CONTENT_CHARS]
            source_label = os.path.basename(path)
            summary, description, acceptance_criteria = self._parse_requirement_text(text, source_label)

            logger.info(f"[NETWORK-FETCHER] Local file read: {len(text)} chars from '{source_label}'")

            return self.normalize({
                "id": f"FILE-{source_label[:30]}",
                "summary": summary,
                "description": description,
                "acceptance_criteria": acceptance_criteria,
                "platform": "networkpath",
            })

        except Exception as e:
            logger.error(f"[NETWORK-FETCHER] Local path fetch failed: {e}")
            return self._error_payload(path, str(e))

    def _flatten_json(self, data, prefix="", depth=0) -> str:
        """Recursively flatten a JSON object into readable text."""
        if depth > 4:
            return str(data)[:200]
        lines = []
        if isinstance(data, dict):
            for k, v in data.items():
                lines.append(self._flatten_json(v, f"{prefix}{k}: ", depth + 1))
        elif isinstance(data, list):
            for i, item in enumerate(data[:20]):
                lines.append(self._flatten_json(item, f"{prefix}[{i}] ", depth + 1))
        else:
            lines.append(f"{prefix}{str(data)[:200]}")
        return "\n".join(lines)

    def _parse_requirement_text(self, text: str, source: str) -> tuple:
        """Parse raw text into (summary, description, acceptance_criteria)."""
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        summary = lines[0][:120] if lines else f"Requirements from: {source}"

        req_patterns = re.compile(
            r"\b(should|must|shall|need to|has to|required|will|given|when|then|"
            r"accept|verify|validate|ensure|confirm|the system|user can|user must)\b",
            re.IGNORECASE
        )
        acceptance_criteria = [s.strip() for s in lines if req_patterns.search(s) and len(s) > 20][:15]
        if not acceptance_criteria:
            acceptance_criteria = [f"Verify requirements as described in: {source[:60]}"]

        return summary, text, acceptance_criteria

    def _error_payload(self, resource_id: str, error_msg: str) -> dict:
        """Return a structured error payload so the mesh can continue."""
        return self.normalize({
            "id": f"NETWORK-ERROR-{resource_id[:20]}",
            "summary": f"Network fetch failed: {resource_id[:60]}",
            "description": (
                f"[NETWORK-FETCHER] Failed to fetch content from '{resource_id}'. "
                f"Error: {error_msg}"
            ),
            "acceptance_criteria": ["Manual review required — automated fetch failed"],
            "platform": "networkpath",
        })
