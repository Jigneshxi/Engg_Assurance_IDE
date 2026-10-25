import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import EngineeringEconomicsPanel from './EngineeringEconomicsPanel';
import ComplianceRemediationPanel from './ComplianceRemediationPanel';

interface ReleaseCommandCenterProps {
  taskId: string | null;
  demoMode?: boolean;
  fullMeshState?: any;
}

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

// ── Hold to Confirm Button ────────────────────────────────────────────────────
const HoldToConfirm: React.FC<{ onConfirm: () => void; disabled?: boolean }> = ({ onConfirm, disabled }) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdDuration = 1500; // ms to hold

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHolding && !disabled) {
      interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            onConfirm();
            setIsHolding(false);
            return 100;
          }
          return p + (100 / (holdDuration / 50));
        });
      }, 50);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isHolding, disabled, onConfirm]);

  return (
    <button
      onMouseDown={() => setIsHolding(true)}
      onMouseUp={() => setIsHolding(false)}
      onMouseLeave={() => setIsHolding(false)}
      disabled={disabled}
      style={{
        position: 'relative', overflow: 'hidden', padding: '14px 28px', borderRadius: '12px', border: 'none',
        background: disabled ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.1)',
        color: disabled ? '#64748b' : '#10b981', fontSize: '0.9rem', fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(16,185,129,0.2)', transition: 'all 0.2s', outline: 'none'
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${progress}%`, background: 'linear-gradient(90deg, rgba(16,185,129,0.2), rgba(16,185,129,0.5))', transition: 'width 0.05s linear' }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{progress >= 100 ? 'RELEASED!' : 'HOLD TO CONFIRM RELEASE'}</span>
    </button>
  );
};

// ── Score Ring ────────────────────────────────────────────────────────────────
const ScoreRing: React.FC<{ score: number | null; size?: number; color?: string }> = ({ score, size = 80, color = '#6366f1' }) => {
  if (score === null) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.75rem' }}>N/A</div>
  );
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size > 70 ? '1.3rem' : '0.9rem', fontWeight: 900, color: '#f1f5f9' }}>{score}</span>
        <span style={{ fontSize: '0.55rem', color: '#64748b', textTransform: 'uppercase' }}>/ 100</span>
      </div>
    </div>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ value: string; type?: 'go' | 'nogo' | 'clean' | 'pending' | 'warn' }> = ({ value, type }) => {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    go:      { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)' },
    nogo:    { bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
    clean:   { bg: 'rgba(16,185,129,0.08)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.2)' },
    pending: { bg: 'rgba(245,158,11,0.08)',  color: '#fcd34d', border: 'rgba(245,158,11,0.2)' },
    warn:    { bg: 'rgba(245,158,11,0.08)',  color: '#fcd34d', border: 'rgba(245,158,11,0.2)' },
  };
  const c = colors[type || 'pending'];
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800, background: c.bg, color: c.color, border: `1px solid ${c.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {value}
    </span>
  );
};

// ── PDF Download Helper ───────────────────────────────────────────────────────
// Uses fetch + Blob + URL.createObjectURL for cross-origin downloads.
// <a href download> is blocked by CORS when frontend and backend are on different ports.
const downloadPdf = async (
  endpoint: string,
  filename: string,
  setDownloading: (v: string | null) => void
) => {
  setDownloading(filename);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { ...apiClient['getHeaders']() },
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert('Download failed: ' + e.message);
  } finally {
    setDownloading(null);
  }
};

const PDF_EXPORTS = (taskId: string) => [
  { label: 'Resilience Certificate', icon: 'ti-shield',   color: '#f59e0b',
    endpoint: '/api/converge/export/resilience-certificate/' + taskId,
    filename: 'CONVERGE_Resilience_' + asText(taskId).slice(0, 8) + '.pdf' },
  { label: 'Compliance Pack',        icon: 'ti-files',    color: '#6366f1',
    endpoint: '/api/converge/export/compliance-pack/' + taskId,
    filename: 'CONVERGE_Compliance_' + asText(taskId).slice(0, 8) + '.pdf' },
  { label: 'Economics Report',       icon: 'ti-stats-up', color: '#8b5cf6',
    endpoint: '/api/converge/export/economics/' + taskId,
    filename: 'CONVERGE_Economics_' + asText(taskId).slice(0, 8) + '.pdf' },
  { label: 'Full Release Report',    icon: 'ti-download', color: '#10b981',
    endpoint: '/api/converge/export/release-report/' + taskId,
    filename: 'CONVERGE_Release_' + asText(taskId).slice(0, 8) + '.pdf' },
];

