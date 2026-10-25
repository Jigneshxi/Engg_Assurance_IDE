import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectContracts } from '../projectContractValidator.js';
import { autoHealProjectContracts } from '../integrationContract.js';

test('AGENT 5 CHECKLIST 1: Prohibit Trivial Assertions (TRIVIAL_WORKFLOW_TEST) rejection and auto-heal', async () => {
  const files = [
    {
      path: 'backend/tests/test_cart.py',
      content: `def test_REQ_CART_001(client):\n    assert True\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\npytest\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const trivialDefect = initialCheck.defects.find(d => d.code === 'TRIVIAL_WORKFLOW_TEST');
  assert.ok(trivialDefect, 'assert True in requirement test must trigger TRIVIAL_WORKFLOW_TEST');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair TRIVIAL_WORKFLOW_TEST');

  const testFile = files.find(f => f.path === 'backend/tests/test_cart.py');
  assert.ok(!testFile.content.includes('assert True'), 'assert True must be eliminated');
  assert.ok(testFile.content.includes('assert res.status_code in (200, 201)'), 'Must assert concrete status codes');

  const recheck = await validateProjectContracts(files);
  const remainingTrivial = recheck.defects.filter(d => d.code === 'TRIVIAL_WORKFLOW_TEST');
  assert.equal(remainingTrivial.length, 0, 'Zero TRIVIAL_WORKFLOW_TEST defects after auto-heal');
});

test('AGENT 5 CHECKLIST 2: Permissive Status Assertion Elimination (BROAD_STATUS_CODE_ASSERTION) repair', async () => {
  const files = [
    {
      path: 'backend/tests/test_checkout.py',
      content: `def test_REQ_ORDER_001(client):\n    res = client.post("/api/orders", json={"items": []})\n    assert res.status_code in (200, 201, 400, 401, 422)\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\npytest\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const broadDefect = initialCheck.defects.find(d => d.code === 'BROAD_STATUS_CODE_ASSERTION');
  assert.ok(broadDefect, 'Permissive status assertions mixing 2xx and 4xx must trigger BROAD_STATUS_CODE_ASSERTION');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair BROAD_STATUS_CODE_ASSERTION');

  const testFile = files.find(f => f.path === 'backend/tests/test_checkout.py');
  assert.ok(!testFile.content.includes('400'), 'Error codes must be pruned from success assertion');
  assert.ok(testFile.content.includes('assert res.status_code in (200, 201)'), 'Must assert strict success status codes');

  const recheck = await validateProjectContracts(files);
  const remainingBroad = recheck.defects.filter(d => d.code === 'BROAD_STATUS_CODE_ASSERTION');
  assert.equal(remainingBroad.length, 0, 'Zero BROAD_STATUS_CODE_ASSERTION defects after auto-heal');
});

test('AGENT 5 CHECKLIST 3: Requirement Specificity over Generic Queries (GENERIC_REQUIREMENT_TEST)', async () => {
  const files = [
    {
      path: 'backend/tests/test_cart_flow.py',
      content: `def test_req_cart_add(client):\n    res = client.get("/api/products")\n    assert res.status_code in (200, 201)\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\npytest\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const genericDefect = initialCheck.defects.find(d => d.code === 'GENERIC_REQUIREMENT_TEST');
  assert.ok(genericDefect, 'Cart requirement test querying generic /api/products must trigger GENERIC_REQUIREMENT_TEST');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair GENERIC_REQUIREMENT_TEST');

  const testFile = files.find(f => f.path === 'backend/tests/test_cart_flow.py');
  assert.ok(testFile.content.includes('/api/cart'), 'Must redirect test query to domain endpoint /api/cart');

  const recheck = await validateProjectContracts(files);
  const remainingGeneric = recheck.defects.filter(d => d.code === 'GENERIC_REQUIREMENT_TEST');
  assert.equal(remainingGeneric.length, 0, 'Zero GENERIC_REQUIREMENT_TEST defects after auto-heal');
});

test('AGENT 5 CHECKLIST 4: Playwright Async Discipline (UNAWAITED_BROWSER_ASSERTION)', async () => {
  const files = [
    {
      path: 'frontend/e2e/home.spec.ts',
      content: `import { test, expect } from '@playwright/test';\n\ntest('homepage loads correctly', async ({ page }) => {\n  await page.goto('/');\n  expect(page.locator('#root')).toBeVisible();\n});\n`
    },
    { path: 'frontend/package.json', content: '{"name":"fe"}' },
    { path: 'frontend/index.html', content: '<html><body><div id="root"></div></body></html>' },
    { path: 'README.md', content: '# Docs' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const unawaitedDefect = initialCheck.defects.find(d => d.code === 'UNAWAITED_BROWSER_ASSERTION');
  assert.ok(unawaitedDefect, 'Unawaited expect().toBeVisible() must trigger UNAWAITED_BROWSER_ASSERTION');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair UNAWAITED_BROWSER_ASSERTION');

  const specFile = files.find(f => f.path === 'frontend/e2e/home.spec.ts');
  assert.ok(specFile.content.includes('await expect(page.locator'), 'Must await Playwright matcher');

  const recheck = await validateProjectContracts(files);
  const remainingUnawaited = recheck.defects.filter(d => d.code === 'UNAWAITED_BROWSER_ASSERTION');
  assert.equal(remainingUnawaited.length, 0, 'Zero UNAWAITED_BROWSER_ASSERTION defects after auto-heal');
});

test('AGENT 5 CHECKLIST 5: Vacuous Browser Test Elimination (VACUOUS_BROWSER_TEST)', async () => {
  const files = [
    {
      path: 'frontend/e2e/checkout.spec.ts',
      content: `import { test, expect } from '@playwright/test';\n\ntest('checkout page displays', async ({ page }) => {\n  await page.goto('/checkout');\n  expect(page).toBeDefined();\n});\n`
    },
    { path: 'frontend/package.json', content: '{"name":"fe"}' },
    { path: 'frontend/index.html', content: '<html><body><div id="root"></div></body></html>' },
    { path: 'README.md', content: '# Docs' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const vacuousDefect = initialCheck.defects.find(d => d.code === 'VACUOUS_BROWSER_TEST');
  assert.ok(vacuousDefect, 'expect(page).toBeDefined() must trigger VACUOUS_BROWSER_TEST');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair VACUOUS_BROWSER_TEST');

  const specFile = files.find(f => f.path === 'frontend/e2e/checkout.spec.ts');
  assert.ok(!specFile.content.includes('expect(page).toBeDefined()'), 'Vacuous assertion must be eliminated');
  assert.ok(specFile.content.includes('await expect(page.locator'), 'Must assert real UI element');

  const recheck = await validateProjectContracts(files);
  const remainingVacuous = recheck.defects.filter(d => d.code === 'VACUOUS_BROWSER_TEST');
  assert.equal(remainingVacuous.length, 0, 'Zero VACUOUS_BROWSER_TEST defects after auto-heal');
});
