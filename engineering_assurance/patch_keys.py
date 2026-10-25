import os

legacy_path = 'c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/nodes/legacy_nodes.py'
with open(legacy_path, 'r', encoding='utf-8') as f:
    legacy_content = f.read()

legacy_content = legacy_content.replace("return {'lifecycle_audit': topology}", "return {'mesh_topology': topology}")
legacy_content = legacy_content.replace("return {'lifecycle_audit': {'mesh_id': f'VVNT-MESH-{task_id[:8]}', 'nodes': [], 'error': str(e)}}", "return {'mesh_topology': {'mesh_id': f'VVNT-MESH-{task_id[:8]}', 'nodes': [], 'error': str(e)}}")

legacy_content = legacy_content.replace("return {'drift_analysis_report': report}", "return {'env_report': report}")
legacy_content = legacy_content.replace("return {'drift_analysis_report': {'drift_detected': False, 'remediation_playbook': [], 'error': str(e)}}", "return {'env_report': {'drift_detected': False, 'remediation_playbook': [], 'error': str(e)}}")

legacy_content = legacy_content.replace("return {'api_dependency_report': report}", "return {'api_validation_report': report}")
legacy_content = legacy_content.replace("return {'api_dependency_report': {'dependencies': [], 'readiness_score': 0, 'error': str(e)}}", "return {'api_validation_report': {'dependencies': [], 'readiness_score': 0, 'error': str(e)}}")

with open(legacy_path, 'w', encoding='utf-8') as f:
    f.write(legacy_content)

forges_path = 'c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/nodes/forges.py'
with open(forges_path, 'r', encoding='utf-8') as f:
    forges_content = f.read()

forges_content = forges_content.replace("return {\"sql_migrations\": result}", "return {\"migration_report\": result}")
forges_content = forges_content.replace("return {\"sql_migrations\": {\"script\": \"-- No schema available for migration.\"}}", "return {\"migration_report\": {\"script\": \"-- No schema available for migration.\"}}")
forges_content = forges_content.replace("return {\"sql_migrations\": {\"script\": f\"-- Auto-generation failed: {str(e)}\", \"destructive_operations_detected\": False}}", "return {\"migration_report\": {\"script\": f\"-- Auto-generation failed: {str(e)}\", \"destructive_operations_detected\": False}}")

with open(forges_path, 'w', encoding='utf-8') as f:
    f.write(forges_content)

print('Updated return keys in legacy_nodes.py and forges.py')
