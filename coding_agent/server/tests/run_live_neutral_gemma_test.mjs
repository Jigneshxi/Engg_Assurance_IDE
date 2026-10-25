import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { executeGeneration } from '../orchestrator.js';

const prd = `Build a lightweight Note Keeper web application.

Backend:
- Python FastAPI with SQLite and SQLAlchemy
- Models: Note (id: int primary key, title: str, content: str, tag: str optional, created_at: datetime)
- Pydantic schemas for Note creation and Note response
- CRUD API:
  - GET /notes (list all notes)
  - POST /notes (create a note)
  - GET /notes/{id} (get note by id)
  - DELETE /notes/{id} (delete a note)
  - GET /health (returns {"status": "ok"})

Frontend:
- React with TypeScript (Vite)
- Features: Note list view, simple form to create a note, search/filter by tag
- Responsive clean interface

Ensure all source files are complete, valid, syntactically closed, and production-ready.`;

const projectName = 'live_neutral_gemma_notes';
const workspacePath = path.resolve(__dirname, '../../workspaces/live_neutral_gemma_notes');

console.log('====================================================');
console.log('🚀 RUNNING SMALL NEUTRAL REAL-GEMMA 3 27B TEST');
console.log('====================================================');
console.log(`Model: gemma3:27b`);
console.log(`Endpoint: ${process.env.OLLAMA_BASE_URL || 'http://192.168.0.49:11434'}`);
console.log(`Workspace: ${workspacePath}\n`);

// Ensure clean fresh workspace
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

const telemetry = {
  continuationsAttempted: 0,
  continuationsSucceeded: 0,
  rollbacksAttempted: 0,
  filesGenerated: 0,
  filesValidated: 0,
  filesRepaired: 0,
  filesFailed: 0,
  completionGate: null,
  doneEvent: null
};

const sendEvent = (eventType, data) => {
  const ts = new Date().toISOString().substring(11, 19);

  if (eventType === 'log') {
    const msg = typeof data === 'string' ? data : data?.message || '';
    if (
      msg.includes('boundary') ||
      msg.includes('continuation') ||
      msg.includes('repair') ||
      msg.includes('completion_gate') ||
      msg.includes('generation_completed') ||
      msg.includes('generation_failed') ||
      msg.includes('Module') ||
      msg.includes('validated') ||
      msg.includes('failed')
    ) {
      console.log(`[${ts}] 📋 ${msg}`);
    }
  } else if (eventType === 'continuation_started') {
    telemetry.continuationsAttempted++;
    console.log(`[${ts}] 🔄 [continuation_started] Continuation requested for: ${data?.path || 'file'}`);
  } else if (eventType === 'continuation_completed') {
    telemetry.continuationsSucceeded++;
    console.log(`[${ts}] 🩹 [continuation_completed] Continuation succeeded for: ${data?.path || 'file'}`);
  } else if (eventType === 'boundary_rollback') {
    telemetry.rollbacksAttempted++;
    console.log(`[${ts}] ⏪ [boundary_rollback] Rolled back to stable boundary for: ${data?.path || 'file'}`);
  } else if (eventType === 'file_generated') {
    telemetry.filesGenerated++;
    console.log(`[${ts}] 📦 [file_generated] ${data?.path}`);
  } else if (eventType === 'file_validated') {
    telemetry.filesValidated++;
    console.log(`[${ts}] ✅ [file_validated] ${data?.path}`);
  } else if (eventType === 'file_failed') {
    telemetry.filesFailed++;
    console.log(`[${ts}] ❌ [file_failed] ${data?.path}: ${data?.error}`);
  } else if (eventType === 'repair_completed') {
    telemetry.filesRepaired++;
    console.log(`[${ts}] 🔧 [repair_completed] ${data?.path} (${data?.status})`);
  } else if (eventType === 'completion_gate') {
    telemetry.completionGate = data;
    console.log(`[${ts}] 🏁 [completion_gate] Status: ${data?.status}`);
  } else if (eventType === 'done') {
    telemetry.doneEvent = data;
    console.log(`[${ts}] 🏁 [done] Status: ${data?.status}, Gate: ${data?.gateStatus}`);
  }
};

const startTime = Date.now();

try {
  await executeGeneration({
    prd,
    projectName,
    workspacePath,
    autoApprove: true,
    generationId: 'gemma-live-' + Date.now()
  }, sendEvent);

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n====================================================');
  console.log('🏁 REAL-GEMMA 3 27B TEST EXECUTION REPORT');
  console.log('====================================================');
  console.log(`Duration: ${durationSec}s`);
  console.log(`Continuations attempted: ${telemetry.continuationsAttempted}`);
  console.log(`Continuations succeeded: ${telemetry.continuationsSucceeded}`);
  console.log(`Boundary rollbacks: ${telemetry.rollbacksAttempted}`);
  console.log(`Files generated: ${telemetry.filesGenerated}`);
  console.log(`Files validated: ${telemetry.filesValidated}`);
  console.log(`Files repaired: ${telemetry.filesRepaired}`);
  console.log(`Files failed: ${telemetry.filesFailed}`);
  
  if (telemetry.completionGate) {
    console.log('\nFinal Completion Gate Details:');
    console.log(`- Status: ${telemetry.completionGate.status}`);
    console.log(`- Required: ${telemetry.completionGate.required}`);
    console.log(`- Generated: ${telemetry.completionGate.generated}`);
    console.log(`- Validated: ${telemetry.completionGate.validated}`);
    console.log(`- Repaired: ${telemetry.completionGate.repaired}`);
    console.log(`- Failed: ${telemetry.completionGate.failed}`);
    console.log(`- Blocked: ${telemetry.completionGate.blocked}`);
    console.log(`- Failed Gates: ${(telemetry.completionGate.failedGates || []).join(', ') || 'None'}`);
  }

  console.log('====================================================\n');
} catch (err) {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
}
