"""
================================================================================
GIT INTEGRATION SERVICE — PRD-to-Code Agent System
================================================================================
Handles:
- Repo clone/fetch via gitpython
- Branch creation, commit, push
- PR creation via platform REST APIs (GitHub/GitLab/Bitbucket)
- File hash snapshots for conflict detection
- Credential validation and 401 detection
"""

import os
import hashlib
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "./workspace")


class GitRepoService:
    """
    Manages Git repository operations for a single mission.
    Each mission has one repo connection.
    """

    def __init__(self, repo_url: str, platform: str, token: str,
                 mission_id: str, email: Optional[str] = None):
        self.repo_url = repo_url
        self.platform = platform.lower()  # github | gitlab | bitbucket
        self.token = token
        self.mission_id = mission_id
        self.email = email
        self.local_path: Optional[str] = None

    # ─── CLONE / FETCH ────────────────────────────────────────────────────

    def clone_or_fetch(self, branch: str = "main") -> str:
        """
        Clone the repo if not already cloned; otherwise fetch latest.
        Returns the local path to the cloned repository.
        """
        try:
            # pyrefly: ignore [missing-import]
            import git as gitpython
        except ImportError:
            raise RuntimeError("gitpython is not installed. Run: pip install gitpython")

        workspace = Path(WORKSPACE_DIR) / "git_repos" / str(self.mission_id)
        workspace.mkdir(parents=True, exist_ok=True)

        repo_dir = workspace / "repo"
        auth_url = self._build_auth_url()

        if repo_dir.exists() and (repo_dir / ".git").exists():
            # Fetch latest
            logger.info(f"[GIT] Fetching latest for mission {self.mission_id}")
            try:
                repo = gitpython.Repo(str(repo_dir))
                origin = repo.remotes.origin
                origin.set_url(auth_url)
                with repo.git.custom_environment(GIT_TERMINAL_PROMPT="0"):
                    origin.fetch()
                    # Ensure a clean slate before checkout to avoid "local changes would be overwritten"
                    repo.git.reset("--hard")
                    repo.git.clean("-fd")
                    repo.git.checkout(branch)
                    repo.git.pull("origin", branch)
                repo.config_writer().set_value("credential", "helper", "").release()
                self.local_path = str(repo_dir)
                return self.local_path
            except Exception as e:
                logger.warning(f"[GIT] Fetch failed, re-cloning: {e}")
                shutil.rmtree(repo_dir, ignore_errors=True)

        # Fresh clone
        logger.info(f"[GIT] Cloning {self.repo_url} (branch: {branch}) for mission {self.mission_id}")
        try:
            repo = gitpython.Repo.clone_from(
                auth_url,
                str(repo_dir),
                branch=branch,
                depth=1,  # Shallow clone for speed
                env={"GIT_TERMINAL_PROMPT": "0"},
                multi_options=["-c", "credential.helper="],
                allow_unsafe_options=True
            )
            repo.config_writer().set_value("credential", "helper", "").release()
            self.local_path = str(repo_dir)
            logger.info(f"[GIT] Clone complete: {self.local_path}")
            return self.local_path
        except Exception as e:
            error_msg = str(e)
            if "401" in error_msg or "403" in error_msg or "Authentication" in error_msg:
                raise PermissionError(
                    f"Git authentication failed for {self.repo_url}. "
                    f"Check your PAT and ensure it has repo read access."
                )
            raise RuntimeError(f"Git clone failed: {e}")

    def _build_auth_url(self) -> str:
        """Build authenticated URL by injecting token into the clone URL."""
        url = self.repo_url.rstrip("/")
        if url.endswith(".git"):
            base = url
        else:
            base = url + ".git"

        if self.platform == "github":
            # https://x-access-token:TOKEN@github.com/owner/repo.git
            return base.replace("https://", f"https://x-access-token:{self.token}@")
        elif self.platform == "gitlab":
            return base.replace("https://", f"https://oauth2:{self.token}@")
        elif self.platform == "bitbucket":
            user = self.email or "x-token-auth"
            return base.replace("https://", f"https://{user}:{self.token}@")
        else:
            return base.replace("https://", f"https://x-access-token:{self.token}@")

    # ─── FILE HASH SNAPSHOT ───────────────────────────────────────────────

    def get_file_hash(self, file_path: str, branch: str = "main") -> Optional[str]:
        """
        Get SHA-256 hash of a specific file in the repo.
        Used at plan-generation time to capture the conflict-detection baseline.
        """
        if not self.local_path:
            raise RuntimeError("Repo not cloned. Call clone_or_fetch() first.")

        full_path = Path(self.local_path) / file_path
        if not full_path.exists():
            return None

        sha = hashlib.sha256()
        with open(full_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
        return sha.hexdigest()

    def get_file_hashes(self, file_paths: List[str]) -> Dict[str, Optional[str]]:
        """Batch hash snapshot for multiple files."""
        return {fp: self.get_file_hash(fp) for fp in file_paths}

    # ─── BRANCH OPERATIONS ────────────────────────────────────────────────

    def create_branch(self, branch_name: str, base_branch: str = "main") -> str:
        """Create a new branch from base_branch and check it out. If it exists, sync it."""
        try:
            import git as gitpython
        except ImportError:
            raise RuntimeError("gitpython is not installed")

        if not self.local_path:
            raise RuntimeError("Repo not cloned")

        repo = gitpython.Repo(self.local_path)
        
        # Clean up any leftover files from previous failed modules
        # This prevents checkout errors like "Your local changes would be overwritten"
        repo.git.reset("--hard")
        repo.git.clean("-fd")
        
        # Check using ls-remote if the branch exists on origin
        ls_remote_output = repo.git.ls_remote("--heads", "origin", branch_name)
        branch_exists_remote = bool(ls_remote_output.strip())
        
        if branch_exists_remote:
            # Branch exists on remote! We are accumulating fixes.
            # Explicitly fetch the branch since the initial clone might be depth=1 on main
            repo.git.fetch("origin", f"+refs/heads/{branch_name}:refs/remotes/origin/{branch_name}")
            try:
                repo.git.checkout(branch_name)
            except gitpython.exc.GitCommandError:
                repo.git.checkout("-b", branch_name, f"origin/{branch_name}")
                
            repo.git.reset("--hard", f"origin/{branch_name}")
            logger.info(f"[GIT] Branch exists remotely — synced to origin/{branch_name}: {branch_name}")
        else:
            # Branch does NOT exist remotely. Create it from base_branch.
            # Ensure base_branch is fetched properly
            repo.git.fetch("origin", f"+refs/heads/{base_branch}:refs/remotes/origin/{base_branch}")
            repo.git.checkout(base_branch)
            repo.git.reset("--hard", f"origin/{base_branch}")
            
            try:
                repo.git.checkout("-b", branch_name)
                logger.info(f"[GIT] Created new branch from {base_branch}: {branch_name}")
            except gitpython.exc.GitCommandError:
                # Exists locally only. Probably a failed previous run that never pushed.
                repo.git.checkout(branch_name)
                repo.git.reset("--hard", f"origin/{base_branch}")
                logger.info(f"[GIT] Branch existed only locally — hard reset to origin/{base_branch}: {branch_name}")

        return branch_name

    def commit_and_push(self, files: List[str], message: str, branch: str) -> str:
        """Stage files, commit, and push to remote."""
        try:
            # pyrefly: ignore [missing-import]
            import git as gitpython
        except ImportError:
            raise RuntimeError("gitpython is not installed")

        if not self.local_path:
            raise RuntimeError("Repo not cloned")

        repo = gitpython.Repo(self.local_path)
        repo.git.checkout(branch)

        for f in files:
            repo.index.add([f])

        commit = repo.index.commit(message)
        origin = repo.remotes.origin
        origin.push(branch)

        logger.info(f"[GIT] Pushed {len(files)} files to {branch}: {commit.hexsha[:8]}")
        return commit.hexsha

    # ─── PR CREATION (REST API) ───────────────────────────────────────────

    async def create_pull_request(
        self,
        title: str,
        body: str,
        source_branch: str,
        target_branch: str = "main"
    ) -> Dict[str, Any]:
        """Create a PR via the platform's REST API."""
        import httpx

        if self.platform == "github":
            return await self._create_github_pr(title, body, source_branch, target_branch)
        elif self.platform == "gitlab":
            return await self._create_gitlab_mr(title, body, source_branch, target_branch)
        elif self.platform == "bitbucket":
            return await self._create_bitbucket_pr(title, body, source_branch, target_branch)
        else:
            raise ValueError(f"Unsupported platform: {self.platform}")

    async def _create_github_pr(self, title, body, source, target) -> Dict:
        import httpx
        owner, repo = self._parse_owner_repo()

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Accept": "application/vnd.github.v3+json"
                },
                json={
                    "title": title,
                    "body": body,
                    "head": source,
                    "base": target
                }
            )
            if resp.status_code == 401:
                raise PermissionError("GitHub token expired or revoked")
            resp.raise_for_status()
            data = resp.json()
            return {"pr_url": data["html_url"], "pr_number": data["number"], "platform": "github"}

    async def _create_gitlab_mr(self, title, body, source, target) -> Dict:
        import httpx
        owner, repo = self._parse_owner_repo()
        project_path = f"{owner}%2F{repo}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://gitlab.com/api/v4/projects/{project_path}/merge_requests",
                headers={"PRIVATE-TOKEN": self.token},
                json={
                    "title": title,
                    "description": body,
                    "source_branch": source,
                    "target_branch": target
                }
            )
            if resp.status_code == 401:
                raise PermissionError("GitLab token expired or revoked")
            resp.raise_for_status()
            data = resp.json()
            return {"pr_url": data["web_url"], "pr_number": data["iid"], "platform": "gitlab"}

    async def _create_bitbucket_pr(self, title, body, source, target) -> Dict:
        import httpx
        import base64
        owner, repo = self._parse_owner_repo()
        creds = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/pullrequests",
                headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
                json={
                    "title": title,
                    "description": body,
                    "source": {"branch": {"name": source}},
                    "destination": {"branch": {"name": target}}
                }
            )
            if resp.status_code == 401:
                raise PermissionError("Bitbucket token expired or revoked")
            resp.raise_for_status()
            data = resp.json()
            return {"pr_url": data["links"]["html"]["href"], "pr_number": data["id"], "platform": "bitbucket"}

    async def update_pull_request_body(self, pr_number: int, body: str) -> bool:
        """Update the PR body for the given PR number."""
        import httpx

        if self.platform == "github":
            return await self._update_github_pr_body(pr_number, body)
        elif self.platform == "gitlab":
            return await self._update_gitlab_mr_body(pr_number, body)
        elif self.platform == "bitbucket":
            return await self._update_bitbucket_pr_body(pr_number, body)
        else:
            raise ValueError(f"Unsupported platform: {self.platform}")

    async def _update_github_pr_body(self, pr_number: int, body: str) -> bool:
        import httpx
        owner, repo = self._parse_owner_repo()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.patch(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Accept": "application/vnd.github.v3+json"
                },
                json={"body": body}
            )
            resp.raise_for_status()
            return True

    async def _update_gitlab_mr_body(self, mr_iid: int, body: str) -> bool:
        import httpx
        owner, repo = self._parse_owner_repo()
        project_path = f"{owner}%2F{repo}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"https://gitlab.com/api/v4/projects/{project_path}/merge_requests/{mr_iid}",
                headers={"PRIVATE-TOKEN": self.token},
                json={"description": body}
            )
            resp.raise_for_status()
            return True

    async def _update_bitbucket_pr_body(self, pr_id: int, body: str) -> bool:
        import httpx
        import base64
        owner, repo = self._parse_owner_repo()
        creds = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/pullrequests/{pr_id}",
                headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
                json={"description": body}
            )
            resp.raise_for_status()
            return True

    # ─── MERGE (with audit gate enforcement) ─────────────────────────────

    async def merge_pull_request(self, module_id: str, pr_number: int,
                                  nfr_results: Dict, audit_overrides: List[Dict]) -> Dict:
        """
        Merge a PR. Enforces hard-block: if any audit category has FAIL status,
        merge is rejected unless a valid AuditOverride exists for that (module_id, audit_type).
        """
        # Check audit gate
        failing_types = []
        for audit_type, result in nfr_results.items():
            if isinstance(result, dict) and result.get("status") == "FAIL":
                # Check if an override exists
                has_override = any(
                    o.get("module_id") == module_id and o.get("audit_type") == audit_type
                    for o in audit_overrides
                )
                if not has_override:
                    failing_types.append(audit_type)

        if failing_types:
            raise PermissionError(
                f"Merge blocked: failing audits without override: {failing_types}. "
                f"Create an AuditOverride with a documented reason before merging."
            )

        # Proceed with merge
        if self.platform == "github":
            return await self._merge_github_pr(pr_number)
        elif self.platform == "gitlab":
            return await self._merge_gitlab_mr(pr_number)
        else:
            return {"merged": True, "message": "Merge simulated (platform not fully supported)"}

    async def _merge_github_pr(self, pr_number: int) -> Dict:
        import httpx
        owner, repo = self._parse_owner_repo()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/merge",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Accept": "application/vnd.github.v3+json"
                },
                json={"merge_method": "squash"}
            )
            resp.raise_for_status()
            return {"merged": True, "sha": resp.json().get("sha")}

    async def _merge_gitlab_mr(self, mr_iid: int) -> Dict:
        import httpx
        owner, repo = self._parse_owner_repo()
        project_path = f"{owner}%2F{repo}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"https://gitlab.com/api/v4/projects/{project_path}/merge_requests/{mr_iid}/merge",
                headers={"PRIVATE-TOKEN": self.token}
            )
            resp.raise_for_status()
            return {"merged": True, "sha": resp.json().get("merge_commit_sha")}

    # ─── VALIDATION ───────────────────────────────────────────────────────

    async def validate_access(self) -> Dict[str, Any]:
        """Validate that the token has read access to the repo."""
        import httpx

        owner, repo = self._parse_owner_repo()

        try:
            if self.platform == "github":
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}",
                        headers={
                            "Authorization": f"Bearer {self.token}",
                            "Accept": "application/vnd.github.v3+json"
                        }
                    )
                    if resp.status_code == 401:
                        return {"valid": False, "error": "Authentication failed — check your PAT"}
                    if resp.status_code == 404:
                        return {"valid": False, "error": f"Repository {owner}/{repo} not found or not accessible"}
                    resp.raise_for_status()
                    data = resp.json()
                    return {
                        "valid": True,
                        "repo_name": data.get("full_name"),
                        "default_branch": data.get("default_branch", "main"),
                        "private": data.get("private", False),
                        "permissions": data.get("permissions", {}),
                        "language": data.get("language"),
                    }

            elif self.platform == "gitlab":
                async with httpx.AsyncClient(timeout=15.0) as client:
                    project_path = f"{owner}%2F{repo}"
                    resp = await client.get(
                        f"https://gitlab.com/api/v4/projects/{project_path}",
                        headers={"PRIVATE-TOKEN": self.token}
                    )
                    if resp.status_code == 401:
                        return {"valid": False, "error": "Authentication failed"}
                    resp.raise_for_status()
                    data = resp.json()
                    return {
                        "valid": True,
                        "repo_name": data.get("path_with_namespace"),
                        "default_branch": data.get("default_branch", "main"),
                        "private": data.get("visibility") == "private",
                    }

            elif self.platform == "bitbucket":
                import base64
                creds = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(
                        f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}",
                        headers={"Authorization": f"Basic {creds}"}
                    )
                    if resp.status_code == 401:
                        return {"valid": False, "error": "Authentication failed"}
                    resp.raise_for_status()
                    data = resp.json()
                    return {
                        "valid": True,
                        "repo_name": data.get("full_name"),
                        "default_branch": data.get("mainbranch", {}).get("name", "main"),
                        "private": data.get("is_private", False),
                    }

        except Exception as e:
            return {"valid": False, "error": str(e)}

        return {"valid": False, "error": "Unknown platform"}

    # ─── HELPERS ──────────────────────────────────────────────────────────

    def _parse_owner_repo(self) -> tuple:
        """Extract owner/repo from URL like https://github.com/owner/repo"""
        url = self.repo_url.rstrip("/")
        if url.endswith(".git"):
            url = url[:-4]
        parts = url.split("/")
        if len(parts) < 2:
            raise ValueError(f"Cannot parse owner/repo from URL: {self.repo_url}")
        return parts[-2], parts[-1]

    def get_local_path(self) -> Optional[str]:
        return self.local_path
