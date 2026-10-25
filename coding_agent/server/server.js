import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
if (process.env?.OPENCLAW_LOAD_ENV !== 'false') dotenv.config({ path: path.join(__dirname, '.env'), override: true })

if (typeof process?.on === 'function') {
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err?.stack || err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason?.stack || reason)
  })
}

import express from 'express'
import cors from 'cors'
import fs from 'fs'
import crypto from 'crypto'
import { executeGeneration } from './orchestrator.js'
import {
  callLLM,
  getLLMClientConfig,
  getLLMConfig
} from './llmRouter.js'
import {
  checkAssuranceStatus,
  triggerAssuranceMission,
  getAssuranceTaskStatus,
  getAssuranceScorecard,
  applyAssuranceRemediation
} from './assuranceBridge.js'

const apiPort = Number(process.env?.PORT || 3001)
const frontendPort = process.env?.OPENCLAW_FRONTEND_PORT || '5174'
const app = express()
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const url = new URL(origin);
      const isAllowedPort = ['5174', '5173', '3001', '8000', frontendPort].includes(url.port);
      return callback(null, ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && isAllowedPort);
    } catch { return callback(null, false); }
  }
}))
app.use(express.json({ limit: '50mb' }))

// ─── Root Status Endpoint ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 24px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">🚀 IDE Backend Server is Active!</h2>
      <p style="color: #475569; margin-bottom: 20px;">This port (<strong>3001</strong>) handles backend API endpoints and LLM orchestration.</p>
      <a href="http://localhost:5174" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open Frontend Web IDE (Port 5174) &rarr;</a>
    </div>
  `)
})

// ─── IDE API Health Endpoint ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'OpenClaw IDE API', port: apiPort, timestamp: new Date().toISOString() })
})

// ─── Engineering Assurance CONVERGE Bridge Endpoints ─────────────────────────
app.get('/api/assurance/status', async (req, res) => {
  try {
    const status = await checkAssuranceStatus()
    res.json(status)
  } catch (err) {
    res.json({ connected: false, port: 8000, error: err.message })
  }
})

// Trigger a CONVERGE 59-node assurance run on active workspace
app.post('/api/assurance/mission', async (req, res) => {
  try {
    let workspacePath = req.body?.workspacePath || global.lastActiveWorkspacePath || process.cwd()
    if (req.body?.projectId) {
      const safeWs = resolveSafeWorkspace(req.body.projectId)
      workspacePath = safeWs.workspacePath
    }
    const result = await triggerAssuranceMission(workspacePath, req.body || {})
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get live assurance task progress & mesh topology
app.get('/api/assurance/tasks/:taskId', async (req, res) => {
  try {
    const status = await getAssuranceTaskStatus(req.params.taskId)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get comprehensive release decision, compliance pack, and economics
app.get('/api/assurance/scorecard/:taskId', async (req, res) => {
  try {
    const scorecard = await getAssuranceScorecard(req.params.taskId)
    res.json(scorecard)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Apply autonomous remediation from CONVERGE to workspace code
app.post('/api/assurance/remediate', async (req, res) => {
  try {
    let workspacePath = req.body?.workspacePath || global.lastActiveWorkspacePath || process.cwd()
    if (req.body?.projectId) {
      const safeWs = resolveSafeWorkspace(req.body.projectId)
      workspacePath = safeWs.workspacePath
    }
    const remediation = req.body?.remediation
    if (!remediation) {
      return res.status(400).json({ error: 'Missing remediation object' })
    }
    const result = await applyAssuranceRemediation(workspacePath, remediation)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Transparent proxy for CONVERGE product endpoints
app.all('/api/converge/*', async (req, res) => {
  try {
    const targetUrl = `http://127.0.0.1:8000${req.originalUrl}`
    const fetchOptions = {
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:8000' }
    }
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body)
      fetchOptions.headers['content-type'] = 'application/json'
    }
    const upstreamResp = await fetch(targetUrl, fetchOptions)
    res.status(upstreamResp.status)
    upstreamResp.headers.forEach((val, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, val)
      }
    })
    const data = await upstreamResp.text()
    res.send(data)
  } catch (proxyErr) {
    res.status(502).json({ error: 'Assurance backend gateway unreachable', details: proxyErr.message })
  }
})

