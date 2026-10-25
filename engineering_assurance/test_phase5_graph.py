import unittest
import asyncio
import hashlib
import json
from backend.agents.graphs.phase5_graph import build_phase5_graph, passport_generation_node, phase5_exit_node
from backend.core.database import SessionLocal, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

class TestPhase5Graph(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    async def asyncSetUp(self):
        self.db = SessionLocal()
        self.mc = MissionController()
        
        existing = self.db.query(Mission).filter(Mission.correlation_id == "test-corr-phase5").first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        self.test_mission = Mission(
            correlation_id="test-corr-phase5",
            mission_name="Test Phase 5 Graph",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.NFR_GREEN.value,
            phase_outputs={}
        )
        self.db.add(self.test_mission)
        self.db.commit()
        self.db.refresh(self.test_mission)
        self.mission_id = str(self.test_mission.id)

    async def asyncTearDown(self):
        self.db.delete(self.test_mission)
        self.db.commit()
        self.db.close()

    def sha256(self, data) -> str:
        return "sha256:" + hashlib.sha256(
            json.dumps(data, sort_keys=True).encode()
        ).hexdigest()

    async def test_passport_hashes_match_db(self):
        # Setup mock DB phase outputs
        outputs = {
            1: {"unified_context_contract": {"test": "1"}},
            2: {"engineering_contract": {"test": "2"}},
            3: {"tdd_execution_report": {"test": "3"}},
            4: {"nfr_clearance_report": {"test": "4"}}
        }
        for phase, data in outputs.items():
            await self.mc.save_phase_output(self.mission_id, phase, data)
            
        # Re-fetch from DB to get the actual persisted structure (with persisted_at)
        p1 = await self.mc.load_phase_output(self.mission_id, 1)
        p2 = await self.mc.load_phase_output(self.mission_id, 2)
        p3 = await self.mc.load_phase_output(self.mission_id, 3)
        p4 = await self.mc.load_phase_output(self.mission_id, 4)

        mock_state = {"mission_id": self.mission_id}
        result = await passport_generation_node(mock_state)
        
        passport = result["vv_passport"]
        self.assertEqual(passport["phase1_hash"], self.sha256(p1))
        self.assertEqual(passport["phase2_hash"], self.sha256(p2))
        self.assertEqual(passport["phase3_hash"], self.sha256(p3))
        self.assertEqual(passport["phase4_hash"], self.sha256(p4))

    async def test_mission_complete_transition(self):
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE5_RUNNING)
        mock_state = {
            "mission_id": self.mission_id,
            "readiness_report": {"ready": True},
            "vv_passport": {"passport": True},
            "mission_archive": {"archive": True}
        }
        await phase5_exit_node(mock_state)
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.MISSION_COMPLETE)

    async def test_missing_phase_output_raises_error(self):
        # We only save phase 1, missing 2, 3, 4
        await self.mc.save_phase_output(self.mission_id, 1, {"test": "1"})
        
        with self.assertRaises(RuntimeError) as context:
            await self.mc.start_phase5(self.mission_id)
            
        self.assertIn("No persisted output found for mission", str(context.exception))

if __name__ == '__main__':
    unittest.main()
