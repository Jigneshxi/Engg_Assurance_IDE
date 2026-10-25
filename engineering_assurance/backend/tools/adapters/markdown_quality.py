import time
import re
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any, List

try:
    import markdown
    from bs4 import BeautifulSoup
except ImportError:
    markdown = None
    BeautifulSoup = None


@ToolRegistry.register
class MarkdownQualityAdapter(BaseToolAdapter):
    name = "markdown_quality"
    category = "general"

    @classmethod
    def get_version(cls) -> str:
        try:
            import markdown as md
            return md.__version__
        except Exception:
            return "unknown"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return markdown is not None and BeautifulSoup is not None

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload

        md_content = payload.get("content", "")
        if not md_content:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error="Payload must contain 'content' (a markdown string).",
            )

        issues: List[str] = []
        warnings: List[str] = []

        # Parse to HTML then inspect structure
        html = markdown.markdown(md_content, extensions=["tables"])
        soup = BeautifulSoup(html, "html.parser")

        # Check headings
        headings = soup.find_all(re.compile(r"^h[1-6]$"))
        h1s = [h for h in headings if h.name == "h1"]
        if len(h1s) == 0:
            issues.append("Missing top-level heading (H1)")
        elif len(h1s) > 1:
            warnings.append(f"Multiple H1 headings found ({len(h1s)})")

        if len(headings) == 0:
            issues.append("Document contains no headings")

        # Check for empty sections (heading followed immediately by another heading)
        lines = md_content.strip().splitlines()
        prev_was_heading = False
        for line in lines:
            stripped = line.strip()
            is_heading = stripped.startswith("#") and not stripped.startswith("#!")
            if is_heading and prev_was_heading:
                warnings.append(f"Empty section detected before: {stripped[:60]}")
            prev_was_heading = is_heading

        # Check tables for broken structure
        tables = soup.find_all("table")
        for i, table in enumerate(tables):
            rows = table.find_all("tr")
            if rows:
                header_cols = len(rows[0].find_all(["th", "td"]))
                for j, row in enumerate(rows[1:], start=2):
                    cols = len(row.find_all(["th", "td"]))
                    if cols != header_cols:
                        issues.append(f"Table {i + 1}, row {j}: column count mismatch ({cols} vs header {header_cols})")

        # Check for acceptance criteria sections
        ac_found = any(
            "acceptance criteria" in line.lower()
            for line in lines
            if line.strip().startswith("#")
        )

        # General metrics
        word_count = len(md_content.split())
        paragraph_count = len([p for p in soup.find_all("p") if p.get_text(strip=True)])
        link_count = len(soup.find_all("a"))
        code_block_count = len(soup.find_all("code"))

        duration_ms = int((time.time() - start_time) * 1000)
        return ToolExecutionResult(
            tool_name=self.name,
            success=len(issues) == 0,
            duration_ms=duration_ms,
            summary={
                "issues": issues,
                "warnings": warnings,
                "issue_count": len(issues),
                "warning_count": len(warnings),
                "has_acceptance_criteria": ac_found,
                "metrics": {
                    "word_count": word_count,
                    "headings": len(headings),
                    "paragraphs": paragraph_count,
                    "tables": len(tables),
                    "links": link_count,
                    "code_blocks": code_block_count,
                },
            },
        )
