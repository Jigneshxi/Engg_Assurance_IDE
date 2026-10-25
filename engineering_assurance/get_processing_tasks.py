import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.core.database import SessionLocal, GenerationTask, init_db

init_db()
db = SessionLocal()
tasks = db.query(GenerationTask).filter(GenerationTask.status == 'PROCESSING').all()

for t in tasks:
    print(f'Task: {t.task_id}, Status: {t.status}')

    if t.logs:
        print(f'Logs for {t.task_id}:')
        for log in t.logs[-5:]:
            print(f'[{log.get("timestamp", "")}] {log.get("agent", "")}: {log.get("message", "")}')
    if t.error:
        print(f'ERROR: {t.error}')
    
    print('Partial State keys:', list(t.partial_state.keys()) if t.partial_state else 'None')
