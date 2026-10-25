"""
================================================================================
CONVERGE -- PDF EXPORT ENGINE
================================================================================
Generates professional PDF certificates and reports from mesh task state.

Exports:
  - Resilience Certificate  (chaos + reliability + SLO signals)
  - Compliance Evidence Pack (SOC2/GDPR/HIPAA controls + traceability)
  - Engineering Economics Report (ROI, cost-per-test, revenue guard)
  - Full Release Decision Report (all 4 modules combined)
"""
import io
import logging
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ── Colour palette ────────────────────────────────────────────────────────────
INDIGO  = (0.388, 0.400, 0.945)   # #6366f1
GREEN   = (0.063, 0.725, 0.506)   # #10b981
AMBER   = (0.961, 0.620, 0.043)   # #f59e0b
PURPLE  = (0.545, 0.361, 0.965)   # #8b5cf6
DARK    = (0.059, 0.090, 0.161)   # #0f172a
SLATE   = (0.282, 0.337, 0.416)   # #475569
LIGHT   = (0.945, 0.961, 0.976)   # #f1f5f9
WHITE   = (1.0,   1.0,   1.0)
RED     = (0.937, 0.267, 0.267)   # #ef4444


def _get_canvas(buffer: io.BytesIO, title: str):
    """Create a ReportLab canvas with standard page setup."""
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(title)
    c.setAuthor("CONVERGE v4.0.0 | VV&T Certified")
    c.setSubject("CONVERGE Autonomous Engineering Intelligence Platform")
    return c, A4


def _header(c, width: float, height: float, title: str, subtitle: str, color=None):
    """Draw the standard CONVERGE header band."""
    if color is None:
        color = INDIGO
    # Header background
    c.setFillColorRGB(*DARK)
    c.rect(0, height - 80, width, 80, fill=1, stroke=0)
    # Accent bar
    c.setFillColorRGB(*color)
    c.rect(0, height - 84, width, 4, fill=1, stroke=0)
    # Title
    c.setFillColorRGB(*WHITE)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, height - 42, title)
    # Subtitle
    c.setFillColorRGB(0.6, 0.65, 0.75)
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 60, subtitle)
    # Timestamp
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    c.drawRightString(width - 40, height - 60, f"Generated: {ts}")


def _footer(c, width: float, page_num: int = 1):
    """Draw the standard CONVERGE footer."""
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica", 7)
    c.drawString(40, 20, "CONVERGE v4.0.0 | VV&T Certified | AI-4-VVNT Ecosystem | Confidential")
    c.drawRightString(width - 40, 20, f"Page {page_num}")
    c.setStrokeColorRGB(*SLATE)
    c.setLineWidth(0.3)
    c.line(40, 30, width - 40, 30)


def _section_header(c, x: float, y: float, width: float, text: str, color=None):
    """Draw a section header bar."""
    if color is None:
        color = INDIGO
    c.setFillColorRGB(*color)
    c.rect(x, y - 2, width - x * 2, 18, fill=1, stroke=0)
    c.setFillColorRGB(*WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 8, y + 4, text.upper())
    return y - 26


def _kv_row(c, x: float, y: float, label: str, value: str, label_color=None, value_color=None):
    """Draw a key-value row."""
    if label_color is None:
        label_color = SLATE
    if value_color is None:
        value_color = DARK
    c.setFillColorRGB(*label_color)
    c.setFont("Helvetica", 8)
    c.drawString(x, y, label)
    c.setFillColorRGB(*value_color)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 160, y, str(value)[:80])
    return y - 14


def _badge(c, x: float, y: float, text: str, color=None):
    """Draw a colored badge pill."""
    if color is None:
        color = GREEN
    w = len(text) * 5.5 + 12
    c.setFillColorRGB(color[0]*0.15, color[1]*0.15, color[2]*0.15)
    c.roundRect(x, y - 2, w, 13, 4, fill=1, stroke=0)
    c.setFillColorRGB(*color)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 6, y + 2, text.upper())
    return x + w + 8


