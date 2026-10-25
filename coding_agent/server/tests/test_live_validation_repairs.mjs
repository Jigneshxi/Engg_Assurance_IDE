import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateProjectContracts } from '../projectContractValidator.js';
import { repairProjectContracts, normalizeIntegrationContract, validateIntegrationContract } from '../integrationContract.js';
import { verifyProtectedEndpointGuards } from '../apiAuthzValidator.js';
import { validateTypeScriptContract } from '../frontendContractValidator.js';
import { validateWorkflowExecution, findPlaywrightConfigs } from '../workflowValidator.js';
import { createValidationWorkspace, validationEnvironment } from '../validationRuntime.js';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { preserveFailedCompletionGate } from '../uiTruthfulness.js';

const file = (path, content) => ({ path, content, status: 'validated' });
const base = [file('README.md', 'Setup'), file('backend/requirements.txt', 'fastapi\nsqlalchemy'), file('frontend/package.json', '{}'), file('frontend/index.html', '<div id="root"></div>')];

test('repair never fabricates missing API handlers or permissive schemas', async () => {
  const main = file('backend/main.py', 'from fastapi import FastAPI\napp = FastAPI()');
  const result = await repairProjectContracts([main], { validate: async () => ({ isValid: false, defects: [{ code: 'PLANNED_ENDPOINT_MISSING', file: main.path, message: 'POST /api/cart missing' }] }), caller: async () => 'not a valid patch', maxRounds: 1 });
  assert.equal(result.isValid, false); assert(!main.content.includes('auto_bridge'));
});

test('one-file patches use the existing patch engine and are validated', async () => {
  const files = [file('app.js', 'const total = wrong;')];
  const validate = async f => ({ isValid: f[0].content.includes('42'), defects: f[0].content.includes('42') ? [] : [{ code: 'BAD_VALUE', file: 'app.js', message: 'wrong value' }] });
  const result = await repairProjectContracts(files, { validate, caller: async () => JSON.stringify({ file: 'app.js', search: 'wrong', replace: '42' }) });
  assert(result.isValid); assert.equal(files[0].content, 'const total = 42;'); assert.equal(files[0].status, 'pending');
});

test('repair rolls back mutations introducing new defects', async () => {
  const files = [file('app.js', 'old')];
  const result = await repairProjectContracts(files, { validate: async f => ({ isValid: false, defects: [{ code: f[0].content === 'old' ? 'OLD' : 'NEW', file: 'app.js', message: 'broken' }] }), caller: async () => '{"file":"app.js","search":"old","replace":"new"}' });
  assert(!result.isValid); assert.equal(files[0].content, 'old');
});

test('stub handlers and generic response models cannot satisfy a field contract', async () => {
  const result = await validateProjectContracts([...base, file('backend/main.py', 'from fastapi import FastAPI\nfrom typing import Any\napp = FastAPI()\n@app.post("/api/orders", response_model=Any)\ndef auto_bridge_orders():\n    return {"status":"ok"}')], { integrationContract: { endpoints: [{ method: 'POST', path: '/api/orders', responseFields: ['total_amount'] }] } });
  assert(result.defects.some(d => d.code === 'STUB_ENDPOINT'));
  assert(result.defects.some(d => d.code === 'API_RESPONSE_MISMATCH'));
});

test('queries of Pydantic schemas and nonexistent ORM class fields are detected', async () => {
  const result = await validateProjectContracts([...base,
    file('backend/app/schemas/cart.py', 'from pydantic import BaseModel\nclass CartItemCreate(BaseModel):\n    id: int'),
    file('backend/app/db/models.py', 'from sqlalchemy.orm import DeclarativeBase\nclass Base(DeclarativeBase):\n    pass\nclass OrderItem(Base):\n    id = 1\n    order_id = 1'),
    file('backend/main.py', 'from app.schemas.cart import CartItemCreate\nfrom app.db.models import OrderItem\ndef broken(db):\n    return db.query(CartItemCreate).filter(OrderItem.customer_id == 1).all()')]);
  assert(result.defects.some(d => d.code === 'ORM_SCHEMA_QUERY'));
  assert(result.defects.some(d => d.code === 'MODEL_FIELD_MISMATCH'));
});

