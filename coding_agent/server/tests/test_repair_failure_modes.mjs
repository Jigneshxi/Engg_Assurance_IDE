import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parsePatch,
  validatePatch,
  applyPatch,
  detectRepairProgress,
  buildRepairContext
} from '../repairEngine.js';
import { executeGeneration } from '../orchestrator.js';
import { validateManifestStructurally, MANIFEST_ERROR_CODES } from '../manifestValidator.js';
import { scanForCredentials } from '../dbValidator.js';

async function runFailureTests() {
  console.log('🧪 Starting Phase 15 Failure Modes & Boundary Test Suite...');
  let passed = 0;
  let total = 0;

  const test = (name, fn) => {
    total++;
    try {
      fn();
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ Test ${total} FAIL: ${name}`);
      console.error('   ', e.message);
    }
  };

  // 1. Same patch generated twice / no file changes
  test('Failure Mode: Detect NO_CHANGE when patch produces identical content', () => {
    const hash = 'hash_val_1';
    const progress = detectRepairProgress({
      hashBefore: hash,
      hashAfter: hash,
      attempt: 1
    });
    if (progress.status !== 'NO_CHANGE') {
      throw new Error(`Expected NO_CHANGE, got ${progress.status}`);
    }
  });

  // 2. Validator failure remains unchanged across attempts
  test('Failure Mode: Detect NO_IMPROVEMENT when identical defects persist', () => {
    const defect = {
      code: 'DB001',
      locations: [{ line: 12, column: 1 }]
    };
    const progress = detectRepairProgress({
      hashBefore: 'hash_1',
      hashAfter: 'hash_2',
      defectsBefore: [defect],
      defectsAfter: [defect],
      attempt: 2
    });
    if (progress.status !== 'NO_IMPROVEMENT') {
      throw new Error(`Expected NO_IMPROVEMENT, got ${progress.status}`);
    }
  });

  // 3. Malformed patch (missing closing tag or unparseable text)
  test('Failure Mode: Reject malformed patch with missing <replace> tag', () => {
    const malformed = `<patch file="test.py">
<search>
foo()
</search>
bar()
</patch>`;
    const parsed = parsePatch(malformed, 'test.py');
    if (parsed.valid) {
      throw new Error('Malformed patch should not be valid.');
    }
    if (!parsed.error.includes('<replace>')) {
      throw new Error(`Expected <replace> error, got: ${parsed.error}`);
    }
  });

  // 4. Patch cannot be applied (search block does not exist)
  test('Failure Mode: Patch cannot be applied when search block missing in file', () => {
    const original = 'def hello():\n    return "world"';
    const patch = {
      file: 'test.py',
      search: 'def non_existent():\n    pass',
      replace: 'def fixed():\n    pass'
    };
    const val = validatePatch({ patch, existingContent: original, filePath: 'test.py' });
    if (val.valid) {
      throw new Error('validatePatch should have rejected missing search target.');
    }
    const applied = applyPatch({ patch, existingContent: original });
    if (applied.applied) {
      throw new Error('applyPatch should not have applied non-existent search block.');
    }
  });

  // 5. Invalid manifest: Empty required_files
  test('Failure Mode: Invalid manifest with empty required_files (MOD-999 case)', () => {
    const manifest = {
      modules: [
        { id: 'MOD-999', name: 'Wiring', required_files: [] }
      ]
    };
    const res = validateManifestStructurally(manifest);
    if (res.isValid) {
      throw new Error('Manifest should be invalid when required_files is empty.');
    }
    if (!res.defects.some(d => d.code === MANIFEST_ERROR_CODES.REQUIRED_FILES_EMPTY)) {
      throw new Error('Missing MANIFEST_REQUIRED_FILES_EMPTY defect code.');
    }
  });

  // 6. Secret exposure in logs / prompts
  test('Failure Mode: Never expose plaintext secrets in repair context or logs', () => {
    const password = 'extremely_secret_password_12345';
    const rawCode = `DATABASE_URL = "postgresql://user:${password}@localhost:5432/db"`;

    const ctx = buildRepairContext({
      fileDef: { path: 'db.py', content: rawCode },
      activeModule: { id: 'MOD-000', name: 'DB' },
      manifest: {},
      defects: [{
        code: 'DB001',
        validator: 'database_credentials',
        severity: 'HIGH',
        message: 'Hardcoded database credentials detected',
        locations: [{ line: 1, column: 1 }],
        evidence: rawCode,
        remediation: 'Load from environment variables'
      }]
    });

    if (ctx.userPrompt.includes(password)) {
      throw new Error(`CRITICAL LEAK: Password found in repair userPrompt: ${ctx.userPrompt}`);
    }
    if (ctx.systemPrompt.includes(password)) {
      throw new Error(`CRITICAL LEAK: Password found in repair systemPrompt: ${ctx.systemPrompt}`);
    }
  });

  // 7. False-positive database credential prevention
  test('Failure Mode: Safe configs must NOT be classified as hardcoded credentials', () => {
    const safeSnippets = [
      'DATABASE_URL = os.getenv("DATABASE_URL")',
      'DATABASE_URL = process.env.DATABASE_URL',
      'const databaseUrl = config.databaseUrl',
      'const databaseUrl = env.DATABASE_URL',
      'DATABASE_URL = "sqlite:///./app.db"',
      'DATABASE_URL = "sqlite:///:memory:"',
      'DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")'
    ];

    for (const code of safeSnippets) {
      const defects = scanForCredentials({ path: 'db.py', content: code });
      if (defects.length > 0) {
        throw new Error(`FALSE POSITIVE: Safe snippet falsely flagged as credential: "${code}"`);
      }
    }
  });

  // 8. Integration: Module dependency blocking & independent module continuation
  await (async () => {
    total++;
    console.log(`\n--- Test ${total}: DAG Failure: Dependent modules blocked, independent module continues ---`);
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-dag-failure-'));

    const events = [];
    const sendEvent = (event, data) => events.push({ event, data });

    // Mock scenario:
    // MOD-000 (Database) FAILS repair permanently.
    // MOD-001 (Backend) depends on MOD-000 -> must be BLOCKED_BY_DEPENDENCY.
    // MOD-DOC (Documentation) has NO dependencies -> must CONTINUE and PASS!
    const mockLLM = async (system, user) => {
      if (system.includes('Principal Software Architect') && system.includes('JSON manifest')) {
        return JSON.stringify({
          project_id: 'test_dag_failure',
          project_requirements: {
            database: { entities: ['User'], tables: ['users'] },
            backend: { apis: [] }
          },
          modules: [
            {
              id: 'MOD-000',
              name: 'Database',
              layer: 'DATABASE',
              dependencies: [],
              required_files: [{ path: 'backend/db.py', purpose: 'DB' }]
            },
            {
              id: 'MOD-001',
              name: 'Backend',
              layer: 'BACKEND',
              dependencies: ['MOD-000'],
              required_files: [{ path: 'backend/server.py', purpose: 'Server' }]
            },
            {
              id: 'MOD-DOC',
              name: 'Documentation',
              layer: 'GENERIC',
              dependencies: [],
              required_files: [{ path: 'README.md', purpose: 'Docs' }]
            }
          ]
        });
      }

      if (system.includes('semantic completeness QA') || system.includes('pragmatic Software Architect')) {
        return JSON.stringify({ isValid: true, errors: [] });
      }

      // Initial DB generation introduces hardcoded password
      if (user.includes('TARGET FILE: backend/db.py')) {
        return `<file path="backend/db.py">
DATABASE_URL = "postgresql://root:brokenpass@localhost/db"
</file>`;
      }

      // Repair keeps producing the SAME defect (stagnation/failure)
      if (system.includes('targeted, zero-regression code repair') || user.includes('VALIDATION DEFECTS TO REMEDY')) {
        return `<patch file="backend/db.py">
<search>
DATABASE_URL = "postgresql://root:brokenpass@localhost/db"
</search>
<replace>
DATABASE_URL = "postgresql://root:brokenpass@localhost/db"
</replace>
</patch>`;
      }

      // Documentation succeeds
      if (user.includes('TARGET FILE: README.md')) {
        return `<file path="README.md">
# Project Documentation
This is independent documentation.
</file>`;
      }

      // Server should NEVER be attempted
      if (user.includes('TARGET FILE: backend/server.py')) {
        throw new Error('CRITICAL BUG: backend/server.py was generated despite blocked dependency!');
      }

      // Semantic Project QA
      if (system.includes('Principal QA Engineer')) {
        return JSON.stringify({
          isValid: false,
          score: 40,
          errors: ['Database layer failed'],
          warnings: [],
          missingFeatures: ['database'],
          implementedFeatures: ['docs'],
          missingFiles: ['backend/server.py'],
          unexpectedFiles: []
        });
      }

      return `<file path="dummy.txt">dummy</file>`;
    };

    try {
      await executeGeneration({
        prd: 'System with failing DB, blocked backend, and independent docs.',
        existingFiles: [],
        generationMode: 'new',
        workspacePath,
        mockLLM,
        autoApprove: true
      }, sendEvent);

      // Verify manifest state:
      const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const mod000 = manifest.modules.find(m => m.id === 'MOD-000');
      const mod001 = manifest.modules.find(m => m.id === 'MOD-001');
      const modDoc = manifest.modules.find(m => m.id === 'MOD-DOC');

      if (!mod000 || mod000.status !== 'FAILED') {
        throw new Error(`Expected MOD-000 to be FAILED, got ${mod000?.status}`);
      }
      console.log('✅ MOD-000 marked FAILED after repair stagnation.');

      if (!mod001 || mod001.status !== 'BLOCKED_BY_DEPENDENCY') {
        throw new Error(`Expected MOD-001 to be BLOCKED_BY_DEPENDENCY, got ${mod001?.status}`);
      }
      console.log('✅ Dependent MOD-001 cascaded to BLOCKED_BY_DEPENDENCY.');

      if (!modDoc || modDoc.status !== 'PASSED') {
        throw new Error(`Expected independent MOD-DOC to be PASSED, got ${modDoc?.status}`);
      }
      console.log('✅ Independent MOD-DOC continued safely and PASSED.');

      // Verify file accounting
      const mod001File = mod001.required_files[0];
      if (mod001File.status !== 'blocked_by_dependency') {
        throw new Error(`Expected file to have status blocked_by_dependency, got ${mod001File.status}`);
      }
      console.log('✅ File completeness accurately recorded file as blocked_by_dependency.');

      console.log(`✅ Test ${total} PASS: DAG Failure: Dependent modules blocked, independent module continues`);
      passed++;
    } catch (e) {
      console.error(`❌ Test ${total} FAIL: DAG Failure handling`);
      console.error('   ', e.message);
    } finally {
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
      }
    }
  })();

  console.log(`\nResults: ${passed}/${total} failure mode and boundary tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runFailureTests().catch(console.error);
