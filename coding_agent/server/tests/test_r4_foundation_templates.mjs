import assert from 'assert';
import { getFoundationFiles } from '../foundationTemplates.js';

console.log('================================================');
console.log('  TEST R4: SELF-CONTAINED FOUNDATION TEMPLATES  ');
console.log('================================================\n');

function testNonEcommerceFoundationFiles() {
  console.log('--- TEST 1: Non-Ecommerce Project (taskflow-task-manage-platform) ---');

  const files = getFoundationFiles('taskflow-task-manage-platform');

  // 1. CartContext.tsx must NOT exist in a taskflow project
  const cartContext = files.find(f => f.path.includes('CartContext.tsx'));
  assert.strictEqual(cartContext, undefined, 'CartContext.tsx must NOT be included in non-ecommerce projects');

  // 2. main.tsx must NOT import or wrap with CartProvider
  const mainTsx = files.find(f => f.path === 'frontend/src/main.tsx');
  assert.ok(mainTsx, 'main.tsx must be generated');
  assert.strictEqual(
    mainTsx.content.includes('CartProvider'),
    false,
    'main.tsx must NOT import or mount CartProvider in non-ecommerce project'
  );
  assert.ok(
    mainTsx.content.includes('AuthProvider'),
    'main.tsx must mount AuthProvider'
  );

  // 3. backend/app/core/config.py must have safe self-contained development defaults
  const configPy = files.find(f => f.path === 'backend/app/core/config.py');
  assert.ok(configPy, 'config.py must be generated');
  assert.ok(
    configPy.content.includes('SECRET_KEY'),
    'config.py must define SECRET_KEY'
  );
  assert.strictEqual(
    configPy.content.includes('raise RuntimeError("FATAL: SECRET_KEY environment variable is missing'),
    false,
    'config.py must not raise a fatal runtime error on local import'
  );

  console.log('✅ PASS: Non-ecommerce project has clean main.tsx without CartProvider, and safe config.py.\n');
}

function testEcommerceFoundationFiles() {
  console.log('--- TEST 2: Ecommerce Project (QuickCart) ---');

  const files = getFoundationFiles('QuickCart');

  // 1. CartContext.tsx MUST exist in an ecommerce project
  const cartContext = files.find(f => f.path.includes('CartContext.tsx'));
  assert.ok(cartContext, 'CartContext.tsx MUST be included in ecommerce project');

  // 2. main.tsx MUST import and wrap with CartProvider
  const mainTsx = files.find(f => f.path === 'frontend/src/main.tsx');
  assert.ok(mainTsx, 'main.tsx must be generated');
  assert.ok(
    mainTsx.content.includes('CartProvider'),
    'main.tsx MUST import and mount CartProvider in ecommerce project'
  );

  console.log('✅ PASS: Ecommerce project correctly includes CartContext and CartProvider.\n');
  console.log('================================================');
  console.log('   ALL R4 FOUNDATION TEMPLATE TESTS PASSED!     ');
  console.log('================================================');
}

function runAll() {
  testNonEcommerceFoundationFiles();
  testEcommerceFoundationFiles();
}

runAll();