// ─── Environment-Driven LLM Client Configuration Endpoint ─────────────────────
app.get('/api/llm/config', (req, res) => {
  try {
    const clientConfig = getLLMClientConfig()
    res.json(clientConfig)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Ollama / LLM Health Endpoint ─────────────────────────────────────────────
app.get('/api/llm/health', async (req, res) => {
  try {
    if (process.env.LLM_ENABLE_OLLAMA !== 'true') {
      return res.json({
        status: 'ok',
        activeProvider: 'cloud_fallback',
        ollama: { available: false, reason: 'disabled_in_config' }
      })
    }
    const config = getLLMConfig()
    if (!config.isOllamaEnabled) {
      return res.json({
        status: 'ok',
        activeProvider: 'cloud_fallback',
        ollama: { available: false, reason: 'disabled_in_config' }
      })
    }

    const tagsUrl = config.ollamaUrl.replace(/\/+$/, '') + '/api/tags'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    let resp
    try {
      resp = await fetch(tagsUrl, { signal: controller.signal })
    } catch (netErr) {
      clearTimeout(timeout)
      return res.status(503).json({
        status: 'error',
        error: 'OLLAMA_NOT_AVAILABLE',
        details: `Failed to connect to Ollama at ${config.ollamaUrl}: ${netErr.message}`
      })
    }
    clearTimeout(timeout)

    if (!resp.ok) {
      return res.status(503).json({
        status: 'error',
        error: 'OLLAMA_NOT_AVAILABLE',
        details: `Ollama returned HTTP ${resp.status}`
      })
    }

    const data = await resp.json()
    const modelNames = (data.models || []).map(m => m.name)
    const targetModel = config.ollamaModel.replace(/^ollama\//, '')
    const modelFound = modelNames.some(m => m === targetModel || m.startsWith(targetModel + ':'))

    return res.json({
      status: 'ok',
      activeProvider: 'ollama',
      ollama: {
        available: true,
        url: config.ollamaUrl,
        configuredModel: targetModel,
        modelInstalled: modelFound,
        availableModels: modelNames
      }
    })
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      error: 'OLLAMA_NOT_AVAILABLE',
      details: err.message
    })
  }
})

// ─── Workspace Isolation & Security Helper ────────────────────────────────────
export function resolveSafeWorkspace(projectIdOrName) {
  if (!projectIdOrName || typeof projectIdOrName !== 'string') {
    projectIdOrName = 'project_' + Date.now()
  }
  // Sanitize: allow alphanumeric, underscores, hyphens
  const sanitized = projectIdOrName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')

  // Prefer existing workspace directory if already present in server/workspaces or root workspaces
  const serverWorkspaces = path.resolve(__dirname, 'workspaces')
  const rootWorkspaces = path.resolve(__dirname, '..', 'workspaces')
  let baseWorkspaces = serverWorkspaces

  if (fs.existsSync(path.resolve(serverWorkspaces, sanitized))) {
    baseWorkspaces = serverWorkspaces
  } else if (fs.existsSync(path.resolve(rootWorkspaces, sanitized))) {
    baseWorkspaces = rootWorkspaces
  }

  const targetWorkspace = path.resolve(baseWorkspaces, sanitized)

  // Strict path traversal escape check
  if (!targetWorkspace.startsWith(baseWorkspaces) || targetWorkspace === baseWorkspaces) {
    throw new Error(`Security Violation: Unsafe workspace identifier: ${projectIdOrName}`)
  }

  if (!fs.existsSync(targetWorkspace)) {
    fs.mkdirSync(targetWorkspace, { recursive: true })
  }

  return { id: sanitized, workspacePath: targetWorkspace }
}

app.post('/api/client-error', (req, res) => {
  console.error('[BROWSER CLIENT ERROR]', req.body)
  res.json({ ok: true })
})

// ─── Parse Response from LLM ──────────────────────────────────────────────────

function parseFiles(text) {
  // 1. Strip thinking tags (DeepSeek R1)
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  const files = []

  // 2. Try parsing XML-like <file path="...">...</file> tags
  // This is much more robust than JSON, especially if the model's output gets cut off.
  const regex = /<file\s+path="([^"]+)">([\s\S]*?)(?:<\/file>|(?=<file\s+path=)|$)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim()
    const content = match[2].trim()
    if (path && content) {
      files.push({ path, content })
    }
  }

  if (files.length > 0) {
    return { files: convertTsToJs(files), summary: `Generated ${files.length} files` }
  }

  // 3. Fallback: extract markdown code blocks as separate files
  const codeBlocks = [...text.matchAll(/```(\w+)?\n([\s\S]*?)```/g)]
  if (codeBlocks.length > 0) {
    return {
      files: convertTsToJs(codeBlocks.map((m, i) => {
        const lang = m[1] || 'txt'
        const content = m[2].trim()
        const firstLine = content.split('\n')[0].trim()
        let path = `generated_${i + 1}.${lang}`
        const nameMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*)\s*([\w\-./]+\.\w+)/)
        if (nameMatch) {
          path = nameMatch[1]
        }
        return { path, content }
      })),
      summary: 'Generated from code blocks'
    }
  }

  // 4. Last resort: entire response as one file
  return { files: [{ path: 'output.md', content: text }], summary: 'Raw output' }
}

