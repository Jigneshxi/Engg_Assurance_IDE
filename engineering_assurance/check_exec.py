import sys
from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
t_id = db.query(GenerationTask.task_id).order_by(GenerationTask.created_at.desc()).limit(1).first()
if t_id:
    t = db.query(GenerationTask).filter(GenerationTask.task_id == t_id.task_id).first()
    print(f'Status: {t.status}')
    if t.logs:
        print('Logs:')
        for log in t.logs[-10:]:
            ts = log.get("timestamp")
            ag = log.get("agent")
            msg = log.get("message")
            if msg:
                msg = msg[:100]
            print(f'[{ts}] {ag}: {msg}...')
    else:
        print('Logs: None')
    print(f'Error: {t.error}')
