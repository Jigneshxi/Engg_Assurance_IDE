/**
 * ================================================================================
 * AEIAP AGENT MESH — SHARED TOPOLOGY CONSTANTS
 * ================================================================================
 */

export const CREW_MAP: Record<string, string[]> = {
  'crew_strategic_command': ['planning_agent', 'clarifier', 'lifecycle', 'gate_enforcer'],
  'crew_logic_compliance': ['auditor', 'logician', 'governor', 'compliance_remediation'],
  'crew_economics_risk': ['release_risk_decision', 'business_impact_intelligence', 'eng_economics_roi'],
  'crew_knowledge_engine': ['eng_knowledge_graph', 'platform_meta_intelligence', 'monitor', 'defect_learner'],
  'crew_strategy_impact': ['agent_2', 'test_impact', 'regression', 'synthesis_optimizer'],
  'crew_scenario_data': ['creator', 'data_builder', 'exploratory_test_assistant'],
  'crew_api_virtualization': ['api_validation', 'api_mock', 'graphql_validation'],
  'crew_code_generators': ['automation_forge', 'api_coder', 'auto_migration_assistant'],
  'crew_interface_mobile': ['cross_browser', 'mobile_testing', 'visual_intel', 'i18n_test_assistant'],
  'crew_orchestration_matrix': ['run_orchestrator', 'delivery', 'feature_flag', 'mutation_test_assistant'],
  'crew_cloud_environments': ['env_provisioner', 'digital_twin', 'env_consistency'],
  'crew_performance_chaos': ['performance', 'chaos', 'perf_intelligence_config', 'system_resilience'],
  'crew_security_aspm': ['security', 'pen_test'],
  'crew_backend_architecture': ['microservices', 'tracing', 'data_pipeline', 'event_driven'],
  'crew_incident_command': ['rca_intelligence', 'incident_remediation', 'observability_intelligence'],
  'crew_self_healing': ['self_healing', 'locator_intelligence', 'suite_optimization'],
  'crew_sre_reliability': ['reliability_eng', 'slo'],
  'crew_ux_monitoring': ['ux_intelligence', 'a11y_intel']
};

export const CREW_KEYS = Object.keys(CREW_MAP);

export const CANONICAL_AGENT_KEY_ALIASES: Record<string, string> = {
  graphql_validation: 'graphql_validator',
  reliability_eng: 'reliability_engineering',
  eng_knowledge_graph: 'knowledge_graph',
  perf_intelligence_config: 'perf_intel',
  observability_intelligence: 'obs_intel',
  rca_intelligence: 'rca_intel',
  incident_remediation: 'inc_remed',
  system_resilience: 'sys_resil',
  release_risk_decision: 'rel_risk',
  business_impact_intelligence: 'biz_impact',
  eng_economics_roi: 'roi_intel',
  platform_meta_intelligence: 'meta_intel',
  exploratory_test_assistant: 'exploratory',
  locator_intelligence: 'locator',
  auto_migration_assistant: 'migration',
  mutation_test_assistant: 'mutation',
  i18n_test_assistant: 'i18n_testing',
};

export const normalizeAgentKey = (key: string) => {
  const raw = (key || '').trim();
  if (!raw) return raw;
  return CANONICAL_AGENT_KEY_ALIASES[raw] || raw;
};