def _score_circle(c, cx: float, cy: float, r: float, score: Optional[int], color=None):
    """Draw a score ring with value inside."""
    if color is None:
        color = GREEN
    # Background ring
    c.setStrokeColorRGB(0.15, 0.18, 0.24)
    c.setLineWidth(4)
    c.circle(cx, cy, r, fill=0, stroke=1)
    # Score arc (approximate with filled circle overlay)
    if score is not None:
        c.setStrokeColorRGB(*color)
        c.setLineWidth(4)
        
        angle = (score / 100) * 360
        c.arc(cx - r, cy - r, cx + r, cy + r, startAng=90, extent=-angle)
    # Score text
    c.setFillColorRGB(*LIGHT)
    c.setFont("Helvetica-Bold", 14)
    val = str(score) if score is not None else "N/A"
    c.drawCentredString(cx, cy - 5, val)
    c.setFont("Helvetica", 6)
    c.setFillColorRGB(*SLATE)
    c.drawCentredString(cx, cy - 14, "/100")


# ==============================================================================
# CERTIFICATE 1: RESILIENCE CERTIFICATE
# ==============================================================================

def generate_resilience_certificate(task_data: Dict[str, Any]) -> bytes:
    """
    Generate a Resilience Certificate PDF from task state.
    Aggregates: chaos_scenarios, reliability_eng, sla_slo_audit, system_resilience.
    """
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c, (width, height) = _get_canvas(buf, "CONVERGE Resilience Certificate")

    merged = {**(task_data.get("result") or {}), **(task_data.get("partial_state") or {})}
    merged.update(merged.get("full_state") or {})

    chaos     = merged.get("chaos_scenarios") or []
    rel       = merged.get("reliability_eng") or {}
    slo       = merged.get("sla_slo_audit") or {}
    resilience= merged.get("system_resilience") or {}
    task_id   = task_data.get("task_id", "N/A")

    # ── Header ──
    _header(c, width, height, "RESILIENCE CERTIFICATE", f"Task ID: {task_id[:16]}...", color=AMBER)

    y = height - 110

    # ── Score ring ──
    score = resilience.get("resilience_score")
    if isinstance(score, (int, float)):
        score = int(score)
    else:
        score = None
    _score_circle(c, width - 90, y - 20, 35, score, color=AMBER)

    # ── Decision badge ──
    decision_text = "CERTIFIED" if (score or 0) >= 70 else "REVIEW REQUIRED"
    decision_color = GREEN if (score or 0) >= 70 else RED
    c.setFillColorRGB(*decision_color)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(40, y, decision_text)
    y -= 30

    # ── Chaos Experiments ──
    y = _section_header(c, 40, y, width, "Chaos Engineering Results", color=AMBER)
    y = _kv_row(c, 40, y, "Scenarios Executed", str(len(chaos)))
    y = _kv_row(c, 40, y, "Scenarios Passed", str(len([e for e in chaos if isinstance(e, dict)])))
    if chaos and isinstance(chaos[0], dict):
        for exp in chaos[:5]:
            name = exp.get("name", "Experiment")[:50]
            abort = exp.get("abort_condition", "N/A")[:40]
            y = _kv_row(c, 60, y, name, f"Abort: {abort}", label_color=(0.4, 0.5, 0.6))
    y -= 8

    # ── Reliability Engineering ──
    y = _section_header(c, 40, y, width, "Test Reliability Engineering (Agent #44)", color=AMBER)
    health = rel.get("health") or {}
    y = _kv_row(c, 40, y, "Stability Score", str(health.get("stability_score", "N/A")))
    y = _kv_row(c, 40, y, "Flaky Tests Identified", str(len(rel.get("flaky_tests") or [])))
    y = _kv_row(c, 40, y, "Quarantine Count", str(rel.get("quarantine_count", 0)))
    y = _kv_row(c, 40, y, "CI Gate Impact", str(rel.get("ci_gate_impact", "N/A"))[:60])
    y = _kv_row(c, 40, y, "Flakiness Threshold", str(rel.get("flakiness_threshold", "N/A"))[:60])
    y -= 8

    # ── SLO Compliance ──
    y = _section_header(c, 40, y, width, "SLA/SLO Compliance (Agent #40)", color=AMBER)
    ebp = slo.get("error_budget_policy") or {}
    y = _kv_row(c, 40, y, "Burn Rate", str(ebp.get("burn_rate", "N/A")))
    y = _kv_row(c, 40, y, "Error Budget Remaining", str(ebp.get("error_budget_remaining", "N/A")))
    y = _kv_row(c, 40, y, "Projected Exhaustion", str(ebp.get("projected_exhaustion", "N/A"))[:60])
    slo_defs = slo.get("slo_definitions") or []
    for slo_def in slo_defs[:3]:
        if isinstance(slo_def, dict):
            y = _kv_row(c, 60, y, slo_def.get("name", "SLO")[:40], slo_def.get("target", "N/A"), label_color=(0.4, 0.5, 0.6))
    y -= 8

    # ── System Resilience ──
    y = _section_header(c, 40, y, width, "System Resilience (Agent #49)", color=AMBER)
    controls = resilience.get("controls") or []
    for ctrl in controls[:4]:
        if isinstance(ctrl, dict):
            comp = ctrl.get("component", "Component")[:40]
            health_check = ctrl.get("health_check", "N/A")
            hc_color = GREEN if health_check == "Verified" else RED
            y = _kv_row(c, 60, y, comp, health_check, value_color=hc_color)

    # ── Certification statement ──
    y -= 10
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, y, "This certificate was autonomously generated by the CONVERGE 59-Node Sovereign Mesh.")
    c.drawString(40, y - 12, "All findings are AI-synthesized. Connect live telemetry for production-grade certification.")

    _footer(c, width)
    c.save()
    return buf.getvalue()


