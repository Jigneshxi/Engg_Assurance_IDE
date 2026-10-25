import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectContracts } from '../projectContractValidator.js';
import { autoHealProjectContracts } from '../integrationContract.js';
import { preserveFailedCompletionGate } from '../uiTruthfulness.js';
import { scanForCredentials } from '../securityValidator.js';

test('AGENT 6 CHECKLIST 1: Router Mounting Closure in backend/main.py auto-healer', async () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\n\napp = FastAPI()\n`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("")\ndef list_products(): return []\n`
    },
    {
      path: 'backend/app/api/cart.py',
      content: `from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("")\ndef get_cart(): return []\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const healed = autoHealProjectContracts(files, []);
  assert.equal(healed, true, 'autoHeal must mount unmounted routers in backend/main.py');

  const mainFile = files.find(f => f.path === 'backend/main.py');
  assert.ok(mainFile.content.includes('from app.api.products import router as products_router'), 'Must import products router');
  assert.ok(mainFile.content.includes('app.include_router(products_router'), 'Must include products router');
  assert.ok(mainFile.content.includes('from app.api.cart import router as cart_router'), 'Must import cart router');
  assert.ok(mainFile.content.includes('app.include_router(cart_router'), 'Must include cart router');
});

test('AGENT 6 CHECKLIST 2: Dynamic ORM Model Synthesis into backend/app/db/models.py', async () => {
  const files = [
    {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import declarative_base\n\nBase = declarative_base()\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True, index=True)\n`
    },
    {
      path: 'backend/app/api/wishlist.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.db.models import Wishlist\nfrom app.db.database import get_db\nrouter = APIRouter()\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must synthesize missing ORM model Wishlist');

  const modelsFile = files.find(f => f.path === 'backend/app/db/models.py');
  assert.ok(modelsFile.content.includes('class Wishlist(Base):'), 'models.py must contain synthesized Wishlist model');
  assert.ok(modelsFile.content.includes('__tablename__ = "wishlists"'), 'Synthesized model must have valid tablename');
  assert.ok(modelsFile.content.includes('id = Column(Integer, primary_key=True'), 'Synthesized model must have primary key');
});

