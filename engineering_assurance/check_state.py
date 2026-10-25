import sys
from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
tasks = db.query(GenerationTask).order_by(GenerationTask.created_at.desc()).limit(1).all()

for t in tasks:
    print(f'Task ID: {t.task_id}')
    print(f'Status: {t.status}')
    print(f'Error: {t.error}')
    if t.partial_state:
        print(f'Partial State Error: {t.partial_state.get("error")}')
    print(f'Logs length: {len(t.logs) if t.logs else 0}')
