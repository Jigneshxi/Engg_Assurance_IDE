import unittest
import asyncio
from backend.agents.graphs.phase1_graph import build_phase1_graph, phase1_exit_node
from backend.core.database import SessionLocal, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

class TestPhase1Graph(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    async def asyncSetUp(self):
        self.db = SessionLocal()
        self.mc = MissionController()
        
        # Clean up existing test mission
        existing = self.db.query(Mission).filter(Mission.correlation_id == "test-corr-phase1").first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        # Create test mission
        self.test_mission = Mission(
            correlation_id="test-corr-phase1",
            mission_name="Test Phase 1 Graph",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.CREATED.value
        )
        self.db.add(self.test_mission)
        self.db.commit()
        self.db.refresh(self.test_mission)
        self.mission_id = str(self.test_mission.id)

    async def asyncTearDown(self):
        self.db.delete(self.test_mission)
        self.db.commit()
        self.db.close()

    def test_build_phase1_graph_compiles(self):
        # Should compile without error
        graph = build_phase1_graph()
        self.assertIsNotNone(graph)

    async def test_phase1_exit_node_writes_to_db(self):
        # Initial status should be CREATED
        status = await self.mc.get_status(self.mission_id)
        self.assertEqual(status, MissionStatus.CREATED)

        # Transition to running to satisfy state machine
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE1_RUNNING)

        # Mock state for phase1_exit_node
        mock_state = {
            "mission_id": self.mission_id,
            "unified_context_contract": {"data": "context"},
            "risk_advisory_report": {"advisories": [{"id": 1}]},
            "capabilities": [{"cap": "1"}],
            "target_tech_stack": {"lang": "python"},
            "open_questions": [{"id": 1, "resolved": True}]
        }

        # Call exit node
        result = await phase1_exit_node(mock_state)
        self.assertEqual(result, {})

        # Verify DB writes
        loaded = await self.mc.load_phase_output(self.mission_id, 1)
        self.assertEqual(loaded["unified_context_contract"]["data"], "context")
        self.assertIn("persisted_at", loaded)

        # Verify status transition
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.HITL1_PENDING)

if __name__ == '__main__':
    unittest.main()
