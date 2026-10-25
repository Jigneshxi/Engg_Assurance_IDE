import React, { useState } from 'react';
import DataBuilderWorkspace from './workspaces/DataBuilderWorkspace';
import ApiValidationWorkspace from './workspaces/ApiValidationWorkspace';
import TestImpactWorkspace from './workspaces/TestImpactWorkspace';
import PlanningAgentWorkspace from './workspaces/PlanningAgentWorkspace';
import AutomationForgeWorkspace from './workspaces/AutomationForgeWorkspace';
import ApiCoderWorkspace from './workspaces/ApiCoderWorkspace';
import VisualWorkspace from './workspaces/VisualWorkspace';
import CrossBrowserWorkspace from './workspaces/CrossBrowserWorkspace';
import DataPipelineWorkspace from './workspaces/DataPipelineWorkspace';
import SuiteOptimizationWorkspace from './workspaces/SuiteOptimizationWorkspace';
import RunOrchestratorWorkspace from './workspaces/RunOrchestratorWorkspace';
import EnvProvisionerWorkspace from './workspaces/EnvProvisionerWorkspace';
import DigitalTwinWorkspace from './workspaces/DigitalTwinWorkspace';
import PerformanceWorkspace from './workspaces/PerformanceWorkspace';
import SecurityWorkspace from './workspaces/SecurityWorkspace';
import MicroservicesWorkspace from './workspaces/MicroservicesWorkspace';
import ComplianceRemediationWorkspace from './workspaces/ComplianceRemediationWorkspace';
import EventDrivenWorkspace from './workspaces/EventDrivenWorkspace';
import SelfHealingWorkspace from './workspaces/SelfHealingWorkspace';
import ReliabilityWorkspace from './workspaces/ReliabilityWorkspace';
import UXIntelligenceWorkspace from './workspaces/UXIntelligenceWorkspace';
import EnvConsistencyWorkspace from './workspaces/EnvConsistencyWorkspace';
import TestCaseFactoryWorkspace from './workspaces/TestCaseFactoryWorkspace';
import GenericTelemetryWorkspace from './workspaces/GenericTelemetryWorkspace';
import ReleaseCommanderWorkspace from './workspaces/ReleaseCommanderWorkspace';
import TrendAnalystWorkspace from './workspaces/TrendAnalystWorkspace';
import LiveMeshReportPanel from './LiveMeshReportPanel';
import { StandaloneInvokeProvider } from './workspaces/standaloneInvoke';
// Phase 3: Deep Technical Transparency
import ResilienceInspector from './ResilienceInspector';
import MigrationWorkspace from './MigrationWorkspace';
import { resolveNodeTelemetry } from '../utils/meshTelemetry';
import { CREW_MAP } from '../constants/agentMesh';

interface AgentWorkspaceProps {
  agentKey: string;
  activeAgents: Record<string, 'auto' | 'manual' | 'bypass'>;
  onAgentModeChange: (agentId: string, mode: 'auto' | 'manual' | 'bypass') => void;
  fullMeshState?: any;
  onInvokeAgent: (agentId: string, action?: string, contextOverride?: string) => void;
  loadingNodes: Record<string, boolean>;
  telemetryState: Record<string, any>;
  demoMode?: boolean;
  standaloneEnabled?: boolean;
}