// ─── Auto-convert .ts backend files → .js ─────────────────────────────────────
// Guaranteed fix: no matter what the LLM outputs, plain .ts files become .js
function convertTsToJs(files) {
  return files.map(f => {
    // Convert .ts → .js, but keep .tsx (React) and .d.ts (type declarations) as-is
    if (f.path.endsWith('.ts') && !f.path.endsWith('.d.ts') && !f.path.endsWith('.tsx')) {
      console.log(`[TS→JS] Converting ${f.path} → ${f.path.replace(/\.ts$/, '.js')}`)
      return {
        ...f,
        path: f.path.replace(/\.ts$/, '.js'),
        content: stripTypeScript(f.content)
      }
    }
    return f
  })
}

// Strip TypeScript-specific syntax to produce valid plain JavaScript
function stripTypeScript(code) {
  // Remove "import type" lines
  code = code.replace(/^import\s+type\s+[^;\n]+;?\n?/gm, '')
  // Remove "export type" lines
  code = code.replace(/^export\s+type\s+[^;\n]+;?\n?/gm, '')
  // Remove interface declarations
  code = code.replace(/^(export\s+)?(default\s+)?interface\s+\w+[\s\S]*?\n\}/gm, '')
  // Remove type alias lines
  code = code.replace(/^(export\s+)?type\s+\w+\s*(<[^>]*>)?\s*=[\s\S]*?;\n?/gm, '')
  // Remove access modifiers
  code = code.replace(/\b(public|private|protected|readonly)\s+/g, '')
  // Remove type assertions "as Type"
  code = code.replace(/\s+as\s+[A-Za-z_][\w<>[\]|&, ]*/g, '')
  // Remove non-null assertions like obj!.prop → obj.prop
  code = code.replace(/(\w)!/g, '$1')
  // Remove generic type parameters like Array<string>, Map<string, any>
  code = code.replace(/<[A-Z][A-Za-z, [\]|&]*>/g, '')
  // Remove TS inline type annotations: param: Type, var x: string = ...
  code = code.replace(/(\w+)\s*:\s*(string|number|boolean|void|any|unknown|never|null|undefined|object|Promise|Record|Array|Function|Error)(\[\])?(\s*[,)=;\n{])/g, '$1$4')
  // Clean up excessive blank lines
  code = code.replace(/\n{3,}/g, '\n\n')
  return code.trim()
}






// ─── /api/chat ────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, context } = req.body

  let system = 'You are an expert AI coding assistant.'
  if (context?.prd) system += `\n\nPRD:\n${context.prd}`
  if (context?.currentFile) system += `\n\nCurrent file (${context.currentFile.path}):\n\`\`\`\n${context.currentFile.content?.slice(0, 3000)}\n\`\`\``

  const lastMsg = messages[messages.length - 1]?.content || ''
  try {
    const reply = await callLLM(system, lastMsg)
    res.json({ reply })
  } catch (e) {
    res.status(500).json({ reply: `Error: ${e.message}` })
  }
})

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// ─── /api/openclaw/execute (SSE) ─────────────────────────────────────────────

