import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { writeWorkspaceAndScaffolds } from '../../server/workspaceScaffolds.js';
import { validateFrontendContract } from '../../server/frontendContractValidator.js';

test('Milestone 1: Deterministic foundation scaffolds write complete working core files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-test-'));
  try {
    const files = [];
    writeWorkspaceAndScaffolds(tmpDir, files, { name: 'QuickCart' });

    const expectedPaths = [
      'backend/app/core/config.py',
      'backend/app/db/database.py',
      'backend/app/core/security.py',
      'backend/app/api/deps.py',
      'backend/app/core/errors.py',
      'backend/app/main.py',
      'backend/main.py',
      'frontend/package.json',
      'frontend/vite.config.ts',
      'frontend/tsconfig.json',
      'frontend/index.html',
      'frontend/src/main.tsx',
      'frontend/src/api/client.ts',
      'frontend/src/context/AuthContext.tsx',
      'frontend/src/context/CartContext.tsx',
      'frontend/src/components/ProtectedRoute.tsx'
    ];

    for (const p of expectedPaths) {
      const full = path.join(tmpDir, p);
      assert.ok(fs.existsSync(full), `Expected foundation file ${p} must exist`);
      const stat = fs.statSync(full);
      assert.ok(stat.size > 50, `Foundation file ${p} must not be empty`);
    }

    // Verify config.py raises outside test mode if SECRET_KEY is missing
    const configContent = fs.readFileSync(path.join(tmpDir, 'backend/app/core/config.py'), 'utf8');
    assert.match(configContent, /FATAL: SECRET_KEY/);

    // Verify deps.py enforces real 401 and 403 status codes
    const depsContent = fs.readFileSync(path.join(tmpDir, 'backend/app/api/deps.py'), 'utf8');
    assert.match(depsContent, /status\.HTTP_401_UNAUTHORIZED/);
    assert.match(depsContent, /status\.HTTP_403_FORBIDDEN/);

    // Verify API client has baseURL and auth interceptor
    const clientContent = fs.readFileSync(path.join(tmpDir, 'frontend/src/api/client.ts'), 'utf8');
    assert.match(clientContent, /baseURL:\s*['"]\/api['"]/);
    assert.match(clientContent, /Authorization = `Bearer \${token}`/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Milestone 1: Foundation auth contract returns 401 for unauth and 403 for customer on admin route', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-contract-test-'));
  try {
    const files = [];
    writeWorkspaceAndScaffolds(tmpDir, files, { name: 'QuickCart' });

    // Create a mini-test runner Python script using FastAPI TestClient
    const testScript = `
import os
import sys
import asyncio
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "super-secret-key-for-test-suite-0000"

from fastapi import FastAPI, Depends
from httpx import ASGITransport, AsyncClient
from app.api.deps import get_current_user, require_admin
from app.core.security import create_access_token

app = FastAPI()

@app.get("/api/protected")
def protected_route(current_user = Depends(get_current_user)):
    return {"message": "hello", "user": current_user}

@app.get("/api/admin/only")
def admin_route(admin_user = Depends(require_admin)):
    return {"message": "admin granted"}

async def run_tests():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. No token -> 401
        res_no_token = await client.get("/api/protected")
        assert res_no_token.status_code == 401, f"Expected 401, got {res_no_token.status_code}"

        # 2. Customer token -> 200 on protected, 403 on admin
        cust_token = create_access_token({"sub": "42", "email": "cust@example.com", "role": "customer"})
        headers = {"Authorization": f"Bearer {cust_token}"}

        res_cust = await client.get("/api/protected", headers=headers)
        assert res_cust.status_code == 200, f"Expected 200, got {res_cust.status_code}"
        assert res_cust.json()["user"]["id"] == 42
        assert res_cust.json()["user"]["role"] == "customer"

        res_admin_blocked = await client.get("/api/admin/only", headers=headers)
        assert res_admin_blocked.status_code == 403, f"Expected 403 for customer on admin route, got {res_admin_blocked.status_code}"

        # 3. Admin token -> 200 on admin route
        admin_token = create_access_token({"sub": "1", "email": "admin@example.com", "role": "admin"})
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        res_admin_ok = await client.get("/api/admin/only", headers=admin_headers)
        assert res_admin_ok.status_code == 200, f"Expected 200 for admin, got {res_admin_ok.status_code}"

    print("ALL_AUTH_CHECKS_PASSED")

asyncio.run(run_tests())
`;
    const backendDir = path.join(tmpDir, 'backend');
    fs.writeFileSync(path.join(backendDir, 'test_runner.py'), testScript, 'utf8');

    // Find a usable Python executable. A virtualenv can exist while its base
    // interpreter has been removed or moved, so existence alone is not enough.
    const candidates = process.platform === 'win32'
      ? [path.join(process.cwd(), '.venv-ide', 'Scripts', 'python.exe'), 'python']
      : [path.join(process.cwd(), '.venv-ide', 'bin', 'python'), 'python3', 'python'];
    let pythonBin;
    for (const candidate of candidates) {
      try {
        if (candidate !== 'python' && candidate !== 'python3' && !fs.existsSync(candidate)) continue;
        execSync(`"${candidate}" --version`, { stdio: 'ignore' });
        pythonBin = candidate;
        break;
      } catch {
        // Try the next interpreter candidate.
      }
    }
    if (!pythonBin) {
      t.skip('No usable Python interpreter is installed; auth contract is not executable in this environment');
      return;
    }

    const out = execSync(`"${pythonBin}" test_runner.py`, {
      cwd: backendDir,
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: backendDir }
    });
    assert.match(out, /ALL_AUTH_CHECKS_PASSED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Milestone 2: Stack allowlist rejects prohibited package imports and passes allowlisted dependencies', async () => {
  // Test 1: Prohibited packages (@mui/material, lucide-react) must trigger UNDECLARED_PACKAGE_IMPORT
  const badFiles = [
    {
      path: 'frontend/package.json',
      content: JSON.stringify({ dependencies: { 'react': '^18.2.0' } })
    },
    {
      path: 'frontend/src/pages/BadPage.tsx',
      content: `
import React from 'react';
import { Button } from '@mui/material';
import { ShoppingCart } from 'lucide-react';
export const BadPage = () => <Button><ShoppingCart /></Button>;
`
    }
  ];

  const badRes = await validateFrontendContract(badFiles);
  const muiDefect = badRes.defects.find(d => d.package === '@mui/material');
  assert.ok(muiDefect, 'Importing @mui/material must trigger defect');
  assert.equal(muiDefect.code, 'UNDECLARED_PACKAGE_IMPORT');
  assert.match(muiDefect.hint, /replace with plain React\/CSS/);

  const lucideDefect = badRes.defects.find(d => d.package === 'lucide-react');
  assert.ok(lucideDefect, 'Importing lucide-react outside allowlist must trigger defect');
  assert.equal(lucideDefect.code, 'UNDECLARED_PACKAGE_IMPORT');

  // Test 2: Clean allowlisted file must produce 0 UNDECLARED_PACKAGE_IMPORT defects
  const goodFiles = [
    {
      path: 'frontend/package.json',
      content: JSON.stringify({
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
          'react-router-dom': '^6.22.3',
          'axios': '^1.6.8'
        }
      })
    },
    {
      path: 'frontend/src/pages/GoodPage.tsx',
      content: `
import React from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
export const GoodPage = () => <Link to="/catalog">Catalog</Link>;
`
    }
  ];

  const goodRes = await validateFrontendContract(goodFiles);
  const undeclared = goodRes.defects.filter(d => d.code === 'UNDECLARED_PACKAGE_IMPORT');
  assert.equal(undeclared.length, 0, 'Allowlisted packages must produce zero undeclared package defects');
});
