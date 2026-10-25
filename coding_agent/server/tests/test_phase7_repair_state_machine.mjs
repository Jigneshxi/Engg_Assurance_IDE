/**
 * Phase 7: Repair Engine State Machine & Anti-Oscillation Test Suite
 *
 * Verifies:
 * 1. Formal state transitions: GENERATED -> VALIDATING -> REPAIRING -> VALIDATING -> PASSED / FAILED / BLOCKED_BY_DEPENDENCY
 * 2. Transition validation and state history recording
 * 3. Terminal failure on MAX_FILE_REPAIR_ATTEMPTS = 3
 * 4. Stagnation detection on zero-change patch (NO_CHANGE)
 * 5. Hash oscillation detection (A -> B -> A) and loop termination
 * 6. Rejection of STACK_CONTRACT_MISMATCH from targeted patch repairs
 * 7. Independent revalidation for already valid files (already_valid)
 * 8. Dependency failure cascading (BLOCKED_BY_DEPENDENCY)
 * 9. Structured repair failure telemetry (buildRepairFailure) with secret redaction
 * 10. Stale search context refresh retry (repair_patch_context_retry)
 */

import assert from 'assert';
import crypto from 'crypto';
import {
  REPAIR_STATES,
  canTransitionRepairState,
  transitionRepairState,
  buildRepairFailure,
  detectRepairProgress,
  detectSemanticRepairProgress,
  repairFile
} from '../repairEngine.js';
import { cascadeModuleFailure, DATABASE_DEFECT_CODES } from '../orchestrator.js';

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(err);
    failedTests++;
  }
}

console.log('🧪 Starting Phase 7: Repair Engine State Machine & Anti-Oscillation Test Suite...\n');

// ── Test 1: State Machine Transition Rules & History ─────────────────────────
await runTest('Test 1: Formal state transitions and transition validation', async () => {
  assert.strictEqual(REPAIR_STATES.PENDING, 'pending');
  assert.strictEqual(REPAIR_STATES.GENERATING, 'generating');
  assert.strictEqual(REPAIR_STATES.GENERATED, 'generated');
  assert.strictEqual(REPAIR_STATES.VALIDATING, 'validating');
  assert.strictEqual(REPAIR_STATES.REPAIRING, 'repairing');
  assert.strictEqual(REPAIR_STATES.VALIDATED, 'validated');
  assert.strictEqual(REPAIR_STATES.PASSED, 'passed');
  assert.strictEqual(REPAIR_STATES.FAILED, 'failed');
  assert.strictEqual(REPAIR_STATES.BLOCKED_BY_DEPENDENCY, 'blocked_by_dependency');

  // Valid forward transitions
  assert.strictEqual(canTransitionRepairState('pending', 'generating'), true);
  assert.strictEqual(canTransitionRepairState('generating', 'validating'), true);
  assert.strictEqual(canTransitionRepairState('generating', 'generated'), true);
  assert.strictEqual(canTransitionRepairState('generated', 'validating'), true);
  assert.strictEqual(canTransitionRepairState('validating', 'repairing'), true);
  assert.strictEqual(canTransitionRepairState('repairing', 'validating'), true);
  assert.strictEqual(canTransitionRepairState('validating', 'validated'), true);
  assert.strictEqual(canTransitionRepairState('validated', 'passed'), true);

  // Illegal transitions
  assert.strictEqual(canTransitionRepairState('passed', 'generating'), false);
  assert.strictEqual(canTransitionRepairState('failed', 'validating'), false);
  assert.strictEqual(canTransitionRepairState('blocked_by_dependency', 'generating'), false);
  assert.strictEqual(canTransitionRepairState('pending', 'passed'), false);

  // Test transitionRepairState helper and state history tracking
  const fileDef = { path: 'backend/core/service.py', status: 'pending' };
  transitionRepairState(fileDef, 'generating', { reason: 'DAG scheduled' });
  transitionRepairState(fileDef, 'validating', { reason: 'Generation output ready' });
  transitionRepairState(fileDef, 'repairing', { reason: 'Syntax defect detected' });
  transitionRepairState(fileDef, 'validating', { reason: 'Patch applied' });
  transitionRepairState(fileDef, 'validated', { reason: 'Checks passed' });

  assert.strictEqual(fileDef.status, 'validated');
  assert.strictEqual(fileDef.stateHistory.length, 5);
  assert.strictEqual(fileDef.stateHistory[0].from, 'pending');
  assert.strictEqual(fileDef.stateHistory[0].to, 'generating');
  assert.strictEqual(fileDef.stateHistory[4].to, 'validated');

  // Verify transitionRepairState throws on invalid transition
  assert.throws(() => {
    transitionRepairState(fileDef, 'generating', { reason: 'Invalid jump' });
  }, /Invalid repair state machine transition/);
});

