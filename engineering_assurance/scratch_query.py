import json
from backend.core.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    result = db.execute(text("SELECT partial_state FROM generation_tasks WHERE task_id = '71ed9aa7-b64c-467a-960a-59937d3a3c7a'")).fetchone()
    if result and result[0]:
        state = json.loads(result[0]) if isinstance(result[0], str) else result[0]
        ctx = state.get('execution_context')
        print('execution_context in DB:', json.dumps(ctx, indent=2))
        print('openapi_spec_url in DB:', state.get('openapi_spec_url'))
    else:
        print('Task not found or no partial_state')
except Exception as e:
    print('Error:', e)
finally:
    db.close()
