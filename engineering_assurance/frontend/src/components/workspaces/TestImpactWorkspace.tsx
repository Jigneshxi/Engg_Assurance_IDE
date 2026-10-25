/**
 * ================================================================================
 * SeQuor AGENT MESH - TEST IMPACT INTELLIGENCE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface TestImpactWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const TestImpactWorkspace: React.FC<TestImpactWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'selection' | 'map' | 'history'>('selection');
  const asText = (value: unknown, fallback = '—'): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return asText(obj.feature ?? obj.name ?? obj.component ?? obj.module ?? obj.value ?? obj.risk_level ?? obj.severity, fallback);
    }
    return fallback;
  };

  const liveImpactData = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.impacted_modules ?? parsed.impact_areas ?? parsed.components ?? parsed.test_suites ?? parsed.features ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((m: any) => ({
        name: asText(m.module ?? m.name ?? m.component ?? m.feature ?? m.suite_name ?? null),
        depth: typeof m.depth === 'number' ? m.depth : (typeof m.level === 'number' ? m.level : null),
        tests: typeof m.tests === 'number' ? m.tests : typeof m.test_count === 'number' ? m.test_count : typeof m.cases === 'number' ? m.cases : (Array.isArray(m.test_cases) ? m.test_cases.length : null),
        risk: asText(m.risk ?? m.severity ?? m.risk_level ?? null),
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveHistory = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.history ?? parsed.change_log ?? parsed.commits ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((h: any) => ({
        ts: h.ts ?? h.timestamp ?? h.time ?? null,
        message: h.message ?? h.description ?? h.summary ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const impactSummary = React.useMemo(() => {
    if (!liveImpactData) return null;
    const totalTests = liveImpactData.reduce((acc, m) => acc + (m.tests ?? 0), 0);
    const maxDepth = liveImpactData.reduce((acc, m) => Math.max(acc, m.depth ?? 0), 0);
    return { modules: liveImpactData.length, totalTests, maxDepth };
  }, [liveImpactData]);

  const scanLabel = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.scan_label ?? parsed.pr_ref ?? parsed.commit ?? parsed.branch ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'map',       label: 'Impact Map',          icon: 'ti-share-alt' },
    { id: 'selection', label: 'Planned Selection',   icon: 'ti-check-box' },
    { id: 'history',   label: 'Change History',      icon: 'ti-time' },
  ];

  return (
    <WorkspaceShell
      nodeKey="test_impact"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ti-content">
          {activeTab === 'map' && (
            <div className="ti-map-panel">
              <div className="ti-section-header">
                <h3>{scanLabel ? `Blast Radius: ${asText(scanLabel)}` : 'Structural Blast Radius'}</h3>
                {impactSummary ? (
                  <span className="ti-impact-tag">{impactSummary.modules} Modules Impacted</span>
                ) : (
                  <span className="ti-hint">Run analysis to map impact</span>
                )}
              </div>
              {liveImpactData ? (
                <div className="ti-viz-container">
                  <div className="ti-viz-node central">{asText(scanLabel, 'SUT Root')}</div>
                  {liveImpactData.slice(0, 4).map((m, i) => (
                    <div key={i} className={`ti-viz-node target t${i + 1} ${String(m.risk ?? '').toLowerCase()}`}>
                      {asText(m.name)}
                    </div>
                  ))}
                  <div className="ti-viz-overlay">
                    <div className="stat"><span>Target Modules</span><strong>{impactSummary?.modules ?? 0}</strong></div>
                    <div className="stat"><span>Regression Tests</span><strong>{impactSummary?.totalTests ?? 0} Required</strong></div>
                    <div className="stat"><span>Impact Depth</span><strong>{impactSummary?.maxDepth ?? 0} Tiers</strong></div>
                  </div>
                </div>
              ) : (
                <div className="ti-viz-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WorkspaceEmptyState message="Calculate Blast Radius to populate impact map" icon="ti-share-alt" />
                </div>
              )}
            </div>
          )}

          {activeTab === 'selection' && (
            <div className="ti-selection-list">
              <div className="ti-section-header">
                <h3>Recommended Regression Subset</h3>
                {liveImpactData && <button className="ti-btn-exec">Execute Delta Run</button>}
              </div>
              {liveImpactData ? (
                <>
                  <div className="ti-grid header">
                    <span>Core Module</span>
                    <span>Dep. Depth</span>
                    <span>Test Count</span>
                    <span>Risk Level</span>
                  </div>
                  {liveImpactData.map((m, idx) => (
                    <div key={idx} className="ti-grid row">
                      <span className="ti-mod-name">{asText(m.name)}</span>
                      <span className="ti-depth-val">{m.depth !== null ? `Lvl ${m.depth}` : '-'}</span>
                      <span className="ti-test-val">{m.tests !== null ? `${m.tests} Cases` : '-'}</span>
                      <span className={`ti-risk-pill ${String(m.risk ?? '').toLowerCase()}`}>{asText(m.risk)}</span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Calculate Blast Radius to populate regression subset" icon="ti-check-box" />
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="ti-history-log">
              {liveHistory ? (
                liveHistory.map((h, idx) => (
                  <div key={idx} className="ti-log-item">
                    {h.ts && <span className="ts">{asText(h.ts)}</span>}
                    <p>{asText(h.message)}</p>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Calculate Blast Radius to populate change history" icon="ti-time" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .ti-content { flex: 1; padding: 10px 0; }
          .ti-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ti-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; font-weight: 700; }
          .ti-impact-tag { font-size: 0.75rem; font-weight: 700; color: #6366f1; background: rgba(99, 102, 241, 0.1); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(99, 102, 241, 0.2); }
          .ti-hint { font-size: 0.75rem; color: #94a3b8; font-style: italic; }
          .ti-viz-container { height: 350px; background: #0f172a; border-radius: 12px; position: relative; overflow: hidden; }
          .ti-viz-node { position: absolute; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 800; color: white; display: flex; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
          .ti-viz-node.central { top: 50%; left: 50%; transform: translate(-50%, -50%); background: #10b981; border: 1px solid rgba(16, 185, 129, 0.5); z-index: 10; }
          .ti-viz-node.target { background: #1e293b; border: 2px solid #334155; }
          .ti-viz-node.critical { border-color: #ef4444; color: #ef4444; animation: ti-pulse-red 2s infinite; }
          .ti-viz-node.high { border-color: #f97316; }
          .ti-viz-node.medium { border-color: #f59e0b; }
          .ti-viz-node.low { border-color: #94a3b8; color: #94a3b8; opacity: 0.6; }
          @keyframes ti-pulse-red { 0%, 100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.3); } 50% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.6); } }
          .ti-viz-node.t1 { top: 20%; left: 30%; }
          .ti-viz-node.t2 { top: 40%; right: 20%; }
          .ti-viz-node.t3 { bottom: 25%; left: 40%; }
          .ti-viz-node.t4 { top: 65%; right: 30%; }
          .ti-viz-overlay { position: absolute; top: 15px; left: 15px; display: flex; flex-direction: column; gap: 8px; }
          .ti-viz-overlay .stat { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 8px 12px; border-radius: 8px; backdrop-filter: blur(5px); display: flex; flex-direction: column; gap: 2px; }
          .ti-viz-overlay .stat span { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
          .ti-viz-overlay .stat strong { font-size: 1rem; color: #fff; font-weight: 800; }
          .ti-grid { display: grid; grid-template-columns: 1fr 100px 100px 100px; gap: 15px; align-items: center; padding: 12px; }
          .ti-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .ti-grid.row { border-bottom: 1px solid #f1f5f9; }
          .ti-mod-name { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
          .ti-depth-val { font-size: 0.8rem; color: #64748b; font-weight: 600; }
          .ti-test-val { font-size: 0.8rem; color: #6366f1; font-weight: 700; }
          .ti-risk-pill { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-align: center; color: white; }
          .ti-risk-pill.critical { background: #ef4444; }
          .ti-risk-pill.high { background: #f97316; }
          .ti-risk-pill.medium { background: #f59e0b; }
          .ti-risk-pill.low { background: #94a3b8; }
          .ti-btn-exec { background: #1e293b; color: #fff; border: none; padding: 6px 15px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
          .ti-btn-exec:hover { background: #10b981; }
          .ti-log-item { display: flex; flex-direction: column; gap: 4px; padding: 12px 15px; border-left: 4px solid #e2e8f0; background: #fff; border-radius: 0 8px 8px 0; border: 1px solid #f1f5f9; margin-bottom: 10px; }
          .ti-log-item .ts { font-size: 0.7rem; color: #94a3b8; font-family: monospace; }
          .ti-log-item p { margin: 0; font-size: 0.85rem; color: #334155; line-height: 1.4; }
        `}</style>
    </WorkspaceShell>
  );
};

export default TestImpactWorkspace;
