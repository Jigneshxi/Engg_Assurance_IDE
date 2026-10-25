import asyncio
import os
import sys

# Set up django/fastapi environment if needed
sys.path.insert(0, os.path.abspath("."))

from backend.agents.graphs.phase4_graph import build_phase4_graph

async def main():
    graph = build_phase4_graph()
    state = {
        "mission_id": "test_mission_123",
        "task_id": "test_task_123"
    }
    
    config = {"configurable": {"thread_id": "test_thread_123"}}
    
    async for output in graph.astream(state, config=config, stream_mode="updates"):
        for node, res in output.items():
            print(f"Node {node} finished with keys: {list(res.keys())}")

if __name__ == "__main__":
    asyncio.run(main())
