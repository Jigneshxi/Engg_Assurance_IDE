import assert from 'assert';
import { isConstraintOrCrossCuttingRequirement, deriveRequirementObligations } from '../manifestValidator.js';
import { validateIntegrationContract } from '../integrationContract.js';
import { validatePrdCoverage, REQUIREMENT_STATUS } from '../prdCoverageValidator.js';

console.log('================================================');
console.log('   TEST R5: PRD REQUIREMENT NORMALIZER TEST     ');
console.log('================================================\n');

function testConstraintClassification() {
  console.log('--- TEST 1: isConstraintOrCrossCuttingRequirement Classification ---');

  const constraints = [
    { id: 'REQ-001', description: 'The backend must be built with FastAPI and SQLite', type: 'feature' },
    { id: 'REQ-002', description: 'All passwords must be hashed using bcrypt', type: 'backend' },
    { id: 'REQ-003', description: 'CORS must be enabled for localhost:5173', type: 'backend' },
    { id: 'REQ-004', description: 'Frontend built with React and TypeScript', type: 'frontend' },
    { id: 'REQ-005', description: 'Application response time must be under 200ms', type: 'non-functional' },
    { id: 'REQ-006', description: 'Architecture configuration and docker-compose settings', type: 'configuration' }
  ];

  for (const c of constraints) {
    assert.strictEqual(
      isConstraintOrCrossCuttingRequirement(c),
      true,
      `Requirement "${c.description}" must be classified as constraint/cross-cutting`
    );
  }

  const features = [
    { id: 'REQ-010', description: 'User can create, edit, and delete task items', type: 'feature' },
    { id: 'REQ-011', description: 'User can filter tasks by priority and category', type: 'feature' },
    { id: 'REQ-012', description: 'System sends automated email reminders for overdue tasks', type: 'backend' },
    { id: 'REQ-013', description: 'Interactive dashboard displaying completed task charts', type: 'frontend' }
  ];

  for (const f of features) {
    assert.strictEqual(
      isConstraintOrCrossCuttingRequirement(f),
      false,
      `Feature requirement "${f.description}" must NOT be classified as constraint`
    );
  }

  console.log('✅ PASS: Constraints vs functional features classified with 100% precision.\n');
}

function testObligationsForConstraints() {
  console.log('--- TEST 2: deriveRequirementObligations Separates Constraints from API Obligations ---');

  const constraintReq = {
    id: 'REQ-001',
    description: 'The backend must be built with FastAPI and SQLite',
    type: 'feature'
  };

  const obligations = deriveRequirementObligations(constraintReq);
  assert.strictEqual(obligations.isConstraint, true, 'isConstraint flag must be true');
  assert.strictEqual(obligations.isApiBackend, false, 'Constraint must not create artificial API backend obligations');

  const featureReq = {
    id: 'REQ-010',
    description: 'User can create, edit, and delete task items via REST API',
    type: 'feature'
  };

  const featureObligations = deriveRequirementObligations(featureReq);
  assert.strictEqual(featureObligations.isConstraint, false, 'Feature is not a constraint');
  assert.strictEqual(featureObligations.isApiBackend, true, 'Feature must create API backend obligations');

  console.log('✅ PASS: Obligation derivation properly separates constraints from business API obligations.\n');
}

function testIntegrationContractExcludesConstraintsFromWorkflows() {
  console.log('--- TEST 3: validateIntegrationContract Excludes Constraints from Workflow Mapping Requirements ---');

  const manifest = {
    modules: [
      {
        id: 'MOD-001',
        required_files: [
          { path: 'backend/app/api/tasks.py' },
          { path: 'backend/tests/test_tasks.py' }
        ]
      }
    ],
    requirementContract: {
      requirements: [
        { id: 'REQ-001', description: 'Built with FastAPI and SQLite', type: 'constraint' },
        { id: 'REQ-002', description: 'User can create tasks', type: 'feature' }
      ]
    }
  };

  // Contract only covers the functional requirement REQ-002 in workflow tests
  const contract = {
    endpoints: [
      {
        method: 'POST',
        path: '/api/tasks',
        backendFile: 'backend/app/api/tasks.py',
        requestFields: ['title'],
        responseFields: ['id', 'title']
      }
    ],
    workflows: [
      {
        testFile: 'backend/tests/test_tasks.py',
        runner: 'pytest',
        requirementIds: ['REQ-002']
      }
    ]
  };

  const res = validateIntegrationContract(contract, manifest);
  // Assert that REQ-001 does NOT cause "No workflow test mapping for requirement REQ-001"
  assert.strictEqual(
    res.errors.some(e => e.includes('REQ-001')),
    false,
    'Constraint REQ-001 must not trigger missing workflow test error'
  );
  assert.strictEqual(res.isValid, true, 'Integration contract should be valid without testing constraints as endpoints');

  console.log('✅ PASS: Constraints do not trigger fake workflow test errors.\n');
}

async function testPrdCoverageForConstraints() {
  console.log('--- TEST 4: validatePrdCoverage Supports Architectural Constraints ---');

  const context = {
    prd: 'TaskFlow PRD',
    requirementContract: {
      requirements: [
        { id: 'REQ-001', description: 'The backend must be built with FastAPI and SQLite', type: 'constraint' }
      ]
    },
    manifest: {
      modules: [
        {
          id: 'MOD-000',
          required_files: [{ path: 'backend/app/main.py' }]
        }
      ]
    },
    generatedFiles: [
      {
        path: 'backend/app/main.py',
        content: 'from fastapi import FastAPI\napp = FastAPI()\n'
      }
    ]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, true, 'PRD coverage should be valid for satisfied constraints');
  assert.strictEqual(res.metrics.missingCount, 0, 'No requirements should be missing');
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.SUPPORTED_IMPLEMENTED);

  console.log('✅ PASS: Constraints correctly pass PRD coverage validation.\n');
  console.log('================================================');
  console.log('   ALL R5 REQUIREMENT NORMALIZER TESTS PASSED!  ');
  console.log('================================================');
}

async function runAll() {
  testConstraintClassification();
  testObligationsForConstraints();
  testIntegrationContractExcludesConstraintsFromWorkflows();
  await testPrdCoverageForConstraints();
}

runAll().catch(err => {
  console.error('❌ Test R5 Failed:', err);
  process.exit(1);
});
