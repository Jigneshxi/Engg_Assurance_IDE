/**
 * ================================================================================
 * SeQuor AGENT MESH - SECURITY INTELLIGENCE SPECIALIST WORKSPACE
 * ================================================================================
 * Live-first rendering: all data panels read from the `telemetry` prop.
 * When no payload is present a clean "Awaiting Live Data" empty state is shown.
 * No static fallback arrays, no Math.random().
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface SecurityWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const SecurityWorkspace: React.FC<SecurityWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'board' | 'scanning' | 'compliance'>('board');

  const liveThreats = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr =
        parsed.threats ??
        parsed.vulnerabilities ??
        parsed.risks ??
        parsed.security_findings ??
        parsed.findings ??
        (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((t: any, i: number) => ({
        id: t.id ?? `S-${String(i + 1).padStart(2, '0')}`,
        type: t.type ?? t.name ?? null,
        vector: t.vector ?? t.endpoint ?? t.location ?? null,
        risk: t.risk ?? t.severity ?? null,
        status: t.status ?? null,
      }));
    } catch {
      return null;
    }
  }, [telemetry]);

  const liveScanInfo = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.scan ?? parsed.scanning ?? parsed.probe ?? null;
    } catch {
      return null;
    }
  }, [telemetry]);

  const liveCompliance = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr =
        parsed.compliance ??
        parsed.compliance_checks ??
        parsed.standards ??
        (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((c: any) => ({
        title: c.title ?? c.name ?? c.standard ?? null,
        description: c.description ?? c.detail ?? null,
        status: c.status ?? c.result ?? 'ok',
      }));
    } catch {
      return null;
    }
  }, [telemetry]);

  const safetyScore = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.safety_score ?? parsed.score ?? parsed.security_score ?? null;
    } catch {
      return null;
    }
  }, [telemetry]);

  const TABS = [
    { id: 'board',      label: 'Threat Board', icon: 'ti-shield' },
    { id: 'scanning',   label: 'Logic Scans',  icon: 'ti-search' },
    { id: 'compliance', label: 'Audit Trail',  icon: 'ti-agenda' },
  ];

  return (
    <WorkspaceShell
      nodeKey="security"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="sec-content">

          {/* ── THREAT BOARD ── */}
          {activeTab === 'board' && (
            <div className="sec-threat-board">
              <div className="sec-section-header">
                <h3>Active Threat Model</h3>
                {safetyScore !== null ? (
                  <div className="sec-risk-score">
                    <span className="score">{safetyScore}</span>
                    <span className="label">Safety Score</span>
                  </div>
                ) : (
                  <span className="sec-status-hint">Run an audit to populate threat data</span>
                )}
              </div>

              {liveThreats ? (
                <>
                  <div className="sec-threat-grid header">
                    <span>Type</span>
                    <span>Attack Vector</span>
                    <span>Risk Level</span>
                    <span>Status</span>
                  </div>
                  {liveThreats.map((t, idx) => (
                    <div key={idx} className={`sec-threat-grid row ${String(t.risk ?? '').toLowerCase()}`}>
                      <span className="sec-threat-name">{t.type ?? '-'}</span>
                      <span className="sec-vector-code"><code>{t.vector ?? '-'}</code></span>
                      <span className={`sec-risk-tag ${String(t.risk ?? '').toLowerCase()}`}>{t.risk ?? '-'}</span>
                      <span className={`sec-status-text ${t.status === 'Mitigated' ? 'ok' : 'pending'}`}>{t.status ?? '-'}</span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Execute a Security Audit to populate threat data" />
              )}
            </div>
          )}

          {/* ── LOGIC SCANS ── */}
          {activeTab === 'scanning' && (
            <div className="sec-scanning-panel">
              {liveScanInfo ? (
                <>
                  <div className="sec-scan-pulse">
                    <div className="pulse-ring"></div>
                    <div className="pulse-icon"><i className="ti-search"></i></div>
                  </div>
                  <div className="sec-scan-info">
                    <h4>{liveScanInfo.title ?? 'ASPM+ Intelligent Probe'}</h4>
                    <p>{liveScanInfo.description ?? liveScanInfo.summary ?? '-'}</p>
                    {liveScanInfo.progress !== undefined && (
                      <>
                        <div className="sec-scan-progress">
                          <div className="fill" style={{ width: `${liveScanInfo.progress}%` }}></div>
                        </div>
                        <div className="sec-scan-stats">
                          <span>{liveScanInfo.progress}% Complete</span>
                          {liveScanInfo.rules_applied && <span>{liveScanInfo.rules_applied} Rules applied</span>}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState message="Execute a Security Audit to populate scan data" />
              )}
            </div>
          )}

          {/* ── AUDIT TRAIL ── */}
          {activeTab === 'compliance' && (
            <div className="sec-compliance-list">
              {liveCompliance ? (
                liveCompliance.map((c, idx) => (
                  <div key={idx} className={`sec-compliance-card ${String(c.status ?? '').toLowerCase() === 'warn' ? 'warn' : 'ok'}`}>
                    <div className="icon">{String(c.status ?? '').toLowerCase() === 'warn' ? '⚠️' : '✅'}</div>
                    <div className="details">
                      <h5>{c.title ?? '-'}</h5>
                      <p>{c.description ?? '-'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Execute a Security Audit to populate compliance data" />
              )}
            </div>
          )}

        </div>

        <style>{`
          .sec-content { flex: 1; padding: 10px 0; }
          .sec-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .sec-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }

          .sec-risk-score { display: flex; flex-direction: column; align-items: flex-end; }
          .sec-risk-score .score { font-size: 1.8rem; font-weight: 800; color: #10b981; line-height: 1; }
          .sec-risk-score .label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-top: 4px; }

          .sec-status-hint { font-size: 0.75rem; color: #94a3b8; font-style: italic; }

          .sec-threat-grid { display: grid; grid-template-columns: 1fr 1fr 120px 120px; gap: 15px; align-items: center; padding: 12px; }
          .sec-threat-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
          .sec-threat-grid.row { border-bottom: 1px solid #f1f5f9; }

          .sec-threat-name { font-size: 0.9rem; font-weight: 600; color: #1e293b; }
          .sec-vector-code code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #64748b; font-size: 0.8rem; }

          .sec-risk-tag { font-size: 0.65rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-align: center; color: white; }
          .sec-risk-tag.critical { background: #ef4444; }
          .sec-risk-tag.high { background: #f97316; }
          .sec-risk-tag.medium { background: #f59e0b; }
          .sec-risk-tag.low { background: #10b981; }

          .sec-status-text { font-size: 0.8rem; font-weight: 500; }
          .sec-status-text.ok { color: #10b981; }
          .sec-status-text.pending { color: #94a3b8; }

          .sec-scanning-panel { background: #0f172a; border-radius: 12px; padding: 30px; display: flex; gap: 30px; align-items: center; min-height: 140px; }
          .sec-scan-pulse { position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .pulse-ring { position: absolute; width: 100%; height: 100%; border: 2px solid #6366f1; border-radius: 50%; animation: sec-ring 2s infinite; }
          .pulse-icon { font-size: 2rem; color: #6366f1; }
          @keyframes sec-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }

          .sec-scan-info { flex: 1; }
          .sec-scan-info h4 { margin: 0 0 8px; color: #fff; font-size: 1rem; }
          .sec-scan-info p { margin: 0 0 15px; color: #94a3b8; font-size: 0.85rem; line-height: 1.4; }
          .sec-scan-progress { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 8px; overflow: hidden; }
          .sec-scan-progress .fill { height: 100%; background: #6366f1; border-radius: 4px; }
          .sec-scan-stats { display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b; font-weight: 600; }

          .sec-compliance-list { display: flex; flex-direction: column; gap: 15px; }
          .sec-compliance-card { display: flex; gap: 15px; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; align-items: center; }
          .sec-compliance-card.ok { background: #f0fdf4; border-color: #bbf7d0; }
          .sec-compliance-card.warn { background: #fffbeb; border-color: #fef3c7; }
          .sec-compliance-card .icon { font-size: 1.5rem; }
          .sec-compliance-card h5 { margin: 0 0 4px; font-size: 0.9rem; color: #1e293b; }
          .sec-compliance-card p { margin: 0; font-size: 0.8rem; color: #64748b; }
        `}</style>
    </WorkspaceShell>
  );
};

export default SecurityWorkspace;
