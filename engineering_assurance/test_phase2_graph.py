import unittest
import asyncio
from backend.agents.graphs.phase2_graph import build_phase2_graph, phase2_exit_node
from backend.core.database import SessionLocal, init_db
from backend.core.mission_models import Mission
from backend.core.mission_controller import MissionController, MissionStatus

class TestPhase2Graph(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    async def asyncSetUp(self):
        self.db = SessionLocal()
        self.mc = MissionController()
        
        # Clean up existing test mission
        existing = self.db.query(Mission).filter(Mission.correlation_id == "test-corr-phase2").first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        # Create test mission
        self.test_mission = Mission(
            correlation_id="test-corr-phase2",
            mission_name="Test Phase 2 Graph",
            mission_type="test",
            created_by=1,
            mission_status=MissionStatus.PHASE1_APPROVED.value
        )
        self.db.add(self.test_mission)
        self.db.commit()
        self.db.refresh(self.test_mission)
        self.mission_id = str(self.test_mission.id)

    async def asyncTearDown(self):
        self.db.delete(self.test_mission)
        self.db.commit()
        self.db.close()

    def test_build_phase2_graph_streams(self):
        # Should compile without error
        graph = build_phase2_graph()
        self.assertIsNotNone(graph)
        
        # Check nodes are in the graph
        nodes = graph.nodes.keys()
        
        # Spec Stream
        self.assertIn("architect_node", nodes)
        self.assertIn("service_mesh_node", nodes)
        self.assertIn("db_architect_node", nodes)
        
        # Test Stream
        self.assertIn("planning_agent_node", nodes)
        self.assertIn("creator_node", nodes)
        self.assertIn("test_data_builder_node", nodes)
        
        # API Stream
        self.assertIn("api_mock_node", nodes)
        self.assertIn("api_design_node", nodes)
        
        # Traceability Stream
        self.assertIn("auditor_node", nodes)
        self.assertIn("traceability_matrix_node", nodes)
        
        # Fan-in
        self.assertIn("engineering_contract_node", nodes)

    async def test_phase2_exit_node_writes_to_db(self):
        # Initial status should be PHASE1_APPROVED
        status = await self.mc.get_status(self.mission_id)
        self.assertEqual(status, MissionStatus.PHASE1_APPROVED)

        # Transition to running to satisfy state machine
        await self.mc.transition_status(self.mission_id, MissionStatus.PHASE2_RUNNING)

        # Mock state for phase2_exit_node
        mock_state = {
            "mission_id": self.mission_id,
            "system_specification": {"spec": "system"},
            "api_design_spec": {"spec": "api"},
            "db_schema_design": {"spec": "db"},
            "tasks": [{"id": 1}],
            "tdd_contracts": {"tests": []},
            "handoff_bundle_path": "/path",
            "engineering_contract": {"status": "created"}
        }

        # Call exit node
        result = await phase2_exit_node(mock_state)
        self.assertEqual(result, {})

        # Verify DB writes
        loaded = await self.mc.load_phase_output(self.mission_id, 2)
        self.assertEqual(loaded["system_specification"]["spec"], "system")
        self.assertEqual(loaded["api_design_spec"]["spec"], "api")
        self.assertEqual(loaded["db_schema_design"]["spec"], "db")
        self.assertEqual(loaded["tasks"][0]["id"], 1)
        self.assertEqual(loaded["tdd_contracts"]["tests"], [])
        self.assertEqual(loaded["handoff_bundle_path"], "/path")
        self.assertEqual(loaded["engineering_contract"]["status"], "created")
        self.assertIn("persisted_at", loaded)

        # Verify status transition
        new_status = await self.mc.get_status(self.mission_id)
        self.assertEqual(new_status, MissionStatus.HITL2_PENDING)

if __name__ == '__main__':
    unittest.main()
