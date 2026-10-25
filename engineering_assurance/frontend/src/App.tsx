import React, { useState, useEffect, useRef } from 'react';
import './App.css';
// SeQuor Architecture v3.1.2 - Blueprint Factory Redesign Applied
import { downloadFile, filenameFromUrl } from './utils/downloadFile';

// --- STARTUP: STALE SESSION FLUSH ---
const SESSION_VERSION = 'v4.0.0-converge';
if (localStorage.getItem('sequor_session_version') !== SESSION_VERSION) {
  ['sequor_factory_step', 'sequor_current_task_id', 'sequor_active_menu'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem('sequor_session_version', SESSION_VERSION);
}

const safeParseJSON = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('[App] Ignoring corrupted persisted state.', error);
    return fallback;
  }
};

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[App] Unable to persist ${key}.`, error);
  }
};

// --- TYPES ---
import {
  Platform,
  ConnectionConfig,
  FetchSource,
  TestPlanPayload,
  Status
} from './types';

import OrchestrationHub from './components/OrchestrationHub';
import TestDeliveryDashboard from './components/TestDeliveryDashboard';
import SettingsView from './components/SettingsView';
import KnowledgeCenter from './components/KnowledgeCenter';
import ConfigModal from './components/ConfigModal';
import AgentRegistry from './components/AgentRegistry';
import ConfigSettings from './components/ConfigSettings';
import AgentWorkspace from './components/AgentWorkspace';
import { ExecutionLog } from './components/ExecutionLog';
import DebugWindow from './components/DebugWindow';
import MissionLaunchpad from './components/MissionLaunchpad';
import HistoryTrends from './components/HistoryTrends';
import MissionHistory from './components/MissionHistory';
import ReleaseCommandCenter from './components/ReleaseCommandCenter';
import ViewportErrorBoundary from './components/ViewportErrorBoundary';

import {
  CREW_MAP,
  CREW_KEYS,
  BREADCRUMB_MAP,
  buildEffectiveAgentMap,
  deriveMeshOverrides,
  getDepthPresetKeys,
  normalizeAgentKey,
  resolveAgentMode,
} from './constants/agentMesh';
import { API_BASE } from './config';
import { apiClient } from './utils/apiClient';

import { AuthProvider, useAuth } from './context/AuthContext';
import AuthLoading from './components/AuthLoading';
import AuthGateway from './components/AuthGateway';
import AuthErrorBoundary from './components/AuthErrorBoundary';
import MeshObservatory from './components/MeshObservatory';
import RunHistory from './components/RunHistory';

// --- THEME DROPDOWN COMPONENT ---
// Extracted from IIFE in JSX to comply with React Rules of Hooks.
interface ThemeDropdownProps {
  theme: 'dark' | 'light' | 'system';
  resolvedTheme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light' | 'system') => void;
}
const ThemeDropdown: React.FC<ThemeDropdownProps> = ({ theme, resolvedTheme, setTheme }) => {
  const [themeOpen, setThemeOpen] = useState(false);
  const opts: { id: 'dark' | 'light' | 'system'; label: string; icon: string }[] = [
    { id: 'dark', label: 'Dark', icon: 'ti-night' },
    { id: 'light', label: 'Light', icon: 'ti-shine' },
    { id: 'system', label: 'System', icon: 'ti-desktop' },
  ];
  const cur = opts.find(o => o.id === theme) || opts[0];
  const isLight = resolvedTheme === 'light';
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setThemeOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
          background: isLight ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isLight ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.12)'}`,
          color: isLight ? 'var(--accent)' : 'var(--text-mid)',
          transition: 'all 0.2s ease', userSelect: 'none',
        }}
      >
        <i className={cur.icon} style={{ fontSize: '0.85rem' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {cur.label}
        </span>
        <i className={`ti-angle-${themeOpen ? 'up' : 'down'}`} style={{ fontSize: '0.6rem', opacity: 0.6 }} />
      </button>
      {themeOpen && (
        <div
          onMouseLeave={() => setThemeOpen(false)}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: isLight ? '#ffffff' : '#1e293b',
            border: `1px solid ${isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '10px', padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000, minWidth: '130px',
          }}
        >
          {opts.map(opt => (
            <button key={opt.id}
              onClick={() => { setTheme(opt.id); setThemeOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '8px 12px', borderRadius: '7px',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: theme === opt.id
                  ? (isLight ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)')
                  : 'transparent',
                color: theme === opt.id ? 'var(--accent)' : 'var(--text-mid)',
                fontSize: '0.8rem', fontWeight: theme === opt.id ? 700 : 500,
                transition: 'all 0.15s ease',
              }}
            >
              <i className={opt.icon} style={{ fontSize: '0.9rem', width: '16px' }} />
              {opt.label}
              {theme === opt.id && <i className="ti-check" style={{ marginLeft: 'auto', fontSize: '0.75rem' }} />}
            </button>
          ))}
          <div style={{
            margin: '4px 8px 2px', paddingTop: '6px',
            borderTop: `1px solid ${isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'}`,
            fontSize: '0.62rem', color: 'var(--text-lo)',
          }}>
            {theme === 'system' ? `System: ${resolvedTheme}` : 'Active theme'}
          </div>
        </div>
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, logout } = useAuth();
  // Navigation State
  const [activeMenu, setActiveMenu] = useState<string>(() => sessionStorage.getItem('sequor_active_menu') || 'mission_launchpad');
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [meshTopology, setMeshTopology] = useState<any>(null);
  // ISS-013 FIX: reqStep must be restored from localStorage on refresh.
  // Previously hardcoded to 1, which caused Requirement Ops to reset to
  // platform selection (step 1) on every page refresh, losing the user's position.
  const [reqStep, setReqStep] = useState<number>(() => parseInt(sessionStorage.getItem('sequor_req_step') || '1'));
  const [factoryStep, setFactoryStep] = useState<number>(() => parseInt(sessionStorage.getItem('sequor_factory_step') || '0'));

  // History State
  const [history, setHistory] = useState<any[]>([]);

  // Sidebar Grouping State
  const [openPillars, setOpenPillars] = useState<string[]>(['cc']);
  const togglePillar = (id: string) => {
    setOpenPillars(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Requirement Ingestion State
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('blast_platforms') || '[]');
    } catch { return []; }
  });
  // Generation Context
  const [productName, setProductName] = useState<string>('Project VVNT-Omega');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, ConnectionConfig>>({});

  // Agent Result State
  const [status, setStatus] = useState<Status>({ type: '', text: '' });
  const [refinedUnifiedContent, setRefinedUnifiedContent] = useState<string>(() => sessionStorage.getItem('sequor_refined_context') || '');

  // ISS-015 FIX: Strict State Hygiene
  // When sources change, clear the previous interpretation and context to prevent stale data bleed
  useEffect(() => {
    if (selectedPlatforms.length > 0) {
      setRefinedUnifiedContent('');
    }
  }, [selectedPlatforms]);

  const [generatedMarkdown, setGeneratedMarkdown] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [planPayload, setPlanPayload] = useState<TestPlanPayload | null>(null);
  const [fullAgentState, setFullAgentState] = useState<any>(null);
  const [reasoningLogs, setReasoningLogs] = useState<any[]>([]);
  const [liveTopology, setLiveTopology] = useState<any>(null);
  const [phase1Topology, setPhase1Topology] = useState<any>(null);
  const [phase1Logs, setPhase1Logs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [logLevel, setLogLevel] = useState<number>(() => {
    return parseInt(localStorage.getItem('vvnt_log_level') || '3');
  });

  // Polling interval ref — stored outside React render cycle so it can always be cleared
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showExecutionLog, setShowExecutionLog] = useState<boolean>(false);
  const [showDebugWindow, setShowDebugWindow] = useState<boolean>(false);
  const [showRunHistory, setShowRunHistory] = useState<boolean>(false);
  const [demoMode, setDemoMode] = useState<boolean>(() => localStorage.getItem('sequor_demo_mode') === 'true');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() =>
    (localStorage.getItem('converge_theme') as 'dark' | 'light' | 'system') || 'dark'
  );
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() =>
    window.matchMedia('(prefers-color-scheme: light)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Resolved theme — what's actually applied to the DOM
  const resolvedTheme: 'dark' | 'light' = theme === 'system'
    ? (systemPrefersLight ? 'light' : 'dark')
    : theme;

  const [historyLogTaskId, setHistoryLogTaskId] = useState<string | null>(null);

  // --- PHASE 4.1: PERSONA STATE ---
  const [persona, setPersona] = useState<'engineer' | 'executive'>(() =>
    (localStorage.getItem('converge_persona') as 'engineer' | 'executive') || 'engineer'
  );

  // --- PHASE 2.1: CONFLICT STUDIO STATE ---
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(() => sessionStorage.getItem('sequor_current_task_id'));
  const [convergeTaskId, setConvergeTaskId] = useState<string | null>(null);
  const [convergeModule, setConvergeModule] = useState<string>('all');
  const [convergeDepth, setConvergeDepth] = useState<string>('standard');
  const [configPlatformId, setConfigPlatformId] = useState<string>('');
  const [tempConfig, setTempConfig] = useState<ConnectionConfig>({ url: '', email: '', token: '' });
  const [connectionStatus, setConnectionStatus] = useState<{ type: 'idle' | 'testing' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const [platformConnStatus, setPlatformConnStatus] = useState<Record<string, { type: 'idle' | 'testing' | 'success' | 'error', message: string }>>({});
  const [sidebarFanOut, setSidebarFanOut] = useState<boolean>(() => localStorage.getItem('sequor_sidebar_fanout') === 'true');
  const [useNodeCache, setUseNodeCache] = useState<boolean>(() => localStorage.getItem('sequor_use_node_cache') !== 'false');

  // Master Session Persistence Effect
  useEffect(() => {
    sessionStorage.setItem('sequor_active_menu', activeMenu);
    sessionStorage.setItem('sequor_factory_step', factoryStep.toString());
    sessionStorage.setItem('sequor_refined_context', refinedUnifiedContent);
    if (currentTaskId) sessionStorage.setItem('sequor_current_task_id', currentTaskId);
    else sessionStorage.removeItem('sequor_current_task_id');
    localStorage.setItem('vvnt_log_level', logLevel.toString());
    localStorage.setItem('sequor_demo_mode', demoMode.toString());
    localStorage.setItem('converge_theme', theme);
    localStorage.setItem('converge_persona', persona);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('sequor_sidebar_fanout', sidebarFanOut.toString());
    localStorage.setItem('sequor_use_node_cache', useNodeCache.toString());
  }, [activeMenu, factoryStep, refinedUnifiedContent, currentTaskId, logLevel, demoMode, sidebarFanOut, useNodeCache, theme, persona, resolvedTheme]);

  // Intelligence Ops Backend Sync
  useEffect(() => {
    const syncIntelligenceOps = async () => {
      try {
        await apiClient.post(`/llm/intelligence-ops`, { use_node_cache: useNodeCache });
      } catch (e) {
        console.warn('[CONFIG] Intelligence Ops sync failed:', e);
      }
    };
    syncIntelligenceOps();
  }, [useNodeCache]);

  useEffect(() => {
    let cancelled = false;
    const hydrateVaultStatus = async () => {
      try {
        const pools = await apiClient.get(`/llm/vault`);
        const hasActiveIdentity = Array.isArray(pools) && pools.some((pool: any) =>
          pool?.identities?.some((identity: any) => identity?.status === 'active' && Boolean(String(identity?.model ?? '').trim()))
        );
        if (!cancelled) setStandaloneEnabled(Boolean(hasActiveIdentity));
      } catch {
        if (!cancelled) setStandaloneEnabled(false);
      }
    };
    hydrateVaultStatus();
    return () => { cancelled = true; };
  }, []);

  // Telemetry & Health State
  const [serverOnline, setServerOnline] = useState<boolean>(false);
  const [healthMeta, setHealthMeta] = useState<any>(null);
  const [latency, setLatency] = useState<number>(0);

  // Knowledge State
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [standaloneEnabled, setStandaloneEnabled] = useState<boolean>(false);

  const [meshDepth, setMeshDepth] = useState<string>('');

  // Agent Activation Mesh State
  const [meshOverrides, setMeshOverrides] = useState<Record<string, 'auto' | 'manual' | 'bypass'>>(() => {
    try {
      const savedOverrides = sessionStorage.getItem('sequor_mesh_overrides');
      if (savedOverrides) {
        return deriveMeshOverrides(
          sessionStorage.getItem('sequor_mesh_depth') || 'standard',
          JSON.parse(savedOverrides)
        );
      }

      const savedDepth = sessionStorage.getItem('sequor_mesh_depth') || 'standard';
      const savedActive = sessionStorage.getItem('sequor_active_agents');
      if (!savedActive) return {};
      return deriveMeshOverrides(savedDepth, JSON.parse(savedActive));
    } catch { return {}; }
  });

  const [activeAgents, setActiveAgents] = useState<Record<string, 'auto' | 'manual' | 'bypass'>>(() =>
    buildEffectiveAgentMap(
      sessionStorage.getItem('sequor_mesh_depth') || 'standard',
      (() => {
        try {
          const savedOverrides = sessionStorage.getItem('sequor_mesh_overrides');
          if (savedOverrides) {
            return deriveMeshOverrides(
              sessionStorage.getItem('sequor_mesh_depth') || 'standard',
              JSON.parse(savedOverrides)
            );
          }
          const savedActive = sessionStorage.getItem('sequor_active_agents');
          if (!savedActive) return {};
          return deriveMeshOverrides(sessionStorage.getItem('sequor_mesh_depth') || 'standard', JSON.parse(savedActive));
        } catch {
          return {};
        }
      })()
    )
  );

  useEffect(() => {
    const nextActiveAgents = buildEffectiveAgentMap(meshDepth, meshOverrides);
    setActiveAgents(nextActiveAgents);
    sessionStorage.setItem('sequor_mesh_depth', meshDepth);
    sessionStorage.setItem('sequor_mesh_overrides', JSON.stringify(meshOverrides));
    sessionStorage.setItem('sequor_active_agents', JSON.stringify(nextActiveAgents));
  }, [meshDepth, meshOverrides]);

  const setAgentMode = (id: string, mode: 'auto' | 'manual' | 'bypass') => {
    const canonicalId = normalizeAgentKey(id);
    setMeshOverrides((prev) => ({
      ...prev,
      [canonicalId]: mode === 'auto' && !getDepthPresetKeys(meshDepth).includes(canonicalId) ? 'manual' : mode,
    }));
  };

  const handleDepthChange = (depth: string) => {
    setMeshOverrides({});
    setMeshDepth(depth);
  };

  // --- STANDALONE AGENT TELEMETRY (Manual Mode) ---
  const [loadingNodes, setLoadingNodes] = useState<Record<string, boolean>>({});
  const [manualTelemetry, setManualTelemetry] = useState<Record<string, any>>({});

  const handleStandaloneAgentInvoke = async (
    nodeKey: string,
    action?: string,
    contextOverride?: string
  ) => {
    const canonicalKey = normalizeAgentKey(nodeKey);
    if (resolveAgentMode(meshDepth, activeAgents, canonicalKey) === 'bypass') return;
    setLoadingNodes(prev => ({ ...prev, [nodeKey]: true }));
    setStatus({ type: 'info', text: `Consulting expert node: ${nodeKey}...` });

    try {
      const payload = {
        agent_key: canonicalKey,
        action: action || 'Perform a deep specialist assessment.',
        context_override: contextOverride?.trim() || undefined
      };
      const data = await apiClient.post(`/agents/invoke`, payload);
      if (true) { // Since apiClient throws on non-200, execution reaching here means success
        setManualTelemetry(prev => ({ ...prev, [canonicalKey]: data.data }));
        setStatus({ type: 'success', text: `Expert insights received from ${canonicalKey}.` });
      } else {
        setManualTelemetry(prev => ({ ...prev, [canonicalKey]: { error: data.detail || 'Gateway error.' } }));
      }
    } catch (e: any) {
      setManualTelemetry(prev => ({ ...prev, [canonicalKey]: { error: `Network failure: ${e.message}` } }));
    } finally {
      setLoadingNodes(prev => ({ ...prev, [canonicalKey]: false }));
    }
  };

  const handleBatchAgentUpdate = (ids: string[], mode: 'auto' | 'manual' | 'bypass') => {
    setMeshOverrides((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        const canonicalId = normalizeAgentKey(id);
        next[canonicalId] = mode === 'auto' && !getDepthPresetKeys(meshDepth).includes(canonicalId) ? 'manual' : mode;
      });
      return next;
    });
  };

  const getStatusTagLabel = (key: string) => {
    const mode = resolveAgentMode(meshDepth, activeAgents, key);
    return (
      <span className={`cs-tag ${mode !== 'bypass' ? 'active' : 'standby'}`}>
        {mode === 'auto' ? 'Auto' : mode === 'manual' ? 'Manual' : 'Bypass'}
      </span>
    );
  };

  const isCrewBypassed = (crewId: string): boolean => {
    // If we have a running task, use the backend topology
    if (taskId && meshTopology?.nodes) {
      const crewNodes = meshTopology.nodes.filter((n: any) => {
        const nodeKey = n.key.toLowerCase();
        const cleanCrewId = crewId.replace('crew_', '').toLowerCase();
        return nodeKey.includes(cleanCrewId) || cleanCrewId.includes(nodeKey);
      });
      if (crewNodes.length > 0 && crewNodes.every((n: any) => n.status === 'bypassed')) return true;
    }

    // If no task is running, or node check is inconclusive, check against activeModules from Launchpad
    const moduleMap: Record<string, string> = {
      m1: 'ingest', m2: 'forge', m3: 'certify', m4: 'decide'
    };

    for (const [pillarId, modKey] of Object.entries(moduleMap)) {
      const PILLAR_MAP: Record<string, string[]> = {
        m1: ['crew_strategic_command', 'crew_logic_compliance', 'crew_knowledge_engine', 'requirement_ops', 'knowledge'],
        m2: ['crew_strategy_impact', 'crew_scenario_data', 'crew_api_virtualization', 'crew_code_generators', 'crew_interface_mobile', 'test_case_factory', 'crew_orchestration_matrix'],
        m3: ['crew_performance_chaos', 'crew_security_aspm', 'crew_backend_architecture', 'crew_cloud_environments', 'crew_sre_reliability', 'crew_self_healing', 'crew_ux_monitoring'],
        m4: ['crew_economics_risk', 'crew_incident_command', 'release_command', 'history_trends']
      };

      if (PILLAR_MAP[pillarId].includes(crewId)) {
        return !activeModules.includes(modKey);
      }
    }

    return false;
  };

  // --- RICH SOURCE DEFINITIONS ---
  const platforms: Platform[] = [
    { id: 'jira', name: 'Jira Software', icon: 'ti-agenda', category: 'ALM & DevOps', desc: 'Sync tickets via Cloud/Server REST API.', features: ['Direct Sync', 'ADF Support'], implemented: true, requires_credentials: true },
    { id: 'ado', name: 'Azure DevOps', icon: 'ti-microsoft', category: 'ALM & DevOps', desc: 'Secure PAT harvesting from ADO boards.', features: ['Board Sync', 'HTML Extractor'], implemented: true, requires_credentials: true },
    { id: 'github', name: 'GitHub Issues', icon: 'ti-github', category: 'ALM & DevOps', desc: 'Lightweight requirement tracking.', features: ['Issue Labels'], implemented: true, requires_credentials: true },
    { id: 'gitlab', name: 'GitLab', icon: 'ti-layers-alt', category: 'ALM & DevOps', desc: 'Integrated CI/CD requirement flow.', features: ['Snippet Sync'], implemented: true, requires_credentials: true },
    { id: 'bitbucket', name: 'Bitbucket', icon: 'ti-split-v', category: 'ALM & DevOps', desc: 'Atlassian SCM requirement extraction.', features: ['PR Ingestion'], implemented: true, requires_credentials: true },
    { id: 'xray', name: 'X-Ray Management', icon: 'ti-view-grid', category: 'ALM & DevOps', desc: 'Linking test cases to requirements.', features: ['Test Sets', 'Gherkin'], implemented: true, requires_credentials: true },
    { id: 'zephyr', name: 'Zephyr Squad', icon: 'ti-layout-grid2', category: 'ALM & DevOps', desc: 'Native Jira test management integration.', features: ['Cycle Extraction'], implemented: true, requires_credentials: true },
    { id: 'testrail', name: 'TestRail', icon: 'ti-list-ol', category: 'ALM & DevOps', desc: 'Integration with TestRail test runs.', features: ['Report Sync'], implemented: true, requires_credentials: true },
    { id: 'swagger', name: 'Swagger / OpenAPI', icon: 'ti-layout-list-thumb', category: 'ALM & DevOps', desc: 'Technical requirements from API specs.', features: ['Schema Extraction'], implemented: true, requires_credentials: false },

    { id: 'sharepoint', name: 'SharePoint', icon: 'ti-folder', category: 'Strategic Repositories', desc: 'Ingest logic from corporate shares.', features: ['Docx/PDF'], implemented: true, requires_credentials: true },
    { id: 'confluence', name: 'Confluence Wiki', icon: 'ti-paragraph', category: 'Strategic Repositories', desc: 'Extract requirements from enterprise spaces.', features: ['Page Sync', 'Macros'], implemented: true, requires_credentials: true },
    { id: 'notion', name: 'Notion Workspace', icon: 'ti-book', category: 'Strategic Repositories', desc: 'Modern living specs and roadmaps.', features: ['DB Sync', 'Blocks'], implemented: true, requires_credentials: true },
    { id: 'googledrive', name: 'Google Drive', icon: 'ti-google', category: 'Strategic Repositories', desc: 'G-Suite requirement doc extraction.', features: ['Doc Ingestion'], implemented: true, requires_credentials: true },
    { id: 'onedrive', name: 'OneDrive', icon: 'ti-cloud', category: 'Strategic Repositories', desc: 'Personal cloud document synchronization.', features: ['Live Sync'], implemented: true, requires_credentials: true },
    { id: 'servicenow', name: 'ServiceNow KB', icon: 'ti-headphone-alt', category: 'Strategic Repositories', desc: 'Sync requirements from service catalogs.', features: ['KB Extraction'], implemented: true, requires_credentials: true },

    { id: 'directpaste', name: 'Context Paste', icon: 'ti-clipboard', category: 'Ad-Hoc & Conversational', desc: 'Manual paste of requirements.', features: ['Markdown'], implemented: true, requires_credentials: false },
    { id: 'fileupload', name: 'File Stream', icon: 'ti-cloud-up', category: 'Ad-Hoc & Conversational', desc: 'Process .docx, .pdf local files.', features: ['Vector RAG'], implemented: true, requires_credentials: false },
    { id: 'video', name: 'Video Insights', icon: 'ti-video-clapper', category: 'Ad-Hoc & Conversational', desc: 'Extract requirements from screen recordings and demos.', features: ['Audio Transcription', 'Frame Analysis'], implemented: true, requires_credentials: false },
    { id: 'mediaupload', name: 'Media OCR', icon: 'ti-camera', category: 'Ad-Hoc & Conversational', desc: 'Extract requirements from images/UI.', features: ['OCR Pipeline'], implemented: true, requires_credentials: false },
    { id: 'networkpath', name: 'Network Path', icon: 'ti-share', category: 'Ad-Hoc & Conversational', desc: 'SMB/CIFS corporate file shares.', features: ['Deep Scan'], implemented: true, requires_credentials: false },
  ];

  // DEBUG: Track state drifts
  useEffect(() => {
    console.log("[DEBUG-STATE] refinedUnifiedContent updated:", refinedUnifiedContent ? (refinedUnifiedContent.length + " bytes") : "EMPTY");
  }, [refinedUnifiedContent]);

  useEffect(() => {
    console.log("[DEBUG-STATE] Phase state:", { reqStep, factoryStep, activeMenu });
  }, [reqStep, factoryStep, activeMenu]);

  // --- EFFECTS ---
  useEffect(() => {
    sessionStorage.setItem('blast_platforms', JSON.stringify(selectedPlatforms));
  }, [selectedPlatforms]);

  useEffect(() => {
    localStorage.setItem('vvnt_log_level', logLevel.toString());
  }, [logLevel]);

  useEffect(() => {
    sessionStorage.setItem('sequor_active_menu', activeMenu);
  }, [activeMenu]);

  useEffect(() => {
    sessionStorage.setItem('sequor_factory_step', factoryStep.toString());
  }, [factoryStep]);

  useEffect(() => {
    sessionStorage.setItem('sequor_req_step', reqStep.toString());
  }, [reqStep]);



  // Autonomous Sidebar Expansion Intelligence (Single-Focus Mode)
  useEffect(() => {
    // Autonomous Sidebar Expansion Intelligence (Single-Focus Mode)
    if (!sidebarFanOut) return;

    // Watch reasoningLogs (LIVE) instead of phase1Logs (SNAPSHOT)
    if (!reasoningLogs || reasoningLogs.length === 0) return;

    // Check for any crew/agent that is completed or currently active
    // We look for agents mentioned in the latest logs
    const PILLAR_MAP: Record<string, string[]> = {
      m1: ['crew_strategic_command', 'crew_logic_compliance', 'crew_knowledge_engine', 'planning_agent', 'auditor', 'eng_knowledge_graph', 'Planner', 'Clarifier', 'Compliance', 'Logic', 'requirement_ops', 'knowledge'],
      m2: ['crew_strategy_impact', 'crew_scenario_data', 'crew_api_virtualization', 'crew_code_generators', 'crew_interface_mobile', 'crew_orchestration_matrix', 'agent_2', 'creator', 'api_validation', 'Synthesis', 'TestCase', 'DataBuilder', 'automation_forge', 'mobile_testing', 'Automation', 'test_case_factory', 'run_orchestrator'],
      m3: ['crew_performance_chaos', 'crew_security_aspm', 'crew_backend_architecture', 'crew_cloud_environments', 'crew_sre_reliability', 'crew_self_healing', 'crew_ux_monitoring', 'performance', 'security', 'microservices', 'Performance', 'Security', 'env_provisioner', 'reliability_eng', 'self_healing', 'ux_intelligence'],
      m4: ['crew_economics_risk', 'crew_incident_command', 'rca_intelligence', 'release_command', 'release_risk_decision', 'biz_impact', 'roi_intel', 'history_trends'],
      sc: ['settings', 'config_settings', 'registry']
    };

    // Use the LATEST log entry to determine focus
    const latestLog = reasoningLogs[reasoningLogs.length - 1];
    const agentName = latestLog.agent;
    const message = latestLog.message || "";
    if (!agentName) return;

    let targetPillarId = '';

    // Strategy: Match by Agent Name or Crew ID
    for (const [pId, items] of Object.entries(PILLAR_MAP)) {
      if (items.some(item => agentName.includes(item) || message.includes(item))) {
        targetPillarId = pId;
        break;
      }
    }

    if (targetPillarId) {
      setOpenPillars(prev => {
        // If already focused on this pillar, do nothing
        if (prev.length === 2 && prev.includes('cc') && prev.includes(targetPillarId)) return prev;
        return ['cc', targetPillarId];
      });
    }
  }, [reasoningLogs]);

  // Context-Aware Pillar Expansion (Single-Focus Mode)
  useEffect(() => {
    if (activeMenu.startsWith('crew_') || ['requirement_ops', 'knowledge', 'test_case_factory', 'release_command'].includes(activeMenu)) {
      const PILLAR_MAP: Record<string, string[]> = {
        m1: ['crew_strategic_command', 'crew_logic_compliance', 'crew_knowledge_engine', 'requirement_ops', 'knowledge'],
        m2: ['crew_strategy_impact', 'crew_scenario_data', 'crew_api_virtualization', 'crew_code_generators', 'crew_interface_mobile', 'test_case_factory', 'crew_orchestration_matrix'],
        m3: ['crew_performance_chaos', 'crew_security_aspm', 'crew_backend_architecture', 'crew_cloud_environments', 'crew_sre_reliability', 'crew_self_healing', 'crew_ux_monitoring'],
        m4: ['crew_economics_risk', 'crew_incident_command', 'release_command', 'history_trends'],
        sc: ['settings', 'config_settings', 'registry']
      };
      for (const [pId, items] of Object.entries(PILLAR_MAP)) {
        if (items.includes(activeMenu)) {
          setOpenPillars(prev => (prev.length === 2 && prev.includes(pId)) ? prev : ['cc', pId]);
          break;
        }
      }
    }
    if (activeMenu === 'orchestration' || activeMenu === 'registry' || activeMenu === 'settings' || activeMenu === 'config_settings') {
      // Command Center and System Care focus
      if (activeMenu === 'settings' || activeMenu === 'config_settings') {
        setOpenPillars(prev => prev.includes('sc') ? prev : ['cc', 'sc']);
      } else {
        setOpenPillars(['cc']);
      }
    }
  }, [activeMenu]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const raw = await apiClient.get(`/integrations/all`);
        if (true) {
          // Normalize keys (legacy DB may contain 'Jira' vs 'jira')
          const normalized: Record<string, ConnectionConfig> = {};
          const isMockCfg = (cfg: any) => !!cfg && (cfg.url === 'mock://vvnt' || cfg.token === 'mock');
          Object.entries(raw || {}).forEach(([k, v]: any) => {
            if (!k || !v) return;
            const key = String(k).toLowerCase();
            const next = v as ConnectionConfig;
            const prev = normalized[key];
            // Prefer non-mock over mock when both exist.
            if (!prev) {
              normalized[key] = next;
            } else if (isMockCfg(prev) && !isMockCfg(next)) {
              normalized[key] = next;
            }
          });
          setConnectedPlatforms(normalized);
        }

        const kData = await apiClient.get(`/knowledge/list`);
        if (true) {
          // ISS-014 FIX: Use grouped real_documents from new API response.
          // Old code read kData.ids (raw chunk IDs like "travelprd.docx_chunk_0").
          // New response groups by source document with chunk counts.
          if (kData.real_documents) {
            setKnowledgeList(kData.real_documents.map((doc: any) => ({
              id: doc.source,
              type: doc.type || 'historical_sample',
              chunk_count: doc.chunk_count || 1
            })));
          } else if (kData.ids) {
            // Fallback for backward compatibility
            setKnowledgeList(kData.ids.map((id: string, i: number) => ({ id, type: kData.metadatas?.[i]?.type || 'Unknown', chunk_count: 1 })));
          }
        }

        const historyData = await apiClient.get(`/history/list`);
        setHistory(historyData);
      } catch (e) { console.warn("Service Gateway Offline during bootstrap", e); }
    };
    bootstrap();

    // Logic: Fault-Tolerant Health Monitoring (Retry Threshold)
    let failures = 0;
    const pingHealth = async () => {
      const start = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000); // Massive 10s timeout
      try {
        const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        setLatency(Math.round(performance.now() - start));
        if (res.ok) {
          const data = await res.json();
          const isHealthy = data.status === 'healthy' || data.status === 'online';
          failures = 0; // CRITICAL RESET
          setServerOnline(isHealthy);
          setHealthMeta(data);
        } else {
          throw new Error("Bad response");
        }
      } catch {
        clearTimeout(tid);
        failures++;
        if (failures >= 3) {
          setServerOnline(false);
          setHealthMeta(null);
        } else {
          // Provide a "Stabilizing" hint in the diagnostic matrix instead of flipping to Offline
          setHealthMeta((prev: any) => ({ ...(prev || {}), isResyncing: true, failureCount: failures }));
        }
      }
    };
    pingHealth();
    const vitals = setInterval(pingHealth, 10000);
    return () => clearInterval(vitals);
  }, []);


  // --- ACTIONS ---
  const handleTogglePlatform = (id: string) => {
    const platform = platforms.find(p => p.id === id);
    const isAdHoc = platform?.category === 'Ad-Hoc & Conversational';
    const isLinked = !!connectedPlatforms[id];

    // Regression Fix: Only allow selection if linked or if Ad-Hoc
    if (!isLinked && !isAdHoc && id !== 'directpaste') {
      setStatus({ type: 'error', text: `Identity Verification Failed: Secure ${platform?.name} in Vault first.` });
      return;
    }

    if (selectedPlatforms.includes(id)) {
      setSelectedPlatforms(prev => prev.filter(p => p !== id));
    } else {
      setSelectedPlatforms(prev => [...prev, id]);
    }
  };



  const executeApproveClarification = async (updatedQuestions: any[]) => {
    if (!currentTaskId) {
      setStatus({ type: 'error', text: 'Task ID not found. Please re-run Phase 1.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'info', text: 'Submitting PRD Clarification…' });
    setReasoningLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      agent: 'System',
      message: 'Clarification approved. Resuming Strategic Blitz...'
    }]);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/approve-clarification/${currentTaskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedQuestions)
      });
      const data = await res.json();
      if (res.ok && data.status !== 'error') {
        setShowExecutionLog(true);
        pollStatus(currentTaskId, 3); // Resume Phase 1 polling
        setStatus({ type: 'success', text: 'Clarification approved. Resuming analysis…' });
      } else {
        const msg = data.detail || data.message || 'Clarification rejected by server.';
        setStatus({ type: 'error', text: msg });
        setLoading(false);
      }
    } catch (e: any) {
      setStatus({ type: 'error', text: `Clarification failed: ${e.message}` });
      setLoading(false);
    }
  };

  const executeFactoryPhase2 = async (editedContext?: string) => {
    if (!currentTaskId) {
      setStatus({ type: 'error', text: 'Phase 1 task ID not found. Please re-run Phase 1 before proceeding.' });
      return;
    }

    let endpoint = '';
    const missionStatus = fullAgentState?.mission_status;
    const isPhase2Approval = editedContext === '__CONTRACT_APPROVED__' || missionStatus === 'HITL2_PENDING';
    const isPhase3PlanApproval = editedContext === '__PLAN_APPROVED__' || missionStatus === 'PLAN_PENDING';
    const isPhase1Approval = !isPhase2Approval && !isPhase3PlanApproval && (missionStatus === 'HITL1_PENDING' || factoryStep === 3);
    const isPhase3Approval = missionStatus === 'TDD_GREEN';

    if (isPhase1Approval) {
        endpoint = `${API_BASE}/api/tasks/missions/${currentTaskId}/approve/phase1`;
    } else if (isPhase2Approval) {
        endpoint = `${API_BASE}/api/tasks/missions/${currentTaskId}/approve/phase2`;
    } else if (isPhase3PlanApproval) {
        endpoint = `${API_BASE}/api/tasks/missions/${currentTaskId}/approve/phase3-plan`;
    } else if (isPhase3Approval) {
        endpoint = `${API_BASE}/api/tasks/missions/${currentTaskId}/approve/phase3`;
    } else {
        console.error(`No approval endpoint for status: ${missionStatus}`);
        setStatus({ type: 'error', text: `Invalid approval state: ${missionStatus}` });
        return;
    }

    setLoading(true);
    let body: any = { approved: true };

    if (isPhase1Approval) {
        setStatus({ type: 'info', text: 'Initializing Execution Factory (Phase 2)...' });
        setReasoningLogs([{ timestamp: new Date().toLocaleTimeString(), agent: 'System', message: 'Phase 2 Artifact Synthesis initiated. Activating intelligence mesh...' }]);
        setLiveTopology({ mesh_id: 'PHASE2_SYNTHESIS_MESH', nodes: [], active_node_id: null });
        setFactoryStep(4); // Phase 2 running
        setActiveMenu('orchestration');

        let finalContext = editedContext?.trim();
        if (!finalContext || finalContext === 'PRIMARY REQUIREMENT CONTRACT (REFINED):') {
          const fallback = generatedMarkdown?.trim() || refinedUnifiedContent?.trim() || '';
          finalContext = fallback ? `PRIMARY REQUIREMENT CONTRACT (REFINED):\n${fallback}` : '';
        }
        body = { resolved_questions: [], edited_context: finalContext };
    } else if (isPhase2Approval) {
        setStatus({ type: 'info', text: 'Submitting Engineering Contract approval…' });
        setReasoningLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            agent: 'System',
            message: 'Engineering Contract approved. Initiating Implementation Plan Generation (Phase 3a)…'
        }]);
        setLiveTopology({ mesh_id: 'PHASE3_PLAN_MESH', nodes: [], active_node_id: null });
        setFactoryStep(6); // Moving to Plan Generation
        setActiveMenu('orchestration');
    } else if (isPhase3PlanApproval) {
        setStatus({ type: 'info', text: 'Submitting Implementation Plan approval…' });
        setReasoningLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            agent: 'System',
            message: 'Implementation Plan approved. Releasing Context-Aware Forge Agents (Phase 3b)…'
        }]);
        setLiveTopology({ mesh_id: 'PHASE3_FORGE_MESH', nodes: [], active_node_id: null });
        // Assuming we stay on step 6 for Phase 3
        setActiveMenu('orchestration');
        
        let finalPlan = editedContext?.trim();
        if (finalPlan && finalPlan !== '__PLAN_APPROVED__') {
            body = { edited_plan: finalPlan };
        }
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (res.ok && data.status !== 'error') {
            setShowExecutionLog(true);
            pollStatus(currentTaskId, isPhase1Approval ? 5 : 7);
            
            if (isPhase1Approval) {
                setStatus({ type: 'success', text: 'Phase 2 Task accepted. Executing Factory Agents...' });
                if (data.active_agents) setMeshOverrides(deriveMeshOverrides(meshDepth, data.active_agents));
            } else if (isPhase2Approval) {
                setStatus({ type: 'success', text: 'Plan Generation initiated. Awaiting Implementation Plan…' });
            } else if (isPhase3PlanApproval) {
                setStatus({ type: 'success', text: 'Forge Agents released. Awaiting code generation…' });
            }
        } else {
            const msg = data.detail || data.message || 'Approval rejected by server.';
            setStatus({ type: 'error', text: msg });
            setLoading(false);
            setFactoryStep(isPhase1Approval ? 3 : 5);
        }
    } catch (e: any) {
        setStatus({ type: 'error', text: `Approval failed: ${e.message}` });
        setLoading(false);
        setFactoryStep(isPhase1Approval ? 3 : 5);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // executeApproveContract: Checkpoint 2 (Artifact Factory) -> Dev Forges
  // ────────────────────────────────────────────────────────────────────────
  const executeApproveContract = async () => {
    if (!currentTaskId) return;
    setLoading(true);
    setStatus({ type: 'info', text: 'Engaging Development Forges (Phase 3)...' });
    
    try {
      // In a real implementation this would post to an approve endpoint to resume graph execution
      // For now, we simulate the transition for UI purposes
      setFactoryStep(6); 
      setReasoningLogs(prev => [...prev,
        { timestamp: new Date().toLocaleTimeString(), agent: 'System', message: 'Contract Approved. Spinning up Frontend, Backend, and Database Forges...' }
      ]);
      
      // We would normally poll status here, similar to executeFactoryPhase2
      setTimeout(() => {
        setLoading(false);
        setStatus({ type: 'success', text: 'Forges activated.' });
      }, 1000);
      
    } catch (e) {
      console.error("Failed to approve contract", e);
      setStatus({ type: 'error', text: 'Failed to dispatch to Dev Forges.' });
      setLoading(false);
    }
  };

  const pollStatus = (taskId: string, targetStep: number) => {
    // CRITICAL: Clear any existing polling interval before starting a new one.
    // Without this, navigating away and back (or React StrictMode double-invoke)
    // spawns multiple concurrent intervals that can never be cleared.
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // CRITICAL: Fire the FIRST poll IMMEDIATELY (0ms), then continue at 800ms intervals.
    // This eliminates the blank gap that made the console appear frozen.
    const executePoll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks/status/${taskId}`);
        const data = await res.json();

        // Only replace logs if the backend has actual entries (preserve boot logs otherwise)
        if (data.logs && data.logs.length > 0) {
          setReasoningLogs(data.logs);
        }

        if (data.mesh_topology) {
          setLiveTopology(data.mesh_topology);
          setMeshTopology(data.mesh_topology);
        }

        // CRITICAL FIX: Ensure active_agents is preserved even after a page refresh by syncing from backend mission_manifest
        if (data.mission_manifest && data.mission_manifest.active_agents) {
          setFullAgentState((prev: any) => ({
            ...data.mission_manifest,
            ...(prev || {}),
            active_agents: data.mission_manifest.active_agents
          }));
        }

        // LIVE TELEMETRY: During execution, feed partial_state into fullAgentState
        // so Agent Workspace panels update in real-time as each node completes.
        if (data.status === 'PROCESSING' && data.partial_state && Object.keys(data.partial_state).length > 0) {
          setFullAgentState((prev: any) => {
            const mStatus = data.mission_status || (data.result?.full_state?.mission_status);
            // Merge partial_state into existing state — new keys win, preserving prior data
            return { ...(prev || {}), ...data.partial_state, mission_status: mStatus };
          });
        }

        if (data.plan_json && Object.keys(data.plan_json).length > 0) {
          const mStatusForPlan = data.mission_status || '';
          setFullAgentState((prev: any) => ({ ...(prev || {}), plan_json: data.plan_json, mission_status: mStatusForPlan }));
        }
        if (data.phase3_output && Object.keys(data.phase3_output).length > 0) {
          setFullAgentState((prev: any) => ({ ...(prev || {}), phase3_output: data.phase3_output }));
        }
        if (data.phase4_output && Object.keys(data.phase4_output).length > 0) {
          setFullAgentState((prev: any) => ({ ...(prev || {}), phase4_output: data.phase4_output }));
        }
        if (data.phase5_output && Object.keys(data.phase5_output).length > 0) {
          setFullAgentState((prev: any) => ({ ...(prev || {}), phase5_output: data.phase5_output }));
        }

        const mStatus = data.mission_status || (data.result?.full_state?.mission_status);
        if (mStatus === 'MISSION_FAILED') {
          setStatus({ type: 'error', text: 'Mission failed during backend execution.' });
          setLoading(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }
        // PLAN_PENDING: plan generated, awaiting HITL approval — keep polling alive but don't advance step
        if (mStatus === 'PLAN_PENDING') {
          setFullAgentState((prev: any) => ({ ...(prev || {}), mission_status: 'PLAN_PENDING' }));
          setStatus({ type: 'info', text: 'Implementation Plan ready — review and approve modules below.' });
          setLoading(false);
          return; // keep interval running so status stays live
        }
        if (targetStep === 7) {
          if (mStatus !== 'MISSION_COMPLETE') {
            // Keep polling until the entire downstream pipeline (Phase 3 -> Phase 4 -> Phase 5) is complete
            return;
          }
          data.status = 'COMPLETED'; // Force completion since Phase 5 doesn't update the legacy task status
        }

        if (data.status === 'COMPLETED') {
          // KEY FIX: Robust result extraction across different backend schemas
          let md = '';
          if (typeof data.result === 'string') md = data.result;
          else if (data.result) {
            md = data.result.markdown_preview || data.result.markdown || data.result.content || '';
          }

          const payload = data.result?.analysis_payload || data.result?.payload || null;
          let fState = data.result?.full_state || data.partial_state || {};
          if (typeof fState === 'object' && fState !== null) {
            fState = { ...fState, mission_status: mStatus };
          }
          const dlUrl = data.result?.download_url || '';

          console.log('[DEBUG-POLL] COMPLETED. markdown length:', md.length, 'payload keys:', payload ? Object.keys(payload) : 'null');

          setGeneratedMarkdown(md);
          safeSetLocalStorage('sequor_generated_markdown', md);
          setDownloadUrl(dlUrl);
          setPlanPayload(payload);
          if (fState) {
            setFullAgentState((prev: any) => {
              const nextState = { ...(prev || {}), ...fState };
              safeSetLocalStorage('sequor_full_agent_state', JSON.stringify(nextState));
              return nextState;
            });
          }
          let statusText = 'Phase Complete. Awaiting next action.';
          if (targetStep === 3) {
              statusText = 'Phase 1 Orchestration Complete. Awaiting Human Review.';
          } else if (targetStep === 5) {
              statusText = 'Phase 2 Artifact Synthesis Complete. Awaiting Engineering Contract Approval.';
          } else if (targetStep === 7) {
              statusText = 'Phase 3 Dev Forges Complete. Awaiting Quality Validation.';
          } else if (targetStep === 9) {
              statusText = 'Phase 4 Validation Complete. Awaiting Final Audit.';
          } else if (targetStep >= 11) {
              statusText = convergeModule === 'decide' || convergeModule === 'all'
                ? 'CONVERGE Mission Complete. Release Command Center ready.'
                : 'CONVERGE Mission Complete. Review your artifacts below.';
          }

          setStatus({ type: 'success', text: statusText });
          setFactoryStep(targetStep);
          safeSetLocalStorage('sequor_factory_step', targetStep.toString());
          // SNAPSHOT: Freeze Phase 1 topology + logs before Phase 2 overwrites them
          if (targetStep === 3) {
            setPhase1Topology(data.mesh_topology);
            setPhase1Logs(data.logs || []);
          }
          // CONVERGE mission complete — stay on Mission Control per user request
          if (targetStep === 5) {
            setConvergeTaskId(taskId);
            // Removed auto-navigation to release_command
          }
          setLoading(false);
          // Clear the interval via the ref — guaranteed to work regardless of re-renders
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (data.status === 'FAILED') {
          setStatus({ type: 'error', text: data.error || 'Generation failed.' });
          setLoading(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (e: any) {
        console.error("Polling failure", e);
        setStatus({ type: 'error', text: `Phase 2 polling failed: ${e?.message || 'unknown error'}` });
        setLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    };

    // Immediate first poll
    executePoll();
    // Then poll every 800ms — stored in ref so it can always be cleared
    pollIntervalRef.current = setInterval(executePoll, 800);
  };

  const deriveStepFromStatus = (status: string): { step: number, menu: string } => {
    switch (status) {
      case 'CREATED':
      case 'PHASE1_RUNNING':
        return { step: 2, menu: 'mesh_observatory' };
      case 'HITL1_PENDING':
        return { step: 3, menu: 'orchestration' };
      case 'PHASE1_APPROVED':
      case 'PHASE2_RUNNING':
        return { step: 4, menu: 'mesh_observatory' };
      case 'HITL2_PENDING':
        return { step: 5, menu: 'orchestration' };
      case 'PHASE2_APPROVED':
      case 'PLAN_GENERATION_RUNNING':
      case 'PLAN_PENDING':
        return { step: 6, menu: 'orchestration' };
      case 'PLAN_APPROVED':
      case 'PHASE3_RUNNING':
      case 'TDD_GREEN':
      case 'PHASE4_RUNNING':
      case 'NFR_GREEN':
      case 'PHASE5_RUNNING':
        return { step: 7, menu: 'mesh_observatory' };
      case 'MISSION_COMPLETE':
        return { step: 7, menu: 'mesh_observatory' };
      case 'PARTIAL_FAILURE':
      case 'FAILED':
        return { step: 99, menu: 'orchestration' }; // 99 indicates failure review
      default:
        return { step: 1, menu: 'mission_launchpad' };
    }
  };

  // --- SESSION RECOVERY BOOTSTRAP ---
  useEffect(() => {
    const tid = localStorage.getItem('sequor_current_task_id');
    const context = localStorage.getItem('sequor_refined_context');

    if (context) {
      setRefinedUnifiedContent(context);
    }

    // CACHE-FIRST: Restore generated markdown and agent state from local storage immediately.
    const savedMD = localStorage.getItem('sequor_generated_markdown');
    const savedState = localStorage.getItem('sequor_full_agent_state');
    if (savedMD) setGeneratedMarkdown(savedMD);
    setFullAgentState(safeParseJSON(savedState, null));

    if (tid) {
      // Rehydrate directly from the new resume-state endpoint
      fetch(`${API_BASE}/api/tasks/missions/${tid}/resume-state`)
        .then(res => {
          if (!res.ok) throw new Error('Mission not found or deleted');
          return res.json();
        })
        .then(data => {
          const { status: missionStatus, phase1_output, phase2_output, phase3_output, phase4_output, implementation_plan } = data;
          
          setTaskId(tid);
          setCurrentTaskId(tid);

          const derived = deriveStepFromStatus(missionStatus);
          
          if (missionStatus === 'FAILED' || missionStatus === 'PARTIAL_FAILURE') {
             setStatus({ type: 'error', text: `Mission in ${missionStatus} state. Please review logs or reset.` });
             setFactoryStep(derived.step);
             setActiveMenu(derived.menu);
             setLoading(false);
          } else if (derived.step > 1) {
             setFactoryStep(derived.step);
             setActiveMenu(derived.menu);
             localStorage.setItem('sequor_factory_step', derived.step.toString());
             
             // Restore output data from backend payload
             if (phase1_output) {
                setFullAgentState((prev: any) => ({ ...(prev || {}), ...phase1_output, mission_status: missionStatus }));
             }
             if (phase2_output) {
                setFullAgentState((prev: any) => ({ ...(prev || {}), ...phase2_output, mission_status: missionStatus }));
                setGeneratedMarkdown(phase2_output.markdown_preview || phase2_output.markdown || '');
                setDownloadUrl(phase2_output.download_url || '');
                setPlanPayload(phase2_output.analysis_payload || phase2_output.payload || null);
             }
             if (implementation_plan) {
                setFullAgentState((prev: any) => ({ ...(prev || {}), plan_json: implementation_plan }));
             }
             if (phase3_output) {
                setFullAgentState((prev: any) => ({ ...(prev || {}), phase3_output }));
             }
             if (phase4_output) {
                setFullAgentState((prev: any) => ({ ...(prev || {}), phase4_output }));
             }
             
             // If mission is actively running, resume polling
             if (['PHASE1_RUNNING', 'PHASE2_RUNNING', 'PLAN_GENERATION_RUNNING', 'PHASE3_RUNNING', 'PHASE4_RUNNING', 'PHASE5_RUNNING'].includes(missionStatus)) {
                setStatus({ type: 'info', text: 'Resuming Active Mission Polling...' });
                setLoading(true);
                pollStatus(tid, derived.step + 1);
             } else {
                setLoading(false);
             }
          } else {
             // Fallback
             setLoading(false);
          }
        }).catch(e => {
          console.warn("Recovery via resume-state failed", e);
          // Only drop local state if we know for sure it's gone (e.g. 404 from hard reset)
          // For network errors we keep the UI as is.
          setLoading(false);
        });
    }
  }, []);

  const resetMission = async () => {
    if (window.confirm("This will purge the current mission state and telemetry. Proceed?")) {
      // 1. Backend Reset via /hard-reset
      if (currentTaskId) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          await fetch(`${API_BASE}/api/tasks/missions/${currentTaskId}/hard-reset`, {
            method: 'POST',
            signal: ctrl.signal
          });
          clearTimeout(tid);
        } catch (e) {
          console.warn("[RESET] Backend hard reset failed or timed out:", e);
        }
      }

      // 2. Local Storage Purge (Comprehensive) - Clear BEFORE UI state updates to prevent race condition
      sessionStorage.clear();
      const keysToClear = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sequor_') && key !== 'sequor_demo_mode') {
          keysToClear.push(key);
        }
      }
      keysToClear.forEach(k => localStorage.removeItem(k));

      // 3. UI State Reset (Immediate)
      setTaskId(null);
      setCurrentTaskId(null);
      setFactoryStep(0);
      setReqStep(1);
      setRefinedUnifiedContent('');
      setGeneratedMarkdown('');
      setPlanPayload(null);
      setFullAgentState(null);
      setReasoningLogs([]);
      setMeshTopology(null);
      setLiveTopology(null);
      setPhase1Topology(null);
      setPhase1Logs([]);
      setSelectedPlatforms([]);
      setMeshDepth('standard');
      setMeshOverrides({});

      // 4. Reload to ensure all refs and interval loops are killed
      window.location.reload();
    }
  };

  const startNewMission = () => {
    // 1. Local Storage Purge (Comprehensive) - Clear BEFORE UI state updates
    sessionStorage.clear();
    const keysToClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sequor_') && key !== 'sequor_demo_mode') {
        keysToClear.push(key);
      }
    }
    keysToClear.forEach(k => localStorage.removeItem(k));

    // 2. UI State Reset
    setTaskId(null);
    setCurrentTaskId(null);
    setFactoryStep(0);
    setReqStep(1);
    setRefinedUnifiedContent('');
    setGeneratedMarkdown('');
    setPlanPayload(null);
    setFullAgentState(null);
    setReasoningLogs([]);
    setMeshTopology(null);
    setLiveTopology(null);
    setPhase1Topology(null);
    setPhase1Logs([]);
    setSelectedPlatforms([]);
    setMeshDepth('standard');
    setMeshOverrides({});

    // 3. Navigate back to launchpad
    setActiveMenu('mission_launchpad');
  };

  const handleClearSession = async () => {
    if (window.confirm("This will terminate all active background missions and wipe your session cleanly. Proceed?")) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        await fetch(`${API_BASE}/api/tasks/clear-session`, {
          method: 'POST',
          signal: ctrl.signal
        });
        clearTimeout(tid);
      } catch (e) {
        console.warn("[CLEAR-SESSION] Backend signaling failed:", e);
      }
      
      const keysToPurge: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sequor_')) keysToPurge.push(k);
      }
      keysToPurge.forEach(k => localStorage.removeItem(k));
      
      setFactoryStep(0);
      setReqStep(0);
      setLoading(false);
      setGeneratedMarkdown('');
      setRefinedUnifiedContent('');
      setDownloadUrl('');
      setPlanPayload(null);
      setFullAgentState(null);
      setReasoningLogs([]);
      setPhase1Logs([]);
      setPhase1Topology(null);
      setLiveTopology({ mesh_id: '', nodes: [], active_node_id: null });
      setCurrentTaskId(null);
      setTaskId(null);
      setConvergeTaskId(null);
      setStatus({ type: 'success', text: 'Session cleared. Ready for a fresh mission.' });
      setActiveMenu('mission_launchpad');
    }
  };

  const testConnectionAndSave = async () => {
    const pid = (configPlatformId || '').toLowerCase();
    setConnectionStatus({ type: 'testing', message: `Verifying ${configPlatformId.toUpperCase()}...` });
    setPlatformConnStatus(prev => ({ ...prev, [pid]: { type: 'testing', message: `Verifying ${configPlatformId.toUpperCase()}...` } }));
    try {
      const res = await fetch(`${API_BASE}/api/integrations/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: configPlatformId, config: tempConfig, consent: tempConfig.consent })
      });
      const data = await res.json();
      if (data.success) {
        setConnectedPlatforms({ ...connectedPlatforms, [pid]: tempConfig });
        setConnectionStatus({ type: 'success', message: data.message || 'Connection verified.' });
        setPlatformConnStatus(prev => ({ ...prev, [pid]: { type: 'success', message: data.message || 'Connection verified.' } }));
        setTimeout(() => setShowConfigModal(false), 800);
      } else {
        const msg = data.detail || data.message || 'Handshake Rejected.';
        setConnectionStatus({ type: 'error', message: msg });
        setPlatformConnStatus(prev => ({ ...prev, [pid]: { type: 'error', message: msg } }));
      }
    } catch (e: any) {
      const msg = `Gateway Timeout: ${e.message}`;
      setConnectionStatus({ type: 'error', message: msg });
      setPlatformConnStatus(prev => ({ ...prev, [pid]: { type: 'error', message: msg } }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setUploading(true); setStatus({ type: 'info', text: 'Vectorizing node...' });
    const formData = new FormData(); formData.append('file', e.target.files[0]);
    const uploadedFileName = e.target.files[0].name;
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', text: `Node vectorized: ${uploadedFileName}` });
        // ISS-014 FIX: Use the local filename since backend doesn't return data.filename
        setKnowledgeList([...knowledgeList, { id: uploadedFileName, type: 'historical_sample', chunk_count: 1 }]);
      } else {
        setStatus({
          type: 'error',
          text: data?.detail || data?.message || 'Vectorization failed. Please upload a supported file format.'
        });
      }
    } catch (e: any) {
      setStatus({ type: 'error', text: `Gateway failure: ${e.message}` });
    }
    setUploading(false);
  };

  // ISS-014 FIX: Wire up delete handler for RAG memory nodes.
  // Passes the source document name (e.g. 'travelprd.docx') to the backend
  // which deletes all chunks belonging to that document.
  const handleKnowledgeDelete = async (sourceId: string) => {
    setStatus({ type: 'info', text: `Pruning memory node: ${sourceId}...` });
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/delete/${encodeURIComponent(sourceId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKnowledgeList(knowledgeList.filter((node: any) => node.id !== sourceId));
        setStatus({ type: 'success', text: `Memory node pruned: ${sourceId} (${data.count} chunk${data.count !== 1 ? 's' : ''} removed)` });
      } else {
        setStatus({ type: 'error', text: data.detail || `Failed to delete: ${sourceId}` });
      }
    } catch (e: any) {
      setStatus({ type: 'error', text: `Delete failed: ${e.message}` });
    }
  };

  const handleHistoryDelete = async (id: number) => {
    setStatus({ type: 'info', text: 'Purging artifact...' });
    try {
      await apiClient.delete(`/history/${id}`);
      if (true) {
        setHistory(history.filter(h => h.id !== id));
        setStatus({ type: 'success', text: 'Artifact purged from audit log.' });
      } else { setStatus({ type: 'error', text: 'Purge failed.' }); }
    } catch { setStatus({ type: 'error', text: 'Gateway failure.' }); }
  };

  const getAgentBreadcrumb = (menu: string) => {
    if (BREADCRUMB_MAP[menu]) return BREADCRUMB_MAP[menu];
    // Generic fallback for individual nodes or deep tier items
    return menu.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // --- CONVERGE LAUNCH HANDLER ---
  const handleConvergeLaunch = (taskId: string, module: string, depth: string) => {
    // Reset stale state from any previous mission
    setGeneratedMarkdown('');
    setDownloadUrl('');
    setPlanPayload(null);
    setFullAgentState(null);
    setPhase1Topology(null);
    setPhase1Logs([]);

    // Local Storage Purge (Comprehensive) to prevent Orphaned State on new launch
    const keysToClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Preserve demo mode and the pending chain task ID
      if (key && key.startsWith('sequor_') && key !== 'sequor_demo_mode' && key !== 'sequor_pending_parent_task') {
        keysToClear.push(key);
      }
    }
    keysToClear.forEach(k => localStorage.removeItem(k));

    const isChain = !!localStorage.getItem('sequor_pending_parent_task');  // set by launchpad when chaining

    setReasoningLogs([
      { timestamp: new Date().toLocaleTimeString(), agent: 'System', message: `CONVERGE mission launched — ${module} / ${depth}` },
      {
        timestamp: new Date().toLocaleTimeString(), agent: 'System', message: isChain
          ? 'Chaining from prior run — activating full mesh...'
          : 'Phase 1: Ingesting requirements and building Intelligence Contract...'
      },
    ]);
    setLiveTopology({ mesh_id: `CONVERGE_${module.toUpperCase()}`, nodes: [], active_node_id: null });

    // Set all task tracking state
    setConvergeTaskId(taskId);
    setTaskId(taskId);
    setCurrentTaskId(taskId);
    setConvergeModule(module);
    setConvergeDepth(depth);
    setMeshOverrides({});
    setMeshDepth(depth);
    localStorage.setItem('sequor_current_task_id', taskId);
    localStorage.setItem('sequor_factory_step', isChain ? '4' : '2');
    setFactoryStep(isChain ? 4 : 2);
    localStorage.removeItem('sequor_pending_parent_task');

    // ── Step 4: Module-aware post-launch navigation ──────────────────────────
    // Chain missions (PHASE_2) go directly to the module's primary view.
    // Fresh missions (PHASE_1) always go to Mesh Observatory to watch Phase 1.
    if (isChain) {
      // PHASE_2 chain — navigate to the module's primary output view
      const moduleNavMap: Record<string, string> = {
        forge: 'test_case_factory',    // Artifact Factory — test cases + automation
        certify: 'crew_security_aspm',   // Certify workspace — compliance + security
        decide: 'release_command',      // Release Command Center — Go/No-Go
        all: 'mesh_observatory',     // Full pipeline — watch the mesh
      };
      const targetView = moduleNavMap[module] || 'mesh_observatory';
      setActiveMenu(targetView);
      setLoading(true);
      setStatus({ type: 'info', text: `CONVERGE ${module.toUpperCase()} mission running. Activating full mesh...` });
      // Chain missions complete at step 5 (full delivery)
      pollStatus(taskId, 5);
    } else {
      // PHASE_1 fresh mission — always watch Phase 1 in Mesh Observatory
      setActiveMenu('mesh_observatory');
      setLoading(true);
      setStatus({ type: 'info', text: `CONVERGE mission launched (${module} / ${depth}). Phase 1 running...` });
      // Poll for Phase 1 completion → step 3 (HITL review ready)
      pollStatus(taskId, 3);
    }
  };

  // --- RENDERING ---
  return (

    <div className="agent-ecosystem-root">
      <nav className="global-sidebar">
        <div className="sidebar-logo sidebar-logo-v2">
          <div className="logo-flex">
            <img src="/vvnt_logo.png" alt="VVNT Logo" className="logo-img-v2" />
            <span className="logo-text logo-text-v2">Converge</span>
          </div>
          <div className="assurance-badge-v2">
            <i className="badge-inner-text">Engineering Assurance PF</i>
          </div>
          <a 
            href="http://localhost:5174" 
            target="_blank" 
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              margin: '8px 12px 12px 12px',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#ffffff',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid #818cf8',
              boxShadow: '0 2px 4px rgba(99,102,241,0.25)'
            }}
            title="Open AI Coding Agent IDE on Port 5174"
          >
            <i className="ti-layout-tab-window"></i>
            <span>Open IDE (Port 5174)</span>
          </a>
        </div>
        <div className="sidebar-links sidebar-links-v2">
          {/* === CORE COMMAND === */}
          <div className="sidebar-section-label" onClick={() => togglePillar('cc')}>
            <span>Command Center</span>
            <i className={openPillars.includes('cc') ? 'ti-angle-down' : 'ti-angle-right'}></i>
          </div>
          {openPillars.includes('cc') && (
            <div className="pillar-fade-in">
              <button className={activeMenu === 'mission_launchpad' ? 'active' : ''} onClick={() => setActiveMenu('mission_launchpad')}><i className="ti-rocket"></i> <span>Mission Launchpad</span></button>
              {/* Engineer-only items */}
              {persona === 'engineer' && (<>
                <button className={activeMenu === 'mesh_observatory' ? 'active' : ''} onClick={() => setActiveMenu('mesh_observatory')}><i className="ti-vector"></i> <span>Mesh Observatory</span></button>
                <button
                  onClick={() => setActiveMenu('orchestration')}
                  className={`${activeMenu === 'orchestration' ? 'active' : ''}`}
                  style={{ position: 'relative' }}
                  title="Mission Control — HITL Review & Phase 2 Approval"
                >
                  <i className="ti-direction-alt"></i>
                  <span>Mission Control</span>
                  {/* HITL Alert Badge — shown when Phase 1 is complete and awaiting approval */}
                  {factoryStep === 3 && (
                    <span style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#f59e0b', boxShadow: '0 0 8px #f59e0b',
                      animation: 'pulse 1.5s infinite'
                    }} />
                  )}
                </button>
                <button
                  onClick={() => setShowExecutionLog(true)}
                  className={`btn-relative ${showExecutionLog ? 'active' : ''}`}
                >
                  <i className="ti-pulse"></i>
                  <span>Live Console</span>
                  {loading && (
                    <span className="live-pulse-sidebar" />
                  )}
                </button>
              </>)}
            </div>
          )}

          {/* === MODULE 1: INGEST — Engineer only === */}
          {persona === 'engineer' && (<>
            <div className="sidebar-section-label" onClick={() => togglePillar('m1')}>
              <span>Module 1 · Ingest & Synthesize</span>
              <i className={openPillars.includes('m1') ? 'ti-angle-down' : 'ti-angle-right'}></i>
            </div>
            {openPillars.includes('m1') && (
              <div className="pillar-fade-in">
                <button className={activeMenu === 'knowledge' ? 'active' : ''} onClick={() => setActiveMenu('knowledge')}><i className="ti-layers"></i> <span>Semantic Knowledge</span></button>
                <button className={activeMenu === 'crew_strategic_command' ? 'active' : ''} onClick={() => setActiveMenu('crew_strategic_command')} style={{ opacity: isCrewBypassed('crew_strategic_command') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-direction"></i> <span>Strategic Command</span></button>
                <button className={activeMenu === 'crew_logic_compliance' ? 'active' : ''} onClick={() => setActiveMenu('crew_logic_compliance')} style={{ opacity: isCrewBypassed('crew_logic_compliance') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-shield"></i> <span>Logic & Compliance</span></button>
                <button className={activeMenu === 'crew_knowledge_engine' ? 'active' : ''} onClick={() => setActiveMenu('crew_knowledge_engine')} style={{ opacity: isCrewBypassed('crew_knowledge_engine') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-share"></i> <span>Knowledge Engine</span></button>
              </div>
            )}

            {/* === MODULE 2: FORGE — Engineer only === */}
            <div className="sidebar-section-label" onClick={() => togglePillar('m2')}>
              <span>Module 2 · Generate & Forge</span>
              <i className={openPillars.includes('m2') ? 'ti-angle-down' : 'ti-angle-right'}></i>
            </div>
            {openPillars.includes('m2') && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <button className={activeMenu === 'test_case_factory' ? 'active' : ''} onClick={() => setActiveMenu('test_case_factory')}><i className="ti-package"></i> <span>Artifact Factory</span></button>
                <button className={activeMenu === 'crew_strategy_impact' ? 'active' : ''} onClick={() => setActiveMenu('crew_strategy_impact')} style={{ opacity: isCrewBypassed('crew_strategy_impact') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-map-alt"></i> <span>Strategy & Impact</span></button>
                <button className={activeMenu === 'crew_scenario_data' ? 'active' : ''} onClick={() => setActiveMenu('crew_scenario_data')} style={{ opacity: isCrewBypassed('crew_scenario_data') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-layout-media-center-alt"></i> <span>Scenario & Data Forge</span></button>
                <button className={activeMenu === 'crew_api_virtualization' ? 'active' : ''} onClick={() => setActiveMenu('crew_api_virtualization')} style={{ opacity: isCrewBypassed('crew_api_virtualization') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-magnet"></i> <span>API Virtualization</span></button>
                <button className={activeMenu === 'crew_code_generators' ? 'active' : ''} onClick={() => setActiveMenu('crew_code_generators')} style={{ opacity: isCrewBypassed('crew_code_generators') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-html5"></i> <span>Code Generators</span></button>
                <button className={activeMenu === 'crew_interface_mobile' ? 'active' : ''} onClick={() => setActiveMenu('crew_interface_mobile')} style={{ opacity: isCrewBypassed('crew_interface_mobile') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-mobile"></i> <span>Interface & Mobile</span></button>
                <button className={activeMenu === 'crew_orchestration_matrix' ? 'active' : ''} onClick={() => setActiveMenu('crew_orchestration_matrix')} style={{ opacity: isCrewBypassed('crew_orchestration_matrix') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-control-play"></i> <span>Orchestration Matrix</span></button>
              </div>
            )}

            {/* === MODULE 3: CERTIFY — Engineer only === */}
            <div className="sidebar-section-label" onClick={() => togglePillar('m3')}>
              <span>Module 3 · Certify & Comply</span>
              <i className={openPillars.includes('m3') ? 'ti-angle-down' : 'ti-angle-right'}></i>
            </div>
            {openPillars.includes('m3') && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <button className={activeMenu === 'crew_performance_chaos' ? 'active' : ''} onClick={() => setActiveMenu('crew_performance_chaos')} style={{ opacity: isCrewBypassed('crew_performance_chaos') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-pulse"></i> <span>Performance & Chaos</span></button>
                <button className={activeMenu === 'crew_security_aspm' ? 'active' : ''} onClick={() => setActiveMenu('crew_security_aspm')} style={{ opacity: isCrewBypassed('crew_security_aspm') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-lock"></i> <span>Security (ASPM+)</span></button>
                <button className={activeMenu === 'crew_backend_architecture' ? 'active' : ''} onClick={() => setActiveMenu('crew_backend_architecture')} style={{ opacity: isCrewBypassed('crew_backend_architecture') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-server"></i> <span>Backend Architecture</span></button>
                <button className={activeMenu === 'crew_cloud_environments' ? 'active' : ''} onClick={() => setActiveMenu('crew_cloud_environments')} style={{ opacity: isCrewBypassed('crew_cloud_environments') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-cloud-down"></i> <span>Cloud Environments</span></button>
                <button className={activeMenu === 'crew_self_healing' ? 'active' : ''} onClick={() => setActiveMenu('crew_self_healing')} style={{ opacity: isCrewBypassed('crew_self_healing') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-reload"></i> <span>Self-Healing Dynamics</span></button>
                <button className={activeMenu === 'crew_sre_reliability' ? 'active' : ''} onClick={() => setActiveMenu('crew_sre_reliability')} style={{ opacity: isCrewBypassed('crew_sre_reliability') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-timer"></i> <span>SRE & Reliability</span></button>
                <button className={activeMenu === 'crew_ux_monitoring' ? 'active' : ''} onClick={() => setActiveMenu('crew_ux_monitoring')} style={{ opacity: isCrewBypassed('crew_ux_monitoring') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-eye"></i> <span>UX Monitoring</span></button>
              </div>
            )}
          </>)}

          {/* === MODULE 4: DECIDE — Both personas, Executive gets simplified label === */}
          <div className="sidebar-section-label" onClick={() => togglePillar('m4')}>
            <span>{persona === 'executive' ? 'Executive Intelligence' : 'Module 4 · Decide & Optimize'}</span>
            <i className={openPillars.includes('m4') ? 'ti-angle-down' : 'ti-angle-right'}></i>
          </div>
          {openPillars.includes('m4') && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <button className={activeMenu === 'release_command' ? 'active' : ''} onClick={() => setActiveMenu('release_command')}><i className="ti-stats-up"></i> <span>Release Command</span></button>
              <button className={activeMenu === 'history_trends' ? 'active' : ''} onClick={() => setActiveMenu('history_trends')}><i className="ti-bar-chart"></i> <span>History & Trends</span></button>
              {/* Engineer-only deep nodes */}
              {persona === 'engineer' && (<>
                <button className={activeMenu === 'crew_economics_risk' ? 'active' : ''} onClick={() => setActiveMenu('crew_economics_risk')} style={{ opacity: isCrewBypassed('crew_economics_risk') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-stats-up"></i> <span>Economics & Risk</span></button>
                <button className={activeMenu === 'crew_incident_command' ? 'active' : ''} onClick={() => setActiveMenu('crew_incident_command')} style={{ opacity: isCrewBypassed('crew_incident_command') ? 0.4 : 1, transition: 'opacity 0.3s' }}><i className="ti-alert"></i> <span>Incident Command</span></button>
              </>)}
            </div>
          )}

          {/* === SYSTEM CARE — Engineer only === */}
          {persona === 'engineer' && (
            <div className="sidebar-section-label" onClick={() => togglePillar('sc')}>
              <span>System Care</span>
              <i className={openPillars.includes('sc') ? 'ti-angle-down' : 'ti-angle-right'}></i>
            </div>
          )}
          {persona === 'engineer' && openPillars.includes('sc') && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <button className={activeMenu === 'registry' ? 'active' : ''} onClick={() => setActiveMenu('registry')}><i className="ti-layout-grid3"></i> <span>Agent Sovereign Mesh</span></button>
              <button className={activeMenu === 'settings' ? 'active' : ''} onClick={() => setActiveMenu('settings')}><i className="ti-settings"></i> <span>Identity Vault</span></button>
              <button className={activeMenu === 'config_settings' ? 'active' : ''} onClick={() => setActiveMenu('config_settings')}><i className="ti-panel"></i> <span>Global Thresholds</span></button>
              <button className={activeMenu === 'history' ? 'active' : ''} onClick={() => setActiveMenu('history')}><i className="ti-time"></i> <span>Mission History</span></button>
              <button
                className={showDebugWindow ? 'active' : ''}
                onClick={() => setShowDebugWindow(true)}
                style={{ position: 'relative' }}
                title="View raw backend logs for the current mesh run"
              >
                <i className="ti-code"></i>
                <span>Debug Window</span>
                {currentTaskId && (
                  <span style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.5rem', fontWeight: 900, padding: '1px 5px', borderRadius: '3px',
                    background: 'rgba(99,102,241,0.2)', color: '#818cf8', textTransform: 'uppercase',
                  }}>RAW</span>
                )}
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          {/* HITL Approval Banner — two actions: quick approve OR go to full review */}
          {factoryStep === 3 && (
            <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                onClick={() => {
                  const contract = generatedMarkdown?.trim() || refinedUnifiedContent?.trim() || '';
                  const ctx = contract ? `PRIMARY REQUIREMENT CONTRACT (REFINED):\n${contract}` : '';
                  executeFactoryPhase2(ctx);
                }}
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#0f172a', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.02em',
                  animation: 'amber-pulse 2s infinite ease-in-out',
                  boxShadow: '0 2px 12px rgba(245,158,11,0.4)',
                }}
              >
                <span style={{ fontSize: '0.9rem' }}>⚡</span>
                <span style={{ flex: 1, textAlign: 'left' }}>Approve &amp; Launch Phase 2</span>
              </button>
              <button
                onClick={() => setActiveMenu('orchestration')}
                style={{
                  width: '100%', padding: '6px 12px', borderRadius: '6px',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  color: '#f59e0b', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.68rem', fontWeight: 700,
                }}
              >
                <i className="ti-eye" style={{ fontSize: '0.75rem' }} />
                Review Contract First
              </button>
            </div>
          )}

          <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.8rem' }}>
                {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f8fafc' }}>{user?.username}</span>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{user?.is_superuser ? 'Admin' : 'Operator'}</span>
              </div>
            </div>
            <button
              onClick={logout}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              title="Disconnect Session"
            >
              <i className="ti-power-off"></i>
            </button>
          </div>

          <div className={`status-ping ${healthMeta?.status === 'degraded' || healthMeta?.isResyncing ? 'degraded' : ''}`} style={{ color: serverOnline ? '#10b981' : '#ef4444' }}>
            <span className={`pulse ${serverOnline ? (healthMeta?.status === 'degraded' || healthMeta?.isResyncing ? 'degraded' : 'healthy') : 'error'}`}></span>

            {serverOnline ? (
              healthMeta?.isResyncing
                ? `Stabilizing (${healthMeta.failureCount}/3)`
                : (healthMeta?.status === 'degraded' ? 'Degraded Mode' : 'Online Mode')
            ) : 'Offline Mode'}

            {serverOnline && latency > 0 && <span style={{ fontSize: '0.6rem', opacity: 0.6, marginLeft: '4px' }}>{latency}ms</span>}
            <div className="health-tooltip">
              <h4>System Diagnostic Matrix</h4>
              <div className="health-item"><span className="label">Backend Gateway</span><span className={`val ${serverOnline ? 'ok' : 'error'}`}>{serverOnline ? 'Active' : 'Unreachable'}</span></div>
              {healthMeta && (
                <>
                  <div className="health-item">
                    <span className="label">Sync Logic</span>
                    <span className={`val ${healthMeta.isResyncing ? 'warn' : 'ok'}`}>{healthMeta.isResyncing ? `Retry ${healthMeta.failureCount}` : 'Stable'}</span>
                  </div>
                  <div className="health-item"><span className="label">Persistence (SQL)</span><span className={`val ${healthMeta.services?.database === 'connected' ? 'ok' : 'error'}`}>{healthMeta.services?.database === 'connected' ? 'Stable' : 'Fault'}</span></div>
                  <div className="health-item"><span className="label">Secure Vault</span><span className={`val ${healthMeta.services?.vault === 'secure' ? 'ok' : 'warn'}`}>{healthMeta.services?.vault === 'secure' ? 'Verified' : 'Bypass'}</span></div>
                  <div className="health-item"><span className="label">Latency (RTT)</span><span className="val ok">{latency}ms</span></div>
                </>
              )}
              {!healthMeta && !serverOnline && <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '4px' }}>Critical: Service tunnel collapsed.</div>}
            </div>
          </div>
        </div>
        {factoryStep > 0 && (
          <button onClick={resetMission} style={{ marginTop: '14px', width: '100%', background: 'rgba(239, 68, 68, 0.08)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '8px', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="ti-power-off"></i> HARD MISSION RESET
          </button>
        )}
        <button onClick={handleClearSession} style={{ marginTop: '8px', width: '100%', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px dashed rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '8px', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <i className="ti-trash"></i> CLEAR SESSION CACHE
        </button>
      </nav>

      <main className="agent-content-area">
        <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px 14px', flexWrap: 'wrap' }}>
          {/* Left: Breadcrumb + Active Mission label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <div className="breadcrumb header-breadcrumb" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getAgentBreadcrumb(activeMenu)}
            </div>
            {currentTaskId && (
              <div className="mission-status-line" style={{ fontSize: '0.62rem', color: 'var(--text-lo)', fontFamily: 'monospace', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: loading ? 'var(--success)' : 'var(--text-lo)', fontSize: '0.5rem', animation: loading ? 'pulse 2s infinite' : 'none' }}>●</span>
                <span style={{ color: 'var(--text-mid)', fontWeight: 800 }}>{loading ? 'MISSION ACTIVE' : 'MISSION DORMANT'}:</span>
                <span style={{ color: 'var(--text-hi)' }}>{productName}</span>
                <span style={{ color: 'var(--text-lo)' }}>[{currentTaskId.slice(0, 8)}]</span>
              </div>
            )}
          </div>

          {/* Centre: Module Switcher — highlights all active modules */}
          <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '10px', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', maxWidth: '100%' }}>
            {[
              { id: 'ingest', label: 'Ingest', color: '#6366f1', icon: 'ti-import' },
              { id: 'forge', label: 'Forge', color: '#10b981', icon: 'ti-package' },
              { id: 'certify', label: 'Certify', color: '#f59e0b', icon: 'ti-shield' },
              { id: 'decide', label: 'Decide', color: '#8b5cf6', icon: 'ti-stats-up' },
            ].map(mod => {
              const isActive = activeModules.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => { setActiveMenu('mission_launchpad'); setActiveModules([mod.id]); }}
                  title={`Launch ${mod.label} module`}
                  style={{
                    padding: '5px 12px', borderRadius: '7px',
                    background: isActive ? `${mod.color}20` : 'transparent',
                    color: isActive ? mod.color : 'var(--text-lo)',
                    fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'all 0.2s ease',
                    border: isActive ? `1px solid ${mod.color}40` : '1px solid transparent',
                  }}
                >
                  <i className={mod.icon} style={{ fontSize: '0.75rem' }} />
                  <span>{mod.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
            {/* Phase 4.1: Persona Toggle — Executive vs Engineer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)', padding: '3px'
            }}>
              {([
                { id: 'engineer', label: 'Engineer', icon: 'ti-code' },
                { id: 'executive', label: 'Executive', icon: 'ti-briefcase' },
              ] as const).map(p => (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  title={`Switch to ${p.label} view`}
                  style={{
                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                    background: persona === p.id ? 'rgba(99,102,241,0.25)' : 'transparent',
                    color: persona === p.id ? 'var(--accent)' : 'var(--text-lo)',
                    fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}
                >
                  <i className={p.icon} style={{ fontSize: '0.75rem' }} />
                  {p.label}
                </button>
              ))}
            </div>

            {/* Theme Dropdown — Dark / Light / System */}
            <ThemeDropdown theme={theme} resolvedTheme={resolvedTheme} setTheme={setTheme} />
            {/* Futuristic Glassmorphism Demo Toggle */}
            <div
              onClick={() => setDemoMode(!demoMode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 14px',
                background: demoMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                borderRadius: '30px',
                border: `1px solid ${demoMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 900, color: demoMode ? 'var(--accent)' : 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {demoMode ? 'Validation Ready' : 'Live Mission Mode'}
              </span>
              <div style={{
                width: '32px',
                height: '16px',
                borderRadius: '10px',
                background: demoMode ? '#4f46e5' : '#334155',
                position: 'relative',
                transition: 'background 0.3s'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: demoMode ? '18px' : '2px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                }}></div>
              </div>
            </div>

            <div className="active-status" style={{ width: '100%', flexBasis: '100%', justifyContent: 'flex-end' }}>
              {status.text && (
                <div 
                  className={`notification-pill ${status.type} animate-slideIn`} 
                  onClick={() => setStatus({ type: '', text: '' })}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1000 }}
                  title="Click to dismiss"
                >
                  {status.text}
                  <button style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <section className="viewport-container custom-scroll">
          <ViewportErrorBoundary
            activeView={activeMenu}
            onReset={() => {
              setActiveMenu('mission_launchpad');
              setStatus({ type: 'warn', text: 'Recovered from a Phase 2 viewport error.' });
            }}
          >
            {/* --- CENTRALIZED ROUTING MATRIX --- */}
            {(() => {
              let content = null;

              // Priority 1: Specialist Agent Mesh Crew Workspaces
              if (CREW_KEYS.includes(activeMenu)) {
                content = (
                  <AgentWorkspace
                    agentKey={activeMenu}
                    activeAgents={activeAgents}
                    onAgentModeChange={setAgentMode}
                    fullMeshState={fullAgentState}
                    onInvokeAgent={handleStandaloneAgentInvoke}
                    loadingNodes={loadingNodes}
                    telemetryState={manualTelemetry}
                    demoMode={demoMode}
                    standaloneEnabled={standaloneEnabled}
                  />
                );
              } else {
                // Priority 2: Primary Functional Modules
                switch (activeMenu) {
                  case 'mesh_observatory':
                    content = (
                      <MeshObservatory
                        topology={liveTopology}
                        taskId={currentTaskId}
                        loading={loading}
                        demoMode={demoMode}
                        factoryStep={factoryStep}
                        module={convergeModule}
                        depth={convergeDepth}
                        onReview={() => setActiveMenu('orchestration')}
                        onApprove={() => {
                          const contract = generatedMarkdown?.trim() || refinedUnifiedContent?.trim() || '';
                          const approvalContext = contract
                            ? `PRIMARY REQUIREMENT CONTRACT (REFINED):\n${contract}`
                            : '';
                          executeFactoryPhase2(approvalContext);
                        }}
                      />
                    );
                    break;

                  case 'orchestration':
                    content = (
                      <OrchestrationHub
                        reqStep={reqStep} factoryStep={factoryStep} loading={loading} status={status}
                        refinedUnifiedContent={refinedUnifiedContent} generatedMarkdown={generatedMarkdown}
                        planPayload={planPayload} fullAgentState={fullAgentState} downloadUrl={downloadUrl}
                        reasoningLogs={reasoningLogs} phase1Logs={phase1Logs} topology={liveTopology}
                        phase1Topology={phase1Topology} apiBase={API_BASE}
                        onApproveAndTriggerPhase2={executeFactoryPhase2}
                        onApproveContract={executeApproveContract}
                        onNavigateToFactory={() => setActiveMenu('test_case_factory')}
                        onResetMission={resetMission}
                        onClearSession={handleClearSession}
                        demoMode={demoMode}
                      />
                    );
                    break;

                  case 'mission_launchpad':
                    content = (
                      <MissionLaunchpad
                        activeModules={activeModules}
                        setActiveModules={setActiveModules}
                        activeAgents={activeAgents}
                        selectedDepth={meshDepth}
                        onDepthChange={handleDepthChange}
                        onLaunch={handleConvergeLaunch}
                        onNavigateToMesh={() => setActiveMenu('mesh_observatory')}
                        loading={loading}
                        status={status}
                        connectedPlatforms={connectedPlatforms}
                        platforms={platforms}
                      />
                    );
                    break;

                  case 'release_command':
                    content = (
                      <ReleaseCommandCenter
                        taskId={convergeTaskId || currentTaskId}
                        demoMode={demoMode}
                        fullMeshState={fullAgentState}
                      />
                    );
                    break;

                  case 'history_trends':
                    content = (
                      <HistoryTrends />
                    );
                    break;


                  case 'test_case_factory':
                    if (factoryStep < 5) {
                      content = (
                        <AgentWorkspace
                          agentKey="test_case_factory" activeAgents={activeAgents} onAgentModeChange={setAgentMode}
                          fullMeshState={fullAgentState} onInvokeAgent={handleStandaloneAgentInvoke}
                          loadingNodes={loadingNodes} telemetryState={manualTelemetry} demoMode={demoMode}
                          standaloneEnabled={standaloneEnabled}
                        />
                      );
                    } else {
                      content = (
                        <TestDeliveryDashboard
                          payload={planPayload} fullAgentState={fullAgentState} demoMode={demoMode}
                          markdown={generatedMarkdown} downloadUrl={downloadUrl} logs={reasoningLogs} apiBase={API_BASE}
                          topology={liveTopology} taskId={currentTaskId || ''}
                          onNewMission={() => { startNewMission(); }}
                        />
                      );
                    }
                    break;

                  case 'registry':
                    content = <AgentRegistry activeAgents={activeAgents} selectedDepth={meshDepth} onBatchUpdate={handleBatchAgentUpdate} onSingleUpdate={setAgentMode} />;
                    break;

                  case 'config_settings':
                    content = <ConfigSettings
                      logLevel={logLevel}
                      onLogLevelChange={setLogLevel}
                      sidebarFanOut={sidebarFanOut}
                      onSidebarFanOutChange={setSidebarFanOut}
                      useNodeCache={useNodeCache}
                      onUseNodeCacheChange={setUseNodeCache}
                    />;
                    break;

                  case 'settings':
                    content = (
                      <SettingsView
                        platforms={platforms} connectedPlatforms={connectedPlatforms} onOpenConfig={(id) => {
                          const pid = (id || '').toLowerCase();
                          const needsEmail = ['jira', 'confluence', 'testrail', 'servicenow'].includes(pid);
                          setConfigPlatformId(pid);
                          setConnectionStatus({ type: 'idle', message: '' });
                          setTempConfig(connectedPlatforms[pid] || { url: 'mock://vvnt', email: needsEmail ? 'user@enterprise.com' : '', token: 'mock' });
                          setShowConfigModal(true);
                        }} status={status} apiBase={API_BASE}
                        platformConnStatus={platformConnStatus}
                        onVaultStatusChange={setStandaloneEnabled}
                      />
                    );
                    break;

                  case 'knowledge':
                    content = <KnowledgeCenter knowledgeList={knowledgeList} onUpload={handleFileUpload} onDelete={handleKnowledgeDelete} uploading={uploading} status={status} apiBase={API_BASE} />;
                    break;

                  case 'history':
                    content = <MissionHistory />;
                    break;
                }
              }

              // UNMATCHED ROUTE FALLBACK (Prevents Blank Page)
              return content || (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px', textAlign: 'center', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '24px' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '20px' }}>ðŸ§­</div>
                  <h2 style={{ color: '#1e293b', fontWeight: 900, fontSize: '1.5rem', marginBottom: '8px' }}>Sovereign Viewport Optimized</h2>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '400px', lineHeight: 1.6 }}>
                    The requested node (<strong>{activeMenu}</strong>) is currently undergoing topological refinement. Return to Mission Control to resume orchestration.
                  </p>
                  <button onClick={() => setActiveMenu('registry')} className="btn-primary highlight" style={{ marginTop: '24px' }}>Return to Mission Control</button>
                </div>
              );
            })()}
          </ViewportErrorBoundary>
        </section>
      </main>

      <ViewportErrorBoundary
        activeView="overlays"
        onReset={() => {
          setShowExecutionLog(false);
          setShowRunHistory(false);
          setShowDebugWindow(false);
          setShowDebugWindow(false);
        }}
      >
        {showConfigModal && (<ConfigModal platformId={configPlatformId} config={tempConfig} setConfig={setTempConfig} onSave={testConnectionAndSave} onClose={() => setShowConfigModal(false)} status={connectionStatus} />)}


        {/* --- SIDEBAR FOOTER & MODALS --- */}

        {/* ── LIVE EXECUTION LOG PANEL ── */}
        <ExecutionLog
          taskId={historyLogTaskId || currentTaskId}
          isVisible={showExecutionLog}
          onClose={() => {
            setShowExecutionLog(false);
            setHistoryLogTaskId(null);
          }}
          setLiveLogs={setReasoningLogs}
          fullAgentState={fullAgentState}
          factoryStep={factoryStep}
        />

        {/* ── RUN HISTORY PANEL ── */}
        <RunHistory
          isVisible={showRunHistory}
          onClose={() => setShowRunHistory(false)}
          onOpenLog={(taskId) => {
            setHistoryLogTaskId(taskId);
            setShowExecutionLog(true);
          }}
        />

        {/* ── DEBUG WINDOW ── */}
        <DebugWindow
          taskId={currentTaskId}
          isVisible={showDebugWindow}
          onClose={() => setShowDebugWindow(false)}
        />
      </ViewportErrorBoundary>
    </div>
  );
};

const AppRoot: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!user) return <AuthGateway />;

  return <AppContent />;
};

const App: React.FC = () => {
  return (
    <AuthErrorBoundary>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </AuthErrorBoundary>
  );
};

export default App;
