import re

def main():
    path = "backend/agents/nodes/legacy_nodes.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 1. Update Test Data Builder prompt
    # In test_data_builder_node, find the second prompt.
    prompt2_target = """STRUCTURE: You MUST return a single JSON object with a 'datasets' list."""
    prompt2_replacement = """OUTPUT: JSON with keys matching the entities found in the PRD. For each entity include 2-3 sample records.
    Example keys: "mock_affiliates", "mock_products" — use actual entity names from the PRD."""
    content = content.replace(prompt2_target, prompt2_replacement)
    
    # Change the return value parsing
    ret_target = "return {'test_data_samples': data_payload.get('datasets', [])}"
    ret_replacement = "return {'test_data_samples': data_payload}"
    content = content.replace(ret_target, ret_replacement)
    
    # 2. Update Automation Forge prompt
    # Remove markdown wrappers from typescript/playwright output
    auto_prompt_target = """STRUCTURE: You MUST return a single JSON object with an 'automation_scripts' list.
    {
      "automation_scripts": [
        {
          "script_name": "...",
          "framework": "Playwright/Cypress",
          "code": "..."
        }
      ]
    }"""
    auto_prompt_replacement = """OUTPUT: Return ONLY a raw Typescript Playwright script. No markdown formatting, no JSON wrappers.
    Use `import { test, expect } from '@playwright/test';`
    Generate E2E scripts asserting the Acceptance Criteria from the PRD."""
    content = content.replace(auto_prompt_target, auto_prompt_replacement)
    
    auto_parse_target = """try:
        content = InferenceCoordinator.execute('Automation Engineer', 'Generate E2E Scripts', 'AutoForge', prompt, log_step, task_id, topology_id='AutoForge')
        scripts_payload = robust_json_loads(content)
        log_step(task_id, f"Automation Engineering Complete. Generated {len(scripts_payload.get('automation_scripts', []))} scripts.", 'AutoForge')
        return {'automation_scripts': scripts_payload.get('automation_scripts', [])}"""
    auto_parse_replacement = """try:
        content = InferenceCoordinator.execute('Automation Engineer', 'Generate E2E Scripts', 'AutoForge', prompt, log_step, task_id, topology_id='AutoForge')
        content = content.replace('```typescript', '').replace('```', '').strip()
        log_step(task_id, f"Automation Engineering Complete.", 'AutoForge')
        return {'automation_scripts': [{"script_name": "test_e2e.spec.ts", "framework": "Playwright", "code": content}]}"""
    content = content.replace(auto_parse_target, auto_parse_replacement)
    
    # 3. Update Performance Testing Node
    perf_prompt_target = """STRUCTURE: You MUST return a single JSON object with a 'performance_scripts' list.
    {
      "performance_scripts": [
        {
          "script_name": "load_test.js",
          "tool": "k6/JMeter",
          "code": "..."
        }
      ]
    }"""
    perf_prompt_replacement = """OUTPUT: Return ONLY a raw k6 JavaScript script. No markdown formatting, no JSON wrappers.
    Use `import http from 'k6/http';` and implement thresholds reflecting the NFRs (e.g. 5,000 TPS)."""
    content = content.replace(perf_prompt_target, perf_prompt_replacement)
    
    perf_parse_target = """try:
        content = InferenceCoordinator.execute('Performance Engineer', 'Generate Perf Scripts', 'PerfEngine', prompt, log_step, task_id, topology_id='PerfEngine')
        scripts_payload = robust_json_loads(content)
        log_step(task_id, f"Performance Engineering Complete. Generated {len(scripts_payload.get('performance_scripts', []))} scripts.", 'PerfEngine')
        return {'performance_scripts': scripts_payload.get('performance_scripts', [])}"""
    perf_parse_replacement = """try:
        content = InferenceCoordinator.execute('Performance Engineer', 'Generate Perf Scripts', 'PerfEngine', prompt, log_step, task_id, topology_id='PerfEngine')
        content = content.replace('```javascript', '').replace('```js', '').replace('```', '').strip()
        log_step(task_id, f"Performance Engineering Complete.", 'PerfEngine')
        return {'performance_scripts': [{"script_name": "load_test_k6.js", "tool": "k6", "code": content}]}"""
    content = content.replace(perf_parse_target, perf_parse_replacement)
    
    # 4. Chaos Engineering Node
    chaos_prompt_target = """STRUCTURE: You MUST return a single JSON object with a 'chaos_experiments' list.
    {
      "chaos_experiments": [
        {
          "experiment_name": "...",
          "type": "Network/Pod/Resource",
          "definition": "..."
        }
      ]
    }"""
    chaos_prompt_replacement = """OUTPUT: Return ONLY a raw Chaos Mesh YAML configuration. No markdown formatting, no JSON wrappers."""
    content = content.replace(chaos_prompt_target, chaos_prompt_replacement)
    
    chaos_parse_target = """try:
        content = InferenceCoordinator.execute('Chaos Engineer', 'Generate Chaos Experiments', 'ChaosForge', prompt, log_step, task_id, topology_id='ChaosForge')
        scripts_payload = robust_json_loads(content)
        log_step(task_id, f"Chaos Engineering Complete. Generated {len(scripts_payload.get('chaos_experiments', []))} experiments.", 'ChaosForge')
        return {'chaos_experiments': scripts_payload.get('chaos_experiments', [])}"""
    chaos_parse_replacement = """try:
        content = InferenceCoordinator.execute('Chaos Engineer', 'Generate Chaos Experiments', 'ChaosForge', prompt, log_step, task_id, topology_id='ChaosForge')
        content = content.replace('```yaml', '').replace('```yml', '').replace('```', '').strip()
        log_step(task_id, f"Chaos Engineering Complete.", 'ChaosForge')
        return {'chaos_experiments': [{"experiment_name": "simulate-outage", "type": "ChaosMesh", "definition": content}]}"""
    content = content.replace(chaos_parse_target, chaos_parse_replacement)
    
    # 5. Obs Intelligence Node
    obs_prompt_target = """OUTPUT: JSON array of Datadog or Prometheus monitoring configurations."""
    obs_prompt_replacement = """OUTPUT: JSON with exactly these keys: 'required_telemetry_spans' (list of strings) and 'datadog_monitors_generated' (list of objects with 'name', 'query', 'alert_message')."""
    content = content.replace(obs_prompt_target, obs_prompt_replacement)
    
    obs_parse_target = """return {'observability_configs': robust_json_loads(res)}"""
    obs_parse_replacement = """parsed = robust_json_loads(res)
        if isinstance(parsed, list):
            parsed = {"required_telemetry_spans": [], "datadog_monitors_generated": parsed}
        return {'observability_configs': parsed}"""
    content = content.replace(obs_parse_target, obs_parse_replacement)
    
    # 6. Feature Flag Node
    ff_prompt_target = """OUTPUT: JSON array of LaunchDarkly or Split configurations."""
    ff_prompt_replacement = """OUTPUT: JSON representing a LaunchDarkly configuration. Include keys: 'flag_key', 'name', 'variations', 'default_rule'."""
    content = content.replace(ff_prompt_target, ff_prompt_replacement)
    
    ff_parse_target = """return {'feature_flags': robust_json_loads(res)}"""
    ff_parse_replacement = """parsed = robust_json_loads(res)
        return {'feature_flags': [parsed] if isinstance(parsed, dict) else parsed}"""
    content = content.replace(ff_parse_target, ff_parse_replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
if __name__ == "__main__":
    main()
