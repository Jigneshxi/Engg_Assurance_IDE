/**
 * BrownfieldAuditView — Code Health Scan Dashboard
 * ================================================
 * Three-panel layout: file tree (left) + code viewer (center) + finding detail (right).
 * Uses a zero-dependency <pre> + line-number + gutter-marker viewer (no CodeMirror/Monaco).
 *
 * Status lifecycle for findings:
 *   open → fix_suggested → fix_applied | fix_verified | fix_failed | wont_fix
 *
 * UI distinction for secret findings:
 *   fix_applied  → "✓ Fix applied, pending full re-scan"
 *   fix_verified → "✓ Verified fixed"
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8585';

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};

const SEV_BG: Record<string, string> = {
  critical: 'rgba(239,68,68,0.12)',
  high:     'rgba(249,115,22,0.10)',
  medium:   'rgba(234,179,8,0.10)',
  low:      'rgba(34,197,94,0.08)',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:          { label: 'Open',                              color: '#94a3b8' },
  fix_suggested: { label: 'Fix ready',                        color: '#60a5fa' },
  fix_applied:   { label: '✓ Fix applied — pending re-scan',  color: '#f59e0b' },
  fix_verified:  { label: '✓ Verified fixed',                  color: '#22c55e' },
  fix_failed:    { label: '✗ Fix failed',                      color: '#ef4444' },
  wont_fix:      { label: 'Dismissed',                         color: '#475569' },
};

// Mini syntax highlighter
const highlightPython = (code: string) => {
  if (!code) return code;
  let hl = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Single-pass regex to prevent recursive matching on inserted HTML
  const regex = /("(?:\\"|[^"])*"|'(?:\\'|[^'])*')|(#.*$)|(\b(?:def|class|if|elif|else|for|while|try|except|with|as|return|from|import|and|or|not|is|in)\b)|(\b\d+\b)|(\b(?:True|False|None)\b)|(\b(?:print|len|range|int|str|bool|list|dict|set)\b)/gm;
  
  return hl.replace(regex, (match, string, comment, keyword, number, boolean, builtin) => {
    if (string) return `<span style="color:#7ee787">${string}</span>`;
    if (comment) return `<span style="color:#8b949e">${comment}</span>`;
    if (keyword) return `<span style="color:#ff7b72">${keyword}</span>`;
    if (number) return `<span style="color:#79c0ff">${number}</span>`;
    if (boolean) return `<span style="color:#79c0ff">${boolean}</span>`;
    if (builtin) return `<span style="color:#d2a8ff">${builtin}</span>`;
    return match;
  });
};

interface AuditSummary {
  audit_id: number;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'COMPLETE_TOOLS_UNAVAILABLE' | 'FAILED' | 'none';
  total_files_scanned: number;
  total_findings: number;
  tools_run: string[];
  tools_unavailable: string[];
  tools_not_configured: string[];
  tools_not_applicable: string[];
  findings_by_severity: Record<string, number>;
}

interface FileSummary {
  file_path: string;
  severities: Record<string, number>;
  total: number;
}

interface Finding {
  id: number;
  file_path: string;
  line: number;
  col?: number;
  severity: string;
  category: string;
  tool: string;
  rule_id: string;
  message: string;
  code_snippet?: string;
  status: string;
  suggested_fix?: string;
  fix_commit_sha?: string;
}

interface Props {
  missionId: string;
  onContinueToPRD: () => void;
  onSkip: () => void;
}

export default function BrownfieldAuditView({ missionId, onContinueToPRD, onSkip }: Props) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null);
  const [loadingFix, setLoadingFix] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const [dismissInput, setDismissInput] = useState('');
  const [showDismissBox, setShowDismissBox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isLocalFolder, setIsLocalFolder] = useState(false);

  useEffect(() => {
    try {
      const linked = sessionStorage.getItem(`codebase_linked_${missionId}`);
      if (linked) {
        const parsed = JSON.parse(linked);
        if (parsed.platform === 'local_folder' || parsed.mode === 'forge') {
          setIsLocalFolder(true);
        }
      }
    } catch(e) {}
  }, [missionId]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fileContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [fileContent]);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // ── Poll audit status ─────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/${missionId}/audit`, {
        headers: authHeader() as any
      });
      if (!res.ok) return;
      const data: AuditSummary = await res.json();
      setSummary(data);
      if (data.status === 'COMPLETE' || data.status === 'FAILED') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data.status === 'COMPLETE') fetchFiles();
      }
    } catch (_) {}
  }, [missionId]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/${missionId}/audit/files`, {
        headers: authHeader() as any
      });
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data.files || []);
    } catch (_) {}
  }, [missionId]);

  useEffect(() => {
    fetchSummary();
    pollRef.current = setInterval(fetchSummary, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchSummary]);

  // ── Select a file ─────────────────────────────────────────────────────────
  const selectFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    setActiveFinding(null);
    setFileContent('');
    try {
      const res = await fetch(
        `${API_BASE}/api/git/${missionId}/audit/files/${encodeURIComponent(filePath)}`,
        { headers: authHeader() as any }
      );
      if (!res.ok) return;
      const data = await res.json();
      setFindings(data.findings || []);
      setFileContent(data.file_content || '');
    } catch (_) {}
  }, [missionId]);

  // ── Fix actions ───────────────────────────────────────────────────────────
  const requestSuggestFix = useCallback(async (findingId: number) => {
    setLoadingFix(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/git/${missionId}/audit/findings/${findingId}/suggest-fix`,
        { method: 'POST', headers: authHeader() as any }
      );
      if (!res.ok) return;
      const data = await res.json();
      setFindings(prev => prev.map(f =>
        f.id === findingId ? { ...f, suggested_fix: data.suggested_fix, status: 'fix_suggested' } : f
      ));
      setActiveFinding(prev => prev?.id === findingId
        ? { ...prev, suggested_fix: data.suggested_fix, status: 'fix_suggested' }
        : prev
      );
    } catch (_) {} finally { setLoadingFix(false); }
  }, [missionId]);

  const applyFix = useCallback(async (finding: Finding) => {
    if (!finding.suggested_fix) return;
    setApplyingFix(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/git/${missionId}/audit/findings/${finding.id}/apply-fix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader() as any) },
          body: JSON.stringify({ fix_content: finding.suggested_fix })
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      // Any stale findings in same file were reset by backend — re-fetch
      await selectFile(finding.file_path);
      await fetchFiles();
      setActiveFinding(prev => prev?.id === finding.id
        ? { ...prev, status: data.status, fix_commit_sha: data.commit_sha }
        : prev
      );
    } catch (_) {} finally { setApplyingFix(false); }
  }, [missionId, selectFile, fetchFiles]);

  const dismissFinding = useCallback(async (findingId: number, reason: string) => {
    try {
      await fetch(
        `${API_BASE}/api/git/${missionId}/audit/findings/${findingId}/dismiss`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader() as any) },
          body: JSON.stringify({ reason })
        }
      );
      setFindings(prev => prev.map(f =>
        f.id === findingId ? { ...f, status: 'wont_fix' } : f
      ));
      setActiveFinding(null);
      setShowDismissBox(false);
      setDismissInput('');
      await fetchFiles();
    } catch (_) {}
  }, [missionId, fetchFiles]);

  // ── Derived counts ────────────────────────────────────────────────────────
  const resolvedCount = findings.filter(f => f.status === 'fix_verified' || f.status === 'fix_applied').length;
  const dismissedCount = findings.filter(f => f.status === 'wont_fix').length;
  const openCount = findings.filter(f => f.status === 'open' || f.status === 'fix_suggested' || f.status === 'fix_failed').length;

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    return files.filter(f => f.file_path.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  // Sum total severities
  const totalSeverities = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    files.forEach(f => {
      counts.critical += f.severities.critical || 0;
      counts.high += f.severities.high || 0;
      counts.medium += f.severities.medium || 0;
      counts.low += f.severities.low || 0;
    });
    return counts;
  }, [files]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#040d1a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        /* Sleek custom scrollbars */
        .brownfield-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .brownfield-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .brownfield-scroll::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 4px;
        }
        .brownfield-scroll::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}</style>
      
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid #0f172a',
        background: '#020617',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.2rem' }}>🕵️</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
              Code Health Scan
            </h2>
            {summary && summary.status !== 'none' && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                {summary.status === 'QUEUED' && 'Scan queued…'}
                {summary.status === 'RUNNING' && 'Scanning repository…'}
                {(summary.status === 'COMPLETE' || summary.status === 'COMPLETE_TOOLS_UNAVAILABLE') && 
                  `Open Source files scanned - ${summary.total_findings} findings`}
                {summary.status === 'FAILED' && '⚠ Scan failed'}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button id="audit-skip-btn" onClick={onSkip} style={{
            background: 'transparent', border: '1px solid #334155',
            color: '#cbd5e1', padding: '8px 16px', borderRadius: '6px',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500
          }}>Skip audit</button>
          <button id="audit-continue-btn" onClick={onContinueToPRD} style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            border: 'none', color: '#fff', padding: '8px 20px',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
          }}>Continue to PRD →</button>
        </div>
      </div>

      {/* Scan-in-progress banner */}
      {(summary?.status === 'QUEUED' || summary?.status === 'RUNNING') && (
        <div style={{
          padding: '24px', textAlign: 'center', color: '#60a5fa',
          borderBottom: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontWeight: 600 }}>
            {summary.status === 'QUEUED' ? 'Preparing scan…' : 'Running Semgrep · Lint · Secret scan…'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>
            Results will appear here automatically when complete.
          </div>
        </div>
      )}

      {/* Three-panel layout — only shown when COMPLETE */}
      {summary?.status === 'COMPLETE' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width: '260px', minWidth: '260px', display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #1e293b', background: '#0b1120',
          }}>
            <div style={{ padding: '20px 16px 12px 16px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '12px' }}>
                {files.length} FILES WITH FINDINGS
              </div>
              <div style={{ position: 'relative' }}>
                <i className="ti-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.9rem' }}></i>
                <input 
                  type="text" 
                  placeholder="Search files..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', background: 'transparent', border: '1px solid #334155', borderRadius: '6px',
                    padding: '8px 12px 8px 32px', color: '#f8fafc', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
                  }}
                />
                <i className="ti-filter" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.9rem', cursor: 'pointer' }}></i>
              </div>
            </div>
            
            {/* File List */}
            <div className="brownfield-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              {filteredFiles.map(f => {
                const highestSev = f.severities.critical ? 'critical' : f.severities.high ? 'high' : f.severities.medium ? 'medium' : 'low';
                return (
                  <div
                    key={f.file_path}
                    onClick={() => selectFile(f.file_path)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      background: selectedFile === f.file_path ? '#0f1f3a' : 'transparent',
                      borderLeft: selectedFile === f.file_path ? `3px solid ${SEV_COLOR[highestSev]}` : '3px solid transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#e2e8f0', wordBreak: 'break-all', display: 'flex', gap: '6px', marginBottom: '8px', fontWeight: 500 }}>
                      <i className="ti-file" style={{ opacity: 0.7 }}></i> {f.file_path}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['critical','high','medium','low'] as const).map(sev =>
                        f.severities[sev] ? (
                          <span key={sev} style={{
                            fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px',
                            color: SEV_COLOR[sev], background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}40`,
                            padding: '2px 6px', borderRadius: '4px',
                          }}>
                            {sev === 'critical' ? '🛡️' : sev === 'high' ? '🛡️' : sev === 'medium' ? '♦️' : '♦️'} {f.severities[sev]} {sev.toUpperCase()}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bottom Summary Grid */}
            <div style={{ padding: '16px', borderTop: '1px solid #1e293b', background: '#020617' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <span style={{ color: SEV_COLOR.critical }}>🛡️</span> {totalSeverities.critical}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CRITICAL</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <span style={{ color: SEV_COLOR.high }}>🛡️</span> {totalSeverities.high}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HIGH</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <span style={{ color: SEV_COLOR.medium }}>⚠️</span> {totalSeverities.medium}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MEDIUM</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <span style={{ color: SEV_COLOR.low }}>✅</span> {totalSeverities.low}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LOW</div>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>Scan Progress</div>
              <div style={{ width: '100%', background: '#1e293b', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #4f46e5, #8b5cf6)', borderRadius: '3px' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                <span>Scan completed</span>
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>100%</span>
              </div>
            </div>
          </div>

          {/* Main Panel */}
          <div style={{ flex: 1, overflow: 'hidden', background: '#040d1a', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            {!selectedFile ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.3 }}>📂</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Select a file to view detailed findings</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Main Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '20px' }}>
                  <i className="ti-file" style={{ color: '#e2e8f0' }}></i> {selectedFile}
                </div>
                
                {/* Two Columns */}
                <div style={{ display: 'flex', flex: 1, gap: '24px', overflow: 'hidden' }}>
                  
                  {/* Left Column: Violations */}
                  <div style={{ width: '320px', minWidth: '320px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }}></div>
                      DETECTED CODE VIOLATIONS
                    </div>
                    
                      <div className="brownfield-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {findings.length === 0 ? (
                          <div style={{ padding: '20px', color: '#34d399', textAlign: 'center', background: '#0b1120', borderRadius: '8px', border: '1px solid #1e293b' }}>
                            No warnings or static analysis violations detected.
                          </div>
                        ) : (
                          Object.entries(
                            findings.reduce((acc, f) => {
                              const cat = f.category || 'other';
                              if (!acc[cat]) acc[cat] = [];
                              acc[cat].push(f);
                              return acc;
                            }, {} as Record<string, typeof findings>)
                          ).map(([category, catFindings]) => {
                            const CATEGORY_LABELS: Record<string, string> = {
                              'security': '🛡️ Security',
                              'lint': '🧹 Lint / Quality',
                              'performance_complexity': '⚡ Performance & Complexity',
                              'reliability': '🔧 Reliability',
                              'accessibility': '♿ Accessibility',
                              'dependency_vulnerability': '📦 Dependency Vulnerabilities',
                              'duplication': '🔁 Duplicate Code',
                              'dead_code': '👻 Dead Code',
                              'other': '📦 Other'
                            };
                            return (
                              <div key={category} style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {CATEGORY_LABELS[category] || CATEGORY_LABELS['other']}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {catFindings.map(finding => {
                                    const isActive = activeFinding?.id === finding.id;
                                    const snippet = fileContent.split('\n')[finding.line - 1]?.trim() || '';
                                    
                                    return (
                            <div 
                              key={finding.id}
                              onClick={() => setActiveFinding(finding)}
                              style={{ 
                                background: '#0b1120', 
                                border: isActive ? `1px solid ${SEV_COLOR[finding.severity] || '#1e293b'}` : '1px solid #1e293b',
                                borderRadius: '12px', cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                padding: '16px',
                                boxShadow: isActive ? `0 0 0 1px ${SEV_COLOR[finding.severity] || 'transparent'}, 0 10px 15px -3px rgba(0,0,0,0.3)` : '0 4px 6px -1px rgba(0,0,0,0.1)'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <span style={{
                                  fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                                  color: SEV_COLOR[finding.severity], background: SEV_BG[finding.severity],
                                  padding: '4px 10px', borderRadius: '6px'
                                }}>{finding.severity} Risk</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Line {finding.line}</span>
                              </div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc', marginBottom: '16px', lineHeight: 1.5 }}>
                                {finding.message}
                              </div>
                              
                              {/* Inline code snippet */}
                              {snippet && (
                                <div style={{ background: '#050a15', padding: '12px 16px', borderRadius: '8px', border: '1px solid #1e293b', marginBottom: '16px', fontSize: '0.8rem', fontFamily: 'monospace', overflowX: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                  <div dangerouslySetInnerHTML={{ __html: highlightPython(snippet) }} />
                                </div>
                              )}
                              
                              <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                <i className="ti-files"></i> {finding.rule_id}
                              </div>

                              {/* ACTIVE STATE ACTIONS */}
                              {isActive && (
                                <div style={{ background: '#050a15', margin: '16px -16px -16px -16px', padding: '16px', borderTop: '1px solid #1e293b', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                                  {/* Status banner */}
                                  {finding.status !== 'open' && finding.status !== 'fix_suggested' && (
                                    <div style={{
                                      padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
                                      background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                                      fontSize: '0.75rem', fontWeight: 600, color: '#10b981',
                                      display: 'flex', alignItems: 'center', gap: '8px'
                                    }}>
                                      <i className="ti-check"></i>
                                      {STATUS_LABEL[finding.status]?.label}
                                    </div>
                                  )}

                                  {/* Suggested fix */}
                                  {finding.suggested_fix && (
                                    <div style={{ marginBottom: '16px' }}>
                                      <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="ti-light-bulb"></i> AI Suggested Fix
                                      </div>
                                      <pre className="brownfield-scroll" style={{
                                        margin: 0, fontSize: '0.75rem', color: '#e0f2fe',
                                        background: '#082f49', border: '1px solid #0369a1', padding: '12px', borderRadius: '6px',
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                                        maxHeight: '200px', overflowY: 'auto'
                                      }}>
                                        {finding.suggested_fix}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  {finding.status !== 'wont_fix' &&
                                  finding.status !== 'fix_verified' &&
                                  finding.status !== 'fix_applied' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                      {!finding.suggested_fix && (
                                        <button
                                          id={`finding-suggest-${finding.id}`}
                                          onClick={(e) => { e.stopPropagation(); requestSuggestFix(finding.id); }}
                                          disabled={loadingFix}
                                          style={{
                                            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                            border: 'none', color: '#fff', padding: '10px 12px',
                                            borderRadius: '6px', cursor: loadingFix ? 'not-allowed' : 'pointer',
                                            fontSize: '0.8rem', fontWeight: 600, opacity: loadingFix ? 0.7 : 1,
                                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                          }}
                                        >
                                          {loadingFix ? 'Generating fix…' : 'Synthesize Auto-Fix'}
                                        </button>
                                      )}
                                      {finding.suggested_fix && (
                                        isLocalFolder ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ opacity: 0.8, fontSize: '0.75rem', color: '#cbd5e1', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                              💡 Suggestion available — apply manually. Auto-fix isn't available for local folders (no version control safety net).
                                            </div>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(finding.suggested_fix || ''); }}
                                              style={{
                                                background: 'linear-gradient(135deg, #475569, #334155)',
                                                border: 'none', color: '#fff', padding: '10px 12px',
                                                borderRadius: '6px', cursor: 'pointer',
                                                fontSize: '0.8rem', fontWeight: 600,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                              }}
                                            >
                                              📋 Copy suggested fix
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            id={`finding-apply-${finding.id}`}
                                            onClick={(e) => { e.stopPropagation(); applyFix(finding); }}
                                            disabled={applyingFix}
                                            style={{
                                              background: 'linear-gradient(135deg, #10b981, #059669)',
                                              border: 'none', color: '#fff', padding: '10px 12px',
                                              borderRadius: '6px', cursor: applyingFix ? 'not-allowed' : 'pointer',
                                              fontSize: '0.8rem', fontWeight: 600, opacity: applyingFix ? 0.7 : 1,
                                              boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                                            }}
                                          >
                                            {applyingFix ? 'Applying…' : 'Apply Fix & Commit'}
                                          </button>
                                        )
                                      )}
                                      {!showDismissBox ? (
                                        <button
                                          id={`finding-dismiss-${finding.id}`}
                                          onClick={(e) => { e.stopPropagation(); setShowDismissBox(true); }}
                                          style={{
                                            background: 'transparent', border: '1px solid #334155',
                                            color: '#cbd5e1', padding: '8px 12px',
                                            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                                          }}
                                        >
                                          Dismiss Risk
                                        </button>
                                      ) : (
                                        <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                                          <input
                                            id={`dismiss-reason-${finding.id}`}
                                            placeholder="Reason for dismissal"
                                            value={dismissInput}
                                            onChange={e => setDismissInput(e.target.value)}
                                            style={{
                                              width: '100%', boxSizing: 'border-box', background: '#040d1a', border: '1px solid #1e293b',
                                              color: '#f8fafc', padding: '10px', borderRadius: '6px',
                                              fontSize: '0.8rem', marginBottom: '10px', outline: 'none'
                                            }}
                                          />
                                          <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                              id={`dismiss-confirm-${finding.id}`}
                                              onClick={() => dismissFinding(finding.id, dismissInput)} 
                                              style={{ flex: 1, background: '#ef4444', border: 'none', color: '#fff', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                                            >Confirm</button>
                                            <button 
                                              onClick={() => { setShowDismissBox(false); setDismissInput(''); }} 
                                              style={{ background: 'transparent', border: '1px solid #334155', color: '#cbd5e1', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                                            >Cancel</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        </div>
                        </div>
                        )
                      })
                    )}
                    
                  </div>
                </div>
                
                {/* Right Column: Source Viewer */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0b1120', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti-layout-media-left-alt"></i> SOURCE VIEWER
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleCopy} style={{ background: 'transparent', border: '1px solid #334155', color: copied ? '#10b981' : '#cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.2s' }}>
                          <i className={copied ? "ti-check" : "ti-files"}></i> {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="brownfield-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 0', fontFamily: "'Fira Code', 'JetBrains Mono', monospace", fontSize: '0.85rem', lineHeight: 1.6, background: '#050a15' }}>
                      {fileContent.split('\n').map((lineText, idx) => {
                        const lineNum = idx + 1;
                        const isHighlighted = activeFinding?.line === lineNum;
                        return (
                          <div key={lineNum} style={{ 
                            display: 'flex', 
                            background: isHighlighted ? 'rgba(99,102,241,0.1)' : 'transparent',
                            width: 'fit-content',
                            minWidth: '100%',
                          }}>
                            <div style={{ 
                              width: '45px', minWidth: '45px', textAlign: 'right', paddingRight: '16px', 
                              color: isHighlighted ? '#e2e8f0' : '#475569', userSelect: 'none',
                              marginRight: '16px', fontWeight: isHighlighted ? 700 : 400
                            }}>
                              {lineNum}
                            </div>
                            <div style={{ whiteSpace: 'pre', paddingRight: '16px', color: '#e2e8f0' }} dangerouslySetInnerHTML={{ __html: highlightPython(lineText || ' ') }} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
