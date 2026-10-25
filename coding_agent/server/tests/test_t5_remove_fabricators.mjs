import assert from 'node:assert';
import test from 'node:test';
import { autoHealProjectContracts } from '../integrationContract.js';

test('T5.1: autoHealProjectContracts never rewrites /api/tasks to /api/products in frontend files', () => {
  const frontendFile = {
    path: 'frontend/src/api/tasks.ts',
    content: 'export const getTasks = () => axios.get("/api/tasks");\nexport const createTask = (data) => axios.post("/api/tasks", data);'
  };

  const files = [frontendFile];
  const defects = [{ code: 'UNMATCHED_ENDPOINT', file: frontendFile.path, message: 'Unmatched /api/tasks' }];
  const events = [];
  const sendEvent = (event, payload) => events.push({ event, payload });

  autoHealProjectContracts(files, defects, sendEvent, null);

  assert.strictEqual(
    frontendFile.content.includes('/api/tasks'),
    true,
    'Endpoint /api/tasks must remain intact and never be mutated to /api/products'
  );
  assert.strictEqual(
    frontendFile.content.includes('/api/products'),
    false,
    '/api/products must never be fabricated into task files'
  );
  assert.strictEqual(
    events.some(e => e.payload && typeof e.payload === 'string' && e.payload.includes('Replaced hallucinated /api/tasks')),
    false,
    'Must not log task replacement'
  );
});

test('T5.2: autoHealProjectContracts never injects undeclared models (Tenant, APIKey, UsageLog) into models.py', () => {
  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: 'from sqlalchemy import Column, Integer, String\nfrom app.db.database import Base\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True)\n'
  };

  const apiFile = {
    path: 'backend/app/api/admin.py',
    content: 'from app.db.models import Tenant, APIKey, UsageLog, RateLimit, AuditLog\n'
  };

  const files = [modelsFile, apiFile];
  const defects = [
    { code: 'MISSING_PYTHON_SYMBOL', file: 'backend/app/api/admin.py', message: "Symbol 'Tenant' is not exported by backend/app/db/models.py" },
    { code: 'ORM_MODEL_UNRESOLVED', file: 'backend/app/api/admin.py', message: "Target does not resolve to a declared ORM model: APIKey" }
  ];

  const integrationContract = {
    entities: ['User', 'Project', 'Task'] // Only TaskFlow entities declared!
  };

  const events = [];
  const sendEvent = (event, payload) => events.push({ event, payload });

  autoHealProjectContracts(files, defects, sendEvent, integrationContract);

  // Undeclared models must NOT be injected!
  assert.strictEqual(modelsFile.content.includes('class Tenant'), false, 'Undeclared Tenant model must NOT be fabricated');
  assert.strictEqual(modelsFile.content.includes('class APIKey'), false, 'Undeclared APIKey model must NOT be fabricated');
  assert.strictEqual(modelsFile.content.includes('class UsageLog'), false, 'Undeclared UsageLog model must NOT be fabricated');
  assert.strictEqual(modelsFile.content.includes('class RateLimit'), false, 'Undeclared RateLimit model must NOT be fabricated');
  assert.strictEqual(modelsFile.content.includes('class AuditLog'), false, 'Undeclared AuditLog model must NOT be fabricated');
});

test('T5.3: autoHealProjectContracts only synthesizes models that are explicitly declared in integrationContract', () => {
  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: 'from sqlalchemy import Column, Integer, String\nfrom app.db.database import Base\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True)\n'
  };

  const files = [modelsFile];
  const defects = [
    { code: 'MISSING_PYTHON_SYMBOL', file: 'backend/app/api/tasks.py', message: "Symbol 'Task' is not exported by backend/app/db/models.py" }
  ];

  const integrationContract = {
    entities: ['User', 'Task'] // Task IS declared
  };

  autoHealProjectContracts(files, defects, () => {}, integrationContract);

  assert.strictEqual(modelsFile.content.includes('class Task(Base):'), true, 'Declared model Task should be synthesized when missing');
});

test('T5.4: autoHealProjectContracts never fabricates arbitrary function aliases', () => {
  const apiFile = {
    path: 'backend/app/api/tasks.py',
    content: 'def list_all_tasks(): pass\n'
  };

  const files = [apiFile];
  const defects = [
    { code: 'MISSING_PYTHON_SYMBOL', file: 'backend/app/api/tasks.py', message: "Symbol 'get_task_items' is not exported by backend/app/api/tasks.py" }
  ];

  autoHealProjectContracts(files, defects, () => {}, null);

  assert.strictEqual(apiFile.content.includes('get_task_items ='), false, 'Must not invent random function aliases');
});
