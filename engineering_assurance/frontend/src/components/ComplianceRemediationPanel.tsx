/**
 * ============================================================================
 * CONVERGE PHASE 2.2 - COMPLIANCE REMEDIATION PR PANEL
 * ============================================================================
 * PURPOSE: Display AI-generated code PRs to fix compliance violations.
 *
 * Features:
 * - PR list with severity, standard, and effort badges
 * - Expandable diff viewer (syntax-highlighted unified diff)
 * - Approve / Reject / Merge actions per PR
 * - Status tracking (PROPOSED → APPROVED → MERGED)
 * - "Remediate All" bulk action
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

interface FileChange {
  filename: string;
  language: string;
  diff: string;
}

interface RemediationPR {
  pr_id: string;
  violation_id: string;
  standard: string;
  severity: string;
  pr_title: string;
  pr_description: string;
  remediation_type: string;
  file_changes: FileChange[];
  estimated_effort: string;
  breaking_change: boolean;
  status: string;
  auto_generated: boolean;
}
interface ComplianceRemediationPanelProps {
  taskId: string | null;
  demoMode?: boolean;
  fullMeshState?: any;
}

const DEMO_PRS: RemediationPR[] = [
  {
    pr_id: 'PR-001',
    violation_id: 'GDPR-001',
    standard: 'GDPR',
    severity: 'CRITICAL',
    pr_title: 'fix: Add PII masking to user data endpoints',
    pr_description: '## Summary\nPersonally Identifiable Information (PII) is being logged without masking, violating GDPR Article 25.\n\n## Compliance\n- Standard: GDPR\n- Violation: PII exposed in application logs\n\n## Changes\n- Added `mask_pii()` utility function\n- Applied masking to all user data before logging\n\n## Testing\n- Run `pytest tests/test_pii_masking.py` to verify',
    remediation_type: 'code_fix',
    file_changes: [{
      filename: 'src/utils/data_masking.py',
      language: 'python',
      diff: `--- a/src/utils/data_masking.py
+++ b/src/utils/data_masking.py
@@ -1,3 +1,18 @@
+import re
+
+PII_FIELDS = ['email', 'phone', 'ssn', 'credit_card', 'password', 'dob']
+
+def mask_pii(data: dict) -> dict:
+    """Mask PII fields before logging or storing. GDPR Article 25."""
+    masked = data.copy()
+    for field in PII_FIELDS:
+        if field in masked and masked[field]:
+            value = str(masked[field])
+            if field == 'email':
+                parts = value.split('@')
+                masked[field] = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 else '***@***.***'
+            else:
+                masked[field] = '***REDACTED***'
+    return masked
+
 def get_user_data(user_id: str) -> dict:
-    user = db.query(User).filter(User.id == user_id).first()
-    logger.info(f"Fetched user: {user.__dict__}")
+    user = db.query(User).filter(User.id == user_id).first()
+    logger.info(f"Fetched user: {mask_pii(user.__dict__)}")
     return user`
    }],
    estimated_effort: 'S',
    breaking_change: false,
    status: 'PROPOSED',
    auto_generated: true
  },
  {
    pr_id: 'PR-002',
    violation_id: 'SOC2-SEC-01',
    standard: 'SOC2',
    severity: 'HIGH',
    pr_title: 'fix: Enable TLS 1.3 and enforce encrypted connections',
    pr_description: '## Summary\nDatabase connections are not enforcing SSL/TLS, violating SOC2 CC6.7.\n\n## Compliance\n- Standard: SOC2\n- Control: CC6.7 — Encryption in transit\n\n## Changes\n- Enabled SSL mode on database connection\n- Added certificate validation\n\n## Testing\n- Verify with `openssl s_client -connect db:5432`',
    remediation_type: 'config_change',
    file_changes: [{
      filename: 'src/config/database.py',
      language: 'python',
      diff: `--- a/src/config/database.py
+++ b/src/config/database.py
@@ -8,7 +8,11 @@
 DATABASE_CONFIG = {
     'host': os.getenv('DB_HOST'),
     'port': 5432,
-    'ssl_mode': 'disable',
+    'ssl_mode': 'require',
+    'ssl_cert': '/etc/ssl/certs/db-client.pem',
+    'ssl_key': '/etc/ssl/private/db-client.key',
+    'ssl_ca': '/etc/ssl/certs/ca-bundle.crt',
+    'connect_timeout': 10,
 }`
    }],
    estimated_effort: 'XS',
    breaking_change: false,
    status: 'PROPOSED',
    auto_generated: true
  }
];

// ── Status Badge ──────────────────────────────────────────────────────────────
const PRStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; color: string; border: string }> = {
    PROPOSED: { bg: 'rgba(99,102,241,0.1)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.25)' },
    APPROVED: { bg: 'rgba(16,185,129,0.1)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.25)' },
    REJECTED: { bg: 'rgba(239,68,68,0.1)',   color: '#fca5a5', border: 'rgba(239,68,68,0.25)' },
    MERGED:   { bg: 'rgba(139,92,246,0.1)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.25)' },
  };
  const c = config[status] || config.PROPOSED;
  return (
    <span style={{
      padding: '3px 9px', borderRadius: '20px', fontSize: '0.62rem', fontWeight: 800,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.5px'
    }}>
      {status}
    </span>
  );
};

// ── Severity Dot ──────────────────────────────────────────────────────────────
const SeverityDot: React.FC<{ severity: string }> = ({ severity }) => {
  const colors: Record<string, string> = {
    CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#6366f1', LOW: '#64748b'
  };
  return (
    <span style={{
      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
      background: colors[severity] || '#64748b', flexShrink: 0,
      boxShadow: `0 0 6px ${colors[severity] || '#64748b'}66`,
      animation: severity === 'CRITICAL' ? 'breathingAlert 2s infinite ease-in-out' : 'none'
    }}>
      <style>{`
        @keyframes breathingAlert {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
          50% { transform: scale(1.4); opacity: 0.7; box-shadow: 0 0 16px rgba(239,68,68,0.8); }
        }
      `}</style>
    </span>
  );
};

// ── Diff Viewer ───────────────────────────────────────────────────────────────
const DiffViewer: React.FC<{ diff: string; filename: string }> = ({ diff, filename }) => {
  const lines = diff.split('\n');
  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* File header */}
      <div style={{
        padding: '8px 14px', background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <i className="ti-file" style={{ color: '#64748b', fontSize: '0.75rem' }} />
        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#94a3b8' }}>{filename}</span>
      </div>
      {/* Diff lines */}
      <div style={{ background: '#020617', padding: '8px 0', maxHeight: '280px', overflowY: 'auto' }}>
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHunk = line.startsWith('@@');
          const isMeta = line.startsWith('---') || line.startsWith('+++');
          return (
            <div key={i} style={{
              padding: '1px 14px',
              background: isAdd ? 'rgba(16,185,129,0.08)' : isDel ? 'rgba(239,68,68,0.08)' : isHunk ? 'rgba(99,102,241,0.06)' : 'transparent',
              borderLeft: `3px solid ${isAdd ? '#10b981' : isDel ? '#ef4444' : isHunk ? '#6366f1' : 'transparent'}`,
              fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: '1.6',
              color: isAdd ? '#6ee7b7' : isDel ? '#fca5a5' : isHunk ? '#818cf8' : isMeta ? '#475569' : '#94a3b8',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── PR Card ───────────────────────────────────────────────────────────────────
const PRCard: React.FC<{
  pr: RemediationPR;
  onStatusChange: (prId: string, status: string) => void;
}> = ({ pr, onStatusChange }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeFile, setActiveFile] = useState(0);

  const effortColors: Record<string, string> = {
    XS: '#10b981', S: '#6366f1', M: '#f59e0b', L: '#ef4444'
  };

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${pr.status === 'APPROVED' ? 'rgba(16,185,129,0.25)' : pr.status === 'REJECTED' ? 'rgba(239,68,68,0.15)' : pr.status === 'MERGED' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
      background: 'rgba(255,255,255,0.02)',
      overflow: 'hidden'
    }}>
      {/* PR Header */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <SeverityDot severity={pr.severity} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#475569' }}>{pr.pr_id}</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9' }}>{pr.pr_title}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <PRStatusBadge status={pr.status} />
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
              {pr.standard}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700, background: `${effortColors[pr.estimated_effort] || '#64748b'}15`, color: effortColors[pr.estimated_effort] || '#64748b', border: `1px solid ${effortColors[pr.estimated_effort] || '#64748b'}30` }}>
              Effort: {pr.estimated_effort}
            </span>
            {pr.breaking_change && (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                ⚠️ Breaking Change
              </span>
            )}
            <span style={{ fontSize: '0.62rem', color: '#475569' }}>
              {pr.file_changes.length} file{pr.file_changes.length !== 1 ? 's' : ''} changed
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)', color: '#64748b', fontSize: '0.72rem',
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
            flexShrink: 0
          }}
        >
          <i className={expanded ? 'ti-angle-up' : 'ti-angle-down'} />
          {expanded ? 'Collapse' : 'View Diff'}
        </button>
      </div>

      {/* Expanded: Description + Diff */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* PR Description */}
          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              PR Description
            </div>
            <pre style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {pr.pr_description}
            </pre>
          </div>

          {/* File Tabs */}
          {pr.file_changes.length > 1 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {pr.file_changes.map((fc, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFile(i)}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', border: 'none',
                    background: activeFile === i ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                    color: activeFile === i ? '#a5b4fc' : '#64748b',
                    fontSize: '0.68rem', fontFamily: 'monospace', cursor: 'pointer'
                  }}
                >
                  {fc.filename.split('/').pop()}
                </button>
              ))}
            </div>
          )}

          {/* Diff Viewer */}
          {pr.file_changes[activeFile] && (
            <DiffViewer
              diff={pr.file_changes[activeFile].diff}
              filename={pr.file_changes[activeFile].filename}
            />
          )}
        </div>
      )}

      {/* Action Bar */}
      {pr.status === 'PROPOSED' && (
        <div style={{
          padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => onStatusChange(pr.pr_id, 'REJECTED')}
            style={{
              padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontSize: '0.72rem',
              fontWeight: 700, cursor: 'pointer'
            }}
          >
            <i className="ti-close" style={{ marginRight: '5px' }} />Reject
          </button>
          <button
            onClick={() => onStatusChange(pr.pr_id, 'APPROVED')}
            style={{
              padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)',
              background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', fontSize: '0.72rem',
              fontWeight: 700, cursor: 'pointer'
            }}
          >
            <i className="ti-check" style={{ marginRight: '5px' }} />Approve
          </button>
          <button
            onClick={() => onStatusChange(pr.pr_id, 'MERGED')}
            style={{
              padding: '7px 16px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
            }}
          >
            <i className="ti-git-merge" style={{ marginRight: '5px' }} />Merge Fix
          </button>
        </div>
      )}

      {/* Approved/Merged state */}
      {(pr.status === 'APPROVED' || pr.status === 'MERGED') && (
        <div style={{
          padding: '10px 18px', borderTop: '1px solid rgba(16,185,129,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="ti-check" />
            {pr.status === 'MERGED' ? 'Fix merged into codebase' : 'Approved — ready to merge'}
          </span>
          {pr.status === 'APPROVED' && (
            <button
              onClick={() => onStatusChange(pr.pr_id, 'MERGED')}
              style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none',
                background: 'rgba(139,92,246,0.2)', color: '#c4b5fd',
                fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Mark Merged
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ComplianceRemediationPanel: React.FC<ComplianceRemediationPanelProps> = ({ taskId, demoMode, fullMeshState }) => {
  const [prs, setPRs] = useState<RemediationPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    // V4.7.0 Enrichment: If mesh state exists, use it immediately
    if (fullMeshState) {
      const remediation = fullMeshState.compliance_remediation;
      if (remediation && remediation.prs) {
        setPRs(remediation.prs);
        return;
      }
    }

    if (!taskId) return;
    fetchPRs();
  }, [taskId, fullMeshState]);

  const fetchPRs = async () => {
    setLoading(true); setError('');
    try {
      const data = await apiClient.get(`/api/converge/remediation/${taskId}`);
      if (data.status === "COMPLETED") {
        setPRs(data.prs || []);
      } else {
        setError('Remediation data not available. Run a mission with Certify module enabled.');
      }
    } catch (e: any) {
      setError(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (prId: string, status: string) => {
    // Optimistic update
    setPRs(prev => prev.map(pr => pr.pr_id === prId ? { ...pr, status } : pr));

    if (taskId) {
      try {
        await fetch(`${API_BASE}/api/converge/remediation/${taskId}/update-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pr_id: prId, status })
        });
      } catch { /* non-blocking */ }
    }
  };

  const handleRemediateAll = () => {
    setPRs(prev => prev.map(pr =>
      pr.status === 'PROPOSED' ? { ...pr, status: 'APPROVED' } : pr
    ));
  };

  const filteredPRs = filterStatus === 'ALL' ? prs : prs.filter(pr => pr.status === filterStatus);
  const proposedCount = prs.filter(pr => pr.status === 'PROPOSED').length;
  const mergedCount = prs.filter(pr => pr.status === 'MERGED').length;
  const criticalCount = prs.filter(pr => pr.severity === 'CRITICAL').length;

  if (!taskId && !fullMeshState) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px', color: '#475569', textAlign: 'center' }}>
        <i className="ti-shield" style={{ fontSize: '2.5rem', color: '#334155' }} />
        <p style={{ fontSize: '0.85rem', maxWidth: '300px', lineHeight: 1.6 }}>
          No compliance remediation data is available yet. Run a mission with the Certify module to generate compliance remediation PRs.
        </p>
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', color: '#c7d2fe', fontSize: '0.85rem' }}>
        <strong>Validation:</strong> no remediation PRs are available yet. Run Requirement Ops with the Certify module enabled to generate compliance fixes.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti-shield" style={{ color: '#6366f1', fontSize: '1rem' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f1f5f9' }}>
              Compliance Remediation PRs
            </h3>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>
              AI-generated code fixes for compliance violations
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {proposedCount > 0 && (
            <button
              onClick={handleRemediateAll}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <i className="ti-check-box" />
              Approve All ({proposedCount})
            </button>
          )}
          <button
            onClick={() => setShowSummary(!showSummary)}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
              background: showSummary ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', color: showSummary ? '#a5b4fc' : '#64748b', fontSize: '0.72rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
            title="Toggle Executive Summary"
          >
            <i className="ti-files" /> {showSummary ? 'Hide Summary' : 'Exec Summary'}
          </button>
          <button
            onClick={fetchPRs}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.03)', color: '#64748b', fontSize: '0.72rem',
              cursor: 'pointer'
            }}
          >
            <i className="ti-reload" />
          </button>
        </div>
      </div>

      {/* Executive Summary Panel */}
      {showSummary && (
        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.2)', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.6', animation: 'fadeInDown 0.3s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#a5b4fc', fontWeight: 800 }}>
            <i className="ti-pie-chart" /> Compliance Posture Overview
          </div>
          <p style={{ margin: '0 0 10px 0' }}>The Agent Mesh has analyzed the codebase against active compliance guardrails. <strong>{prs.length} violations</strong> were identified and automatically remediated.</p>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {criticalCount > 0 && <li><strong style={{ color: '#ef4444' }}>Critical Risk:</strong> {criticalCount} high-severity violations required immediate remediation to prevent data exposure.</li>}
            <li><strong>Auto-Remediation:</strong> All identified issues have proposed code-level fixes ready for engineering review.</li>
            <li><strong>Audit Readiness:</strong> Approving these PRs will realign the project with required compliance baselines (e.g., GDPR, SOC2).</li>
          </ul>
          <style>{`@keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Stats Row */}
      {prs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { label: 'Total PRs', value: prs.length, color: '#6366f1' },
            { label: 'Critical', value: criticalCount, color: '#ef4444' },
            { label: 'Proposed', value: proposedCount, color: '#f59e0b' },
            { label: 'Merged', value: mergedCount, color: '#10b981' },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '12px', borderRadius: '10px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.62rem', color: '#475569', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      {prs.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {['ALL', 'PROPOSED', 'APPROVED', 'MERGED', 'REJECTED'].map(status => {
            const count = status === 'ALL' ? prs.length : prs.filter(p => p.status === status).length;
            if (status !== 'ALL' && count === 0) return null;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: '7px', border: 'none',
                  background: filterStatus === status ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: filterStatus === status ? '#a5b4fc' : '#64748b',
                  fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {status} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', color: '#64748b', fontSize: '0.85rem', justifyContent: 'center' }}>
          <i className="ti-reload" style={{ animation: 'spin 1s linear infinite' }} />
          Generating remediation PRs...
          <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d', fontSize: '0.82rem' }}>
          <i className="ti-alert" style={{ marginRight: '8px' }} />{error}
        </div>
      )}

      {!loading && !error && prs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          <i className="ti-check-box" style={{ fontSize: '2.5rem', color: '#10b981', display: 'block', marginBottom: '12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981', margin: '0 0 6px' }}>No Violations Found</p>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>All compliance controls are satisfied.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredPRs.map(pr => (
          <PRCard key={pr.pr_id} pr={pr} onStatusChange={handleStatusChange} />
        ))}
      </div>
    </div>
  );
};

export default ComplianceRemediationPanel;
