from typing import Dict, Any, List

PHASE_CONTRACTS = {
    1: {
        "required_output_keys": [
            "unified_context_contract",
            "risk_advisory_report",
            "capabilities",
            "target_tech_stack",
            "open_questions"
        ]
    },
    2: {
        "required_output_keys": [
            "system_specification",
            "api_design_spec",
            "db_schema_design",
            "tasks",
            "tdd_contracts",
            "engineering_contract"
        ]
    },
    3: {
        "required_output_keys": [
            "tdd_execution_report",
            "generated_code_paths",
            "all_tests_green"
        ],
        "gate_conditions": {
            "all_tests_green": True
        }
    },
    4: {
        "required_output_keys": [
            "nfr_clearance_report",
            "all_nfr_green"
        ],
        "gate_conditions": {
            "all_nfr_green": True
        }
    },
    5: {
        "required_output_keys": [
            "readiness_report",
            "vv_passport",
            "mission_archive"
        ]
    }
}

def validate_phase_output(phase_num: int, output: dict) -> None:
    if phase_num not in PHASE_CONTRACTS:
        raise ValueError(f"Unknown phase number: {phase_num}")
        
    required_keys = PHASE_CONTRACTS[phase_num]["required_output_keys"]
    
    missing = []
    empty = []
    
    for k in required_keys:
        if k not in output:
            missing.append(k)
        else:
            val = output[k]
            if val is None:
                missing.append(k)
            elif not val and not isinstance(val, (bool, int, list)):
                empty.append(k)  # present but empty
                
    if missing:
        raise ValueError(f"Phase {phase_num} output missing keys: {missing}")
        
    if empty:
        raise ValueError(
            f"Phase {phase_num} output has empty values for: {empty}. "
            f"LLM nodes likely failed silently — check individual node logs."
        )
        
    gate_conditions = PHASE_CONTRACTS[phase_num].get("gate_conditions", {})
    for key, required_value in gate_conditions.items():
        if output.get(key) != required_value:
            raise ValueError(
                f"Phase {phase_num} gate condition failed: "
                f"{key} must be {required_value}, got {output.get(key)}. "
                f"Phase cannot be persisted as complete."
            )

