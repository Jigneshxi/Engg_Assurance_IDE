import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getValidationCacheBase, getValidationBrowserPath, prepareValidationDependencies } from '../validationSetup.js';
import { getFoundationFiles } from '../foundationTemplates.js';
import { validateProductionBuildContract } from '../frontendContractValidator.js';
import { validateWorkflowExecution } from '../workflowValidator.js';

console.log('================================================');
console.log('   TEST R6: VALIDATION ENVIRONMENT TEST         ');
console.log('================================================\n');

// --- TEST 1: Cache Location Resolution ---
console.log('--- TEST 1: External Cache Path Resolution ---');
{
  const testDir = 'd:/projects/sample-taskflow';
  const cacheBase = getValidationCacheBase(testDir);
  const browserPath = getValidationBrowserPath(testDir);

  const homeDir = os.homedir();
  assert.strictEqual(cacheBase, path.join(homeDir, '.openclaw', 'validation-runtime'), 'Cache base should be outside workspace in ~/.openclaw');
  assert.strictEqual(browserPath, path.join(homeDir, '.openclaw', 'playwright-browsers'), 'Browser path should be outside workspace in ~/.openclaw');

  // Test temporary test directory isolation
  const isolatedDir = path.join(os.tmpdir(), 'setup-test-1234');
  const isolatedCache = getValidationCacheBase(isolatedDir);
  assert.strictEqual(isolatedCache, path.join(path.resolve(isolatedDir), '.openclaw/validation-runtime'), 'Temp test directories stay isolated');

  console.log('✅ PASS: Cache and browser directories properly placed outside repository with test isolation support.');
}

// --- TEST 2: Cache Reuse Across Runs ---
console.log('\n--- TEST 2: Cache Reuse Across Runs (Zero Re-installs) ---');
{
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-r6-'));
  const tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-r6-'));
  let installCalls = 0;

  const mockExecute = async (cmd, args, options) => {
    installCalls++;
    assert(args.includes('--ignore-scripts'), 'Must use --ignore-scripts');
    // Simulate successful installation
    fs.mkdirSync(path.join(options.cwd, 'node_modules', 'typescript', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(options.cwd, 'node_modules', 'typescript', 'bin', 'tsc'), '#!/usr/bin/env node\n');
    return { code: 0, output: 'Successfully installed' };
  };

  try {
    const files = [
      { path: 'frontend/package.json', content: JSON.stringify({ name: 'fe', dependencies: { react: '^18.2.0' } }) }
    ];

    // First call: installs
    const meta1 = await prepareValidationDependencies(files, tempWorkspace, {
      execute: mockExecute,
      installBrowsers: false,
      cacheDir: tempCacheDir
    });

    // Verify node_modules junction was created in workspace
    const workspaceNodeModules = path.join(tempWorkspace, 'frontend', 'node_modules');
    assert.ok(fs.existsSync(workspaceNodeModules), 'Workspace frontend/node_modules exists');
    assert.strictEqual(installCalls, 1, 'First run triggered npm install');

    // Second call: must reuse cache without running npm install
    const meta2 = await prepareValidationDependencies(files, tempWorkspace, {
      execute: mockExecute,
      installBrowsers: false,
      cacheDir: tempCacheDir
    });

    assert.strictEqual(installCalls, 1, 'Second run reused completed cache without re-running npm install');
    assert.strictEqual(meta1.cache, meta2.cache, 'Cache hashes match');
    console.log('✅ PASS: Cache successfully reused on subsequent runs without redundant installation.');
  } finally {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  }
}

// --- TEST 3: Template-Only Workspace Frontend & Build Contract Execution ---
console.log('\n--- TEST 3: Template-Only Workspace Gates Execution ---');
{
  const templateFiles = getFoundationFiles('taskflow-task-manage-platform');

  // Verify App.tsx exists in template files
  const appTsx = templateFiles.find(f => f.path === 'frontend/src/App.tsx');
  assert.ok(appTsx, 'frontend/src/App.tsx is present in foundation templates');

  // Verify main.tsx exists and imports ./App
  const mainTsx = templateFiles.find(f => f.path === 'frontend/src/main.tsx');
  assert.ok(mainTsx, 'frontend/src/main.tsx is present in foundation templates');
  assert.ok(mainTsx.content.includes("from './App'"), 'main.tsx cleanly imports App');

  // Verify production build contract checks pass on templates
  const buildResult = await validateProductionBuildContract(templateFiles, { runBuild: false });
  assert.strictEqual(buildResult.defects.length, 0, `No build contract defects in templates: ${JSON.stringify(buildResult.defects)}`);

  console.log('✅ PASS: Template-only workspace satisfies frontend entry point and build contract.');
}

// --- TEST 4: Missing Runner Stays ENV_BLOCKED (Never False PASS) ---
console.log('\n--- TEST 4: Missing Runner Stays ENV_BLOCKED ---');
{
  const templateFiles = [
    ...getFoundationFiles('taskflow-task-manage-platform'),
    { path: 'frontend/tests/workflows.spec.ts', content: "import { test } from '@playwright/test'; test('REQ-001', () => {});" }
  ];
  const workflows = [
    { runner: 'playwright', testFile: 'frontend/tests/workflows.spec.ts', requirementIds: ['REQ-001'] }
  ];

  const workflowResult = await validateWorkflowExecution(templateFiles, { workflows }, {
    workspacePath: 'd:/dummy-empty-workspace'
  });

  // Must not pass
  assert.strictEqual(workflowResult.isValid, false, 'Missing runner must never report valid');
  assert.strictEqual(workflowResult.browserPassed, false, 'Missing runner browserPassed must be false');
  assert.ok(workflowResult.blockedByEnvironment, 'Environment block must be flagged as blockedByEnvironment');

  console.log('✅ PASS: Missing runner stays ENV_BLOCKED and fails closed (never false PASS).');
}

console.log('\n================================================');
console.log('   ALL R6 VALIDATION ENVIRONMENT TESTS PASSED!  ');
console.log('================================================\n');
