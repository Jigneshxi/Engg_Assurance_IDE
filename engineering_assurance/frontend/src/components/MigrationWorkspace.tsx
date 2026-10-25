/**
 * ============================================================================
 * CONVERGE PHASE 3.2 — AUTOMATION MIGRATION WORKSPACE
 * ============================================================================
 * PURPOSE: Convert legacy Selenium/TestRail suites to Playwright/CONVERGE.
 *
 * Features:
 * - Drag-and-drop legacy file upload
 * - Per-file migration steps with before/after code diffs
 * - Framework compatibility matrix
 * - Effort estimates and risk ratings
 * - Quick wins and blockers list
 * - Progress tracking per migration step
 */

import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../config";

interface MigrationStep {
  step_id: string;
  source_type: string;
  target_type: string;
  filename: string;
  status: string;
  effort: string;
  risk: string;
  before_snippet: string;
  after_snippet: string;
  migration_notes: string;
}

interface CompatibilityItem {
  legacy: string;
  modern: string;
  compatibility: number;
  notes: string;
}

interface MigrationSummary {
  total_files: number;
  estimated_effort_days: number;
  automation_gain_percent: number;
  risk_level: string;
  target_framework: string;
}

interface MigrationWorkspaceProps {
  taskId: string | null;
  demoMode?: boolean;
  migrationData?: any;
}

const EffortBadge: React.FC<{ effort: string }> = ({ effort }) => {
  const c: Record<string, { bg: string; color: string }> = {
    XS: { bg: "rgba(16,185,129,0.1)", color: "#6ee7b7" },
    S: { bg: "rgba(99,102,241,0.1)", color: "#a5b4fc" },
    M: { bg: "rgba(245,158,11,0.1)", color: "#fcd34d" },
    L: { bg: "rgba(239,68,68,0.1)", color: "#fca5a5" },
  };
  const style = c[effort] || c.M;
  return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.62rem", fontWeight: 800, background: style.bg, color: style.color }}>{effort}</span>;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = status === "Ready" ? { bg: "rgba(16,185,129,0.1)", color: "#6ee7b7" } : status === "In Progress" ? { bg: "rgba(99,102,241,0.1)", color: "#a5b4fc" } : { bg: "rgba(239,68,68,0.1)", color: "#fca5a5" };
  return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.62rem", fontWeight: 800, background: c.bg, color: c.color }}>{status}</span>;
};

const BeforeAfterSlider: React.FC<{ before: string, after: string, source: string, target: string }> = ({ before, after, source, target }) => {
  const [isAfter, setIsAfter] = useState(true);
  
  return (
    <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', background: 'rgba(15,23,42,0.4)' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '4px' }}>
        <button 
          onClick={() => setIsAfter(false)}
          style={{ flex: 1, padding: '8px', border: 'none', background: !isAfter ? 'rgba(239,68,68,0.15)' : 'transparent', color: !isAfter ? '#fca5a5' : '#64748b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', borderRadius: '8px', transition: 'all 0.2s' }}>
          <i className="ti-arrow-left" style={{ marginRight: '6px' }} />
          Before ({source})
        </button>
        <button 
          onClick={() => setIsAfter(true)}
          style={{ flex: 1, padding: '8px', border: 'none', background: isAfter ? 'rgba(16,185,129,0.15)' : 'transparent', color: isAfter ? '#6ee7b7' : '#64748b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', borderRadius: '8px', transition: 'all 0.2s' }}>
          After ({target})
          <i className="ti-arrow-right" style={{ marginLeft: '6px' }} />
        </button>
      </div>
      <div style={{ padding: '16px', position: 'relative' }}>
        {/* We use position absolute for smooth crossfade if desired, or just swap rendering */}
        <pre style={{ margin: 0, fontSize: '0.75rem', color: isAfter ? '#6ee7b7' : '#fca5a5', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: '120px' }}>
          {isAfter ? after : before}
        </pre>
      </div>
    </div>
  );
};

