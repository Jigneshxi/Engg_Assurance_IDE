import assert from 'assert';
import { validateManifestStructurally, repairManifestOwnership, MANIFEST_ERROR_CODES } from '../manifestValidator.js';
import { getModuleCompletionStatus } from '../orchestrator.js';
import { scanForCredentials, checkSqlalchemyAvailability } from '../dbValidator.js';

console.log('--- OPENCLAW MANIFEST OWNERSHIP & MOD-999 REGRESSION SUITE ---');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ Test ${total} PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ Test ${total} FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// TEST 1: Two modules claim backend/main.py → manifest rejected → structured ownership conflict returned
runTest('Two modules claim backend/main.py → manifest rejected & structured conflict returned', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
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
  };

  const res = validateManifestStructurally(manifest);
  assert.strictEqual(res.isValid, false, 'Manifest must be rejected due to duplicate ownership');
  assert.ok(res.errors.some(e => e.includes('Duplicate file ownership detected')));
  assert.ok(res.defects.some(d => d.code === MANIFEST_ERROR_CODES.DUPLICATE_FILE_PATH));
  
  assert.ok(Array.isArray(res.conflicts), 'Validation result must include structured conflicts array');
  assert.strictEqual(res.conflicts.length, 1);
  const conflict = res.conflicts[0];
  assert.strictEqual(conflict.file, 'backend/main.py');
  assert.strictEqual(conflict.existingOwner, 'MOD-001');
  assert.strictEqual(conflict.conflictingOwner, 'MOD-999');
  assert.ok(conflict.resolution && conflict.resolution.includes('Choose exactly one owner'));
  assert.deepStrictEqual(conflict.currentOwners, ['MOD-001', 'MOD-999']);
});

// TEST 2: MOD-999 claims backend/main.py already owned by MOD-001 → repair removes duplicate ownership
runTest('MOD-999 claims backend/main.py already owned by MOD-001 → repair removes duplicate ownership', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
        required_files: [{ path: 'backend/main.py' }]
      },
      {
        id: 'MOD-999',
        name: 'Application Wiring',
        layer: 'GENERIC',
        required_files: [{ path: 'backend/main.py' }, { path: 'backend/wiring.py' }]
      }
    ],
    project_requirements: { backend: { apis: [] } }
  };

  const repaired = repairManifestOwnership(manifest);
  const mod001 = repaired.modules.find(m => m.id === 'MOD-001');
  const mod999 = repaired.modules.find(m => m.id === 'MOD-999');

  assert.ok(mod001, 'MOD-001 must exist');
  assert.ok(mod999, 'MOD-999 must exist because it has wiring.py');
  assert.strictEqual(mod001.required_files.length, 1);
  assert.strictEqual(mod001.required_files[0].path, 'backend/main.py', 'MOD-001 retains backend/main.py');
  assert.strictEqual(mod999.required_files.length, 1);
  assert.strictEqual(mod999.required_files[0].path, 'backend/wiring.py', 'MOD-999 only retains wiring.py');

  const validation = validateManifestStructurally(repaired);
  assert.strictEqual(validation.isValid, true, 'Repaired manifest must pass validation');
});

// TEST 3: MOD-999 claims frontend/src/App.tsx already owned by MOD-005 → repair removes duplicate ownership
runTest('MOD-999 claims frontend/src/App.tsx already owned by MOD-005 → repair removes duplicate ownership', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-005',
        name: 'Frontend Storefront',
        layer: 'FRONTEND',
        required_files: [{ path: 'frontend/src/App.tsx' }]
      },
      {
        id: 'MOD-999',
        name: 'Application Wiring',
        layer: 'GENERIC',
        required_files: [{ path: 'frontend/src/App.tsx' }, { path: 'scripts/run.sh' }]
      }
    ],
    project_requirements: { frontend: { pages: ['Home'] } }
  };

  const repaired = repairManifestOwnership(manifest);
  const mod005 = repaired.modules.find(m => m.id === 'MOD-005');
  const mod999 = repaired.modules.find(m => m.id === 'MOD-999');

  assert.ok(mod005, 'MOD-005 must exist');
  assert.ok(mod999, 'MOD-999 must exist');
  assert.strictEqual(mod005.required_files.length, 1);
  assert.strictEqual(mod005.required_files[0].path, 'frontend/src/App.tsx', 'MOD-005 retains App.tsx');
  assert.strictEqual(mod999.required_files.length, 1);
  assert.strictEqual(mod999.required_files[0].path, 'scripts/run.sh', 'MOD-999 only retains run.sh');

  const validation = validateManifestStructurally(repaired);
  assert.strictEqual(validation.isValid, true, 'Repaired manifest must pass validation');
});