// ── Test 2: Maximum Attempt Cap (MAX_FILE_REPAIR_ATTEMPTS = 3) ───────────────
await runTest('Test 2: Terminal failure transition when MAX_FILE_REPAIR_ATTEMPTS is reached', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const defectiveCode = 'def calculate_metric(a, b):\n    return a + ';
  const fileDef = {
    path: 'backend/core/calc.py',
    content: defectiveCode,
    status: 'repairing',
    repairAttempts: 2, // Entering attempt 2; next will be 3 (MAX_FILE_REPAIR_ATTEMPTS)
    errors: ['Syntax error: unexpected EOF while parsing']
  };

  const activeModule = { id: 'mod_core', name: 'Core Module' };
  const manifest = { modules: [activeModule] };
  const defects = [{ code: 'SYNTAX_ERROR', message: 'Syntax error: unexpected EOF while parsing' }];

  // Mock caller that generates a patch that still fails syntax check
  const mockCaller = async () => {
    return `<patch file="backend/core/calc.py">
<search>
    return a + 
</search>
<replace>
    return a + *
</replace>
</patch>`;
  };

  const validateFn = async () => ({ isValid: false, errors: ['Invalid syntax in expression'] });

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent,
    generationId: 'gen-max-attempts',
    validateFn
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(fileDef.status, 'failed');
  assert.strictEqual(fileDef.repairAttempts, 3);

  const blockedEvent = events.find(e => e.ev === 'repair_blocked');
  assert.ok(blockedEvent, 'repair_blocked event must be emitted when max attempts are reached');
  assert.strictEqual(blockedEvent.data.path, 'backend/core/calc.py');

  // Now, calling repairFile on a fileDef that already has repairAttempts >= 3 immediately fails
  const secondRes = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent,
    generationId: 'gen-max-attempts-2',
    validateFn
  });
  assert.strictEqual(secondRes.success, false);
  assert.strictEqual(secondRes.status, 'failed');
  assert.ok(secondRes.error.includes('Exceeded maximum file repair attempts'));
});

// ── Test 3: Stagnation Detection on Zero-Change Patch (NO_CHANGE) ─────────────
await runTest('Test 3: Zero-change patch triggers NO_CHANGE stagnation detection', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const code = 'def get_status():\n    return "unresolved"';
  const fileDef = {
    path: 'backend/status.py',
    content: code,
    status: 'repairing',
    repairAttempts: 0,
    errors: ['Invalid return type']
  };

  const activeModule = { id: 'mod_status', name: 'Status Module' };
  const manifest = { modules: [activeModule] };
  const defects = [{ code: 'SEMANTIC_ISSUE', message: 'Status must be verified' }];

  // Mock caller outputs a patch where search and replace are identical (zero change)
  const mockCaller = async () => {
    return `<patch file="backend/status.py">
<search>
    return "unresolved"
</search>
<replace>
    return "unresolved"
</replace>
</patch>`;
  };

  const validateFn = async () => ({ isValid: false, errors: ['Status must be verified'] });

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent,
    generationId: 'gen-no-change',
    validateFn
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'no_progress');
  const noProgressEvent = events.find(e => e.ev === 'repair_no_progress');
  assert.ok(noProgressEvent, 'repair_no_progress event must be emitted for zero-change patch');
});

