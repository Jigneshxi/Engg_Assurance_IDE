import { apiClient } from '../utils/apiClient';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';
import { ConnectionConfig, Platform } from '../types';

// ─── Data Constants ────────────────────────────────────────────────────────────

const CONVERGE_MODULES = [
  { id: 'ingest', label: 'Module 1', title: 'Ingest & Synthesize', desc: 'Any input. Any format. One hardened specification.', icon: 'ti-import', color: '#6366f1', agents: 10, mins: { rapid: 2, standard: 4, full: 8 } },
  { id: 'forge', label: 'Module 2', title: 'Generate & Forge', desc: 'Specification in. Production-ready test suite out.', icon: 'ti-package', color: '#10b981', agents: 23, mins: { rapid: 3, standard: 6, full: 12 } },
  { id: 'certify', label: 'Module 3', title: 'Certify & Comply', desc: 'Every sprint. Audit-ready. Automatically.', icon: 'ti-shield', color: '#f59e0b', agents: 19, mins: { rapid: 3, standard: 6, full: 12 } },
  { id: 'decide', label: 'Module 4', title: 'Decide & Optimize', desc: 'Ship or hold — with a dollar figure. Every time.', icon: 'ti-stats-up', color: '#8b5cf6', agents: 5, mins: { rapid: 1, standard: 3, full: 5 } },
];

const DEPTH_OPTIONS = [
  { id: 'rapid', label: 'Rapid', desc: 'Core Intelligence', nodes: 20 },
  { id: 'standard', label: 'Standard', desc: 'Expanded Intelligence', nodes: 40 },
  { id: 'full', label: 'Full Mesh', desc: 'Recursive Orchestration', nodes: 59 },
];

// Goal-oriented mission presets shown to users instead of raw module IDs
const MISSION_GOALS = [
  {
    id: 'full',
    icon: '🚀',
    title: 'Full Pipeline',
    subtitle: 'Recommended',
    desc: 'From raw requirements all the way to a release decision. Covers ingestion, test generation, compliance, and risk analysis.',
    color: '#6366f1',
    modules: ['ingest', 'forge', 'certify', 'decide'],
    mins: { rapid: 9, standard: 19, full: 37 },
  },
  {
    id: 'generate',
    icon: '⚡',
    title: 'Generate Tests',
    subtitle: 'Most common',
    desc: 'Turn your requirements into a complete, production-ready test suite — unit, API, integration, and more.',
    color: '#10b981',
    modules: ['ingest', 'forge'],
    mins: { rapid: 5, standard: 10, full: 20 },
  },
  {
    id: 'audit',
    icon: '🛡️',
    title: 'Audit & Comply',
    subtitle: 'Security & QA',
    desc: 'Run security scans, performance checks, and generate compliance reports for your existing test suite.',
    color: '#f59e0b',
    modules: ['ingest', 'certify'],
    mins: { rapid: 5, standard: 10, full: 20 },
  },
  {
    id: 'decide',
    icon: '📊',
    title: 'Release Decision',
    subtitle: 'Go / No-Go',
    desc: 'Analyse risk, business impact, and test coverage data to produce a data-backed ship or hold recommendation.',
    color: '#8b5cf6',
    modules: ['decide'],
    mins: { rapid: 1, standard: 3, full: 5 },
  },
];

const ROLE_OPTIONS = [
  { id: 'pm', label: 'Product Manager (PM)', icon: '📝', desc: 'Phase 1: Ingesting Jira Epics', modules: ['ingest'] },
  { id: 'architect', label: 'Systems Architect', icon: '🏗️', desc: 'Phase 2: Architecture & DB Design', modules: ['ingest', 'forge'] },
  { id: 'swe', label: 'Software Engineer (SWE)', icon: '💻', desc: 'Phase 3: Forges & Phase 4: DevOps/Docker', modules: ['forge', 'certify'] },
  { id: 'sre', label: 'DevSecOps / SRE', icon: '🛡️', desc: 'Phase 5: Chaos/Performance & Phase 6: Observability', modules: ['certify', 'decide'] },
  { id: 'qa', label: 'QA / SDET', icon: '🧪', desc: 'Focus: Test-Driven Development outputs', modules: ['forge'] },
  { id: 'leader', label: 'Engineering Leader (CTO/VP)', icon: '📊', desc: 'Focus: Governance & Stop-the-line metrics', modules: ['decide'] },
];

// ALM_SOURCES: determines which platforms use ID-based input vs URL-based
const ALM_SOURCES = ['jira', 'ado', 'github', 'gitlab', 'bitbucket', 'testrail', 'xray', 'zephyr', 'qtest', 'alm', 'rally', 'confluence'];