const handleExecuteGeneration = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })

  const { prd, existingFiles, generationMode, _existingProjectSource, autoApprove, projectName, projectId } = req.body
  if (!prd) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'PRD is required' })}\n\n`)
    return res.end()
  }

  // Workspace Isolation: Isolate project into workspaces/ unless explicitly existing
  let targetWorkspace = process.cwd()
  let targetId = 'root'
  if (projectName || projectId) {
    const safeWs = resolveSafeWorkspace(projectName || projectId)
    targetWorkspace = safeWs.workspacePath
    targetId = safeWs.id
  } else if (generationMode === 'new') {
    const safeWs = resolveSafeWorkspace('project_' + Date.now())
    targetWorkspace = safeWs.workspacePath
    targetId = safeWs.id
  }
  global.lastActiveWorkspacePath = targetWorkspace
  global.lastActiveProjectId = targetId

  const logDir = path.join(targetWorkspace, '.openclaw')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, 'execution.log')

  const sendEvent = (type, data) => {
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    } catch {}
    try {
      fs.appendFileSync(logFile, JSON.stringify({ timestamp: new Date().toISOString(), type, data }) + '\n')
    } catch {}
  }

  // Force clean existingFiles if in New Project mode
  const isExistingMode = generationMode === 'existing'
  const effectiveExistingFiles = isExistingMode && Array.isArray(existingFiles) ? existingFiles : []

  const generationId = crypto.randomUUID()
  global.activeGenerationId = generationId

  // Strict enforcement: Route directly to Orchestrator Engine.
  const llmConfig = getLLMConfig()
  const llmClientConfig = getLLMClientConfig()
  sendEvent('project_initialized', {
    projectId: targetId,
    workspacePath: path.relative(process.cwd(), targetWorkspace),
    provider: llmClientConfig.activeModel.provider,
    model: llmClientConfig.activeModel.name
  })
  sendEvent('log', `🚀 [project_initialized] Project ID: ${targetId} | Workspace: ${path.relative(process.cwd(), targetWorkspace)}`)
  sendEvent('log', `🤖 Booting Node.js OpenClaw Orchestrator...`)
  sendEvent('log', `⚡ Delegating implementation to centralized LLM engine (${llmClientConfig.activeModel.name})...`)

  try {
    if (prd.length > llmConfig.maxPrdChars) {
      throw new Error(`CRITICAL ERROR: PRD exceeds character limits (${prd.length} > ${llmConfig.maxPrdChars}). Truncation is strictly forbidden.`)
    }
    const trimmedPrd = prd

    await executeGeneration({
      prd: trimmedPrd,
      existingFiles: effectiveExistingFiles,
      generationMode,
      autoApprove: Boolean(autoApprove),
      workspacePath: targetWorkspace,
      generationId
    }, sendEvent)
  } catch (e) {
    console.error('CRITICAL EXECUTE ERROR:', e.stack)
    try {
      const vPath = path.join(targetWorkspace, 'agent-validation.json');
      if (!fs.existsSync(vPath)) {
        fs.writeFileSync(vPath, JSON.stringify({
          status: 'INCOMPLETE',
          completionStatus: 'INCOMPLETE',
          gateStatus: 'FAIL',
          failedGates: ['critical_execution_error'],
          passedGatesCount: 0,
          totalGates: 18,
          error: e.message
        }, null, 2));
      }
    } catch (_) {}
    sendEvent('error', { message: e.message, stack: e.stack })
  }

  res.end()
}

app.post('/api/openclaw/execute', handleExecuteGeneration)
app.post('/api/generate', handleExecuteGeneration)

// ─── POST /api/openclaw/resume (Phase Approval / Resume) ──────────────────────
app.post('/api/openclaw/resume', (req, res) => {
  try {
    const { action, projectName, projectId } = req.body || {}
    let targetWorkspace = global.lastActiveWorkspacePath || process.cwd()
    if (projectName || projectId) {
      const safeWs = resolveSafeWorkspace(projectName || projectId)
      targetWorkspace = safeWs.workspacePath
    }

    const manifestPath = path.join(targetWorkspace, '.openclaw/manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: 'No active generation manifest found to resume.', workspacePath: targetWorkspace })
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    if (action === 'approve') {
      if (manifest.globalStatus !== 'WAITING_FOR_APPROVAL') {
        return res.status(400).json({ error: 'Generation is not currently waiting for approval.' })
      }
      manifest.approvalState = Array.isArray(manifest.approvalState) ? manifest.approvalState : []
      manifest.approvalState.push({ phase: manifest.currentLayer, status: 'approved', timestamp: new Date().toISOString() })
      manifest.approvedLayer = manifest.currentLayer
      manifest.globalStatus = 'RUNNING'
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      return res.json({
        ok: true,
        action: 'approved',
        approvedLayer: manifest.approvedLayer,
        currentLayer: manifest.currentLayer,
        globalStatus: 'RUNNING'
      })
    } else if (action === 'request_changes') {
      manifest.changeRequested = true
      manifest.changeRequestNote = req.body?.notes || 'Change requested by user'
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      return res.json({
        ok: true,
        action: 'changes_recorded',
        globalStatus: manifest.globalStatus
      })
    } else {
      return res.status(400).json({ error: `Unknown resume action: ${action}. Expected 'approve' or 'request_changes'.` })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── REST Project Management Endpoints ─────────────────────────────────────────

// POST /api/projects - Create/register a new project workspace
app.post('/api/projects', (req, res) => {
  try {
    const { name, prd } = req.body
    const { id, workspacePath } = resolveSafeWorkspace(name || ('project_' + Date.now()))
    const metaPath = path.join(workspacePath, 'project.json')
    const metadata = {
      id,
      name: name || id,
      prd: prd || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspacePath: path.relative(process.cwd(), workspacePath)
    }
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))
    res.status(201).json(metadata)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/projects - List all projects across workspace locations
app.get('/api/projects', (req, res) => {
  try {
    const searchBases = [
      path.resolve(process.cwd(), 'workspaces'),
      path.resolve(__dirname, 'workspaces'),
      path.resolve(__dirname, '..', 'workspaces')
    ].filter((p, i, arr) => fs.existsSync(p) && arr.indexOf(p) === i)

    const projectsMap = new Map()

    for (const baseWorkspaces of searchBases) {
      const dirs = fs.readdirSync(baseWorkspaces, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

      for (const dirName of dirs) {
        if (projectsMap.has(dirName)) continue
        const metaPath = path.join(baseWorkspaces, dirName, 'project.json')
        const manifestPath = path.join(baseWorkspaces, dirName, '.openclaw/manifest.json')
        const reportPath = path.join(baseWorkspaces, dirName, '.openclaw/generation-report.json')

        let meta = { id: dirName, name: dirName, workspacePath: path.relative(process.cwd(), path.join(baseWorkspaces, dirName)) }
        if (fs.existsSync(metaPath)) {
          try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) } } catch {}
        }
        projectsMap.set(dirName, {
          ...meta,
          hasManifest: fs.existsSync(manifestPath),
          hasReport: fs.existsSync(reportPath)
        })
      }
    }

    res.json({ projects: Array.from(projectsMap.values()) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/projects/:id/files - Get all workspace files from disk
app.get('/api/projects/:id/files', (req, res) => {
  try {
    const { id, workspacePath } = resolveSafeWorkspace(req.params.id)
    if (!fs.existsSync(workspacePath)) {
      return res.status(404).json({ error: 'Workspace does not exist' })
    }

    const files = []
    const ignoredDirs = new Set(['node_modules', '.venv', '.venv-ide', '.venv-runtime', '.git', '__pycache__', '.pytest_cache'])

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
            scanDir(path.join(dir, entry.name))
          }
        } else if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name)
          const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/')
          try {
            const stat = fs.statSync(fullPath)
            if (stat.size < 2 * 1024 * 1024) {
              const content = fs.readFileSync(fullPath, 'utf8')
              files.push({ path: relPath, content })
            }
          } catch {}
        }
      }
    }

    scanDir(workspacePath)
    res.json({ id, count: files.length, files })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/projects/:id - Get project metadata and manifest
app.get('/api/projects/:id', (req, res) => {
  try {
    const { id, workspacePath } = resolveSafeWorkspace(req.params.id)
    const metaPath = path.join(workspacePath, 'project.json')
    const manifestPath = path.join(workspacePath, '.openclaw/manifest.json')

    let meta = { id, workspacePath: path.relative(process.cwd(), workspacePath) }
    if (fs.existsSync(metaPath)) {
      try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) } } catch {}
    }

    let manifest = null
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch {}
    }

    res.json({ ...meta, manifest })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/projects/:id/status - Get execution status
app.get('/api/projects/:id/status', (req, res) => {
  try {
    const { id, workspacePath } = resolveSafeWorkspace(req.params.id)
    const manifestPath = path.join(workspacePath, '.openclaw/manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return res.json({ id, status: 'NOT_STARTED', message: 'Project has not been executed yet.' })
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    res.json({
      id,
      globalStatus: manifest.globalStatus || 'UNKNOWN',
      currentLayer: manifest.currentLayer || null,
      approvedLayer: manifest.approvedLayer || null,
      modulesCount: manifest.modules?.length || 0,
      modules: (manifest.modules || []).map(m => ({
        id: m.id,
        name: m.name,
        layer: m.layer,
        status: m.status,
        requiredFiles: m.required_files?.length || 0
      }))
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/projects/:id/logs - Get execution logs
app.get('/api/projects/:id/logs', (req, res) => {
  try {
    const { workspacePath } = resolveSafeWorkspace(req.params.id)
    const logPath = path.join(workspacePath, '.openclaw/execution.log')
    if (!fs.existsSync(logPath)) {
      return res.json({ logs: [] })
    }
    const content = fs.readFileSync(logPath, 'utf8')
    const logs = content.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line) } catch { return { message: line } }
    })
    res.json({ logs })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/projects/:id/results - Get completion results
app.get('/api/projects/:id/results', (req, res) => {
  try {
    const { id, workspacePath } = resolveSafeWorkspace(req.params.id)
    const reportPath = path.join(workspacePath, '.openclaw/generation-report.json')
    const manifestPath = path.join(workspacePath, '.openclaw/manifest.json')
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Results not available yet. Project has not completed generation.' })
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    let manifest = null
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch {}
    }
    res.json({
      id,
      report,
      globalStatus: manifest?.globalStatus || 'COMPLETED',
      score: report.score || 0,
      isValid: report.isValid || false
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/projects/:id/execute (SSE execution stream for a specific project)
app.post('/api/projects/:id/execute', async (req, res) => {
  const { id, workspacePath } = resolveSafeWorkspace(req.params.id)
  const { prd, autoApprove, generationMode } = req.body
  if (!prd) {
    return res.status(400).json({ error: 'PRD is required' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })

  const logDir = path.join(workspacePath, '.openclaw')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, 'execution.log')

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
    try {
      fs.appendFileSync(logFile, JSON.stringify({ timestamp: new Date().toISOString(), type, data }) + '\n')
    } catch {}
  }

  const generationId = crypto.randomUUID()
  global.activeGenerationId = generationId
  const llmClientConfig = getLLMClientConfig()
  sendEvent('project_initialized', {
    projectId: id,
    workspacePath: path.relative(process.cwd(), workspacePath),
    provider: llmClientConfig.activeModel.provider,
    model: llmClientConfig.activeModel.name
  })
  sendEvent('log', `🚀 [project_started] Executing project ${id} in isolated workspace: ${path.relative(process.cwd(), workspacePath)}`)

  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: generationMode || 'new',
      autoApprove: Boolean(autoApprove),
      workspacePath,
      generationId
    }, sendEvent)
  } catch (err) {
    sendEvent('error', { message: err.message })
  }

  res.end()
})

// ─── Compliance Audit & Fix Endpoints ─────────────────────────────────────────

app.post('/api/compliance/compare', async (req, res) => {
  const { prd, files } = req.body || {};
  if (typeof prd !== 'string' || !prd.trim()) return res.status(400).json({ error: 'Implementation Plan (PRD) is required' });
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No project files provided for comparison' });
  }

  if (files.some(f => !f || typeof f.path !== 'string' || typeof f.content !== 'string')) {
    return res.status(400).json({ error: 'Each file must have a string path and content' });
  }

  try {
    const llmConfig = getLLMConfig();
    const maxPlanChars = llmConfig.maxPrdChars;

    // Safe limit for OLLAMA_NUM_CTX=8192 is ~30k characters total per request.
    // We set BATCH_CHAR_LIMIT to 15000 to process the project in moderate batches.
    const BATCH_CHAR_LIMIT = 15000;

    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const f of files) {
      const fLen = (f.content || '').length + f.path.length + 50;
      if (fLen > BATCH_CHAR_LIMIT && currentBatch.length === 0) {
        batches.push([f]);
      } else if (currentChars + fLen > BATCH_CHAR_LIMIT) {
        batches.push(currentBatch);
        currentBatch = [f];
        currentChars = fLen;
      } else {
        currentBatch.push(f);
        currentChars += fLen;
      }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const auditSystem = `You are an EXTREMELY STRICT Principal Software Auditor auditing an EXISTING PROJECT against its IMPLEMENTATION PLAN.

