/**
 * ================================================================================
 * SeQuor AGENT MESH — API VALIDATION SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface ApiValidationWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ApiValidationWorkspace: React.FC<ApiValidationWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'endpoints' | 'topology' | 'contracts'>('endpoints');

  const liveEndpoints = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.endpoints ?? parsed.apis ?? parsed.routes ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((e: any) => ({
        method: e.method ?? null,
        path: e.path ?? e.endpoint ?? e.route ?? null,
        status: e.status ?? e.health ?? null,
        coverage: typeof e.coverage === 'number' ? e.coverage : null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const healthSummary = React.useMemo(() => {
    if (!liveEndpoints) return null;
    const ok = liveEndpoints.filter(e => String(e.status ?? '').toLowerCase() === 'verified').length;
    const warn = liveEndpoints.filter(e => String(e.status ?? '').toLowerCase() === 'warning').length;
    const pending = liveEndpoints.filter(e => String(e.status ?? '').toLowerCase() === 'pending').length;
    return { ok, warn, pending };
  }, [liveEndpoints]);

  const liveTopology = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.topology ?? parsed.services ?? parsed.dependencies ?? parsed.nodes ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((n: any) => ({
        name: n.name ?? n.service ?? null,
        type: n.type ?? 'service',
        mocked: n.mocked ?? n.virtualized ?? false,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveContract = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const raw = parsed.contract ?? parsed.schema ?? parsed.openapi ?? parsed.json_schema ?? null;
      if (raw === null) return null;
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'endpoints', label: 'Endpoint Matrix',   icon: 'ti-plug' },
    { id: 'topology',  label: 'Dependency Graph',  icon: 'ti-share-alt' },
    { id: 'contracts', label: 'JSON Contracts',    icon: 'ti-write' },
  ];

  return (
    <WorkspaceShell
      nodeKey="api_validation"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="api-content">
          {activeTab === 'endpoints' && (
            <div className="api-matrix">
              <div className="api-section-header">
                <h3>Discovered API Endpoints</h3>
                {healthSummary ? (
                  <div className="api-health-summary">
                    {healthSummary.ok > 0 && <span className="api-health-item ok">{healthSummary.ok} Healthy</span>}
                    {healthSummary.warn > 0 && <span className="api-health-item warn">{healthSummary.warn} Warning</span>}
                    {healthSummary.pending > 0 && <span className="api-health-item pending">{healthSummary.pending} Pending</span>}
                  </div>
                ) : (
                  <span className="api-hint">Run validation to discover endpoints</span>
                )}
              </div>
              {liveEndpoints ? (
                <>
                  <div className="api-grid header">
                    <span>Method</span>
                    <span>Endpoint Path</span>
                    <span>Audit Status</span>
                    <span>Test Coverage</span>
                  </div>
                  {liveEndpoints.map((ep, idx) => (
                    <div key={idx} className={`api-grid row ${String(ep.status ?? '').toLowerCase()}`}>
                      <span className={`api-method ${String(ep.method ?? '').toLowerCase()}`}>{ep.method ?? '—'}</span>
                      <span className="api-path">{ep.path ?? '—'}</span>
                      <span className={`api-status-pill ${String(ep.status ?? '').toLowerCase()}`}>
                        {ep.status ? String(ep.status).toUpperCase() : '—'}
                      </span>
                      <div className="api-coverage-bar">
                        {ep.coverage !== null ? (
                          <>
                            <div className="bar-fill" style={{ width: `${ep.coverage}%` }}></div>
                            <span className="bar-val">{ep.coverage}%</span>
                          </>
                        ) : (
                          <span className="bar-val" style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Validate API Contracts to populate endpoint matrix" icon="ti-plug" />
              )}
            </div>
          )}

          {activeTab === 'topology' && (
            <div className="api-topology-view">
              {liveTopology ? (
                <div className="api-canvas">
                  <div className="api-node central">API Gateway</div>
                  {liveTopology.slice(0, 4).map((node, i) => (
                    <div key={i} className={`api-node leaf l${i + 1} ${node.mocked ? 'mocked' : ''}`}
                      style={{ top: `${20 + i * 20}%`, left: i % 2 === 0 ? '15%' : '70%' }}>
                      {node.name ?? '—'}
                      {node.mocked && <span className="mock-badge">Mock</span>}
                    </div>
                  ))}
                  <div className="api-overlay-info">
                    <h4>Network Mapping</h4>
                    <p>Agent #12 identified <strong>{liveTopology.length} upstream service{liveTopology.length !== 1 ? 's' : ''}</strong>.
                      {liveTopology.filter(n => n.mocked).length > 0 && (
                        <> {liveTopology.filter(n => n.mocked).length} virtualized mock{liveTopology.filter(n => n.mocked).length !== 1 ? 's' : ''} active.</>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="api-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WorkspaceEmptyState message="Validate API Contracts to populate dependency graph" icon="ti-share-alt" />
                </div>
              )}
            </div>
          )}

          {activeTab === 'contracts' && (
            <div className="api-contracts-panel">
              {liveContract ? (
                <div className="api-editor-container">
                  <div className="api-editor-main" style={{ width: '100%' }}>
                    <div className="api-editor-header">
                      <span>Live Contract Schema</span>
                      <button onClick={() => navigator.clipboard?.writeText(liveContract)}>Copy</button>
                    </div>
                    <pre className="api-code-block">{liveContract}</pre>
                  </div>
                </div>
              ) : (
                <WorkspaceEmptyState message="Validate API Contracts to populate JSON schema" icon="ti-write" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .api-content { flex: 1; padding: 10px 0; }
          .api-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .api-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; font-weight: 700; }
          .api-hint { font-size: 0.75rem; color: #94a3b8; font-style: italic; }
          .api-health-summary { display: flex; gap: 10px; }
          .api-health-item { font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
          .api-health-item.ok { background: #d1fae5; color: #065f46; }
          .api-health-item.warn { background: #fef3c7; color: #92400e; }
          .api-health-item.pending { background: #f1f5f9; color: #475569; }
          .api-grid { display: grid; grid-template-columns: 80px 1fr 100px 150px; gap: 15px; align-items: center; padding: 12px; }
          .api-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .api-grid.row { border-bottom: 1px solid #f1f5f9; }
          .api-method { font-size: 0.7rem; font-weight: 900; padding: 3px 6px; border-radius: 4px; text-align: center; }
          .api-method.get { background: #e0f2fe; color: #0369a1; }
          .api-method.post { background: #dcfce7; color: #15803d; }
          .api-method.put { background: #fef3c7; color: #92400e; }
          .api-method.delete { background: #fee2e2; color: #b91c1c; }
          .api-method.patch { background: #f3e8ff; color: #7c3aed; }
          .api-path { font-family: monospace; font-size: 0.85rem; color: #334155; }
          .api-status-pill { font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-align: center; }
          .api-status-pill.verified { color: #10b981; background: rgba(16, 185, 129, 0.1); }
          .api-status-pill.warning { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
          .api-status-pill.pending { color: #94a3b8; background: rgba(148, 163, 184, 0.1); }
          .api-coverage-bar { height: 18px; background: #f1f5f9; border-radius: 9px; position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
          .bar-fill { height: 100%; background: #6366f1; border-radius: 9px; }
          .bar-val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #1e293b; mix-blend-mode: multiply; }
          .api-topology-view { height: 350px; background: #0f172a; border-radius: 12px; position: relative; overflow: hidden; }
          .api-canvas { width: 100%; height: 100%; position: relative; }
          .api-node { position: absolute; padding: 8px 15px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: white; display: flex; align-items: center; gap: 6px; }
          .api-node.central { top: 50%; left: 50%; transform: translate(-50%, -50%); background: #6366f1; box-shadow: 0 0 20px rgba(99, 102, 241, 0.6); z-index: 10; }
          .api-node.leaf { background: #1e293b; border: 1px solid #334155; }
          .api-node.mocked { border-color: #10b981; border-style: dashed; color: #10b981; }
          .mock-badge { font-size: 0.55rem; background: rgba(16,185,129,0.2); color: #10b981; padding: 1px 5px; border-radius: 3px; font-weight: 800; text-transform: uppercase; }
          .api-overlay-info { position: absolute; bottom: 15px; left: 15px; right: 15px; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); }
          .api-overlay-info h4 { margin: 0 0 5px; color: #fff; font-size: 0.85rem; }
          .api-overlay-info p { margin: 0; color: #94a3b8; font-size: 0.75rem; }
          .api-contracts-panel { min-height: 300px; }
          .api-editor-container { display: flex; height: 400px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .api-editor-main { flex: 1; display: flex; flex-direction: column; background: #fff; }
          .api-editor-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; }
          .api-editor-header span { font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
          .api-editor-header button { background: none; border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; color: #64748b; cursor: pointer; }
          .api-code-block { margin: 0; padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #1e293b; background: #fafafa; flex: 1; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }
        `}</style>
    </WorkspaceShell>
  );
};

export default ApiValidationWorkspace;
