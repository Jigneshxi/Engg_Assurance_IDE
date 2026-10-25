import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import JSZip from 'jszip';
import { validateProjectContracts } from '../projectContractValidator.js';
import { repairProjectContracts, wireApplicationFromContract } from '../integrationContract.js';
import { validateFrontendDependencies, validateComponentImportsAndCasing } from '../frontendContractValidator.js';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { evaluateFinalCompletionGate } from '../orchestrator.js';
import { verifyApiRegistration } from '../backendRuntimeValidator.js';

const file = (path, content) => ({ path, content, status: 'validated' });
const base = [
  file('README.md', '# QuickCart'),
  file('backend/requirements.txt', 'fastapi\nsqlalchemy\nuvicorn\npytest'),
  file('frontend/package.json', JSON.stringify({
    name: 'frontend',
    dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'lucide-react': '^0.263.0' }
  })),
  file('frontend/index.html', '<div id="root"></div>')
];

test('Defect 1: wireApplicationFromContract mounts only contract-declared routes', async () => {
  const main = file('backend/main.py', `from fastapi import FastAPI
app = FastAPI()
`);
  const cartApi = file('backend/app/api/cart.py', `from fastapi import APIRouter
router = APIRouter()
@router.post("/add")
def add_to_cart():
    return {"status": "ok"}
`);
  const authApi = file('backend/app/api/auth.py', `from fastapi import APIRouter
router = APIRouter()
@router.post("/login")
def login():
    return {"token": "xyz"}
`);
  const files = [main, cartApi, authApi];
  await wireApplicationFromContract(files, { schemaVersion: 2, endpoints: [
    { backendFile: 'backend/app/api/cart.py', routerPrefix: '/api/cart', path: '/api/cart/add' },
    { backendFile: 'backend/app/api/auth.py', routerPrefix: '/api/auth', path: '/api/auth/login' }
  ] });
  assert(main.content.includes("prefix='/api/cart'") || main.content.includes('prefix="/api/cart"'), 'cart router should mount at /api/cart');
  assert(main.content.includes("prefix='/api/auth'") || main.content.includes('prefix="/api/auth"'), 'auth router should mount at /api/auth');
});

test('Defect 2: detects checkout request missing required body and keeps it blocked', async () => {
  const models = file('backend/app/db/models.py', `from app.db.database import Base
from sqlalchemy import Column, Integer, Float
class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True)
`);
  const schemas = file('backend/app/schemas/order.py', `from pydantic import BaseModel
from typing import List, Any
class OrderCreate(BaseModel):
    items: List[Any]
`);
  const ordersApi = file('backend/app/api/orders.py', `from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.order import OrderCreate
router = APIRouter()
@router.post("/checkout")
def create_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    return {"status": "created"}
`);
  const main = file('backend/main.py', `from fastapi import FastAPI
from app.api.orders import router as orders_router
app = FastAPI()
app.include_router(orders_router, prefix="/api")
`);
  const checkoutCaller = file('frontend/src/Checkout.tsx', `import api from './api/client';
export async function submitCheckout() {
    return await api.post('/api/checkout');
}
`);
  const files = [...base, models, schemas, ordersApi, main, checkoutCaller];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'API_REQUEST_MISMATCH'), 'should flag checkout request without body');

  const repairRes = await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(!ordersApi.content.includes('Optional[OrderCreate]'), 'repair must not weaken the required checkout contract');
  assert(repairRes.defects.some(d => d.code === 'API_REQUEST_MISMATCH'), 'unresolved request mismatch must remain visible');
});

test('Defect 3: detects missing typing import and keeps the defect visible', async () => {
  const ordersApi = file('backend/app/api/orders.py', `from fastapi import APIRouter
router = APIRouter()
@router.get("/orders")
def list_orders(current_user: Any):
    return []
`);
  const files = [...base, ordersApi];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'MISSING_TYPING_IMPORT'), 'should detect missing Any import');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(ordersApi.content.includes('from typing import') || res.defects.some(d => d.code === 'MISSING_TYPING_IMPORT'));
});

