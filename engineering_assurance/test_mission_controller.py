import asyncio
from backend.core.database import SessionLocal, engine, Base, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

async def run_test():
    # Initialize schema
    init_db()
    
    # We will test against the existing test DB or local sqlite
    db = SessionLocal()
    try:
        # Clean up existing test mission from previous failures
        existing = db.query(Mission).filter(Mission.correlation_id == "test-corr-id-123").first()
        if existing:
            db.delete(existing)
            db.commit()

        # Create a test mission
        test_mission = Mission(
            correlation_id="test-corr-id-123",
            mission_name="Test Mission",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.PHASE1_RUNNING.value
        )
        db.add(test_mission)
        db.commit()
        db.refresh(test_mission)

        
        mission_id = test_mission.id
        
        mc = MissionController()
        
        # Test get_status
        status = await mc.get_status(str(mission_id))
        print(f"Status from DB: {status}")
        assert status == MissionStatus.PHASE1_RUNNING
        
        # Test phase output persistence
        mock_output = {
            "unified_context_contract": {"data": "test"},
            "risk_advisory_report": {"advisories": [{"id": 1}]},
            "capabilities": [{"cap": "1"}],
            "target_tech_stack": {"lang": "python"},
            "open_questions": [{"id": 1, "resolved": True}]
        }
        
        await mc.persist_phase_output(str(mission_id), 1, mock_output)
        
        # Load it back
        loaded = await mc.load_phase_output(str(mission_id), 1)
        print(f"Loaded output keys: {loaded.keys()}")
        assert "persisted_at" in loaded
        assert loaded["target_tech_stack"]["lang"] == "python"
        
        # Clean up
        db.delete(test_mission)
        db.commit()
        print("All DB tests passed.")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
