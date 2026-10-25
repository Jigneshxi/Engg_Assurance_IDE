/**
 * Phase 11: Dedicated API Authentication & Authorization Test Suite
 * 
 * Verifies:
 * A. Authentication
 *    - register endpoint
 *    - login endpoint
 *    - valid credentials
 *    - invalid credentials
 *    - missing credentials
 *    - malformed token
 *    - expired token
 *    - invalid signature/token
 *    - correct authenticated identity extraction
 * 
 * B. Authorization
 *    - protected endpoint requires authentication
 *    - user identity comes from verified authentication context
 *    - request payload cannot override authenticated user identity
 *    - User A cannot access User B resources
 *    - User A cannot modify User B resources
 *    - User A cannot delete User B resources
 *    - unauthorized access returns appropriate 401/403
 * 
 * C. Ownership
 *    - user-owned records must be filtered by authenticated user
 *    - GET/list must not leak another user's records
 *    - UPDATE must enforce ownership
 *    - DELETE must enforce ownership
 * 
 * D. API Contract
 *    - expected status codes
 *    - expected response behavior
 *    - protected route registration
 * 
 * Defect Code: API_AUTHZ_FAILURE
 */

import assert from 'assert';
import {
  API_AUTHZ_DEFECT_CODES,
  verifyAuthenticationEndpoints,
  verifyTokenValidationAndClaims,
  verifyProtectedEndpointGuards,
  verifyIdentityOverrideProtection,
  verifyResourceOwnershipAndIsolation,
  simulateAuthzFlow,
  validateApiAuthz
} from '../apiAuthzValidator.js';
import { getRepairStrategy } from '../repairEngine.js';

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(err);
    failedTests++;
  }
}

console.log('🧪 Starting Phase 11: API Authentication & Authorization Test Suite...\n');

