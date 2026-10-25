import React from 'react';
import { getDepthPresetKeys, normalizeAgentKey, resolveAgentMode } from '../constants/agentMesh';

interface AgentRegistryProps {
  activeAgents: Record<string, any>;
  selectedDepth: string;
  onBatchUpdate: (ids: string[], mode: 'auto' | 'manual' | 'bypass') => void;
  onSingleUpdate: (id: string, mode: 'auto' | 'manual' | 'bypass') => void;
}

interface AgentEntry {
  id: number;
  name: string;
  subTitle: string;
  mission: string;
  deepContext: string;
  crewRole: string;
  status: 'active' | 'pipeline' | 'beta';
  capability: 'Intelligence' | 'Synthesis' | 'Automation' | 'Operations' | 'Security' | 'Reliability';
  key?: string;
}

const AgentRegistry: React.FC<AgentRegistryProps> = ({ activeAgents, selectedDepth, onBatchUpdate, onSingleUpdate }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  
  const PROTECTED_CREWS = ['Strategic Command', 'Logic & Compliance', 'Strategy & Impact'];

  // Rich Context Injection for Premium High-Fidelity Tooltips
  const agents: AgentEntry[] = [
    // === PILLAR 1: FOUNDATION MESH ===
    // Crew: Strategic Command
    { id: 0, name: 'Requirements Ingestor', subTitle: 'Strategic Command', mission: 'Parallel ALM ingestion and unified context contract synthesis.', status: 'active', capability: 'Intelligence', key: 'ingestor', deepContext: 'Consolidates incoming requirement sources into the initial mesh contract.', crewRole: 'Ingress: Normalizes requirement intake.' },
    { id: 1, name: 'Intelligent Test Planner', subTitle: 'Strategic Command', mission: 'Strategic orchestration and mesh DAG management.', status: 'active', capability: 'Intelligence', key: 'planning_agent', deepContext: 'Ingests multidimensional requirements and autonomously constructs a Directed Acyclic Graph (DAG) for execution.', crewRole: 'Primary Router: Delegates parsed context.' },
    { id: 3, name: 'Requirement Clarifier', subTitle: 'Strategic Command', mission: 'Sanitizes and hardens ambiguous requirements.', status: 'active', capability: 'Intelligence', key: 'clarifier', deepContext: 'Detects logical contradictions and missing acceptance criteria using semantic validation models.', crewRole: 'Sanitization: Ensures only bulletproof logic reaches the Factory tier.' },
    { id: 4, name: 'Lifecycle Tracker', subTitle: 'Strategic Command', mission: 'Global real-time agent mesh monitoring.', status: 'active', capability: 'Operations', key: 'lifecycle', deepContext: 'Maintains long-term state persistence and tracks mutation rates of requirements across active sprints.', crewRole: 'Observer: Broadcasts state-change telemtry.' },
    { id: 0, name: 'Synthesis Initial', subTitle: 'Strategic Command', mission: 'Initial synthesis bridge for requirement shaping.', status: 'active', capability: 'Intelligence', key: 'synthesis_initial', deepContext: 'Consolidates early requirement signals before they are hardened into the factory mesh.', crewRole: 'Bridge: Prepares the unified synthesis contract.' },

    // Crew: Logic & Compliance
    { id: 9, name: 'Traceability Auditor', subTitle: 'Logic & Compliance', mission: 'Enforces bidirectional requirement-to-test mapping.', status: 'active', capability: 'Intelligence', key: 'auditor', deepContext: 'Scans the generated matrix to ensure 100% path coverage.', crewRole: 'Validation Gate: Blocks orphans.' },
    { id: 20, name: 'Systems Logician', subTitle: 'Logic & Compliance', mission: 'Formal semantic logic verification.', status: 'active', capability: 'Reliability', key: 'logician', deepContext: 'Applies rigorous mathematical logic checks to ensure test transition states do not violate system invariants.', crewRole: 'Logic Gateway: Truth-tables validator.' },
    { id: 21, name: 'Compliance Governor', subTitle: 'Logic & Compliance', mission: 'SOC2/GDPR/HIPAA compliance engine.', status: 'active', capability: 'Security', key: 'governor', deepContext: 'Cross-references test plans against enterprise security regulations.', crewRole: 'Compliance Enforcer.' },
    { id: 27, name: 'Autonomous Compliance', subTitle: 'Logic & Compliance', mission: 'Automatically fix PCI/GDPR compliance.', status: 'active', capability: 'Security', key: 'compliance_remediation', deepContext: 'Issues PRs directly against repositories when code drift violates Data Loss Prevention (DLP).', crewRole: 'Active Remediator.' },

    // Crew: Economics & Risk
    { id: 50, name: 'Release Risk & Decision', subTitle: 'Economics & Risk', mission: 'Calculate release readiness using quality risk density.', status: 'active', capability: 'Operations', key: 'release_risk_decision', deepContext: 'Provides a mathematical Go/No-Go score based on current defect density.', crewRole: 'Decision Support.' },
    { id: 51, name: 'Business Impact Intel', subTitle: 'Economics & Risk', mission: 'Quantify revenue-at-risk for identified defects.', status: 'active', capability: 'Operations', key: 'business_impact_intelligence', deepContext: 'Maps technical failures to monetary loss, prioritizing engineering focus.', crewRole: 'Economist.' },
    { id: 52, name: 'ROI & Engineering Economics', subTitle: 'Economics & Risk', mission: 'Financial ROI analysis of testing spend.', status: 'active', capability: 'Operations', key: 'eng_economics_roi', deepContext: 'Calculates the cost-per-test and automation ROI across the entire SLC.', crewRole: 'FinOps Optimizer.' },

    // Crew: Knowledge Engine
    { id: 53, name: 'Engineering Knowledge Graph', subTitle: 'Knowledge Engine', mission: 'Update the global agentic knowledge graph.', status: 'active', capability: 'Intelligence', key: 'eng_knowledge_graph', deepContext: 'Semantic entity mapping across requirements, code, and defects.', crewRole: 'Knowledge Architect.' },
    { id: 54, name: 'Meta Intelligence Agent', subTitle: 'Knowledge Engine', mission: 'Self-optimizing mesh logic and reasoning learning.', status: 'active', capability: 'Intelligence', key: 'platform_meta_intelligence', deepContext: 'Monitors the mesh efficiency, adjusting agent prompts natively.', crewRole: 'Mesh Optimizer.' },
    { id: 25, name: 'Monitor QA History', subTitle: 'Knowledge Engine', mission: 'Shift-right observability and history.', status: 'active', capability: 'Operations', key: 'monitor', deepContext: 'Archives executing run states, building ML profiles on module bug densities.', crewRole: 'Data Warehouse.' },

    // === PILLAR 2: ARTIFACT FACTORY ===
    // Crew: Strategy & Impact
    { id: 2, name: 'Test Strategy Builder', subTitle: 'Strategy & Impact', mission: 'Defines testing pyramid and risk approach.', status: 'active', capability: 'Synthesis', key: 'agent_2', deepContext: 'Calculates optimal ratios for Unit, Integration, and E2E coverage.', crewRole: 'Architect.' },
    { id: 13, name: 'Test Impact Intelligence', subTitle: 'Strategy & Impact', mission: 'Calculates structural dependencies.', status: 'active', capability: 'Intelligence', key: 'test_impact', deepContext: 'Analyzes Git diffs to selectively trigger only affected test nodes.', crewRole: 'Blast-Radius Screener.' },
    { id: 14, name: 'Regression Prioritization', subTitle: 'Strategy & Impact', mission: 'AI-driven impact analysis.', status: 'active', capability: 'Reliability', key: 'regression', deepContext: 'Categorizes critical path regressions and schedules highest-risk tests to run first.', crewRole: 'Traffic Controller.' },
    { id: 5, name: 'Synthesis Optimizer', subTitle: 'Strategy & Impact', mission: 'Holistic cross-tier output normalization.', status: 'active', capability: 'Synthesis', key: 'synthesis_optimizer', deepContext: 'Prunes redundant scenarios and merges boundaries to accelerate builds.', crewRole: 'Finalizer.' },

    // Crew: Scenario & Data Forge
    { id: 6, name: 'Test Case Creator', subTitle: 'Scenario & Data Forge', mission: 'Generates BDD atomic test scenarios.', status: 'active', capability: 'Synthesis', key: 'creator', deepContext: 'Transforms hardened requirements into executable Given/When/Then blocks.', crewRole: 'Factory Core.' },
    { id: 7, name: 'Test Data Builder', subTitle: 'Scenario & Data Forge', mission: 'Provisions PII-masked synthetic test data.', status: 'active', capability: 'Synthesis', key: 'data_builder', deepContext: 'Dynamically generates realistic JSON/SQL free of production intelligence.', crewRole: 'Supplier.' },
    { id: 55, name: 'Exploratory Assistant', subTitle: 'Scenario & Data Forge', mission: 'AI-guided exploratory charters.', status: 'active', capability: 'Automation', key: 'exploratory_test_assistant', deepContext: 'Suggests high-yield manual testing paths that automation overlooked.', crewRole: 'Human Copilot.' },

    // Crew: API Virtualization
    { id: 12, name: 'API Validation & Dependency', subTitle: 'API Virtualization', mission: 'Isolates external API boundary contracts.', status: 'active', capability: 'Reliability', key: 'api_validation', deepContext: 'Audits REST/gRPC boundary schemas for strict adherence.', crewRole: 'Boundary Inspector.' },
    { id: 8, name: 'API Mock Virtualizer', subTitle: 'API Virtualization', mission: 'Stabilizes environment dependencies.', status: 'active', capability: 'Synthesis', key: 'api_mock', deepContext: 'Spins up ephemeral stateful stubs mimicking 3rd-party services.', crewRole: 'Isolator.' },
    { id: 32, name: 'GraphQL Validation', subTitle: 'API Virtualization', mission: 'Scans graph endpoints and resolvers.', status: 'active', capability: 'Automation', key: 'graphql_validation', deepContext: 'Detects deep nesting attacks and strict resolver limits.', crewRole: 'Query Shield.' },

    // === PILLAR 3: EXECUTION ARRAY ===
    // Crew: Code Generators
    { id: 10, name: 'Automation Forge', subTitle: 'Code Generators', mission: 'Bootstraps project scaffolds.', status: 'active', capability: 'Automation', key: 'automation_forge', deepContext: 'Infrastructural agent that writes Page Object Models and spins Cypress repos.', crewRole: 'UI SDET.' },
    { id: 11, name: 'API Automation Generator', subTitle: 'Code Generators', mission: 'Synthesizes executable API test scripts.', status: 'active', capability: 'Automation', key: 'api_coder', deepContext: 'Codes high-fidelity PyTest/RestAssured scripts via enterprise auth.', crewRole: 'Backend SDET.' },
    { id: 57, name: 'Automation Migration Agent', subTitle: 'Code Generators', mission: 'Legacy script-to-Playwright migration.', status: 'active', capability: 'Automation', key: 'auto_migration_assistant', deepContext: 'Refactors legacy Selenium/JMeter scripts into high-speed modern equivalents.', crewRole: 'Tech-Debt Converter.' },

    // Crew: Interface & Mobile
    { id: 29, name: 'Cross-Browser Agent', subTitle: 'Interface & Mobile', mission: 'Validates DOM execution across browsers.', status: 'active', capability: 'Automation', key: 'cross_browser', deepContext: 'Farms executions concurrently across Chrome, Edge, Safari engines.', crewRole: 'Web Validator.' },
    { id: 28, name: 'Mobile App Testing', subTitle: 'Interface & Mobile', mission: 'Appium/Espresso for iOS/Android.', status: 'active', capability: 'Automation', key: 'mobile_testing', deepContext: 'Navigates native application hierarchies mapping gesture physics.', crewRole: 'Native Validator.' },
    { id: 39, name: 'Visual Testing Intelligence', subTitle: 'Interface & Mobile', mission: 'Automates pixel-perfect UI audits.', status: 'active', capability: 'Automation', key: 'visual_intel', deepContext: 'Tracks CSS/DOM mutations and exact snapshot variances.', crewRole: 'Pixel Auditor.' },
    { id: 59, name: 'i18n Assistant', subTitle: 'Interface & Mobile', mission: 'Global localization readiness audit.', status: 'active', capability: 'Operations', key: 'i18n_test_assistant', deepContext: 'Verifies regional compliance (RTL, currency) across locales.', crewRole: 'Globalizer.' },

    // Crew: Orchestration Matrix
    { id: 15, name: 'Execution Orchestrator', subTitle: 'Orchestration Matrix', mission: 'Manages parallel run distribution.', status: 'active', capability: 'Operations', key: 'run_orchestrator', deepContext: 'Distributes workloads across cloud containers without race conditions.', crewRole: 'Commander.' },
    { id: 23, name: 'Progressive Delivery', subTitle: 'Orchestration Matrix', mission: 'Canary analysis and rollback triggers.', status: 'active', capability: 'Operations', key: 'delivery', deepContext: 'Monitors blue/green deployments actively comparing vitals.', crewRole: 'Release Gateway.' },
    { id: 34, name: 'Feature Flag Testing', subTitle: 'Orchestration Matrix', mission: 'Validates flag combinations.', status: 'active', capability: 'Synthesis', key: 'feature_flag', deepContext: 'Executes multivariate combination matrices for flipped toggles.', crewRole: 'Conflict Resolver.' },
    { id: 58, name: 'Mutation Testing Assistant', subTitle: 'Orchestration Matrix', mission: 'Identify coverage weaknesses via mutation.', status: 'active', capability: 'Reliability', key: 'mutation_test_assistant', deepContext: 'Injects code faults to verify the existing test suite will catch them.', crewRole: 'Audit of Auditors.' },

    // Crew: Cloud Environments
    { id: 16, name: 'Environment Provisioner', subTitle: 'Cloud Environments', mission: 'Dynamic Docker/K8s provisioning.', status: 'active', capability: 'Operations', key: 'env_provisioner', deepContext: 'Spins up exact replica testing rings utilizing Terraform/Ansible.', crewRole: 'Resource Manager.' },
    { id: 42, name: 'Digital Twin Simulation', subTitle: 'Cloud Environments', mission: 'Mirror production telemetry to staging.', status: 'active', capability: 'Synthesis', key: 'digital_twin', deepContext: 'Feeds live production traffic patterns into QA testing layers.', crewRole: 'Simulation Engine.' },
    { id: 37, name: 'Environment Consistency', subTitle: 'Cloud Environments', mission: 'Identify configuration drift.', status: 'active', capability: 'Operations', key: 'env_consistency', deepContext: 'Compares infrastructure matrices to alert on silent drift.', crewRole: 'Drift Monitor.' },

    // === PILLAR 4: NFR & GUARDS ===
    // Crew: Performance & Chaos
    { id: 17, name: 'Performance Architect', subTitle: 'Performance & Chaos', mission: 'Derives load profiles and thresholds.', status: 'active', capability: 'Reliability', key: 'performance', deepContext: 'Models TPS limits, configuring JMeter/K6 definitions.', crewRole: 'NFR Specialist.' },
    { id: 26, name: 'Chaos Engineering', subTitle: 'Performance & Chaos', mission: 'Designs failure injection experiments.', status: 'active', capability: 'Reliability', key: 'chaos', deepContext: 'Randomly terminates pods to map systemic cascade limits.', crewRole: 'Stress Validator.' },
    { id: 45, name: 'Performance Intelligence', subTitle: 'Performance & Chaos', mission: 'Deep-dive latency and bottleneck analysis.', status: 'active', capability: 'Intelligence', key: 'perf_intelligence_config', deepContext: 'Predicts performance regressions via advanced topological modeling.', crewRole: 'Latency Analyst.' },
    { id: 49, name: 'System Resilience', subTitle: 'Performance & Chaos', mission: 'Chaos engineering audit and resilience coverage.', status: 'active', capability: 'Reliability', key: 'system_resilience', deepContext: 'Audits the blast-radius of extreme simulated global outages.', crewRole: 'Resilience Audit.' },

    // Crew: Security (ASPM+)
    { id: 18, name: 'Security Intelligence', subTitle: 'Security (ASPM+)', mission: 'ASPM+ threat modeling and scanning.', status: 'active', capability: 'Security', key: 'security', deepContext: 'Dynamically probes for OWASP Top 10 vulnerabilities.', crewRole: 'Penetrator.' },

    // Crew: Backend Architecture
    { id: 30, name: 'Microservices Intel', subTitle: 'Backend Architecture', mission: 'Validates service-to-service mesh logic.', status: 'active', capability: 'Intelligence', key: 'microservices', deepContext: 'Evaluates asynchronous communications via Istio proxy sidecars.', crewRole: 'Topology Monitor.' },
    { id: 41, name: 'Distributed Tracing', subTitle: 'Backend Architecture', mission: 'Audits correlation IDs and sampling.', status: 'active', capability: 'Operations', key: 'tracing', deepContext: 'Follows cross-boundary transaction traces to isolate latency chokepoints.', crewRole: 'Investigator.' },
    { id: 33, name: 'Data Pipeline Agent', subTitle: 'Backend Architecture', mission: 'Assess read/write and ETL latency.', status: 'active', capability: 'Operations', key: 'data_pipeline', deepContext: 'Tests the integrity of massive transactional database migrations.', crewRole: 'Data Validator.' },
    { id: 31, name: 'Event-Driven Testing', subTitle: 'Backend Architecture', mission: 'Test async message queues latency.', status: 'active', capability: 'Synthesis', key: 'event_driven', deepContext: 'Simulates dead-letter queues and Kafka partition rebalancing.', crewRole: 'Async Auditor.' },

    // === PILLAR 5: SRE & UX CONTINUITY ===
    // Crew: Incident Command
    { id: 47, name: 'Autonomous RCA', subTitle: 'Incident Command', mission: 'Predictive Root Cause Analysis of failure patterns.', status: 'active', capability: 'Intelligence', key: 'rca_intelligence', deepContext: 'Analyzes execution logs automatically isolating offending code commits.', crewRole: 'Code Investigator.' },
    { id: 48, name: 'Incident Remediation', subTitle: 'Incident Command', mission: 'Self-healing playbooks and response strategy.', status: 'active', capability: 'Reliability', key: 'incident_remediation', deepContext: 'Generates emergency patch strategies from historical incident signatures.', crewRole: 'First Responder.' },
    { id: 46, name: 'Observability & Quality Intel', subTitle: 'Incident Command', mission: 'Real-time monitoring hooks and telemetry.', status: 'active', capability: 'Intelligence', key: 'observability_intelligence', deepContext: 'Integrates with Splunk/DataDog injecting live quality signals into mesh nodes.', crewRole: 'Telemetry Sync.' },

    // Crew: Self-Healing Dynamics
    { id: 43, name: 'Self-Healing Gateway', subTitle: 'Self-Healing Dynamics', mission: 'Injects adaptive selectors and retries.', status: 'active', capability: 'Reliability', key: 'self_healing', deepContext: 'Intervenes during runtime utilizing AST to contextualize patching.', crewRole: 'Resilience Base.' },
    { id: 56, name: 'Locator Intelligence', subTitle: 'Self-Healing Dynamics', mission: 'Resilient DOM locator optimization.', status: 'active', capability: 'Automation', key: 'locator_intelligence', deepContext: 'Pre-emptively strengthens DOM selectors against approaching UI shifts.', crewRole: 'Tech Base.' },
    { id: 38, name: 'Test Suite Optimizer', subTitle: 'Self-Healing Dynamics', mission: 'Truncate redundant paths and scan code.', status: 'active', capability: 'Automation', key: 'suite_optimization', deepContext: 'Operates heuristically on locators directly refactoring old/dead components.', crewRole: 'Refactoring Engine.' },

    // Crew: SRE & Reliability
    { id: 44, name: 'Reliability Engineering', subTitle: 'SRE & Reliability', mission: 'Flaky test detection and quarantine.', status: 'active', capability: 'Reliability', key: 'reliability_eng', deepContext: 'Statistically isolates non-deterministic test pipelines and actively quarantines.', crewRole: 'Execution Quarantine.' },
    { id: 40, name: 'SLA/SLO Compliance', subTitle: 'SRE & Reliability', mission: 'SRE compliance and budget targets.', status: 'active', capability: 'Reliability', key: 'slo', deepContext: 'Translates latencies into Service Level objective burn-rates.', crewRole: 'Exec Enforcer.' },
    
    // Crew: UX Monitoring
    { id: 35, name: 'UX Intelligence Agent', subTitle: 'UX Monitoring', mission: 'Checks animation jank and paint metrics.', status: 'active', capability: 'Reliability', key: 'ux_intelligence', deepContext: 'Tracks cumulative layout shift and FID scoring user accessibility bounds.', crewRole: 'Jank Tracking.' },

    // === PILLAR 6: MISSION OPERATIONS ===
    // Crew: Release Commander
    { id: 60, name: 'Release Commander', subTitle: 'Release Commander', mission: 'Final production gatekeeper and release sign-off.', status: 'active', capability: 'Operations', key: 'release_commander', deepContext: 'Synthesizes cross-mesh findings from security, performance, and compliance into a final Go/No-Go release directive.', crewRole: 'Supreme Gatekeeper: Production Sign-off.' },
    
    // Crew: Trend Analyst
    { id: 61, name: 'Trend Analyst', subTitle: 'Trend Analyst', mission: 'Cross-mission regression tracking and analytics.', status: 'active', capability: 'Operations', key: 'trend_analyst', deepContext: 'Analyzes historical mission drift and logic regressions across long-term execution windows.', crewRole: 'Data Scientist: Drift Detection.' }
  ];

  const synthesisFinalEntry: AgentEntry = {
    id: 62,
    name: 'Synthesis Final',
    subTitle: 'Synthesis Core',
    mission: 'Final synthesis bridge for executive report consolidation.',
    status: 'active',
    capability: 'Intelligence',
    key: 'synthesis_final',
    deepContext: 'Merges all prior mesh outputs into the final governance package.',
    crewRole: 'Bridge: Finalizes the mission contract.',
  };

  const agentsWithSynthesis: AgentEntry[] = [...agents, synthesisFinalEntry];

  const filteredAgents = searchTerm
    ? agentsWithSynthesis.filter(a => 
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.subTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.capability.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : agentsWithSynthesis;

  const subTitles = [...new Set(filteredAgents.map(a => a.subTitle))];

  const handleCrewToggleClick = (e: React.MouseEvent, title: string, isCrewActive: boolean, isCrewPartial: boolean, subAgents: AgentEntry[]) => {
     e.preventDefault(); e.stopPropagation();
     const isProtected = PROTECTED_CREWS.includes(title);
     
     if (isProtected && (isCrewActive || isCrewPartial)) {
        const confirmMsg = 
           "⚠️ CRITICAL SYSTEM GUARDRAIL\n\n" +
           `The '${title}' Crew is a mission-critical reasoning segment.\n\n` +
           "Bypassing this logic will prevent the A.N.T. Mesh from planning or validating test scenarios accurately.\n\n" +
           "Do you want to FORCE deactivation of the Core Tier?";
        if (!window.confirm(confirmMsg)) return;
     }

     const targetMode = isCrewActive ? 'bypass' : 'manual';
     onBatchUpdate(subAgents.map(a => a.key || `agent_${a.id}`), targetMode);
  };

  const handleIndividualToggleClick = (title: string, agentKey: string, currentMode: string, activeCountInCrew: number, agentName: string) => {
     const isProtected = PROTECTED_CREWS.includes(title);
     const isNodeCurrentlyActive = currentMode !== 'bypass';

     if (isProtected && isNodeCurrentlyActive) {
       const isLastNode = activeCountInCrew === 1;
       const confirmMsg = 
           "⚠️ CRITICAL SYSTEM GUARDRAIL\n\n" +
           `The specialist '${agentName}' belongs to the mission-critical '${title}' Core.\n\n` +
           (isLastNode 
             ? "This is the LAST active node in this layer! Bypassing it will completely sever this core reasoning capability.\n\n"
             : "Bypassing this node will degrade the structural integrity and validation quality of the A.N.T. Mesh.\n\n") +
           "Do you want to FORCE bypass for this node?";
           
       if (!window.confirm(confirmMsg)) return;
     }

     const targetMode = isNodeCurrentlyActive ? 'bypass' : 'manual';
     onSingleUpdate(agentKey, targetMode);
  };

  const totalAgentsCount = getDepthPresetKeys('full').length;
  const allPresetKeys = getDepthPresetKeys('full');
  const globalActiveCount = allPresetKeys.filter((key) => resolveAgentMode(selectedDepth, activeAgents, key) !== 'bypass').length;

  return (
    <div className="agent-registry-view animate-fadeIn">
      <header className="registry-compact-header" style={{ 
        padding: '1.5rem 2rem', 
        background: '#ffffff', 
        borderBottom: '1px solid #e2e8f0', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        gap: '1.25rem',
        flexShrink: 0
      }}>
        <div className="header-meta" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
             <div className="mesh-status-indicator" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontSize: '0.65rem', 
                fontWeight: 950, 
                color: '#10b981', 
                textTransform: 'uppercase', 
                letterSpacing: '2px',
                background: 'rgba(16,185,129,0.08)',
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(16,185,129,0.15)'
             }}>
                <div className="dot pulse" style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }}></div>
                <span>A.N.T. Mesh Active</span>
             </div>
             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Mesh Registry
             </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.04em', lineHeight: 1 }}>
             Sovereign Specialist <span style={{ color: '#6366f1' }}>Registry</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: '#64748b', fontWeight: 500, maxWidth: '560px' }}>
             Real-time configuration matrix for the agent ecosystem. Manage autonomous reasoning depths and mission policies.
          </p>
        </div>
        
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
           <div className="global-telemetry-badge" style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'flex-end',
              background: '#f8fafc',
              padding: '10px 16px',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
           }}>
              <span className="telemetry-label" style={{ fontSize: '0.58rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Deployment Density</span>
              <span className="telemetry-value" style={{ fontSize: '1.2rem', fontWeight: 950, color: '#4f46e5', letterSpacing: '-0.5px' }}>
                {globalActiveCount} <span style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '1rem' }}>/ {totalAgentsCount} Nodes</span>
              </span>
           </div>
           
           <div className="compact-search" style={{ 
             position: 'relative', 
             display: 'flex', 
             alignItems: 'center', 
             background: '#f1f5f9', 
             borderRadius: '14px', 
             padding: '0 16px', 
             width: '290px', 
             border: '1px solid transparent',
             transition: 'all 0.3s ease'
           }}>
              <i className="ti-search" style={{ color: '#6366f1', fontSize: '1.1rem' }}></i>
              <input 
                type="text" 
                placeholder="Query mesh specialty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  padding: '11px 12px', 
                  fontSize: '0.9rem', 
                  width: '100%', 
                  outline: 'none', 
                  color: '#1e293b', 
                  fontWeight: 600 
                }}
              />
           </div>
        </div>
      </header>

      <div className="registry-fluid-masonry">
        {subTitles.length === 0 ? (
           <div className="no-agents-slate">
              <i className="ti-face-sad"></i>
              <p>No specialist matches in current registry view.</p>
           </div>
        ) : subTitles.map(title => {
          const subAgents = filteredAgents.filter(a => a.subTitle === title);
          const isProtected = PROTECTED_CREWS.includes(title);
          
          const activeCount = subAgents.filter(a => {
            const key = normalizeAgentKey(a.key || `agent_${a.id}`);
            const mode = resolveAgentMode(selectedDepth, activeAgents, key);
            return mode !== 'bypass';
          }).length;

          const isCrewActive = activeCount === subAgents.length;
          const isCrewPartial = activeCount > 0 && activeCount < subAgents.length;

          let crewToggleStyle = isCrewActive ? 'active' : (isCrewPartial ? 'partial' : '');

          return (
            <div key={title} className={`department-mosaic-block ${isProtected ? 'protected-crew' : ''}`}>
               <div className="mosaic-header">
                  <div className="title-area">
                     <span className="accent-bar"></span>
                     <h4>{title}</h4>
                     {isProtected && <i className="ti-shield security-shield-icon" title="Mission Critical Core Crew"></i>}
                  </div>
                  <div 
                    className={`crew-batch-toggle ${crewToggleStyle} ${isProtected ? 'protected-toggle' : ''}`}
                    onClick={(e) => handleCrewToggleClick(e, title, isCrewActive, isCrewPartial, subAgents)}
                  >
                     <div className="toggle-label" style={{ pointerEvents: 'none' }}>
                        {isCrewActive ? 'ALL ACTIVE' : (isCrewPartial ? 'PARTIAL' : 'INACTIVE')}
                     </div>
                     <div className="toggle-track" style={{ pointerEvents: 'none' }}>
                        <div className="toggle-thumb"></div>
                     </div>
                  </div>
               </div>
               
               <div className="node-flow-grid">
                  {subAgents.map(agent => {
                    const sysKey = normalizeAgentKey(agent.key || `agent_${agent.id}`);
                    const currentMode = resolveAgentMode(selectedDepth, activeAgents, sysKey);
                    
                    const isNodeActive = currentMode !== 'bypass';
                    
                    return (
                      <div 
                        key={agent.id} 
                        className={`mini-node interactive-node ${isNodeActive ? 'active' : 'dormant'}`}
                        onClick={() => handleIndividualToggleClick(title, sysKey, currentMode, activeCount, agent.name)}
                        onMouseEnter={(e) => {
                           const rect = e.currentTarget.getBoundingClientRect();
                           // Dynamic flip: deploy upwards if node is in the bottom 45% of screen
                           if (rect.top > window.innerHeight * 0.55) {
                              e.currentTarget.classList.add('flyover-up');
                           } else {
                              e.currentTarget.classList.remove('flyover-up');
                           }
                        }}
                      >
                         <div className="node-state-dot"></div>
                         <div className="node-info">
                            <div className="node-top-row">
                               <span className="node-id">#{agent.id}</span>
                               <span className="node-cap">{currentMode.toUpperCase()}</span>
                            </div>
                            <h5>
                               {agent.name}
                               {/* The subtle info trigger. Also triggered by hovering the whole card */}
                               <i className="ti-info-alt info-trigger-icon"></i>
                            </h5>
                            <p className="node-mission-micro">{agent.mission}</p>
                         </div>
                         <div className="node-quick-action">
                            <i className={isNodeActive ? "ti-na" : "ti-check"}></i>
                         </div>
                         
                         {/* -- THE ENTERPRISE GLASSMORPHISM TOOLTIP -- */}
                         <div className="agent-flyover-card">
                            <div className="flyover-body">
                               <p className="deep-context">{agent.deepContext}</p>
                            </div>
                            <div className="flyover-footer">
                               <i className="ti-share-alt"></i>
                               <span><strong style={{color:'#a5b4fc'}}>Role:</strong> {agent.crewRole}</span>
                            </div>
                         </div>
                      </div>
                    );
                  })}
               </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .agent-registry-view {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          overflow: hidden;
          font-family: 'Inter', sans-serif;
        }

        .registry-compact-header { padding: 1.5rem 2.5rem; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; z-index: 10; flex-shrink: 0; }
        .mesh-status-indicator { display: flex; align-items: center; gap: 8px; font-size: 0.65rem; font-weight: 900; color: #10b981; margin-bottom: 5px; }
        .mesh-status-indicator .dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; }
        .mesh-status-indicator .dot.pulse { animation: status-pulse 2s infinite; }
        @keyframes status-pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 100% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); } }
        .registry-compact-header h1 { font-size: 1.25rem; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; margin: 0; }
        
        .header-actions { display: flex; align-items: center; gap: 20px; }
        .global-telemetry-badge { display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 6px 16px; border-radius: 20px; border: 1px solid #e2e8f0; font-family: 'Inter', sans-serif; font-size: 0.75rem; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }
        .global-telemetry-badge .telemetry-label { color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .global-telemetry-badge .telemetry-value { color: #4f46e5; font-weight: 900; font-family: 'JetBrains Mono', monospace; background: #e0e7ff; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; letter-spacing: 1px; }

        .compact-search { position: relative; display: flex; align-items: center; background: #f1f5f9; border-radius: 10px; padding: 0 12px; width: 300px; border: 1px solid transparent; transition: all 0.3s; }
        .compact-search:focus-within { background: #fff; border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.1); }
        .compact-search i { color: #6366f1; font-size: 0.9rem; }
        .compact-search input { border: none; background: transparent; padding: 10px; font-size: 0.85rem; width: 100%; outline: none; color: #1e293b; font-weight: 500; }

        .registry-fluid-masonry { flex: 1; min-height: 0; overflow-y: auto; padding: 1.5rem 2rem 2rem; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 18px; background: #f1f5f9; }

        .department-mosaic-block { flex: 1 1 360px; background: #fff; border-radius: 16px; padding: 18px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; transition: all 0.2s; }
        .protected-crew { border: 1px solid rgba(99, 102, 241, 0.3); box-shadow: 0 10px 25px rgba(99, 102, 241, 0.05); }

        .mosaic-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .title-area { display: flex; align-items: center; gap: 10px; }
        .accent-bar { width: 4px; height: 16px; background: #6366f1; border-radius: 2px; }
        .title-area h4 { margin: 0; font-size: 0.85rem; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.8px; }
        .security-shield-icon { color: #6366f1; font-size: 0.9rem; animation: shield-glow 2s infinite alternate; }
        @keyframes shield-glow { from { opacity: 0.6; } to { opacity: 1; filter: drop-shadow(0 0 5px rgba(99, 102, 241, 0.5)); } }
        
        .crew-batch-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 4px; border-radius: 20px; transition: background 0.2s; }
        .crew-batch-toggle:hover { background: #f1f5f9; }

        .toggle-label { font-size: 0.6rem; font-weight: 900; color: #94a3b8; transition: color 0.3s; }
        .crew-batch-toggle.active .toggle-label { color: #10b981; }
        .crew-batch-toggle.partial .toggle-label { color: #f59e0b; }
        
        .toggle-track { width: 38px; height: 18px; background: #e2e8f0; border-radius: 20px; position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #cbd5e1; }
        .toggle-thumb { position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; background: #fff; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        .crew-batch-toggle.active .toggle-track { background: #10b981; border-color: #059669; }
        .crew-batch-toggle.active .toggle-thumb { left: calc(100% - 14px); }
        .protected-toggle.active .toggle-track { background: #6366f1; border-color: #4f46e5; }
        .crew-batch-toggle.partial .toggle-track { background: #fef3c7; border-color: #f59e0b; }
        .crew-batch-toggle.partial .toggle-thumb { left: calc(50% - 6px); background: #f59e0b; }

        .node-flow-grid { display: flex; flex-direction: column; gap: 10px; }

        .mini-node { display: flex; align-items: flex-start; gap: 14px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; position: relative; z-index: 1; }
        .mini-node.active { border-left: 4px solid #10b981; background: #fff; }
        .mini-node.dormant { opacity: 0.7; }
        
        .interactive-node { cursor: pointer; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .interactive-node:hover { z-index: 50; transform: translateY(-4px) scale(1.02); border-color: #a5b4fc; box-shadow: 0 12px 24px rgba(99,102,241,0.15); background: #fff; }
        
        .node-state-dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; margin-top: 6px; flex-shrink: 0; transition: all 0.3s; }
        .active .node-state-dot { background: #10b981; box-shadow: 0 0 8px #10b981; }
        .interactive-node:hover .node-state-dot { transform: scale(1.3); }

        .node-info { flex: 1; display: flex; flex-direction: column; }
        .node-top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
        .node-id { font-size: 0.65rem; font-weight: 800; color: #94a3b8; font-family: 'JetBrains Mono', monospace; }
        
        .node-info h5 { margin: 2px 0; font-size: 0.9rem; font-weight: 800; color: #1e293b; letter-spacing: -0.2px; display: flex; align-items: center; gap: 6px; }
        .info-trigger-icon { color: #cbd5e1; font-size: 0.8rem; transition: color 0.2s; }
        .interactive-node:hover .info-trigger-icon { color: #6366f1; }
        
        .node-cap { font-size: 0.55rem; color: #6366f1; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(99, 102, 241, 0.05); padding: 2px 6px; border-radius: 4px; }
        .node-mission-micro { margin: 4px 0 0 0; font-size: 0.72rem; color: #64748b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-style: italic; }

        .node-quick-action { opacity: 0; font-size: 0.85rem; color: #94a3b8; transition: opacity 0.2s; align-self: center; padding: 4px; }
        .interactive-node:hover .node-quick-action { opacity: 1; }
        .interactive-node.active:hover .node-quick-action { color: #ef4444; } 
        .interactive-node.dormant:hover .node-quick-action { color: #10b981; }

        /* ==================================================
           ✨ ENTERPRISE GLASSMORPHISM TOOLTIP ✨
           ================================================== */
        .agent-flyover-card {
           opacity: 0;
           visibility: hidden;
           position: absolute;
           top: calc(100% + 15px); /* Deploy downwards default */
           bottom: auto;
           left: 50%;
           transform: translateX(-50%) translateY(-10px);
           width: 300px;
           background: rgba(15, 23, 42, 0.95);
           backdrop-filter: blur(16px);
           -webkit-backdrop-filter: blur(16px);
           border: 1px solid rgba(255, 255, 255, 0.15);
           border-radius: 12px;
           padding: 16px;
           z-index: 100;
           box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
           transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
           pointer-events: none; /* Prevents interaction hijacking */
           text-align: left;
        }

        .interactive-node:hover .agent-flyover-card {
           opacity: 1;
           visibility: visible;
           transform: translateX(-50%) translateY(0);
        }

        /* Pointer Arrow (Default Downwards) */
        .agent-flyover-card::after {
           content: '';
           position: absolute;
           bottom: 100%;
           top: auto;
           left: 50%;
           transform: translateX(-50%);
           border-width: 7px;
           border-style: solid;
           border-color: transparent transparent rgba(15, 23, 42, 0.95) transparent;
        }

        /* Dynamic Flipped Upwards State (For bottom-screen nodes) */
        .interactive-node.flyover-up .agent-flyover-card {
           top: auto;
           bottom: calc(100% + 15px);
           transform: translateX(-50%) translateY(10px);
        }
        .interactive-node.flyover-up:hover .agent-flyover-card {
           transform: translateX(-50%) translateY(0);
        }
        .interactive-node.flyover-up .agent-flyover-card::after {
           bottom: auto;
           top: 100%;
           border-color: rgba(15, 23, 42, 0.95) transparent transparent transparent;
        }

        .flyover-body .deep-context { color: #f1f5f9; font-size: 0.8rem; line-height: 1.5; margin: 0; font-weight: 400; }
        
        .flyover-footer { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); }
        .flyover-footer i { color: #818cf8; font-size: 0.9rem; margin-top: 2px; }
        .flyover-footer span { font-size: 0.75rem; color: #cbd5e1; line-height: 1.4; font-style: italic; }

        @media (max-width: 1440px) {
          .registry-compact-header { padding: 1.25rem 1.5rem; gap: 1rem; }
          .registry-compact-header h1 { font-size: 1.75rem; }
          .registry-fluid-masonry { padding: 1.25rem 1.5rem 1.5rem; }
          .compact-search { width: 250px; }
        }

        @media (max-width: 1280px) {
          .registry-compact-header { align-items: flex-start; }
          .header-actions { width: 100%; justify-content: flex-start; }
          .compact-search { width: 100%; max-width: 360px; }
        }

        @media (max-width: 1100px) {
          .registry-compact-header { flex-direction: column; }
          .header-actions { align-items: stretch; }
          .global-telemetry-badge { align-items: flex-start; }
          .compact-search { max-width: none; }
        }
      `}</style>
    </div>
  );
};

export default AgentRegistry;
