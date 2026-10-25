import re

def main():
    path = "backend/agents/nodes/legacy_nodes.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update logic_flaw_detector_node
    # Replace the complex JSON output structure
    logic_target = """STRUCTURE: You MUST return a single JSON object with this exact structure:
    {
      "logic_score": "95/100",
      "identified_flaws": [
        {
          "flaw": "[Exhaustive description of first specific logical collision or edge case in SUT flows, e.g. state transition from PENDING to FAILED is missing a transaction rollback hook]",
          "severity": "Critical/Major/Minor",
          "mitigation": "[Exhaustive mitigation step, e.g. inject an explicit validation step ensuring state is locked during active payment verification]"
        },
        {
          "flaw": "[Detailed description of second logical flaw, e.g. lack of rate-limiting bounds on the authentication endpoint allows rapid submission bursts]",
          "severity": "Major",
          "mitigation": "[Detailed mitigation, e.g. verify rate-limiter triggers 429 Too Many Requests when threshold of 5 requests/sec is exceeded]"
        }
      ],
      "formal_recommendations": [
        "[First formal recommendation, e.g. implement transactional atomicity at the gateway layer]",
        "[Second formal recommendation, e.g. add strict validation schema for raw email input]"
      ],
      "state_machine_model": [
        {
          "workflow": "...",
          "states": ["..."],
          "valid_transitions": ["..."],
          "invalid_transitions": ["..."],
          "rollback_paths": ["..."],
          "dependencies": ["..."]
        }
      ],
      "invalid_state_transitions": [
        {"workflow": "...", "transition": "...", "reason": "..."}
      ],
      "rollback_paths": [
        {"workflow": "...", "path": "..."}
      ]
    }"""
    logic_replacement = """STRUCTURE: You MUST return a single JSON object with this exact structure:
    {
      "logic_score": 95,
      "identified_flaws": [
        {
          "flaw": "...",
          "severity": "Critical/Major/Minor",
          "mitigation": "..."
        }
      ],
      "state_machine_model": [
        {
          "workflow": "...",
          "states": ["..."],
          "invalid_transitions": ["..."]
        }
      ]
    }"""
    content = content.replace(logic_target, logic_replacement)

    # 2. Update synthesis_optimizer_node
    # Simplify required keys
    synth_target = """REQUIRED KEYS:
    - "summary": { "objective": "...", "description": "..." }
    - "scope": { "inclusions": [...], "exclusions": [...] }
    - "testing_points": [{"feature": "...", "verification_point": "...", "expected_behavior": "..."}]
    - "intelligence_metrics": { "mesh_confidence": "XX%", "logic_audit_status": "...", "critical_feedback": "..." }
    - "mesh_analytics": { 
        "security_posture": "0-100 score", 
        "performance_readiness": "0-100 score", 
        "traceability_index": "0-100 score",
        "identified_risks_count": 0,
        "security_threats_identified": 0,
        "automation_coverage_projected": "XX%",
        "environmental_complexity": "Low/Mod/High",
        "intelligence_nodes_count": 59,
        "synthesized_tests_count": 0,
        "sla_confidence": "High/Mod/Low",
        "risk_hotspots": 0,
        "requirement_coverage": "XX%",
        "execution_readiness": "Stable/De-risked/Action Required"
      }
    - "agent_wins": [{"agent": "Name", "win": "Specific technical contribution"}]
    - "intelligence_findings": { "rca": "...", "roi": "...", "risk": "...", "assistive_assets": "..." }
    
    STRUCTURE: Return a single JSON object 'final_package'."""
    
    synth_replacement = """REQUIRED KEYS:
    - "executive_summary": "..."
    - "mesh_analytics": { 
        "security_posture": 95, 
        "performance_readiness": 90, 
        "traceability_index": 100
      }
    - "testing_points": [{"feature": "...", "verification_point": "...", "expected_behavior": "..."}]
    
    STRUCTURE: Return a single JSON object."""
    content = content.replace(synth_target, synth_replacement)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
