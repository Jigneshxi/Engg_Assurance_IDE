/**
 * ================================================================================
 * SeQuor AGENT MESH — ENV CONSISTENCY SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface EnvConsistencyWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const EnvConsistencyWorkspace: React.FC<EnvConsistencyWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'drift' | 'parity' | 'health'>('drift');

  const liveDrift = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.drift ?? parsed.configs ?? parsed.keys ?? parsed.variables ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((c: any) => ({
        key: c.key ?? c.name ?? c.variable ?? null,
        dev: c.dev ?? c.development ?? null,
        stg: c.stg ?? c.staging ?? null,
        prod: c.prod ?? c.production ?? null,
        ok: typeof c.ok === 'boolean' ? c.ok : null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveParity = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const p = parsed.parity ?? parsed.environment_parity ?? null;
      if (!p || typeof p !== 'object') return null;
      return {
        score: p.score ?? p.percentage ?? null,
        description: p.description ?? null,
        items: Array.isArray(p.items) ? p.items : null,
      };
    } catch { return null; }
  }, [telemetry]);

  const liveHealth = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const h = parsed.health ?? parsed.fleet_health ?? parsed;
      if (typeof h !== 'object' || Array.isArray(h)) return null;
      const status = h.fleet_status ?? h.status ?? null;
      const latency = h.sync_latency ?? h.latency ?? null;
      if (status === null && latency === null) return null;
      return { status, latency };
    } catch { return null; }
  }, [telemetry]);

  const driftCount = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.hazard_count ?? parsed.drift_count ?? parsed.issues ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'drift',  label: 'Config Drift',   icon: 'ti-cloud-up' },
    { id: 'parity', label: 'Matrix Parity',  icon: 'ti-layers-alt' },
    { id: 'health', label: 'Fleet Health',   icon: 'ti-pulse' },
  ];

  return (
    <WorkspaceShell
      nodeKey="env_consistency"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ec-content">
          {activeTab === 'drift' && (
            <div className="ec-drift-panel">
              <div className="ec-section-header">
                <h3>Divergence Report</h3>
                {driftCount !== null && <div className="ec-drift-count">{driftCount} Hazards Found</div>}
              </div>
              {liveDrift ? (
                <>
                  <div className="ec-grid header">
                    <span>Configuration Key</span>
                    <span>Development</span>
                    <span>Staging</span>
                    <span>Production</span>
                  </div>
                  {liveDrift.map((row, i) => (
                    <div key={i} className="ec-grid row">
                      <span className="ec-key"><code>{row.key ?? '—'}</code></span>
                      <span className="ec-val">{row.dev ?? '—'}</span>
                      <span className="ec-val">{row.stg ?? '—'}</span>
                      <span className={`ec-val ${row.ok === false ? 'bad' : ''}`}>{row.prod ?? '—'}</span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Sync Fleet Config to populate drift report" icon="ti-cloud-up" />
              )}
            </div>
          )}

          {activeTab === 'parity' && (
            <div className="ec-parity-view">
              {liveParity ? (
                <>
                  <div className="ec-parity-card">
                    <div className="icon">🚀</div>
                    <div className="details">
                      {liveParity.score !== null && <h5>Production Parity: {liveParity.score}</h5>}
                      {liveParity.description && <p>{liveParity.description}</p>}
                      {liveParity.score !== null && (
                        <div className="meter">
                          <div className="fill" style={{ width: `${Math.min(100, parseInt(String(liveParity.score)) || 0)}%` }}></div>
                        </div>
                      )}
                    </div>
                  </div>
                  {liveParity.items && (
                    <div className="ec-parity-list">
                      {liveParity.items.map((item: any, idx: number) => (
                        <div key={idx} className="item">
                          <span>{item.name ?? item.key ?? '—'}</span>
                          <strong>{item.value ?? item.status ?? '—'}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <WorkspaceEmptyState message="Sync Fleet Config to populate parity data" icon="ti-layers-alt" />
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div className="ec-health-panel">
              <div className="ec-section-header"><h3>Fleet Health Overview</h3></div>
              <div className="ec-health-dashboard">
                {liveHealth ? (
                  <>
                    {liveHealth.status !== null && (
                      <div className="ec-health-tile ok">
                        <span className="label">Fleet Status</span>
                        <span className="val">{liveHealth.status}</span>
                      </div>
                    )}
                    {liveHealth.latency !== null && (
                      <div className="ec-health-tile warn">
                        <span className="label">Sync Latency</span>
                        <span className="val">{liveHealth.latency}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <WorkspaceEmptyState message="Sync Fleet Config to populate fleet health" icon="ti-pulse" />
                )}
              </div>
            </div>
          )}
        </div>

        <style>{`
          .ec-content { flex: 1; padding: 10px 0; }
          .ec-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ec-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ec-drift-count { font-size: 0.75rem; font-weight: 700; color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 4px 12px; border-radius: 20px; }
          .ec-grid { display: grid; grid-template-columns: 1fr 80px 80px 80px; gap: 15px; align-items: center; padding: 12px; }
          .ec-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.6rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; }
          .ec-grid.row { border-bottom: 1px solid #f1f5f9; }
          .ec-key code { font-family: monospace; font-size: 0.75rem; font-weight: 700; color: #475569; }
          .ec-val { font-size: 0.8rem; color: #64748b; font-weight: 600; text-align: center; }
          .ec-val.bad { color: #ef4444; text-decoration: underline wavy; }
          .ec-parity-card { background: #fff; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
          .ec-parity-card .icon { font-size: 1.5rem; margin-bottom: 15px; }
          .ec-parity-card h5 { margin: 0 0 5px; font-size: 1rem; color: #1e293b; }
          .ec-parity-card p { margin: 0 0 15px; font-size: 0.85rem; color: #64748b; line-height: 1.4; }
          .ec-parity-card .meter { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
          .ec-parity-card .meter .fill { height: 100%; background: #6366f1; }
          .ec-parity-list { display: flex; flex-direction: column; gap: 10px; }
          .ec-parity-list .item { display: flex; justify-content: space-between; font-size: 0.8rem; }
          .ec-parity-list span { color: #64748b; font-weight: 500; }
          .ec-parity-list strong { color: #1e293b; font-weight: 700; }
          .ec-health-dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .ec-health-tile { background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; text-align: center; }
          .ec-health-tile .label { display: block; font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
          .ec-health-tile .val { font-size: 1.1rem; font-weight: 800; color: #1e293b; }
          .ec-health-tile.ok .val { color: #10b981; }
        `}</style>
    </WorkspaceShell>
  );
};

export default EnvConsistencyWorkspace;
