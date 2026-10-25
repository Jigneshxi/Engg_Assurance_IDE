/**
 * ================================================================================
 * SeQuor AGENT MESH - VISUAL INTELLIGENCE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface VisualWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

interface ConfiguredPage {
  url: string;
  name: string;
  threshold: number;
  viewport: string;
}

interface HistoryEntry {
  drift: string | null;
  threshold: string | null;
  status: string | null;
  timestamp?: string;
}

const VIEWPORT_OPTIONS = [
  { value: '1920x1080', label: 'Desktop 1920×1080' },
  { value: '1024x768',  label: 'Tablet 1024×768' },
  { value: '375x812',   label: 'Mobile 375×812' },
];

const VisualWorkspace: React.FC<VisualWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'diff' | 'anchors'>('gallery');

  // --- Modal state ---
  const [showConfigModal, setShowConfigModal]   = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPage, setSelectedPage]         = useState<{ name: string; history: HistoryEntry[] } | null>(null);
  const [configuredPages, setConfiguredPages]   = useState<ConfiguredPage[]>([]);

  // --- Config form state ---
  const [formUrl,       setFormUrl]       = useState('');
  const [formName,      setFormName]      = useState('');
  const [formThreshold, setFormThreshold] = useState<number>(0.1);
  const [formViewport,  setFormViewport]  = useState('1920x1080');

  const liveBaselines = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.baselines ?? parsed.snapshots ?? parsed.inventory ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((b: any, i: number) => ({
        id: b.id ?? `V-${String(i + 1).padStart(2, '0')}`,
        page: b.page ?? b.name ?? null,
        threshold: b.threshold ?? null,
        status: b.status ?? null,
        drift: b.drift ?? null,
        history: b.history ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveDiff = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.diff ?? parsed.visual_diff ?? parsed.regression ?? null;
    } catch { return null; }
  }, [telemetry]);

  const liveAnchors = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.anchors ?? parsed.dom_anchors ?? parsed.selectors ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((a: any) => ({
        selector: a.selector ?? a.dom_selector ?? null,
        constraint: a.constraint ?? null,
        sensitivity: a.sensitivity ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  // Merge live baselines + locally configured pages into one gallery list
  const allGalleryItems = React.useMemo(() => {
    const live = (liveBaselines ?? []).map((b: any) => ({
      id: b.id,
      page: b.page,
      threshold: b.threshold,
      status: b.status,
      drift: b.drift,
      history: b.history ?? [],
      source: 'live' as const,
    }));
    const configured = configuredPages.map((p, i) => ({
      id: `CFG-${i}`,
      page: p.name || p.url,
      threshold: String(p.threshold),
      status: 'pending',
      drift: null,
      history: [],
      source: 'configured' as const,
    }));
    return [...live, ...configured];
  }, [liveBaselines, configuredPages]);

  // --- Handlers ---
  const openConfigModal = () => {
    setFormUrl('');
    setFormName('');
    setFormThreshold(0.1);
    setFormViewport('1920x1080');
    setShowConfigModal(true);
  };

  const saveConfiguredPage = () => {
    if (!formUrl.trim() && !formName.trim()) return;
    setConfiguredPages(prev => [...prev, {
      url: formUrl.trim(),
      name: formName.trim() || formUrl.trim(),
      threshold: formThreshold,
      viewport: formViewport,
    }]);
    setShowConfigModal(false);
  };

  const openHistoryModal = (item: { page: string | null; history: HistoryEntry[]; threshold: string | null; status: string | null; drift: string | null }) => {
    const history: HistoryEntry[] = Array.isArray(item.history) && item.history.length > 0
      ? item.history
      : (item.drift != null || item.threshold != null || item.status != null)
        ? [{ drift: item.drift, threshold: item.threshold, status: item.status }]
        : [];
    setSelectedPage({ name: item.page ?? 'Unknown Page', history });
    setShowHistoryModal(true);
  };

  const TABS = [
    { id: 'gallery', label: 'Baseline Gallery',  icon: 'ti-image' },
    { id: 'diff',    label: 'Visual Diff Audit', icon: 'ti-split-h' },
    { id: 'anchors', label: 'DOM Anchors',        icon: 'ti-pin-alt' },
  ];

  return (
    <WorkspaceShell
      nodeKey="visual_intel"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="vis-content">
          {activeTab === 'gallery' && (
            <div className="vis-gallery">
              <div className="vis-section-header">
                <h3>Snapshot Inventory</h3>
                <button className="vis-add-btn" onClick={openConfigModal}>Configure New Page</button>
              </div>
              {allGalleryItems.length > 0 ? (
                <div className="vis-grid">
                  {allGalleryItems.map((b, idx) => (
                    <div key={idx} className="vis-card">
                      <div className="vis-card-img placeholder"><i className="ti-image"></i></div>
                      <div className="vis-card-body">
                        <div className="title-row">
                          <span className="page-name">{b.page ?? '-'}</span>
                          <span className={`status-dot ${String(b.status ?? '').toLowerCase()}`}></span>
                        </div>
                        {b.source === 'configured' && (
                          <div className="configured-badge">Configured</div>
                        )}
                        <div className="stats-row">
                          <div className="stat">
                            <span className="label">Threshold</span>
                            <span className="val">{b.threshold ?? '-'}</span>
                          </div>
                          <div className="stat">
                            <span className="label">Last Drift</span>
                            <span className="val">{b.drift ?? '-'}</span>
                          </div>
                        </div>
                        <button
                          className="vis-card-btn"
                          onClick={() => openHistoryModal(b)}
                        >
                          Review History
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Execute a Visual Audit to populate baseline snapshots" icon="ti-image" />
              )}
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="vis-diff-panel">
              {liveDiff ? (
                <>
                  <div className="vis-diff-header">
                    <div className="header-item"><span className="badge baseline">Baseline</span></div>
                    <div className="header-divider">VS</div>
                    <div className="header-item"><span className="badge current error">Candidate</span></div>
                  </div>
                  <div className="vis-diff-viewer">
                    <div className="side baseline"></div>
                    <div className="diff-slider"></div>
                    <div className="side candidate"></div>
                    <div className="vis-diff-overlay">
                      <span>
                        {liveDiff.drift !== undefined
                          ? `Perceptual Drift Detected: ${liveDiff.drift}`
                          : typeof liveDiff === 'string'
                          ? liveDiff
                          : 'Diff data available'}
                      </span>
                      {liveDiff.description && <p>{liveDiff.description}</p>}
                    </div>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState message="Execute a Visual Audit to populate diff data" icon="ti-split-h" />
              )}
            </div>
          )}

          {activeTab === 'anchors' && (
            <div className="vis-anchors-list">
              {liveAnchors ? (
                <table className="vis-table">
                  <thead>
                    <tr>
                      <th>DOM Selector</th>
                      <th>Constraint</th>
                      <th>Sensitivity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveAnchors.map((a: any, idx: number) => (
                      <tr key={idx}>
                        <td><code>{a.selector ?? '-'}</code></td>
                        <td>{a.constraint ?? '-'}</td>
                        <td>{a.sensitivity ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <WorkspaceEmptyState message="Execute a Visual Audit to populate DOM anchors" icon="ti-pin-alt" />
              )}
            </div>
          )}
        </div>

        {/* ── Configure New Page Modal ── */}
        {showConfigModal && (
          <div className="vis-modal-overlay" onClick={() => setShowConfigModal(false)}>
            <div className="vis-modal" onClick={e => e.stopPropagation()}>
              <div className="vis-modal-header">
                <h3>Configure New Page</h3>
                <button className="vis-modal-close" onClick={() => setShowConfigModal(false)}>✕</button>
              </div>
              <div className="vis-modal-body">
                <div className="vis-form-group">
                  <label>Page URL</label>
                  <input
                    type="text"
                    className="vis-input"
                    placeholder="https://example.com/page"
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                  />
                </div>
                <div className="vis-form-group">
                  <label>Snapshot Name</label>
                  <input
                    type="text"
                    className="vis-input"
                    placeholder="e.g. Homepage Hero"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                  />
                </div>
                <div className="vis-form-group">
                  <label>Threshold %</label>
                  <input
                    type="number"
                    className="vis-input"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formThreshold}
                    onChange={e => setFormThreshold(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="vis-form-group">
                  <label>Viewport</label>
                  <select
                    className="vis-input"
                    value={formViewport}
                    onChange={e => setFormViewport(e.target.value)}
                  >
                    {VIEWPORT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="vis-modal-footer">
                <button className="vis-btn-secondary" onClick={() => setShowConfigModal(false)}>Cancel</button>
                <button
                  className="vis-btn-primary"
                  onClick={saveConfiguredPage}
                  disabled={!formUrl.trim() && !formName.trim()}
                >
                  Save Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Review History Modal ── */}
        {showHistoryModal && selectedPage && (
          <div className="vis-modal-overlay" onClick={() => setShowHistoryModal(false)}>
            <div className="vis-modal vis-modal-wide" onClick={e => e.stopPropagation()}>
              <div className="vis-modal-header">
                <h3>Snapshot History — {selectedPage.name}</h3>
                <button className="vis-modal-close" onClick={() => setShowHistoryModal(false)}>✕</button>
              </div>
              <div className="vis-modal-body">
                {selectedPage.history.length === 0 ? (
                  <p className="vis-empty-msg">No snapshot history available for this page</p>
                ) : (
                  <div className="vis-timeline">
                    {selectedPage.history.map((entry, idx) => (
                      <div key={idx} className="vis-timeline-entry">
                        <div className="vis-timeline-dot"></div>
                        <div className="vis-timeline-content">
                          {entry.timestamp && (
                            <div className="vis-timeline-time">{entry.timestamp}</div>
                          )}
                          <div className="vis-timeline-stats">
                            <div className="vis-tstat">
                              <span className="vis-tstat-label">Drift %</span>
                              <span className="vis-tstat-val">{entry.drift ?? '—'}</span>
                            </div>
                            <div className="vis-tstat">
                              <span className="vis-tstat-label">Threshold</span>
                              <span className="vis-tstat-val">{entry.threshold ?? '—'}</span>
                            </div>
                            <div className="vis-tstat">
                              <span className="vis-tstat-label">Status</span>
                              <span className={`vis-tstat-val status-text ${String(entry.status ?? '').toLowerCase()}`}>
                                {entry.status ?? '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="vis-modal-footer">
                <button className="vis-btn-primary" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .vis-content { flex: 1; padding: 10px 0; }
          .vis-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .vis-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .vis-add-btn { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #475569; cursor: pointer; }
          .vis-add-btn:hover { background: #e2e8f0; color: #1e293b; }
          .vis-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
          .vis-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; transition: all 0.3s; }
          .vis-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-color: #6366f1; }
          .vis-card-img.placeholder { height: 120px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #cbd5e1; }
          .vis-card-body { padding: 15px; }
          .title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .page-name { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
          .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
          .status-dot.locked { background: #10b981; box-shadow: 0 0 6px #10b981; }
          .status-dot.pending { background: #f59e0b; }
          .configured-badge { display: inline-block; font-size: 0.65rem; font-weight: 700; background: #ede9fe; color: #7c3aed; padding: 2px 7px; border-radius: 4px; margin-bottom: 8px; }
          .stats-row { display: flex; gap: 20px; margin-bottom: 15px; }
          .stat { display: flex; flex-direction: column; }
          .stat .label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
          .stat .val { font-size: 0.85rem; font-weight: 600; color: #334155; }
          .vis-card-btn { width: 100%; padding: 8px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #475569; cursor: pointer; transition: all 0.2s; }
          .vis-card-btn:hover { background: #e2e8f0; color: #1e293b; }
          .vis-diff-panel { display: flex; flex-direction: column; gap: 15px; min-height: 300px; }
          .vis-diff-header { display: flex; align-items: center; justify-content: center; gap: 25px; }
          .header-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
          .badge { font-size: 0.7rem; font-weight: 800; padding: 2px 10px; border-radius: 4px; }
          .badge.baseline { background: #e0f2fe; color: #0369a1; }
          .badge.current { background: #fee2e2; color: #b91c1c; }
          .header-divider { font-size: 0.8rem; font-weight: 900; color: #64748b; }
          .vis-diff-viewer { flex: 1; min-height: 200px; background: #0f172a; border-radius: 12px; position: relative; display: flex; overflow: hidden; }
          .side { flex: 1; height: 100%; }
          .side.baseline { background: rgba(99, 102, 241, 0.05); border-right: 1px solid rgba(255,255,255,0.1); }
          .side.candidate { background: rgba(239, 68, 68, 0.05); }
          .diff-slider { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: #6366f1; z-index: 5; }
          .vis-diff-overlay { position: absolute; bottom: 15px; left: 15px; right: 15px; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px); padding: 12px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); }
          .vis-diff-overlay span { color: #ef4444; font-size: 0.85rem; font-weight: 700; }
          .vis-diff-overlay p { margin: 5px 0 0; color: #cbd5e1; font-size: 0.75rem; }
          .vis-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
          .vis-table th { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; }
          .vis-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
          .vis-table td code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #ef4444; }

          /* ── Modal styles ── */
          .vis-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .vis-modal { background: #fff; border-radius: 14px; width: 440px; max-width: 95vw; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; }
          .vis-modal-wide { width: 560px; }
          .vis-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 14px; border-bottom: 1px solid #e2e8f0; }
          .vis-modal-header h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #1e293b; }
          .vis-modal-close { background: none; border: none; font-size: 1rem; color: #94a3b8; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
          .vis-modal-close:hover { background: #f1f5f9; color: #475569; }
          .vis-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; max-height: 60vh; overflow-y: auto; }
          .vis-modal-footer { padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; }
          .vis-form-group { display: flex; flex-direction: column; gap: 5px; }
          .vis-form-group label { font-size: 0.78rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; }
          .vis-input { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 0.875rem; color: #1e293b; background: #f8fafc; outline: none; transition: border-color 0.15s; }
          .vis-input:focus { border-color: #6366f1; background: #fff; }
          .vis-btn-primary { padding: 8px 18px; background: #6366f1; color: #fff; border: none; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
          .vis-btn-primary:hover:not(:disabled) { background: #4f46e5; }
          .vis-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
          .vis-btn-secondary { padding: 8px 18px; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
          .vis-btn-secondary:hover { background: #e2e8f0; }
          .vis-empty-msg { color: #94a3b8; font-size: 0.875rem; text-align: center; padding: 20px 0; margin: 0; }
          .vis-timeline { display: flex; flex-direction: column; gap: 0; }
          .vis-timeline-entry { display: flex; gap: 14px; position: relative; padding-bottom: 18px; }
          .vis-timeline-entry:last-child { padding-bottom: 0; }
          .vis-timeline-entry:not(:last-child)::before { content: ''; position: absolute; left: 7px; top: 16px; bottom: 0; width: 2px; background: #e2e8f0; }
          .vis-timeline-dot { width: 16px; height: 16px; border-radius: 50%; background: #6366f1; flex-shrink: 0; margin-top: 2px; border: 2px solid #fff; box-shadow: 0 0 0 2px #6366f1; }
          .vis-timeline-content { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
          .vis-timeline-time { font-size: 0.72rem; color: #94a3b8; margin-bottom: 8px; }
          .vis-timeline-stats { display: flex; gap: 20px; flex-wrap: wrap; }
          .vis-tstat { display: flex; flex-direction: column; gap: 2px; }
          .vis-tstat-label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
          .vis-tstat-val { font-size: 0.85rem; font-weight: 600; color: #334155; }
          .vis-tstat-val.locked { color: #10b981; }
          .vis-tstat-val.pending { color: #f59e0b; }
          .vis-tstat-val.error, .vis-tstat-val.failed { color: #ef4444; }
        `}</style>
    </WorkspaceShell>
  );
};

export default VisualWorkspace;
