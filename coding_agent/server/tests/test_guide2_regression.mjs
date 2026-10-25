import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { verifyResourceOwnershipAndIsolation } from '../apiAuthzValidator.js';
import { getRepairStrategy } from '../repairEngine.js';
import { getFoundationFiles } from '../foundationTemplates.js';

function withTempWorkspace(files, options, callback) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.guide2-test-'));
  try {
    writeWorkspaceAndScaffolds(root, files, options, callback);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('G2.1: Scaffolding conftest.py contains generic table creation without hardcoded Category/Product', () => {
  const files = [
    { path: 'backend/app/db/models.py', content: 'from app.db.database import Base\nfrom sqlalchemy import Column, Integer\nclass Task(Base):\n    __tablename__ = "tasks"\n    id = Column(Integer, primary_key=True)\n' }
  ];
  withTempWorkspace(files, {}, () => {});
  const conftest = files.find(f => f.path === 'backend/conftest.py');
  assert(conftest, 'conftest.py must be scaffolded');
  assert(!conftest.content.includes('Category'), 'conftest.py must not reference Category');
  assert(!conftest.content.includes('Product'), 'conftest.py must not reference Product');
  assert(conftest.content.includes('Base.metadata.create_all'), 'conftest.py must create tables from Base metadata');
});

test('G2.2: Scaffolding does not fabricate get_task -> create_task alias in tasks.py', () => {
  const files = [
    { path: 'backend/app/api/tasks.py', content: 'def create_task():\n    return {"status": "ok"}\n' }
  ];
  withTempWorkspace(files, {}, () => {});
  const tasks = files.find(f => f.path === 'backend/app/api/tasks.py');
  assert(!tasks.content.includes('get_task = create_task'), 'Must not fabricate get_task alias');
});

test('G2.3: app/models/__init__.py and app/db/__init__.py resolve cleanly without IMPORT_CLOSURE_FAILURE', async () => {
  const files = [
    { path: 'backend/app/db/database.py', content: 'from sqlalchemy.orm import declarative_base, sessionmaker\nfrom sqlalchemy import create_engine\nengine = create_engine("sqlite:///:memory:")\nSessionLocal = sessionmaker(bind=engine)\nBase = declarative_base()\ndef get_db():\n    yield\n' },
    { path: 'backend/app/db/models.py', content: 'from app.db.database import Base\nfrom sqlalchemy import Column, Integer\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True)\n' }
  ];
  withTempWorkspace(files, {}, () => {});
  const dbInit = files.find(f => f.path === 'backend/app/db/__init__.py');
  const modelsInit = files.find(f => f.path === 'backend/app/models/__init__.py');
  assert(dbInit && modelsInit, 'Both __init__.py files must be scaffolded');
  assert(!modelsInit.content.includes('from ..db import models'), 'Must not import non-existent models from ..db');
});

test('G2.4: frontend/tsconfig.json includes useUnknownInCatchVariables: false', () => {
  const files = [
    { path: 'frontend/src/App.tsx', content: 'export default function App() { return <div>App</div>; }' }
  ];
  withTempWorkspace(files, {}, () => {});
  const tsconfig = files.find(f => f.path === 'frontend/tsconfig.json');
  assert(tsconfig, 'tsconfig.json must be scaffolded');
  const parsed = JSON.parse(tsconfig.content);
  assert.strictEqual(parsed.compilerOptions.useUnknownInCatchVariables, false, 'useUnknownInCatchVariables must be false');
});

test('G2.5: apiAuthzValidator recognizes both current_user.id and current_user["id"] for resource scoping', () => {
  const files = [
    {
      path: 'backend/app/api/tasks.py',
      content: `from fastapi import APIRouter, Depends
router = APIRouter()

@router.get("/")
def list_tasks(current_user: dict = Depends(lambda: None), db = Depends(lambda: None)):
    return db.query(Task).filter(Task.user_id == current_user['id']).all()
`
    }
  ];
  const res = verifyResourceOwnershipAndIsolation(files);
  const ownershipLeak = res.defects.find(d => d.code === 'AUTHZ_OWNERSHIP_LEAK');
  assert(!ownershipLeak, 'Scoped query using current_user["id"] must not trigger AUTHZ_OWNERSHIP_LEAK');
});

test('G2.6: repairEngine has HARDCODED_SECRET_DEFAULT strategy and forbids insecure secret keys', () => {
  const secretStrategy = getRepairStrategy('HARDCODED_SECRET_DEFAULT');
  assert(secretStrategy, 'HARDCODED_SECRET_DEFAULT strategy must exist');
  assert(secretStrategy.forbidden.some(f => f.includes('your_secret_key')), 'Must explicitly forbid your_secret_key');

  const authStrategy = getRepairStrategy('HARDCODED_AUTH_TOKEN');
  assert(authStrategy, 'HARDCODED_AUTH_TOKEN strategy must exist');
  assert(authStrategy.instructions.some(i => i.includes('Never introduce insecure default secrets')), 'Must warn against fallback secrets');
});

test('G2.7: foundationTemplates getFoundationFiles defaults to generic non-ecommerce files', () => {
  const defaultFiles = getFoundationFiles();
  const hasCart = defaultFiles.some(f => f.path.includes('CartContext.tsx'));
  assert.strictEqual(hasCart, false, 'Default foundation files must not inject CartContext.tsx');

  const ecommerceFiles = getFoundationFiles('QuickCart');
  const hasCartEcommerce = ecommerceFiles.some(f => f.path.includes('CartContext.tsx'));
  assert.strictEqual(hasCartEcommerce, true, 'Ecommerce foundation files must include CartContext.tsx');
});

test('G2.8: repairEngine includes AUTH_TOKEN_UNVERIFIED and UNDECLARED_PACKAGE_IMPORT strategies', () => {
  const unverifiedStrategy = getRepairStrategy('AUTH_TOKEN_UNVERIFIED');
  assert(unverifiedStrategy, 'AUTH_TOKEN_UNVERIFIED strategy must exist');
  assert(unverifiedStrategy.instructions.some(i => i.includes('jose.jwt.decode')), 'Must guide towards real JWT decoding');

  const importStrategy = getRepairStrategy('UNDECLARED_PACKAGE_IMPORT');
  assert(importStrategy, 'UNDECLARED_PACKAGE_IMPORT strategy must exist');
});

test('G2.9: workspaceScaffolds repairs placeholder auth tokens and dummy unverified auth', () => {
  const files = [
    {
      path: 'backend/app/api/auth.py',
      content: 'from fastapi import APIRouter\nrouter = APIRouter()\ndef get_current_user():\n    return True\n@router.post("/login")\ndef login():\n    return {"access_token": "YOUR_ACCESS_TOKEN"}\n'
    }
  ];
  withTempWorkspace(files, {}, () => {});
  const auth = files.find(f => f.path === 'backend/app/api/auth.py');
  assert(!auth.content.includes('"YOUR_ACCESS_TOKEN"'), 'Placeholder YOUR_ACCESS_TOKEN must be replaced');
  assert(auth.content.includes('jwt.decode'), 'Canonical jwt.decode must be injected for dummy get_current_user');
});