const MigrationWorkspace: React.FC<MigrationWorkspaceProps> = ({ taskId, demoMode, migrationData }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"steps" | "matrix" | "upload">("steps");
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (migrationData && migrationData.migration_steps?.length > 0) { setData(migrationData); return; }
    if (!taskId) return;
    fetchData();
  }, [taskId, migrationData]);

  const fetchData = async () => {
    setLoading(true); setError("");
    try {
      const data: any = await apiClient.get(`/converge/migration/${taskId}`);
      setData(data);
    } catch (e: any) { setError(`Failed to load: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAnalyzing(true);
    const names: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      names.push(file.name);
      try {
        const content = await file.text();
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const sourceFramework = ext === "java" ? "selenium" : ext === "cs" ? "selenium-csharp" : ext === "csv" ? "testrail" : "selenium";
        
        const result: any = await apiClient.post(
          `/converge/migration/${taskId || "demo"}/analyze-file?filename=${encodeURIComponent(file.name)}&source_framework=${sourceFramework}`, 
          { file_content: content, filename: file.name, source_framework: sourceFramework }
        );
        
        if (result.migration_steps?.length > 0) {
          setData((prev: any) => ({
            ...prev,
            migration_steps: [...(prev?.migration_steps || []), ...result.migration_steps],
            migration_summary: { ...(prev?.migration_summary || {}), total_files: (prev?.migration_summary?.total_files || 0) + 1 }
          }));
        }
      } catch { /* non-blocking */ }
    }
    setUploadedFiles(prev => [...prev, ...names]);
    setAnalyzing(false);
    setActiveTab("steps");
  };

  const handleStepStatusChange = (stepId: string, status: string) => {
    setStepStatuses(prev => ({ ...prev, [stepId]: status }));
  };

  if (!taskId && !migrationData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "12px", color: "#475569", textAlign: "center" }}>
        <i className="ti-exchange-vertical" style={{ fontSize: "2.5rem", color: "#334155" }} />
        <p style={{ fontSize: "0.85rem", maxWidth: "340px", lineHeight: 1.6 }}>No migration data is available yet. Run a mission or upload legacy test files to generate a migration plan.</p>
      </div>
    );
  }

  const d = data;
  if (!d) {
    return (
      <div style={{ padding: "18px", borderRadius: "12px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", color: "#c7d2fe", fontSize: "0.85rem" }}>
        <strong>Validation:</strong> migration results will appear after you provide a task, upload legacy files, or run a mission with the Forge module enabled.
      </div>
    );
  }
  const summary: MigrationSummary = d.migration_summary || {};
  const steps: MigrationStep[] = d.migration_steps || [];
  const matrix: CompatibilityItem[] = d.compatibility_matrix || [];
  const quickWins: string[] = d.quick_wins || [];
  const blockers: string[] = d.blockers || [];

  const tabs = [
    { id: "steps", label: "Migration Steps", icon: "ti-exchange-vertical", count: steps.length },
    { id: "matrix", label: "Compatibility", icon: "ti-layout-grid2", count: matrix.length },
    { id: "upload", label: "Upload Legacy Files", icon: "ti-cloud-up", count: uploadedFiles.length },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti-exchange-vertical" style={{ color: "#10b981", fontSize: "1rem" }} />
          </div>
          <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#f1f5f9" }}>Migration Workspace</h3>
              <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748b" }}>
                Legacy Selenium/TestRail → Playwright/CONVERGE
              </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary.total_files > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { label: "Files", value: summary.total_files, color: "#6366f1" },
            { label: "Effort (days)", value: summary.estimated_effort_days, color: "#f59e0b" },
            { label: "Automation Gain", value: `${summary.automation_gain_percent}%`, color: "#10b981" },
            { label: "Risk", value: summary.risk_level, color: summary.risk_level === "Low" ? "#10b981" : summary.risk_level === "Medium" ? "#f59e0b" : "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{ padding: "12px", borderRadius: "10px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "0.62rem", color: "#475569", marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.03)", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "7px 10px", borderRadius: "7px", border: "none", background: activeTab === tab.id ? "rgba(16,185,129,0.2)" : "transparent", color: activeTab === tab.id ? "#6ee7b7" : "#64748b", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", transition: "all 0.2s" }}>
            <i className={tab.icon} />
            {tab.label}
            {tab.count > 0 && <span style={{ background: activeTab === tab.id ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "10px", fontSize: "0.6rem" }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading && <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "20px", color: "#64748b", fontSize: "0.85rem", justifyContent: "center" }}><i className="ti-reload" style={{ animation: "spin 1s linear infinite" }} />Loading migration plan...<style>{"@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style></div>}
      {error && !loading && <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", color: "#fcd34d", fontSize: "0.82rem" }}><i className="ti-alert" style={{ marginRight: "8px" }} />{error}</div>}

      {/* STEPS TAB */}
      {activeTab === "steps" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {steps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#475569", fontSize: "0.82rem" }}>No migration steps yet. Upload legacy files to generate a plan.</div>
          ) : steps.map(step => {
            const currentStatus = stepStatuses[step.step_id] || step.status;
            const isExpanded = expandedStep === step.step_id;
            return (
              <div key={step.step_id} style={{ borderRadius: "10px", border: `1px solid ${currentStatus === "Blocked" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setExpandedStep(isExpanded ? null : step.step_id)}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.62rem", fontFamily: "monospace", color: "#475569" }}>{step.step_id}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f1f5f9" }}>{step.filename}</span>
                      <StatusBadge status={currentStatus} />
                      <EffortBadge effort={step.effort} />
                      <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{step.source_type} → {step.target_type}</span>
                    </div>
                    {step.migration_notes && <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b", lineHeight: 1.4 }}>{step.migration_notes}</p>}
                  </div>
                  <i className={isExpanded ? "ti-angle-up" : "ti-angle-down"} style={{ color: "#475569", fontSize: "0.8rem", flexShrink: 0 }} />
                </div>
                {isExpanded && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <BeforeAfterSlider before={step.before_snippet} after={step.after_snippet} source={step.source_type} target={step.target_type} />
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      {["Ready", "In Progress", "Done", "Blocked"].map(s => (
                        <button key={s} onClick={() => handleStepStatusChange(step.step_id, s)} style={{ padding: "5px 12px", borderRadius: "6px", border: "none", background: currentStatus === s ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)", color: currentStatus === s ? "#a5b4fc" : "#64748b", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick Wins + Blockers */}
          {(quickWins.length > 0 || blockers.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
              {quickWins.length > 0 && (
                <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)" }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>⚡ Quick Wins</div>
                  {quickWins.map((w, i) => <div key={i} style={{ fontSize: "0.75rem", color: "#6ee7b7", marginBottom: "6px", display: "flex", gap: "6px" }}><span style={{ color: "#10b981" }}>✓</span>{w}</div>)}
                </div>
              )}
              {blockers.length > 0 && (
                <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>🚧 Blockers</div>
                  {blockers.map((b, i) => <div key={i} style={{ fontSize: "0.75rem", color: "#fca5a5", marginBottom: "6px", display: "flex", gap: "6px" }}><span>⚠</span>{b}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MATRIX TAB */}
      {activeTab === "matrix" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {matrix.map((item, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f1f5f9" }}>{item.legacy}</span>
                  <i className="ti-arrow-right" style={{ color: "#10b981", fontSize: "0.75rem" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#10b981" }}>{item.modern}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b" }}>{item.notes}</p>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: item.compatibility >= 90 ? "#10b981" : item.compatibility >= 75 ? "#f59e0b" : "#ef4444" }}>{item.compatibility}%</div>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase" }}>Compatible</div>
              </div>
              <div style={{ width: "80px", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden", flexShrink: 0 }}>
                <div style={{ height: "100%", width: `${item.compatibility}%`, background: item.compatibility >= 90 ? "#10b981" : item.compatibility >= 75 ? "#f59e0b" : "#ef4444", borderRadius: "3px", transition: "width 0.6s ease" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UPLOAD TAB */}
      {activeTab === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "40px", borderRadius: "12px", border: `2px dashed ${dragOver ? "#10b981" : "rgba(255,255,255,0.12)"}`, background: dragOver ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}
          >
            <i className="ti-cloud-up" style={{ fontSize: "2rem", color: dragOver ? "#10b981" : "#475569", display: "block", marginBottom: "12px" }} />
            <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: dragOver ? "#10b981" : "#94a3b8" }}>
              {analyzing ? "Analyzing files..." : "Drop legacy test files here"}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "0.72rem", color: "#475569" }}>Supports .java, .cs, .js, .ts, .csv (TestRail export), .xml</p>
            <input ref={fileInputRef} type="file" multiple accept=".java,.cs,.js,.ts,.csv,.xml,.py" style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
          </div>
          {uploadedFiles.length > 0 && (
            <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Uploaded Files</div>
              {uploadedFiles.map((f, i) => <div key={i} style={{ fontSize: "0.75rem", color: "#6ee7b7", marginBottom: "4px", display: "flex", gap: "6px" }}><i className="ti-file" style={{ color: "#10b981" }} />{f}</div>)}
            </div>
          )}
          <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Supported Frameworks</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Selenium (Java)", "Selenium (C#)", "TestRail CSV", "JUnit/TestNG", "Cypress", "PyTest"].map(f => (
                <span key={f} style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "0.68rem", fontWeight: 700, background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationWorkspace;
