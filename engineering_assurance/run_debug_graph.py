import json
from backend.agents.workflow import strategic_blitz_graph
import logging
logging.basicConfig(level=logging.INFO)

state = {
    "task_id": "test-debug-123",
    "mission_id": 1,
    "mission_intent": "PHASE_1",
    "sources": [],
    "additional_context": "Test PRD",
    "execution_mode": "analysis",
    "depth": "standard",
    "role": "qa_engineer",
    "execution_context": {
        "repository_url": "https://github.com/test",
        "application_url": "http://localhost:3000",
        "api_base_url": "http://localhost:8000",
        "has_database": False
    },
    "active_agents": {}
}

print("Invoking strategic_blitz_graph...")
try:
    for event in strategic_blitz_graph.stream(state, config={"recursion_limit": 200}):
        for k, v in event.items():
            print(f"--- Node: {k} finished ---")
except Exception as e:
    import traceback
    traceback.print_exc()
