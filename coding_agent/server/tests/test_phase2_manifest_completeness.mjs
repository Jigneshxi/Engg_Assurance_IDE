import {
  validateRequirementContract,
  validateManifestRequirementCoverage,
  detectManifestJsonTruncation,
  mergeManifestContinuation,
  MANIFEST_ERROR_CODES
} from '../manifestValidator.js';

async function runPhase2Tests() {
  console.log('======================================================================');
  console.log('RUNNING PHASE 2 — REQUIREMENT CONTRACT + MANIFEST COMPLETENESS SUITE');
  console.log('======================================================================');

  let passed = 0;
  let total = 0;

  function assertTest(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`✅ TEST ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ TEST ${total} FAIL: ${name}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // Baseline contracts & manifest for tests
  const baseReqContract = {
    requirements: [
      { id: 'REQ-001', description: 'Entity authentication and session management', type: 'backend' },
      { id: 'REQ-002', description: 'Core domain data persistence and relations', type: 'database' },
      { id: 'REQ-003', description: 'Interactive application dashboard view', type: 'frontend' },
      { id: 'REQ-004', description: 'Export report generation', type: 'feature' }
    ]
  };

  const baseModules = [
    {
      id: 'MOD-000',
      name: 'Database Architecture',
      layer: 'DATABASE',
      dependencies: [],
      required_files: [
        { path: 'backend/app/db/database.py' },
        { path: 'backend/app/db/models.py' }
      ]
    },
    {
      id: 'MOD-001',
      name: 'Backend API',
      layer: 'BACKEND',
      dependencies: ['MOD-000'],
      required_files: [
        { path: 'backend/main.py' },
        { path: 'backend/app/api/auth.py' }
      ]
    },
    {
      id: 'MOD-002',
      name: 'Frontend Application',
      layer: 'FRONTEND',
      dependencies: ['MOD-001'],
      required_files: [
        { path: 'frontend/src/App.tsx' },
        { path: 'frontend/src/Dashboard.tsx' }
      ]
    }
  ];

  // -------------------------------------------------------------
  // TEST 1: Complete Valid Manifest & Requirement Contract
  // -------------------------------------------------------------
  const completeManifest = {
    modules: baseModules,
    requirement_mappings: [
      {
        id: 'REQ-001',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/app/api/auth.py'],
        implementation_responsibility: 'Handles authentication and token creation',
        dependency: 'MOD-000',
        validation_responsibility: 'Tested via auth route smoke test'
      },
      {
        id: 'REQ-002',
        status: 'SUPPORTED',
        module: 'MOD-000',
        files: ['backend/app/db/models.py'],
        implementation_responsibility: 'Declares SQLAlchemy ORM models',
        dependency: [],
        validation_responsibility: 'Tested via db mapper check'
      },
      {
        id: 'REQ-003',
        status: 'SUPPORTED',
        module: 'MOD-002',
        files: ['frontend/src/Dashboard.tsx'],
        implementation_responsibility: 'Renders user interactive dashboard',
        dependency: 'MOD-001',
        validation_responsibility: 'Tested via frontend build & smoke'
      },
      {
        id: 'REQ-004',
        status: 'DEFERRED',
        reason: 'Report export scheduled for post-v1 release; not in MVP critical path'
      }
    ]
  };

  const completeRes = validateManifestRequirementCoverage(completeManifest, baseReqContract);
  assertTest(
    completeRes.isValid === true &&
    completeRes.coveredRequirements === 4 &&
    completeRes.totalRequirements === 4,
    'Complete manifest satisfies covered_requirements === total_requirements',
    completeRes.errors.join('; ')
  );

  // -------------------------------------------------------------
  // TEST 2: Missing Requirements (Silently Disappeared) -> MANIFEST_INCOMPLETE
  // -------------------------------------------------------------
  const missingReqManifest = {
    modules: baseModules,
    requirement_mappings: [
      {
        id: 'REQ-001',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/app/api/auth.py'],
        implementation_responsibility: 'Handles auth',
        dependency: 'MOD-000',
        validation_responsibility: 'Auth test'
      }
      // REQ-002, REQ-003, REQ-004 missing completely
    ]
  };

  const missingRes = validateManifestRequirementCoverage(missingReqManifest, baseReqContract);
  assertTest(
    missingRes.isValid === false &&
    missingRes.code === MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE &&
    missingRes.errors.some(e => e.includes('REQ-002') && e.includes('cannot silently disappear')),
    'Missing requirement from PRD contract hard-fails manifest gate with MANIFEST_INCOMPLETE',
    `code=${missingRes.code}, errors=${missingRes.errors.join('; ')}`
  );

  // -------------------------------------------------------------
  // TEST 3: Duplicate Requirement IDs in Contract -> DUPLICATE_REQUIREMENT_ID
  // -------------------------------------------------------------
  const duplicateIdContract = {
    requirements: [
      { id: 'REQ-001', description: 'First req' },
      { id: 'REQ-001', description: 'Duplicated req' }
    ]
  };

  const dupRes = validateRequirementContract(duplicateIdContract);
  assertTest(
    dupRes.isValid === false &&
    dupRes.defects.some(d => d.code === MANIFEST_ERROR_CODES.DUPLICATE_REQUIREMENT_ID),
    'Duplicate requirement IDs in contract are strictly rejected',
    `defects=${dupRes.defects.map(d => d.code).join(', ')}`
  );

  // -------------------------------------------------------------
  // TEST 4: Truncated JSON Manifest Detection
  // -------------------------------------------------------------
  const truncatedManifestStrings = [
    '{"modules": [{"id": "MOD-000", "name": "Database", "layer": "DATA', // mid-string truncation
    '{"modules": [{"id": "MOD-000", "required_files": [{"path": "backend/models.py"}]', // unclosed array & object
    '```json\n{"modules": []}\n', // empty modules array
    '' // empty string
  ];

  const allTruncatedDetected = truncatedManifestStrings.every(s => {
    const res = detectManifestJsonTruncation(s);
    return res.isTruncated === true;
  });

  const validJsonString = JSON.stringify({ modules: baseModules });
  const validCheck = detectManifestJsonTruncation(validJsonString);

  assertTest(
    allTruncatedDetected && !validCheck.isTruncated,
    'detectManifestJsonTruncation strictly catches truncated/corrupted JSON and accepts complete valid JSON'
  );

  // -------------------------------------------------------------
  // TEST 5: Deterministic Continuation Merging
  // -------------------------------------------------------------
  // Chunk 1: Cut off after declaring MOD-000
  const chunk1 = `{\n  "modules": [\n    {\n      "id": "MOD-000",\n      "name": "Database",\n      "layer": "DATABASE",\n      "required_files": [{"path": "backend/app/db/models.py"}]\n    },`;
  // Chunk 2: Starts with conversational preamble, then continues with MOD-001 and closes
  const chunk2 = `Here is the continuation:\n    {\n      "id": "MOD-001",\n      "name": "Backend",\n      "layer": "BACKEND",\n      "required_files": [{"path": "backend/main.py"}]\n    }\n  ]\n}`;

  const continuationMerge = mergeManifestContinuation(chunk1, chunk2);
  const parsedContinuation = continuationMerge.parsed;

  assertTest(
    continuationMerge.progress === true &&
    continuationMerge.isTruncated === false &&
    parsedContinuation &&
    Array.isArray(parsedContinuation.modules) &&
    parsedContinuation.modules.length === 2 &&
    parsedContinuation.modules[0].id === 'MOD-000' &&
    parsedContinuation.modules[1].id === 'MOD-001',
    'mergeManifestContinuation cleanly strips conversational prefix and stitches JSON chunks into valid manifest',
    `isTruncated=${continuationMerge.isTruncated}, modules=${parsedContinuation?.modules?.length}`
  );

  // Continuation overlap deduplication: Chunk 2 repeats the end of Chunk 1
  const chunkOverlap1 = `{\n  "modules": [\n    {\n      "id": "MOD-000",\n      "name": "Database"`;
  const chunkOverlap2 = `    {\n      "id": "MOD-000",\n      "name": "Database",\n      "layer": "DATABASE",\n      "required_files": [{"path": "backend/models.py"}]\n    }\n  ]\n}`;

  const overlapMerge = mergeManifestContinuation(chunkOverlap1, chunkOverlap2);
  assertTest(
    overlapMerge.isTruncated === false &&
    overlapMerge.parsed &&
    overlapMerge.parsed.modules.length === 1 &&
    overlapMerge.parsed.modules[0].layer === 'DATABASE',
    'mergeManifestContinuation deduplicates repeated overlap tokens on chunk boundaries',
    `isTruncated=${overlapMerge.isTruncated}, raw=${overlapMerge.merged}`
  );

  // -------------------------------------------------------------
  // TEST 6: False-Complete Manifest Rejections
  // -------------------------------------------------------------
  // Sub-case A: DEFERRED requirement without reason
  const deferredNoReasonManifest = {
    modules: baseModules,
    requirement_mappings: [
      {
        id: 'REQ-001',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/app/api/auth.py'],
        implementation_responsibility: 'Handles auth',
        dependency: 'MOD-000',
        validation_responsibility: 'Auth test'
      },
      {
        id: 'REQ-002',
        status: 'SUPPORTED',
        module: 'MOD-000',
        files: ['backend/app/db/models.py'],
        implementation_responsibility: 'DB models',
        dependency: [],
        validation_responsibility: 'DB test'
      },
      {
        id: 'REQ-003',
        status: 'SUPPORTED',
        module: 'MOD-002',
        files: ['frontend/src/Dashboard.tsx'],
        implementation_responsibility: 'Dashboard view',
        dependency: 'MOD-001',
        validation_responsibility: 'UI test'
      },
      {
        id: 'REQ-004',
        status: 'DEFERRED'
        // Missing reason!
      }
    ]
  };
  const falseCompleteA = validateManifestRequirementCoverage(deferredNoReasonManifest, baseReqContract);

  // Sub-case B: SUPPORTED requirement referencing a file NOT in that module's required_files
  const phantomFileManifest = {
    modules: baseModules,
    requirement_mappings: [
      {
        id: 'REQ-001',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/app/nonexistent_file.py'], // File does not exist in MOD-001
        implementation_responsibility: 'Handles auth',
        dependency: 'MOD-000',
        validation_responsibility: 'Auth test'
      },
      {
        id: 'REQ-002',
        status: 'SUPPORTED',
        module: 'MOD-000',
        files: ['backend/app/db/models.py'],
        implementation_responsibility: 'DB models',
        dependency: [],
        validation_responsibility: 'DB test'
      },
      {
        id: 'REQ-003',
        status: 'SUPPORTED',
        module: 'MOD-002',
        files: ['frontend/src/Dashboard.tsx'],
        implementation_responsibility: 'Dashboard view',
        dependency: 'MOD-001',
        validation_responsibility: 'UI test'
      },
      {
        id: 'REQ-004',
        status: 'DEFERRED',
        reason: 'Post MVP'
      }
    ]
  };
  const falseCompleteB = validateManifestRequirementCoverage(phantomFileManifest, baseReqContract);

  // Sub-case C: SUPPORTED requirement missing implementation responsibility
  const missingRespManifest = {
    modules: baseModules,
    requirement_mappings: [
      {
        id: 'REQ-001',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/app/api/auth.py'],
        // missing implementation_responsibility!
        dependency: 'MOD-000',
        validation_responsibility: 'Auth test'
      },
      {
        id: 'REQ-002',
        status: 'SUPPORTED',
        module: 'MOD-000',
        files: ['backend/app/db/models.py'],
        implementation_responsibility: 'DB models',
        dependency: [],
        validation_responsibility: 'DB test'
      },
      {
        id: 'REQ-003',
        status: 'SUPPORTED',
        module: 'MOD-002',
        files: ['frontend/src/Dashboard.tsx'],
        implementation_responsibility: 'Dashboard view',
        dependency: 'MOD-001',
        validation_responsibility: 'UI test'
      },
      {
        id: 'REQ-004',
        status: 'DEFERRED',
        reason: 'Post MVP'
      }
    ]
  };
  const falseCompleteC = validateManifestRequirementCoverage(missingRespManifest, baseReqContract);

  assertTest(
    falseCompleteA.isValid === false &&
    falseCompleteA.code === MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE &&
    falseCompleteB.isValid === false &&
    falseCompleteB.code === MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE &&
    falseCompleteC.isValid === false &&
    falseCompleteC.code === MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
    'False-complete manifests (deferred without reason, phantom files, missing responsibilities) strictly fail gate with MANIFEST_INCOMPLETE',
    `A: ${falseCompleteA.errors.join('; ')} | B: ${falseCompleteB.errors.join('; ')} | C: ${falseCompleteC.errors.join('; ')}`
  );

  console.log('======================================================================');
  console.log(`PHASE 2 TEST SUMMARY: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('======================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase2Tests().catch(err => {
  console.error('Unhandled Phase 2 Test Error:', err);
  process.exit(1);
});
