"""
================================================================================
CONVERGE PHASE 1.1 - ENGINEERING ECONOMICS ENGINE
================================================================================
PURPOSE: Transform technical metrics into CFO-ready financial intelligence.

This module implements the Engineering Economics Dashboard (CFO View) by:
1. Aggregating token/compute costs from InferenceAudit records
2. Calculating cost-per-test and automation ROI
3. Estimating manual effort savings and payback periods
4. Providing dollar-based justification for AI-driven testing

Architecture: Real-time cost tracking + post-mission financial analysis.
"""

import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.core.database import InferenceAudit, TaskEconomics, GenerationTask

logger = logging.getLogger(__name__)

# --- COST CONSTANTS (Industry Benchmarks) ---
# These can be moved to SystemConfig for runtime adjustment
MANUAL_TEST_HOUR_COST_USD = 75.0  # Average QA engineer hourly rate
MANUAL_TEST_MINUTES_PER_CASE = 15  # Time to manually write one test case
AUTOMATION_MAINTENANCE_FACTOR = 0.15  # 15% ongoing maintenance cost
COMPUTE_COST_PER_HOUR_USD = 0.50  # Estimated server/cloud compute cost


def calculate_task_economics(task_id: str, db: Session) -> Dict[str, Any]:
    """
    CORE ECONOMICS CALCULATOR
    
    Aggregates all inference costs for a task and computes:
    - Total token cost (from InferenceAudit)
    - Total compute cost (estimated from latency)
    - Cost per test generated
    - Manual effort savings (hours * hourly rate)
    - Automation ROI percentage
    - Payback period (days until automation offsets cost)
    
    Returns a comprehensive financial report suitable for CFO presentation.
    """
    try:
        # Step 1: Aggregate inference costs
        audit_summary = db.query(
            func.sum(InferenceAudit.cost_usd).label('total_token_cost'),
            func.sum(InferenceAudit.tokens_used).label('total_tokens'),
            func.sum(InferenceAudit.latency_ms).label('total_latency_ms'),
            func.count(InferenceAudit.id).label('inference_count')
        ).filter(
            InferenceAudit.task_id == task_id,
            InferenceAudit.status == 'success'
        ).first()
        
        total_token_cost = float(audit_summary.total_token_cost or 0.0)
        total_latency_ms = int(audit_summary.total_latency_ms or 0)
        total_tokens = int(audit_summary.total_tokens or 0)
        inference_count = int(audit_summary.inference_count or 0)
        
        # Step 2: Estimate compute cost from latency
        # Formula: (total_latency_ms / 3600000) * COMPUTE_COST_PER_HOUR_USD
        total_compute_cost = (total_latency_ms / 3_600_000) * COMPUTE_COST_PER_HOUR_USD
        
        total_cost = total_token_cost + total_compute_cost
        
        # Step 3: Extract test metrics from task result
        task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
        if not task:
            logger.warning(f"[ECONOMICS] Task {task_id} not found in database.")
            return _empty_economics_report(task_id)
        
        merged_state = {**(task.result or {}), **(task.partial_state or {})}
        merged_state.update(merged_state.get("full_state") or {})
        
        # Extract test counts from various agent outputs
        test_cases = merged_state.get("test_cases") or []
        automation_scripts = merged_state.get("automation_scripts") or []
        api_tests = merged_state.get("api_test_suite") or []
        
        test_count = len(test_cases)
        automation_count = len(automation_scripts) + len(api_tests)
        
        # Step 4: Calculate manual effort savings
        # Assumption: Each test case would take MANUAL_TEST_MINUTES_PER_CASE to write manually
        manual_hours_saved = (test_count * MANUAL_TEST_MINUTES_PER_CASE) / 60.0
        manual_cost_avoided = manual_hours_saved * MANUAL_TEST_HOUR_COST_USD
        
        # Step 5: Calculate ROI
        # ROI = ((Savings - Cost) / Cost) * 100
        net_savings = manual_cost_avoided - total_cost
        roi_percentage = (net_savings / total_cost * 100) if total_cost > 0 else 0.0
        
        # Step 6: Calculate payback period
        # Payback = Cost / (Daily Savings)
        # Assumption: Tests run daily, saving manual_cost_avoided per sprint (14 days)
        daily_savings = manual_cost_avoided / 14.0  # Amortized over 2-week sprint
        payback_days = (total_cost / daily_savings) if daily_savings > 0 else 999.0
        
        # Step 7: Cost per test
        cost_per_test = (total_cost / test_count) if test_count > 0 else 0.0
        
        # Step 8: Persist to TaskEconomics table
        economics_record = db.query(TaskEconomics).filter(TaskEconomics.task_id == task_id).first()
        if not economics_record:
            economics_record = TaskEconomics(task_id=task_id)
            db.add(economics_record)
        
        economics_record.total_token_cost_usd = round(total_token_cost, 2)
        economics_record.total_compute_cost_usd = round(total_compute_cost, 2)
        economics_record.total_cost_usd = round(total_cost, 2)
        economics_record.test_count = test_count
        economics_record.automation_count = automation_count
        economics_record.manual_test_hours_saved = round(manual_hours_saved, 2)
        economics_record.cost_per_test = round(cost_per_test, 4)
        economics_record.automation_roi_percentage = round(roi_percentage, 2)
        economics_record.payback_period_days = round(payback_days, 1)
        economics_record.estimated_savings_usd = round(net_savings, 2)
        
        db.commit()
        
        logger.info(f"[ECONOMICS] Task {task_id}: ROI={roi_percentage:.1f}%, Savings=${net_savings:.2f}, Tests={test_count}")
        
        return {
            "task_id": task_id,
            "total_cost_usd": round(total_cost, 2),
            "cost_breakdown": {
                "token_cost": round(total_token_cost, 2),
                "compute_cost": round(total_compute_cost, 2),
                "total_tokens": total_tokens,
                "inference_calls": inference_count
            },
            "test_metrics": {
                "test_cases_generated": test_count,
                "automation_scripts": automation_count,
                "manual_hours_saved": round(manual_hours_saved, 2),
                "manual_cost_avoided": round(manual_cost_avoided, 2)
            },
            "roi_analysis": {
                "cost_per_test": round(cost_per_test, 4),
                "roi_percentage": round(roi_percentage, 2),
                "net_savings": round(net_savings, 2),
                "payback_period_days": round(payback_days, 1)
            },
            "cfo_summary": {
                "headline": f"${abs(net_savings):.0f} {'saved' if net_savings > 0 else 'invested'} | {roi_percentage:.0f}% ROI | {payback_days:.0f}-day payback",
                "recommendation": _generate_cfo_recommendation(roi_percentage, payback_days, test_count)
            }
        }
        
    except Exception as e:
        logger.error(f"[ECONOMICS] Calculation failed for task {task_id}: {e}")
        return _empty_economics_report(task_id, error=str(e))