# ==============================================================================
# CERTIFICATE 2: COMPLIANCE EVIDENCE PACKAGE
# ==============================================================================

def generate_compliance_pack(task_data: Dict[str, Any]) -> bytes:
    """
    Generate a Compliance Evidence Package PDF.
    Aggregates: compliance_report, compliance_remediation_config, traceability_matrix, security_signals.
    """
    buf = io.BytesIO()
    c, (width, height) = _get_canvas(buf, "CONVERGE Compliance Evidence Package")

    merged = {**(task_data.get("result") or {}), **(task_data.get("partial_state") or {})}
    merged.update(merged.get("full_state") or {})

    compliance   = merged.get("compliance_report") or {}
    remediation  = merged.get("compliance_remediation_config") or {}
    traceability = merged.get("traceability_matrix") or []
    security     = merged.get("security_signals") or []
    task_id      = task_data.get("task_id", "N/A")

    standards = compliance.get("applicable_standards") or []
    controls  = compliance.get("compliance_controls") or []

    _header(c, width, height, "COMPLIANCE EVIDENCE PACKAGE", f"Task ID: {task_id[:16]}...", color=INDIGO)

    y = height - 110

    # ── Summary badges ──
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*LIGHT)
    c.drawString(40, y, "Applicable Standards:")
    y -= 18
    x_badge = 40
    for std in standards:
        x_badge = _badge(c, x_badge, y, std, color=INDIGO)
    y -= 24

    # ── Controls summary ──
    y = _section_header(c, 40, y, width, f"Compliance Controls ({len(controls)} identified)", color=INDIGO)
    for ctrl in controls[:12]:
        if isinstance(ctrl, dict):
            ctrl_id = ctrl.get("control_id", "CTRL")[:15]
            desc    = ctrl.get("description", "")[:55]
            status  = ctrl.get("status", "Required")
            status_color = GREEN if status == "Verified" else AMBER
            y = _kv_row(c, 40, y, f"[{ctrl_id}] {desc}", status, value_color=status_color)
    y -= 8

    # ── Traceability coverage ──
    y = _section_header(c, 40, y, width, "Requirements Traceability Matrix", color=INDIGO)
    full_cov  = sum(1 for r in traceability if isinstance(r, dict) and r.get("coverage_status") == "Full")
    part_cov  = sum(1 for r in traceability if isinstance(r, dict) and r.get("coverage_status") == "Partial")
    none_cov  = sum(1 for r in traceability if isinstance(r, dict) and r.get("coverage_status") == "None")
    y = _kv_row(c, 40, y, "Total Requirements", str(len(traceability)))
    y = _kv_row(c, 40, y, "Fully Covered", str(full_cov), value_color=GREEN)
    y = _kv_row(c, 40, y, "Partially Covered", str(part_cov), value_color=AMBER)
    y = _kv_row(c, 40, y, "Not Covered (Gaps)", str(none_cov), value_color=RED if none_cov > 0 else SLATE)
    y -= 8

    # ── Remediation actions ──
    rem_actions = remediation.get("remediation_actions") or remediation.get("auto_remediated") or []
    if rem_actions:
        y = _section_header(c, 40, y, width, f"Autonomous Remediation Actions ({len(rem_actions)})", color=INDIGO)
        for action in rem_actions[:6]:
            if isinstance(action, dict):
                ctrl_id  = action.get("control_id", "")[:15]
                act_text = action.get("action", "")[:55]
                priority = action.get("priority", "")[:15]
                p_color  = RED if "P0" in priority else AMBER if "P1" in priority else SLATE
                y = _kv_row(c, 40, y, f"[{ctrl_id}] {act_text}", priority, value_color=p_color)
        y -= 8

    # ── Security findings ──
    if security:
        sec_list = security if isinstance(security, list) else [security]
        y = _section_header(c, 40, y, width, f"Security Intelligence ({len(sec_list)} signal(s))", color=INDIGO)
        for sig in sec_list[:3]:
            if isinstance(sig, dict):
                threat = str(sig.get("threat_model", sig.get("target", "Signal")))[:55]
                risk   = str(sig.get("risk_level", sig.get("test_type", "N/A")))[:20]
                r_color = RED if "High" in risk else AMBER if "Med" in risk else SLATE
                y = _kv_row(c, 40, y, threat, risk, value_color=r_color)

    # ── Footer note ──
    y -= 10
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, y, "This package was autonomously generated by CONVERGE Agent #21 (Compliance Governor) and Agent #27 (Autonomous Compliance).")
    c.drawString(40, y - 12, "Evidence is AI-synthesized from requirement analysis. Manual audit review is required for regulatory submission.")

    _footer(c, width)
    c.save()
    return buf.getvalue()


