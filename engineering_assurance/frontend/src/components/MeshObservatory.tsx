import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';
import MeshAnalyticsDashboard from './MeshAnalyticsDashboard';

interface MeshNode {
  id: string;
  label: string;
  agent: string;
  key?: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'bypassed';
}

interface MeshObservatoryProps {
  topology?: { mesh_id: string; nodes: MeshNode[]; active_node_id?: string | null };
  reasoningLogs?: any[];
  taskId?: string | null;
  loading?: boolean;
  demoMode?: boolean;
  factoryStep: number;
  module?: string;
  depth?: string;
  onNodeClick?: (node: MeshNode) => void;
  onApprove?: () => void;
  onReview?: () => void;
}

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const MODULE_LANES: Record<string, { label: string; color: string; bg: string; border: string; icon: string; agents: string[] }> = {
  ingest: {
    label: 'Module 1 · Ingest & Synthesize',
    color: '#6366f1', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.15)', icon: 'ti-import',
    agents: ['Ingestor','Planner','Clarifier','Lifecycle','Auditor','Logician','Governor','Remediation','Monitor','KnowledgeGraph','MetaIntel'],
  },
  forge: {
    label: 'Module 2 · Generate & Forge',
    color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.15)', icon: 'ti-package',
    agents: ['Agent2','TestImpact','Regression','Optimizer','Creator','DataBuilder','Exploratory','ApiValidation','ApiMock','GraphQL','AutomationForge','ApiCoder','Migration','CrossBrowser','MobileTesting','VisualIntel','i18n','Mutation','Locator'],
  },
  certify: {
    label: 'Module 3 · Certify & Comply',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)', icon: 'ti-shield',
    agents: ['Performance','Chaos','PerfIntel','SysResil','Security','Microservices','Tracing','DataPipeline','EventDriven','Orchestrator','Delivery','FeatureFlag','EnvProvisioner','DigitalTwin','EnvConsistency','SelfHealing','ReliabilityEng','SLO','UxIntel'],
  },
  decide: {
    label: 'Module 4 · Decide & Optimize',
    color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.15)', icon: 'ti-stats-up',
    agents: ['RcaIntel','IncRemed','ObsIntel','RelRisk','BizImpact','RoiIntel','Critic','SynthesisFinal','Writer','Factory'],
  },
};

const LANE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6'];
const FLOW_LABELS = ['UCC Synthesized', 'Artifacts Forged', 'Certified & Compliant'];

const NODE_ICONS: Record<string, string> = {
  Ingestor:'ti-import', Planner:'ti-direction', Clarifier:'ti-harddrives', Lifecycle:'ti-eye',
  Auditor:'ti-clipboard', Logician:'ti-layout-grid2', Governor:'ti-shield', Remediation:'ti-reload',
  Monitor:'ti-time', KnowledgeGraph:'ti-share', MetaIntel:'ti-crown',
  Agent2:'ti-map-alt', TestImpact:'ti-bolt', Regression:'ti-control-shuffle', Optimizer:'ti-layers-alt',
  Creator:'ti-pencil-alt', DataBuilder:'ti-package', Exploratory:'ti-compass', ApiValidation:'ti-magnet',
  ApiMock:'ti-server', GraphQL:'ti-vector', AutomationForge:'ti-html5', ApiCoder:'ti-microsoft-alt',
  Migration:'ti-exchange-vertical', CrossBrowser:'ti-world', MobileTesting:'ti-mobile',
  VisualIntel:'ti-image', i18n:'ti-flag', Mutation:'ti-infinite', Locator:'ti-target',
  Performance:'ti-pulse', Chaos:'ti-alert', PerfIntel:'ti-stats-up', SysResil:'ti-heart',
  Security:'ti-lock', Microservices:'ti-layout-grid3', Tracing:'ti-link', DataPipeline:'ti-filter',
  EventDriven:'ti-rss', Orchestrator:'ti-control-play', Delivery:'ti-truck', FeatureFlag:'ti-flag-alt',
  EnvProvisioner:'ti-cloud-up', DigitalTwin:'ti-split-v', EnvConsistency:'ti-check-box',
  SelfHealing:'ti-reload', ReliabilityEng:'ti-timer', SLO:'ti-bar-chart', UxIntel:'ti-paint-bucket',
  RcaIntel:'ti-search', IncRemed:'ti-medall', ObsIntel:'ti-zoom-in', RelRisk:'ti-stats-down',
  BizImpact:'ti-money', RoiIntel:'ti-pie-chart', Critic:'ti-comment-alt', SynthesisFinal:'ti-layers',
  Writer:'ti-book', Factory:'ti-package',
};

