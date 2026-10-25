/**
 * Phase 13: Dedicated PRD Coverage After Generation Test Suite
 * 
 * Verifies that generated output actually implements the original PRD requirements.
 * Ensures the full traceability pipeline:
 * ORIGINAL PRD -> Requirement Contract -> Manifest -> Generated Files -> Validated Implementation -> Runtime Evidence -> Final Requirement Coverage
 * 
 * Verifies every requirement classification:
 * - SUPPORTED + IMPLEMENTED
 * - SUPPORTED + PARTIAL
 * - DEFERRED + EXPLICIT REASON
 * - MISSING
 * - FAILED
 * 
 * Invariant: Zero silent omissions.
 * Defect Code: PRD_COVERAGE_FAILURE
 */

import assert from 'assert';
import {
  PRD_COVERAGE_DEFECT_CODES,
  REQUIREMENT_STATUS,
  extractRequirementsFromPrd,
  inspectFileForRequirementSignals,
  validatePrdCoverage
} from '../prdCoverageValidator.js';
import { getRepairStrategy } from '../repairEngine.js';

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

console.log('🧪 Starting Phase 13: PRD Coverage After Generation Test Suite...\n');

// ── Test 1: SUPPORTED + IMPLEMENTED Classification ───────────────────────────
await runTest('Test 1: Fully mapped and existing files classified as SUPPORTED + IMPLEMENTED', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-001', description: 'Real-time telemetry event processing engine', type: 'backend' }
      ]
    },
    manifest: {
      requirement_mappings: [
        {
          id: 'REQ-001',
          status: 'SUPPORTED',
          files: ['backend/telemetry_service.py']
        }
      ]
    },
    generatedFiles: [
      {
        path: 'backend/telemetry_service.py',
        content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/telemetry")\ndef process_telemetry_event(event): return {"status": "processed", "id": event["id"]}\n'
      }
    ]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, true, 'Valid implementation passes coverage gate');
  assert.strictEqual(res.defects.length, 0);
  assert.strictEqual(res.classifications.length, 1);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.SUPPORTED_IMPLEMENTED);
  assert.strictEqual(res.metrics.implementedCount, 1);
  assert.strictEqual(res.metrics.coverageRatio, 1.0);
});

// ── Test 2: SUPPORTED + PARTIAL Classification ───────────────────────────────
await runTest('Test 2: Partially missing mapped files classified as SUPPORTED + PARTIAL', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-002', description: 'Customer analytics reporting dashboard and export', type: 'feature' }
      ]
    },
    manifest: {
      requirement_mappings: [
        {
          id: 'REQ-002',
          status: 'SUPPORTED',
          files: ['backend/analytics_api.py', 'frontend/AnalyticsDashboard.tsx']
        }
      ]
    },
    generatedFiles: [
      // Only backend generated; frontend missing
      {
        path: 'backend/analytics_api.py',
        content: 'def get_analytics(): return {"metrics": [1, 2, 3]}\n'
      }
    ]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Partial implementation fails strict coverage gate');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.defects[0].subtype, PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_PARTIAL);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.SUPPORTED_PARTIAL);
  assert.strictEqual(res.metrics.partialCount, 1);
});

// ── Test 3: DEFERRED + EXPLICIT REASON Classification ────────────────────────
await runTest('Test 3: Requirement deferred with explicit technical rationale passes contract', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-003', description: 'Multi-datacenter global disaster recovery sync', type: 'infra' }
      ]
    },
    manifest: {
      requirement_mappings: [
        {
          id: 'REQ-003',
          status: 'DEFERRED',
          deferral_reason: 'Deferred to Phase 2: requires multi-region cloud orchestration infrastructure.'
        }
      ]
    },
    generatedFiles: []
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, true, 'Valid reasoned deferral passes coverage gate');
  assert.strictEqual(res.defects.length, 0);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.DEFERRED_EXPLICIT_REASON);
  assert.strictEqual(res.metrics.deferredCount, 1);
  assert.strictEqual(res.metrics.coverageRatio, 1.0);
});

// ── Test 4: Unreasoned Deferral Strictly Rejected ────────────────────────────
await runTest('Test 4: Unreasoned deferral rejected with PRD_UNREASONED_DEFERRAL', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-004', description: 'Core authentication mechanism', type: 'backend' }
      ]
    },
    manifest: {
      requirement_mappings: [
        {
          id: 'REQ-004',
          status: 'DEFERRED',
          deferral_reason: '' // Empty reason
        }
      ]
    },
    generatedFiles: []
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Unreasoned deferral must fail');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.defects[0].subtype, PRD_COVERAGE_DEFECT_CODES.PRD_UNREASONED_DEFERRAL);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.FAILED);
});

// ── Test 5: MISSING (Silent Omission) Strictly Caught ────────────────────────
await runTest('Test 5: Silent omission of PRD requirement strictly caught as MISSING', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-005', description: 'Automated invoice generation service', type: 'backend' }
      ]
    },
    manifest: {
      requirement_mappings: [] // Not declared in mappings
    },
    generatedFiles: [
      {
        path: 'backend/unrelated.py',
        content: 'def helper(): return True\n'
      }
    ]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Silent omission must fail gate');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.defects[0].subtype, PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.MISSING);
  assert.strictEqual(res.metrics.missingCount, 1);
});

