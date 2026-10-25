import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEndpointGuards } from '../pythonEndpointGuards.js';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { autoHealProjectContracts } from '../integrationContract.js';

test('AGENT 3 CHECKLIST 1: auth.py scaffolding & export completeness', async () => {
  const files = [
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter, Depends\nfrom app.api.auth import get_current_user\nrouter = APIRouter()\n@router.post("")\ndef create_order(user = Depends(get_current_user)): return {}`
    }
  ];

  writeWorkspaceAndScaffolds('workspaces/test_ws', files, {}, () => { });

  const authFile = files.find(f => f.path === 'backend/app/api/auth.py');
  assert(authFile, 'backend/app/api/auth.py must be scaffolded');
  assert(authFile.content.includes('def get_current_user'), 'auth.py must export get_current_user');
  assert(authFile.content.includes('def require_admin'), 'auth.py must export require_admin');
  assert(authFile.content.includes('def get_current_admin'), 'auth.py must export get_current_admin');
});

test('AGENT 3 CHECKLIST 2: inspectEndpointGuards detects unprotected mutation routes', async () => {
  const unprotectedCode = `
from fastapi import APIRouter
router = APIRouter()

@router.post("/checkout")
def checkout():
    # current_user = Depends(get_current_user)
    return {"status": "ok"}
`;

  const defects = inspectEndpointGuards('backend/app/api/orders.py', unprotectedCode);
  assert(defects.length > 0, 'Unprotected mutation route must produce defects');
  assert.equal(defects[0].code, 'API_AUTHZ_FAILURE');
  assert(defects[0].message.includes('authentication dependency'), 'Must require auth dependency');
});

test('AGENT 3 CHECKLIST 3: Public mutation routes (login/register) are permitted without auth guards', async () => {
  const publicAuthCode = `
from fastapi import APIRouter
router = APIRouter()

@router.post("/login")
def login():
    return {"token": "xyz"}

@router.post("/register")
def register():
    return {"user_id": 1}
`;

  const publicRoutes = new Set(['/login', '/register', '/api/auth/login', '/api/auth/register']);
  const defects = inspectEndpointGuards('backend/app/api/auth.py', publicAuthCode, publicRoutes);
  assert.equal(defects.length, 0, 'Public login and register endpoints must not be flagged');
});

test('AGENT 3 CHECKLIST 4: Admin routes mandate admin authorization, user-only auth is rejected', async () => {
  const userOnlyAdminCode = `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
router = APIRouter()

@router.get("/admin/analytics")
def get_analytics(user = Depends(get_current_user)):
    return {"revenue": 10000}
`;

  const defects = inspectEndpointGuards('backend/app/api/admin.py', userOnlyAdminCode);
  assert(defects.length > 0, 'Admin route with user-only auth must produce defects');
  assert.equal(defects[0].code, 'API_AUTHZ_FAILURE');
  assert(defects[0].message.includes('admin dependency'), 'Must require admin dependency');

  const properAdminCode = `
from fastapi import APIRouter, Depends
from app.api.auth import require_admin
router = APIRouter()

@router.get("/admin/analytics")
def get_analytics(admin = Depends(require_admin)):
    return {"revenue": 10000}
`;

  const cleanDefects = inspectEndpointGuards('backend/app/api/admin.py', properAdminCode);
  assert.equal(cleanDefects.length, 0, 'Admin route with require_admin must pass without defects');
});

test('AGENT 3 CHECKLIST 5: Auto-healing injects missing auth dependencies and fixes USER_OBJECT_DICT_MISMATCH', async () => {
  const files = [
    {
      path: 'backend/app/api/cart.py',
      content: `from fastapi import APIRouter
router = APIRouter()

@router.post("/items")
def add_to_cart(item_id: int):
    return {"cart": item_id}
`
    },
    {
      path: 'backend/app/api/profile.py',
      content: `from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
router = APIRouter()

@router.get("/me")
def get_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user.id
    return {"user_id": user_id}
`
    }
  ];

  const defects = [
    {
      code: 'API_AUTH_POLICY_MISMATCH',
      file: 'backend/app/api/cart.py',
      line: 5,
      message: 'Mutation POST /items requires user authorization'
    },
    {
      code: 'USER_OBJECT_DICT_MISMATCH',
      file: 'backend/app/api/profile.py',
      line: 7,
      message: "current_user is provided as a dictionary but accessed with object attribute notation 'current_user.id'"
    }
  ];

  const changed = autoHealProjectContracts(files, defects, () => { });
  assert.equal(changed, true, 'autoHealProjectContracts must heal auth policy and dict mismatch defects');

  const cartFile = files.find(f => f.path === 'backend/app/api/cart.py');
  assert(cartFile.content.includes('Depends(get_current_user)'), 'Cart endpoint must have get_current_user dependency injected');

  const profileFile = files.find(f => f.path === 'backend/app/api/profile.py');
  assert(profileFile.content.includes("current_user['id']"), "current_user.id must be converted to current_user['id']");
});
