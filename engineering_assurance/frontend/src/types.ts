export interface Platform {
  id: string;
  name: string;
  icon: string;
  category: string;
  desc: string;
  features: string[];
  implemented: boolean;
  requires_credentials?: boolean;
}

export interface ConnectionConfig {
  url: string;
  email?: string;
  token?: string;
  consent?: any;
}

export interface FetchSource {
  platform: string;
  ticket_id: string;
  config?: ConnectionConfig;
}

export interface RiskItem {
  area: string;
  likelihood: string;
  impact: string;
  risk_score?: number;
  reason: string;
  mitigation: string;
}

export interface BDDScenario {
  feature: string;
  scenario: string;
}

export interface TestCase {
  id: string;
  title: string;
  requirement_id?: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: string;
  scenario?: string;
  steps: string[];
  expected: string;
}

export interface IntelligenceMetrics {
  requirement_coverage: string;
  sla_confidence: string;
  risk_density: string;
  agent_efficiency: string;
  logic_stability: string;
}

export interface TestPlanPayload {
  abstract_summary?: string;
  strategic_approach?: string;
  objective?: {
    goal: string;
    target_system: string;
  };
  scope?: {
    inclusions: string[];
    exclusions: string[];
    gherkin_scenarios: BDDScenario[];
  };
  test_cases?: TestCase[];
  intelligence_metrics?: IntelligenceMetrics;
  risk_matrix?: RiskItem[];
  test_strategy_recommendations?: {
    unit: string;
    api: string;
    ui: string;
    perf: string;
    security: string;
  };
  test_environments?: Array<{
    name: string;
    os: string[];
    browsers: string[];
    devices: string[];
  }>;
  schedule?: Array<{
    task: string;
    duration: string;
  }>;
  mesh_topology?: {
    mesh_id: string;
    nodes: Array<{
      id: string;
      label: string;
      agent: string;
      status: 'pending' | 'active' | 'completed' | 'failed';
    }>;
    active_node_id: string;
  };
}

export interface LLMIdentity {
  id: number;
  provider: string;
  model: string;
  status: 'active' | 'standby' | 'rotated' | 'revoked';
  usage: number;
  requests: number;
  last_used?: string;
  key_masked: string;
}

export interface LLMTierPool {
  id: number;
  tier: string;
  policy: { mode: string; token_threshold: number };
  identities: LLMIdentity[];
}

export interface Status {
  type: 'info' | 'success' | 'warn' | 'error' | '';
  text: string;
}

export interface LLMConfig {
  tier?: string;
  provider: string;
  url: string;
  key: string;
  model: string;
}
