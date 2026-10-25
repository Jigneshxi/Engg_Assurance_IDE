/**
 * ================================================================================
 * SeQuor AGENT MESH — EVENT-DRIVEN ARCHITECTURE SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface EventDrivenWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const EventDrivenWorkspace: React.FC<EventDrivenWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'queues' | 'deadletter' | 'latency'>('queues');

  const liveQueues = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.queues || parsed.topics || parsed.brokers || parsed.streams || (Array.isArray(parsed) ? parsed : null);
      if (arr && Array.isArray(arr)) {
        return arr.map((t: any, i: number) => ({
          name: t.name || t.topic || `Topic-${i+1}`,
          rps: String(t.rps || t.throughput || '—'),
          lag: t.lag || '—',
          val: t.val || t.validation || t.status || 'ok'
        }));
      }
    } catch { return null; }
    return null;
  }, [telemetry]);

  const defaultQueues = [
    { name: 'orders.verified', rps: '120', lag: '2 msg', val: 'ok' },
    { name: 'payment.processed', rps: '45', lag: '0 msg', val: 'ok' },
    { name: 'email.outbound', rps: '300', lag: '142 msg', val: 'warn' },
  ];

  const displayQueues = liveQueues || defaultQueues;

  const TABS = [
    { id: 'queues',     label: 'Active Topics',      icon: 'ti-bolt' },
    { id: 'deadletter', label: 'Dead Letter Queue',  icon: 'ti-trash' },
    { id: 'latency',    label: 'Msg Latency',        icon: 'ti-timer' },
  ];

  return (
    <WorkspaceShell
      nodeKey="event_driven"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="ed-content">
          {activeTab === 'queues' && (
            <div className="ed-queues-panel">
              <div className="ed-section-header">
                <h3>Message Hub (Kafka/SQS)</h3>
                <div className="ed-status-ready">Broker Online</div>
              </div>
              <div className="ed-grid header">
                <span>Topic Name</span>
                <span>Inbound RPS</span>
                <span>Lag</span>
                <span>Validation</span>
              </div>
              {displayQueues.map((t: any, i: number) => (
                <div key={i} className="ed-grid row">
                  <span className="ed-name">{t.name}</span>
                  <span className="ed-val">{t.rps} msg/s</span>
                  <span className={`ed-lag ${parseInt(t.lag) > 50 ? 'bad' : 'ok'}`}>{t.lag}</span>
                  <span className={`ed-val-pill ${String(t.val).toLowerCase()}`}>{String(t.val).toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'deadletter' && (
            <div className="ed-dlq-panel">
              <div className="dlq-header">
                <i className="ti-alert"></i>
                <div>
                  <h5>Poison Message Detection</h5>
                  <p>Agent #31 identified <strong>3 failures</strong> due to schema mismatch in the last 10m.</p>
                </div>
              </div>
              <div className="dlq-inspector">
                <div className="msg-preview">
                  <div className="label">Message ID: <code>msg_8bfc2...</code></div>
                  <pre className="msg-payload">
{`{
  "order_id": null,
  "status": "fail",
  "error": "constraint_failed"
}`}
                  </pre>
                </div>
                <button className="re-drive-btn">Re-drive to Main</button>
              </div>
            </div>
          )}

          {activeTab === 'latency' && (
            <div className="ed-latency-view">
              <div className="ed-stat-box">
                <span className="label">Producer-to-Broker</span>
                <span className="val">14ms</span>
              </div>
              <div className="ed-stat-box">
                <span className="label">Broker-to-Consumer</span>
                <span className="val">85ms</span>
              </div>
              <div className="ed-stat-box">
                <span className="label">Consumer-Acknowledge</span>
                <span className="val">20ms</span>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .ed-content { flex: 1; padding: 10px 0; }
          .ed-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .ed-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .ed-status-ready { font-size: 0.75rem; font-weight: 700; color: #10b981; text-transform: uppercase; }
          .ed-grid { display: grid; grid-template-columns: 1fr 100px 100px 100px; gap: 15px; align-items: center; padding: 12px; }
          .ed-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .ed-grid.row { border-bottom: 1px solid #f1f5f9; }
          .ed-name { font-family: monospace; font-size: 0.85rem; font-weight: 600; color: #1e293b; }
          .ed-val { font-size: 0.8rem; color: #64748b; }
          .ed-lag.bad { color: #ef4444; font-weight: 800; }
          .ed-val-pill { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-align: center; }
          .ed-val-pill.ok { background: #dcfce7; color: #15803d; }
          .ed-val-pill.warn { background: #fef3c7; color: #92400e; }
          .ed-dlq-panel { display: flex; flex-direction: column; gap: 20px; }
          .dlq-header { display: flex; gap: 15px; padding: 15px; border-radius: 12px; border: 1px solid #fee2e2; background: #fef2f2; align-items: center; }
          .dlq-header i { font-size: 2rem; color: #ef4444; }
          .dlq-header h5 { margin: 0; color: #b91c1c; font-size: 0.95rem; }
          .dlq-header p { margin: 2px 0 0; color: #ef4444; font-size: 0.8rem; }
          .dlq-inspector { background: #0f172a; border-radius: 12px; padding: 20px; }
          .msg-preview { margin-bottom: 15px; }
          .msg-preview .label { font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
          .msg-payload { margin: 0; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #10b981; }
          .re-drive-btn { padding: 8px 15px; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
          .ed-latency-view { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
          .ed-stat-box { background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; text-align: center; }
          .ed-stat-box .label { display: block; font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
          .ed-stat-box .val { font-size: 1.2rem; font-weight: 800; color: #1e293b; }
        `}</style>
    </WorkspaceShell>
  );
};

export default EventDrivenWorkspace;
