export type TelemetrySource =
  | 'manual'
  | 'mesh'
  | 'analysis'
  | 'final_synthesis'
  | 'unresolved';

export interface TelemetryResolution {
  data: any;
  source: TelemetrySource;
  sourcePath?: string;
  matchedKey?: string;
}

interface ResolveNodeTelemetryOptions {
  nodeKey: string;
  telemetryState?: Record<string, any>;
  fullMeshState?: any;
}

export const NODE_TELEMETRY_ALIASES: Record<string, string[]> = {
  planning_agent: ['analysis_payload', 'combined_data'],
  clarifier: ['clarified_requirements', 'raw_requirements'],
  lifecycle: ['traceability_matrix', 'combined_data'],
  gate_enforcer: ['logic_audit_report', 'compliance_report', 'final_synthesis'],
  auditor: ['logic_audit_report', 'compliance_report'],
  logician: ['analysis_payload'],
  governor: ['compliance_report', 'logic_audit_report'],
  critic: ['logic_audit_report', 'logic_audit_feedback'],
  compliance_remediation: ['compliance_remediation_config', 'compliance_report'],
  monitor: ['production_monitors', 'observability_intelligence'],
  defect_learner: ['platform_meta_intelligence', 'eng_knowledge_graph'],
  agent_2: ['strategy_blueprint'],
  test_impact: ['test_impact_config', 'impact_analysis'],
  regression: ['regression_priority'],
  synthesis_optimizer: ['combined_data'],
  synthesis_final: ['final_synthesis'],
  creator: ['test_cases', 'analysis_payload'],
  data_builder: ['test_data_samples'],
  exploratory_test_assistant: ['exploratory_test_assistant'],
  api_validation: ['api_validation_config', 'mock_specs', 'api_test_code'],
  api_mock: ['mock_specs'],
  graphql_validation: ['graphql_validation'],
  automation_forge: ['automation_bootstrap'],
  api_coder: ['api_test_code'],
  auto_migration_assistant: ['auto_migration_assistant'],
  cross_browser: ['cross_browser_config'],
  mobile_testing: ['mobile_test_config'],
  visual_intel: ['visual_checkpoints'],
  i18n_test_assistant: ['i18n_test_assistant'],
  run_orchestrator: ['execution_plan'],
  delivery: ['progressive_delivery'],
  feature_flag: ['feature_flag_tests'],
  mutation_test_assistant: ['mutation_test_assistant'],
  env_provisioner: ['environment_config'],
  digital_twin: ['digital_twin_config'],
  env_consistency: ['env_consistency_config'],
  performance: ['performance_config'],
  chaos: ['chaos_scenarios', 'system_resilience'],
  perf_intelligence_config: ['perf_intelligence_config', 'perf_intelligence'],
  system_resilience: ['system_resilience', 'sys_resilience'],
  security: ['security_signals'],
  pen_test: ['security_signals'],
  microservices: ['microservices_config'],
  tracing: ['distributed_traces'],
  data_pipeline: ['database_pipeline_config'],
  event_driven: ['event_driven_config'],
  rca_intelligence: ['rca_intelligence', 'autonomous_rca'],
  incident_remediation: ['incident_remediation'],
  observability_intelligence: ['observability_intelligence', 'observability_intel'],
  self_healing: ['self_healing_config'],
  locator_intelligence: ['locator_intelligence'],
  suite_optimization: ['suite_optimization_config'],
  reliability_eng: ['reliability_eng', 'reliability_config'],
  slo: ['sla_slo_audit'],
  ux_intelligence: ['ux_intelligence_config'],
  a11y_intel: ['ux_intelligence_config'],
  release_risk_decision: ['release_risk_decision', 'release_risk'],
  business_impact_intelligence: ['business_impact_intelligence', 'business_impact'],
  eng_economics_roi: ['eng_economics_roi'],
  eng_knowledge_graph: ['eng_knowledge_graph', 'knowledge_graph'],
  platform_meta_intelligence: ['platform_meta_intelligence', 'meta_intelligence'],
  test_case_factory: ['final_synthesis', 'analysis_payload'],
  writer: ['final_synthesis', 'markdown_preview', 'analysis_payload'],
  // === SHORT-KEY ALIASES (workflow node name → state key) ===
  // These match the MASTER_AGENTS keys after the NEW-001/002 fix
  perf_intel: ['perf_intelligence_config', 'perf_intelligence'],
  sys_resil: ['system_resilience', 'sys_resilience'],
  rel_risk: ['release_risk_decision', 'release_risk'],
  biz_impact: ['business_impact_intelligence', 'business_impact'],
  roi_intel: ['eng_economics_roi'],
  knowledge_graph: ['eng_knowledge_graph', 'knowledge_graph'],
  meta_intel: ['platform_meta_intelligence', 'meta_intelligence'],
  exploratory: ['exploratory_test_assistant'],
  migration: ['auto_migration_assistant'],
  i18n_testing: ['i18n_test_assistant'],
  mutation: ['mutation_test_assistant'],
  rca_intel: ['rca_intelligence', 'autonomous_rca'],
  inc_remed: ['incident_remediation'],
  obs_intel: ['observability_intelligence', 'observability_intel'],
  locator: ['locator_intelligence'],
  ingestor: ['combined_data', 'raw_requirements'],
};

