import assert from 'assert';
import { validateFile, validateFileSyntax } from '../orchestrator.js';
import { DATABASE_DEFECT_CODES } from '../dbValidator.js';
import { getRepairStrategy } from '../repairEngine.js';

async function runPhase4Tests() {
  console.log('🧪 Starting Phase 4 Real Syntax Validation Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  // 1. Python Valid Syntax
  await asyncTest('Python valid syntax passes deterministic toolchain check', async () => {
    const validPy = {
      path: 'backend/app/main.py',
      content: 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\ndef read_root():\n    return {"status": "ok"}\n'
    };
    const res = await validateFile(validPy, null, process.cwd());
    assert.strictEqual(res.isValid, true, 'Valid python should pass syntax validation');
    assert.strictEqual(res.errors.length, 0);
  });

  // 2. Python Invalid Syntax (Deterministic toolchain error)
  await asyncTest('Python syntax error is caught by real toolchain and yields error', async () => {
    const invalidPy = {
      path: 'backend/app/broken.py',
      content: 'def broken_function(\n    return 42\n'
    };
    const res = await validateFile(invalidPy, null, process.cwd());
    assert.strictEqual(res.isValid, false, 'Invalid python syntax must fail validation');
    assert(res.errors.length > 0, 'Must have at least one error message');
    assert(res.errors.some(e => e.includes('Python Syntax Error') || e.includes('Unclosed bracket') || e.includes('Syntax')),
      `Expected syntax error message, got: ${JSON.stringify(res.errors)}`);
    assert.strictEqual(res.defectCode, DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE);
  });

  // 3. TypeScript Valid Syntax
  await asyncTest('TypeScript valid file passes AST syntax check', async () => {
    const validTs = {
      path: 'frontend/src/types.ts',
      content: 'export interface EntityItem {\n  id: number;\n  title: string;\n  isActive: boolean;\n}\n\nexport const computeTotal = (items: EntityItem[]): number => items.length;\n'
    };
    const res = await validateFile(validTs, null, process.cwd());
    assert.strictEqual(res.isValid, true, 'Valid TypeScript must pass syntax validation');
    assert.strictEqual(res.errors.length, 0);
  });

  // 4. TypeScript Invalid Syntax
  await asyncTest('TypeScript syntax error is caught by compiler AST parse', async () => {
    const invalidTs = {
      path: 'frontend/src/bad_types.ts',
      content: 'export interface EntityItem {\n  id: number\n  title: string;\n  isActive: ; // missing type\n}\n'
    };
    const res = await validateFile(invalidTs, null, process.cwd());
    assert.strictEqual(res.isValid, false, 'Invalid TypeScript must fail syntax validation');
    assert(res.errors.some(e => e.includes('TypeScript Syntax Error')),
      `Expected TypeScript syntax error, got: ${JSON.stringify(res.errors)}`);
  });

  // 5. TSX Valid Syntax
  await asyncTest('React TSX valid component passes AST check', async () => {
    const validTsx = {
      path: 'frontend/src/DashboardView.tsx',
      content: 'import React from "react";\n\nexport const DashboardView: React.FC = () => {\n  return (\n    <div className="container">\n      <h1>Dashboard</h1>\n      <p>Loaded successfully.</p>\n    </div>\n  );\n};\n'
    };
    const res = await validateFile(validTsx, null, process.cwd());
    assert.strictEqual(res.isValid, true, 'Valid TSX component must pass syntax validation');
    assert.strictEqual(res.errors.length, 0);
  });

  // 6. TSX Unclosed Tag Syntax Error
  await asyncTest('TSX unclosed JSX tag is deterministically caught as syntax error', async () => {
    const invalidTsx = {
      path: 'frontend/src/BrokenView.tsx',
      content: 'import React from "react";\n\nexport const BrokenView: React.FC = () => {\n  return (\n    <div className="container">\n      <h1>Dashboard\n    </div>\n  );\n};\n'
    };
    const res = await validateFile(invalidTsx, null, process.cwd());
    assert.strictEqual(res.isValid, false, 'Unclosed JSX tag in TSX must fail validation');
    assert(res.errors.some(e => e.includes('TypeScript Syntax Error')),
      `Expected TypeScript Syntax Error, got: ${JSON.stringify(res.errors)}`);
  });

  // 7. Invariant: LLM says valid != code is valid
  await asyncTest('Invariant: LLM claim of validity does not bypass deterministic syntax check', async () => {
    // Simulate an LLM output that claims "The code is 100% valid and verified", but contains invalid syntax
    const mockLLMBrokenCode = {
      path: 'backend/app/service.py',
      content: '# LLM Claim: This file is 100% valid, bug-free, and tested.\ndef calculate_metrics(items):\n    val = [x for x in items if\n    return val\n'
    };
    const res = await validateFile(mockLLMBrokenCode, null, process.cwd());
    assert.strictEqual(res.isValid, false, 'LLM conversational or comment claims of validity must not override deterministic failure');
    assert(res.errors.length > 0);
  });

  // 8. Repair Strategy Mapping
  test('DATABASE_DEFECT_CODES contains SYNTAX_VALIDATION_FAILURE and maps to repair strategy', () => {
    assert.strictEqual(DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE, 'SYNTAX_VALIDATION_FAILURE');
    const strategy = getRepairStrategy(DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE);
    assert(strategy, 'Must have repair strategy for SYNTAX_VALIDATION_FAILURE');
    assert(strategy.instructions.length > 0);
  });

  // 9. validateFileSyntax convenience wrapper
  await asyncTest('validateFileSyntax returns structured validation result', async () => {
    const fileDef = {
      path: 'backend/app/config.json',
      content: '{"port": 8000, "debug": false}'
    };
    const res = await validateFileSyntax(fileDef, process.cwd());
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.defectCode, null);
  });

  console.log(`\n========================================`);
  console.log(`Phase 4 Results: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`========================================\n`);
}

runPhase4Tests().catch(err => {
  console.error('Phase 4 Test Suite Failed:', err);
  process.exit(1);
});
