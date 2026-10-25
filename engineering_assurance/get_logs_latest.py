import json
from backend.core.database import SessionLocal, GenerationTask, init_db
init_db()
db = SessionLocal()
tasks = db.query(GenerationTask).order_by(GenerationTask.created_at.desc()).limit(3).all()
for t in tasks:
    print(f"\n--- Task ID: {t.task_id} | Status: {t.status} ---")
    if t.logs:
        for log in t.logs[-10:]:
            ts = log.get("timestamp", "")
            ag = log.get("agent", "")
            msg = log.get("message", "")
            print(f"[{ts}] {ag}: {msg}")
    else:
        print("No logs.")
    print("Error:", t.error)
