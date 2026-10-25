import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateWorkflowExecution } from '../server/workflowValidator.js';
import { validateBackendRuntime } from '../server/backendRuntimeValidator.js';
import { wireApplicationFromContract } from '../server/integrationContract.js';
import { getPythonBinary } from '../server/backendRuntimeValidator.js';

let python = process.argv[2] || getPythonBinary();
let browserTools = process.argv[3];
const evidenceDirectory = path.resolve(process.argv[4] || 'docs/08-quickcart-study/verification');

if (!browserTools) {
  for (const candidate of [
    process.env.BROWSER_TOOLS_PATH,
    path.resolve('workspaces/quickcart-ecommerce-platform/frontend'),
    path.resolve('..'),
    path.resolve('.')
  ]) {
    if (candidate && fs.existsSync(path.join(candidate, 'node_modules/@playwright/test'))) {
      browserTools = candidate;
      break;
    }
  }
}

if (!python || !browserTools || !fs.existsSync(path.join(browserTools, 'node_modules/@playwright/test'))) {
  console.error('[EXTERNAL_ENVIRONMENT_BLOCKER] Runtime validation could not execute: Python interpreter or Playwright browser tools unavailable in current environment.');
  console.error('Install/repair the project Python environment and Playwright browser dependencies, then rerun test:runtime.');
  process.exitCode = 2;
  process.exit();
}
const fixture = path.resolve('fixtures/validation-runtime');
const files = [];
function collect(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) collect(path.join(directory, entry.name), relative + '/');
    else files.push({ path: relative, content: fs.readFileSync(path.join(directory, entry.name), 'utf8'), status: 'validated' });
  }
}
collect(fixture);
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-deps-'));
try {
  const modules = path.join(workspace, 'frontend/node_modules'); fs.mkdirSync(path.join(modules, '@playwright'), { recursive: true });
  const linkDir = (src, dest) => {
    try {
      fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (_) {
      fs.cpSync(src, dest, { recursive: true });
    }
  };
  for (const name of ['react', 'react-dom', 'vite']) linkDir(path.resolve('node_modules', name), path.join(modules, name));
  linkDir(path.resolve(browserTools, 'node_modules/@playwright/test'), path.join(modules, '@playwright/test'));
  files.push({ path: 'frontend/playwright.config.cjs', content: 'module.exports={testDir:"./tests",workers:1,retries:0,use:{baseURL:process.env.FRONTEND_URL,channel:"chrome",headless:true,launchOptions:{args:["--no-sandbox"]}}};', status: 'validated' });
  const reqs = Array.from({ length: 7 }, (_, n) => `REQ-${String(n + 1).padStart(3, '0')}`);
  const contract = { workflows: [ { testFile: 'backend/tests/test_flows.py', runner: 'pytest', requirementIds: reqs }, { testFile: 'frontend/tests/cart.spec.ts', runner: 'playwright', requirementIds: ['REQ-008'] } ] };
  const result = await validateWorkflowExecution(files, contract, { workspacePath: workspace, python, sendEvent: (event, data) => event === 'log' && console.log(data) });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'runtime-workflows.json'), JSON.stringify(result, null, 2));
  assert(result.isValid, result.errors.join('\n'));
  assert(result.browserPassed); assert.equal(result.suites.reduce((n, s) => n + s.testCount, 0), 8);
  // The backend validator must perform real TestClient health/auth requests too.
  const backendFiles = files.filter(f => f.path.startsWith('backend/'));
  const backend = await validateBackendRuntime(backendFiles, { workspacePath: workspace, python, manifest: { project_requirements: { backend: { apis: ['health', 'cart'] } } } });
  assert(backend.summary.httpEvidence.executed, JSON.stringify(backend.errors));
  assert(backend.summary.httpEvidence.protectedEndpointsChecked >= 5);
  fs.writeFileSync(path.join(evidenceDirectory, 'backend-http.json'), JSON.stringify(backend, null, 2));
  const main = { path: 'backend/main.py', content: 'from fastapi import FastAPI\nfrom app.api.cart import router as carts\napp=FastAPI()\napp.include_router(carts,prefix="/cart")\napp.include_router(carts,prefix="/api/admin/cart")\n' };
  await wireApplicationFromContract([main], { schemaVersion: 2, endpoints: [{ backendFile: 'backend/app/api/cart.py', routerPrefix: '/api/cart' }] });
  assert.equal((main.content.match(/include_router/g) || []).length, 1);
  assert(main.content.includes("prefix='/api/cart'"));
  console.log('PASS: 7 SQLite/TestClient workflows, 1 real browser persistence workflow, runtime HTTP probes, and canonical router wiring.');
} finally { fs.rmSync(workspace, { recursive: true, force: true }); }
