import unittest
import asyncio
from backend.agents.graphs.phase3_graph import build_phase3_graph, phase3_exit_node
from backend.core.database import SessionLocal, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

class TestPhase3Graph(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    async def asyncSetUp(self):
        self.db = SessionLocal()
        self.mc = MissionController()
        
        # Clean up existing test mission
        existing = self.db.query(Mission).filter(Mission.correlation_id == "test-corr-phase3").first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        # Create test mission
        self.test_mission = Mission(
            correlation_id="test-corr-phase3",
            mission_name="Test Phase 3 Graph",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.PHASE2_APPROVED.value
        )
        self.db.add(self.test_mission)
        self.db.commit()
        self.db.refresh(self.test_mission)
        self.mission_id = str(self.test_mission.id)

    async def asyncTearDown(self):
        self.db.delete(self.test_mission)
        self.db.commit()
        self.db.close()

    def test_build_phase3_graph_waves(self):
        graph = build_phase3_graph()
        self.assertIsNotNone(graph)
        
        # Test edges to ensure wave 1 does not skip sync node to reach wave 2
        
        # Get edges
        edges = graph.builder.edges
        
        # Check wave 1 nodes only go to wave1_sync_node
        for edge in edges:
            if edge[0] in ["frontend_forge_node", "backend_forge_node", "database_forge_node"]:
                self.assertEqual(edge[1], "wave1_sync_node", f"{edge[0]} should only point to wave1_sync_node")
                
        # Check wave 2 nodes only go to wave2_sync_node
        for edge in edges:
            if edge[0] in ["automation_forge_node", "api_coder_node", "migration_agent_node", "self_healing_node"]:
                self.assertEqual(edge[1], "wave2_sync_node", f"{edge[0]} should only point to wave2_sync_node")

    async def test_phase3_exit_node_writes_to_db(self):
        # Transition to running to satisfy state machine
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE3_RUNNING)

        # Mock state for phase3_exit_node
        mock_state = {
            "mission_id": self.mission_id,
            "tdd_execution_report": {"env": "provisioned", "task_1": "GREEN"},
            "generated_code_paths": ["src/api.py"],
            "all_tests_green": True
        }

        # Call exit node
        result = await phase3_exit_node(mock_state)
        self.assertEqual(result, {})

        # Verify DB writes
        loaded = await self.mc.load_phase_output(self.mission_id, 3)
        self.assertEqual(loaded["tdd_execution_report"]["task_1"], "GREEN")
        self.assertEqual(loaded["generated_code_paths"][0], "src/api.py")
        self.assertTrue(loaded["all_tests_green"])
        self.assertIn("persisted_at", loaded)

        # Verify status transition
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.TDD_GREEN)

if __name__ == '__main__':
    unittest.main()
