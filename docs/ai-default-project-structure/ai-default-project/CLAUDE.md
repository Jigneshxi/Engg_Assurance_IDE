# Claude & AI Assistant Instructions

This configuration file outlines the specific requirements, coding syntax rules, and repository policies that Claude or other LLM-based coding assistants must adhere to.

---

## 1. Architecture & Security Compliance

*   **Strict Constitutional Alignment**: You must strictly respect the regulations defined in [RULES.md](./RULES.md) and [AGENTS.md](./AGENTS.md).
*   **Security Scanning**: When suggesting or adding dependencies, you must cross-reference their vulnerability status against open databases. Avoid packages with active CVE reports.
*   **Zero Leak Policy**: You must never suggest committing private keys, API keys, database credentials, or real customer data into files. Always write config structures pointing to environment variables.

---

## 2. Language & Syntax Constraints

*   **TypeScript Strict Mode**:
    *   Compile configurations must have `"strict": true` enabled.
    *   Do not generate `any` types. Suggest types, interfaces, or generic parameters.
    *   Use optional chaining (`?.`) and nullish coalescing (`??`) rather than force-casting (`!`).
*   **Python snake_case**:
    *   All variable, function, parameter, and file names must use `snake_case`.
    *   Classes must use `PascalCase`.
    *   Constants must use `UPPER_CASE`.
    *   Leverage type hints (`def calculate_tax(amount: float, rate: float) -> float:`).

---

## 3. Git Commit Policy
*   Ensure all commit suggestions follow Conventional Commits (e.g., `feat(ui): add dashboard toggle buttons`).
*   When executing shell tasks or writing documentation, align with the defined Definition of Done in [RULES.md](./RULES.md).
