/**
 * ============================================================================
 * ENGG ASSURANCE IDE — UNIFIED ASSURANCE BRIDGE
 * ============================================================================
 * Connects the Coding Agent Orchestrator & Monaco Web IDE with the CONVERGE
 * 59-Node Autonomous Engineering Assurance Mesh running on FastAPI (Port 8000).
 *
 * Capabilities:
 * 1. Health & Topology Discovery: Polls FastAPI 59-node mesh state
 * 2. Automated Mission Dispatch: Packages active workspace code/PRD -> CONVERGE
 * 3. Status & Telemetry Streaming: Aggregates real-time LangGraph agent progress
 * 4. Scorecard Aggregation: Release Decision (Go/No-Go), Compliance, Economics
 * 5. Closed-Loop Self-Healing: Dispatches remediation PRs to repairEngine.js
 */

import fs from 'fs'
import path from 'path'
import { applyPatch, generateFileHash } from './repairEngine.js'

const CONVERGE_BASE_URL = process.env.CONVERGE_API_URL || 'http://127.0.0.1:8000'

/**
 * Check if the CONVERGE FastAPI assurance server is running and healthy.
 */
export async function checkAssuranceStatus() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const resp = await fetch(`${CONVERGE_BASE_URL}/api/health`, { signal: controller.signal })
    clearTimeout(timeout)
    if (resp.ok) {
      const data = await resp.json()
      return {
        connected: true,
        service: 'CONVERGE 59-Node Sovereign Mesh',
        port: 8000,
        baseUrl: CONVERGE_BASE_URL,
        timestamp: new Date().toISOString(),
        details: data
      }
    }
    return {
      connected: false,
      service: 'CONVERGE 59-Node Mesh',
      port: 8000,
      baseUrl: CONVERGE_BASE_URL,
      status: 'offline',
      message: 'FastAPI Assurance service returned non-200 status'
    }
  } catch (err) {
    return {
      connected: false,
      service: 'CONVERGE 59-Node Mesh',
      port: 8000,
      baseUrl: CONVERGE_BASE_URL,
      status: 'offline',
      message: `Assurance backend offline: ${err.message}`
    }
  }
}

/**
 * Package project files and trigger a CONVERGE assurance mission.
 *
 * @param {string} workspacePath - Absolute or relative path to the project workspace
 * @param {object} options - Options including role, depth, modules, prd, missionName
 */
