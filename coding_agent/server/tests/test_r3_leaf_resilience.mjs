import { isNonCriticalLeafFile, cascadeModuleFailure } from '../orchestrator.js';

console.log('================================================');
console.log('    TEST R3: NON-CRITICAL LEAF RESILIENCE TEST   ');
console.log('================================================\n');

function testLeafFileClassification() {
  console.log('--- TEST 1: isNonCriticalLeafFile Classification ---');

  // Leaf files that must NOT block project
  const leafFiles = [
    'backend/alembic/env.py',
    'backend/migrations/env.py',
    'backend/alembic.ini',
    'backend/alembic/script.py.mako',
    'backend/seed.py',
    'backend/app/seeds.py',
    'backend/mock_data.py',
    'README.md',
    'docs/api.md',
    '.env.example'
  ];

  for (const f of leafFiles) {
    assert.strictEqual(isNonCriticalLeafFile(f), true, `File "${f}" must be classified as non-critical leaf`);
  }

  // Critical files that MUST block if failed
  const criticalFiles = [
    'backend/app/db/models.py',
    'backend/app/db/database.py',
    'backend/app/db/base.py',
    'backend/app/main.py',
    'backend/app/api/auth.py',
    'backend/app/api/tasks.py',
    'frontend/src/App.tsx',
    'frontend/src/pages/Dashboard.tsx'
  ];

  for (const f of criticalFiles) {
    assert.strictEqual(isNonCriticalLeafFile(f), false, `File "${f}" must be classified as critical architectural file`);
  }

  console.log('✅ PASS: Leaf vs critical files classified with 100% precision.\n');
}

function testCascadeFailurePreventedWhenOnlyLeafFails() {
  console.log('--- TEST 2: cascadeModuleFailure Prevented When Critical Files Are Intact ---');

  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Foundation',
        status: 'FAILED',
        dependencies: [],
        required_files: [
          { path: 'backend/app/db/database.py', status: 'validated' },
          { path: 'backend/app/db/models.py', status: 'validated' },
          { path: 'backend/alembic/env.py', status: 'failed' } // Only leaf failed!
        ]
      },
      {
        id: 'MOD-001',
        name: 'Authentication Module',
        status: 'PENDING',
        dependencies: ['MOD-000'],
        required_files: [
          { path: 'backend/app/api/auth.py', status: 'pending' }
        ]
      },
      {
        id: 'MOD-002',
        name: 'Task Management Module',
        status: 'PENDING',
        dependencies: ['MOD-000', 'MOD-001'],
        required_files: [
          { path: 'backend/app/api/tasks.py', status: 'pending' }
        ]
      }
    ]
  };

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  // Call cascadeModuleFailure for MOD-000
  const blocked = cascadeModuleFailure('MOD-000', manifest, sendEvent);

  // Assert that cascade was prevented because critical files (database.py, models.py) are validated!
  assert.strictEqual(blocked.size, 0, 'No downstream modules should be blocked when only leaf files failed');
  assert.strictEqual(manifest.modules[1].status, 'PENDING', 'MOD-001 must remain PENDING');
  assert.strictEqual(manifest.modules[2].status, 'PENDING', 'MOD-002 must remain PENDING');
  assert.strictEqual(manifest.modules[1].required_files[0].status, 'pending');
  assert.strictEqual(manifest.modules[2].required_files[0].status, 'pending');

  assert.ok(
    events.some(e => e.ev === 'log' && e.data.includes('[cascade_prevented]')),
    'Log must record that cascade failure was prevented'
  );

  console.log('✅ PASS: Downstream modules MOD-001 and MOD-002 were not blocked by alembic/env.py.\n');
}

function testCascadeFailureOccursWhenCriticalFileFails() {
  console.log('--- TEST 3: cascadeModuleFailure Occurs When Critical File Fails ---');

  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Foundation',
        status: 'FAILED',
        dependencies: [],
        required_files: [
          { path: 'backend/app/db/database.py', status: 'validated' },
          { path: 'backend/app/db/models.py', status: 'failed' }, // Critical file failed!
          { path: 'backend/alembic/env.py', status: 'validated' }
        ]
      },
      {
        id: 'MOD-001',
        name: 'Authentication Module',
        status: 'PENDING',
        dependencies: ['MOD-000'],
        required_files: [
          { path: 'backend/app/api/auth.py', status: 'pending' }
        ]
      }
    ]
  };

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const blocked = cascadeModuleFailure('MOD-000', manifest, sendEvent);

  // Assert that cascade DOES occur when critical file (models.py) failed
  assert.strictEqual(blocked.has('MOD-001'), true, 'MOD-001 must be blocked when critical models.py failed');
  assert.strictEqual(manifest.modules[1].status, 'BLOCKED_BY_DEPENDENCY');
  assert.strictEqual(manifest.modules[1].required_files[0].status, 'blocked_by_dependency');

  console.log('✅ PASS: Critical failure correctly cascades to dependents as required.\n');
  console.log('================================================');
  console.log('   ALL R3 LEAF RESILIENCE TESTS PASSED!         ');
  console.log('================================================');
}

function runAll() {
  testLeafFileClassification();
  testCascadeFailurePreventedWhenOnlyLeafFails();
  testCascadeFailureOccursWhenCriticalFileFails();
}

runAll();
