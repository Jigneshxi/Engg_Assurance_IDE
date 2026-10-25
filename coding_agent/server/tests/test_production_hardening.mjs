import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { validateProjectContracts } from '../projectContractValidator.js';
import { createArtifactSnapshot } from '../projectArtifacts.js';
import { repairProjectContracts, validateIntegrationContract } from '../integrationContract.js';
import { validateWorkflowExecution, parseWorkflowReport, testEnvironment } from '../workflowValidator.js';
import { validatePrdCoverage } from '../prdCoverageValidator.js';
import { evaluateFinalCompletionGate } from '../orchestrator.js';
import { normalizeDatabaseLayerFiles } from '../dbValidator.js';

const file = (path, content) => ({ path, content, status: 'validated' });
const base = [file('README.md', 'Setup'), file('backend/requirements.txt', 'fastapi\npydantic'), file('frontend/package.json', '{}'), file('frontend/index.html', '<div id="root"></div>')];
const api = [
  file('backend/main.py', 'from fastapi import FastAPI\nfrom app.api.orders import router\napp = FastAPI()\napp.include_router(router, prefix="/api")'),
  file('backend/app/api/orders.py', 'from fastapi import APIRouter\nfrom app.schemas.order import OrderCreate\nrouter = APIRouter(prefix="/orders")\n@router.post("")\ndef create_order(order: OrderCreate):\n    return order.model_dump()'),
  file('backend/app/schemas/order.py', 'from pydantic import BaseModel, Field\nclass OrderCreate(BaseModel):\n    shipping_address: str = Field(...)\n    items: list = Field(...)'),
  file('frontend/src/Checkout.tsx', 'fetch("/api/orders", {method: "POST", body: JSON.stringify({shipping_address: "Test", items: []})})')
];

test('matching composed routes and schema fields pass without importing Python', async () => {
  const result = await validateProjectContracts([...base, ...api]);
  assert.deepEqual(result.defects, []);
  assert.equal(result.routes[0].path, '/api/orders');
});

test('detects double prefixes and checkout request mismatch', async () => {
  const broken = api.map(f => f.path.endsWith('Checkout.tsx') ? file(f.path, 'fetch("/api/orders", {method: "POST", body: JSON.stringify({address_id: 1})})') : f);
  const result = await validateProjectContracts([...base, ...broken]);
  assert(result.defects.some(d => d.code === 'API_REQUEST_MISMATCH'));
  const duplicatePrefix = api.map(f => f.path.endsWith('orders.py') ? file(f.path, f.content.replace('@router.post("")', '@router.post("/orders")')) : f);
  assert((await validateProjectContracts([...base, ...duplicatePrefix])).defects.some(d => d.code === 'API_ROUTE_MISMATCH'));
});

test('detects duplicate classes, missing auth export, and overwritten schema fields', async () => {
  const files = [...base,
    file('backend/app/schemas/product.py', 'from pydantic import BaseModel\nclass ProductCreate(BaseModel):\n    sku: str\nclass ProductCreate(BaseModel):\n    category: str'),
    file('backend/app/api/auth.py', 'def login():\n    pass'),
    file('backend/app/api/products.py', 'from app.schemas.product import ProductCreate\nfrom app.api.auth import get_current_user\ndef create_product(product: ProductCreate):\n    return product.sku')];
  const codes = (await validateProjectContracts(files)).defects.map(d => d.code);
  for (const code of ['DUPLICATE_DEFINITION', 'MISSING_PYTHON_SYMBOL', 'SCHEMA_FIELD_MISMATCH']) assert(codes.includes(code), code);
});

test('Python syntax errors and unavailable toolchains fail validation', async () => {
  assert((await validateProjectContracts([...base, file('backend/broken.py', 'def foo():\nx = 1')])).defects.some(d => d.code === 'PYTHON_SYNTAX_ERROR'));
  assert.equal((await validateProjectContracts([...base, ...api], { python: '/missing/python' })).isValid, false);
});

test('checks declared response fields and invalid queried model attributes', async () => {
  const files = [...base,
    file('backend/app/db/models.py', 'class OrderItem:\n    id = 1\n    quantity = 1'),
    file('backend/main.py', 'from fastapi import FastAPI\nfrom app.api.orders import router\napp = FastAPI()\napp.include_router(router, prefix="/api")'),
    file('backend/app/api/orders.py', 'from fastapi import APIRouter\nfrom app.db.models import OrderItem\nrouter = APIRouter()\n@router.post("/orders")\ndef create_order(db):\n    product = db.query(OrderItem).first()\n    return {"id": product.id, "stock": product.stock_quantity}')];
  const result = await validateProjectContracts(files, { integrationContract: { endpoints: [{ method: 'POST', path: '/api/orders', responseFields: ['id', 'total_amount'] }] } });
  assert(result.defects.some(d => d.code === 'API_RESPONSE_MISMATCH'));
  assert(result.defects.some(d => d.code === 'SCHEMA_FIELD_MISMATCH' && d.message.includes('stock_quantity')));
});

