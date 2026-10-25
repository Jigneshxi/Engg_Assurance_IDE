import React from 'react';

interface NfrToolResult {
    tool: string;
    module?: string;
    status: 'COMPLETED' | 'UNAVAILABLE' | 'ERROR' | 'TIMEOUT' | 'PENDING';
    score?: number;
    metrics?: Record<string, any>;
    error?: string;
}

export interface NfrClearanceReport {
    overall_status?: 'PASS' | 'WARN' | 'FAIL';
    overall_score?: number;
    tool_results?: {
        security?: NfrToolResult[];
        accessibility?: NfrToolResult[];
        performance?: NfrToolResult[];
        reliability?: NfrToolResult[];
        compliance?: NfrToolResult[];
    };
    blocking_findings?: string[];
    warnings?: string[];
    all_nfr_green?: boolean;
    remediation_plan?: {
        domain: string;
        issue: string;
        remediation_steps: string;
        effort: string;
    }[];
}

export const NfrAuditPanel = ({ report }: { report: NfrClearanceReport }) => {
    const domains = [
        { key: 'security', label: 'Security', icon: '🔒' },
        { key: 'accessibility', label: 'Accessibility', icon: '♿' },
        { key: 'performance', label: 'Performance', icon: '⚡' },
        { key: 'reliability', label: 'Reliability', icon: '🛡️' },
        { key: 'compliance', label: 'Compliance & Quality', icon: '✅' }
    ]

    const gatePassed = report?.all_nfr_green
    const overallStatus = report?.overall_status
    
    let bannerColor = { bg: '#451a03', border: '#d97706', text: '#fcd34d', label: '⏳ NFR Audits Running — Awaiting Results' }
    
    if (overallStatus === 'PASS') {
        bannerColor = { bg: '#064e3b', border: '#059669', text: '#6ee7b7', label: '✓ All NFR Audits Passed — Green Flag Gate Cleared' }
    } else if (overallStatus === 'WARN') {
        bannerColor = { bg: '#422006', border: '#b45309', text: '#fcd34d', label: '⚠ NFR Audits Passed with Warnings' }
    } else if (overallStatus === 'FAIL') {
        bannerColor = { bg: '#450a0a', border: '#dc2626', text: '#fca5a5', label: '✗ NFR Audits Failed — Gate Blocked' }
    }
    
    return (
        <div style={{padding: '16px'}}>
            <h3 style={{color: '#e2e8f0', marginBottom: '16px', fontSize: '1.25rem', fontWeight: 600}}>
                Pillar 4: Non-Functional Requirement (NFR) Audits
            </h3>
            
            {/* Gate status banner */}
            <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                background: bannerColor.bg,
                border: `1px solid ${bannerColor.border}`,
                color: bannerColor.text,
                fontWeight: 600,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>{bannerColor.label}</span>
                {report?.overall_score !== undefined && (
                    <span style={{background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px'}}>
                        Score: {report.overall_score}/100
                    </span>
                )}
            </div>

            {report?.blocking_findings && report.blocking_findings.length > 0 && (
                <div style={{marginBottom: '16px', padding: '12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '8px', color: '#fca5a5', fontSize: '13px'}}>
                    <strong>Blocking Findings:</strong>
                    <ul style={{marginTop: '8px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                        {report.blocking_findings.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                </div>
            )}
            
            {report?.warnings && report.warnings.length > 0 && (
                <div style={{marginBottom: '16px', padding: '12px', background: 'rgba(217, 119, 6, 0.1)', border: '1px solid #d97706', borderRadius: '8px', color: '#fcd34d', fontSize: '13px'}}>
                    <strong>Warnings:</strong>
                    <ul style={{marginTop: '8px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                        {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}

            {/* Domain cards */}
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px'}}>
                {domains.map(({key, label, icon}) => {
                    const domainResults = report?.tool_results?.[key as keyof typeof report.tool_results] as NfrToolResult[] || []
                    
                    return (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0'}}>
                                <span style={{fontSize: '24px'}}>{icon}</span>
                                <span style={{color: '#e2e8f0', fontWeight: 600, fontSize: '1.1rem'}}>{label}</span>
                            </div>
                            
                            {domainResults.length === 0 ? (
                                <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '16px', color: '#94a3b8', fontStyle: 'italic', fontSize: '13px' }}>
                                    Awaiting audit execution...
                                </div>
                            ) : (
                                domainResults.map((domain, idx) => {
                                    const status = domain?.status || 'PENDING'
                                    const colors = {
                                        COMPLETED: {bg: '#064e3b', border: '#059669', text: '#6ee7b7'},
                                        UNAVAILABLE: {bg: '#3f3f46', border: '#71717a', text: '#d4d4d8'},
                                        ERROR: {bg: '#450a0a', border: '#dc2626', text: '#fca5a5'},
                                        TIMEOUT: {bg: '#422006', border: '#b45309', text: '#fcd34d'},
                                        PENDING: {bg: '#1e293b', border: '#475569', text: '#94a3b8'}
                                    }
                                    const color = colors[status] || colors.PENDING
                                    
                                    return (
                                        <div key={idx} style={{
                                            background: color.bg,
                                            border: `1px solid ${color.border}`,
                                            borderRadius: '8px',
                                            padding: '16px',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                        }}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px'}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                    <span style={{color: color.text, fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase'}}>Module: {domain.module || 'global'}</span>
                                                </div>
                                                <div style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    background: color.border,
                                                    color: 'white',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    {status}
                                                </div>
                                            </div>
                                            
                                            {status === 'COMPLETED' ? (
                                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px'}}>
                                                    {domain?.score !== undefined && (
                                                        <div style={{fontSize: '18px', fontWeight: 700, color: color.text, marginBottom: '4px'}}>
                                                            Score: {domain.score}/100
                                                        </div>
                                                    )}
                                                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#cbd5e1'}}>
                                                        {domain?.metrics && Object.entries(domain.metrics).map(([mKey, mVal]) => (
                                                            <div key={mKey} style={{background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px'}}>
                                                                <div style={{opacity: 0.7, textTransform: 'uppercase', fontSize: '10px'}}>{mKey}</div>
                                                                <div style={{fontWeight: 600}}>{String(mVal)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{fontSize: '13px', color: '#94a3b8', marginTop: '16px', fontStyle: 'italic'}}>
                                                    {status === 'PENDING' ? 'Awaiting audit execution...' : (domain?.error || 'No checks performed.')}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Remediation Plan */}
            {report?.remediation_plan && report.remediation_plan.length > 0 && (
                <div style={{ marginTop: '24px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <i className="ti-medall" style={{ color: '#3b82f6', fontSize: '1.2rem' }}></i>
                        <h4 style={{ color: '#e2e8f0', margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Actionable Remediation Plan</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {report.remediation_plan.map((item, idx) => (
                            <div key={idx} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                        {item.domain}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.7rem', 
                                        fontWeight: 700, 
                                        padding: '2px 8px', 
                                        borderRadius: '12px',
                                        background: item.effort === 'High' ? 'rgba(239,68,68,0.2)' : item.effort === 'Medium' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
                                        color: item.effort === 'High' ? '#fca5a5' : item.effort === 'Medium' ? '#fcd34d' : '#6ee7b7'
                                    }}>
                                        Effort: {item.effort}
                                    </div>
                                </div>
                                <div style={{ color: '#fca5a5', fontSize: '0.9rem', marginBottom: '12px', fontWeight: 500 }}>
                                    <strong>Issue:</strong> {item.issue}
                                </div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px' }}>
                                    {item.remediation_steps}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
