import asyncio
from backend.core.mission_controller import mission_controller
from backend.core.database import SessionLocal, GenerationTask

async def main():
    db = SessionLocal()
    t = db.query(GenerationTask).order_by(GenerationTask.created_at.desc()).first()
    mid = t.task_id
    db.close()
    
    print(f"=== Mission {mid} ===")
    s = await mission_controller.get_status(mid)
    print(f"mission_status: {s}")
    
    o2 = await mission_controller.get_phase_output(mid, 2)
    print(f"\n=== Phase 2 Output ===")
    print(f"keys: {list(o2.keys()) if o2 else 'None'}")
    print(f"tasks count: {len(o2.get('tasks', []))} ")
    print(f"engineering_tasks count: {len(o2.get('engineering_tasks', []))}")
    if o2.get('tasks'):
        for t in o2['tasks']:
            print(f"  - {t.get('task_id', t.get('id', '?'))}: {t.get('title', '?')[:60]}")
    
    o3 = await mission_controller.get_phase_output(mid, 3)
    print(f"\n=== Phase 3 Output ===")
    print(f"keys: {list(o3.keys()) if o3 else 'None'}")
    if o3:
        print(f"generated_code_paths: {o3.get('generated_code_paths', [])}")
        fc = o3.get('frontend_forge_code', '')
        print(f"frontend_forge_code length: {len(fc) if fc else 0}")
        bc = o3.get('backend_forge_code', '')
        print(f"backend_forge_code length: {len(bc) if bc else 0}")
        dc = o3.get('database_forge_code', '')
        print(f"database_forge_code length: {len(dc) if dc else 0}")
    
    o4 = await mission_controller.get_phase_output(mid, 4)
    print(f"\n=== Phase 4 Output ===")
    print(f"keys: {list(o4.keys()) if o4 else 'None'}")
    
    o5 = await mission_controller.get_phase_output(mid, 5)
    print(f"\n=== Phase 5 Output ===")
    print(f"keys: {list(o5.keys()) if o5 else 'None'}")

asyncio.run(main())
