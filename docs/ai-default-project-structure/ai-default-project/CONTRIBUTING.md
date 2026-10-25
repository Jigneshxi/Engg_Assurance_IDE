# Contributing Guidelines

Thank you for contributing to this project! To maintain enterprise-grade software standards, all contributors (both human engineers and AI agents) must strictly follow the workflow and requirements detailed below.

---

## 1. Code Style & Commit Guidelines

### Conventional Commits
We enforce the [Conventional Commits](https://www.conventionalcommits.org/) standard for all commit messages. This enables automated changelog generation and semantic versioning.

**Structure**:
`type(scope): description`

**Types**:
*   `feat`: A new feature (corresponds to a minor release).
*   `fix`: A bug fix (corresponds to a patch release).
*   `docs`: Documentation-only changes.
*   `style`: Code style changes (formatting, missing semi-colons, no logic change).
*   `refactor`: Code changes that neither fix bugs nor add features.
*   `test`: Adding missing tests or correcting existing tests.
*   `chore`: Maintain tasks, dependencies, or build config.

**Example**:
`feat(auth): add multi-factor authentication support via TOTP`

---

## 2. Development & Pull Request (PR) Workflow

1.  **Branch Creation**: Branch off `main` or `master` using descriptive names:
    *   `feature/scope-description`
    *   `bugfix/scope-description`
    *   `chore/scope-description`
2.  **Local Execution**: Always format, lint, and run tests locally before pushing:
    *   TypeScript: `npm run lint && npm run format && npm run test`
    *   Python: `flake8 . && black --check . && pytest`
3.  **PR Checklist Verification**: Complete the comprehensive PR template checklist (`.github/PULL_REQUEST_TEMPLATE.md`).
4.  **CODEOWNERS Review**: Wait for required code owners to review and approve the PR before merging.

---

## 3. AI Agent Code Contribution Rules

If you are an AI agent contributing to this repository:
*   You **must** run local formatters and test runners after editing files to verify compilation.
*   You **must** append a "Risk and Impact Assessment" section to the bottom of your pull request description covering:
    1.  Potential security risks.
    2.  Performance impact.
    3.  Outbound LLM cost changes (if applicable).
    4.  Rollback safety plan.
*   You **must not** modify CI/CD pipelines, IAM controls, or configuration parameters without explicit human request and approval.
