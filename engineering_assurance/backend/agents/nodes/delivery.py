import logging
from backend.agents.state import AgentState, log_step
from backend.core.inference import InferenceCoordinator
from backend.agents.nodes import robust_json_loads

logger = logging.getLogger(__name__)

def env_ops_node(state: AgentState):
    """
    NODE: Phase 4 - Environment Operations (EnvOps)
    Generates Dockerfile and devcontainer based on Phase 1 structure and Phase 2 tech stack.
    """
    if state.get("error"):
        return state
        
    task_id = state.get("task_id")
    log_step(task_id, "Activating EnvOps Provisioner (Phase 4)...", "Delivery")
    
    # 1. Restrict Inputs to strictly needed context
    repo_context = state.get("repo_intelligence_context") or ""
    tech_stack = state.get("tech_stack_advisory") or {}
    db_schema = state.get("db_schema_design") or {}

    prompt = f"""
    ROLE: Principal DevOps Engineer
    TASK: Generate a production-ready Dockerfile and a local .devcontainer/devcontainer.json.
    
    RESTRICTED INPUT CONTEXT:
    1. Baseline Project Structure: {repo_context[:500]}
    2. Architecture Tech Stack: {tech_stack}
    3. Database Context: {db_schema.get("type", "unknown")}
    
    REQUIREMENTS:
    - Strictly copy the ai-default-project structure as the baseline.
    - Adapt the Dockerfile for the specific tech stack selected in Phase 2.
    - Zero-Trust Guard: You MUST specify a non-root USER in the Dockerfile (e.g., `USER appuser`). Do NOT use `USER root`.
    
    OUTPUT FORMAT:
    Return a single JSON object with the following exact shape:
    {{
        "dockerfile": "raw string of Dockerfile content",
        "devcontainer": "raw string of devcontainer.json content"
    }}
    """
    
    try:
        content = InferenceCoordinator.execute(
            "DevOps Engineer", "Generate EnvOps Manifests", "Delivery", prompt, log_step, task_id
        )
        data = robust_json_loads(content)
        
        dockerfile_content = data.get("dockerfile", "")
        devcontainer_content = data.get("devcontainer", "")
        
        # Zero-Trust Deterministic Python Assertion
        assert "USER root" not in dockerfile_content, "Zero-trust violation: Dockerfile runs as root"
        assert "USER " in dockerfile_content, "Zero-trust violation: No USER directive found in Dockerfile"
        
        manifests = {
            "dockerfile": dockerfile_content,
            "devcontainer": devcontainer_content
        }
        
        log_step(task_id, "EnvOps generated Dockerfile (Zero-Trust Verified) and devcontainer.", "Delivery")
        return {"devops_manifests": manifests}
        
    except Exception as e:
        log_step(task_id, f"EnvOps Node failed: {e}", "Delivery", level=logging.ERROR)
        # Fallback to prevent complete graph failure, but keeping zero-trust.
        fallback_manifests = {
            "dockerfile": "FROM alpine:latest\nRUN addgroup -S appgroup && adduser -S appuser -G appgroup\nUSER appuser\nCMD [\"echo\", \"EnvOps Failed\"]",
            "devcontainer": "{ \"name\": \"Fallback\" }"
        }
        return {"devops_manifests": fallback_manifests}

def progressive_delivery_node(state: AgentState):
    """
    NODE: Phase 4 - Progressive Delivery
    Generates GitHub Actions YAML for CI/CD with Snyk and Dependabot.
    """
    if state.get("error"):
        return state
        
    task_id = state.get("task_id")
    log_step(task_id, "Activating Progressive Delivery (Phase 4)...", "Delivery")
    
    # 1. Restrict Inputs to strictly needed context
    api_spec = state.get("api_design_spec") or {}
    devops_manifests = state.get("devops_manifests") or {}
    dockerfile = devops_manifests.get("dockerfile") or ""
    
    prompt = f"""
    ROLE: Principal SRE & Release Engineer
    TASK: Generate a GitHub Actions CI/CD pipeline and Dependabot configuration.
    
    RESTRICTED INPUT CONTEXT:
    1. API Design Spec (What to test): {api_spec.get("type", "unknown")}
    2. Dockerfile (What to build): {dockerfile[:500]}
    
    REQUIREMENTS:
    - Generate a `github_actions_ci` string containing a fully valid YAML workflow.
    - Security Scans: The CI workflow MUST contain a Snyk scan step (`snyk/actions/setup@master`).
    - Dependency Management: Generate a `dependabot` string containing a valid dependabot.yml configuration.
    
    OUTPUT FORMAT:
    Return a single JSON object with the following exact shape:
    {{
        "github_actions_ci": "raw string of GitHub Actions CI/CD YAML",
        "github_actions_cd": "raw string of Dependabot YAML"
    }}
    """
    
    try:
        content = InferenceCoordinator.execute(
            "SRE", "Generate CI/CD Manifests", "Delivery", prompt, log_step, task_id
        )
        data = robust_json_loads(content)
        
        ci_yaml = data.get("github_actions_ci", "")
        cd_yaml = data.get("github_actions_cd", "")
        
        manifests = {
            "github_actions_ci": ci_yaml,
            "github_actions_cd": cd_yaml
        }
        
        log_step(task_id, "Progressive Delivery generated CI/CD YAML with Security Scans.", "Delivery")
        return {"devops_manifests": manifests}
        
    except Exception as e:
        log_step(task_id, f"Progressive Delivery failed: {e}", "Delivery", level=logging.ERROR)
        fallback_manifests = {
            "github_actions_ci": "name: Fallback CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo 'Delivery Failed'",
            "github_actions_cd": "version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: '/'\n    schedule:\n      interval: daily"
        }
        return {"devops_manifests": fallback_manifests}
