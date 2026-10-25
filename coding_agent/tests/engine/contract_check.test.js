import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { verifyContract } from '../../scripts/check_contract.mjs';
import { writeWorkspaceAndScaffolds } from '../../server/workspaceScaffolds.js';

test('Milestone 3: Contract verification detects doubled prefix, missing entrypoint and unresolved imports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-defect-test-'));
  try {
    const files = [
      {
        path: 'frontend/src/App.tsx',
        content: `
import React from 'react';
import { GhostPage } from './pages/GhostPage';
export default function App() { return <GhostPage />; }
`
      },
      {
        path: 'backend/app/api/products.py',
        content: `
from fastapi import APIRouter
router = APIRouter()
@router.get('/products/all')
def list_products():
    return []
`
      },
      {
        path: 'backend/main.py',
        content: `
from fastapi import FastAPI
app = FastAPI() # Duplicate instance!
`
      }
    ];

    writeWorkspaceAndScaffolds(tmpDir, files, { name: 'QuickCart' });
    const res = verifyContract(tmpDir);

    assert.equal(res.appImportsResolved, false, 'Unresolved App.tsx import must be flagged');
    assert.equal(res.noDoubledPrefixes, false, 'Doubled router prefix /products/all must be flagged');
    assert.equal(res.singleEntryPoint, false, 'Duplicate FastAPI instance in main.py must be flagged');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Milestone 3: Contract verification passes on clean contract-aligned workspace', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-clean-test-'));
  try {
    const files = [
      {
        path: 'frontend/src/pages/Catalog.tsx',
        content: `import React from 'react'; export const Catalog = () => <div>Catalog</div>;`
      },
      {
        path: 'frontend/src/App.tsx',
        content: `
import React from 'react';
import { Catalog } from './pages/Catalog';
export default function App() { return <Catalog />; }
`
      },
      {
        path: 'backend/app/api/products.py',
        content: `
from fastapi import APIRouter
router = APIRouter()
@router.get('/')
def list_products():
    return []
@router.get('/{product_id}')
def get_product(product_id: int):
    return {"id": product_id}
`
      }
    ];

    writeWorkspaceAndScaffolds(tmpDir, files, { name: 'QuickCart' });
    const res = verifyContract(tmpDir);

    assert.equal(res.appImportsResolved, true, 'Clean App.tsx imports must resolve');
    assert.equal(res.noDoubledPrefixes, true, 'Clean router paths must pass prefix check');
    assert.equal(res.singleEntryPoint, true, 'Single entrypoint must pass');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