export const DEPTH_NODE_PRESETS: Record<'rapid' | 'standard' | 'full', string[]> = {
  rapid: [
    'ingestor',
    'clarifier',
    'synthesis_initial',
    'governor',
    'planning_agent',
    'logician',
    'creator',
    'data_builder',
    'api_mock',
    'auditor',
    'lifecycle',
    'automation_forge',
    'api_coder',
    'self_healing',
    'visual_intel',
    'microservices',
    'agent_2',
    'regression',
    'run_orchestrator',
    'env_provisioner',
  ],
  standard: [
    'ingestor',
    'clarifier',
    'synthesis_initial',
    'governor',
    'planning_agent',
    'logician',
    'creator',
    'data_builder',
    'api_mock',
    'auditor',
    'lifecycle',
    'automation_forge',
    'api_coder',
    'self_healing',
    'visual_intel',
    'microservices',
    'agent_2',
    'regression',
    'run_orchestrator',
    'env_provisioner',
    'api_validation',
    'test_impact',
    'performance',
    'delivery',
    'chaos',
    'mobile_testing',
    'graphql_validator',
    'feature_flag',
    'monitor',
    'slo',
    'tracing',
    'reliability_engineering',
    'cross_browser',
    'data_pipeline',
    'suite_optimization',
    'digital_twin',
    'compliance_remediation',
    'event_driven',
    'ux_intelligence',
    'env_consistency',
  ],
  full: [
    'ingestor',
    'clarifier',
    'synthesis_initial',
    'governor',
    'planning_agent',
    'logician',
    'creator',
    'data_builder',
    'api_mock',
    'auditor',
    'lifecycle',
    'automation_forge',
    'api_coder',
    'self_healing',
    'visual_intel',
    'microservices',
    'agent_2',
    'regression',
    'run_orchestrator',
    'env_provisioner',
    'api_validation',
    'test_impact',
    'performance',
    'delivery',
    'chaos',
    'mobile_testing',
    'graphql_validator',
    'feature_flag',
    'monitor',
    'slo',
    'tracing',
    'reliability_engineering',
    'cross_browser',
    'data_pipeline',
    'suite_optimization',
    'digital_twin',
    'compliance_remediation',
    'event_driven',
    'ux_intelligence',
    'env_consistency',
    'security',
    'perf_intel',
    'obs_intel',
    'rca_intel',
    'inc_remed',
    'sys_resil',
    'rel_risk',
    'biz_impact',
    'roi_intel',
    'knowledge_graph',
    'meta_intel',
    'exploratory',
    'locator',
    'migration',
    'mutation',
    'i18n_testing',
    'release_commander',
    'trend_analyst',
    'synthesis_final',
  ],
};

export const DEPTH_NODE_COUNTS: Record<'rapid' | 'standard' | 'full', number> = {
  rapid: 20,
  standard: 40,
  full: 59,
};

const DEPTH_NODE_LOOKUP = {
  rapid: new Set(DEPTH_NODE_PRESETS.rapid),
  standard: new Set(DEPTH_NODE_PRESETS.standard),
  full: new Set(DEPTH_NODE_PRESETS.full),
};

export const getDepthPresetKeys = (depth: string) => {
  if (depth === 'rapid') return DEPTH_NODE_PRESETS.rapid;
  if (depth === 'full') return DEPTH_NODE_PRESETS.full;
  return DEPTH_NODE_PRESETS.standard;
};

export const isDepthPresetKey = (depth: string, key: string) => {
  const canonical = normalizeAgentKey(key);
  if (depth === 'rapid') return DEPTH_NODE_LOOKUP.rapid.has(canonical);
  if (depth === 'full') return DEPTH_NODE_LOOKUP.full.has(canonical);
  return DEPTH_NODE_LOOKUP.standard.has(canonical);
};

export const buildEffectiveAgentMap = (
  depth: string,
  overrides: Record<string, any> = {},
) => {
  const activeKeys = new Set(getDepthPresetKeys(depth));
  const normalizedOverrides: Record<string, 'auto' | 'manual' | 'bypass'> = {};

  Object.entries(overrides || {}).forEach(([rawKey, rawValue]) => {
    const key = normalizeAgentKey(rawKey);
    if (!key) return;

    const value = rawValue === false ? 'bypass' : String(rawValue || '').toLowerCase();
    if (value === 'bypass') {
      normalizedOverrides[key] = 'bypass';
      return;
    }

    if (value === 'manual') {
      normalizedOverrides[key] = 'manual';
      return;
    }

    if (value === 'auto') {
      normalizedOverrides[key] = activeKeys.has(key) ? 'auto' : 'manual';
    }
  });

  const allKeys = new Set([...DEPTH_NODE_PRESETS.full, ...Object.keys(normalizedOverrides)]);
  const effective: Record<string, 'auto' | 'manual' | 'bypass'> = {};

  allKeys.forEach((key) => {
    if (normalizedOverrides[key]) {
      effective[key] = normalizedOverrides[key];
      return;
    }
    effective[key] = activeKeys.has(key) ? 'auto' : 'bypass';
  });

  return effective;
};