// ── Test 1: Authentication Endpoints (Registration & Login) Discovery ─────────
await runTest('Test 1: Registration and login endpoints discovered; missing endpoints flagged', async () => {
  const compliantFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from fastapi import APIRouter, HTTPException, Depends
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"])

router = APIRouter()

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

@router.post("/register")
def register(user_in: dict):
    return {"id": 1, "username": user_in["username"]}

@router.post("/login")
def login(creds: dict):
    if not verify_password(creds["password"], "hash"):
        raise HTTPException(status_code=401)
    return {"access_token": "token", "token_type": "bearer"}
`
    }
  ];

  const res1 = verifyAuthenticationEndpoints(compliantFiles);
  assert.strictEqual(res1.defects.length, 0, 'Compliant auth endpoints yield 0 defects');

  // Missing login endpoint
  const missingLoginFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `
@router.post("/register")
def register(): pass
`
    }
  ];

  const res2 = verifyAuthenticationEndpoints(missingLoginFiles);
  assert.strictEqual(res2.defects.length >= 1, true, 'Missing login endpoint must be flagged');
  const defectSubtypes = res2.defects.map(d => d.subtype);
  assert.ok(defectSubtypes.includes(API_AUTHZ_DEFECT_CODES.AUTH_ENDPOINT_MISSING));
});

// ── Test 2: Credential Validation (Valid, Invalid, Missing) ────────────────────
await runTest('Test 2: Credential validation enforces valid credentials and rejects invalid/missing', async () => {
  const { server } = simulateAuthzFlow();

  // Missing credentials on registration
  const resMissingReg = server.register({ username: 'alice' }); // missing password
  assert.strictEqual(resMissingReg.status, 422, 'Missing password on register returns 422 Unprocessable');

  // Valid registration
  const resValidReg = server.register({ username: 'alice', password: 'securePassword123' });
  assert.strictEqual(resValidReg.status, 201, 'Valid credentials on register return 201 Created');
  assert.ok(resValidReg.data.access_token, 'Register returns access_token');

  // Duplicate registration
  const resDupReg = server.register({ username: 'alice', password: 'securePassword123' });
  assert.strictEqual(resDupReg.status, 400, 'Duplicate username returns 400 Bad Request');

  // Missing credentials on login
  const resMissingLogin = server.login({ username: 'alice' });
  assert.strictEqual(resMissingLogin.status, 400, 'Missing password on login returns 400 Bad Request');

  // Invalid password on login
  const resInvalidLogin = server.login({ username: 'alice', password: 'wrongPassword!' });
  assert.strictEqual(resInvalidLogin.status, 401, 'Invalid password returns 401 Unauthorized');

  // Valid login
  const resValidLogin = server.login({ username: 'alice', password: 'securePassword123' });
  assert.strictEqual(resValidLogin.status, 200, 'Valid credentials return 200 OK');
  assert.ok(resValidLogin.data.access_token, 'Login returns access_token');
});

// ── Test 3: Token Validation (Signature, Expired, Malformed) ───────────────────
await runTest('Test 3: Token validation catches malformed tokens, invalid signatures, and expiration', async () => {
  const { server, createSignedToken, secretKey, invalidKey } = simulateAuthzFlow();

  // Malformed token strings
  const resMalformed = server.listResources('not-a-real-jwt-token');
  assert.strictEqual(resMalformed.status, 401, 'Malformed token string returns 401 Unauthorized');
  assert.strictEqual(resMalformed.data.detail, 'MALFORMED_TOKEN');

  // Token signed with wrong / invalid secret key
  const invalidSigToken = createSignedToken({ sub: '1', username: 'alice' }, invalidKey);
  const resInvalidSig = server.listResources(invalidSigToken);
  assert.strictEqual(resInvalidSig.status, 401, 'Invalid token signature returns 401 Unauthorized');
  assert.strictEqual(resInvalidSig.data.detail, 'INVALID_SIGNATURE');

  // Expired token (expiresInSec: -10)
  const expiredToken = createSignedToken({ sub: '1', username: 'alice' }, secretKey, -10);
  const resExpired = server.listResources(expiredToken);
  assert.strictEqual(resExpired.status, 401, 'Expired token returns 401 Unauthorized');
  assert.strictEqual(resExpired.data.detail, 'EXPIRED_TOKEN');

  // Missing token
  const resMissing = server.listResources(null);
  assert.strictEqual(resMissing.status, 401, 'Missing token returns 401 Unauthorized');
});

// ── Test 4: Authenticated Identity Extraction ─────────────────────────────────
await runTest('Test 4: User identity is extracted from verified token context claims', async () => {
  const compliantAuthFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": 3600})
    return jwt.encode(to_encode, "SECRET_KEY", algorithm="HS256")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, "SECRET_KEY", algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return {"id": int(user_id)}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
`
    }
  ];

  const res1 = verifyTokenValidationAndClaims(compliantAuthFiles);
  assert.strictEqual(res1.defects.length, 0, 'Compliant identity extraction yields 0 defects');

  // Incomplete token handling: missing identity claim extraction
  const missingIdentityFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from jose import jwt
def get_current_user(token: str):
    payload = jwt.decode(token, "KEY")
    return {"status": "ok"} # No sub or user_id extracted
`
    }
  ];

  const res2 = verifyTokenValidationAndClaims(missingIdentityFiles);
  assert.strictEqual(res2.defects.length >= 1, true, 'Missing claim extraction must be flagged');
});

// ── Test 5: Protected Endpoint Guards (Depends / Middleware) ──────────────────
await runTest('Test 5: Protected endpoints require authentication guards; unprotected mutations caught', async () => {
  const compliantRouterFiles = [
    {
      path: 'backend/app/api/items.py',
      content: `
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user

router = APIRouter()

@router.post("/")
def create_item(data: dict, current_user: dict = Depends(get_current_user)):
    return {"title": data["title"], "user_id": current_user["id"]}
`
    }
  ];

  const res1 = verifyProtectedEndpointGuards(compliantRouterFiles);
  assert.strictEqual(res1.defects.length, 0, 'Guarded router yields 0 defects');

  // Unprotected state mutation
  const unprotectedFiles = [
    {
      path: 'backend/app/api/items.py',
      content: `
from fastapi import APIRouter

router = APIRouter()

@router.post("/")
def create_item(data: dict):
    return {"title": data["title"]}
`
    }
  ];

  const res2 = verifyProtectedEndpointGuards(unprotectedFiles);
  assert.strictEqual(res2.defects.length, 1, 'Unprotected mutation router must be flagged');
  assert.strictEqual(res2.defects[0].subtype, API_AUTHZ_DEFECT_CODES.AUTHZ_UNPROTECTED_ENDPOINT);
});

// ── Test 6: Request Payload Cannot Override Authenticated User Identity ───────
await runTest('Test 6: Request payload cannot override authenticated user identity', async () => {
  // Static check: flagging payload user_id pollution
  const vulnerableFile = [
    {
      path: 'backend/app/api/records.py',
      content: `
