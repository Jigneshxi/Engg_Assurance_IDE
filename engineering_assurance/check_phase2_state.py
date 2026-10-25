import sys
sys.path.insert(0, '.')
from backend.core.database import SessionLocal
from backend.core.mission_models import Mission

with SessionLocal() as db:
    for mid in [137, 138]:
        m = db.query(Mission).filter(Mission.id == mid).first()
        if m:
            print(f'=== Mission {m.id} ===')
            print(f'status: {m.mission_status}')
            p1 = m.phase_outputs.get("1", {}) if m.phase_outputs else {}
            p2 = m.phase_outputs.get("2", {}) if m.phase_outputs else {}
            print(f'Phase 1 keys: {list(p1.keys()) if p1 else None}')
            print(f'Phase 2 keys: {list(p2.keys()) if p2 else None}')
            print(f'Phase 1 capabilities count: {len(p1.get("capabilities", []))}')
            print(f'Phase 2 tasks count: {len(p2.get("tasks", []))}')
            print(f'Phase 2 tdd_contracts type: {type(p2.get("tdd_contracts"))}')
            print(f'Phase 2 engineering_tasks count: {len(p2.get("engineering_tasks", []))}')
            print()
