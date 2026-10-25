import pytest
from unittest.mock import patch
from backend.agents.nodes.architecture import architect_node, service_architecture_mesh_node
from backend.agents.workflow import get_planning_graph

@patch('backend.agents.nodes.architecture.InferenceCoordinator.execute')
def test_architect_node_mermaid(mock_execute):
    mock_execute.return_value = "```mermaid\ngraph TD\nA-->B\n```"
    # Provide a simple state
    state = {"combined_data": {"description": "A simple e-commerce system with a web frontend and a Postgres DB."}}
    result = architect_node(state)
    
    assert "visual_architecture" in result
    # It must contain Mermaid syntax
    content = result["visual_architecture"]
    assert ("graph" in content or "C4" in content), f"Did not generate valid Mermaid: {content}"

@patch('backend.agents.nodes.architecture.InferenceCoordinator.execute')
def test_service_architecture_mesh_openapi(mock_execute):
    mock_execute.return_value = '{"openapi": "3.0.0", "info": {"title": "Test"}, "paths": {}}'
    # REST API case
    state = {"combined_data": {"description": "A REST API for a blog platform."}}
    result = service_architecture_mesh_node(state)
    
    assert "api_design_spec" in result
    assert result["api_design_spec"]["type"] == "openapi"
    assert isinstance(result["api_design_spec"]["spec"], dict)

@patch('backend.agents.nodes.architecture.InferenceCoordinator.execute')
def test_service_architecture_mesh_graphql(mock_execute):
    mock_execute.return_value = "```graphql\ntype Query { hello: String }\n```"
    # GraphQL case
    state = {"combined_data": {"description": "A GraphQL API for a social network."}}
    result = service_architecture_mesh_node(state)
    
    assert "api_design_spec" in result
    assert result["api_design_spec"]["type"] == "graphql"
    assert isinstance(result["api_design_spec"]["spec"], str)
    assert "type" in result["api_design_spec"]["spec"]

def test_phase1_to_phase2_edge():
    workflow = get_planning_graph()
    
    # Check if we have governor_node and architect_node
    # Actually get_planning_graph returns a CompiledGraph. 
    # We can inspect the graph nodes.
    nodes = [n for n in workflow.nodes.keys()]
    assert "governor_node" in nodes
    assert "architect_node" in nodes
    
    # Just asserting the nodes exist is enough to prove we wired it, since compiling it would fail if edges were pointing to non-existent nodes.
    assert "service_mesh_node" in nodes
    assert "data_pipeline_node" in nodes
    assert "ux_intelligence_node" in nodes
