import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

import { analyzeWorkspace } from './analyze_workspace.mjs'
import { appendBurndownRow } from './burndown.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Load environment from server/.env
dotenv.config({ path: path.join(rootDir, 'server', '.env'), override: true })

import { executeGeneration } from '../server/orchestrator.js'

// Parse command line args
const args = process.argv.slice(2)
let runNumber = 1
const runIdx = args.indexOf('--run-id')
if (runIdx !== -1 && args[runIdx + 1]) {
  runNumber = parseInt(args[runIdx + 1], 10) || 1
}

const runsDir = path.join(rootDir, 'docs', 'runs')
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true })
}
const logFilePath = path.join(runsDir, `run-${runNumber}.log`)
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' })

function logEvent(event) {
  logStream.write(JSON.stringify(event) + '\n')
}

// Target workspace and PRD path configuration
const wsIdx = args.indexOf('--workspace')
const targetWorkspace = wsIdx !== -1 && args[wsIdx + 1]
  ? path.resolve(args[wsIdx + 1])
  : path.join(rootDir, 'scratch', 'disposable_generation')

// Safety Guard: Protect verified production workspaces from inadvertent destruction
const protectedWorkspaces = [
  path.join(rootDir, 'workspaces', 'quickcart-ecommerce-platform'),
  path.join(rootDir, 'server', 'workspaces', 'quickcart-ecommerce-platform')
]
if (protectedWorkspaces.includes(targetWorkspace) && !args.includes('--force-overwrite')) {
  console.error(`[SAFETY GUARD] Refusing to overwrite protected user workspace ${targetWorkspace}. Pass --force-overwrite or specify --workspace <path>.`)
  process.exit(1)
}

