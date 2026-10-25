HOOK_GUARDRAILS_PROMPT_TEMPLATE = """You are a development-safety advisor. Your task is to determine if Claude Code Hooks (pre-tool use or post-tool use) are warranted for this specific project based on its technology stack and compliance requirements.

## PROJECT CONTEXT
Target Tech Stack: {tech_stack_json}
Has DB Migrations: {has_db_migrations}
Repository Conventions: {repo_conventions_json}
Compliance Flags: {compliance_flags_json}

---

## COMPLIANCE FRAMEWORKS
Review the compliance flags above. If they reference any of the following, their protections must be treated as baseline-mandatory:
- GDPR / CCPA: data access controls, PII handling, data retention
- HIPAA / HITECH: PHI access logging, encryption at rest/transit
- SOC 2: change management controls, audit logging, least-privilege access
- PCI DSS: cardholder data isolation, key management

---

## YOUR TASK

Work through this reasoning process explicitly before producing output:

STEP 1 — Identify genuinely critical files/directories for THIS project's actual stack.
Do not list generic examples (e.g., don't just say "protect .env" or "run tests"). Focus on files that match the specific tech stack provided above. If the tech stack is empty or unknown, explicitly state that rather than guessing a stack.

STEP 2 — Evaluate compliance and architecture risks.
Consider the compliance frameworks (e.g., GDPR, HIPAA) and whether the project has database migrations. Determine if specific hooks are needed to enforce these rules.

STEP 3 — Recommend hooks.
Based on the above, recommend specific hooks. If no hooks are needed (e.g. for a very simple static site), set hooks_required to false.

STEP 4 — Name each hook's intent.
For each recommended hook, write a `purpose` — one short phrase (5-10 words max) that a developer can read at a glance in a list header without needing to read the full rationale. Examples: "Prevent SQL injection in migrations", "Block unencrypted PHI writes", "Enforce pre-commit type-check".

STEP 5 — Identify the correct trigger type.
For each hook, determine whether it is triggered by:
- A specific file glob (use `target`, set `command_pattern` to null)
- A specific shell command pattern (use `command_pattern`, set `target` to null)
- Neither (e.g. a Stop hook): set both to null

STEP 6 — Assign priority to each recommended hook.
Use ONLY the following rubric — do not default everything to "critical" or "high":
- "critical": prevents secret/PII leakage, OR blocks a compliance violation explicitly named in COMPLIANCE FRAMEWORKS above.
- "high": prevents a named security vulnerability class (injection, insecure config, unencrypted secrets) even without a compliance driver.
- "medium": improves code quality/consistency (lint, type-check, test coverage) but is not a security or compliance gate.
- "low": convenience/notification hook (e.g., build status notification, format-on-save). No security impact.

Vary priority genuinely across your recommendations based on actual risk. A list where every hook is "critical" or "high" is a signal the rubric was not applied.

---

## OUTPUT FORMAT — return JSON only, no prose before or after, no markdown code fences

Use ONLY the `type` field for hook classification — do NOT also emit a separate `hook_type` field. The `type` field uses PascalCase (`PreToolUse`, `PostToolUse`, `Stop`, `Notification`).

For `target` globs: narrow the pattern to what the hook actually needs to inspect. If a hook checks SQL injection, target `*.sql` or `migrations/**`, not `**/*.py`. If a lint hook and a test-execution hook would share an identical broad glob (e.g. `**/*.ts`), split or narrow them — two hooks firing on identical scope signals redundant coverage, not distinct protection.

{{
  "hooks_required": true,
  "reason": "One or two sentences explaining why hooks are needed for this specific stack.",
  "suggested_hooks": [
    {{
      "type": "PreToolUse | PostToolUse | Stop | Notification",
      "purpose": "Short phrase naming the hook's intent (5–10 words)",
      "action": "Specific detection or validation logic the hook performs",
      "target": "Narrowed file glob if file-triggered (e.g. '*.sql', 'migrations/**'), else null",
      "command_pattern": "Shell command pattern if command-triggered (e.g. 'git push', 'npm publish'), else null",
      "priority": "critical | high | medium | low",
      "rationale": "Why this specific hook is necessary for this stack and compliance context"
    }}
  ]
}}

If hooks_required is false, return "suggested_hooks": [] and explain why in "reason".

IMPORTANT: If the target tech stack is empty, do NOT invent generic hooks based on common assumptions. Return "hooks_required": false with reason: "No tech stack information was provided — cannot safely recommend hooks."
"""

def build_hook_guardrails_prompt(tech_stack: dict, has_db_migrations: bool, repo_conventions: dict, compliance_flags: list) -> str:
    import json
    return HOOK_GUARDRAILS_PROMPT_TEMPLATE.format(
        tech_stack_json=json.dumps(tech_stack, indent=2) if tech_stack else "None specified",
        has_db_migrations=has_db_migrations,
        repo_conventions_json=json.dumps(repo_conventions, indent=2) if repo_conventions else "None specified",
        compliance_flags_json=json.dumps(compliance_flags, indent=2) if compliance_flags else "None specified"
    )