test('Defect 4: detects current_user.id attribute access on dict without inventing an identity model', async () => {
  const authApi = file('backend/app/api/auth.py', `from fastapi import APIRouter
router = APIRouter()
def get_current_user():
    return {"id": 1, "username": "test"}
`);
  const ordersApi = file('backend/app/api/orders.py', `from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
router = APIRouter()
@router.get("/orders")
def list_orders(current_user = Depends(get_current_user)):
    user_id = current_user.id
    return []
`);
  const files = [...base, authApi, ordersApi];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'USER_OBJECT_DICT_MISMATCH'), 'should detect dict attribute access mismatch');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(!authApi.content.includes('class CurrentUser') && !ordersApi.content.includes('current_user.get'), 'repair must not invent a user identity shape');
  assert(res.defects.some(d => d.code === 'USER_OBJECT_DICT_MISMATCH'));
});

test('Defect 5: detects hardcoded auth tokens and preserves the failure until a valid repair', async () => {
  const authApi = file('backend/app/api/auth.py', `from fastapi import APIRouter
router = APIRouter()
@router.post("/login")
def login():
    return {"access_token": "YOUR_ACCESS_TOKEN", "token_type": "bearer"}
`);
  const files = [...base, authApi];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'HARDCODED_AUTH_TOKEN'), 'should detect placeholder token');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(authApi.content.includes('YOUR_ACCESS_TOKEN'), 'no valid repair was supplied, so the defect stays visible');
  assert(res.defects.some(d => d.code === 'HARDCODED_AUTH_TOKEN'));
});

test('Defect 6: detects unflushed parent model instance and does not guess transaction behavior', async () => {
  const ordersApi = file('backend/app/api/orders.py', `from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Order, OrderItem
router = APIRouter()
@router.post("/orders")
def create_order(db: Session = Depends(get_db)):
    order = Order(status="PENDING")
    db.add(order)
    item = OrderItem(order_id=order.id)
    db.add(item)
    db.commit()
    return order
`);
  const files = [...base, ordersApi];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'UNFLUSHED_PARENT_ID'), 'should detect unflushed parent id');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(ordersApi.content.includes('db.flush()') || res.defects.some(d => d.code === 'UNFLUSHED_PARENT_ID'));
});

test('Defect 7: detects cart logic misusing OrderItem without fabricating CartItem behavior', async () => {
  const models = file('backend/app/db/models.py', `from app.db.database import Base
from sqlalchemy import Column, Integer, ForeignKey
class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
`);
  const cartApi = file('backend/app/api/cart.py', `from fastapi import APIRouter, Depends
from app.db.models import OrderItem
from app.api.auth import get_current_user
router = APIRouter()
@router.post("/add")
def add_to_cart(current_user = Depends(get_current_user)):
    item = OrderItem(order_id=current_user.id)
    return {"status": "ok"}
`);
  const files = [...base, models, cartApi];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'CART_ORDER_MODEL_MISUSE'), 'should detect OrderItem misuse in cart');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(res.defects.some(d => d.code === 'CART_ORDER_MODEL_MISUSE') || cartApi.content.includes('/api/cart'));
});

