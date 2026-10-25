import React, { useRef, useEffect, useState } from 'react';
import { 
  Activity, 
  Terminal, 
  Settings, 
  CheckCircle, 
  Loader, 
  Cpu, 
  FileCode, 
  Wrench,
  ChevronDown,
  ChevronRight,
  Zap,
  Plus
} from 'lucide-react';

interface MissionControlProps {
  openclawLogs: any[];
  summary: string;
  llmInfo: any;
  files: any[];
  fileStatuses?: Record<string, any>;
  pipelineState?: any;
  complianceError?: string;
  onSwitchToIDE?: (filePath?: string) => void;
  projectName?: string;
  setProjectName?: (name: string) => void;
  prd?: string;
  setPrd?: (prd: string) => void;
  autoApprove?: boolean;
  setAutoApprove?: (val: boolean) => void;
  onStartGeneration?: () => void;
  onResetToNewProject?: () => void;
  workspacePath?: string;
  status?: string;
  runtimeUrl?: string;
  completionGate?: any;
  onOpenAssurance?: () => void;
}

export const MissionControl: React.FC<MissionControlProps> = ({
  openclawLogs,
  summary,
  llmInfo,
  onOpenAssurance,
  files = [],
  fileStatuses = {},
  pipelineState = { phases: {}, modules: {} },
  complianceError,
  onSwitchToIDE,
  projectName = '',
  setProjectName,
  prd = '',
  setPrd,
  autoApprove = true,
  setAutoApprove,
  onStartGeneration,
  onResetToNewProject,
  workspacePath,
  status = 'idle',
  runtimeUrl,
  completionGate
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [expandedErrorDetails, setExpandedErrorDetails] = useState<boolean>(false);

  const togglePhase = (phaseNum: string) => {
    setExpandedPhases(prev => ({ ...prev, [phaseNum]: !prev[phaseNum] }));
  };

  const getPhaseTitle = (phaseNum: string, phaseInfo: any) => {
    const layerNames: Record<string, string> = {
      'DATABASE': 'DATABASE ARCHITECTURE & SCHEMA',
      'BACKEND_FOUNDATION': 'BACKEND FOUNDATION',
      'BACKEND': 'BACKEND BUSINESS LOGIC',
      'FRONTEND': 'FRONTEND APPLICATION',
      'GENERIC': 'SYSTEM & TESTING'
    };
    const layer = phaseInfo?.layer || '';
    const title = layerNames[layer] || (layer ? layer.replace(/_/g, ' ') : '');
    return `PHASE ${phaseNum}${title ? ` — ${title}` : ''}`;
  };

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [openclawLogs]);

  // Determine Pipeline Stage
  const lowerSummary = summary.toLowerCase();
  let activeStage = 0;
  if (lowerSummary.includes('architecture') || lowerSummary.includes('blueprint')) activeStage = 1;
  else if (lowerSummary.includes('code') || lowerSummary.includes('file') || lowerSummary.includes('writing')) activeStage = 2;
  else if (lowerSummary.includes('test') || lowerSummary.includes('repair') || lowerSummary.includes('healing')) activeStage = 3;
  else if (lowerSummary.includes('done') || lowerSummary.includes('complete')) activeStage = 4;
  else activeStage = 0; // Requirements / Initialization

  const stages = [
    { label: 'Initialization', icon: <Activity size={16} /> },
    { label: 'Architecture', icon: <Cpu size={16} /> },
    { label: 'Code Generation', icon: <FileCode size={16} /> },
    { label: 'Testing & Repair', icon: <Wrench size={16} /> }
  ];

  // Derived metrics for completed execution
  const allModuleFiles = Object.entries(fileStatuses).filter(([k]) => !k.startsWith('_'));
  const filePaths = new Set(files.map(file => file.path));
  const plannedFilesCount = completionGate?.required ?? files.length;
  const totalFilesCount = completionGate?.generated ?? files.length;
  const validatedFilesCount = completionGate?.validated ?? allModuleFiles.filter(([path, v]) => filePaths.has(path) && (v.status === 'validated' || v.status === 'validation_passed')).length;
  const repairedFilesCount = completionGate?.repaired ?? allModuleFiles.filter(([path, v]) => filePaths.has(path) && ((v.attempt && v.attempt > 0) || v.repairAttempts > 0)).length;
  const failedFilesCount = completionGate?.failed ?? allModuleFiles.filter(([path, v]) => filePaths.has(path) && (v.status === 'failed' || v.status === 'validation_failed')).length;
  const blockedFilesCount = completionGate?.blocked ?? 0;
  const projectFailed = status !== 'generating' && (completionGate?.status === 'FAIL' || status === 'error' || status === 'failed');

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw',
      background: '#0a0a0f', 
      color: '#e2e8f0', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      overflow: 'hidden'
    }}>
      {/* ── Compact Sidebar ── */}
      <div style={{ 
        width: 56, 
        background: '#11131a', 
        borderRight: '1px solid #1e293b', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        paddingTop: 16 
      }}>
        <div style={{ color: '#8b5cf6', marginBottom: 32, cursor: 'pointer' }} title="Mission Control">
          <Activity size={24} />
        </div>
        <div style={{ color: '#64748b', marginBottom: 24, cursor: 'pointer' }} title="Logs">
          <Terminal size={24} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ color: '#64748b', marginBottom: 16, cursor: 'pointer' }} title="Settings">
          <Settings size={24} />
        </div>
      </div>

      {/* ── Main View Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Top Navigation Bar */}
        <div style={{ 
          height: 64, 
          borderBottom: '1px solid #1e293b', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 6, 
              background: status === 'done' ? 'rgba(34,197,94,0.15)' : status === 'error' ? 'rgba(239,68,68,0.15)' : status === 'generating' ? 'rgba(139,92,246,0.15)' : 'rgba(56,189,248,0.12)', 
              color: status === 'done' ? '#4ade80' : status === 'error' ? '#f87171' : status === 'generating' ? '#a78bfa' : '#38bdf8', 
              padding: '6px 12px', 
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: 0.5
            }}>
              {status === 'generating' && <Loader size={13} className="spin" />}
              {status === 'done' && <CheckCircle size={13} />}
              {status === 'error' && <span style={{ color: '#ef4444' }}>⚠</span>}
              {status === 'idle' && <Zap size={13} />}
              {status === 'idle' ? 'PRD ENTRY' : status === 'done' ? 'COMPLETE (NO CHANGES NEEDED)' : status.toUpperCase()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Project: <code style={{ color: '#c084fc' }}>{projectName || '(Not configured)'}</code></span>
                {status !== 'idle' && (
                  <>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>|</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                      📂 {workspacePath || `workspaces/${projectName}`}
                    </span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {status === 'idle' ? 'Ready for autonomous requirements intake' : status === 'done' ? 'Project generation complete — No further changes needed' : (summary || 'OpenClaw Live Pipeline')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
            {runtimeUrl && (
              <a 
                href={runtimeUrl} 
                target="_blank" 
                rel="noreferrer"
                style={{
                  background: 'rgba(34,197,94,0.2)', border: '1px solid #22c55e', color: '#4ade80',
                  padding: '5px 10px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                🚀 App Live: {runtimeUrl}
              </a>
            )}
            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: llmInfo?.status === 'fallback' ? '#facc15' : '#4ade80' }} />
              Provider: <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{llmInfo?.provider?.toUpperCase() || 'LOADING...'}</span>
              {llmInfo?.status === 'fallback' && <span style={{ color: '#facc15', fontSize: 10, background: 'rgba(250,204,21,0.1)', padding: '2px 6px', borderRadius: 4 }}>Fallback Mode</span>}
            </div>
            <div style={{ color: '#94a3b8' }}>
              Model: <span style={{ color: llmInfo?.status === 'fallback' ? '#facc15' : '#8b5cf6', fontWeight: 600 }}>{llmInfo?.model || 'Loading...'}</span>
            </div>
            {onOpenAssurance ? (
              <button 
                onClick={onOpenAssurance}
                style={{
                  background: 'rgba(99,102,241,0.18)', border: '1px solid #6366f1', color: '#a5b4fc',
                  padding: '5px 12px', borderRadius: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                }}
                title="Open CONVERGE 59-Node Autonomous Engineering Assurance Observatory"
              >
                🛡 Assurance Mesh
              </button>
            ) : (
              <a 
                href="http://localhost:5173" 
                target="_blank" 
                rel="noreferrer"
                style={{
                  background: 'rgba(99,102,241,0.18)', border: '1px solid #6366f1', color: '#a5b4fc',
                  padding: '5px 12px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
                }}
                title="Open CONVERGE 59-Node Autonomous Engineering Assurance Platform"
              >
                🛡 Assurance Mesh
              </a>
            )}
            {status !== 'idle' && (
              <button 
                id="reset-prd-btn"
                onClick={onResetToNewProject}
                style={{ 
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', 
                  border: '1px solid #8b5cf6', 
                  color: '#ffffff', 
                  padding: '6px 14px', 
                  borderRadius: 6, 
                  cursor: 'pointer', 
                  fontWeight: 600, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
                }}
              >
                <Plus size={14} /> ➕ New Project / PRD
              </button>
            )}
            {onSwitchToIDE && (
              <button 
                onClick={() => onSwitchToIDE()}
                style={{ 
                  background: 'rgba(139,92,246,0.15)', border: '1px solid #8b5cf6', color: '#a78bfa', 
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 
                }}
              >
                <FileCode size={14} /> View Editor
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════════
            STATE 1 — PRD ENTRY (Before generation starts)
            ════════════════════════════════════════════════════════════════════════════ */}
        {status === 'idle' ? (
          <div style={{ 
            flex: 1, 
            padding: '40px 48px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            overflowY: 'auto' 
          }}>
            <div style={{
              width: '100%',
              maxWidth: 820,
              background: '#11131a',
              border: '1px solid #2e1065',
              borderRadius: 12,
              padding: '32px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
                    <Zap size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', letterSpacing: 0.3 }}>
                      OpenClaw AI Coding Agent
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                      Deterministic Multi-Phase Autonomous Code Generation with {llmInfo?.model || 'Configured LLM'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', padding: '3px 10px', borderRadius: 4, fontFamily: 'monospace' }}>
                    {llmInfo?.model ? `${llmInfo.model.toUpperCase()} ONLINE` : 'LLM ONLINE'}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Provider: <strong style={{ color: '#cbd5e1' }}>{llmInfo?.provider?.toUpperCase() || 'CONFIGURED'}</strong>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Project Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="project-name-input" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#cbd5e1' }}>
                      Project Name
                    </label>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Workspace: <code style={{ color: '#c084fc', background: '#0a0a0f', padding: '2px 6px', borderRadius: 4 }}>workspaces/{projectName || 'my_project'}</code>
                    </span>
                  </div>
                  <input
                    id="project-name-input"
                    type="text"
                    value={projectName}
                    onChange={e => setProjectName && setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="e.g. taskflow_contract_test"
                    style={{
                      background: '#0a0a0f',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '12px 16px',
                      color: '#f8fafc',
                      fontSize: 14,
                      fontFamily: 'monospace',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                  />
                </div>

                {/* PRD / Requirements */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label htmlFor="prd-textarea" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#cbd5e1' }}>
                    PRD / Requirements Specification
                  </label>
                  <textarea
                    id="prd-textarea"
                    rows={8}
                    value={prd}
                    onChange={e => setPrd && setPrd(e.target.value)}
                    placeholder="Enter or paste your PRD requirements here...&#10;&#10;Example:&#10;Build a minimal task management application.&#10;Backend: Python, FastAPI, SQLAlchemy, SQLite&#10;Entities: Task, Category&#10;Features: create task, list tasks, update task, delete task"
                    style={{
                      background: '#0a0a0f',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '14px 16px',
                      color: '#f8fafc',
                      fontSize: 13,
                      lineHeight: '1.6',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      outline: 'none',
                      minHeight: '160px'
                    }}
                  />
                </div>

                {/* Options & Action Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      id="auto-approve-checkbox"
                      checked={autoApprove}
                      onChange={e => setAutoApprove && setAutoApprove(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: '#8b5cf6', width: 16, height: 16 }}
                    />
                    Auto-Approve Multi-Phase Execution Gates (E2E)
                  </label>

                  <button
                    id="start-generation-btn"
                    onClick={onStartGeneration}
                    disabled={!prd?.trim()}
                    style={{
                      background: !prd?.trim() ? '#334155' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '14px 28px',
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      cursor: !prd?.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      boxShadow: !prd?.trim() ? 'none' : '0 4px 16px rgba(124, 58, 237, 0.4)',
                      opacity: !prd?.trim() ? 0.6 : 1,
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Zap size={18} />
                    Start Generation
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════════════════════
             STATE 2 — EXECUTION & RESULTS (After Start Generation submitted)
             ════════════════════════════════════════════════════════════════════════════ */
          <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: 0, overflowY: 'auto' }}>
            
            {/* Completion Result Banner if status === 'done' or 'error' */}
            {(status === 'done' || status === 'error') && (
              <div style={{
                background: status === 'done' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: status === 'done' ? '1px solid #22c55e' : '1px solid #ef4444',
                borderRadius: 10,
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: status === 'done' ? '#22c55e' : '#ef4444',
                    color: '#ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {status === 'done' ? <CheckCircle size={22} /> : <span>⚠</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: status === 'done' ? '#4ade80' : '#f87171' }}>
                      {status === 'done' ? '✓ Project Generation & Contract Validation Complete (No Further Changes Needed)' : 'Generation Halted with Validation Failures'}
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                      {summary || (status === 'done' ? 'All requirement contracts and quality gates passed. No further changes needed unless you click New Project / PRD.' : 'Inspect the execution logs and module statuses below.')}
                    </div>
                    {completionGate?.failedGates && completionGate.failedGates.length > 0 && (
                      <div style={{ fontSize: 12, color: '#f87171', marginTop: 4, fontFamily: 'monospace' }}>
                        Failed Gates: {completionGate.failedGates.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                    {plannedFilesCount > totalFilesCount && (
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Planned</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>{plannedFilesCount}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Generated Files</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{totalFilesCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Validated</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>{validatedFilesCount}</div>
                    </div>
                    {blockedFilesCount > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Blocked</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fbbf24' }}>{blockedFilesCount}</div>
                      </div>
                    )}
                    {repairedFilesCount > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Repairs</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8' }}>{repairedFilesCount}</div>
                      </div>
                    )}
                    {failedFilesCount > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Failed</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>{failedFilesCount}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={onResetToNewProject}
                      style={{
                        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                        border: '1px solid #8b5cf6',
                        color: '#ffffff',
                        padding: '8px 16px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Plus size={14} /> New Project / PRD
                    </button>
                    {onSwitchToIDE && (
                      <button
                        onClick={() => onSwitchToIDE()}
                        style={{
                          background: 'rgba(139,92,246,0.15)',
                          border: '1px solid #8b5cf6',
                          color: '#a78bfa',
                          padding: '8px 16px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <FileCode size={14} /> Open Editor
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Collapsible Error Details Panel */}
            {(status === 'error' && complianceError) && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.05)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                borderRadius: 8, 
                marginBottom: 24,
                overflow: 'hidden'
              }}>
                <div 
                  onClick={() => setExpandedErrorDetails(!expandedErrorDetails)}
                  style={{ 
                    background: '#11131a', 
                    padding: '14px 18px', 
                    cursor: 'pointer',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: '1px solid #1e293b'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>{expandedErrorDetails ? '▲' : '▼'}</span>
                    <span style={{ color: '#f87171', fontWeight: 600, fontSize: 13 }}>Validation Error Details</span>
                  </div>
                  <span style={{ color: '#64748b', fontSize: 11 }}>Click to expand/collapse</span>
                </div>
                {expandedErrorDetails && (
                  <div style={{ padding: '14px 18px', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#f87171', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {complianceError}
                  </div>
                )}
              </div>
            )}

            {/* Execution Pipeline */}
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>
                Execution Pipeline
              </div>
              <div style={{ 
                display: 'flex', 
                background: '#11131a', 
                border: '1px solid #1e293b', 
                borderRadius: 8, 
                padding: 24,
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'relative'
              }}>
                {/* Line connector */}
                <div style={{ position: 'absolute', top: '50%', left: 40, right: 40, height: 2, background: '#1e293b', zIndex: 0 }} />
                
                {stages.map((stage, idx) => {
                  const isActive = activeStage === idx;
                  const isPassed = activeStage > idx || status === 'done';
                  
                  let bgColor = '#1e293b';
                  let iconColor = '#64748b';
                  let glow = 'none';

                  if (isActive && status === 'generating') {
                    bgColor = '#8b5cf6';
                    iconColor = '#ffffff';
                    glow = '0 0 16px rgba(139, 92, 246, 0.4)';
                  } else if (isActive && status === 'error') {
                    bgColor = '#ef4444';
                    iconColor = '#ffffff';
                    glow = '0 0 16px rgba(239, 68, 68, 0.4)';
                  } else if (isPassed) {
                    bgColor = '#4ade80';
                    iconColor = '#064e3b';
                  }

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, zIndex: 1 }}>
                      <div style={{ 
                        width: 48, height: 48, borderRadius: '50%', 
                        background: bgColor, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: iconColor,
                        boxShadow: glow,
                        transition: 'all 0.3s ease'
                      }}>
                        {isPassed ? <CheckCircle size={20} /> : stage.icon}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#f8fafc' : '#94a3b8' }}>
                        {stage.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Split Execution View: Modules & Live Logs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, flex: 1, minHeight: 520 }}>
              
              {/* Real-time Structured Status */}
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 500, height: '100%' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>
                  Generation Pipeline Status
                </div>
                <div style={{ 
                  flex: 1,
                  background: '#11131a', 
                  border: '1px solid #1e293b', 
                  borderRadius: 8, 
                  display: 'flex', 
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* PHASE 0: MANIFEST & ARCHITECTURE */}
                    <div style={{ background: '#1e293b', borderRadius: 6, padding: 12 }}>
                      <div 
                        onClick={() => togglePhase('0')}
                        style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: expandedPhases['0'] !== false ? 12 : 0, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {expandedPhases['0'] !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          PHASE 0 — MANIFEST & ARCHITECTURE
                        </span>
                        <span style={{ color: fileStatuses['_manifest'] ? '#4ade80' : '#38bdf8' }}>
                          {fileStatuses['_manifest'] ? 'COMPLETED' : 'RUNNING'}
                        </span>
                      </div>

                      {expandedPhases['0'] !== false && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#11131a', borderRadius: 4, padding: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#e2e8f0' }}>Manifest Generation</span>
                            {fileStatuses['_manifest'] ? <span style={{ color: '#4ade80' }}>✓ Generated</span> : <span style={{ color: '#94a3b8' }}>○ Pending</span>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#e2e8f0' }}>Dependency Graph</span>
                            {fileStatuses['_dag'] ? <span style={{ color: '#4ade80' }}>✓ Ready</span> : <span style={{ color: '#94a3b8' }}>○ Pending</span>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#e2e8f0' }}>Project Validation</span>
                            {fileStatuses['_project']?.status === 'validating' ? (
                              <span style={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}><Loader size={12} className="spin" /> QA In Progress</span>
                            ) : (status !== 'generating' && (projectFailed || completionGate?.status === 'FAIL' || fileStatuses['_project']?.status === 'failed')) ? (
                              <span style={{ color: '#f87171' }}>✗ Failed ({fileStatuses['_project']?.score ?? 0}/100)</span>
                            ) : fileStatuses['_project']?.status === 'validated' ? (
                              <span style={{ color: '#4ade80' }}>✓ Passed ({fileStatuses['_project']?.score}/100)</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>○ Pending</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* PHASE 1, PHASE 2, PHASE 3... Accordions */}
                    {Object.entries(pipelineState.phases).map(([phaseNum, phaseInfo]: [string, any]) => {
                      const isExpanded = expandedPhases[phaseNum] !== false;
                      const phaseModules = (phaseInfo.modules || []).map((moduleId: string) => pipelineState.modules[moduleId]).filter(Boolean);
                      const phaseFailed = phaseInfo.status === 'failed' || phaseModules.some((moduleInfo: any) => moduleInfo.status === 'FAILED') || projectFailed;
                      const phaseBlocked = !phaseFailed && phaseModules.some((moduleInfo: any) => moduleInfo.status === 'BLOCKED_BY_DEPENDENCY');
                      const phaseRunning = phaseModules.some((moduleInfo: any) => ['GENERATING', 'VALIDATING'].includes(moduleInfo.status));
                      const phaseLabel = phaseFailed ? 'COMPLETED WITH ERRORS' : phaseBlocked ? 'BLOCKED' : phaseRunning || phaseInfo.status === 'started' ? 'RUNNING' : 'COMPLETED';
                      return (
                      <div key={phaseNum} style={{ background: '#1e293b', borderRadius: 6, padding: 12 }}>
                        <div 
                          onClick={() => togglePhase(phaseNum)}
                          style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: isExpanded ? 12 : 0, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {getPhaseTitle(phaseNum, phaseInfo)}
                          </span>
                          <span style={{ color: phaseFailed ? '#f87171' : phaseBlocked ? '#fbbf24' : phaseRunning || phaseInfo.status === 'started' ? '#38bdf8' : '#4ade80' }}>
                            {phaseLabel}
                          </span>
                        </div>
                        
                        {isExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {(phaseInfo.modules || []).map((moduleId: string) => {
                            const modInfo = pipelineState.modules[moduleId] || { status: 'PENDING' };
                            const moduleFiles = Object.entries(fileStatuses).filter(([, v]) => v.moduleId === moduleId);

                            return (
                              <div key={moduleId} style={{ background: '#11131a', borderRadius: 4, padding: 8, borderLeft: modInfo.status === 'GENERATING' ? '2px solid #8b5cf6' : modInfo.status === 'PASSED' ? '2px solid #4ade80' : '2px solid #334155' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: moduleFiles.length > 0 ? 8 : 0 }}>
                                  <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{moduleId}</span>
                                  <span style={{ color: modInfo.status === 'GENERATING' ? '#8b5cf6' : modInfo.status === 'PASSED' ? '#4ade80' : '#94a3b8' }}>
                                    {modInfo.status}
                                  </span>
                                </div>
                                
                                {/* Files for this module */}
                                {moduleFiles.length > 0 && (
                                  <div style={{ paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {moduleFiles.map(([path, info]) => {
                                      let statusColor = '#94a3b8';
                                      let statusIcon = '○';
                                      let statusText = 'Pending';
                                      if (info.status === 'blocked') { statusColor = '#fbbf24'; statusText = 'Blocked'; statusIcon = '⛔'; }
                                      
                                      if (info.status === 'queued') { statusColor = '#94a3b8'; statusText = 'Queued'; statusIcon = '○'; }
                                      else if (info.status === 'generating') { statusColor = '#38bdf8'; statusText = 'Generating'; statusIcon = '⟳'; }
                                      else if (info.status === 'validating') { statusColor = '#8b5cf6'; statusText = 'Validating'; statusIcon = '🔍'; }
                                      else if (info.status === 'repairing') { statusColor = '#fbbf24'; statusText = `Repair ${info.attempt || ''}`; statusIcon = '↻'; }
                                      else if (info.status === 'validation_passed' || info.status === 'validated') { statusColor = '#4ade80'; statusText = 'Validated'; statusIcon = '✓'; }
                                      else if (info.status === 'validation_failed') { statusColor = '#f87171'; statusText = 'Validation Failed'; statusIcon = '⚠'; }
                                      else if (info.status === 'failed') { statusColor = '#ef4444'; statusText = 'Failed permanently'; statusIcon = '❌'; }
                                      
                                      return (
                                        <div 
                                          key={path} 
                                          onClick={() => onSwitchToIDE && onSwitchToIDE(path)}
                                          style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            fontSize: 11, 
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            padding: '3px 6px',
                                            borderRadius: 4,
                                            background: 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.15s ease'
                                          }}
                                          title={`Click to open ${path} in Editor`}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        >
                                          <span style={{ color: '#cbd5e1', wordBreak: 'break-all', paddingRight: 8, fontFamily: 'monospace' }}>
                                            📄 {path}
                                          </span>
                                          <span style={{ color: statusColor, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {statusIcon === '⟳' || statusIcon === '↻' ? <Loader size={10} className="spin" /> : <span>{statusIcon}</span>}
                                            {statusText}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              </div>

              {/* Live Activity Terminal */}
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>
                  Live Execution Logs
                </div>
                <div style={{ 
                  flex: 1,
                  background: '#020617', 
                  border: '1px solid #1e293b', 
                  borderRadius: 8, 
                  display: 'flex', 
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
                }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: 13, lineHeight: 1.6 }}>
                    {openclawLogs.length === 0 && (
                      <div style={{ color: '#475569', fontStyle: 'italic' }}>Waiting for system logs...</div>
                    )}
                    {openclawLogs.map((log, i) => {
                      const logStr = typeof log === 'string' ? log : (log as any)?.message || JSON.stringify(log);
                      const isSuccess = logStr.startsWith('✓') || logStr.startsWith('✅');
                      const isWarn = logStr.startsWith('⚠️') || logStr.toLowerCase().includes('warning') || logStr.toLowerCase().includes('fail');
                      const isSystem = logStr.startsWith('[') || logStr.startsWith('⚙');
                      
                      return (
                        <div key={i} style={{ 
                          marginBottom: 6, 
                          color: isSuccess ? '#4ade80' : isWarn ? '#fbbf24' : isSystem ? '#94a3b8' : '#e2e8f0',
                          display: 'flex',
                          gap: 12
                        }}>
                          <span style={{ color: '#475569', userSelect: 'none' }}>
                            {String(i + 1).padStart(3, '0')}
                          </span>
                          <span style={{ wordBreak: 'break-word' }}>{logStr}</span>
                        </div>
                      );
                    })}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
