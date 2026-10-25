/**
 * ================================================================================
 * SeQuor AGENT MESH — PERFORMANCE SPECIALIST WORKSPACE
 * ================================================================================
 * Live-first rendering: all data panels read from the `telemetry` prop.
 * Controls (profile selector, VU slider, ramp-up) are fully wired to state
 * and passed as context when invoking the agent.
 */

import React, { useState, useCallback } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

interface PerformanceWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

// SVG path data for each load profile type
const LOAD_PROFILE_PATHS: Record<string, { path: string; label: string; color: string }> = {
  'Steady State': {
    path: 'M0 140 L60 80 L120 60 L200 60 L280 60 L340 80 L400 140',
    label: 'Steady State',
    color: '#6366f1',
  },
  'Step Load': {
    path: 'M0 140 L80 140 L80 100 L160 100 L160 60 L240 60 L240 40 L320 40 L320 20 L400 20',
    label: 'Step Load',
    color: '#10b981',
  },
  'Spike Test': {
    path: 'M0 140 L100 130 L150 10 L200 10 L250 130 L400 140',
    label: 'Spike Test',
    color: '#f97316',
  },
  'Soak/Endurance': {
    path: 'M0 140 L60 70 L120 60 L200 58 L280 62 L340 65 L400 60',
    label: 'Soak/Endurance',
    color: '#8b5cf6',
  },
};

