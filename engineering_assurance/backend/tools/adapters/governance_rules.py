import time
import re
import os
import yaml
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult, RuleResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any, List

# PII detection patterns
_PII_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),                       # SSN
    re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),  # Credit card
    re.compile(r"\b\d{9}\b"),                                     # 9-digit numbers (potential SSN)
    re.compile(r"\b[A-Z]{2}\d{6,8}\b"),                           # Passport-like
]


def _load_rules() -> List[dict]:
    """Load governance rules from the YAML config file."""
    config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "governance_rules.yaml")
    config_path = os.path.abspath(config_path)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return [r for r in data.get("rules", []) if r.get("enabled", True)]
    except Exception:
        # Hardcoded fallback if YAML is missing
        return [
            {"id": "GOV-001", "severity": "HIGH", "artifact_type": "user_story", "check": "has_acceptance_criteria", "message": "Missing acceptance criteria"},
            {"id": "GOV-002", "severity": "HIGH", "artifact_type": "test_case", "check": "has_expected_result", "message": "Test case missing expected result"},
        ]


def _check_rule(rule: dict, artifact_type: str, content: dict) -> RuleResult:
    """Evaluate a single governance rule against the content."""
    check = rule["check"]
    passed = True

    if artifact_type != rule.get("artifact_type", artifact_type):
        # Rule doesn't apply to this artifact type — auto-pass
        return RuleResult(rule_id=rule["id"], severity=rule["severity"], message=rule["message"], passed=True)

    if check == "has_acceptance_criteria":
        ac = content.get("acceptance_criteria", content.get("acceptanceCriteria", None))
        passed = bool(ac and len(ac) > 0)

    elif check == "has_expected_result":
        er = content.get("expected_result", content.get("expectedResult", content.get("expected", None)))
        passed = bool(er and str(er).strip())

    elif check == "has_authentication":
        auth = content.get("authentication", content.get("auth", content.get("security", None)))
        passed = bool(auth)

    elif check == "no_pii_patterns":
        text = str(content)
        passed = not any(p.search(text) for p in _PII_PATTERNS)

    elif check == "has_rollback_strategy":
        rollback = content.get("rollback", content.get("rollback_strategy", content.get("recovery", None)))
        passed = bool(rollback)

    elif check == "has_priority":
        priority = content.get("priority", content.get("severity", None))
        passed = bool(priority)

    elif check == "has_preconditions":
        pre = content.get("preconditions", content.get("prerequisites", content.get("setup", None)))
        passed = bool(pre)

    elif check == "description_not_empty":
        desc = content.get("description", "")
        passed = bool(desc and len(str(desc).strip()) >= 10)

    elif check == "has_error_handling":
        errors = content.get("error_responses", content.get("error_handling", content.get("errors", None)))
        passed = bool(errors)

    elif check == "has_timeout":
        timeout = content.get("timeout", content.get("timeout_ms", content.get("max_duration", None)))
        passed = bool(timeout)

    return RuleResult(rule_id=rule["id"], severity=rule["severity"], message=rule["message"], passed=passed)


@ToolRegistry.register
class GovernanceRulesAdapter(BaseToolAdapter):
    name = "governance_rules"
    category = "governance"

    @property
    def capability(self):
        from backend.api.models import AdapterCapability
        return AdapterCapability.SAFE

    @property
    def execution_mode(self):
        from backend.api.models import AdapterExecutionMode
        return AdapterExecutionMode.TOOL_AUGMENTED

    @classmethod
    def get_version(cls) -> str:
        return "1.0.0"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return True

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload

        artifact_type = payload.get("artifact_type", "unknown")
        content = payload.get("content", {})

        if not content:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error="Payload must contain 'artifact_type' and 'content'.",
            )

        rules = _load_rules()
        results: List[RuleResult] = []
        for rule in rules:
            result = _check_rule(rule, artifact_type, content)
            results.append(result)

        violations = [r for r in results if not r.passed]
        passed_count = sum(1 for r in results if r.passed)

        duration_ms = int((time.time() - start_time) * 1000)
        return ToolExecutionResult(
            tool_name=self.name,
            success=len(violations) == 0,
            duration_ms=duration_ms,
            summary={
                "passed": passed_count,
                "failed": len(violations),
                "total": len(results),
                "violations": [v.model_dump() for v in violations],
                "warnings": [],
            },
        )