export async function triggerAssuranceMission(workspacePath, options = {}) {
  const resolvedWs = path.resolve(workspacePath)
  if (!fs.existsSync(resolvedWs)) {
    throw new Error(`Workspace path does not exist: ${workspacePath}`)
  }

  // 1. Ingest PRD and project metadata
  let prdText = options.prd || ''
  const projectJsonPath = path.join(resolvedWs, 'project.json')
  const agentValidationPath = path.join(resolvedWs, 'agent-validation.json')
  
  if (!prdText && fs.existsSync(projectJsonPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'))
      prdText = meta.prd || ''
    } catch {}
  }

  // 2. Discover workspace files (excluding node_modules, .git, venv)
  const codeFiles = []
  function scanDir(dir, relPrefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (['node_modules', '.git', '.venv', '.venv-ide', '__pycache__', 'dist', '.openclaw'].includes(entry.name)) {
        continue
      }
      const fullPath = path.join(dir, entry.name)
      const relPath = path.join(relPrefix, entry.name).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        scanDir(fullPath, relPath)
      } else if (entry.isFile()) {
        // Collect code files under 100KB
        try {
          const stats = fs.statSync(fullPath)
          if (stats.size < 100 * 1024) {
            const content = fs.readFileSync(fullPath, 'utf8')
            codeFiles.push({ path: relPath, content, size: stats.size })
          }
        } catch {}
      }
    }
  }
  scanDir(resolvedWs)

  // 3. Build synthesis context for CONVERGE
  let fileSummaryContext = `Project Workspace: ${path.basename(resolvedWs)}\nFiles Generated: ${codeFiles.length}\n\n`
  fileSummaryContext += `=== CODEBASE FILES ===\n`
  for (const f of codeFiles.slice(0, 30)) {
    fileSummaryContext += `\n--- File: ${f.path} ---\n${f.content.slice(0, 1500)}\n`
  }

  const fullContext = (prdText ? `=== PRD REQUIREMENTS ===\n${prdText}\n\n` : '') + fileSummaryContext

  const payload = {
    context: fullContext,
    sources: [
      {
        ticket_id: `Workspace: ${path.basename(resolvedWs)}`,
        platform: 'directpaste',
        summary: `Full-stack implementation in ${path.basename(resolvedWs)} with ${codeFiles.length} files.`
      }
    ],
    role: options.role || 'qa_lead',
    depth: options.depth || 'standard',
    module: options.module || 'all',
    modules: options.modules || ['ingest', 'forge', 'certify', 'decide'],
    mission_name: options.missionName || `IDE-Assurance-${path.basename(resolvedWs)}`,
    execution_mode: 'analysis'
  }

  const resp = await fetch(`${CONVERGE_BASE_URL}/api/converge/mission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`CONVERGE mission trigger failed (${resp.status}): ${errText}`)
  }

  const data = await resp.json()
  
  // Persist assurance tracking in workspace
  const assuranceMetaPath = path.join(resolvedWs, '.openclaw', 'assurance-mission.json')
  const assuranceDir = path.dirname(assuranceMetaPath)
  if (!fs.existsSync(assuranceDir)) fs.mkdirSync(assuranceDir, { recursive: true })
  
  const missionRecord = {
    taskId: data.task_id,
    missionId: data.mission_id,
    status: data.status || 'STARTED',
    role: payload.role,
    depth: payload.depth,
    startedAt: new Date().toISOString(),
    workspace: path.basename(resolvedWs)
  }
  fs.writeFileSync(assuranceMetaPath, JSON.stringify(missionRecord, null, 2))

  return {
    success: true,
    taskId: data.task_id,
    missionId: data.mission_id,
    status: data.status,
    role: payload.role,
    depth: payload.depth,
    fileCount: codeFiles.length
  }
}

/**
 * Get live status of an ongoing CONVERGE task including mesh node topology.
 */
export async function getAssuranceTaskStatus(taskId) {
  const resp = await fetch(`${CONVERGE_BASE_URL}/api/tasks/status/${taskId}`)
  if (!resp.ok) {
    throw new Error(`Failed to fetch task status for ${taskId}: ${resp.statusText}`)
  }
  return await resp.json()
}

/**
 * Aggregates complete CONVERGE assurance scorecard:
 * - Release Go/No-Go Decision
 * - Compliance Audit Pack
 * - Engineering Economics & ROI
 * - Remediation PRs
 */
export async function getAssuranceScorecard(taskId) {
  const results = {
    taskId,
    timestamp: new Date().toISOString(),
    releaseDecision: null,
    compliancePack: null,
    economics: null,
    remediationPRs: []
  }

  // 1. Release Decision
  try {
    const rResp = await fetch(`${CONVERGE_BASE_URL}/api/converge/release-decision/${taskId}`)
    if (rResp.ok) results.releaseDecision = await rResp.json()
  } catch {}

  // 2. Compliance Pack
  try {
    const cResp = await fetch(`${CONVERGE_BASE_URL}/api/converge/compliance-pack/${taskId}`)
    if (cResp.ok) results.compliancePack = await cResp.json()
  } catch {}

  // 3. Economics
  try {
    const eResp = await fetch(`${CONVERGE_BASE_URL}/api/converge/economics/${taskId}`)
    if (eResp.ok) results.economics = await eResp.json()
  } catch {}

  // 4. Remediation PRs
  try {
    const rmResp = await fetch(`${CONVERGE_BASE_URL}/api/converge/remediation/${taskId}`)
    if (rmResp.ok) {
      const data = await rmResp.json()
      results.remediationPRs = data.remediation_prs || data.prs || data || []
    }
  } catch {}

  return results
}

/**
 * Autonomous Self-Healing: Ingests remediation PR / patch from CONVERGE
 * and applies it directly to the workspace code using repairEngine.
 *
 * @param {string} workspacePath - Target workspace path
 * @param {object} remediation - Remediation object with { target_file, diff, description }
 */
export async function applyAssuranceRemediation(workspacePath, remediation) {
  const resolvedWs = path.resolve(workspacePath)
  const targetRelFile = remediation.target_file || remediation.file_path || remediation.file
  if (!targetRelFile) {
    throw new Error('Remediation does not specify a target file.')
  }

  const targetFullPath = path.join(resolvedWs, targetRelFile)
  if (!fs.existsSync(targetFullPath)) {
    throw new Error(`Target file to remediate does not exist: ${targetRelFile}`)
  }

  const originalContent = fs.readFileSync(targetFullPath, 'utf8')
  const originalHash = generateFileHash(originalContent)

  let patchedContent = null
  let patchApplied = false

  // If remediation provides unified diff
  if (remediation.diff || remediation.patch) {
    const patchText = remediation.diff || remediation.patch
    try {
      patchedContent = applyPatch(originalContent, patchText)
      patchApplied = Boolean(patchedContent && patchedContent !== originalContent)
    } catch (patchErr) {
      console.warn(`[ASSURANCE-REPAIR] Direct patch apply failed: ${patchErr.message}. Attempting content replacement.`)
    }
  }

  // If remediation provides replacement code directly
  if (!patchApplied && remediation.remediated_code) {
    patchedContent = remediation.remediated_code
    patchApplied = true
  }

  if (!patchApplied || !patchedContent) {
    return {
      success: false,
      file: targetRelFile,
      reason: 'Could not apply remediation patch automatically to target file.'
    }
  }

  // Write updated file
  fs.writeFileSync(targetFullPath, patchedContent, 'utf8')
  const newHash = generateFileHash(patchedContent)

  // Record remediation audit in workspace
  const auditPath = path.join(resolvedWs, '.openclaw', 'remediations-audit.json')
  const auditDir = path.dirname(auditPath)
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true })
  let auditLogs = []
  try {
    if (fs.existsSync(auditPath)) {
      auditLogs = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
    }
  } catch {}

  auditLogs.push({
    timestamp: new Date().toISOString(),
    file: targetRelFile,
    title: remediation.title || 'Assurance Remediation',
    standard: remediation.standard || 'CONVERGE Quality Gate',
    severity: remediation.severity || 'HIGH',
    originalHash,
    newHash
  })
  fs.writeFileSync(auditPath, JSON.stringify(auditLogs, null, 2))

  return {
    success: true,
    file: targetRelFile,
    originalHash,
    newHash,
    message: `Successfully remediated ${targetRelFile}`
  }
}
