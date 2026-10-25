import json

def build_remediation_prompt(failing_context: dict) -> str:
    """Builds a prompt to generate NFR remediation steps based on tool failures."""
    
    context_str = json.dumps(failing_context, indent=2)
    
    return f"""You are a Senior DevSecOps and Site Reliability Engineer (SRE).
Your objective is to analyze failing Non-Functional Requirement (NFR) metrics from our CI/CD pipeline and provide actionable, step-by-step remediation advice for the developers.

Here is the failing context from our NFR audit tools (Security, Accessibility, Performance, Reliability):

<failing_context>
{context_str}
</failing_context>

Task:
Analyze the failures above. For each distinct issue or failing tool, provide a concrete remediation plan.

Your response MUST be valid JSON matching exactly this schema, and wrapped in triple backticks (```json ... ```):

```json
{{
  "remediations": [
    {{
      "domain": "Security | Accessibility | Performance | Reliability",
      "issue": "Brief description of the failure (e.g., 'P95 latency is 1500ms')",
      "remediation_steps": "1. Do X\\n2. Do Y\\n3. Verify Z",
      "effort": "Low | Medium | High"
    }}
  ]
}}
```

Constraints:
1. Provide actionable advice, not generic platitudes.
2. If Security is failing (Semgrep), suggest fixing the specific types of vulnerabilities typically found.
3. If Reliability is failing (404s or 500s), suggest checking route definitions and server startup logs.
4. Return ONLY the JSON object.
"""
