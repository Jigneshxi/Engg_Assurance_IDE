/**
 * ============================================================================
 * CONVERGE PHASE 5 — LONG-TERM ANALYTICS & REPORTING
 * HistoryTrends.tsx
 * ============================================================================
 */
import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';

interface HistoryRecord { id: number; summary: string; platform: string; ticket_id: string; download_url: string | null; created_at: string; status?: string; }
interface QuarterlyData { total_missions: number; total_savings_usd: number; avg_roi_pct: number; tests_generated: number; standards_covered: string[]; knowledge_entities: number; controls_verified: number; roi_trend: { label: string; value: number }[]; mission_volume_trend: { week: string; count: number }[]; kg_growth: { label: string; count: number }[]; }
interface KGNodeData { id: string; label: string; type: string; links: string[]; }
interface KGData { nodes: KGNodeData[]; total_entities: number; entity_types: number; growth_events: number; growth_timeline: { label: string; count: number }[]; }

const DEMO_RECORDS: HistoryRecord[] = [
  { id: 5, summary: 'Payment Gateway — PCI-DSS Compliance Audit', platform: 'jira', ticket_id: 'PAY-2201', download_url: null, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'COMPLETED' },
  { id: 4, summary: 'Auth Service — OAuth2 Regression Suite', platform: 'ado', ticket_id: 'ADO-5512', download_url: null, created_at: new Date(Date.now() - 8 * 3600000).toISOString(), status: 'COMPLETED' },
  { id: 3, summary: 'Swag Labs — E2E Checkout Validation', platform: 'multi', ticket_id: 'demo-swag-001', download_url: null, created_at: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'COMPLETED' },
  { id: 2, summary: 'VVNT Payment Gateway — Security & Compliance', platform: 'jira', ticket_id: 'VVNT-2891', download_url: null, created_at: new Date(Date.now() - 3 * 86400000).toISOString(), status: 'COMPLETED' },
  { id: 1, summary: 'Order Management API — Regression Priority', platform: 'ado', ticket_id: 'ADO-4401', download_url: null, created_at: new Date(Date.now() - 7 * 86400000).toISOString(), status: 'COMPLETED' },
];

const DEMO_QUARTERLY: QuarterlyData = {
  total_missions: 47, total_savings_usd: 41250, avg_roi_pct: 1135, tests_generated: 2208,
  standards_covered: ['PCI-DSS', 'ISO-27001', 'SOC2', 'OWASP', 'GDPR', 'HIPAA'],
  knowledge_entities: 342, controls_verified: 189,
  roi_trend: [{ label: 'W1', value: 420 }, { label: 'W2', value: 680 }, { label: 'W3', value: 890 }, { label: 'W4', value: 1050 }, { label: 'W5', value: 980 }, { label: 'W6', value: 1135 }, { label: 'W7', value: 1200 }, { label: 'W8', value: 1135 }],
  mission_volume_trend: [{ week: 'W1', count: 3 }, { week: 'W2', count: 5 }, { week: 'W3', count: 7 }, { week: 'W4', count: 6 }, { week: 'W5', count: 8 }, { week: 'W6', count: 9 }, { week: 'W7', count: 5 }, { week: 'W8', count: 4 }],
  kg_growth: [{ label: 'W1', count: 28 }, { label: 'W2', count: 55 }, { label: 'W3', count: 89 }, { label: 'W4', count: 134 }, { label: 'W5', count: 198 }, { label: 'W6', count: 256 }, { label: 'W7', count: 310 }, { label: 'W8', count: 342 }],
};

