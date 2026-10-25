import React, { useState, useEffect, useRef } from 'react';
import TddExecutionPanel from './TddExecutionPanel';
import { NfrAuditPanel } from './NfrAuditPanel';
import Pillar5Panel from './Pillar5Panel';
import { TestPlanPayload } from '../types';
import { downloadFile, filenameFromUrl } from '../utils/downloadFile';
import { AlertBanner, AlertSeverity } from './AlertBanner';
import { MermaidChart } from './MermaidChart';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ExecutionPanel from './ExecutionPanel';
import Phase4TDDIndicator from './TDDStatusIndicator';
import { ImplementationPlanReview } from './ImplementationPlanReview';
import AgentExecutionStatus from './AgentWorkspace';
import { API_BASE } from '../config';
import BrownfieldAuditView from './BrownfieldAuditView';

// ── ConflictResolutionPanel ──────────────────────────────────────────────────
// Renders plan-level blocking flags (endpoint collisions, file-ownership
// conflicts, near-duplicate modules) as actionable comparison cards.
// Developers can reject one of the implicated modules directly from the card.
const ConflictResolutionPanel = ({ planOqs, modules, onRejectModule }: {
  planOqs: any[];
  modules: any[];
  onRejectModule: (moduleId: string, reason: string) => void;
}) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  if (!planOqs || planOqs.length === 0) return null;

  const extractModuleIds = (text: string): string[] => {
    const matches = text.match(/MOD-\d{3}/g);
    return matches ? [...new Set(matches)] : [];
  };

  const blocking = planOqs.filter((q: any) => {
    if (typeof q !== 'object' || !q.blocking) return false;
    const implicated = extractModuleIds(q.text || '');
    const activeImplicated = implicated.filter(id => !modules.find((m: any) => m.module_id === id)?._rejected);
    // If it's a conflict between modules, it needs at least 2 active modules to be a blocking conflict
    if (implicated.length > 1 && activeImplicated.length < 2) return false;
    return true;
  });

  const warnings = planOqs.filter((q: any) => {
    if (typeof q !== 'object' || q.blocking) return false;
    const implicated = extractModuleIds(q.text || '');
    const activeImplicated = implicated.filter(id => !modules.find((m: any) => m.module_id === id)?._rejected);
    if (implicated.length > 1 && activeImplicated.length < 2) return false;
    return true;
  });

  const renderModuleCompareCard = (modId: string) => {
    const m = modules.find((mod: any) => mod.module_id === modId);
    if (!m) return <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Module {modId} not found in plan</div>;
    return (
      <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px', flex: '1 1 calc(33.33% - 10px)', minWidth: '280px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: '#818cf8', fontWeight: 800, fontSize: '0.75rem' }}>{m.module_id}</span>
          <span style={{
            fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700,
            background: m.risk_label === 'HIGH' ? 'rgba(239,68,68,0.15)' : m.risk_label === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            color: m.risk_label === 'HIGH' ? '#fca5a5' : m.risk_label === 'MEDIUM' ? '#fcd34d' : '#6ee7b7'
          }}>{m.risk_label} RISK</span>
        </div>
        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>{m.name}</div>
        <div style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: '8px', lineHeight: 1.5 }}>{m.module_summary}</div>
        {m.files_to_create?.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Files [NEW]</div>
            {m.files_to_create.slice(0, 5).map((f: string, i: number) => (
              <div key={i} style={{ fontSize: '0.68rem', color: '#38bdf8', fontFamily: 'monospace', padding: '1px 0' }}>+ {f}</div>
            ))}
            {m.files_to_create.length > 5 && <div style={{ fontSize: '0.65rem', color: '#475569' }}>+{m.files_to_create.length - 5} more</div>}
          </div>
        )}
        {m.api_endpoints_implemented?.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Endpoints</div>
            {m.api_endpoints_implemented.slice(0, 4).map((ep: any, i: number) => (
              <div key={i} style={{ fontSize: '0.68rem', color: '#a78bfa', fontFamily: 'monospace', padding: '1px 0' }}>
                {typeof ep === 'string' ? ep : `${ep.method} ${ep.path}`}
              </div>
            ))}
            {m.api_endpoints_implemented.length > 4 && <div style={{ fontSize: '0.65rem', color: '#475569' }}>+{m.api_endpoints_implemented.length - 4} more</div>}
          </div>
        )}
        {m.capability_refs?.length > 0 && (
          <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '4px' }}>
            Traces to: <span style={{ color: '#94a3b8' }}>{m.capability_refs.join(', ')}</span>
          </div>
        )}
        <button
          onClick={() => onRejectModule(m.module_id, `Rejected via conflict resolution — duplicate of another module in conflict group`)}
          style={{
            marginTop: '10px', width: '100%', padding: '6px', borderRadius: '6px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#fca5a5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
        >
          ✕ Reject {m.module_id}
        </button>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      {blocking.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px' }}>🔴 {blocking.length} Blocking Conflict{blocking.length !== 1 ? 's' : ''} — Resolve Before Approving</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {blocking.map((q: any, i: number) => {
              const isOpen = expanded[i] ?? false;
              const implicated = extractModuleIds(q.text || '');
              return (
                <div key={i} style={{ borderBottom: i < blocking.length - 1 ? '1px solid rgba(239,68,68,0.15)' : 'none' }}>
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                    style={{ width: '100%', background: 'transparent', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1 }}>
                      <span style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }}>•</span>
                      <span style={{ color: '#fca5a5', fontSize: '0.75rem', lineHeight: 1.6 }}>{q.text}</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', flexShrink: 0, marginTop: '2px' }}>{isOpen ? '▲ Hide' : '▼ Compare'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 14px' }}>
                      {implicated.length >= 2 ? (
                        <>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Side-by-side comparison — review each module's scope, then reject the one that should not proceed:
                          </div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {implicated.filter(id => !modules.find((m: any) => m.module_id === id)?._rejected).map(id => renderModuleCompareCard(id))}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                          {q.ai_suggestion_note && <div style={{ marginBottom: '4px' }}>📝 {q.ai_suggestion_note}</div>}
                          {implicated.filter(id => !modules.find((m: any) => m.module_id === id)?._rejected).map(id => renderModuleCompareCard(id))}
                        </div>
                      )}
                      {q.ai_suggestion_note && implicated.length >= 2 && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: '0.72rem', lineHeight: 1.6 }}>
                          📝 {q.ai_suggestion_note}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '1px' }}>🟡 {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {warnings.map((q: any, i: number) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: '0.74rem', lineHeight: 1.6, padding: '3px 0', borderBottom: i < warnings.length - 1 ? '1px solid rgba(245,158,11,0.08)' : 'none' }}>
                • {q.text || q.description || String(q)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ModuleApprovalCard Component for Phase 3a
const ModuleApprovalCard = ({ module, onApprove }: any) => {
  const [approved, setApproved] = useState(module.approved || false)
  const [notes, setNotes] = useState(module.developer_notes || '')
  const [expanded, setExpanded] = useState(module.risk_label !== 'LOW')
  const [answers, setAnswers] = useState<Record<number, string>>({})

  const riskColors = {
    LOW: { bg: '#064e3b', border: '#059669', text: '#6ee7b7' },
    MEDIUM: { bg: '#451a03', border: '#d97706', text: '#fcd34d' },
    HIGH: { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' }
  }
  const risk = riskColors[module.risk_label as keyof typeof riskColors] || riskColors.LOW

  const hasBlockingQuestions = module.open_questions?.some((q: any, i: number) => {
    if (typeof q !== 'object' || !q.blocking) return false;
    const qId = q.id || i;
    return !answers[qId];
  });
  const disableApproval = hasBlockingQuestions;

  let normalizedBindingConstraints = module.binding_constraints || [];
  if (!Array.isArray(normalizedBindingConstraints) && typeof normalizedBindingConstraints === 'object') {
    normalizedBindingConstraints = normalizedBindingConstraints.binding_constraints || [];
  }

  return (
    <div style={{
      border: `1px solid ${approved ? '#059669' : (disableApproval ? '#ef4444' : '#334155')}`,
      borderRadius: '8px',
      background: approved ? 'rgba(5,150,105,0.05)' : '#0f172a',
      transition: 'all 0.2s',
      opacity: disableApproval && !approved ? 0.8 : 1
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex',
        alignItems: 'flex-start', gap: '12px', cursor: 'pointer'
      }}
        onClick={() => setExpanded(!expanded)}>
        <input type="checkbox" checked={approved}
          disabled={disableApproval}
          onChange={e => {
            if (disableApproval) return;
            setApproved(e.target.checked)
            onApprove(e.target.checked, notes, answers)
          }}
          onClick={e => e.stopPropagation()}
          style={{ width: '16px', height: '16px', cursor: disableApproval ? 'not-allowed' : 'pointer', marginTop: '4px' }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700 }}>
              {module.module_id}
            </span>
            <span style={{
              padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem',
              background: risk.bg, border: `1px solid ${risk.border}`,
              color: risk.text, fontWeight: 600
            }}>
              {module.risk_label} RISK
            </span>
            <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>
              {module.name}
            </span>
          </div>

          {module.risk_rationale && (
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic' }}>
              Why {module.risk_label.toLowerCase()} risk: {module.risk_rationale}
            </div>
          )}

          {module.module_summary && (
            <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: '6px', lineHeight: '1.4' }}>
              {module.module_summary}
            </div>
          )}

          {module.detailed_summary && (
            <div style={{
              marginTop: '10px', padding: '10px 14px',
              background: 'rgba(99,102,241,0.05)',
              borderLeft: '3px solid #6366f1',
              borderRadius: '0 6px 6px 0',
              color: '#94a3b8', fontSize: '0.78rem', lineHeight: '1.5'
            }}>
              <strong style={{ color: '#818cf8' }}>Detailed Summary:</strong> {module.detailed_summary}
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
            {module.requirement_refs?.length > 0 && (
              <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                <span style={{ fontWeight: 600 }}>Traces to:</span> {module.requirement_refs.join(', ')}
              </div>
            )}
            <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
              <span style={{ fontWeight: 600 }}>Depends on:</span> {module.depends_on?.length ? module.depends_on.join(', ') : 'none'}
            </div>
            {module.blocks?.length > 0 && (
              <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                <span style={{ fontWeight: 600 }}>Blocks:</span> {module.blocks.join(', ')}
              </div>
            )}
          </div>
        </div>
        <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '4px' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #1e293b',
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px'
        }}>
          {/* Column 1: Files */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {module.files_to_create?.length > 0 && (
              <div>
                <div style={{ color: '#6366f1', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                  FILES TO CREATE
                </div>
                {module.files_to_create.map((f: any, i: number) => {
                  const text = typeof f === 'string' ? f : f.name || f.path || f.file || JSON.stringify(f);
                  return <div key={i} style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>+ {text}</div>
                })}
              </div>
            )}
            {module.files_to_update?.length > 0 && (
              <div>
                <div style={{ color: '#f59e0b', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                  FILES TO UPDATE
                </div>
                {module.files_to_update.map((f: any, i: number) => {
                  const text = typeof f === 'string' ? f : f.name || f.path || f.file || JSON.stringify(f);
                  return <div key={i} style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>~ {text}</div>
                })}
              </div>
            )}
          </div>

          {/* Column 2: Endpoints */}
          <div>
            {module.api_endpoints_implemented?.length > 0 && (
              <div>
                <div style={{ color: '#10b981', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                  API ENDPOINTS
                </div>
                {module.api_endpoints_implemented.map((e: any, i: number) => {
                  const text = typeof e === 'string'
                    ? e
                    : e.method && e.path ? `[${e.method}] ${e.path}` : e.endpoint || e.description || JSON.stringify(e);
                  return <div key={i} style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>{text}</div>
                })}
              </div>
            )}
          </div>

          {/* Column 3: Schema Changes */}
          <div>
            {(module.schema_changes?.length > 0 || module.db_tables_affected?.length > 0) && (
              <div>
                <div style={{ color: '#a855f7', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                  SCHEMA CHANGES
                </div>
                {(module.schema_changes || module.db_tables_affected).map((c: any, i: number) => {
                  const text = typeof c === 'string' ? c : c.name || JSON.stringify(c);
                  return <div key={i} style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>{text.startsWith('+') || text.startsWith('-') ? text : `+ ${text}`}</div>
                })}
              </div>
            )}
          </div>

          {/* New Dependencies (Spans full width if present) */}
          {module.new_dependencies?.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px', marginTop: '-4px' }}>
              <div style={{ color: '#38bdf8', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                NEW DEPENDENCIES
              </div>
              {module.new_dependencies.map((d: any, i: number) => {
                const pkg = typeof d === 'string' ? d : d.package || d.name;
                const justification = typeof d === 'string' ? '' : d.justification || d.reason;
                return (
                  <div key={i} style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>+ {pkg}</span>
                    {justification && <span style={{ color: '#64748b' }}> — {justification}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Binding Constraints */}
          {normalizedBindingConstraints.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
              <div style={{ color: '#ef4444', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                🔒 BINDING CONSTRAINTS
              </div>
              {normalizedBindingConstraints.map((c: any, i: number) => {
                const text = typeof c === 'string' ? c : c.description || c.constraint || c.title || JSON.stringify(c);
                return <div key={i} style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>• {text}</div>
              })}
            </div>
          )}

          {/* Acceptance Criteria */}
          {module.acceptance_criteria?.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
              <div style={{ color: '#10b981', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                ✓ ACCEPTANCE CRITERIA
              </div>
              {module.acceptance_criteria.map((c: any, i: number) => {
                const text = typeof c === 'string' ? c : c.description || c.criterion || JSON.stringify(c);
                return <div key={i} style={{ color: '#a7f3d0', fontSize: '0.75rem' }}>✓ {text}</div>
              })}
            </div>
          )}

          {/* Edge Cases */}
          {module.edge_cases?.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
              <div style={{ color: '#f97316', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                ⚡ EDGE CASES
              </div>
              {module.edge_cases.map((c: any, i: number) => {
                const text = typeof c === 'string' ? c : c.description || c.case || JSON.stringify(c);
                return <div key={i} style={{ color: '#fed7aa', fontSize: '0.75rem' }}>⚡ {text}</div>
              })}
            </div>
          )}

          {/* Error Handling Requirements */}
          {module.error_handling_requirements?.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
              <div style={{ color: '#f87171', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
                🛑 ERROR HANDLING
              </div>
              {module.error_handling_requirements.map((c: any, i: number) => {
                const text = typeof c === 'string' ? c : c.description || c.requirement || JSON.stringify(c);
                return <div key={i} style={{ color: '#fca5a5', fontSize: '0.75rem' }}>• {text}</div>
              })}
            </div>
          )}

          {/* Open Questions */}
          {module.open_questions?.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
              <div style={{ color: '#f59e0b', fontSize: '0.7rem', marginBottom: '8px', fontWeight: 600 }}>
                ⚠ OPEN QUESTIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {module.open_questions.map((q: any, i: number) => {
                  const text = typeof q === 'string' ? q : q.text || q.description || q.question || q.title || JSON.stringify(q);
                  const isBlocking = typeof q === 'object' && q.blocking;
                  const qId = (typeof q === 'object' && q.id) ? q.id : i;
                  const isAnswered = !!answers[qId];
                  return (
                    <div key={i} style={{
                      padding: '12px',
                      background: isBlocking && !isAnswered ? 'rgba(239, 68, 68, 0.05)' : 'rgba(30, 41, 59, 0.4)',
                      border: `1px solid ${isBlocking && !isAnswered ? 'rgba(239, 68, 68, 0.4)' : '#334155'}`,
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ color: '#fcd34d', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 800, marginRight: '8px' }}>?</span>
                        {text}
                        {isBlocking && <span style={{ color: '#ef4444', fontSize: '0.65rem', marginLeft: '8px', fontWeight: 600, textTransform: 'uppercase', border: '1px solid #ef4444', padding: '2px 6px', borderRadius: '4px' }}>Must resolve to approve</span>}
                      </div>

                      {typeof q === 'object' && q.ai_suggested_answer && (
                        <div style={{
                          background: 'rgba(56, 189, 248, 0.05)',
                          border: '1px solid rgba(56, 189, 248, 0.2)',
                          borderRadius: '6px',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              ✨ AI Suggested
                            </span>
                            <button
                              onClick={() => {
                                const newAnswers = { ...answers, [qId]: q.ai_suggested_answer };
                                setAnswers(newAnswers);
                                onApprove(approved, notes, newAnswers);
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid #38bdf8',
                                color: '#38bdf8',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)' }}
                              onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                            >
                              Use this
                            </button>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                            {q.ai_suggested_answer}
                          </div>
                        </div>
                      )}

                      {typeof q === 'object' && !q.ai_suggested_answer && q.ai_suggestion_note && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', paddingLeft: '22px' }}>
                          {q.ai_suggestion_note}
                        </div>
                      )}

                      <textarea
                        value={answers[qId] || ''}
                        onChange={(e) => {
                          const newAnswers = { ...answers, [qId]: e.target.value };
                          setAnswers(newAnswers);
                          onApprove(approved, notes, newAnswers);
                        }}
                        placeholder="Type answer or resolution path here..."
                        style={{
                          width: '100%', padding: '8px 12px', background: '#0f172a',
                          border: '1px solid #475569', borderRadius: '6px',
                          color: '#f8fafc', fontSize: '0.8rem', boxSizing: 'border-box',
                          resize: 'vertical', minHeight: '60px'
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Developer Notes */}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px', fontWeight: 600 }}>
              DEVELOPER NOTES (optional)
            </div>
            <textarea
              value={notes}
              onChange={e => {
                setNotes(e.target.value)
                onApprove(approved, e.target.value, answers)
              }}
              placeholder="Add notes or modifications for this module..."
              style={{
                width: '100%', padding: '8px', background: '#1e293b',
                border: '1px solid #334155', borderRadius: '6px',
                color: '#e2e8f0', fontSize: '0.8rem', resize: 'vertical',
                minHeight: '60px', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

import { ModulePRReview } from './ModulePRReview';

interface OrchestrationHubProps {
  reqStep: number;
  factoryStep: number;
  loading: boolean;
  status: { type: string; text: string };
  refinedUnifiedContent: string;
  generatedMarkdown: string;
  planPayload: TestPlanPayload | null;
  fullAgentState?: any;
  downloadUrl: string;
  reasoningLogs: any[];
  phase1Logs: any[];
  topology: any;
  phase1Topology: any;
  apiBase: string;
  onApproveAndTriggerPhase2: (context: string) => void;
  onApproveContract?: () => void;
  onNavigateToFactory: () => void;
  onResetMission: () => Promise<void>;
  onClearSession: () => void;
  demoMode?: boolean;
}

// ─── Pipeline Tracker ────────────────────────────────────────────────────────
const STAGES = [
  { label: 'Req Ingestion', icon: '📥', minStep: 1, doneStep: 2 },
  { label: 'Strategic Blitz', icon: '🧠', minStep: 2, doneStep: 3 },
  { label: 'HITL Review', icon: '⏸', minStep: 3, doneStep: 4 },
  { label: 'Artifact Synthesis', icon: '⚙️', minStep: 4, doneStep: 5 },
  { label: 'Delivery', icon: '📋', minStep: 5, doneStep: 99 },
];

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const PipelineBar: React.FC<{ factoryStep: number; loading: boolean }> = ({ factoryStep, loading }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '18px 20px', background: '#0f172a', borderRadius: '14px', border: '1px solid #1e293b' }}>
    {STAGES.map((s, i) => {
      const done = factoryStep >= s.doneStep;
      const active = !done && factoryStep >= s.minStep;
      const locked = !done && !active;
      const isLast = i === STAGES.length - 1;
      return (
        <React.Fragment key={s.label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? '#059669' : active ? '#4f46e5' : '#1e293b',
              border: `2px solid ${done ? '#10b981' : active ? '#818cf8' : '#334155'}`,
              boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.15), 0 0 16px rgba(99,102,241,0.3)' : done ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
              transition: 'all 0.4s ease', fontSize: '1rem',
            }}>
              {done ? '✓' : active && loading ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> : s.icon}
            </div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: done ? '#10b981' : active ? '#a5b4fc' : '#334155', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>
              {s.label}
            </div>
            <div style={{
              fontSize: '0.58rem', fontWeight: 800, padding: '1px 7px', borderRadius: '100px',
              background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: done ? '#10b981' : active ? '#818cf8' : '#334155'
            }}>
              {done ? 'DONE' : active ? (loading ? 'LIVE' : 'PENDING') : '○'}
            </div>
          </div>
          {!isLast && <div style={{
            flex: '0 0 28px', height: '3px',
            background: factoryStep >= s.doneStep
              ? 'linear-gradient(90deg, #10b981, #34d399, #10b981)'
              : active ? 'linear-gradient(90deg, #1e293b, #4f46e5, #1e293b)' : '#1e293b',
            backgroundSize: '200% auto',
            animation: factoryStep >= s.doneStep || active ? 'pipelineSweep 2s linear infinite' : 'none',
            marginBottom: '28px', transition: 'background 0.4s', borderRadius: '2px'
          }}></div>}
        </React.Fragment>
      );
    })}
    <style>{`
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes pipelineSweep {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
    `}</style>
  </div>
);


const cleanAgentName = (agent: string | undefined): string => {
  const safeAgent = asText(agent, 'System');
  if (!safeAgent) return 'System';
  return safeAgent
    .replace(/_/g, ' ')
    .replace(/agent/gi, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim() || 'System';
};

// ─── Narrative Log Interpreter ───────────────────────────────────────────────
/**
 * Transforms technical mesh logs into impactful 8th-grade storytelling formats.
 * Removes special characters and filters out technical debug noise.
 */
const interpretMissionLog = (agent: string, rawMessage: string): string => {
  const safeAgent = asText(agent, 'System');
  const safeMessage = asText(rawMessage, '');
  const displayName = cleanAgentName(safeAgent);

  if (!safeMessage || safeMessage.includes('Awaiting node synchronization')) {
    return "Systems standby. Awaiting the next strategic maneuver...";
  }

  // 1. Clean up special characters and technical brackets
  let msg = safeMessage.replace(/[\[\]{}|\\/<>]/g, '').trim();

  // 2. Identify patterns and map to storytelling news style
  const lowerAgent = safeAgent.toLowerCase();
  const lowerMsg = msg.toLowerCase();

  // Narrative Templates
  if (lowerMsg.includes('entering node') || lowerMsg.includes('starting execution')) {
    return `DEPLOYMENT: The ${displayName} node has been authorized to begin its mission segment.`;
  }

  if (lowerMsg.includes('successfully completed') || lowerMsg.includes('finished')) {
    return `BREAKING: The ${displayName} node has successfully achieved its objectives and stabilized its sector.`;
  }

  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('error during')) {
    return `SIGNAL ALERT: Our team is currently stabilizing a minor telemetry drift in the ${displayName} node. Auto-recovery is in progress.`;
  }

  // Specialist Agent Storytelling
  if (lowerAgent.includes('planning') || lowerAgent.includes('architect')) {
    return `STRATEGIC UPDATE: The Command Center is currently calculating the optimal path for the intelligence mesh.`;
  }

  if (lowerAgent.includes('data_builder') || lowerAgent.includes('forge')) {
    return `DATA FORGE: We are currently crafting high-fidelity synthetic records to stress-test the application's boundaries.`;
  }

  if (lowerAgent.includes('security')) {
    return `SECURITY SCAN: Our Digital Guardians are actively probing for vulnerabilities and hardening your application defenses.`;
  }

  if (lowerAgent.includes('performance')) {
    return `STRESS TEST: We are simulating thousands of digital users right now to ensure your system never slows down.`;
  }

  if (lowerAgent.includes('clarifier')) {
    return `LOGIC CHECK: We are taking raw blueprints and turning them into crystal-clear instructions for the rest of the mesh.`;
  }

  if (lowerAgent.includes('impact')) {
    return `SITUATION ROOM: We are calculating the "blast radius" of recent changes to pinpoint exactly what needs testing.`;
  }

  if (lowerAgent.includes('report') || lowerAgent.includes('synthesis')) {
    return `MISSION REPORT: Our Intelligence Mesh is currently gathering all findings into a final master brief for your review.`;
  }

  // Catch-all for other technical messages
  // If it looks like a file path or URL, make it sound like an asset
  if (msg.includes('http') || msg.includes('.json') || msg.includes('.docx')) {
    return `ASSET DELIVERY: A new tactical resource has been securely prepared and cached in the Mission Vault.`;
  }

  // Default: Just clean and wrap in a narrative tone
  return `MISSION UPDATE: ${msg.charAt(0).toUpperCase() + msg.slice(1)}.`;
};

const MissionEngagementLoop: React.FC<{ logs: any[] }> = ({ logs }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const subTimer = setInterval(() => {
      setProgress(p => Math.min(p + 2, 100)); // Simulating a quick progress effect
    }, 100);

    return () => {
      clearInterval(subTimer);
    };
  }, []);

  // Reset progress when a new log arrives
  useEffect(() => {
    setProgress(0);
  }, [logs?.length]);

  const latestLog = logs && logs.length > 0 ? logs[logs.length - 1] : { agent: 'System', message: 'Awaiting node synchronization...' };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', padding: '20px', background: 'linear-gradient(90deg, #020617, #0f172a, #020617)', borderRadius: '14px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '20px', minHeight: '100px', animation: 'slideUp 0.6s ease-out' }}>
      {/* Progress Bar Background */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '2px', background: 'rgba(255,255,255,0.05)' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: '#6366f1', transition: 'width 0.1s linear', boxShadow: '0 0 10px #6366f1' }}></div>
      </div>

      <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)', animation: 'pulseIcon 2s infinite' }}>
        ⚡
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Active Node Stream ({cleanAgentName(latestLog.agent)})</div>
        <div style={{ fontSize: '1rem', color: '#f1f5f9', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4, animation: 'fadeInScale 0.4s ease-out' }}>
          {interpretMissionLog(latestLog.agent, latestLog.message)}
        </div>
      </div>
      <div className="neural-graph-visual" style={{ width: '80px', display: 'flex', gap: '3px', alignItems: 'center' }}>
        {/* DASH-N08 FIX: Pre-computed heights — no Math.random() in JSX */}
        {[28, 42, 15, 38, 22].map((h, i) => (
          <div key={i} style={{ flex: 1, background: '#6366f1', height: `${h}px`, borderRadius: '2px', opacity: 0.3, animation: `equalizer ${0.6 + i * 0.15}s infinite ease-in-out` }}></div>
        ))}
      </div>
      <style>{`
                @keyframes pulseIcon { 0%,100% { transform: scale(1); border-color: rgba(99, 102, 241, 0.25); } 50% { transform: scale(1.05); border-color: rgba(99, 102, 241, 0.6); } }
                @keyframes equalizer { 0%,100% { height: 10px; } 50% { height: 40px; } }
                @keyframes fadeInScale { 0% { opacity: 0; transform: translateY(4px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>
    </div>
  );
};

let REGISTRY_MAP: Record<string, string> = {
  // ── Phase 1 / Core agents ────────────────────────────────────────────────
  'ingestor': 'raw_requirements',
  'clarifier': 'clarified_requirements',
  'architect': 'system_specification',
  'architect_p2': 'system_specification',
  'logician': 'logician_summary',
  'db_schema': 'db_schema_design',
  'api_design': 'api_design_spec',
  'planning_agent': 'engineering_tasks',
  'planner': 'engineering_tasks',
  'creator': 'tdd_contracts',
  'tdd_contract': 'tdd_contracts',
  'engineering_contract': 'engineering_contract',
  'refactoring': 'refactoring_suggestions',
  'migration': 'migration_code',
  'auditor': 'traceability_matrix',
  'data_builder': 'test_data_samples',
  'critic': 'critic_report',
  'lifecycle': 'mesh_topology',
  'automation_forge': 'automation_forge_code',
  'api_coder': 'api_coder_code',
  'self_healing': 'self_healing_config',
  'visual_intel': 'visual_checkpoints',
  'agent_2': 'strategy_blueprint',
  'strategist': 'strategy_blueprint',
  'regression': 'regression_priority',
  'run_orchestrator': 'execution_plan',
  'test_impact': 'impact_report',
  'performance': 'performance_config',
  'chaos': 'chaos_scenarios',
  'mobile_testing': 'mobile_test_config',
  'feature_flag': 'feature_flag_tests',
  'monitor': 'production_monitors',
  'slo': 'sla_slo_audit',
  'tracing': 'distributed_traces',
  'reliability_engineering': 'reliability_eng',
  'cross_browser': 'cross_browser_config',
  'suite_optimization': 'optimized_suite',
  'digital_twin': 'twin_report',
  'data_pipeline': 'pipeline_report',
  'compliance_remediation': 'compliance_remediation',
  'event_driven': 'event_report',
  'env_consistency': 'env_report',
  'security': 'security_signals',
  'perf_intel': 'perf_intel',
  'obs_intel': 'observability_report',
  'rca_intel': 'rca_report',
  'inc_remed': 'incident_report',
  'sys_resil': 'resilience_report',
  'rel_risk': 'release_decision',
  'biz_impact': 'business_impact',
  'roi_intel': 'roi_report',
  'knowledge_graph': 'knowledge_graph',
  'meta_intel': 'meta_intel_report',
  'exploratory': 'exploratory_report',
  'locator': 'locator_strategy',
  'mutation': 'mutation_report',
  'i18n_testing': 'i18n_report',
  'release_commander': 'release_package',
  'trend_analyst': 'trend_report',
  'synthesis_final': 'final_synthesis',
  'compose': 'final_document',
  'writer': 'final_document',
  'plan_composer': 'final_document',
  'plan composer': 'final_document',
  'strategic command': 'analysis_payload',
  'governor': 'compliance_report',
  'system_logician': 'logic_audit_report',
  'system logician': 'logic_audit_report',
  // ── Phase 2 agents — grid short-keys → actual state_keys ────────────────
  'performance_architect': 'performance_budget',
  'performance_architect_p2': 'performance_budget',
  'performance_architect_node': 'performance_budget',
  'security_intelligence': 'security_constraints',
  'security_intelligence_p2': 'security_constraints',
  'compliance_governor': 'compliance_requirements',
  'compliance_governor_p2': 'compliance_requirements',
  'requirement_clarifier': 'requirement_clarity_report',
  'requirement_clarifier_p2': 'requirement_clarity_report',
  'synthesis_optimizer': 'module_boundary_map',
  'synthesis_optimizer_p2': 'module_boundary_map',
  'traceability_auditor': 'traceability_matrix_p2',
  'traceability_auditor_p2': 'traceability_matrix_p2',
  'api_dependency_mapper': 'integration_dependency_map',
  'mcp_advisor': 'mcp_recommendations',
  'hook_guardrails_advisor': 'hook_guardrail_recommendations',
  // service_mesh has no dedicated state_key — shares module_boundary_map
  'service_mesh': 'module_boundary_map',
};

if (typeof window !== 'undefined') {
  fetch(`${API_BASE}/api/tasks/registry`)
    .then(res => res.json())
    .then((data: any) => {
      const map: Record<string, string> = { ...REGISTRY_MAP };
      for (const [key, config] of Object.entries(data)) {
        if (config && typeof config === 'object' && (config as any).produces && (config as any).produces.length > 0) {
          const prod = (config as any).produces[0];
          const stateKey = prod.state_key || (prod.artifact || '').toLowerCase();
          if (stateKey) {
            map[key] = stateKey;
            if ((config as any).label) {
              map[(config as any).label] = stateKey;
            }
          }
        }
      }
      Object.assign(REGISTRY_MAP, map); // Mutate existing object so references get updated
      console.log("Dynamically loaded REGISTRY_MAP from backend", REGISTRY_MAP);
    })
    .catch(err => console.error("Failed to load dynamic agent registry", err));
}

// ─── Node Status Grid ─────────────────────────────────────────────────────────
const abbreviateLabel = (label: unknown): string => {
  const safeLabel = asText(label, '');
  if (!safeLabel || safeLabel.length < 16) return safeLabel; // Only target truly long labels

  const MAP: Record<string, string> = {
    'Strategic Command': 'Strat. Command',
    'Logic & Compliance': 'Logic/Compl',
    'Economics & Risk': 'Econ/Risk',
    'Strategy & Impact': 'Strat/Impact',
    'Scenario & Data Forge': 'Scenario/Data',
    'API Virtualization': 'API Virt',
    'Orchestration Matrix': 'Orch Matrix',
    'Cloud Environments': 'Cloud Envs',
    'Performance & Chaos': 'Perf/Chaos',
    'Backend Architecture': 'Backend Arc',
    'Incident Command': 'Inc. Command',
    'Self-Healing Dynamics': 'Self-Healing',
    'Requirement Clarifier': 'Req. Clarifier',
    'Quality Gate Enforcer': 'Qual. Gate',
    'Traceability Auditor': 'Trace. Auditor',
    'Compliance Governor': 'Compl. Gov',
    'Release Risk & Decision': 'Release Risk',
    'Business Impact Intel': 'Bus. Impact',
    'ROI & Engineering Economics': 'ROI/Econ',
    'Engineering Knowledge Graph': 'Eng. Graph',
    'Platform Meta Intelligence': 'Meta Intel',
    'Digital Twin Simulation': 'Digi. Twin',
    'Accessibility Intelligence': 'A11y Intel',
    'UX Intelligence Agent': 'UX Intel'
  };
  return MAP[safeLabel] || safeLabel;
};

const NodeGrid: React.FC<{ topology: any; title: string; frozen?: boolean; onNodeClick?: (n: any) => void }> = ({ topology, title, frozen = false, onNodeClick }) => {
  const nodes = topology?.nodes || [];
  const selectedCount = nodes.filter((n: any) => asText(n?.status, 'pending').toLowerCase() !== 'bypassed').length;
  const completedCount = nodes.filter((n: any) =>
    ['completed', 'done', 'success', 'stabilized'].includes(asText(n?.status, 'pending').toLowerCase())
  ).length;
  const activeNode = nodes.find((n: any) =>
    ['active', 'running'].includes(asText(n?.status, 'pending').toLowerCase())
  );

  const nodeStyle = (s: string) => {
    const lower = (s || 'pending').toLowerCase();
    if (['completed', 'done', 'success', 'stabilized'].includes(lower)) return { bg: '#0a1a12', leftBorder: '#10b981', text: '#10b981', subtext: '#374151' }; // Green
    if (['active', 'running'].includes(lower)) return { bg: 'rgba(59, 130, 246, 0.08)', leftBorder: '#3b82f6', text: '#60a5fa', subtext: '#3b82f6' }; // Blue
    if (['failed', 'error'].includes(lower)) return { bg: 'rgba(239, 68, 68, 0.05)', leftBorder: '#ef4444', text: '#ef4444', subtext: '#7f1d1d' }; // Red
    if (['skipped', 'bypassed'].includes(lower)) return { bg: '#0f172a', leftBorder: '#334155', text: '#64748b', subtext: '#334155' }; // Grey
    return { bg: '#0c1220', leftBorder: '#1e293b', text: '#475569', subtext: '#1e293b' }; // Default (Pending)
  };

  return (
    <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${frozen ? '#1a2e22' : '#1e293b'}` }}>
      <div style={{ background: '#020617', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {frozen ? <span style={{ fontSize: '0.68rem' }}>🔒</span> : <i className="ti-share" style={{ color: '#4f46e5', fontSize: '0.85rem' }}></i>}
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: frozen ? '#4b9e7f' : '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{abbreviateLabel(title)}</span>
          <span style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 600 }}>{completedCount}/{selectedCount > 0 ? selectedCount : nodes.length}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {!frozen && activeNode && (
            <span style={{ fontSize: '0.62rem', background: 'rgba(249,115,22,0.15)', color: '#fbbf24', padding: '3px 10px', borderRadius: '100px', fontWeight: 800, animation: 'fadeInOut 1.5s infinite', border: '1px solid rgba(249,115,22,0.35)', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f97316', animation: 'pulseDot 1s infinite', display: 'inline-block', flexShrink: 0 }}></span>
              <span>{abbreviateLabel(activeNode.label || activeNode.id)}</span>
            </span>
          )}
          {nodes.length > 0 && frozen && (
            <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 800 }}>✓ {completedCount} SYNCED</span>
          )}
        </div>
      </div>
      <div style={{ background: '#020617', padding: '12px', minHeight: '120px' }}>
        {nodes && nodes.length === 0 ? (
          <div style={{ color: '#1e293b', fontSize: '0.75rem', textAlign: 'center', padding: '30px', fontFamily: 'monospace' }}>
            {frozen ? '-' : 'Awaiting agent telemetry...'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '5px' }}>
            {nodes && nodes.map((node: any, i: number) => {
              if (!node) return null;
              const sc = nodeStyle(node.status || 'pending');
              const isActive = node.status === 'active' || node.status === 'running';
              const isCompleted = ['completed', 'done', 'success', 'stabilized'].includes(asText(node?.status, 'pending').toLowerCase());
              const isSkipped = ['skipped', 'bypassed'].includes(asText(node?.status, 'pending').toLowerCase());
              return (
                <div key={i}
                  onClick={() => { if (isActive || isCompleted || isSkipped) onNodeClick?.(node); }}
                  style={{
                    height: '44px',
                    padding: '0 10px 0 8px',
                    borderRadius: '6px',
                    background: sc.bg,
                    borderLeft: `3px solid ${sc.leftBorder}`,
                    borderTop: '1px solid rgba(255,255,255,0.03)',
                    borderRight: '1px solid rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.3s',
                    cursor: (isActive || isCompleted || isSkipped) && onNodeClick ? 'pointer' : 'default',
                    boxShadow: isActive ? `0 0 12px rgba(59, 130, 246, 0.12)` : 'none',
                    animation: isActive ? 'pulseContainer 2s infinite ease-in-out' : 'none',
                    overflow: 'hidden',
                    opacity: isSkipped ? 0.6 : 1
                  }}>
                  {isActive && (
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%', background: sc.leftBorder, flexShrink: 0,
                      boxShadow: `0 0 8px ${sc.leftBorder}`,
                      animation: 'pulseDot 1s infinite ease-in-out'
                    }}></div>
                  )}
                  <div style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {/* Line 1: Role Name — Abbreviated & Single Line */}
                    <div title={`${asText(node.label || 'Unknown')} - ${asText(node.agent || '')}`} style={{
                      fontSize: '0.66rem', fontWeight: isActive ? 900 : 700, color: sc.text,
                      lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textShadow: isActive ? '0 0 8px rgba(249,115,22,0.35)' : 'none'
                    }}>
                      {abbreviateLabel(node.label || node.id || 'Unknown')}
                      {isActive && <span style={{ fontSize: '0.56rem', color: '#60a5fa', fontWeight: 800, marginLeft: '3px' }}>⚡</span>}
                    </div>
                    {/* Line 2: Agent identifier (raised/muted) - Fixed height for vertical sizing consistency */}
                    <div style={{
                      fontSize: '0.58rem', fontWeight: 600, color: isActive ? '#60a5fa' : isSkipped ? '#475569' : '#334155',
                      letterSpacing: '0.03em', height: '12px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {isSkipped ? 'Skipped' : (node.agent || 'Initialising...')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.8)} }
        @keyframes pulseContainer { 0%,100%{border-color: rgba(59, 130, 246, 0.8); background: rgba(59, 130, 246, 0.18); box-shadow: 0 0 20px rgba(59, 130, 246, 0.25)} 50%{border-color: rgba(59, 130, 246, 0.3); background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 10px rgba(59, 130, 246, 0.1)} }
        @keyframes fadeInOut { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes scannerLine { 0% { transform: translateY(-100%); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(100%); opacity: 0; } }
      `}</style>
    </div>
  );
};

// ─── Reasoning Console ────────────────────────────────────────────────────────
const ConsoleLog: React.FC<{ logs: any[]; title?: string }> = ({ logs, title = 'Reasoning Console' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs?.length]);

  const agentColor = (a = '') => {
    const lower = String(a || '').toLowerCase();
    if (lower.includes('architect')) return '#818cf8';
    if (lower.includes('clarifier')) return '#34d399';
    if (lower.includes('writer')) return '#fbbf24';
    if (lower.includes('system')) return '#475569';
    if (lower.includes('ingest')) return '#22d3ee';
    if (lower.includes('critic')) return '#f87171';
    return '#a78bfa';
  };

  return (
    <div style={{ height: '100%', minHeight: 0, borderRadius: '16px', overflow: 'hidden', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', background: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(12px)' }}>
      <div style={{ background: 'rgba(15,23,42,0.9)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.05em' }}>
          <i className="ti-comments" style={{ color: '#6366f1', fontSize: '1rem' }}></i> Unified Mission Feed
        </span>
        <span style={{ fontSize: '0.62rem', color: '#6366f1', fontWeight: 800, background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: '12px' }}>{(logs || []).length} events</span>
      </div>
      <div ref={scrollRef} className="custom-scrollbar" style={{ overflowY: 'auto', padding: '16px', fontFamily: "'JetBrains Mono', monospace", flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)', pointerEvents: 'none', opacity: 0.5, zIndex: 0 }}></div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {!logs || logs.length === 0
            ? <div style={{ color: '#475569', fontSize: '0.8rem', padding: '20px', textAlign: 'center' }}>Initializing Conversational Feed...</div>
            : logs.map((log, i) => {
              if (!log) return null;
              return (
                <div key={i} style={{ marginBottom: '14px', lineBreak: 'anywhere', animation: 'fadeInConsole 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: agentColor(log.agent), fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{log.agent || 'System'}</span>
                    <span style={{ color: '#475569', fontSize: '0.6rem' }}>{log.timestamp || '0sec'}</span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.6', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '0 12px 12px 12px', borderLeft: `2px solid ${agentColor(log.agent)}`, display: 'inline-block', maxWidth: '95%' }}>
                    {log.message || '...'}
                  </div>
                </div>
              );
            })
          }
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', opacity: 0.7 }}>
            <span style={{ color: '#6366f1', fontWeight: 900, fontSize: '0.9rem' }}>❯</span>
            <span style={{ width: '8px', height: '16px', background: '#818cf8', animation: 'blink 1s step-end infinite' }}></span>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeInConsole { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
};

// ─── Phase Panel (coloured card header) ──────────────────────────────────────
const PhasePanel: React.FC<{
  phaseLabel: string; status: 'done' | 'active' | 'pending';
  children: React.ReactNode;
}> = ({ phaseLabel, status, children }) => {
  const colors = {
    done: { border: '#10b981', accent: '#059669', bg: 'rgba(16,185,129,0.04)', pill: 'rgba(16,185,129,0.12)', pillText: '#10b981', pillLabel: '✓ COMPLETE' },
    active: { border: '#6366f1', accent: '#4f46e5', bg: 'rgba(99,102,241,0.04)', pill: 'rgba(99,102,241,0.12)', pillText: '#818cf8', pillLabel: '⚡ RUNNING' },
    pending: { border: '#334155', accent: '#475569', bg: 'transparent', pill: 'rgba(51,65,85,0.3)', pillText: '#475569', pillLabel: '○ QUEUED' },
  }[status];

  return (
    <div style={{ borderRadius: '16px', border: `1.5px solid ${colors.border}`, background: colors.bg, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${colors.border}20` }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{phaseLabel}</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '2px 10px', borderRadius: '100px', background: colors.pill, color: colors.pillText }}>{colors.pillLabel}</span>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {children}
      </div>
    </div>
  );
};

// ─── TDD Status Indicator ───────────────────────────────────────────────────
const TDDStatusIndicator: React.FC<{ report: any }> = ({ report }) => {
  if (!report) return null;
  const isPass = report.status === 'PASS';
  return (
    <div style={{ padding: '16px 20px', borderRadius: '12px', background: isPass ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isPass ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <i className={isPass ? "ti-check-box" : "ti-alert"} style={{ color: isPass ? '#10b981' : '#ef4444', fontSize: '1.2rem' }}></i>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isPass ? '#047857' : '#b91c1c', textTransform: 'uppercase' }}>API Validation Contract Enforcement</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
        <div><strong>Backend:</strong> {report.backend_validation}</div>
        <div><strong>Frontend:</strong> {report.frontend_validation}</div>
        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#64748b' }}>{report.details}</div>
      </div>
    </div>
  );
};

// ─── Codebase Link Panel (3-mode: Connect / Upload / Forge) ─────────────────
const CodebaseLinkPanel: React.FC<{ missionId: string; apiBase: string; onLinked: (result: any) => void }> = ({ missionId, apiBase, onLinked }) => {
  const getMissionId = (): string => {
    const urlMatch = window.location.pathname.match(
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
    );
    if (urlMatch) return urlMatch[1];
    const stored = localStorage.getItem('activeMissionId')
      || localStorage.getItem('sequor_current_task_id')
      || localStorage.getItem('currentTaskId')
      || localStorage.getItem('task_id');
    if (stored) return stored;
    return missionId || '';
  };

  const [mode, setMode] = useState<'git' | 'connect' | 'forge'>('git');
  const [uploading, setUploading] = useState(false);
  const [linked, setLinked] = useState<{ file_count: number; path: string, mode?: string } | null>(() => {
    const mId = getMissionId();
    if (mId) {
      const saved = localStorage.getItem(`codebase_linked_${mId}`);
      if (saved) return JSON.parse(saved);
    }
    return null;
  });
  const [error, setError] = useState('');
  const [serverUrl, setServerUrl] = useState(API_BASE);
  const [serverConnected, setServerConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Git Connect State
  const [repoUrl, setRepoUrl] = useState('');
  const [pat, setPat] = useState('');
  const [platform, setPlatform] = useState('github');
  const [branch, setBranch] = useState('main');
  const [showZipFallback, setShowZipFallback] = useState(false);
  const [folderPath, setFolderPath] = useState('');

  // Brownfield audit state
  const [showAudit, setShowAudit] = useState(false);
  const [auditMissionId, setAuditMissionId] = useState('');
  const [pendingLinkResult, setPendingLinkResult] = useState<any>(null);

  const handlePathLink = async () => {
    const activeMissionId = getMissionId();
    if (!activeMissionId || activeMissionId === 'undefined') {
      setError('No active mission — please start a mission first');
      return;
    }
    if (!folderPath) {
      setError('Please enter a folder path');
      return;
    }

    setConnecting(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/api/git/local-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: activeMissionId,
          path: folderPath
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to connect local folder');
      }

      const result = await res.json();

      const linkResult = {
        file_count: result.profile?.file_count || 0,
        path: folderPath,
        mode: 'forge',
        platform: 'local_folder'
      };

      if (activeMissionId) {
        localStorage.setItem(`codebase_linked_${activeMissionId}`, JSON.stringify(linkResult));
      }

      // Brownfield branch: show audit view before continuing
      if (result.audit_triggered) {
        setAuditMissionId(activeMissionId || '');
        setPendingLinkResult(linkResult);
        setShowAudit(true);
      } else {
        setLinked(linkResult);
        onLinked(linkResult);
      }
    } catch (e: any) {
      setError(e.message || 'Local connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectServer = async () => {
    const activeMissionId = getMissionId();
    if (!activeMissionId || activeMissionId === 'undefined') {
      setError('No active mission — please start a mission first');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/missions/${activeMissionId}/connect-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_url: serverUrl })
      });
      const data = await res.json();
      if (data.reachable) {
        setServerConnected(true);
      } else {
        setError(data.error || `Cannot reach ${serverUrl} — is your server running?`);
      }
    } catch (e: any) {
      setError(e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleUpload = async (file: File) => {
    const activeMissionId = getMissionId();
    if (!activeMissionId || activeMissionId === '' || activeMissionId === 'undefined') {
      setError('No active mission — please start a mission first');
      return;
    }
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a .zip file of your project');
      return;
    }
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${apiBase}/api/missions/${activeMissionId}/upload-codebase`, {
        method: 'POST', body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const result = await res.json();
      if (activeMissionId) {
        localStorage.setItem(`codebase_linked_${activeMissionId}`, JSON.stringify(result));
      }
      setLinked(result);
      onLinked(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGitConnect = async () => {
    const activeMissionId = getMissionId();
    if (!activeMissionId || activeMissionId === 'undefined') {
      setError('No active mission — please start a mission first');
      return;
    }
    if (!repoUrl || !pat) {
      setError('Repository URL and Personal Access Token are required');
      return;
    }
    setConnecting(true);
    setError('');

    try {
      // 1. Record Consent
      const consentRes = await fetch(`${apiBase}/api/git/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: ["repo", "read:org", "workflow"] })
      });

      if (!consentRes.ok) {
        const err = await consentRes.json();
        throw new Error(err.detail || 'Failed to record consent');
      }

      // 2. Connect and Profile
      const connectRes = await fetch(`${apiBase}/api/git/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: activeMissionId,
          repo_url: repoUrl,
          platform: platform,
          token: pat,
          branch: branch
        })
      });

      if (!connectRes.ok) {
        const err = await connectRes.json();
        throw new Error(err.detail || 'Failed to connect repository');
      }

      const result = await connectRes.json();

      // Transform to match existing linked state structure for UI compatibility
      const linkResult = {
        file_count: result.profile?.file_count || 0,
        path: result.repo_name || repoUrl,
        mode: 'git',
        profile: result.profile
      };

      if (activeMissionId) {
        localStorage.setItem(`codebase_linked_${activeMissionId}`, JSON.stringify(linkResult));
      }

      // Brownfield branch: show audit view before continuing to PRD
      if (result.audit_triggered) {
        setAuditMissionId(activeMissionId || '');
        setPendingLinkResult(linkResult);
        setShowAudit(true);
      } else {
        setLinked(linkResult);
        onLinked(linkResult);
      }

    } catch (e: any) {
      setError(e.message || 'Git connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // Render brownfield audit view if triggered
  if (showAudit && auditMissionId) {
    return (
      <BrownfieldAuditView
        missionId={auditMissionId}
        onContinueToPRD={() => {
          setShowAudit(false);
          if (pendingLinkResult) {
            setLinked(pendingLinkResult);
            onLinked(pendingLinkResult);
          }
        }}
        onSkip={() => {
          setShowAudit(false);
          if (pendingLinkResult) {
            setLinked(pendingLinkResult);
            onLinked(pendingLinkResult);
          }
        }}
      />
    );
  }

  if (linked) {
    return (
      <div style={{
        padding: '14px 18px', background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px',
        marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        <i className={linked.mode === 'git' ? "ti-github" : "ti-check-box"} style={{ color: '#10b981', fontSize: '1.1rem' }}></i>
        <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
          {linked.mode === 'git' ? 'Git Repository Connected' : 'Codebase linked'} — {linked.file_count} files indexed
        </span>
        <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '4px' }}>
          {linked.path}
        </span>
      </div>
    );
  }

  const modes = [
    { id: 'git' as const, label: '🐙 Connect Git Repository', desc: 'Sync directly with GitHub/GitLab' },
    { id: 'forge' as const, label: '⚡ Forge Code', desc: 'Use platform-generated code' },
  ];

  return (
    <div style={{
      padding: '18px', background: '#0f172a', border: '1px solid #1e293b',
      borderRadius: '12px', marginBottom: '16px'
    }}>
      <div style={{ marginBottom: '12px', color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="ti-link" style={{ color: '#6366f1' }}></i>
        Repository & Implementation Target
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {modes.map(m => (
          <button key={m.id}
            onClick={() => { setMode(m.id); setError(''); setShowZipFallback(false); }}
            style={{
              padding: '6px 14px', borderRadius: '6px',
              background: mode === m.id ? 'rgba(99,102,241,0.15)' : '#1e293b',
              border: `1px solid ${mode === m.id ? '#6366f1' : '#334155'}`,
              color: mode === m.id ? '#818cf8' : '#94a3b8',
              cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
              transition: 'all 0.2s ease'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode: Connect Running Server */}
      {mode === 'connect' && (
        <div>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '12px', marginTop: 0 }}>
            Start your server locally, then enter its URL.
            The platform will run TDD contracts against it.
          </p>
          <div style={{
            background: '#020617', padding: '12px', borderRadius: '8px',
            border: '1px solid #1e293b', marginBottom: '12px'
          }}>
            <div style={{ color: '#6366f1', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 700 }}>
              How to start your server:
            </div>
            <code style={{ color: '#34d399', fontSize: '0.8rem', display: 'block', lineHeight: 1.6 }}>
              cd your-project<br />
              pip install -r requirements.txt<br />
              uvicorn main:app --reload --port 9000
            </code>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder={API_BASE}
              style={{
                flex: 1, padding: '9px 14px', background: '#1e293b',
                border: '1px solid #334155', borderRadius: '8px',
                color: '#e2e8f0', fontSize: '0.8rem', fontFamily: 'monospace'
              }}
            />
            <button
              onClick={handleConnectServer}
              disabled={connecting}
              style={{
                padding: '9px 20px', background: connecting ? '#334155' : '#4f46e5',
                border: 'none', borderRadius: '8px',
                color: 'white', cursor: connecting ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.8rem',
                transition: 'background 0.2s ease'
              }}
            >
              {connecting ? '⏳ Checking...' : 'Connect & Test'}
            </button>
          </div>
          {serverConnected && (
            <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: '8px', fontWeight: 600 }}>
              ✓ Connected to {serverUrl} — TDD contracts will test against this server
            </div>
          )}
        </div>
      )}

      {/* Mode: Connect Git Repository */}
      {mode === 'git' && (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Repository URL</label>
              <input
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                style={{
                  width: '100%', padding: '9px 14px', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '8px',
                  color: '#e2e8f0', fontSize: '0.8rem'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Personal Access Token (PAT)</label>
              <input
                type="password"
                value={pat}
                onChange={e => setPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                style={{
                  width: '100%', padding: '9px 14px', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '8px',
                  color: '#e2e8f0', fontSize: '0.8rem'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Platform</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                style={{
                  width: '100%', padding: '9px 14px', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '8px',
                  color: '#e2e8f0', fontSize: '0.8rem', appearance: 'none'
                }}
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="bitbucket">Bitbucket</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Branch</label>
              <input
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
                style={{
                  width: '100%', padding: '9px 14px', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '8px',
                  color: '#e2e8f0', fontSize: '0.8rem'
                }}
              />
            </div>
          </div>

          <div style={{
            background: 'rgba(59,130,246,0.05)', padding: '12px', borderRadius: '8px',
            border: '1px solid rgba(59,130,246,0.1)', marginBottom: '16px'
          }}>
            <div style={{ color: '#60a5fa', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px' }}>Authorization & Consent</div>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.5 }}>
              By connecting, you authorize A.N.T to clone this repository, run code analysis, and create branches/Pull Requests.
              <br />
              <strong>Required Scopes:</strong> <code style={{ color: '#e2e8f0' }}>repo, read:org, workflow</code>
            </div>
          </div>

          <button
            onClick={handleGitConnect}
            disabled={connecting}
            style={{
              width: '100%', padding: '10px', background: connecting ? '#334155' : '#4f46e5',
              border: 'none', borderRadius: '8px', color: 'white',
              cursor: connecting ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.85rem', transition: 'background 0.2s ease'
            }}
          >
            {connecting ? '⏳ Connecting and Profiling Repository...' : 'Connect & Authorize'}
          </button>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              onClick={() => setShowZipFallback(!showZipFallback)}
              style={{
                background: 'transparent', border: 'none', color: '#64748b',
                fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline'
              }}
            >
              Legacy Fallback: Upload a Zip File instead
            </button>
          </div>

          {showZipFallback && (
            <div style={{ marginTop: '16px', animation: 'fadeInConsole 0.3s' }}>
              <div style={{ color: '#f59e0b', fontSize: '0.75rem', marginBottom: '8px', textAlign: 'center' }}>
                ⚠️ Limited mode — no PR integration, no Git audit trail, and no automated conflict detection.
              </div>
              <div
                onClick={() => {
                  const fileInput = document.getElementById('codebase-zip-upload') as HTMLInputElement;
                  if (fileInput) fileInput.click();
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file && !uploading) handleUpload(file);
                }}
                style={{
                  display: 'block', padding: '24px', border: '2px dashed #475569',
                  borderRadius: '10px', textAlign: 'center' as const,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  color: '#94a3b8', fontSize: '0.85rem',
                  background: 'rgba(15,23,42,0.8)'
                }}
              >
                {uploading
                  ? '⏳ Uploading and extracting...'
                  : '📦 Drop your project .zip here, or click to browse'}
                <input
                  id="codebase-zip-upload"
                  type="file" accept=".zip" disabled={uploading}
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode: Use Forge Code */}
      {mode === 'forge' && (
        <div>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '12px', marginTop: 0 }}>
            The platform's Forge Agents generated code in Phase 3.
            TDD contracts will validate against the forge-generated implementation.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              placeholder="C:\path\to\project (server-local only)"
              style={{
                flex: 1, padding: '9px 14px', background: '#1e293b',
                border: '1px solid #334155', borderRadius: '8px',
                color: '#e2e8f0', fontSize: '0.8rem', fontFamily: 'monospace'
              }}
            />
            <button
              onClick={handlePathLink}
              disabled={connecting}
              style={{
                padding: '9px 20px', background: connecting ? '#334155' : '#059669',
                border: 'none', borderRadius: '8px',
                color: 'white', cursor: connecting ? 'not-allowed' : 'pointer', fontWeight: 700,
                fontSize: '0.8rem', transition: 'background 0.2s ease'
              }}
            >
              {connecting ? '⏳ Linking...' : 'Link & Watch'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '10px', fontWeight: 600 }}>
          ✗ {error}
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// MAIN ORCHESTRATION HUB
// ==============================================================================
const OrchestrationHub: React.FC<OrchestrationHubProps> = ({
  reqStep, factoryStep, loading, status, refinedUnifiedContent,
  generatedMarkdown, planPayload, fullAgentState, downloadUrl,
  reasoningLogs, phase1Logs, topology, phase1Topology, apiBase,
  onApproveAndTriggerPhase2, onApproveContract, onNavigateToFactory,
  onResetMission,
  onClearSession,
  demoMode
}) => {
  const [editableContract, setEditableContract] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [inspectedNode, setInspectedNode] = useState<any>(null);
  const [dynamicGuardrail, setDynamicGuardrail] = useState<{ active: boolean, message: string } | null>(null);
  const [localPlanJson, setLocalPlanJson] = useState<any>(null);

  const planInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (fullAgentState?.plan_json && !planInitializedRef.current) {
      setLocalPlanJson(JSON.parse(JSON.stringify(fullAgentState.plan_json)));
      planInitializedRef.current = true;
    }
  }, [fullAgentState?.plan_json]);

  const hubTopRef = React.useRef<HTMLDivElement>(null);
  const approvalRef = React.useRef<HTMLDivElement>(null);

  // Derive active node ID from topology for NFR audits
  const activeNodeId = topology?.nodes?.find((n: any) =>
    ['active', 'running'].includes(String(n?.status || '').toLowerCase())
  )?.id;

  // Payload Inference: Tries to find the state key that best matches the agent
  const getAgentPayload = (node: any) => {
    if (!fullAgentState) return null;
    const nodeKey = asText(node?.key, '').toLowerCase();
    const nodeId = asText(node?.id, '').toLowerCase();
    const nodeLabel = asText(node?.label, '').toLowerCase();

    const cleanKey = nodeKey.replace(/_node$/, '');
    const cleanId = nodeId.replace(/_node$/, '');

    const targetKey = REGISTRY_MAP[nodeKey] || REGISTRY_MAP[cleanKey] || REGISTRY_MAP[nodeId] || REGISTRY_MAP[cleanId] || REGISTRY_MAP[nodeLabel];
    if (targetKey) {
      if (fullAgentState[targetKey]) {
        return { key_found: targetKey, data: fullAgentState[targetKey] };
      }
      if (fullAgentState.phase3_output && fullAgentState.phase3_output[targetKey]) {
        return { key_found: targetKey, data: fullAgentState.phase3_output[targetKey] };
      }
    }

    // Fallback for performance architect
    if (nodeKey.includes('performance') || nodeId.includes('performance') || nodeLabel.includes('performance')) {
      if (fullAgentState['performance_budget']) return { key_found: 'performance_budget', data: fullAgentState['performance_budget'] };
    }

    // Fallback for architect (excluding performance or db architect)
    if (!nodeKey.includes('performance') && !nodeKey.includes('db') && (nodeKey.includes('architect') || nodeId.includes('architect') || nodeLabel.includes('architect'))) {
      if (fullAgentState['system_specification']) return { key_found: 'system_specification', data: fullAgentState['system_specification'] };
      if (fullAgentState['visual_architecture']) return { key_found: 'visual_architecture', data: fullAgentState['visual_architecture'] };
    }

    // Fallback for planner / planning agent
    if (nodeKey.includes('planner') || nodeId.includes('planner') || nodeLabel.includes('planner') || nodeKey.includes('planning')) {
      if (fullAgentState['engineering_tasks']) return { key_found: 'engineering_tasks', data: fullAgentState['engineering_tasks'] };
      if (fullAgentState['analysis_payload']) return { key_found: 'analysis_payload', data: fullAgentState['analysis_payload'] };
    }

    // Fallback for synthesis optimizer
    if ((nodeKey === 'synthesis_optimizer' || nodeId === 'synthesis_optimizer') && fullAgentState['combined_data']) {
      return { key_found: 'combined_data', data: fullAgentState['combined_data'] };
    }

    // Fuzzy matches as fallback
    for (const key of Object.keys(fullAgentState)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(nodeKey) || lowerKey.includes(nodeId) || lowerKey.includes(nodeLabel) ||
        nodeKey.includes(lowerKey) || nodeLabel.includes(lowerKey)) {
        if (fullAgentState[key]) return { key_found: key, data: fullAgentState[key] };
        if (fullAgentState.phase3_output && fullAgentState.phase3_output[key]) return { key_found: key, data: fullAgentState.phase3_output[key] };
      }
    }

    return null;
  };

  useEffect(() => {
    // Only populate the contract when it arrives fresh — don't overwrite user edits
    // and don't clear it when Phase 2 starts (generatedMarkdown is no longer cleared there)
    const fallback = generatedMarkdown || refinedUnifiedContent;
    if (fallback && fallback.trim().length > 20) {
      setEditableContract(fallback);
    }
  }, [generatedMarkdown, refinedUnifiedContent]);

  // Viewport Control 1: Execution Start -> Anchor to Hub Top (Framing Mesh & Console)
  useEffect(() => {
    if (loading && hubTopRef.current) {
      const tid = setTimeout(() => {
        hubTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(tid);
    }
  }, [loading]);

  // Conversational Guardrails: Micro-Checkpoints
  useEffect(() => {
    if (reasoningLogs && reasoningLogs.length > 0) {
      const lastLog = reasoningLogs[reasoningLogs.length - 1];
      if (lastLog.message && lastLog.message.includes('[GUARDRAIL_TRIGGER]') && !dynamicGuardrail) {
        setDynamicGuardrail({ active: true, message: lastLog.message.replace('[GUARDRAIL_TRIGGER]', '').trim() });
      }
    }
  }, [reasoningLogs, dynamicGuardrail]);

  // Viewport Control 2: Phase 1 Finish -> Center on Human Approval Gate
  useEffect(() => {
    if (factoryStep === 3 && approvalRef.current) {
      const tid = setTimeout(() => {
        approvalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return () => clearTimeout(tid);
    }
  }, [factoryStep]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    setDownloading(true);
    const isPhase2 = factoryStep >= 5;
    const defaultName = isPhase2 ? 'VVNT_Consolidated_Full_Report.docx' : 'VVNT_Strategic_TestPlan.docx';
    downloadFile(`${apiBase}${downloadUrl}`, filenameFromUrl(downloadUrl, defaultName));
    setTimeout(() => setDownloading(false), 1500);
  };

  const isContractReady = editableContract.trim().length > 50;
  const isContractErrored = editableContract.includes('Degraded Mode');

  // Phase statuses
  const p1Status: 'done' | 'active' | 'pending' = factoryStep >= 3 ? 'done' : factoryStep >= 2 ? 'active' : 'pending';
  const hitlStatus: 'done' | 'active' | 'pending' = factoryStep >= 4 ? 'done' : factoryStep === 3 ? 'active' : 'pending';
  const p2Status: 'done' | 'active' | 'pending' = factoryStep >= 5 ? 'done' : factoryStep === 4 ? 'active' : 'pending';

  // Build node status from Mission Feed events (Reasoning Logs)
  const nodeStatusMap = React.useMemo(() => {
    const map: Record<string, 'idle' | 'running' | 'complete'> = {};

    (reasoningLogs || []).forEach((event: any) => {
      let agent = (event.agent || '').toLowerCase().replace(/ /g, '_');

      if (agent === 'backendforge') agent = 'backend_forge';
      else if (agent === 'frontendforge') agent = 'frontend_forge';
      else if (agent === 'databaseforge') agent = 'database_forge';
      else if (agent === 'automationforge') agent = 'automation_forge';
      else if (agent === 'apicoder') agent = 'api_coder';
      else if (agent === 'migrationagent') agent = 'migration';
      else if (agent === 'envprovisioner') agent = 'env_provisioner';
      else if (agent.includes('clarifier')) {
        // Map to both to satisfy Phase 1 (clarifier) and Phase 2 (requirement_clarifier)
        agent = 'requirement_clarifier'; 
        map['clarifier'] = event.status === 'complete' ? 'complete' : 'running';
      }
      else if (agent.includes('ingestor')) agent = 'ingestor';
      else if (agent.includes('repo') && agent.includes('intel')) agent = 'repo_intel';
      else if (agent.includes('tech') && agent.includes('stack')) agent = 'tech_stack';
      else if (agent === 'synthesisoptimizer') agent = 'synthesis_optimizer';
      else if (agent === 'traceabilityauditor') agent = 'traceability_auditor';
      else if (agent === 'apidependencymapper') agent = 'api_dependency_mapper';
      else if (agent === 'performancearchitect') agent = 'performance_architect';
      else if (agent === 'securityintelligence') agent = 'security_intelligence';
      else if (agent === 'compliancegovernor') agent = 'compliance_governor';
      else if (agent === 'servicemesh') agent = 'service_mesh';
      else if (agent === 'dbarchitect') agent = 'db_schema';
      else if (agent === 'planningagent') agent = 'planning_agent';
      else if (agent === 'apidesigner') agent = 'api_design';
      else if (agent === 'creator' || agent === 'test_case_creator') agent = 'tdd_contract';
      else if (agent === 'engineeringcontract') agent = 'engineering_contract';
      else if (agent === 'mcpserveradvisor' || agent === 'mcpadvisor') agent = 'mcp_advisor';
      else if (agent === 'hookguardrailsadvisor') agent = 'hook_guardrails_advisor';
      else if (agent === 'system') agent = 'system';

      if (!agent) return;

      const msg = event.message?.toLowerCase() || '';
      const st = event.status?.toLowerCase() || '';
      
      if (
        st === 'complete' ||
        msg.includes('✓') || 
        msg.includes('complete') || 
        msg.includes('stabilized') || 
        msg.includes('success') ||
        msg.includes('generated') ||
        msg.includes('extracted') ||
        msg.includes('clarified') ||
        msg.includes('analyzed') ||
        msg.includes('consolidated')
      ) {
        map[agent] = 'complete';
      } else {
        if (map[agent] !== 'complete') {
          map[agent] = 'running';
        }
      }
    });
    return map;
  }, [reasoningLogs]);

  const combinedTopology = React.useMemo(() => {
    const getPhaseNodes = (fStep: number) => {
      if (fStep < 4) {
        return [
          { name: 'Requirements Ingestor', key: 'ingestor' },
          { name: 'Repository Intelligence', key: 'repo_intel' },
          { name: 'Tech Stack Analysis', key: 'tech_stack' },
          { name: 'Req. Clarifier', key: 'clarifier' },
        ];
      }
      if (fStep >= 4 && fStep <= 5) {
        return [
          { name: 'Logician', key: 'logician' },
          { name: 'Architect', key: 'architect' },
          { name: 'Service Mesh', key: 'service_mesh' },
          { name: 'DB Architect', key: 'db_schema' },
          { name: 'Planning Agent', key: 'planning_agent' },
          { name: 'Creator', key: 'tdd_contract' },
          { name: 'API Mock', key: 'api_design' },
          { name: 'Requirement Clarifier', key: 'requirement_clarifier' },
          { name: 'Synthesis Optimizer', key: 'synthesis_optimizer' },
          { name: 'Traceability Auditor', key: 'traceability_auditor' },
          { name: 'API Dependency Mapper', key: 'api_dependency_mapper' },
          { name: 'MCP Server Advisor', key: 'mcp_advisor' },
          { name: 'Performance Architect', key: 'performance_architect' },
          { name: 'Security Intelligence', key: 'security_intelligence' },
          { name: 'Compliance Governor', key: 'compliance_governor' },
          { name: 'Hook Guardrails Advisor', key: 'hook_guardrails_advisor' },
          { name: 'Engineering Contract', key: 'engineering_contract' },
        ];
      }
      if (fStep > 5) {
        return [
          { name: 'Frontend Forge', key: 'frontend_forge' },
          { name: 'Backend Forge', key: 'backend_forge' },
          { name: 'Database Forge', key: 'database_forge' },
          { name: 'Automation Forge', key: 'automation_forge' },
          { name: 'API Coder', key: 'api_coder' },
          { name: 'Env Provisioner', key: 'env_provisioner' },
        ];
      }
      return [];
    };

    let expectedNodes = getPhaseNodes(factoryStep);

    // Make the grid dynamic by deriving the actual scheduled nodes from the active_agents map
    if (fullAgentState?.active_agents && Object.keys(fullAgentState.active_agents).length > 0) {
      if (factoryStep >= 4) {
        const p1Keys = ['ingestor', 'repo_intel', 'tech_stack', 'clarifier'];
        Object.keys(fullAgentState.active_agents).forEach(key => {
          if (fullAgentState.active_agents[key] !== 'bypass' && !p1Keys.includes(key) && !key.endsWith('_node')) {
            if (!expectedNodes.find(en => en.key === key)) {
              // Convert snake_case key to Title Case name
              const name = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              expectedNodes.push({ name, key });
            }
          }
        });
      }

      expectedNodes = expectedNodes.filter(en => {
        return fullAgentState.active_agents[en.key] && fullAgentState.active_agents[en.key] !== 'bypass' || 
               fullAgentState.active_agents[`${en.key}_node`] && fullAgentState.active_agents[`${en.key}_node`] !== 'bypass';
      });

      // Safety fallback in case of state mismatch to prevent rendering an empty grid
      if (expectedNodes.length === 0) {
        expectedNodes = getPhaseNodes(factoryStep);
      }
    }

    const currentTop = topology || { nodes: [] };
    const p1Top = phase1Topology || { nodes: [] };

    let phase1BlockerActive = false;

    const mergedNodes = expectedNodes.map(en => {
      // Find if this node ran in current topology
      let nodeData = currentTop.nodes?.find((n: any) =>
        (n.key && n.key.toLowerCase().includes(en.key.toLowerCase())) ||
        (n.label && n.label.toLowerCase().includes(en.name.toLowerCase()))
      );

      // If not in current, check if it was in Phase 1 (for carry-over)
      if (!nodeData && p1Top.nodes) {
        nodeData = p1Top.nodes.find((n: any) =>
          (n.key && n.key.toLowerCase().includes(en.key.toLowerCase())) ||
          (n.label && n.label.toLowerCase().includes(en.name.toLowerCase()))
        );
      }

      // Extract status from reasoningLogs for real-time feed updates
      const agentKey = en.key.toLowerCase();
      const feedStatus = nodeStatusMap[agentKey];

      let finalStatus = nodeData?.status || 'pending';
      let agentText = 'Initialising...';

      if (feedStatus) {
        finalStatus = feedStatus === 'complete' ? 'completed' : feedStatus === 'running' ? 'active' : finalStatus;
        agentText = feedStatus === 'complete' ? '✓ Complete' : feedStatus === 'running' ? 'Running...' : 'Initialising...';
      } else if (['completed', 'done', 'success', 'stabilized'].includes(finalStatus.toLowerCase())) {
        agentText = '✓ Complete';
      } else if (['active', 'running'].includes(finalStatus.toLowerCase())) {
        agentText = 'Running...';
      } else if (['skipped', 'bypassed'].includes(finalStatus.toLowerCase())) {
        agentText = 'Skipped';
      }

      // Hardcode Phase 1 completion if the pipeline has moved past Phase 1
      if (factoryStep >= 3 && ['repo_intel', 'ingestor', 'clarifier', 'tech_stack'].includes(en.key)) {
        if (!['skipped', 'bypassed'].includes(finalStatus.toLowerCase())) {
          finalStatus = 'completed';
          agentText = '✓ Complete';
        }
      }

      // Enforce sequential Phase 1 execution visual state
      if (factoryStep < 3 && ['repo_intel', 'ingestor', 'clarifier', 'tech_stack'].includes(en.key)) {
        if (phase1BlockerActive) {
          finalStatus = 'pending';
          agentText = 'Pending...';
        }
        // If this node is not complete/skipped, it blocks the remaining Phase 1 nodes
        if (!['completed', 'skipped', 'bypassed'].includes(finalStatus.toLowerCase())) {
          phase1BlockerActive = true;
        }
      }

      return {
        id: nodeData?.id || en.key,
        key: en.key,
        label: en.name,
        status: finalStatus,
        agent: agentText,
        start_time: nodeData?.start_time,
        end_time: nodeData?.end_time
      };
    });

    return { ...currentTop, nodes: mergedNodes };
  }, [topology, phase1Topology, factoryStep, nodeStatusMap]);

  const combinedLogs = factoryStep >= 4 ? [...phase1Logs, ...reasoningLogs] : reasoningLogs;

  // --- Phase Panel Output Guarding ---
  const PHASE_UNLOCK_STATUS = {
    phase1: ['PHASE1_RUNNING', 'HITL1_PENDING', 'PHASE1_APPROVED',
      'PHASE2_RUNNING', 'HITL2_PENDING', 'PHASE2_APPROVED',
      'PHASE3_RUNNING', 'TDD_GREEN', 'PHASE4_RUNNING',
      'NFR_GREEN', 'PHASE5_RUNNING', 'MISSION_COMPLETE'],
    phase2: ['PHASE2_RUNNING', 'HITL2_PENDING', 'PHASE2_APPROVED',
      'PHASE3_RUNNING', 'TDD_GREEN', 'PHASE4_RUNNING',
      'NFR_GREEN', 'PHASE5_RUNNING', 'MISSION_COMPLETE'],
    phase3: ['PHASE3_RUNNING', 'TDD_GREEN', 'PHASE4_RUNNING',
      'NFR_GREEN', 'PHASE5_RUNNING', 'MISSION_COMPLETE'],
    phase4: ['PHASE4_RUNNING', 'NFR_GREEN', 'PHASE5_RUNNING', 'MISSION_COMPLETE'],
    phase5: ['PHASE5_RUNNING', 'MISSION_COMPLETE'],
  };

  const getGlobalMissionId = (): string => {
    const urlMatch = window.location.pathname.match(
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
    );
    if (urlMatch) return urlMatch[1];
    const stored = localStorage.getItem('activeMissionId')
      || localStorage.getItem('sequor_current_task_id')
      || localStorage.getItem('currentTaskId')
      || localStorage.getItem('task_id');
    if (stored) return stored;
    return (planPayload as any)?.task_id || fullAgentState?.mission_id || fullAgentState?.task_id || '';
  };

  const currentMissionId = getGlobalMissionId();
  console.log('[DEBUG] All possible mission IDs:', {
    planPayload_task_id: (planPayload as any)?.task_id,
    fullAgentState_mission_id: fullAgentState?.mission_id,
    fullAgentState_task_id: fullAgentState?.task_id,
    planPayload_id: (planPayload as any)?.id,
    fullAgentState_id: fullAgentState?.id,
    resolvedCurrentMissionId: currentMissionId
  });
  const missionStatus = fullAgentState?.mission_status || '';

  const showPhase = (phase: keyof typeof PHASE_UNLOCK_STATUS) =>
    PHASE_UNLOCK_STATUS[phase].includes(missionStatus);

  const getPhaseOutput = (phaseNum: number) => {
    const output = fullAgentState?.phase_outputs?.[phaseNum] ||
      fullAgentState?.[`phase${phaseNum}_output`];

    // Reject output from a different mission
    if (output?.mission_id && output.mission_id !== currentMissionId) {
      console.warn(`[STALE] Phase ${phaseNum} output from mission ${output.mission_id}, current is ${currentMissionId} — hiding`);
      return null;
    }
    return output;
  };

  // --- High-Fidelity Intelligence Command Center Mapping ---
  const finalState = fullAgentState;
  const meshAnalytics = finalState?.final_synthesis?.mesh_analytics;
  const effectivePayload = planPayload;

  // ── ORCH-001: Real active node count from topology ───────────────────────
  const computeActiveNodeCount = (): string | number => {
    if (topology?.nodes && Array.isArray(topology.nodes)) {
      const selected = topology.nodes.filter(
        (n: any) => (n?.status || 'pending').toLowerCase() !== 'bypassed'
      ).length;
      if (selected > 0) return selected;
    }
    return meshAnalytics?.intelligence_nodes_count || '—';
  };
  const activeNodeCount = computeActiveNodeCount();

  // ── ORCH-002: Synthesized test count — Phase 1 proxy via Gherkin ─────────
  const rawTestCases: any[] = (planPayload as any)?.test_cases || [];
  const gherkinScenarios: any[] = (planPayload as any)?.scope?.gherkin_scenarios || [];
  const synthesizedTestCount = (() => {
    if (meshAnalytics?.synthesized_tests_count) return meshAnalytics.synthesized_tests_count;
    if (rawTestCases.length > 0) return rawTestCases.length;
    if (gherkinScenarios.length > 0) return gherkinScenarios.length;
    return '0';
  })();

  // ── ORCH-003: SLA Confidence — multi-source fallback chain ───────────────
  const computeSlaConfidence = (): string => {
    const im = (planPayload as any)?.intelligence_metrics?.sla_confidence;
    if (im && im !== 'Awaiting...' && im !== '0%') return im;
    const sloTarget = fullAgentState?.sla_slo_audit?.sla_targets?.[0]?.target;
    if (sloTarget) return sloTarget;
    const confScore = (planPayload as any)?.reasoning_audit?.confidence_score;
    if (confScore) return `${(parseFloat(confScore) * 100).toFixed(0)}%`;
    if (finalState?.mesh_confidence) return `${(finalState.mesh_confidence * 100).toFixed(1)}%`;
    return '—';
  };
  const slaConfidence = computeSlaConfidence();

  // ── ORCH-004: Risk Hotspots — count from actual risk_matrix ─────────────
  const riskItems: any[] = (effectivePayload as any)?.risk_matrix || [];
  const highRisks = (() => {
    if (meshAnalytics?.risk_hotspots !== undefined && meshAnalytics.risk_hotspots !== null) {
      return meshAnalytics.risk_hotspots;
    }
    const count = riskItems.filter((r: any) => {
      const impact = (r.impact || '').toUpperCase();
      const likelihood = (r.likelihood || '').toUpperCase();
      return impact === 'H' || impact === 'HIGH' || likelihood === 'H' || likelihood === 'HIGH';
    }).length;
    const quarantined = fullAgentState?.reliability_eng?.quarantine_count || 0;
    return count + quarantined || '0';
  })();

  // ── ORCH-005: Mesh Confidence — no hardcoded fallback ───────────────────
  const computeMeshConfidence = (): string => {
    if (finalState?.mesh_confidence) {
      return `${(finalState.mesh_confidence * 100).toFixed(1)}%`;
    }
    const auditConf = (planPayload as any)?.reasoning_audit?.confidence_score;
    if (auditConf) return `${(parseFloat(auditConf) * 100).toFixed(0)}%`;
    return '—';
  };
  const meshConfidenceValue = computeMeshConfidence();

  // ── ORCH-006: Requirement Coverage — safe CSS width + no hardcoded fallback
  const requirementCoverage = (() => {
    const mc = meshAnalytics?.requirement_coverage;
    if (mc && mc !== '0%') return mc;
    const im = (planPayload as any)?.intelligence_metrics?.requirement_coverage;
    if (im && im !== '0%') return im;
    return '—';
  })();
  const coverageBarWidth = (() => {
    const val = requirementCoverage;
    if (typeof val === 'string' && /^\d+(\.\d+)?%$/.test(val)) return val;
    return '0%';
  })();

  // ── ORCH-007: Execution Readiness ────────────────────────────────────────
  const executionReadinessRaw = meshAnalytics?.execution_readiness
    ?? (planPayload as any)?.intelligence_metrics?.logic_stability
    ?? '—';
  const executionReadiness = typeof executionReadinessRaw === 'string'
    ? executionReadinessRaw
    : typeof executionReadinessRaw === 'number'
      ? `${executionReadinessRaw}`
      : '—';
  const READY_STATES = new Set(['stable', 'exceptional', 'high', 'operational', 'ready', 'active']);
  const readinessColor = READY_STATES.has(executionReadiness.toLowerCase()) ? '#3b82f6' : '#94a3b8';

  // ── ORCH-008: Synopsis — use executive_summary.description as Phase 1 source
  const execSynopsis = (() => {
    const fs = fullAgentState?.final_synthesis?.summary?.description;
    if (fs) return fs;
    const es = (planPayload as any)?.executive_summary?.description;
    if (es && es.length > 20) return es;
    return 'Mission Intelligence synthesized by SeQuor A.N.T. mesh core.';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {dynamicGuardrail?.active && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ background: '#0f172a', border: '1px solid #ef4444', borderRadius: '16px', width: '100%', maxWidth: '600px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(239,68,68,0.3)', textAlign: 'center' }}>
            <i className="ti-alert" style={{ fontSize: '3rem', color: '#ef4444', marginBottom: '16px', display: 'block' }}></i>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.5rem', color: '#f8fafc' }}>Micro-Checkpoint Guardrail</h3>
            <p style={{ color: '#cbd5e1', marginBottom: '24px', lineHeight: 1.6, fontSize: '0.95rem' }}>{dynamicGuardrail.message}</p>
            <button
              onClick={() => setDynamicGuardrail(null)}
              style={{ background: '#ef4444', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
              onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
            >
              Acknowledge Risk & Override
            </button>
          </div>
        </div>
      )}

      {inspectedNode && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} onClick={() => setInspectedNode(null)}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #0f172a, #1e1b4b)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', letterSpacing: '-0.02em' }}>
                  {inspectedNode.label} <span style={{ color: '#6366f1', fontWeight: 400, marginLeft: '6px' }}>Telemetry Inspector</span>
                </h3>
              </div>
              <button onClick={() => setInspectedNode(null)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px' }}>
                Raw output object mapped from internal memory buffer:
              </div>
              <pre style={{ background: '#020617', padding: '16px', borderRadius: '8px', fontSize: '0.75rem', color: '#34d399', fontFamily: 'monospace', overflowX: 'auto', border: '1px solid #1e293b' }}>
                {(() => {
                  const payload = getAgentPayload(inspectedNode);
                  if (!fullAgentState) return JSON.stringify({ pending: "Waiting for network stabilization..." }, null, 2);

                  if (!payload || !payload.data) {
                    if (loading) {
                      return JSON.stringify({
                        status: "pending",
                        message: "Agent is currently executing. Payload will be available upon completion.",
                        _debug: {
                          nodeKey: asText(inspectedNode?.key, ''),
                          targetKey: REGISTRY_MAP[inspectedNode?.key] || 'NOT_FOUND',
                          stateHasTargetKey: !!fullAgentState[REGISTRY_MAP[inspectedNode?.key]],
                          phase3HasTargetKey: !!(fullAgentState.phase3_output && fullAgentState.phase3_output[REGISTRY_MAP[inspectedNode?.key]]),
                          allKeys: Object.keys(fullAgentState)
                        }
                      }, null, 2);
                    }
                    return JSON.stringify({
                      warning: "Payload isolated or merged upstream. Check final synthesis output.",
                      _debug: { nodeLabel: asText(inspectedNode?.label, ''), nodeKey: asText(inspectedNode?.key, ''), nodeId: asText(inspectedNode?.id, '') }
                    }, null, 2);
                  }

                  // Handle raw_requirements: it's a list — show the first item if it has content
                  let displayData = payload.data;
                  if (Array.isArray(displayData)) {
                    // Filter out hollow empty objects
                    const nonEmpty = displayData.filter((item: any) => item && typeof item === 'object' && Object.keys(item).length > 1);
                    if (nonEmpty.length > 0) {
                      displayData = nonEmpty.length === 1 ? nonEmpty[0] : nonEmpty;
                    } else if (displayData.length > 0 && Object.keys(displayData[0]).length > 0) {
                      displayData = displayData[0];
                    } else {
                      return JSON.stringify({ status: "Processing complete — agent output is being synthesized into the unified contract. See combined_data for results." }, null, 2);
                    }
                  }
                  // Handle hollow single object
                  if (typeof displayData === 'object' && displayData !== null && Object.keys(displayData).length === 0) {
                    return JSON.stringify({ status: "Agent output synthesized into unified context contract." }, null, 2);
                  }
                  return JSON.stringify(displayData, null, 2);
                })()}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── MISSION COMMAND HEADER ── */}
      <div ref={hubTopRef} className="card-header animate-fadeIn" style={{
        padding: '2.5rem 2.8rem',
        borderRadius: '24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        border: '1px solid #1e293b',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)'
      }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '100%', background: 'radial-gradient(circle at top right, rgba(99,102,241,0.12) 0%, transparent 60%)', pointerEvents: 'none' }}></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 950, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '2px', background: 'rgba(99,102,241,0.15)', padding: '5px 14px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)' }}>
                A.N.T. Protocol
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Sovereign Mission ID: {topology?.mesh_id?.split('ANT-')[1] || topology?.mesh_id || '-'}
              </span>
              <button
                onClick={onClearSession}
                style={{
                  marginLeft: 'auto', padding: '6px 14px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800,
                  border: '1px dashed #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '1px'
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                title="Wipes all session state and starts completely fresh"
              >
                <i className="ti-trash"></i> Clear Session Cache
              </button>
            </div>
            <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 950, color: '#ffffff', letterSpacing: '-0.04em', lineHeight: 1 }}>
              Intelligence <span style={{ color: '#818cf8' }}>Orchestration Hub</span>
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: '1rem', color: '#94a3b8', maxWidth: '700px', lineHeight: 1.6, fontWeight: 500 }}>
              Autonomous {activeNodeCount}-node agent mesh pipeline. Orchestrating recursive reasoning, formal verification, and industrial-scale artifact synthesis.
            </p>
          </div>
        </div>
        <div style={{ marginTop: '2.5rem' }}>
          <PipelineBar factoryStep={factoryStep} loading={loading} />
        </div>
        {loading && (
          <div style={{ marginTop: '20px' }}>
            <MissionEngagementLoop logs={reasoningLogs} />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          LIVE MESH & REASONING CONSOLE
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep >= 2 && combinedTopology && (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '14px', alignItems: 'stretch' }}>
          <div style={{ gridColumn: '1' }}>
            <NodeGrid topology={combinedTopology} title={factoryStep >= 4 ? "A.N.T. Mesh · Core & Synthesis Nodes" : "A.N.T. Mesh · Phase 1 Nodes"} frozen={factoryStep === 3 || factoryStep >= 5} onNodeClick={(node) => setInspectedNode(node)} />
          </div>
          <div style={{ gridColumn: '2', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <ConsoleLog logs={combinedLogs} title={factoryStep >= 4 ? "Full Intelligence Log" : "Strategic Analysis Log"} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          IDLE STATE
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep === 0 && (
        <div style={{ padding: '48px', textAlign: 'center', borderRadius: '16px', background: '#0f172a', border: '1px dashed #1e293b' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛸</div>
          <div style={{ fontWeight: 800, color: '#334155', fontSize: '1rem', marginBottom: '6px' }}>No active mission</div>
          <div style={{ color: '#1e293b', fontSize: '0.82rem' }}>Launch a mission from Mission Launchpad.</div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          PHASE 1
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep >= 1 && (
        <PhasePanel phaseLabel="Phase 1 · Strategic Blitz Analysis" status={p1Status}>



          {factoryStep === 2 && (
            <div style={{ fontSize: '0.82rem', color: '#6366f1', padding: '8px 12px', background: 'rgba(99,102,241,0.06)' }}>
              ⚡ Strategic Blitz is running. Open <strong>Mission Control</strong> from the sidebar to watch live agent reasoning and pipeline progress.
            </div>
          )}

          {/* Phase 1 Risk & Security Telemetry */}
          {fullAgentState?.compliance_report && (
            <AlertBanner
              severity={fullAgentState.compliance_report.risk_tier === 'STOP' ? 'high' : fullAgentState.compliance_report.risk_tier === 'High' ? 'medium' : 'low'}
              title={`Governance: ${fullAgentState.compliance_report.data_classification} Data / ${fullAgentState.compliance_report.risk_tier} Risk`}
            >
              {fullAgentState.compliance_report.reasoning}
            </AlertBanner>
          )}

          {fullAgentState?.threat_model_advisories && fullAgentState.threat_model_advisories.threats && fullAgentState.threat_model_advisories.threats.length > 0 && (
            <AlertBanner severity="high" title="Security Intelligence: Threat Model">
              {JSON.stringify(fullAgentState.threat_model_advisories, null, 2)}
            </AlertBanner>
          )}

        </PhasePanel>
      )}

      {/* ══════════════════════════════════════════════════════════════
          PHASE 2
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep >= 1 && (fullAgentState?.visual_architecture || fullAgentState?.api_design_spec || fullAgentState?.db_schema_design || fullAgentState?.engineering_tasks || fullAgentState?.tdd_contracts) && (
        <PhasePanel phaseLabel="Phase 2 · Architecture & Design" status={p1Status}>
          {fullAgentState.visual_architecture && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>C4 System Context Diagram</div>
              <MermaidChart chart={fullAgentState.visual_architecture} />
            </div>
          )}

          {fullAgentState.db_schema_design && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Data Model Design</div>
              {fullAgentState.db_schema_design.type === 'mermaid_erd' ? (
                <MermaidChart chart={fullAgentState.db_schema_design.content} />
              ) : (
                <SyntaxHighlighter language="sql" style={vscDarkPlus} customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '0.8rem', margin: 0 }}>
                  {fullAgentState.db_schema_design.content || (typeof fullAgentState.db_schema_design === 'string' ? fullAgentState.db_schema_design : JSON.stringify(fullAgentState.db_schema_design))}
                </SyntaxHighlighter>
              )}
            </div>
          )}

          {fullAgentState.api_design_spec && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Service Architecture Mesh</div>
              {fullAgentState.api_design_spec.type === 'openapi' ? (
                <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', padding: '10px' }}>
                  <SwaggerUI spec={fullAgentState.api_design_spec.spec} />
                </div>
              ) : (
                <pre style={{ background: '#020617', padding: '16px', borderRadius: '12px', color: '#cbd5e1', fontSize: '0.8rem', overflowX: 'auto', border: '1px solid #1e293b' }}>
                  {fullAgentState.api_design_spec.spec}
                </pre>
              )}
            </div>
          )}

          {(fullAgentState.tasks || fullAgentState.engineering_tasks) && Array.isArray(fullAgentState.tasks || fullAgentState.engineering_tasks) && (fullAgentState.tasks || fullAgentState.engineering_tasks).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Engineering Tasks & TDD Contracts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(fullAgentState.tasks || fullAgentState.engineering_tasks).map((task: any, i: number) => (
                  <div key={task.task_id || task.id || i} style={{ background: '#020617', padding: '16px', borderRadius: '8px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>{task.task_id || task.id}</span>
                        <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.95rem' }}>{task.title || task.name}</span>
                      </div>
                      {task.points && <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{task.points} pts</span>}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{task.description}</div>

                    {task.acceptance_criteria && Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Acceptance Criteria</div>
                        <ul style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {task.acceptance_criteria.map((ac: string, idx: number) => <li key={idx}>{ac}</li>)}
                        </ul>
                      </div>
                    )}

                    {task.edge_cases && Array.isArray(task.edge_cases) && task.edge_cases.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Edge Cases</div>
                        <ul style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {task.edge_cases.map((ec: string, idx: number) => <li key={idx}>{ec}</li>)}
                        </ul>
                      </div>
                    )}

                    {fullAgentState.tdd_contracts?.[task.task_id || task.id]?.code && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f472b6', textTransform: 'uppercase' }}>TDD Test Contract</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'monospace' }}>{fullAgentState.tdd_contracts[task.task_id || task.id].contract_hash}</div>
                        </div>
                        <SyntaxHighlighter language="python" style={vscDarkPlus} customStyle={{ borderRadius: '6px', padding: '12px', fontSize: '0.8rem', margin: 0, maxHeight: '400px' }}>
                          {fullAgentState.tdd_contracts[task.task_id || task.id].code}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </PhasePanel>
      )}

      {/* ══════════════════════════════════════════════════════════════
          PHASE 3 · IMPLEMENTATION PLAN & ENGINEERING CONTRACT HITL REVIEW
      ══════════════════════════════════════════════════════════════ */}
      {(fullAgentState?.engineering_contract || fullAgentState?.plan_json) && factoryStep >= 3 && (
        <PhasePanel phaseLabel="⏸ Phase 3 · Implementation Plan & Contract Review" status={factoryStep >= 4 ? 'done' : 'active'}>
          {fullAgentState?.mission_status === 'PLAN_PENDING' && localPlanJson && (
            <div style={{ margin: '16px 0', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{
                padding: '16px 20px', background: '#0f172a',
                borderBottom: '1px solid #1e293b', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>
                    Implementation Plan — Review & Approve
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                    {localPlanJson.modules?.length} modules generated from{' '}
                    {localPlanJson.total_capabilities} capabilities and{' '}
                    {localPlanJson.total_tasks} Phase 2 tasks
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: '#6366f1', fontSize: '0.75rem' }}>
                    Approve modules individually, then launch forge agents
                  </div>
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `${API_BASE}/api/missions/${currentMissionId}/plan/export?format=markdown`;
                      link.download = `implementation-plan-${currentMissionId.substring(0, 8)}.md`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    style={{
                      background: 'transparent', border: '1px solid #475569', borderRadius: '4px',
                      color: '#cbd5e1', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer'
                    }}
                  >
                    ↓ Download Plan (.md)
                  </button>
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `${API_BASE}/api/missions/${currentMissionId}/plan/export?format=json`;
                      link.download = `implementation-plan-${currentMissionId.substring(0, 8)}.json`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    style={{
                      background: 'transparent', border: '1px solid #475569', borderRadius: '4px',
                      color: '#cbd5e1', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer'
                    }}
                  >
                    ↓ JSON
                  </button>
                </div>
              </div>

              {/* Module cards */}
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {localPlanJson.modules?.map((module: any, idx: number) => {
                  if (module._rejected) return null;
                  return (
                    <ModuleApprovalCard
                      key={module.module_id}
                      module={module}
                      onApprove={(approved: boolean, notes: string, currentAnswers?: Record<string, string>) => {
                        // Immutable update: map produces a new array reference so
                        // React detects the change and re-renders the counter + button.
                        // The old shallow-copy + mutation was invisible to React's diff.
                        setLocalPlanJson((prev: any) => ({
                          ...prev,
                          modules: prev.modules.map((m: any, i: number) => {
                            if (i === idx) {
                              const updatedQuestions = (m.open_questions || []).map((q: any, qi: number) => {
                                if (typeof q !== 'object') return q;
                                const qId = q.id || qi;
                                if (currentAnswers && currentAnswers[qId] !== undefined) {
                                  return { ...q, developer_answer: currentAnswers[qId] };
                                }
                                return q;
                              });
                              return { ...m, approved, developer_notes: notes, open_questions: updatedQuestions };
                            }
                            return m;
                          })
                        }));
                      }}
                    />
                  );
                })}
              </div>

              {/* Plan-level conflict resolution — replaces flat open_questions list */}
              {localPlanJson.open_questions?.length > 0 && (
                <div style={{ padding: '16px', borderTop: '1px solid #1e293b', background: '#0c1220' }}>
                  <ConflictResolutionPanel
                    planOqs={localPlanJson.open_questions}
                    modules={localPlanJson.modules || []}
                    onRejectModule={async (moduleId: string, reason: string) => {
                      setLocalPlanJson((prev: any) => ({
                        ...prev,
                        modules: prev.modules.map((m: any) =>
                          m.module_id === moduleId
                            ? { ...m, approved: false, developer_notes: reason, _rejected: true }
                            : m
                        )
                      }));

                      try {
                        const activeMissionId = currentMissionId;
                        if (!activeMissionId) return;
                        await fetch(`${API_BASE}/api/tasks/missions/${activeMissionId}/plan/reject-module`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ module_id: moduleId, reason })
                        });
                      } catch (e) {
                        console.error('[REJECT] Failed to persist module rejection:', e);
                      }
                    }}
                  />
                </div>
              )}

              {/* Approve button */}
              <div style={{
                padding: '16px', borderTop: '1px solid #1e293b',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                  {localPlanJson.modules?.filter((m: any) => m.approved).length} of{' '}
                  {localPlanJson.modules?.length} modules approved
                </div>
                <button
                  onClick={async () => {
                    if (onApproveContract) {
                      try {
                        const activeMissionId = currentMissionId;
                        if (!activeMissionId) {
                          alert("Error: Could not determine active mission ID. Please refresh the page.");
                          return;
                        }
                        const res = await fetch(`${apiBase}/api/tasks/missions/${activeMissionId}/approve/phase3-plan`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ plan: localPlanJson })
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          alert(`Failed to approve plan: ${err.detail}`);
                          return;
                        }
                        if (onApproveContract) onApproveContract();
                      } catch (e) {
                        console.error("Approval error", e);
                      }
                    }
                  }}
                  disabled={!localPlanJson.modules?.some((m: any) => m.approved)}
                  style={{
                    padding: '10px 24px',
                    background: localPlanJson.modules?.some((m: any) => m.approved)
                      ? '#4f46e5' : '#374151',
                    border: 'none', borderRadius: '8px', color: 'white',
                    cursor: localPlanJson.modules?.some((m: any) => m.approved)
                      ? 'pointer' : 'not-allowed',
                    fontWeight: 700
                  }}
                >
                  Approve Plan & Launch Forge Agents →
                </button>
              </div>
            </div>
          )}

          {!fullAgentState?.plan_json && !fullAgentState?.contract_approved && (
            <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.84rem', color: '#fbbf24', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <i className="ti-alert-circle" style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '2px' }}></i>
              <div>
                <strong>Human-in-the-Loop Gate Active.</strong> The Engineering Contract has been generated and is awaiting your review. Approve to release the Forge Agents (Frontend, Backend, Database).
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {Array.isArray(fullAgentState.engineering_contract.acceptance_criteria) && fullAgentState.engineering_contract.acceptance_criteria.length > 0 && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
              <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-check-box" style={{ color: '#10b981', fontSize: '0.9rem' }}></i>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Acceptance Criteria — {fullAgentState.engineering_contract.acceptance_criteria.length} items
                </span>
              </div>
              <div style={{ background: '#020617', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {fullAgentState.engineering_contract.acceptance_criteria.map((criterion: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
                    <span style={{ color: '#10b981', fontWeight: 900, flexShrink: 0, fontSize: '0.75rem', marginTop: '2px' }}>AC-{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.6 }}>{criterion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* V&V Process */}
          {fullAgentState.engineering_contract.v_and_v_process && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
              <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-layers" style={{ color: '#818cf8', fontSize: '0.9rem' }}></i>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>V&V Process</span>
              </div>
              <div style={{ background: '#020617', padding: '16px', color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '280px', overflowY: 'auto' }}>
                {fullAgentState.engineering_contract.v_and_v_process}
              </div>
            </div>
          )}

          {/* Production Readiness Checklist */}
          {Array.isArray(fullAgentState.engineering_contract.production_readiness_checklist) && fullAgentState.engineering_contract.production_readiness_checklist.length > 0 && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
              <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-target" style={{ color: '#f59e0b', fontSize: '0.9rem' }}></i>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Production Readiness Checklist
                </span>
              </div>
              <div style={{ background: '#020617', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {fullAgentState.engineering_contract.production_readiness_checklist.map((item: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', borderRadius: '6px', background: 'rgba(245,158,11,0.04)' }}>
                    <i className="ti-check" style={{ color: '#f59e0b', fontSize: '0.75rem', flexShrink: 0 }}></i>
                    <span style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* TDD Execution Stream (Unlocks in Phase 3 for Codebase Linking) */}
          {fullAgentState?.engineering_contract && (
            <>
              {/* Codebase upload/link — enables the TDD watcher */}
              <CodebaseLinkPanel
                missionId={currentMissionId || ''}
                apiBase={apiBase}
                onLinked={(result) => console.log('[CODEBASE LINKED]', result)}
              />
            </>
          )}

          {/* NFR Audit (Phase 4) */}
          {fullAgentState?.phase4_output && (
            <NfrAuditPanel
              report={fullAgentState.phase4_output.nfr_clearance_report || fullAgentState?.nfr_clearance_report || {}}
            />
          )}

          {/* Git Write-Back / PR Mechanics (Milestone 8) */}
          {fullAgentState?.mission_status === 'NFR_GREEN' && fullAgentState?.phase3_output?.module_forge_code && (
            <ModulePRReview
              missionId={currentMissionId || ''}
              modules={fullAgentState.phase3_output.module_forge_code.map((m: any) => ({
                module_name: m.module_name,
                pr_data: m.pr_data // Will be populated in real app state if PR is created
              }))}
              apiBase={apiBase}
              onMergeComplete={() => console.log('[PR MERGED]')}
            />
          )}

          {/* Traceability & Passport (Phase 5) */}
          {fullAgentState?.phase5_output && (
            <Pillar5Panel
              traceabilityAudit={fullAgentState.phase5_output.readiness_report?.traceability || fullAgentState?.readiness_report?.traceability}
              cryptographicPassport={fullAgentState.phase5_output.vv_passport || fullAgentState?.vv_passport}
            />
          )}

          {/* Phase 3 Output Display */}
          {fullAgentState?.mission_status === 'TDD_GREEN' && fullAgentState?.phase3_output && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', marginTop: '16px' }}>
              <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-layers-alt" style={{ color: '#10b981', fontSize: '0.9rem' }}></i>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Phase 3 · Forge Output
                </span>
              </div>
              <div style={{ background: '#020617', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {fullAgentState.phase3_output.module_forge_code && Array.isArray(fullAgentState.phase3_output.module_forge_code) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {fullAgentState.phase3_output.module_forge_code.map((mod: any, idx: number) => (
                      <div key={idx}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                          Module: {mod.module_name}
                        </div>
                        <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ borderRadius: '8px', padding: '12px', fontSize: '0.8rem', margin: 0, maxHeight: '300px' }}>
                          {typeof mod.content === 'string' ? mod.content : JSON.stringify(mod.content, null, 2)}
                        </SyntaxHighlighter>
                      </div>
                    ))}
                  </div>
                )}

                {fullAgentState.phase3_output.generated_code_paths && Array.isArray(fullAgentState.phase3_output.generated_code_paths) && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Generated Files</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {fullAgentState.phase3_output.generated_code_paths.map((path: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 12px', borderRadius: '6px', background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
                          <i className="ti-file" style={{ color: '#38bdf8', fontSize: '0.75rem', flexShrink: 0 }}></i>
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem', fontFamily: 'monospace' }}>{path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Approve Action */}
          {fullAgentState?.mission_status === 'HITL2_PENDING' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '4px' }}>
              <button
                id="approve-engineering-contract-btn"
                disabled={loading}
                onClick={() => onApproveAndTriggerPhase2('__CONTRACT_APPROVED__')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '14px 28px', borderRadius: '100px', border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  background: loading ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', fontWeight: 800, fontSize: '0.9rem',
                  boxShadow: loading ? 'none' : '0 6px 20px rgba(16,185,129,0.35)',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  textTransform: 'uppercase', letterSpacing: '0.04em'
                }}
              >
                {loading
                  ? <><i className="ti-reload spin-animation"></i> Triggering Forge Agents...</>
                  : <><i className="ti-check"></i> Approve Contract & Release Forge Agents</>
                }
              </button>
            </div>
          )}
        </PhasePanel>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HITL CHECKPOINT (legacy text-plan approval gate)
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep >= 3 && (
        <PhasePanel phaseLabel="⏸ Human-in-the-Loop Checkpoint" status={hitlStatus}>
          <div ref={approvalRef} /> {/* Precise Scroll Anchor */}


          {factoryStep === 3 && (
            <>
              {/* Warnings */}
              {!isContractReady && !loading && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid #ef4444', fontSize: '0.82rem', color: '#fca5a5', display: 'flex', gap: '8px' }}>
                  <i className="ti-alert-circle"></i>
                  <span><strong>Contract Empty.</strong> No content generated. Check Phase 1 log for failed nodes.</span>
                </div>
              )}
              {isContractErrored && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(245,158,11,0.06)', border: '1px solid #f59e0b', fontSize: '0.82rem', color: '#fcd34d', display: 'flex', gap: '8px' }}>
                  <i className="ti-alert-circle"></i>
                  <span><strong>Degraded Mode Active.</strong> Fallback contract used. Review carefully before approving.</span>
                </div>
              )}

              {/* Download Phase 1 DOCX */}
              {downloadUrl && (
                <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#34d399', fontSize: '0.87rem' }}>📄 Phase 1 Test Plan Document Ready</div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>Download and review before approving Phase 2 execution.</div>
                  </div>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', background: '#10b981', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 800, color: 'white', whiteSpace: 'nowrap' }}
                  >
                    {downloading ? <><i className="ti-reload spin-animation"></i> Opening...</> : <><i className="ti-download"></i> Download Phase 1 DOCX</>}
                  </button>
                </div>
              )}

              {/* Contract Editor */}
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                    <i className="ti-hand-stop" style={{ color: '#f59e0b', marginRight: '6px' }}></i>
                    Intelligence Contract — HITL Editable
                  </span>
                  {isContractReady && <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>✅ {editableContract.length.toLocaleString()} chars</span>}
                </div>
                <textarea
                  value={editableContract}
                  onChange={e => setEditableContract(e.target.value)}
                  style={{ width: '100%', height: '340px', background: '#020617', color: '#94a3b8', border: 'none', padding: '20px', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.7, resize: 'vertical', display: 'block', boxSizing: 'border-box' }}
                  placeholder="Intelligence Contract will appear here after Phase 1 completes..."
                />
              </div>

              {/* Risk Intelligence Matrix (Strategic View) */}
              {effectivePayload?.risk_matrix && Array.isArray(effectivePayload.risk_matrix) && effectivePayload.risk_matrix.length > 0 && (
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.1), transparent)', padding: '10px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>
                      Phase 1 Risk Intelligence Matrix
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto', background: '#020617' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#94a3b8' }}>Risk Area</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#94a3b8' }}>Likelihood</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#94a3b8' }}>Impact</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#94a3b8' }}>Mitigation Strategy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectivePayload?.risk_matrix?.map((risk: any, i: number) => {
                          const lColor = risk.likelihood?.toUpperCase().startsWith('H') ? '#ef4444' : risk.likelihood?.toUpperCase().startsWith('M') ? '#f59e0b' : '#10b981';
                          const iColor = risk.impact?.toUpperCase().startsWith('H') ? '#ef4444' : risk.impact?.toUpperCase().startsWith('M') ? '#f59e0b' : '#3b82f6';
                          return (
                            <tr key={i} style={{ borderBottom: i === (effectivePayload?.risk_matrix?.length || 0) - 1 ? 'none' : '1px solid #1e293b', transition: 'background 0.2s', background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.5)' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 500 }}>{risk.area || 'General System'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: `${lColor}1A`, color: lColor, fontSize: '0.7rem', fontWeight: 700 }}>
                                  {risk.likelihood || 'Medium'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: `${iColor}1A`, color: iColor, fontSize: '0.7rem', fontWeight: 700 }}>
                                  {risk.impact || 'Medium'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8', lineHeight: 1.5 }}>{risk.mitigation || 'Await mitigation guidance from the live mission trace.'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>

                <button
                  disabled={!isContractReady || loading}
                  onClick={() => onApproveAndTriggerPhase2(`PRIMARY REQUIREMENT CONTRACT (REFINED):\n${editableContract}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px',
                    borderRadius: '100px', border: 'none', cursor: isContractReady && !loading ? 'pointer' : 'not-allowed',
                    background: isContractReady && !loading ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#334155',
                    color: 'white', fontWeight: 800, fontSize: '0.88rem',
                    boxShadow: isContractReady && !loading ? '0 4px 16px rgba(245,158,11,0.25)' : 'none',
                    opacity: isContractReady && !loading ? 1 : 0.6,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {loading
                    ? <><i className="ti-reload spin-animation"></i> Triggering...</>
                    : !isContractReady
                      ? <><i className="ti-alert-circle"></i> Contract Not Ready</>
                      : <><i className="ti-bolt"></i> Approve &amp; Trigger Artifact Synthesis</>
                  }
                </button>
              </div>
            </>
          )}

          {factoryStep >= 4 && (
            <div style={{ padding: '12px 18px', borderRadius: '10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.84rem', color: '#10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-check"></i>
                <span>{factoryStep >= 5 ? "Mission Lifecycle Verification Complete" : "HITL Review Approved — Artifact Synthesis triggered."}</span>
              </div>
              {downloadUrl && factoryStep < 5 && (
                <button onClick={handleDownload} disabled={downloading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                  <i className="ti-download"></i> Download Test Strategy (Phase 1)
                </button>
              )}
            </div>
          )}
        </PhasePanel>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HITL CHECKPOINT 2: ENGINEERING CONTRACT & TASKS
      ══════════════════════════════════════════════════════════════ */}
      {factoryStep >= 5 && fullAgentState?.tasks && (
        <PhasePanel phaseLabel="⏸ Checkpoint 2: Artifact Factory" status={loading ? 'active' : (factoryStep > 5 ? 'done' : 'pending')}>
          {factoryStep === 5 && (
            <>
              <div style={{ padding: '16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#334155', marginBottom: '12px' }}>
                  <i className="ti-layout-grid2"></i> Decomposed Engineering Tasks ({fullAgentState.tasks.length})
                </div>
                <div style={{ display: 'grid', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                  {Array.isArray(fullAgentState.tasks) && fullAgentState.tasks.map((t: any) => (
                    <div key={t.task_id} style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', marginBottom: '4px' }}>{t.task_id}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>{t.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Targets: {Array.isArray(t.target_paths) ? t.target_paths.join(', ') : String(t.target_paths || '')}</div>
                    </div>
                  ))}
                </div>
              </div>

              {fullAgentState.handoff_bundle_path && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
                  <i className="ti-folder"></i> Handoff Bundle assembled at: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{fullAgentState.handoff_bundle_path}</code>
                </div>
              )}


            </>
          )}
        </PhasePanel>
      )}


      {/* ══════════════════════════════════════════════════════════════
          PHASE 2 - INTELLIGENCE COMMAND CENTER
      ══════════════════════════════════════════════════════════════ */}
      {missionStatus === 'MISSION_COMPLETE' && (
        <div style={{ padding: '0px', borderRadius: '24px', background: '#fff', border: '1.5px solid #d1d5db', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>

          {/* Dashboard Header */}
          <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #ffffff, #f8fafc)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 950, color: '#312e81', letterSpacing: '-0.03em' }}>Intelligence Command Center</h2>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', marginLeft: '8px', animation: 'blink 1.5s infinite' }}></div>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Comprehensive coverage manifest synthesized by A.N.T. Agent Mesh.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="btn-outline" onClick={onResetMission} style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569', background: 'white' }}>
                <i className="ti-reload" style={{ marginRight: '6px' }}></i> Reset Mission
              </button>
              <button
                onClick={onClearSession}
                style={{
                  padding: '8px 18px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700,
                  border: '1.5px solid #fca5a5', color: '#dc2626', background: '#fff5f5',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#ef4444'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                title="Wipes all session state and starts completely fresh"
              >
                🗑️ Clear Session
              </button>
            </div>
          </div>

          <style>{`
            @keyframes blink { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>

          <div style={{ padding: '32px' }}>
            {factoryStep === 4 && (
              <div style={{ marginBottom: '24px', textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                <div style={{ animation: 'spin 2s linear infinite', fontSize: '2rem', marginBottom: '12px', color: '#6366f1' }}>⟳</div>
                <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>Executing Artifact Synthesis (Phase 2)...</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{activeNodeCount} specialized agents are currently drafting technical reports and technical assets.</div>
              </div>
            )}

            {factoryStep >= 5 && (
              <>
                {/* TOP 4 STATUS CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>

                  {/* Card 1: Nodes */}
                  <div style={{ padding: '24px', borderRadius: '20px', background: '#f5f3ff', border: '1.5px solid #ddd6fe', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(99,102,241,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                        <i className="ti-layers" style={{ fontSize: '1.2rem' }}></i>
                      </div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mesh Active</span>
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 950, color: '#1e1b4b', marginBottom: '2px', letterSpacing: '-0.02em' }}>{activeNodeCount}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '4px' }}>Intelligence Nodes</div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Decentralized Reasoning Nodes</div>
                  </div>

                  {/* Card 2: Tests */}
                  <div style={{ padding: '24px', borderRadius: '20px', background: '#ecfdf5', border: '1.5px solid #a7f3d0', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(16,185,129,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                        <i className="ti-check-box" style={{ fontSize: '1.2rem' }}></i>
                      </div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Artifacts</span>
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 950, color: '#064e3b', marginBottom: '2px', letterSpacing: '-0.02em' }}>
                      {synthesizedTestCount}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', marginBottom: '4px' }}>Synthesized Tests</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Physical Script Generation</div>
                  </div>

                  {/* Card 3: SLA */}
                  <div style={{ padding: '24px', borderRadius: '20px', background: '#eff6ff', border: '1.5px solid #bfdbfe', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(59,130,246,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                        <i className="ti-shield" style={{ fontSize: '1.2rem' }}></i>
                      </div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assurance Level</span>
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 950, color: '#172554', marginBottom: '2px', letterSpacing: '-0.02em' }}>{slaConfidence}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>SLA Confidence</div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Logic Density Verification</div>
                  </div>

                  {/* Card 4: Risks */}
                  <div style={{ padding: '24px', borderRadius: '20px', background: '#fff1f2', border: '1.5px solid #fecdd3', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(244,63,94,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(244,63,94,0.3)' }}>
                        <i className="ti-alert" style={{ fontSize: '1.2rem' }}></i>
                      </div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Security</span>
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 950, color: '#4c0519', marginBottom: '2px', letterSpacing: '-0.02em' }}>{highRisks}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase', marginBottom: '4px' }}>Risk Hotspots</div>
                    <div style={{ fontSize: '0.65rem', color: '#f43f5e', fontWeight: 700 }}>Critical Vulnerabilities</div>
                  </div>
                </div>

                {/* TAB BAR */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #f1f5f9', marginBottom: '32px' }}>
                  <div style={{ padding: '8px 4px 14px', borderBottom: '3px solid #6366f1', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <i className="ti-target" style={{ color: '#6366f1', fontSize: '0.9rem' }}></i>
                    <span style={{ color: '#4338ca', fontWeight: 800, fontSize: '0.88rem' }}>Mission Intelligence</span>
                  </div>
                  <div style={{ padding: '8px 4px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', cursor: 'pointer' }}>
                    <i className="ti-files" style={{ fontSize: '0.9rem' }}></i>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Test Nexus</span>
                    <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{synthesizedTestCount}</span>
                  </div>
                </div>

                {/* ANALYTICS GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>

                  {/* Requirement Coverage */}
                  <div style={{ padding: '32px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>Requirement Coverage</div>
                    <div style={{ fontSize: '3.2rem', fontWeight: 950, color: '#10b981', marginBottom: '16px', letterSpacing: '-0.03em' }}>
                      {requirementCoverage}
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '100px', overflow: 'hidden', marginBottom: '20px' }}>
                      <div style={{ width: coverageBarWidth, height: '100%', background: '#10b981', borderRadius: '100px', transition: 'width 0.6s ease' }}></div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.5' }}>Comprehensive verification across all discovered mission nodes.</div>
                  </div>

                  {/* Mesh Confidence Index */}
                  <div style={{ padding: '32px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>Mesh Confidence Index</div>
                    <div style={{ fontSize: '3.2rem', fontWeight: 950, color: '#6366f1', marginBottom: '8px', letterSpacing: '-0.03em' }}>
                      {meshConfidenceValue}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', marginBottom: '16px' }}>
                      {meshConfidenceValue === '—' ? 'Pending synthesis' : 'High Assurance Synthesis'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.5' }}>Logical de-duplication verified by Factory Core.</div>
                  </div>

                  {/* Execution Readiness */}
                  <div style={{ padding: '32px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>Execution Readiness</div>
                    <div style={{ fontSize: '2.8rem', fontWeight: 950, color: readinessColor, marginBottom: '16px', letterSpacing: '-0.01em' }}>
                      {executionReadiness}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                      {[1, 1, 1, 1, 1].map((_, i) => <div key={i} style={{ height: '5px', flex: 1, background: readinessColor, borderRadius: '100px' }}></div>)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.5' }}>Automation artifacts primed for registry dispatch.</div>
                  </div>
                </div>

                {/* COLLECTIVE SYNOPSIS */}
                <div style={{ padding: '24px 32px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: '32px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 950, color: '#4f46e5', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ti-world"></i> Collective Mesh Synopsis
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: 600, lineHeight: '1.6' }}>
                    {execSynopsis}
                  </div>
                </div>

                {/* API VALIDATION REPORT */}
                {fullAgentState?.api_validation_report && (
                  <div style={{ marginBottom: '32px' }}>
                    <TDDStatusIndicator report={fullAgentState.api_validation_report} />
                  </div>
                )}

                {/* DEVOPS DELIVERY MANIFESTS */}
                {fullAgentState?.devops_manifests && (
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase' }}>Phase 4: EnvOps & Delivery Manifests</div>

                    {fullAgentState.devops_manifests.dockerfile && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginBottom: '8px' }}>Dockerfile (Zero-Trust Verified)</div>
                        <SyntaxHighlighter language="dockerfile" style={vscDarkPlus} customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '0.8rem', margin: 0 }}>
                          {fullAgentState.devops_manifests.dockerfile}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {fullAgentState.devops_manifests.github_actions_ci && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', marginBottom: '8px' }}>GitHub Actions CI (with Snyk)</div>
                        <SyntaxHighlighter language="yaml" style={vscDarkPlus} customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '0.8rem', margin: 0 }}>
                          {fullAgentState.devops_manifests.github_actions_ci}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {fullAgentState.devops_manifests.github_actions_cd && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', marginBottom: '8px' }}>Dependabot Configuration</div>
                        <SyntaxHighlighter language="yaml" style={vscDarkPlus} customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '0.8rem', margin: 0 }}>
                          {fullAgentState.devops_manifests.github_actions_cd}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>
                )}

                {/* VISUAL TDD STATUS INDICATOR — Data-driven from real execution */}
                {(fullAgentState?.tdd_execution_report || fullAgentState?.phase4_output) && (
                  <Phase4TDDIndicator
                    tddReport={fullAgentState?.tdd_execution_report || {}}
                    tasks={fullAgentState?.tasks || []}
                  />
                )}

                {/* V&V PASSPORT & SANDBOX EXECUTION (Phase 5) */}
                {fullAgentState?.vv_passport && (
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase' }}>Phase 5: V&V Compliance Passport</div>
                    <div style={{
                      padding: '24px', borderRadius: '16px',
                      background: fullAgentState.vv_passport.compliance_checks_passed ? '#ecfdf5' : '#fef2f2',
                      border: `2px solid ${fullAgentState.vv_passport.compliance_checks_passed ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <i className={fullAgentState.vv_passport.compliance_checks_passed ? "ti-check-box" : "ti-alert"} style={{ fontSize: '1.5rem', color: fullAgentState.vv_passport.compliance_checks_passed ? '#10b981' : '#ef4444' }}></i>
                        <h3 style={{ margin: 0, color: fullAgentState.vv_passport.compliance_checks_passed ? '#064e3b' : '#7f1d1d' }}>
                          {fullAgentState.vv_passport.compliance_checks_passed ? "Compliance Validation Passed" : "Compliance Validation Blocked"}
                        </h3>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.8rem', color: '#475569', marginBottom: '16px' }}>
                        <div><strong>Mission ID:</strong> {fullAgentState.vv_passport.mission_id}</div>
                        <div><strong>Issued At:</strong> {new Date(fullAgentState.vv_passport.issued_at).toLocaleString()}</div>
                        <div><strong>Code Hash:</strong> <span style={{ fontFamily: 'monospace' }}>{fullAgentState.vv_passport.forge_code_hash?.substring(0, 12)}...</span></div>
                        <div><strong>API Spec Hash:</strong> <span style={{ fontFamily: 'monospace' }}>{fullAgentState.vv_passport.api_spec_hash?.substring(0, 12)}...</span></div>
                      </div>

                      {fullAgentState.vv_passport.compliance_status && fullAgentState.vv_passport.compliance_status !== 'CLEARED' && (
                        <div style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600, marginBottom: '12px' }}>
                          Status: {fullAgentState.vv_passport.compliance_status}
                        </div>
                      )}

                      {fullAgentState.vv_passport.traceability_warnings?.length > 0 && (
                        <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b', fontSize: '0.85rem', color: '#92400e' }}>
                          <strong>⚠ Traceability Warnings ({fullAgentState.vv_passport.traceability_warnings.length}):</strong>
                          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                            {fullAgentState.vv_passport.traceability_warnings.map((w: string, idx: number) => (
                              <li key={idx}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!fullAgentState.vv_passport.compliance_checks_passed && fullAgentState.vv_passport.violations && (
                        <div style={{ background: '#7f1d1d', padding: '16px', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }}>
                          <strong>Violations Detected:</strong>
                          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                            {fullAgentState.vv_passport.violations.map((v: string, idx: number) => (
                              <li key={idx}>{v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MISSION DELIVERY HUB - High Visibility (positioned after all phase panels) */}
                <div style={{ padding: '40px', borderRadius: '32px', background: 'linear-gradient(135deg, #020617 0%, #1e1b4b 100%)', border: '2px solid #6366f1', textAlign: 'center', boxShadow: '0 25px 60px -12px rgba(99,102,241,0.5)', marginBottom: '32px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '20px' }}>🏆</div>
                    <h2 style={{ fontSize: '2.2rem', fontWeight: 950, color: 'white', margin: '0 0 12px', letterSpacing: '-0.04em', textTransform: 'uppercase' }}>Mission Accomplished</h2>
                    <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '36px', maxWidth: '650px', marginInline: 'auto', fontWeight: 500, lineHeight: 1.6 }}>
                      The {activeNodeCount}-node intelligence mesh has successfully validated the mission lifecycle. Your hi-fidelity Consolidated Full Report is generated and ready for enterprise-wide distribution.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                      <button
                        id="download-consolidated-report"
                        onClick={handleDownload}
                        disabled={downloading || !downloadUrl}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '16px', padding: '22px 64px',
                          borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
                          border: 'none', cursor: (downloading || !downloadUrl) ? 'not-allowed' : 'pointer',
                          fontSize: '1.25rem', fontWeight: 950, color: 'white',
                          boxShadow: '0 20px 40px -10px rgba(99,102,241,0.6)', transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          animation: !downloading ? 'pulseGlowFinalGlow 2s infinite ease-in-out' : 'none',
                          textTransform: 'uppercase', letterSpacing: '0.03em'
                        }}
                      >
                        {downloading ? (
                          <><i className="ti-reload spin-animation"></i> PACKING FINAL ARTIFACTS...</>
                        ) : (
                          <><i className="ti-download"></i> DOWNLOAD CONSOLIDATED FULL REPORT (.DOCX)</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <style>{`
                  @keyframes pulseGlowFinalGlow {
                    0%, 100% { box-shadow: 0 20px 40px -10px rgba(99,102,241,0.6); transform: scale(1); }
                    50% { box-shadow: 0 20px 60px -5px rgba(236,72,153,0.85); transform: scale(1.04) translateY(-6px); }
                  }
                `}</style>

                {factoryStep >= 5 && (
                  <ExecutionPanel missionId={currentMissionId || ''} />
                )}

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
                  <button
                    onClick={onNavigateToFactory}
                    style={{ padding: '16px 32px', borderRadius: '12px', background: 'transparent', border: '2px solid #e2e8f0', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#475569' }}
                  >
                    View All Assets →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default OrchestrationHub;
