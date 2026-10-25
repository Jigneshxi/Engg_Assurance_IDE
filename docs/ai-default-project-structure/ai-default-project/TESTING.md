# Quality Assurance & Testing Standards

This document establishes the testing methodologies, coverage rules, and automated testing tools required for this project to ensure world-class software quality.

---

## 1. Testing Pyramid & Tools

We utilize a multi-layered testing strategy. The following tools are standardized across the workspace:

| Layer | Focus | Standard Frameworks / Tools | Target Coverage |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | Logic, helpers, utilities, model calculations. | Jest / Vitest (TypeScript/JS), PyTest (Python). | **85%+** overall; **100%** on critical business code. |
| **Integration** | DB operations, file operations, API contracts. | Supertest (Node), PyTest-Django/Flask, Pact (Contract testing). | Coverage on all API entry points and database schemas. |
| **End-to-End (E2E)**| Multi-service user journeys, front-to-back flow. | Playwright, Cypress. | Coverage on top 10 critical user workflows. |
| **Performance** | Load, concurrency limits, stress spikes, soak tests. | k6, Apache JMeter. | Baseline latency tested on every release candidate. |
| **Accessibility** | WCAG 2.1 AA validation, keyboard navigation. | axe-core, Playwright A11y tests. | Zero high-severity accessibility issues. |
| **Security** | Dependency analysis, SAST, secret checks. | SonarQube, Snyk, Gitleaks, OWASP ZAP (DAST). | Zero critical/high vulnerabilities on main branch. |

---

## 2. Test Writing Patterns (AAA Pattern)

Tests must follow the **Arrange-Act-Assert (AAA)** structural pattern to ensure readability:

```typescript
describe('CalculatorService', () => {
  it('should calculate the tax for a given product correctly', () => {
    // Arrange
    const productService = new ProductService();
    const product = { id: 1, name: 'Laptop', price: 1000 };
    const taxRate = 0.15;

    // Act
    const tax = productService.calculateTax(product, taxRate);

    // Assert
    expect(tax).toBe(150);
  });
});
```

*   **Mocking Policy**: Mock third-party API dependencies (e.g., Stripe, Sendgrid, OpenAI) using robust mock servers or native mocking adapters. Never make external internet network requests during unit or integration testing.

---

## 3. Coverage Enforcement

*   **Checkpoints**: Code coverage metrics are compiled during the CI/CD pull request gate.
*   **Hard Limits**: A pull request will be blocked from merging if:
    1.  Overall repository code coverage drops below the **80%** threshold.
    2.  Critical domains/models drop below **100%** coverage.
    3.  A regression check determines that coverage dropped more than **2%** compared to the target branch.

---

## 4. Local Execution Reference

To run the testing suite locally:

```bash
# Run unit tests
npm run test:unit       # Node/TypeScript
pytest tests/unit       # Python

# Run integration tests
npm run test:integration
pytest tests/integration

# Run Playwright E2E UI Tests
npx playwright test

# Check code coverage
npm run test:cov
```
