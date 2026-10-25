/**
 * ================================================================================
 * SeQuor AGENT MESH — INTELLIGENT TEST PLANNER WORKSPACE (Agent #1)
 * ================================================================================
 * Dedicated workspace for the Intelligent Test Planner — the strategic entry
 * point of the AEIAP mesh. Displays the full structured test plan output:
 * Executive Summary, Testing Objectives, Scope & Gherkin, Risk Matrix,
 * Test Strategy Recommendations, and Intelligence Metrics.
 */

import React, { useState } from 'react';
import WorkspaceShell from './WorkspaceShell';

interface PlanningAgentWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const PlanningAgentWorkspace: React.FC<PlanningAgentWorkspaceProps> = ({
  onInvoke,
  loading,
  telemetry,
  fullMeshState,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'objectives' | 'scope' | 'risk' | 'strategy' | 'metrics'>('summary');
  const asText = (value: unknown, fallback = '—'): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return asText(obj.feature ?? obj.name ?? obj.title ?? obj.value ?? obj.risk_level ?? obj.priority ?? obj.label, fallback);
    }
    return fallback;
  };

  // ── Live data extraction ──────────────────────────────────────────────────

  const parsed = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      return typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
    } catch { return null; }
  }, [telemetry]);

  // Also check fullMeshState.analysis_payload as a secondary source
  const analysisPayload = React.useMemo(() => {
    if (parsed) return parsed;
    try {
      return fullMeshState?.analysis_payload ?? fullMeshState?.final_synthesis ?? null;
    } catch { return null; }
  }, [parsed, fullMeshState]);

  const execSummary = React.useMemo(() => {
    if (!analysisPayload) return null;
    const s = analysisPayload.executive_summary ?? null;
    if (!s || typeof s !== 'object') return null;
    return { title: asText(s.title, '—'), description: asText(s.description, '—') };
  }, [analysisPayload]);

  const objectives = React.useMemo(() => {
    if (!analysisPayload) return null;
    const arr = analysisPayload.testing_objectives ?? null;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((o: any) => ({
      goal: asText(o.goal, '—'),
      success_criteria: asText(o.success_criteria, '—'),
    }));
  }, [analysisPayload]);

  const scope = React.useMemo(() => {
    if (!analysisPayload) return null;
    const s = analysisPayload.scope ?? null;
    if (!s || typeof s !== 'object') return null;
    return {
      inclusions: Array.isArray(s.inclusions) ? s.inclusions : [],
      exclusions: Array.isArray(s.exclusions) ? s.exclusions : [],
      gherkin: Array.isArray(s.gherkin_scenarios) ? s.gherkin_scenarios : [],
    };
  }, [analysisPayload]);

  const riskMatrix = React.useMemo(() => {
    if (!analysisPayload) return null;
    const arr = analysisPayload.risk_matrix ?? null;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((r: any) => ({
      area: asText(r.area, '—'),
      likelihood: asText(r.likelihood, '—'),
      impact: asText(r.impact, '—'),
      mitigation: asText(r.mitigation, '—'),
    }));
  }, [analysisPayload]);

  const strategy = React.useMemo(() => {
    if (!analysisPayload) return null;
    const s = analysisPayload.test_strategy_recommendations ?? null;
    if (!s || typeof s !== 'object') return null;
    return s;
  }, [analysisPayload]);

  const metrics = React.useMemo(() => {
    if (!analysisPayload) return null;
    const m = analysisPayload.intelligence_metrics ?? null;
    if (!m || typeof m !== 'object') return null;
    return {
      coverage: m.requirement_coverage ?? null,
      riskDensity: m.risk_density ?? null,
      slaConfidence: m.sla_confidence ?? null,
      stabilityIndex: m.stability_index ?? null,
    };
  }, [analysisPayload]);

  const testingPoints = React.useMemo(() => {
    if (!analysisPayload) return null;
    const arr = analysisPayload.testing_points ?? null;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((p: any) => ({
      feature: asText(p.feature, '—'),
      verificationPoint: asText(p.verification_point, '—'),
      expectedBehavior: asText(p.expected_behavior, '—'),
    }));
  }, [analysisPayload]);

  const RISK_COLOR: Record<string, string> = {
    h: '#ef4444', high: '#ef4444',
    m: '#f59e0b', medium: '#f59e0b', moderate: '#f59e0b',
    l: '#10b981', low: '#10b981',
  };

  const getRiskColor = (val: string | null) =>
    RISK_COLOR[String(val ?? '').toLowerCase()] ?? '#94a3b8';

  const STRATEGY_LABELS: Record<string, string> = {
    unit: 'Unit', api: 'API', ui: 'UI / E2E', perf: 'Performance', security: 'Security',
  };

  return (
    <WorkspaceShell
      nodeKey="planning_agent"
      loading={loading}
      onInvoke={onInvoke}
      invokeContext="Perform a deep strategic test planning assessment and generate a complete STLC test plan."
      invokeLabel="Generate Test Plan"
      loadingLabel="Planning..."
    >
      {/* ── TAB BAR ── */}
      <div className="pa-tab-bar">
        {[
          { key: 'summary',    icon: 'ti-info-alt',      label: 'Summary'     },
          { key: 'objectives', icon: 'ti-target',         label: 'Objectives'  },
          { key: 'scope',      icon: 'ti-map-alt',        label: 'Scope'       },
          { key: 'risk',       icon: 'ti-alert',          label: 'Risk Matrix' },
          { key: 'strategy',   icon: 'ti-layers',         label: 'Strategy'    },
          { key: 'metrics',    icon: 'ti-stats-up',       label: 'Metrics'     },
        ].map(tab => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key as any)}
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="pa-content">

        {/* ── EXECUTIVE SUMMARY ── */}
        {activeTab === 'summary' && (
          <div className="pa-summary-panel">
            {execSummary ? (
              <>
                <div className="pa-summary-title">{asText(execSummary.title)}</div>
                <p className="pa-summary-desc">{asText(execSummary.description)}</p>
                {testingPoints && (
                  <div className="pa-testing-points">
                    <div className="pa-section-label">
                      <i className="ti-check-box" style={{ marginRight: '6px' }}></i>
                      Testing Points
                    </div>
                    {testingPoints.map((p, i) => (
                      <div key={i} className="pa-point-card">
                        <div className="pa-point-feature">{asText(p.feature)}</div>
                        <div className="pa-point-check">{asText(p.verificationPoint)}</div>
                        <div className="pa-point-expected">
                          <span className="pa-expected-label">Expected:</span> {p.expectedBehavior ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-info-alt" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Planning output is unavailable. Generate a mission to populate the Executive Summary.</span>
              </div>
            )}
          </div>
        )}

        {/* ── TESTING OBJECTIVES ── */}
        {activeTab === 'objectives' && (
          <div className="pa-objectives-panel">
            {objectives ? (
              objectives.map((obj, i) => (
                <div key={i} className="pa-objective-card">
                  <div className="pa-obj-number">{String(i + 1).padStart(2, '0')}</div>
                  <div className="pa-obj-body">
                    <div className="pa-obj-goal">{obj.goal ?? '—'}</div>
                    {obj.success_criteria && (
                      <div className="pa-obj-criteria">
                        <i className="ti-check" style={{ color: '#10b981', marginRight: '6px', fontSize: '0.7rem' }}></i>
                        {asText(obj.success_criteria)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="ws-empty-state">
                <i className="ti-target" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>No testing objectives were produced. Run the planner with a valid PRD to populate this section.</span>
              </div>
            )}
          </div>
        )}

        {/* ── SCOPE & GHERKIN ── */}
        {activeTab === 'scope' && (
          <div className="pa-scope-panel">
            {scope ? (
              <>
                {scope.inclusions.length > 0 && (
                  <div className="pa-scope-section">
                    <div className="pa-section-label pa-label-green">
                      <i className="ti-check" style={{ marginRight: '6px' }}></i> In Scope
                    </div>
                    <div className="pa-scope-tags">
                    {scope.inclusions.map((item: string, i: number) => (
                        <span key={i} className="pa-scope-tag in">{asText(item)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {scope.exclusions.length > 0 && (
                  <div className="pa-scope-section">
                    <div className="pa-section-label pa-label-red">
                      <i className="ti-na" style={{ marginRight: '6px' }}></i> Out of Scope
                    </div>
                    <div className="pa-scope-tags">
                    {scope.exclusions.map((item: string, i: number) => (
                        <span key={i} className="pa-scope-tag out">{asText(item)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {scope.gherkin.length > 0 && (
                  <div className="pa-scope-section">
                    <div className="pa-section-label">
                      <i className="ti-write" style={{ marginRight: '6px' }}></i>
                      BDD Scenarios ({scope.gherkin.length})
                    </div>
                    <div className="pa-gherkin-list">
                      {scope.gherkin.map((scenario: string, i: number) => (
                        <pre key={i} className="pa-gherkin-block">{asText(scenario)}</pre>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-map-alt" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Scope and Gherkin scenarios are not available yet. Generate the plan from a requirement source.</span>
              </div>
            )}
          </div>
        )}

        {/* ── RISK MATRIX ── */}
        {activeTab === 'risk' && (
          <div className="pa-risk-panel">
            {riskMatrix ? (
              <>
                <div className="pa-risk-grid header">
                  <span>Risk Area</span>
                  <span>Likelihood</span>
                  <span>Impact</span>
                  <span>Mitigation</span>
                </div>
                {riskMatrix.map((r, i) => (
                  <div key={i} className="pa-risk-grid row">
                    <span className="pa-risk-area">{asText(r.area)}</span>
                    <span
                      className="pa-risk-pill"
                      style={{ background: `${getRiskColor(r.likelihood)}20`, color: getRiskColor(r.likelihood) }}
                    >
                      {asText(r.likelihood)}
                    </span>
                    <span
                      className="pa-risk-pill"
                      style={{ background: `${getRiskColor(r.impact)}20`, color: getRiskColor(r.impact) }}
                    >
                      {asText(r.impact)}
                    </span>
                    <span className="pa-risk-mitigation">{asText(r.mitigation)}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-alert" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>The risk matrix is waiting on validated planning telemetry.</span>
              </div>
            )}
          </div>
        )}

        {/* ── TEST STRATEGY ── */}
        {activeTab === 'strategy' && (
          <div className="pa-strategy-panel">
            {strategy ? (
              <div className="pa-strategy-grid">
                {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
                  strategy[key] ? (
                    <div key={key} className="pa-strategy-card">
                      <div className="pa-strategy-label">{label}</div>
                      <div className="pa-strategy-value">{asText(strategy[key])}</div>
                    </div>
                  ) : null
                ))}
                {/* Render any extra keys not in the standard map */}
                {Object.entries(strategy)
                  .filter(([k]) => !Object.keys(STRATEGY_LABELS).includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="pa-strategy-card">
                      <div className="pa-strategy-label">{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                      <div className="pa-strategy-value">{asText(v)}</div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-layers" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Strategy recommendations are unavailable until a requirement-specific plan is generated.</span>
              </div>
            )}
          </div>
        )}

        {/* ── INTELLIGENCE METRICS ── */}
        {activeTab === 'metrics' && (
          <div className="pa-metrics-panel">
            {metrics ? (
              <div className="pa-metrics-grid">
                {[
                  { label: 'Requirement Coverage', value: metrics.coverage,      icon: 'ti-check-box',  color: '#10b981' },
                  { label: 'Risk Density',          value: metrics.riskDensity,   icon: 'ti-alert',      color: '#f59e0b' },
                  { label: 'SLA Confidence',        value: metrics.slaConfidence, icon: 'ti-stats-up',   color: '#6366f1' },
                  { label: 'Stability Index',       value: metrics.stabilityIndex,icon: 'ti-pulse',      color: '#8b5cf6' },
                ].filter(m => m.value !== null).map((m, i) => (
                  <div key={i} className="pa-metric-card">
                    <div className="pa-metric-icon" style={{ color: m.color, background: `${m.color}15` }}>
                      <i className={m.icon}></i>
                    </div>
                    <div className="pa-metric-body">
                      <div className="pa-metric-label">{m.label}</div>
                      <div className="pa-metric-value" style={{ color: m.color }}>{asText(m.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-stats-up" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Intelligence metrics will appear after the planner runs against a concrete requirement.</span>
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        .pa-tab-bar { display: flex; gap: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 0; margin-bottom: 20px; flex-wrap: wrap; }
        .pa-tab-bar button { background: none; border: none; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; display: flex; align-items: center; gap: 5px; }
        .pa-tab-bar button:hover { color: #6366f1; }
        .pa-tab-bar button.active { color: #6366f1; border-bottom-color: #6366f1; }

        .pa-content { flex: 1; padding: 4px 0; }

        /* Summary */
        .pa-summary-title { font-size: 1.1rem; font-weight: 800; color: #0f172a; margin-bottom: 10px; }
        .pa-summary-desc { font-size: 0.9rem; color: #475569; line-height: 1.65; margin: 0 0 24px 0; }
        .pa-section-label { font-size: 0.72rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; display: flex; align-items: center; }
        .pa-label-green { color: #15803d; }
        .pa-label-red { color: #b91c1c; }
        .pa-testing-points { display: flex; flex-direction: column; gap: 10px; }
        .pa-point-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
        .pa-point-feature { font-size: 0.85rem; font-weight: 700; color: #6366f1; margin-bottom: 4px; }
        .pa-point-check { font-size: 0.85rem; color: #1e293b; margin-bottom: 6px; }
        .pa-point-expected { font-size: 0.8rem; color: #64748b; }
        .pa-expected-label { font-weight: 700; color: #10b981; }

        /* Objectives */
        .pa-objectives-panel { display: flex; flex-direction: column; gap: 12px; }
        .pa-objective-card { display: flex; gap: 16px; align-items: flex-start; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
        .pa-obj-number { font-size: 1.4rem; font-weight: 900; color: #e2e8f0; line-height: 1; flex-shrink: 0; width: 32px; }
        .pa-obj-goal { font-size: 0.9rem; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
        .pa-obj-criteria { font-size: 0.82rem; color: #64748b; display: flex; align-items: flex-start; }

        /* Scope */
        .pa-scope-panel { display: flex; flex-direction: column; gap: 20px; }
        .pa-scope-section { }
        .pa-scope-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .pa-scope-tag { font-size: 0.78rem; font-weight: 600; padding: 5px 12px; border-radius: 20px; }
        .pa-scope-tag.in { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .pa-scope-tag.out { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .pa-gherkin-list { display: flex; flex-direction: column; gap: 10px; }
        .pa-gherkin-block { background: #0f172a; color: #a5f3fc; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; padding: 14px 16px; border-radius: 8px; margin: 0; white-space: pre-wrap; word-break: break-word; line-height: 1.6; }

        /* Risk Matrix */
        .pa-risk-panel { }
        .pa-risk-grid { display: grid; grid-template-columns: 1fr 80px 80px 2fr; gap: 12px; align-items: center; padding: 10px 12px; }
        .pa-risk-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.72rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .pa-risk-grid.row { border-bottom: 1px solid #f1f5f9; }
        .pa-risk-area { font-size: 0.88rem; font-weight: 600; color: #1e293b; }
        .pa-risk-pill { font-size: 0.68rem; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-align: center; text-transform: uppercase; }
        .pa-risk-mitigation { font-size: 0.82rem; color: #64748b; line-height: 1.4; }

        /* Strategy */
        .pa-strategy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .pa-strategy-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
        .pa-strategy-label { font-size: 0.68rem; font-weight: 800; color: #6366f1; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
        .pa-strategy-value { font-size: 0.85rem; color: #334155; line-height: 1.5; }

        /* Metrics */
        .pa-metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .pa-metric-card { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
        .pa-metric-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
        .pa-metric-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .pa-metric-value { font-size: 1.2rem; font-weight: 800; }

        .ws-empty-state { display: flex; align-items: center; justify-content: center; padding: 32px 16px; color: #94a3b8; font-size: 0.85rem; font-weight: 500; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
      `}</style>
    </WorkspaceShell>
  );
};

export default PlanningAgentWorkspace;
