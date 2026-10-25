import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyTokenValidationAndClaims,
  verifyResourceOwnershipAndIsolation
} from '../../server/apiAuthzValidator.js';
import {
  verifyApiRegistration,
  verifyCoreBackendFiles,
  validateBackendRuntime
} from '../../server/backendRuntimeValidator.js';
import {
  detectStaticPythonDefects
} from '../../server/projectContractValidator.js';
import {
  validateComponentImportsAndCasing,
  validateFrontendDependencies,
  verifyCoreFrontendFiles
} from '../../server/frontendContractValidator.js';

test('Rule 1: Schema-model parity & wildcard schema import detection', () => {
  // Fail fixture: wildcard schema import + extra='allow'
  const failDefects = [];
  detectStaticPythonDefects(
    [
      {
        path: 'backend/app/api/products.py',
        content: `from app.schemas import *\n`
      },
      {
        path: 'backend/app/schemas/product.py',
        content: `from pydantic import BaseModel, ConfigDict\nfrom typing import Optional, Any\nclass ProductCreate(BaseModel):\n    model_config = ConfigDict(extra='allow')\n    field: Optional[Any] = None\n`
      }
    ],
    (code, file, msg, line, hint) => failDefects.push({ code, file, msg, line, hint })
  );
  assert.ok(failDefects.some(d => d.code === 'WILDCARD_SCHEMA_MODEL'), 'Detects wildcard schema import and extra=allow');

  // Pass fixture: strictly typed schema exported and imported by exact name
  const passDefects = [];
  detectStaticPythonDefects(
    [
      {
        path: 'backend/app/api/products.py',
        content: `from app.schemas.product import ProductCreate\n`
      },
      {
        path: 'backend/app/schemas/product.py',
        content: `from pydantic import BaseModel, ConfigDict\nfrom typing import Optional\nclass ProductCreate(BaseModel):\n    model_config = ConfigDict(extra='forbid')\n    name: Optional[str] = None\n`
      }
    ],
    (code, file, msg, line, hint) => passDefects.push({ code, file, msg, line, hint })
  );
  assert.equal(passDefects.length, 0, 'Clean typed schema passes with zero defects');
});

test('Rule 2: Auth token check: rejects unverified tokens and verify=False', () => {
  // Fail fixture: get_current_user returns static dict or decodes with verify=False
  const failFiles = [{
    path: 'backend/app/api/auth.py',
    content: `
import jwt
def get_current_user():
    return {"id": 1, "role": "admin"}

def inspect_token(token):
    return jwt.decode(token, verify=False)
`
  }];
  const failRes = verifyTokenValidationAndClaims(failFiles);
  assert.ok(failRes.defects.length > 0, 'Detects unverified token decode');
  assert.ok(failRes.defects.some(d => d.code === 'AUTH_TOKEN_UNVERIFIED'), 'Flags AUTH_TOKEN_UNVERIFIED');

  // Pass fixture: verified jwt decode with claims
  const passFiles = [{
    path: 'backend/app/api/auth.py',
    content: `
from jose import jwt
def create_access_token(data):
    return jwt.encode(data, "SECRET", algorithm="HS256")

def get_current_user(credentials):
    token = credentials.credentials
    payload = jwt.decode(token, "SECRET", algorithms=["HS256"])
    user_id = payload.get("sub")
    exp = payload.get("exp")
    return {"id": user_id, "role": payload.get("role", "customer")}
`
  }];
  const passRes = verifyTokenValidationAndClaims(passFiles);
  assert.equal(passRes.defects.length, 0, 'Verified JWT implementation passes without token defects');
});

test('Rule 3: Secret source: rejects hardcoded fallback secrets', () => {
  // Fail fixture: hardcoded fallback secret
  const failDefects = [];
  detectStaticPythonDefects(
    [{
      path: 'backend/app/core/config.py',
      content: `import os\nSECRET_KEY = os.getenv("SECRET_KEY", "supersecret")\n`
    }],
    (code, file, msg, line, hint) => failDefects.push({ code, file, msg, line, hint })
  );
  assert.ok(failDefects.some(d => d.code === 'HARDCODED_SECRET_DEFAULT'), 'Detects hardcoded fallback secret');

  // Pass fixture: env-only secret lookup
  const passDefects = [];
  detectStaticPythonDefects(
    [{
      path: 'backend/app/core/config.py',
      content: `import os\nSECRET_KEY = os.environ.get("SECRET_KEY")\n`
    }],
    (code, file, msg, line, hint) => passDefects.push({ code, file, msg, line, hint })
  );
  assert.ok(!passDefects.some(d => d.code === 'HARDCODED_SECRET_DEFAULT'), 'Env-only secret lookup passes');
});

