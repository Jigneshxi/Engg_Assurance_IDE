import sys
sys.path.insert(0, '.')
from backend.core.database import SessionLocal, GenerationTask
from backend.core.mission_models import Mission

with SessionLocal() as db:
    # Check mission 138 task logs
    task = db.query(GenerationTask).filter(GenerationTask.mission_id == 138).first()
    if task:
        print(f'Task {task.task_id} status={task.status} error={task.error}')
        if task.logs:
            for log in task.logs[-30:]:
                print(f"  [{log.get('agent','?')}] {log.get('message','')[:120]}")
    
    # Also check mission 138 status history
    m = db.query(Mission).filter(Mission.id == 138).first()
    if m:
        print(f"\nMission 138 status: {m.mission_status}")
        print(f"Mission 138 phase_outputs keys: {list(m.phase_outputs.keys()) if m.phase_outputs else None}")
