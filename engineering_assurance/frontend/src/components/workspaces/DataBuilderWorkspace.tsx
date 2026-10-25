/**
 * ================================================================================
 * SeQuor AGENT MESH — DATA BUILDER SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface DataBuilderWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const DataBuilderWorkspace: React.FC<DataBuilderWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'schema' | 'preview' | 'governance'>('preview');

  const parsedData = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      return typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
    } catch { return telemetry; }
  }, [telemetry]);

  const liveRecords = React.useMemo(() => {
    if (!parsedData) return null;
    if (Array.isArray(parsedData)) return parsedData;
    if (parsedData.records && Array.isArray(parsedData.records)) return parsedData.records;
    if (parsedData.data && Array.isArray(parsedData.data)) return parsedData.data;
    if (typeof parsedData === 'object') return [parsedData];
    return null;
  }, [parsedData]);

  const liveSchema = React.useMemo(() => {
    if (!liveRecords || liveRecords.length === 0) return null;
    const firstRecord = liveRecords[0];
    if (typeof firstRecord !== 'object' || firstRecord === null) return null;
    return Object.keys(firstRecord).map(key => ({
      name: key,
      type: typeof firstRecord[key] === 'number' ? 'Decimal' : 'String',
      pii: key.toLowerCase().includes('name') || key.toLowerCase().includes('email') || key.toLowerCase().includes('id'),
      mask: key.toLowerCase().includes('pass') ? 'Full' : 'None',
    }));
  }, [liveRecords]);

  const liveHeaders = React.useMemo(() => liveSchema ? liveSchema.map(f => f.name) : [], [liveSchema]);

  const TABS = [
    { id: 'schema',     label: 'Schema Blueprint', icon: 'ti-layout-grid3' },
    { id: 'preview',    label: 'Data Preview',     icon: 'ti-eye' },
    { id: 'governance', label: 'PII Governance',   icon: 'ti-shield' },
  ];

  return (
    <WorkspaceShell
      nodeKey="data_builder"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="db-content">
          {activeTab === 'schema' && (
            <div className="db-schema-editor">
              <div className="db-section-header">
                <h3>Target Data Model</h3>
                {liveSchema && <button className="db-add-btn"><span>+</span> Add Field</button>}
              </div>
              {liveSchema ? (
                <>
                  <div className="db-field-grid header">
                    <span>Field Name</span>
                    <span>Generator Type</span>
                    <span>PII Label</span>
                    <span>Masking Strategy</span>
                    <span>Actions</span>
                  </div>
                  {liveSchema.map((field, idx) => (
                    <div key={idx} className="db-field-grid row">
                      <input type="text" value={field.name} readOnly className="db-field-input" />
                      <select defaultValue={field.type} className="db-field-select">
                        <option>UUID</option>
                        <option>String</option>
                        <option>Decimal</option>
                        <option>Email</option>
                        <option>Timestamp</option>
                      </select>
                      <div className={`db-pii-tag ${field.pii ? 'active' : ''}`}>{field.pii ? 'Sensitive' : 'Public'}</div>
                      <select defaultValue={field.mask} className="db-field-select">
                        <option>None</option>
                        <option>Partial</option>
                        <option>Full</option>
                        <option>Pattern</option>
                      </select>
                      <button className="db-row-btn">🗑</button>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState message="Synthesize a Dataset to populate the schema blueprint" icon="ti-layout-grid3" />
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="db-preview-panel">
              <div className="db-section-header">
                <h3>{liveRecords ? 'Live Synced Data Payload' : 'Data Preview'}</h3>
                {liveRecords && <span className="db-pulse-label">● Telemetry Linked</span>}
              </div>
              {liveRecords ? (
                <div style={{ overflowX: 'auto', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <table className="db-table" style={{ background: 'white' }}>
                    <thead>
                      <tr>
                        {liveHeaders.map((h: string) => (
                          <th key={h} style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#1e293b' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liveRecords.slice(0, 15).map((rec: any, idx: number) => (
                        <tr key={idx}>
                          {liveHeaders.map((h: string) => (
                            <td key={h} style={{ maxWidth: '200px', wordBreak: 'break-all', fontSize: '0.8rem' }}>
                              {typeof rec[h] === 'object' ? JSON.stringify(rec[h]) : String(rec[h] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <WorkspaceEmptyState message="Synthesize a Dataset to populate this data preview" icon="ti-eye" />
              )}
            </div>
          )}

          {activeTab === 'governance' && (
            <div className="db-gov-panel">
              <div className="db-gov-info">
                <i className="ti-blackboard" style={{ fontSize: '2rem', color: '#3b82f6' }}></i>
                <div>
                  <h4>GDPR / SOC2 Enforcement Layer</h4>
                  <p>The Data Builder agent #7 is currently configured to enforce <strong>AES-256 encryption</strong> on all generated PII fields. Synthesis is restricted to the "US-EAST-1" region.</p>
                </div>
              </div>
              <div className="db-gov-toggles">
                <div className="db-toggle-item">
                  <span>Enable Differential Privacy Noise</span>
                  <div className="pill-switch on"></div>
                </div>
                <div className="db-toggle-item">
                  <span>Auto-Purge After 24 Hours</span>
                  <div className="pill-switch on"></div>
                </div>
                <div className="db-toggle-item">
                  <span>Validate against OpenAPI Schema</span>
                  <div className="pill-switch off"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .db-content { flex: 1; padding: 10px 0; max-width: 100%; overflow: hidden; }
          .db-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .db-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; font-weight: 700; }
          .db-add-btn { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #475569; cursor: pointer; }
          .db-field-grid { display: grid; grid-template-columns: 1fr 1fr 100px 140px 60px; gap: 15px; align-items: center; padding: 12px; }
          .db-field-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .db-field-grid.row { border-bottom: 1px solid #f1f5f9; }
          .db-field-input { background: none; border: none; font-size: 0.9rem; color: #1e293b; font-weight: 500; width: 100%; outline: none; }
          .db-field-select { background: #fff; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; color: #334155; }
          .db-pii-tag { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: #f1f5f9; color: #64748b; text-align: center; }
          .db-pii-tag.active { background: #fee2e2; color: #ef4444; }
          .db-row-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1rem; }
          .db-row-btn:hover { color: #ef4444; }
          .db-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
          .db-table th { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; }
          .db-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
          .db-pulse-label { font-size: 0.75rem; color: #10b981; animation: blink 1.5s infinite; }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          .db-gov-info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 15px; display: flex; gap: 15px; margin-bottom: 25px; align-items: center; }
          .db-gov-toggles { display: flex; flex-direction: column; gap: 15px; }
          .db-toggle-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; color: #334155; }
          .pill-switch { width: 36px; height: 18px; border-radius: 20px; position: relative; cursor: pointer; transition: all 0.3s; }
          .pill-switch:after { content: ''; position: absolute; width:14px; height:14px; background: #fff; border-radius: 50%; top:2px; transition: all 0.3s; }
          .pill-switch.on { background: #10b981; }
          .pill-switch.on:after { left: 20px; }
          .pill-switch.off { background: #cbd5e1; }
          .pill-switch.off:after { left: 2px; }
        `}</style>
    </WorkspaceShell>
  );
};

export default DataBuilderWorkspace;
