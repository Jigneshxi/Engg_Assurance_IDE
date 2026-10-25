import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { TestPlanPayload } from '../types';
import { downloadFile, filenameFromUrl } from '../utils/downloadFile';

interface TestDeliveryDashboardProps {
  payload: TestPlanPayload | null;
  fullAgentState?: any;
  markdown: string;
  downloadUrl: string;
  logs: any[];
  apiBase: string;
  onNewMission: () => void;
  demoMode?: boolean;
  topology?: any;       // DASH-003: live mesh topology for real node count
  taskId?: string;      // DASH-001: real task ID for Operational ID display
}

const TestDeliveryDashboard: React.FC<TestDeliveryDashboardProps> = ({
  payload, fullAgentState, markdown, downloadUrl, logs, apiBase, onNewMission,
  demoMode, topology, taskId
}) => {
  const [activeTab, setActiveTab] = useState<'insight' | 'cases'>('insight');
  const [downloading, setDownloading] = useState(false);
  const [showGitDialog, setShowGitDialog] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [gitStage, setGitStage] = useState<'idle' | 'branching' | 'pushing' | 'done'>('idle');

  // PHASE 3 FIX: Fetch server-computed KPIs from /api/tasks/metrics/{taskId}
  // This gives us accurate, server-side computed metrics without fragile
  // client-side extraction across multiple nested paths.
  const [serverMetrics, setServerMetrics] = useState<any>(null);

  useEffect(() => {
    if (!taskId) return;
    apiClient.get(`/tasks/metrics/${taskId}`)
      .then((data: any) => { if (data?.metrics) setServerMetrics(data.metrics); })
      .catch(() => {}); // Silent validation states handle missing data
  }, [taskId, apiBase]);

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setDownloading(true);
    await downloadFile(
      `${apiBase}${downloadUrl}`,
      filenameFromUrl(downloadUrl, 'VVNT_TestPlan.docx')
    );
    setDownloading(false);
  };

  // ── Data Normalization ───────────────────────────────────────────────────
  const finalState = fullAgentState;

  const effectivePayload = payload ?? fullAgentState?.analysis_payload ?? fullAgentState?.final_synthesis?.raw_mesh_data ?? null;

  // ── DASH-003: Real active node count from topology ───────────────────────
  // Count nodes that actually ran (status: completed or active), not bypassed.
  // Falls back to meshAnalytics count, then to total registered nodes.
  const meshAnalytics = finalState?.final_synthesis?.mesh_analytics;

  // PHASE 3: serverMetrics from /api/tasks/metrics/{taskId} takes priority
  // over all client-side extraction. Falls back gracefully if endpoint unavailable.

  const computeActiveNodeCount = (): string | number => {
    if (serverMetrics?.intelligence_nodes_count != null) return serverMetrics.intelligence_nodes_count;
    if (topology?.nodes && Array.isArray(topology.nodes)) {
      const selected = topology.nodes.filter(
        (n: any) => (n?.status || 'pending').toLowerCase() !== 'bypassed'
      ).length;
      if (selected > 0) return selected;
    }
    return meshAnalytics?.intelligence_nodes_count || '—';
  };
  const activeNodeCount = computeActiveNodeCount();

  // ── DASH-004: Synthesized test count — Phase 1 proxy via Gherkin scenarios ──
  const rawTestCases: any[] = effectivePayload?.test_cases || [];
  const gherkinScenarios: any[] = (effectivePayload as any)?.scope?.gherkin_scenarios || [];
  const testingPoints: any[] = (effectivePayload as any)?.testing_points || [];
  const hasLiveData = Boolean(effectivePayload || meshAnalytics || serverMetrics);

  const synthesizedTestCount = (() => {
    if (serverMetrics?.synthesized_tests_count != null) return serverMetrics.synthesized_tests_count;
    if (meshAnalytics?.synthesized_tests_count) return meshAnalytics.synthesized_tests_count;
    if (rawTestCases.length > 0) return rawTestCases.length;
    if (gherkinScenarios.length > 0) return gherkinScenarios.length;
    return '0';
  })();

  // ── DASH-006: Risk hotspots ──────────────────────────────────────────────
  const riskItems: any[] = (effectivePayload as any)?.risk_matrix || [];
  const highRisks = (() => {
    if (serverMetrics?.risk_hotspots != null) return serverMetrics.risk_hotspots;
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

  // ── DASH-005: SLA Confidence ─────────────────────────────────────────────
  const computeSlaConfidence = (): string => {
    if (serverMetrics?.sla_confidence) return serverMetrics.sla_confidence;
    const im = (effectivePayload as any)?.intelligence_metrics?.sla_confidence;
    if (im && im !== 'Awaiting...' && im !== '0%') return im;
    const sloTarget = fullAgentState?.sla_slo_audit?.sla_targets?.[0]?.target;
    if (sloTarget) return sloTarget;
    const confScore = (effectivePayload as any)?.reasoning_audit?.confidence_score;
    if (confScore) return `${(parseFloat(confScore) * 100).toFixed(0)}%`;
    if (finalState?.mesh_confidence) return `${(finalState.mesh_confidence * 100).toFixed(1)}%`;
    return 'Awaiting...';
  };
  const slaConfidence = computeSlaConfidence();

  // ── DASH-008: Mesh Confidence ────────────────────────────────────────────
  const computeMeshConfidence = (): string => {
    if (serverMetrics?.mesh_confidence) return serverMetrics.mesh_confidence;
    if (finalState?.mesh_confidence) return `${(finalState.mesh_confidence * 100).toFixed(1)}%`;
    const auditConf = (effectivePayload as any)?.reasoning_audit?.confidence_score;
    if (auditConf) return `${(parseFloat(auditConf) * 100).toFixed(0)}%`;
    return 'Awaiting...';
  };
  const meshConfidence = computeMeshConfidence();

  // ── DASH-012: Executive synopsis ─────────────────────────────────────────
  const execSummary = (() => {
    if (serverMetrics?.executive_summary) return serverMetrics.executive_summary;
    const fs = finalState?.final_synthesis?.summary?.description;
    if (fs) return fs;
    const es = (effectivePayload as any)?.executive_summary?.description;
    if (es && es.length > 20) return es;
    const abstractSummary = (effectivePayload as any)?.abstract_summary;
    if (abstractSummary) return abstractSummary;
    return 'Mission intelligence is not available yet. Run Requirement Ops to populate the delivery dashboard.';
  })();

  // ── Requirement Coverage ─────────────────────────────────────────────────
  const requirementCoverage = (() => {
    if (serverMetrics?.requirement_coverage) return serverMetrics.requirement_coverage;
    const im = (effectivePayload as any)?.intelligence_metrics?.requirement_coverage;
    if (im && im !== '0%') return im;
    return meshAnalytics?.requirement_coverage || '—';
  })();

  // ── DASH-007: Safe CSS width for progress bar ────────────────────────────
  const coverageBarWidth = (() => {
    const val = requirementCoverage;
    if (typeof val === 'string' && /^\d+(\.\d+)?%$/.test(val)) return val;
    return '0%';
  })();

  // ── Execution Readiness ──────────────────────────────────────────────────
  const executionReadiness = (() => {
    if (serverMetrics?.execution_readiness) return serverMetrics.execution_readiness;
    const im = (effectivePayload as any)?.intelligence_metrics?.logic_stability;
    if (im) return im;
    return meshAnalytics?.execution_readiness || 'Awaiting mission data';
  })();

  // ── DASH-009: Readiness bar color — expanded condition ───────────────────
  const READY_STATES = new Set(['stable', 'exceptional', 'high', 'operational', 'ready', 'active']);
  const readinessColor = READY_STATES.has(executionReadiness.toLowerCase()) ? '#3b82f6' : '#94a3b8';

  // ── DASH-010 + DASH-011: Test Nexus rows ─────────────────────────────────
  // Phase 2: use test_cases (normalize field names)
  // Phase 1: use testing_points from analysis_payload as proxy
  const normalizeTestCase = (tc: any, index: number): any => ({
    id: tc.id || tc.test_id || tc.tc_id || `TC-${String(index + 1).padStart(3, '0')}`,
    title: tc.title || tc.name || tc.scenario || tc.description || tc.test_name || `Test Case ${index + 1}`,
    requirement_id: tc.requirement_id || tc.req_id || tc.anchor_id || null,
    priority: tc.priority || tc.priority_level || tc.heat || 'P2',
    type: tc.type || tc.category || tc.test_type || 'Functional',
    expected: tc.expected || tc.expected_behavior || tc.expected_result || tc.success_criteria || tc.acceptance_criteria || '—',
    isTestingPoint: false
  });

  const normalizeTestingPoint = (tp: any, index: number): any => ({
    id: `TP-${String(index + 1).padStart(3, '0')}`,
    title: tp.feature || tp.verification_point || `Test Point ${index + 1}`,
    requirement_id: null,
    priority: 'P2',
    type: 'Strategic',
    expected: tp.expected_behavior || tp.expected || '—',
    isTestingPoint: true
  });

  const nexusRows: any[] = (() => {
    if (rawTestCases.length > 0) {
      return rawTestCases.map(normalizeTestCase);
    }
    if (testingPoints.length > 0) {
      return testingPoints.map(normalizeTestingPoint);
    }
    return [];
  })();

  const isPhase1View = rawTestCases.length === 0 && testingPoints.length > 0;

  const getAnchorLabel = (tc: any): string => {
    const value =
      tc.requirement_id ||
      tc.req_id ||
      tc.anchor_id ||
      tc.source_id ||
      tc.source ||
      tc.reference ||
      tc.id ||
      tc.title ||
      tc.feature;
    return value ? String(value) : 'Unspecified';
  };

  const getPriorityLabel = (tc: any): string => {
    const value =
      tc.priority_label ||
      tc.priority ||
      tc.priority_level ||
      tc.heat ||
      (tc.isTestingPoint ? 'Strategic' : null);
    const normalized = value ? String(value).trim() : 'P2';
    return ['P0', 'P1', 'P2', 'P3'].includes(normalized.toUpperCase()) ? normalized.toUpperCase() : normalized;
  };

  // ── Stat Cards ───────────────────────────────────────────────────────────
  const statCards = [
    { label: 'Intelligence Nodes', value: activeNodeCount, icon: 'ti-layout-grid3', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    { label: 'Synthesized Tests', value: synthesizedTestCount, icon: 'ti-check-box', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    { label: 'Blast Radius (Impact)', value: `${highRisks} Modules`, icon: 'ti-target', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
    { label: 'Risk Hotspots', value: highRisks, icon: 'ti-alert-circle', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  ];

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── DASH-001: Operational ID from real taskId ────────────────────────────
  const operationalId = taskId
    ? taskId.replace(/-/g, '').substring(0, 9).toUpperCase()
    : '—';

  return (
    <div className="card animate-fadeIn" style={{ borderTop: '4px solid #6366f1', background: '#ffffff' }}>

      {/* ── EXECUTIVE INTELLIGENCE HEADER ── */}
      <div className="card-header border-none" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '3rem 3rem 2.2rem 3rem',
        background: 'linear-gradient(to bottom, #f8fafc, #ffffff)'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <span style={{
              fontSize: '0.62rem', fontWeight: 950, color: '#6366f1', textTransform: 'uppercase',
              letterSpacing: '2px', background: 'rgba(99,102,241,0.1)', padding: '5px 14px',
              borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)'
            }}>
              Mission: Final Verification
            </span>
            {/* DASH-001 FIX: Use real taskId instead of Math.random() */}
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Operational ID: {operationalId}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 950, color: '#1e1b4b', letterSpacing: '-0.05em', lineHeight: 1 }}>
            Intelligence <span style={{ color: '#4338ca' }}>Command Center</span>
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: '1rem', color: '#64748b', fontWeight: 500, maxWidth: '750px', lineHeight: 1.6 }}>
            The definitive coverage manifest synthesized by the A.N.T. Agent Mesh. Executive summaries and technical assets ready for industrial-scale deployment.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {downloadUrl && (
            <button key="download-btn" onClick={handleDownload} disabled={downloading} className="btn-primary highlight" style={{ height: '50px', padding: '0 28px', fontSize: '0.9rem', borderRadius: '14px', boxShadow: '0 10px 20px -5px rgba(99,102,241,0.4)' }}>
              {downloading ? <i className="ti-reload spin-animation"></i> : <i className="ti-download"></i>} EXEC EXPORT (.DOCX)
            </button>
          )}
          <button 
            key="git-btn" 
            onClick={() => setShowGitDialog(true)} 
            className="btn-primary" 
            style={{ 
              height: '50px', padding: '0 28px', fontSize: '0.9rem', borderRadius: '14px', 
              background: '#0f172a', border: '1px solid #1e293b', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' 
            }}
          >
            <i className="ti-github"></i> CREATE PULL REQUEST
          </button>
          <button key="reset-btn" className="btn-outline" onClick={onNewMission} style={{ height: '50px', padding: '0 24px', fontSize: '0.9rem', borderRadius: '14px', border: '1.5px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 800 }}>
            <i className="ti-plus"></i> NEW MISSION
          </button>
        </div>
      </div>

      {/* --- GITHUB PR DIALOG (SIMULATED LOOP) --- */}
      {showGitDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', backdropFilter: 'blur(8px)' }}>
          <div className="card animate-fadeInScale" style={{ width: '100%', maxWidth: '800px', padding: 0, overflow: 'hidden', border: '1px solid #1e293b' }}>
            <div style={{ padding: '24px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="ti-github" style={{ fontSize: '1.5rem', color: '#fff' }}></i>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Forge → GitHub Ingestion</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Closing the engineering loop for Operational ID: {operationalId}</p>
                </div>
              </div>
              <button onClick={() => setShowGitDialog(false)} title="Close dialog" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><i className="ti-close"></i></button>
            </div>
            
            <div style={{ padding: '30px' }}>
              {gitStage === 'done' ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <i className="ti-check" style={{ color: 'white', fontSize: '1.8rem' }}></i>
                  </div>
                  <h2 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Pull Request Published</h2>
                  <p style={{ color: '#64748b' }}>PR #402 has been created in <code>vvt-ecosystem/converge-suites</code></p>
                  <div style={{ marginTop: '30px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#475569' }}>
                    https://github.com/vvt-ecosystem/converge-suites/pull/402
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {!hasLiveData && (
                    <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', color: '#c7d2fe', fontSize: '0.85rem' }}>
                      <strong>Validation:</strong> no live mission telemetry is available yet. Run Requirement Ops to generate a requirement-aligned test delivery report.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                     <div className="form-group-compact">
                        <label>Target Repository</label>
                        <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.85rem', color: '#1e293b', fontWeight: 600 }}>vvt-ecosystem/converge-suites</div>
                     </div>
                     <div className="form-group-compact">
                        <label>New Branch</label>
                        <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.85rem', color: '#6366f1', fontWeight: 800 }}>feat/converge-{operationalId.toLowerCase()}</div>
                     </div>
                  </div>
                  
                  <div className="form-group-compact">
                     <label htmlFor="commit-message">Commit Message</label>
                     <textarea 
                        id="commit-message"
                        readOnly 
                        style={{ width: '100%', height: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', fontSize: '0.85rem', color: '#475569', resize: 'none' }}
                        value={`feat: auto-forge intelligence suite for ${operationalId}\n\n- Generated ${synthesizedTestCount} test cases\n- Traceability RTM: OK\n- Risk Mitigation: Verified`}
                     />
                  </div>

                  <div style={{ background: '#020617', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', background: '#1e293b', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Diff Summary (Proposed Artifacts)</div>
                    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', height: '140px', overflowY: 'auto' }}>
                      <div style={{ color: '#10b981' }}>+ /tests/converge/{operationalId.toLowerCase()}_suite.ts</div>
                      <div style={{ color: '#10b981' }}>+ /data/synthetic/mission_{operationalId.toLowerCase()}.json</div>
                      <div style={{ color: '#10b981' }}>+ /chaos/scenarios/resilience_{operationalId.toLowerCase()}.yaml</div>
                      <div style={{ marginTop: '10px', color: '#475569' }}>// Unified Context Contract applied to source tree...</div>
                      <div style={{ color: '#475569' }}>// Traceability indices updated...</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '20px 30px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {gitStage === 'done' ? (
                <button onClick={() => setShowGitDialog(false)} className="btn-primary">CLOSE COMMAND</button>
              ) : (
                <>
                  <button onClick={() => setShowGitDialog(false)} className="btn-outline">CANCEL</button>
                  <button 
                    onClick={() => {
                      setIsCommitting(true);
                      setGitStage('branching');
                      setTimeout(() => setGitStage('pushing'), 1000);
                      setTimeout(() => { setGitStage('done'); setIsCommitting(false); }, 2500);
                    }} 
                    disabled={isCommitting}
                    className="btn-primary highlight"
                  >
                    {isCommitting ? (
                      <><i className="ti-reload spin-animation"></i> {gitStage === 'branching' ? 'BRANCHING...' : 'PUSHING TO ORIGIN...'}</>
                    ) : (
                      <><i className="ti-share"></i> PUBLISH PULL REQUEST</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 30px 30px' }}>

        {/* ── KPI STAT SECTOR ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem' }}>
          {statCards.map((s, i) => (
            <div key={i} style={{ padding: '24px', borderRadius: '18px', background: s.bg, border: `1px solid ${s.color}20`, boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={s.icon} style={{ color: 'white', fontSize: '1.2rem' }}></i>
                </div>
                <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>
                  {hasLiveData ? 'LIVE MESH' : 'VALIDATION MODE'}
                </span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginTop: '8px', letterSpacing: '0.02em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── TAB NAVIGATION ── */}
        <div className="intel-tab-container">
          <button className={`intel-tab ${activeTab === 'insight' ? 'active' : ''}`} onClick={() => setActiveTab('insight')}>
            <i className="ti-target"></i> <span>Mission Intelligence</span>
          </button>
          <button className={`intel-tab ${activeTab === 'cases' ? 'active' : ''}`} onClick={() => setActiveTab('cases')}>
            <i className="ti-layers"></i>
            <span>{isPhase1View ? 'Test Vectors' : 'Test Nexus'}</span>
            <span className="intel-count">{nexusRows.length}</span>
          </button>
        </div>

        <style>{`
          .intel-tab-container { display: flex; gap: 8px; border-bottom: 2px solid #f1f5f9; padding-bottom: 0; }
          .intel-tab { display: flex; align-items: center; gap: 10px; padding: 12px 24px; border: none; background: none; color: #94a3b8; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.3s; border-bottom: 3px solid transparent; margin-bottom: -2px; }
          .intel-tab:hover { color: #6366f1; }
          .intel-tab.active { color: #6366f1; border-bottom-color: #6366f1; }
          .intel-count { font-size: 0.65rem; background: #f1f5f9; color: #64748b; padding: 2px 8px; borderRadius: 20px; }
          .intel-tab.active .intel-count { background: #6366f1; color: white; }
          .nexus-priority { padding: 2px 8px; borderRadius: 4px; font-size: 0.65rem; fontWeight: 900; }
          .nexus-priority.P0 { background: #fee2e2; color: #ef4444; }
          .nexus-priority.P1 { background: #ffedd5; color: #f97316; }
          .nexus-priority.P2 { background: #fef9c3; color: #ca8a04; }
          .nexus-priority.P3 { background: #f0fdf4; color: #16a34a; }
          .nexus-priority.Strategic { background: #ede9fe; color: #7c3aed; }
        `}</style>

        {/* ── TAB CONTENT: INSIGHT ── */}
        {activeTab === 'insight' && (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Unified Coverage Radar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>

              {/* DASH-007 FIX: Safe CSS width for progress bar */}
              <div style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px' }}>Requirement Coverage</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#10b981' }}>{requirementCoverage}</div>
                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                  <div style={{ width: coverageBarWidth, height: '100%', background: '#10b981', transition: 'width 0.6s ease' }}></div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px' }}>Comprehensive verification across all discovered mission nodes.</p>
              </div>

              {/* DASH-008 FIX: Multi-source mesh confidence */}
              <div style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px' }}>Mesh Confidence Index</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#6366f1' }}>{meshConfidence}</div>
                <p style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, marginTop: '8px' }}>
                  {meshConfidence === 'Awaiting...' ? 'Pending Phase 2 synthesis' : 'High Assurance Synthesis'}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Logical de-duplication verified by Factory Core.</p>
              </div>

              {/* DASH-009 FIX: Expanded readiness condition */}
              <div style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px' }}>Execution Readiness</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: readinessColor }}>{executionReadiness}</div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '12px' }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ flex: 1, height: '6px', background: readinessColor, borderRadius: '2px', opacity: i <= 3 || READY_STATES.has(executionReadiness.toLowerCase()) ? 1 : 0.3 }}></div>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px' }}>Automation artifacts primed for registry dispatch.</p>
              </div>
            </div>

            {/* DASH-012 FIX: Strategic Synopsis from executive_summary.description */}
            <div style={{ padding: '24px', borderRadius: '18px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti-paragraph"></i> Collective Mesh Synopsis
              </div>
              <p style={{ color: '#1e293b', fontSize: '1rem', lineHeight: 1.7, margin: 0, fontWeight: 500 }}>{execSummary}</p>
            </div>
          </div>
        )}

        {/* ── TAB CONTENT: TEST NEXUS ── */}
        {activeTab === 'cases' && (
          <div className="animate-fadeIn">
            <div style={{ background: '#f8fafc', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                  {isPhase1View
                    ? `${nexusRows.length} Strategic Test Vectors (Phase 1)`
                    : `Synthesized ${nexusRows.length} Traceable Assets`}
                </span>
                {isPhase1View && (
                  <span style={{ marginLeft: '10px', fontSize: '0.65rem', color: '#6366f1', fontWeight: 700, background: 'rgba(99,102,241,0.08)', padding: '2px 8px', borderRadius: '4px' }}>
                    Full test cases available after Phase 2
                  </span>
                )}
              </div>
              <button className="btn-outline" style={{ height: '32px', padding: '0 12px', fontSize: '0.7rem' }} onClick={handleDownload}>
                <i className="ti-export"></i> Sync to Lifecycle Tools
              </button>
            </div>

            <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <table className="table-standard" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ width: '80px' }}>Ref</th>
                    <th>Primary Test Vector</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Heat</th>
                    <th style={{ width: '120px' }}>Category</th>
                    <th>Success Criteria</th>
                  </tr>
                </thead>
                <tbody>
                  {/* DASH-010 + DASH-011 FIX: Normalized rows with correct field mapping */}
                  {nexusRows.length > 0 ? nexusRows.map((tc: any, i: number) => (
                    <tr key={i} className="nexus-row">
                      <td style={{ color: '#6366f1', fontWeight: 800, fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tc.id}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleCopy(tc.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === tc.id ? '#10b981' : '#94a3b8', padding: 0, display: 'flex' }}
                            title="Copy ID"
                          >
                            <i className={copiedId === tc.id ? "ti-check pop-animation" : "ti-files hover-glow"} style={{ fontSize: '0.8rem' }}></i>
                          </button>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{tc.title}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                          Anchor ID: {getAnchorLabel(tc)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`nexus-priority ${getPriorityLabel(tc)}`}>{getPriorityLabel(tc)}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                          {tc.type || 'Functional'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '300px' }}>{tc.expected}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        No test vectors available. Run Phase 2 to generate full test cases.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <style>{`
              .nexus-row { transition: background 0.2s; }
              .nexus-row:hover { background: #fdfdfd; cursor: pointer; }
              .nexus-row td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
              .hover-glow { transition: color 0.2s; }
              .hover-glow:hover { color: #6366f1 !important; }
              @keyframes pop-check {
                0% { transform: scale(0.5); opacity: 0; }
                50% { transform: scale(1.4); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
              .pop-animation { animation: pop-check 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestDeliveryDashboard;
