import React from 'react';

interface ConfigSettingsProps {
  logLevel: number;
  onLogLevelChange: (level: number) => void;
  sidebarFanOut: boolean;
  onSidebarFanOutChange: (enabled: boolean) => void;
  useNodeCache: boolean;
  onUseNodeCacheChange: (enabled: boolean) => void;
}

const ConfigSettings: React.FC<ConfigSettingsProps> = ({
  logLevel,
  onLogLevelChange,
  sidebarFanOut,
  onSidebarFanOutChange,
  useNodeCache,
  onUseNodeCacheChange
}) => {
  return (
    <div className="card animate-fadeIn config-settings-shell" style={{ borderTop: '4px solid #6366f1' }}>
      <div className="card-header border-none">
        <h2 className="title-gradient">Intelligence Operations</h2>
        <p>Global telemetry and logic-tracing configurations.</p>
      </div>
      
      <div className="intelligence-ops-container">
        <div className="ops-grid-mesh">
          
          {/* Section 1: Reasoning Depth */}
          <div className="ops-card card-glass">
            <div className="ops-header">
              <div className="ops-icon-wrap">
                <i className="ti-pulse" />
              </div>
              <div>
                <h4>Intelligence Threshold</h4>
                <p>Configure the granularity of the Reasoning Console logs.</p>
              </div>
            </div>

            <div className="ops-selector-grid">
              {[
                { val: 3, label: 'Standard (INFO)', desc: 'Milestones & Completions' },
                { val: 4, label: 'Deep-Dive (DEBUG)', desc: 'Node Bench Decisions & Logic Drifts' },
                { val: 5, label: 'Master (TRACE)', desc: 'Raw LLM Payloads & Iteration Deltas' },
              ].map(opt => (
                <button 
                  key={opt.val}
                  className={`ops-opt-card ${logLevel === opt.val ? 'active' : ''}`}
                  onClick={() => onLogLevelChange(opt.val)}
                >
                  <div className="ops-opt-check">
                    {logLevel === opt.val && <i className="ti-check" />}
                  </div>
                  <div className="ops-opt-info">
                    <span className="ops-opt-label">{opt.label}</span>
                    <span className="ops-opt-desc">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="operational-banner warning mt-6">
               <i className="ti-alert" />
               <p><strong>Note:</strong> Higher intelligence depths improve observability but may increase Reasoning Console latency.</p>
            </div>
          </div>

          {/* Section 2: Reasoning Cache Policy */}
          <div className="ops-card card-glass">
            <div className="ops-header">
              <div className="ops-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                <i className="ti-bolt" />
              </div>
              <div>
                <h4>Strategic Reasoning Cache</h4>
                <p>Global CACHE_HIT policy for mesh execution nodes.</p>
              </div>
            </div>

            <div className="ops-toggle-list">
              <div className={`ops-toggle-card ${useNodeCache ? 'active' : ''}`} onClick={() => onUseNodeCacheChange(!useNodeCache)}>
                <div className="ops-toggle-info">
                   <span className="label">Persistence Logic (S3)</span>
                   <p>When enabled, nodes will reuse previously computed reasoning if inputs are identical. Disable this to force fresh ingestion from network paths.</p>
                </div>
                <div className="ops-toggle-switch">
                   <div className="switch-track">
                      <div className="switch-thumb"></div>
                   </div>
                </div>
              </div>
            </div>

            <div className="operational-banner info mt-6">
               <i className="ti-info-alt" />
               <p><strong>Bypass Recommendation:</strong> If you are re-ingesting requirements that have changed at the same network path, toggle this <strong>OFF</strong> to bypass stale hits.</p>
            </div>
          </div>

          {/* Section 3: UI Expansion Intelligence */}
          <div className="ops-card card-glass">
            <div className="ops-header">
              <div className="ops-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                <i className="ti-layout-sidebar-left" />
              </div>
              <div>
                <h4>Sidebar Fan-out</h4>
                <p>Autonomous expansion of specialist pillars during Mesh execution.</p>
              </div>
            </div>

            <div className="ops-toggle-list">
              <div className={`ops-toggle-card ${sidebarFanOut ? 'active' : ''}`} onClick={() => onSidebarFanOutChange(!sidebarFanOut)}>
                <div className="ops-toggle-info">
                   <span className="label">Autonomous Focus Expansion</span>
                   <p>Automatically expands and focuses on the active specialist pillar in the sidebar as agents move through the mesh.</p>
                </div>
                <div className="ops-toggle-switch">
                   <div className="switch-track">
                      <div className="switch-thumb"></div>
                   </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        .ops-grid-mesh {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 2rem;
            animation: slideIn 0.5s ease;
        }
        .ops-toggle-list {
            margin-top: 1rem;
        }
        .ops-toggle-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ops-toggle-card:hover {
            border-color: #cbd5e1;
            box-shadow: 0 10px 20px rgba(0,0,0,0.02);
            transform: translateY(-2px);
        }
        .ops-toggle-card.active {
            background: rgba(16, 185, 129, 0.03);
            border-color: #10b981;
        }
        .ops-toggle-info .label {
            display: block;
            font-weight: 800;
            color: #1e293b;
            margin-bottom: 4px;
        }
        .ops-toggle-info p {
            margin: 0;
            font-size: 0.8rem;
            color: #64748b;
            max-width: 320px;
        }
        .ops-toggle-switch {
            width: 50px;
            height: 26px;
        }
        .switch-track {
            width: 100%;
            height: 100%;
            background: #e2e8f0;
            border-radius: 20px;
            position: relative;
            transition: all 0.3s;
        }
        .ops-toggle-card.active .switch-track {
            background: #10b981;
        }
        .switch-thumb {
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .ops-toggle-card.active .switch-thumb {
            left: 27px;
        }
        .operational-banner.info {
            background: #f0f9ff;
            border: 1px solid #0ea5e933;
            color: #0369a1;
        }
        @media (max-width: 1024px) {
            .ops-grid-mesh {
                grid-template-columns: 1fr;
            }
        }
      `}</style>
    </div>
  );
};

export default ConfigSettings;
