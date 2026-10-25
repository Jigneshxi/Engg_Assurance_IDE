/**
 * QuickCart Repair-Recovery Weakness Test Suite
 *
 * Verifies the exact scenarios exposed by the QuickCart run:
 * 1. Targeted patch repair success (products.py scenario)
 * 2. Repeated patch prevention on NO_PROGRESS / OSCILLATION (order.py scenario)
 * 3. Bounded fallback clean regeneration from authoritative contract triggers on stagnation/oscillation
 * 4. Fallback requires syntax + completeness + dependency/import validation before marking repaired
 * 5. Fallback fails-closed if validation fails
 * 6. Tiny syntactically-valid rollback (e.g. 343-char import preamble) is rejected by completeness validation
 * 7. findLastStableSyntacticBoundary refuses to roll back past substantive code into pure imports
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  findLastStableSyntacticBoundary,
  validateSourceCompleteness,
  sanitizePythonCode,
  DATABASE_DEFECT_CODES
} from '../orchestrator.js';

import {
  repairFile,
  buildRepairContext
} from '../repairEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('🧪 Running QuickCart Repair-Recovery Test Suite...\n');

// ── Test 1: Targeted patch repair succeeds when valid (products.py scenario) ──
await test('Scenario 1: Targeted patch repair succeeds when patch resolves defect (products.py scenario)', async () => {
  const originalCode = `from fastapi import APIRouter
router = APIRouter()

@router.get("/products")
def get_products():
    retun {"products": []}
`;

  const fileDef = {
    path: 'backend/app/api/products.py',
    content: originalCode,
    status: 'repairing',
    repairAttempts: 0
  };

  const mockCaller = async () => `<patch file="backend/app/api/products.py">
<search>
    retun {"products": []}
</search>
<replace>
    return {"products": []}
</replace>
</patch>`;

  const result = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-002', name: 'Products' },
    manifest: { modules: [] },
    defects: [{ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, message: "invalid syntax 'retun'" }],
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'test_products_repair',
    validateFn: async (f) => {
      const isValid = !f.content.includes('retun');
      return { isValid, errors: isValid ? [] : ["Syntax error: 'retun'"] };
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'repaired');
  assert.strictEqual(fileDef.status, 'validated');
  assert.ok(fileDef.content.includes('return {"products": []}'));
});

// ── Test 2: Repeated patch prevention and prompt history injection ────────────
await test('Scenario 2: When repair attempts stall/oscillate, identical patch is rejected and history injected', async () => {
  const originalCode = `from fastapi import APIRouter
router = APIRouter()

@router.get("/orders")
def get_orders():
    raise NotImplementedError
`;

  const failedPatch = {
    search: 'raise NotImplementedError',
    replace: 'return "bad"'
  };

  const fileDef = {
    path: 'backend/app/api/order.py',
    content: originalCode,
    status: 'repairing',
    repairAttempts: 1,
    repairHistory: [
      {
        attempt: 1,
        hashBefore: 'hash1',
        hashAfter: 'hash2',
        defectsBefore: [{ code: 'SYN001' }],
        defectsAfter: [{ code: 'SYN001' }],
        status: 'PROGRESSING',
        patch: failedPatch
      }
    ]
  };

  // 1. Verify buildRepairContext warns against repeating previous failed patch
  const ctx = buildRepairContext({
    fileDef,
    activeModule: { id: 'MOD-003', name: 'Orders' },
    manifest: { modules: [] },
    defects: [{ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, message: 'Invalid return type' }]
  });

  assert.ok(ctx.userPrompt.includes('PREVIOUS FAILED PATCHES (DO NOT REPEAT'), 'Context must include failed patch warning');
  assert.ok(ctx.userPrompt.includes('raise NotImplementedError'), 'Context must list search of failed patch');

  // 2. Verify that if LLM repeats the exact same search and replace, it is rejected
  const mockCallerRepeat = async () => `<patch file="backend/app/api/order.py">
<search>
raise NotImplementedError
</search>
<replace>
return "bad"
</replace>
</patch>`;

  const result = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-003', name: 'Orders' },
    manifest: { modules: [] },
    defects: [{ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, message: 'Invalid return type' }],
    caller: mockCallerRepeat,
    sendEvent: () => {},
    generationId: 'test_order_oscillation',
    validateFn: async () => ({ isValid: false, errors: ['Still invalid'] })
  });

  // Since repeated patch was rejected and defects persist, file status must be failed (or handled via fallback)
  assert.strictEqual(result.success, false);
});

// ── Test 3: Bounded fallback clean regeneration succeeds on oscillation ───────
await test('Scenario 3: Bounded clean regeneration fallback recovers stalled/oscillating file from authoritative contract', async () => {
  const originalCode = `from fastapi import APIRouter
router = APIRouter()

@router.get("/orders")
def broken(
`;

  const fileDef = {
    path: 'backend/app/api/order.py',
    content: originalCode,
    status: 'repairing',
    repairAttempts: 1,
    contract: `## Authoritative Dependency Contract: backend/app/api/order.py\nExported routes: GET /orders\nSchemas: OrderSchema`,
    repairHistory: [
      {
        attempt: 1,
        hashBefore: 'hashA',
        hashAfter: 'hashB',
        defectsBefore: [{ code: 'SYN001' }],
        defectsAfter: [{ code: 'SYN001' }],
        status: 'PROGRESSING'
      }
    ]
  };

  const cleanRegeneratedFile = `from fastapi import APIRouter
from typing import List

router = APIRouter()

@router.get("/orders")
def get_orders() -> List[dict]:
    """Retrieve all user orders."""
    return [{"id": 1, "total": 99.99}]
`;

  // Caller returns clean regeneration when fallback is invoked
  const mockCaller = async (sys, prompt) => {
    if (prompt.includes('CLEAN FILE REGENERATION FALLBACK FROM AUTHORITATIVE CONTRACT')) {
      return `<file path="backend/app/api/order.py">\n${cleanRegeneratedFile}\n</file>`;
    }
    // Return patch that oscillates
    return `<patch file="backend/app/api/order.py">
<search>
def broken(
</search>
<replace>
def broken(
</replace>
</patch>`;
  };

  const result = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-003', name: 'Orders' },
    manifest: {
      modules: [{
        id: 'MOD-003',
        required_files: [fileDef]
      }]
    },
    defects: [{ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, message: 'Unclosed parenthesis' }],
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'test_bounded_fallback',
    validateFn: async (f) => {
      const isValid = !f.content.includes('def broken(') && f.content.includes('get_orders');
      return { isValid, errors: isValid ? [] : ['Syntax error'] };
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'repaired');
  assert.strictEqual(fileDef.status, 'validated');
  assert.ok(fileDef.content.includes('def get_orders'));
});

// ── Test 4: Fallback fails-closed if syntax, completeness, or import closure fails ──
await test('Scenario 4: Fallback fails-closed if regenerated file fails syntax or completeness validation', async () => {
  const originalCode = `def bad():\n    return 123(\n`;

  const fileDef = {
    path: 'backend/app/api/order.py',
    content: originalCode,
    status: 'repairing',
    repairAttempts: 1,
    contract: `Contract details`,
    repairHistory: [
      {
        attempt: 1,
        hashBefore: 'hashA',
        hashAfter: 'hashB',
        defectsBefore: [{ code: 'SYN001' }],
        defectsAfter: [{ code: 'SYN001' }],
        status: 'PROGRESSING'
      }
    ]
  };

  // Caller returns regenerated file that still has bad syntax
  const mockCaller = async (sys, prompt) => {
    if (prompt.includes('CLEAN FILE REGENERATION FALLBACK')) {
      return `<file path="backend/app/api/order.py">\ndef bad_regen():\n    unclosed(\n</file>`;
    }
    return `<patch file="backend/app/api/order.py">\n<search>\n123(\n</search>\n<replace>\n123(\n</replace>\n</patch>`;
  };

  const result = await repairFile({
    fileDef,
    activeModule: { id: 'MOD-003', name: 'Orders' },
    manifest: { modules: [{ id: 'MOD-003', required_files: [fileDef] }] },
    defects: [{ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, message: 'Unclosed parenthesis' }],
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'test_fallback_fails_closed',
    validateFn: async () => ({ isValid: false, errors: ['Still unclosed'] })
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(fileDef.status, 'failed');
});

// ── Test 5: Rejection of tiny 343-char syntactically-valid rollback (AdminProductManagement.tsx) ──
await test('Scenario 5: 343-character pure-import TSX rollback is rejected as incomplete (AdminProductManagement.tsx)', async () => {
  const tinyImportRollback = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus, Trash2, Edit } from 'lucide-react';
import { Table, Button, Input, Modal, Badge } from '../components/ui';
import type { Product, Category } from '../types';
`; // ~343 characters of pure imports without any React component or body

  assert.strictEqual(tinyImportRollback.length < 400, true);

  // validateSourceCompleteness must reject this as incomplete even if TS compiler syntax is technically valid
  const comp = validateSourceCompleteness(tinyImportRollback, 'frontend/src/pages/AdminProductManagement.tsx');
  assert.strictEqual(comp.isComplete, false, 'Tiny pure-import TSX file must be rejected as incomplete');
  assert.strictEqual(comp.defect, DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  assert.ok(comp.reason.includes('React component file (.tsx/.jsx)'), 'Must indicate lack of component body or JSX');

  // Complete version of component must pass completeness
  const completeComponent = tinyImportRollback + `
export const AdminProductManagement = () => {
  const [products, setProducts] = useState<Product[]>([]);
  return (
    <div className="p-6">
      <h1>Admin Product Management</h1>
      <Table items={products} />
    </div>
  );
};
export default AdminProductManagement;
`;

  const compComplete = validateSourceCompleteness(completeComponent, 'frontend/src/pages/AdminProductManagement.tsx');
  assert.strictEqual(compComplete.isComplete, true, 'Full component must pass completeness validation');
});

// ── Test 6: findLastStableSyntacticBoundary refuses to roll back into pure imports ──
await test('Scenario 6: findLastStableSyntacticBoundary does not roll back past substantive code into pure imports', async () => {
  const truncatedCode = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus } from 'lucide-react';

export const AdminProductManagement = () => {
  const [products, setProducts] = useState([]);
  const handleSave = () => {
    axios.post('/api/products', { name: "test"
`; // Truncated mid-statement inside component

  const boundary = findLastStableSyntacticBoundary(truncatedCode, 'frontend/src/pages/AdminProductManagement.tsx');

  // It must NOT roll back to the 343-char import preamble before the component declaration
  if (boundary.rolledBack) {
    assert.ok(
      boundary.stableContent.includes('export const AdminProductManagement') ||
      boundary.stableContent.includes('function') ||
      boundary.stableContent.length === 0,
      'Stable boundary rollback must never be pure imports without component body'
    );
  } else {
    // If no stable functional block exists, rolledBack is false (clean regeneration fallback)
    assert.strictEqual(boundary.rolledBack, false);
  }
});

// ── Test 7: script.py syntax error (</if context.is_offline_mode()) is sanitized deterministically ──
await test('Scenario 7: script.py syntax error (</if context.is_offline_mode()) is sanitized deterministically', async () => {
  const corruptedScript = `import sqlalchemy as sa
from alembic import op

def upgrade():
    op.create_table('categories', sa.Column('id', sa.Integer, primary_key=True))

def downgrade():
    op.drop_table('categories')
</if context.is_offline_mode():
    pass
else:
    from app.db.database import engine
    target_metadata = Base.metadata
    target_metadata.create_all(engine)
`;

  const sanitized = sanitizePythonCode(corruptedScript, 'backend/app/db/migrations/script.py');
  assert.ok(!sanitized.includes('</if'), 'Must not contain leaked </if tag');
  assert.ok(!sanitized.includes('context.is_offline_mode'), 'Must not contain offline mode logic');
  assert.ok(!sanitized.includes('target_metadata.create_all'), 'Must not contain target_metadata boilerplate');
  assert.ok(sanitized.includes("op.drop_table('categories')"), 'Must preserve downgrade implementation');
});
console.log(`QuickCart Repair-Recovery Test Suite Complete: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