test('repairs invalidate old status, stop on success, and reject unplanned files', async () => {
  const files = [file('app.js', 'broken')];
  const validate = async list => ({ isValid: list[0].content === 'fixed', defects: [{ file: 'app.js', message: 'Broken contract' }] });
  let calls = 0;
  assert.equal((await repairProjectContracts(files, { validate, caller: async () => { calls++; return '{"files":[{"path":"app.js","content":"fixed"}]}'; } })).isValid, true);
  assert.equal(calls, 1);
  assert.equal(files[0].status, 'pending');
  const broken = [file('app.js', 'broken')];
  await repairProjectContracts(broken, { validate, caller: async () => '{"files":[{"path":"../escape.js","content":"x"}]}' });
  assert.equal(broken[0].content, 'broken');
  assert.equal(broken.length, 1);
});

test('shared contract rejects invented files, IDs, and missing suites', () => {
  const manifest = { modules: [{ required_files: [file('backend/api.py', ''), file('backend/tests/test_flow.py', '')] }], requirements: [{ id: 'REQ-001' }] };
  assert.equal(validateIntegrationContract({ endpoints: [], workflows: [] }, manifest).isValid, false);
  assert.equal(validateIntegrationContract({ endpoints: [], workflows: [{ testFile: 'backend/tests/test_flow.py', runner: 'pytest', requirementIds: ['REQ-001'] }] }, manifest).isValid, true);
  assert.equal(validateIntegrationContract({ endpoints: [], workflows: [{ testFile: 'unknown.py', runner: 'pytest', requirementIds: ['REQ-FAKE'] }] }, manifest).isValid, false);
});

test('workflow reports reject zero, skipped, failed and flaky tests', () => {
  assert.equal(parseWorkflowReport('pytest', '<testsuite/>').passed, false);
  assert.equal(parseWorkflowReport('pytest', '<testcase name="REQ_001"><skipped/></testcase>').passed, false);
  assert.equal(parseWorkflowReport('pytest', '<testcase name="REQ_001"><failure/></testcase>').passed, false);
  assert.equal(parseWorkflowReport('pytest', '<testcase name="test_REQ_001"/>').passed, true);
  assert.equal(parseWorkflowReport('playwright', JSON.stringify({ stats: { expected: 1, unexpected: 0, flaky: 1, skipped: 0 } })).passed, false);
});

test('workflow execution requires real report and named requirement evidence', async () => {
  const files = [file('backend/tests/test_flow.py', 'def test_REQ_001():\n    assert 1 == 1')];
  const contract = { workflows: [{ testFile: files[0].path, runner: 'pytest', requirementIds: ['REQ-001'] }] };
  const result = await validateWorkflowExecution(files, contract, { execute: async (_, args, { env }) => {
    assert(env.DATABASE_URL.startsWith('sqlite:///'));
    assert.equal(env.OPENAI_API_KEY, undefined);
    fs.writeFileSync(args.find(a => a.startsWith('--junitxml=')).slice('--junitxml='.length), '<testsuite><testcase name="test_REQ_001"/></testsuite>');
    return { code: 0 };
  } });
  assert.equal(result.isValid, true);
  assert.equal(result.suites[0].artifactHash, createArtifactSnapshot(files).hash);
  const noEvidence = await validateWorkflowExecution(files, contract, { execute: async () => ({ code: 0 }) });
  assert.equal(noEvidence.isValid, false);
  assert.equal((await validateWorkflowExecution(files, null)).isValid, false);
  assert.equal(testEnvironment('/tmp/mock').GOOGLE_API_KEY, undefined);
});

test('workflow suites cannot reuse old reports or neighboring requirement IDs', async () => {
  const files = [file('backend/tests/test_flow.py', 'def test_REQ_001():\n    assert True')];
  const suite = { testFile: files[0].path, runner: 'pytest', requirementIds: ['REQ-001'] };
  let calls = 0;
  const stale = await validateWorkflowExecution(files, { workflows: [suite, suite] }, { execute: async (_, args) => {
    if (++calls === 1) fs.writeFileSync(args.find(a => a.startsWith('--junitxml=')).slice('--junitxml='.length), '<testcase name="test_REQ_001"/>');
    return { code: 0 };
  } });
  assert.equal(stale.isValid, false);
  const wrongId = await validateWorkflowExecution(files, { workflows: [suite] }, { execute: async (_, args) => {
    fs.writeFileSync(args.find(a => a.startsWith('--junitxml=')).slice('--junitxml='.length), '<testcase name="test_REQ_0010"/>');
    return { code: 0 };
  } });
  assert.equal(wrongId.isValid, false);
});