// ── Test 4: Hash Oscillation Detection (A -> B -> A) ─────────────────────────
await runTest('Test 4: Anti-oscillation halts circular repair thrashing', async () => {
  const fileA = 'backend/models/alpha.py';
  const hashA = crypto.createHash('sha256').update('version_A_content').digest('hex');
  const hashB = crypto.createHash('sha256').update('version_B_content').digest('hex');

  const defect1 = {
    code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
    validator: 'database_semantics',
    file: fileA,
    model: 'AlphaModel',
    relationship: 'beta_items'
  };

  const defect2 = {
    code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
    validator: 'database_semantics',
    file: fileA,
    model: 'AlphaModel',
    relationship: 'beta_collection'
  };

  // Step 1: Initial defect detected (State A)
  const step1 = detectSemanticRepairProgress({
    previous: null,
    defects: [defect1],
    fileHashes: { [fileA]: hashA }
  });
  assert.strictEqual(step1.status, 'PROGRESS');
  assert.strictEqual(step1.attempt, 1);

  // Step 2: Repair modifies file to State B with different defect
  const step2 = detectSemanticRepairProgress({
    previous: step1.state,
    defects: [defect2],
    fileHashes: { [fileA]: hashB }
  });
  assert.strictEqual(step2.status, 'PROGRESS');
  assert.strictEqual(step2.attempt, 2);

  // Step 3: Repair modifies file back to State A (Oscillation: A -> B -> A)
  const step3 = detectSemanticRepairProgress({
    previous: step2.state,
    defects: [defect1],
    fileHashes: { [fileA]: hashA }
  });
  assert.strictEqual(step3.status, 'SEMANTIC_REPAIR_OSCILLATION', 'Oscillating to previous defect fingerprint or hash must be flagged');

  // Verify detectRepairProgress also flags OSCILLATION when history has matching hash
  const fileHistory = [
    { attempt: 1, hashBefore: hashA, hashAfter: hashB, defectsBefore: [defect1], defectsAfter: [defect2] }
  ];
  const fileProg = detectRepairProgress({
    hashBefore: hashB,
    hashAfter: hashA, // Oscillated back to initial hashA
    defectsBefore: [defect2],
    defectsAfter: [defect1],
    attempt: 2,
    history: fileHistory
  });
  assert.strictEqual(fileProg.status, 'OSCILLATION');
});

// ── Test 5: STACK_CONTRACT_MISMATCH Refusal ──────────────────────────────────
await runTest('Test 5: STACK_CONTRACT_MISMATCH is rejected from line repairs and transitions to failed', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const fileDef = {
    path: 'backend/models/entity.py',
    content: 'export class PrismaModel {}',
    status: 'repairing',
    repairAttempts: 0,
    errors: ['STACK_CONTRACT_MISMATCH: TypeScript Prisma code in Python backend project']
  };

  const activeModule = { id: 'mod_db', name: 'Database Module' };
  const manifest = { modules: [activeModule] };
  const defects = [{
    code: DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
    message: 'STACK_CONTRACT_MISMATCH: Incompatible tech stack file',
    severity: 'HIGH'
  }];

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: async () => assert.fail('LLM caller should never be invoked for STACK_CONTRACT_MISMATCH'),
    sendEvent,
    generationId: 'gen-mismatch',
    validateFn: async () => ({ isValid: false, errors: ['Mismatch'] })
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(res.defectCode, DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH);
  assert.strictEqual(fileDef.status, 'failed');
  assert.ok(events.some(e => e.ev === 'log' && e.data.includes('STACK_CONTRACT_MISMATCH')));
});

// ── Test 6: Independent Revalidation for Already Valid Files ─────────────────
await runTest('Test 6: File already valid passes immediately without modification', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const cleanCode = 'def compute_total(items):\n    return sum(item.value for item in items)\n';
  const fileDef = {
    path: 'backend/services/math.py',
    content: cleanCode,
    status: 'repairing',
    repairAttempts: 0,
    errors: ['Previous stale error']
  };

  const activeModule = { id: 'mod_math', name: 'Math Module' };
  const manifest = { modules: [activeModule] };
  const defects = [{ code: 'SYNTAX_ERROR', message: 'Previous stale error' }];

  // Patch authoring returns a patch whose search block does not match
  const mockCaller = async () => {
    return `<patch file="backend/services/math.py">
<search>
    non_existent_line_here = True
</search>
<replace>
    repaired_line = True
</replace>
</patch>`;
  };

  // Independent revalidation reports the file is actually 100% valid
  const validateFn = async () => ({ isValid: true, errors: [] });

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent,
    generationId: 'gen-already-valid',
    validateFn
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'already_valid');
  assert.strictEqual(res.alreadyValid, true);
  assert.strictEqual(res.repaired, false);
  assert.strictEqual(fileDef.status, 'validated');
  assert.strictEqual(fileDef.content, cleanCode, 'File content must not be corrupted');
});

