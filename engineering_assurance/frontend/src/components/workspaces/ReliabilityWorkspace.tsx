/**
 * ================================================================================
 * SeQuor AGENT MESH - RELIABILITY ENGINEERING SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface ReliabilityWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ReliabilityWorkspace: React.FC<ReliabilityWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'quarantine' | 'healing' | 'health'>('quarantine');

  const liveFlaky = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.flaky_tests ?? parsed.failures ?? parsed.unstable ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((t: any, i: number) => ({
        id: t.id ?? t.tc_id ?? `TC-${900 + i}`,
        name: t.name ?? t.test_name ?? null,
        flakiness: t.flakiness ?? t.probability ?? null,
        trend: t.trend ?? null,
        status: t.status ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveHealingLog = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.healing_log ?? parsed.heals ?? parsed.remediation_log ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((h: any) => ({
        ts: h.ts ?? h.timestamp ?? null,
        title: h.title ?? h.name ?? null,
        description: h.description ?? h.detail ?? null,
        badge: h.badge ?? h.result ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveHealth = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const h = parsed.health ?? parsed.suite_health ?? parsed;
      if (typeof h !== 'object' || Array.isArray(h)) return null;
      const mttr = h.mttr ?? h.mean_time_to_repair ?? null;
      const exitRate = h.quarantine_exit_rate ?? h.exit_rate ?? null;
      const stability = h.stability_score ?? h.mesh_stability_score ?? null;
      if (mttr === null && exitRate === null && stability === null) return null;
      return { mttr, exitRate, stability };
    } catch { return null; }
  }, [telemetry]);

  const quarantineCount = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.quarantine_count ?? parsed.quarantined ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'quarantine', label: 'Flakiness & Quarantine', icon: 'ti-files' },
    { id: 'healing',    label: 'Self-Healing Log',       icon: 'ti-reload' },
    { id: 'health',     label: 'Suite Health',           icon: 'ti-stats-up' },
  ];

  return (
    <WorkspaceShell
      nodeKey="reliability_eng"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="rel-content">
          {activeTab === 'quarantine' && (
            <div className="rel-flaky-panel">
              <div className="rel-section-header">
                <h3>Unstable Test Analysis</h3>
                {quarantineCount !== null && (
                  <div className="rel-quarantine-count">
                    <span className="count">{quarantineCount}</span>
                    <span className="label">In Quarantine</span>
                  </div>
                )}
              </div>
              {liveFlaky ? (
                <>
                  <div className="rel-grid header">
                    <span>Test ID &amp; Name</span>
                    <span>Flakiness Index</span>
                    <span>Trend</span>
                    <span>Guard Status</span>
                  </div>
                  {liveFlaky.map((t, idx) => (
                    <div key={idx} className="rel-grid row">
                      <div className="rel-test-info">
                        <span className="id">{t.id}</span>
                        <span className="name">{t.name ?? '-'}</span>
                      </div>
                      <div className="rel-index-bar">
                        <div className="fill" style={{ width: t.flakiness ?? '0%', background: parseInt(String(t.flakiness ?? '0')) > 15 ? '#ef4444' : '#f59e0b' }}></div>
                        <span className="val">{t.flakiness ?? '-'}</span>
                      </div>
                      <span className={`rel-trend ${String(t.trend ?? '').toLowerCase()}`}>
                        {String(t.trend ?? '').toLowerCase() === 'up' ? '↗' : String(t.trend ?? '').toLowerCase() === 'down' ? '↘' : '-'}
                      </span>
                      <span className={`rel-status-pill ${String(t.status ?? '').toLowerCase().replace(/ /g, '-')}`}>
                        {t.status ? String(t.status).toUpperCase() : '-'}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Repair Suite Health to populate flakiness data" />
              )}
            </div>
          )}

          {activeTab === 'healing' && (
            <div className="rel-healing-list">
              {liveHealingLog ? (
                liveHealingLog.map((h, idx) => (
                  <div key={idx} className="rel-healing-card">
                    {h.ts && <div className="ts">{h.ts}</div>}
                    <h5 className="title">{h.title ?? '-'}</h5>
                    <p>{h.description ?? '-'}</p>
                    {h.badge && <div className="badge">{h.badge}</div>}
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Repair Suite Health to populate healing log" />
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div className="rel-health-panel">
              <div className="rel-section-header" style={{ marginBottom: '20px' }}>
                <h3>Suite Health Overview</h3>
              </div>
              <div className="rel-health-dashboard">
                {liveHealth ? (
                  <>
                    {liveHealth.mttr !== null && (
                      <div className="rel-health-stat">
                        <div className="label">MTTR (Mean Time to Repair)</div>
                        <div className="val">{liveHealth.mttr}</div>
                      </div>
                    )}
                    {liveHealth.exitRate !== null && (
                      <div className="rel-health-stat">
                        <div className="label">Quarantine Exit Rate</div>
                        <div className="val">{liveHealth.exitRate}</div>
                      </div>
                    )}
                    {liveHealth.stability !== null && (
                      <div className="rel-health-stat">
                        <div className="label">Mesh Stability Score</div>
                        <div className="val ok">{liveHealth.stability}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <WorkspaceEmptyState message="Repair Suite Health to populate health metrics" />
                )}
              </div>
            </div>
          )}
        </div>

        <style>{`
          .rel-content { flex: 1; padding: 10px 0; }
          .rel-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .rel-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .rel-quarantine-count { text-align: right; }
          .rel-quarantine-count .count { display: block; font-size: 1.8rem; font-weight: 800; color: #f97316; line-height: 1; }
          .rel-quarantine-count .label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .rel-grid { display: grid; grid-template-columns: 1fr 180px 80px 140px; gap: 15px; align-items: center; padding: 12px; }
          .rel-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
          .rel-grid.row { border-bottom: 1px solid #f1f5f9; }
          .rel-test-info { display: flex; flex-direction: column; }
          .rel-test-info .id { font-size: 0.7rem; font-weight: 800; color: #6366f1; font-family: monospace; }
          .rel-test-info .name { font-size: 0.85rem; font-weight: 500; color: #1e293b; }
          .rel-index-bar { height: 16px; background: #f1f5f9; border-radius: 8px; position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
          .rel-index-bar .fill { height: 100%; border-radius: 8px; }
          .rel-index-bar .val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #1e293b; mix-blend-mode: multiply; }
          .rel-trend { font-size: 1rem; font-weight: 900; text-align: center; }
          .rel-trend.up { color: #ef4444; }
          .rel-trend.down { color: #10b981; }
          .rel-status-pill { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-align: center; }
          .rel-status-pill.quarantined { background: #fee2e2; color: #ef4444; }
          .rel-status-pill.active { background: #dcfce7; color: #15803d; }
          .rel-status-pill.self-healing { background: #e0f2fe; color: #0369a1; }
          .rel-healing-list { display: flex; flex-direction: column; gap: 15px; }
          .rel-healing-card { padding: 15px; border-radius: 10px; background: #fff; border: 1px solid #e2e8f0; position: relative; }
          .rel-healing-card .ts { font-size: 0.7rem; color: #94a3b8; font-family: monospace; margin-bottom: 5px; }
          .rel-healing-card .title { margin: 0 0 8px; font-size: 0.95rem; color: #1e293b; }
          .rel-healing-card p { margin: 0 0 12px; font-size: 0.85rem; color: #64748b; line-height: 1.4; }
          .rel-healing-card .badge { display: inline-block; font-size: 0.75rem; font-weight: 700; color: #10b981; background: #f0fdf4; padding: 4px 10px; border-radius: 6px; }
          .rel-health-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
          .rel-health-stat { background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; }
          .rel-health-stat .label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px; }
          .rel-health-stat .val { font-size: 1.5rem; font-weight: 800; color: #1e293b; }
          .rel-health-stat .val.ok { color: #10b981; }
        `}</style>
    </WorkspaceShell>
  );
};

export default ReliabilityWorkspace;
