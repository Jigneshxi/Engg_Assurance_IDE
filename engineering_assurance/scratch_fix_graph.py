import re

def fix_workflow_graph():
    with open('backend/agents/workflow.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # We need to replace `workflow.add_node(name` with `workflow.add_node(f"{name}_node"`
    text = text.replace(
        'workflow.add_node(name, bypass_node(func, node_aliases.get(name, name if name != "compose" else "writer")))',
        'workflow.add_node(f"{name}_node", bypass_node(func, node_aliases.get(name, name if name != "compose" else "writer")))'
    )

    # set_entry_point
    text = text.replace('workflow.set_entry_point("ingestor")', 'workflow.set_entry_point("ingestor_node")')

    # Tier 1 edges
    edges = [
        ("ingestor", "clarifier"),
        ("clarifier", "synthesis_initial"),
        ("synthesis_initial", "governor"),
        ("governor", "planning_agent"),
        ("planning_agent", "logician"),
        ("logician", "creator"),
        ("creator", "data_builder"),
        ("data_builder", "api_mock"),
        ("api_mock", "critic"),
        ("critic", "auditor")
    ]
    for src, dst in edges:
        old_edge = f'workflow.add_edge("{src}", "{dst}")'
        new_edge = f'workflow.add_edge("{src}_node", "{dst}_node")'
        text = text.replace(old_edge, new_edge)

    # specialist_chain edges
    text = text.replace('workflow.add_edge("auditor", specialist_chain[0])', 'workflow.add_edge("auditor_node", f"{specialist_chain[0]}_node")')
    text = text.replace('workflow.add_edge(prev, node)', 'workflow.add_edge(f"{prev}_node", f"{node}_node")')

    # CONVERGENCE TO SYNTHESIS
    text = text.replace('workflow.add_edge("compose", END)', 'workflow.add_edge("compose_node", END)')

    with open('backend/agents/workflow.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_workflow_graph()
    print("Graph node names suffixed with '_node' successfully.")
