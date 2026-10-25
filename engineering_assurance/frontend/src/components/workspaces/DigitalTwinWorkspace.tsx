/**
 * ================================================================================
 * SeQuor AGENT MESH — DIGITAL TWIN SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

// Stable packet positions — deterministic, no Math.random()
const PACKET_POSITIONS = [
  { left: '10%', top: '20%' }, { left: '30%', top: '60%' },
  { left: '55%', top: '15%' }, { left: '70%', top: '75%' },
  { left: '20%', top: '80%' }, { left: '80%', top: '40%' },
  { left: '45%', top: '50%' }, { left: '65%', top: '30%' },
];

interface DigitalTwinWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const DigitalTwinWorkspace: React.FC<DigitalTwinWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'mirror' | 'traffic' | 'delta'>('mirror');

  const liveSync = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.sync_status ?? parsed.services ?? parsed.shadows ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((s: any) => ({
        service: s.service ?? s.name ?? null,
        lastSync: s.lastSync ?? s.sync ?? s.last_sync ?? null,
        matchRate: s.matchRate ?? s.match ?? s.match_rate ?? null,
        status: s.status ?? s.state ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveTraffic = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const t = parsed.traffic ?? parsed.shadow_traffic ?? null;
      if (!t || typeof t !== 'object') return null;
      return {
        prodRps: t.prod_rps ?? t.production_rps ?? t.live_rps ?? null,
        shadowRps: t.shadow_rps ?? t.qa_rps ?? null,
        proxy: t.proxy ?? t.proxy_label ?? null,
      };
    } catch { return null; }
  }, [telemetry]);

  const liveDelta = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.delta ?? parsed.drift ?? parsed.divergence ?? parsed.findings ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((d: any) => ({
        title: d.title ?? d.name ?? null,
        description: d.description ?? d.detail ?? null,
        status: d.status ?? (d.ok === true ? 'ok' : 'warn'),
      }));
    } catch { return null; }
  }, [telemetry]);

  const shadowCount = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.active_shadows ?? parsed.shadow_count ?? (liveSync ? liveSync.length : null);
    } catch { return null; }
  }, [telemetry, liveSync]);

  const TABS = [
    { id: 'mirror',  label: 'Production Mirror', icon: 'ti-layers-alt' },
    { id: 'traffic', label: 'Traffic Shadowing', icon: 'ti-exchange-vertical' },
    { id: 'delta',   label: 'Drift Analysis',    icon: 'ti-ruler-pencil' },
  ];

  return (
    <WorkspaceShell
      nodeKey="digital_twin"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="dt-content">
          {activeTab === 'mirror' && (
            <div className="dt-mirror-panel">
              <div className="dt-section-header">
                <h3>Simulation Fidelity Status</h3>
                {shadowCount !== null ? (
                  <div className="dt-sync-badge">
                    <span className="dot"></span> {shadowCount} Active Shadow{shadowCount !== 1 ? 's' : ''}
                  </div>
                ) : (
                  <span className="dt-hint">Run sync to discover shadows</span>
                )}
              </div>
              {liveSync ? (
                <>
                  <div className="dt-grid header">
                    <span>Service Cluster</span>
                    <span>Last Mirror Sync</span>
                    <span>Behavior Match</span>
                    <span>Proxy Status</span>
                  </div>
                  {liveSync.map((s, idx) => (
                    <div key={idx} className="dt-grid row">
                      <span className="dt-service-name">{s.service ?? '—'}</span>
                      <span className="dt-time">{s.lastSync ?? '—'}</span>
                      <div className="dt-match-progress">
                        {s.matchRate !== null ? (
                          <>
                            <div className="fill" style={{ width: String(s.matchRate) }}></div>
                            <span className="val">{s.matchRate}</span>
                          </>
                        ) : (
                          <span className="val" style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </div>
                      <span className={`dt-status-pill ${String(s.status ?? '').toLowerCase()}`}>{s.status ?? '—'}</span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Sync Production Mirror to populate simulation data" icon="ti-layers-alt" />
              )}
            </div>
          )}

          {activeTab === 'traffic' && (
            <div className="dt-traffic-view">
              <div className="dt-traffic-header">
                <div className="dt-source">
                  <span className="label">Live Traffic (PROD)</span>
                  <span className="rps">{liveTraffic?.prodRps ?? '— Req/sec'}</span>
                </div>
                <div className="dt-arrow">➔</div>
                <div className="dt-target">
                  <span className="label">Shadow Instance (QA)</span>
                  <span className="rps">{liveTraffic?.shadowRps ?? '— Req/sec'}</span>
                </div>
              </div>
              <div className="dt-traffic-canvas">
                {PACKET_POSITIONS.map((pos, i) => (
                  <div key={i} className="dt-packet" style={{ left: pos.left, top: pos.top, animationDelay: `${i * 0.4}s` }}></div>
                ))}
                <div className="dt-proxy-label">{liveTraffic?.proxy ?? 'Envoy Shadow Proxy'}</div>
              </div>
            </div>
          )}

          {activeTab === 'delta' && (
            <div className="dt-delta-list">
              {liveDelta ? (
                liveDelta.map((d, idx) => (
                  <div key={idx} className={`dt-delta-card ${String(d.status ?? '').toLowerCase() === 'ok' ? 'ok' : 'warn'}`}>
                    <div className="icon">{String(d.status ?? '').toLowerCase() === 'ok' ? '✅' : '⚠️'}</div>
                    <div className="details">
                      <h5>{d.title ?? '—'}</h5>
                      <p>{d.description ?? '—'}</p>
                    </div>
                    {String(d.status ?? '').toLowerCase() !== 'ok' && <button className="fix-btn">Heal Twin</button>}
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Sync Production Mirror to populate drift analysis" icon="ti-ruler-pencil" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .dt-content { flex: 1; padding: 10px 0; }
          .dt-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .dt-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; font-weight: 700; }
          .dt-hint { font-size: 0.75rem; color: #94a3b8; font-style: italic; }
          .dt-sync-badge { font-size: 0.75rem; font-weight: 700; padding: 3px 12px; background: #f1f5f9; border-radius: 20px; color: #475569; display: flex; align-items: center; gap: 6px; }
          .dt-sync-badge .dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: dt-glow 1.5s infinite; }
          @keyframes dt-glow { 0%, 100% { opacity: 1; box-shadow: 0 0 5px #10b981; } 50% { opacity: 0.4; box-shadow: none; } }
          .dt-grid { display: grid; grid-template-columns: 1fr 120px 180px 120px; gap: 15px; align-items: center; padding: 12px; }
          .dt-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .dt-grid.row { border-bottom: 1px solid #f1f5f9; }
          .dt-service-name { font-size: 0.9rem; font-weight: 600; color: #1e293b; }
          .dt-time { font-size: 0.8rem; color: #94a3b8; }
          .dt-match-progress { height: 16px; background: #f1f5f9; border-radius: 8px; position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
          .dt-match-progress .fill { height: 100%; background: #10b981; border-radius: 8px; }
          .dt-match-progress .val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #065f46; }
          .dt-status-pill { font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-align: center; }
          .dt-status-pill.active { background: #dcfce7; color: #15803d; }
          .dt-status-pill.syncing { background: #fef3c7; color: #92400e; }
          .dt-status-pill.standby { background: #f1f5f9; color: #64748b; }
          .dt-traffic-view { background: #0f172a; border-radius: 12px; padding: 20px; height: 350px; display: flex; flex-direction: column; }
          .dt-traffic-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .dt-source, .dt-target { text-align: center; }
          .dt-source .label { display: block; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; }
          .dt-source .rps { font-size: 1.1rem; color: #fff; font-weight: 700; }
          .dt-target .label { display: block; font-size: 0.7rem; color: #6366f1; text-transform: uppercase; }
          .dt-target .rps { font-size: 1.1rem; color: #6366f1; font-weight: 700; }
          .dt-arrow { font-size: 1.5rem; color: #334155; }
          .dt-traffic-canvas { flex: 1; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; position: relative; background: radial-gradient(circle at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%); }
          .dt-packet { position: absolute; width: 4px; height: 4px; background: #6366f1; border-radius: 50%; box-shadow: 0 0 10px #6366f1; animation: dt-stream 3s linear infinite; }
          @keyframes dt-stream { 0% { transform: scale(1); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; left: 95%; } }
          .dt-proxy-label { position: absolute; bottom: 10px; right: 10px; font-size: 0.65rem; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
          .dt-delta-list { display: flex; flex-direction: column; gap: 15px; }
          .dt-delta-card { display: flex; gap: 15px; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; align-items: center; }
          .dt-delta-card.ok { background: #f0fdf4; border-color: #bbf7d0; }
          .dt-delta-card.warn { background: #fffbeb; border-color: #fef3c7; }
          .dt-delta-card .icon { font-size: 1.5rem; }
          .dt-delta-card h5 { margin: 0 0 4px; font-size: 0.9rem; color: #1e293b; }
          .dt-delta-card p { margin: 0; font-size: 0.8rem; color: #64748b; flex: 1; }
          .fix-btn { padding: 5px 12px; background: #f97316; color: white; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
          .fix-btn:hover { background: #ea580c; }
        `}</style>
    </WorkspaceShell>
  );
};

export default DigitalTwinWorkspace;