test('strict coverage rejects file-only and stale runtime evidence', async () => {
  const context = { requirementContract: { requirements: [{ id: 'REQ-001', description: 'Create orders', type: 'backend' }] }, generatedFiles: [file('backend/orders.py', 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/orders")\ndef create_orders():\n    return {"id": 1}')], runtimeEvidence: { isValid: true, artifactHash: 'old', suites: [{ passed: true, testCount: 1, requirementIds: ['REQ-001'], artifactHash: 'old' }] } };
  const result = await validatePrdCoverage(context, { requireRuntimeEvidence: true, artifactHash: 'current' });
  assert.equal(result.isValid, false);
  assert(result.defects.some(d => d.code === 'PRD_RUNTIME_EVIDENCE_MISSING'));
  assert.equal((await validatePrdCoverage({})).isValid, false);
});

test('export hashes agree in browser/server; edits invalidate verification', async () => {
  const source = fs.readFileSync(new URL('../../apps/ide-frontend/src/projectArtifacts.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, crypto: crypto.webcrypto, TextEncoder });
  const files = [file('README.md', 'Original setup documentation'), file('app.js', 'const a = 1;'), file('.env', 'PLACEHOLDER_ONLY')];
  const snapshot = createArtifactSnapshot(files);
  assert.equal(snapshot.files.length, 2);
  assert.equal(snapshot.files.find(f => f.path === 'README.md').content, 'Original setup documentation');
  assert.equal(await exports.exportArtifactHash(files), snapshot.hash);
  assert.notEqual(await exports.exportArtifactHash([file('app.js', 'changed')]), snapshot.hash);
  assert.throws(() => createArtifactSnapshot([file('../escape.js', 'x')]));
});

test('unexecuted checks never default to passing', () => {
  const result = evaluateFinalCompletionGate({ allModulesPassed: true, semanticValid: true, fileCompletenessPassed: true, importClosurePassed: true, frontendContractPassed: true, backendRuntimePassed: true, apiAuthzPassed: true, prdCoveragePassed: true });
  for (const gate of ['browserE2e', 'security', 'syntax', 'generationBoundary']) assert(result.failedGates.includes(gate));
});

test('normalizes server_default datetime expressions and injects missing relationship foreign keys', () => {
  const models = file('backend/app/db/models.py', `from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from app.db.database import Base

class Order(Base):
    __tablename__ = 'orders'
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, nullable=False)
    created_date = Column(DateTime, server_default=datetime.utcnow())
    customer = relationship("Customer", back_populates="orders")

class Customer(Base):
    __tablename__ = 'customers'
    id = Column(Integer, primary_key=True)
    orders = relationship("Order", back_populates="customer")

class Category(Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True)
    parent_category_id = Column(Integer, ForeignKey('categories.id'))
    parent = relationship("Category", back_populates="children", remote_only=True)
    children = relationship("Category", back_populates="parent")
`);

  const script = file('backend/app/db/migrations/script.py', `import sqlalchemy as sa
def upgrade():
    sa.Column('created_date', sa.DateTime, server_default=datetime.utcnow())
`);

  const files = [models, script];
  normalizeDatabaseLayerFiles(files, { modules: [] });

  assert(!models.content.includes('server_default=datetime.utcnow()'), 'server_default datetime should be normalized');
  assert(models.content.includes('default=datetime.utcnow'), 'should convert to default=datetime.utcnow');
  assert(models.content.includes('from datetime import datetime'), 'should ensure datetime import');
  assert(models.content.includes("ForeignKey('customers.id')"), 'should inject missing ForeignKey on relationship column');
  assert(!models.content.includes('remote_only'), 'should strip invalid remote_only argument');
  assert(models.content.includes('parent = relationship("Category", back_populates="children", remote_side=[id])'), 'should auto-inject remote_side=[id] on self-referential parent');
  assert(!models.content.includes('children = relationship("Category", back_populates="parent", remote_side='), 'should not add remote_side on collection children');
  assert(script.content.includes('server_default=sa.func.now()'), 'migration script should normalize to sa.func.now()');
});

test('safe syntax/import repairs preserve placeholder endpoint failures', async () => {
  const brokenApi = file('backend/app/api/products.py', `from app.db.database import get_db
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models.products import Product
router = APIRouter()
@router.get("", response_model=list)
def read_products(
    db: Session = Depends(get_db)
    skip: int = 0
):
    return []
`);
  const main = file('backend/main.py', `from fastapi import FastAPI
from app.api.products import router as products_router
app = FastAPI()
app.include_router(products_router, prefix="/api/products")
`);
  const models = file('backend/app/db/models.py', `class Product:\n    pass\n`);
  const db = file('backend/app/db/database.py', `def get_db():\n    pass\n`);
  const readme = file('README.md', '# Documentation');
  const reqs = file('backend/requirements.txt', 'fastapi\nuvicorn\n');

  const files = [brokenApi, main, models, db, readme, reqs];
  const result = await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 2
  });

  assert.equal(result.isValid, false);
  assert(result.defects.some(d => d.code === 'STUB_ENDPOINT'), 'constant endpoints must remain blocked after syntax/import repair');
  assert(result.defects.some(d => d.code === 'MISSING_PYTHON_MODULE'), 'unresolved business imports must remain visible for contract-based repair');
  assert(!brokenApi.content.includes('from app.db.models import Product'), 'syntax repair must not fabricate business imports');
  assert(brokenApi.content.includes('db: Session = Depends(get_db),'));
});