const DEMO_KG_NODES: KGNodeData[] = [
  { id: 'n1',  label: 'Auth Flow',       type: 'concept',     links: ['n2', 'n5', 'n9'] },
  { id: 'n2',  label: 'OAuth2 Token',    type: 'requirement', links: ['n3', 'n6'] },
  { id: 'n3',  label: 'Token Expiry TC', type: 'test',        links: ['n4'] },
  { id: 'n4',  label: 'Session Risk',    type: 'risk',        links: ['n1'] },
  { id: 'n5',  label: 'Payment Module',  type: 'concept',     links: ['n6', 'n7', 'n10'] },
  { id: 'n6',  label: 'PCI-DSS Req',     type: 'requirement', links: ['n7', 'n8'] },
  { id: 'n7',  label: 'Checkout TC',     type: 'test',        links: ['n8'] },
  { id: 'n8',  label: 'Fraud Risk',      type: 'risk',        links: ['n5'] },
  { id: 'n9',  label: 'API Gateway',     type: 'concept',     links: ['n10', 'n11'] },
  { id: 'n10', label: 'Rate Limit Req',  type: 'requirement', links: ['n11', 'n12'] },
  { id: 'n11', label: 'Load Test TC',    type: 'test',        links: ['n12'] },
  { id: 'n12', label: 'DDoS Risk',       type: 'risk',        links: ['n9'] },
  { id: 'n13', label: 'Data Privacy',    type: 'concept',     links: ['n14', 'n15'] },
  { id: 'n14', label: 'GDPR Req',        type: 'requirement', links: ['n15'] },
  { id: 'n15', label: 'Privacy TC',      type: 'test',        links: ['n1'] },
  { id: 'n16', label: 'Infra Stability', type: 'concept',     links: ['n17'] },
  { id: 'n17', label: 'SLA Req',         type: 'requirement', links: ['n18'] },
  { id: 'n18', label: 'Uptime TC',       type: 'test',        links: ['n16'] },
];

const DEMO_KG_DATA: KGData = {
  nodes: DEMO_KG_NODES, total_entities: 342, entity_types: 4, growth_events: 18,
  growth_timeline: [{ label: 'W1', count: 28 }, { label: 'W2', count: 55 }, { label: 'W3', count: 89 }, { label: 'W4', count: 134 }, { label: 'W5', count: 198 }, { label: 'W6', count: 256 }, { label: 'W7', count: 310 }, { label: 'W8', count: 342 }],
};