test('response schemas reject credential fields, permissive extras, and create/update reuse', async () => {
  const result = await validateProjectContracts([...base,
    file('backend/app/schemas/customer.py', `from pydantic import BaseModel, ConfigDict
class CustomerResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    password_hash: str
class OrderCreate(BaseModel):
    total: float
`),
    file('backend/app/api/customers.py', `from fastapi import APIRouter
from app.schemas.customer import CustomerResponse, OrderCreate
router = APIRouter()
@router.get("/customer", response_model=CustomerResponse)
def customer():
    return {"id": 1}
@router.post("/order", response_model=OrderCreate)
def order():
    return {"total": 10}
`)]);
  for (const code of ['SENSITIVE_RESPONSE_FIELD', 'BROAD_RESPONSE_SCHEMA', 'OPERATION_SCHEMA_MISMATCH']) {
    assert(result.defects.some(d => d.code === code), `expected ${code}`);
  }
});

test('axios array expectations must agree with actual cart response shape', async () => {
  const result = await validateProjectContracts([...base,
    file('backend/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/api/cart")\ndef cart(db):\n    values = db.all()\n    return {"items": values, "total": 0}'),
    file('frontend/src/Cart.tsx', 'axios.get<CartItem[]>("/api/cart")')]);
  assert(result.defects.some(d => d.code === 'API_RESPONSE_SHAPE_MISMATCH'));
});

test('auth dependencies are checked for each mutation; comments cannot supply guards', () => {
  const result = verifyProtectedEndpointGuards([file('backend/app/api/orders.py', '# current_user\n@router.post("/a")\ndef a():\n    return {}\n@router.post("/b")\ndef b(user=Depends(get_current_user)):\n    return {}')]);
  assert.equal(result.defects.length, 1); assert(result.defects[0].message.endsWith('a'));
});

test('admin endpoints require admin dependencies, including reads', () => {
  const result = verifyProtectedEndpointGuards([file('backend/app/api/admin.py', '@router.get("/orders")\ndef orders(user=Depends(get_current_user)):\n    return {}')]);
  assert(result.defects.some(d => d.subtype === 'AUTHZ_ADMIN_GUARD_MISSING'));
});

test('workflow planning does not mistake Playwright config for a test suite', () => {
  const manifest = { modules: [{ layer: 'FRONTEND', required_files: [file('frontend/tests/playwright.config.ts', ''), file('frontend/tests/cart.spec.ts', ''), file('frontend/src/App.tsx', '')] }], requirements: [{ id: 'REQ-001', type: 'ui' }] };
  const contract = normalizeIntegrationContract({}, manifest);
  assert.equal(contract.workflows[0].testFile, 'frontend/tests/cart.spec.ts');
});

test('workflow validator rejects duplicate Playwright configuration files', async () => {
  const configs = [file('frontend/playwright.config.ts', ''), file('frontend/playwright.config.js', '')];
  assert.equal(findPlaywrightConfigs(configs).length, 2);
  const result = await validateWorkflowExecution(configs, { workflows: [] });
  assert(result.defects.some(d => d.code === 'DUPLICATE_PLAYWRIGHT_CONFIG'));
});

test('scaffolding preserves business source and never imports stale schemas', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'backend/app/schemas'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'backend/app/schemas/stale.py'), 'stale');
    const files = [file('backend/main.py', 'from fastapi import FastAPI\napp = FastAPI()')];
    const source = files[0].content;
    writeWorkspaceAndScaffolds(directory, files);
    assert.equal(files[0].content, source); assert(!files.some(f => f.path.includes('stale')));
    assert(!files.some(f => /auth\.py|schemas\/\w+\.py/.test(f.path) && !f.path.endsWith('__init__.py')));
    assert.throws(() => writeWorkspaceAndScaffolds(directory, [file('../escape.py', 'bad')]));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('validation uses mock-only environment and omits environment/database files', () => {
  const sandbox = createValidationWorkspace([file('backend/.env', 'DO_NOT_LOAD=private'), file('backend/app.db', 'never copy'), file('backend/main.py', '# app')]);
  try {
    assert(!fs.existsSync(path.join(sandbox.directory, 'backend/.env')));
    assert(!fs.existsSync(path.join(sandbox.directory, 'backend/app.db')));
    const env = validationEnvironment(sandbox.directory); assert.equal(env.OPENAI_API_KEY, undefined); assert(env.DATABASE_URL.startsWith('sqlite:///')); assert.equal(env.PAYMENT_PROVIDER, 'mock');
  } finally { sandbox.cleanup(); }
});