def _generate_cfo_recommendation(roi: float, payback_days: float, test_count: int) -> str:
    """Generate executive-friendly recommendation based on financial metrics."""
    if roi > 500:
        return f"STRONG INVESTMENT: {test_count} tests generated with exceptional {roi:.0f}% ROI. Immediate value delivery."
    elif roi > 200:
        return f"RECOMMENDED: Solid {roi:.0f}% return with {payback_days:.0f}-day payback. Scales well across sprints."
    elif roi > 0:
        return f"POSITIVE: {roi:.0f}% ROI achieved. Consider increasing automation coverage for better returns."
    else:
        return f"INVESTMENT PHASE: Initial setup cost. ROI improves with test reuse across multiple sprints."


def _empty_economics_report(task_id: str, error: Optional[str] = None) -> Dict[str, Any]:
    """Return a safe empty report when calculation fails."""
    return {
        "task_id": task_id,
        "total_cost_usd": 0.0,
        "cost_breakdown": {"token_cost": 0.0, "compute_cost": 0.0, "total_tokens": 0, "inference_calls": 0},
        "test_metrics": {"test_cases_generated": 0, "automation_scripts": 0, "manual_hours_saved": 0.0, "manual_cost_avoided": 0.0},
        "roi_analysis": {"cost_per_test": 0.0, "roi_percentage": 0.0, "net_savings": 0.0, "payback_period_days": 0.0},
        "cfo_summary": {"headline": "Awaiting mission completion", "recommendation": "Run a full mission to generate financial metrics."},
        "error": error
    }


def get_historical_economics_trend(db: Session, limit: int = 10) -> Dict[str, Any]:
    """
    TREND ANALYSIS FOR QUARTERLY REPORTING (Phase 5.1)
    
    Aggregates economics data across multiple tasks to show:
    - Average ROI over time
    - Total savings accumulated
    - Cost efficiency improvements
    - Test generation velocity
    
    Used for executive dashboards and quarterly health reports.
    """
    try:
        recent_tasks = db.query(TaskEconomics).order_by(
            TaskEconomics.created_at.desc()
        ).limit(limit).all()
        
        if not recent_tasks:
            return {
                "trend_available": False,
                "message": "No historical economics data available yet."
            }
        
        total_savings = sum(t.estimated_savings_usd for t in recent_tasks)
        avg_roi = sum(t.automation_roi_percentage for t in recent_tasks) / len(recent_tasks)
        total_tests = sum(t.test_count for t in recent_tasks)
        avg_cost_per_test = sum(t.cost_per_test for t in recent_tasks) / len(recent_tasks)
        
        return {
            "trend_available": True,
            "period": f"Last {len(recent_tasks)} missions",
            "aggregate_metrics": {
                "total_savings_usd": round(total_savings, 2),
                "average_roi_percentage": round(avg_roi, 2),
                "total_tests_generated": total_tests,
                "average_cost_per_test": round(avg_cost_per_test, 4)
            },
            "trend_data": [
                {
                    "task_id": t.task_id[:12],
                    "date": t.created_at.isoformat(),
                    "roi": t.automation_roi_percentage,
                    "savings": t.estimated_savings_usd,
                    "tests": t.test_count
                }
                for t in recent_tasks
            ]
        }
        
    except Exception as e:
        logger.error(f"[ECONOMICS] Trend analysis failed: {e}")
        return {"trend_available": False, "error": str(e)}