@router.post("/")
def create_record(data: dict, current_user: User = Depends(get_current_user)):
    record.user_id = data.user_id
    db.add(record)
`
    }
  ];

  const staticRes = verifyIdentityOverrideProtection(vulnerableFile);
  assert.strictEqual(staticRes.defects.length, 1, 'Accepting user_id directly from payload is flagged');
  assert.strictEqual(staticRes.defects[0].subtype, API_AUTHZ_DEFECT_CODES.AUTHZ_IDENTITY_OVERRIDE);

  // Runtime flow simulation: verify server overwrites or enforces user_id
  const { server } = simulateAuthzFlow();
  const aliceReg = server.register({ username: 'alice', password: 'password123' });
  const bobReg = server.register({ username: 'bob', password: 'password456' });

  // Alice creates a resource, attempting to specify user_id = bob.id (2) in payload
  const createRes = server.createResource(aliceReg.data.access_token, {
    title: 'Secret Alice Doc',
    content: 'Classified',
    user_id: bobReg.data.user.id // Spoofed payload
  });

  assert.strictEqual(createRes.status, 201, 'Resource created successfully');
  assert.strictEqual(createRes.data.user_id, aliceReg.data.user.id, 'Resource user_id MUST be Alice (authenticated user), NOT Bob');
});

// ── Test 7: Cross-User Resource Isolation (Read, Update, Delete) ──────────────
await runTest('Test 7: User A cannot read, modify, or delete User B resources (403/404)', async () => {
  const { server } = simulateAuthzFlow();

  const alice = server.register({ username: 'alice', password: 'password123' });
  const bob = server.register({ username: 'bob', password: 'password456' });

  // Alice creates a private resource
  const aliceDoc = server.createResource(alice.data.access_token, {
    title: 'Alice Budget',
    content: 'Private Financials'
  });
  const docId = aliceDoc.data.id;

  // Alice can read her own resource
  const aliceRead = server.getResource(alice.data.access_token, docId);
  assert.strictEqual(aliceRead.status, 200, 'Alice can read her own resource');

  // Bob attempts to read Alice's resource -> must receive 403 Forbidden
  const bobRead = server.getResource(bob.data.access_token, docId);
  assert.strictEqual(bobRead.status, 403, 'Bob cannot read Alice resource (returns 403 Forbidden)');

  // Bob attempts to update Alice's resource -> must receive 403 Forbidden
  const bobUpdate = server.updateResource(bob.data.access_token, docId, { title: 'Hacked by Bob' });
  assert.strictEqual(bobUpdate.status, 403, 'Bob cannot update Alice resource (returns 403 Forbidden)');

  // Verify Alice's resource was not altered
  const verifyDoc = server.getResource(alice.data.access_token, docId);
  assert.strictEqual(verifyDoc.data.title, 'Alice Budget', 'Alice resource remains unaltered');

  // Bob attempts to delete Alice's resource -> must receive 403 Forbidden
  const bobDelete = server.deleteResource(bob.data.access_token, docId);
  assert.strictEqual(bobDelete.status, 403, 'Bob cannot delete Alice resource (returns 403 Forbidden)');

  // Alice can delete her own resource
  const aliceDelete = server.deleteResource(alice.data.access_token, docId);
  assert.strictEqual(aliceDelete.status, 200, 'Alice can delete her own resource');
});

// ── Test 8: List Query Ownership Filtering (Zero Leakage) ──────────────────────
await runTest('Test 8: Resource listing filters by authenticated user and does not leak cross-user data', async () => {
  // Static check: Flagging global un-scoped queries (.query(Model).all()) without user filter
  const leakingRouter = [
    {
      path: 'backend/app/api/tasks.py',
      content: `
@router.get("/")
def get_tasks(db: Session = Depends(get_db)):
    return db.query(Task).all()
