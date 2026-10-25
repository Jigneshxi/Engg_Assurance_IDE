import logging
import re

with open('backend/api/routes/tasks.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if line.startswith('def run_agent_workflow_logic'):
        start_idx = i
        break

if start_idx != -1:
    new_lines = lines[:start_idx]
    
    new_func = '''async def run_agent_workflow_logic(task_id: str, req: "GenerateRequest", parent_task_id: str = None, mission_id: int = None):
    import logging
    logger = logging.getLogger(__name__)
    from backend.core.database import SessionLocal
    from backend.core.database import GenerationTask
    from backend.core.mission_controller import mission_controller, MissionStatus
    from backend.agents.graphs.phase1_graph import build_phase1_graph

    str_mission_id = str(mission_id) if mission_id else task_id
    
    current_status = await mission_controller.get_status(str_mission_id)
    
    if current_status == MissionStatus.CREATED:
        await mission_controller.transition_status(str_mission_id, MissionStatus.PHASE1_RUNNING)
        phase1_graph = build_phase1_graph()
        
        # Mark legacy task as PROCESSING
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
            if task:
                task.status = "PROCESSING"
                db.commit()

        try:
            await phase1_graph.ainvoke(
                {
                    "prd_input": req.context or "",
                    "mission_id": str_mission_id,
                },
                config={"configurable": {
                    "thread_id": mission_controller.get_thread_id(str_mission_id, 1)
                }}
            )
            
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "COMPLETED"
                    db.commit()
                    
        except Exception as e:
            logger.error(f"[WORKFLOW] Phase 1 Execution failed: {e}")
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "FAILED"
                    task.error = str(e)
                    db.commit()
    else:
        logger.error(f"[WORKFLOW] Cannot start Phase 1 — mission {str_mission_id} already in status {current_status}")
        raise RuntimeError(f"Mission {str_mission_id} already started — use phase-specific endpoints")
'''
    new_lines.append(new_func)
    
    with open('backend/api/routes/tasks.py', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print('Replaced run_agent_workflow_logic successfully')