// TEST 4: MOD-999 has zero required_files → correct behavior according to actual Application Wiring architecture
runTest('MOD-999 has zero required_files → handled explicitly without empty shell module', () => {
  // 4A: Raw structural validation rejects empty required_files
  const rawManifest = {
    modules: [
      { id: 'MOD-001', name: 'Backend', layer: 'BACKEND', required_files: [{ path: 'backend/main.py' }] },
      { id: 'MOD-999', name: 'Application Wiring', layer: 'GENERIC', required_files: [] }
    ],
    project_requirements: { backend: { apis: [] } }
  };
  const rawValidation = validateManifestStructurally(rawManifest);
  assert.strictEqual(rawValidation.isValid, false);
  assert.ok(rawValidation.defects.some(d => d.code === MANIFEST_ERROR_CODES.REQUIRED_FILES_EMPTY));

  // 4B: Deterministic ownership repair prunes the redundant empty MOD-999 when functional modules exist
  const repaired = repairManifestOwnership(rawManifest);
  assert.strictEqual(repaired.modules.length, 1);
  assert.strictEqual(repaired.modules[0].id, 'MOD-001');
  assert.strictEqual(repaired.modules.find(m => m.id === 'MOD-999'), undefined, 'Empty MOD-999 is pruned');
  
  const repairedValidation = validateManifestStructurally(repaired);
  assert.strictEqual(repairedValidation.isValid, true, 'Manifest without empty shell module is valid');
});

// TEST 5: Valid manifest with unique ownership → passes immediately
runTest('Valid manifest with unique ownership passes immediately', () => {
  const manifest = {
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
        id: 'MOD-005',
        name: 'Frontend',
        layer: 'FRONTEND',
        required_files: [{ path: 'frontend/src/App.tsx' }],
        dependencies: ['MOD-001']
      }
    ],
    project_requirements: {
      database: { entities: ['Product'], tables: ['products'] },
      backend: { apis: ['/api/products'] },
      frontend: { pages: ['Storefront'] }
    }
  };

  const res = validateManifestStructurally(manifest);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.errors.length, 0);
  assert.strictEqual(res.conflicts.length, 0);
});

// TEST 6: Two independent modules own different files → passes
runTest('Two independent modules own different files passes', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-002',
        name: 'Catalog API',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/app/routers/catalog.py' }]
      },
      {
        id: 'MOD-003',
        name: 'Orders API',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/app/routers/orders.py' }]
      }
    ],
    project_requirements: { backend: { apis: ['/api/catalog', '/api/orders'] } }
  };

  const res = validateManifestStructurally(manifest);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.conflicts.length, 0);
});

