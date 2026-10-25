import React, { useState } from 'react';
import WorkspaceShell from './WorkspaceShell';

interface ReleaseCommanderWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ReleaseCommanderWorkspace: React.FC<ReleaseCommanderWorkspaceProps> = ({
  onInvoke,
  loading,
  telemetry,
}) => {
  const [activeTab, setActiveTab] = useState<'decision' | 'metrics' | 'blockers'>('decision');

  const parsed = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      return typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
    } catch { return null; }
  }, [telemetry]);

  const gateStatus = parsed?.decision || 'PENDING';
  const confidence = parsed?.confidence_score || 0;
  const blockers = parsed?.blockers || [];

  return (
    <WorkspaceShell
      nodeKey="release_commander"
      loading={loading}
      onInvoke={onInvoke}
      invokeContext="Synthesize all mesh findings and issue a final production release directive."
      invokeLabel="Authorize Release Audit"
      loadingLabel="Synthesizing..."
    >
      {/* ── TAB BAR ── */}
      <div className="rc-tab-bar">
        {[
          { key: 'decision', icon: 'ti-shield',     label: 'Executive Decision' },
          { key: 'metrics',  icon: 'ti-layout-grid3', label: 'Consensus Metrics' },
          { key: 'blockers', icon: 'ti-alert',       label: 'Critical Blockers' },
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

      <div className="rc-content">
        {activeTab === 'decision' && (
          <div className="rc-decision-panel">
            {parsed ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="rc-metric-card">
                    <div className="rc-metric-label">Gate Status</div>
                    <div className="rc-metric-value" style={{ color: gateStatus === 'GO' ? '#10b981' : (gateStatus === 'NO-GO' ? '#ef4444' : '#6366f1') }}>
                      {gateStatus}
                    </div>
                  </div>
                  <div className="rc-metric-card">
                    <div className="rc-metric-label">Mesh Confidence</div>
                    <div className="rc-metric-value" style={{ color: '#1e293b' }}>{confidence}%</div>
                  </div>
                </div>
                <div className="rc-summary-box">
                  <div className="rc-section-label">Executive Reasoning</div>
                  <p className="rc-summary-text">{parsed.summary || "Consolidating 59-node reasoning for final sign-off."}</p>
                </div>
              </>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-shield" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Execute Release Audit to synthesize final gate decision.</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="rc-metrics-grid">
            {[
              { label: 'Security Guardrails', val: parsed?.metrics?.security ?? 0, color: '#6366f1' },
              { label: 'Performance SLAs', val: parsed?.metrics?.performance ?? 0, color: '#8b5cf6' },
              { label: 'Logic Consistency', val: parsed?.metrics?.logic ?? 0, color: '#10b981' },
              { label: 'Compliance Index', val: parsed?.metrics?.compliance ?? 0, color: '#f59e0b' }
            ].map(m => (
              <div key={m.label} className="rc-mini-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="rc-mini-label">{m.label}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: m.color }}>{m.val}%</span>
                </div>
                <div className="rc-progress-track">
                  <div style={{ height: '100%', width: `${m.val}%`, background: m.color }}></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'blockers' && (
          <div className="rc-blockers-panel">
            {blockers.length > 0 ? blockers.map((b: string, i: number) => (
              <div key={i} className="rc-blocker-item">
                <i className="ti-alert"></i>
                <span>{b}</span>
              </div>
            )) : (
              <div className="ws-empty-state">
                <i className="ti-check" style={{ marginRight: '8px', color: '#10b981' }}></i>
                <span>Zero critical path blockers detected.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .rc-tab-bar { display: flex; gap: 6px; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
        .rc-tab-bar button { background: none; border: none; padding: 10px 16px; font-size: 0.82rem; font-weight: 700; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .rc-tab-bar button.active { color: #6366f1; border-bottom-color: #6366f1; }
        
        .rc-content { flex: 1; }
        .rc-metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
        .rc-metric-label { font-size: 0.65rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .rc-metric-value { font-size: 1.8rem; font-weight: 950; letter-spacing: 1px; }
        
        .rc-summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; }
        .rc-section-label { font-size: 0.7rem; font-weight: 900; color: #15803d; text-transform: uppercase; margin-bottom: 8px; }
        .rc-summary-text { font-size: 0.85rem; color: #166534; line-height: 1.6; margin: 0; font-style: italic; }
        
        .rc-metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .rc-mini-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .rc-mini-label { font-size: 0.68rem; font-weight: 800; color: #64748b; text-transform: uppercase; }
        .rc-progress-track { height: 6px; background: #f1f5f9; borderRadius: 3px; overflow: hidden; }
        
        .rc-blocker-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #ef4444; border-radius: 8px; margin-bottom: 10px; font-size: 0.82rem; color: #ef4444; font-weight: 600; }
        .rc-blocker-item i { font-size: 1rem; }
        
        .ws-empty-state { display: flex; align-items: center; justify-content: center; padding: 40px 16px; color: #94a3b8; font-size: 0.85rem; font-weight: 500; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
      `}</style>
    </WorkspaceShell>
  );
};

export default ReleaseCommanderWorkspace;
