import React, { useState } from 'react';
import WorkspaceShell from './WorkspaceShell';

interface TrendAnalystWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const TrendAnalystWorkspace: React.FC<TrendAnalystWorkspaceProps> = ({
  onInvoke,
  loading,
  telemetry,
}) => {
  const [activeTab, setActiveTab] = useState<'trends' | 'drift' | 'history'>('trends');

  const parsed = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      return typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
    } catch { return null; }
  }, [telemetry]);

  const regressionScore = parsed?.regression_score || 0;
  const historicalTrends = parsed?.trends || [];

  return (
    <WorkspaceShell
      nodeKey="trend_analyst"
      loading={loading}
      onInvoke={onInvoke}
      invokeContext="Analyze historical mission telemetry to detect longitudinal logic drift and quality regressions."
      invokeLabel="Execute Trend Audit"
      loadingLabel="Analyzing History..."
    >
      {/* ── TAB BAR ── */}
      <div className="ta-tab-bar">
        {[
          { key: 'trends',  icon: 'ti-stats-up',         label: 'Quality Trends' },
          { key: 'drift',   icon: 'ti-exchange-vertical', label: 'Logic Drift'    },
          { key: 'history', icon: 'ti-time',              label: 'Mission History'},
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

      <div className="ta-content">
        {activeTab === 'trends' && (
          <div className="ta-trends-panel">
            {parsed ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="ta-metric-card">
                    <div className="ta-metric-label">Regression Delta</div>
                    <div className="ta-metric-value" style={{ color: regressionScore > 0 ? '#ef4444' : '#10b981' }}>
                      {regressionScore > 0 ? `+${regressionScore}%` : `${regressionScore}%`}
                    </div>
                  </div>
                  <div className="ta-metric-card">
                    <div className="ta-metric-label">Stability Index</div>
                    <div className="ta-metric-value" style={{ color: '#1e293b' }}>{parsed.stability_index || 0}%</div>
                  </div>
                </div>
                <div className="ta-info-box">
                  <i className="ti-info-alt"></i>
                  <span>Longitudinal audits analyze defect density shifts across missions. A stable index above 90% is required for CI/CD auto-promotion.</span>
                </div>
              </>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-stats-up" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>Execute Trend Audit to ingest historical mission telemetry.</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'drift' && (
          <div className="ta-drift-panel">
            {(parsed?.drift_alerts || []).length > 0 ? parsed.drift_alerts.map((alert: string, idx: number) => (
              <div key={idx} className="ta-drift-card">
                <i className="ti-stats-down"></i>
                <div className="ta-drift-body">
                  <div className="ta-drift-label">Logic Drift Detected</div>
                  <div className="ta-drift-text">{alert}</div>
                </div>
              </div>
            )) : (
              <div className="ws-empty-state">
                <i className="ti-line-double" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>No significant logic drift detected in recent execution cycles.</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="ta-history-panel">
            {historicalTrends.length > 0 ? (
              <div className="ta-history-list">
                {historicalTrends.map((trend: any, idx: number) => (
                  <div key={idx} className="ta-history-item">
                    <div className="ta-hist-main">
                      <div className="ta-hist-id">{trend.mission_id}</div>
                      <div className="ta-hist-meta">Result: {trend.result}</div>
                    </div>
                    <div className="ta-hist-delta" style={{ color: trend.drift > 0 ? '#ef4444' : '#10b981' }}>
                      {trend.drift > 0 ? `+${trend.drift}% Drift` : `Stable`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ws-empty-state">
                <i className="ti-time" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                <span>No historical missions found in the local telemetry vault.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .ta-tab-bar { display: flex; gap: 6px; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
        .ta-tab-bar button { background: none; border: none; padding: 10px 16px; font-size: 0.82rem; font-weight: 700; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .ta-tab-bar button.active { color: #10b981; border-bottom-color: #10b981; }
        
        .ta-content { flex: 1; }
        .ta-metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
        .ta-metric-label { font-size: 0.65rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .ta-metric-value { font-size: 1.8rem; font-weight: 950; letter-spacing: 1px; }
        
        .ta-info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 12px 16px; display: flex; gap: 10px; align-items: flex-start; }
        .ta-info-box i { color: #0369a1; font-size: 0.9rem; margin-top: 2px; }
        .ta-info-box span { font-size: 0.78rem; color: #0369a1; line-height: 1.5; }
        
        .ta-drift-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 10px; }
        .ta-drift-card i { font-size: 1.2rem; color: #f59e0b; }
        .ta-drift-label { font-size: 0.68rem; font-weight: 900; color: #b45309; text-transform: uppercase; margin-bottom: 2px; }
        .ta-drift-text { font-size: 0.82rem; color: #1e293b; font-weight: 600; }
        
        .ta-history-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 8px; }
        .ta-hist-id { font-size: 0.85rem; font-weight: 800; color: #1e293b; }
        .ta-hist-meta { font-size: 0.72rem; color: #64748b; font-weight: 600; }
        .ta-hist-delta { font-size: 0.8rem; font-weight: 900; }
        
        .ws-empty-state { display: flex; align-items: center; justify-content: center; padding: 40px 16px; color: #94a3b8; font-size: 0.85rem; font-weight: 500; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
      `}</style>
    </WorkspaceShell>
  );
};

export default TrendAnalystWorkspace;
