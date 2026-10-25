/**
 * ================================================================================
 * SeQuor AGENT MESH — ENV PROVISIONER SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface EnvProvisionerWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const EnvProvisionerWorkspace: React.FC<EnvProvisionerWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'infra' | 'docker' | 'k8s'>('infra');

  const liveInfra = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const raw = parsed.yaml ?? parsed.infra ?? parsed.docker_compose ?? parsed.k8s ?? parsed.code ?? null;
      if (raw === null) return null;
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    } catch { return null; }
  }, [telemetry]);

  const liveContainers = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.containers ?? parsed.docker ?? parsed.services ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((c: any) => ({
        name: c.name ?? c.image ?? null,
        status: c.status ?? c.port ?? null,
        load: c.load ?? c.cpu ?? null,
      }));
    } catch { return null; }
  }, [telemetry]);

  const liveK8s = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const k = parsed.k8s ?? parsed.kubernetes ?? parsed.cluster ?? null;
      if (!k || typeof k !== 'object') return null;
      const pods = k.pods ?? k.nodes ?? null;
      return {
        cluster: k.cluster_name ?? k.name ?? null,
        scaling: k.scaling_factor ?? null,
        utilization: k.utilization ?? null,
        pods: Array.isArray(pods) ? pods : null,
      };
    } catch { return null; }
  }, [telemetry]);

  const ttlBadge = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.ttl ?? parsed.time_to_live ?? null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'infra',  label: 'Infrastructure YAML', icon: 'ti-cloud' },
    { id: 'docker', label: 'Container Mesh',       icon: 'ti-package' },
    { id: 'k8s',    label: 'K8s Cluster Hub',      icon: 'ti-layout-grid2' },
  ];

  return (
    <WorkspaceShell
      nodeKey="env_provisioner"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ep-content">
          {activeTab === 'infra' && (
            <div className="ep-infra-panel">
              <div className="ep-section-header">
                <h3>Ephemeral Environment Blueprint</h3>
                {ttlBadge !== null && <div className="ep-ttl-badge">TTL: {ttlBadge}</div>}
              </div>
              {liveInfra ? (
                <>
                  <pre className="ep-code">{liveInfra}</pre>
                  <div className="ep-blueprint-actions">
                    <button className="ep-btn-dl">Download YAML</button>
                    <button className="ep-btn-exec">Spin Up Instance</button>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState message="Provision an Environment to generate infrastructure YAML" icon="ti-cloud" />
              )}
            </div>
          )}

          {activeTab === 'docker' && (
            <div className="ep-docker-list">
              {liveContainers ? (
                liveContainers.map((c, idx) => (
                  <div key={idx} className="docker-item active">
                    <i className="ti-package"></i>
                    <div className="info">
                      <span className="name">{c.name ?? '—'}</span>
                      <span className="status">{c.status ?? '—'}</span>
                    </div>
                    {c.load !== null && c.load !== undefined && (
                      <div className="meter">
                        <div className="fill" style={{ width: `${Math.min(100, parseInt(String(c.load)) || 0)}%` }}></div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <WorkspaceEmptyState message="Provision an Environment to populate container mesh" icon="ti-package" />
              )}
            </div>
          )}

          {activeTab === 'k8s' && (
            <div className="ep-k8s-viz">
              {liveK8s ? (
                <>
                  {liveK8s.pods && (
                    <div className="k8s-cluster">
                      {liveK8s.pods.map((pod: any, i: number) => (
                        <div key={i} className={`pod ${String(pod.status ?? pod ?? '').toLowerCase() === 'recycling' ? 'warn' : 'ok'}`}>
                          {typeof pod === 'string' ? pod : (pod.name ?? `Pod-${i + 1}`)}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="k8s-overlay">
                    {liveK8s.cluster && <h5>Kubernetes Node-Pool: <code>{liveK8s.cluster}</code></h5>}
                    {(liveK8s.scaling !== null || liveK8s.utilization !== null) && (
                      <p>
                        {liveK8s.scaling !== null && <>Scaling factor: <strong>{liveK8s.scaling}</strong>. </>}
                        {liveK8s.utilization !== null && <>Current utilization: <strong>{liveK8s.utilization}</strong>.</>}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState message="Provision an Environment to populate K8s cluster data" icon="ti-layout-grid2" />
              )}
            </div>
          )}
        </div>

        <style>{`
          .ep-content { flex: 1; padding: 10px 0; }
          .ep-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .ep-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ep-ttl-badge { font-size: 0.7rem; font-weight: 800; color: #f97316; background: rgba(249, 115, 22, 0.1); padding: 2px 10px; border-radius: 4px; border: 1px solid rgba(249, 115, 22, 0.2); }
          .ep-code { background: #0f172a; padding: 20px; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #38bdf8; overflow-x: auto; margin-bottom: 20px; white-space: pre-wrap; word-break: break-word; }
          .ep-blueprint-actions { display: flex; gap: 15px; }
          .ep-btn-dl, .ep-btn-exec { padding: 8px 15px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
          .ep-btn-dl { background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b; }
          .ep-btn-exec { background: #6366f1; border: none; color: #fff; }
          .ep-btn-exec:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
          .ep-docker-list { display: flex; flex-direction: column; gap: 12px; }
          .docker-item { padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; display: flex; align-items: center; gap: 15px; }
          .docker-item i { font-size: 1.5rem; color: #6366f1; }
          .docker-item .info { flex: 1; display: flex; flex-direction: column; }
          .docker-item .name { font-size: 0.85rem; font-weight: 700; color: #1e293b; }
          .docker-item .status { font-size: 0.75rem; color: #94a3b8; }
          .docker-item .meter { height: 4px; width: 60px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
          .docker-item .meter .fill { height: 100%; background: #10b981; }
          .ep-k8s-viz { background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .k8s-cluster { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .pod { padding: 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; text-align: center; color: #fff; }
          .pod.ok { background: #10b981; }
          .pod.warn { background: #f59e0b; animation: ep-pulse 1s infinite; }
          @keyframes ep-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          .k8s-overlay h5 { margin: 0 0 5px; color: #1e293b; font-size: 0.9rem; }
          .k8s-overlay p { margin: 0; color: #64748b; font-size: 0.8rem; }
        `}</style>
    </WorkspaceShell>
  );
};

export default EnvProvisionerWorkspace;