const getModuleForNode = (nodeId: string): string => {
  for (const [mod, def] of Object.entries(MODULE_LANES)) {
    if (def.agents.includes(nodeId)) return mod;
  }
  return 'ingest';
};

// ── Data Flow Link ────────────────────────────────────────────────────────────
const DataFlowLink: React.FC<{ label: string; fromColor: string; toColor: string }> = ({ label, fromColor, toColor }) => (
  <div style={{ position: 'relative', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
    <svg style={{ position: 'absolute', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={fromColor} stopOpacity="0.2" />
          <stop offset="50%" stopColor={toColor} stopOpacity="0.5" />
          <stop offset="100%" stopColor={toColor} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d="M 50,20 Q 500,20 950,20" fill="none" stroke={`url(#grad-${label})`} strokeWidth="2" strokeDasharray="6 4" strokeOpacity="0.8" />
      <circle r="3" fill={toColor}>
        <animateMotion dur="3s" repeatCount="indefinite" path="M 50,20 Q 500,20 950,20" />
      </circle>
    </svg>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 16px', borderRadius: '20px',
      background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(4px)', zIndex: 1 }}>
      <i className="ti-exchange-vertical" style={{ fontSize: '0.65rem', color: toColor }} />
      <span style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
    </div>
  </div>
);

// ── Node Card ─────────────────────────────────────────────────────────────────
const NodeCard: React.FC<{ node: MeshNode; moduleColor: string; isSelected: boolean; onClick: () => void }> = ({ node, moduleColor, isSelected, onClick }) => {
  const icon = NODE_ICONS[node.id] || 'ti-settings';
  const isActive = node.status === 'active';
  const isCompleted = node.status === 'completed';
  const isBypassed = node.status === 'bypassed';
  const isFailed = node.status === 'failed';
  const statusColor = isActive ? moduleColor : isCompleted ? '#10b981' : isFailed ? '#ef4444' : isBypassed ? '#334155' : '#475569';
  const statusBg = isActive ? moduleColor + '20' : isCompleted ? 'rgba(16,185,129,0.08)' : isBypassed ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)';
  return (
    <div className="node-card" onClick={onClick} title={node.label + ' \u2014 ' + node.status}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: '72px', height: '72px', borderRadius: '50%', cursor: 'pointer',
        background: isSelected ? moduleColor + '25' : isActive ? moduleColor + '15' : statusBg,
        border: '1.5px solid ' + (isSelected ? moduleColor : isActive ? moduleColor : isCompleted ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'),
        opacity: isBypassed ? 0.35 : 1, transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        boxShadow: isActive ? '0 0 25px ' + moduleColor + '60, inset 0 0 15px ' + moduleColor + '30' : isSelected ? '0 0 15px ' + moduleColor + '40' : 'none' }}>
      
      {/* Glowing Orb Effect for Active */}
      {isActive && (
        <>
          <div style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', border: '2px solid ' + moduleColor,
            animation: 'meshPulse 1.5s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: '0', borderRadius: '50%', background: `radial-gradient(circle at 50% 50%, ${moduleColor}30 0%, transparent 70%)`, pointerEvents: 'none', animation: 'orbGlow 2s alternate infinite' }} />
        </>
      )}
      
      {/* Status Dot */}
      <div style={{ position: 'absolute', top: '8px', right: '8px', width: '8px', height: '8px', borderRadius: '50%',
        background: statusColor, boxShadow: isActive ? '0 0 8px ' + moduleColor : 'none', border: '1px solid rgba(0,0,0,0.5)' }} />
      
      <i className={icon} style={{ fontSize: '1.4rem', color: isCompleted ? '#10b981' : isActive ? moduleColor : isBypassed ? '#334155' : '#64748b', zIndex: 1, filter: isActive ? `drop-shadow(0 0 5px ${moduleColor})` : 'none' }} />
      <div style={{ fontSize: '0.48rem', fontWeight: 800, color: isCompleted ? '#6ee7b7' : isActive ? '#f1f5f9' : '#475569',
        textAlign: 'center', marginTop: '6px', lineHeight: 1.1, maxWidth: '60px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px', zIndex: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {asText(node.label, '').length > 12 ? asText(node.label, '').slice(0, 11) + '\u2026' : asText(node.label, '')}
      </div>
    </div>
  );
};

// ── Pipeline HUD ─────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'ingest',  label: 'Ingest',     icon: 'ti-import',   minStep: 1, doneStep: 3 },
  { id: 'review',  label: 'Review',     icon: 'ti-eye',      minStep: 3, doneStep: 4 },
  { id: 'forge',   label: 'Synthesis',  icon: 'ti-package',  minStep: 4, doneStep: 5 },
  { id: 'release', label: 'Release',    icon: 'ti-stats-up', minStep: 5, doneStep: 99 },
];

const PipelineHUD: React.FC<{ factoryStep: number; loading: boolean }> = ({ factoryStep, loading }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
    {STAGES.map((s, i) => {
      const done = factoryStep >= s.doneStep;
      const active = !done && factoryStep >= s.minStep;
      const locked = !done && !active;
      const isLast = i === STAGES.length - 1;
      return (
        <React.Fragment key={s.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? '#10b981' : active ? '#6366f1' : '#1e293b',
              color: done || active ? '#fff' : '#475569',
              fontSize: '0.65rem', fontWeight: 900, transition: 'all 0.3s',
              boxShadow: active ? '0 0 10px rgba(99,102,241,0.4)' : 'none'
            }}>
              {done ? <i className="ti-check" /> : <i className={s.icon} />}
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: done ? '#10b981' : active ? '#f1f5f9' : '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {s.label}
            </span>
          </div>
          {!isLast && <div style={{ flex: 1, height: '1px', background: done ? '#10b981' : 'rgba(255,255,255,0.05)', minWidth: '10px' }} />}
        </React.Fragment>
      );
    })}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const MeshObservatory: React.FC<MeshObservatoryProps> = ({ 
  topology, reasoningLogs, taskId, loading, factoryStep, module, depth, onNodeClick, onApprove, onReview 
}) => {
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null);
  const [liveTopology, setLiveTopology] = useState(topology);
  const [viewMode, setViewMode] = useState<'topology' | 'analytics'>('topology');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only use the passed topology if it has actual nodes — otherwise poll for live data
    if (topology && topology.nodes && topology.nodes.length > 0) {
      setLiveTopology(topology);
      return;
    }
    if (!taskId) return;
    const poll = async () => {
      try {
        const data = await apiClient.get('/api/tasks/status/' + taskId);
      if (true) {
          if (data.mesh_topology) setLiveTopology(data.mesh_topology);
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* silent */ }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [taskId, topology]);

  useEffect(() => {
    if (topology && topology.nodes && topology.nodes.length > 0) setLiveTopology(topology);
  }, [topology]);

  const nodeStatusMap = React.useMemo(() => {
    const map: Record<string, string> = {};
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

  const nodes = (liveTopology?.nodes || []).map((n: MeshNode) => {
    let key = (n.key || n.id).toLowerCase();
    
    // Map MeshObservatory's display IDs to the internal agent keys used in logs
    if (key === 'logician' || key === 'systemslogician') key = 'logician';
    if (key === 'governor' || key === 'compliancegovernor') key = 'compliance_governor';
    if (key === 'planner' || key === 'planningagent') key = 'planning_agent';
    if (key === 'clarifier' || key === 'requirementclarifier') key = 'requirement_clarifier';
    if (key === 'ingestor' || key === 'requirementsingestor') key = 'ingestor';
    
    const feedStatus = nodeStatusMap[key];
    if (feedStatus) {
       return { ...n, status: feedStatus === 'complete' ? 'completed' : feedStatus === 'running' ? 'active' : n.status };
    }
    return n;
  });
  
  const selectedNodes = nodes.filter(n => n.status !== 'bypassed');
  const completed = nodes.filter(n => n.status === 'completed').length;
  const active    = nodes.filter(n => n.status === 'active').length;
  const pending   = nodes.filter(n => n.status === 'pending').length;
  const bypassed  = nodes.filter(n => n.status === 'bypassed').length;
  const total     = nodes.length;
  const selectedTotal = selectedNodes.length > 0 ? selectedNodes.length : total;
  const progress  = selectedTotal > 0 ? Math.round((completed / selectedTotal) * 100) : 0;

  const handleNodeClick = (node: MeshNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    onNodeClick?.(node);
  };

  const laneEntries = Object.entries(MODULE_LANES);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header & Pipeline HUD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f1f5f9', margin: 0, letterSpacing: '-0.5px' }}>
              Mesh Observatory
            </h1>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: '4px' }}>
              <button 
                onClick={() => setViewMode('topology')}
                style={{ background: viewMode === 'topology' ? 'rgba(99,102,241,0.2)' : 'transparent', color: viewMode === 'topology' ? '#818cf8' : '#94a3b8', border: 'none', padding: '6px 16px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                <i className="ti-vector" /> Topology
              </button>
              <button 
                onClick={() => setViewMode('analytics')}
                style={{ background: viewMode === 'analytics' ? 'rgba(99,102,241,0.2)' : 'transparent', color: viewMode === 'analytics' ? '#818cf8' : '#94a3b8', border: 'none', padding: '6px 16px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                <i className="ti-bar-chart" /> Analytics
              </button>
            </div>
            {loading && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <div className="dot-pulse" style={{ width: '4px', height: '4px', background: '#6366f1', borderRadius: '50%', animation: 'meshPulse 1s infinite 0s' }} />
                <div className="dot-pulse" style={{ width: '4px', height: '4px', background: '#6366f1', borderRadius: '50%', animation: 'meshPulse 1s infinite 0.2s' }} />
                <div className="dot-pulse" style={{ width: '4px', height: '4px', background: '#6366f1', borderRadius: '50%', animation: 'meshPulse 1s infinite 0.4s' }} />
              </div>
            )}
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>ID:</span> {liveTopology?.mesh_id || 'STANDBY'}
            {module && (
               <>
                 <span style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.1)' }} />
                 <span style={{ color: '#94a3b8', fontWeight: 800 }}>MODULE:</span> <span style={{ color: '#818cf8' }}>{asText(module, '—').toUpperCase()}</span>
               </>
            )}
            {depth && (
               <>
                 <span style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.1)' }} />
                 <span style={{ color: '#94a3b8', fontWeight: 800 }}>DEPTH:</span> <span style={{ color: '#fbbf24' }}>{asText(depth, '—').toUpperCase()}</span>
               </>
            )}
          </p>
          
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #10b981)', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.68rem', fontWeight: 900, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#10b981' }}>{completed}</span>
              <span style={{ opacity: 0.3 }}>/</span>
              <span style={{ color: '#94a3b8' }}>{selectedTotal}</span>
              <span style={{ marginLeft: '4px', color: '#6366f1', opacity: 0.8 }}>NODES SYNCED</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: '480px' }}>
           <PipelineHUD factoryStep={factoryStep} loading={!!loading} />
        </div>
      </div>

      {/* HITL Control Bar — shown when Phase 1 is complete and awaiting approval */}
      {factoryStep === 3 && (
        <div style={{ 
          padding: '20px 24px', borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.06))',
          border: '2px solid #f59e0b',
          display: 'flex', flexDirection: 'column', gap: '16px',
          animation: 'slideDownHUD 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxShadow: '0 10px 40px rgba(245,158,11,0.25)'
        }}>
          {/* Top row: icon + message */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
              background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#0f172a', fontSize: '1.3rem', fontWeight: 900,
              animation: 'pulse 1.5s infinite',
              boxShadow: '0 0 20px rgba(245,158,11,0.5)'
            }}>
              ⠸
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, color: '#f1f5f9', fontSize: '1rem', marginBottom: '4px' }}>
                Phase 1 Complete — Your Approval is Required
              </div>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5 }}>
                The AI has built the <strong style={{ color: '#fcd34d' }}>Intelligence Contract</strong> — a strategic test plan based on your requirements.
                Review it, make any edits, then approve to launch the full 59-node synthesis mesh (Phase 2).
              </div>
            </div>
          </div>

          {/* Bottom row: what happens next + action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { icon: '📋', text: 'Review the contract' },
                { icon: '✏️', text: 'Edit if needed' },
                { icon: '⚡', text: 'Approve to run Phase 2' },
              ].map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 10px', borderRadius: '20px',
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                  fontSize: '0.72rem', color: '#fcd34d', fontWeight: 600,
                }}>
                  <span>{step.icon}</span>{step.text}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button
                onClick={onReview}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid rgba(245,158,11,0.4)',
                  background: 'rgba(245,158,11,0.08)', color: '#fcd34d',
                  fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                <i className="ti-eye" /> Review Contract
              </button>
              <button
                onClick={onApprove}
                style={{
                  padding: '10px 28px', borderRadius: '8px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#0f172a', fontSize: '0.88rem', fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(245,158,11,0.5)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  letterSpacing: '0.02em',
                }}>
                <span style={{ fontSize: '1rem' }}>⚡</span>
                Approve & Launch Phase 2
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Pills */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { label: 'Active',   count: active,    color: '#6366f1', icon: 'ti-pulse' },
          { label: 'Complete', count: completed, color: '#10b981', icon: 'ti-check' },
          { label: 'Pending',  count: pending,   color: '#475569', icon: 'ti-time' },
          { label: 'Bypassed', count: bypassed,  color: '#334155', icon: 'ti-na' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px',
            borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
            background: s.color + '12', border: '1px solid ' + s.color + '30', color: s.color }}>
            <i className={s.icon} style={{ fontSize: '0.7rem' }} />
            {s.count} {s.label}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px',
            borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
            background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
            <i className="ti-reload" style={{ animation: 'spin 1s linear infinite', fontSize: '0.7rem' }} />
            Mesh propagating...
          </div>
        )}
      </div>

      <style>{`
        @keyframes meshPulse { 0% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.08); } 100% { opacity:1; transform:scale(1); } }
        @keyframes orbGlow { 0% { opacity: 0.5; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1.1); } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes slideDownHUD { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        .node-card:hover { transform: translateY(-5px) scale(1.05); z-index: 10; }
      `}</style>

      {/* Module Lanes with Data Flow Arrows between them */}
      {/* Render Topology OR Analytics */}
      {viewMode === 'analytics' && (
        <MeshAnalyticsDashboard />
      )}
      
      {viewMode === 'topology' && (
        <>
          {total === 0 && (
            <div style={{
              height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)',
              padding: '40px', textAlign: 'center'
            }}>
              {loading ? (
                <>
                  <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '20px' }}>
                    <div style={{ position: 'absolute', inset: 0, border: '4px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: '10px', border: '4px solid #10b981', borderBottomColor: 'transparent', borderRadius: '50%', animation: 'spin 1.5s linear infinite reverse' }} />
                  </div>
                  <div style={{ color: '#f1f5f9', fontWeight: 900, fontSize: '1.2rem', marginBottom: '8px' }}>Mission Initializing</div>
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Synchronizing with Mesh ID: {taskId?.substring(0, 8) || '...'}</div>
                </>
              ) : (
                <>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                    <i className="ti-rocket" style={{ fontSize: '1.8rem', color: '#6366f1', opacity: 0.6 }} />
                  </div>
                  <div style={{ color: '#f1f5f9', fontWeight: 900, fontSize: '1.2rem', marginBottom: '8px' }}>Mission Standby</div>
                  <div style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: '300px' }}>
                    No active nodes detected. Launch a mission from the <strong>Mission Launchpad</strong> to start telemetry.
                  </div>
                </>
              )}
            </div>
          )}

          {total > 0 && (
            <div style={{ position: 'relative', background: 'rgba(15,23,42,0.3)', borderRadius: '24px', padding: '30px', border: '1px solid rgba(255,255,255,0.04)', overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '1000px' }}>
                {laneEntries.map(([key, def], idx) => {
                  // Robust filtering: check ID, Agent Type, or Key
                  const laneNodes = nodes.filter(n => 
                    def.agents.includes(n.id) || 
                    def.agents.includes(n.agent) || 
                    (n.key && def.agents.includes(n.key))
                  );
                  const isLast = idx === laneEntries.length - 1;
                  return (
                    <React.Fragment key={key}>
                      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div style={{ width: '220px', padding: '16px', borderRadius: '16px', background: def.bg, border: '1px solid ' + def.border, flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <i className={def.icon} style={{ color: def.color, fontSize: '0.9rem' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: def.color, textTransform: 'uppercase', letterSpacing: '1px' }}>{def.label}</span>
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>{laneNodes.length} specialist agents linked</div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                          {laneNodes.map(node => (
                            <NodeCard key={node.id} node={node} moduleColor={def.color} isSelected={selectedNode?.id === node.id} onClick={() => handleNodeClick(node)} />
                          ))}
                        </div>
                      </div>
                      {!isLast && <DataFlowLink label={FLOW_LABELS[idx]} fromColor={def.color} toColor={LANE_COLORS[idx+1]} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MeshObservatory;