const GENERIC_WORKSPACE_TITLES: Record<string, string> = {
  // === TIER 2/3 INTELLIGENCE & ASSISTIVE NODES ===
  // Keys match workflow node names (short keys) set in MASTER_AGENTS after NEW-001/002 fix
  perf_intel:       'Performance Intelligence',
  obs_intel:        'Observability Intelligence',
  rca_intel:        'Autonomous RCA',
  inc_remed:        'Incident Remediation',
  sys_resil:        'System Resilience',
  rel_risk:         'Release Risk Decision',
  biz_impact:       'Business Impact Intelligence',
  roi_intel:        'ROI & Engineering Economics',
  knowledge_graph:  'Engineering Knowledge Graph',
  meta_intel:       'Platform Meta Intelligence',
  exploratory:      'Exploratory Test Assistant',
  locator:          'Locator Intelligence',
  migration:        'Automation Migration Assistant',
  mutation:         'Mutation Testing Assistant',
  i18n_testing:     'Internationalization Testing Assistant',
  // === FOUNDATION NODES (no dedicated workspace) ===
  ingestor:         'Requirements Ingestor',
  clarifier:        'Requirement Clarifier',
  lifecycle:        'Lifecycle Tracker',
  auditor:          'Traceability Auditor',
  logician:         'Systems Logician',
  governor:         'Compliance Governor',
  critic:           'Quality Critic',
  agent_2:          'Test Strategy Builder',
  creator:          'Test Case Creator',
  api_mock:         'API Mock Virtualizer',
  regression:       'Regression Prioritization',
  delivery:         'Progressive Delivery',
  chaos:            'Chaos Engineering',
  mobile_testing:   'Mobile App Testing',
  graphql_validation: 'GraphQL Validation',
  feature_flag:     'Feature Flag Testing',
  monitor:          'Production Monitor QA',
  slo:              'SLA/SLO Compliance',
  tracing:          'Distributed Tracing',
  synthesis_optimizer: 'Synthesis Optimizer',
  synthesis_final:  'Synthesis Final',
  writer:           'Plan Composer',
};