export const normalizeMeshKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const parseTelemetryValue = (value: any): any => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const looksJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!looksJson) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const hasTelemetryContent = (value: any): boolean => {
  const parsed = parseTelemetryValue(value);

  if (parsed === null || parsed === undefined) return false;
  if (typeof parsed === 'string') return parsed.trim().length > 0;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;

  return Boolean(parsed);
};

export const getTelemetryAliases = (nodeKey: string) => {
  const aliases = [nodeKey, ...(NODE_TELEMETRY_ALIASES[nodeKey] || [])];
  return Array.from(new Set(aliases));
};

const findValueByAliases = (
  branch: any,
  aliases: string[]
): { key: string; value: any } | null => {
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return null;

  const entries = Object.entries(branch as Record<string, any>);
  const normalizedAliases = aliases.map(normalizeMeshKey);

  for (const alias of normalizedAliases) {
    const exactMatch = entries.find(([key]) => normalizeMeshKey(key) === alias);
    if (exactMatch && hasTelemetryContent(exactMatch[1])) {
      return { key: exactMatch[0], value: exactMatch[1] };
    }
  }

  for (const alias of normalizedAliases) {
    const fuzzyMatch = entries.find(([key]) => {
      const normalizedKey = normalizeMeshKey(key);
      return (
        normalizedKey.includes(alias) ||
        alias.includes(normalizedKey)
      );
    });

    if (fuzzyMatch && hasTelemetryContent(fuzzyMatch[1])) {
      return { key: fuzzyMatch[0], value: fuzzyMatch[1] };
    }
  }

  return null;
};

export const resolveNodeTelemetry = ({
  nodeKey,
  telemetryState = {},
  fullMeshState,
}: ResolveNodeTelemetryOptions): TelemetryResolution => {
  const manualTelemetry = parseTelemetryValue(telemetryState[nodeKey]);
  if (hasTelemetryContent(manualTelemetry)) {
    return {
      data: manualTelemetry,
      source: 'manual',
      sourcePath: `manualTelemetry.${nodeKey}`,
      matchedKey: nodeKey,
    };
  }

  const aliases = getTelemetryAliases(nodeKey);
  const searchSpaces: Array<{ source: TelemetrySource; path: string; branch: any }> = [
    { source: 'mesh', path: 'full_state', branch: fullMeshState },
    { source: 'analysis', path: 'analysis_payload', branch: fullMeshState?.analysis_payload },
    {
      source: 'final_synthesis',
      path: 'final_synthesis.raw_mesh_data',
      branch: fullMeshState?.final_synthesis?.raw_mesh_data,
    },
    { source: 'final_synthesis', path: 'final_synthesis', branch: fullMeshState?.final_synthesis },
  ];

  for (const searchSpace of searchSpaces) {
    const match = findValueByAliases(searchSpace.branch, aliases);
    if (match) {
      return {
        data: parseTelemetryValue(match.value),
        source: searchSpace.source,
        sourcePath: `${searchSpace.path}.${match.key}`,
        matchedKey: match.key,
      };
    }
  }

  return {
    data: null,
    source: 'unresolved',
  };
};
