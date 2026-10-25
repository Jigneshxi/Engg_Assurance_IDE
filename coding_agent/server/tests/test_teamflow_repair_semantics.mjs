import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  DATABASE_DEFECT_CODES,
  checkSqlalchemyAvailability,
  resetSqlalchemyCache,
  validateSqlAlchemyMappers,
  validateDatabasePhase
} from '../dbValidator.js';
import {
  getRepairStrategy,
  repairFile
} from '../repairEngine.js';
import { executeGeneration } from '../orchestrator.js';

console.log('🧪 Running Test1B Validation and Repair Semantics Regression Suite...\n');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ Test ${totalTests} PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test ${totalTests} FAIL: ${name}`);
    console.error('   ', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 1: LLM Output Truncation & File-Boundary Classification
// ─────────────────────────────────────────────────────────────────────────────

await test('Missing closing </file> tag maps to FILE_BOUNDARY_MISSING, never DB001', async () => {
  assert.strictEqual(
    DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING,
    'FILE_BOUNDARY_MISSING',
    'FILE_BOUNDARY_MISSING defect code must exist'
  );
  assert.strictEqual(
    DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED,
    'OUTPUT_FORMAT_TRUNCATED',
    'OUTPUT_FORMAT_TRUNCATED defect code must exist'
  );

  const stratMissing = getRepairStrategy(DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING);
  const stratTruncated = getRepairStrategy(DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  const stratCreds = getRepairStrategy(DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED);

  assert.strictEqual(stratMissing.name, 'OutputFormatRepairStrategy');
  assert.strictEqual(stratTruncated.name, 'OutputFormatRepairStrategy');
  assert.strictEqual(stratCreds.name, 'DatabaseCredentialRepairStrategy');
  assert.notStrictEqual(stratMissing.name, stratCreds.name);
});

await test('Orchestrator error parsing maps missing tag strings to format defect, not DB001', async () => {
  const fileDef = {
    path: 'backend/app/models.py',
    status: 'repairing',
    errors: ['LLM output truncated or missing closing </file> tag.']
  };

  // Simulate orchestrator repairDefects derivation
  const repairDefects = (fileDef.defects && fileDef.defects.length > 0)
    ? fileDef.defects
    : (fileDef.errors || []).map(err => {
        if (typeof err === 'object' && err.code) return err;
        const errStr = typeof err === 'string' ? err : (err?.message || '');
        if (errStr.includes('</file>') || errStr.toLowerCase().includes('file boundary') || errStr.toLowerCase().includes('closing tag')) {
          return { code: DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING, message: errStr, file: fileDef.path, severity: 'HIGH' };
        }
        if (errStr.toLowerCase().includes('truncated') || errStr.includes('<file>')) {
          return { code: DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED, message: errStr, file: fileDef.path, severity: 'HIGH' };
        }
        if (errStr.toLowerCase().includes('credential') || errStr.toLowerCase().includes('password')) {
          return { code: DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED, message: errStr, file: fileDef.path, severity: 'HIGH' };
        }
        return { code: DATABASE_DEFECT_CODES.SYNTAX_ERROR, message: errStr, file: fileDef.path, severity: 'MEDIUM' };
      });

  assert.strictEqual(repairDefects.length, 1);
  assert.strictEqual(repairDefects[0].code, DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING);
  assert.notStrictEqual(repairDefects[0].code, 'DB001');

  const strategy = getRepairStrategy(repairDefects[0].code);
  assert.strictEqual(strategy.name, 'OutputFormatRepairStrategy');
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 2: Repair Status Correctness (repaired vs already_valid vs no_progress vs failed)
// ─────────────────────────────────────────────────────────────────────────────

await test('Repair status: File changed and valid produces status "repaired"', async () => {
  const original = 'const x = 1;\n';
  const fileDef = {
    path: 'index.js',
    status: 'repairing',
    repairAttempts: 0,
    content: original
  };
  const defect = { code: 'SYN001', message: 'Syntax error', file: fileDef.path };

  const patch = `<patch file="index.js">\n<search>\nconst x = 1;\n</search>\n<replace>\nconst x = 2;\n</replace>\n</patch>`;
  const events = [];

  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'Logic' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-test-repaired',
    validateFn: async () => ({ isValid: true, errors: [] })
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'repaired');
  assert.strictEqual(res.repaired, true);
  assert.strictEqual(res.alreadyValid, false);
  assert.strictEqual(fileDef.content, 'const x = 2;\n');

  const compEvent = events.find(e => e.ev === 'repair_completed');
  assert.ok(compEvent, 'repair_completed event emitted');
  assert.strictEqual(compEvent.data.status, 'repaired');
});

await test('Repair status: File unchanged but valid produces status "already_valid"', async () => {
  const original = 'const x = 1;\n';
  const fileDef = {
    path: 'index.js',
    status: 'repairing',
    repairAttempts: 0,
    content: original
  };
  const defect = { code: 'SYN001', message: 'Transient false alarm', file: fileDef.path };

  // Patch replaces with identical content (zero file-hash changes)
  const patch = `<patch file="index.js">\n<search>\nconst x = 1;\n</search>\n<replace>\nconst x = 1;\n</replace>\n</patch>`;
  const events = [];

  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'Logic' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-test-already-valid',
    validateFn: async () => ({ isValid: true, errors: [] })
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'already_valid', 'Zero-hash change must NOT be reported as repaired');
  assert.strictEqual(res.repaired, false);
  assert.strictEqual(res.alreadyValid, true);
  assert.strictEqual(fileDef.content, original);

  const compEvent = events.find(e => e.ev === 'repair_completed');
  assert.ok(compEvent, 'repair_completed event emitted');
  assert.strictEqual(compEvent.data.status, 'already_valid');

  const logEvents = events.filter(e => e.ev === 'log');
  assert.ok(logEvents.some(l => l.data.includes('already_valid') || l.data.includes('unchanged and verified valid')));
});

await test('Repair status: File unchanged and still invalid produces status "no_progress"', async () => {
  const original = 'const broken = ;;\n';
  const fileDef = {
    path: 'broken.js',
    status: 'repairing',
    repairAttempts: 0,
    content: original
  };
  const defect = { code: 'SYN001', message: 'Syntax error', file: fileDef.path };

  // Patch produces no change
  const patch = `<patch file="broken.js">\n<search>\nconst broken = ;;\n</search>\n<replace>\nconst broken = ;;\n</replace>\n</patch>`;
  const events = [];

  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'Logic' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-test-no-progress',
    validateFn: async () => ({ isValid: false, errors: ['Still broken'] })
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'no_progress');
  assert.ok(events.some(e => e.ev === 'repair_no_progress'));
});

await test('Repair status: Max attempts exhausted produces status "failed"', async () => {
  const original = 'const broken = ;;\n';
  const fileDef = {
    path: 'broken.js',
    status: 'repairing',
    repairAttempts: 2, // Next attempt will be 3 (MAX_FILE_REPAIR_ATTEMPTS)
    content: original
  };
  const defect = { code: 'SYN001', message: 'Syntax error', file: fileDef.path };

  const patch = `<patch file="broken.js">\n<search>\nconst broken = ;;\n</search>\n<replace>\nconst stillBroken = ;;\n</replace>\n</patch>`;
  const events = [];

  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'Logic' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-test-failed',
    validateFn: async () => ({ isValid: false, errors: ['Still broken'] })
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(fileDef.status, 'failed');
  assert.ok(events.some(e => e.ev === 'repair_blocked'));
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 3: SQLAlchemy Runtime Detection & Fallback Reason Correctness
// ─────────────────────────────────────────────────────────────────────────────

await test('SQLAlchemy availability detection returns defined reason and never undefined', async () => {
  resetSqlalchemyCache();

  // First call
  const det1 = await checkSqlalchemyAvailability();
  assert.notStrictEqual(det1.available, undefined);
  if (!det1.available) {
    assert.notStrictEqual(det1.reason, undefined, 'First check reason must not be undefined');
    assert.strictEqual(typeof det1.reason, 'string');
    assert.ok(det1.reason.length > 0);
  }

  // Second call (hits cached branch)
  const det2 = await checkSqlalchemyAvailability();
  assert.strictEqual(det2.available, det1.available);
  if (!det2.available) {
    assert.notStrictEqual(det2.reason, undefined, 'Cached check reason must not be undefined');
    assert.strictEqual(typeof det2.reason, 'string');
    assert.strictEqual(det2.reason, det1.reason);
  }
});

await test('validateSqlAlchemyMappers falls back gracefully without logging "(undefined)"', async () => {
  resetSqlalchemyCache();
  const logs = [];
  const sendEvent = (ev, data) => {
    if (ev === 'log') logs.push(data);
  };

  const files = [
    {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer\nclass User:\n    id = Column(Integer, primary_key=True)\n`
    }
  ];

  const valRes = await validateSqlAlchemyMappers(files, { sendEvent });
  assert.ok(valRes.isValid);

  for (const log of logs) {
    assert.strictEqual(
      log.includes('(undefined)'),
      false,
      `Log message must never contain "(undefined)": ${log}`
    );
  }
});