test('AGENT 6 CHECKLIST 3: Missing Schema Re-Export and Clean Stub Synthesis', async () => {
  const files = [
    {
      path: 'backend/app/schemas/customer.py',
      content: `from pydantic import BaseModel, ConfigDict\n\nclass CustomerCreate(BaseModel):\n    name: str\n`
    },
    {
      path: 'backend/app/api/customers.py',
      content: `from fastapi import APIRouter, Depends\nfrom app.schemas.customer import CustomerResponse\nrouter = APIRouter()\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const healed = autoHealProjectContracts(files, []);
  assert.equal(healed, true, 'autoHeal must inject missing CustomerResponse stub');

  const schemaFile = files.find(f => f.path === 'backend/app/schemas/customer.py');
  assert.ok(schemaFile.content.includes('class CustomerResponse(BaseModel):'), 'Must synthesize CustomerResponse class');
  assert.ok(schemaFile.content.includes('model_config = ConfigDict(from_attributes=True)'), 'Synthesized response must be strict without extra allow');
  assert.ok(!schemaFile.content.includes("extra='allow'"), 'Response stub must not allow extra fields');
});

test('AGENT 6 CHECKLIST 4: Missing Typing Symbol Closure (MISSING_TYPING_IMPORT) injection', async () => {
  const files = [
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter\n\nrouter = APIRouter()\n\ndef process_items(items: List[Dict[str, Any]]) -> Optional[int]:\n    return len(items) if items else None\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const typingDefects = initialCheck.defects.filter(d => d.code === 'MISSING_TYPING_IMPORT');
  assert.ok(typingDefects.length > 0, 'Unimported typing symbols must trigger MISSING_TYPING_IMPORT');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must inject missing typing imports');

  const ordersFile = files.find(f => f.path === 'backend/app/api/orders.py');
  assert.ok(ordersFile.content.includes('from typing import'), 'Must contain typing import header');
  assert.ok(ordersFile.content.includes('List'), 'Must import List');
  assert.ok(ordersFile.content.includes('Dict'), 'Must import Dict');
  assert.ok(ordersFile.content.includes('Any'), 'Must import Any');
  assert.ok(ordersFile.content.includes('Optional'), 'Must import Optional');

  const recheck = await validateProjectContracts(files);
  const remainingTyping = recheck.defects.filter(d => d.code === 'MISSING_TYPING_IMPORT');
  assert.equal(remainingTyping.length, 0, 'Zero MISSING_TYPING_IMPORT defects after auto-heal');
});

test('AGENT 6 CHECKLIST 5: Startup Files & Credential Boundary Enforcement', async () => {
  // Test missing startup file detection
  const incompleteFiles = [
    { path: 'backend/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' }
  ];
  const startupCheck = await validateProjectContracts(incompleteFiles);
  const missingReadme = startupCheck.defects.find(d => d.code === 'MISSING_STARTUP_FILE' && d.file === 'README.md');
  const missingReqs = startupCheck.defects.find(d => d.code === 'MISSING_STARTUP_FILE' && d.file === 'backend/requirements.txt');
  assert.ok(missingReadme, 'Missing README.md must trigger MISSING_STARTUP_FILE');
  assert.ok(missingReqs, 'Missing backend/requirements.txt must trigger MISSING_STARTUP_FILE');

  // Test credential boundary scanning
  const cleanFile = { path: 'backend/app/config.py', content: 'SECRET_KEY = os.getenv("SECRET_KEY", "default-dev")' };
  const leakedFile = { path: 'backend/app/config.py', content: 'SECRET_KEY = "prod_super_secret_jwt_key_99999"' };
  assert.equal(scanForCredentials(cleanFile).length, 0, 'Clean file must pass credential scan');
  assert.ok(scanForCredentials(leakedFile).length > 0, 'File with real credential token must be flagged');
});

test('AGENT 6 CHECKLIST 6: Authoritative Gate Rejection & Truthful Failure Preservation', async () => {
  const previousState = {
    status: 'PASS',
    failedGates: []
  };

  const failedRun = {
    failedGates: ['backend_runtime', 'api_contract_verification'],
    errors: ['Endpoint /api/cart not responding', 'Schema validation failed']
  };

  const preserved = preserveFailedCompletionGate(previousState, failedRun);
  assert.equal(preserved.status, 'FAIL', 'Status must be strictly FAIL on gate failure');
  assert.deepEqual(preserved.failedGates, ['backend_runtime', 'api_contract_verification'], 'Must preserve all failed gate IDs');
});

test('AGENT 6 CHECKLIST 7: Schema Repair Feeds Schema File Missing Names and Verifies They Are Added', async () => {
  const schemaFile = {
    path: 'backend/app/schemas/order.py',
    content: `from pydantic import BaseModel\n\nclass OrderBase(BaseModel):\n    total: float\n`
  };
  const apiFile = {
    path: 'backend/app/api/orders.py',
    content: `from fastapi import APIRouter\nfrom app.schemas.order import OrderCreate, OrderUpdate, OrderResponse\nrouter = APIRouter()\n`
  };
  const files = [
    schemaFile,
    apiFile,
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  // Feed schema file missing names (OrderCreate, OrderUpdate, OrderResponse)
  assert.ok(!schemaFile.content.includes('OrderCreate'), 'Initial schema must be missing OrderCreate');
  assert.ok(!schemaFile.content.includes('OrderUpdate'), 'Initial schema must be missing OrderUpdate');
  assert.ok(!schemaFile.content.includes('OrderResponse'), 'Initial schema must be missing OrderResponse');

  const healed = autoHealProjectContracts(files, []);
  assert.equal(healed, true, 'autoHeal must synthesize missing schema names');

  // Verify missing names are added
  assert.ok(schemaFile.content.includes('class OrderCreate(BaseModel):'), 'OrderCreate must be added to schemas');
  assert.ok(schemaFile.content.includes('class OrderUpdate(BaseModel):'), 'OrderUpdate must be added to schemas');
  assert.ok(schemaFile.content.includes('class OrderResponse(BaseModel):'), 'OrderResponse must be added to schemas');
});