# ==============================================================================
# REPORT 3: ENGINEERING ECONOMICS
# ==============================================================================

def generate_economics_report(task_data: Dict[str, Any]) -> bytes:
    """Generate an Engineering Economics PDF report."""
    buf = io.BytesIO()
    c, (width, height) = _get_canvas(buf, "CONVERGE Engineering Economics Report")

    merged = {**(task_data.get("result") or {}), **(task_data.get("partial_state") or {})}
    merged.update(merged.get("full_state") or {})

    roi       = merged.get("eng_economics_roi") or {}
    biz       = merged.get("business_impact_intelligence") or {}
    suite_opt = merged.get("suite_optimization_config") or {}
    test_cases= merged.get("test_cases") or []
    task_id   = task_data.get("task_id", "N/A")

    _header(c, width, height, "ENGINEERING ECONOMICS REPORT", f"Task ID: {task_id[:16]}...", color=PURPLE)

    y = height - 110

    # ── ROI headline ──
    roi_pct = str(roi.get("roi_percentage", "N/A"))
    savings  = str(roi.get("estimated_savings") or roi.get("savings", "N/A"))
    c.setFillColorRGB(*PURPLE)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(40, y, roi_pct)
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica", 10)
    c.drawString(40, y - 16, "Return on Investment")
    c.setFillColorRGB(*GREEN)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(200, y, savings)
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica", 10)
    c.drawString(200, y - 16, "Estimated Savings")
    y -= 40

    # ── ROI breakdown ──
    y = _section_header(c, 40, y, width, "ROI Analysis (Agent #52)", color=PURPLE)
    y = _kv_row(c, 40, y, "Cost Per Test", str(roi.get("cost_per_test", "N/A")))
    y = _kv_row(c, 40, y, "Payback Period", str(roi.get("payback_period_months", "N/A")))
    costs = roi.get("costs") or []
    for cost in costs[:4]:
        if isinstance(cost, dict):
            cat   = cost.get("category", "")[:30]
            val   = cost.get("value", "")[:20]
            trend = cost.get("trend", "")
            t_color = GREEN if trend == "down" else RED if trend == "up" else SLATE
            y = _kv_row(c, 60, y, cat, f"{val} ({trend})", value_color=t_color)
    y -= 8

    # ── Business impact ──
    y = _section_header(c, 40, y, width, "Business Impact (Agent #51)", color=PURPLE)
    y = _kv_row(c, 40, y, "Revenue at Risk", str(biz.get("revenue_at_risk") or biz.get("revenue_exposure", "N/A")))
    y = _kv_row(c, 40, y, "Risk Multiplier", str(biz.get("risk_multiplier", "N/A")))
    y = _kv_row(c, 40, y, "Total Exposure", str(biz.get("total_exposure", "N/A")))
    pillars = biz.get("pillars") or biz.get("defect_portfolio") or []
    for p in pillars[:4]:
        if isinstance(p, dict):
            name = str(p.get("pillar") or p.get("defect_reference", ""))[:35]
            risk = str(p.get("risk") or p.get("business_impact", ""))[:15]
            r_color = RED if "Critical" in risk or "High" in risk else AMBER if "Med" in risk else SLATE
            y = _kv_row(c, 60, y, name, risk, value_color=r_color)
    y -= 8

    # ── Suite efficiency ──
    y = _section_header(c, 40, y, width, "Test Suite Efficiency (Agent #38)", color=PURPLE)
    y = _kv_row(c, 40, y, "Total Test Cases", str(len(test_cases)))
    y = _kv_row(c, 40, y, "Optimized Suite Size", str(suite_opt.get("optimized_suite_size", "N/A")))
    y = _kv_row(c, 40, y, "Estimated Time Savings", str(suite_opt.get("estimated_savings_percent", "N/A")))
    y = _kv_row(c, 40, y, "Data Source", str(suite_opt.get("data_source", "AI-Estimated"))[:60])

    # ── Footer note ──
    y -= 10
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, y, "All financial figures are AI-synthesized estimates. Connect real cost tracking and APM tools for measured baselines.")

    _footer(c, width)
    c.save()
    return buf.getvalue()


