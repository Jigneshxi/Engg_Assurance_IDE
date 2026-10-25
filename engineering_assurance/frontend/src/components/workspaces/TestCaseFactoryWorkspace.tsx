/**
 * ================================================================================
 * SeQuor AGENT MESH — TEST CASE FACTORY SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

interface TestCaseFactoryWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const TestCaseFactoryWorkspace: React.FC<TestCaseFactoryWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'consensus' | 'synthesis' | 'assets'>('synthesis');
  const standaloneLocked = !useStandaloneInvokeEnabled();

  const liveSynthesis = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      return parsed.synthesis || parsed.reasoning || parsed.contract || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
    } catch { return String(telemetry); }
  }, [telemetry]);

  return (
    <div className="tf-workspace animate-fadeIn">
      <div className="tf-tab-bar">
        <button className={activeTab === 'consensus' ? 'active' : ''} onClick={() => setActiveTab('consensus')}>
           <i className="ti-layout-grid3"></i> Mesh Consensus
        </button>
        <button className={activeTab === 'synthesis' ? 'active' : ''} onClick={() => setActiveTab('synthesis')}>
           <i className="ti-infinite"></i> Synthesis Core
        </button>
        <button className={activeTab === 'assets' ? 'active' : ''} onClick={() => setActiveTab('assets')}>
           <i className="ti-package"></i> Primary Assets
        </button>
      </div>

      <div className="tf-content">
        {activeTab === 'consensus' && (
          <div className="tf-consensus-panel">
            <div className="tf-section-header">
              <h3>Agent Mesh Synchronization</h3>
              <div className="tf-sync-badge">
                {liveSynthesis?.intelligence_metrics ? 'Mesh Synced' : 'Awaiting Synthesis'}
              </div>
            </div>

            <div className="sync-map">
               {[
                 { label: 'Strategic Alignment', val: liveSynthesis?.intelligence_metrics?.strategic_alignment ?? null, color: '#10b981' },
                 { label: 'Technical Coverage',  val: liveSynthesis?.intelligence_metrics?.technical_coverage  ?? null, color: '#6366f1' },
                 { label: 'Risk Mitigation',     val: liveSynthesis?.intelligence_metrics?.risk_mitigation     ?? null, color: '#f59e0b' },
                 { label: 'Logic Consistency',   val: liveSynthesis?.intelligence_metrics?.logic_consistency   ?? null, color: '#8b5cf6' }
               ].map((m: any) => m.val !== null ? (
                 <div key={m.label} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                       <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>{m.label}</span>
                       <span style={{ fontSize: '0.75rem', fontWeight: 900, color: m.color }}>{m.val}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                       <div style={{ height: '100%', width: `${m.val}%`, background: m.color }}></div>
                    </div>
                 </div>
               ) : null)}

               {/* Empty state when no metrics available */}
               {!liveSynthesis?.intelligence_metrics && (
                 <div className="ws-empty-state" style={{ marginBottom: '16px' }}>
                   <i className="ti-signal" style={{ marginRight: '8px', opacity: 0.4 }}></i>
                   <span>Run a Phase 2 mission to populate mesh consensus metrics</span>
                 </div>
               )}
               
               {liveSynthesis?.intelligence_metrics?.critical_feedback && (
                 <div className="tf-audit-feedback" style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '8px', marginTop: '10px' }}>
                    <h5 style={{ fontSize: '0.7rem', color: '#be123c', textTransform: 'uppercase', margin: '0 0 6px', fontWeight: 900 }}>Critic Loop Feedback</h5>
                    <p style={{ fontSize: '0.75rem', color: '#9f1239', margin: 0 }}>{liveSynthesis.intelligence_metrics.critical_feedback}</p>
                 </div>
               )}
            </div>
            
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
               <p style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                 <i className="ti-info-alt" style={{ marginRight: '6px' }}></i>
                 The Test Case Factory acts as the final consensus node. It cross-references the strategic recommendations against the specialist mesh outputs to ensure zero leakage.
               </p>
            </div>
          </div>
        )}

        {activeTab === 'synthesis' && (
          <div className="tf-synthesis-panel">
             <div className="tf-synthesis-header">
                <i className="ti-infinite"></i>
                <div>
                   <h4>A.N.T. Synthesis Engine</h4>
                   <p>Consolidating reasoning from the specialist mesh</p>
                </div>
             </div>
             <div style={{ padding: '20px', background: '#fafafa', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                <pre style={{ margin: 0, fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
{liveSynthesis ? liveSynthesis : `{{ mission_contract }}
{{ agent_consensuses }}

[INSTRUCTION]: Transform the collective reasoning of the A.N.T. mesh into a high-fidelity test case manifest. Ensure strict requirement traceability and cross-node mapping.

[OUTPUT_FORMAT]: JSON { test_cases, risk_matrix, metrics }`}
                </pre>
             </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="tf-assets-grid">
             <div className="asset-card">
                <i className="ti-file"></i>
                <div>
                   <h5>Consolidated Strategy</h5>
                   <p>Comprehensive IEEE-829 alignment</p>
                </div>
                <div className="status-dot"></div>
             </div>
             <div className="asset-card">
                <i className="ti-layout-list-thumb"></i>
                <div>
                   <h5>Traceability Matrix</h5>
                   <p>User Story to Node linkage</p>
                </div>
                <div className="status-dot"></div>
             </div>
             <div className="asset-card">
                <i className="ti-alert"></i>
                <div>
                   <h5>Risk Heatmap</h5>
                   <p>Critical hotspot mitigation</p>
                </div>
                <div className="status-dot"></div>
             </div>
          </div>
        )}
      </div>

      <div className="tf-footer">
         <div className="tf-footer-left">
            <i className="ti-package"></i>
            <span>The Factory is configured for <strong>Aggressive Synthesis</strong> mode.</span>
         </div>
         <button 
           className="btn-primary highlight" 
           onClick={() => onInvoke('Execute full mesh synthesis and final artifact composition.')}
           disabled={loading || standaloneLocked}
         >
           {loading ? <i className="ti-reload spin-animation"></i> : <i className="ti-package"></i>}
           {loading ? ' Synthesizing...' : ' Trigger Mesh Synthesis'}
         </button>
      </div>

      <style>{`
        .tf-workspace { display: flex; flex-direction: column; gap: 0; min-height: 500px; }
        .tf-tab-bar { display: flex; gap: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 0; margin-bottom: 20px; }
        .tf-tab-bar button { background: none; border: none; padding: 10px 20px; font-size: 0.9rem; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .tf-tab-bar button:hover { color: #6366f1; }
        .tf-tab-bar button.active { color: #6366f1; border-bottom-color: #6366f1; }
        
        .tf-content { flex: 1; padding: 10px 0; }
        .tf-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .tf-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; weight: 700; }
        
        .tf-sync-badge { font-size: 0.75rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 12px; border-radius: 20px; }
        
        .tf-synthesis-header { padding: 15px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px 12px 0 0; display: flex; align-items: center; gap: 15px; }
        .tf-synthesis-header i { font-size: 1.8rem; color: #6366f1; }
        .tf-synthesis-header h4 { margin: 0; font-size: 1rem; color: #1e293b; }
        .tf-synthesis-header p { margin: 2px 0 0; font-size: 0.8rem; color: #64748b; }
        
        .tf-assets-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .asset-card { display: flex; align-items: center; gap: 15px; padding: 15px 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: white; transition: all 0.2s; position: relative; }
        .asset-card:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08); }
        .asset-card i { fontSize: 1.5rem; color: #6366f1; }
        .asset-card h5 { margin: 0; fontSize: 0.9rem; color: #1e293b; fontWeight: 700; }
        .asset-card p { margin: 2px 0 0; fontSize: 0.75rem; color: #64748b; }
        .asset-card .status-dot { position: absolute; right: 20px; width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
        
        .tf-footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .tf-footer-left { display: flex; alignItems: center; gap: 8px; fontSize: 0.8rem; color: #64748b; }
        .tf-footer-left i { color: #6366f1; }
      `}</style>
    </div>
  );
};

export default TestCaseFactoryWorkspace;
