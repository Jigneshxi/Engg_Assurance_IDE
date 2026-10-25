# Threat Model & Security Architecture Framework

This document outlines the threat modeling framework, trust boundaries, and security risk assessment criteria for this repository. All architectural designs must complete a threat model update using this layout before major releases.

---

## 1. Trust Boundaries

Trust boundaries delineate components that operate at different privilege levels or reside on distinct networks.

*   **Boundary 1 (Internet to CDN/WAF)**: Untrusted traffic. External clients communicating over HTTPS.
*   **Boundary 2 (WAF to API Gateway)**: Cleaned external requests. Requests must be authenticated here.
*   **Boundary 3 (API Gateway to Backend Services)**: Internal VPC. Communication requires internal JSON Web Tokens (JWT) or Mutual TLS (mTLS).
*   **Boundary 4 (Backend Services to Database/Cache)**: High-security zone. Databases are not publicly accessible and require strict IAM-role access or vault-managed credentials.
*   **Boundary 5 (Application to LLM/AI Gateways)**: Third-party transit boundary. Data sent out must be checked for PII leaks. Response data must be treated as untrusted.

---

## 2. Threat Analysis Matrix (STRIDE Methodology)

Every component must analyze potential threats under the STRIDE methodology. Below are standard mitigations that must be implemented:

| Threat | Description | Default Mitigation Strategy | Verification / Test |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Adversary impersonating a user, service, or server. | Use Mutual TLS (mTLS) for microservices; enforce OAuth2/OIDC for external endpoints. | Security test suites, TLS check scans. |
| **Tampering** | Unauthorized modification of data at rest or in transit. | Use HMAC signing for webhooks; encrypt all databases at rest (AES-256); enforce HTTPS/TLS 1.3. | Integrity checks, payload checksum validation. |
| **Repudiation** | Adversary performing an action and denying it due to lack of auditing. | Enforce immutable, centralized audit trails (e.g., AWS CloudTrail, system logs written to write-once storage). | Log review audit validation. |
| **Information Disclosure** | Data leakage to unauthorized parties. | Mask PII in logs; encrypt fields containing restricted data; implement TLS 1.3 in transit. | Dependency scanners, automated secret detection. |
| **Denial of Service** | Resource exhaustion making services unavailable. | Enforce API Gateway rate-limiting (token bucket algorithm); implement auto-scaling policies; timeout on outbound calls. | Load & stress testing (K6 / JMeter). |
| **Elevation of Privilege** | Users gaining unauthorized access levels. | Apply Role-Based Access Control (RBAC) with Least Privilege; validate tokens cryptographically. | Privilege separation integration tests. |

---

## 3. Threat Modeling Workflow for New Features

For any feature classified as **High** or **Critical** risk (refer to `RULES.md`):

1.  **Draft a Data Flow Diagram (DFD)**: Illustrate paths, storage elements, boundaries, and actors.
2.  **STRIDE Analysis**: Enumerate threats targeting each transition point in the DFD.
3.  **Identify Controls**: Match threats with specific mitigation patterns.
4.  **Calculate Residual Risk**: Evaluate likelihood and impact (High/Medium/Low) after mitigations are applied.
5.  **Review Panel**: Obtain sign-off from the Security Owner listed in `CODEOWNERS` before merging.
