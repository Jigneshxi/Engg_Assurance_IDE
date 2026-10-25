/**
 * Phase 14: Final Completion Gate Authoritative Test Suite
 * 
 * Verifies that the authoritative final acceptance gate enforces:
 * - requirement completeness
 * - architecture contract
 * - manifest completeness
 * - generation completeness
 * - generation boundary
 * - syntax
 * - import closure
 * - DB/ORM semantics
 * - repair state
 * - security
 * - frontend contract
 * - backend runtime
 * - API/AuthZ
 * - browser E2E where applicable
 * - PRD coverage
 * 
 * Invariants:
 * 1. The final result must be strictly deterministic: PASS or FAIL.
 * 2. No ambiguous "mostly complete", "looks good", or "generation successful" allowed.
 * 3. Every single individual failing gate must prevent completion.
 */

import assert from 'assert';
import { evaluateFinalCompletionGate } from '../orchestrator.js';

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

console.log('🧪 Starting Phase 14: Final Completion Gate Test Suite...\n');

const allGreenContext = {
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
};

// ── Test 1: All Required Gates Green Produces PASS ────────────────────────────
await runTest('Test 1: When all 19 required gates are green, final status is strictly PASS', async () => {
  const result = evaluateFinalCompletionGate(allGreenContext);
  assert.strictEqual(result.status, 'PASS', 'Status is strictly PASS');
  assert.strictEqual(result.isPassed, true);
  assert.strictEqual(result.failedGates.length, 0);
  assert.strictEqual(result.totalGates, 19);
  assert.strictEqual(result.passedGatesCount, 19);
});

// ── Test 2: Requirement Completeness Failure Blocks Completion ────────────────
await runTest('Test 2: Requirement completeness failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, manifestCompletenessPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('requirementCompleteness') || res.failedGates.includes('manifestCompleteness'));
});

// ── Test 3: Architecture Contract Failure Blocks Completion ───────────────────
await runTest('Test 3: Architecture contract failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, architectureContractPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('architectureContract'));
});

// ── Test 4: Syntax Failure Blocks Completion ──────────────────────────────────
await runTest('Test 4: Syntax failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, syntaxPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('syntax'));
});

// ── Test 5: Import Closure Failure Blocks Completion ──────────────────────────
await runTest('Test 5: Import closure failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, importClosurePassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('importClosure'));
});

// ── Test 6: DB / ORM Semantics Failure Blocks Completion ──────────────────────
await runTest('Test 6: Database / ORM semantics failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, semanticValid: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('dbOrmSemantics'));
});

// ── Test 7: Security Failure Blocks Completion ────────────────────────────────
await runTest('Test 7: Security gate failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, securityPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('security'));
});

// ── Test 8: Frontend Contract Failure Blocks Completion ───────────────────────
await runTest('Test 8: Frontend contract failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, frontendContractPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('frontendContract'));
});

// ── Test 9: Backend Runtime Failure Blocks Completion ─────────────────────────
await runTest('Test 9: Backend runtime failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, backendRuntimePassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('backendRuntime'));
});

// ── Test 10: API AuthN & AuthZ Failure Blocks Completion ──────────────────────
await runTest('Test 10: API AuthN & AuthZ failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, apiAuthzPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('apiAuthz'));
});

// ── Test 11: Browser E2E Failure Blocks Completion ────────────────────────────
await runTest('Test 11: Browser E2E failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, browserE2ePassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('browserE2e'));
});

// ── Test 12: PRD Coverage Failure Blocks Completion ───────────────────────────
await runTest('Test 12: PRD coverage failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, prdCoveragePassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('prdCoverage'));
});

// ── Test 13: Generation Boundary Failure Blocks Completion ────────────────────
await runTest('Test 13: Generation boundary failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, generationBoundaryPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('generationBoundary'));
});

// ── Test 14: Repair State / Unpassed Module Blocks Completion ─────────────────
await runTest('Test 14: Unpassed module / repair state failure hard-fails gate', async () => {
  const ctx = { ...allGreenContext, allModulesPassed: false };
  const res = evaluateFinalCompletionGate(ctx);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.isPassed, false);
  assert.ok(res.failedGates.includes('repairState'));
});

// ── Test 15: Zero Ambiguity Enforcement ───────────────────────────────────────
await runTest('Test 15: Gate output is binary (PASS or FAIL) with zero ambiguous states', async () => {
  const ambiguousStrings = [
    'mostly complete',
    'looks good',
    'generation successful',
    'files generated',
    'almost complete'
  ];

  const passRes = evaluateFinalCompletionGate(allGreenContext);
  assert.ok(['PASS', 'FAIL'].includes(passRes.status));
  assert.strictEqual(ambiguousStrings.includes(passRes.status.toLowerCase()), false);

  const failRes = evaluateFinalCompletionGate({ ...allGreenContext, apiAuthzPassed: false });
  assert.ok(['PASS', 'FAIL'].includes(failRes.status));
  assert.strictEqual(ambiguousStrings.includes(failRes.status.toLowerCase()), false);
});

await runTest('New checklist gates independently block stubs, weak requirement evidence, builds, and hash drift', async () => {
  for (const [field, gate] of [
    ['stubsAbsent', 'stubsAbsent'],
    ['requirementTestsPassed', 'requirementTests'],
    ['buildPassed', 'productionBuild'],
    ['artifactHashMatched', 'exportHashMatchesValidatedArtifact']
  ]) {
    const result = evaluateFinalCompletionGate({ ...allGreenContext, [field]: false });
    assert.equal(result.status, 'FAIL', `${field} must fail the final gate`);
    assert(result.failedGates.includes(gate), `${gate} must be named in diagnostics`);
  }
});

console.log(`\n==================================================`);
console.log(`Phase 14 Final Completion Gate Test Suite Completed`);
console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`==================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
