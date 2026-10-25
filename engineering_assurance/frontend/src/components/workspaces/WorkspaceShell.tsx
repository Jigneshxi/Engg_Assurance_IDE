/**
 * ================================================================================
 * SeQuor AGENT MESH - WORKSPACE SHELL (Option B Wrapper)
 * ================================================================================
 * A standardised wrapper that enforces consistent UI/UX patterns across every
 * specialist agent workspace:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  [Icon]  Agent Name · Pillar Tag · Status Badge         │  ← Shell Header
 *   │  Description                                            │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  [Tab Bar - provided by child]                          │  ← Child Content
 *   │  [Tab Content - provided by child]                      │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  Agent #XX · Model · Capability    [Primary CTA Button] │  ← Shell Footer
 *   └─────────────────────────────────────────────────────────┘
 *
 * Empty states, loading states, and section headers follow a single standard.
 */

import React from 'react';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

// ── Agent metadata registry ───────────────────────────────────────────────────
export interface AgentMeta {
  agentNumber: string;       // e.g. "#17"
  name: string;              // e.g. "Performance Engineering"
  pillar: string;            // e.g. "NFR & Guards"
  icon: string;              // Themify icon class e.g. "ti-pulse"
  description: string;       // One-line capability description
  model: string;             // e.g. "Prometheus Metrics"
  capability: string;        // e.g. "Load & NFR Analysis"
  invokeLabel: string;       // CTA button label e.g. "Run Performance Audit"
  loadingLabel: string;      // Loading state label e.g. "Stressing..."
  invokeContext: string;     // Default context string passed to onInvoke
}

