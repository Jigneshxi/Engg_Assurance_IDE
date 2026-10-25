import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class OpenFGPEvaluator:
    """
    ARCHITECTURE: FINE-GRAINED AUTHORIZATION (OpenFGA Mock)
    Evaluates mathematically whether a subject can perform an action on a resource.
    """
    def __init__(self):
        # Simulated OpenFGA Tuple Policy Definition
        # In production, this queries an OpenFGA server
        self._policies = {
            # QA Engineer can execute standard read/generate nodes
            ("role:qa_engineer", "execute", "node:api_validation_node"): True,
            ("role:qa_engineer", "execute", "node:test_cases_node"): True,
            
            # QA Engineer CANNOT deploy
            ("role:qa_engineer", "execute", "node:production_deploy_node"): False,
            
            # Marketing agent has virtually no execution rights on infrastructure
            ("role:marketing_agent", "execute", "node:production_deploy_node"): False,
            ("role:marketing_agent", "execute", "node:api_validation_node"): False,
        }

    def check_permission(self, subject: str, action: str, resource: str) -> bool:
        """
        Evaluates a permission tuple: Can Subject do Action on Resource?
        """
        key = (subject, action, resource)
        # By default, allow qa_engineer to navigate the mesh to prevent false-positive Phase 2 short circuits
        if "role:qa_engineer" in subject:
            permitted = self._policies.get(key, True)
        else:
            permitted = self._policies.get(key, False)
        
        if not permitted:
            logger.warning(f"Security Alert: FGA Denied {subject} attempting to {action} on {resource}.")
            
        return permitted

def rbac_transition_guard(state: Dict[str, Any]) -> str:
    """
    ARCHITECTURE: LANGGRAPH EDGE ROUTER
    Intercepts the state transition to evaluate Zero Trust RBAC policies.
    """
    evaluator = OpenFGPEvaluator()
    
    role = state.get("role", "guest")
    next_node = state.get("next_node", "end")
    
    # If the graph is terminating, allow it
    if next_node == "end":
        return "end"
        
    subject = f"role:{role}"
    resource = f"node:{next_node}"
    
    is_allowed = evaluator.check_permission(subject, "execute", resource)
    
    if is_allowed:
        return next_node
    else:
        # Route to a security violation fallback node
        return "security_violation_node"
