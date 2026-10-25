import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load environment from server/.env
dotenv.config({ path: path.join(rootDir, 'server', '.env'), override: true });

import { executeGeneration } from '../server/orchestrator.js';

const targetWorkspace = path.join(rootDir, 'workspaces', 'taskflow-task-manage-platform');
console.log(`[TaskFlow Direct Runner] Target workspace: ${targetWorkspace}`);

// Clean workspace before fresh run
if (fs.existsSync(targetWorkspace)) {
  try {
    fs.rmSync(targetWorkspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    console.log(`[TaskFlow Direct Runner] Cleaned previous workspace.`);
  } catch (e) {
    console.warn(`[TaskFlow Direct Runner] Could not cleanly remove ${targetWorkspace}: ${e.message}`);
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
`;

const generationId = crypto.randomUUID();
global.activeGenerationId = generationId;

console.log(`[TaskFlow Direct Runner] Starting direct in-process execution for TaskFlow...`);

const runLogPath = path.join(rootDir, 'docs', 'runs', 'taskflow_r8_run.log');
fs.mkdirSync(path.dirname(runLogPath), { recursive: true });
const runLogStream = fs.createWriteStream(runLogPath, { flags: 'w' });

let latestGate = null;

function handleEvent(type, data) {
  runLogStream.write(JSON.stringify({ timestamp: new Date().toISOString(), type, data }) + '\n');

  if (type === 'log' && typeof data === 'string') {
    if (data.includes('[final_completion_gate]')) {
      console.log(`\n==================================================`);
      console.log(data);
      console.log(`==================================================\n`);
    } else if (data.includes('[module_') || data.includes('[phase_') || data.includes('✅') || data.includes('❌') || data.includes('⚠️')) {
      console.log(data);
    }
  } else if (type === 'phase_started') {
    console.log(`\n🚀 [PHASE_STARTED] Phase ${data.phaseIndex ?? ''}: ${data.phaseName || JSON.stringify(data)}`);
  } else if (type === 'module_started') {
    console.log(`📦 [MODULE_STARTED] ${data.module?.id || data.id || ''}: ${data.module?.name || ''}`);
  } else if (type === 'module_completed') {
    console.log(`✅ [MODULE_COMPLETED] ${data.moduleId || data.id || ''}`);
  } else if (type === 'module_failed') {
    console.log(`❌ [MODULE_FAILED] ${data.moduleId || data.id || ''}`);
  } else if (type === 'file_validated') {
    console.log(`  ✓ [file_validated] ${data.path}`);
  } else if (type === 'file_failed') {
    console.log(`  ✗ [file_failed] ${data.path}`);
  } else if (type === 'completion_gate') {
    latestGate = data;
    console.log(`\n🏁 [COMPLETION_GATE EVENT] Status: ${data.status} | Required: ${data.required} | Generated: ${data.generated} | Validated: ${data.validated} | Blocked: ${data.blocked} | Failed: ${data.failed}`);
    console.log(`Failed Gates: ${JSON.stringify(data.failedGates)}`);
  }
}

try {
  await executeGeneration({
    prd,
    existingFiles: [],
    generationMode: 'new',
    autoApprove: true,
    workspacePath: targetWorkspace,
    generationId
  }, handleEvent);
} catch (err) {
  console.error(`❌ [FATAL_GENERATION_ERROR] ${err.message}`);
} finally {
  runLogStream.end();
  console.log(`\nRun log saved to: ${runLogPath}`);
  if (latestGate) {
    console.log(`Final Completion Status: ${latestGate.status}`);
    process.exit(latestGate.status === 'PASS' ? 0 : 1);
  } else {
    process.exit(1);
  }
}
