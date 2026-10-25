import assert from 'assert';
import { evaluateUiTruthfulness } from '../uiTruthfulness.js';
import { evaluateFinalCompletionGate } from '../orchestrator.js';

console.log('🧪 Starting Phase 15: UI Truthfulness Test Suite...\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Criteria A — PASS State (Completed ONLY when final gate = PASS)
// ─────────────────────────────────────────────────────────────────────────────
{
  const gateResult = evaluateFinalCompletionGate({
    allModulesPassed: true,
    semanticValid: true,
    fileCompletenessPassed: true,
    importClosurePassed: true,
    frontendContractPassed: true,
    backendRuntimePassed: true,
    apiAuthzPassed: true,
    prdCoveragePassed: true,
    browserE2ePassed: true,
    securityPassed: true,
    stubsAbsent: true,
    requirementTestsPassed: true,
    buildPassed: true,
    artifactHashMatched: true,
    syntaxPassed: true,
    architectureContractPassed: true,
    manifestCompletenessPassed: true,
    generationBoundaryPassed: true
  });

  assert.strictEqual(gateResult.isPassed, true, 'Gate evaluation must pass');

  const uiState = evaluateUiTruthfulness({
    completionGate: {
      status: gateResult.status,
      failedGates: gateResult.failedGates,
      totalGates: gateResult.totalGates,
      passedGatesCount: gateResult.passedGatesCount
    },
    donePayload: {
      status: 'completed',
      gateStatus: 'PASS',
      failedGates: []
    },
    activeRepairsCount: 0,
    blockedFilesCount: 0,
    failedFilesCount: 0
  });

  assert.strictEqual(uiState.uiStatus, 'done', 'UI status must be done on verified PASS');
  assert.strictEqual(uiState.isSuccess, true, 'isSuccess must be true on verified PASS');
  assert.strictEqual(uiState.badgeText, 'DONE', 'Badge must state DONE');
  assert.strictEqual(uiState.badgeTheme, 'success', 'Theme must be success');
  assert.strictEqual(uiState.failedGates.length, 0, 'No failed gates on PASS');
  assert(uiState.bannerTitle.includes('Complete'), 'Banner must indicate completion');

  console.log('✅ PASS: Test 1: UI says completed ONLY when authoritative final gate = PASS');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Criteria B — FAIL State (Clearly shows generation failed)
// ─────────────────────────────────────────────────────────────────────────────
{
  const uiState = evaluateUiTruthfulness({
    completionGate: {
      status: 'FAIL',
      failedGates: ['syntax', 'importClosure'],
      totalGates: 15,
      passedGatesCount: 13
    },
    donePayload: {
      status: 'failed',
      gateStatus: 'FAIL',
      failedGates: ['syntax', 'importClosure']
    }
  });

  assert.strictEqual(uiState.uiStatus, 'error', 'UI status must be error on gate failure');
  assert.strictEqual(uiState.isSuccess, false, 'isSuccess must be false on gate failure');
  assert.strictEqual(uiState.badgeText, 'GATE FAILED', 'Badge must indicate gate failure');
  assert.strictEqual(uiState.badgeTheme, 'danger', 'Theme must be danger/red');
  assert.deepStrictEqual(uiState.failedGates, ['syntax', 'importClosure'], 'Failed gates must be exposed');
  assert(uiState.bannerMessage.includes('syntax, importClosure'), 'Banner message must expose failed gates');

  console.log('✅ PASS: Test 2: UI clearly shows generation failed when completion gate fails');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Criteria C — PARTIAL / BLOCKED State (Must not display success)
// ─────────────────────────────────────────────────────────────────────────────
{
  const uiState = evaluateUiTruthfulness({
    completionGate: null,
    donePayload: null,
    activeRepairsCount: 0,
    blockedFilesCount: 3,
    failedFilesCount: 1
  });

  assert.strictEqual(uiState.uiStatus, 'error', 'UI status must be error for blocked files without gate');
  assert.strictEqual(uiState.isSuccess, false, 'UI must NEVER display success for blocked files');
  assert.strictEqual(uiState.badgeText, 'FAILED', 'Badge must show FAILED');
  assert(uiState.bannerTitle.includes('Blocked') || uiState.bannerTitle.includes('Incomplete'), 'Banner must state blocked state');

  console.log('✅ PASS: Test 3: Blocked and partial states strictly forbid displaying success');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Criteria D — Validation Failures (Expose meaningful failure state)
// ─────────────────────────────────────────────────────────────────────────────
{
  const uiState = evaluateUiTruthfulness({
    completionGate: {
      status: 'FAIL',
      failedGates: ['dbOrmSemantics', 'apiAuthz', 'prdCoverage']
    }
  });

  assert.strictEqual(uiState.isSuccess, false, 'Validation failures cannot claim success');
  assert(uiState.bannerMessage.includes('dbOrmSemantics'), 'Banner must list dbOrmSemantics failure');
  assert(uiState.bannerMessage.includes('apiAuthz'), 'Banner must list apiAuthz failure');
  assert(uiState.bannerMessage.includes('prdCoverage'), 'Banner must list prdCoverage failure');

  console.log('✅ PASS: Test 4: Validation failures expose detailed, meaningful failure state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Criteria E — Repair State (Must not show completion while repairing)
// ─────────────────────────────────────────────────────────────────────────────
{
  const uiState = evaluateUiTruthfulness({
    completionGate: null,
    donePayload: null,
    activeRepairsCount: 2,
    blockedFilesCount: 0
  });

  assert.strictEqual(uiState.uiStatus, 'generating', 'Status must remain generating during repairs');
  assert.strictEqual(uiState.isSuccess, false, 'Must not claim success while repairs are active');
  assert.strictEqual(uiState.badgeText, 'REPAIRING', 'Badge must show REPAIRING');
  assert.strictEqual(uiState.badgeTheme, 'warning', 'Theme must be warning during repair');
  assert(uiState.bannerTitle.includes('Repair'), 'Banner must indicate active repair');

  console.log('✅ PASS: Test 5: UI forbids claiming completion while automated repair is active');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Criteria F — Backend Disconnect / Timeout (UI must not invent success)
// ─────────────────────────────────────────────────────────────────────────────
{
  const uiState = evaluateUiTruthfulness({
    completionGate: null,
    donePayload: null,
    streamDisconnectedAbruptly: true
  });

  assert.strictEqual(uiState.uiStatus, 'error', 'Status must be error on abrupt stream disconnect');
  assert.strictEqual(uiState.isSuccess, false, 'Must not invent success when disconnected');
  assert.strictEqual(uiState.badgeText, 'ERROR', 'Badge must show ERROR');
  assert(uiState.bannerMessage.includes('terminated unexpectedly'), 'Banner must warn about connection termination');

  console.log('✅ PASS: Test 6: Abrupt stream disconnect fails closed and does not invent success');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Criteria G — Missing/Invalid Completion Payload (Fail-closed)
// ─────────────────────────────────────────────────────────────────────────────
{
  // A done payload arrived but completionGate is missing!
  const uiState = evaluateUiTruthfulness({
    completionGate: null,
    donePayload: { status: 'completed' },
    activeRepairsCount: 0
  });

  assert.strictEqual(uiState.uiStatus, 'error', 'Status must fail-closed to error if gate is missing');
  assert.strictEqual(uiState.isSuccess, false, 'Unverified completion must be rejected');
  assert.strictEqual(uiState.badgeText, 'UNVERIFIED', 'Badge must mark state as UNVERIFIED');
  assert(uiState.bannerTitle.includes('Unverified'), 'Banner must reject unverified completion');

  console.log('✅ PASS: Test 7: Missing/invalid completion gate payload fails closed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Criteria H — Refresh / Reload (Must not manufacture a completed state)
// ─────────────────────────────────────────────────────────────────────────────
{
  // On initial mount / reload without verified completion:
  const uiState = evaluateUiTruthfulness({
    completionGate: null,
    donePayload: null
  });

  assert.strictEqual(uiState.uiStatus, 'idle', 'Default state on fresh load must be idle');
  assert.strictEqual(uiState.isSuccess, false, 'Must not manufacture completed state on load');
  assert.strictEqual(uiState.badgeText, 'PRD ENTRY', 'Badge must state PRD ENTRY');

  console.log('✅ PASS: Test 8: Fresh load/refresh defaults to PRD ENTRY without manufactured state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Criteria I — Telemetry / Status Mismatch (Trust authoritative gate)
// ─────────────────────────────────────────────────────────────────────────────
{
  // Contradiction: donePayload claims 'completed', but completionGate reported 'FAIL'
  const uiState1 = evaluateUiTruthfulness({
    completionGate: {
      status: 'FAIL',
      failedGates: ['backendRuntime']
    },
    donePayload: {
      status: 'completed',
      gateStatus: 'PASS'
    }
  });

  assert.strictEqual(uiState1.isSuccess, false, 'Must reject false completed claim when gate failed');
  assert.strictEqual(uiState1.uiStatus, 'error', 'Status must be error when gate failed');
  assert.strictEqual(uiState1.badgeText, 'GATE FAILED', 'Badge must state GATE FAILED');

  // Contradiction: completionGate claims 'PASS', but donePayload claims 'failed'
  const uiState2 = evaluateUiTruthfulness({
    completionGate: {
      status: 'PASS',
      failedGates: []
    },
    donePayload: {
      status: 'failed',
      gateStatus: 'FAIL',
      failedGates: ['telemetry']
    }
  });

  assert.strictEqual(uiState2.isSuccess, false, 'Must reject pass when done payload reported failure');
  assert.strictEqual(uiState2.uiStatus, 'error', 'Status must be error on telemetry mismatch');
  assert.strictEqual(uiState2.badgeText, 'CONFLICT', 'Badge must identify conflict');

  console.log('✅ PASS: Test 9: Telemetry mismatches strictly resolved in favor of failure');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: End-to-End Orchestrator Gate Output Truthfulness Contract
// ─────────────────────────────────────────────────────────────────────────────
{
  // Verify that evaluateFinalCompletionGate returns exact binary PASS/FAIL
  const passResult = evaluateFinalCompletionGate({
    allModulesPassed: true,
    semanticValid: true,
    fileCompletenessPassed: true,
    importClosurePassed: true,
    frontendContractPassed: true,
    backendRuntimePassed: true,
    apiAuthzPassed: true,
    prdCoveragePassed: true,
    browserE2ePassed: true,
    securityPassed: true,
    stubsAbsent: true,
    requirementTestsPassed: true,
    buildPassed: true,
    artifactHashMatched: true,
    syntaxPassed: true,
    architectureContractPassed: true,
    manifestCompletenessPassed: true,
    generationBoundaryPassed: true
  });
  assert.strictEqual(passResult.status, 'PASS', 'Pass result must be strictly PASS');
  assert.strictEqual(passResult.isPassed, true, 'isPassed must be true');

  const failResult = evaluateFinalCompletionGate({
    allModulesPassed: true,
    semanticValid: false,
    fileCompletenessPassed: true
  });
  assert.strictEqual(failResult.status, 'FAIL', 'Fail result must be strictly FAIL');
  assert.strictEqual(failResult.isPassed, false, 'isPassed must be false');
  assert(failResult.failedGates.includes('dbOrmSemantics'), 'failedGates must include dbOrmSemantics');

  console.log('✅ PASS: Test 10: Orchestrator gate evaluation strictly delivers binary truth');
}

console.log('\n==================================================');
console.log('Phase 15 UI Truthfulness Test Suite Completed');
console.log('Passed: 10 / 10');
console.log('Failed: 0');
console.log('==================================================\n');
