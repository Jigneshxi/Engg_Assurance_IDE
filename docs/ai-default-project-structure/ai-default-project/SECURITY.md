# Security Policy & Vulnerability Disclosure Program

This document outlines the security policies, disclosure program guidelines, and triage SLAs (Service Level Agreements) for this repository. We are committed to keeping all data and code secure.

---

## 1. Supported Versions

We actively maintain and backport security patches for the following versions:

| Version | Supported | Security Patch SLA |
| :--- | :--- | :--- |
| **Main Branch** | :white_check_mark: | Immediate (ASAP, target < 24h) |
| **v2.x (Current LTS)**| :white_check_mark: | Critical: < 7 days; Medium: < 30 days |
| **v1.x (Legacy)** | :x: | Not supported; upgrade recommended |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue.** Please report all findings privately using the following workflow:

1.  **Contact Email**: Send a detailed description to `security@yourcompany.com`.
2.  **Encryption (Optional)**: For highly sensitive findings, encrypt your report using our security team's PGP key.
    *   **PGP Key ID**: `0x1A2B3C4D5E6F7G8H`
    *   **Fingerprint**: `A1B2 C3D4 E5F6 G7H8 I9J0 K1L2 M3N4 O5P6 Q7R8 S9T0`
3.  **Required Information**:
    *   Detailed steps to reproduce (PoC scripts or request logs).
    *   Affected components or endpoints.
    *   Assessment of potential impact (data leak, privilege escalation, DoS).

---

## 3. Vulnerability Severity and Triage SLA

We evaluate reports using the CVSS (Common Vulnerability Scoring System) v3.1 scale:

| Severity | CVSS Score | Initial Triage Response | Target Fix Window |
| :--- | :--- | :--- | :--- |
| **Critical** | `9.0 – 10.0` | < 12 Hours | < 48 Hours |
| **High** | `7.0 – 8.9` | < 24 Hours | < 7 Days |
| **Medium** | `4.0 – 6.9` | < 3 Days | < 30 Days |
| **Low** | `0.1 – 3.9` | < 7 Days | Next minor release |

---

## 4. Disclosure Policy

*   **Coordinated Disclosure**: We request that you do not publish details of the vulnerability until a fix has been successfully deployed and verified in production.
*   **Public Recognition**: Upon verification and remediation of a valid vulnerability, we will credit the researcher in our release notes (unless anonymity is requested).
*   **Safe Harbor**: We will not pursue legal action against security researchers who access, test, or audit our systems in accordance with this policy and do not compromise private customer data.