const PerformanceWorkspace: React.FC<PerformanceWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'baselines' | 'audit'>('baselines');
  const standaloneLocked = !useStandaloneInvokeEnabled();

  // ── Wired control state ──────────────────────────────────────────────────
  const [selectedProfile, setSelectedProfile] = useState<string>('Steady State');
  const [virtualUsers, setVirtualUsers] = useState<number>(500);
  const [rampUp, setRampUp] = useState<number>(60);

  const profileData = LOAD_PROFILE_PATHS[selectedProfile] ?? LOAD_PROFILE_PATHS['Steady State'];

  // Build context string from current control state for agent invocation
  const buildInvokeContext = useCallback(() => {
    return `Load Profile: ${selectedProfile} | Virtual Users: ${virtualUsers} | Ramp-up: ${rampUp}s | Analyse performance characteristics and generate NFR baselines for this configuration.`;
  }, [selectedProfile, virtualUsers, rampUp]);

  const handleRunAudit = useCallback(() => {
    if (standaloneLocked) return;
    onInvoke(buildInvokeContext());
  }, [onInvoke, buildInvokeContext, standaloneLocked]);

  const handleImportSLOs = useCallback(() => {
    if (standaloneLocked) return;
    onInvoke('Import SLO definitions from configured Prometheus/Datadog source and populate NFR Guardrails table with latency, throughput, and error rate targets.');
  }, [onInvoke, standaloneLocked]);

  // ── Live telemetry extraction ────────────────────────────────────────────
  const liveThresholds = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr =
        parsed.metrics ??
        parsed.thresholds ??
        parsed.slos ??
        parsed.results ??
        (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((t: any) => ({
        metric:  t.metric  ?? t.name      ?? null,
        target:  t.target  ?? t.sla       ?? t.threshold ?? null,
        current: t.current ?? t.value     ?? t.actual    ?? null,
        status:  t.status  ?? t.state     ?? t.result    ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveAuditLog = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr =
        parsed.audit_log ??
        parsed.logs ??
        parsed.events ??
        (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((e: any) => ({
        ts:      e.ts        ?? e.timestamp  ?? null,
        agent:   e.agent     ?? null,
        message: e.message   ?? e.msg        ?? e.description ?? null,
        level:   e.level     ?? e.severity   ?? 'info',
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveRecommendations = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.recommendations ?? null;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr;
    } catch { return null; }
  }, [telemetry]);

  const liveBottlenecks = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.bottlenecks ?? null;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr;
    } catch { return null; }
  }, [telemetry]);

  const liveHealthScore = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.health_score ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'profile',   label: 'Load Profiles', icon: 'ti-timer' },
    { id: 'baselines', label: 'NFR Baselines',  icon: 'ti-bar-chart' },
    { id: 'audit',     label: 'Audit Log',      icon: 'ti-files' },
  ];

  return (
    <WorkspaceShell
      nodeKey="performance"
      loading={loading}
      onInvoke={onInvoke}
      invokeContext={buildInvokeContext()}
      invokeLabel="Run Performance Audit"
      loadingLabel="Stressing..."
    >
      <div className="perf-content">

        {/* ── LOAD PROFILES TAB ── */}
        {activeTab === 'profile' && (
          <div className="perf-profile-panel">
            <div className="perf-section-header">
              <h3>Load Distribution Strategy</h3>
              {/* Wired dropdown — updates chart in real time */}
              <select
                className="perf-mode-select"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
              >
                {Object.keys(LOAD_PROFILE_PATHS).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Chart updates based on selectedProfile state */}
            <div className="perf-chart-container">
              <div className="perf-y-axis"><span>RPS</span></div>
              <div className="perf-chart">
                <svg width="100%" height="150" viewBox="0 0 400 150" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={profileData.color} stopOpacity="0.15" />
                      <stop offset="100%" stopColor={profileData.color} stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {/* Fill area under curve */}
                  <path
                    d={`${profileData.path} L400 150 L0 150 Z`}
                    fill="url(#perfGrad)"
                  />
                  {/* Line */}
                  <path
                    d={profileData.path}
                    fill="none"
                    stroke={profileData.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="chart-profile-label" style={{ color: profileData.color }}>
                  {profileData.label} — {virtualUsers} VU
                </div>
              </div>
              <div className="perf-x-axis"><span>Time (Minutes)</span></div>
            </div>

            {/* Wired controls */}
            <div className="perf-controls">
              <div className="perf-controls-label">Configure Load Parameters</div>
              <div className="perf-controls-inner">
                <div className="control-item">
                  <label>Virtual Users</label>
                  <input
                    type="range"
                    min="1"
                    max="2000"
                    value={virtualUsers}
                    onChange={(e) => setVirtualUsers(Number(e.target.value))}
                  />
                  <span>{virtualUsers.toLocaleString()}</span>
                </div>
                <div className="control-item">
                  <label>Ramp-up (s)</label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={rampUp}
                    onChange={(e) => setRampUp(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Bottlenecks from live telemetry */}
            {liveBottlenecks && (
              <div className="perf-bottlenecks">
                <div className="perf-bottlenecks-label">
                  <i className="ti-alert" style={{ color: '#f97316', marginRight: '6px' }}></i>
                  Identified Bottlenecks
                </div>
                {liveBottlenecks.map((b: string, i: number) => (
                  <div key={i} className="perf-bottleneck-item">
                    <span className="dot"></span>{b}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NFR BASELINES TAB ── */}
        {activeTab === 'baselines' && (
          <div className="perf-baselines-list">
            <div className="perf-section-header">
              <h3>NFR Guardrails</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {liveHealthScore !== null && (
                  <div className="perf-health-badge">
                    Health: {liveHealthScore}/100
                  </div>
                )}
                {/* Wired Import SLOs button */}
                <button className="perf-add-btn" onClick={handleImportSLOs} disabled={loading || standaloneLocked}>
                  {loading ? 'Importing...' : 'Import SLOs'}
                </button>
              </div>
            </div>

            {liveThresholds ? (
              <>
                <div className="perf-grid header">
                  <span>Metric</span>
                  <span>SLA Target</span>
                  <span>Current Perf</span>
                  <span>Status</span>
                </div>
                {liveThresholds.map((t, idx) => (
                  <div key={idx} className="perf-grid row">
                    <span className="perf-metric-name">{t.metric ?? '—'}</span>
                    <span className="perf-target">{t.target ?? '—'}</span>
                    <span className={`perf-val ${String(t.status ?? '').toLowerCase()}`}>{t.current ?? '—'}</span>
                    <span className={`perf-status-pill ${String(t.status ?? '').toLowerCase()}`}>
                      {t.status ? String(t.status).toUpperCase() : '—'}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <WorkspaceEmptyState message="Run a Performance Audit to populate NFR baselines" />
            )}

            {/* Recommendations from live telemetry */}
            {liveRecommendations && (
              <div className="perf-recommendations">
                <div className="perf-rec-label">
                  <i className="ti-light-bulb" style={{ color: '#fbbf24', marginRight: '6px' }}></i>
                  Optimization Recommendations
                </div>
                {liveRecommendations.map((r: string, i: number) => (
                  <div key={i} className="perf-rec-item">
                    <i className="ti-arrow-right" style={{ color: '#6366f1', fontSize: '0.7rem', marginRight: '8px' }}></i>
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {activeTab === 'audit' && (
          <div className="perf-audit-log">
            {liveAuditLog ? (
              liveAuditLog.map((e, idx) => (
                <div key={idx} className={`perf-log-item ${String(e.level ?? '').toLowerCase() === 'warn' ? 'warn' : 'ok'}`}>
                  {e.ts    && <span className="ts">{e.ts}</span>}
                  {e.agent && <span className="agent">{e.agent}</span>}
                  <p>{e.message ?? '—'}</p>
                </div>
              ))
            ) : (
              <WorkspaceEmptyState message="Run a Performance Audit to generate the audit log" />
            )}
          </div>
        )}
      </div>
      <style>{`
        .perf-content { flex: 1; padding: 10px 0; }
        .perf-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .perf-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }

        .perf-mode-select { background: #fff; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; color: #1e293b; font-weight: 600; outline: none; cursor: pointer; }
        .perf-mode-select:hover { border-color: #6366f1; }

        .perf-health-badge { font-size: 0.75rem; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.1); padding: 4px 10px; border-radius: 20px; }

        .perf-chart-container { height: 200px; display: grid; grid-template-columns: 40px 1fr; grid-template-rows: 1fr 30px; gap: 5px; margin-bottom: 24px; }
        .perf-y-axis { display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #94a3b8; writing-mode: vertical-lr; transform: rotate(180deg); }
        .perf-x-axis { grid-column: 2; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #94a3b8; }
        .perf-chart { grid-column: 2; border-left: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; position: relative; background: #fafbff; overflow: hidden; }
        .chart-profile-label { position: absolute; top: 8px; right: 10px; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: rgba(255,255,255,0.9); border: 1px solid #e2e8f0; }

        .perf-controls { display: flex; flex-direction: column; gap: 12px; background: #f8fafc; padding: 16px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
        .perf-controls-label { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
        .perf-controls-inner { display: flex; gap: 30px; }
        .control-item { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .control-item label { font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .control-item input[type='range'] { accent-color: #6366f1; cursor: pointer; }
        .control-item input[type='number'] { padding: 6px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.85rem; width: 80px; }
        .control-item span { font-size: 0.9rem; font-weight: 700; color: #6366f1; }

        .perf-bottlenecks { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; margin-top: 16px; }
        .perf-bottlenecks-label { font-size: 0.75rem; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 10px; }
        .perf-bottleneck-item { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #78350f; margin-bottom: 6px; }
        .perf-bottleneck-item .dot { width: 6px; height: 6px; border-radius: 50%; background: #f97316; flex-shrink: 0; }

        .perf-recommendations { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px; margin-top: 20px; }
        .perf-rec-label { font-size: 0.75rem; font-weight: 800; color: #14532d; text-transform: uppercase; margin-bottom: 10px; }
        .perf-rec-item { display: flex; align-items: flex-start; font-size: 0.85rem; color: #166534; margin-bottom: 8px; line-height: 1.4; }

        .perf-grid { display: grid; grid-template-columns: 1fr 120px 120px 100px; gap: 15px; align-items: center; padding: 12px; }
        .perf-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
        .perf-grid.row { border-bottom: 1px solid #f1f5f9; }

        .perf-metric-name { font-size: 0.9rem; font-weight: 600; color: #1e293b; }
        .perf-target { font-size: 0.85rem; color: #64748b; font-family: monospace; }
        .perf-val { font-size: 0.85rem; font-weight: 700; font-family: monospace; }
        .perf-val.pass { color: #10b981; }
        .perf-val.fail { color: #ef4444; }

        .perf-status-pill { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-align: center; }
        .perf-status-pill.pass { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .perf-status-pill.fail { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

        .perf-add-btn { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #475569; cursor: pointer; transition: all 0.2s; }
        .perf-add-btn:hover:not(:disabled) { background: #e2e8f0; color: #1e293b; }
        .perf-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .perf-log-item { display: flex; flex-direction: column; gap: 4px; padding: 12px 15px; border-left: 4px solid #e2e8f0; background: #fff; border-radius: 0 8px 8px 0; border: 1px solid #f1f5f9; margin-bottom: 10px; }
        .perf-log-item.warn { border-left-color: #f59e0b; background: #fffbeb; }
        .perf-log-item.ok { border-left-color: #10b981; }
        .perf-log-item .ts { font-size: 0.7rem; color: #94a3b8; font-family: monospace; }
        .perf-log-item .agent { font-size: 0.75rem; font-weight: 700; color: #6366f1; text-transform: uppercase; }
        .perf-log-item p { margin: 5px 0 0; font-size: 0.85rem; color: #334155; line-height: 1.4; }
      `}</style>
    </WorkspaceShell>
  );
};

export default PerformanceWorkspace;
