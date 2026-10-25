import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { executeGeneration } from '../orchestrator.js';
import { getLLMConfig } from '../llmRouter.js';

console.log('🧪 Starting Phase 17: Small Real Gemma 3 27B Contract Acceptance Test...\n');

const PRD = `Project: NoteFlow Mini
A minimal personal note management application with user authentication.

Backend:
- Python
- FastAPI
- SQLAlchemy ORM
- SQLite database

Frontend:
- React
- TypeScript
- Vite

Entities:
- User (id, username, hashed_password, created_at)
- Note (id, user_id, title, content, created_at)
- Relationship: User has many Note; Note belongs to User

Features:
1. User registration & authentication with token
2. CRUD for Notes (create, list own notes, update, delete)
3. Simple frontend dashboard to view notes and create a new note

Keep implementation concise, production-structured, and strictly complete.`;

const PROJECT_NAME = 'noteflow_mini_gemma_test';
const WORKSPACE_DIR = path.resolve(__dirname, '../../workspaces', PROJECT_NAME);

async function verifyGemmaAvailable() {
  const config = getLLMConfig();
  if (!config.isOllamaEnabled) {
    throw new Error('FAIL: Ollama is disabled in configuration. Real Gemma 3 27B is required for Phase 17.');
  }

  const tagsUrl = config.ollamaUrl.replace(/\/+$/, '') + '/api/tags';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  let res;
  try {
    res = await fetch(tagsUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`FAIL: Cannot connect to Ollama at ${config.ollamaUrl}: ${err.message}. Real Gemma required.`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`FAIL: Ollama endpoint returned HTTP ${res.status}. Real Gemma required.`);
  }

  const data = await res.json();
  const modelNames = (data.models || []).map(m => m.name);
  const targetModel = config.ollamaModel.replace(/^ollama\//, '');
  const modelFound = modelNames.some(m => m === targetModel || m.startsWith(targetModel + ':'));

  if (!modelFound) {
    throw new Error(`FAIL: Model "${targetModel}" not found on Ollama instance. Available: ${modelNames.join(', ')}`);
  }

  return {
    url: config.ollamaUrl,
    model: targetModel,
    availableModels: modelNames
  };
}

async function runPhase17GemmaTest() {
  const telemetry = {
    provider: 'ollama',
    model: 'gemma3:27b',
    generationStart: null,
    generationEnd: null,
    durationSeconds: null,
    events: [],
    stagesReached: new Set(),
    requirementContractCount: 0,
    architectureContract: null,
    manifestModulesCount: 0,
    generatedFiles: [],
    validatedFilesCount: 0,
    repairedFilesCount: 0,
    blockedFilesCount: 0,
    failedFilesCount: 0,
    completionGatePayload: null,
    finalGateStatus: null,
    failedGates: [],
    doneReceived: false
  };

  // 1. Availability check (Zero mocks allowed)
  console.log('Step 1: Checking Real Gemma 3 27B / Ollama infrastructure availability...');
  const gemmaInfo = await verifyGemmaAvailable();
  telemetry.provider = 'ollama';
  telemetry.model = gemmaInfo.model;
  console.log(`✅ Real LLM Verified: ${gemmaInfo.model} online at ${gemmaInfo.url}\n`);

  // 2. Clean workspace
  if (fs.existsSync(WORKSPACE_DIR)) {
    fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const sendEvent = (type, data) => {
    telemetry.events.push({ type, timestamp: Date.now() });

    if (type === 'requirement_contract_created') {
      telemetry.stagesReached.add('requirement_contract');
      telemetry.requirementContractCount = data?.count || 0;
      console.log(`  📋 [requirement_contract] Extracted ${telemetry.requirementContractCount} requirements`);
    } else if (type === 'architecture_contract_created') {
      telemetry.stagesReached.add('architecture_contract');
      telemetry.architectureContract = data;
      console.log(`  🏛️  [architecture_contract] Domain=${data?.domain}, Stack=${data?.language}/${data?.backend_framework}`);
    } else if (type === 'manifest_created') {
      telemetry.stagesReached.add('manifest');
      telemetry.manifestModulesCount = data?.modules || 0;
      console.log(`  📦 [manifest_created] Manifest constructed with ${data?.modules} modules`);
    } else if (type === 'file' || type === 'file_generating' || type === 'file_generated') {
      telemetry.stagesReached.add('generation');
      if (data?.path && !telemetry.generatedFiles.includes(data.path)) {
        telemetry.generatedFiles.push(data.path);
        console.log(`  ⚡ [${type}] ${data.path}`);
      }
    } else if (type === 'file_validated' || type === 'validation_passed') {
      telemetry.validatedFilesCount++;
    } else if (type === 'repair_started') {
      telemetry.stagesReached.add('repair');
      telemetry.repairedFilesCount++;
      console.log(`  🔧 [repair_started] Repair triggered for ${data?.path || 'file'}`);
    } else if (type === 'module_blocked' || type === 'file_blocked') {
      telemetry.blockedFilesCount++;
    } else if (type === 'completion_gate') {
      telemetry.stagesReached.add('completion_gate');
      telemetry.completionGatePayload = data;
      telemetry.finalGateStatus = data.status;
      telemetry.failedGates = data.failedGates || [];
      console.log(`  🚦 [completion_gate] Status=${data.status}, FailedGates=[${(data.failedGates || []).join(', ')}]`);
    } else if (type === 'done') {
      telemetry.doneReceived = true;
      console.log(`  🏁 [done] Execution complete with status=${data.status}`);
    } else if (type === 'log') {
      const msg = typeof data === 'string' ? data : data?.message || '';
      if (msg.includes('Syntax Validation') || msg.includes('ORM') || msg.includes('Import Closure') || msg.includes('PRD Coverage')) {
        console.log(`  🔍 ${msg}`);
      }
    }
  };

  console.log('Step 2: Launching Controlled Production Orchestration Pipeline with Real Gemma...');
  telemetry.generationStart = Date.now();

  try {
    await executeGeneration({
      prd: PRD,
      projectName: PROJECT_NAME,
      workspacePath: WORKSPACE_DIR,
      generationMode: 'new',
      autoApprove: true,
      generationId: 'gemma-contract-' + Date.now()
    }, sendEvent);
  } catch (err) {
    console.log(`  ⚠️ Pipeline halted as designed: ${err.message}`);
  }

  telemetry.generationEnd = Date.now();
  telemetry.durationSeconds = Math.round((telemetry.generationEnd - telemetry.generationStart) / 1000);

  // Print Structured Acceptance Evidence
  console.log('\n==================================================');
  console.log('PHASE 17 REAL GEMMA CONTRACT TEST EVIDENCE:');
  console.log(`Model / Provider:       ${telemetry.model} (${telemetry.provider})`);
  console.log(`Generation Start:       ${new Date(telemetry.generationStart).toISOString()}`);
  console.log(`Generation End:         ${new Date(telemetry.generationEnd).toISOString()}`);
  console.log(`Duration:               ${telemetry.durationSeconds}s`);
  console.log(`Requirement Count:      ${telemetry.requirementContractCount}`);
  console.log(`Architecture Contract:  ${telemetry.architectureContract ? 'Synthesized & Validated' : 'None'}`);
  console.log(`Generated File Count:   ${telemetry.generatedFiles.length}`);
  console.log(`Validated Files:        ${telemetry.validatedFilesCount}`);
  console.log(`Repairs Attempted:      ${telemetry.repairedFilesCount}`);
  console.log(`Blocked Files:          ${telemetry.blockedFilesCount}`);
  console.log(`Final Gate Status:      ${telemetry.finalGateStatus || 'EVALUATED'}`);
  console.log(`Failed Gates:           ${telemetry.failedGates.length > 0 ? telemetry.failedGates.join(', ') : 'None'}`);
  console.log(`Stages Reached:         ${[...telemetry.stagesReached].join(' → ')}`);
  console.log('==================================================\n');

  // Assertions: Pipeline integrity verified without bypass
  assert.ok(telemetry.stagesReached.has('requirement_contract'), 'Requirement contract stage must be reached');
  assert.ok(telemetry.stagesReached.has('architecture_contract'), 'Architecture contract stage must be reached');
  assert.ok(telemetry.stagesReached.has('manifest'), 'Manifest stage must be reached');
  assert.ok(telemetry.stagesReached.has('generation'), 'Generation stage must be reached');
  assert.ok(telemetry.generatedFiles.length > 0, 'Real Gemma must produce concrete files');
  assert.ok(telemetry.stagesReached.has('completion_gate'), 'Final completion gate must be evaluated deterministically');

  console.log('🎉 PHASE 17 REAL GEMMA CONTRACT ACCEPTANCE TEST PASSED!\n');
}

runPhase17GemmaTest().catch(err => {
  console.error('\n❌ PHASE 17 FAILED:', err.message);
  process.exit(1);
});