export const AGENT_META: Record<string, AgentMeta> = {
  performance: {
    agentNumber: '#17', name: 'Performance Engineering', pillar: 'NFR & Guards',
    icon: 'ti-pulse', description: 'Load scenario design, NFR baseline validation, and bottleneck identification across the execution mesh.',
    model: 'Prometheus Metrics', capability: 'Load & NFR Analysis',
    invokeLabel: 'Run Performance Audit', loadingLabel: 'Stressing...',
    invokeContext: 'Initialize load profile and capture NFR baseline metrics.',
  },
  security: {
    agentNumber: '#18', name: 'Security Intelligence (ASPM+)', pillar: 'NFR & Guards',
    icon: 'ti-lock', description: 'Shift-left threat modelling, OWASP Top 10 validation, and autonomous exploit simulation.',
    model: 'ASPM+ Threat Engine', capability: 'Threat & Compliance Audit',
    invokeLabel: 'Execute Security Audit', loadingLabel: 'Securing...',
    invokeContext: 'Execute full security penetration analysis and threat model synthesis.',
  },
  microservices: {
    agentNumber: '#30', name: 'Microservices & Service Mesh', pillar: 'NFR & Guards',
    icon: 'ti-share', description: 'Service-to-service topology validation, distributed trace latency analysis, and mTLS compliance.',
    model: 'Istio CoreDNS Hooks', capability: 'Service Mesh Validation',
    invokeLabel: 'Audit Microservices Mesh', loadingLabel: 'Tracing...',
    invokeContext: 'Execute full service-to-service validation and distributed tracing audit.',
  },
  reliability_eng: {
    agentNumber: '#44', name: 'Test Reliability Engineering', pillar: 'Reliability & Continuity',
    icon: 'ti-stats-up', description: 'Flaky test detection, quarantine logic, and autonomous self-healing remediation for suite stability.',
    model: 'Stochastic Monte Carlo', capability: 'Suite Reliability & TRE',
    invokeLabel: 'Repair Suite Health', loadingLabel: 'Analyzing...',
    invokeContext: 'Perform deep historical regression to identify and quarantine flaky test patterns.',
  },
  self_healing: {
    agentNumber: '#43', name: 'Self-Healing Evolution', pillar: 'Reliability & Continuity',
    icon: 'ti-reload', description: 'Adaptive selector engines and autonomous suite optimization to eliminate locator fragility.',
    model: 'Q-Learning Algorithms', capability: 'Locator Resilience',
    invokeLabel: 'Armor Selectors', loadingLabel: 'Evolving...',
    invokeContext: 'Execute adaptive locator stress test and evolve redundant selector clusters.',
  },
  ux_intelligence: {
    agentNumber: '#35', name: 'UX Intelligence', pillar: 'Reliability & Continuity',
    icon: 'ti-face-smile', description: 'Core Web Vitals profiling, heuristic quality auditing, and WCAG 2.2 accessibility compliance.',
    model: 'Llama-Vision-70b', capability: 'UX & Accessibility Audit',
    invokeLabel: 'Assess Experience', loadingLabel: 'Assessing...',
    invokeContext: 'Execute full UX heuristic audit and Core Web Vitals profiling.',
  },
  visual_intel: {
    agentNumber: '#39', name: 'Visual Testing Intelligence', pillar: 'Execution Array',
    icon: 'ti-eye', description: 'Pixel-perfect baseline management, perceptual diff analysis, and DOM anchor stability.',
    model: 'ResNet-50 CV Model', capability: 'Visual Regression',
    invokeLabel: 'Execute Visual Audit', loadingLabel: 'Scanning...',
    invokeContext: 'Capture all baseline snapshots and perform global perceptual regression scan.',
  },
  cross_browser: {
    agentNumber: '#29', name: 'Cross-Browser Compatibility', pillar: 'Execution Array',
    icon: 'ti-world', description: 'Browser matrix validation across Chrome, Firefox, Safari, Edge, and iOS with render drift detection.',
    model: 'Playwright Matrix Engine', capability: 'Cross-Browser Parity',
    invokeLabel: 'Validate Cross-Browser', loadingLabel: 'Validating...',
    invokeContext: 'Execute full cross-browser audit across all Tier 1 engines.',
  },
  automation_forge: {
    agentNumber: '#10', name: 'Automation Framework Setup', pillar: 'Execution Array',
    icon: 'ti-hummer', description: 'Project scaffold generation, framework bootstrapping, and boilerplate-free SDET synthesis.',
    model: 'Llama-3.3-70b', capability: 'Framework Scaffolding',
    invokeLabel: 'Forge Project Scaffold', loadingLabel: 'Forging...',
    invokeContext: 'Bootstrap full project scaffold and dependency manifests.',
  },
  api_coder: {
    agentNumber: '#11', name: 'API Automation Generator', pillar: 'Execution Array',
    icon: 'ti-code', description: 'Swagger/OpenAPI-driven test script generation for REST and GraphQL endpoints.',
    model: 'Llama-3.3-70b', capability: 'API Script Generation',
    invokeLabel: 'Generate API Scripts', loadingLabel: 'Generating...',
    invokeContext: 'Generate executable API test scripts from OpenAPI specification.',
  },
  data_builder: {
    agentNumber: '#7', name: 'Test Data Builder', pillar: 'Artifact Factory',
    icon: 'ti-package', description: 'PII-masked synthetic data generation with schema validation and GDPR/HIPAA compliance.',
    model: 'Llama-3.3-70b', capability: 'Synthetic Data Forge',
    invokeLabel: 'Synthesize Dataset', loadingLabel: 'Processing...',
    invokeContext: 'Execute full schema validation and PII masking audit.',
  },
  api_validation: {
    agentNumber: '#12', name: 'API Validation & Dependency', pillar: 'Artifact Factory',
    icon: 'ti-plug', description: 'Endpoint contract validation, dependency graph mapping, and service virtualization.',
    model: 'Swagger/v3 Parsers', capability: 'Contract Validation',
    invokeLabel: 'Validate API Contracts', loadingLabel: 'Validating...',
    invokeContext: 'Execute full API contract validation and vulnerability probe.',
  },
  test_impact: {
    agentNumber: '#13', name: 'Test Impact Intelligence', pillar: 'Artifact Factory',
    icon: 'ti-target', description: 'PR blast-radius analysis, impacted module mapping, and regression subset optimisation.',
    model: 'Tree-sitter AST Engines', capability: 'Blast Radius Analysis',
    invokeLabel: 'Calculate Blast Radius', loadingLabel: 'Calculating...',
    invokeContext: 'Perform deep structural impact analysis between current branch and main.',
  },
  digital_twin: {
    agentNumber: '#42', name: 'Digital Twin & Simulation', pillar: 'Execution Array',
    icon: 'ti-layers-alt', description: 'Production mirror fidelity tracking, traffic shadowing, and divergence analysis.',
    model: 'Llama-3.3-70b', capability: 'Shadow Simulation',
    invokeLabel: 'Sync Production Mirror', loadingLabel: 'Syncing...',
    invokeContext: 'Synchronize simulation snapshots with production telemetry stream.',
  },
  run_orchestrator: {
    agentNumber: '#15', name: 'Test Execution Orchestrator', pillar: 'Execution Array',
    icon: 'ti-control-play', description: 'Parallel shard distribution, retry policy management, and CI/CD pipeline integration.',
    model: 'Llama-3.3-70b', capability: 'Parallel Orchestration',
    invokeLabel: 'Initiate Orchestration', loadingLabel: 'Dispatching...',
    invokeContext: 'Dispatch full suite with dynamic sharding and CI hooks.',
  },
  env_provisioner: {
    agentNumber: '#16', name: 'Test Environment Orchestrator', pillar: 'Execution Array',
    icon: 'ti-cloud-down', description: 'Ephemeral K8s/Docker environment provisioning and configuration drift detection.',
    model: 'K8s Resource Models', capability: 'Environment Provisioning',
    invokeLabel: 'Provision Environment', loadingLabel: 'Spin Up...',
    invokeContext: 'Provision dynamic ephemeral environment via Docker/K8s hooks.',
  },
  env_consistency: {
    agentNumber: '#37', name: 'Multi-Environment Consistency', pillar: 'Execution Array',
    icon: 'ti-cloud', description: 'Cross-environment configuration drift detection and fleet parity enforcement.',
    model: 'Llama-3.3-70b', capability: 'Config Drift Detection',
    invokeLabel: 'Sync Fleet Config', loadingLabel: 'Syncing...',
    invokeContext: 'Perform deep configuration drift analysis across Dev, Staging, and Production.',
  },
  suite_optimization: {
    agentNumber: '#38', name: 'Test Suite Optimization', pillar: 'Reliability & Continuity',
    icon: 'ti-settings', description: 'Redundant test pruning, parallel group optimisation, and execution time reduction.',
    model: 'Llama-3.3-70b', capability: 'Suite Pruning & Optimisation',
    invokeLabel: 'Optimize Suite', loadingLabel: 'Optimizing...',
    invokeContext: 'Analyse suite composition and recommend pruning and parallelisation strategies.',
  },
  data_pipeline: {
    agentNumber: '#33', name: 'Database & Data Pipeline', pillar: 'NFR & Guards',
    icon: 'ti-server', description: 'ETL checkpoint validation, DB scenario testing, and latency SLO enforcement.',
    model: 'Llama-3.3-70b', capability: 'Pipeline Validation',
    invokeLabel: 'Validate Pipeline', loadingLabel: 'Validating...',
    invokeContext: 'Validate ETL checkpoints, DB scenarios, and latency SLOs.',
  },
  compliance_remediation: {
    agentNumber: '#27', name: 'Autonomous Compliance Remediation', pillar: 'Command Mesh',
    icon: 'ti-shield', description: 'Auto-remediation of PCI-DSS, GDPR, and HIPAA compliance findings.',
    model: 'Llama-3.3-70b', capability: 'Compliance Auto-Remediation',
    invokeLabel: 'Remediate Findings', loadingLabel: 'Remediating...',
    invokeContext: 'Identify and auto-remediate PCI/GDPR/HIPAA compliance findings.',
  },
  event_driven: {
    agentNumber: '#31', name: 'Event-Driven Architecture Testing', pillar: 'NFR & Guards',
    icon: 'ti-infinite', description: 'Kafka/RabbitMQ/SQS async queue integrity and event schema compliance validation.',
    model: 'Llama-3.3-70b', capability: 'Async Queue Validation',
    invokeLabel: 'Validate Event Mesh', loadingLabel: 'Validating...',
    invokeContext: 'Validate async message queue integrity and event schema compliance.',
  },
};

