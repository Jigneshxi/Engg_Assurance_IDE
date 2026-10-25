import asyncio
import json
import logging
import sys
import os

from backend.agents.graphs.phase2_graph import build_phase2_graph
from backend.agents.state import Phase2State
from langchain_core.runnables import RunnableConfig

# Setup logging
logging.basicConfig(level=logging.DEBUG, stream=sys.stdout)

realistic_cap = {
    "id": "CAP-019",
    "name": "FR-C-002: Product Catalogue • Customer can browse an Amerey product catalogue filtered by the chemist's assigned product categories AND the chemist's state",
    "description": "• Product categories: Wheelchairs, Walkers, Walking Sticks, Crutches, Commode Chairs — displayed as filter tabs\n• Product card must show: image, name, brand, key specifications, price (MRP), and availability\n• Customers can filter by: Category, Price Range, Usage Type, User Weight Capacity\n• Search by product name, model number, or use case"
}
caps = [realistic_cap] * 20

state = {
    "mission_id": "TEST-MISSION-123",
    "task_id": "TEST-TASK-123",
    "capabilities": caps,
    "unified_context_contract": {"project": "AmereyConnect Healthcare platform", "tech_stack": {"backend": "Python FastAPI"}},
    "target_tech_stack": {"backend": "Python FastAPI"},
    "risk_advisory_report": {"advisories": [{"constraint": "Must use HTTPS", "binding": True}]}
}

async def run_test():
    print("Building Phase 2 graph...")
    graph = build_phase2_graph()
    
    print("Running Phase 2 graph...")
    config = RunnableConfig(configurable={"thread_id": "TEST-THREAD"})
    
    try:
        final_state = await graph.ainvoke(state, config=config)
        
        print("\n--- TEST RESULTS ---")
        spec = final_state.get("system_specification", {})
        print(f"Check 1 - System Spec populated: {bool(spec and isinstance(spec, dict))}")
        if isinstance(spec, dict):
            print(f"Keys: {list(spec.keys())}")
            
        api_spec = final_state.get("api_design_spec", {})
        if isinstance(api_spec, dict) and "spec" in api_spec:
            parsed = json.loads(api_spec["spec"])
            print(f"Check 2 - API Endpoints: {len(parsed.get('endpoints', []))}")
            
        # We can't test phase 3 easily without output from phase 2, but we can just check if Phase 2 completes successfully.
    except Exception as e:
        print(f"Error during execution: {e}")

if __name__ == '__main__':
    # Add project root to path
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    asyncio.run(run_test())