// ── Test 7: Upstream Dependency Failure Cascading ────────────────────────────
await runTest('Test 7: Upstream failure cascades BLOCKED_BY_DEPENDENCY down DAG', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const manifest = {
    modules: [
      {
        id: 'module_alpha',
        name: 'Alpha Module',
        status: 'FAILED',
        dependencies: [],
        required_files: [{ path: 'backend/alpha.py', status: 'failed' }]
      },
      {
        id: 'module_beta',
        name: 'Beta Module',
        status: 'PENDING',
        dependencies: ['module_alpha'],
        required_files: [{ path: 'backend/beta.py', status: 'pending' }]
      },
      {
        id: 'module_gamma',
        name: 'Gamma Module',
        status: 'PENDING',
        dependencies: ['module_beta'],
        required_files: [{ path: 'backend/gamma.py', status: 'repairing' }]
      },
      {
        id: 'module_independent',
        name: 'Independent Module',
        status: 'PENDING',
        dependencies: [],
        required_files: [{ path: 'frontend/index.html', status: 'pending' }]
      }
    ]
  };

  const blocked = cascadeModuleFailure('module_alpha', manifest, sendEvent);

  assert.ok(blocked.has('module_beta'), 'module_beta depends directly on module_alpha');
  assert.ok(blocked.has('module_gamma'), 'module_gamma depends transitively on module_alpha');
  assert.strictEqual(blocked.has('module_independent'), false, 'independent module must not be blocked');

  const betaMod = manifest.modules.find(m => m.id === 'module_beta');
  const gammaMod = manifest.modules.find(m => m.id === 'module_gamma');
  const indepMod = manifest.modules.find(m => m.id === 'module_independent');

  assert.strictEqual(betaMod.status, 'BLOCKED_BY_DEPENDENCY');
  assert.strictEqual(gammaMod.status, 'BLOCKED_BY_DEPENDENCY');
  assert.strictEqual(indepMod.status, 'PENDING');

  assert.strictEqual(betaMod.required_files[0].status, 'blocked_by_dependency');
  assert.strictEqual(gammaMod.required_files[0].status, 'blocked_by_dependency');
  assert.strictEqual(indepMod.required_files[0].status, 'pending');

  assert.ok(events.some(e => e.ev === 'module_blocked' && e.data.moduleId === 'module_beta'));
  assert.ok(events.some(e => e.ev === 'module_blocked' && e.data.moduleId === 'module_gamma'));
});

// ── Test 8: Structured Repair Failure Telemetry & Secret Redaction ───────────
await runTest('Test 8: buildRepairFailure produces structured telemetry with redacted credentials', async () => {
  const secretCred = 'postgresql://admin:super_secret_password_12345@localhost:5432/core_db';
  const fileDef = {
    path: 'backend/core/database.py',
    content: `DATABASE_URL = "${secretCred}"`
  };

  const defect = {
    code: DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED,
    validator: 'credential_scanner',
    message: `Exposed password in connection string: ${secretCred}`
  };

  const failure = buildRepairFailure({
    fileDef,
    defect,
    reason: `Invalid patch containing ${secretCred}`,
    attempt: 2,
    patch: {
      search: `DATABASE_URL = "${secretCred}"`,
      replace: 'DATABASE_URL = os.getenv("DATABASE_URL")'
    },
    retryCount: 1
  });

  assert.strictEqual(failure.file, 'backend/core/database.py');
  assert.strictEqual(failure.defectCode, DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED);
  assert.strictEqual(failure.attemptedRepair.strategy, 'DatabaseCredentialRepairStrategy');
  assert.strictEqual(failure.attemptedRepair.attempt, 2);
  assert.strictEqual(failure.attemptedRepair.retryCount, 1);
  assert.strictEqual(failure.attemptedRepair.applied, false);
  assert.ok(failure.currentContentHash);

  // Redaction checks: password must NEVER be leaked in patchReason or remainingDefect.message
  assert.strictEqual(failure.patchReason.includes('super_secret_password_12345'), false, 'Secret password must be redacted from patchReason');
  assert.strictEqual(failure.remainingDefect.message.includes('super_secret_password_12345'), false, 'Secret password must be redacted from remainingDefect.message');
  assert.ok(failure.patchReason.includes('***') || failure.patchReason.includes('[REDACTED]'));
});