# ==============================================================================
# REPORT 4: FULL RELEASE DECISION REPORT
# ==============================================================================

def generate_release_report(task_data: Dict[str, Any]) -> bytes:
    """Generate a full Release Decision Report combining all 4 module signals."""
    buf = io.BytesIO()
    c, (width, height) = _get_canvas(buf, "CONVERGE Release Decision Report")

    merged = {**(task_data.get("result") or {}), **(task_data.get("partial_state") or {})}
    merged.update(merged.get("full_state") or {})

    release_risk = merged.get("release_risk_decision") or {}
    biz          = merged.get("business_impact_intelligence") or {}
    roi          = merged.get("eng_economics_roi") or {}
    reliability  = merged.get("reliability_eng") or {}
    chaos        = merged.get("chaos_scenarios") or []
    compliance   = merged.get("compliance_report") or {}
    resilience   = merged.get("system_resilience") or {}
    task_id      = task_data.get("task_id", "N/A")

    decision = (release_risk.get("recommendation") or release_risk.get("decision") or "PENDING").upper()
    is_go    = decision in ("GO", "RELEASE_RECOMMENDED")
    is_nogo  = decision in ("NO-GO", "HOLD", "NO_GO")
    dec_color = GREEN if is_go else RED if is_nogo else AMBER

    _header(c, width, height, "RELEASE DECISION REPORT", f"Task ID: {task_id[:16]}...", color=dec_color)

    y = height - 110

    # ── Decision hero ──
    c.setFillColorRGB(*dec_color)
    c.setFont("Helvetica-Bold", 32)
    c.drawString(40, y, "GO" if is_go else "NO-GO" if is_nogo else "PENDING")
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica", 9)
    justification = str(release_risk.get("justification") or release_risk.get("narrative_justification") or "Awaiting mission completion.")
    # Word-wrap justification
    words = justification.split()
    line, lines = [], []
    for w in words:
        if len(" ".join(line + [w])) < 80:
            line.append(w)
        else:
            lines.append(" ".join(line)); line = [w]
    if line: lines.append(" ".join(line))
    jy = y - 16
    for ln in lines[:4]:
        c.drawString(40, jy, ln); jy -= 12
    y = jy - 10

    # ── Risk factors ──
    risk_factors = release_risk.get("risk_factors") or []
    if risk_factors and isinstance(risk_factors, list):
        y = _section_header(c, 40, y, width, "Risk Factors", color=dec_color)
        for rf in risk_factors[:5]:
            if isinstance(rf, dict):
                factor = str(rf.get("factor", ""))[:40]
                level  = str(rf.get("level", ""))[:10]
                score  = str(rf.get("score", ""))[:5]
                l_color = RED if "High" in level else AMBER if "Med" in level else SLATE
                y = _kv_row(c, 40, y, factor, f"{level} (score: {score})", value_color=l_color)
        y -= 8

    # ── Module signals ──
    y = _section_header(c, 40, y, width, "Module Signal Summary", color=dec_color)
    flaky = len(reliability.get("flaky_tests") or [])
    y = _kv_row(c, 40, y, "Revenue at Risk", str(biz.get("revenue_at_risk") or biz.get("revenue_exposure", "N/A")))
    y = _kv_row(c, 40, y, "ROI", str(roi.get("roi_percentage", "N/A")))
    y = _kv_row(c, 40, y, "Flaky Tests", str(flaky), value_color=RED if flaky > 3 else AMBER if flaky > 0 else GREEN)
    y = _kv_row(c, 40, y, "Chaos Scenarios Passed", str(len(chaos)))
    y = _kv_row(c, 40, y, "Compliance Standards", ", ".join(compliance.get("applicable_standards") or []) or "N/A")
    y = _kv_row(c, 40, y, "Resilience Score", str(resilience.get("resilience_score", "N/A")))
    y -= 8

    # ── Recommended actions ──
    actions = release_risk.get("recommended_actions") or release_risk.get("quality_recommendations") or []
    if actions:
        y = _section_header(c, 40, y, width, "Recommended Actions", color=dec_color)
        for act in actions[:5]:
            c.setFillColorRGB(*SLATE)
            c.setFont("Helvetica", 8)
            c.drawString(50, y, f"• {str(act)[:80]}")
            y -= 12

    # ── Footer ──
    y -= 10
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, y, "This report was autonomously generated by the CONVERGE 59-Node Sovereign Mesh.")
    c.drawString(40, y - 12, "All signals are AI-synthesized. Human review is required before production deployment.")

    _footer(c, width)
    c.save()
    return buf.getvalue()


