/**
 * ================================================================================
 * SeQuor AGENT MESH — RUN ORCHESTRATOR SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface RunOrchestratorWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const RunOrchestratorWorkspace: React.FC<RunOrchestratorWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'shards' | 'retries' | 'cicd'>('shards');

  const liveShards = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.shards ?? parsed.workers ?? parsed.containers ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((s: any, i: number) => ({
        id: s.id ?? `SHARD-${i + 1}`,
        status: s.status ?? null,
        identity: s.identity ?? s.node ?? null,
        complexity: s.complexity ?? s.load ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveRetries = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.retry_policies ?? parsed.retries ?? parsed.policies ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((r: any) => ({
        title: r.title ?? r.name ?? null,
        description: r.description ?? r.detail ?? null,
        tier: r.tier ?? null,
        enabled: r.enabled ?? r.active ?? true,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveCicd = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const raw = parsed.cicd ?? parsed.workflow ?? parsed.pipeline ?? parsed.yaml ?? parsed.code ?? null;
      if (raw === null) return null;
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    } catch { return null; }
  }, [telemetry]);

  const concurrencyBadge = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.max_concurrent ?? parsed.concurrency ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'shards',  label: 'Execution Shards', icon: 'ti-layers' },
    { id: 'retries', label: 'Retry Policies',   icon: 'ti-reload' },
    { id: 'cicd',    label: 'CI/CD Pipeline',   icon: 'ti-infinite' },
  ];

  return (
    <WorkspaceShell
      nodeKey="run_orchestrator"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ro-content">
          {activeTab === 'shards' && (
            <div className="ro-shards-panel">
              <div className="ro-section-header">
                <h3>Agentic Load Distribution</h3>
                {concurrencyBadge !== null && <div className="ro-concurrency-badge">Max Concurrent: {concurrencyBadge}</div>}
              </div>
              {liveShards ? (
                <div className="ro-shards-grid">
                  {liveShards.map((s, i) => (
                    <div key={i} className="ro-shard-item">
                      <div className="shard-top">
                        <span className="shard-id">{s.id}</span>
                        {s.status && <span className="shard-status">{String(s.status).toUpperCase()}</span>}
                      </div>
                      {s.identity && (
                        <div className="shard-mid">
                          <div className="label">Runner Identity</div>
                          <div className="val">{s.identity}</div>
                        </div>
                      )}
                      {s.complexity && (
                        <div className="shard-bottom">
                          <div className="label">Complexity</div>
                          <div className="val bar">
                            <div className="fill" style={{ width: String(s.complexity) }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Initiate Orchestration to populate execution shards" icon="ti-layers" />
              )}
            </div>
          )}

          {activeTab === 'retries' && (
            <div className="ro-retries-list">
              {liveRetries ? (
                liveRetries.map((r, idx) => (
                  <div key={idx} className="retry-card">
                    <div className="header">
                      <h5>{r.title ?? '—'}</h5>
                      {r.tier && <div className="pill">{r.tier}</div>}
                    </div>
                    <p>{r.description ?? '—'}</p>
                    <div className={`toggle ${r.enabled ? 'on' : 'off'}`}></div>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Initiate Orchestration to populate retry policies" icon="ti-reload" />
              )}
            </div>
          )}

          {activeTab === 'cicd' && (
            <div className="ro-cicd-panel">
              <div className="ro-cicd-header">
                <i className="ti-infinite"></i>
                <div>
                  <h4>CI/CD Pipeline Configuration</h4>
                  <p>Maintained by the Orchestration Agent</p>
                </div>
              </div>
              {liveCicd ? (
                <pre className="ro-code">{liveCicd}</pre>
              ) : (
                <div style={{ margin: '20px' }}>
                  <WorkspaceEmptyState message="Initiate Orchestration to populate CI/CD pipeline" icon="ti-infinite" />
                </div>
              )}
            </div>
          )}
        </div>

        <style>{`
          .ro-content { flex: 1; padding: 10px 0; }
          .ro-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ro-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ro-concurrency-badge { font-size: 0.75rem; font-weight: 700; color: #6366f1; background: rgba(99, 102, 241, 0.1); padding: 4px 12px; border-radius: 20px; }
          .ro-shards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .ro-shard-item { padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; }
          .shard-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
          .shard-id { font-size: 0.8rem; font-weight: 800; color: #1e293b; }
          .shard-status { font-size: 0.6rem; font-weight: 700; background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; }
          .ro-shard-item .label { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
          .ro-shard-item .val { font-size: 0.85rem; font-weight: 600; color: #334155; }
          .ro-shard-item .val.bar { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-top: 5px; }
          .ro-shard-item .val.bar .fill { height: 100%; background: #6366f1; border-radius: 3px; }
          .ro-retries-list { display: flex; flex-direction: column; gap: 15px; }
          .retry-card { padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; position: relative; }
          .retry-card .header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
          .retry-card h5 { margin: 0; font-size: 0.9rem; color: #1e293b; }
          .retry-card .pill { font-size: 0.6rem; font-weight: 800; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #64748b; text-transform: uppercase; }
          .retry-card p { font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4; padding-right: 40px; }
          .retry-card .toggle { position: absolute; top: 15px; right: 15px; width: 30px; height: 16px; border-radius: 10px; }
          .retry-card .toggle.on { background: #10b981; }
          .retry-card .toggle.off { background: #cbd5e1; }
          .ro-cicd-panel { border-radius: 12px; background: #fafafa; border: 1px solid #e2e8f0; overflow: hidden; }
          .ro-cicd-header { padding: 15px; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; }
          .ro-cicd-header i { font-size: 2rem; color: #1e293b; }
          .ro-cicd-header h4 { margin: 0; font-size: 1rem; color: #1e293b; }
          .ro-cicd-header p { margin: 2px 0 0; font-size: 0.8rem; color: #64748b; }
          .ro-code { margin: 0; padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #1e293b; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
        `}</style>
    </WorkspaceShell>
  );
};

export default RunOrchestratorWorkspace;