test('real typechecking rejects semantic errors missed by syntax parsing', async () => {
  const sandbox = createValidationWorkspace([file('frontend/src/example.ts', 'const total: number = "wrong";'), file('frontend/tsconfig.json', '{"compilerOptions":{"types":[],"skipLibCheck":true},"include":["src"]}')]);
  try {
    fs.symlinkSync(path.resolve('node_modules'), path.join(sandbox.directory, 'frontend/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await validateTypeScriptContract([file('frontend/src/example.ts', 'const total: number = "wrong";')], { workspacePath: sandbox.directory, runTsc: true });
    assert(result.defects.some(d => d.subtype === 'TYPESCRIPT_CHECK_FAILED'));
  } finally { sandbox.cleanup(); }
});

test('workflow command failures preserve bounded, redacted diagnostics', async () => {
  const f = file('backend/tests/test_flow.py', 'def test_REQ_001():\n    assert True');
  const result = await validateWorkflowExecution([f], { workflows: [{ testFile: f.path, runner: 'pytest', requirementIds: ['REQ-001'] }] }, { execute: async () => ({ code: 1, output: 'ModuleNotFoundError: missing_dependency' }) });
  assert(result.errors.some(e => e.includes('missing_dependency'))); assert.equal(result.isValid, false);
});

test('passing tests without requirement names still fail the evidence contract', async () => {
  const f = file('backend/tests/test_flow.py', 'def test_sample():\n    assert True');
  const result = await validateWorkflowExecution([f], { workflows: [{ testFile: f.path, runner: 'pytest', requirementIds: ['REQ-001'] }] }, { execute: async (_, args) => {
    fs.writeFileSync(args.find(a => a.startsWith('--junitxml=')).slice(11), '<testsuite><testcase name="test_sample"/></testsuite>'); return { code: 0 };
  } });
  assert(!result.isValid); assert(result.errors.some(e => e.includes('REQ-001')));
});

test('the UI preserves detailed failed gates across the real terminal event shape', () => {
  const detailed = { status: 'FAIL', failedGates: ['browserE2e', 'prdCoverage'] };
  const state = preserveFailedCompletionGate(detailed, { status: 'failed', score: 95 });
  assert.deepEqual(state.failedGates, detailed.failedGates); assert.equal(state.status, 'FAIL');
});

test('saved QuickCart 37a remains rejected for concrete business and API defects', async (t) => {
  const root = path.resolve('docs/08-quickcart-study/specimens/project_test37a');
  if (!fs.existsSync(root)) {
    if (t?.skip) t.skip('Specimen directory project_test37a not present');
    return;
  }
  const files = [];
  const collect = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) collect(path.join(directory, entry.name), name + '/');
      else if (/\.(py|tsx|ts|jsx|js|json|md|html)$/.test(name) || name === 'backend/requirements.txt') files.push(file(name, fs.readFileSync(path.join(directory, entry.name), 'utf8')));
    }
  };
  collect(root);
  const result = await validateProjectContracts(files);
  for (const code of ['ORM_SCHEMA_QUERY', 'STUB_ENDPOINT', 'NON_ATOMIC_WORKFLOW', 'API_RESPONSE_SHAPE_MISMATCH']) assert(result.defects.some(d => d.code === code), code);
});

test('planned requirement IDs cannot be satisfied by assert True', async () => {
  const result = await validateProjectContracts([...base, file('backend/tests/test_flow.py', 'def test_REQ_001():\n    assert True')]);
  assert(result.defects.some(d => d.code === 'TRIVIAL_WORKFLOW_TEST'));
});

