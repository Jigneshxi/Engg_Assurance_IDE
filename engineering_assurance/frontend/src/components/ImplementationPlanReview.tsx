import React, { useState } from 'react';

interface ModuleConfig {
    module_id: string;
    name: string;
    description: string;
    files: {
        action: string;
        file_path: string;
        description: string;
        dependencies?: string[];
    }[];
    nfr_requirements: Record<string, string[]>;
}

interface OpenQuestion {
    id: string;
    question: string;
    blocking: boolean;
    proposed_answer?: string;
}

interface ImplementationPlan {
    overview: string;
    risk_label: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_rationale: string;
    modules: ModuleConfig[];
    open_questions: OpenQuestion[];
    approval: {
        status: string;
        approved_by?: string;
        notes?: string;
    };
}

interface Props {
    plan: ImplementationPlan;
    onApprove: (notes: string, override: boolean) => void;
    onReject: (notes: string) => void;
    loading?: boolean;
}

export const ImplementationPlanReview: React.FC<Props> = ({ plan, onApprove, onReject, loading }) => {
    const [notes, setNotes] = useState('');
    const [override, setOverride] = useState(false);
    
    if (!plan) return <div style={{ color: '#94a3b8' }}>Loading Plan...</div>;

    const hasBlocking = plan.open_questions?.some(q => q.blocking) || false;
    const canApprove = !hasBlocking || override;

    const riskColor = 
        plan.risk_label === 'HIGH' ? '#ef4444' : 
        plan.risk_label === 'MEDIUM' ? '#f59e0b' : '#10b981';

    return (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
            {/* Header & Overview */}
            <div style={{ marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti-ruler-pencil" style={{ color: '#6366f1' }}></i>
                        Implementation Plan Review
                    </h2>
                    <div style={{ 
                        background: `${riskColor}20`, border: `1px solid ${riskColor}40`, color: riskColor,
                        padding: '4px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em'
                    }}>
                        RISK: {plan.risk_label}
                    </div>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 12px 0' }}>{plan.overview}</p>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', background: '#1e293b', padding: '10px 14px', borderRadius: '6px', borderLeft: `3px solid ${riskColor}` }}>
                    <strong>Risk Rationale:</strong> {plan.risk_rationale}
                </div>
            </div>

            {/* Open Questions (Gating) */}
            {plan.open_questions && plan.open_questions.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti-help-alt"></i> Open Questions & Assumptions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {plan.open_questions.map(q => (
                            <div key={q.id} style={{ 
                                background: q.blocking ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)', 
                                border: `1px solid ${q.blocking ? 'rgba(239, 68, 68, 0.3)' : '#334155'}`, 
                                padding: '12px', borderRadius: '8px' 
                            }}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                    {q.blocking && <span style={{ background: '#ef4444', color: 'white', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>BLOCKING</span>}
                                    <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>{q.question}</span>
                                </div>
                                {q.proposed_answer && (
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', paddingLeft: q.blocking ? '68px' : '0' }}>
                                        ↳ <strong>Proposed Answer:</strong> {q.proposed_answer}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {hasBlocking && (
                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                                type="checkbox" id="override-blocking" 
                                checked={override} onChange={e => setOverride(e.target.checked)}
                                style={{ accentColor: '#6366f1' }}
                            />
                            <label htmlFor="override-blocking" style={{ fontSize: '0.8rem', color: '#f59e0b', cursor: 'pointer' }}>
                                Override blocking questions and proceed with proposed answers.
                            </label>
                        </div>
                    )}
                </div>
            )}

            {/* Module Breakdown */}
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti-layout-grid2"></i> Planned Modules
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {plan.modules.map((mod, idx) => (
                        <div key={idx} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>{mod.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{mod.description}</div>
                            </div>
                            
                            {/* Files */}
                            <div style={{ padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Files Modified</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {mod.files.map((f, i) => {
                                        const actionColor = 
                                            f.action === 'CREATE' ? '#10b981' : 
                                            f.action === 'MODIFY' ? '#f59e0b' : '#ef4444';
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.8rem' }}>
                                                <span style={{ 
                                                    color: actionColor, background: `${actionColor}15`, 
                                                    padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, minWidth: '55px', textAlign: 'center'
                                                }}>
                                                    {f.action}
                                                </span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{f.file_path}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>{f.description}</div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Approval Gate */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: '20px' }}>
                <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add approval notes or rejection feedback..."
                    style={{ 
                        width: '100%', padding: '12px', background: '#1e293b', border: '1px solid #334155', 
                        borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '16px', minHeight: '80px',
                        resize: 'vertical', boxSizing: 'border-box'
                    }}
                />
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button 
                        onClick={() => onReject(notes)}
                        disabled={loading}
                        style={{ 
                            padding: '8px 16px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
                            borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600
                        }}
                    >
                        Reject & Regenerate
                    </button>
                    <button 
                        onClick={() => onApprove(notes, override)}
                        disabled={loading || !canApprove}
                        style={{ 
                            padding: '8px 24px', background: canApprove ? '#10b981' : '#334155', border: 'none', color: 'white',
                            borderRadius: '6px', cursor: (loading || !canApprove) ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 700
                        }}
                    >
                        {loading ? 'Processing...' : 'Approve Plan'}
                    </button>
                </div>
            </div>
        </div>
    );
};