test('Defect 8: detects App.tsx importing from non-existent components and keeps it blocked', async () => {
  const homePage = file('frontend/src/pages/HomePage.tsx', `export default function HomePage() { return <div>Home</div>; }`);
  const cartPage = file('frontend/src/pages/CartPage.tsx', `export default function CartPage() { return <div>Cart</div>; }`);
  const appTsx = file('frontend/src/App.tsx', `import HomePage from './components/HomePage';
import CartPage from './Cart';
export default function App() { return <div><HomePage/><CartPage/></div>; }
`);
  const files = [...base, homePage, cartPage, appTsx];
  const res = validateComponentImportsAndCasing(files);
  assert(res.defects.some(d => d.subtype === 'COMPONENT_NOT_FOUND'), 'should flag missing component import');

  await repairProjectContracts(files, {
    validate: async f => {
      const v = validateComponentImportsAndCasing(f);
      return { isValid: v.defects.length === 0, defects: v.defects, errors: v.errors };
    },
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(appTsx.content.includes("from './components/HomePage'"), 'no valid patch was supplied, so the import remains unresolved');
  assert(appTsx.content.includes("from './Cart'"));
  assert(!validateComponentImportsAndCasing(files).isValid);
});

test('Defect 9: detects @lucide/react and keeps the unavailable package blocked', async () => {
  const pkg = file('frontend/package.json', JSON.stringify({
    dependencies: { react: '^18.2.0', '@lucide/react': '^0.263.0' }
  }));
  const page = file('frontend/src/pages/Home.tsx', `import { ShoppingBag } from '@lucide/react';
export default function Home() { return <ShoppingBag />; }
`);
  const files = [file('README.md', 'Setup'), pkg, file('frontend/index.html', '<div id="root"></div>'), page];
  const res = validateFrontendDependencies(files);
  assert(res.defects.some(d => d.subtype === 'PACKAGE_NAME_MISMATCH'), 'should detect @lucide/react package mismatch');

  await repairProjectContracts(files, {
    validate: async f => {
      const v = validateFrontendDependencies(f);
      return { isValid: v.defects.length === 0, defects: v.defects, errors: v.errors };
    },
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(pkg.content.includes('"@lucide/react"'));
  assert(page.content.includes("from '@lucide/react'"));
  assert(validateFrontendDependencies(files).defects.some(d => d.subtype === 'PACKAGE_NAME_MISMATCH'));
});

test('Defect 10: detects hardcoded localhost URLs and keeps the deployment defect visible', async () => {
  const clientTs = file('frontend/src/api/client.ts', `import axios from 'axios';
const api = axios.create({ baseURL: 'http://localhost:8000/api' });
export default api;
`);
  const files = [...base, clientTs];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'HARDCODED_API_URL'), 'should detect hardcoded localhost URL');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(clientTs.content.includes('http://localhost:8000'));
  assert(res.defects.some(d => d.code === 'HARDCODED_API_URL'));
});

test('Defect 11: detects port 3000 in playwright.config.ts and keeps the mismatch visible', async () => {
  const pwCfg = file('frontend/playwright.config.ts', `import { defineConfig } from '@playwright/test';
export default defineConfig({
  baseURL: 'http://localhost:3000',
  webServer: { command: 'npm run start', port: 3000 }
});
`);
  const files = [...base, pwCfg];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'PLAYWRIGHT_PORT_MISMATCH'), 'should detect port 3000 in playwright config');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(pwCfg.content.includes('3000'));
  assert(res.defects.some(d => d.code === 'PLAYWRIGHT_PORT_MISMATCH'));
});

test('Defect 12: detects vacuous and unawaited browser test assertions and keeps them blocked', async () => {
  const testSpec = file('frontend/tests/workflows.spec.ts', `import { test, expect } from '@playwright/test';
test('REQ-001 journey', async ({ page }) => {
  await page.goto('/');
  expect(page).toBeDefined();
  const card = page.locator('.card');
  expect(card).toBeVisible();
});
`);
  const files = [...base, testSpec];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'VACUOUS_BROWSER_TEST'), 'should detect expect(page).toBeDefined()');
  assert(res.defects.some(d => d.code === 'UNAWAITED_BROWSER_ASSERTION'), 'should detect unawaited expect().toBeVisible()');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(testSpec.content.includes('await expect') || testSpec.content.includes('toBeDefined()'));
});

test('Defect 13: detects broad status code assertions and keeps them blocked', async () => {
  const testFile = file('backend/tests/test_workflows.py', `def test_checkout(client):
    res = client.post("/api/checkout")
    assert res.status_code in (200, 201, 401, 404, 422)
`);
  const files = [...base, testFile];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'BROAD_STATUS_CODE_ASSERTION'), 'should detect broad status code check');

  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 1
  });
  assert(testFile.content.includes('(200, 201)') || testFile.content.includes('422'));
});

test('Defect 14: detects generic requirement tests querying /api/products', async () => {
  const testFile = file('backend/tests/test_workflows.py', `def test_REQ_005_cart_checkout(client):
    res = client.get("/api/products")
    assert res.status_code == 200
`);
  const files = [...base, testFile];
  const res = await validateProjectContracts(files);
  assert(res.defects.some(d => d.code === 'GENERIC_REQUIREMENT_TEST'), 'should detect generic products query for cart requirement');
});

