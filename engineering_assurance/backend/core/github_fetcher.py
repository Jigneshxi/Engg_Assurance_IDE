"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - GITHUB / GITLAB / BITBUCKET FETCHER
================================================================================
This module handles communication with GitHub, GitLab, and Bitbucket APIs.
Requirements are fetched from Issues or Markdown files in repositories.
"""

import os
import re
import logging
import requests
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


class GitHubFetcher(BaseFetcher):
    """
    GIT PLATFORM ADAPTER (GitHub / GitLab / Bitbucket)
    Logic: Fetches Issues or Markdown files from SCM platforms and maps them
    to the universal STLC requirement schema.

    Resource ID format:
      GitHub/GitLab:  owner/repo/issues/123   or   owner/repo/contents/path/to/file.md
      Bitbucket:      workspace/repo/issues/123
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        url:   Optional base URL override for GitHub Enterprise / GitLab self-hosted.
        email: GitHub username (used for Bitbucket Basic Auth).
        token: Personal Access Token / App Token.
        """
        self.token = token or os.getenv("GITHUB_TOKEN") or os.getenv("GITLAB_TOKEN") or os.getenv("BITBUCKET_TOKEN")
        self.email = email  # used as username for Bitbucket Basic Auth
        # Detect platform from base URL; default to GitHub
        raw_url = (url or "").lower()
        if "gitlab" in raw_url:
            self.platform = "gitlab"
            try:
                import urllib.parse
                parsed = urllib.parse.urlparse(url)
                self.base_url = f"{parsed.scheme}://{parsed.netloc}" if url else "https://gitlab.com"
            except Exception:
                self.base_url = "https://gitlab.com"
        elif "bitbucket" in raw_url:
            self.platform = "bitbucket"
            self.base_url = url.rstrip("/") if url else "https://api.bitbucket.org/2.0"
        else:
            self.platform = "github"
            clean_url = url.rstrip("/") if url else "https://api.github.com"
            # If user configured github.com (or their profile), use api.github.com
            if "github.com" in clean_url and "api.github.com" not in clean_url:
                clean_url = "https://api.github.com"
            self.base_url = clean_url
        self.mock_path = mock_path

    def _headers(self) -> dict:
        """Build auth headers appropriate for the detected platform."""
        if self.platform == "bitbucket":
            # Bitbucket uses Basic Auth (username:app_password)
            import base64
            creds = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
            return {"Authorization": f"Basic {creds}", "Accept": "application/json"}
        # GitHub and GitLab both use Bearer token
        headers = {
            "Accept": "application/vnd.github.v3+json" if self.platform == "github" else "application/json",
            "User-Agent": "VVnT-Agentic-Mesh/1.0"
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def fetch(self, resource_id: str) -> dict:
        """
        CORE FETCH
        Parses resource_id to determine whether to fetch an Issue or a file,
        then dispatches to the appropriate platform API.

        Supported formats:
          owner/repo/issues/123          → fetch GitHub/GitLab issue
          owner/repo/contents/path.md    → fetch file content
          workspace/repo/issues/123      → fetch Bitbucket issue
        """
        import json as _json

        # Mock path support
        if self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[{self.platform.upper()}] Using mock data source: {self.mock_path}")
            with open(self.mock_path, "r", encoding="utf-8") as f:
                return self.normalize(_json.load(f))

        # We will attempt without a token if missing (useful for public repos)
        if not self.token:
            logger.warning(f"[{self.platform.upper()}] No token provided. Will attempt anonymous access (only works for public repos).")

        # Strip whitespace and trailing slashes
        resource_id = resource_id.strip().strip("/")
        
        # If it's a full URL (e.g. https://github.com/owner/repo/issues/123), extract the path
        if "://" in resource_id:
            import urllib.parse
            parsed = urllib.parse.urlparse(resource_id)
            resource_id = parsed.path.strip("/")
        
        parts = resource_id.split("/")
        if len(parts) < 4:
            raise ValueError(
                f"Invalid resource_id format '{resource_id}'. "
                "Expected: owner/repo/issues/123 or owner/repo/contents/path.md"
            )

        # GitLab URLs often use /-/ as a separator (e.g. owner/repo/-/issues/1)
        if len(parts) > 3 and parts[2] == "-":
            owner, repo, resource_type = parts[0], parts[1], parts[3]
            resource_ref = "/".join(parts[4:])
        else:
            owner, repo, resource_type = parts[0], parts[1], parts[2]
            resource_ref = "/".join(parts[3:])

        if resource_type == "issues":
            return self._fetch_issue(owner, repo, resource_ref)
        elif resource_type == "contents":
            return self._fetch_file(owner, repo, resource_ref)
        elif resource_type == "labels":
            return self._fetch_issues_by_label(owner, repo, resource_ref)
        else:
            raise ValueError(
                f"Unsupported resource type '{resource_type}'. Use 'issues', 'contents', or 'labels'."
            )

    def _fetch_issues_by_label(self, owner: str, repo: str, label: str) -> dict:
        """Fetch multiple issues matching a label and concatenate them."""
        import urllib.parse
        encoded_label = urllib.parse.quote(label)

        if self.platform == "github":
            url = f"{self.base_url}/repos/{owner}/{repo}/issues?state=open&per_page=100"
            if label.lower() != "all":
                url += f"&labels={encoded_label}"
        elif self.platform == "gitlab":
            project_path = f"{owner}%2F{repo}"
            url = f"{self.base_url}/api/v4/projects/{project_path}/issues?state=opened&per_page=100"
            if label.lower() != "all":
                url += f"&labels={encoded_label}"
        else:
            raise NotImplementedError("Bitbucket label fetch not yet implemented.")

        logger.info(f"[{self.platform.upper()}] Fetching issues labeled '{label}' from {owner}/{repo}...")
        response = requests.get(url, headers=self._headers(), timeout=45)

        if response.status_code == 200:
            issues = response.json()
            if not issues:
                lbl_msg = f" with label '{label}'" if label.lower() != "all" else ""
                raise ValueError(f"No open issues found{lbl_msg} in {owner}/{repo}.")

            aggregated_desc = []
            aggregated_ac = []

            for data in issues:
                # Use existing mapper to get title, desc, and AC for each issue
                issue_number = str(data.get("number") or data.get("iid") or data.get("id"))
                mapped = self._map_issue(data, owner, repo, issue_number)
                
                aggregated_desc.append(f"### {mapped['summary']} ({mapped['id']})\n{mapped['description']}\n")
                if mapped.get("acceptance_criteria"):
                    aggregated_ac.extend(mapped["acceptance_criteria"])

            raw_payload = {
                "id": f"label:{label}",
                "summary": f"Aggregated Issues for label: {label}",
                "description": "\n---\n".join(aggregated_desc),
                "acceptance_criteria": list(set(aggregated_ac)), # Deduplicate
                "platform": self.platform,
            }
            return self.normalize(raw_payload)
        else:
            raise Exception(
                f"{self.platform.capitalize()} API error (Status {response.status_code}): {response.text[:200]}"
            )

    def _fetch_issue(self, owner: str, repo: str, issue_number: str) -> dict:
        """Fetch a single issue from GitHub, GitLab, or Bitbucket."""
        if self.platform == "github":
            url = f"{self.base_url}/repos/{owner}/{repo}/issues/{issue_number}"
        elif self.platform == "gitlab":
            # GitLab uses project path encoded as URL-safe string
            project_path = f"{owner}%2F{repo}"
            url = f"{self.base_url}/api/v4/projects/{project_path}/issues/{issue_number}"
        else:  # bitbucket
            url = f"{self.base_url}/repositories/{owner}/{repo}/issues/{issue_number}"

        logger.info(f"[{self.platform.upper()}] Fetching issue {issue_number} from {owner}/{repo}... EXACT URL: {url}")
        
        headers = self._headers()
        logger.info(f"[{self.platform.upper()}] Headers being sent (keys): {list(headers.keys())}")
        if self.token:
            logger.info(f"[{self.platform.upper()}] Token prefix: {self.token[:5]}...")
            
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            data = response.json()
            return self._map_issue(data, owner, repo, issue_number)
        else:
            raise Exception(
                f"{self.platform.capitalize()} API error (Status {response.status_code}): {response.text[:200]}"
            )

    def _map_issue(self, data: dict, owner: str, repo: str, issue_number: str) -> dict:
        """Map platform-specific issue JSON to the universal VVNT schema."""
        if self.platform == "github":
            body = data.get("body") or ""
            title = data.get("title", "Untitled GitHub Issue")
            issue_id = f"GH-{data.get('number', issue_number)}"
            # Extract checklist items as acceptance criteria
            ac = re.findall(r"[-*]\s+\[[ x]\]\s+(.+)", body)
        elif self.platform == "gitlab":
            body = data.get("description") or ""
            title = data.get("title", "Untitled GitLab Issue")
            issue_id = f"GL-{data.get('iid', issue_number)}"
            ac = re.findall(r"[-*]\s+\[[ x]\]\s+(.+)", body)
        else:  # bitbucket
            body = data.get("content", {}).get("raw", "") or ""
            title = data.get("title", "Untitled Bitbucket Issue")
            issue_id = f"BB-{data.get('id', issue_number)}"
            ac = re.findall(r"[-*]\s+\[[ x]\]\s+(.+)", body)

        raw_payload = {
            "id": issue_id,
            "summary": title,
            "description": body,
            "acceptance_criteria": ac if ac else [],
            "platform": self.platform,
        }
        return self.normalize(raw_payload)

    def _fetch_file(self, owner: str, repo: str, file_path: str) -> dict:
        """Fetch a Markdown/text file from the repository and treat it as a requirement."""
        import base64

        if self.platform == "github":
            url = f"{self.base_url}/repos/{owner}/{repo}/contents/{file_path}"
        elif self.platform == "gitlab":
            project_path = f"{owner}%2F{repo}"
            encoded_path = file_path.replace("/", "%2F")
            url = f"{self.base_url}/api/v4/projects/{project_path}/repository/files/{encoded_path}/raw"
        else:
            raise NotImplementedError("Bitbucket file content fetch not yet implemented.")

        logger.info(f"[{self.platform.upper()}] Fetching file {file_path} from {owner}/{repo}...")
        response = requests.get(url, headers=self._headers(), timeout=15)

        if response.status_code != 200:
            raise Exception(
                f"{self.platform.capitalize()} file fetch error (Status {response.status_code}): {response.text[:200]}"
            )

        if self.platform == "github":
            file_data = response.json()
            content = base64.b64decode(file_data.get("content", "")).decode("utf-8", errors="replace")
        else:
            content = response.text

        raw_payload = {
            "id": f"{owner}/{repo}/{file_path}",
            "summary": file_path.split("/")[-1].replace(".md", "").replace("-", " ").replace("_", " ").title(),
            "description": content,
            "acceptance_criteria": [],
            "platform": self.platform,
        }
        return self.normalize(raw_payload)

    def fetch_churn_stats(self, repo_owner_repo: str, days: int = 30) -> dict:
        """
        EMPIRICAL SIGNAL: CODE CHURN
        Calculates commit activity in the last N days for risk scoring.
        """
        if not self.token:
            return {"error": f"{self.platform.capitalize()} token missing for churn mining"}

        from datetime import datetime, timedelta
        since = (datetime.now() - timedelta(days=days)).isoformat()

        if self.platform == "github":
            url = f"{self.base_url}/repos/{repo_owner_repo}/commits?since={since}"
        elif self.platform == "gitlab":
            owner, repo = repo_owner_repo.split("/", 1)
            project_path = f"{owner}%2F{repo}"
            url = f"{self.base_url}/api/v4/projects/{project_path}/repository/commits?since={since}"
        else:
            return {"error": "Bitbucket churn stats not yet implemented"}

        try:
            logger.info(f"[{self.platform.upper()}] Mining code churn for {repo_owner_repo} (last {days} days)...")
            response = requests.get(url, headers=self._headers(), timeout=15)
            if response.status_code == 200:
                commits = response.json()
                return {"commit_count": len(commits), "window_days": days, "repo": repo_owner_repo}
        except Exception as e:
            logger.error(f"[{self.platform.upper()}] Churn fetch failed: {e}")

        return {"commit_count": 0, "error": "Fetch failed"}
