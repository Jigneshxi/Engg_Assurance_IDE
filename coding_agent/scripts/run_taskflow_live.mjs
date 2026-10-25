import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const targetWorkspace = path.join(rootDir, 'workspaces', 'taskflow-task-manage-platform')
console.log(`[TaskFlow Live Runner] Target workspace: ${targetWorkspace}`)

if (fs.existsSync(targetWorkspace)) {
  try {
    fs.rmSync(targetWorkspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    console.log(`[TaskFlow Live Runner] Cleaned previous workspace.`)
  } catch (e) {
    console.warn(`[TaskFlow Live Runner] Could not cleanly remove ${targetWorkspace}: ${e.message}`)
  }
}

const prd = `Build a comprehensive Task & Project Management web application called "TaskFlow".

### Core Requirements:
1. User Authentication:
   - Email/password user registration and login with JWT bearer tokens.
   - User profile endpoint GET /api/auth/me returning current user details and role.
   - Secure password hashing using bcrypt.

2. Boards & Workspaces:
   - CRUD operations for project boards: GET /api/boards, POST /api/boards, GET /api/boards/{id}, DELETE /api/boards/{id}.
   - Each board has title, description, user_id, and created_at.

3. Task Management & Workflow:
   - CRUD operations for tasks: GET /api/tasks, POST /api/tasks, GET /api/tasks/{id}, PUT /api/tasks/{id}, DELETE /api/tasks/{id}.
   - Each task includes id, title, description, status ("todo", "in_progress", "done"), priority ("low", "medium", "high"), board_id, and created_at.
   - Filter tasks by board_id, status, and priority.

4. Productivity Dashboard:
   - Summary statistics endpoint GET /api/dashboard/stats: total tasks, completed tasks, in-progress tasks, and active boards.

5. Frontend Application:
   - Modern responsive UI with React and TypeScript.
   - Pages: Register, Login, Dashboard, BoardView (Kanban-style cards), and TaskDetail.
   - Priority indicators, status transition dropdowns, and clean loading/error feedback.
   - State-driven API integration using configured relative /api paths with auth token interceptor.
`

const postData = JSON.stringify({
  prd,
  projectName: 'taskflow-task-manage-platform',
  projectId: 'taskflow-task-manage-platform',
  generationMode: 'new',
  autoApprove: true
})

console.log(`[TaskFlow Live Runner] Sending execution request to IDE server (http://127.0.0.1:3001/api/openclaw/execute)...`)

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
          if (currentEvent === 'log' && typeof parsed === 'string') {
            console.log(parsed)
          } else if (currentEvent === 'completion_gate') {
            console.log(`\n🏁 [COMPLETION_GATE] Status: ${parsed.status} | Failed Gates: ${JSON.stringify(parsed.failedGates)}`)
            if (parsed.defects) console.log(`Defects:`, JSON.stringify(parsed.defects, null, 2))
          } else if (currentEvent === 'defect' || currentEvent === 'contract_defects') {
            console.log(`⚠️ [DEFECT]`, JSON.stringify(parsed))
          } else if (currentEvent === 'file_validated' || currentEvent === 'file_generated') {
            console.log(`📄 [${currentEvent}] ${parsed.path || parsed.file}`)
          } else if (currentEvent === 'error') {
            console.error(`❌ [ERROR] ${parsed.message || JSON.stringify(parsed)}`)
          } else if (currentEvent === 'phase_started') {
            console.log(`\n🚀 [PHASE_STARTED] Phase ${parsed.phaseIndex || ''}: ${parsed.phaseName || JSON.stringify(parsed)}`)
          } else if (currentEvent === 'module_started') {
            console.log(`📦 [MODULE_STARTED] ${parsed.module?.name || parsed.id || JSON.stringify(parsed)}`)
          }
        } catch (_) {
          if (rawData) console.log(`[${currentEvent}] ${rawData.slice(0, 120)}`)
        }
        currentEvent = null
      }
    }
  })

  res.on('end', () => {
    console.log(`\n[TaskFlow Live Runner] Server response stream ended.`)
  })
})

req.on('error', (err) => {
  console.error(`[TaskFlow Live Runner] Request failed: ${err.message}`)
  process.exit(1)
})

req.write(postData)
req.end()