// ── Empty State ───────────────────────────────────────────────────────────────
interface WorkspaceEmptyStateProps {
  icon?: string;
  message: string;
  subMessage?: string;
}

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({
  icon = 'ti-signal',
  message,
  subMessage,
}) => (
  <div className="ws-shell-empty">
    <i className={icon} style={{ fontSize: '1.4rem', opacity: 0.35, marginBottom: '10px' }}></i>
    <span className="ws-shell-empty-msg">{message}</span>
    {subMessage && <span className="ws-shell-empty-sub">{subMessage}</span>}
  </div>
);

// ── Section Header ────────────────────────────────────────────────────────────
interface WorkspaceSectionHeaderProps {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}

export const WorkspaceSectionHeader: React.FC<WorkspaceSectionHeaderProps> = ({
  title,
  badge,
  action,
}) => (
  <div className="ws-shell-section-header">
    <h3 className="ws-shell-section-title">{title}</h3>
    <div className="ws-shell-section-right">
      {badge && <div className="ws-shell-badge">{badge}</div>}
      {action}
    </div>
  </div>
);

// ── Main Shell ────────────────────────────────────────────────────────────────
interface WorkspaceShellProps {
  nodeKey: string;
  loading: boolean;
  onInvoke: (context: string) => void;
  standaloneEnabled?: boolean;
  /** Override the default invoke context (e.g. when controls add extra params) */
  invokeContext?: string;
  /** Override the default CTA label */
  invokeLabel?: string;
  /** Override the default loading label */
  loadingLabel?: string;
  /** Extra content rendered between the description and the tab bar */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  nodeKey,
  loading,
  onInvoke,
  standaloneEnabled,
  invokeContext,
  invokeLabel,
  loadingLabel,
  headerExtra,
  children,
}) => {
  const meta = AGENT_META[nodeKey];

  // Graceful fallback for nodes not in the registry
  const agentNumber  = meta?.agentNumber  ?? '';
  const name         = meta?.name         ?? nodeKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const pillar       = meta?.pillar       ?? 'Specialist Node';
  const icon         = meta?.icon         ?? 'ti-widget';
  const description  = meta?.description  ?? 'Advanced specialist agent configuration and telemetry matrix.';
  const model        = meta?.model        ?? 'Llama-3.3-70b';
  const capability   = meta?.capability   ?? 'Specialist Analysis';
  const ctaLabel     = invokeLabel  ?? meta?.invokeLabel  ?? 'Run Analysis';
  const ctaLoading   = loadingLabel ?? meta?.loadingLabel ?? 'Processing...';
  const ctaContext   = invokeContext ?? meta?.invokeContext ?? `Perform a deep ${name} assessment.`;
  const ctaAllowed   = standaloneEnabled ?? useStandaloneInvokeEnabled();
  const ctaLocked    = !ctaAllowed;

  return (
    <div className="ws-shell animate-fadeIn">

      {/* ── STANDARDISED HEADER ── */}
      <div className="ws-shell-header">
        <div className="ws-shell-icon-wrap">
          <i className={icon}></i>
        </div>
        <div className="ws-shell-header-body">
          <div className="ws-shell-meta-row">
            <span className="ws-shell-pillar-tag">{pillar}</span>
            {agentNumber && (
              <span className="ws-shell-agent-tag">Agent {agentNumber}</span>
            )}
            <span className="ws-shell-capability-tag">
              <i className="ti-bolt" style={{ marginRight: '4px', fontSize: '0.6rem' }}></i>
              {capability}
            </span>
          </div>
          <h2 className="ws-shell-title">{name}</h2>
          <p className="ws-shell-desc">{description}</p>
        </div>
      </div>

      {/* ── OPTIONAL HEADER EXTRA (e.g. URL input, config bar) ── */}
      {headerExtra && (
        <div className="ws-shell-header-extra">{headerExtra}</div>
      )}

      {/* ── CHILD CONTENT (tabs, panels, etc.) ── */}
      <div className="ws-shell-body">
        {children}
      </div>

      {/* ── STANDARDISED FOOTER ── */}
      <div className="ws-shell-footer">
        <div className="ws-shell-footer-left">
          <i className={icon} style={{ color: '#6366f1' }}></i>
          <span>
            Agent {agentNumber} · <strong>{model}</strong> · {capability}
          </span>
        </div>
        <button
          className="btn-primary highlight ws-shell-cta"
          onClick={() => onInvoke(ctaContext)}
          disabled={loading || ctaLocked}
        >
          {loading ? (
            <><i className="ti-reload spin-animation"></i> {ctaLoading}</>
          ) : (
            <><i className={icon}></i> {ctaLabel}</>
          )}
        </button>
      </div>

      {/* ── SHARED STYLES ── */}
      <style>{`
        .ws-shell { display: flex; flex-direction: column; gap: 0; min-height: 500px; }

        /* Header */
        .ws-shell-header { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; margin-bottom: 20px; }
        .ws-shell-icon-wrap { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04)); border: 1px solid rgba(99,102,241,0.18); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: #6366f1; flex-shrink: 0; }
        .ws-shell-header-body { flex: 1; }
        .ws-shell-meta-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
        .ws-shell-pillar-tag { font-size: 0.62rem; font-weight: 800; color: #6366f1; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); padding: 3px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
        .ws-shell-agent-tag { font-size: 0.62rem; font-weight: 700; color: #94a3b8; background: #f1f5f9; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
        .ws-shell-capability-tag { font-size: 0.62rem; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15); padding: 3px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; }
        .ws-shell-title { margin: 0 0 4px 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
        .ws-shell-desc { margin: 0; font-size: 0.82rem; color: #64748b; line-height: 1.55; max-width: 680px; }

        /* Header extra */
        .ws-shell-header-extra { margin-bottom: 20px; }

        /* Body */
        .ws-shell-body { flex: 1; }

        /* Section header (used inside child panels) */
        .ws-shell-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .ws-shell-section-title { font-size: 0.95rem; font-weight: 700; color: #1e293b; margin: 0; }
        .ws-shell-section-right { display: flex; align-items: center; gap: 10px; }
        .ws-shell-badge { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }

        /* Footer */
        .ws-shell-footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .ws-shell-footer-left { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #64748b; }
        .ws-shell-cta { display: flex; align-items: center; gap: 8px; }

        /* Empty state */
        .ws-shell-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px 20px; color: #94a3b8; background: #f8fafc; border-radius: 10px; border: 1px dashed #e2e8f0; text-align: center; }
        .ws-shell-empty-msg { font-size: 0.88rem; font-weight: 600; color: #64748b; }
        .ws-shell-empty-sub { font-size: 0.78rem; color: #94a3b8; margin-top: 4px; }

        /* Shared ws-empty-state (legacy compat) */
        .ws-empty-state { display: flex; align-items: center; justify-content: center; padding: 32px 16px; color: #94a3b8; font-size: 0.85rem; font-weight: 500; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
      `}</style>
    </div>
  );
};

export default WorkspaceShell;
