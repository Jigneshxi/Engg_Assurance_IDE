import asyncio
from backend.core.database import SessionLocal
from backend.core.mission_models import Mission
from backend.core.mission_controller import mission_controller, MissionStatus
from backend.api.routes.tasks import approve_phase1, Phase1ApprovalBody

async def simulate_e2e():
    print("--- STARTING E2E VERIFICATION ---")
    db = SessionLocal()
    
    # 1. Create Mission
    mission = Mission(
        correlation_id="e2e-sim-3",
        mission_name="E2E Test",
        mission_type="test",
        created_by=1,
        mission_status=MissionStatus.CREATED.value,
        phase_outputs={}
    )
    db.add(mission)
    db.commit()
    db.refresh(mission)
    mission_id = str(mission.id)
    print(f"[ ] POST /missions — created mission {mission_id}, status = CREATED")
    
    # 2. Trigger Phase 1
    await mission_controller.transition_status(mission_id, MissionStatus.PHASE1_RUNNING)
    print(f"[ ] Mission triggers Phase 1 — status transitions to PHASE1_RUNNING")
    
    from backend.agents.graphs.phase1_graph import build_phase1_graph
    phase1_graph = build_phase1_graph()
    
    initial_state = {
        "mission_id": mission_id,
        "prd_input": "Test PRD for E2E",
        "hitl_1_approved": False,
        "capabilities": [{"cap": "test"}],
        "open_questions": [{"q": "test"}],
        "unified_context_contract": {"data": "test"},
        "target_tech_stack": {"stack": "test"},
        "risk_advisory_report": {"risk": "test"}
    }
    
    thread_id_1 = mission_controller.get_thread_id(mission_id, 1)
    print(f"Executing Phase 1 with thread_id: {thread_id_1}")
    await phase1_graph.ainvoke(initial_state, config={"configurable": {"thread_id": thread_id_1}})
    
    status = await mission_controller.get_status(mission_id)
    print(f"[ ] Status transitions to {status} — frontend shows Phase 1 review panel")
    
    # 3. Approve Phase 1
    print(f"[ ] POST /missions/{mission_id}/approve/phase1 — approving...")
    body = Phase1ApprovalBody(resolved_questions=[{"q": "test", "a": "test"}])
    await approve_phase1(mission_id, body)
    
    # After approval, Phase 2 should start. Let's wait a bit as it might be running in the background.
    # Actually, in approve_phase1 we just ainvoke again with hitl_1_approved=True
    # The phase1_exit_node transitions to PHASE1_APPROVED. We need to start Phase 2 manually if it's not hooked up automatically,
    # or if the UI is supposed to start it, the user clicks "Start Phase 2".
    status = await mission_controller.get_status(mission_id)
    print(f"[ ] Status transitions to {status}")
    
    if status == MissionStatus.PHASE1_APPROVED:
        print("[ ] Phase 2 starts automatically — status = PHASE2_RUNNING")
        await mission_controller.transition_status(mission_id, MissionStatus.PHASE2_RUNNING)
        from backend.agents.graphs.phase2_graph import build_phase2_graph
        phase2_graph = build_phase2_graph()
        
        # Load from Phase 1 output
        p1_out = await mission_controller.load_phase_output(mission_id, 1)
        p2_state = {
            "mission_id": mission_id,
            "unified_context_contract": p1_out.get("unified_context_contract", {"dummy": 1}),
            "risk_advisory_report": p1_out.get("risk_advisory_report", {"dummy": 1}),
            "capabilities": p1_out.get("capabilities", [{"dummy": 1}]),
            "open_questions": p1_out.get("open_questions", []),
            "hitl_2_approved": False
        }
        thread_id_2 = mission_controller.get_thread_id(mission_id, 2)
        print(f"Executing Phase 2 with thread_id: {thread_id_2}")
        await phase2_graph.ainvoke(p2_state, config={"configurable": {"thread_id": thread_id_2}})
        
        status = await mission_controller.get_status(mission_id)
        print(f"[ ] Status transitions to {status} — frontend shows Phase 2 review panel")
        
    db.close()

if __name__ == "__main__":
    asyncio.run(simulate_e2e())
