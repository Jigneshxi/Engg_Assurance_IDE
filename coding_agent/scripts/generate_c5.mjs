import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load environment
dotenv.config({ path: path.join(rootDir, 'server', '.env'), override: true });
dotenv.config({ path: path.join(rootDir, '.env'), override: false });

import { executeGeneration } from '../server/orchestrator.js';

const targetWorkspace = path.join(rootDir, 'server', 'workspaces', 'amereyconnect-medicinal-platform');
const prdPath = path.join(rootDir, 'amereyconnect-medicinal-platform.md');

if (!fs.existsSync(prdPath)) {
  console.error(`PRD not found at: ${prdPath}`);
  process.exit(1);
}

const prd = fs.readFileSync(prdPath, 'utf8');
const generationId = `c5_run_${Date.now()}`;
const runLogPath = path.join(rootDir, 'docs', 'runs', `c5_generation.log`);
fs.mkdirSync(path.dirname(runLogPath), { recursive: true });
const runLogStream = fs.createWriteStream(runLogPath, { flags: 'w' });

const wsLogDir = path.join(targetWorkspace, '.openclaw');
fs.mkdirSync(wsLogDir, { recursive: true });
const wsLogPath = path.join(wsLogDir, 'execution.log');
const wsLogStream = fs.createWriteStream(wsLogPath, { flags: 'w' });

console.log(`=======================================================`);
console.log(`   AmereyConnect Medicinal Platform Generation (c5)   `);
console.log(`=======================================================`);
console.log(`Workspace: ${targetWorkspace}`);
console.log(`PRD: ${prdPath} (${prd.length} chars)`);
console.log(`Generation ID: ${generationId}`);
console.log(`Log File: ${runLogPath}`);
console.log(`Workspace Log: ${wsLogPath}`);

let latestGate = null;

function handleEvent(type, data) {
  const line = `[${new Date().toISOString()}] [${type}] ${typeof data === 'string' ? data : JSON.stringify(data)}`;
  runLogStream.write(line + '\n');
  wsLogStream.write(line + '\n');

  if (type === 'log') {
    console.log(data);
  } else if (type === 'module_started') {
    console.log(`\n📦 [MODULE_STARTED] ${data.moduleId || ''}: ${data.moduleName || ''}`);
  } else if (type === 'module_completed') {
    console.log(`✅ [MODULE_COMPLETED] ${data.moduleId || ''}`);
  } else if (type === 'module_failed') {
    console.log(`❌ [MODULE_FAILED] ${data.moduleId || ''}: ${JSON.stringify(data.errors || '')}`);
  } else if (type === 'module_blocked') {
    console.log(`⚠️ [MODULE_BLOCKED] ${data.moduleId || ''} blocked by ${data.blockedBy || ''}`);
  } else if (type === 'file_validated') {
    console.log(`  ✓ [file_validated] ${data.path}`);
  } else if (type === 'file_failed') {
    console.log(`  ✗ [file_failed] ${data.path}`);
  } else if (type === 'repair_started') {
    console.log(`  🔧 [repair_started] ${data.path} (attempt ${data.attempt})`);
  } else if (type === 'completion_gate') {
    latestGate = data;
    console.log(`\n🏁 [COMPLETION_GATE] Status: ${data.status} | Passed Gates: ${data.passedGatesCount}/${data.totalGates}`);
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
  console.error(`\n❌ [FATAL_GENERATION_ERROR] ${err.message}`);
} finally {
  runLogStream.end();
  wsLogStream.end();
  console.log(`\nGeneration completed. Log saved to: ${runLogPath} and ${wsLogPath}`);
}