CRITICAL INSTRUCTIONS:
1. Do NOT assume the project is complete. It is likely a skeleton.
2. IMPORTANT: You are auditing a PARTIAL batch of files. Do NOT report any missing features or missing files if they are not explicitly supposed to be in the files provided in this batch. Assume all other files exist perfectly in other batches.
3. ONLY report issues for the files currently provided in this batch (e.g., incorrect logic, placeholders, or bugs within the provided code). Do not complain about missing files.
4. Calculate the score (0-100) based on the quality of the provided files matching the PRD.

CRITICAL: Return ONLY a valid, raw JSON object (NO markdown fences) matching this schema:
{
  "compliant": boolean,
  "score": number,
  "categories": [
    { "name": "Frontend", "status": "pass", "details": "Matches React/TypeScript requirement" }
  ],
  "issues": [
    {
      "id": "ISSUE-1",
      "category": "Authentication",
      "severity": "high",
      "file": "backend/middleware/auth.js",
      "current": "Auth middleware file does not exist",
      "expected": "JWT token verification middleware protecting secure routes",
      "fix": "Create backend/middleware/auth.js with token verification logic"
    }
  ]
}`;

    let masterIssues = [];
    let totalScore = 0;
    let successfulBatches = 0;
    let incompleteAudit = false;
    let categoryMap = new Map();

    console.log(`[COMPLIANCE] Running audit in ${batches.length} chunks against Implementation Plan...`);

    for (let i = 0; i < batches.length; i++) {
      const batchFiles = batches[i];
      const fileOverview = batchFiles.map(f => `<file path="${f.path}">\n${f.content || ''}\n</file>`).join('\n\n');

      const auditPrompt = `IMPLEMENTATION PLAN (REFERENCE SPECIFICATION):
