import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
from sqlalchemy.orm import defer
tasks = db.query(GenerationTask.task_id, GenerationTask.status).order_by(GenerationTask.created_at.desc()).limit(1).all()

for t in tasks:
    print(f'Task: {t.task_id}, Status: {t.status}')

    if t == tasks[0]:
        task = db.query(GenerationTask).filter(GenerationTask.task_id == t.task_id).first()
        if task and task.logs:
            print(f'Logs for {task.task_id}:')
            for log in task.logs:
                print(f'[{log.get("timestamp", "")}] {log.get("agent", "")}: {log.get("message", "")}')
        if task and task.error:
            print(f'ERROR: {task.error}')
