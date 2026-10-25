# Observability & Telemetry Engineering Standards

This document outlines requirements for instrumenting structured logging, collecting performance metrics, distributed tracing, and incident response alerting. All systems must support OpenTelemetry (OTel) standards.

---

## 1. Structured Logging Standard

All applications must output logs to `stdout`/`stderr` as structured JSON objects. Hardcoded text-only print statements are strictly forbidden.

### Required JSON Log Schema
```json
{
  "timestamp": "ISO8601 UTC timestamp",
  "level": "DEBUG | INFO | WARN | ERROR | FATAL",
  "service": "service_name",
  "version": "1.4.2",
  "trace_id": "OpenTelemetry trace identifier (correlation ID)",
  "span_id": "OpenTelemetry span identifier",
  "message": "Human readable event description",
  "context": {
    "user_id": "optional_id",
    "request_path": "/api/v1/checkout",
    "http_method": "POST",
    "execution_time_ms": 120,
    "error_details": {
      "stack_trace": "...",
      "code": "DB_CONNECTION_TIMEOUT"
    }
  }
}
```

*   **Log Redaction**: Interceptors must scrub fields matching keys like `password`, `token`, `secret`, `card`, `cvv` from the `context` object.

---

## 2. Performance & System Metrics

Services must expose a `/metrics` Prometheus-compatible endpoint.

### Primary Metrics to Track
*   **RED Method (Request Rate, Errors, Duration)**:
    *   `http_requests_total` (Counter): Broken down by status code and endpoint.
    *   `http_request_duration_seconds` (Histogram): Bucketed duration for latency calculations.
*   **USE Method (Utilization, Saturation, Errors - Infrastructure)**:
    *   `process_cpu_usage` (Gauge): Current CPU load.
    *   `process_resident_memory_bytes` (Gauge): RAM saturation.
*   **AI/LLM Telemetry**:
    *   `llm_tokens_consumed_total` (Counter): Tagged by `model` and `prompt_type`.
    *   `llm_request_duration_seconds` (Histogram): Outbound API latency.

---

## 3. Distributed Tracing

*   Every incoming request at the API gateway must generate a unique `trace_id`.
*   This context must be passed downstream via standard W3C Trace Context headers (`traceparent`) through all internal queues, event buses (Kafka, RabbitMQ), and microservice HTTP clients.

---

## 4. SLI / SLO Framework

Production readiness requires the definition of Service Level Indicators (SLIs) and Service Level Objectives (SLOs) for primary workflows:

| Service Area | Indicator (SLI) | Objective (SLO) | Alert Trigger |
| :--- | :--- | :--- | :--- |
| **API Availability** | Successful response rate (2xx/3xx/4xx over total). | **99.9%** availability over 30 days. | Error budget burn rate exceeds threshold. |
| **API Latency** | Duration of POST/GET requests (P95). | **< 200ms** latency for P95 calls. | P95 latency > 500ms for 5 consecutive minutes. |
| **LLM Execution** | Outbound completion failure rate. | **99%** success rate over 24 hours. | 3 consecutive failures of LLM pipelines. |

---

## 5. Incident Escalation & Runbooks

*   **Actionable Alerts**: Alerts must trigger on symptom degradation (e.g., elevated error rates), not CPU utilization peaks.
*   **Runbook References**: Every alert rule configured in alerting tools (Prometheus Alertmanager, Datadog, PagerDuty) must contain a URL linking to a specific resolution runbook under the `docs/runbooks/` directory.
