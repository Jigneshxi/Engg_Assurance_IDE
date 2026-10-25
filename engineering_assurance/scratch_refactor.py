import re

with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
    text = f.read()

mapping = {
    'test_impact_config': 'impact_report',
    'suite_optimization_config': 'optimized_suite',
    'database_pipeline_config': 'pipeline_report',
    'digital_twin_config': 'twin_report',
    'env_consistency_config': 'env_report',
    'compliance_remediation_config': 'compliance_remediation',
    'event_driven_config': 'event_report',
    'ux_intelligence_config': 'ux_report',
    'business_impact_intelligence': 'business_impact',
    'release_risk_decision': 'release_decision',
    'eng_economics_roi': 'roi_report',
    'eng_knowledge_graph': 'knowledge_graph',
    'platform_meta_intelligence': 'meta_intel_report',
    'exploratory_test_assistant': 'exploratory_report',
    'locator_intelligence': 'locator_strategy',
    'auto_migration_assistant': 'migration_report',
    'mutation_test_assistant': 'mutation_report',
    'i18n_test_assistant': 'i18n_report',
    'system_resilience': 'resilience_report',
    'incident_remediation': 'incident_report',
    'observability_intelligence': 'observability_report',
    'rca_intelligence': 'rca_report',
    'perf_intelligence_config': 'perf_intel',
    'api_validation_config': 'api_validation_report'
}

count = 0
for old_key, new_key in mapping.items():
    pattern = r'\{\s*[\'\"]' + old_key + r'[\'\"]\s*:'
    replacement = '{\'' + new_key + '\':'
    text, n = re.subn(pattern, replacement, text)
    count += n

print(f'Replaced {count} occurrences in nodes.py.')

with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
    f.write(text)
