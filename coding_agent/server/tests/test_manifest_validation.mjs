import { validateManifestStructurally, MANIFEST_ERROR_CODES } from '../manifestValidator.js';

async function runTests() {
  let passed = 0;
  let total = 0;

  const test = (name, manifest, expectedIsValid, expectedErrorCode = null) => {
    total++;
    const res = validateManifestStructurally(manifest);
    const hasCode = expectedErrorCode ? res.defects.some(d => d.code === expectedErrorCode) : true;
    const isPassing = res.isValid === expectedIsValid && hasCode;

    if (isPassing) {
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ Test ${total} FAIL: ${name}`);
      console.error(`   Expected isValid=${expectedIsValid}, got ${res.isValid}`);
      if (expectedErrorCode) {
        console.error(`   Expected error code "${expectedErrorCode}", got codes: ${res.defects.map(d => d.code).join(', ')}`);
      }
      console.error('   Errors:', res.errors);
    }
  };

  // 1. Missing modules array
  test('Missing modules array', {}, false, MANIFEST_ERROR_CODES.MODULES_EMPTY);

  // 2. Empty modules array
  test('Empty modules array', { modules: [] }, false, MANIFEST_ERROR_CODES.MODULES_EMPTY);

  // 3. Valid module
  test('Valid module with concrete file and requirements', {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Schema',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/app/db/models.py' }],
        dependencies: []
      }
    ],
    project_requirements: {
      database: { entities: ['User'], tables: ['users'] }
    }
  }, true);

  // 4. Missing required_files property
  test('Missing required_files property in module', {
    modules: [
      { id: 'MOD-000', name: 'Database', layer: 'DATABASE' }
    ],
    project_requirements: {
      database: { entities: ['User'], tables: ['users'] }
    }
  }, false, MANIFEST_ERROR_CODES.REQUIRED_FILES_MISSING);

  // 5. Empty required_files array (The MOD-999 failure case)
  test('Empty required_files array (MOD-999 case)', {
    modules: [
      {
        id: 'MOD-999',
        name: 'Application Wiring',
        layer: 'GENERIC',
        required_files: []
      }
    ]
  }, false, MANIFEST_ERROR_CODES.REQUIRED_FILES_EMPTY);

  // 6. Malformed required_files (not an array)
  test('Malformed required_files (string instead of array)', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: 'backend/main.py'
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.REQUIRED_FILES_MALFORMED);

  // 7. Invalid file path: Path traversal
  test('Invalid file path: path traversal with ..', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: [{ path: '../secret/passwords.txt' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.INVALID_FILE_PATH);

  // 8. Invalid file path: Absolute path
  test('Invalid file path: absolute path', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: [{ path: '/etc/nginx/nginx.conf' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.INVALID_FILE_PATH);

  // 9. Invalid file path: directory without extension
  test('Invalid file path: directory path without file extension', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/controllers/' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.INVALID_FILE_PATH);

  // 10. Duplicate file path across modules
  test('Duplicate file path across modules', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/main.py' }]
      },
      {
        id: 'MOD-999',
        name: 'Application Wiring',
        layer: 'GENERIC',
        required_files: [{ path: 'backend/main.py' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.DUPLICATE_FILE_PATH);

  // 11. Duplicate module ID
  test('Duplicate module ID', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend 1',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/routes/auth.py' }]
      },
      {
        id: 'MOD-001',
        name: 'Backend 2',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/routes/users.py' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.DUPLICATE_MODULE_ID);

  // 12. Unknown dependency
  test('Unknown dependency reference', {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/main.py' }],
        dependencies: ['MOD-NONEXISTENT']
      }
    ],
    project_requirements: { backend: { apis: [] } }
  }, false, MANIFEST_ERROR_CODES.UNKNOWN_DEPENDENCY);

  // 13. Missing database requirements with DATABASE module
  test('Missing project_requirements.database with DATABASE module', {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/models.py' }]
      }
    ]
  }, false, MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS);

  // 14. Multi-tier valid manifest
  test('Multi-tier valid manifest (DATABASE + BACKEND + FRONTEND)', {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/app/db/models.py' }],
        dependencies: []
      },
      {
        id: 'MOD-001',
        name: 'Backend',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/app/main.py' }],
        dependencies: ['MOD-000']
      },
      {
        id: 'MOD-002',
        name: 'Frontend',
        layer: 'FRONTEND',
        required_files: [{ path: 'frontend/src/App.tsx' }],
        dependencies: ['MOD-001']
      }
    ],
    project_requirements: {
      database: { entities: ['User'], tables: ['users'] },
      backend: { apis: ['/api/users'] },
      frontend: { pages: ['Home'] }
    }
  }, true);

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
