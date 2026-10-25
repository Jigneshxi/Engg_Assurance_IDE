/**
 * ================================================================================
 * SeQuor AGENT MESH — COMPLIANCE REMEDIATION SPECIALIST WORKSPACE
 * ================================================================================
 */

import React, { useState } from 'react';
import WorkspaceShell, { WorkspaceEmptyState } from './WorkspaceShell';

interface ComplianceRemediationWorkspaceProps {
  onInvoke: (context: string) => void;
  loading: boolean;
  telemetry: any;
  fullMeshState?: any;
}

const ComplianceRemediationWorkspace: React.FC<ComplianceRemediationWorkspaceProps> = ({ onInvoke, loading, telemetry }) => {
  const [activeTab, setActiveTab] = useState<'violations' | 'patches' | 'report'>('violations');

  const liveViolations = React.useMemo(() => {
    if (!telemetry) return null;
    try {
      const parsed = typeof telemetry === 'string' ? JSON.parse(telemetry) : telemetry;
      const arr = parsed.violations || parsed.issues || parsed.findings || parsed.vulnerabilities || (Array.isArray(parsed) ? parsed : null);
      if (arr && Array.isArray(arr)) {
        return arr.map((v: any, i: number) => ({
          id: v.id || v.finding_id || v.code || `SEC-${100+i}`,
          origin: v.origin || v.rule || v.policy || v.type || 'Custom Audit',
          sev: v.sev || v.severity || v.risk || 'Medium',
          fix: (v.auto_fix || v.fixable || v.fix === 'yes') ? 'yes' : 'no'
        }));
      }
    } catch { return null; }
    return null;
  }, [telemetry]);

  const TABS = [
    { id: 'violations', label: 'Violation Queue',      icon: 'ti-alert' },
    { id: 'patches',    label: 'Suggested Patches',    icon: 'ti-wand' },
    { id: 'report',     label: 'Audit Certification',  icon: 'ti-files' },
  ];

  return (
    <WorkspaceShell
      nodeKey="compliance_remediation"
      loading={loading}
      onInvoke={onInvoke}
    >
      <div className="cr-content">
          {activeTab === 'violations' && (
            <div className="cr-violations-panel">
              <div className="cr-section-header">
                <h3>Static Compliance Scans</h3>
                <div className="cr-score-badge">Security Score: 78/100</div>
              </div>
              <div className="cr-grid header">
                <span>Finding ID</span>
                <span>Audit Origin</span>
                <span>Severity</span>
                <span>Auto-Fixable</span>
              </div>
              {liveViolations && liveViolations.length > 0 ? liveViolations.map((v: any, idx: number) => (
                <div key={idx} className="cr-grid row">
                  <span className="cr-id">{v.id}</span>
                  <span className="cr-origin">{v.origin}</span>
                  <span className={`cr-sev-pill ${String(v.sev).toLowerCase()}`}>{v.sev}</span>
                  <span className={`cr-fix-stat ${v.fix}`}>{v.fix === 'yes' ? '● Ready' : '● Manual Action'}</span>
                </div>
              )) : (
                <WorkspaceEmptyState message="Remediate Findings to populate violation queue" icon="ti-alert" />
              )}
            </div>
          )}

          {activeTab === 'patches' && (
            <div className="cr-patches-panel">
              <div className="cr-patch-card">
                <div className="header">
                  <h5>Patch #SEC-401: Encrypt At Rest</h5>
                  <button className="apply-btn">Apply Injection</button>
                </div>
                <pre className="patch-diff">
{`- storage: local-fs
+ storage: aes256-vault
+ kms_provider: sequor-gate`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="cr-report-view">
              <div className="cr-cert-box">
                <i className="ti-medal"></i>
                <h4>Ready for Attestation</h4>
                <p>All critical GDPR and PCI violations have been mapped to SeQuor Remediation scripts.</p>
                <div className="cert-id">CERT-ID: SQ-88421-2026</div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .cr-content { flex: 1; padding: 10px 0; }
          .cr-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
          .cr-section-header h3 { font-size: 1rem; color: #1e293b; margin: 0; }
          .cr-score-badge { font-size: 0.75rem; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 4px 12px; border-radius: 20px; }
          .cr-grid { display: grid; grid-template-columns: 100px 1fr 120px 140px; gap: 15px; align-items: center; padding: 12px; }
          .cr-grid.header { background: #f8fafc; border-radius: 8px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .cr-grid.row { border-bottom: 1px solid #f1f5f9; }
          .cr-id { font-family: monospace; font-size: 0.8rem; font-weight: 700; color: #6366f1; }
          .cr-origin { font-size: 0.85rem; color: #1e293b; font-weight: 500; }
          .cr-sev-pill { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-align: center; color: white; }
          .cr-sev-pill.critical { background: #ef4444; }
          .cr-sev-pill.high { background: #f97316; }
          .cr-sev-pill.medium { background: #f59e0b; }
          .cr-fix-stat { font-size: 0.75rem; font-weight: 600; }
          .cr-fix-stat.yes { color: #10b981; }
          .cr-fix-stat.no { color: #94a3b8; }
          .cr-patch-card { border-radius: 12px; background: #fff; border: 1px solid #e2e8f0; overflow: hidden; }
          .cr-patch-card .header { padding: 15px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
          .cr-patch-card h5 { margin: 0; font-size: 0.95rem; color: #1e293b; }
          .cr-patch-card .apply-btn { padding: 4px 10px; background: #10b981; color: #fff; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
          .patch-diff { margin: 0; padding: 20px; background: #0f172a; color: #10b981; font-family: monospace; font-size: 0.85rem; }
          .cr-cert-box { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 40px; border-radius: 12px; text-align: center; color: #fff; }
          .cr-cert-box i { font-size: 3rem; color: #fbbf24; margin-bottom: 15px; }
          .cr-cert-box h4 { margin: 0 0 10px; font-size: 1.2rem; }
          .cr-cert-box p { margin: 0 0 20px; color: #94a3b8; font-size: 0.9rem; }
          .cert-id { font-family: monospace; font-size: 0.8rem; color: #fbbf24; font-weight: 800; border: 1px dashed #fbbf24; padding: 5px 15px; border-radius: 4px; display: inline-block; }
        `}</style>
    </WorkspaceShell>
  );
};

export default ComplianceRemediationWorkspace;
