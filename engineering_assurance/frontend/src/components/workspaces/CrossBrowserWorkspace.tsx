/**
 * ================================================================================
 * SeQuor AGENT MESH — CROSS-BROWSER SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface CrossBrowserWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const CrossBrowserWorkspace: React.FC<CrossBrowserWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'grid' | 'logs'>('matrix');

  const liveBrowsers = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.browsers ?? parsed.matrix ?? parsed.compatibility ?? parsed.reports ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((r: any) => ({
        page: r.page ?? r.feature ?? r.name ?? null,
        ch: r.ch ?? r.chrome ?? null,
        ff: r.ff ?? r.firefox ?? null,
        sf: r.sf ?? r.safari ?? null,
        ed: r.ed ?? r.edge ?? null,
        io: r.io ?? r.ios ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveGridNodes = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.grid_nodes ?? parsed.nodes ?? parsed.hubs ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((n: any) => ({
        name: n.name ?? n.hub ?? null,
        sessions: n.sessions ?? n.detail ?? null,
        active: n.active ?? true,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveLogs = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.render_logs ?? parsed.logs ?? parsed.events ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((l: any) => ({
        ts: l.ts ?? l.timestamp ?? null,
        message: l.message ?? l.msg ?? null,
        level: l.level ?? 'ok',
      }));
    } catch { return null; }
  }, [telemetry]);

  const healthBadge = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.health ?? parsed.pass_rate ?? parsed.compatibility_score ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'matrix', label: 'Compatibility Matrix',  icon: 'ti-layout-grid4' },
    { id: 'grid',   label: 'Selenium/Grid Nodes',   icon: 'ti-server' },
    { id: 'logs',   label: 'Render Logs',            icon: 'ti-list' },
  ];

  return (
    <WorkspaceShell
      nodeKey="cross_browser"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="cb-content">
          {activeTab === 'matrix' && (
            <div className="cb-matrix-panel">
              <div className="cb-section-header">
                <h3>Browser Support Lifecycle</h3>
                {healthBadge !== null && <div className="cb-health-badge">{healthBadge}</div>}
              </div>
              {liveBrowsers ? (
                <>
                  <table className="cb-table">
                    <thead>
                      <tr>
                        <th>Feature / Page</th>
                        <th>Chrome</th>
                        <th>Firefox</th>
                        <th>Safari</th>
                        <th>Edge</th>
                        <th>iOS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveBrowsers.map((row, i) => (
                        <tr key={i}>
                          <td className="page-col">{row.page ?? '—'}</td>
                          <td><div className={`status-dot ${String(row.ch ?? '').toLowerCase()}`}></div></td>
                          <td><div className={`status-dot ${String(row.ff ?? '').toLowerCase()}`}></div></td>
                          <td><div className={`status-dot ${String(row.sf ?? '').toLowerCase()}`}></div></td>
                          <td><div className={`status-dot ${String(row.ed ?? '').toLowerCase()}`}></div></td>
                          <td><div className={`status-dot ${String(row.io ?? '').toLowerCase()}`}></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cb-legend">
                    <span className="ok">● Compatible</span>
                    <span className="warn">● Render Drift Detected</span>
                    <span className="fail">● Execution Blocked</span>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState message="Validate Cross-Browser to populate compatibility matrix" icon="ti-world" />
              )}
            </div>
          )}

          {activeTab === 'grid' && (
            <div className="cb-grid-view">
              {liveGridNodes ? (
                liveGridNodes.map((n, idx) => (
                  <div key={idx} className={`grid-node-card ${n.active ? 'active' : ''}`}>
                    <i className="ti-server"></i>
                    <div className="details">
                      <h5>{n.name ?? '—'}</h5>
                      <p>{n.sessions ?? '—'}</p>
                    </div>
                    {n.active && <div className="pulse"></div>}
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Validate Cross-Browser to populate grid nodes" icon="ti-server" />
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="cb-log-panel">
              {liveLogs ? (
                liveLogs.map((l, idx) => (
                  <div key={idx} className={`cb-log-item ${String(l.level ?? '').toLowerCase() === 'warn' ? 'warn' : 'ok'}`}>
                    {l.ts && <span className="ts">{l.ts}</span>}
                    <p>{l.message ?? '—'}</p>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Validate Cross-Browser to populate render logs" icon="ti-list" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .cb-content { flex: 1; padding: 10px 0; }
          .cb-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .cb-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .cb-health-badge { font-size: 0.75rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 12px; border-radius: 20px; }
          .cb-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .cb-table th { text-align: center; padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
          .cb-table th:first-child { text-align: left; }
          .cb-table td { text-align: center; padding: 12px; border-bottom: 1px solid #f1f5f9; }
          .cb-table td:first-child { text-align: left; }
          .cb-table .page-col { font-weight: 600; color: #1e293b; font-size: 0.9rem; }
          .status-dot { width: 10px; height: 10px; border-radius: 50%; margin: 0 auto; background: #94a3b8; }
          .status-dot.ok { background: #10b981; box-shadow: 0 0 5px #10b981; }
          .status-dot.warn { background: #f59e0b; box-shadow: 0 0 5px #f59e0b; }
          .status-dot.fail { background: #ef4444; box-shadow: 0 0 5px #ef4444; }
          .cb-legend { display: flex; gap: 20px; justify-content: center; font-size: 0.75rem; color: #64748b; font-weight: 600; }
          .cb-legend span { display: flex; align-items: center; gap: 5px; }
          .cb-legend .ok { color: #10b981; }
          .cb-legend .warn { color: #d97706; }
          .cb-legend .fail { color: #dc2626; }
          .cb-grid-view { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .grid-node-card { padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; position: relative; display: flex; align-items: center; gap: 15px; }
          .grid-node-card.active { border-color: #6366f1; }
          .grid-node-card i { font-size: 2rem; color: #94a3b8; }
          .grid-node-card.active i { color: #6366f1; }
          .grid-node-card h5 { margin: 0 0 4px; font-size: 0.95rem; color: #1e293b; }
          .grid-node-card p { font-size: 0.8rem; color: #64748b; margin: 0; }
          .grid-node-card .pulse { position: absolute; top: 15px; right: 15px; width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: cb-glow 1.5s infinite; }
          @keyframes cb-glow { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.5); } }
          .cb-log-item { display: flex; flex-direction: column; gap: 4px; padding: 12px 15px; border-left: 4px solid #e2e8f0; background: #fff; border-radius: 0 8px 8px 0; border: 1px solid #f1f5f9; margin-bottom: 10px; }
          .cb-log-item.warn { border-left-color: #f59e0b; background: #fffbeb; }
          .cb-log-item.ok { border-left-color: #10b981; }
          .cb-log-item .ts { font-size: 0.7rem; color: #94a3b8; font-family: monospace; }
          .cb-log-item p { margin: 0; font-size: 0.85rem; color: #334155; line-height: 1.4; }
        `}</style>
    </WorkspaceShell>
  );
};

export default CrossBrowserWorkspace;