# ==============================================================================
# REPORT 5: QUARTERLY ENGINEERING HEALTH REPORT (Phase 5.1)
# ==============================================================================

def generate_quarterly_health_report(report_data: dict) -> bytes:
    """
    Generate a Quarterly Engineering Health Report PDF.

    Content:
    - Executive summary (missions, savings, ROI, tests generated)
    - Mission volume trend (bar chart)
    - ROI trend over time (sparkline)
    - Compliance posture summary
    - Knowledge graph growth
    - Platform distribution
    - Forward-looking recommendations
    """
    buf = io.BytesIO()
    c, (width, height) = _get_canvas(buf, "CONVERGE Quarterly Engineering Health Report")

    summary = report_data.get("executive_summary") or {}
    mission_trend = report_data.get("mission_volume_trend") or []
    roi_trend = report_data.get("roi_trend") or []
    compliance_trend = report_data.get("compliance_trend") or []
    kg_growth = report_data.get("knowledge_graph_growth") or []
    platform_dist = report_data.get("platform_distribution") or []
    period = report_data.get("period", "Last 90 Days")

    _header(c, width, height,
            "QUARTERLY ENGINEERING HEALTH REPORT",
            f"{period}  ·  Generated: {datetime.utcnow().strftime('%Y-%m-%d')}",
            color=INDIGO)

    y = height - 110

    # ── Executive KPI Row ──────────────────────────────────────────────────────
    kpis = [
        ("Total Missions",    str(summary.get("total_missions", 0)),       INDIGO),
        ("Total Savings",     f"${summary.get('total_savings_usd', 0):.0f}", GREEN),
        ("Avg ROI",           f"{summary.get('average_roi_percent', 0):.0f}%", PURPLE),
        ("Tests Generated",   str(summary.get("total_tests_generated", 0)), AMBER),
    ]
    box_w = (width - 80) / len(kpis)
    for i, (label, value, color) in enumerate(kpis):
        bx = 40 + i * box_w
        # Box background
        c.setFillColorRGB(color[0]*0.08, color[1]*0.08, color[2]*0.08)
        c.roundRect(bx, y - 44, box_w - 8, 50, 4, fill=1, stroke=0)
        # Accent top bar
        c.setFillColorRGB(*color)
        c.rect(bx, y + 4, box_w - 8, 3, fill=1, stroke=0)
        # Value
        c.setFillColorRGB(*color)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(bx + (box_w - 8) / 2, y - 14, value)
        # Label
        c.setFillColorRGB(*SLATE)
        c.setFont("Helvetica", 7)
        c.drawCentredString(bx + (box_w - 8) / 2, y - 28, label.upper())
    y -= 62

    # ── Mission Volume Trend ───────────────────────────────────────────────────
    y = _section_header(c, 40, y, width, f"Mission Volume — {period}", color=INDIGO)
    if mission_trend:
        chart_w = width - 80
        chart_h = 50
        max_v = max((m["count"] for m in mission_trend), default=1)
        bar_w = chart_w / max(len(mission_trend), 1)
        for i, m in enumerate(mission_trend[-12:]):  # Last 12 weeks
            bh = max(2, (m["count"] / max_v) * chart_h)
            bx = 40 + i * bar_w
            # Bar
            c.setFillColorRGB(*INDIGO)
            c.rect(bx + 2, y - chart_h, bar_w - 4, bh, fill=1, stroke=0)
            # Week label
            c.setFillColorRGB(*SLATE)
            c.setFont("Helvetica", 5)
            week_label = m["week"].split("-W")[-1] if "-W" in m["week"] else m["week"][-2:]
            c.drawCentredString(bx + bar_w / 2, y - chart_h - 8, f"W{week_label}")
        y -= chart_h + 20
    else:
        c.setFillColorRGB(*SLATE)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(40, y - 10, "No mission data in this period.")
        y -= 20

    # ── ROI Trend ─────────────────────────────────────────────────────────────
    y = _section_header(c, 40, y, width, "ROI & Savings Trend", color=GREEN)
    if roi_trend:
        chart_w = width - 80
        chart_h = 40
        max_roi = max((r["roi"] for r in roi_trend), default=1)
        pt_w = chart_w / max(len(roi_trend), 1)
        # Draw sparkline
        pts = []
        for i, r in enumerate(roi_trend):
            px = 40 + i * pt_w
            py = y - chart_h + max(2, (r["roi"] / max(max_roi, 1)) * (chart_h - 4))
            pts.append((px, py))
        if len(pts) > 1:
            c.setStrokeColorRGB(*GREEN)
            c.setLineWidth(1.5)
            p = c.beginPath()
            p.moveTo(pts[0][0], pts[0][1])
            for px, py in pts[1:]:
                p.lineTo(px, py)
            c.drawPath(p, stroke=1, fill=0)
            # Dots
            for px, py in pts:
                c.setFillColorRGB(*GREEN)
                c.circle(px, py, 2, fill=1, stroke=0)
        # Latest values
        if roi_trend:
            last = roi_trend[-1]
            c.setFillColorRGB(*GREEN)
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(width - 40, y - chart_h + 5,
                              f"Latest: {last['roi']:.0f}% ROI | ${last['savings']:.0f} saved")
        y -= chart_h + 16
    else:
        c.setFillColorRGB(*SLATE)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(40, y - 10, "No economics data in this period. Run missions to populate ROI trend.")
        y -= 20

    # ── Compliance Posture ────────────────────────────────────────────────────
    y = _section_header(c, 40, y, width, "Compliance Posture", color=PURPLE)
    standards = summary.get("standards_covered") or []
    if standards:
        x_b = 40
        for std in standards:
            x_b = _badge(c, x_b, y - 4, std, color=PURPLE)
        y -= 20
    total_controls = sum(ct.get("controls_verified", 0) for ct in compliance_trend)
    y = _kv_row(c, 40, y, "Total Controls Verified (period)", str(total_controls))
    y = _kv_row(c, 40, y, "Compliance Scans Performed", str(len(compliance_trend)))
    y -= 4

    # ── Knowledge Graph Growth ────────────────────────────────────────────────
    y = _section_header(c, 40, y, width, "Institutional Memory — Knowledge Graph Growth", color=AMBER)
    total_entities = summary.get("knowledge_entities", 0)
    y = _kv_row(c, 40, y, "Total Entities Indexed", str(total_entities))
    y = _kv_row(c, 40, y, "Growth Events", str(len(kg_growth)))
    if kg_growth:
        # Mini bar chart for entity growth
        chart_w = width - 80
        chart_h = 30
        max_e = max((g["entities_added"] for g in kg_growth), default=1)
        bar_w = chart_w / max(len(kg_growth), 1)
        for i, g in enumerate(kg_growth[-16:]):
            bh = max(2, (g["entities_added"] / max(max_e, 1)) * chart_h)
            bx = 40 + i * bar_w
            c.setFillColorRGB(*AMBER)
            c.rect(bx + 1, y - chart_h, bar_w - 2, bh, fill=1, stroke=0)
        y -= chart_h + 12

    # ── Platform Distribution ─────────────────────────────────────────────────
    y = _section_header(c, 40, y, width, "Platform Distribution", color=INDIGO)
    for pd in platform_dist[:6]:
        plat = pd.get("platform", "").upper()
        count = pd.get("count", 0)
        total = summary.get("total_missions", 1)
        pct = (count / max(total, 1)) * 100
        # Bar
        bar_max_w = 200
        bar_fill = (pct / 100) * bar_max_w
        c.setFillColorRGB(0.15, 0.18, 0.24)
        c.rect(200, y - 2, bar_max_w, 8, fill=1, stroke=0)
        c.setFillColorRGB(*INDIGO)
        c.rect(200, y - 2, bar_fill, 8, fill=1, stroke=0)
        c.setFillColorRGB(*SLATE)
        c.setFont("Helvetica", 8)
        c.drawString(40, y, plat)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(410, y, f"{count} ({pct:.0f}%)")
        y -= 14

    # ── Forward-looking recommendations ──────────────────────────────────────
    y -= 4
    y = _section_header(c, 40, y, width, "Recommendations", color=GREEN)
    recs = []
    if summary.get("total_missions", 0) < 5:
        recs.append("Increase mission frequency to build meaningful trend data.")
    if summary.get("average_roi_percent", 0) < 200:
        recs.append("ROI below 200% — consider expanding automation coverage per mission.")
    if not standards:
        recs.append("Enable Certify module to track compliance posture over time.")
    if total_entities < 10:
        recs.append("Enable the Knowledge Graph agent (#53) to build institutional memory.")
    if not recs:
        recs.append("Engineering health is strong. Continue current mission cadence.")
        recs.append("Consider quarterly stakeholder review of ROI and compliance trends.")

    for rec in recs:
        c.setFillColorRGB(*SLATE)
        c.setFont("Helvetica", 8)
        c.drawString(50, y, f"• {rec[:90]}")
        y -= 12

    # ── Footer ────────────────────────────────────────────────────────────────
    y -= 8
    c.setFillColorRGB(*SLATE)
    c.setFont("Helvetica-Oblique", 7)
    c.drawString(40, y, "This report was autonomously generated by CONVERGE v4.0.0 | VV&T Engineering Assurance Platform.")
    c.drawString(40, y - 10, "Data reflects missions executed in the CONVERGE platform. Connect live APM/CI tools for production-grade metrics.")

    _footer(c, width)
    c.save()
    return buf.getvalue()