const NODE_COLORS: Record<string, string> = { concept: '#6366f1', requirement: '#10b981', test: '#f59e0b', risk: '#ef4444' };
const STATUS_COLORS: Record<string, string> = { COMPLETED: '#10b981', FAILED: '#ef4444', PROCESSING: '#f59e0b', PENDING: '#6366f1' };
const fmtCurrency = (n: number | null | undefined) => { if (n == null) return '$0'; return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`; };
const formatDate = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); };

// ── Sparkline ─────────────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({ data, color = '#6366f1', width = 120, height = 36 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1); const min = Math.min(...data, 0); const range = max - min || 1;
  const pts = data.map((v, i) => { const x = (i / (data.length - 1)) * width; const y = height - ((v - min) / range) * (height - 4) - 2; return `${x},${y}`; }).join(' ');
  return <svg width={width} height={height} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

// ── HBarChart ─────────────────────────────────────────────────────────────────
const HBarChart: React.FC<{ data: { label: string; value: number; color?: string }[]; maxVal?: number }> = ({ data, maxVal }) => {
  const max = maxVal ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', width: '80px', flexShrink: 0, textAlign: 'right' }}>{item.label}</span>
          <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', background: item.color ?? '#6366f1', borderRadius: '4px', transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b', width: '28px', textAlign: 'right' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: string | number; color: string; icon?: string; sparkData?: number[]; sub?: string }> = ({ label, value, color, icon, sparkData, sub }) => (
  <div style={{ padding: '18px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}22`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>{icon && <span style={{ marginRight: '5px' }}>{icon}</span>}{label}</span>
      {sparkData && <Sparkline data={sparkData} color={color} width={80} height={28} />}
    </div>
    <div style={{ fontSize: '1.8rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sub}</div>}
  </div>
);

// ── TrendChart ────────────────────────────────────────────────────────────────
const TrendChart: React.FC<{ data: { label: string; value: number }[]; color?: string; width?: number; height?: number; unit?: string }> = ({ data, color = '#6366f1', width = 600, height = 100, unit = '' }) => {
  if (!data || data.length < 2) return null;
  const padL = 40; const padB = 20; const padR = 10; const padT = 10;
  const W = width - padL - padR; const H = height - padT - padB;
  const vals = data.map(d => d.value);
  const max = Math.max(...vals, 1); const min = Math.min(...vals, 0); const range = max - min || 1;
  const pts = data.map((d, i) => { const x = padL + (i / (data.length - 1)) * W; const y = padT + H - ((d.value - min) / range) * H; return `${x},${y}`; }).join(' ');
  const areaPath = `M${padL},${padT + H} ` + data.map((d, i) => { const x = padL + (i / (data.length - 1)) * W; const y = padT + H - ((d.value - min) / range) * H; return `L${x},${y}`; }).join(' ') + ` L${padL + W},${padT + H} Z`;
  const gradId = `tg${color.replace('#', '')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => { const x = padL + (i / (data.length - 1)) * W; const y = padT + H - ((d.value - min) / range) * H; return <circle key={i} cx={x} cy={y} r="3" fill={color} />; })}
      {data.map((d, i) => { const x = padL + (i / (data.length - 1)) * W; return <text key={i} x={x} y={height - 4} textAnchor="middle" style={{ fontSize: '9px', fill: '#64748b' }}>{d.label}</text>; })}
      <text x={padL - 4} y={padT + 4} textAnchor="end" style={{ fontSize: '9px', fill: '#64748b' }}>{max.toFixed(0)}{unit}</text>
      <text x={padL - 4} y={padT + H} textAnchor="end" style={{ fontSize: '9px', fill: '#64748b' }}>{min.toFixed(0)}{unit}</text>
    </svg>
  );
};

// ── Knowledge Graph SVG ───────────────────────────────────────────────────────
const KnowledgeGraphSVG: React.FC<{ nodes: KGNodeData[]; svgWidth?: number; svgHeight?: number }> = ({ nodes, svgWidth = 700, svgHeight = 420 }) => {
  const total = nodes.length; const cx = svgWidth / 2; const cy = svgHeight / 2;
  const positions = nodes.map((node, i) => {
    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
    const r = i % 3 === 0 ? 100 : 180;
    return { id: node.id, cx: cx + r * Math.cos(angle), cy: cy + r * Math.sin(angle) };
  });
  const posMap: Record<string, { cx: number; cy: number }> = {};
  positions.forEach(p => { posMap[p.id] = p; });
  return (
    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block', animation: 'htFadeIn 0.8s ease' }}>
      <style>{`@keyframes htFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
      {nodes.map(node => node.links.map(tid => { const s = posMap[node.id]; const t = posMap[tid]; if (!s || !t) return null; return <line key={`${node.id}-${tid}`} x1={s.cx} y1={s.cy} x2={t.cx} y2={t.cy} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />; }))}
      {nodes.map((node, i) => { const pos = posMap[node.id]; if (!pos) return null; const color = NODE_COLORS[node.type] ?? '#64748b'; return (
        <g key={node.id} style={{ animation: `htFadeIn ${0.3 + i * 0.04}s ease` }}>
          <circle cx={pos.cx} cy={pos.cy} r={16} fill={`${color}20`} stroke={color} strokeWidth="2"><title>{node.label} ({node.type})</title></circle>
          <text x={pos.cx} y={pos.cy + 27} textAnchor="middle" style={{ fontSize: '8px', fill: '#94a3b8', pointerEvents: 'none' }}>{node.label.length > 11 ? node.label.slice(0, 10) + '…' : node.label}</text>
        </g>
      ); })}
    </svg>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const HistoryTrends: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'trends' | 'quarterly' | 'knowledge_graph' | 'history'>('trends');
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [status, setStatus] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [quarterlyData, setQuarterlyData] = useState<QuarterlyData | null>(null);
  const [kgData, setKgData] = useState<KGData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/history/list`);
      if (true) { setRecords(data.length > 0 ? data : DEMO_RECORDS); setIsDemo(data.length === 0); }
      else { setRecords(DEMO_RECORDS); setIsDemo(true); }
    } catch { setRecords(DEMO_RECORDS); setIsDemo(true); }
    finally { setLoading(false); }
  }, []);

  const fetchQuarterly = useCallback(async () => {
    try {
      const data = await apiClient.get(`/history/quarterly-report`);
      if (data && !data.detail && data.executive_summary) {
        const mapped: QuarterlyData = {
          total_missions: data.executive_summary.total_missions ?? 0,
          total_savings_usd: data.executive_summary.total_savings_usd ?? 0,
          avg_roi_pct: data.executive_summary.average_roi_percent ?? 0,
          tests_generated: data.executive_summary.total_tests_generated ?? 0,
          standards_covered: data.executive_summary.standards_covered ?? [],
          knowledge_entities: data.executive_summary.knowledge_entities ?? 0,
          controls_verified: (data.compliance_trend || []).reduce((sum: number, c: any) => sum + (c.controls_verified ?? 0), 0),
          roi_trend: (data.roi_trend || []).map((r: any) => ({ label: String(r.date).slice(5), value: r.roi })),
          mission_volume_trend: data.mission_volume_trend || [],
          kg_growth: (data.knowledge_graph_growth || []).map((g: any) => ({ label: String(g.date).slice(5), count: g.cumulative }))
        };
        setQuarterlyData(mapped);
      } else setQuarterlyData(DEMO_QUARTERLY);
    } catch { setQuarterlyData(DEMO_QUARTERLY); }
  }, []);

  const fetchKGData = useCallback(async () => {
    try {
      const data = await apiClient.get(`/history/knowledge-graph-growth`);
      if (data && !data.detail && data.nodes) {
        const nodes: KGNodeData[] = (data.nodes || []).map((n: any) => ({
          id: `n${n.id}`,
          label: n.name,
          type: n.type,
          links: (data.links || []).filter((l: any) => l.source === n.id).map((l: any) => `n${l.target}`)
        }));
        
        const mapped: KGData = {
          nodes,
          total_entities: data.total_entities ?? 0,
          entity_types: (data.entity_types || []).length,
          growth_events: (data.growth_timeline || []).length,
          growth_timeline: (data.growth_timeline || []).map((t: any) => ({ label: String(t.date).slice(5), count: t.entities_added }))
        };
        setKgData(mapped);
      } else setKgData(DEMO_KG_DATA);
    } catch { setKgData(DEMO_KG_DATA); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => {
    if (activeTab === 'quarterly' && !quarterlyData) fetchQuarterly();
    if (activeTab === 'knowledge_graph' && !kgData) fetchKGData();
  }, [activeTab, quarterlyData, kgData, fetchQuarterly, fetchKGData]);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try { await apiClient.delete(`/history/${id}`); setRecords(prev => prev.filter(r => r.id !== id)); setStatus({ type: 'success', text: 'Record deleted.' }); }
    catch { setRecords(prev => prev.filter(r => r.id !== id)); }
    finally { setDeleting(null); setTimeout(() => setStatus({ type: '', text: '' }), 3000); }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/quarterly-report/export`, { headers: { ...(apiClient as any)['getHeaders']() }, credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `CONVERGE_Quarterly_Health_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: any) { alert('Export failed: ' + e.message); }
    finally { setExporting(false); }
  };

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const thisWeek = records.filter(r => new Date(r.created_at).getTime() > weekAgo).length;
  const platforms = Array.from(new Set(records.map(r => r.platform)));
  const platformCounts = platforms.map(p => ({ label: p.toUpperCase(), value: records.filter(r => r.platform === p).length, color: p === 'jira' ? '#6366f1' : p === 'ado' ? '#8b5cf6' : p === 'multi' ? '#10b981' : '#f59e0b' }));
  const weeklyVolume: number[] = Array.from({ length: 8 }, (_, i) => { const wS = now - (8 - i) * 7 * 86400000; const wE = wS + 7 * 86400000; return records.filter(r => { const t = new Date(r.created_at).getTime(); return t >= wS && t < wE; }).length; });
  const dailyActivity = Array.from({ length: 7 }, (_, i) => { const dS = now - (6 - i) * 86400000; const dE = dS + 86400000; const count = records.filter(r => { const t = new Date(r.created_at).getTime(); return t >= dS && t < dE; }).length; const d = new Date(dS); return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), count }; });
  const avgPerWeek = weeklyVolume.length > 0 ? (weeklyVolume.reduce((a, b) => a + b, 0) / weeklyVolume.length).toFixed(1) : '0';
  const filteredRecords = filterPlatform === 'all' ? records : records.filter(r => r.platform === filterPlatform);
  const qd = quarterlyData ?? DEMO_QUARTERLY;
  const kg = kgData ?? DEMO_KG_DATA;

  const tabs = [
    { id: 'trends' as const, label: 'Analytics', icon: '📊' },
    { id: 'quarterly' as const, label: 'Quarterly Report', icon: '📋' },
    { id: 'knowledge_graph' as const, label: 'Knowledge Graph', icon: '🕸️' },
    { id: 'history' as const, label: 'Audit Log', icon: '🗂️' },
  ];

  const sL: React.CSSProperties = { fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' };
  const barRow = (data: { label: string; count: number }[]) => {
    const maxC = Math.max(...data.map(x => x.count), 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
        {data.map((pt, i) => { const bH = (pt.count / maxC) * 64; return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '100%', height: `${bH}px`, minHeight: '4px', background: '#6366f1', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease' }} title={`${pt.count}`} />
            <span style={{ fontSize: '0.65rem', color: '#475569' }}>{pt.label}</span>
          </div>
        ); })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#f1f5f9' }}>Long-Term Analytics &amp; Reporting</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>CONVERGE Phase 5 · {records.length} missions logged{isDemo ? ' · Demo Mode' : ''}</p>
        </div>
        <button onClick={fetchRecords} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700 }}>↻ Refresh</button>
      </div>

      {status.text && <div style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '0.8rem', background: status.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${status.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: status.type === 'success' ? '#10b981' : '#ef4444' }}>{status.text}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '8px 12px', borderRadius: '7px', border: 'none', background: activeTab === tab.id ? 'rgba(99,102,241,0.2)' : 'transparent', color: activeTab === tab.id ? '#818cf8' : '#64748b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TRENDS TAB ── */}
      {activeTab === 'trends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <StatCard label="Total Missions" value={records.length} color="#6366f1" icon="🚀" sparkData={weeklyVolume} sub="all time" />
            <StatCard label="This Week" value={thisWeek} color="#10b981" icon="📅" sub="last 7 days" />
            <StatCard label="Avg / Week" value={avgPerWeek} color="#f59e0b" icon="📈" sparkData={weeklyVolume} sub="8-week rolling" />
            <StatCard label="Platforms" value={platforms.length} color="#8b5cf6" icon="🔌" sub="connected sources" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
              <div style={sL}>Weekly Mission Volume</div>
              <Sparkline data={weeklyVolume} color="#6366f1" width={320} height={60} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', marginTop: '6px' }}><span>8 weeks ago</span><span>This week</span></div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
              <div style={sL}>Platform Distribution</div>
              {platformCounts.length > 0 ? <HBarChart data={platformCounts} /> : <div style={{ color: '#475569', fontSize: '0.8rem' }}>No data yet</div>}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Daily Activity — Last 7 Days</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
              {dailyActivity.map((day, i) => { const maxC = Math.max(...dailyActivity.map(d => d.count), 1); const bH = maxC > 0 ? (day.count / maxC) * 64 : 4; return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '100%', height: `${bH}px`, minHeight: '4px', background: day.count > 0 ? '#6366f1' : 'rgba(255,255,255,0.06)', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease' }} title={`${day.count} missions`} />
                  <span style={{ fontSize: '0.65rem', color: '#475569' }}>{day.label}</span>
                </div>
              ); })}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Engineering Health Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { label: 'Completion Rate', value: records.length > 0 ? `${Math.round((records.filter(r => r.status === 'COMPLETED').length / records.length) * 100)}%` : '—', color: '#10b981', desc: 'missions completed' },
                { label: 'Most Active Platform', value: platformCounts.length > 0 ? platformCounts.sort((a, b) => b.value - a.value)[0].label : '—', color: '#6366f1', desc: 'highest volume' },
                { label: 'Sprint Velocity', value: `${avgPerWeek}/wk`, color: '#f59e0b', desc: '8-week rolling avg' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: '10px', background: `${item.color}08`, border: `1px solid ${item.color}20` }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{item.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '4px' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── QUARTERLY TAB ── */}
      {activeTab === 'quarterly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>Quarterly Health Report</h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#64748b' }}>Executive summary · Q{Math.ceil((new Date().getMonth() + 1) / 3)} {new Date().getFullYear()}</p>
            </div>
            <button onClick={handleExportPDF} disabled={exporting} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: exporting ? 'rgba(99,102,241,0.3)' : '#6366f1', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {exporting ? '⏳ Exporting…' : '⬇ Export Health Report'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <StatCard label="Total Missions"     value={qd.total_missions ?? 0}                  color="#6366f1" icon="🚀" sub="this quarter" />
            <StatCard label="Total Savings"      value={fmtCurrency(qd.total_savings_usd)}  color="#10b981" icon="💰" sub="vs manual effort" />
            <StatCard label="Avg ROI"            value={`${(qd.avg_roi_pct ?? 0).toFixed(0)}%`}    color="#f59e0b" icon="📈" sparkData={(qd.roi_trend || []).map(r => r.value)} sub="automation return" />
            <StatCard label="Tests Generated"    value={(qd.tests_generated ?? 0).toLocaleString()} color="#8b5cf6" icon="✅" sub="synthesized by mesh" />
            <StatCard label="Standards Covered"  value={(qd.standards_covered || []).length}        color="#06b6d4" icon="🛡️" sub="compliance frameworks" />
            <StatCard label="Knowledge Entities" value={qd.knowledge_entities ?? 0}               color="#ec4899" icon="🧠" sub="in graph" />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>ROI Trend — Weekly</div>
            <TrendChart data={qd.roi_trend || []} color="#f59e0b" width={600} height={110} unit="%" />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Mission Volume — Weekly</div>
            {barRow((qd.mission_volume_trend || []).map(w => ({ label: w.week, count: w.count })))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Compliance Posture</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {(qd.standards_covered || []).map((std, i) => <span key={i} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)' }}>{std}</span>)}
            </div>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{qd.controls_verified ?? 0}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>Controls Verified</div>
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#6366f1' }}>{(qd.standards_covered || []).length}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>Frameworks Active</div>
              </div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Knowledge Graph Growth</div>
            <TrendChart data={(qd.kg_growth || []).map(g => ({ label: g.label, value: g.count }))} color="#ec4899" width={600} height={90} />
            <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>{qd.knowledge_entities ?? 0} total entities</div>
          </div>
        </div>
      )}

      {/* ── KNOWLEDGE GRAPH TAB ── */}
      {activeTab === 'knowledge_graph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <StatCard label="Total Entities"  value={kg.total_entities ?? 0}  color="#6366f1" icon="🔵" sub="in knowledge graph" />
            <StatCard label="Entity Types"    value={kg.entity_types ?? 0}    color="#10b981" icon="🏷️" sub="concept, req, test, risk" />
            <StatCard label="Growth Events"   value={kg.growth_events ?? 0}   color="#f59e0b" icon="⚡" sub="this quarter" />
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, opacity: 0.8 }} />
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px', overflow: 'hidden' }}>
            <div style={sL}>Entity Relationship Graph — Institutional Memory</div>
            <KnowledgeGraphSVG nodes={kg.nodes || []} svgWidth={700} svgHeight={420} />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
            <div style={sL}>Growth Timeline</div>
            {barRow(kg.growth_timeline || [])}
            <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>Cumulative entity count over time</div>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG TAB ── */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Filter:</span>
            {['all', ...platforms].map(p => (
              <button key={p} onClick={() => setFilterPlatform(p)} style={{ padding: '5px 12px', borderRadius: '20px', border: 'none', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', background: filterPlatform === p ? '#6366f1' : 'rgba(255,255,255,0.05)', color: filterPlatform === p ? '#fff' : '#94a3b8' }}>
                {p === 'all' ? 'All' : p.toUpperCase()}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#475569' }}>{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</span>
          </div>
          {loading && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', color: '#64748b', fontSize: '0.85rem' }}>Loading…</div>}
          {!loading && filteredRecords.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}><div style={{ fontSize: '2rem', marginBottom: '8px' }}>🗂️</div><div style={{ fontSize: '0.85rem' }}>No records found.</div></div>}
          {!loading && filteredRecords.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    {['#', 'Platform', 'Summary', 'Ticket', 'Date', ''].map((h, i) => <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, idx) => (
                    <tr key={record.id} style={{ borderBottom: idx < filteredRecords.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.72rem', color: '#475569', fontWeight: 700 }}>{record.id}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>{record.platform.toUpperCase()}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#f1f5f9', maxWidth: '280px' }}><span title={record.summary}>{record.summary.length > 55 ? record.summary.slice(0, 54) + '…' : record.summary}</span></td>
                      <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>#{record.ticket_id}</span></td>
                      <td style={{ padding: '12px 16px', fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(record.created_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {record.download_url && <a href={`${API_BASE}${record.download_url}`} download style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>⬇</a>}
                          <button onClick={() => handleDelete(record.id)} disabled={deleting === record.id} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: deleting === record.id ? 'not-allowed' : 'pointer', opacity: deleting === record.id ? 0.5 : 1 }}>{deleting === record.id ? '…' : '🗑'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#475569' }}>
            <span>{records.length} total{isDemo && <span style={{ marginLeft: '8px', color: '#f59e0b', fontWeight: 700 }}>· DEMO DATA</span>}</span>
            <span>CONVERGE Phase 5 · Long-Term Analytics</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryTrends;