// ── Test 6: FAILED Classification (Defective Implementation) ─────────────────
await runTest('Test 6: Requirement mapped to files failing validation marked as FAILED', async () => {
  const context = {
    requirementContract: {
      requirements: [
        { id: 'REQ-006', description: 'Payment processing gateway connector', type: 'backend' }
      ]
    },
    manifest: {
      requirement_mappings: [
        {
          id: 'REQ-006',
          status: 'SUPPORTED',
          files: ['backend/payment.py']
        }
      ]
    },
    generatedFiles: [
      { path: 'backend/payment.py', content: 'def pay(): pass\n' }
    ],
    validationResults: {
      defects: [
        { file: 'backend/payment.py', code: 'SYNTAX_VALIDATION_FAILURE', message: 'Syntax error' }
      ]
    }
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Failed file validation must fail requirement coverage');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.defects[0].subtype, PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_FAILED);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.FAILED);
  assert.strictEqual(res.metrics.failedCount, 1);
});

// ── Test 7: Requirement Extraction from Plain Text PRD ───────────────────────
await runTest('Test 7: Requirements extracted from unstructured PRD text with traceability', async () => {
  const prdText = `
# Logistics Engine PRD
1. REQ-LOG-01 Fleet route optimization algorithm
2. REQ-LOG-02 Warehouse inventory sensor integration
3. REQ-LOG-03 Driver mobile tracking interface
`;

  const extracted = extractRequirementsFromPrd(prdText);
  assert.strictEqual(extracted.length, 3, 'Extracted all 3 requirements');
  assert.strictEqual(extracted[0].id, 'REQ-LOG-01');
  assert.strictEqual(extracted[1].id, 'REQ-LOG-02');
  assert.strictEqual(extracted[2].id, 'REQ-LOG-03');
});

// ── Test 8: Code Signal Matching for Unmapped Output ─────────────────────────
await runTest('Test 8: Signal detection discovers implementing files without hardcoded domain knowledge', async () => {
  const req = { id: 'REQ-IOT-09', description: 'Sensor reading temperature batch ingest API' };
  const matchingFile = {
    path: 'backend/sensors.py',
    content: 'def ingest_temperature_readings(batch): return len(batch)\n'
  };
  const nonMatchingFile = {
    path: 'backend/auth.py',
    content: 'def login(): return "token"\n'
  };

  const sig1 = inspectFileForRequirementSignals(matchingFile, req);
  assert.strictEqual(sig1.matches, true, 'Discovers implementation signals');

  const sig2 = inspectFileForRequirementSignals(nonMatchingFile, req);
  assert.strictEqual(sig2.matches, false, 'Rejects unrelated file');
});

// ── Test 9: Multi-Requirement Composite Contract Coverage ─────────────────────
await runTest('Test 9: Full composite PRD coverage evaluation with mixed supported and deferred', async () => {
  const multiReqContext = {
    requirementContract: {
      requirements: [
        { id: 'REQ-101', description: 'User account creation and security profile', type: 'backend' },
        { id: 'REQ-102', description: 'Financial ledger transaction recording', type: 'backend' },
        { id: 'REQ-103', description: 'Biometric fingerprint hardware terminal auth', type: 'hardware' }
      ]
    },
    manifest: {
      requirement_mappings: [
        { id: 'REQ-101', status: 'SUPPORTED', files: ['backend/accounts.py'] },
        { id: 'REQ-102', status: 'SUPPORTED', files: ['backend/ledger.py'] },
        { id: 'REQ-103', status: 'DEFERRED', deferral_reason: 'Hardware integration deferred to field test phase' }
      ]
    },
    generatedFiles: [
      { path: 'backend/accounts.py', content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/accounts")\ndef create_account(data: dict): return {"name": data["name"]}\n' },
      { path: 'backend/ledger.py', content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/ledger")\ndef record_transaction(data: dict): return {"amount": data["amount"]}\n' }
    ]
  };

  const res = await validatePrdCoverage(multiReqContext);
  assert.strictEqual(res.isValid, true, 'Composite suite satisfies total requirement coverage');
  assert.strictEqual(res.metrics.totalRequirements, 3);
  assert.strictEqual(res.metrics.implementedCount, 2);
  assert.strictEqual(res.metrics.deferredCount, 1);
  assert.strictEqual(res.metrics.missingCount, 0);
  assert.strictEqual(res.metrics.coverageRatio, 1.0);
});

// ── Test 10: Repair Engine Strategy Mapping ───────────────────────────────────
await runTest('Test 10: Repair Engine maps PrdCoverageRepairStrategy for PRD_COVERAGE_FAILURE', async () => {
  const strategy = getRepairStrategy(PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE);
  assert.ok(strategy, 'Repair strategy exists for PRD_COVERAGE_FAILURE');
  assert.strictEqual(strategy.name, 'PrdCoverageRepairStrategy');
  assert.ok(strategy.instructions.length >= 3, 'Contains targeted PRD coverage instructions');
  assert.ok(strategy.forbidden.length >= 2, 'Contains forbidden anti-patterns');
});

console.log(`\n==================================================`);
console.log(`Phase 13 PRD Coverage Test Suite Completed`);
console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`==================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
