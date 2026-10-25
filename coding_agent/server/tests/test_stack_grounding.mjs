import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectContracts } from '../projectContractValidator.js';

test('React projects reject Angular frontend test templates', async () => {
  const files = [
    { path: 'README.md', content: '# test' },
    { path: 'frontend/package.json', content: JSON.stringify({ dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } }) },
    { path: 'frontend/index.html', content: '<div id="root"></div>' },
    { path: 'frontend/src/App.tsx', content: "import React from 'react'; export default function App(){ return <div />; }" },
    { path: 'frontend/tests/workflows.spec.ts', content: "import { TestBed } from '@angular/core/testing';\nimport { ComponentFixture } from '@angular/core/testing';\ndescribe('WorkflowListComponent', () => {});" }
  ];
  const result = await validateProjectContracts(files);
  assert.ok(result.defects.some(defect => defect.code === 'STACK_MISMATCH'));
});

test('React Playwright tests remain valid when they use Playwright APIs', async () => {
  const files = [
    { path: 'README.md', content: '# test' },
    { path: 'frontend/package.json', content: JSON.stringify({ dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } }) },
    { path: 'frontend/index.html', content: '<div id="root"></div>' },
    { path: 'frontend/src/App.tsx', content: "import React from 'react'; export default function App(){ return <div />; }" },
    { path: 'frontend/tests/workflows.spec.ts', content: "import { test, expect } from '@playwright/test';\ntest('REQ-001 registration', async ({ page }) => { await page.goto('/'); await expect(page.locator('body')).toBeVisible(); });" }
  ];
  const result = await validateProjectContracts(files);
  assert.equal(result.defects.some(defect => defect.code === 'STACK_MISMATCH'), false);
});
