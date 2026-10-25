import pytest
from backend.agents.state import AgentState
from backend.agents.nodes.forges import api_validation_node

def test_api_validation_path_enforcement_pass():
    # Valid Forge Output
    state = {
        "task_id": "test-task",
        "backend_forge_code": [
            {"path": "packages/backend/main.py", "content": "print('hello')"}
        ],
        "frontend_forge_code": [
            {"path": "apps/frontend/src/App.tsx", "content": "export default App;"}
        ]
    }
    
    result = api_validation_node(state)
    assert "error" not in result
    assert "api_validation_report" in result
    assert result["api_validation_report"]["status"] == "PASS"

def test_api_validation_path_enforcement_fail_frontend():
    # Invalid Frontend Forge Output (trying to write outside apps/frontend/)
    state = {
        "task_id": "test-task",
        "backend_forge_code": [
            {"path": "packages/backend/main.py", "content": "print('hello')"}
        ],
        "frontend_forge_code": [
            {"path": "etc/passwd", "content": "rogue data"}
        ]
    }
    
    result = api_validation_node(state)
    assert "error" in result
    assert "Frontend Forge output invalid path" in result["error"]
    
def test_api_validation_path_enforcement_fail_backend():
    # Invalid Backend Forge Output (trying to write outside packages/)
    state = {
        "task_id": "test-task",
        "backend_forge_code": [
            {"path": "src/main.py", "content": "rogue data"} # Should be packages/
        ],
        "frontend_forge_code": [
            {"path": "apps/frontend/src/App.tsx", "content": "export default App;"}
        ]
    }
    
    result = api_validation_node(state)
    assert "error" in result
    assert "Backend Forge output invalid path" in result["error"]