// ── Download Actions Panel ────────────────────────────────────────────────────
const DownloadActions: React.FC<{ taskId: string | null }> = ({ taskId }) => {
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!taskId) return null;

  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {PDF_EXPORTS(taskId).map(action => {
        const isLoading = downloading === action.filename;
        return (
          <button
            key={action.label}
            onClick={() => downloadPdf(action.endpoint, action.filename, setDownloading)}
            disabled={!!downloading}
            title={'Download ' + action.label + ' as PDF'}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid ' + (isLoading ? action.color : 'rgba(255,255,255,0.08)'),
              background: isLoading ? action.color + '15' : 'rgba(255,255,255,0.03)',
              color: isLoading ? '#f1f5f9' : '#94a3b8',
              fontSize: '0.78rem', fontWeight: 600,
              cursor: downloading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s',
              opacity: (downloading && !isLoading) ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!downloading) {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = action.color;
                b.style.color = '#f1f5f9';
              }
            }}
            onMouseLeave={e => {
              if (!downloading) {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = 'rgba(255,255,255,0.08)';
                b.style.color = '#94a3b8';
              }
            }}
          >
            <i className={isLoading ? 'ti-reload' : action.icon}
              style={{ color: action.color, animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            {isLoading ? 'Generating PDF...' : action.label}
          </button>
        );
      })}
      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ReleaseCommandCenter: React.FC<ReleaseCommandCenterProps> = ({ taskId, demoMode, fullMeshState }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState<'command' | 'cfo' | 'remediation'>('command');

  useEffect(() => {
    if (!taskId) return;
    const fetchData = async () => {
      setLoading(true); setError('');
      try {
        const data = await apiClient.get(`/converge/release-decision/${taskId}`);
        if (data && !data.detail) { setData(data); }
        else { setError('Release decision data not yet available. Run a full mission first.'); }
      } catch (e: any) { setError(`Failed to load: ${e.message}`); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [taskId]);

  useEffect(() => {
    if (fullMeshState) {
      // Look for phase 4 output inside fullMeshState, or top-level partial_state
      const p4 = fullMeshState.phase4_output || {};
      const p3 = fullMeshState.phase3_output || {};
      
      const rd = fullMeshState.release_risk_decision || p4.release_risk_decision;
      const bi = fullMeshState.business_impact_intelligence || p4.business_impact_intelligence;
      const roi = fullMeshState.eng_economics_roi || p4.eng_economics_roi;
      const comp = fullMeshState.compliance_report || p3.compliance_report || {};
      const res = fullMeshState.system_resilience || p3.system_resilience || {};
      
      // Overwrite static or incomplete API data with live mesh data
      if (rd || bi || roi) {
        setData((prevData: any) => {
          const compControls = len(comp.compliance_controls);
          const flaky = len(fullMeshState.reliability_eng?.flaky_tests);
          
          return {
            ...prevData,
            release_decision: { 
              decision: rd?.recommendation || rd?.decision || 'PENDING', 
              composite_score: rd?.composite_score || null, 
              justification: rd?.justification || rd?.narrative_justification || 'Awaiting mission completion for release justification.',
              risk_factors: rd?.risk_score || rd?.risk_factors || []
            },
            revenue_guard: { 
              revenue_at_risk: bi?.revenue_at_risk || bi?.revenue_exposure || 'N/A', 
              total_exposure: bi?.total_exposure || 'N/A', 
              flaky_tests: flaky, 
              quarantined: fullMeshState.reliability_eng?.quarantine_count || 0 
            },
            compliance_status: { 
              standards: comp.applicable_standards || [], 
              controls_verified: compControls, 
              status: compControls > 0 ? 'CLEAN' : 'PENDING' 
            },
            resilience_certificate: { 
              score: res.resilience_score || 'N/A', 
              chaos_scenarios_passed: len(fullMeshState.chaos_scenarios), 
              stability_score: fullMeshState.reliability_eng?.health?.stability_score || 'N/A' 
            },
            economics: { 
              roi_percentage: roi?.roi_percentage || 'N/A', 
              estimated_savings: roi?.estimated_savings || roi?.savings || 'N/A' 
            },
          };
        });
      }
    }
  }, [fullMeshState]);

  // Helper inside component to calculate lengths safely
  const len = (arr: any) => (Array.isArray(arr) ? arr.length : 0);

  if (!taskId && !fullMeshState) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: '#475569', textAlign: 'center' }}>
        <i className="ti-stats-up" style={{ fontSize: '3rem', color: '#334155' }} />
        <h2 style={{ color: '#94a3b8', fontWeight: 700, margin: 0 }}>No Active Mission</h2>
        <p style={{ maxWidth: '360px', lineHeight: 1.6, fontSize: '0.85rem' }}>
          Launch a CONVERGE mission from the Mission Launchpad to see the Release Command Center populate with live intelligence.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: '12px', color: '#64748b' }}>
        <i className="ti-reload" style={{ animation: 'spin 1s linear infinite', fontSize: '1.2rem' }} />
        Loading release intelligence...
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '20px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', color: '#fcd34d', fontSize: '0.85rem' }}>
        <i className="ti-alert" style={{ marginRight: '8px' }} />{error}
      </div>
    );
  }

  const fallbackData = fullMeshState ? {
    release_decision: {
      decision: 'PENDING',
      composite_score: null,
      justification: 'Awaiting mission completion for release justification.',
    },
    revenue_guard: {
      revenue_at_risk: 'N/A',
      total_exposure: 'N/A',
      flaky_tests: 0,
      quarantined: 0,
    },
    compliance_status: {
      standards: [],
      controls_verified: 0,
      status: 'PENDING',
    },
    resilience_certificate: {
      score: null,
      chaos_scenarios_passed: 0,
      stability_score: 'N/A',
    },
    economics: {
      roi_percentage: 'N/A',
      estimated_savings: 'N/A',
    },
  } : null;
  const d = data ?? fallbackData;
  const hasLiveData = Boolean(d || fullMeshState);
  if (!hasLiveData) {
    return (
      <div style={{ padding: '20px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '12px', color: '#c7d2fe', fontSize: '0.85rem' }}>
        <strong>Validation:</strong> release intelligence is unavailable until a live mission completes. Run Requirement Ops to generate a release decision, revenue guard, and compliance status.
      </div>
    );
  }
  const decision = asText(d?.release_decision?.decision, 'PENDING').toUpperCase();
  const isGo = decision === 'GO' || decision === 'RELEASE_RECOMMENDED';
  const isNoGo = decision === 'NO-GO' || decision === 'HOLD' || decision === 'NO_GO';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f1f5f9', margin: 0, letterSpacing: '-0.5px' }}>
            Release Command Center
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>
            Autonomous Go/No-Go intelligence — financially justified, compliance-certified.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          {taskId && <div style={{ fontSize: '0.65rem', color: '#475569', fontFamily: 'monospace' }}>Task: {asText(taskId).slice(0, 12)}...</div>}
          {/* View Toggle: Command Center ↔ CFO View ↔ Remediation */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {([
              { id: 'command',    label: 'Command Center',  icon: 'ti-dashboard' },
              { id: 'cfo',        label: 'CFO View',        icon: 'ti-stats-up' },
              { id: 'remediation',label: 'Remediation PRs', icon: 'ti-shield' },
            ] as const).map(view => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                style={{
                  padding: '6px 14px', borderRadius: '6px', border: 'none',
                  background: activeView === view.id ? 'rgba(139,92,246,0.25)' : 'transparent',
                  color: activeView === view.id ? '#a78bfa' : '#64748b',
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  transition: 'all 0.2s'
                }}
              >
                <i className={view.icon} />
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CFO VIEW — Engineering Economics Dashboard */}
      {activeView === 'cfo' && (
        <div style={{ padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <EngineeringEconomicsPanel taskId={taskId} demoMode={demoMode} fullMeshState={fullMeshState} />
        </div>
      )}

      {/* REMEDIATION VIEW — Compliance PR Studio */}
      {activeView === 'remediation' && (
        <div style={{ padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <ComplianceRemediationPanel taskId={taskId} demoMode={demoMode} fullMeshState={fullMeshState} />
        </div>
      )}

      {/* COMMAND CENTER VIEW */}
      {activeView === 'command' && (<>

      {/* Missing Decide-module notice */}
      {activeView === 'command' && decision === 'PENDING' && (!d?.release_decision?.justification?.trim() || d.release_decision.justification.includes('Awaiting')) && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.82rem', color: '#fcd34d', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <i className="ti-info-alt" style={{ fontSize: '1rem', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Release intelligence not yet generated.</strong> The Release Command Center requires the <strong>Decide</strong> module agents (Release Risk, Business Impact, ROI) to run. Launch a new mission from the Launchpad with the <strong>Decide</strong> module selected, chaining from this completed task as the parent.
          </div>
        </div>
      )}

      {/* Hero Decision Card */}
      <div style={{
        padding: '28px 32px', borderRadius: '16px',
        background: isGo ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))' : isNoGo ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isGo ? 'rgba(16,185,129,0.25)' : isNoGo ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', gap: '32px',
      }}>
        <ScoreRing score={d?.release_decision?.composite_score ?? null} size={90} color={isGo ? '#10b981' : isNoGo ? '#ef4444' : '#6366f1'} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: isGo ? '#10b981' : isNoGo ? '#ef4444' : '#f59e0b' }}>
              {isGo ? '✅ GO' : isNoGo ? '🚫 NO-GO' : '⏳ PENDING'}
            </span>
            <StatusBadge value={decision} type={isGo ? 'go' : isNoGo ? 'nogo' : 'pending'} />
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, maxWidth: '600px' }}>
            {d?.release_decision?.justification || 'Awaiting mission completion for release justification.'}
          </p>
        </div>
      </div>

      {/* 5-Panel Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>

        {/* Revenue Guard */}
        <div className="card" style={{ padding: '20px', minHeight: 'unset' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <i className="ti-money" style={{ color: '#10b981', fontSize: '1rem' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Revenue Guard</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '4px' }}>{d?.revenue_guard?.revenue_at_risk}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '12px' }}>Revenue at risk</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: '#64748b' }}>Total exposure</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>{d?.revenue_guard?.total_exposure}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: '#64748b' }}>Flaky tests</span>
              <span style={{ color: (d?.revenue_guard?.flaky_tests ?? 0) > 0 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{d?.revenue_guard?.flaky_tests ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: '#64748b' }}>Quarantined</span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>{d?.revenue_guard?.quarantined ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Compliance Status */}
        <div className="card" style={{ padding: '20px', minHeight: 'unset' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <i className="ti-shield" style={{ color: '#6366f1', fontSize: '1rem' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Compliance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <StatusBadge value={d?.compliance_status?.status || 'PENDING'} type={d?.compliance_status?.status === 'CLEAN' ? 'clean' : 'pending'} />
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{d?.compliance_status?.controls_verified ?? 0} controls verified</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(d?.compliance_status?.standards || []).map((s: string) => (
              <span key={s} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>{s}</span>
            ))}
            {(d?.compliance_status?.standards || []).length === 0 && <span style={{ color: '#475569', fontSize: '0.78rem' }}>No standards detected yet</span>}
          </div>
        </div>

        {/* Resilience Certificate */}
        <div className="card" style={{ padding: '20px', minHeight: 'unset' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <i className="ti-reload" style={{ color: '#f59e0b', fontSize: '1rem' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Resilience Certificate</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ScoreRing score={typeof d?.resilience_certificate?.score === 'number' ? d.resilience_certificate.score : null} size={64} color="#f59e0b" />
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '6px' }}>
                <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{d?.resilience_certificate?.chaos_scenarios_passed ?? 0}</span> chaos scenarios passed
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Stability: <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{d?.resilience_certificate?.stability_score}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROI Economics */}
        <div className="card" style={{ padding: '20px', minHeight: 'unset' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <i className="ti-stats-up" style={{ color: '#8b5cf6', fontSize: '1rem' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>ROI Economics</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#8b5cf6', marginBottom: '4px' }}>{d?.economics?.roi_percentage}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '8px' }}>Return on investment</div>
          <div style={{ fontSize: '0.85rem', color: '#a78bfa', fontWeight: 700 }}>{d?.economics?.estimated_savings} saved</div>
        </div>

        {/* Mission Summary */}
        <div className="card" style={{ padding: '20px', gridColumn: 'span 2', minHeight: 'unset' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <i className="ti-share" style={{ color: '#06b6d4', fontSize: '1rem' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Mission Summary</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Decision', value: isGo ? 'SHIP' : isNoGo ? 'HOLD' : 'PENDING', color: isGo ? '#10b981' : isNoGo ? '#ef4444' : '#f59e0b' },
              { label: 'Composite Score', value: d?.release_decision?.composite_score ? `${d.release_decision.composite_score}/100` : 'N/A', color: '#6366f1' },
              { label: 'Standards', value: `${(d?.compliance_status?.standards || []).length} verified`, color: '#818cf8' },
              { label: 'Savings', value: d?.economics?.estimated_savings || 'N/A', color: '#8b5cf6' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Download Actions — fetch+Blob for cross-origin PDF download */}
        <DownloadActions taskId={taskId} />

        {isGo && (
          <HoldToConfirm onConfirm={() => alert('Release deployed to production!')} />
        )}
      </div>

      {/* End Command Center View */}
      </>)}

    </div>
  );
};

export default ReleaseCommandCenter;
