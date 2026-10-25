import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { executeGeneration } from '../orchestrator.js';
import { callLLM } from '../llmRouter.js';
import { DATABASE_DEFECT_CODES } from '../dbValidator.js';

console.log('====================================================');
console.log('🚀 LIVE ORCHESTRATOR TRUNCATION & REPAIR TEST');
console.log('Model: Ollama (gemma3:27b)');
console.log('====================================================\n');

const prd = `Project: live_truncation_repair_smoke
Stack: Python, FastAPI, SQLAlchemy, SQLite
Entities:
Item
Features:
- create item
- list items
Keep the project minimal.`;

const projectName = 'live_truncation_repair_smoke';
const workspacePath = path.resolve(__dirname, '../../workspaces/live_truncation_repair_smoke');
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

let interceptedTruncation = false;
let sqlalchemyLogFound = null;

// Wrap callLLM so that live Gemma handles all contracts, manifest, and repairs,
// but one file generation triggers the missing </file> truncation path.
const liveTestCaller = async (system, user, opts) => {
  // Check if this is an initial file generation (not repair, not contract, not manifest)
  const isOrdinaryFileGen = user.includes('TARGET FILE:') &&
    !system.includes('targeted, zero-regression code repair') &&
    !system.includes('Requirement Contract') &&
    !system.includes('Architecture Contract') &&
    !system.includes('Manifest');

  if (isOrdinaryFileGen && !interceptedTruncation) {
    interceptedTruncation = true;
    console.log('⚡ [TEST HOOK] Intercepting file generation to simulate missing </file> boundary...');
    // Call live LLM to get real code
    const raw = await callLLM(system, user, opts);
    // Strip XML boundaries to simulate missing file tag truncation
    const stripped = raw
      .replace(/<file[^>]*>/gi, '')
      .replace(/<\/file>/gi, '')
      .trim();
    return stripped;
  }

  // All other calls use real Gemma
  return await callLLM(system, user, opts);
};

  const defectsByFile = {};
  const strategiesByFile = {};
  const repairsByFile = {};

  const sendEvent = (eventType, data) => {
    const ts = new Date().toISOString().substring(11, 19);

    if (eventType === 'log') {
      const msg = typeof data === 'string' ? data : data?.message || '';
      if (msg.includes('sqlalchemy_validation')) {
        sqlalchemyLogFound = msg;
        console.log(`[${ts}] 🔍 SQLAlchemy Log: ${msg}`);
      }
      if (msg.includes('repair') || msg.includes('DB001') || msg.includes('FILE_BOUNDARY') || msg.includes('OUTPUT_FORMAT')) {
        console.log(`[${ts}] 📋 ${msg}`);
      }
    } else if (eventType === 'repair_defect_classified') {
      defectsByFile[data.path] = data;
      console.log(`[${ts}] 🏷️ Defect Classified: code=${data.code}, message=${data.message}, file=${data.path}`);
    } else if (eventType === 'repair_strategy_selected') {
      strategiesByFile[data.path] = data;
      console.log(`[${ts}] 🎯 Strategy Selected: ${data.strategy} for ${data.path}`);
    } else if (eventType === 'repair_completed') {
      repairsByFile[data.path] = data;
      console.log(`[${ts}] ✅ Repair Completed: status=${data.status} for ${data.path}`);
    }
  };

  try {
    await executeGeneration({
      prd,
      projectName,
      workspacePath,
      autoApprove: true,
      generationId: 'live-truncation-test-' + Date.now(),
      mockLLM: liveTestCaller
    }, sendEvent);

    console.log('\n====================================================');
    console.log('LIVE VERIFICATION ASSERTIONS:');
    console.log('====================================================');

    // 1. Truncation was triggered
    assert.ok(interceptedTruncation, 'Truncation test hook must have been triggered');
    console.log('✅ 1. Truncation path was triggered during live generation.');

    // 2. Truncated file was classified as FILE_BOUNDARY_MISSING / OUTPUT_FORMAT_TRUNCATED, NOT DB001
    const truncatedDefect = defectsByFile['backend/app/db/database.py'];
    assert.ok(truncatedDefect, 'backend/app/db/database.py defect must have been classified');
    assert.notStrictEqual(
      truncatedDefect.code,
      'DB001',
      'Truncated file must NEVER be classified as DB001'
    );
    assert.ok(
      truncatedDefect.code === DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING ||
      truncatedDefect.code === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED,
      `Expected FILE_BOUNDARY_MISSING or OUTPUT_FORMAT_TRUNCATED defect code, got ${truncatedDefect.code}`
    );
    console.log(`✅ 2. Missing </file> was classified as ${truncatedDefect.code} (NOT DB001).`);

    // 3. Strategy was OutputFormatRepairStrategy, NOT DatabaseCredentialRepairStrategy
    const truncatedStrategy = strategiesByFile['backend/app/db/database.py'];
    assert.ok(truncatedStrategy, 'A repair strategy must have been selected for truncated file');
    assert.notStrictEqual(
      truncatedStrategy.strategy,
      'DatabaseCredentialRepairStrategy',
      'Strategy must NEVER be DatabaseCredentialRepairStrategy for missing file boundary'
    );
    assert.strictEqual(
      truncatedStrategy.strategy,
      'OutputFormatRepairStrategy',
      `Expected OutputFormatRepairStrategy, got ${truncatedStrategy.strategy}`
    );
    console.log(`✅ 3. Repair strategy selected: ${truncatedStrategy.strategy} (NOT DatabaseCredentialRepairStrategy).`);

    // 4. Repair status correctness
    const truncatedRepair = repairsByFile['backend/app/db/database.py'];
    assert.ok(truncatedRepair, 'Repair outcome must be recorded for truncated file');
    assert.ok(
      truncatedRepair.status === 'already_valid' || truncatedRepair.status === 'repaired',
      `Expected status 'already_valid' or 'repaired', got ${truncatedRepair.status}`
    );
    console.log(`✅ 4. Repair status correctly reported: ${truncatedRepair.status} (no false zero-hash reported as repaired).`);

    // 5. SQLAlchemy detection reason is never (undefined)
    assert.ok(sqlalchemyLogFound, 'SQLAlchemy detection log must be emitted');
    assert.strictEqual(
      sqlalchemyLogFound.includes('(undefined)'),
      false,
      `SQLAlchemy log must NEVER contain "(undefined)": ${sqlalchemyLogFound}`
    );
    console.log(`✅ 5. SQLAlchemy validation log has defined reason: ${sqlalchemyLogFound}`);

  console.log('\n====================================================');
  console.log('🎉 ALL LIVE RUNTIME REGRESSION ASSERTIONS PASSED!');
  console.log('====================================================\n');

  process.exit(0);
} catch (err) {
  console.error('\n❌ Live truncation repair test failed:', err);
  process.exit(1);
}
