import { apiClient } from '../utils/apiClient';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TestPlanPayload } from '../types';
import MeshVisualizer from './MeshVisualizer';
import { downloadFile, filenameFromUrl } from '../utils/downloadFile';

interface DeliveryHubProps {
  markdown: string;
  payload: TestPlanPayload | null;
  topology?: any;
  downloadUrl: string;
  logs: any[];
  onNew: () => void;
  onBack: () => void;
  onProceedToReview?: () => void;
  loading: boolean;
  apiBase: string;
}

const StrategyDeliveryHub: React.FC<DeliveryHubProps> = ({ markdown, payload, topology, downloadUrl, logs, onNew, onBack, onProceedToReview, loading, apiBase }) => {
  const [activeTab, setActiveTab] = useState<'console'|'preview'|'analysis'|'publish'|'mesh'>(loading ? 'mesh' : 'console');
  const [publishStatus, setPublishStatus] = useState<{type:string, text:string}|null>(null);
  const [downloading, setDownloading] = useState(false);

  const asText = (value: unknown, fallback = '—'): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return asText(obj.feature ?? obj.name ?? obj.area ?? obj.title ?? obj.risk_level ?? obj.value, fallback);
    }
    return fallback;
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setDownloading(true);
    await downloadFile(
      `${apiBase}${downloadUrl}`,
      filenameFromUrl(downloadUrl, 'VVNT_TestPlan.docx')
    );
    setDownloading(false);
  };
  
  // Publishing Logic
  const handlePublish = async (target: string) => {
    setPublishStatus({ type: 'info', text: `Pushing to ${target}...` });
    try {
      const data: any = await apiClient.post(`/publish/confluence`, {
        markdown_content: markdown,
        title: `VVNT Test Plan - ${new Date().toLocaleDateString()}`,
        confluence_url: 'https://confluence.vvnt.com',
        space_key: 'QA',
        connection: { email: 'auto-agent@vvnt.com', token: 'AGENT_SERVICE_TOKEN' }
      });
      if (true) {
        setPublishStatus({ type: 'success', text: `Successfully published to Confluence: ${data.url}` });
      } else {
        setPublishStatus({ type: 'error', text: 'Failed to publish to enterprise wiki.' });
      }
    } catch(e) {
      setPublishStatus({ type: 'error', text: 'Network exception during publishing.' });
    }
  };

  const isSuccess = !!downloadUrl && !!payload;
  const isFailed = !loading && !isSuccess;

  return (
    <div className="card animate-fadeIn">
      <div className="card-header border-none" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h2 className="title-gradient" style={isFailed ? { backgroundImage: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' } : loading ? { backgroundImage: 'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)' } : {}}>
            {loading ? "Agent Mesh Reasoning..." : isSuccess ? "Strategy Artifact Generated" : "Agent Synchronization Failed"}
          </h2>
          <p>
            {loading 
              ? "The Sovereign A.N.T. mesh is aggressively executing your workflow. Live node telemetry streaming below..."
              : isSuccess 
              ? "Synthesis pipeline complete. Review the final diagnostic metrics and download the formal test plan artifact." 
              : "The multi-agent reasoning chain encountered a structural failure. Review the console logs for identity or network timeouts."}
          </p>
        </div>
        {!loading && isSuccess && downloadUrl && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary highlight"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}
          >
            {downloading
              ? <><i className="ti-package" style={{ animation: 'bounce 1s infinite' }}></i> Packing Artifact...</>
              : <><i className="ti-download"></i> Download Now</>
            }
          </button>
        )}
        <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }`}</style>
      </div>

      <div className="operational-banner" style={isFailed ? { borderLeftColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)' } : loading ? { borderLeftColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.05)' } : {}}>
        <i className={loading ? "ti-reload" : isSuccess ? "ti-info-alt" : "ti-alert"} style={isFailed ? { color: '#ef4444' } : loading ? { color: '#3b82f6' } : {}} aria-hidden="true" />
        <span>
            {loading 
              ? <>Operational Guide: System is aggressively executing intelligent analysis loops. <strong>Reasoning Console</strong> is streaming telemetry in real-time.</>
              : isSuccess 
              ? <>Operational Guide: Strategic generation cycle complete. Review <strong>Agent Reasoning</strong> across specialized tiers before finalizing industrial artifacts.</> 
              : <>Operational Guide: System fault detected. Review the <strong>Reasoning Console</strong> below to identify identity exhaustions, missing modules, or proxy timeouts.</>}
        </span>
      </div>

      <div className="card-body">
         <div className="studio-tab-selector">
            <button className={`studio-tab ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>
               <div className="tab-indicator-glow"></div>
               <i className="ti-terminal"></i>
               <span>Reasoning Console</span>
            </button>
            <button className={`studio-tab ${activeTab === 'mesh' ? 'active' : ''}`} onClick={() => setActiveTab('mesh')}>
               <div className="tab-indicator-glow"></div>
               <i className="ti-vector"></i>
               <span>Mesh Topology</span>
            </button>
            <button className={`studio-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>
               <div className="tab-indicator-glow"></div>
               <i className="ti-layout"></i>
               <span>Document Preview</span>
            </button>
            <button className={`studio-tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
               <div className="tab-indicator-glow"></div>
               <i className="ti-stats-up"></i>
               <span>Intelligence Metrics</span>
            </button>
            <button className={`studio-tab ${activeTab === 'publish' ? 'active' : ''}`} onClick={() => setActiveTab('publish')}>
               <div className="tab-indicator-glow"></div>
               <i className="ti-share"></i>
               <span>Multi-Channel Publish</span>
            </button>
         </div>

         <style>{`
            .studio-tab-selector {
               display: flex;
               background: rgba(241, 245, 249, 0.5);
               padding: 6px;
               border-radius: 14px;
               gap: 8px;
               width: fit-content;
               margin-bottom: 2rem;
               border: 1px solid #e2e8f0;
               overflow-x: auto;
               max-width: 100%;
            }

            .studio-tab {
               position: relative;
               display: flex;
               align-items: center;
               gap: 10px;
               padding: 10px 20px;
               border: none;
               background: transparent;
               cursor: pointer;
               border-radius: 10px;
               font-size: 0.85rem;
               font-weight: 600;
               color: #64748b;
               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
               white-space: nowrap;
            }

            .studio-tab.active {
               color: #4f46e5;
               background: white;
               box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);
            }

            .studio-tab.active i {
               color: #4f46e5;
            }

            .tab-indicator-glow {
               position: absolute;
               top: 0; left: 0; width: 100%; height: 100%;
               background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, transparent 100%);
               opacity: 0;
               transition: opacity 0.3s ease;
               border-radius: 10px;
            }

            .studio-tab.active .tab-indicator-glow {
               opacity: 1;
            }
         `}</style>

        <div className="tab-content-container custom-scroll">
           {activeTab === 'console' && (
              <div className="terminal-view" id="panel-console" role="tabpanel" aria-live="polite">
                 <div className="terminal-body custom-scroll">
                    {logs.length === 0 ? (
                       <div className="terminal-line placeholder">&gt; Agent is cold-starting the reasoning network...</div>
                    ) : (
                       logs.map((log, i) => (
                          <div key={i} className="terminal-line animate-slideIn">
                             <span className="timestamp" aria-label="Log timestamp">[{log.timestamp || '00:00:00'}]</span>
                             <span className={`agent-name ${(log.agent || 'system').toLowerCase()}`}>{(log.agent || 'System').toUpperCase()}:</span>
                             <span className="message">{log.message}</span>
                          </div>
                       ))
                    )}
                    {loading && (
                       <div className="terminal-line typing" aria-label="System brainstorming">
                          <span className="cursor" aria-hidden="true">&gt;</span> _
                       </div>
                    )}
                 </div>
              </div>
           )}

           {activeTab === 'mesh' && (
              <div id="panel-mesh" role="tabpanel">
                 <MeshVisualizer topology={topology || payload?.mesh_topology} loading={loading} />
              </div>
           )}

           {activeTab === 'preview' && (
              <div className="markdown-preview-container animate-blur" id="panel-preview" role="tabpanel" style={{background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '2.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', height: '600px', overflowY: 'auto'}}>
                 {markdown ? (
                    <div className="markdown-body custom-scroll">
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {markdown}
                       </ReactMarkdown>
                    </div>
                 ) : (
                    <div className="empty-preview" aria-hidden="true">
                       <div className="shimmer-box"></div>
                       <div className="shimmer-box" style={{width:'80%'}}></div>
                       <div className="shimmer-box" style={{width:'60%'}}></div>
                    </div>
                 )}
              </div>
           )}

           {activeTab === 'analysis' && payload && (
              <div className="analysis-metrics animate-slideIn" id="panel-analysis" role="tabpanel">
                 <div className="intelligence-grid">
                    <div className="metric-card risk-card">
                       <div className="metric-card-header">
                          <i className="ti-pie-chart" aria-hidden="true"></i>
                          <h4>Risk Surface Index (Heat Map)</h4>
                       </div>
                       <div className="risk-matrix-table-container">
                          <table className="risk-matrix-table">
                            <thead>
                              <tr>
                                <th scope="col">Likelihood \ Impact</th>
                                <th scope="col">High</th>
                                <th scope="col">Medium</th>
                                <th scope="col">Low</th>
                              </tr>
                            </thead>
                            <tbody>
                              {['High', 'Medium', 'Low'].map(l_level => (
                                <tr key={l_level}>
                                  <th scope="row" className="row-header">{l_level}</th>
                                  {['High', 'Medium', 'Low'].map(i_level => {
                                     const items = payload.risk_matrix?.filter(
                                         r => (r.likelihood || '').toLowerCase() === l_level.toLowerCase() &&
                                              (r.impact || '').toLowerCase() === i_level.toLowerCase()
                                     ) || [];
                                     
                                     let severity = 'low';
                                     let bgCol = 'rgba(16,185,129,0.1)';
                                     if (l_level === 'High' && i_level === 'High') { severity = 'high'; bgCol = 'rgba(239,68,68,0.25)'; }
                                     else if (l_level === 'High' || i_level === 'High') { severity = 'high'; bgCol = 'rgba(249,115,22,0.2)'; }
                                     else if (l_level === 'Medium' || i_level === 'Medium') { severity = 'medium'; bgCol = 'rgba(234,179,8,0.15)'; }

                                     return (
                                        <td key={i_level} className={`matrix-cell ${severity}`} style={{ backgroundColor: bgCol, transition: 'all 0.3s' }} aria-label={`${l_level} likelihood and ${i_level} impact: ${items.length} items`}>
                                           {items.length === 0 ? <span className="empty-cell">-</span> : 
                                              items.map((item, idx) => (
                                                 <div key={idx} className="matrix-item tooltip-trigger" style={{ borderLeft: `3px solid ${severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#10b981'}` }}>
                                                    <span className="matrix-item-text" title={asText(item.area)}>{asText(item.area)}</span> 
                                                    {item.risk_score && <span className="score">[{asText(item.risk_score)}]</span>}
                                                    <div className="tooltip-content" role="tooltip">
                                                      <strong>Mitigation:</strong> {asText(item.mitigation)}
                                                    </div>
                                                 </div>
                                              ))
                                           }
                                        </td>
                                     )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                       </div>
                    </div>

                    <div className="metric-card strategy-card">
                       <div className="metric-card-header">
                          <i className="ti-layers"></i>
                          <h4>Tiered Strategy Map</h4>
                       </div>
                       <div className="strategy-list">
                          {Object.entries(payload.test_strategy_recommendations || {}).map(([tier, rec]) => (
                             <div key={tier} className="strategy-item">
                                <div className="strategy-tier">
                                   <span className={`tier-badge ${tier.toLowerCase()}`}>{tier.toUpperCase()}</span>
                                </div>
                                <div className="strategy-desc">
                                   <p>{asText(rec)}</p>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'publish' && (
              <div className="publish-hub animate-slideIn">
                 <h3 className="section-title">Enterprise Knowledge Distribution</h3>
                 {publishStatus && (
                    <div className={`status-pill ${publishStatus.type}`} style={{marginBottom:'1rem'}}>
                       {publishStatus.text}
                    </div>
                 )}
                 <div className="publish-options-grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'1.5rem'}}>
                    <div className="publish-card active-publish" style={{padding:'2rem 1.5rem', textAlign:'center', borderRadius:'16px'}}>
                       <div style={{fontSize:'3rem', color:'#0052cc', marginBottom:'1.25rem', filter:'drop-shadow(0 4px 6px rgba(0,82,204,0.3))'}}><i className="ti-world"></i></div>
                       <h4 style={{marginBottom:'0.5rem', fontSize:'1.2rem'}}>Atlassian Confluence</h4>
                       <p style={{fontSize:'0.85rem', color:'#475569', marginBottom:'1.5rem', lineHeight:'1.6'}}>Publish the synthesized strategy directly to a Confluence Space.</p>
                       <button className="btn-primary highlight" style={{width:'100%', justifyContent:'center'}} onClick={() => handlePublish('Confluence')}>
                          <i className="ti-cloud-up"></i> Push to Wiki Hub
                       </button>
                    </div>
                    <div className="publish-card disabled-publish" style={{padding:'2rem 1.5rem', textAlign:'center', borderRadius:'16px'}}>
                       <div style={{fontSize:'3rem', color:'#333', marginBottom:'1.25rem'}}><i className="ti-github"></i></div>
                       <h4 style={{marginBottom:'0.5rem', fontSize:'1.2rem'}}>GitHub Documentation</h4>
                       <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:'1.5rem', lineHeight:'1.6'}}>Sync strategy with the code repository's internal documentation.</p>
                       <button className="btn-outline" style={{width:'100%', justifyContent:'center', padding:'0.875rem'}} disabled><i className="ti-lock"></i> Service Pending</button>
                    </div>
                    <div className="publish-card disabled-publish" style={{padding:'2rem 1.5rem', textAlign:'center', borderRadius:'16px'}}>
                       <div style={{fontSize:'3rem', color:'#0078d4', marginBottom:'1.25rem'}}><i className="ti-microsoft-alt"></i></div>
                       <h4 style={{marginBottom:'0.5rem', fontSize:'1.2rem'}}>SharePoint Hub</h4>
                       <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:'1.5rem', lineHeight:'1.6'}}>Push artifact to corporate document library.</p>
                       <button className="btn-outline" style={{width:'100%', justifyContent:'center', padding:'0.875rem'}} disabled><i className="ti-lock"></i> Service Pending</button>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>

      <div className="card-footer sticky-footer">
        <button className="btn-outline" onClick={onBack} disabled={loading}><i className="ti-files"></i> Revisit Previous Step</button>
        <div className="flex-1"></div>
        {onProceedToReview ? (
           <button className="btn-primary highlight" style={{ background: '#f59e0b', borderColor: '#f59e0b' }} onClick={onProceedToReview} disabled={loading}>
              <i className="ti-user"></i> Proceed to HITL Review Dashboard
           </button>
        ) : (
           <button className="btn-primary" onClick={onNew} disabled={loading}><i className="ti-plus"></i> Initialize New Strategy</button>
        )}
      </div>
    </div>
  );
};

export default StrategyDeliveryHub;
