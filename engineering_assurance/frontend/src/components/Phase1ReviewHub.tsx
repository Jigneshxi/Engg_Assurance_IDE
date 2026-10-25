import React, { useState, useEffect } from 'react';
import { TestPlanPayload } from '../types';

interface Phase1ReviewHubProps {
  payload: TestPlanPayload | null;
  markdown: string;
  logs: any[];
  topology: any;
  loading: boolean;
  onApproveAndTriggerPhase2: (editedContext: string) => void;
  onBack: () => void;
}

const Phase1ReviewHub: React.FC<Phase1ReviewHubProps> = ({ payload, markdown, logs, topology, loading, onApproveAndTriggerPhase2, onBack }) => {
  const [editableMarkdown, setEditableMarkdown] = useState<string>('');
  
  // --- HITL SAFETY GATE ---
  // Derive contract health to gate the approval button intelligently
  const isContractEmpty = !editableMarkdown || editableMarkdown.trim().length < 50;
  const isContractErrored = (
    editableMarkdown.includes('FAILED') || 
    editableMarkdown.includes('## ❌') ||
    editableMarkdown.includes('Degraded Mode')
  );
  const isContractReady = !isContractEmpty && !isContractErrored;
  const hitlDisabled = loading || !isContractReady;

  // Sync the markdown prop to the editable state when it arrives
  useEffect(() => {
    if (markdown) {
      setEditableMarkdown(markdown);
    }
  }, [markdown]);

  const handleTriggerPhase2 = () => {
    // Package it perfectly for the Phase 2 boundary
    const phase2Payload = `PRIMARY REQUIREMENT CONTRACT (REFINED):\n${editableMarkdown}`;
    onApproveAndTriggerPhase2(phase2Payload);
  };

  return (
    <div className="card animate-fadeIn" style={{ borderTop: '4px solid #f59e0b' }}>
      <div className="card-header border-none" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
         <div>
            <h2 className="title-gradient" style={{ backgroundImage: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>
               Human-in-the-Loop Verification
            </h2>
            <p>Phase 1 (Strategy & Orchestration Core) is complete. Please review and modify the generated Intelligence Contract before unleashing the Phase 2 Execution Factory.</p>
         </div>
         <div className="factory-stat" style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Mesh Status</span>
            <div style={{ color: '#f59e0b', fontWeight: 800 }}>Paused for Human</div>
         </div>
      </div>

      <div className="operational-banner" style={{ borderLeftColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', marginBottom: '1.5rem' }}>
        <i className="ti-hand-stop" style={{ color: '#f59e0b' }} aria-hidden="true" />
        <span>
          <strong>Action Required:</strong> The 44-node mesh is awaiting your approval. Edit the markdown contract below. When you click "Trigger Phase 2", Factory elements will instantiate based <em>strictly</em> on these verified specifications.
        </span>
      </div>

      {/* HITL SAFETY GATE: Show warning if contract is not ready for approval */}
      {isContractEmpty && !loading && (
        <div className="operational-banner" style={{ borderLeftColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: '1.5rem' }}>
          <i className="ti-alert-circle" style={{ color: '#ef4444' }} aria-hidden="true" />
          <span>
            <strong>Contract Empty:</strong> The Intelligence Contract has no content. A Phase 1 node may have failed. Check the <strong>Reasoning Console</strong> for error details before proceeding.
          </span>
        </div>
      )}
      {isContractErrored && !loading && (
        <div className="operational-banner" style={{ borderLeftColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: '1.5rem' }}>
          <i className="ti-alert-circle" style={{ color: '#ef4444' }} aria-hidden="true" />
          <span>
            <strong>Error Detected in Contract:</strong> The generated plan contains error markers (Degraded Mode active). You may manually edit the contract below to correct it before approving Phase 2.
          </span>
        </div>
      )}

      <div className="card-body">
         <div className="editor-container" style={{ height: '600px' }}>
            <div className="editor-header-bar" style={{ background: '#1e293b', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderRadius: '12px 12px 0 0' }}>
               <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Intelligence Contract (Editable Mode)
               </span>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 {isContractReady && (
                   <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>
                     ✅ {editableMarkdown.length.toLocaleString()} chars — Ready
                   </span>
                 )}
                 <div style={{ display: 'flex', gap: '6px' }}>
                   <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'block' }}></span>
                   <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'block' }}></span>
                 </div>
               </div>
            </div>
            <textarea 
               value={editableMarkdown}
               onChange={(e) => setEditableMarkdown(e.target.value)}
               className="blueprint-editor-modern"
               style={{ width: '100%', height: 'calc(100% - 40px)', padding: '24px', background: '#0f172a', color: '#f1f5f9', border: 'none', borderRadius: '0 0 12px 12px', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'none' }}
               disabled={loading}
               placeholder="Intelligence Contract will populate when Phase 1 completes..."
            />
         </div>
      </div>

      <div className="card-footer sticky-footer">
        <button className="btn-outline" onClick={onBack} disabled={loading}>
           <i className="ti-back-left"></i> Discard &amp; Return
        </button>
        <div className="flex-1"></div>
        <button 
           className="btn-primary highlight"
           style={{ 
             background: hitlDisabled ? '#94a3b8' : '#f59e0b', 
             borderColor: hitlDisabled ? '#94a3b8' : '#f59e0b', 
             color: 'white',
             cursor: hitlDisabled ? 'not-allowed' : 'pointer',
             opacity: hitlDisabled ? 0.6 : 1,
             transition: 'all 0.3s ease'
           }} 
           onClick={handleTriggerPhase2} 
           disabled={hitlDisabled}
           title={
             isContractEmpty 
               ? 'Contract is empty — check Reasoning Console for node errors' 
               : isContractErrored 
                 ? 'Contract has error markers — edit and fix before approving' 
                 : 'Approve and launch Phase 2 Factory'
           }
        >
           {loading 
             ? <><i className="ti-reload spin-animation"></i> Triggering Matrix...</>
             : isContractEmpty 
               ? <><i className="ti-alert-circle"></i> Contract Not Ready</>
               : <><i className="ti-bolt"></i> Approve &amp; Trigger Phase 2 (Factory Edge)</>
           }
        </button>
      </div>
    </div>
  );
};

export default Phase1ReviewHub;
