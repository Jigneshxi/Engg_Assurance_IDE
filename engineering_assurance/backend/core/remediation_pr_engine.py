"""
================================================================================
CONVERGE PHASE 2.2 - COMPLIANCE REMEDIATION PR ENGINE
================================================================================
PURPOSE: Generate structured Git PR proposals to fix identified compliance gaps.

When the Compliance Governor (Agent #21) identifies a violation such as:
  - Missing PII masking on a user data endpoint
  - Unencrypted data at rest
  - Missing audit logging for sensitive operations
  - GDPR consent not captured

This engine:
1. Takes the compliance violation as input
2. Generates a concrete code fix (diff format)
3. Structures it as a PR proposal with title, description, and file changes
4. Returns a PR object the UI can display with a "Remediate" button

Architecture: LLM-powered code generation with structured PR output.
"""

import logging
import re
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# ── PR Status ─────────────────────────────────────────────────────────────────
PR_STATUS_PROPOSED  = "PROPOSED"
PR_STATUS_APPROVED  = "APPROVED"
PR_STATUS_REJECTED  = "REJECTED"
PR_STATUS_MERGED    = "MERGED"


def generate_remediation_prs(
    compliance_report: Dict[str, Any],
    task_id: str,
    context: str = ""
) -> List[Dict[str, Any]]:
    """
    MAIN ENTRY POINT: Generate PR proposals for all compliance violations.

    Args:
        compliance_report: Output from compliance_node (Agent #21)
        task_id: The generation task ID for tracking
        context: Optional requirement context for better code generation

    Returns:
        List of PR proposal dicts, each containing:
        - pr_id, title, description, violation_id, severity
        - file_changes: list of {filename, diff, language}
        - status: PROPOSED
        - remediation_type: "code_fix" | "config_change" | "policy_update"
    """
    violations = _extract_violations(compliance_report)
    if not violations:
        logger.info(f"[REMEDIATION-PR] No violations found for task {task_id}")
        return []

    prs = []
    for i, violation in enumerate(violations[:8]):  # Cap at 8 PRs per run
        try:
            pr = _generate_pr_for_violation(violation, i + 1, context)
            if pr:
                prs.append(pr)
        except Exception as e:
            logger.warning(f"[REMEDIATION-PR] PR generation failed for violation {i+1}: {e}")
            # Add a minimal PR stub so the UI still shows the violation
            prs.append(_stub_pr(violation, i + 1))

    logger.info(f"[REMEDIATION-PR] Generated {len(prs)} PR proposals for task {task_id}")
    return prs