const AgentWorkspace: React.FC<AgentWorkspaceProps> = ({ 
  agentKey, 
  activeAgents, 
  onAgentModeChange, 
  fullMeshState,
  onInvokeAgent,
  loadingNodes,
  telemetryState,
  demoMode,
  standaloneEnabled = true
}) => {
  const [overrideContexts, setOverrideContexts] = useState<Record<string, string>>({});
  const [savedNodes, setSavedNodes] = useState<Record<string, boolean>>({});

  const AGENT_TRIVIA: Record<string, string> = {
    'planning_agent': 'Strategic nodes use a Recursive Reasoning Depth of 4 to avoid logic loops.',
    'data_builder': 'The Forge generates 500+ synthetic records per second with 100% schema integrity.',
    'security': 'Our Security Node cross-checks findings against the latest OWASP Top 10 real-time feed.',
    'performance': 'Performance Architect can simulate 10,000 concurrent virtual users via distributed workers.',
    'rca_intel': 'The RCA agent uses a "5-Whys" semantic tree to isolate the definitive cause of failure.',
    'self_healing': 'Self-healing nodes can automatically update DOM locators with a 98% success rate.',
    'roi_intel': 'This node calculates the potential revenue loss for every minute of downtime found.',
    'logic_compliance': 'Logic checks are performed using a proprietary Zero-Knowledge Proof protocol.'
  };

  const activeNodes = CREW_MAP[agentKey] || [agentKey]; 

  // --- Intelligent Payload Inference ---
  const getTelemetryResolutionForNode = React.useCallback((nodeKey: string) => (
    resolveNodeTelemetry({
      nodeKey,
      telemetryState,
      fullMeshState
    })
  ), [telemetryState, fullMeshState]);

  const getTelemetryForNode = React.useCallback((nodeKey: string) => {
    return getTelemetryResolutionForNode(nodeKey).data;
  }, [getTelemetryResolutionForNode]);

  const activeTelemetry = React.useMemo(() => {
    const directTelemetry = getTelemetryResolutionForNode(agentKey).data;
    if (directTelemetry && !agentKey.startsWith('crew_')) return directTelemetry;
    if (activeNodes.length === 1) return getTelemetryForNode(activeNodes[0]);
    
    const merged: any = {};
    activeNodes.forEach((node: string) => {
       const t = getTelemetryForNode(node);
       if (t) merged[node] = t;
    });
    return Object.keys(merged).length > 0 ? merged : null;
  }, [getTelemetryForNode, getTelemetryResolutionForNode, activeNodes, agentKey]);

  const advisorData = React.useMemo(() => {
    const insights: string[] = [];
    const recs: string[] = [];
    
    const extractText = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        return val.title || val.description || val.message || val.insight || JSON.stringify(val);
      }
      return String(val);
    };

    activeNodes.forEach((node: string) => {
      const nodeTel = getTelemetryForNode(node);
      if (nodeTel) {
        if (Array.isArray(nodeTel.actionable_insights)) {
          nodeTel.actionable_insights.forEach((item: any) => {
            const txt = extractText(item);
            if (txt) insights.push(txt);
          });
        } else if (nodeTel.actionable_insights) {
          const txt = extractText(nodeTel.actionable_insights);
          if (txt) insights.push(txt);
        }

        if (Array.isArray(nodeTel.quality_recommendations)) {
          nodeTel.quality_recommendations.forEach((item: any) => {
            const txt = extractText(item);
            if (txt) recs.push(txt);
          });
        } else if (nodeTel.quality_recommendations) {
          const txt = extractText(nodeTel.quality_recommendations);
          if (txt) recs.push(txt);
        }
      }
    });
    if (insights.length === 0 && recs.length === 0) return null;
    return { insights: Array.from(new Set(insights)).slice(0, 6), recs: Array.from(new Set(recs)).slice(0, 6) };
  }, [getTelemetryForNode, activeNodes]);

  const isCrewActive = activeNodes.some((node: string) => activeAgents[node] !== 'bypass');
  const standaloneLocked = !standaloneEnabled;
  const crewModeSummary = activeNodes.every((n: string) => activeAgents[n] === 'auto') ? 'AUTO (FULL)' : 
                          activeNodes.every((n: string) => activeAgents[n] === 'bypass') ? 'BYPASS (ALL)' : 'MIXED MATRIX';

  const getAgentDetails = () => {
    switch (agentKey) {
      // === PILLAR 1: COMMAND MESH (FOUNDATION) ===
      case 'crew_strategic_command': return { title: 'Autonomous Mission Director: Strategic Orchestration', icon: 'ti-direction', desc: 'High-level Directed Acyclic Graph (DAG) orchestration, mission-gate logic enforcement, and binary release certification.', type: 'dashboard', pillar: 'Pillar 1: Command Mesh' };
      case 'crew_logic_compliance': return { title: 'Sovereign Logic Registry: Zero-Knowledge Compliance', icon: 'ti-shield', desc: 'Formal system logic verification, autonomous SOC2/GDPR compliance auditing, and perpetual traceability enforcement.', type: 'configuration', pillar: 'Pillar 1: Command Mesh' };
      case 'crew_economics_risk': return { title: 'Engineering Economics Engine: Predictive ROI Intelligence', icon: 'ti-stats-up', desc: 'Real-time automation ROI analytics, predictive revenue-at-risk modeling, and release density financial auditing.', type: 'dashboard', pillar: 'Pillar 1: Command Mesh' };
      case 'crew_knowledge_engine': return { title: 'Semantic Intelligence Base: Recursive Knowledge Graph', icon: 'ti-share', desc: 'Recursive entity mapping, cross-mission defect ingestion, and self-optimizing knowledge graph expansion via vector embeddings.', type: 'dashboard', pillar: 'Pillar 1: Command Mesh' };

      // === PILLAR 2: ARTIFACT FACTORY ===
      case 'crew_strategy_impact': return { title: 'Strategy Forge: Predictive Blast-Radius Analytics', icon: 'ti-map-alt', desc: 'Predictive impact analysis, autonomous test pyramid optimization, and strategic footprint reduction for accelerated delivery.', type: 'configuration', pillar: 'Pillar 2: Artifact Factory' };
      case 'crew_scenario_data': return { title: 'Scenario Synthesis: High-Fidelity Data Forge', icon: 'ti-layout-media-center-alt', desc: 'Autonomous BDD atomic scenario generation and PII-masked synthetic telemetry synthesis for complex environment emulation.', type: 'generator', pillar: 'Pillar 2: Artifact Factory' };
      case 'crew_api_virtualization': return { title: 'API Virtualization: Boundary Isolation Hub', icon: 'ti-magnet', desc: 'Stateful service virtualization, boundary condition isolation, and deep-graph security protocol validation for decoupled testing.', type: 'configuration', pillar: 'Pillar 2: Artifact Factory' };

      // === PILLAR 3: EXECUTION ARRAY ===
      case 'crew_code_generators': return { title: 'Code Synthesis Hub: Autonomous Migration & SDET', icon: 'ti-html5', desc: 'Autonomous executable automation generation, legacy script modernization, and boilerplate-free engineering-assurance synthesis.', type: 'generator', pillar: 'Pillar 3: Execution Array' };
      case 'crew_interface_mobile': return { title: 'Omni-Channel Assurance: Mobile & Interface Core', icon: 'ti-mobile', desc: 'Visual jank analysis across 50+ viewports, cross-browser pixel validation, and native app telemetry consistency audits.', type: 'dashboard', pillar: 'Pillar 3: Execution Array' };
      case 'crew_orchestration_matrix': return { title: 'Orchestration Matrix: Canary & Feature-Flag Hub', icon: 'ti-control-play', desc: 'Parallel sharding, feature flag multivariate validation, and automated canary rollback triggers using execution telemetry.', type: 'dashboard', pillar: 'Pillar 3: Execution Array' };
      case 'crew_cloud_environments': return { title: 'Cloud Twin Registry: Ephemeral Environment Provisioner', icon: 'ti-cloud-down', desc: 'Real-time K8s/Docker replica provisioning and deep-scan configuration drift detection for environment parity.', type: 'configuration', pillar: 'Pillar 3: Execution Array' };

      // === PILLAR 4: NFR & GUARDS ===
      case 'crew_performance_chaos': return { title: 'Performance Engineering: Chaos Experiment Hub', icon: 'ti-pulse', desc: 'High-load threshold analysis, failure injection experiment design, and system resilience metrics for anti-fragile systems.', type: 'dashboard', pillar: 'Pillar 4: NFR & Guards' };
      case 'crew_security_aspm': return { title: 'Security Intelligence: ASPM+ Exploit Simulator', icon: 'ti-lock', desc: 'Shift-left threat modeling, autonomous exploit simulation, and deep-packet security signal auditing across the core mesh.', type: 'configuration', pillar: 'Pillar 4: NFR & Guards' };
      case 'crew_backend_architecture': return { title: 'Backend Core: Distributed Trace & Latency Engine', icon: 'ti-server', desc: 'Service-mesh validation, distributed trace latency analysis, and event-driven payload verification for microservices.', type: 'dashboard', pillar: 'Pillar 4: NFR & Guards' };

      // === PILLAR 5: RELIABILITY & CONTINUITY ===
      case 'crew_incident_command': return { title: 'Incident Command: Autonomous Root-Cause Isolation', icon: 'ti-alert', desc: 'Real-time telemetry interpretation and predictive root-cause isolation using semantic failure trees and pattern recognition.', type: 'dashboard', pillar: 'Pillar 5: Reliability & Continuity' };
      case 'crew_self_healing': return { title: 'Self-Healing Dynamics: Adaptive Suite Optimizer', icon: 'ti-reload', desc: 'Adaptive selector engines and autonomous suite optimization to eliminate flaky test regressions and locator fragility.', type: 'configuration', pillar: 'Pillar 5: Reliability & Continuity' };
      case 'crew_sre_reliability': return { title: 'SRE Hub: SLO Budget & Reliability Engineering', icon: 'ti-timer', desc: 'SLA/SLO budget tracking, reliability engineering audits, and quarantine-controlled failure isolation for mission integrity.', type: 'dashboard', pillar: 'Pillar 5: Reliability & Continuity' };
      case 'crew_ux_monitoring': return { title: 'UX Continuity: Accessibility & Heuristic Intelligence', icon: 'ti-eye', desc: 'Visual jank analysis, Core Web Vitals monitoring, and strict WCAG 2.2 accessibility compliance auditing.', type: 'dashboard', pillar: 'Pillar 5: Reliability & Continuity' };

      // Executive Systems
      case 'test_case_factory': return { title: 'Artifact Synthesis Core', icon: 'ti-package', desc: 'The industrial-scale synthesis hub. Consolidates 59 nodes into mission-critical executive reports.', type: 'generator', pillar: 'Mission Control' };
      case 'registry': return { title: 'Agent Sovereign Mesh Registry', icon: 'ti-layout-grid3', desc: 'Configure orchestration policies, reasoning depths, and safety guardrails for the autonomous agents.', type: 'configuration', pillar: 'Mission Control' };
      case 'knowledge': return { title: 'Semantic Intelligence Base', icon: 'ti-layers', desc: 'Manage the mission knowledge graph, document embeddings, and recursive learning patterns.', type: 'configuration', pillar: 'Mission Control' };
      
      default: return { title: 'Sovereign Node Workspace', icon: 'ti-widget', desc: 'Advanced specialist agent configuration and telemetry matrix.', type: 'dashboard', pillar: 'Specialist Node' };
    }
  };

  const details = getAgentDetails();

  return (
    <StandaloneInvokeProvider value={standaloneEnabled}>
    <div className="card animate-fadeIn" style={{ minHeight: '80vh', borderTop: `4px solid ${isCrewActive ? '#6366f1' : '#475569'}`, background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.08)', borderRadius: '24px', overflow: 'hidden' }}>
      <div className="card-header border-none" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '1.5rem 2rem 1.25rem 2rem', background: 'linear-gradient(to bottom, #f8fafc, #ffffff)' }}>
        <div style={{ 
          fontSize: '2.2rem', 
          color: isCrewActive ? '#6366f1' : '#94a3b8', 
          background: isCrewActive ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.02))' : '#f1f5f9', 
          padding: '16px', 
          borderRadius: '16px', 
          border: `1px solid ${isCrewActive ? 'rgba(99,102,241,0.2)' : '#e2e8f0'}`, 
          boxShadow: isCrewActive ? '0 10px 25px -8px rgba(99,102,241,0.3)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
           <i className={details.icon}></i>
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
             <span style={{ fontSize: '0.62rem', fontWeight: 950, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '2px', background: 'rgba(99,102,241,0.1)', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.15)' }}>
                {details.pillar}
             </span>
             <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <i className="ti-layers-alt" style={{ marginRight: '4px' }}></i> {activeNodes.length} Deep-Mesh Nodes
             </span>
             <span style={{ fontSize: '0.62rem', fontWeight: 900, color: isCrewActive ? '#10b981' : '#ef4444', textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCrewActive ? '#10b981' : '#ef4444', boxShadow: isCrewActive ? '0 0 8px #10b981' : 'none' }}></div>
                State: {isCrewActive ? 'Synchronized' : 'Offline'}
             </span>
          </div>
          
          <h1 style={{ margin: '0 0 6px 0', fontSize: '2.2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            {details.title.includes(':') ? (
              <>
                {details.title.split(':')[0]}<span style={{ color: '#6366f1' }}>:{details.title.split(':')[1]}</span>
              </>
            ) : (
              <>
                {details.title.split(' ').slice(0, -1).join(' ')} <span style={{ color: '#6366f1' }}>{details.title.split(' ').slice(-1)}</span>
              </>
            )}
          </h1>
          
          <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '800px', lineHeight: 1.65, fontWeight: 500 }}>
             {details.desc}
          </p>
        </div>
      </div>
      <div className="card-body">
        
        {/* If the entire crew is bypassed, show a single warning banner */}
        {!isCrewActive && (
          <div className="operational-banner" style={{ borderLeftColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: '2rem' }}>
            <i className="ti-na" style={{ color: '#ef4444' }}></i>
            <span>
              <strong>Crew Offline:</strong> All specialist nodes within this block are currently bypassed. 
              <span style={{ display: 'block', fontSize: '0.75rem', marginTop: '4px', opacity: 0.7 }}>
                This entire intelligence sector is excluded from the current lifecycle orchestration. Reactivate individual nodes below to resume analysis.
              </span>
            </span>
          </div>
        )}

        {/* No live data banner — shown when no mission has been run yet and demo mode is off */}
        {isCrewActive && !fullMeshState && (
          <div className="operational-banner" style={{ borderLeftColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.04)', marginBottom: '2rem' }}>
            <i className="ti-info-alt" style={{ color: '#6366f1' }}></i>
            <span>
              <strong>Planning Data Not Ready:</strong> Workspace panels will populate after a Phase 1 or Phase 2 mission run.
              <span style={{ display: 'block', fontSize: '0.75rem', marginTop: '4px', opacity: 0.7 }}>
                Navigate to <strong>Mission Control → Requirement Ops</strong> to start a new mission and generate PRD-aligned telemetry for this workspace.
              </span>
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--secondary)', letterSpacing: '1px', marginBottom: '1rem' }}>Matrix Command View</h3>

            <div style={{ position: 'relative' }}>
              {activeNodes.map((nodeKey: string, idx: number) => {
                const nodeResolution = getTelemetryResolutionForNode(nodeKey);
                const nodeTel = nodeResolution.data;
                const nodeMode = activeAgents[nodeKey] || 'auto';
                const isNodeActive = nodeMode !== 'bypass';
                
                const getComponent = () => {
                  const invokeNode = (action?: string) => onInvokeAgent(nodeKey, action, overrideContexts[nodeKey]);

                  if (GENERIC_WORKSPACE_TITLES[nodeKey]) {
                      return (
                        <GenericTelemetryWorkspace
                          nodeKey={nodeKey}
                          title={GENERIC_WORKSPACE_TITLES[nodeKey]}
                          onInvoke={invokeNode}
                          loading={loadingNodes[nodeKey]}
                          telemetry={nodeTel}
                        />
                      );
                  }

                  switch (nodeKey) {
                    case 'planning_agent': return <PlanningAgentWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'data_builder': return <DataBuilderWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'api_validation': return <ApiValidationWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'test_impact': return <TestImpactWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'security': return <SecurityWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'visual_intel': return <VisualWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'digital_twin': return <DigitalTwinWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'performance': return <PerformanceWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'reliability_eng': return <ReliabilityWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'automation_forge': return <AutomationForgeWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'api_coder': return <ApiCoderWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'cross_browser': return <CrossBrowserWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'data_pipeline': return <DataPipelineWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'suite_optimization': return <SuiteOptimizationWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'run_orchestrator': return <RunOrchestratorWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'env_provisioner': return <EnvProvisionerWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'microservices': return <MicroservicesWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'compliance_remediation': return <ComplianceRemediationWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'event_driven': return <EventDrivenWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'self_healing': return <SelfHealingWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'ux_intelligence': return <UXIntelligenceWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'env_consistency': return <EnvConsistencyWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    case 'test_case_factory': return <TestCaseFactoryWorkspace onInvoke={invokeNode} loading={loadingNodes[nodeKey]} telemetry={nodeTel} fullMeshState={fullMeshState} />;
                    // Phase 3.1 — Resilience Inspector (primary + 3 backup selectors per element)
                    case 'locator': return (
                      <ResilienceInspector
                        taskId={fullMeshState?.task_id || null}
                        demoMode={demoMode}
                        locatorData={nodeTel}
                      />
                    );
                    // Phase 3.2 — Automation Migration Workspace
                    case 'migration': return (
                      <MigrationWorkspace
                        taskId={fullMeshState?.task_id || null}
                        demoMode={demoMode}
                        migrationData={nodeTel}
                      />
                    );
                    case 'release_commander': return (
                      <ReleaseCommanderWorkspace
                        onInvoke={invokeNode}
                        loading={loadingNodes[nodeKey]}
                        telemetry={nodeTel}
                        fullMeshState={fullMeshState}
                      />
                    );
                    case 'trend_analyst': return (
                      <TrendAnalystWorkspace
                        onInvoke={invokeNode}
                        loading={loadingNodes[nodeKey]}
                        telemetry={nodeTel}
                        fullMeshState={fullMeshState}
                      />
                    );
                    default: return (
                      <GenericTelemetryWorkspace
                        nodeKey={nodeKey}
                        onInvoke={invokeNode}
                        loading={loadingNodes[nodeKey]}
                        telemetry={nodeTel}
                      />
                    );
                  }
                };

                const Comp = getComponent();
                // Comp is never null now due to default switch case
                
                return (
                  <div key={nodeKey} style={{ 
                    marginBottom: activeNodes.length > 1 && idx < activeNodes.length - 1 ? '3rem' : 0, 
                    position: 'relative' 
                  }}>
                    {activeNodes.length > 1 && (
                      <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isNodeActive ? '#10b981' : '#ef4444' }}></div>
                          <h4 style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                            Integration Node: {nodeKey.replace(/_/g, ' ')}
                          </h4>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Policy:</span>
                           <select 
                             value={nodeMode}
                             title="Select node routing policy"
                             onChange={(e) => onAgentModeChange(nodeKey, e.target.value as any)}
                             style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${isNodeActive ? '#cbd5e1' : '#fca5a5'}`, background: isNodeActive ? '#fff' : '#fef2f2', color: isNodeActive ? '#334155' : '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}
                           >
                             <option value="auto">Auto-Mesh</option>
                             <option value="manual">Manual Loop</option>
                             <option value="bypass">Bypass Offline</option>
                           </select>
                        </div>
                      </div>
                    )}

                    <div style={{ pointerEvents: isNodeActive ? 'auto' : 'none', opacity: isNodeActive ? 1 : 0.4, transition: 'all 0.3s ease' }}>
                       {/* Dropdown Tuning Vault */}
                       <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', marginBottom: '8px' }}>
                             <i className="ti-settings" style={{ marginRight: '5px' }}></i> Model Tuning Vault
                          </div>
                          <div>
                             <textarea 
                                value={overrideContexts[nodeKey] || ''}
                                onChange={(e) => setOverrideContexts((prev: Record<string, string>) => ({ ...prev, [nodeKey]: e.target.value }))}
                                placeholder="Tune this autonomous specialist parameters..."
                                style={{ width: '100%', minHeight: '50px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontFamily: 'monospace' }}
                             />
                          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button
                                  className="btn-secondary"
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '0.7rem',
                                    background: savedNodes[nodeKey] ? '#f0fdf4' : '#fff',
                                    border: `1px solid ${savedNodes[nodeKey] ? '#bbf7d0' : '#cbd5e1'}`,
                                    color: savedNodes[nodeKey] ? '#15803d' : '#475569',
                                    transition: 'all 0.3s ease',
                                  }}
                                  onClick={() => {
                                    setSavedNodes(prev => ({ ...prev, [nodeKey]: true }));
                                    setTimeout(() => setSavedNodes(prev => ({ ...prev, [nodeKey]: false })), 2000);
                                  }}
                                >
                                  {savedNodes[nodeKey] ? '✓ Saved' : 'Save Tuning'}
                                </button>
                                <button
                                  className="btn-primary highlight"
                                  style={{ padding: '6px 12px', fontSize: '0.7rem' }}
                                  onClick={() => onInvokeAgent(nodeKey, undefined, overrideContexts[nodeKey])}
                                  disabled={loadingNodes[nodeKey] || standaloneLocked}
                                >
                                   {loadingNodes[nodeKey] ? 'Thinking...' : 'Standalone Run'}
                                </button>
                             </div>
                             {loadingNodes[nodeKey] && (
                                <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(99,102,241,0.05)', borderRadius: '6px', borderLeft: '3px solid #6366f1', fontSize: '0.72rem', color: '#4338ca', animation: 'fadeIn 0.5s ease-out' }}>
                                   <i className="ti-light-bulb" style={{ marginRight: '6px', color: '#fbbf24' }}></i>
                                   <strong>A.N.T. Insight:</strong> {AGENT_TRIVIA[nodeKey] || 'Optimizing autonomous reasoning depth for peak mission performance...'}
                                </div>
                             )}
                          </div>
                       </div>
                       
                       {Comp}
                       <LiveMeshReportPanel nodeKey={nodeKey} resolution={nodeResolution} fullMeshState={fullMeshState} />
                    </div>
                  </div>
                );
              })}

            </div>
          </div>

          <div>
            <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #1e293b', opacity: isCrewActive ? 1 : 0.5, boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.5)' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: '#f8fafc', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.05em' }}>
                <i className="ti-stats-up" style={{ color: '#6366f1' }}></i> Active Telemetry
                {isCrewActive && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981', animation: 'pulseDot 2s infinite', marginLeft: 'auto' }}></div>}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '1rem', borderBottom: '1px solid #1e293b', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ color: '#64748b', textTransform: 'uppercase' }}>Routing Policy</span>
                  <span style={{ color: '#818cf8', letterSpacing: '0.5px' }}>{crewModeSummary}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ color: '#64748b', textTransform: 'uppercase' }}>Mesh Status</span>
                  <span style={{ color: isCrewActive ? '#34d399' : '#ef4444', letterSpacing: '0.5px' }}>{isCrewActive ? 'INTEGRATED' : 'BYPASSED'}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#475569', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 800 }}>Raw Data Matrix</div>
              {activeTelemetry ? (
                <div className="telemetry-out custom-scroll" style={{ maxHeight: '350px', overflowY: 'auto', fontSize: '0.7rem', color: '#10b981', background: '#020617', padding: '14px', borderRadius: '8px', border: '1px solid #0f172a', fontFamily: 'monospace', boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: '1.5' }}>{JSON.stringify(activeTelemetry, null, 2)}</pre>
                </div>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', background: '#020617', borderRadius: '8px', border: '1px solid #0f172a', color: '#334155', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                   Awaiting Standalone Invocation...
                </div>
              )}
            </div>
            {/* Adding animation styles locally for workspace telemetry */}
            <style>{`
              @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }
            `}</style>
          </div>
        </div>
      </div>
      {/* --- ACTIONABLE ADVISOR PANEL --- */}
      {isCrewActive && advisorData && (
        <div style={{ padding: '0 2rem 2rem 2rem' }}>
          <div style={{ background: '#020617', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(90deg, #020617, #0f172a)' }}>
              <i className="ti-light-bulb" style={{ color: '#fbbf24', fontSize: '1.2rem' }}></i>
              <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>A.N.T. Executive Advisory</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
              <div style={{ padding: '20px', borderRight: '1px solid #1e293b' }}>
                <h4 style={{ fontSize: '0.7rem', color: '#6366f1', textTransform: 'uppercase', marginBottom: '15px', fontWeight: 900 }}>Real-time Logic Interpretations</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {advisorData.insights.map((insight: string, i: number) => (
                    <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#6366f1', marginTop: '7px', flexShrink: 0 }}></div>
                      <span style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5 }}>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ padding: '20px' }}>
                <h4 style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', marginBottom: '15px', fontWeight: 900 }}>Actionable Quality Benchmarks</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {advisorData.recs.map((rec: string, i: number) => (
                    <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                      <i className="ti-arrow-right" style={{ color: '#10b981', fontSize: '0.7rem', marginTop: '4px' }}></i>
                      <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 500, lineHeight: 1.5 }}>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.05)', borderTop: '1px solid #1e293b', textAlign: 'center' }}>
               <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>Report dynamically updated based on Phase 2 Autonomous Mesh Execution Cycle.</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </StandaloneInvokeProvider>
  );
};

export default AgentWorkspace;