test('Rule 4: Doubled router prefix: inspects route decorators for repeated prefix', () => {
  // Fail fixture: route decorator repeats mount prefix /api/products
  const failFiles = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\nfrom app.api.products import router as products_router\napp = FastAPI()\napp.include_router(products_router, prefix="/api/products")\n`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("/api/products")\ndef list_products():\n    return []\n`
    }
  ];
  const failRes = verifyApiRegistration(failFiles);
  assert.ok(failRes.defects.some(d => d.code === 'DOUBLED_ROUTER_PREFIX'), 'Detects doubled router prefix in decorator');

  // Pass fixture: relative path only
  const passFiles = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\nfrom app.api.products import router as products_router\napp = FastAPI()\napp.include_router(products_router, prefix="/api/products")\n`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("")\ndef list_products():\n    return []\n`
    }
  ];
  const passRes = verifyApiRegistration(passFiles);
  assert.equal(passRes.defects.length, 0, 'Relative route decorator passes without defects');
});

test('Rule 5: Single entrypoint: rejects multiple FastAPI instances and swallowed ImportError', () => {
  // Fail fixture: multiple FastAPI instantiations + swallowed ImportError
  const failDefects = [];
  detectStaticPythonDefects(
    [
      {
        path: 'backend/main.py',
        content: `from fastapi import FastAPI\napp = FastAPI()\n`
      },
      {
        path: 'backend/app/main.py',
        content: `from fastapi import FastAPI\ntry:\n    from app.api import router\nexcept ImportError:\n    pass\napp = FastAPI()\n`
      }
    ],
    (code, file, msg, line, hint) => failDefects.push({ code, file, msg, line, hint })
  );
  assert.ok(failDefects.some(d => d.code === 'MULTIPLE_FASTAPI_ENTRYPOINTS'), 'Detects multiple FastAPI instances');
  assert.ok(failDefects.some(d => d.code === 'IMPORT_ERROR_SWALLOWED'), 'Detects swallowed ImportError');

  // Pass fixture: single canonical app in backend/app/main.py
  const passDefects = [];
  detectStaticPythonDefects(
    [
      {
        path: 'backend/app/main.py',
        content: `from fastapi import FastAPI\napp = FastAPI()\n`
      }
    ],
    (code, file, msg, line, hint) => passDefects.push({ code, file, msg, line, hint })
  );
  assert.ok(!passDefects.some(d => d.code === 'MULTIPLE_FASTAPI_ENTRYPOINTS' || d.code === 'IMPORT_ERROR_SWALLOWED'));
});

test('Rule 6: Frontend import resolution & undeclared package imports', () => {
  // Fail fixture: missing local file and undeclared npm package
  const failFiles = [
    {
      path: 'frontend/package.json',
      content: JSON.stringify({ dependencies: { react: '^18.0.0' } })
    },
    {
      path: 'frontend/src/pages/LoginPage.tsx',
      content: `import React from 'react';\nimport { LoginForm } from '../components/LoginForm';\nimport { toast } from 'react-hot-toast';\n`
    }
  ];
  const localRes = validateComponentImportsAndCasing(failFiles);
  assert.ok(localRes.defects.some(d => d.code === 'MISSING_FRONTEND_IMPORT'), 'Flags missing local component');

  const depRes = validateFrontendDependencies(failFiles);
  assert.ok(depRes.defects.some(d => d.code === 'UNDECLARED_PACKAGE_IMPORT'), 'Flags undeclared package');

  // Pass fixture: declared package and existing local file
  const passFiles = [
    {
      path: 'frontend/package.json',
      content: JSON.stringify({ dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } })
    },
    {
      path: 'frontend/src/components/LoginForm.tsx',
      content: `export function LoginForm() { return <form></form>; }\n`
    },
    {
      path: 'frontend/src/pages/LoginPage.tsx',
      content: `import React from 'react';\nimport { LoginForm } from '../components/LoginForm';\n`
    }
  ];
  const passLocal = validateComponentImportsAndCasing(passFiles);
  assert.equal(passLocal.defects.length, 0, 'Valid local import passes');
  const passDep = validateFrontendDependencies(passFiles);
  assert.equal(passDep.defects.length, 0, 'Declared dependencies pass');
});

test('Rule 7: Authz ownership check: rejects unscoped user queries', () => {
  // Fail fixture: .all() query without user scoping
  const failFiles = [{
    path: 'backend/app/api/orders.py',
    content: `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
router = APIRouter()
@router.get("/orders")
def list_orders(user = Depends(get_current_user)):
    return db.query(Order).all()
`
  }];
  const failRes = verifyResourceOwnershipAndIsolation(failFiles);
  assert.ok(failRes.defects.some(d => d.code === 'AUTHZ_OWNERSHIP_LEAK'), 'Flags ownership leak on global list');

  // Pass fixture: scoped query by current_user.id
  const passFiles = [{
    path: 'backend/app/api/orders.py',
    content: `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
router = APIRouter()
@router.get("/orders")
def list_orders(user = Depends(get_current_user)):
    return db.query(Order).filter(Order.user_id == user["id"]).all()
`
  }];
  const passRes = verifyResourceOwnershipAndIsolation(passFiles);
  assert.equal(passRes.defects.length, 0, 'Scoped query passes');
});

