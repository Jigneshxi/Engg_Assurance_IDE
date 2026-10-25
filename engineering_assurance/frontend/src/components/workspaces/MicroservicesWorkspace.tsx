/**
 * ================================================================================
 * SeQuor AGENT MESH — MICROSERVICES SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface MicroservicesWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const MicroservicesWorkspace: React.FC<MicroservicesWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'tracing' | 'mesh' | 'mtls'>('tracing');

  const liveTracing = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.traces ?? parsed.spans ?? parsed.tracing ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((s: any) => ({
        name: s.name ?? s.service ?? null,
        dur: s.duration ?? s.time ?? null,
        offset: s.offset ?? null,
        width: s.width ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveMesh = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const nodes = parsed.mesh_nodes ?? parsed.services ?? parsed.topology ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      return nodes;
    } catch { return null; }
  }, [telemetry]);

  const liveMtls = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.mtls ?? parsed.certificates ?? parsed.identity ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((c: any) => ({
        title: c.title ?? c.name ?? null,
        description: c.description ?? c.detail ?? null,
        status: c.status ?? 'pass',
      }));
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'mesh',    label: 'Istio Service Mesh',   icon: 'ti-share' },
    { id: 'tracing', label: 'Distributed Tracing',  icon: 'ti-pulse' },
    { id: 'mtls',    label: 'mTLS Compliance',       icon: 'ti-lock' },
  ];

  return (
    <WorkspaceShell
      nodeKey="microservices"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ms-content">
          {activeTab === 'mesh' && (
            <div className="ms-mesh-panel">
              <div className="ms-section-header">
                <h3>Service-to-Service Topology</h3>
                <div className="ms-envoy-badge">Sidecar Proxy: 1.15.x</div>
              </div>
              {liveMesh ? (
                <div className="ms-viz-box">
                  {liveMesh.map((node: any, i: number) => (
                    <React.Fragment key={i}>
                      <div className={`svc node-${(i % 3) + 1}`}>
                        {typeof node === 'string' ? node : (node.name ?? node.service ?? '—')}
                      </div>
                      {i < liveMesh.length - 1 && (
                        <div className={`line l${(i % 2) + 1}`}>
                          <span>{node.connection ?? 'mTLS'}</span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Audit the Microservices Mesh to populate topology data" icon="ti-share" />
              )}
            </div>
          )}

          {activeTab === 'tracing' && (
            <div className="ms-tracing-view">
              <div className="ms-tracing-header"><h5>Distributed Trace View</h5></div>
              {liveTracing ? (
                <div className="tracing-timeline">
                  {liveTracing.map((s, i) => (
                    <div key={i} className={`span s${(i % 3) + 1}`}>
                      <span>{s.name ?? '—'}{s.dur ? ` (${s.dur})` : ''}</span>
                      <div className="bar" style={{ width: s.width ?? `${Math.min(90, 15 + i * 20)}%`, marginLeft: s.offset ?? `${i * 10}%` }}></div>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState message="Audit the Microservices Mesh to populate trace data" icon="ti-pulse" />
              )}
            </div>
          )}

          {activeTab === 'mtls' && (
            <div className="ms-mtls-panel">
              {liveMtls ? (
                liveMtls.map((c, idx) => (
                  <div key={idx} className={`ms-mtls-card ${String(c.status ?? '').toLowerCase() === 'warn' ? 'warn' : 'pass'}`}>
                    <i className={String(c.status ?? '').toLowerCase() === 'warn' ? 'ti-alert' : 'ti-shield'}></i>
                    <div className="info">
                      <h5>{c.title ?? '—'}</h5>
                      <p>{c.description ?? '—'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Audit the Microservices Mesh to populate mTLS data" icon="ti-lock" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .ms-content { flex: 1; padding: 10px 0; }
          .ms-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ms-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ms-envoy-badge { font-size: 0.7rem; font-weight: 800; color: #6366f1; background: rgba(99, 102, 241, 0.1); padding: 2px 10px; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.2); }
          .ms-viz-box { background: #0f172a; border-radius: 12px; padding: 40px; position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; overflow: hidden; }
          .svc { background: #1e293b; border: 1px solid #334155; padding: 10px 20px; border-radius: 8px; color: #fff; font-size: 0.8rem; font-weight: 700; min-width: 120px; text-align: center; z-index: 5; }
          .svc.node-2 { background: #6366f1; border-color: #818cf8; }
          .line { width: 2px; height: 30px; background: #6366f1; position: relative; display: flex; align-items: center; }
          .line span { position: absolute; left: 10px; font-size: 0.65rem; color: #6366f1; font-weight: 800; text-transform: uppercase; }
          .ms-tracing-view { background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .ms-tracing-header { display: flex; justify-content: space-between; margin-bottom: 25px; }
          .ms-tracing-header h5 { margin: 0; font-size: 0.95rem; color: #1e293b; }
          .tracing-timeline { display: flex; flex-direction: column; gap: 15px; }
          .span { display: flex; flex-direction: column; gap: 5px; }
          .span span { font-size: 0.75rem; color: #64748b; font-weight: 600; }
          .span .bar { height: 8px; background: #cbd5e1; border-radius: 4px; }
          .s1 .bar { background: #6366f1; }
          .s2 .bar { background: #818cf8; }
          .s3 .bar { background: #c7d2fe; }
          .ms-mtls-panel { display: flex; flex-direction: column; gap: 15px; }
          .ms-mtls-card { padding: 15px; border-radius: 10px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
          .ms-mtls-card.pass { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
          .ms-mtls-card.warn { background: #fffbeb; border-color: #fef3c7; color: #92400e; }
          .ms-mtls-card i { font-size: 1.5rem; }
          .ms-mtls-card h5 { margin: 0 0 4px; font-size: 0.95rem; }
          .ms-mtls-card p { margin: 0; font-size: 0.8rem; font-family: monospace; }
        `}</style>
    </WorkspaceShell>
  );
};

export default MicroservicesWorkspace;
