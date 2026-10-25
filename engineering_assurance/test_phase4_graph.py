import unittest
import asyncio
from backend.agents.graphs.phase4_graph import build_phase4_graph, phase4_exit_node, nfr_blocked_node, nfr_aggregator_node
from backend.core.database import SessionLocal, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

class TestPhase4Graph(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    async def asyncSetUp(self):
        self.db = SessionLocal()
        self.mc = MissionController()
        
        existing = self.db.query(Mission).filter(Mission.correlation_id == "test-corr-phase4").first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        self.test_mission = Mission(
            correlation_id="test-corr-phase4",
            mission_name="Test Phase 4 Graph",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.TDD_GREEN.value
        )
        self.db.add(self.test_mission)
        self.db.commit()
        self.db.refresh(self.test_mission)
        self.mission_id = str(self.test_mission.id)

    async def asyncTearDown(self):
        self.db.delete(self.test_mission)
        self.db.commit()
        self.db.close()

    async def test_nfr_aggregator_one_red_agent(self):
        mock_state = {
            "security_results": [{"status": "GREEN"}],
            "performance_results": [{"status": "RED", "check": "Latency"}],
            "accessibility_results": [{"status": "GREEN"}],
            "reliability_results": [{"status": "GREEN"}],
            "compliance_results": [{"status": "GREEN"}],
        }
        
        result = await nfr_aggregator_node(mock_state)
        self.assertFalse(result["all_nfr_green"])

    async def test_nfr_aggregator_all_green_agents(self):
        mock_state = {
            "security_results": [{"status": "GREEN"}],
            "performance_results": [{"status": "GREEN"}],
            "accessibility_results": [{"status": "GREEN"}],
            "reliability_results": [{"status": "GREEN"}],
            "compliance_results": [{"status": "GREEN"}],
        }
        
        result = await nfr_aggregator_node(mock_state)
        self.assertTrue(result["all_nfr_green"])

    async def test_nfr_blocked_node_transitions_to_phase3(self):
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE4_RUNNING)
        mock_state = {"mission_id": self.mission_id}
        await nfr_blocked_node(mock_state)
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.PHASE3_RUNNING)

    async def test_phase4_exit_node(self):
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE4_RUNNING)
        mock_state = {
            "mission_id": self.mission_id,
            "nfr_clearance_report": {"sec": "ok"},
            "all_nfr_green": True
        }
        await phase4_exit_node(mock_state)
        loaded = await self.mc.load_phase_output(self.mission_id, 4)
        self.assertTrue(loaded["all_nfr_green"])
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.NFR_GREEN)

if __name__ == '__main__':
    unittest.main()