test('dependency setup strips lifecycle scripts and reuses only completed caches', async () => {
  const { prepareValidationDependencies } = await import('../validationSetup.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
  let calls = 0;
  const execute = async (_, args, options) => {
    calls++; assert(args.includes('--ignore-scripts'));
    assert.notEqual(options.env.NPM_CONFIG_USERCONFIG, options.env.NPM_CONFIG_GLOBALCONFIG);
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(JSON.parse(fs.readFileSync(path.join(options.cwd, 'package.json'))).scripts, undefined);
    fs.mkdirSync(path.join(options.cwd, 'node_modules'), { recursive: true }); return { code: 0 };
  };
  try {
    const files = [file('frontend/package.json', '{"scripts":{"preinstall":"must never run"},"dependencies":{}}')];
    await prepareValidationDependencies(files, directory, { execute, installBrowsers: false });
    await prepareValidationDependencies(files, directory, { execute, installBrowsers: false });
    assert.equal(calls, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('repairs can create missing modules only when the manifest planned them', async () => {
  const files = [file('backend/main.py', 'import missing')];
  const target = 'backend/app/schemas/item.py';
  const validate = async source => ({ isValid: source.some(f => f.path === target), defects: source.some(f => f.path === target) ? [] : [{ code: 'MISSING_PYTHON_MODULE', file: 'backend/main.py', targetFile: target, message: 'Missing planned schema module' }] });
  const result = await repairProjectContracts(files, { validate, plannedFiles: [target], caller: async () => JSON.stringify({ files: [{ path: target, content: 'class Item: pass' }] }) });
  assert(result.isValid); assert(files.some(f => f.path === target));
});

test('a repair may expose a later validation stage without being reported complete', async () => {
  const files = [file('app.js', 'type error')];
  let calls = 0;
  const validate = async source => ({ stage: source[0].content === 'type error' ? 0 : 1, isValid: false, defects: [{ code: source[0].content === 'type error' ? 'TYPE' : 'RUNTIME', file: 'app.js', message: 'still needs repair' }] });
  const result = await repairProjectContracts(files, { validate, maxRounds: 1, caller: async () => { calls++; return '{"file":"app.js","search":"type error","replace":"runtime error"}'; } });
  assert.equal(calls, 1); assert.equal(files[0].content, 'runtime error'); assert.equal(result.isValid, false);
});

test('JavaScript route middleware checks ignore comments and check each mutation', () => {
  const result = verifyProtectedEndpointGuards([file('backend/routes/orders.js', '// authenticateToken\nrouter.post("/one", (req,res)=>res.json({}));\nrouter.post("/two", authenticateToken, (req,res)=>res.json({}));')]);
  assert.equal(result.defects.length, 1); assert(result.defects[0].message.includes('/one'));
});

test('explicitly public contracted mutations do not require login', () => {
  const f = file('backend/app/api/forms.py', '@router.post("/submit")\ndef submit(payload):\n    return payload');
  const result = verifyProtectedEndpointGuards([f], { manifest: { integrationContract: { endpoints: [{ backendFile: f.path, method: 'POST', routerPath: '/submit', auth: 'public' }] } } });
  assert.equal(result.defects.length, 0);
});

test('Express middleware registered after a route cannot protect that earlier route', () => {
  const result = verifyProtectedEndpointGuards([file('backend/routes/orders.js', 'router.post("/earlier", handler);\nrouter.use(authenticateToken);\nrouter.post("/later", handler);')]);
  assert.equal(result.defects.length, 1); assert(result.defects[0].message.includes('/earlier'));
});

test('provider-specific credential shapes are redacted from workflow diagnostics', async () => {
  const { redactSecret, scanForCredentials } = await import('../securityValidator.js');
  for (const token of ['AIza' + 'x'.repeat(30), 'gsk_' + 'x'.repeat(30), 'sk-or-v1-' + 'x'.repeat(30)]) {
    assert(!redactSecret(token).includes(token));
    assert(scanForCredentials(file('backend/settings.py', `value = "${token}"`)).length > 0);
  }
});

test('live contracts reject generic response schemas and user-only admin policies', () => {
  const manifest = { modules: [{ required_files: [file('backend/app/api/admin.py', ''), file('backend/tests/test_flow.py', '')] }], requirements: [{ id: 'REQ-001', type: 'feature' }] };
  const checked = validateIntegrationContract({ schemaVersion: 2, endpoints: [{ method: 'GET', path: '/api/admin/orders', routerPrefix: '/api/admin/orders', routerPath: '', backendFile: 'backend/app/api/admin.py', requestFields: [], responseFields: ['id'], responseSchema: 'Any', auth: 'user' }], workflows: [{ testFile: 'backend/tests/test_flow.py', runner: 'pytest', requirementIds: ['REQ-001'] }] }, manifest);
  assert(!checked.isValid); assert(checked.errors.some(e => e.includes('typed response'))); assert(checked.errors.some(e => e.includes('Admin endpoint')));
});
