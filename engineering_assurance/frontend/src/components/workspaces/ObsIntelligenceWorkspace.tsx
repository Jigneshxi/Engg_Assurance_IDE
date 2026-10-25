import React from 'react';
import { evaluateDataOrigin } from '../../utils/telemetryUtils';
import { useAssetResolver } from '../../hooks/useAssetResolver';
import { useStandaloneInvokeEnabled } from './standaloneInvoke';

interface ObsIntelligenceWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ObsIntelligenceWorkspace: React.FC<ObsIntelligenceWorkspaceProps> = ({ onInvoke, loading, telemetry, fullMeshState }) => {
  const assets = useAssetResolver(fullMeshState);
  const origin = evaluateDataOrigin(telemetry);
  const standaloneLocked = !useStandaloneInvokeEnabled();

  return (
    <div className="generic-workspace" style={{ padding: '20px', borderRadius: '14px', background: '#020617', border: '1px solid #1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.2rem' }}>Obs Intelligence</h3>
        <div className={`data-origin-badge ${origin}`} style={{ fontSize: '0.65rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', background: origin === 'live' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: origin === 'live' ? '#10b981' : '#f59e0b', border: `1px solid ${origin === 'live' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
            {origin === 'live' ? 'Sovereign Telemetry' : 'Structural Simulation'}
        </div>
      </div>
      
      <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px' }}>
         Awaiting specialized telemetry streams from the Intelligence Grid. The agent node is currently synchronized with the Orchestrator.
      </div>
      
      <div style={{ display: 'flex', gap: '15px' }}>
         <button onClick={() => onInvoke('Execute Deep Scan')} disabled={loading || standaloneLocked} style={{ padding: '10px 20px', background: loading || standaloneLocked ? '#4f46e5' : '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: loading || standaloneLocked ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {loading ? 'Processing...' : 'Execute Analysis'}
         </button>
      </div>
    </div>
  );
};

export default ObsIntelligenceWorkspace;
