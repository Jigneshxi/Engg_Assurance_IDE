import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProjectContracts, extractStaticPythonContracts } from '../projectContractValidator.js';
import { validateApiAuthz } from '../apiAuthzValidator.js';
import { autoHealProjectContracts } from '../integrationContract.js';

const file = (path, content) => ({ path, content, status: 'validated' });

test('Regression 1: user.password is ignored from SCHEMA_FIELD_MISMATCH', async () => {
  const userSchema = file('backend/app/schemas/user.py', `
from pydantic import BaseModel
class User(BaseModel):
    id: int
    email: str
`);
  const authRoute = file('backend/app/api/auth.py', `
from fastapi import APIRouter
from app.schemas.user import User
router = APIRouter()
@router.post("/login")
def login(user: User):
    return {"pwd": user.password}
`);
  const result = await validateProjectContracts([userSchema, authRoute]);
  const schemaMismatches = result.defects.filter(d => d.code === 'SCHEMA_FIELD_MISMATCH' && d.message.includes('user.password'));
  assert.equal(schemaMismatches.length, 0, 'user.password does not trigger SCHEMA_FIELD_MISMATCH');
});

test('Regression 2: apiAuthzValidator recognizes decode_access_token and oauth2_scheme in get_current_user', async () => {
  const depsFile = file('backend/app/api/deps.py', `
from typing import Any, Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required")
    payload = decode_access_token(token)
    return {"id": payload.get("sub"), "email": payload.get("email"), "role": payload.get("role", "customer")}
`);
  const authzResult = await validateApiAuthz([depsFile]);
  const unverifiedTokenDefects = authzResult.defects.filter(d => d.code === 'AUTH_TOKEN_UNVERIFIED');
  assert.equal(unverifiedTokenDefects.length, 0, 'decode_access_token in get_current_user passes apiAuthz');
});

test('Regression 3: Router prefix is correctly matched for aliased contract imports', () => {
  const mainFile = file('backend/main.py', `
from fastapi import FastAPI
from app.api.boards import router as __contract_router_1
app = FastAPI()
app.include_router(__contract_router_1, prefix='/api/boards')
`);
  const boardsFile = file('backend/app/api/boards.py', `
from fastapi import APIRouter
router = APIRouter()
@router.get("/{board_id}")
def get_board(board_id: int):
    return {"id": board_id}
`);
  const contracts = extractStaticPythonContracts([mainFile, boardsFile]);
  const boardRoute = contracts.routes.find(r => r.path === '/api/boards/{board_id}');
  assert(boardRoute, 'Route extracted with full prefix /api/boards/{board_id}');
});

test('Regression 4: autoHealProjectContracts injects missing schema fields', () => {
  const taskSchema = file('backend/app/schemas/task.py', `
from pydantic import BaseModel
class TaskCreate(BaseModel):
    title: str
    description: str
`);
  const tasksApi = file('backend/app/api/tasks.py', `
from fastapi import APIRouter
from app.schemas.task import TaskCreate
router = APIRouter()
@router.post("/tasks")
def create_task(task: TaskCreate):
    return {"status": task.status, "board_id": task.board_id}
`);
  const defects = [
    { code: 'SCHEMA_FIELD_MISMATCH', file: 'backend/app/api/tasks.py', line: 7, message: 'task.status is absent from its declared schema' },
    { code: 'SCHEMA_FIELD_MISMATCH', file: 'backend/app/api/tasks.py', line: 7, message: 'task.board_id is absent from its declared schema' }
  ];
  const changed = autoHealProjectContracts([taskSchema, tasksApi], defects, () => {});
  assert.equal(changed, true, 'autoHeal healed schema fields');
  assert(taskSchema.content.includes('status: Optional[Any] = None'), 'status field injected');
  assert(taskSchema.content.includes('board_id: Optional[Any] = None'), 'board_id field injected');
});

test('Regression 5: autoHealProjectContracts injects missing detail GET endpoint', () => {
  const boardsApi = file('backend/app/api/boards.py', `
from fastapi import APIRouter
router = APIRouter()
@router.get("")
def list_boards():
    return []
`);
  const defects = [
    { code: 'API_ROUTE_MISMATCH', file: 'frontend/src/pages/BoardView.tsx', line: 15, message: 'GET /api/boards/{param} has no matching registered backend endpoint' }
  ];
  const changed = autoHealProjectContracts([boardsApi], defects, () => {});
  assert.equal(changed, true, 'autoHeal healed missing detail GET route');
  assert(boardsApi.content.includes('@router.get("/{id}")'), 'detail GET route injected');
  assert(boardsApi.content.includes('get_board_by_id'), 'handler function injected');
});
