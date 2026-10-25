import assert from 'node:assert';
import test from 'node:test';
import { isNonCriticalLeafFile, cascadeModuleFailure } from '../orchestrator.js';
import { classifyRepairAttempt } from '../repairEngine.js';

test('T4.1: isNonCriticalLeafFile correctly classifies leaf and boilerplate files', () => {
  const leaves = [
    'backend/app/db/base.py',
    'app/db/base.py',
    'backend/app/db/seed.py',
    'backend/migrations/env.py',
    'backend/alembic.ini',
    'backend/migrations/script.py.mako',
    'README.md'
  ];

  for (const leaf of leaves) {
    assert.strictEqual(isNonCriticalLeafFile(leaf), true, `${leaf} should be classified as non-critical leaf`);
  }

  const critical = [
    'backend/app/db/models.py',
    'backend/app/db/database.py',
    'backend/app/main.py',
    'backend/app/api/auth.py',
    'frontend/src/App.tsx'
  ];

  for (const crit of critical) {
    assert.strictEqual(isNonCriticalLeafFile(crit), false, `${crit} should be classified as critical`);
  }
});

test('T4.2: cascadeModuleFailure isolates downstream modules when only leaf/base files fail', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Layer',
        status: 'FAILED',
        dependencies: [],
        required_files: [
          { path: 'backend/app/db/models.py', status: 'validated' },
          { path: 'backend/app/db/database.py', status: 'validated' },
          { path: 'backend/app/db/base.py', status: 'failed' },
          { path: 'backend/migrations/env.py', status: 'failed' }
        ]
      },
      {
        id: 'MOD-001',
        name: 'Backend API',
        status: 'PENDING',
        dependencies: ['MOD-000'],
        required_files: [{ path: 'backend/app/api/tasks.py', status: 'pending' }]
      },
      {
        id: 'MOD-002',
        name: 'Frontend Views',
        status: 'PENDING',
        dependencies: ['MOD-000', 'MOD-001'],
        required_files: [{ path: 'frontend/src/Tasks.tsx', status: 'pending' }]
      }
    ]
  };

  const events = [];
  const sendEvent = (event, payload) => events.push({ event, payload });

  const blocked = cascadeModuleFailure('MOD-000', manifest, sendEvent);

  assert.strictEqual(blocked.size, 0, 'No downstream modules should be blocked when critical files are intact');
  assert.strictEqual(manifest.modules[1].status, 'PENDING', 'MOD-001 must remain PENDING');
  assert.strictEqual(manifest.modules[2].status, 'PENDING', 'MOD-002 must remain PENDING');

  const logEvent = events.find(e => e.event === 'log' && e.payload.includes('[cascade_prevented]'));
  assert.ok(logEvent, 'Must emit cascade_prevented event');
});

test('T4.3: cascadeModuleFailure correctly blocks downstream modules when critical models.py fails', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Layer',
        status: 'FAILED',
        dependencies: [],
        required_files: [
          { path: 'backend/app/db/models.py', status: 'failed' },
          { path: 'backend/app/db/database.py', status: 'validated' }
        ]
      },
      {
        id: 'MOD-001',
        name: 'Backend API',
        status: 'PENDING',
        dependencies: ['MOD-000'],
        required_files: [{ path: 'backend/app/api/tasks.py', status: 'pending' }]
      }
    ]
  };

  const blocked = cascadeModuleFailure('MOD-000', manifest);
  assert.strictEqual(blocked.has('MOD-001'), true, 'MOD-001 must be blocked when models.py failed');
  assert.strictEqual(manifest.modules[1].status, 'BLOCKED_BY_DEPENDENCY');
});

test('T4.4: classifyRepairAttempt treats syntax -> semantic progression as IMPROVEMENT rather than REGRESSED', () => {
  const beforeDefects = [
    { code: 'SYNTAX_ERROR', message: 'SyntaxError at line 1', validator: 'syntax' }
  ];

  // Fixing syntax surfaces 2 semantic defects that could not be parsed previously
  const afterDefects = [
    { code: 'BROKEN_IMPORT', message: 'Cannot import symbol X', validator: 'import_closure' },
    { code: 'MISSING_FIELD', message: 'Field name required', validator: 'semantic' }
  ];

  const result = classifyRepairAttempt({
    beforeHash: 'hash_broken_syntax',
    afterHash: 'hash_valid_syntax_semantic_issues',
    beforeDefectSet: beforeDefects,
    afterDefectSet: afterDefects,
    attempt: 1,
    maxAttempts: 3
  });

  assert.strictEqual(result.classification, 'STAGE_PROGRESSION');
  assert.strictEqual(result.status, 'IMPROVEMENT');
  assert.ok(result.message.includes('Syntax resolved in attempt 1'));
});

test('T4.5: classifyRepairAttempt still detects genuine regressions when defects increase without syntax progression', () => {
  const beforeDefects = [
    { code: 'BROKEN_IMPORT', message: 'Cannot import symbol X', validator: 'import_closure' }
  ];

  const afterDefects = [
    { code: 'BROKEN_IMPORT', message: 'Cannot import symbol X', validator: 'import_closure' },
    { code: 'AUTH_LEAK', message: 'User ownership missing', validator: 'security' }
  ];

  const result = classifyRepairAttempt({
    beforeHash: 'hash_a',
    afterHash: 'hash_b',
    beforeDefectSet: beforeDefects,
    afterDefectSet: afterDefects,
    attempt: 1,
    maxAttempts: 3
  });

  assert.strictEqual(result.classification, 'REGRESSED');
  assert.strictEqual(result.status, 'REGRESSED');
});
