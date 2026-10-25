/**
 * ================================================================================
 * SeQuor AGENT MESH — TEST SUITE OPTIMIZATION SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface SuiteOptimizationWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const SuiteOptimizationWorkspace: React.FC<SuiteOptimizationWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'pruning' | 'sharding' | 'coverage'>('pruning');

  const livePruning = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.pruning || parsed.overlap || parsed.optimization || (Array.isArray(parsed) ? parsed : null);
      if (arr && Array.isArray(arr)) {
        return arr.map((p: any) => ({
          name: p.name || p.cluster || 'Scenario Cluster',
          overlap: p.overlap || p.ratio || '0%',
          rec: p.rec || p.recommendation || 'No optimization needed.'
        }));
      }
    } catch { return null; }
    return null;
  }, [telemetry]);

  const defaultPruning = [
    { name: 'Login Validation', overlap: '85%', rec: 'Consolidate into 1 atomic test' },
    { name: 'Cart CRUD', overlap: '40%', rec: 'Keep as-is' },
    { name: 'Search Filters', overlap: '72%', rec: 'Move to API-only validation' },
  ];

  const displayPruning = livePruning || defaultPruning;

  const TABS = [
    { id: 'pruning',  label: 'Path Pruning',     icon: 'ti-cut' },
    { id: 'sharding', label: 'Async Sharding',   icon: 'ti-layers' },
    { id: 'coverage', label: 'Efficiency Score', icon: 'ti-pie-chart' },
  ];

  return (
    <WorkspaceShell
      nodeKey="suite_optimization"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="so-content">
          {activeTab === 'pruning' && (
            <div className="so-pruning-panel">
              <div className="so-section-header">
                <h3>Redundant Path Detection</h3>
                <div className="so-savings-badge">Estimated Savings: 22m</div>
              </div>
              <div className="so-pruning-grid header">
                <span>Scenario Cluster</span>
                <span>Overlap %</span>
                <span>Recommendation</span>
                <span>Action</span>
              </div>
              {displayPruning.map((row: any, i: number) => (
                <div key={i} className="so-grid row">
                  <span className="so-name">{row.name}</span>
                  <div className="so-overlap-bar">
                    <div className="fill" style={{ width: String(row.overlap) }}></div>
                    <span className="val">{row.overlap}</span>
                  </div>
                  <span className="so-rec">{row.rec}</span>
                  <button className="so-btn-prune">Optimize</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sharding' && (
            <div className="so-sharding-view">
              <div className="so-sharding-header">
                <h4>Dynamic Parallelism Strategy</h4>
                <p>Agent #38 recommends <strong>4 parallel shards</strong> across 2 k8s nodes based on current suite complexity.</p>
              </div>
              <div className="so-sharding-viz">
                <div className="shard-box active">Shard 1 (E2E)</div>
                <div className="shard-box active">Shard 2 (API)</div>
                <div className="shard-box active">Shard 3 (Security)</div>
                <div className="shard-box active">Shard 4 (Visual)</div>
              </div>
            </div>
          )}

          {activeTab === 'coverage' && (
            <div className="so-efficiency-dashboard">
              <div className="so-stat-card">
                <div className="label">Total Test Runtime</div>
                <div className="val">42m 12s</div>
              </div>
              <div className="so-stat-card">
                <div className="label">Post-Optimization</div>
                <div className="val ok">18m 45s</div>
              </div>
              <div className="so-stat-card">
                <div className="label">Mesh Utility Score</div>
                <div className="val">88%</div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .so-content { flex: 1; padding: 10px 0; }
          .so-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .so-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .so-savings-badge { font-size: 0.75rem; font-weight: 700; color: #6366f1; background: rgba(99, 102, 241, 0.1); padding: 4px 12px; border-radius: 20px; }
          .so-grid { display: grid; grid-template-columns: 1fr 120px 1fr 100px; gap: 15px; align-items: center; padding: 12px; }
          .so-pruning-grid { display: grid; grid-template-columns: 1fr 120px 1fr 100px; gap: 15px; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .so-grid.row { border-bottom: 1px solid #f1f5f9; }
          .so-name { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
          .so-rec { font-size: 0.8rem; color: #64748b; font-weight: 500; }
          .so-overlap-bar { height: 16px; background: #f1f5f9; border-radius: 8px; position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
          .so-overlap-bar .fill { height: 100%; background: #6366f1; border-radius: 8px; }
          .so-overlap-bar .val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #1e293b; mix-blend-mode: multiply; }
          .so-btn-prune { padding: 4px 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.75rem; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s; }
          .so-btn-prune:hover { background: #6366f1; color: #fff; border-color: #6366f1; }
          .so-sharding-view { background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .so-sharding-header h4 { margin: 0 0 5px; color: #1e293b; font-size: 0.95rem; }
          .so-sharding-header p { margin: 0 0 20px; color: #64748b; font-size: 0.85rem; line-height: 1.4; }
          .so-sharding-viz { display: flex; gap: 15px; justify-content: space-between; }
          .shard-box { flex: 1; padding: 15px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 8px; font-size: 0.8rem; font-weight: 700; text-align: center; color: #94a3b8; }
          .shard-box.active { border-color: #6366f1; color: #6366f1; background: rgba(99, 102, 241, 0.05); border-style: solid; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.1); }
          .so-efficiency-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
          .so-stat-card { background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; }
          .so-stat-card .label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px; }
          .so-stat-card .val { font-size: 1.5rem; font-weight: 800; color: #1e293b; }
          .so-stat-card .val.ok { color: #10b981; }
        `}</style>
    </WorkspaceShell>
  );
};

export default SuiteOptimizationWorkspace;