export const deriveMeshOverrides = (
  depth: string,
  effectiveAgents: Record<string, any> = {},
) => {
  const activeKeys = new Set(getDepthPresetKeys(depth));
  const overrides: Record<string, 'auto' | 'manual' | 'bypass'> = {};

  Object.entries(effectiveAgents || {}).forEach(([rawKey, rawValue]) => {
    const key = normalizeAgentKey(rawKey);
    if (!key) return;

    const value = rawValue === false ? 'bypass' : String(rawValue || '').toLowerCase();
    if (value !== 'manual' && value !== 'bypass') return;

    const isPresetKey = activeKeys.has(key);
    if (value === 'manual' && !isPresetKey) {
      overrides[key] = 'manual';
      return;
    }

    if (value === 'bypass' && isPresetKey) {
      overrides[key] = 'bypass';
    }
  });

  return overrides;
};

export const resolveAgentMode = (
  depth: string,
  overrides: Record<string, any>,
  key: string,
) => {
  const canonicalKey = normalizeAgentKey(key);
  const effective = buildEffectiveAgentMap(depth, overrides);
  return effective[canonicalKey] || (isDepthPresetKey(depth, canonicalKey) ? 'auto' : 'bypass');
};

export const BREADCRUMB_MAP: Record<string, string> = {
  // Core & Tier 1
  'orchestration': 'Mission Control & Pipeline Overview',
  'requirement_ops': 'Requirement Ingestor Agent (Telemetry Stream)',
  'test_case_factory': 'Strategic Architect & Factory Execution Mesh',
  'knowledge': 'Semantic Memory & Knowledge Graph',
  'registry': 'Agent Sovereign Mesh Registry',
  'settings': 'Global Vault & Identity Configurator',
  'history': 'Traceability Auditor & Artifact Log',
  'config_settings': 'Intelligence Operations & Telemetry Thresholds',
  
  // Module 1 Crews
  'crew_strategic_command': 'Module 1: Strategic Command Node',
  'crew_logic_compliance': 'Module 1: Logic & Compliance Node',
  'crew_knowledge_engine': 'Module 1: Knowledge Engine Node',
  
  // Module 2 Crews
  'crew_strategy_impact': 'Module 2: Strategy & Impact Node',
  'crew_scenario_data': 'Module 2: Scenario & Data Node',
  'crew_api_virtualization': 'Module 2: API Virtualization Node',
  'crew_code_generators': 'Module 2: Code Generation Node',
  'crew_interface_mobile': 'Module 2: Interface & Mobile Node',
  'crew_orchestration_matrix': 'Module 2: Orchestration Matrix Node',
  
  // Module 3 Crews
  'crew_performance_chaos': 'Module 3: Performance & Chaos Node',
  'crew_security_aspm': 'Module 3: Security & ASPM Node',
  'crew_backend_architecture': 'Module 3: Backend Architecture Node',
  'crew_cloud_environments': 'Module 3: Cloud Environments Node',
  'crew_sre_reliability': 'Module 3: SRE & Reliability Node',
  'crew_self_healing': 'Module 3: Self-Healing Dynamics Node',
  'crew_ux_monitoring': 'Module 3: UX & Accessibility Node',
  
  // Module 4 Crews
  'crew_economics_risk': 'Module 4: Economics & Risk Node',
  'crew_incident_command': 'Module 4: Incident Command Node'
};

