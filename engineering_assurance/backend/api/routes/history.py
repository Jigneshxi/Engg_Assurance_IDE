"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - AUDIT HISTORY ROUTER
================================================================================
This module manages the persistence and retrieval of historical generation 
artifacts, ensuring long-term traceability for institutional auditing.
"""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.core.database import get_db, ProjectHistory, GenerationTask, TaskEconomics

router = APIRouter(prefix="/api/history", tags=["Audit Traceability"])
logger = logging.getLogger(__name__)

@router.get("/list")
def get_historical_records(db: Session = Depends(get_db)):
    """
    Action: Retrieves all previously generated test plan artifacts.
    Logic: Sorted by creation date descending to show the most recent plans first.
    """
    try:
        records = db.query(ProjectHistory).order_by(ProjectHistory.created_at.desc()).all()
        return [{
            "id": r.id,
            "summary": r.summary,
            "platform": r.platform,
            "ticket_id": r.ticket_id,
            "download_url": r.download_url,
            "created_at": r.created_at.isoformat()
        } for r in records]
    except Exception as e:
        logger.error(f"[HISTORY] Retrieval failure: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch historical audit logs.")

@router.get("/detail/{record_id}")
def get_record_detail(record_id: int, db: Session = Depends(get_db)):
    """Fetches full JSON payload and raw requirements for a specific past run."""
    record = db.query(ProjectHistory).filter(ProjectHistory.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Audit record not found.")
    return {
        "id": record.id,
        "summary": record.summary,
        "input_data": record.raw_requirement_data,
        "plan_payload": record.generated_plan_payload,
        "markdown": record.markdown_result,
        "download_url": record.download_url
    }

@router.delete("/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    """Hard deletes a generated artifact from the archive."""
    record = db.query(ProjectHistory).filter(ProjectHistory.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Audit record not found.")
    try:
        db.delete(record)
        db.commit()
        return {"success": True, "message": "Artifact permanently deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"[HISTORY] Deletion failure: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete artifact.")


# ==============================================================================
# PHASE 5.1 — QUARTERLY ENGINEERING HEALTH REPORT
# ==============================================================================

@router.get("/quarterly-report")
def get_quarterly_report_data(db: Session = Depends(get_db)):
    """
    QUARTERLY ENGINEERING HEALTH REPORT DATA (Phase 5.1)

    Aggregates cross-mission analytics for the last 90 days:
    - Mission volume trend (weekly)
    - ROI trend from TaskEconomics
    - Compliance posture over time
    - Knowledge graph growth
    - Platform distribution
    - Executive summary metrics

    Powers the "Quarterly Report" tab and "Export Health Report" button.
    """
    try:
        ninety_days_ago = datetime.utcnow() - timedelta(days=90)

        # ── Mission volume ──────────────────────────────────────────────────
        records = db.query(ProjectHistory).filter(
            ProjectHistory.created_at >= ninety_days_ago
        ).order_by(ProjectHistory.created_at.asc()).all()

        # Group by week
        weekly_missions: dict = {}
        for r in records:
            week = r.created_at.strftime("%Y-W%W")
            weekly_missions[week] = weekly_missions.get(week, 0) + 1

        # ── Economics trend ─────────────────────────────────────────────────
        economics_records = db.query(TaskEconomics).filter(
            TaskEconomics.created_at >= ninety_days_ago
        ).order_by(TaskEconomics.created_at.asc()).all()

        roi_trend = [
            {
                "date": e.created_at.strftime("%Y-%m-%d"),
                "roi": round(e.automation_roi_percentage, 1),
                "savings": round(e.estimated_savings_usd, 2),
                "tests": e.test_count,
                "cost_per_test": round(e.cost_per_test, 4)
            }
            for e in economics_records
        ]

        total_savings = sum(e.estimated_savings_usd for e in economics_records)
        avg_roi = (
            sum(e.automation_roi_percentage for e in economics_records) / len(economics_records)
            if economics_records else 0
        )
        total_tests_generated = sum(e.test_count for e in economics_records)

        # ── Compliance posture ──────────────────────────────────────────────
        # Pull from completed tasks that have compliance data
        tasks_with_compliance = db.query(GenerationTask).filter(
            GenerationTask.status == "COMPLETED",
            GenerationTask.created_at >= ninety_days_ago
        ).order_by(GenerationTask.created_at.asc()).all()

        compliance_trend = []
        standards_seen: set = set()
        for task in tasks_with_compliance:
            merged = {**(task.result or {}), **(task.partial_state or {})}
            compliance = merged.get("compliance_report") or {}
            standards = compliance.get("applicable_standards") or []
            controls = compliance.get("compliance_controls") or []
            if standards or controls:
                standards_seen.update(standards)
                compliance_trend.append({
                    "date": task.created_at.strftime("%Y-%m-%d"),
                    "controls_verified": len(controls),
                    "standards": standards
                })

        # ── Knowledge graph growth ──────────────────────────────────────────
        kg_growth = []
        cumulative_entities = 0
        for task in tasks_with_compliance:
            merged = {**(task.result or {}), **(task.partial_state or {})}
            kg = merged.get("eng_knowledge_graph") or {}
            entities = kg.get("entities") or []
            if entities:
                cumulative_entities += len(entities)
                kg_growth.append({
                    "date": task.created_at.strftime("%Y-%m-%d"),
                    "new_entities": len(entities),
                    "cumulative": cumulative_entities,
                    "entity_types": list({e.get("type", "unknown") for e in entities if isinstance(e, dict)})
                })

        # ── Platform distribution ───────────────────────────────────────────
        platform_counts: dict = {}
        for r in records:
            p = r.platform or "multi"
            platform_counts[p] = platform_counts.get(p, 0) + 1

        # ── Executive summary ───────────────────────────────────────────────
        total_missions = len(records)
        missions_this_month = sum(
            1 for r in records
            if r.created_at >= datetime.utcnow() - timedelta(days=30)
        )

        return {
            "period": "Last 90 Days",
            "generated_at": datetime.utcnow().isoformat(),
            "executive_summary": {
                "total_missions": total_missions,
                "missions_this_month": missions_this_month,
                "total_savings_usd": round(total_savings, 2),
                "average_roi_percent": round(avg_roi, 1),
                "total_tests_generated": total_tests_generated,
                "standards_covered": sorted(list(standards_seen)),
                "platforms_used": list(platform_counts.keys()),
                "knowledge_entities": cumulative_entities
            },
            "mission_volume_trend": [
                {"week": k, "count": v}
                for k, v in sorted(weekly_missions.items())
            ],
            "roi_trend": roi_trend,
            "compliance_trend": compliance_trend,
            "knowledge_graph_growth": kg_growth,
            "platform_distribution": [
                {"platform": k, "count": v}
                for k, v in sorted(platform_counts.items(), key=lambda x: -x[1])
            ]
        }

    except Exception as e:
        logger.error(f"[QUARTERLY-REPORT] Data aggregation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Quarterly report generation failed: {str(e)}")


@router.get("/quarterly-report/export")
def export_quarterly_health_report(db: Session = Depends(get_db)):
    """
    EXPORT QUARTERLY HEALTH REPORT AS PDF (Phase 5.1)

    Generates a professional PDF executive summary of the last 90 days
    including trend charts, ROI analysis, compliance posture, and
    knowledge graph growth.
    """
    from backend.core.pdf_export import generate_quarterly_health_report

    try:
        # Get the data
        report_data = get_quarterly_report_data(db)

        # Generate PDF
        pdf_bytes = generate_quarterly_health_report(report_data)
        filename = f"CONVERGE_Quarterly_Health_Report_{datetime.utcnow().strftime('%Y%m%d')}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[QUARTERLY-EXPORT] PDF generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")


@router.get("/knowledge-graph-growth")
def get_knowledge_graph_growth(db: Session = Depends(get_db)):
    """
    KNOWLEDGE GRAPH GROWTH MAP (Phase 5.2)

    Returns entity growth data across all missions for the animated
    Knowledge Graph Growth Map visualization.
    """
    try:
        tasks = db.query(GenerationTask).filter(
            GenerationTask.status == "COMPLETED"
        ).order_by(GenerationTask.created_at.asc()).all()

        nodes = []
        links = []
        node_id_map: dict = {}
        cumulative = 0

        for task in tasks:
            merged = {**(task.result or {}), **(task.partial_state or {})}
            kg = merged.get("eng_knowledge_graph") or {}
            entities = kg.get("entities") or []

            for entity in entities:
                if not isinstance(entity, dict):
                    continue
                name = entity.get("name", "")
                etype = entity.get("type", "concept")
                relations = entity.get("relations", 0)

                if name and name not in node_id_map:
                    node_id = len(nodes)
                    node_id_map[name] = node_id
                    cumulative += 1
                    nodes.append({
                        "id": node_id,
                        "name": name,
                        "type": etype,
                        "relations": relations,
                        "added_date": task.created_at.strftime("%Y-%m-%d"),
                        "task_id": task.task_id[:8]
                    })

        # Build links from relation counts (approximate)
        for node in nodes[:50]:  # Cap for performance
            if node["relations"] > 0:
                # Link to nearest nodes of same type
                same_type = [n for n in nodes if n["type"] == node["type"] and n["id"] != node["id"]]
                for target in same_type[:min(node["relations"], 3)]:
                    links.append({"source": node["id"], "target": target["id"]})

        return {
            "nodes": nodes[:100],  # Cap at 100 for UI performance
            "links": links[:200],
            "total_entities": len(nodes),
            "entity_types": list({n["type"] for n in nodes}),
            "growth_timeline": [
                {
                    "date": task.created_at.strftime("%Y-%m-%d"),
                    "entities_added": len([
                        e for e in (
                            {**(task.result or {}), **(task.partial_state or {})}.get("eng_knowledge_graph") or {}
                        ).get("entities") or []
                        if isinstance(e, dict)
                    ])
                }
                for task in tasks
                if ({**(task.result or {}), **(task.partial_state or {})}.get("eng_knowledge_graph") or {}).get("entities")
            ]
        }

    except Exception as e:
        logger.error(f"[KG-GROWTH] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Knowledge graph growth data failed: {str(e)}")