`
    }
  ];

  const staticRes = verifyResourceOwnershipAndIsolation(leakingRouter);
  assert.strictEqual(staticRes.defects.length, 1, 'Global .all() query without user filter is flagged');
  assert.strictEqual(staticRes.defects[0].subtype, API_AUTHZ_DEFECT_CODES.AUTHZ_OWNERSHIP_LEAK);

  // Runtime flow: Bob list query does not contain Alice records
  const { server } = simulateAuthzFlow();
  const alice = server.register({ username: 'alice', password: 'password123' });
  const bob = server.register({ username: 'bob', password: 'password456' });

  server.createResource(alice.data.access_token, { title: 'Alice Task 1' });
  server.createResource(alice.data.access_token, { title: 'Alice Task 2' });
  server.createResource(bob.data.access_token, { title: 'Bob Task 1' });

  const aliceList = server.listResources(alice.data.access_token);
  assert.strictEqual(aliceList.status, 200);
  assert.strictEqual(aliceList.data.length, 2, 'Alice sees exactly her 2 tasks');
  assert.ok(aliceList.data.every(r => r.user_id === alice.data.user.id), 'All items belong to Alice');

  const bobList = server.listResources(bob.data.access_token);
  assert.strictEqual(bobList.status, 200);
  assert.strictEqual(bobList.data.length, 1, 'Bob sees only his 1 task');
  assert.strictEqual(bobList.data[0].title, 'Bob Task 1');
  assert.strictEqual(bobList.data[0].user_id, bob.data.user.id);
});

// ── Test 9: Complete Full-Stack Project Validation Gate ───────────────────────
await runTest('Test 9: Composite validateApiAuthz gate accepts compliant project and rejects non-compliant', async () => {
  const completeCompliantProject = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from jose import jwt, JWTError

pwd_context = CryptContext(schemes=["bcrypt"])
router = APIRouter()

def verify_password(p, h): return pwd_context.verify(p, h)

@router.post("/register")
def register(data: dict):
    return {"id": 1, "username": data["username"]}

@router.post("/login")
def login(creds: dict):
    if not verify_password(creds["password"], "hash"):
        raise HTTPException(status_code=401)
    token = jwt.encode({"sub": "1", "exp": 3600}, "SECRET", algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}

def get_current_user(token: str):
    payload = jwt.decode(token, "SECRET", algorithms=["HS256"])
    user_id = payload.get("sub")
    return {"id": int(user_id)}
`
    },
    {
      path: 'backend/app/api/items.py',
      content: `
from fastapi import APIRouter, Depends, HTTPException
from app.api.auth import get_current_user

router = APIRouter()

@router.get("/")
def list_items(current_user: dict = Depends(get_current_user), db=None):
    return db.query(Item).filter(Item.user_id == current_user["id"]).all()

@router.post("/")
def create_item(data: dict, current_user: dict = Depends(get_current_user)):
    item = Item(title=data["title"], user_id=current_user["id"])
    return item

@router.delete("/{item_id}")
def delete_item(item_id: int, current_user: dict = Depends(get_current_user), db=None):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item or item.user_id != current_user["id"]:
        raise HTTPException(status_code=403)
    db.delete(item)
    return {"ok": True}
`
    }
  ];

  const passResult = await validateApiAuthz(completeCompliantProject);
  assert.strictEqual(passResult.isValid, true, 'Fully compliant project passes API AuthZ gate');
  assert.strictEqual(passResult.defects.length, 0);

  // Non-compliant project missing auth router entirely
  const brokenProject = [
    {
      path: 'backend/app/api/items.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.post("/")
def create_item(data: dict): return data
`
    }
  ];

  const failResult = await validateApiAuthz(brokenProject);
  assert.strictEqual(failResult.isValid, false, 'Non-compliant project fails API AuthZ gate');
  assert.strictEqual(failResult.defects.length >= 1, true);
});

// ── Test 10: Repair Engine Strategy Mapping ───────────────────────────────────
await runTest('Test 10: Repair Engine maps ApiAuthzRepairStrategy for API_AUTHZ_FAILURE', async () => {
  const strategy = getRepairStrategy(API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE);
  assert.ok(strategy, 'Repair strategy exists for API_AUTHZ_FAILURE');
  assert.strictEqual(strategy.name, 'ApiAuthzRepairStrategy');
  assert.ok(strategy.instructions.length >= 4, 'Contains targeted auth repair instructions');
  assert.ok(strategy.forbidden.length >= 2, 'Contains forbidden anti-patterns');
});

// ── Test 11: Real JWT Registration, Login, and /me Endpoint ───────────────────
await runTest('Test 11: Real JWT registration, login, and /me authenticated user extraction', async () => {
  const { server } = simulateAuthzFlow();

  // 1. Register Alice
  const regRes = server.register({ username: 'alice', password: 'Password123!', role: 'customer' });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.access_token;
  assert.ok(token);

  // 2. Access /me with valid token -> returns authenticated user
  const meRes = server.getMe(token);
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.data.username, 'alice');
  assert.strictEqual(meRes.data.role, 'customer');

  // 3. Access /me without token -> 401
  const noTokenMe = server.getMe(null);
  assert.strictEqual(noTokenMe.status, 401);

  // 4. Access /me with malformed token -> 401
  const malformedMe = server.getMe('invalid.token.here');
  assert.strictEqual(malformedMe.status, 401);
});

// ── Test 12: Admin-Only Route Returns 403 for Normal User, 200 for Admin ──────
await runTest('Test 12: Admin-only route returns 403 for normal user, 200 for admin, and 401 without token', async () => {
  const { server } = simulateAuthzFlow();

  // Register customer
  const custReg = server.register({ username: 'regular_user', password: 'Password123!', role: 'customer' });
  const custToken = custReg.data.access_token;

  // Register admin
  const adminReg = server.register({ username: 'super_admin', password: 'AdminPassword123!', role: 'admin' });
  const adminToken = adminReg.data.access_token;

  // Normal user hitting admin route -> 403 Forbidden
  const custAdminRes = server.adminAction(custToken);
  assert.strictEqual(custAdminRes.status, 403, 'Normal user receives 403 Forbidden on admin route');

  // Admin user hitting admin route -> 200 OK
  const adminActionRes = server.adminAction(adminToken);
  assert.strictEqual(adminActionRes.status, 200, 'Admin user receives 200 OK on admin route');

  // Missing token on admin route -> 401 Unauthorized
  const noTokenAdmin = server.adminAction(null);
  assert.strictEqual(noTokenAdmin.status, 401, 'Missing token receives 401 Unauthorized');
});

// ── Test 13: Duplicate Authentication Authority Detection ─────────────────────
await runTest('Test 13: Detects duplicate authentication authority across auth modules', async () => {
  const duplicateAuthFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `from fastapi import APIRouter
router = APIRouter()
def get_current_user(): return {"id": 1}
`
    },
    {
      path: 'backend/app/api/deps.py',
      content: `from fastapi import Depends
def get_current_user(): return {"id": 2}
`
    }
  ];

  const res = await validateApiAuthz(duplicateAuthFiles);
  const dupDefect = res.defects.find(d => d.code === 'DUPLICATE_AUTH_AUTHORITY' || d.subtype === 'DUPLICATE_AUTH_AUTHORITY');
  assert.ok(dupDefect, 'Duplicate get_current_user definitions must produce DUPLICATE_AUTH_AUTHORITY defect');
});

// ── Test 14: Placeholder Tokens Rejection ──────────────────────────────────────
await runTest('Test 14: Rejects placeholder authentication tokens (YOUR_ACCESS_TOKEN, dummy_token, fake_token)', async () => {
  const placeholderAuthFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `from fastapi import APIRouter
router = APIRouter()
@router.post("/login")
def login():
    return {"access_token": "YOUR_ACCESS_TOKEN", "token_type": "bearer"}
`
    }
  ];

  const res = await validateApiAuthz(placeholderAuthFiles);
  const placeholderDefect = res.defects.find(d => d.code === 'HARDCODED_AUTH_TOKEN');
  assert.ok(placeholderDefect, 'Placeholder auth token must produce HARDCODED_AUTH_TOKEN defect');
});

// ── Test 15: Missing Password Hashing Detected ─────────────────────────────────
await runTest('Test 15: Detects authentication modules lacking password hashing', async () => {
  const noHashAuthFiles = [
    {
      path: 'backend/app/api/auth.py',
      content: `from fastapi import APIRouter
router = APIRouter()
@router.post("/register")
def register(): return {}
@router.post("/login")
def login(): return {"access_token": "token"}
def verify_password(plain, hashed): return plain == hashed
`
    }
  ];

  const res = await validateApiAuthz(noHashAuthFiles);
  const hashDefect = res.defects.find(d => d.subtype === API_AUTHZ_DEFECT_CODES.AUTH_CREDENTIALS_INVALID && d.message.includes('hash'));
  assert.ok(hashDefect, 'Missing password hashing must produce AUTH_CREDENTIALS_INVALID defect');
});

// ── Test 16: Phase 4 Two-User Ownership & Isolation ───────────────────────────
await runTest('Test 16: Two real users isolation: User A cannot read, update, change status, or delete User B tasks/boards', async () => {
  const { server } = simulateAuthzFlow();

  // 1. Register User A and User B
  const userAReg = server.register({ username: 'user_a', password: 'PasswordA123!', role: 'customer' });
  const userBReg = server.register({ username: 'user_b', password: 'PasswordB123!', role: 'customer' });
  const tokenA = userAReg.data.access_token;
  const tokenB = userBReg.data.access_token;

  // 2. User B creates a board and a task
  const boardBRes = server.createBoard(tokenB, { title: 'User B Private Board' });
  assert.strictEqual(boardBRes.status, 201);
  const boardBId = boardBRes.data.id;

  const taskBRes = server.createTask(tokenB, boardBId, { title: 'User B Secret Task', status: 'todo' });
  assert.strictEqual(taskBRes.status, 201);
  const taskBId = taskBRes.data.id;

  // 3. User A cannot list User B's boards
  const listBoardsARes = server.listBoards(tokenA);
  assert.strictEqual(listBoardsARes.status, 200);
  assert.strictEqual(listBoardsARes.data.some(b => b.id === boardBId), false, "User A cannot list User B's boards");

  // 4. User A cannot read User B's task
  const getTaskARes = server.getTask(tokenA, taskBId);
  assert.strictEqual(getTaskARes.status, 403, "User A cannot read User B's task (returns 403)");

  // 5. User A cannot update User B's task
  const updateTaskARes = server.updateTask(tokenA, taskBId, { title: 'Hacked Title' });
  assert.strictEqual(updateTaskARes.status, 403, "User A cannot update User B's task (returns 403)");

  // 6. User A cannot change User B's task status
  const updateStatusARes = server.updateTaskStatus(tokenA, taskBId, 'done');
  assert.strictEqual(updateStatusARes.status, 403, "User A cannot change User B's task status (returns 403)");

  // 7. User A cannot delete User B's task
  const deleteTaskARes = server.deleteTask(tokenA, taskBId);
  assert.strictEqual(deleteTaskARes.status, 403, "User A cannot delete User B's task (returns 403)");

  // 8. User B can read, update, and manage their own task
  const getTaskBRes = server.getTask(tokenB, taskBId);
  assert.strictEqual(getTaskBRes.status, 200, "User B can read their own task");
  assert.strictEqual(getTaskBRes.data.title, 'User B Secret Task');
});

// ── Test 17: Board Ownership Verification Before Task Creation ────────────────
await runTest('Test 17: Task creation verifies board ownership; cannot create task under another user board', async () => {
  const { server } = simulateAuthzFlow();

  const userAReg = server.register({ username: 'owner_a', password: 'PasswordA123!' });
  const userBReg = server.register({ username: 'attacker_b', password: 'PasswordB123!' });
  const tokenA = userAReg.data.access_token;
  const tokenB = userBReg.data.access_token;

  // User A creates a board
  const boardARes = server.createBoard(tokenA, { title: 'Board Owned By A' });
  const boardAId = boardARes.data.id;

  // User B attempts to create a task on User A's board -> 403 Forbidden
  const hijackedTaskRes = server.createTask(tokenB, boardAId, { title: 'Hijacked Task' });
  assert.strictEqual(hijackedTaskRes.status, 403, "Creating a task on another user's board must return 403 Forbidden");

  // User A creates a task on their own board -> 201 Created
  const validTaskRes = server.createTask(tokenA, boardAId, { title: 'Legitimate Task' });
  assert.strictEqual(validTaskRes.status, 201, "Creating a task on one's own board returns 201 Created");
});

// ── Test 18: Dashboard Metrics Scoped to Authenticated User ───────────────────
await runTest('Test 18: Dashboard metrics totals are scoped exclusively to authenticated user and exclude other users', async () => {
  const { server } = simulateAuthzFlow();

  const userAReg = server.register({ username: 'metrics_user_a', password: 'PasswordA123!' });
  const userBReg = server.register({ username: 'metrics_user_b', password: 'PasswordB123!' });
  const tokenA = userAReg.data.access_token;
  const tokenB = userBReg.data.access_token;

  // User A: 1 board, 2 tasks (1 done, 1 pending)
  const boardA = server.createBoard(tokenA, { title: 'Board A' });
  server.createTask(tokenA, boardA.data.id, { title: 'Task A1', status: 'done' });
  server.createTask(tokenA, boardA.data.id, { title: 'Task A2', status: 'todo' });

  // User B: 3 boards, 5 tasks
  const boardB = server.createBoard(tokenB, { title: 'Board B' });
  for (let i = 0; i < 5; i++) {
    server.createTask(tokenB, boardB.data.id, { title: `Task B${i}`, status: 'todo' });
  }

  // User A metrics
  const metricsA = server.getDashboardMetrics(tokenA);
  assert.strictEqual(metricsA.status, 200);
  assert.strictEqual(metricsA.data.totalBoards, 1, 'User A sees only 1 board');
  assert.strictEqual(metricsA.data.totalTasks, 2, 'User A sees only 2 tasks (excludes User B 5 tasks)');
  assert.strictEqual(metricsA.data.completedTasks, 1);
  assert.strictEqual(metricsA.data.pendingTasks, 1);

  // User B metrics
  const metricsB = server.getDashboardMetrics(tokenB);
  assert.strictEqual(metricsB.status, 200);
  assert.strictEqual(metricsB.data.totalBoards, 1, 'User B sees only 1 board');
  assert.strictEqual(metricsB.data.totalTasks, 5, 'User B sees only their 5 tasks');
});

// ── Test 19: Static Rejection of Python Boolean 'and' Inside SQLAlchemy Filter ─
await runTest('Test 19: Rejects Python boolean and inside SQLAlchemy .filter()', async () => {
  const booleanAndFiles = [
    {
      path: 'backend/app/api/tasks.py',
      content: `from fastapi import APIRouter, Depends
router = APIRouter()
@router.get("/{task_id}")
def get_task(task_id: int, current_user = Depends(get_current_user), db = None):
    return db.query(Task).filter(Task.user_id == current_user.id and Task.id == task_id).first()
`
    }
  ];

  const res = await validateApiAuthz(booleanAndFiles);
  const boolAndDefect = res.defects.find(d => d.subtype === 'SQLALCHEMY_BOOLEAN_AND_DEFECT');
  assert.ok(boolAndDefect, 'Python boolean and in .filter() must produce SQLALCHEMY_BOOLEAN_AND_DEFECT defect');
});

// ── Test 20: Static Rejection of Bogus board_id == current_user.id Comparison ──
await runTest('Test 20: Rejects bogus comparison comparing board_id to user_id', async () => {
  const bogusComparisonFiles = [
    {
      path: 'backend/app/api/tasks.py',
      content: `from fastapi import APIRouter, Depends
router = APIRouter()
@router.put("/{task_id}")
def update_task(task_id: int, current_user = Depends(get_current_user), db = None):
    task = db.query(Task).filter(Task.id == task_id).first()
    if task.board_id == current_user.id:
        return {"status": "ok"}
    raise HTTPException(status_code=403)
`
    }
  ];

  const res = await validateApiAuthz(bogusComparisonFiles);
  const bogusDefect = res.defects.find(d => d.message.includes('board_id') && d.message.includes('identity'));
  assert.ok(bogusDefect, 'Bogus comparison comparing board_id to current_user.id must produce defect');
});

// ── Test 21: Static Rejection of Unscoped Collection Query query(Task).all() ──
await runTest('Test 21: Rejects unscoped collection query query(Task).all() on user-owned resource', async () => {
  const unscopedFiles = [
    {
      path: 'backend/app/api/tasks.py',
      content: `from fastapi import APIRouter, Depends
router = APIRouter()
@router.get("/")
def list_tasks(current_user = Depends(get_current_user), db = None):
    return db.query(Task).all()
`
    }
  ];

  const res = await validateApiAuthz(unscopedFiles);
  const unscopedDefect = res.defects.find(d => d.code === 'AUTHZ_OWNERSHIP_LEAK');
  assert.ok(unscopedDefect, 'Unscoped query(Task).all() must produce AUTHZ_OWNERSHIP_LEAK defect');
});

console.log(`\n==================================================`);
console.log(`Phase 11 API AuthN & AuthZ Test Suite Completed`);
console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`==================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
