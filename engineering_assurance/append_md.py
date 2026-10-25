def main():
    path = "docs/AmereyConnect_Mesh_Outputs.md"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = """
### `logician` (Systems Logician)
**Function:** Audits the requirements and strategy for logical flaws, boundary values, and race conditions.
```json
{
  "logic_score": 95,
  "identified_flaws": [
    {
      "flaw": "QR session attribution lacks a definitive TTL, potentially allowing indefinite commission assignment.",
      "severity": "Major",
      "mitigation": "Enforce a strict 24-hour cookie/session expiration window for QR-initiated sessions."
    }
  ],
  "state_machine_model": [
    {
      "workflow": "Chemist QR Checkout",
      "states": ["INITIATED", "OTP_SENT", "OTP_VERIFIED", "PAID"],
      "invalid_transitions": ["INITIATED -> PAID (Bypassing OTP)"]
    }
  ]
}
```

### `compose` (Plan Composer)
**Function:** Synthesizes the final unified executive strategy from all tier agentic outputs.
```json
{
  "executive_summary": "The AmereyConnect v1.0 mission has been successfully analyzed, architected, and validated. Critical logical flaws in QR attribution have been mitigated, and performance boundaries are verified to support 5,000 TPS.",
  "mesh_analytics": {
    "security_posture": 95,
    "performance_readiness": 90,
    "traceability_index": 100
  },
  "testing_points": [
    {
      "feature": "QR Code Scanning",
      "verification_point": "Verify Chemist Affiliate ID is correctly passed and attributed.",
      "expected_behavior": "Session initiates with Affiliate ID stored in transaction context."
    }
  ]
}
```
"""
    if "### `logician` (Systems Logician)" not in content:
        with open(path, "a", encoding="utf-8") as f:
            f.write(new_content)

if __name__ == "__main__":
    main()