${prd.slice(0, maxPlanChars)}

EXISTING PROJECT FILES (Batch ${i + 1}/${batches.length}, ${batchFiles.length} files):
${fileOverview}

Audit this batch of project files against the Implementation Plan and return the compliance JSON object. Keep in mind this is only part of the project.`;

      console.log(`[COMPLIANCE] Processing batch ${i + 1}/${batches.length} (${batchFiles.length} files)...`);
      let rawOutput = await callLLM(auditSystem, auditPrompt);
      rawOutput = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();

      let result = null;
      try {
        result = JSON.parse(rawOutput);
      } catch {
        const match = rawOutput.match(/\{[\s\S]*\}/);
        if (match) {
          result = JSON.parse(match[0]);
        }
      }

      if (!result || !Array.isArray(result.issues)) {
        incompleteAudit = true;
      }
      if (result && typeof result === 'object') {
        if (Array.isArray(result.issues)) {
          // Deduplicate issues by file and category to prevent identical "missing" errors across batches
          result.issues.forEach(issue => {
            const isDuplicate = masterIssues.some(existing =>
              existing.file === issue.file && existing.category === issue.category
            );
            if (!isDuplicate) {
              issue.id = `ISSUE-${masterIssues.length + 1}`; // re-index
              masterIssues.push(issue);
            }
          });
        }
        if (typeof result.score === 'number' && Number.isFinite(result.score)) {
          let s = result.score;
          totalScore += Math.max(0, Math.min(100, Math.round(s)));
          successfulBatches++;
        }
        const categories = result.categories ?? result.audit_categories;
        if (Array.isArray(categories)) {
          categories.forEach(c => {
            if (!categoryMap.has(c.name) || c.status === 'fail') {
              categoryMap.set(c.name, c);
            }
          });
        }
      }
    }

    // --- GLOBAL REVIEW PASS (MAP-REDUCE FINAL STEP) ---
    const allFilePaths = files.map(f => f.path).join('\n');
    const globalSystem = `You are a strict compliance auditor.
