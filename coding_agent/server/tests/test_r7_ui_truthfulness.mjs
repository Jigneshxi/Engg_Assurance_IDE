import assert from 'node:assert';
import { evaluateUiTruthfulness, preserveFailedCompletionGate } from '../uiTruthfulness.js';

console.log('================================================');
console.log('   TEST R7: UI TELEMETRY TRUTHFULNESS TEST     ');
console.log('================================================\n');

// --- TEST 1: Completion Gate Status Takes Precedence Over Stale In-Flight Repair Flags ---
console.log('--- TEST 1: Final Gate Evaluated Status Overrides Stale Repair Counts ---');
{
  // Simulating the TaskFlow failure condition:
  // Gate has evaluated and failed with 14 failed gates, but activeRepairsCount was 2
  const failedGate = {
    status: 'FAIL',
    failedGates: [
      'requirementCompleteness',
      'manifestCompleteness',
      'generationCompleteness',
      'syntax',
      'importClosure',
      'productionBuild',
      'frontendContract',
      'backendRuntime',
      'apiAuthz',
      'browserE2e',
      'prdCoverage'
    ],
    required: 45,
    generated: 27,
    validated: 6,
    blocked: 17,
    failed: 1
  };

  const uiState = evaluateUiTruthfulness({
    completionGate: failedGate,
    donePayload: { status: 'failed', gateStatus: 'FAIL' },
    activeRepairsCount: 2, // stale repair count from interrupted loop
    blockedFilesCount: 17,
    failedFilesCount: 1
  });

  // Must NOT display "Active Repair In Progress" or "Final gate not yet evaluated"
  assert.notStrictEqual(uiState.bannerTitle, 'Active Repair In Progress', 'Must NOT display Active Repair In Progress when final gate evaluated');
  assert.strictEqual(uiState.bannerTitle, 'Generation Halted with Validation Failures', 'Banner must state Generation Halted with Validation Failures');
  assert.strictEqual(uiState.uiStatus, 'error', 'Status must be error');
  assert.strictEqual(uiState.badgeText, 'GATE FAILED', 'Badge must state GATE FAILED');
  assert.strictEqual(uiState.badgeTheme, 'danger', 'Badge theme must be danger');
  assert.ok(uiState.bannerMessage.includes('requirementCompleteness'), 'Message must list actual failed gates');
  assert.strictEqual(uiState.failedGates.length, 11, 'Must expose all failed gates');

  console.log('✅ PASS: Final gate evaluation takes precedence over stale repair count.');
}

// --- TEST 2: Active Repair In Progress Shows ONLY While Gate is NOT Evaluated ---
console.log('\n--- TEST 2: In-Flight Repairs Show Active Banner Only While Gate is Pending ---');
{
  const inFlightUi = evaluateUiTruthfulness({
    completionGate: null, // Gate not yet reached
    activeRepairsCount: 3,
    blockedFilesCount: 0,
    failedFilesCount: 0
  });

  assert.strictEqual(inFlightUi.bannerTitle, 'Active Repair In Progress', 'Shows Active Repair In Progress while gate is pending');
  assert.strictEqual(inFlightUi.uiStatus, 'generating', 'Status remains generating during repair');
  assert.strictEqual(inFlightUi.badgeText, 'REPAIRING', 'Badge indicates REPAIRING');
  assert.ok(inFlightUi.bannerMessage.includes('3 file(s)'), 'Indicates count of files being repaired');

  console.log('✅ PASS: In-flight repairs properly display REPAIRING only when completion gate is pending.');
}

// --- TEST 3: Blocked & Failed Files Prevent Deceptive Success ---
console.log('\n--- TEST 3: Blocked/Failed Files Prevent False Success ---');
{
  // A gate that erroneously claimed PASS while files remain blocked or failed
  const conflictingUi = evaluateUiTruthfulness({
    completionGate: { status: 'PASS', failedGates: [] },
    activeRepairsCount: 0,
    blockedFilesCount: 17,
    failedFilesCount: 2
  });

  assert.strictEqual(conflictingUi.isSuccess, false, 'Must never claim success when files are blocked or failed');
  assert.strictEqual(conflictingUi.uiStatus, 'error', 'Must fail closed to error');
  assert.strictEqual(conflictingUi.badgeText, 'FAILED', 'Badge must state FAILED');

  console.log('✅ PASS: Blocked and failed files prevent false success assertions.');
}

// --- TEST 4: preserveFailedCompletionGate Retains Truthful Diagnostics ---
console.log('\n--- TEST 4: preserveFailedCompletionGate Retains Failed Gates ---');
{
  const previous = { status: 'FAIL', failedGates: ['importClosure', 'frontendContract'] };
  const incoming = { status: 'failed', failedGates: ['backendRuntime'] };

  const preserved = preserveFailedCompletionGate(previous, incoming);
  assert.strictEqual(preserved.status, 'FAIL', 'Status must stay FAIL');
  assert.ok(preserved.failedGates.includes('backendRuntime'), 'Incoming failed gates are captured');

  console.log('✅ PASS: Failed completion gate state is preserved truthfully.');
}

// --- TEST 5: Legitimate PASS State When 100% Verified ---
console.log('\n--- TEST 5: Legitimate PASS State When All Gates Pass ---');
{
  const passUi = evaluateUiTruthfulness({
    completionGate: {
      status: 'PASS',
      failedGates: [],
      required: 45,
      generated: 45,
      validated: 45,
      blocked: 0,
      failed: 0
    },
    activeRepairsCount: 0,
    blockedFilesCount: 0,
    failedFilesCount: 0
  });

  assert.strictEqual(passUi.isSuccess, true, 'isSuccess is true only when truly passed');
  assert.strictEqual(passUi.uiStatus, 'done', 'Status is done');
  assert.strictEqual(passUi.badgeText, 'DONE', 'Badge is DONE');
  assert.strictEqual(passUi.failedGates.length, 0, 'Zero failed gates');

  console.log('✅ PASS: Legitimate PASS state verified when all requirements and gates pass.');
}

console.log('\n================================================');
console.log('   ALL R7 UI TELEMETRY TESTS PASSED!            ');
console.log('================================================\n');