const humanizeAgentKey = (key: string) =>
  (key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();

const toAgentBadges = (items: string[] = []) => items.map(humanizeAgentKey);


// ─── Props Interface ───────────────────────────────────────────────────────────

interface MissionLaunchpadProps {
  activeModules: string[];
  setActiveModules: React.Dispatch<React.SetStateAction<string[]>>;
  activeAgents: Record<string, any>;
  selectedDepth: string;
  onDepthChange: (depth: string) => void;
  onLaunch: (taskId: string, module: string, depth: string) => void;
  onNavigateToMesh: () => void;
  loading: boolean;
  status: { type: string; text: string };
  connectedPlatforms: Record<string, ConnectionConfig>;
  platforms: Platform[];
}

// ─── Inline Styles ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 900,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '12px',
};

const cardBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  padding: '20px',
  cursor: 'pointer',
  transition: 'all 0.18s ease',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

interface SourceInputPanelProps {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
  value: string;
  onChange: (val: string) => void;
  titleValue?: string;
  onTitleChange?: (val: string) => void;
  uploadedFile?: File;
  onFileChange?: (file: File | null) => void;
  connectedPlatforms: Record<string, ConnectionConfig>;
}

const SourceInputPanel: React.FC<SourceInputPanelProps> = ({
  sourceId,
  sourceLabel,
  sourceColor,
  value,
  onChange,
  titleValue,
  onTitleChange,
  uploadedFile,
  onFileChange,
  connectedPlatforms,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [githubMode, setGithubMode] = useState<'single' | 'label'>('single');
  const fileRef = useRef<HTMLInputElement>(null);
  const isConnected = !!connectedPlatforms[sourceId]?.token;

  const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${sourceColor}44`,
    borderRadius: '8px',
    padding: '14px 16px',
    marginTop: '8px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: 'var(--text-hi)',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  if (sourceId === 'fileupload') {
    return (
      <div style={panelStyle}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f && onFileChange) onFileChange(f);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? sourceColor : 'rgba(255,255,255,0.15)'}`,
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? `${sourceColor}11` : 'transparent',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="ti ti-upload" style={{ fontSize: '1.6rem', color: sourceColor, display: 'block', marginBottom: '8px' }} />
          {uploadedFile ? (
            <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ {uploadedFile.name}</span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Drop file here or click to browse</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => { if (onFileChange) onFileChange(e.target.files?.[0] || null); }}
        />
      </div>
    );
  }

  if (sourceId === 'directpaste') {
    return (
      <div style={panelStyle}>
        <input
          type="text"
          placeholder="Document title (optional)"
          value={titleValue || ''}
          onChange={(e) => onTitleChange && onTitleChange(e.target.value)}
          style={{ ...inputStyle, marginBottom: '8px' }}
        />
        <textarea
          placeholder="Paste your PRD, user stories, or requirements here..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
    );
  }

  if (ALM_SOURCES.includes(sourceId)) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '20px',
            background: isConnected ? '#10b98122' : '#ef444422',
            color: isConnected ? '#10b981' : '#ef4444',
            fontWeight: 700,
          }}>
            {isConnected ? '● Connected' : '○ Not connected'}
          </span>
          {!isConnected && (
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Configure in Integrations tab</span>
          )}
          {(sourceId === 'github' || sourceId === 'gitlab') && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '4px' }}>
              <button
                onClick={(e) => { e.preventDefault(); setGithubMode('single'); }}
                style={{
                  padding: '2px 8px', fontSize: '0.7rem', borderRadius: '3px', border: 'none', cursor: 'pointer',
                  background: githubMode === 'single' ? '#6366f1' : 'transparent',
                  color: githubMode === 'single' ? '#fff' : '#94a3b8'
                }}>Single Issue</button>
              <button
                onClick={(e) => { e.preventDefault(); setGithubMode('label'); }}
                style={{
                  padding: '2px 8px', fontSize: '0.7rem', borderRadius: '3px', border: 'none', cursor: 'pointer',
                  background: githubMode === 'label' ? '#6366f1' : 'transparent',
                  color: githubMode === 'label' ? '#fff' : '#94a3b8'
                }}>Label Query</button>
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder={(sourceId === 'github' || sourceId === 'gitlab') ? (githubMode === 'single' ? 'owner/repo/issues/123 or full URL' : 'owner/repo/labels/feature') : `${sourceLabel} ticket / issue ID (e.g. PROJ-123)`}
          value={value}
          onChange={(e) => {
            let val = e.target.value;
            if (sourceId === 'github' && val.includes('github.com/')) {
              try {
                const url = new URL(val);
                val = url.pathname.replace(/^\/+/, ''); // e.g. "owner/repo/issues/123"
              } catch (e) {
                // fall back to raw value if not a valid URL
              }
            }
            onChange(val);
          }}
          style={inputStyle}
        />
      </div>
    );
  }

  // Default: URL input
  return (
    <div style={panelStyle}>
      <input
        type="url"
        placeholder={`${sourceLabel} URL`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const MissionLaunchpad: React.FC<MissionLaunchpadProps> = ({
  activeModules,
  setActiveModules,
  activeAgents,
  selectedDepth,
  onDepthChange,
  onLaunch,
  onNavigateToMesh,
  loading,
  status,
  connectedPlatforms,
  platforms,
}) => {
  const [selectedRole, setSelectedRole] = useState<string>('pm'); // default role — not user-facing
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [sourceInputs, setSourceInputs] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const [missionName, setMissionName] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const [parentTaskId, setParentTaskId] = useState<string>('');
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [meshProfile, setMeshProfile] = useState<any>(null);
  const [roleDefaults, setRoleDefaults] = useState<any>(null);
  const [launching, setLaunching] = useState<boolean>(false);
  const [launchError, setLaunchError] = useState<string>('');
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [roleHint, setRoleHint] = useState<string>('');
  const [chainOpen, setChainOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Classification State ---
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [classifyingInput, setClassifyingInput] = useState<boolean>(false);

  // --- Execution Context State ---
  const [executionMode, setExecutionMode] = useState<string>('analysis');
  const [targetType, setTargetType] = useState<string>('web');
  const [environment, setEnvironment] = useState<string>('dev');
  const [appUrl, setAppUrl] = useState<string>('');
  const [apiUrl, setApiUrl] = useState<string>('');
  const [openApiUrl, setOpenApiUrl] = useState<string>('');
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [dockerImage, setDockerImage] = useState<string>('');
  const [allowDast, setAllowDast] = useState<boolean>(false);
  const [allowLoadTest, setAllowLoadTest] = useState<boolean>(false);
  const [allowContainer, setAllowContainer] = useState<boolean>(false);
  const [overrideProd, setOverrideProd] = useState<boolean>(false);
  
  const [readiness, setReadiness] = useState<any>(null);

  const categories = ['ALM & DevOps', 'Strategic Repositories', 'Ad-Hoc & Conversational'];

  // ── Auto-enable all modules on mount — the full pipeline is the only properly implemented flow
  useEffect(() => {
    setActiveModules(['ingest', 'forge', 'certify', 'decide']);
    onDepthChange(onDepthChange.length ? selectedDepth || 'standard' : 'standard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch recent tasks on mount ──────────────────────────────────────────────
  useEffect(() => {
    apiClient.get(`/api/converge/recent-tasks`)
      .then((r) => r.json())
      .then((d) => setRecentTasks(Array.isArray(d) ? d : d.tasks || []))
      .catch(() => { });
  }, []);

  // ── Fetch mesh profile when modules/depth/role change ───────────────────────
  useEffect(() => {
    if (!selectedDepth || activeModules.length === 0) {
      setMeshProfile(null);
      return;
    }
    const moduleParam = activeModules.length === 4 ? 'all' : (activeModules[0] || 'all');
    const modulesParam = activeModules.length > 0 ? activeModules.join(',') : moduleParam;
    apiClient.get(`/api/converge/mesh-profile?module=${moduleParam}&modules=${encodeURIComponent(modulesParam)}&depth=${selectedDepth}&role=${selectedRole}`)
      .then((r) => r.json())
      .then((d) => setMeshProfile(d))
      .catch(() => { });
  }, [activeModules, selectedDepth, selectedRole]);

  // ── Fetch Tool Readiness ──────────────────────────────────────────────────────
  useEffect(() => {
    if (executionMode === 'analysis' || executionMode === 'planning') {
      setReadiness(null);
      // We still fetch readiness for planning mode, but we can do it universally
    }
    const timeoutId = setTimeout(() => {
      const payload = {
        execution_mode: executionMode,
        execution_context: {
          application_url: appUrl || null,
          api_base_url: apiUrl || null,
          openapi_url: openApiUrl || null,
          repository_url: repoUrl || null,
          docker_image: dockerImage || null,
          environment: environment || null,
          target_type: targetType || 'web',
          allow_active_scanning: allowDast,
          allow_load_testing: allowLoadTest,
          allow_container_execution: allowContainer,
          override_production_restrictions: overrideProd
        }
      };
      
      apiClient.post(`/api/tools/readiness`, payload)
        .then((d) => setReadiness(d))
        .catch(() => { });
    }, 500); // debounce
    
    return () => clearTimeout(timeoutId);
  }, [executionMode, appUrl, apiUrl, openApiUrl, repoUrl, dockerImage, environment, targetType, allowDast, allowLoadTest, allowContainer, overrideProd]);

  // ── Role selection → auto-configure modules ──────────────────────────────────
  const handleRoleSelect = useCallback(async (roleId: string) => {
    setSelectedRole(roleId);
    setRoleHint('');
    const role = ROLE_OPTIONS.find((r) => r.id === roleId);
    if (role && role.modules) {
        setActiveModules(role.modules);
        setRoleHint(`Role configured for ${role.label}: Automatically selected relevant modules.`);
    }
  }, [setActiveModules]);

  // ── Toggle source tile ───────────────────────────────────────────────────────
  const toggleSource = (sid: string) => {
    setActiveSources((prev) => {
      if (prev.includes(sid)) {
        if (expandedSource === sid) setExpandedSource(null);
        return prev.filter((s) => s !== sid);
      }
      setExpandedSource(sid);
      return [...prev, sid];
    });
  };

  // ── Estimated time calculation ───────────────────────────────────────────────
  const estimatedMins = activeModules.reduce((sum, mid) => {
    const mod = CONVERGE_MODULES.find((m) => m.id === mid);
    if (!mod) return sum;
    return sum + (mod.mins[selectedDepth as keyof typeof mod.mins] || 0);
  }, 0);

  // ── Module chain display ─────────────────────────────────────────────────────
  const moduleChain = CONVERGE_MODULES.filter((m) => activeModules.includes(m.id));
  const finalActiveAgents: string[] = meshProfile?.final_active_agents || [];
  const coreAgents: string[] = meshProfile?.core_agents || [];
  const supportingAgents: string[] = meshProfile?.supporting_agents || [];
  const dependencyAgents: string[] = meshProfile?.dependency_agents || [];
  const systemAgents: string[] = meshProfile?.system_agents || [];
  const localActiveAgentCount = Object.values(activeAgents || {}).filter((mode) => mode !== 'bypass').length;
  const isSelectionComplete = selectedDepth && activeModules.length > 0;
  const finalAgentCount = isSelectionComplete ? (meshProfile?.counts?.final || meshProfile?.final_active_agents?.length || finalActiveAgents.length || localActiveAgentCount) : 0;
  const headerAgentCount = isSelectionComplete ? (meshProfile ? (meshProfile.nodes_activated || localActiveAgentCount || '—') : localActiveAgentCount) : 0;
  const headerMins = isSelectionComplete ? (meshProfile ? estimatedMins : estimatedMins) : 0;

  // ── Context panel mode ───────────────────────────────────────────────────────
  const isIngestActive = activeModules.includes('ingest');
  const isForgeOnly = activeModules.length === 1 && activeModules[0] === 'forge';
  const isCertifyOnly = activeModules.length === 1 && activeModules[0] === 'certify';
  const isDecideOnly = activeModules.length === 1 && activeModules[0] === 'decide';
  const showSourceTiles = true;
  const allModulesEnabled = activeModules.length === CONVERGE_MODULES.length;
  const hasMissionInput = Boolean(
    context.trim() ||
    activeSources.some((sid) => (sourceInputs[sid] || '').trim()) ||
    activeSources.some((sid) => !!uploadedFiles[sid]) ||
    (parentTaskId && isDecideOnly)
  );
  const launchDisabled = loading || launching || activeModules.length === 0 || !hasMissionInput || !selectedDepth;

  // ── Shared styles ────────────────────────────────────────────────────────────
  const textareaStyle: React.CSSProperties = React.useMemo(() => ({
    width: '100%', background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
    padding: '14px 16px', color: 'var(--text-hi)', fontSize: '0.9rem',
    outline: 'none', resize: 'vertical', fontFamily: 'inherit',
    boxSizing: 'border-box', lineHeight: 1.6,
    transition: 'all 0.2s ease',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
  }), []);

  const selectStyle: React.CSSProperties = React.useMemo(() => ({
    width: '100%', background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    padding: '0px 12px', color: '#e2e8f0', fontSize: '0.9rem',
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', lineHeight: 1.6,
    transition: 'all 0.2s ease',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
    height: '38px', cursor: 'pointer'
  }), []);

  const inputStyle: React.CSSProperties = React.useMemo(() => ({
    width: '100%', background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    padding: '8px 12px', color: '#e2e8f0', fontSize: '0.9rem',
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', lineHeight: 1.6,
    transition: 'all 0.2s ease',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
    height: '38px'
  }), []);

  // ── Analyze Input handler ───────────────────────────────────────────────────
  const analyzeInput = async () => {
    setClassifyingInput(true);
    setClassificationResult(null);
    try {
      const sources = activeSources.map((sid) => {
        let ticket_id = '';
        if (sid === 'directpaste') {
          ticket_id = `${sourceInputs[sid + '_title'] || ''}\n${sourceInputs[sid] || context}`;
        } else if (sid === 'fileupload') {
          ticket_id = uploadedFiles[sid]?.name || '';
        } else {
          ticket_id = sourceInputs[sid] || '';
        }
        return {
          platform: sid,
          ticket_id,
          config: connectedPlatforms[sid] || { url: '', email: '', token: '' },
        };
      });

      if (sources.length === 0 && context.trim()) {
        sources.push({
          platform: 'directpaste',
          ticket_id: context.trim(),
          config: { url: '', email: '', token: '' },
        });
      }

      const res = await fetch(`${API_BASE}/api/tasks/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, context: context.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setClassificationResult(data);
      }
    } catch (err) {
      console.error('Classification failed:', err);
    } finally {
      setClassifyingInput(false);
    }
  };

  // ── Launch handler ───────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (launchDisabled) {
      setLaunchError('Complete all required selections (Role, Depth, Modules) and add requirement input before launching.');
      return;
    }
    setLaunchError('');
    setLaunching(true);
    try {
      const sources = activeSources.map((sid) => {
        let ticket_id = '';
        if (sid === 'directpaste') {
          ticket_id = `${sourceInputs[sid + '_title'] || ''}\n${sourceInputs[sid] || context}`;
        } else if (sid === 'fileupload') {
          ticket_id = uploadedFiles[sid]?.name || '';
        } else {
          ticket_id = sourceInputs[sid] || '';
        }
        return {
          platform: sid,
          ticket_id,
          config: connectedPlatforms[sid] || { url: '', email: '', token: '' },
        };
      });

      if (sources.length === 0 && context.trim()) {
        sources.push({
          platform: 'directpaste',
          ticket_id: context.trim(),
          config: { url: '', email: '', token: '' },
        });
      }

      const moduleParam = activeModules.length === 4 ? 'all' : (activeModules[0] || 'all');

      const body = {
        sources,
        context: context.trim(),
        module: moduleParam,
        modules: activeModules,
        depth: selectedDepth,
        role: selectedRole,
        active_agents: activeAgents,
        min_log_level: 3,
        parent_task_id: parentTaskId || undefined,
        mission_name: missionName.trim() || undefined,
        execution_mode: executionMode,
        execution_context: {
          application_url: appUrl || null,
          api_base_url: apiUrl || null,
          openapi_url: openApiUrl || null,
          repository_url: repoUrl || null,
          docker_image: dockerImage || null,
          environment: environment || null,
          target_type: targetType || 'web',
          allow_active_scanning: allowDast,
          allow_load_testing: allowLoadTest,
          allow_container_execution: allowContainer,
          override_production_restrictions: overrideProd
        }
      };

      // Signal to handleConvergeLaunch that this is a chain mission
      if (parentTaskId) {
        sessionStorage.setItem('sequor_pending_parent_task', parentTaskId);
      } else {
        sessionStorage.removeItem('sequor_pending_parent_task');
      }

      const res = await fetch(`${API_BASE}/api/converge/mission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.task_id) {
        onLaunch(data.task_id, moduleParam, selectedDepth);
      } else {
        setLaunchError(data.detail || 'Launch failed.');
      }
    } catch (err: any) {
      setLaunchError(err.message || 'Network error.');
    } finally {
      setLaunching(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '0 0 32px 0' }}>

      {/* ── HEADER ── */}
      <div style={{ position: 'relative', marginBottom: '22px', padding: '24px 28px', borderRadius: '16px', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 50%, rgba(16,185,129,0.12) 100%)', border: '1px solid rgba(99,102,241,0.35)' }}>
        {/* Ambient glow blobs */}
        <div style={{ position: 'absolute', top: '-30px', right: '60px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20px', right: '20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.5)', fontSize: '1rem' }}>🚀</div>
              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, letterSpacing: '-0.03em', background: 'linear-gradient(90deg, #e2e8f0 0%, #a5b4fc 50%, #34d399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Mission Launchpad
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Add your requirements below, pick a speed, and let the A.N.T. mesh do the rest.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '20px', padding: '5px 14px', fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a5b4fc', boxShadow: '0 0 6px #a5b4fc', display: 'inline-block' }} />
              {headerAgentCount || '57'} agents ready
            </span>
            <button onClick={onNavigateToMesh} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px 14px', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s ease' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8'; }}>
              <i className="ti-vector" /> View Mesh
            </button>
          </div>
        </div>
      </div>






      {/* ── PIPELINE OVERVIEW + DEPTH ── */}
      <div className="card launchpad-card" style={{ padding: '24px', marginBottom: '14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-mid)', marginBottom: '18px' }}>How it works — Full AI Pipeline</div>

        {/* Pipeline steps with glowing icons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', marginBottom: '24px', position: 'relative' }}>
          {[
            { icon: '📥', title: 'Ingest', desc: 'Reads requirements from any connected source', color: '#6366f1' },
            { icon: '⚙️', title: 'Synthesize', desc: 'Extracts structured specs & acceptance criteria', color: '#8b5cf6' },
            { icon: '🧪', title: 'Generate', desc: 'Builds test cases, scripts & automation code', color: '#10b981' },
            { icon: '✅', title: 'Certify', desc: 'Runs compliance checks & produces release report', color: '#f59e0b' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 6px', position: 'relative' }}>
              {i < 3 && (
                <div style={{ position: 'absolute', right: '-8px', top: '20px', zIndex: 2, display: 'flex', alignItems: 'center', gap: '2px' }}>
                  {[0,1,2].map(d => <div key={d} style={{ width: '4px', height: '4px', borderRadius: '50%', background: `rgba(139,92,246,${0.3 + d * 0.25})` }} />)}
                </div>
              )}
              <div style={{
                width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${step.color}22, ${step.color}10)`,
                border: `1px solid ${step.color}40`,
                fontSize: '1.4rem', marginBottom: '10px', flexShrink: 0,
                boxShadow: `0 4px 16px ${step.color}20`,
              }}>{step.icon}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-hi)', marginBottom: '4px' }}>{step.title}</div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-lo)', lineHeight: 1.45 }}>{step.desc}</div>
            </div>
          ))}
        </div>

        {/* Depth selector — compact inline toggle */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-mid)', marginBottom: '2px' }}>Scan depth</div>
            <div style={{ fontSize: '0.69rem', color: 'var(--text-lo)' }}>
              {selectedDepth === 'rapid' ? '⚡ ~5 min — fast scan, core agents' : selectedDepth === 'full' ? '🔬 ~37 min — full mesh, best for releases' : '⚖️ ~19 min — balanced speed & coverage'}
            </div>
          </div>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '3px', gap: '3px', flexShrink: 0 }}>
            {[
              { id: 'rapid',    label: '⚡ Quick',    color: '#f59e0b' },
              { id: 'standard', label: '⚖️ Standard', color: '#6366f1', rec: true },
              { id: 'full',     label: '🔬 Deep',     color: '#10b981' },
            ].map((d) => {
              const active = selectedDepth === d.id;
              return (
                <button key={d.id} onClick={() => onDepthChange(d.id)} style={{
                  padding: '6px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: active ? `linear-gradient(135deg, ${d.color}CC, ${d.color}99)` : 'transparent',
                  color: active ? '#fff' : '#64748b',
                  fontSize: '0.74rem', fontWeight: 700, transition: 'all 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  boxShadow: active ? `0 2px 10px ${d.color}40` : 'none',
                }}>
                  {d.label}
                  {d.rec && !active && <span style={{ fontSize: '0.5rem', color: '#818cf8', fontWeight: 800 }}>●</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── INPUT CONFIGURATION ── */}
      <div className="card launchpad-card" style={{ padding: '24px', marginBottom: '14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-mid)', marginBottom: '2px' }}>Requirements Input</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-lo)' }}>Select a source, then provide your content below.</div>
          </div>
          {activeSources.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '20px', padding: '4px 12px', fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' }} />
              {activeSources.length} source{activeSources.length > 1 ? 's' : ''} active
            </div>
          )}
        </div>

        {/* ── SOURCE ICON CARDS ── */}
        {(() => {
          const PLATFORM_META: Record<string, { color: string; label: string }> = {
            directpaste:  { color: '#6366f1', label: 'Context Paste' },
            fileupload:   { color: '#10b981', label: 'File Upload' },
            video:        { color: '#f59e0b', label: 'Video Insights' },
            mediaupload:  { color: '#ec4899', label: 'Media OCR' },
            networkpath:  { color: '#38bdf8', label: 'Network Path' },
            jira:         { color: '#0052CC', label: 'Jira' },
            ado:          { color: '#0078D4', label: 'Azure DevOps' },
            googledrive:  { color: '#34A853', label: 'Google Drive' },
            onedrive:     { color: '#0078D4', label: 'OneDrive' },
            sharepoint:   { color: '#038387', label: 'SharePoint' },
          };

          const adHoc = platforms.filter(p => p.category === 'Ad-Hoc & Conversational');
          const integrations = platforms.filter(p => ['jira','ado','googledrive','onedrive','sharepoint'].includes(p.id));

          const renderCard = (p: any) => {
            const isActive = activeSources.includes(p.id);
            const isReady = !!connectedPlatforms[p.id]?.token || p.category === 'Ad-Hoc & Conversational' || p.requires_credentials === false;
            const meta = PLATFORM_META[p.id] || { color: '#6366f1', label: p.name };
            const { color } = meta;
            return (
              <button key={p.id}
                onClick={() => isReady ? toggleSource(p.id) : undefined}
                title={!isReady ? `Connect ${p.name} in Settings to enable` : p.name}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '12px 6px', borderRadius: '12px', border: 'none',
                  cursor: isReady ? 'pointer' : 'default',
                  background: isActive ? `${color}25` : 'rgba(255,255,255,0.08)',
                  outline: `2px solid ${isActive ? color + '55' : 'rgba(255,255,255,0.12)'}`,
                  transition: 'all 0.18s ease', position: 'relative',
                  boxShadow: isActive ? `0 4px 20px ${color}30` : 'none',
                  transform: isActive ? 'translateY(-2px)' : 'none',
                  opacity: isReady ? 1 : 0.6,
                }}
                onMouseOver={e => { if (isReady && !isActive) { e.currentTarget.style.outline = `2px solid rgba(255,255,255,0.2)`; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
                onMouseOut={e => { if (isReady && !isActive) { e.currentTarget.style.outline = `2px solid rgba(255,255,255,0.12)`; e.currentTarget.style.transform = 'translateY(0)'; }}}
              >
                {!isReady && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', width: '14px', height: '14px', borderRadius: '50%', background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti-lock" style={{ fontSize: '0.52rem', color: 'var(--text-lo)' }} />
                  </div>
                )}
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? `${color}35` : 'rgba(255,255,255,0.1)', border: `1px solid ${isActive ? color + '60' : 'rgba(255,255,255,0.15)'}`, fontSize: '0.95rem', color: isActive ? color : 'var(--text-hi)', transition: 'all 0.18s ease' }}>
                  <i className={`ti ${p.icon}`} />
                </div>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: isActive ? color : 'var(--text-mid)', textAlign: 'center', lineHeight: 1.2 }}>{p.name}</span>
                {isActive && <div style={{ width: '14px', height: '2px', borderRadius: '1px', background: color, boxShadow: `0 0 6px ${color}` }} />}
              </button>
            );
          };

          return (
            <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Ad-hoc row */}
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '6px' }}>Direct Input</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '7px' }}>
                  {adHoc.map(renderCard)}
                </div>
              </div>
              {/* Integrations row */}
              {integrations.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Integrations
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-mid)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>— Connect in Settings to unlock</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '7px' }}>
                    {integrations.map(renderCard)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Active source input panels */}
        {activeSources.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            {activeSources.map((sid) => {
              const p = platforms.find((plat) => plat.id === sid);
              if (!p) return null;
              const sc: Record<string, string> = { directpaste: '#6366f1', fileupload: '#10b981', video: '#f59e0b', mediaupload: '#ec4899', networkpath: '#38bdf8' };
              const color = sc[sid] || '#6366f1';
              return (
                <div key={sid} style={{ marginBottom: '10px', padding: '14px 16px', background: `${color}08`, border: `1px solid ${color}25`, borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className={`ti ${p.icon}`} /> {p.name}
                  </div>
                  <SourceInputPanel
                    sourceId={sid} sourceLabel={p.name} sourceColor={color}
                    value={sourceInputs[sid] || ''}
                    onChange={(val) => setSourceInputs((prev) => ({ ...prev, [sid]: val }))}
                    titleValue={sourceInputs[sid + '_title'] || ''}
                    onTitleChange={(val) => setSourceInputs((prev) => ({ ...prev, [sid + '_title']: val }))}
                    uploadedFile={uploadedFiles[sid]}
                    onFileChange={(file) => setUploadedFiles((prev) => file ? { ...prev, [sid]: file } : (() => { const n = { ...prev }; delete n[sid]; return n; })())}
                    connectedPlatforms={connectedPlatforms}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Context / notes textarea */}
        {activeSources.length > 0 && (
          <div style={{ position: 'relative' }}>
            <textarea
              placeholder="Additional context, notes, or extra background (optional)..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              style={{ ...textareaStyle, paddingRight: '52px' }}
            />
            {context.trim() && (
              <button onClick={() => setContext('')} style={{ position: 'absolute', top: '10px', right: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#cbd5e1', cursor: 'pointer', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700 }}>Clear</button>
            )}
          </div>
        )}
      </div>

      {/* ── INPUT CLASSIFICATION ── */}
      {hasMissionInput && !isDecideOnly && !isCertifyOnly && (
        <div style={{ marginBottom: '14px' }}>
          {!classificationResult ? (
            <button onClick={analyzeInput} disabled={classifyingInput}
              style={{
                width: '100%', padding: '10px 16px', borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8', fontSize: '0.85rem', fontWeight: 700, cursor: classifyingInput ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s ease'
              }}>
              {classifyingInput ? (
                <><i className="ti-reload" style={{ animation: 'spin 1s linear infinite' }} /> Analyzing Input...</>
              ) : (
                <><i className="ti-search" /> Pre-flight Input Classification</>
              )}
            </button>
          ) : (
            <div style={{
              padding: '16px', borderRadius: '8px',
              background: classificationResult.input_type === 'full_prd' || classificationResult.input_type === 'feature_request' 
                ? 'rgba(16, 185, 129, 0.1)' 
                : classificationResult.input_type === 'bug_report'
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${
                classificationResult.input_type === 'full_prd' || classificationResult.input_type === 'feature_request'
                ? 'rgba(16, 185, 129, 0.3)'
                : classificationResult.input_type === 'bug_report'
                ? 'rgba(245, 158, 11, 0.4)'
                : 'rgba(239, 68, 68, 0.4)'
              }`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={`ti ${
                    classificationResult.input_type === 'full_prd' || classificationResult.input_type === 'feature_request'
                    ? 'ti-check text-green-400'
                    : classificationResult.input_type === 'bug_report'
                    ? 'ti-alert-triangle text-amber-400'
                    : 'ti-alert-circle text-red-400'
                  }`} />
                  Input Classification: {classificationResult.input_type.replace('_', ' ').toUpperCase()}
                </div>
                <button onClick={analyzeInput} disabled={classifyingInput} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}>
                  <i className="ti-reload" /> Re-analyze
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.5 }}>
                {classificationResult.reasoning}
              </div>
              
              {classificationResult.input_type === 'bug_report' && (
                <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem', color: '#fbbf24' }}>
                  <strong>Note:</strong> Full requirements-extraction mode will be bypassed. The mesh will automatically extract bug reproduction context instead.
                </div>
              )}
              {classificationResult.input_type === 'fragment_insufficient' && (
                <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem', color: '#f87171' }}>
                  <strong>Warning:</strong> The input provided is too thin to extract actionable intelligence. Consider adding more context above.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LAUNCH BUTTON ── */}
      {launchError && (
        <div style={{ marginBottom: '12px', padding: '10px 16px', background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', fontSize: '0.82rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti-alert-circle" style={{ flexShrink: 0 }} />
          {launchError}
          <button onClick={() => setLaunchError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}><i className="ti-x" /></button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {!launchDisabled && (
          <div style={{ position: 'absolute', inset: '-2px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #10b981)', opacity: 0.5, filter: 'blur(8px)', animation: 'pulseGlow 2s ease-in-out infinite', pointerEvents: 'none' }} />
        )}
        <button onClick={handleLaunch} disabled={launchDisabled}
          style={{
            position: 'relative', width: '100%', padding: '16px 28px', borderRadius: '12px', border: 'none',
            background: launchDisabled ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #10b981 100%)',
            color: launchDisabled ? '#475569' : '#fff',
            fontSize: '1rem', fontWeight: 800, letterSpacing: '0.04em',
            cursor: launchDisabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            transition: 'all 0.2s ease',
            boxShadow: launchDisabled ? 'none' : '0 6px 28px rgba(99,102,241,0.45)',
            overflow: 'hidden',
          }}
          onMouseOver={e => { if (!launchDisabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 36px rgba(99,102,241,0.55)'; }}}
          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = launchDisabled ? 'none' : '0 6px 28px rgba(99,102,241,0.45)'; }}
        >
          {!launchDisabled && <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'shimmer 2.5s ease-in-out infinite', pointerEvents: 'none' }} />}
          {launching ? (
            <><i className="ti-reload" style={{ animation: 'spin 1s linear infinite' }} />Initializing Mesh…</>
          ) : loading ? (
            <><i className="ti-reload" style={{ animation: 'spin 1s linear infinite' }} />Processing…</>
          ) : !hasMissionInput ? (
            <><i className="ti-pencil-alt" style={{ opacity: 0.6 }} /><span style={{ opacity: 0.6 }}>Add your requirements to continue</span></>
          ) : (
            <>
              <span style={{ fontSize: '1.2rem' }}>🚀</span>
              Launch CONVERGE Mission
              <span style={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85, background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '3px 10px', letterSpacing: '0.02em' }}>
                {selectedDepth === 'rapid' ? '~5m' : selectedDepth === 'full' ? '~37m' : '~19m'} · {(headerAgentCount || 57)} agents
              </span>
            </>
          )}
        </button>
      </div>

      {hasMissionInput && !launching && !loading && (
        <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '0.67rem', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ color: '#10b981' }}>✓</span>
          Full pipeline · {selectedDepth === 'rapid' ? 'Quick' : selectedDepth === 'full' ? 'Deep' : 'Standard'} depth · Ready to launch
        </div>
      )}

      {/* ── STATUS ── */}
      {status.text && (
        <div style={{
          marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
          fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px',
          background: status.type === 'success' ? 'rgba(16,185,129,0.09)'
            : status.type === 'error' ? 'rgba(239,68,68,0.09)'
              : status.type === 'warn' ? 'rgba(245,158,11,0.09)'
                : 'rgba(99,102,241,0.09)',
          border: `1px solid ${status.type === 'success' ? 'rgba(16,185,129,0.25)'
              : status.type === 'error' ? 'rgba(239,68,68,0.25)'
                : status.type === 'warn' ? 'rgba(245,158,11,0.25)'
                  : 'rgba(99,102,241,0.25)'
            }`,
          color: status.type === 'success' ? '#10b981'
            : status.type === 'error' ? '#f87171'
              : status.type === 'warn' ? '#fbbf24'
                : '#a5b4fc',
        }}>
          <i className={`ti ${status.type === 'success' ? 'ti-check' : status.type === 'error' ? 'ti-alert-circle' : status.type === 'warn' ? 'ti-alert-triangle' : 'ti-info-circle'}`} />
          {status.text}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
        @keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }
      `}</style>
    </div>
  );
};

export default MissionLaunchpad;
