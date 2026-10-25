import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
task_id_row = db.query(GenerationTask.task_id).order_by(GenerationTask.created_at.desc()).limit(1).first()

if task_id_row:
    t = db.query(GenerationTask).filter(GenerationTask.task_id == task_id_row.task_id).first()
    print(f'Task ID: {t.task_id}')
    print(f'Status: {t.status}')
    if t.logs:
        for log in t.logs[-20:]:
            print(f'[{log.get("timestamp", "")}] {log.get("agent", "")}: {log.get("message", "")}')
    if t.error:
        print(f'ERROR: {t.error}')
else:
    print('No tasks.')
