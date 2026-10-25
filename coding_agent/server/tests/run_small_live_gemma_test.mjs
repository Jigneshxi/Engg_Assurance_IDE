import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { executeGeneration } from '../orchestrator.js';

const prd = `Build a minimal task management application.

Backend:
Python
FastAPI
SQLAlchemy
SQLite

Entities:
Task
Category

Features:
- create task
- list tasks
- update task
- delete task

Keep the implementation intentionally small.`;

const projectName = 'taskflow_contract_test';

console.log('====================================================');
console.log('🚀 RUNNING SMALL LIVE GEMMA 3 27B TEST (taskflow_contract_test)');
console.log('====================================================\n');

let requirementContractReceived = false;
let architectureContractReceived = null;
let manifestCreated = null;
let databaseFilesGenerated = [];
let databaseValidated = false;
let stackContractMismatch = false;
let downstreamModuleStarted = false;
let _fatalError = null;

const sendEvent = (eventType, data) => {
  const ts = new Date().toISOString().substring(11, 19);
  
  if (eventType === 'log') {
    const msg = typeof data === 'string' ? data : data?.message || '';
    if (msg.includes('Architecture Contract') || msg.includes('Manifest') || msg.includes('database_validation') || msg.includes('STACK_CONTRACT_MISMATCH') || msg.includes('module_started') || msg.includes('module_completed')) {
      console.log(`[${ts}] 📋 ${msg}`);
    }
  } else if (eventType === 'requirement_contract_created') {
    requirementContractReceived = true;
    console.log(`[${ts}] ✅ Requirement Contract created: ${data?.count} requirements`);
  } else if (eventType === 'architecture_contract_created') {
    architectureContractReceived = data;
    console.log(`[${ts}] ✅ Architecture Contract created: domain=${data?.domain}, db=${data?.db}`);
  } else if (eventType === 'manifest_created') {
    manifestCreated = data?.modules || true;
    console.log(`[${ts}] ✅ Manifest created with ${data?.modules} modules`);
  } else if (eventType === 'file_generated') {
    console.log(`[${ts}] 📦 File generated: ${data?.path}`);
    if (data?.path?.includes('/db/') || data?.path?.includes('model') || data?.path?.includes('database')) {
      databaseFilesGenerated.push(data.path);
    }
  } else if (eventType === 'file' && data?.path) {
    if (data.path.includes('/db/') || data.path.includes('model') || data.path.includes('database')) {
      databaseFilesGenerated.push(data.path);
    }
  } else if (eventType === 'module_completed' && data?.moduleId === 'MOD-000') {
    databaseValidated = true;
    console.log(`[${ts}] 🎉 MOD-000 (Database) VALIDATED & PASSED!`);
  } else if (eventType === 'module_started' && data?.moduleId !== 'MOD-000') {
    downstreamModuleStarted = true;
    console.log(`[${ts}] 🚀 Downstream module proceeded: ${data?.moduleId} (${data?.layer || 'module'})`);
  } else if (eventType === 'stack_contract_mismatch') {
    stackContractMismatch = true;
    console.log(`[${ts}] ⚠️ Stack contract mismatch detected:`, data);
  } else if (eventType === 'execution_failed') {
    _fatalError = data?.reason;
    console.log(`[${ts}] ❌ Execution failed: ${data?.reason}`);
  }
};

try {
  const fs = await import('fs');
  const workspacePath = path.resolve(__dirname, '../../workspaces/taskflow_contract_test');
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
  fs.mkdirSync(workspacePath, { recursive: true });

  await executeGeneration({
    prd,
    projectName,
    workspacePath,
    autoApprove: true,
    generationId: 'live-test-' + Date.now()
  }, sendEvent);

  console.log('\n====================================================');
  console.log('LIVE TEST RESULT SUMMARY:');
  console.log('- Requirement Contract Received:', requirementContractReceived);
  console.log('- Architecture Contract Received:', Boolean(architectureContractReceived));
  console.log('- Manifest Created:', Boolean(manifestCreated));
  console.log('- Database Files Generated:', databaseFilesGenerated);
  console.log('- Database Module (MOD-000) Validated:', databaseValidated);
  console.log('- Downstream Module Started:', downstreamModuleStarted);
  console.log('- Stack Contract Mismatch:', stackContractMismatch);
  console.log('====================================================\n');

  if (databaseFilesGenerated.length > 0 && databaseFilesGenerated.every(p => p.endsWith('.py'))) {
    console.log('✅ PASS: Generated database files are exclusively Python (.py), adhering to Architecture Contract.');
  }

  if (databaseValidated && downstreamModuleStarted) {
    console.log('🎉 SUCCESS: Full Architecture Contract -> Manifest -> File Gen -> DB Validation -> Downstream chain verified!');
  }
} catch (err) {
  console.error('\n❌ Live test error:', err.message);
  process.exit(1);
}