// TEST 7: Repair does not alter unrelated module ownership
runTest('Repair does not alter unrelated module ownership', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/app/db/models.py' }, { path: 'backend/app/db/database.py' }]
      },
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
        required_files: [{ path: 'backend/main.py' }]
      },
      {
        id: 'MOD-002',
        name: 'Catalog API',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/catalog.py' }]
      },
      {
        id: 'MOD-999',
        name: 'Application Wiring',
        layer: 'GENERIC',
        required_files: [{ path: 'backend/main.py' }, { path: 'scripts/deploy.sh' }]
      }
    ],
    project_requirements: {
      database: { entities: ['Item'], tables: ['items'] },
      backend: { apis: [] }
    }
  };

  const repaired = repairManifestOwnership(manifest);

  const mod000 = repaired.modules.find(m => m.id === 'MOD-000');
  const mod001 = repaired.modules.find(m => m.id === 'MOD-001');
  const mod002 = repaired.modules.find(m => m.id === 'MOD-002');
  const mod999 = repaired.modules.find(m => m.id === 'MOD-999');

  // Verify MOD-000 and MOD-002 were completely untouched
  assert.deepStrictEqual(
    mod000.required_files.map(f => f.path),
    ['backend/app/db/models.py', 'backend/app/db/database.py'],
    'MOD-000 files must remain unchanged'
  );
  assert.deepStrictEqual(
    mod002.required_files.map(f => f.path),
    ['backend/catalog.py'],
    'MOD-002 files must remain unchanged'
  );
  // MOD-001 keeps main.py
  assert.deepStrictEqual(mod001.required_files.map(f => f.path), ['backend/main.py']);
  // MOD-999 only has deploy.sh
  assert.deepStrictEqual(mod999.required_files.map(f => f.path), ['scripts/deploy.sh']);
});

// TEST 8: Database modules and DB001/DB_REL001 behavior remain unchanged
runTest('Database modules and DB001/DB_REL001 behavior remain unchanged', async () => {
  // DB001: scanForCredentials must still detect hardcoded passwords
  const fileWithCreds = {
    path: 'backend/app/db/database.py',
    content: 'DATABASE_URL = "postgresql://postgres:secret123@localhost/prod"'
  };
  const credDefects = scanForCredentials(fileWithCreds);
  assert.strictEqual(credDefects.length, 1);
  assert.strictEqual(credDefects[0].code, 'DB001');

  // SQLAlchemy availability check must still function
  const sa = await checkSqlalchemyAvailability();
  assert.strictEqual(typeof sa.available, 'boolean');
});

// TEST 9: Existing completion-gate tests remain passing
runTest('Existing completion-gate helpers remain intact', () => {
  const dbModule = { id: 'MOD-000', layer: 'DATABASE', status: 'PENDING' };
  assert.strictEqual(getModuleCompletionStatus(dbModule, false), 'VALIDATED');
  assert.strictEqual(getModuleCompletionStatus(dbModule, true), 'PASSED');

  const backendModule = { id: 'MOD-001', layer: 'BACKEND', status: 'PENDING' };
  assert.strictEqual(getModuleCompletionStatus(backendModule, false), 'PASSED');
});

// TEST 10: A second validation of an already-correct manifest produces the same manifest and does not oscillate
runTest('Idempotence: second validation & repair of valid manifest does not oscillate', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture & Schema',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/app/db/models.py' }],
        dependencies: []
      },
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
        required_files: [{ path: 'backend/main.py' }],
        dependencies: ['MOD-000']
      },
      {
        id: 'MOD-005',
        name: 'Frontend Storefront',
        layer: 'FRONTEND',
        required_files: [{ path: 'frontend/src/App.tsx' }],
        dependencies: ['MOD-001']
      }
    ],
    project_requirements: {
      database: { entities: ['Order'], tables: ['orders'] },
      backend: { apis: ['/api/orders'] },
      frontend: { pages: ['Orders'] }
    }
  };

  const validation1 = validateManifestStructurally(manifest);
  assert.strictEqual(validation1.isValid, true);

  const repair1 = repairManifestOwnership(manifest);
  const validation2 = validateManifestStructurally(repair1);
  assert.strictEqual(validation2.isValid, true);

  const repair2 = repairManifestOwnership(repair1);
  const validation3 = validateManifestStructurally(repair2);
  assert.strictEqual(validation3.isValid, true);

  assert.deepStrictEqual(repair1, repair2, 'Repair must be 100% idempotent');
  assert.deepStrictEqual(repair1, manifest, 'Repair must not mutate an already valid manifest');
});

console.log(`\n========================================`);
console.log(`Results: ${passed}/${total} manifest ownership tests passed.`);
console.log(`========================================`);

if (passed !== total) {
  process.exit(1);
}
