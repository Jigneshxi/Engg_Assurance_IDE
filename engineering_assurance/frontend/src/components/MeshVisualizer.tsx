import React from 'react';

interface MeshNode {
  id: string;
  label: string;
  agent: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'bypassed';
}

interface MeshVisualizerProps {
  topology?: {
    mesh_id: string;
    nodes: MeshNode[];
    active_node_id: string;
  };
  loading: boolean;
}

const MeshVisualizer: React.FC<MeshVisualizerProps> = ({ topology, loading }) => {
  const nodes = topology?.nodes || [];
  const activeId = topology?.active_node_id;

  const getIcon = (id: string) => {
    const i = id.toLowerCase();
    if (i.includes('ingest')) return 'ti-import';
    if (i.includes('clarifier')) return 'ti-harddrives';
    if (i.includes('synthesizer')) return 'ti-layers-alt';
    if (i.includes('governor')) return 'ti-shield';
    if (i.includes('architect')) return 'ti-map-alt';
    if (i.includes('logician')) return 'ti-layout-grid2';
    if (i.includes('creator')) return 'ti-pencil-alt';
    if (i.includes('supplier')) return 'ti-package';
    if (i.includes('simulator')) return 'ti-server';
    if (i.includes('critic')) return 'ti-comment-alt';
    if (i.includes('auditor')) return 'ti-clipboard';
    if (i.includes('monitor')) return 'ti-eye';
    if (i.includes('forge')) return 'ti-bolt';
    if (i.includes('coder')) return 'ti-microsoft-alt';
    if (i.includes('repairman')) return 'ti-heart-broken';
    if (i.includes('performance')) return 'ti-pulse';
    if (i.includes('security')) return 'ti-lock';
    if (i.includes('envops')) return 'ti-cloud-up';
    if (i.includes('executor')) return 'ti-control-shuffle';
    if (i.includes('chaos')) return 'ti-infinite';
    if (i.includes('mobile')) return 'ti-mobile';
    if (i.includes('digitaltwin')) return 'ti-split-v';
    if (i.includes('writer')) return 'ti-book';
    return 'ti-settings';
  };

  return (
    <div className="mesh-visualizer-container animate-fadeIn">
      <div className="mesh-explanation-card">
         <div className="mesh-explanation-header">
            <i className="ti-vector"></i>
            <h4>Agentic Network Topology (A.N.T.) — Core Mesh Visualization</h4>
         </div>
         <p>
            Real-time telemetry of the SeQuor reasoning network. As each agent validates your requirements, 
            the mesh nodes transition from <strong>Pending</strong> to <strong>Active</strong> (Reasoning) and <strong>Stabilized</strong> (Complete).
         </p>
      </div>

      <div className="mesh-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>
            {nodes.filter(n => n.status === 'completed' || n.status === 'bypassed').length} / {nodes.length} Nodes Stabilized
          </h3>
           <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>
             Orchestration Mesh: <span className="mesh-id-tag">{topology?.mesh_id || 'ANALYZING_FABRIC...'}</span>
           </p>
        </div>
        <div className={`mesh-status-indicator ${loading ? 'active' : 'idle'}`}>
           {loading ? (
             <><span className="status-dot-blink"></span> MESH PROPAGATION IN PROGRESS</>
           ) : (
             <><i className="ti-check"></i> NETWORK STABILIZED</>
           )}
        </div>
      </div>

      <div className="mesh-grid">
        {nodes.map((node, index) => {
          const isActive = node.id === activeId || node.status === 'active';
          const isCompleted = node.status === 'completed';
          const isFailed = node.status === 'failed';
          const isBypassed = node.status === 'bypassed';
          
          return (
            <div 
              key={node.id} 
              className={`mesh-node-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isFailed ? 'failed' : ''} ${isBypassed ? 'bypassed' : ''}`}
              title={`${node.label}: ${node.status}`}
            >
              <div className="node-icon-container">
                 <i className={getIcon(node.id)}></i>
              </div>
              <div className="node-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="node-content">
                 <div className="node-label">{node.label}</div>
                 <div className="node-agent">{node.agent || 'Unassigned'}</div>
              </div>
              {isActive && (
                 <div className="node-status-dot">
                    <div className="pulse-ring"></div>
                 </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .mesh-id-tag {
          font-family: 'Courier New', monospace;
          background: rgba(99, 102, 241, 0.1);
          color: #6366f1;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 700;
        }

        .mesh-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1.25rem;
          padding: 1rem;
          background: rgba(255,255,255,0.4);
          border-radius: 20px;
          border: 1px solid rgba(0,0,0,0.05);
          position: relative;
        }

        .mesh-node-card {
          position: relative;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }

        .node-icon-container {
          font-size: 1.25rem;
          color: #94a3b8;
          transition: all 0.3s;
        }

        .active .node-icon-container { color: #f59e0b; transform: scale(1.15); }
        .completed .node-icon-container { color: #10b981; }
        .bypassed .node-icon-container { color: #f59e0b; }

        .mesh-node-card.active {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.02);
          box-shadow: 0 0 25px rgba(245, 158, 11, 0.2);
          transform: translateY(-6px);
          z-index: 10;
        }

        .mesh-node-card.completed {
          background: #27272a; /* Dark Bark Profile */
          border-color: #3f3f46;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .mesh-node-card.completed .node-label {
          color: #f4f4f5;
        }
        .mesh-node-card.completed .node-agent {
          color: #a1a1aa;
        }
        .mesh-node-card.completed .node-index {
          color: #52525b;
        }

        .mesh-node-card.bypassed {
          background: #fff7ed;
          border-color: #fdba74;
          box-shadow: 0 4px 10px rgba(249, 115, 22, 0.12);
        }
        .mesh-node-card.bypassed .node-label {
          color: #9a3412;
        }
        .mesh-node-card.bypassed .node-agent {
          color: #c2410c;
        }

        .node-index {
          position: absolute;
          top: 12px;
          right: 12px;
          color: #cbd5e1;
          font-size: 0.65rem;
          font-weight: 800;
          font-family: 'Courier New', monospace;
        }

        .node-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.2;
        }

        .node-agent {
          font-size: 0.65rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .node-status-dot {
          position: absolute;
          bottom: 12px;
          right: 12px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #e2e8f0;
        }

        .completed .node-status-dot { background: #10b981; box-shadow: 0 0 8px #10b981; }
        .active .node-status-dot { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
        .failed .node-status-dot { background: #ef4444; }
        .bypassed .node-status-dot { background: #f97316; box-shadow: 0 0 8px #f97316; }

        .pulse-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          border: 3px solid #f59e0b;
          border-radius: 50%;
          animation: mesh-pulse 1.8s infinite cubic-bezier(0.4, 0, 0.6, 1);
        }

        @keyframes mesh-pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }

        .mesh-status-indicator {
          font-size: 0.7rem;
          font-weight: 800;
          padding: 6px 14px;
          border-radius: 20px;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .mesh-status-indicator.active {
          background: rgba(99, 102, 241, 0.1);
          color: #6366f1;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .mesh-status-indicator.idle {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-dot-blink {
          width: 6px;
          height: 6px;
          background: #f59e0b;
          border-radius: 50%;
          animation: flicker 0.8s infinite;
        }

        @keyframes flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .mesh-explanation-card {
           background: white;
           border: 1px solid #e2e8f0;
           border-radius: 16px;
           padding: 1.5rem;
           margin-bottom: 2rem;
           border-left: 4px solid #6366f1;
           box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }

        .mesh-explanation-header {
           display: flex;
           align-items: center;
           gap: 12px;
           margin-bottom: 0.5rem;
        }

        .mesh-explanation-header i { font-size: 1.2rem; color: #6366f1; }
        .mesh-explanation-header h4 { margin: 0; color: #1e293b; font-size: 1rem; font-weight: 800; }
        .mesh-explanation-card p { margin: 0; font-size: 0.85rem; color: #64748b; line-height: 1.6; }
      `}</style>
    </div>
  );
};

export default MeshVisualizer;
