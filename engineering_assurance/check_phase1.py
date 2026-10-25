import asyncio, sys
sys.path.insert(0, '.')

async def check():
    from backend.core.database import SessionLocal
    from backend.core.mission_models import Mission
    with SessionLocal() as db:
        missions = db.query(Mission).order_by(Mission.id.desc()).limit(5).all()
        for m in missions:
            outputs = m.phase_outputs or {}
            p1 = outputs.get('1', {})
            caps = len(p1.get('capabilities', [])) if p1 else 0
            p1_keys = list(p1.keys()) if p1 else 'EMPTY'
            print(f"Mission id={m.id} | status={m.mission_status} | phase_outputs_keys={list(outputs.keys())} | p1_keys={p1_keys} | capabilities={caps}")

asyncio.run(check())