test('Defect 15: workspace scaffolds provide conftest.py with setup and seed fixtures', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
  try {
    const files = [
      file('backend/main.py', 'from fastapi import FastAPI\napp = FastAPI()'),
      file('frontend/src/App.tsx', 'export default function App() { return <div>App</div>; }')
    ];
    writeWorkspaceAndScaffolds(tmpDir, files);
    const conftest = files.find(f => f.path === 'backend/conftest.py');
    assert(conftest, 'conftest.py should be scaffolded');
    assert(conftest.content.includes('setup_and_seed_db'), 'conftest.py should include autouse setup and seed fixture');
    assert(conftest.content.includes('Test Product'), 'conftest.py should seed test product');

    const clientTs = files.find(f => f.path === 'frontend/src/api/client.ts');
    assert(clientTs, 'canonical client.ts should be scaffolded');
    assert(clientTs.content.includes('VITE_API_URL'), 'canonical client.ts should use VITE_API_URL');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Defect 16: router prefix validation detects unmounted or mismatched router prefixes', async () => {
  const main = file('backend/main.py', `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
app.include_router(products_router, prefix="/api")
`);
  const productsApi = file('backend/app/api/products.py', `from fastapi import APIRouter
router = APIRouter()
@router.get("")
def list_products():
    return []
`);
  const files = [main, productsApi];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_PREFIX_MISMATCH'), 'Router mounted with /api should fail when /api/products is required');
});

test('Integration Fixture: project_test42a.zip contract validation, repair, and gate verification', async (t) => {
  const candidatePaths = [
    path.resolve('docs/11-prd-tests/project_test42a.zip'),
    path.resolve('Prd test_a1.zip'),
    path.resolve('fixtures/project_test42a.zip')
  ];
  const zipPath = candidatePaths.find(p => fs.existsSync(p));
  if (!zipPath) {
    if (t && typeof t.skip === 'function') {
      t.skip('Specimen project_test42a.zip fixture not present in workspace');
      return;
    }
    return;
  }
  const buffer = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  const files = [];
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      const content = await entry.async('string');
      files.push(file(relativePath, content));
    }
  }
  assert(files.length > 0, 'Loaded files from project_test42a.zip');

  // 1. Run project contract validation on raw artifact
  const initialValidation = await validateProjectContracts(files);
  assert(!initialValidation.isValid, 'Original test42a artifact must fail project contract validation');

  // Confirm failed gates are detected
  const initialGate = evaluateFinalCompletionGate({
    generationBoundaryPassed: false,
    importClosurePassed: false,
    frontendContractPassed: false,
    backendRuntimePassed: false,
    apiAuthzPassed: false,
    prdCoveragePassed: false
  });
  assert(!initialGate.isPassed, 'Original 6 failed gates must fail final completion gate');
  for (const expectedGate of ['generationBoundary', 'importClosure', 'frontendContract', 'backendRuntime', 'apiAuthz', 'prdCoverage']) {
    assert(initialGate.failedGates.includes(expectedGate), `Gate ${expectedGate} must be failed`);
  }

  // 2. Apply deterministic repairs
  await repairProjectContracts(files, {
    validate: f => validateProjectContracts(f),
    caller: async () => '{"files":[]}',
    maxRounds: 2
  });

  // 3. Validate again
  const postRepairValidation = await validateProjectContracts(files);

  // 4. Confirm unresolved semantic defects or missing live evidence still block verification
  // The artifact cannot be marked verified without backend, frontend, browser, and PRD evidence pass!
  const unverifiedGate = evaluateFinalCompletionGate({
    allModulesPassed: postRepairValidation.isValid,
    semanticValid: postRepairValidation.isValid,
    fileCompletenessPassed: true,
    importClosurePassed: true,
    frontendContractPassed: postRepairValidation.isValid,
    backendRuntimePassed: false, // not executed / failed
    apiAuthzPassed: false,       // not proven
    prdCoveragePassed: false,    // not proven
    browserE2ePassed: false      // browser evidence not executed
  });
  assert(!unverifiedGate.isPassed, 'Artifact must not be marked verified without backend, frontend, browser, and PRD evidence pass');
});