1. You will be provided with the project's PRD and a list of all files that currently exist in the project.
2. Your ONLY job is to identify major features, core files, or architectural components that are COMPLETELY MISSING from the project file structure.
3. Do not complain about logic inside files. Only focus on what is entirely missing based on the file paths.
4. Output a JSON object with an 'issues' array. If nothing major is missing, output {"issues": []}.

CRITICAL: Return ONLY valid JSON:
{
  "issues": [
    {
      "id": "GLOBAL-1",
      "category": "Missing Feature",
      "severity": "high",
      "file": "General",
      "current": "File or feature does not exist",
      "expected": "Expected file or feature based on PRD",
      "fix": "Create the missing file or implement the feature"
    }
  ]
}`;

    const globalPrompt = `IMPLEMENTATION PLAN:
${prd.slice(0, maxPlanChars)}

EXISTING PROJECT FILE PATHS:
${allFilePaths}

Identify completely missing files or features. Return JSON.`;

    try {
      console.log(`[COMPLIANCE] Running global review pass for missing features...`);
      let globalRaw = await callLLM(globalSystem, globalPrompt);
      globalRaw = globalRaw.replace(/```json/gi, '').replace(/```/g, '').trim();

      const globalMatch = globalRaw.match(/\{[\s\S]*\}/);
      const globalResult = JSON.parse(globalMatch ? globalMatch[0] : globalRaw);
      if (!globalResult || !Array.isArray(globalResult.issues)) throw new Error('Invalid global audit result');
      if (globalResult && Array.isArray(globalResult.issues)) {
        globalResult.issues.forEach(issue => {
          issue.id = `ISSUE-${masterIssues.length + 1}`;
          masterIssues.push(issue);
        });
      }
    } catch (e) {
      incompleteAudit = true;
      console.log("[COMPLIANCE] Global pass parse error:", e.message);
    }

    if (incompleteAudit || successfulBatches !== batches.length) {
      return res.status(502).json({ error: 'Audit incomplete: AI returned invalid results. Please retry.' });
    }
    const finalScore = Math.round(totalScore / successfulBatches);

    const finalResult = {
      compliant: finalScore >= 95 && masterIssues.length === 0,
      score: finalScore,
      categories: Array.from(categoryMap.values()),
      issues: masterIssues
    };

    if (finalResult.categories.some(category => category.status === 'fail')) finalResult.compliant = false;

    if (finalResult.categories.length === 0) {
      finalResult.categories = [
        { name: 'Audit categories', status: 'warn', details: 'AI returned no category-level results' }
      ];
    }

    console.log(`[COMPLIANCE] All batches complete. Final Score: ${finalResult.score}%, Compliant: ${finalResult.compliant}, Total Issues: ${finalResult.issues.length}`);
    return res.json(finalResult);
  } catch (err) {
    console.error('[COMPLIANCE] Audit error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/compliance/fix', async (req, res) => {
  const { prd, files, issues = [] } = req.body || {};
  if (typeof prd !== 'string' || !prd.trim()) return res.status(400).json({ error: 'Implementation Plan is required' });
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'Project files are required' });
  if (!Array.isArray(issues) || issues.some(issue => !issue || typeof issue !== 'object')) return res.status(400).json({ error: 'Issues must be an array of objects' });
  if (files.some(f => !f || typeof f.path !== 'string' || typeof f.content !== 'string')) return res.status(400).json({ error: 'Each file must have a string path and content' });

  try {

    const llmConfig = getLLMConfig();
    const maxPlanChars = llmConfig.maxPrdChars;

    const issuesList = Array.isArray(issues) && issues.length > 0
      ? issues.map((iss, i) => `${i + 1}. [${iss.severity || 'high'}] ${iss.category || 'General'} (${iss.file || 'General'}): Current="${iss.current || ''}" Expected="${iss.expected || ''}" Fix="${iss.fix || ''}"`).join('\n')
      : 'Align project to full implementation plan requirements.';

    const fileOverview = files.map(f => {
      // Check if this file is related to any reported issues
      const isTargetFile = issues.some(iss => {
        if (!iss.file) return false;
        const matchStr = String(iss.file).replace('*', '').trim();
        return matchStr && f.path.includes(matchStr);
      });

      if (isTargetFile) {
        // Provide full code for files that need to be fixed
        return `<file path="${f.path}">\n${f.content}\n</file>`;
      } else {
        // Provide ONLY the path for unrelated files to save maximum tokens and prevent VRAM OOM
        return `<file path="${f.path}" />`;
      }
    }).join('\n');

    const fixSystemPrompt = `You are a Principal Staff Software Engineer fixing an EXISTING PROJECT to achieve 100% compliance with the IMPLEMENTATION PLAN and resolve all reported compliance issues.

CRITICAL RULES:
1. Preserve existing architecture and structure where possible.
2. Preserve unrelated files and functionality.
3. Modify ONLY the files required to fix the compliance issues and satisfy the Implementation Plan.
4. Add missing required files.
5. Update incorrect implementations.
6. Output ONLY modified or newly added files using XML <file path="..."> tags:
<file path="backend/auth.js">
// complete updated code
</file>
7. NEVER write stubs, dummy placeholders, or "// TODO". Write the full, working implementation for each modified file.`;

    const fixPrompt = `IMPLEMENTATION PLAN:
${prd.slice(0, maxPlanChars)}

IDENTIFIED COMPLIANCE ISSUES:
${issuesList}

EXISTING PROJECT FILES (${files.length} files):
${fileOverview}

Fix the compliance issues. Output ONLY the modified or newly created files using XML <file path="..."> tags.`;

    console.log(`[COMPLIANCE FIX] Generating fixes for ${issues?.length || 0} issues...`);
    const fixOutput = await callLLM(fixSystemPrompt, fixPrompt);
    const parsed = parseFiles(fixOutput);

    const updatedFiles = [...files];
    let modifiedCount = 0;

    if (parsed.files && parsed.files.length > 0) {
      for (const fixedFile of parsed.files) {
        const idx = updatedFiles.findIndex(f => f.path === fixedFile.path);
        if (idx >= 0) {
          updatedFiles[idx] = fixedFile;
        } else {
          updatedFiles.push(fixedFile);
        }
        modifiedCount++;
      }
    }

    console.log(`[COMPLIANCE FIX] Applied fixes to ${modifiedCount} file(s).`);
    return res.json({
      files: updatedFiles,
      modifiedCount,
      summary: `Successfully applied fixes to ${modifiedCount} file(s)`
    });
  } catch (err) {
    console.error('[COMPLIANCE FIX] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(apiPort, '127.0.0.1', () => console.log(`🚀 IDE Server running on http://127.0.0.1:${apiPort}`))