def _extract_violations(compliance_report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract actionable violations from the compliance report."""
    violations = []

    # From compliance_controls
    controls = compliance_report.get("compliance_controls") or []
    for ctrl in controls:
        if isinstance(ctrl, dict):
            status = ctrl.get("status", "").lower()
            if status in ("required", "missing", "failed", "violation", "non-compliant"):
                violations.append({
                    "id": ctrl.get("control_id", f"CTRL-{len(violations)+1}"),
                    "description": ctrl.get("description", "Compliance control required"),
                    "standard": ctrl.get("standard") or _infer_standard(ctrl.get("control_id", "")),
                    "severity": ctrl.get("severity", "HIGH"),
                    "remediation_hint": ctrl.get("remediation") or ctrl.get("fix") or "",
                    "category": ctrl.get("category", "security")
                })

    # From violations_found (remediation agent output)
    found = compliance_report.get("violations_found") or []
    for v in found:
        if isinstance(v, dict):
            violations.append({
                "id": v.get("violation_id") or v.get("id", f"VIOL-{len(violations)+1}"),
                "description": v.get("description") or v.get("violation", "Compliance violation"),
                "standard": v.get("standard") or v.get("framework", "SOC2"),
                "severity": v.get("severity", "HIGH"),
                "remediation_hint": v.get("fix") or v.get("remediation", ""),
                "category": v.get("category", "security")
            })

    # Deduplicate by ID
    seen = set()
    unique = []
    for v in violations:
        if v["id"] not in seen:
            seen.add(v["id"])
            unique.append(v)

    return unique


def _generate_pr_for_violation(
    violation: Dict[str, Any],
    pr_number: int,
    context: str
) -> Optional[Dict[str, Any]]:
    """Generate a single PR proposal using LLM code generation."""
    from backend.core.identity_orchestrator import IdentityOrchestrator

    violation_desc = violation["description"]
    standard = violation["standard"]
    category = violation["category"]
    hint = violation.get("remediation_hint", "")

    prompt = f"""You are a Security Engineer generating a Git PR to fix a compliance violation.

VIOLATION: {violation_desc}
STANDARD: {standard}
CATEGORY: {category}
HINT: {hint}
CONTEXT: {context[:400] if context else "Generic web application"}

Generate a CONCRETE code fix as a Git PR. Return JSON with this exact structure:
{{
  "pr_title": "fix: [short title under 70 chars]",
  "pr_description": "## Summary\\n[2-3 sentences]\\n\\n## Compliance\\n- Standard: {standard}\\n- Violation: [brief]\\n\\n## Changes\\n- [bullet list of changes]\\n\\n## Testing\\n- [how to verify the fix]",
  "remediation_type": "code_fix|config_change|policy_update",
  "file_changes": [
    {{
      "filename": "src/path/to/file.py",
      "language": "python",
      "diff": "--- a/src/path/to/file.py\\n+++ b/src/path/to/file.py\\n@@ -10,6 +10,8 @@\\n [unified diff showing the fix]"
    }}
  ],
  "estimated_effort": "XS|S|M|L",
  "breaking_change": false
}}

Make the diff realistic and specific to the violation type. Use proper unified diff format."""

    for tier in ("strategic", "primary", "economy"):
        identity = IdentityOrchestrator.get_identity(tier)
        if not identity:
            continue
        try:
            provider = identity["provider"].lower()
            api_key = identity["key"]
            model = identity["model"]
            base_url = identity.get("url") or ""

            result_text = ""
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key)
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model, max_tokens=1500, temperature=0.2
                )
                result_text = res.choices[0].message.content
            elif provider in ("openai", "openrouter", "gemini"):
                from openai import OpenAI
                default_urls = {
                    "openai": "https://api.openai.com/v1",
                    "openrouter": "https://openrouter.ai/api/v1",
                    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
                }
                client = OpenAI(
                    api_key=api_key,
                    base_url=base_url or default_urls.get(provider, "https://api.openai.com/v1")
                )
                clean_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=clean_model, max_tokens=1500, temperature=0.2
                )
                result_text = res.choices[0].message.content

            if not result_text:
                continue

            import json
            result_text = result_text.strip()
            result_text = re.sub(r'^```json\s*', '', result_text)
            result_text = re.sub(r'\s*```$', '', result_text)

            pr_data = json.loads(result_text)

            return {
                "pr_id": f"PR-{str(pr_number).zfill(3)}",
                "violation_id": violation["id"],
                "standard": standard,
                "severity": violation["severity"],
                "pr_title": pr_data.get("pr_title", f"fix: Remediate {violation['id']}"),
                "pr_description": pr_data.get("pr_description", ""),
                "remediation_type": pr_data.get("remediation_type", "code_fix"),
                "file_changes": pr_data.get("file_changes", []),
                "estimated_effort": pr_data.get("estimated_effort", "S"),
                "breaking_change": pr_data.get("breaking_change", False),
                "status": PR_STATUS_PROPOSED,
                "auto_generated": True
            }

        except Exception as e:
            logger.warning(f"[REMEDIATION-PR] Tier {tier} failed for violation {violation['id']}: {e}")
            continue

    return _stub_pr(violation, pr_number)


def _stub_pr(violation: Dict[str, Any], pr_number: int) -> Dict[str, Any]:
    """Generate a minimal PR stub when LLM generation fails."""
    category = violation.get("category", "security")
    standard = violation.get("standard", "SOC2")
    desc = violation["description"]

    # Generate a sensible stub based on violation category
    stubs = {
        "pii": {
            "filename": "src/utils/data_masking.py",
            "language": "python",
            "diff": (
                "--- a/src/utils/data_masking.py\n"
                "+++ b/src/utils/data_masking.py\n"
                "@@ -1,5 +1,15 @@\n"
                "+import re\n"
                "+\n"
                "+def mask_pii(data: dict) -> dict:\n"
                "+    \"\"\"Mask PII fields before logging or storing.\"\"\"\n"
                "+    PII_FIELDS = ['email', 'phone', 'ssn', 'credit_card', 'password']\n"
                "+    masked = data.copy()\n"
                "+    for field in PII_FIELDS:\n"
                "+        if field in masked:\n"
                "+            masked[field] = '***REDACTED***'\n"
                "+    return masked\n"
            )
        },
        "encryption": {
            "filename": "src/config/security.py",
            "language": "python",
            "diff": (
                "--- a/src/config/security.py\n"
                "+++ b/src/config/security.py\n"
                "@@ -5,3 +5,8 @@\n"
                " DATABASE_CONFIG = {\n"
                "-    'ssl_mode': 'disable',\n"
                "+    'ssl_mode': 'require',\n"
                "+    'ssl_cert': '/etc/ssl/certs/db-cert.pem',\n"
                "+    'encrypt_at_rest': True,\n"
                "+    'key_rotation_days': 90,\n"
                " }\n"
            )
        },
        "audit": {
            "filename": "src/middleware/audit_logger.py",
            "language": "python",
            "diff": (
                "--- a/src/middleware/audit_logger.py\n"
                "+++ b/src/middleware/audit_logger.py\n"
                "@@ -0,0 +1,18 @@\n"
                "+import logging\n"
                "+from datetime import datetime\n"
                "+\n"
                "+audit_logger = logging.getLogger('audit')\n"
                "+\n"
                "+def log_sensitive_operation(user_id: str, action: str, resource: str):\n"
                "+    \"\"\"Log all sensitive operations for compliance audit trail.\"\"\"\n"
                "+    audit_logger.info({\n"
                "+        'timestamp': datetime.utcnow().isoformat(),\n"
                "+        'user_id': user_id,\n"
                "+        'action': action,\n"
                "+        'resource': resource,\n"
                "+        'compliance': 'SOC2-CC6.1'\n"
                "+    })\n"
            )
        }
    }

    # Pick best stub based on description keywords
    stub_key = "audit"
    if any(k in desc.lower() for k in ["pii", "personal", "gdpr", "mask", "redact"]):
        stub_key = "pii"
    elif any(k in desc.lower() for k in ["encrypt", "ssl", "tls", "at rest", "in transit"]):
        stub_key = "encryption"

    stub = stubs[stub_key]

    return {
        "pr_id": f"PR-{str(pr_number).zfill(3)}",
        "violation_id": violation["id"],
        "standard": standard,
        "severity": violation["severity"],
        "pr_title": f"fix: Remediate {violation['id']} — {desc[:50]}",
        "pr_description": (
            f"## Summary\nAutomated remediation for compliance violation: {desc}\n\n"
            f"## Compliance\n- Standard: {standard}\n- Violation ID: {violation['id']}\n\n"
            f"## Changes\n- Added {category} control as required by {standard}\n\n"
            f"## Testing\n- Run compliance scan after merge to verify resolution"
        ),
        "remediation_type": "code_fix",
        "file_changes": [stub],
        "estimated_effort": "S",
        "breaking_change": False,
        "status": PR_STATUS_PROPOSED,
        "auto_generated": True
    }


def _infer_standard(control_id: str) -> str:
    """Infer the compliance standard from a control ID prefix."""
    prefixes = {
        "SOC": "SOC2", "GDPR": "GDPR", "HIPAA": "HIPAA",
        "PCI": "PCI-DSS", "ISO": "ISO27001", "SEC": "SOC2",
        "PRIV": "GDPR", "PHI": "HIPAA"
    }
    for prefix, standard in prefixes.items():
        if control_id.upper().startswith(prefix):
            return standard
    return "SOC2"