await test('Deterministic AST/regex fallback remains functional when SQLAlchemy is skipped', async () => {
  const baseFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`,
    status: 'validated'
  };

  const brokenModelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom .database import Base\n\nclass Item(Base):\n    __tablename__ = 'items'\n    id = Column(Integer, primary_key=True)\n    order = relationship('Order', back_populates='items')\n\nclass Order(Base):\n    __tablename__ = 'orders'\n    id = Column(Integer, primary_key=True)\n    # Missing reciprocal relationship\n`,
    status: 'validated'
  };

  const manifest = {
    project_requirements: {
      database: {
        entities: ['Item', 'Order'],
        tables: ['items', 'orders']
      }
    },
    modules: [
      {
        id: 'MOD-000',
        layer: 'DATABASE',
        required_files: [baseFile, brokenModelsFile]
      }
    ]
  };

  const phaseResult = await validateDatabasePhase(
    manifest.modules,
    manifest,
    '',
    async () => '',
    () => {},
    { authoritativeOrm: true, skipSqlalchemy: true }
  );

  assert.strictEqual(phaseResult.isValid, false, 'Fallback must detect missing reciprocal relationship');
  const defect = phaseResult.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
  assert.ok(defect, 'Must report DB_REL001');
  assert.strictEqual(defect.file, 'backend/app/db/models.py');
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE REGRESSION: Reproduce Exact Old Live Failure (Missing </file> in Orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

await test('Live orchestrator generation path: missing </file> tags trigger FILE_BOUNDARY_MISSING and OutputFormatRepairStrategy, never DB001', async () => {
  const tempDir = path.join(process.cwd(), 'temp_truncation_live_test');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const testPrd = `Project: mini_truncation_test\nStack: Python, FastAPI, SQLAlchemy, SQLite\nFeature: Health Check endpoint`;

  const mockLLM = async (system, user) => {
    if (system.includes('Requirement Contract')) {
      return JSON.stringify({
        requirements: [{ id: 'REQ-001', description: 'Health check endpoint', type: 'backend' }]
      });
    }
    if (system.includes('Architecture Contract')) {
      return JSON.stringify({
        technology_stack: { language: 'python', backend_framework: 'fastapi', orm: 'sqlalchemy', database: 'sqlite' },
        layer_plan: ['BACKEND'],
        module_plan: [{ id: 'MOD-001', name: 'Backend', layer: 'BACKEND', dependencies: [], required_files: ['backend/main.py'] }]
      });
    }
    if (system.includes('Principal Software Architect') || user.includes('Output Manifest JSON')) {
      return JSON.stringify({
        project_id: 'truncation_live_test',
        project_requirements: {
          backend: { apis: ['/health'] }
        },
        architecture_contract: { technology_stack: { language: 'python', backend_framework: 'fastapi', orm: 'sqlalchemy', database: 'sqlite' } },
        modules: [
          {
            id: 'MOD-001',
            name: 'Backend',
            layer: 'BACKEND',
            dependencies: [],
            required_files: [
              { path: 'backend/main.py', purpose: 'FastAPI app', contract: 'export app', repairAttempts: 0, errors: [] }
            ]
          }
        ]
      });
    }
    if (system.includes('targeted, zero-regression code repair')) {
      return `<patch file="backend/main.py">
<search>
from fastapi import FastAPI
app = FastAPI()
</search>
<replace>
from fastapi import FastAPI
app = FastAPI()
@app.get("/health")
def health():
    return {"status": "ok"}
</replace>
</patch>`;
    }
    if (user.includes('backend/main.py')) {
      // Simulate truncated output without closing </file> tag
      return `from fastapi import FastAPI\napp = FastAPI()`;
    }
    if (system.includes('dependency contract')) return 'Exports app';
    if (system.includes('Principal QA Engineer')) {
      return JSON.stringify({ isValid: true, score: 100, errors: [], warnings: [], missingFeatures: [], implementedFeatures: ['health'], missingFiles: [], unexpectedFiles: [] });
    }
    return '';
  };

  try {
    await executeGeneration({
      prd: testPrd,
      existingFiles: [],
      generationMode: 'new',
      autoApprove: true,
      workspacePath: tempDir,
      mockLLM
    }, sendEvent);
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Verify defect classification events
  const defectEvents = events.filter(e => e.ev === 'repair_defect_classified');
  assert.ok(defectEvents.length > 0, 'repair_defect_classified event must be emitted');

  for (const d of defectEvents) {
    assert.notStrictEqual(d.data.code, 'DB001', 'Defect code must NEVER be DB001 for missing </file> tag');
    assert.strictEqual(d.data.code, DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING, 'Defect code must be FILE_BOUNDARY_MISSING');
  }

  // Verify strategy selection events
  const strategyEvents = events.filter(e => e.ev === 'repair_strategy_selected');
  assert.ok(strategyEvents.length > 0, 'repair_strategy_selected event must be emitted');

  for (const s of strategyEvents) {
    assert.notStrictEqual(s.data.strategy, 'DatabaseCredentialRepairStrategy', 'Strategy must NEVER be DatabaseCredentialRepairStrategy for missing </file>');
    assert.strictEqual(s.data.strategy, 'OutputFormatRepairStrategy', 'Strategy must be OutputFormatRepairStrategy');
  }

  // Ensure no logs attribute DB001 to backend/main.py
  const logEvents = events.filter(e => e.ev === 'log');
  const db001Logs = logEvents.filter(l => typeof l.data === 'string' && l.data.includes('DB001') && l.data.includes('backend/main.py'));
  assert.strictEqual(db001Logs.length, 0, 'No DB001 log messages allowed for file boundary defects');
});

await test('Runtime module integrity: orchestrator, dbValidator, and repairEngine export identical contracts', async () => {
  const [orch, rep, db] = await Promise.all([
    import('../orchestrator.js'),
    import('../repairEngine.js'),
    import('../dbValidator.js')
  ]);

  assert.strictEqual(orch.DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING, 'FILE_BOUNDARY_MISSING');
  assert.strictEqual(db.DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING, 'FILE_BOUNDARY_MISSING');
  assert.strictEqual(orch.DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED, 'OUTPUT_FORMAT_TRUNCATED');
  assert.strictEqual(db.DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED, 'OUTPUT_FORMAT_TRUNCATED');

  const strat1 = rep.getRepairStrategy(orch.DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING);
  const strat2 = rep.getRepairStrategy(orch.DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  assert.strictEqual(strat1.name, 'OutputFormatRepairStrategy');
  assert.strictEqual(strat2.name, 'OutputFormatRepairStrategy');
});

await test('repair_patch_applied is NOT emitted when file hash is unchanged after patch', async () => {
  const content = 'const x = 1;\n';
  const fileDef = {
    path: 'index.js',
    status: 'repairing',
    repairAttempts: 0,
    content
  };
  const defect = { code: 'SYN001', message: 'Transient alarm', file: fileDef.path };
  // Patch replaces with exactly the same bytes — hash must not change
  const patch = `<patch file="index.js">\n<search>\nconst x = 1;\n</search>\n<replace>\nconst x = 1;\n</replace>\n</patch>`;
  const events = [];
  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'Logic' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-no-patch-applied',
    validateFn: async () => ({ isValid: true, errors: [] })
  });
  assert.strictEqual(res.status, 'already_valid');
  const patchApplied = events.filter(e => e.ev === 'repair_patch_applied');
  assert.strictEqual(patchApplied.length, 0, 'repair_patch_applied must NOT be emitted when content hash is unchanged');
});

await test('already_valid returned when patch search block not located but file is independently valid', async () => {
  const content = 'def hello():\n    return "world"\n';
  const fileDef = {
    path: 'backend/app/api/test.py',
    status: 'repairing',
    repairAttempts: 0,
    content
  };
  const defect = { code: 'FILE_BOUNDARY_MISSING', message: 'LLM output truncated.', file: fileDef.path };
  // Patch search block cannot be located in file — orphan search
  const patch = `<patch file="backend/app/api/test.py">\n<search>\nNONEXISTENT BLOCK\n</search>\n<replace>\nDOES NOT MATTER\n</replace>\n</patch>`;
  const events = [];
  const res = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-001', name: 'API' },
    manifest: {},
    defects: [defect],
    caller: async () => patch,
    sendEvent: (ev, data) => events.push({ ev, data }),
    generationId: 'gen-already-valid-on-rejection',
    validateFn: async () => ({ isValid: true, errors: [] })
  });
  assert.strictEqual(res.success, true, 'Should succeed when file is independently valid');
  assert.strictEqual(res.status, 'already_valid', 'Status must be already_valid when patch cannot be applied but file is valid');
  assert.strictEqual(res.alreadyValid, true);
  assert.strictEqual(fileDef.content, content, 'File content must be unchanged');
  const patchApplied = events.filter(e => e.ev === 'repair_patch_applied');
  assert.strictEqual(patchApplied.length, 0, 'repair_patch_applied must NOT be emitted when patch was rejected');
});

console.log(`\n========================================`);
console.log(`Results: ${passedTests}/${totalTests} TeamFlow repair semantics tests passed.`);
console.log(`========================================\n`);
