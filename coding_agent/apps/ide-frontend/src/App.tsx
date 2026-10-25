import React, { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import {
  Zap, Settings, X, Download, FileCode,
  Loader, CheckCircle, AlertCircle, Upload, ChevronDown,
  ChevronRight, Trash2, MessageSquare, FolderOpen,
  Folder, Code2, Files, FileText, Terminal,
  Check, Search, Wrench, RefreshCw, ShieldCheck, AlertTriangle
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { MissionControl } from './MissionControl'
import { AssuranceWorkbench } from './AssuranceWorkbench'
import { evaluateUiTruthfulness, preserveFailedCompletionGate, type CompletionGatePayload } from './uiTruthfulness'
import { exportArtifactHash, normalizeExportFiles } from './projectArtifacts'
import './App.css'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FileTab { path: string; content: string }
interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: Record<string, TreeNode>
}

interface ComplianceCategory {
  name: string
  status: 'pass' | 'fail' | 'warn'
  details?: string
}

interface ComplianceIssue {
  id: string
  category: string
  severity: string
  file: string
  current: string
  expected: string
  fix: string
}

interface ComplianceResult {
  compliant: boolean
  score: number
  categories: ComplianceCategory[]
  issues: ComplianceIssue[]
}

// ─── Build folder tree from flat file paths ───────────────────────────────────
function buildTree(files: FileTab[]): TreeNode {
  const root: TreeNode = { name: 'root', path: '', isFile: false, children: {} }
  files.forEach(f => {
    const parts = f.path.split('/')
    let node = root
    parts.forEach((part, i) => {
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isFile: i === parts.length - 1,
          children: {}
        }
      }
      node = node.children[part]
    })
  })
  return root
}

// ─── File icon by extension ────────────────────────────────────────────────────
function fileColor(name: string): string {
  const ext = name.split('.').pop() || ''
  const m: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#61dafb',
    py: '#3572A5', json: '#f1c40f', md: '#a0aec0', css: '#264de4',
    html: '#e34c26', yaml: '#ff6347', yml: '#ff6347', sh: '#89e051',
    env: '#5c5c5c', toml: '#9c4221', sql: '#e38c00', go: '#00add8',
    rs: '#dea584', java: '#b07219', kt: '#A97BFF'
  }
  return m[ext] || '#8b949e'
}

