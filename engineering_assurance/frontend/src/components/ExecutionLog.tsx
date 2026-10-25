/**
 * ================================================================================
 * EVALUATIONS BY SeQuor — LIVE EXECUTION LOG PANEL
 * ================================================================================
 * Architecture: Real-time Agent Activity Stream via polling.
 *
 * LEFT PANEL  — Full mesh node list derived from mesh_topology.nodes (real backend data).
 *               Each node shows its live status: pending → active → completed / failed.
 * RIGHT PANEL — Raw agent thought-stream logs from the backend.
 *
 * NO hardcoded demo steps. When no taskId is present, a clean idle state is shown.
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import './ExecutionLog.css';
import { API_BASE } from '../config';

interface LogEntry {
  timestamp: string;
  agent: string;
  message: string;
  level?: string;
}

interface MeshNode {
  id: string;
  label: string;
  agent: string;
  key: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'bypassed';
}

interface ExecutionLogProps {
  taskId?: string | null;
  isVisible: boolean;
  onClose: () => void;
  setLiveLogs?: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  fullAgentState?: any;
  factoryStep?: number;
}

// ── AGENT IDENTITY MAP ────────────────────────────────────────────────────────
const AGENT_COLORS: Record<string, string> = {
  Planner: '#6366f1', Clarifier: '#8b5cf6', Synthesis: '#a78bfa',
  'Synthesis Optimizer': '#a78bfa', Governor: '#ec4899', Auditor: '#f43f5e',
  Logician: '#f43f5e', Creator: '#f59e0b', DataBuilder: '#10b981',
  Supplier: '#10b981', ApiMock: '#06b6d4', APIValidation: '#06b6d4',
  Critic: '#3b82f6', Automation: '#a78bfa', Visual: '#ec4899',
  Performance: '#f59e0b', Security: '#ef4444', Microservices: '#84cc16',
  SLO: '#14b8a6', Tracing: '#3b82f6', Reliability: '#10b981',
  UXIntelligence: '#f43f5e', SelfHealing: '#f97316', RcaIntelligence: '#ef4444',
  Optimizer: '#10b981', Writer: '#6366f1', System: '#64748b',
  Ingestor: '#6366f1', InferenceV7: '#94a3b8',
};

const AGENT_ICONS: Record<string, string> = {
  Planner: 'ti-direction', Clarifier: 'ti-search', 'Synthesis Optimizer': 'ti-filter',
  Governor: 'ti-shield', Auditor: 'ti-link', Logician: 'ti-pulse',
  Creator: 'ti-clipboard', DataBuilder: 'ti-server', Supplier: 'ti-server',
  ApiMock: 'ti-plug', Critic: 'ti-eye', Automation: 'ti-code',
  Visual: 'ti-image', Performance: 'ti-stats-up', Security: 'ti-lock',
  Microservices: 'ti-layout-grid2', SLO: 'ti-timer', Tracing: 'ti-share',
  Reliability: 'ti-reload', UXIntelligence: 'ti-paint-bucket', SelfHealing: 'ti-loop',
  RcaIntelligence: 'ti-alert', Optimizer: 'ti-target', Writer: 'ti-pencil',
  System: 'ti-settings', Ingestor: 'ti-cloud-down',
};

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const getAgentColor = (agent: string): string => {
  const safeAgent = asText(agent, '');
  const key = Object.keys(AGENT_COLORS).find(k =>
    safeAgent.toUpperCase().includes(k.toUpperCase()) || k.toUpperCase().includes(safeAgent.toUpperCase())
  );
  return key ? AGENT_COLORS[key] : '#94a3b8';
};

const getAgentIcon = (agent: string): string => {
  const safeAgent = asText(agent, '');
  const key = Object.keys(AGENT_ICONS).find(k =>
    safeAgent.toUpperCase().includes(k.toUpperCase()) || k.toUpperCase().includes(safeAgent.toUpperCase())
  );
  return key ? AGENT_ICONS[key] : 'ti-widget';
};

// Derive node status from mesh_topology node status field
const nodeStatusClass = (status: string): string => {
  if (status === 'active')    return 'node-active';
  if (status === 'completed') return 'node-completed';
  if (status === 'failed')    return 'node-failed';
  if (status === 'bypassed')  return 'node-bypassed';
  return 'node-pending';
};

const nodeStatusIcon = (status: string): string => {
  if (status === 'active')    return 'ti-control-play';
  if (status === 'completed') return 'ti-check';
  if (status === 'failed')    return 'ti-close';
  if (status === 'bypassed')  return 'ti-na';
  return 'ti-time';
};

const PHASE2_PILLARS = [
  {
    id: 'foundation', label: 'Foundation Mesh', icon: 'ti-layers',
    keys: ['ingestor','clarifier','synthesis_optimizer','governor','planning_agent','logician','auditor','lifecycle','monitor','compliance_remediation','rel_risk','biz_impact','roi_intel','knowledge_graph','meta_intel'],
  },
  {
    id: 'factory', label: 'Artifact Factory', icon: 'ti-package',
    keys: ['creator','data_builder','api_mock','api_validation','graphql_validation','test_impact','regression','agent_2','exploratory'],
  },
  {
    id: 'execution', label: 'Execution Array', icon: 'ti-code',
    keys: ['automation_forge','api_coder','migration','cross_browser','mobile_testing','visual_intel','i18n_testing','run_orchestrator','delivery','feature_flag','mutation','env_provisioner','digital_twin','env_consistency'],
  },
  {
    id: 'nfr', label: 'NFR & Guards', icon: 'ti-shield',
    keys: ['performance','security','chaos','perf_intel','sys_resil','microservices','tracing','data_pipeline','event_driven'],
  },
  {
    id: 'sre', label: 'SRE & UX', icon: 'ti-pulse',
    keys: ['reliability_eng','slo','ux_intelligence','self_healing','locator','suite_optimization','rca_intel','inc_remed','obs_intel'],
  },
] as const;

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export const ExecutionLog: React.FC<ExecutionLogProps> = ({
  taskId,
  isVisible,
  onClose,
  setLiveLogs,
  fullAgentState,
  factoryStep = 0,
}) => {
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [meshNodes, setMeshNodes]     = useState<MeshNode[]>([]);
  const [activeAgent, setActiveAgent] = useState<string>('System');
  const [taskStatus, setTaskStatus]   = useState<string>('PENDING');
  const [isRunning, setIsRunning]     = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [missionIntent, setMissionIntent]   = useState<string>('');
  const [partialState, setPartialState] = useState<Record<string, any>>({});
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({
    foundation: true,
    factory: true,
    execution: true,
    nfr: true,
    sre: true,
  });
  const logEndRef  = useRef<HTMLDivElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt  = useRef<number>(0);

  // Auto-scroll log stream
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Reset state when taskId changes
  useEffect(() => {
    setLogs([]);
    setMeshNodes([]);
    setActiveAgent('System');
    setTaskStatus('PENDING');
    setIsRunning(false);
    setElapsedSeconds(0);
    setMissionIntent('');
    setExpandedPillars({
      foundation: true,
      factory: true,
      execution: true,
      nfr: true,
      sre: true,
    });
  }, [taskId]);

  // ── LIVE POLLING ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!taskId || !isVisible) return;

    setIsRunning(true);
    startedAt.current = Date.now();

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);

    const executePoll = async () => {
      try {
        const res = await apiClient.get(`/api/tasks/status/${taskId}`);
        setPartialState(res.partial_state || {});
        const data = res;

        // ── LOGS ──
        const backendLogs: LogEntry[] = data.logs || [];
        if (backendLogs.length > 0) {
          setLogs(backendLogs);
          if (setLiveLogs) setLiveLogs(backendLogs);
          const last = backendLogs[backendLogs.length - 1];
          // Skip system noise for active agent display
          if (last.agent && !['System', 'InferenceV7'].includes(last.agent)) {
            setActiveAgent(last.agent);
          }
        }

        // ── MESH TOPOLOGY (the real node list) ──
        if (data.mesh_topology?.nodes) {
          setMeshNodes(data.mesh_topology.nodes);
        }

        // ── TASK STATUS ──
        setTaskStatus(data.status);

        // Infer mission intent from active_agents if available
        if (data.mesh_topology?.mesh_id) {
          setMissionIntent(data.mesh_topology.mesh_id);
        }

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          setIsRunning(false);
          clearInterval(pollRef.current!);
          clearInterval(timerRef.current!);
        }
      } catch (err) {
        console.error('[EXEC-LOG] Poll error:', err);
      }
    };

    // Fire immediately, then every 800ms
    executePoll();
    pollRef.current = setInterval(executePoll, 800);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [taskId, isVisible]);

  // ── TEST CASE MODE (Phase 2) ─────────────────────────────────────────────────
  // IMPORTANT: useMemo must be called BEFORE any early return (Rules of Hooks).
  // When fullAgentState has test_cases, show them instead of mesh nodes.
  const rawTestCases: any[] = React.useMemo(() => {
    if (!fullAgentState) return [];
    const tc = fullAgentState.test_cases || fullAgentState.test_case_factory?.test_cases || [];
    return Array.isArray(tc) ? tc : [];
  }, [fullAgentState]);

  if (!isVisible) return null;

  // ── DERIVED COUNTS ──────────────────────────────────────────────────────────
  const completedCount = meshNodes.filter(n => n.status === 'completed').length;
  const activeCount    = meshNodes.filter(n => n.status === 'active').length;
  const failedCount    = meshNodes.filter(n => n.status === 'failed').length;
  const pendingCount   = meshNodes.filter(n => n.status === 'pending').length;
  const totalNodes     = meshNodes.length;

  const isPhase2 = factoryStep >= 4;
  const showTestCases = isPhase2 && rawTestCases.length > 0;

  // Derive test case status from available fields
  const getTestCaseStatus = (tc: any): 'pass' | 'fail' | 'running' | 'pending' => {
    const s = String(tc.status || tc.result || '').toLowerCase();
    if (s.includes('pass') || s.includes('success') || s.includes('done')) return 'pass';
    if (s.includes('fail') || s.includes('error')) return 'fail';
    if (s.includes('run') || s.includes('active') || s.includes('progress')) return 'running';
    return 'pending';
  };

  // Score counts — test cases in Phase 2, mesh nodes in Phase 1
  const passCount    = showTestCases ? rawTestCases.filter(tc => getTestCaseStatus(tc) === 'pass').length    : completedCount;
  const failCount    = showTestCases ? rawTestCases.filter(tc => getTestCaseStatus(tc) === 'fail').length    : failedCount;
  const runningCount = showTestCases ? rawTestCases.filter(tc => getTestCaseStatus(tc) === 'running').length : activeCount;
  const waitCount    = showTestCases ? rawTestCases.filter(tc => getTestCaseStatus(tc) === 'pending').length : pendingCount;
  const totalItems   = showTestCases ? rawTestCases.length : totalNodes;
  const doneItems    = showTestCases ? passCount : completedCount;
  const progressPct  = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="exec-log-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="exec-log-panel">

        {/* ── HEADER ── */}
        <div className="exec-log-header">
          <div className="exec-log-header-left">
            <div className={`exec-log-status-dot ${isRunning ? 'running' : taskStatus === 'FAILED' ? 'failed' : 'done'}`} />
            <span className="exec-log-title">Mission Control</span>
            <span className={`exec-log-badge ${isRunning ? 'badge-running' : taskStatus === 'FAILED' ? 'badge-failed' : taskStatus === 'COMPLETED' ? 'badge-done' : factoryStep === 3 ? 'badge-pending' : 'badge-pending'}`}>
              {isRunning ? (isPhase2 ? 'SYNTHESIZING' : 'RUNNING') : taskStatus === 'FAILED' ? 'FAILED' : taskStatus === 'COMPLETED' ? 'COMPLETE' : factoryStep === 3 ? 'AWAITING' : 'PENDING'}
            </span>
            {missionIntent && (
              <span className="exec-log-intent-badge">
                {asText(missionIntent).includes('ANT') ? asText(missionIntent).split('ANT-')[1] || asText(missionIntent) : asText(missionIntent)}
              </span>
            )}
          </div>
          <div className="exec-log-header-right">
            <span className="exec-log-timer">⏱ {formatTime(elapsedSeconds)}</span>
            <button className="exec-log-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="exec-log-body">

          {/* ── LEFT: PHASE-AWARE EXECUTION TRACKER ── */}
          <div className="exec-log-left">

            {/* Active Agent Banner */}
            <div className="exec-active-agent" style={{ borderColor: getAgentColor(activeAgent) }}>
              <div className="exec-active-label">ACTIVE AGENT</div>
              <div className="exec-active-name" style={{ color: getAgentColor(activeAgent) }}>
                <i className={getAgentIcon(activeAgent)} style={{ marginRight: 6 }} />
                {activeAgent}
              </div>
            </div>

            {/* ══════════════════════════════════════════════
                PHASE 1 VIEW — Intelligence Metrics + Pipeline
            ══════════════════════════════════════════════ */}
            {!showTestCases && (() => {
              // Extract live intelligence from fullAgentState
              const ap = fullAgentState?.analysis_payload || {};
              const metrics = ap.intelligence_metrics || ap.reasoning_audit || {};
              const riskMatrix: any[] = Array.isArray(ap.risk_matrix) ? ap.risk_matrix : [];
              const gherkinCount = Array.isArray(ap.scope?.gherkin_scenarios) ? ap.scope.gherkin_scenarios.length : 0;
              const confidence = metrics.sla_confidence || metrics.confidence_score
                ? (typeof metrics.confidence_score === 'number'
                    ? `${Math.round(metrics.confidence_score * 100)}%`
                    : metrics.sla_confidence || '-')
                : '-';
              const coverage = metrics.requirement_coverage || '-';
              const riskDensity = metrics.risk_density || '-';
              const hasMetrics = coverage !== '-' || confidence !== '-' || riskMatrix.length > 0;

              // Phase 1 pipeline — only the 6 nodes that actually run
              const PHASE1_PIPELINE = [
                { key: 'ingestor',            label: 'Requirement Ingestor',  agent: '00i' },
                { key: 'clarifier',           label: 'Req. Clarifier',        agent: '03'  },
                { key: 'synthesis_optimizer', label: 'Synthesis Optimizer',   agent: '05'  },
                { key: 'governor',            label: 'Compliance Governor',   agent: '21'  },
                { key: 'planning_agent',      label: 'Intelligent Planner',   agent: '01'  },
                { key: 'writer',              label: 'Plan Composer',         agent: 'W1'  },
              ];

              // Map mesh node statuses onto the pipeline
              const nodeStatusMap: Record<string, string> = {};
              meshNodes.forEach(n => { nodeStatusMap[n.key] = n.status; });

              const getPipelineStatus = (key: string) => {
                const s = nodeStatusMap[key];
                if (s === 'completed') return 'done';
                if (s === 'active')    return 'running';
                if (s === 'failed')    return 'failed';
                return 'pending';
              };

              const doneInPipeline = PHASE1_PIPELINE.filter(n => getPipelineStatus(n.key) === 'done').length;

              return (
                <>
                  {/* Phase 1 Pipeline — compact 6-node view */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="exec-tc-header" style={{ marginBottom: 2 }}>
                      <i className="ti-direction" style={{ marginRight: 6 }} />
                      Phase 1 Pipeline
                      <span className="exec-node-count">{doneInPipeline}/{PHASE1_PIPELINE.length}</span>
                    </div>
                    {PHASE1_PIPELINE.map((node, idx) => {
                      const st = getPipelineStatus(node.key);
                      const rowClass = st === 'running' ? 'node-active' : st === 'done' ? 'node-completed' : st === 'failed' ? 'node-failed' : 'node-pending';
                      return (
                        <div key={node.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: st === 'running' ? 'rgba(99,102,241,0.08)' : st === 'done' ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${st === 'running' ? 'rgba(99,102,241,0.4)' : st === 'done' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)'}`, transition: 'all 0.3s' }}>
                          <div style={{ width: 16, flexShrink: 0, textAlign: 'center' }}>
                            {st === 'running' && <span className="exec-node-pulse" />}
                            {st === 'done'    && <i className="ti-check" style={{ color: '#10b981', fontSize: '0.7rem' }} />}
                            {st === 'failed'  && <i className="ti-close" style={{ color: '#ef4444', fontSize: '0.7rem' }} />}
                            {st === 'pending' && <span style={{ color: '#334155', fontSize: '0.65rem', fontFamily: 'monospace' }}>{idx + 1}</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: st === 'running' ? '#a5b4fc' : st === 'done' ? '#10b981' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</div>
                          </div>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: st === 'running' ? 'rgba(99,102,241,0.2)' : st === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.1)', color: st === 'running' ? '#818cf8' : st === 'done' ? '#10b981' : '#475569', flexShrink: 0 }}>
                            {st === 'running' ? 'LIVE' : st === 'done' ? 'DONE' : st === 'failed' ? 'FAIL' : '○'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Intelligence Metrics — appear as planner completes */}
                  {hasMetrics && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="exec-tc-header" style={{ marginBottom: 2 }}>
                        <i className="ti-stats-up" style={{ marginRight: 6 }} />
                        Intelligence Metrics
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {[
                          { label: 'Coverage',    value: coverage,    icon: 'ti-target',    color: '#6366f1' },
                          { label: 'Confidence',  value: confidence,  icon: 'ti-shield',    color: '#10b981' },
                          { label: 'Risk Density',value: riskDensity, icon: 'ti-alert',     color: riskDensity === 'High' ? '#ef4444' : riskDensity === 'Moderate' ? '#f59e0b' : '#10b981' },
                          { label: 'Scenarios',   value: gherkinCount > 0 ? String(gherkinCount) : '-', icon: 'ti-clipboard', color: '#a78bfa' },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: m.color, fontFamily: 'JetBrains Mono, monospace' }}>{m.value}</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Risks — appear as planner identifies them */}
                  {riskMatrix.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div className="exec-tc-header" style={{ marginBottom: 2 }}>
                        <i className="ti-alert-circle" style={{ marginRight: 6, color: '#ef4444' }} />
                        Risk Signals
                        <span className="exec-node-count" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>{riskMatrix.length}</span>
                      </div>
                      {riskMatrix.slice(0, 3).map((risk: any, i: number) => {
                        const lh = String(risk.likelihood || '').toUpperCase();
                        const imp = String(risk.impact || '').toUpperCase();
                        const isHigh = lh.startsWith('H') || imp.startsWith('H');
                        const isMed  = lh.startsWith('M') || imp.startsWith('M');
                        const rColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 7, background: `${rColor}08`, border: `1px solid ${rColor}25` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: rColor, flexShrink: 0, marginTop: 4 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{risk.area || 'Risk Area'}</div>
                              <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: 1 }}>L:{risk.likelihood || '?'} · I:{risk.impact || '?'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Idle state when no task */}
                  {!taskId && (
                    <div className="exec-idle-state">
                      <i className="ti-pulse" style={{ fontSize: '2rem', color: '#475569', marginBottom: 8 }} />
                      <div style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                        No active mission.<br />Start Phase 1 to see live intelligence.
                      </div>
                    </div>
                  )}

                  {/* HITL state — Phase 1 complete, awaiting approval */}
                  {taskId && factoryStep === 3 && !isRunning && (
                    <div style={{ padding: '12px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>✅</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Intelligence Contract Ready</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.5 }}>Go to Orchestration Hub to review and approve Phase 2.</div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ══════════════════════════════════════════════
                PHASE 2 VIEW — Agent Pillar Synthesis Progress
                Shows which of the 5 specialist pillars are
                running/done — NOT fake test execution status.
            ══════════════════════════════════════════════ */}
            {isPhase2 && (() => {
              // Map mesh node statuses
              const nodeStatusMap: Record<string, string> = {};
              meshNodes.forEach(n => { nodeStatusMap[n.key] = n.status; });

              const getPillarStatus = (keys: readonly string[]) => {
                const statuses = keys.map(k => nodeStatusMap[k] || 'pending');
                if (statuses.every(s => s === 'completed' || s === 'bypassed')) return 'done';
                if (statuses.some(s => s === 'active')) return 'running';
                if (statuses.some(s => s === 'failed')) return 'failed';
                if (statuses.some(s => s === 'completed')) return 'partial';
                return 'pending';
              };

              const getPillarCounts = (keys: readonly string[]) => {
                const statuses = keys.map(k => nodeStatusMap[k] || 'pending');
                return {
                  done: statuses.filter(s => s === 'completed' || s === 'bypassed').length,
                  total: keys.length,
                };
              };

              // Overall agent counts from mesh nodes
              const totalAgents = meshNodes.length;
              const doneAgents = meshNodes.filter(n => n.status === 'completed' || n.status === 'bypassed').length;
              const activeAgents = meshNodes.filter(n => n.status === 'active').length;
              const failedAgents = meshNodes.filter(n => n.status === 'failed').length;
              const pendingAgents = totalAgents - doneAgents - activeAgents - failedAgents;
              const synthProgress = totalAgents > 0 ? Math.round((doneAgents / totalAgents) * 100) : 0;

              // Extract synthesis metrics from fullAgentState — now handled inline in the IIFE below

              return (
                <>
                  {/* Agent Score Cards */}
                  <div className="exec-score-row">
                    <div className="exec-score-card pass">
                      <div className="exec-score-num">{doneAgents}</div>
                      <div className="exec-score-label">DONE</div>
                    </div>
                    <div className="exec-score-card running">
                      <div className="exec-score-num">{activeAgents}</div>
                      <div className="exec-score-label">ACTIVE</div>
                    </div>
                    <div className="exec-score-card fail">
                      <div className="exec-score-num">{failedAgents}</div>
                      <div className="exec-score-label">FAILED</div>
                    </div>
                    <div className="exec-score-card pending">
                      <div className="exec-score-num">{pendingAgents}</div>
                      <div className="exec-score-label">PENDING</div>
                    </div>
                  </div>

                  {/* Synthesis Progress Bar */}
                  {totalAgents > 0 && (
                    <div className="exec-progress-wrap">
                      <div className="exec-progress-label">
                        <span>Artifact Synthesis</span>
                        <span>{doneAgents}/{totalAgents} agents · {synthProgress}%</span>
                      </div>
                      <div className="exec-progress-bar">
                        <div className="exec-progress-fill" style={{ width: `${synthProgress}%`, background: synthProgress === 100 ? '#10b981' : '#6366f1' }} />
                      </div>
                    </div>
                  )}

                  {/* Pillar Progress */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="exec-tc-header" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span><i className="ti-layout-grid2" style={{ marginRight: 6 }} />Specialist Pillars</span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button type="button" onClick={() => setExpandedPillars(Object.fromEntries(PHASE2_PILLARS.map(p => [p.id, true])))}
                          style={{ fontSize: '0.56rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', cursor: 'pointer' }}>
                          EXPAND ALL
                        </button>
                        <button type="button" onClick={() => setExpandedPillars(Object.fromEntries(PHASE2_PILLARS.map(p => [p.id, false])))}
                          style={{ fontSize: '0.56rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#64748b', cursor: 'pointer' }}>
                          COLLAPSE ALL
                        </button>
                      </div>
                    </div>
                    {PHASE2_PILLARS.map(pillar => {
                      const st = getPillarStatus(pillar.keys);
                      const { done, total } = getPillarCounts(pillar.keys);
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      const color = st === 'done' ? '#10b981' : st === 'running' ? '#6366f1' : st === 'failed' ? '#ef4444' : st === 'partial' ? '#f59e0b' : '#94a3b8';
                      const expanded = !!expandedPillars[pillar.id];

                      // Group nodes by status — stable grouping, not reordering
                      // Active/Running at top, Pending in middle, Done/Bypassed collapsed at bottom
                      const activeKeys   = (pillar.keys as readonly string[]).filter(k => nodeStatusMap[k] === 'active');
                      const failedKeys   = (pillar.keys as readonly string[]).filter(k => nodeStatusMap[k] === 'failed');
                      const pendingKeys  = (pillar.keys as readonly string[]).filter(k => !nodeStatusMap[k] || nodeStatusMap[k] === 'pending');
                      const doneKeys     = (pillar.keys as readonly string[]).filter(k => nodeStatusMap[k] === 'completed' || nodeStatusMap[k] === 'bypassed');

                      const renderNodeRow = (nodeKey: string) => {
                        const ns = nodeStatusMap[nodeKey] || 'pending';
                        const badgeClass = ns === 'completed' ? 'node-completed' : ns === 'active' ? 'node-active' : ns === 'failed' ? 'node-failed' : ns === 'bypassed' ? 'node-bypassed' : 'node-pending';
                        const label = nodeKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        return (
                          <div key={nodeKey} className="exec-pillar-node-row" style={{ opacity: ns === 'bypassed' ? 0.4 : 1 }}>
                            {ns === 'active' && <span className="exec-node-pulse" style={{ width: 6, height: 6, flexShrink: 0 }} />}
                            {ns !== 'active' && <span style={{ width: 6, flexShrink: 0 }} />}
                            <span className="exec-pillar-node-key">{label}</span>
                            <span className={`exec-tc-status ${badgeClass}`}>{ns === 'completed' ? 'DONE' : ns === 'bypassed' ? 'SKIP' : ns.toUpperCase()}</span>
                          </div>
                        );
                      };

                      return (
                        <div key={pillar.id} className="exec-pillar-card">
                          <button
                            type="button"
                            className="exec-pillar-head"
                            onClick={() => setExpandedPillars(prev => ({ ...prev, [pillar.id]: !prev[pillar.id] }))}
                          >
                            <div style={{ width: 16, flexShrink: 0, textAlign: 'center' }}>
                              {st === 'running' && <span className="exec-node-pulse" />}
                              {st === 'done'    && <i className="ti-check" style={{ color: '#10b981', fontSize: '0.72rem' }} />}
                              {st === 'failed'  && <i className="ti-close" style={{ color: '#ef4444', fontSize: '0.72rem' }} />}
                              {(st === 'pending' || st === 'partial') && <i className={pillar.icon} style={{ color, fontSize: '0.72rem' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>{pillar.label}</div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 5, marginTop: 5, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 5, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ fontSize: '0.68rem', fontWeight: 800, color }}>{done}/{total}</div>
                              <i className={`ti-angle-${expanded ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: '0.7rem' }} />
                            </div>
                          </button>
                          {expanded && (
                            <div className="exec-pillar-body">
                              {/* Active nodes — always visible at top */}
                              {activeKeys.length > 0 && (
                                <>
                                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', letterSpacing: '0.08em', padding: '4px 0 2px', textTransform: 'uppercase' }}>⚡ Running</div>
                                  {activeKeys.map(renderNodeRow)}
                                </>
                              )}
                              {/* Failed nodes */}
                              {failedKeys.length > 0 && (
                                <>
                                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#ef4444', letterSpacing: '0.08em', padding: '4px 0 2px', textTransform: 'uppercase' }}>✗ Failed</div>
                                  {failedKeys.map(renderNodeRow)}
                                </>
                              )}
                              {/* Pending nodes */}
                              {pendingKeys.length > 0 && (
                                <>
                                  {(activeKeys.length > 0 || failedKeys.length > 0) && (
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', padding: '4px 0 2px', textTransform: 'uppercase' }}>○ Pending</div>
                                  )}
                                  {pendingKeys.map(renderNodeRow)}
                                </>
                              )}
                              {/* Done nodes — shown but visually de-emphasised */}
                              {doneKeys.length > 0 && (
                                <>
                                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#10b981', letterSpacing: '0.08em', padding: '4px 0 2px', textTransform: 'uppercase' }}>✓ Done ({doneKeys.length})</div>
                                  {doneKeys.map(renderNodeRow)}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Synthesis Metrics — comprehensive artifact counts */}
                  {(() => {
                    const tcCount   = Array.isArray(fullAgentState?.test_cases) ? fullAgentState.test_cases.length : 0;
                    const secCount  = Array.isArray(fullAgentState?.security_signals) ? fullAgentState.security_signals.length
                                    : (fullAgentState?.security_signals?.threats?.length ?? 0);
                    const riskCount = Array.isArray(fullAgentState?.analysis_payload?.risk_matrix) ? fullAgentState.analysis_payload.risk_matrix.length : 0;
                    const autoCount = Array.isArray(fullAgentState?.api_test_code) ? fullAgentState.api_test_code.length : 0;
                    const flakeCount = Array.isArray(fullAgentState?.reliability_eng?.flaky_tests) ? fullAgentState.reliability_eng.flaky_tests.length
                                     : (fullAgentState?.reliability_config?.flaky_tests?.length ?? 0);
                    const compCount = Array.isArray(fullAgentState?.compliance_report?.compliance_controls) ? fullAgentState.compliance_report.compliance_controls.length : 0;
                    if (tcCount + secCount + riskCount + autoCount + flakeCount + compCount === 0) return null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="exec-tc-header" style={{ marginBottom: 2 }}>
                          <i className="ti-stats-up" style={{ marginRight: 6 }} />Artifacts Generated
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                          {[
                            { label: 'Test Cases',  value: tcCount,    color: '#6366f1' },
                            { label: 'Risks',       value: riskCount,  color: '#ef4444' },
                            { label: 'Sec Threats', value: secCount,   color: '#f59e0b' },
                            { label: 'API Scripts', value: autoCount,  color: '#10b981' },
                            { label: 'Flaky Tests', value: flakeCount, color: '#f97316' },
                            { label: 'Compliance',  value: compCount,  color: '#a78bfa' },
                          ].map(m => (
                            <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '6px 8px', textAlign: 'center' }}>
                              <div style={{ fontSize: '1rem', fontWeight: 800, color: m.color, fontFamily: 'JetBrains Mono, monospace' }}>{m.value}</div>
                              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', marginTop: 2, textTransform: 'uppercase' }}>{m.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Waiting state when Phase 2 just started and no topology yet */}
                  {totalAgents === 0 && taskId && (
                    <div className="exec-idle-state">
                      <div className="exec-spinner-ring" />
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 8 }}>Initializing synthesis mesh...</div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Phase 2 running but mesh topology not yet loaded */}
            {isPhase2 && meshNodes.length === 0 && taskId && (
              <div className="exec-idle-state">
                <div className="exec-spinner-ring" />
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 8 }}>Initializing synthesis mesh...</div>
              </div>
            )}
          </div>

          {/* ── RIGHT: LIVE LOG STREAM ── */}
          <div className="exec-log-right">
            <div className="exec-log-stream-header">
              <span>{isPhase2 && isRunning ? 'Phase 2 - Synthesis Stream' : 'Agent Thought Stream'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {logs.length > 0 && (
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{logs.length} entries</span>
                )}
                {isRunning && <span className="exec-pulse">● LIVE</span>}
                {factoryStep === 3 && !isRunning && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>⏸ AWAITING APPROVAL</span>
                )}
              </div>
            </div>

            {/* HITL Waiting Banner — shown when Phase 1 is complete and awaiting user approval */}
            {factoryStep === 3 && !isRunning && (
              <div style={{
                margin: '12px 12px 0',
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.35)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'log-highlight 0.5s ease',
              }}>
                <div style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 1 }}>⏸</div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>
                    Phase 1 Complete - Human Review Required
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                    The Intelligence Contract is ready. Review the strategic plan in the Orchestration Hub, edit if needed, then approve to trigger Phase 2 artifact synthesis.
                  </div>
                </div>
              </div>
            )}

            <div className="exec-log-stream">
              {logs.length === 0 && !taskId && (
                <div className="exec-log-empty">
                  <i className="ti-comment-alt" style={{ fontSize: '1.5rem', marginBottom: 8, color: '#334155' }} />
                  <div>No active mission. Start a run to see the agent thought stream.</div>
                </div>
              )}
              {logs.length === 0 && taskId && (
                <div className="exec-log-empty">
                  <div className="exec-spinner-ring" style={{ marginBottom: 8 }} />
                  <div>Waiting for agents to activate...</div>
                </div>
              )}
              {logs.map((log, idx) => {
                const isLatest = idx === logs.length - 1;
                const isSystem = log.agent === 'System' || log.agent === 'InferenceV7';
                const color = getAgentColor(log.agent);
                return (
                  <div key={idx} className={`exec-log-entry ${isLatest ? 'latest' : ''} ${isSystem ? 'log-system' : ''}`}>
                    <span className="exec-log-ts">{log.timestamp}</span>
                    <span className="exec-log-agent" style={{ color }}>
                      <i className={getAgentIcon(log.agent)} style={{ marginRight: 4, fontSize: '0.7rem' }} />
                      {log.agent}
                    </span>
                    <span className="exec-log-msg">{log.message}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExecutionLog;
