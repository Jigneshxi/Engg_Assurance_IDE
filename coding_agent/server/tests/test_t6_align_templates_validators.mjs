import assert from 'node:assert';
import test from 'node:test';
import { detectStaticPythonDefects } from '../projectContractValidator.js';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { spawnSync } from 'node:child_process';
import { resolveSharedPython } from '../pythonEnvironment.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('T6.1: detectStaticPythonDefects does NOT flag standard dict methods on dict current_user', () => {
  const files = [
    {
      path: 'backend/app/api/auth.py',
      content: `
def get_current_user():
    return {"id": 1, "email": "test@example.com", "role": "admin"}
`
    },
    {
      path: 'backend/app/api/tasks.py',
      content: `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user

router = APIRouter()

@router.get("/tasks")
def list_tasks(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("id")
    keys = list(current_user.keys())
    values = list(current_user.values())
    items = list(current_user.items())
    return {"user_id": user_id, "keys": keys}
`
    }
  ];

  const defects = [];
  const add = (code, file, message, line) => defects.push({ code, file, message, line });

  detectStaticPythonDefects(files, add);

  const mismatchDefects = defects.filter(d => d.code === 'USER_OBJECT_DICT_MISMATCH');
  assert.strictEqual(
    mismatchDefects.length,
    0,
    `Expected 0 USER_OBJECT_DICT_MISMATCH defects for dict methods, got: ${JSON.stringify(mismatchDefects)}`
  );
});

test('T6.2: detectStaticPythonDefects STILL flags object attribute access on dict current_user', () => {
  const files = [
    {
      path: 'backend/app/api/auth.py',
      content: `
def get_current_user():
    return {"id": 1, "email": "test@example.com"}
`
    },
    {
      path: 'backend/app/api/tasks.py',
      content: `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user

router = APIRouter()

@router.get("/tasks")
def list_tasks(current_user: dict = Depends(get_current_user)):
    return {"user_id": current_user.id}
`
    }
  ];

  const defects = [];
  const add = (code, file, message, line) => defects.push({ code, file, message, line });

  detectStaticPythonDefects(files, add);

  const mismatchDefects = defects.filter(d => d.code === 'USER_OBJECT_DICT_MISMATCH');
  assert.strictEqual(
    mismatchDefects.length,
    1,
    'Expected 1 USER_OBJECT_DICT_MISMATCH defect for current_user.id attribute access'
  );
  assert.ok(
    mismatchDefects[0].message.includes('current_user.id'),
    `Message should mention current_user.id: ${mismatchDefects[0].message}`
  );
});

test('T6.3: analyzeProjectContracts.py AST analyzer allows dict methods and flags attribute access on dict current_user', () => {
  const pythonExe = resolveSharedPython({});
  if (!pythonExe) {
    console.warn('Skipping Python AST portion: Python not available');
    return;
  }

  const scriptPath = fileURLToPath(new URL('../analyzeProjectContracts.py', import.meta.url));

  const validDictPayload = JSON.stringify({
    'backend/app/api/auth.py': 'def get_current_user():\n    return {"id": 1, "role": "admin"}\n',
    'backend/app/api/tasks.py': 'def get_tasks(current_user=None):\n    uid = current_user.get("id")\n    keys = current_user.keys()\n    return uid\n'
  });

  const resValid = spawnSync(pythonExe, [scriptPath], { input: validDictPayload, encoding: 'utf8' });
  assert.strictEqual(resValid.status, 0, `analyzeProjectContracts.py failed: ${resValid.stderr}`);
  const parsedValid = JSON.parse(resValid.stdout);
  const defectsValid = parsedValid.defects.filter(d => d.code === 'USER_OBJECT_DICT_MISMATCH');
  assert.strictEqual(
    defectsValid.length,
    0,
    `AST analyzer should not flag dict methods on dict current_user: ${JSON.stringify(defectsValid)}`
  );

  const invalidAttrPayload = JSON.stringify({
    'backend/app/api/auth.py': 'def get_current_user():\n    return {"id": 1, "role": "admin"}\n',
    'backend/app/api/tasks.py': 'def get_tasks(current_user=None):\n    return current_user.id\n'
  });

  const resInvalid = spawnSync(pythonExe, [scriptPath], { input: invalidAttrPayload, encoding: 'utf8' });
  assert.strictEqual(resInvalid.status, 0);
  const parsedInvalid = JSON.parse(resInvalid.stdout);
  const defectsInvalid = parsedInvalid.defects.filter(d => d.code === 'USER_OBJECT_DICT_MISMATCH');
  assert.strictEqual(
    defectsInvalid.length,
    1,
    'AST analyzer must flag current_user.id attribute access on dict current_user'
  );
});

test('T6.4: writeWorkspaceAndScaffolds bridges backend/main.py and backend/app/main.py bidirectionally', () => {
  const tempDirA = fs.mkdtempSync(path.join(os.tmpdir(), 't6-test-a-'));
  const tempDirB = fs.mkdtempSync(path.join(os.tmpdir(), 't6-test-b-'));

  try {
    // Case A: backend/app/main.py exists, backend/main.py is missing -> backend/main.py is scaffolded
    const filesA = [
      { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
      { path: 'frontend/package.json', content: '{}' }
    ];
    writeWorkspaceAndScaffolds(tempDirA, filesA, {}, () => {});
    const mainA = filesA.find(f => f.path === 'backend/main.py');
    assert.ok(mainA, 'backend/main.py must be scaffolded when backend/app/main.py exists');
    assert.ok(mainA.content.includes('from app.main import app'), 'Root forwarder should re-export app from app.main');

    // Case B: backend/main.py exists, backend/app/main.py is missing -> backend/app/main.py is scaffolded
    const filesB = [
      { path: 'backend/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
      { path: 'frontend/package.json', content: '{}' }
    ];
    writeWorkspaceAndScaffolds(tempDirB, filesB, {}, () => {});
    const appMainB = filesB.find(f => f.path === 'backend/app/main.py');
    assert.ok(appMainB, 'backend/app/main.py must be scaffolded when backend/main.py exists');
    assert.ok(appMainB.content.includes('Main app forwarder'), 'App forwarder must be created');
  } finally {
    fs.rmSync(tempDirA, { recursive: true, force: true });
    fs.rmSync(tempDirB, { recursive: true, force: true });
  }
});
