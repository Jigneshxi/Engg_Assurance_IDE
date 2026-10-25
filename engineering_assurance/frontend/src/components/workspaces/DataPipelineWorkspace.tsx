/**
 * ================================================================================
 * SeQuor AGENT MESH — DATA PIPELINE & PERFORMANCE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface DataPipelineWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const DataPipelineWorkspace: React.FC<DataPipelineWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'integrity' | 'latency' | 'io'>('integrity');

  const liveIntegrity = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.integrity || parsed.checks || parsed.audits || (Array.isArray(parsed) ? parsed : null);
      if (arr && Array.isArray(arr)) {
        return arr.map((c: any) => ({
          status: c.status || c.state || c.health || 'pass',
          title: c.title || c.name || c.check || 'Data Check',
          desc: c.desc || c.description || c.message || 'Audited pipeline throughput and schema matching.'
        }));
      }
    } catch { return null; }
    return null;
  }, [telemetry]);

  const liveLatency = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.latency || parsed.performance || parsed.throughput || null;
    } catch { return null; }
  }, [telemetry]);

  const liveIO = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.io || parsed.resource_usage || parsed.db_profile || null;
    } catch { return null; }
  }, [telemetry]);

  const TABS = [
    { id: 'latency',   label: 'ETL Latency',    icon: 'ti-timer' },
    { id: 'integrity', label: 'Data Integrity', icon: 'ti-check-box' },
    { id: 'io',        label: 'DB I/O Profiler', icon: 'ti-harddrives' },
  ];

  return (
    <WorkspaceShell
      nodeKey="data_pipeline"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="dp-content">
          {activeTab === 'latency' && (
            <div className="dp-latency-panel">
              <div className="dp-section-header">
                <h3>Pipeline Throughput ({liveLatency ? 'Live Telemetry' : 'Baseline Profile'})</h3>
                <div className="dp-status-ok">● healthy</div>
              </div>
              <div className="dp-pipeline-viz">
                <div className="dp-node">Kafka Inbound</div>
                <div className="dp-flow line-1"><span>{liveLatency?.inbound || '1.2s'}</span></div>
                <div className="dp-node process">Transformer</div>
                <div className="dp-flow line-2"><span>{liveLatency?.processing || '0.8s'}</span></div>
                <div className="dp-node sink">PostgreSQL</div>
                <div className="latency-stats">
                  <div className="s"><span>P95 End-to-End</span><strong>{liveLatency?.p95 || '2.4s'}</strong></div>
                  <div className="s"><span>Queue Backlog</span><strong>{liveLatency?.backlog || '142 msg'}</strong></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrity' && (
            <div className="dp-integrity-list">
              {liveIntegrity ? liveIntegrity.map((c: any, i: number) => (
                <div key={i} className={`integrity-card ${String(c.status).toLowerCase()}`}>
                  <i className={c.status === 'pass' ? 'ti-check' : 'ti-alert'}></i>
                  <div className="info">
                    <h5>{c.title}</h5>
                    <p>{c.desc}</p>
                  </div>
                </div>
              )) : (
                <WorkspaceEmptyState message="Validate Pipeline to populate integrity checks" icon="ti-check-box" />
              )}
            </div>
          )}

          {activeTab === 'io' && (
            <div className="dp-io-dashboard">
              <div className="io-meter">
                <label>Database Read IOPS</label>
                <div className="progress-bg"><div className="fill" style={{ width: liveIO?.read_pct || '65%' }}></div></div>
                <div className="val">{liveIO?.read_iops || '8,421'} / {liveIO?.read_cap || '12,000'}</div>
              </div>
              <div className="io-meter">
                <label>Write Latency (Commit)</label>
                <div className="progress-bg"><div className="fill" style={{ width: liveIO?.write_pct || '22%' }}></div></div>
                <div className="val">{liveIO?.write_latency || '14ms'} average</div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .dp-content { flex: 1; padding: 10px 0; }
          .dp-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .dp-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .dp-status-ok { font-size: 0.75rem; font-weight: 700; color: #10b981; text-transform: uppercase; }
          .dp-pipeline-viz { background: #0f172a; padding: 40px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 15px; position: relative; }
          .dp-node { background: #1e293b; border: 1px solid #334155; padding: 10px 20px; border-radius: 8px; color: #fff; font-size: 0.85rem; font-weight: 700; min-width: 140px; text-align: center; }
          .dp-node.process { border-color: #6366f1; }
          .dp-node.sink { border-color: #10b981; }
          .dp-flow { width: 2px; height: 40px; background: rgba(255,255,255,0.1); position: relative; }
          .dp-flow span { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.7rem; color: #94a3b8; font-weight: 800; }
          .dp-flow::after { content: ''; position: absolute; bottom: 0; left: -4px; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid rgba(255,255,255,0.1); }
          .latency-stats { position: absolute; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; }
          .latency-stats .s { background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 2px; }
          .latency-stats .s span { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
          .latency-stats .s strong { font-size: 1rem; color: #fff; font-weight: 800; }
          .dp-integrity-list { display: flex; flex-direction: column; gap: 15px; }
          .integrity-card { padding: 15px; border-radius: 10px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
          .integrity-card.pass { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
          .integrity-card.warn { background: #fffbeb; border-color: #fef3c7; color: #92400e; }
          .integrity-card i { font-size: 1.5rem; }
          .integrity-card h5 { margin: 0 0 4px; font-size: 0.95rem; }
          .integrity-card p { margin: 0; font-size: 0.85rem; opacity: 0.8; }
          .dp-io-dashboard { display: flex; flex-direction: column; gap: 20px; background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .io-meter label { display: block; font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
          .progress-bg { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin-bottom: 6px; }
          .progress-bg .fill { height: 100%; background: #6366f1; border-radius: 5px; }
          .io-meter .val { font-size: 0.85rem; font-weight: 700; color: #334155; text-align: right; }
        `}</style>
    </WorkspaceShell>
  );
};

export default DataPipelineWorkspace;
