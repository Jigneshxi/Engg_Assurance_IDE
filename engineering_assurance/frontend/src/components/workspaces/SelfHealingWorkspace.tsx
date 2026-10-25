/**
 * ================================================================================
 * SeQuor AGENT MESH - SELF-HEALING EVOLUTION SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';
import ResilienceInspector from '../ResilienceInspector';

interface SelfHealingWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const SelfHealingWorkspace: React.FC<SelfHealingWorkspaceProps> = ({ onInvoke, loading, telemetry, fullMeshState }) => {
  const [activeTab, setActiveTab] = useState<'resilience' | 'locators' | 'playground' | 'evolution'>('resilience');

  const liveLocators = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.locators ?? parsed.selectors ?? parsed.heals ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((l: any) => ({
        name: l.name ?? l.element ?? null,
        primary: l.primary ?? l.selector ?? null,
        fall: l.fall ?? l.alternatives ?? null,
        heals: l.heals ?? l.count ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveEvolution = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const e = parsed.evolution ?? parsed.stats ?? parsed;
      if (typeof e !== 'object' || Array.isArray(e)) return null;
      const mtth = e.mean_time_to_heal ?? e.mtth ?? null;
      const success = e.zero_touch_success ?? e.success_rate ?? null;
      const gain = e.framework_gain ?? e.time_gain ?? null;
      if (mtth === null && success === null && gain === null) return null;
      return { mtth, success, gain };
    } catch { return null; }
  }, [telemetry]);

  const armorBadge = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.stability ?? parsed.armor_percentage ?? parsed.self_healed_count ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'resilience', label: 'Resilience Inspector', icon: 'ti-anchor' },
    { id: 'locators',   label: 'Smart Locators',      icon: 'ti-target' },
    { id: 'playground', label: 'Adaptive Playground', icon: 'ti-game' },
    { id: 'evolution',  label: 'Healing Evolution',   icon: 'ti-stats-up' },
  ];

  return (
    <WorkspaceShell
      nodeKey="self_healing"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="sh-content">
          {activeTab === 'resilience' && (
            <ResilienceInspector
              taskId={fullMeshState?.task_id || null}
              demoMode={!fullMeshState}
              locatorData={telemetry?.elements ? telemetry : null}
            />
          )}

          {activeTab === 'locators' && (
            <div className="sh-locators-panel">
              <div className="sh-section-header">
                <h3>Resilient Selector Engine</h3>
                {armorBadge !== null && <div className="sh-armor-badge">{armorBadge}</div>}
              </div>
              {liveLocators ? (
                <>
                  <div className="sh-grid header">
                    <span>Element Description</span>
                    <span>Primary Selector</span>
                    <span>Probabilistic Fallbacks</span>
                    <span>Heal Count</span>
                  </div>
                  {liveLocators.map((row, i) => (
                    <div key={i} className="sh-grid row">
                      <span className="sh-name">{row.name ?? '-'}</span>
                      <code className="sh-code">{row.primary ?? '-'}</code>
                      <span className="sh-alt">{row.fall ?? '-'}</span>
                      <span className={`sh-count ${row.heals !== null && parseInt(String(row.heals)) > 5 ? 'active' : ''}`}>
                        {row.heals ?? '-'}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Armor Selectors to populate locator data" icon="ti-anchor" />
              )}
            </div>
          )}

          {activeTab === 'playground' && (
            <div className="sh-playground-panel">
              <div className="sh-sandbox">
                <div className="sh-browser-mock">
                  <div className="mock-header"><div className="dots"></div></div>
                  <div className="mock-body">
                    <div className="mock-element target">Target Element</div>
                  </div>
                </div>
                <div className="sh-sandbox-controls">
                  <h5>Simulate DOM Drift</h5>
                  <button>Randomize Classes</button>
                  <button>Shift Layer Depth</button>
                  <div className="sh-log">
                    <span>Invoke a standalone run to populate healing simulation data.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'evolution' && (
            <div className="sh-evolution-view">
              {liveEvolution ? (
                <div className="sh-stat-row">
                  {liveEvolution.mtth !== null && (
                    <div className="sh-stat">
                      <span className="label">Mean Time to Heal</span>
                      <span className="val">{liveEvolution.mtth}</span>
                    </div>
                  )}
                  {liveEvolution.success !== null && (
                    <div className="sh-stat">
                      <span className="label">Zero-Touch Success</span>
                      <span className="val">{liveEvolution.success}</span>
                    </div>
                  )}
                  {liveEvolution.gain !== null && (
                    <div className="sh-stat">
                      <span className="label">Framework Gain</span>
                      <span className="val">{liveEvolution.gain}</span>
                    </div>
                  )}
                </div>
              ) : (
                <WorkspaceEmptyState message="Armor Selectors to populate evolution metrics" icon="ti-stats-up" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .sh-content { flex: 1; padding: 10px 0; }
          .sh-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .sh-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .sh-armor-badge { font-size: 0.75rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 12px; border-radius: 20px; }
          .sh-grid { display: grid; grid-template-columns: 1fr 1fr 120px 80px; gap: 15px; align-items: center; padding: 12px; }
          .sh-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
          .sh-grid.row { border-bottom: 1px solid #f1f5f9; }
          .sh-name { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
          .sh-code { font-family: monospace; font-size: 0.8rem; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
          .sh-alt { font-size: 0.8rem; color: #64748b; font-weight: 600; }
          .sh-count { font-size: 0.8rem; font-weight: 800; color: #94a3b8; }
          .sh-count.active { color: #6366f1; }
          .sh-playground-panel { background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .sh-sandbox { display: grid; grid-template-columns: 1fr 240px; gap: 25px; }
          .sh-browser-mock { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; height: 250px; position: relative; }
          .mock-header { height: 25px; background: #f1f5f9; padding: 5px 10px; }
          .dots { width: 8px; height: 8px; background: #cbd5e1; border-radius: 50%; box-shadow: 12px 0 #cbd5e1, 24px 0 #cbd5e1; }
          .mock-body { padding: 20px; height: 100%; position: relative; }
          .mock-element { position: absolute; padding: 8px 12px; background: #6366f1; color: #fff; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
          .mock-element.target { top: 40%; left: 30%; }
          .sh-sandbox-controls h5 { margin: 0 0 15px; font-size: 0.9rem; color: #1e293b; }
          .sh-sandbox-controls button { width: 100%; padding: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #64748b; cursor: pointer; margin-bottom: 10px; }
          .sh-sandbox-controls button:hover { background: #f1f5f9; }
          .sh-log { height: 80px; background: #0f172a; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; }
          .sh-log span { font-size: 0.65rem; color: #94a3b8; font-family: monospace; }
          .sh-evolution-view { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 25px; }
          .sh-stat-row { display: flex; justify-content: space-between; gap: 20px; }
          .sh-stat { text-align: center; flex: 1; }
          .sh-stat .label { display: block; font-size: 0.7rem; color: #3b82f6; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
          .sh-stat .val { font-size: 1.4rem; font-weight: 800; color: #1e3a8a; }
        `}</style>
    </WorkspaceShell>
  );
};

export default SelfHealingWorkspace;
