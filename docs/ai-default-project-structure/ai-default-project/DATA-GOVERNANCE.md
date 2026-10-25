# Data Governance & Compliance Policy

This document defines repository standards for data classification, handling, storage, retention, and deletion to ensure compliance with global regulations (GDPR, CCPA, HIPAA, SOC 2).

---

## 1. Data Classification Matrix

All data produced or handled by this system is categorized into one of four classes:

| Class | Examples | Encryption Requirement | Storage Standards | Access Control |
| :--- | :--- | :--- | :--- | :--- |
| **Public** | Public API docs, marketing text, package versions | None required | CDN, public S3 buckets | Read: Public; Write: CI/CD |
| **Internal** | System performance metrics, non-sensitive config | Enforced in-transit | Internal VPC datastores | Read/Write: Development team |
| **Confidential** | Source code, business logic metadata, analytics | Enforced in-transit & at-rest | Restricted VPC DBs, encrypted volumes | Read/Write: Core team via RBAC |
| **Restricted** | PII (Email, Name, IP, Phone), credentials, financial records | Enforced in-transit (TLS 1.3), at-rest (AES-256-GCM), and field-level encryption | Highly isolated datastores, Hardware Security Modules (HSM) | Enforced Least Privilege, multi-factor auth (MFA) |

---

## 2. PII (Personally Identifiable Information) Handling Rules

Any component processing Restricted/PII data must adhere to the following:

*   **Pseudonymization & Anonymization**: Replace identifying elements with cryptographic identifiers (salting & hashing) at the entry boundary.
*   **Zero Log Policy**: Restricted data must never be printed to application stdout, log aggregators, or telemetry platforms. Developers must use designated interceptors to mask/redact email addresses, tokens, and credit cards before logs are written.
*   **Outbound AI Scans**: Before sending payloads to external LLM services (e.g., OpenAI, Anthropic), code must run a PII scrubbing utility to remove names, phone numbers, and location identifiers.

---

## 3. Data Cryptography Standards

*   **In-Transit**: Enforce HTTPS with TLS 1.3 exclusively. Deprecate legacy TLS versions (1.0, 1.1, 1.2).
*   **At-Rest**: Databases and block storage must be encrypted using AES-256-GCM.
*   **Key Rotation**: Cryptographic keys must be managed in a cloud KMS or Vault, with automated rotation policies active (minimum every 90 days).

---

## 4. Retention and Deletion (compliance)

*   **Retention Limits**: General transaction records must not exceed 7 years. Test environment data must be purged every 30 days.
*   **Right to be Forgotten (GDPR Article 17)**: The backend architecture must expose a cascading deletion hook that purges all traces of a user across database tables, file systems, caches, and backups within 30 days of request.
*   **Legal Hold**: SRE/Operations teams must have a mechanism to freeze the automated retention-deletion pipelines for specific client IDs during active legal or security investigations.
