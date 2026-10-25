/**
 * ================================================================================
 * SeQuor AGENT MESH - UX INTELLIGENCE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

interface UXIntelligenceWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const UXIntelligenceWorkspace: React.FC<UXIntelligenceWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'vitals' | 'heuristics' | 'accessibility'>('vitals');
  const [targetUrl, setTargetUrl] = useState<string>('');
  const standaloneLocked = !useStandaloneInvokeEnabled();

  const handleAssess = React.useCallback(() => {
    if (standaloneLocked) return;
    const context = targetUrl.trim()
      ? `Target URL: ${targetUrl.trim()} - Execute full UX heuristic audit and Core Web Vitals profiling.`
      : 'Execute full UX heuristic audit and Core Web Vitals profiling.';
    onInvoke(context);
  }, [onInvoke, standaloneLocked, targetUrl]);

  const liveVitals = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.vitals ?? parsed.web_vitals ?? parsed.metrics ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((v: any) => ({
        label: v.label ?? v.name ?? null,
        val: v.val ?? v.value ?? null,
        status: v.status ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveHeuristics = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.heuristics ?? parsed.ux_findings ?? parsed.insights ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((h: any) => ({
        title: h.title ?? h.name ?? null,
        description: h.description ?? h.detail ?? null,
        status: h.status ?? h.severity ?? 'ok',
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveA11y = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const a = parsed.accessibility ?? parsed.a11y ?? parsed;
      if (typeof a !== 'object' || Array.isArray(a)) return null;
      const compliance = a.compliance ?? a.wcag_compliance ?? null;
      const altText = a.missing_alt_text ?? a.alt_text_issues ?? null;
      const contrast = a.contrast_ratio ?? a.contrast_warnings ?? null;
      const aria = a.aria_labels ?? a.aria_compliance ?? null;
      if (compliance === null && altText === null && contrast === null && aria === null) return null;
      return { compliance, altText, contrast, aria };
    } catch { return null; }
  }, [telemetry]);

  const scoreDisplay = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.score ?? parsed.ux_score ?? parsed.overall_score ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'vitals',        label: 'Core Web Vitals',    icon: 'ti-pulse' },
    { id: 'heuristics',    label: 'Heuristic Audit',    icon: 'ti-face-smile' },
    { id: 'accessibility', label: 'Accessibility (A11y)', icon: 'ti-user' },
  ];

  return (
    <WorkspaceShell
      nodeKey="ux_intelligence"
      loading={loading}
      onInvoke={onInvoke}
      invokeContext={targetUrl.trim() ? `Target URL: ${targetUrl.trim()} - Execute full UX heuristic audit and Core Web Vitals profiling.` : undefined}
      headerExtra={
        <div className="ux-target-bar">
          <div className="ux-target-label">
            <i className="ti-world" style={{ marginRight: '6px', color: '#6366f1' }}></i>
            Target URL or Component
          </div>
          <div className="ux-target-input-row">
            <input
              type="text"
              className="ux-target-input"
              placeholder="https://your-app.com or describe the component/flow to analyse..."
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading && !standaloneLocked) handleAssess(); }}
            />
            <button className="ux-target-btn" onClick={handleAssess} disabled={loading || standaloneLocked}>
              {loading ? <i className="ti-reload spin-animation"></i> : <i className="ti-pulse"></i>}
              {loading ? ' Assessing...' : ' Assess'}
            </button>
          </div>
        </div>
      }
    >
      <div className="ux-content">
          {activeTab === 'vitals' && (
            <div className="ux-vitals-panel">
              <div className="ux-section-header">
                <h3>Performance Experience Layer</h3>
                {scoreDisplay !== null && <div className="ux-score-badge ok">Score: {scoreDisplay}</div>}
              </div>
              {liveVitals ? (
                <div className="ux-vitals-grid">
                  {liveVitals.map((v, i) => (
                    <div key={i} className={`ux-vital-card ${String(v.status ?? '').toLowerCase()}`}>
                      <span className="label">{v.label ?? '-'}</span>
                      <span className="val">{v.val ?? '-'}</span>
                      <div className="status-line"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Assess Experience to populate Core Web Vitals" icon="ti-pulse" />
              )}
            </div>
          )}

          {activeTab === 'heuristics' && (
            <div className="ux-heuristics-list">
              {liveHeuristics ? (
                liveHeuristics.map((h, idx) => (
                  <div key={idx} className={`ux-h-card ${String(h.status ?? '').toLowerCase() === 'warn' ? 'warn' : 'ok'}`}>
                    <i className={String(h.status ?? '').toLowerCase() === 'warn' ? 'ti-alert' : 'ti-check'}></i>
                    <div>
                      <h5>{h.title ?? '-'}</h5>
                      <p>{h.description ?? '-'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Assess Experience to populate heuristic audit" icon="ti-face-smile" />
              )}
            </div>
          )}

          {activeTab === 'accessibility' && (
            <div className="ux-a11y-dashboard">
              {liveA11y ? (
                <>
                  {liveA11y.compliance !== null && (
                    <div className="ux-a11y-chart">
                      <div className="ring"><div className="fill"></div></div>
                      <div className="label"><strong>{liveA11y.compliance}</strong> WCAG Compliance</div>
                    </div>
                  )}
                  <div className="ux-a11y-findings">
                    {liveA11y.altText !== null && <div className="item"><span>Missing Alt Text</span><strong>{liveA11y.altText}</strong></div>}
                    {liveA11y.contrast !== null && <div className="item"><span>Contrast Ratio</span><strong>{liveA11y.contrast}</strong></div>}
                    {liveA11y.aria !== null && <div className="item"><span>Aria Labels</span><strong>{liveA11y.aria}</strong></div>}
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: '1 / -1' }}>
                  <WorkspaceEmptyState message="Assess Experience to populate accessibility data" icon="ti-user" />
                </div>
              )}
            </div>
          )}
        </div>

        <style>{`
          .ux-target-bar { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
          .ux-target-label { font-size: 0.72rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
          .ux-target-input-row { display: flex; gap: 10px; }
          .ux-target-input { flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem; color: #1e293b; outline: none; transition: border-color 0.2s; }
          .ux-target-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
          .ux-target-btn { padding: 8px 16px; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
          .ux-target-btn:hover:not(:disabled) { background: #4f46e5; }
          .ux-target-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .ux-content { flex: 1; padding: 10px 0; }
          .ux-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ux-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ux-score-badge { font-size: 0.75rem; font-weight: 700; padding: 4px 12px; border-radius: 20px; }
          .ux-score-badge.ok { background: #dcfce7; color: #15803d; }
          .ux-vitals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .ux-vital-card { padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; display: flex; flex-direction: column; gap: 8px; position: relative; }
          .ux-vital-card .label { font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase; }
          .ux-vital-card .val { font-size: 1.5rem; font-weight: 800; color: #1e293b; }
          .ux-vital-card .status-line { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; border-radius: 0 0 12px 12px; background: #e2e8f0; }
          .ux-vital-card.ok .status-line { background: #10b981; }
          .ux-vital-card.warn .status-line { background: #f59e0b; }
          .ux-heuristics-list { display: flex; flex-direction: column; gap: 15px; }
          .ux-h-card { padding: 15px; border-radius: 10px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
          .ux-h-card.ok { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
          .ux-h-card.warn { background: #fffbeb; border-color: #fef3c7; color: #92400e; }
          .ux-h-card i { font-size: 1.5rem; }
          .ux-h-card h5 { margin: 0 0 4px; font-size: 0.95rem; }
          .ux-h-card p { margin: 0; font-size: 0.85rem; opacity: 0.8; line-height: 1.4; }
          .ux-a11y-dashboard { display: grid; grid-template-columns: 1fr 200px; gap: 30px; background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; min-height: 120px; }
          .ux-a11y-chart { display: flex; flex-direction: column; align-items: center; gap: 15px; border-right: 1px solid #e2e8f0; }
          .ring { width: 80px; height: 80px; border: 8px solid #e2e8f0; border-radius: 50%; position: relative; }
          .ring .fill { position: absolute; inset: -8px; border: 8px solid #6366f1; border-radius: 50%; }
          .ux-a11y-chart .label { font-size: 0.85rem; color: #334155; text-align: center; }
          .ux-a11y-findings { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
          .ux-a11y-findings .item { display: flex; justify-content: space-between; font-size: 0.8rem; }
          .ux-a11y-findings span { color: #64748b; font-weight: 500; }
          .ux-a11y-findings strong { color: #1e293b; font-weight: 700; }
        `}</style>
    </WorkspaceShell>
  );
};

export default UXIntelligenceWorkspace;