// ─── Recursive Tree Node ───────────────────────────────────────────────────────
function TreeItem({ node, files, activeIdx, onSelect, depth = 0 }: {
  node: TreeNode; files: FileTab[]; activeIdx: number;
  onSelect: (idx: number) => void; depth?: number
}) {
  const [open, setOpen] = useState(true)
  const children = Object.values(node.children)
  const folders = children.filter(c => !c.isFile).sort((a, b) => a.name.localeCompare(b.name))
  const fileNodes = children.filter(c => c.isFile).sort((a, b) => a.name.localeCompare(b.name))
  const sorted = [...folders, ...fileNodes]

  if (node.isFile) {
    const idx = files.findIndex(f => f.path === node.path)
    const isActive = idx === activeIdx
    return (
      <div onClick={() => onSelect(idx)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: `6px 12px 6px ${16 + (depth < 0 ? 0 : depth) * 14}px`,
        cursor: 'pointer', borderRadius: 6,
        background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all 0.1s', margin: '1px 8px'
      }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-3)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        <FileCode size={14} style={{ color: fileColor(node.name), flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: isActive ? 'white' : 'var(--text-2)', fontWeight: isActive ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
    )
  }

  const childrenContent = sorted.map(child => (
    <TreeItem key={child.path} node={child} files={files} activeIdx={activeIdx} onSelect={onSelect} depth={depth + 1} />
  ))

  if (depth === -1) {
    return <div>{childrenContent}</div>
  }

  return (
    <div>
      <div onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: `7px 12px 7px ${12 + depth * 14}px`,
        cursor: 'pointer', transition: 'background 0.1s', margin: '1px 8px', borderRadius: 6
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-3)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        {open ? <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        {open
          ? <FolderOpen size={15} style={{ color: '#f7c948', flexShrink: 0 }} />
          : <Folder size={15} style={{ color: '#f7c948', flexShrink: 0 }} />}
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{node.name}</span>
      </div>
      {open && childrenContent}
    </div>
  )
}


// ─── Default Model ────────────────────────────────────────────────────────────
// Frontend uses a read-only metadata object from server/.env
interface LLMConfigInfo {
  provider: string
  model: string
  configured: boolean
  source: string
  status: string
  activeModel?: { id: string; name: string; provider: string; color: string }
}


// ─── Helpers ───────────────────────────────────────────────────────────────────
function langFromPath(path: string) {
  const ext = path.split('.').pop() || ''
  const m: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html',
    yaml: 'yaml', yml: 'yaml', sh: 'shell', env: 'ini', toml: 'ini',
    sql: 'sql', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  }
  return m[ext] || 'plaintext'
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [prd, setPrd] = useState(() => {
    try {
      return localStorage.getItem('ide_prd') || ''
    } catch { return '' }
  })

  useEffect(() => {
    localStorage.setItem('ide_prd', prd)
  }, [prd])

  const [llmInfo, setLlmInfo] = useState<LLMConfigInfo | null>(null)

  useEffect(() => {
    fetch('/api/llm/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.provider) {
          setLlmInfo(data)
        }
      })
      .catch(err => {
        console.log('[App] Could not fetch dynamic LLM config:', err.message)
      })
  }, [])

  const [validatedArtifactHash, setValidatedArtifactHash] = useState('')
  const [exportValidation, setExportValidation] = useState<any>(null)
  const [files, setFiles] = useState<FileTab[]>(() => {
    try {
      const stored = localStorage.getItem('ide_files')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  
  useEffect(() => {
    localStorage.setItem('ide_files', JSON.stringify(files))
  }, [files])

  const [activeIdx, setActiveIdx] = useState(0)
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error' | 'awaiting_approval'>(() => {
    try {
      const stored = localStorage.getItem('ide_status') as any
      if (stored && ['done', 'error', 'awaiting_approval'].includes(stored)) {
        return stored
      }
      const storedFiles = localStorage.getItem('ide_files')
      if (storedFiles && JSON.parse(storedFiles).length > 0) {
        return 'done'
      }
      return 'idle'
    } catch { return 'idle' }
  })

  useEffect(() => {
    try {
      localStorage.setItem('ide_status', status)
    } catch {}
  }, [status])

  const [viewMode, setViewMode] = useState<'dashboard' | 'ide' | 'assurance'>(() => {
    try {
      const stored = localStorage.getItem('ide_view_mode') as any
      return (stored === 'ide' || stored === 'dashboard' || stored === 'assurance') ? stored : 'dashboard'
    } catch { return 'dashboard' }
  })

  useEffect(() => {
    try {
      localStorage.setItem('ide_view_mode', viewMode)
    } catch {}
  }, [viewMode])

  const [errMsg, setErrMsg] = useState('')
  const [summary, setSummary] = useState(() => {
    try {
      return localStorage.getItem('ide_summary') || ''
    } catch { return '' }
  })

  useEffect(() => {
    try {
      localStorage.setItem('ide_summary', summary)
    } catch {}
  }, [summary])

  const [completionGate, setCompletionGate] = useState<CompletionGatePayload | null>(() => {
    try {
      const stored = localStorage.getItem('ide_completion_gate')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  useEffect(() => {
    try {
      if (completionGate) {
        localStorage.setItem('ide_completion_gate', JSON.stringify(completionGate))
      } else {
        localStorage.removeItem('ide_completion_gate')
      }
    } catch {}
  }, [completionGate])

  const [approvalState, setApprovalState] = useState<any>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<string, any>>(() => {
    try {
      const stored = localStorage.getItem('ide_file_statuses')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  useEffect(() => {
    try {
      localStorage.setItem('ide_file_statuses', JSON.stringify(fileStatuses))
    } catch {}
  }, [fileStatuses])

  const [pipelineState, setPipelineState] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('ide_pipeline_state')
      return stored ? JSON.parse(stored) : { phases: {}, modules: {} }
    } catch { return { phases: {}, modules: {} } }
  })

  useEffect(() => {
    try {
      localStorage.setItem('ide_pipeline_state', JSON.stringify(pipelineState))
    } catch {}
  }, [pipelineState])

  const [showSettings, setShowSettings] = useState(false)
  const [openclawLogs, setOpenclawLogs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('ide_openclaw_logs')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  useEffect(() => {
    try {
      const toStore = openclawLogs.slice(-250)
      localStorage.setItem('ide_openclaw_logs', JSON.stringify(toStore))
    } catch {}
  }, [openclawLogs])

  const [rightPanel, setRightPanel] = useState<'editor' | 'chat'>('editor')
  const [activeActivity, setActiveActivity] = useState<'prd' | 'explorer' | 'chat'>('prd')
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // ── Generation & Compliance Mode State ──
  const [generationMode, setGenerationMode] = useState<'new' | 'existing'>('new')
  const [existingSource, setExistingSource] = useState<'current' | 'zip'>('current')
  const [zipExtracting, setZipExtracting] = useState(false)
  const [zipError, setZipError] = useState('')
  const [zipFileName, setZipFileName] = useState('')
  const [projectName, setProjectName] = useState(() => {
    return localStorage.getItem('ide_project_name') || ''
  })

  useEffect(() => {
    if (projectName) {
      localStorage.setItem('ide_project_name', projectName)
    }
  }, [projectName])
  const [autoApprove, setAutoApprove] = useState(true)
  const [runtimeUrl, setRuntimeUrl] = useState(() => {
    try {
      return localStorage.getItem('ide_runtime_url') || ''
    } catch { return '' }
  })

  useEffect(() => {
    try {
      if (runtimeUrl) {
        localStorage.setItem('ide_runtime_url', runtimeUrl)
      } else {
        localStorage.removeItem('ide_runtime_url')
      }
    } catch {}
  }, [runtimeUrl])

  // Compliance State
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null)
  const [complianceError, setComplianceError] = useState('')
  const [fixLoading, setFixLoading] = useState(false)
  const [fixIteration, setFixIteration] = useState(0)
  const [maxFixReached, setMaxFixReached] = useState(false)

  // Scroll terminal to bottom
  React.useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [openclawLogs])

  // ── Upload PRD file ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => setPrd(ev.target?.result as string || '')
    reader.readAsText(f)
  }

  // ── Extract & Upload Project ZIP ──
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setZipError('Please select a valid .zip file.')
      return
    }
    setZipExtracting(true)
    setZipError('')
    setZipFileName(file.name)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      const extractedFiles: FileTab[] = []

      const filePromises: Promise<void>[] = []
      zip.forEach((relativePath, zipEntry) => {
        // Ignore directory entries and hidden/system metadata
        if (zipEntry.dir || relativePath.startsWith('__MACOSX/') || relativePath.includes('/.DS_Store') || relativePath === '.DS_Store') {
          return
        }
        // Normalize and sanitize paths to prevent path traversal
        const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
        if (
          normalizedPath.includes('../') ||
          normalizedPath.startsWith('../') ||
          normalizedPath.startsWith('/') ||
          normalizedPath.includes('..\\')
        ) {
          return // Skip unsafe traversal paths
        }

        filePromises.push(
          zipEntry.async('string').then(content => {
            extractedFiles.push({
              path: normalizedPath,
              content
            })
          })
        )
      })

      await Promise.all(filePromises)

      if (extractedFiles.length === 0) {
        throw new Error('No valid code files found inside the ZIP archive.')
      }

      // Sort alphabetically for clean tree view
      extractedFiles.sort((a, b) => a.path.localeCompare(b.path))

      // Uploaded ZIP replaces current project state
      setFiles(extractedFiles)
      setActiveIdx(0)
      setGenerationMode('existing')
      setExistingSource('zip')
      setComplianceResult(null)
      setComplianceError('')
      setMaxFixReached(false)
      setSummary(`Loaded ${extractedFiles.length} files from ${file.name}`)
      setActiveActivity('prd')
    } catch (err: any) {
      setZipError(err.message || 'Failed to extract ZIP file')
    } finally {
      setZipExtracting(false)
      if (e.target) e.target.value = ''
    }
  }

  // ── Compliance Audit & Fix Pipeline (Shared across all Existing Project sources) ──
  const runComplianceCompare = async (targetFiles: FileTab[] = files) => {
    if (!prd.trim()) {
      setComplianceError('No active Implementation Plan is available for comparison.');
      return null;
    }
    if (!targetFiles || targetFiles.length === 0) {
      setComplianceError('No project files loaded to compare. Select Current Workspace or Upload a ZIP.');
      return null;
    }

    setComplianceLoading(true);
    setComplianceError('');
    setMaxFixReached(false);

    try {
      const res = await fetch('/api/compliance/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd,
          files: targetFiles
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setComplianceResult(data);
      return data;
    } catch (err: any) {
      setComplianceError(err.message || 'Failed to analyze project compliance');
      return null;
    } finally {
      setComplianceLoading(false);
    }
  };

  const MAX_FIX_ITERATIONS = 3;

  const runComplianceFix = async (iter = 1) => {
    if (!complianceResult || !complianceResult.issues || complianceResult.issues.length === 0) return;
    if (iter > MAX_FIX_ITERATIONS) {
      setMaxFixReached(true);
      return;
    }

    setFixLoading(true);
    setFixIteration(iter);
    setMaxFixReached(false);
    setComplianceError('');

    try {
      const res = await fetch('/api/compliance/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd,
          files,
          issues: complianceResult.issues
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.files && Array.isArray(data.files)) {
        setFiles(data.files);
        setSummary(data.summary || `Applied fixes (Iteration ${iter})`);

        // Automatically re-compare after applying fixes!
        const reAudit = await runComplianceCompare(data.files);
        if (reAudit && !reAudit.compliant && reAudit.issues && reAudit.issues.length > 0) {
          if (iter >= MAX_FIX_ITERATIONS) {
            setMaxFixReached(true);
          }
        }
      }
    } catch (err: any) {
      setComplianceError(`Fix failed: ${err.message}`);
    } finally {
      setFixLoading(false);
    }
  };

  // ── Live File Synchronization ──
  const upsertGeneratedFile = (file: FileTab) => {
    setFiles(prev => {
      const idx = prev.findIndex(f => f.path === file.path);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = file;
        return next;
      }
      return [...prev, file];
    });
  };

  const deleteGeneratedFile = (filePath: string) => {
    setFiles(prev => prev.filter(f => f.path !== filePath));
  };

  // ── Generate ──
  const generate = useCallback(async (isResume: boolean = false) => {
    if (!prd.trim()) { setErrMsg('PRD is empty!'); setStatus('error'); return }

    const effectiveMode = isResume ? 'existing' : generationMode;
    const effectiveExistingFiles = effectiveMode === 'existing' ? files : []

    if (effectiveMode === 'new') {
      // FEATURE 1: Clear current workspace files and storage BEFORE generation starts
      setFiles([])
      localStorage.setItem('ide_files', '[]')
      setActiveIdx(0)
    }

    setValidatedArtifactHash('')
    setExportValidation(null)
    setStatus('generating')
    setErrMsg('')
    setSummary(isResume ? 'Resuming generation...' : '')
    if (!isResume) setOpenclawLogs([])

    if (!isResume) {
      setFileStatuses({})
      setPipelineState({ phases: {}, modules: {} })
      setCompletionGate(null)
      try {
        localStorage.removeItem('ide_completion_gate')
      } catch {}
    }
    setStatus('generating')

    const endpoint = '/api/openclaw/execute'
    let latestCompletionGate: CompletionGatePayload | null = null
    let streamDoneReceived = false
    let activeRepairs = 0

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd,
          projectName: (projectName || '').trim() || ('project_' + Date.now()),
          autoApprove,
          existingFiles: effectiveExistingFiles,
          generationMode: effectiveMode,
          existingProjectSource: effectiveMode === 'existing' ? existingSource : null
        })
      })

      if (!res.body) throw new Error("No response body")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // keep incomplete chunk in buffer
        
        for (const chunk of lines) {
          const eventMatch = chunk.match(/event:\s*([^\n]+)/)
          const dataMatch = chunk.match(/data:\s*([^\n]+)/)
          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1].trim()
            let eventData: any = {}
            try { eventData = JSON.parse(dataMatch[1].trim()) } catch {}
            if (eventData?.runtimeUrl) {
              setRuntimeUrl(eventData.runtimeUrl)
            }
            if (eventType === 'file') {
              if (eventData?.path && typeof eventData?.content === 'string') {
                upsertGeneratedFile({ path: eventData.path, content: eventData.content })
              }
            } else if (eventType === 'awaiting_approval') {
              setStatus('awaiting_approval')
              setSummary(eventData.message || 'Waiting for approval')
              setApprovalState(eventData)
            } else if (eventType === 'manifest_created') {
              setFileStatuses(prev => ({ ...prev, _manifest: { status: 'validated' } }))
            } else if (eventType === 'dependency_graph_ready' || eventType === 'dag_built') {
              setFileStatuses(prev => ({ ...prev, _dag: { status: 'validated' } }))
            } else if (eventType === 'project_validation_started') {
              setFileStatuses(prev => ({ ...prev, _project: { status: 'validating' } }))
            } else if (eventType === 'project_validation_completed') {
              setFileStatuses(prev => ({ ...prev, _project: { status: 'validated', score: eventData?.score } }))
            } else if (eventType === 'phase_started' || eventType === 'phase_completed') {
              setPipelineState((prev: any) => ({
                ...prev,
                phases: { ...prev.phases, [eventData.phase]: { ...(prev.phases[eventData.phase] || {}), status: eventType.replace('phase_', ''), ...eventData } }
              }))
            } else if (eventType === 'module_started' || eventType === 'module_completed' || eventType === 'module_failed' || eventType === 'module_blocked' || eventType === 'module_validation_started') {
              const moduleStatus: Record<string, string> = {
                module_started: 'GENERATING',
                module_completed: 'PASSED',
                module_failed: 'FAILED',
                module_blocked: 'BLOCKED_BY_DEPENDENCY',
                module_validation_started: 'VALIDATING'
              }
              setPipelineState((prev: any) => ({
                ...prev,
                modules: { ...prev.modules, [eventData.moduleId]: { ...(prev.modules[eventData.moduleId] || {}), status: moduleStatus[eventType] || 'UNKNOWN', ...eventData } }
              }))
            } else if (eventType === 'completion_gate') {
              activeRepairs = 0
              latestCompletionGate = eventData
              setCompletionGate(eventData)
              setExportValidation(eventData)
              if (eventData?.validatedArtifactHash) {
                setValidatedArtifactHash(eventData.validatedArtifactHash)
              }
            } else if (eventType === 'generation_completed') {
              activeRepairs = 0
              if (!latestCompletionGate) {
                latestCompletionGate = { status: 'FAIL', failedGates: ['missing_completion_gate'] }
              }
              setCompletionGate(latestCompletionGate)
              if (eventData?.validatedArtifactHash) {
                setValidatedArtifactHash(eventData.validatedArtifactHash)
              }
              if (latestCompletionGate?.status === 'PASS') {
                setStatus('done')
              }
            } else if (eventType === 'generation_failed_final_validation') {
              activeRepairs = 0
              latestCompletionGate = preserveFailedCompletionGate(latestCompletionGate, eventData)
              setCompletionGate(latestCompletionGate)
              setExportValidation(latestCompletionGate)
              setStatus('error')
            } else if (eventType === 'project_contract_validation') {
              if (eventData?.isValid === false) {
                const defects = eventData.defects || [];
                const defectCount = defects.length;
                const firstDefect = defects[0];
                const summaryMsg = `project_contract_validation: ${defectCount} defect(s) — ${firstDefect?.message || firstDefect?.reason || 'Validation failed'}`;
                setOpenclawLogs(prev => [...prev, summaryMsg]);
                setComplianceError(prev => {
                  const existing = prev || '';
                  const newDetail = `project_contract_validation: ${defects.map((d:any) => `${d.file || '?'}:${d.line || 1}:${d.code || ''}: ${d.message || d.reason}`).join(' | ')}`;
                  return existing ? `${existing}\n${newDetail}` : newDetail;
                });
              } else {
                setOpenclawLogs(prev => [...prev, 'project_contract_validation: Passed (0 defects)']);
              }
            } else if (['frontend_contract_failed', 'backend_runtime_failed', 'api_authz_failed', 'prd_coverage_failed', 'workflow_failed', 'workflow_blocked', 'import_closure_failed'].includes(eventType)) {
              const defects = eventData.defects || (eventData.message ? [eventData] : []);
              // Group defects into a single summarized log line instead of flooding
              const defectCount = defects.length;
              const firstDefect = defects[0];
              const summaryMsg = `${eventType}: ${defectCount} defect(s) — ${firstDefect?.message || firstDefect?.reason || 'Validation failed'}`;
              setOpenclawLogs(prev => [...prev, summaryMsg]);
              // Store detailed defects for per-box viewing
              setComplianceError(prev => {
                const existing = prev || '';
                const newDetail = `${eventType}: ${defects.map((d:any) => `${d.file || d.testFile || '?'}:${d.line || 1}:${d.code || ''}: ${d.message || d.reason}`).join(' | ')}`;
                return existing ? `${existing}\n${newDetail}` : newDetail;
              });
            } else if (eventType === 'repair_started') {
              activeRepairs++
            } else if (eventType === 'file_queued' || eventType === 'file_generating' || eventType === 'file_blocked' || eventType === 'validation_started' || eventType === 'validation_passed' || eventType === 'validation_failed' || eventType === 'file_validated' || eventType === 'file_failed') {
              if (eventType === 'file_validated' || eventType === 'validation_passed' || eventType === 'file_failed') {
                if (activeRepairs > 0) activeRepairs--
              }
              if (eventData?.path) {
                setFileStatuses(prev => ({
                  ...prev,
                  [eventData.path]: {
                    status: eventType.replace('file_', ''),
                    ...eventData
                  }
                }))
              }
            } else if (eventType === 'file_deleted') {
              if (eventData?.path) {
                deleteGeneratedFile(eventData.path)
              }
            } else if (eventType === 'project_initialized') {
              if (eventData?.provider && eventData?.model) {
                setLlmInfo(prev => ({
                  ...(prev || { configured: true, source: 'server', fallbacksConfigured: [], limits: { maxPrdChars: 95000, maxTokens: 8192, temperature: 0.2 } }),
                  provider: eventData.provider,
                  model: eventData.model,
                  status: 'active'
                } as LLMConfigInfo))
              }
            } else if (eventType.startsWith('llm_provider_')) {
              if (eventType === 'llm_provider_attempt' || eventType === 'llm_provider_selected') {
                setLlmInfo(prev => ({ 
                  ...(prev || { configured: true, source: 'server', fallbacksConfigured: [], limits: { maxPrdChars: 95000, maxTokens: 8192, temperature: 0.2 } }), 
                  provider: eventData.provider, 
                  model: eventData.model,
                  status: eventType === 'llm_provider_attempt' ? 'active' : 'completed'
                } as LLMConfigInfo))
              } else if (eventType === 'llm_provider_fallback') {
                setLlmInfo(prev => ({ 
                  ...(prev || { configured: true, source: 'server', fallbacksConfigured: [], limits: { maxPrdChars: 95000, maxTokens: 8192, temperature: 0.2 } }),
                  provider: eventData.to || prev?.provider,
                  status: 'fallback' 
                } as LLMConfigInfo))
                setOpenclawLogs(prev => [...prev, `🔄 LLM fallback\nFrom: ${eventData.from}\nTo: ${eventData.to}`])
              } else if (eventType === 'llm_provider_failed') {
                setOpenclawLogs(prev => [...prev, `⚠️ LLM Provider Failed (${eventData.provider}): ${eventData.reason}`])
              }
            } else if (eventType === 'log') {
              const msg = typeof eventData === 'string' ? eventData : (eventData.message || JSON.stringify(eventData))
              setOpenclawLogs(prev => [...prev, msg])
            } else if (eventType === 'error') {
              throw new Error(eventData.message || 'Generation error')
            } else if (eventType === 'done') {
              streamDoneReceived = true
              const truthResult = evaluateUiTruthfulness({
                completionGate: latestCompletionGate,
                donePayload: eventData,
                activeRepairsCount: activeRepairs
              })

              // Final snapshot is authoritative even when validation failed.
              if (Array.isArray(eventData.files)) setFiles(eventData.files)
              setExportValidation(eventData.report || null)
              setValidatedArtifactHash(truthResult.isSuccess ? eventData.artifactHash || '' : '')
              if (truthResult.isSuccess) {
                setSummary(truthResult.bannerMessage || `${eventData.files?.length || 0} files ready`)
                setStatus('done')
                setActiveIdx(0)
                setRightPanel('editor')
                setActiveActivity('explorer')
              } else {
                setStatus('error')
                setErrMsg(truthResult.bannerMessage)
                setSummary(`${truthResult.bannerTitle}: ${truthResult.bannerMessage}`)
              }
            }
          }
        }
      }

      if (!streamDoneReceived) {
        const truthResult = evaluateUiTruthfulness({
          completionGate: latestCompletionGate,
          streamDisconnectedAbruptly: true
        })
        setStatus('error')
        setErrMsg(truthResult.bannerMessage)
        setSummary(truthResult.bannerTitle)
      }
    } catch (e: any) {
      const truthResult = evaluateUiTruthfulness({
        hasTerminalError: true,
        terminalErrorMessage: e.message
      })
      setErrMsg(truthResult.bannerMessage)
      setStatus('error')
      setSummary(truthResult.bannerTitle)
    }
  }, [prd, projectName, autoApprove, files, generationMode, existingSource])


  // ── Chat ──
  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', text: msg }])
    setChatLoading(true)
    try {
      const updatedMessages = [...chatMessages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: msg }]
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          context: { prd, currentFile: files[activeIdx] }
        })
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}` }])
    }
    setChatLoading(false)
  }, [chatInput, chatLoading, chatMessages, prd, files, activeIdx])

  // ── Approval Handlers ──
  const handleApprovePhase = async () => {
    try {
      const res = await fetch('/api/openclaw/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', projectName: (projectName || '').trim() || 'current' })
      })
      if (!res.ok) throw new Error('Failed to approve phase')
      
      // Successfully approved. Now we reconnect the SSE stream to continue.
      generate(true)
    } catch (e: any) {
      setErrMsg(e.message)
      setStatus('error')
    }
  }

  const handleRequestChanges = async () => {
    try {
      const res = await fetch('/api/openclaw/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_changes', projectName: (projectName || '').trim() || 'current' })
      })
      if (!res.ok) throw new Error('Failed to request changes')
      alert("Change request logged! (Feature partially implemented)")
    } catch (e: any) {
      setErrMsg(e.message)
      setStatus('error')
    }
  }

  const downloadAll = async () => {
    try {
      const snapshot = normalizeExportFiles(files)
      let hash = ''
      try {
        hash = await exportArtifactHash(snapshot)
      } catch {
        hash = validatedArtifactHash || 'export-' + Date.now()
      }
      const verified = status === 'done' && !!validatedArtifactHash && hash === validatedArtifactHash
      const zip = new JSZip()
      snapshot.forEach(file => zip.file(file.path, file.content))
      if (!snapshot.some(file => file.path === 'README.md')) {
        zip.file('README.md', '# Incomplete generated project\n\nThis export has not passed final validation. See agent-validation.json for details.\n')
      }
      if (!snapshot.some(file => file.path === 'frontend/package.json') && snapshot.some(file => file.path.startsWith('frontend/'))) {
        zip.file('frontend/package.json', JSON.stringify({
          name: 'generated-frontend', private: true, version: '0.1.0', type: 'module',
          scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-router-dom': '^6.22.0', axios: '^1.6.0' },
          devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', typescript: '^5.2.2', vite: '^5.0.0' }
        }, null, 2) + '\n')
      }
      if (!snapshot.some(file => file.path === 'backend/requirements.txt') && snapshot.some(file => file.path.startsWith('backend/'))) {
        zip.file('backend/requirements.txt', 'fastapi\nuvicorn[standard]\nsqlalchemy\npydantic\npython-jose[cryptography]\npython-multipart\nhttpx\npython-dotenv\n')
      }
      if (!snapshot.some(file => file.path === 'start.bat')) {
        zip.file('start.bat', '@echo off\nstart cmd /k "cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000"\nstart cmd /k "cd frontend && npm install && npm run dev"\n')
      }
      zip.file('agent-validation.json', JSON.stringify({
        status: verified ? 'VERIFIED' : 'INCOMPLETE',
        artifactHash: hash,
        validatedArtifactHash: validatedArtifactHash || null,
        failedGates: exportValidation?.failedGates || [],
        editedSinceValidation: !!validatedArtifactHash && hash !== validatedArtifactHash
      }, null, 2))
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, verified ? 'project-verified.zip' : 'project-incomplete.zip')
    } catch (error: any) { setErrMsg(`Export failed: ${error.message}`) }
  }

  const activeFile = files[activeIdx]

  const handleResetToNewProject = () => {
    setStatus('idle')
    setSummary('')
    setErrMsg('')
    setCompletionGate(null)
    setValidatedArtifactHash('')
    setExportValidation(null)
    setOpenclawLogs([])
    setFileStatuses({})
    setPipelineState({ phases: {}, modules: {} })
    setRuntimeUrl('')
    setProjectName('')
    setPrd('')
    setFiles([])
    try {
      localStorage.removeItem('ide_status')
      localStorage.removeItem('ide_summary')
      localStorage.removeItem('ide_completion_gate')
      localStorage.removeItem('ide_file_statuses')
      localStorage.removeItem('ide_pipeline_state')
      localStorage.removeItem('ide_openclaw_logs')
      localStorage.removeItem('ide_runtime_url')
      localStorage.removeItem('ide_project_name')
      localStorage.removeItem('ide_prd')
      localStorage.removeItem('ide_files')
      localStorage.removeItem('ide_view_mode')
    } catch {}
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (viewMode === 'dashboard') {
    return (
      <MissionControl 
        openclawLogs={openclawLogs} 
        summary={summary} 
        llmInfo={llmInfo} 
        files={files} 
        fileStatuses={fileStatuses} 
        pipelineState={pipelineState} 
        complianceError={complianceError}
        projectName={projectName}
        setProjectName={setProjectName}
        prd={prd}
        setPrd={setPrd}
        autoApprove={autoApprove}
        setAutoApprove={setAutoApprove}
        onStartGeneration={() => generate(false)}
        onResetToNewProject={handleResetToNewProject}
        workspacePath={projectName ? `workspaces/${projectName}` : ''}
        status={status}
        runtimeUrl={runtimeUrl}
        completionGate={completionGate}
        onOpenAssurance={() => setViewMode('assurance')}
        onSwitchToIDE={(filePath?: string) => {
          if (filePath) {
            const idx = files.findIndex(f => f.path === filePath)
            if (idx !== -1) setActiveIdx(idx)
          }
          setViewMode('ide')
        }} 
      />
    );
  }

  if (viewMode === 'assurance') {
    return (
      <AssuranceWorkbench
        projectName={projectName}
        workspacePath={projectName ? `workspaces/${projectName}` : ''}
        prd={prd}
        onSwitchToIDE={() => setViewMode('ide')}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-editor)', overflow: 'hidden', color: 'var(--text-1)' }}>
      {/* ── Main Area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Activity Bar ── */}
        <div style={{ width: 56, background: 'var(--bg-activity)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, flexShrink: 0, zIndex: 20, borderRight: '1px solid var(--border)' }}>
          <button onClick={() => setViewMode('dashboard')} className="activity-btn" style={{ 
            color: 'var(--accent)', 
            background: 'transparent', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center'
          }} title="Mission Control Dashboard">
            <Zap size={24} />
          </button>
          <button onClick={() => { setViewMode('ide'); setActiveActivity('explorer'); }} className={`activity-btn ${activeActivity === 'explorer' ? 'active' : ''}`} style={{ 
            color: activeActivity === 'explorer' ? 'var(--text-active)' : 'var(--text-3)', 
            background: 'transparent', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center'
          }} title="Explorer">
            <Files size={24} />
          </button>
          <button onClick={() => { setViewMode('ide'); setActiveActivity('prd'); }} className={`activity-btn ${activeActivity === 'prd' ? 'active' : ''}`} style={{ 
            color: activeActivity === 'prd' ? 'var(--text-active)' : 'var(--text-3)', 
            background: 'transparent', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center'
          }} title="Product Requirements">
            <FileText size={24} />
          </button>

          <button onClick={() => setViewMode('assurance')} className="activity-btn" style={{ 
            color: '#38bdf8', 
            background: 'transparent', padding: '12px 0', width: '100%', display: 'flex', justifyContent: 'center'
          }} title="CONVERGE Engineering Assurance & Governance (59-Node Mesh)">
            <ShieldCheck size={24} />
          </button>
          
          <div style={{ flex: 1 }} />

          <button onClick={() => setShowSettings(true)} className="activity-btn" style={{ 
            color: 'var(--text-3)', background: 'transparent', padding: '16px 0', width: '100%', display: 'flex', justifyContent: 'center'
          }} title="Settings">
            <Settings size={24} />
          </button>
        </div>

        {/* ── Side Bar ── */}
        <div style={{ width: 300, background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid var(--border)' }}>
          {activeActivity === 'prd' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Requirements</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="file" ref={fileRef} onChange={handleFileUpload} accept=".txt,.md,.pdf" style={{ display: 'none' }} />
                  <button onClick={() => fileRef.current?.click()} style={{ background: 'transparent', color: 'var(--text-1)' }} title="Upload PRD"><Upload size={14} /></button>
                  {prd && <button onClick={() => { setPrd(''); setFiles([]); setStatus('idle') }} style={{ background: 'transparent', color: 'var(--text-1)' }} title="Clear"><Trash2 size={14} /></button>}
                </div>
              </div>

              {/* Project Identifier & Workspace Isolation */}
              <div style={{ padding: '0 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)', fontWeight: 600 }}>
                    Project Identifier
                  </label>
                  <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
                    ISOLATED
                  </span>
                </div>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  disabled={status === 'generating'}
                  placeholder="e.g. expense_manager"
                  style={{
                    width: '100%',
                    background: 'var(--bg-editor)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '5px 8px',
                    color: 'var(--text-1)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  Workspace: <code style={{ color: '#93c5fd' }}>workspaces/{projectName || 'project'}</code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <input
                    type="checkbox"
                    id="autoApproveToggle"
                    checked={autoApprove}
                    onChange={e => setAutoApprove(e.target.checked)}
                    disabled={status === 'generating'}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="autoApproveToggle" style={{ fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                    Auto-Approve Gates (E2E)
                  </label>
                </div>
              </div>
              <textarea
                value={prd} onChange={e => setPrd(e.target.value)}
                placeholder={`Paste your PRD here...\n\nExample:\n# Feature: Authentication\n\nBuild auth system with:\n- Email/password\n- JWT tokens`}
                style={{ flex: 1, background: 'transparent', border: 'none', resize: 'none', color: 'var(--text-1)', fontSize: 13, padding: '0 16px 16px', outline: 'none' }}
              />
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                {/* Generation Mode Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)', fontWeight: 600 }}>
                    Generation Mode
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: 'var(--bg-editor)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('new')}
                      disabled={status === 'generating'}
                      style={{
                        padding: '6px 4px',
                        fontSize: 11,
                        fontWeight: generationMode === 'new' ? 600 : 400,
                        background: generationMode === 'new' ? 'var(--accent)' : 'transparent',
                        color: generationMode === 'new' ? '#fff' : 'var(--text-2)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: status === 'generating' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        transition: 'all 0.15s'
                      }}
                    >
                      <span>🆕</span> New Project
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('existing')}
                      disabled={status === 'generating'}
                      style={{
                        padding: '6px 4px',
                        fontSize: 11,
                        fontWeight: generationMode === 'existing' ? 600 : 400,
                        background: generationMode === 'existing' ? 'var(--accent)' : 'transparent',
                        color: generationMode === 'existing' ? '#fff' : 'var(--text-2)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: status === 'generating' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        transition: 'all 0.15s'
                      }}
                    >
                      <span>🔄</span> Existing Project
                    </button>
                  </div>
                </div>

                {/* Existing Project Source Sub-Selector & Compliance Controls */}
                {generationMode === 'existing' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Input Source Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--bg-editor)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                        How do you want to continue?
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setExistingSource('current')}
                          disabled={complianceLoading || fixLoading}
                          style={{
                            padding: '6px 4px',
                            fontSize: 11,
                            fontWeight: existingSource === 'current' ? 600 : 400,
                            background: existingSource === 'current' ? 'rgba(139,92,246,0.25)' : 'var(--bg-sidebar)',
                            color: existingSource === 'current' ? '#fff' : 'var(--text-2)',
                            border: existingSource === 'current' ? '1px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 4,
                            cursor: (complianceLoading || fixLoading) ? 'not-allowed' : 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          📂 Current ({files.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExistingSource('zip')
                            if (files.length === 0 || !zipFileName) {
                              zipInputRef.current?.click()
                            }
                          }}
                          disabled={complianceLoading || fixLoading}
                          style={{
                            padding: '6px 4px',
                            fontSize: 11,
                            fontWeight: existingSource === 'zip' ? 600 : 400,
                            background: existingSource === 'zip' ? 'rgba(139,92,246,0.25)' : 'var(--bg-sidebar)',
                            color: existingSource === 'zip' ? '#fff' : 'var(--text-2)',
                            border: existingSource === 'zip' ? '1px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 4,
                            cursor: (complianceLoading || fixLoading) ? 'not-allowed' : 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          📦 Upload ZIP
                        </button>
                      </div>

                      {/* ZIP Upload Area */}
                      {existingSource === 'zip' && (
                        <div style={{ marginTop: 2 }}>
                          <input
                            type="file"
                            ref={zipInputRef}
                            onChange={handleZipUpload}
                            accept=".zip"
                            style={{ display: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => zipInputRef.current?.click()}
                            disabled={zipExtracting || complianceLoading || fixLoading}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              fontSize: 11,
                              background: 'var(--bg-sidebar)',
                              color: 'var(--text-1)',
                              border: '1px dashed var(--border)',
                              borderRadius: 4,
                              cursor: (zipExtracting || complianceLoading || fixLoading) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                          >
                            {zipExtracting ? (
                              <><Loader size={12} className="spin" /> Extracting ZIP...</>
                            ) : zipFileName ? (
                              <><span style={{ color: 'var(--green)' }}>✓</span> {zipFileName} (Change)</>
                            ) : (
                              <><Upload size={12} /> Select .zip project file</>
                            )}
                          </button>
                          {zipError && (
                            <div style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>
                              ⚠️ {zipError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Active Implementation Plan Status Banner */}
                    <div style={{
                      padding: '8px 10px',
                      background: prd.trim() ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)',
                      borderRadius: 6,
                      border: prd.trim() ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(239,68,68,0.2)',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6
                    }}>
                      {prd.trim() ? (
                        <>
                          <ShieldCheck size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
                          <div style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>
                            <strong style={{ color: '#93c5fd' }}>Active Implementation Plan:</strong> Reusing currently active plan ({prd.length} chars)
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                          <div style={{ color: '#fca5a5', lineHeight: 1.4 }}>
                            No active Implementation Plan is available for comparison.
                          </div>
                        </>
                      )}
                    </div>

                    {/* Compare Button */}
                    <button
                      type="button"
                      onClick={() => runComplianceCompare(files)}
                      disabled={complianceLoading || fixLoading || !prd.trim() || files.length === 0}
                      className="btn-primary"
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: 12,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 6,
                        opacity: (complianceLoading || fixLoading || !prd.trim() || files.length === 0) ? 0.6 : 1,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                      }}
                    >
                      {complianceLoading ? (
                        <><Loader size={13} className="spin" /> Comparing with Plan...</>
                      ) : (
                        <><Search size={13} /> Compare with Implementation Plan</>
                      )}
                    </button>

                    {/* Compliance Error */}
                    {complianceError && (
                      <div style={{ color: '#f87171', fontSize: 11, padding: 6, background: 'rgba(239,68,68,0.1)', borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)' }}>
                        ⚠️ {complianceError}
                      </div>
                    )}

                    {/* Structured Compliance Results Card */}
                    {complianceResult && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 10,
                        background: 'var(--bg-editor)',
                        borderRadius: 6,
                        border: '1px solid var(--border)'
                      }}>
                        {/* Score Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)' }}>
                            Compliance Score
                          </div>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: complianceResult.score >= 90 ? 'rgba(34,197,94,0.2)' : complianceResult.score >= 70 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                            color: complianceResult.score >= 90 ? '#4ade80' : complianceResult.score >= 70 ? '#fbbf24' : '#f87171',
                            border: `1px solid ${complianceResult.score >= 90 ? 'rgba(34,197,94,0.4)' : complianceResult.score >= 70 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'}`
                          }}>
                            {complianceResult.score}%
                          </div>
                        </div>

                        {/* Category Checkmarks / Badges */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                          {complianceResult.categories.map((cat, idx) => (
                            <div
                              key={idx}
                              title={cat.details}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '3px 6px',
                                borderRadius: 4,
                                background: 'var(--bg-sidebar)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-1)'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>{cat.name}</span>
                              <span style={{
                                fontWeight: 700,
                                color: cat.status === 'pass' ? '#4ade80' : cat.status === 'warn' ? '#fbbf24' : '#f87171'
                              }}>
                                {cat.status === 'pass' ? '✓' : '✗'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Issues Found List */}
                        {complianceResult.issues && complianceResult.issues.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                              Issues Found: {complianceResult.issues.length}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
                              {complianceResult.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    fontSize: 11,
                                    padding: '5px 6px',
                                    borderRadius: 4,
                                    background: 'var(--bg-sidebar)',
                                    border: '1px solid var(--border)',
                                    lineHeight: 1.3
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 600, color: '#93c5fd' }}>{issue.file}</span>
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '1px 4px',
                                      borderRadius: 3,
                                      background: issue.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                      color: issue.severity === 'high' ? '#f87171' : '#fbbf24'
                                    }}>
                                      {issue.severity.toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={{ color: 'var(--text-2)', fontSize: 10 }}>
                                    {issue.expected || issue.current}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Fix / Re-Verify Actions */}
                        {complianceResult.compliant || complianceResult.issues.length === 0 ? (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6
                          }}>
                            <div style={{
                              background: 'rgba(34,197,94,0.12)',
                              color: '#4ade80',
                              padding: '7px 8px',
                              borderRadius: 4,
                              textAlign: 'center',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid rgba(34,197,94,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}>
                              <Check size={13} /> Implementation Plan Compliance Passed
                            </div>
                            <button
                              type="button"
                              onClick={() => runComplianceCompare(files)}
                              disabled={complianceLoading || fixLoading}
                              style={{
                                width: '100%',
                                padding: '5px',
                                fontSize: 11,
                                background: 'var(--bg-sidebar)',
                                color: 'var(--text-2)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4
                              }}
                            >
                              <RefreshCw size={11} /> Re-Verify
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                            {maxFixReached && (
                              <div style={{ color: '#fbbf24', fontSize: 10, background: 'rgba(245,158,11,0.1)', padding: 6, borderRadius: 4, border: '1px solid rgba(245,158,11,0.3)' }}>
                                ⚠️ Maximum automatic fix iterations (3) reached. Review remaining issues.
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => runComplianceFix(fixIteration + 1)}
                              disabled={fixLoading || complianceLoading}
                              style={{
                                width: '100%',
                                padding: '7px',
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 4,
                                cursor: (fixLoading || complianceLoading) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6
                              }}
                            >
                              {fixLoading ? (
                                <><Loader size={13} className="spin" /> Fixing Issues (Iter {fixIteration}/{MAX_FIX_ITERATIONS})...</>
                              ) : (
                                <><Wrench size={13} /> Fix Issues (AI)</>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => runComplianceCompare(files)}
                              disabled={complianceLoading || fixLoading}
                              style={{
                                width: '100%',
                                padding: '5px',
                                fontSize: 11,
                                background: 'var(--bg-sidebar)',
                                color: 'var(--text-2)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4
                              }}
                            >
                              <Search size={11} /> Re-Compare
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* New Project Generation Button */
                  <button
                    onClick={() => generate(false)}
                    disabled={status === 'generating' || zipExtracting}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: 13,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 6,
                      opacity: (status === 'generating' || zipExtracting) ? 0.7 : 1
                    }}
                  >
                    {status === 'generating' ? <><Loader size={14} className="spin" /> Building...</> : <><Zap size={14} /> Generate Code</>}
                  </button>
                )}
              </div>
            </div>
          )}
          {activeActivity === 'explorer' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Explorer</span>
                {files.length > 0 && <button onClick={downloadAll} style={{ background: 'transparent', color: 'var(--text-1)' }} title={status === 'done' && validatedArtifactHash ? 'Download validated ZIP' : 'Download incomplete project ZIP'}><Download size={14} /></button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {files.length > 0 ? (
                  <TreeItem node={buildTree(files)} files={files} activeIdx={activeIdx} onSelect={(idx) => { setActiveIdx(idx); setRightPanel('editor') }} depth={-1} />
                ) : (
                  <div style={{ padding: '20px', color: 'var(--text-3)', fontSize: 12, textAlign: 'center' }}>No files generated yet.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Editor Group ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-editor)' }}>
          {files.length > 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', background: 'var(--bg-sidebar)', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
                <div className={`editor-tab ${rightPanel === 'editor' ? 'active' : ''}`} onClick={() => setRightPanel('editor')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: rightPanel === 'editor' ? 'var(--bg-editor)' : 'transparent', color: rightPanel === 'editor' ? 'var(--text-active)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontWeight: rightPanel === 'editor' ? 500 : 400 }}>
                  <FileCode size={14} style={{ color: rightPanel === 'editor' ? 'var(--accent)' : 'inherit' }} /> {activeFile?.path.split('/').pop() || 'Editor'}
                </div>
                <div className={`editor-tab ${rightPanel === 'chat' ? 'active' : ''}`} onClick={() => setRightPanel('chat')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: rightPanel === 'chat' ? 'var(--bg-editor)' : 'transparent', color: rightPanel === 'chat' ? 'var(--text-active)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontWeight: rightPanel === 'chat' ? 500 : 400 }}>
                  <MessageSquare size={14} style={{ color: rightPanel === 'chat' ? 'var(--accent)' : 'inherit' }} /> Chat
                </div>
              </div>
              
              {/* Editor */}
              {rightPanel === 'editor' && (
                <div style={{ flex: 1 }}>
                  <Editor
                    height="100%" language={langFromPath(activeFile?.path || '')} value={activeFile?.content || ''}
                    onChange={val => { setValidatedArtifactHash(''); setFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, content: val || '' } : f)) }}
                    theme="vs-dark" options={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, minimap: { enabled: true, scale: 0.7 }, padding: { top: 16 } }}
                  />
                </div>
              )}
              
              {/* Chat */}
              {rightPanel === 'chat' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-editor)' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {chatMessages.map((m, i) => (
                      <div key={i} style={{ marginBottom: 16, color: 'var(--text-1)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: m.role === 'user' ? 'var(--accent)' : 'var(--green)' }}>{m.role === 'user' ? 'You' : 'AI'}</div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                      </div>
                    ))}
                    {chatLoading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}><Loader size={12} className="spin" /> Thinking...</div>}
                  </div>
                  <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                    <input
                      value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                      placeholder="Ask a question..."
                      style={{ width: '100%', background: 'var(--bg-sidebar)', border: '1px solid var(--border)', padding: '8px 12px', color: 'var(--text-1)', borderRadius: 2 }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
              <div style={{ textAlign: 'center' }}>
                <Code2 size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <div style={{ fontSize: 16, color: 'var(--text-2)' }}>OpenClaw IDE</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Select "Product Requirements" to start building.</div>
              </div>
            </div>
          )}

          {/* Terminal */}
          {(openclawLogs.length > 0 || status === 'generating') && (
            <div style={{ height: files.length > 0 ? 200 : 280, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
              <div style={{ padding: '6px 12px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
                <Terminal size={12} /> Execution Log {status === 'generating' && <Loader size={10} className="spin" style={{ marginLeft: 6 }} />}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
                {openclawLogs.map((log, i) => {
                  const logStr = typeof log === 'string' ? log : (log as any)?.message || JSON.stringify(log);
                  const isSuccess = logStr.startsWith('✓');
                  const isWarn = logStr.startsWith('⚠️') || logStr.toLowerCase().includes('warning');
                  return (
                    <div key={i} style={{ marginBottom: 4, color: isSuccess ? '#4ade80' : isWarn ? '#facc15' : '#cccccc' }}>
                      {logStr}
                    </div>
                  );
                })}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>


      {/* ── Status Bar ── */}
      <div style={{ height: 22, background: 'var(--bg-status)', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, flexShrink: 0, gap: 16, zIndex: 30 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setShowSettings(true)}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
          ⚡ {llmInfo?.model || 'Loading...'} ({llmInfo?.provider ? llmInfo.provider.charAt(0).toUpperCase() + llmInfo.provider.slice(1) : ''})
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {status === 'generating' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader size={12} className="spin" /> Generating...</span>
              <button onClick={() => setViewMode('dashboard')} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                View Dashboard
              </button>
            </div>
          )}
          {status === 'awaiting_approval' && <><ShieldCheck size={12} style={{ color: '#facc15' }} /> {summary}</>}
          {status === 'done' && <><CheckCircle size={12} /> {summary}</>}
          {status === 'error' && <><AlertCircle size={12} /> {errMsg}</>}
          {status === 'idle' && <span>Ready</span>}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Legacy modes removed for strict orchestrator compliance */}
        </div>

      </div>

      {/* ── Approval Modal ── */}
      {status === 'awaiting_approval' && approvalState && (
        <div style={{ position: 'fixed', top: 32, right: 32, zIndex: 1000, pointerEvents: 'none' }}>
          <div style={{ width: 450, background: 'var(--bg-sidebar)', padding: 24, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 12px 48px rgba(0,0,0,0.8)', pointerEvents: 'auto' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={20} /> {approvalState.phase} Phase Complete
            </h2>
            <div style={{ background: 'var(--bg-editor)', padding: 16, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 24, fontSize: 13, lineHeight: '1.6', color: 'var(--text-1)' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', marginBottom: 12, fontWeight: 600 }}>
                 <CheckCircle size={14} /> Validation Passed
               </div>
               <p style={{ margin: '0 0 8px 0' }}>{approvalState.message}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={handleRequestChanges} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                Request Changes
              </button>
              <button onClick={handleApprovePhase} style={{ padding: '8px 16px', background: '#8b5cf6', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                APPROVE {approvalState.phase.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal (Read-Only LLM Configuration) ── */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ width: 480, background: 'var(--bg-sidebar)', padding: 24, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} style={{ color: '#8b5cf6' }} /> LLM Configuration
              </h3>
              <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
            </div>
            
            <div style={{ background: 'var(--bg-editor)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Active Provider</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                  {llmInfo?.provider ? llmInfo.provider.toUpperCase() : 'LOADING...'}
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Active Model</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                  {llmInfo?.model || 'Loading...'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Configuration Source</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>
                  {llmInfo?.source || '...'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Status</span>
                <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Active
                </span>
              </div>
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
              LLM provider, models, and endpoints are strictly managed by <code style={{ color: '#8b5cf6' }}>server/.env</code>.
            </p>

            <button onClick={() => setShowSettings(false)} className="btn-primary" style={{ width: '100%', padding: '10px', marginTop: 18, borderRadius: 4, fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