test('Rule 8: Missing core project files: requires essential frontend and backend files', () => {
  // Fail fixture: missing core files
  const failFrontendFiles = [{ path: 'frontend/src/App.tsx', content: 'export default function App() {}' }];
  const failFeRes = verifyCoreFrontendFiles(failFrontendFiles);
  assert.ok(failFeRes.defects.some(d => d.code === 'MISSING_CORE_PROJECT_FILE'), 'Flags missing core frontend files');

  const failBackendFiles = [{ path: 'backend/app/utils.py', content: 'def util(): pass' }];
  const failBeRes = verifyCoreBackendFiles(failBackendFiles);
  assert.ok(failBeRes.defects.some(d => d.code === 'MISSING_CORE_PROJECT_FILE'), 'Flags missing core backend files');

  // Pass fixture: all core files present
  const passFrontendFiles = [
    { path: 'frontend/package.json', content: '{}' },
    { path: 'frontend/index.html', content: '<html></html>' },
    { path: 'frontend/src/main.tsx', content: 'console.log("main")' },
    { path: 'frontend/vite.config.ts', content: 'export default {}' },
    { path: 'frontend/tsconfig.json', content: '{}' },
    { path: 'frontend/src/pages/LoginPage.tsx', content: 'export function LoginPage() {}' },
    { path: 'frontend/src/pages/RegisterPage.tsx', content: 'export function RegisterPage() {}' },
    { path: 'frontend/src/pages/AdminPage.tsx', content: 'export function AdminPage() {}' }
  ];
  const passFeRes = verifyCoreFrontendFiles(passFrontendFiles);
  assert.equal(passFeRes.defects.length, 0, 'Complete core frontend passes');

  const passBackendFiles = [
    { path: 'backend/requirements.txt', content: 'fastapi\n' },
    { path: 'backend/app/main.py', content: 'app = FastAPI()\n' },
    { path: 'backend/app/models/__init__.py', content: '' },
    { path: 'backend/app/schemas/__init__.py', content: '' },
    { path: 'backend/app/api/__init__.py', content: '' }
  ];
  const passBeRes = verifyCoreBackendFiles(passBackendFiles);
  assert.equal(passBeRes.defects.length, 0, 'Complete core backend passes');
});

test('Rule 9: Verification non-vacuousness: fails closed when execution was skipped', async () => {
  // Fail fixture: live execution required but not executed
  const failRes = await validateBackendRuntime(
    [
      { path: 'backend/requirements.txt', content: 'fastapi\n' },
      { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
      { path: 'backend/app/models/m.py', content: '' },
      { path: 'backend/app/schemas/s.py', content: '' },
      { path: 'backend/app/api/a.py', content: '' }
    ],
    { requireLiveExecution: true, mockLLM: false }
  );
  assert.equal(failRes.isValid, false, 'Fails closed when execution is skipped');
  assert.ok(failRes.defects.some(d => d.code === 'EXECUTION_NON_VACUOUSNESS_FAILURE'), 'Flags EXECUTION_NON_VACUOUSNESS_FAILURE');

  // Pass fixture: execution not required or mock mode
  const passRes = await validateBackendRuntime(
    [
      { path: 'backend/requirements.txt', content: 'fastapi\n' },
      { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
      { path: 'backend/app/models/m.py', content: '' },
      { path: 'backend/app/schemas/s.py', content: '' },
      { path: 'backend/app/api/a.py', content: '' }
    ],
    { requireLiveExecution: false, mockLLM: true }
  );
  assert.ok(!passRes.defects.some(d => d.code === 'EXECUTION_NON_VACUOUSNESS_FAILURE'), 'No non-vacuousness defect when execution satisfied');
});

test('Rule 10: Defect format: each defect MUST emit { code, file, line, hint }', () => {
  const feRes = verifyCoreFrontendFiles([]);
  assert.ok(feRes.defects.length > 0);
  for (const defect of feRes.defects) {
    assert.ok(defect.code, 'Defect must have code');
    assert.ok(defect.file, 'Defect must have file');
    assert.ok(typeof defect.line === 'number' && defect.line >= 1, `Defect must have positive line: ${defect.line}`);
    assert.ok(typeof defect.hint === 'string' && defect.hint.length > 0, 'Defect must have hint string');
  }

  const beRes = verifyCoreBackendFiles([]);
  assert.ok(beRes.defects.length > 0);
  for (const defect of beRes.defects) {
    assert.ok(defect.code, 'Defect must have code');
    assert.ok(defect.file, 'Defect must have file');
    assert.ok(typeof defect.line === 'number' && defect.line >= 1, `Defect must have positive line: ${defect.line}`);
    assert.ok(typeof defect.hint === 'string' && defect.hint.length > 0, 'Defect must have hint string');
  }
});
