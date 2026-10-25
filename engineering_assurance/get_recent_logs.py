import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
tasks = db.query(GenerationTask.task_id).order_by(GenerationTask.created_at.desc()).limit(3).all()

for row in tasks:
    t = db.query(GenerationTask).filter(GenerationTask.task_id == row.task_id).first()
    print(f'\\n--- Task ID: {t.task_id} ---')
    print(f'Status: {t.status}')
    if t.logs:
        for log in t.logs[-10:]:
            print(f'[{log.get("timestamp", "")}] {log.get("agent", "")}: {log.get("message", "")}')
