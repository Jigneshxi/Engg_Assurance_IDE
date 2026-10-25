/**
 * Phase 7: Generic Generation Recovery Test Suite
 *
 * Verifies all 16 aspects of generation boundaries, truncation recovery,
 * anti-regression protection, and completeness accounting:
 * 1. Missing </file> recovery / rejection
 * 2. Markdown fence leakage detection & removal
 * 3. Mid-line truncation detection & continuation
 * 4. Unbalanced braces detection
 * 5. Unbalanced parentheses detection
 * 6. Clean continuation stitching
 * 7. Duplicate overlap removal during merge
 * 8. Continuation success
 * 9. Continuation failure -> mark failed
 * 10. Zero-progress repair rejection
 * 11. Regression repair rejection & rollback
 * 12. Oscillation detection
 * 13. Max repair attempts termination
 * 14. Failed-file accounting isolation (failed files never marked validated)
 * 15. Scaffolding cannot mask failed files
 * 16. Generated / Validated / Failed count reconciliation
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import {
  parseFiles,
  stripMarkdownWrappers,
  mergeFileContinuation,
  validateSourceCompleteness,
  reconcileFileCompleteness,
  writeWorkspaceAndScaffolds,
  DATABASE_DEFECT_CODES
} from '../orchestrator.js';

import {
  classifyRepairAttempt,
  repairFile
} from '../repairEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log('🧪 Starting Phase 7: Generic Generation Recovery & Boundary Test Suite (16 tests)...\n');

// ── Test 1: Missing </file> recovery / rejection ──────────────────────────────
await runTest('Test 1: Missing </file> tag detection and boundary handling', async () => {
  const unclosedOutput = `<file path="backend/app/schemas/item.py">
from pydantic import BaseModel

class ItemBase(BaseModel):
    name: str
    price: float
`;
  // Unclosed output should not have </file>
  assert.strictEqual(unclosedOutput.includes('</file>'), false);

  // validateSourceCompleteness on incomplete source
  validateSourceCompleteness(unclosedOutput.replace(/<file[^>]*>/, ''), 'backend/app/schemas/item.py');
  // It is valid python syntax if class definition is complete, but outer output lacks tag
  const parsed = parseFiles(unclosedOutput);
  // parseFiles shouldn't falsely parse an unclosed block as complete
  assert.strictEqual(parsed.hasErrors, true);
  assert.strictEqual(parsed.files.length, 0);

  // Now test with properly closed file
  const closedOutput = unclosedOutput + '</file>';
  const parsedClosed = parseFiles(closedOutput);
  assert.strictEqual(parsedClosed.files.length, 1);
  assert.strictEqual(parsedClosed.files[0].path, 'backend/app/schemas/item.py');
});

// ── Test 2: Markdown fence leakage detection & removal ─────────────────────────
await runTest('Test 2: Markdown fence leakage detection and removal', async () => {
  const codeWithFences = `\`\`\`python
from pydantic import BaseModel

class Product(BaseModel):
    id: int
    title: str
\`\`\``;

  // stripMarkdownWrappers must clean fences completely
  const cleaned = stripMarkdownWrappers(codeWithFences);
  assert.strictEqual(cleaned.includes('```'), false);
  assert.strictEqual(cleaned.includes('from pydantic import BaseModel'), true);

  // validateSourceCompleteness must flag raw markdown fences
  const validationWithLeak = validateSourceCompleteness(codeWithFences, 'backend/app/models/product.py');
  assert.strictEqual(validationWithLeak.isComplete, false);
  assert.strictEqual(validationWithLeak.defect, DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  assert(validationWithLeak.reason.includes('markdown'));

  // Cleaned version must pass completeness
  const validationClean = validateSourceCompleteness(cleaned, 'backend/app/models/product.py');
  assert.strictEqual(validationClean.isComplete, true);
});

// ── Test 3: Mid-line truncation detection & continuation ──────────────────────
await runTest('Test 3: Mid-line truncation detection and continuation', async () => {
  const truncatedPython = `from pydantic import BaseModel

class OrderSchema(BaseModel):
    order_id: int
    customer_na`;

  const comp = validateSourceCompleteness(truncatedPython, 'backend/app/schemas/order.py');
  assert.strictEqual(comp.isComplete, false);

  // Stitch continuation
  const baseTag = `<file path="backend/app/schemas/order.py">\n${truncatedPython}`;
  const continuation = `me: str
    total_amount: float
</file>`;

  const merged = mergeFileContinuation(baseTag, continuation, 'backend/app/schemas/order.py');
  assert.strictEqual(merged.progress, true);
  assert.strictEqual(merged.completed, true);
  assert(merged.merged.includes('customer_name: str'));
  assert(merged.merged.includes('total_amount: float'));
  assert(merged.merged.includes('</file>'));
});

// ── Test 4: Unbalanced braces detection ───────────────────────────────────────
await runTest('Test 4: Unbalanced braces detection', async () => {
  const brokenTsx = `import React from 'react';

export const UserCard = ({ name }: { name: string }) => {
  return (
    <div className="card">
      <h3>{name}</h3>
    </div>
  );
`; // Missing closing brace for UserCard

  const comp = validateSourceCompleteness(brokenTsx, 'frontend/src/UserCard.tsx');
  assert.strictEqual(comp.isComplete, false);
  assert.strictEqual(comp.defect, DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  assert(comp.reason.includes('braces') || comp.reason.includes('brace') || comp.reason.includes('TypeScript'));
});

// ── Test 5: Unbalanced parentheses detection ──────────────────────────────────
await runTest('Test 5: Unbalanced parentheses detection', async () => {
  const brokenPy = `from typing import List

def calculate_metrics(values: List[float]) -> float:
    return sum(x * 1.5 for x in values
`; // Missing closing paren

  const comp = validateSourceCompleteness(brokenPy, 'backend/app/services/calc.py');
  assert.strictEqual(comp.isComplete, false);
  assert.strictEqual(comp.defect, DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  assert(comp.reason.includes('parentheses') || comp.reason.includes('paren') || comp.reason.includes('unclosed'));
});

// ── Test 6: Continuation merge ─────────────────────────────────────────────────
await runTest('Test 6: Clean continuation stitching', async () => {
  const baseTag = `<file path="backend/app/api.py">
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
`;

  const continuationChunk = `@app.get("/items")
def get_items():
    return [{"id": 1, "name": "Test"}]
</file>`;

  const stitch = mergeFileContinuation(baseTag, continuationChunk, 'backend/app/api.py');
  assert.strictEqual(stitch.progress, true);
  assert.strictEqual(stitch.completed, true);
  assert(stitch.merged.includes('/health'));
  assert(stitch.merged.includes('/items'));
  assert(stitch.merged.endsWith('</file>'));
});

// ── Test 7: Duplicate overlap removal during merge ────────────────────────────
await runTest('Test 7: Duplicate overlap removal during merge', async () => {
  const baseTag = `<file path="backend/app/crud.py">
from sqlalchemy.orm import Session
from . import models

def get_item(db: Session, item_id: int):
    return db.query(models.Item).filter(models.Item.id == item_id).first()
`;

  const continuationWithOverlap = `def get_item(db: Session, item_id: int):
    return db.query(models.Item).filter(models.Item.id == item_id).first()

def list_items(db: Session):
    return db.query(models.Item).all()
</file>`;

  const result = mergeFileContinuation(baseTag, continuationWithOverlap, 'backend/app/crud.py');
  assert.strictEqual(result.progress, true);
  assert.strictEqual(result.completed, true);

  // Check that get_item is NOT duplicated
  const occurrences = (result.merged.match(/def get_item/g) || []).length;
  assert.strictEqual(occurrences, 1, `Expected exactly 1 occurrence of 'def get_item', found ${occurrences}`);
  assert(result.merged.includes('def list_items'));
});

// ── Test 8: Continuation success ──────────────────────────────────────────────
await runTest('Test 8: Continuation success restores source completeness', async () => {
  const baseTag = `<file path="backend/app/models.py">
from sqlalchemy import Column, Integer, String
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
`;

  const continuation = `    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
</file>`;

  const stitch = mergeFileContinuation(baseTag, continuation, 'backend/app/models.py');
  assert.strictEqual(stitch.progress, true);
  assert.strictEqual(stitch.completed, true);

  const cleanContent = stitch.merged.replace(/^[\s\S]*?<file[^>]*>\r?\n?/, '').replace(/\r?\n?<\/file>[\s\S]*$/, '');
  const comp = validateSourceCompleteness(cleanContent, 'backend/app/models.py');
  assert.strictEqual(comp.isComplete, true);
});

// ── Test 9: Continuation failure -> mark failed ────────────────────────────────
await runTest('Test 9: Continuation failure marks file failed', async () => {
  const initialContent = `from fastapi import FastAPI
app = FastAPI(
`;
  const fileDef = {
    path: 'backend/app/broken.py',
    content: initialContent,
    status: 'repairing',
    errors: ['Unclosed parentheses']
  };

  // Mock caller that returns garbage or unparseable continuation
  const mockCaller = async () => 'Not valid python and no tags here';

  const repairRes = await repairFile({
    fileDef,
    activeModule: { id: 'test_module' },
    manifest: { modules: [] },
    defects: [{ code: DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING, message: 'Unclosed file' }],
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'gen_test_9',
    validateFn: async () => ({ isValid: false, errors: ['Still invalid'] })
  });

  assert.strictEqual(repairRes.success, false);
  assert.strictEqual(repairRes.status, 'failed');
  assert.strictEqual(fileDef.status, 'failed');
});

// ── Test 10: Zero-progress repair rejection ────────────────────────────────────
await runTest('Test 10: Zero-progress repair rejection', async () => {
  const hash1 = 'abc123hash';
  const defects = [{ code: 'SYNTAX_ERROR', message: 'Syntax error' }];

  const progress = classifyRepairAttempt({
    beforeHash: hash1,
    afterHash: hash1,
    beforeDefectSet: defects,
    afterDefectSet: defects,
    attempt: 1,
    maxAttempts: 3
  });

  assert.strictEqual(progress.classification, 'NO_PROGRESS');
  assert.strictEqual(progress.status, 'NO_CHANGE');
});

// ── Test 11: Regression repair rejection & rollback ───────────────────────────
await runTest('Test 11: Regression repair rejection & rollback', async () => {
  const hash1 = 'initial_content_hash';
  const hash2 = 'worse_content_hash';
  const originalDefects = [{ code: 'SYN001', message: '1 defect' }];
  const regressedDefects = [
    { code: 'SYN001', message: '1 defect' },
    { code: 'SYN002', message: '2nd defect' },
    { code: 'SEC001', message: '3rd defect' }
  ];

  const progress = classifyRepairAttempt({
    beforeHash: hash1,
    afterHash: hash2,
    beforeDefectSet: originalDefects,
    afterDefectSet: regressedDefects,
    attempt: 1,
    maxAttempts: 3
  });

  assert.strictEqual(progress.classification, 'REGRESSED');
  assert.strictEqual(progress.status, 'REGRESSED');

  // Verify that repairFile rolls back content on regression
  const originalContent = 'def foo():\n    return 1\n';
  const fileDef = {
    path: 'backend/app/service.py',
    content: originalContent,
    status: 'repairing'
  };

  // Mock caller returning patch that causes regression
  const mockCaller = async () => `<patch file="backend/app/service.py">
<search>
    return 1
</search>
<replace>
    eval("bad")
    bad syntax
</replace>
</patch>`;

  const repairRes = await repairFile({
    fileDef,
    activeModule: { id: 'test_module' },
    manifest: { modules: [] },
    defects: originalDefects,
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'gen_test_11',
    validateFn: async (f) => {
      if (f.content.includes('eval')) {
        return { isValid: false, defects: regressedDefects, errors: ['3 defects'] };
      }
      return { isValid: false, defects: originalDefects, errors: ['1 defect'] };
    }
  });

  assert.strictEqual(repairRes.success, false);
  assert.strictEqual(fileDef.status, 'failed');
  // Content MUST be rolled back to originalContent
  assert.strictEqual(fileDef.content, originalContent, 'Expected fileDef.content to revert to originalContent upon regression');
});

// ── Test 12: Oscillation detection ─────────────────────────────────────────────
await runTest('Test 12: Oscillation detection terminates cycle', async () => {
  const hashA = 'hash_state_a';
  const hashB = 'hash_state_b';
  const history = [
    { attempt: 1, hashBefore: hashA, hashAfter: hashB, defectsBefore: [1], defectsAfter: [1], status: 'PROGRESSING' },
    { attempt: 2, hashBefore: hashB, hashAfter: hashA, defectsBefore: [1], defectsAfter: [1], status: 'PROGRESSING' }
  ];

  const progress = classifyRepairAttempt({
    beforeHash: hashA,
    afterHash: hashB,
    beforeDefectSet: [{ code: 'DEFECT' }],
    afterDefectSet: [{ code: 'DEFECT' }],
    attempt: 3,
    maxAttempts: 3,
    history
  });

  assert.strictEqual(progress.classification, 'OSCILLATION');
  assert.strictEqual(progress.status, 'OSCILLATION');
});

// ── Test 13: Max repair attempts termination ──────────────────────────────────
await runTest('Test 13: Max repair attempts termination', async () => {
  const fileDef = {
    path: 'backend/app/stubborn.py',
    content: 'broken code',
    repairAttempts: 3, // Already at max
    status: 'repairing'
  };

  const repairRes = await repairFile({
    fileDef,
    activeModule: { id: 'test_mod' },
    manifest: { modules: [] },
    defects: [{ code: 'SYNTAX', message: 'Persistent syntax defect' }],
    caller: async () => '',
    sendEvent: () => {},
    generationId: 'gen_13',
    validateFn: async () => ({ isValid: false, errors: ['Persistent error'] })
  });

  assert.strictEqual(repairRes.success, false);
  assert.strictEqual(repairRes.status, 'failed');
  assert.strictEqual(fileDef.status, 'failed');
});

// ── Test 14: Failed-file accounting isolation ─────────────────────────────────
await runTest('Test 14: Failed-file accounting isolation', async () => {
  const allFiles = [
    { path: 'file1.py', content: 'pass', status: 'validated' },
    { path: 'file2.py', content: 'broken', status: 'failed', errors: ['syntax'] },
    { path: 'file3.py', content: 'blocked', status: 'blocked_by_dependency' },
    { path: 'file4.py', content: '', status: 'not_started' }
  ];

  const reconciliation = reconcileFileCompleteness(allFiles);

  assert.strictEqual(reconciliation.counts.validated, 1);
  assert.strictEqual(reconciliation.counts.failed, 1);
  assert.strictEqual(reconciliation.counts.blocked, 1);
  assert.strictEqual(reconciliation.counts.notStarted, 1);
  assert.strictEqual(reconciliation.counts.generated, 3);
  assert.strictEqual(reconciliation.counts.required, 4);

  // Failed files must NEVER appear in validated list
  assert(!reconciliation.categories.validated.includes('file2.py'));
  assert(reconciliation.categories.failed.includes('file2.py'));
  assert.strictEqual(reconciliation.invariantSatisfied, true);
});

// ── Test 15: Scaffolding cannot mask failed files ─────────────────────────────
await runTest('Test 15: Scaffolding cannot overwrite or validate planned failed files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold_test_'));

  try {
    const plannedFailedFile = {
      path: 'backend/app/schemas/payment.py',
      content: 'broken code',
      status: 'failed',
      errors: ['syntax error']
    };

    const allFiles = [
      plannedFailedFile,
      { path: 'backend/main.py', content: 'app = 1', status: 'validated' }
    ];

    const manifest = {
      modules: [{ id: 'backend', name: 'Backend', files: allFiles }]
    };

    // Run writeWorkspaceAndScaffolds
    writeWorkspaceAndScaffolds(tempDir, allFiles, manifest, () => {});

    // Crucial Invariant: plannedFailedFile status MUST remain 'failed' and NOT become 'validated'
    assert.strictEqual(plannedFailedFile.status, 'failed', 'Scaffolding must NEVER set failed file status to validated!');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── Test 16: Generated / Validated / Failed count reconciliation ──────────────
await runTest('Test 16: Complete generated / validated / failed count reconciliation', async () => {
  const allFiles = [
    { path: 'a.py', status: 'validated', content: 'a' },
    { path: 'b.py', status: 'repaired', content: 'b' },
    { path: 'c.py', status: 'failed', content: 'c' },
    { path: 'd.py', status: 'blocked_by_dependency', content: 'd' },
    { path: 'e.py', status: 'repairing', content: 'e' },
    { path: 'f.py', status: 'pending', content: '' } // not started
  ];

  const rec = reconcileFileCompleteness(allFiles);

  // Invariants:
  // generated = validated (2: validated+repaired) + failed (1) + repairing (1) + blocked (1) = 5
  // required = generated (5) + notStarted (1) = 6
  assert.strictEqual(rec.counts.required, 6);
  assert.strictEqual(rec.counts.generated, 5);
  assert.strictEqual(rec.counts.validated, 2);
  assert.strictEqual(rec.counts.failed, 1);
  assert.strictEqual(rec.counts.repairing, 1);
  assert.strictEqual(rec.counts.blocked, 1);
  assert.strictEqual(rec.counts.notStarted, 1);
  assert.strictEqual(rec.invariantSatisfied, true);
  assert.strictEqual(rec.overlapViolations.length, 0);
});

// ── Test Summary ─────────────────────────────────────────────────────────────
console.log('\n====================================================');
console.log(`Phase 7 Test Suite Complete: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