// ── Test 9: Stale Search Context Refresh Retry ────────────────────────────────
await runTest('Test 9: Stale patch search triggers context refresh retry', async () => {
  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const existingCode = 'def run():\n    return 42\n';
  const fileDef = {
    path: 'backend/runner.py',
    content: existingCode,
    status: 'repairing',
    repairAttempts: 0,
    errors: ['Need to return 100']
  };

  const activeModule = { id: 'mod_run', name: 'Run Module' };
  const manifest = { modules: [activeModule] };
  const defects = [{ code: 'GENERIC_DEFECT', message: 'Need to return 100' }];

  let callCount = 0;
  const mockCaller = async (sys, prompt) => {
    callCount++;
    if (callCount === 1) {
      // First attempt outputs a stale/hallucinated search block
      return `<patch file="backend/runner.py">
<search>
    stale_line_that_does_not_exist()
</search>
<replace>
    return 100
</replace>
</patch>`;
    } else {
      // Second attempt (retry) receives refreshed context and outputs valid patch
      assert.ok(prompt.includes('PATCH SEARCH RETRY'), 'Retry prompt must state search retry');
      return `<patch file="backend/runner.py">
<search>
    return 42
</search>
<replace>
    return 100
</replace>
</patch>`;
    }
  };

  const validateFn = async (f) => ({ isValid: f.content.includes('return 100'), errors: [] });

  const res = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent,
    generationId: 'gen-retry-search',
    validateFn
  });

  assert.strictEqual(callCount, 2, 'One retry should have been attempted after stale search');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'repaired');
  assert.strictEqual(fileDef.content, 'def run():\n    return 100\n');
  assert.ok(events.some(e => e.ev === 'repair_patch_context_retry'), 'repair_patch_context_retry event must be emitted');
});

// ── Test 10: Progress Classification Matrix ──────────────────────────────────
await runTest('Test 10: detectRepairProgress defect classification matrix', async () => {
  const hash1 = 'hash_one';
  const hash2 = 'hash_two';

  const dA = { code: 'ERR_A', locations: [{ line: 10, column: 5 }] };
  const dB = { code: 'ERR_B', locations: [{ line: 20, column: 1 }] };

  // Case A: Defects fully resolved
  const resResolved = detectRepairProgress({
    hashBefore: hash1,
    hashAfter: hash2,
    defectsBefore: [dA, dB],
    defectsAfter: [],
    attempt: 1
  });
  assert.strictEqual(resResolved.status, 'RESOLVED');

  // Case B: Defect count decreased (IMPROVEMENT)
  const resImprovement = detectRepairProgress({
    hashBefore: hash1,
    hashAfter: hash2,
    defectsBefore: [dA, dB],
    defectsAfter: [dA],
    attempt: 1
  });
  assert.strictEqual(resImprovement.status, 'IMPROVEMENT');

  // Case C: Same defects and same locations across attempt >= 2 (NO_IMPROVEMENT)
  const resNoImprovement = detectRepairProgress({
    hashBefore: hash1,
    hashAfter: hash2,
    defectsBefore: [dA],
    defectsAfter: [dA],
    attempt: 2
  });
  assert.strictEqual(resNoImprovement.status, 'NO_IMPROVEMENT');

  // Case D: Content modified with different defects (PROGRESSING)
  const resProgressing = detectRepairProgress({
    hashBefore: hash1,
    hashAfter: hash2,
    defectsBefore: [dA],
    defectsAfter: [dB],
    attempt: 1
  });
  assert.strictEqual(resProgressing.status, 'PROGRESSING');
});

console.log('\n========================================');
console.log(`Phase 7 Test Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