if (fs.existsSync(targetWorkspace)) {
  try {
    fs.rmSync(targetWorkspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    console.log(`[Headless Runner] Cleaned target workspace: ${targetWorkspace}`)
  } catch (e) {
    console.warn(`[Headless Runner] Could not cleanly remove ${targetWorkspace}: ${e.message}`)
  }
}

// Read PRD
const prdArgIdx = args.indexOf('--prd')
const prdPath = prdArgIdx !== -1 && args[prdArgIdx + 1]
  ? path.resolve(args[prdArgIdx + 1])
  : (fs.existsSync(path.join(rootDir, 'docs', 'QuickCart PRD.md')) ? path.join(rootDir, 'docs', 'QuickCart PRD.md') : path.join(rootDir, 'docs', 'quickcart_prd.md'))

if (!fs.existsSync(prdPath)) {
  console.error(`[Headless Runner] Error: PRD not found at ${prdPath}`)
  process.exit(1)
}
const prdContent = fs.readFileSync(prdPath, 'utf8')
console.log(`[Headless Runner] Loaded PRD (${prdContent.length} chars) from ${prdPath}`)

const stats = {
  status: 'PENDING',
  failedGates: [],
  exceptions: [],
  defectsByGate: {},
  continuationStalledCount: 0,
  repairsCount: 0,
  providerPerFile: {},
  currentProvider: 'unknown',
  totalFilesGenerated: 0
}

function handleEvent(currentEvent, parsed) {
  const record = {
    timestamp: new Date().toISOString(),
    type: currentEvent,
    data: parsed
  }
  logEvent(record)

  if (currentEvent === 'error') {
    stats.exceptions.push(parsed.message || String(parsed))
    console.error(`❌ [error] ${parsed.message || JSON.stringify(parsed)}`)
  } else if (currentEvent === 'defect') {
    const gate = parsed.gate || parsed.category || 'general'
    if (!stats.defectsByGate[gate]) stats.defectsByGate[gate] = []
    stats.defectsByGate[gate].push(parsed)
  } else if (currentEvent === 'continuation_stalled') {
    stats.continuationStalledCount++
    console.log(`⚠️ [continuation_stalled] File: ${parsed.file || 'unknown'} (stall count: ${stats.continuationStalledCount})`)
  } else if (currentEvent === 'repair_started' || currentEvent === 'file_repaired') {
    stats.repairsCount++
  } else if (currentEvent === 'llm_provider_selected') {
    stats.currentProvider = parsed.provider || parsed.model || stats.currentProvider
  } else if (currentEvent === 'file_saved' || currentEvent === 'file_validated') {
    const filePath = parsed.file || parsed.path
    if (filePath && !stats.providerPerFile[filePath]) {
      stats.providerPerFile[filePath] = stats.currentProvider
      stats.totalFilesGenerated++
    }
    console.log(`💾 [${currentEvent}] ${filePath}`)
  } else if (currentEvent === 'module_started') {
    console.log(`📦 [module_started] ${parsed.module?.id || parsed.id || JSON.stringify(parsed)}`)
  } else if (currentEvent === 'completion_gate') {
    stats.status = parsed.status || stats.status
    stats.failedGates = parsed.failedGates || []
    console.log(`🏁 [completion_gate] Status: ${stats.status}, Failed Gates: ${stats.failedGates.length}`)
  } else if (currentEvent === 'log' && typeof parsed === 'string') {
    console.log(`[log] ${parsed}`)
  }
}

async function finishRun() {
  logStream.end()
  console.log('\n================ GENERATION RUN FINISHED ================')
  console.log(`Log saved to: ${logFilePath}`)
  console.log(`Status: ${stats.status}`)
  console.log(`Failed Gates (${stats.failedGates.length}): ${JSON.stringify(stats.failedGates, null, 2)}`)
  if (stats.exceptions.length > 0) {
    console.log(`Exceptions (${stats.exceptions.length}):`)
    stats.exceptions.slice(0, 5).forEach(ex => console.log(`  - ${ex}`))
  }
  console.log(`Defects per Failed Gate (first 5 each):`)
  for (const gate of stats.failedGates) {
    const defects = stats.defectsByGate[gate] || []
    console.log(`Gate [${gate}] defects (${defects.length}):`)
    defects.slice(0, 5).forEach(d => console.log(`  - [${d.code || d.subtype}] ${d.file || ''}:${d.line || ''} ${d.message || d.hint || ''}`))
  }
  console.log(`Continuation Stalled Count: ${stats.continuationStalledCount}`)
  console.log(`Repairs Count: ${stats.repairsCount}`)
  console.log(`Total Files Generated: ${stats.totalFilesGenerated}`)
  console.log(`Providers Used per File sample (first 10):`)
  const sample = Object.entries(stats.providerPerFile).slice(0, 10)
  for (const [f, p] of sample) {
    console.log(`  ${f}: ${p}`)
  }
  console.log('=========================================================\n')

  try {
    const activeWs = fs.existsSync(targetWorkspace) ? targetWorkspace : null
    if (activeWs) {
      console.log(`[Headless Runner] Running burndown analysis on ${activeWs}...`)
      const report = await analyzeWorkspace(activeWs)
      await appendBurndownRow({
        runId: `run-${runNumber}`,
        timestamp: new Date().toISOString(),
        filesCount: report.filesCount,
        totalDefects: report.totalDefects,
        codeCounts: report.codeCounts,
        failedGates: stats.failedGates,
        status: stats.status,
        providerSummary: Object.values(stats.providerPerFile).slice(0, 3).join('/') || 'OpenRouter/Ollama'
      })
    }
  } catch (err) {
    console.error(`[Headless Runner] Error recording burndown: ${err.message}`)
  }

  if (stats.status === 'PASS' && stats.failedGates.length === 0) {
    process.exit(0)
  } else {
    process.exit(1)
  }
}

const useDirect = !args.includes('--http')

if (useDirect) {
  console.log(`[Headless Runner] Starting direct in-process generation (Run #${runNumber})...`)
  const projectId = path.basename(targetWorkspace)
  const generationId = crypto.randomUUID()
  global.activeGenerationId = generationId

  handleEvent('project_initialized', {
    projectId,
    workspacePath: path.relative(rootDir, targetWorkspace)
  })
  handleEvent('log', `🚀 [project_initialized] Project ID: ${projectId} | Workspace: ${path.relative(rootDir, targetWorkspace)}`)
  handleEvent('log', `🤖 Booting Centralized Orchestrator (Direct In-Process Engine)...`)

  try {
    await executeGeneration({
      prd: prdContent,
      existingFiles: [],
      generationMode: 'new',
      autoApprove: true,
      workspacePath: targetWorkspace,
      generationId
    }, (type, data) => handleEvent(type, data))
  } catch (err) {
    stats.exceptions.push(err.message)
    console.error(`❌ [generation_fatal_error] ${err.message}`)
  }

  await finishRun()
} else {
  // HTTP Mode
  const postData = JSON.stringify({
    prd: prdContent,
    projectName: 'quickcart-ecommerce-platform',
    projectId: 'quickcart-ecommerce-platform',
    generationMode: 'new',
    autoApprove: true
  })

  console.log(`[Headless Runner] Starting generation via http://127.0.0.1:3001/api/openclaw/execute (Run #${runNumber})...`)

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/openclaw/execute',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let buffer = ''
    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop()
      let currentEvent = null
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.substring(7).trim()
        } else if (line.startsWith('data: ') && currentEvent) {
          const rawData = line.substring(6).trim()
          try {
            const parsed = JSON.parse(rawData)
            handleEvent(currentEvent, parsed)
          } catch (_) {
            logEvent({ timestamp: new Date().toISOString(), type: currentEvent, raw: rawData })
          }
          currentEvent = null
        }
      }
    })
    res.on('end', finishRun)
  })

  req.on('error', (err) => {
    console.error(`[Headless Runner] HTTP Request Error: ${err.message}`)
    logStream.end()
    process.exit(1)
  })

  req.write(postData)
  req.end()
}
