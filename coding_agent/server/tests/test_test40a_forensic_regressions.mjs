import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProjectContracts, extractFrontendRequests } from '../projectContractValidator.js';
import { normalizeIntegrationContract, autoHealProjectContracts, wireApplicationFromContract } from '../integrationContract.js';
import { resolveSharedPython } from '../pythonEnvironment.js';

const file = (path, content) => ({ path, content, status: 'validated' });

const baseFiles = [
  file('README.md', '# QuickCart'),
  file('backend/requirements.txt', 'fastapi\npydantic\nsqlalchemy'),
  file('frontend/package.json', '{"name":"quickcart"}'),
  file('frontend/index.html', '<div id="root"></div>')
];

// Helper to invoke wireApplication.py
function runWire(source, endpoints) {
  if (!resolveSharedPython()) {
    const files = [{ path: 'backend/main.py', content: source }];
    return wireApplicationFromContract(files, { schemaVersion: 2, endpoints }).then(() => files[0].content);
  }
  return new Promise((resolve, reject) => {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = fileURLToPath(new URL('../wireApplication.py', import.meta.url));
    const child = spawn(py, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { error += d; });
    child.on('close', code => {
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) reject(new Error(parsed.error));
        else resolve(parsed.content);
      } catch (e) {
        reject(new Error(`Wire exited with code ${code}: ${error || output}`));
      }
    });
    child.stdin.end(JSON.stringify({ source, endpoints }));
  });
}

// -------------------------------------------------------------------------------------------------
// Defect 1: Frontend ${API_BASE_URL}/api/... incorrectly becomes {param}/api/...
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 1: Frontend template literal with API base URL extracts as /api/... and matches route', async () => {
  const adminPage = file('frontend/src/pages/AdminDashboard.tsx', `
import axios from 'axios';
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
export async function getDashboard() {
  return await axios.get(\`\${API_BASE_URL}/api/admin/dashboard\`);
}
export async function deleteProduct(productId: number) {
  return await axios.delete(\`\${API_BASE_URL}/api/admin/products/\${productId}\`);
}
  `);

  const requests = extractFrontendRequests([adminPage]);
  assert.equal(requests.length, 2);

  // VERIFIED CORRECTED BEHAVIOR:
  // Base URL is stripped; path starts at /api/admin/dashboard
  assert.equal(requests[0].path, '/api/admin/dashboard', 'Base URL correctly stripped from static API path');
  // Dynamic path parameter after /api/ is preserved as {param}
  assert.equal(requests[1].path, '/api/admin/products/{param}', 'Dynamic path parameter preserved after /api/');

  const backend = [
    file('backend/main.py', `
from fastapi import FastAPI
from app.api.admin import router as admin_router
app = FastAPI()
app.include_router(admin_router, prefix="/api")
    `),
    file('backend/app/api/admin.py', `
from fastapi import APIRouter
router = APIRouter()
@router.get("/admin/dashboard")
def get_dashboard():
    total_users = 10
    return {"status": "ok", "total_users": total_users}
@router.delete("/admin/products/{product_id}")
def delete_product(product_id: int):
    status = "deleted"
    return {"status": status, "id": product_id}
    `)
  ];

  const valResult = await validateProjectContracts([...baseFiles, adminPage, ...backend]);
  assert.equal(
    valResult.defects.filter(d => d.code === 'API_ROUTE_MISMATCH').length,
    0,
    'Zero route mismatches for normalized template literal API requests'
  );
});

// -------------------------------------------------------------------------------------------------
// Defect 2: Generic action word 'add' causes /api/cart/add to falsely bind to addresses.py
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 2: cleanEndpoints resolves /api/cart/add to products.py using domain affinity, not addresses.py via "add"', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-API',
        required_files: [
          { path: 'backend/app/api/addresses.py' },
          { path: 'backend/app/api/products.py' }
        ]
      }
    ],
    workflows: []
  };

  const contract = {
    schemaVersion: 2,
    endpoints: [
      {
        method: 'POST',
        path: '/api/cart/add',
        requestFields: ['product_id', 'quantity'],
        responseFields: ['id', 'status']
      },
      {
        method: 'POST',
        path: '/api/addresses/add',
        requestFields: ['street', 'city'],
        responseFields: ['id', 'status']
      }
    ],
    workflows: [
      { testFile: 'backend/tests/test_flow.py', runner: 'pytest', requirementIds: ['REQ-001'] }
    ]
  };

  const normalized = normalizeIntegrationContract(contract, manifest);
  const cartEp = normalized.endpoints.find(e => e.path === '/api/cart/add');
  assert.ok(cartEp, 'Endpoint /api/cart/add present in cleaned contract');

  // VERIFIED CORRECTED BEHAVIOR:
  // /api/cart/add domain is 'cart' which has affinity with products.py; stem 'add' does NOT substring match addresses.py
  assert.equal(cartEp.backendFile, 'backend/app/api/products.py', 'Correctly resolved /api/cart/add to products.py via domain affinity');

  const addrEp = normalized.endpoints.find(e => e.path === '/api/addresses/add');
  assert.ok(addrEp, 'Endpoint /api/addresses/add present in cleaned contract');
  assert.equal(addrEp.backendFile, 'backend/app/api/addresses.py', 'Correctly resolved /api/addresses/add to addresses.py via exact stem');
});

// -------------------------------------------------------------------------------------------------
// Defect 3: orders.py querying OrderItem for Product fields triggers SCHEMA_FIELD_MISMATCH
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 3: autoHeal repairs db.query(OrderItem) to Product and satisfies SCHEMA_FIELD_MISMATCH', async () => {
  const models = file('backend/app/db/models.py', `
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.db.database import Base

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    stock_quantity = Column(Integer)

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer)
    product_id = Column(Integer)
    quantity = Column(Integer)
    unit_price = Column(Float)
  `);

  const orders = file('backend/app/api/orders.py', `
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import OrderItem

router = APIRouter()

@router.post("/orders")
def create_order(item_id: int, db: Session = Depends(get_db)):
    product = db.query(OrderItem).filter(OrderItem.id == item_id).first()
    if product.stock_quantity < 1:
        return {"error": "out of stock"}
    return {"name": product.name}
  `);

  const main = file('backend/main.py', 'from fastapi import FastAPI\nfrom app.api.orders import router\napp = FastAPI()\napp.include_router(router, prefix="/api")');

  const result = await validateProjectContracts([
    ...baseFiles,
    models,
    orders,
    main
  ]);

  const defects = result.defects.filter(d => d.code === 'SCHEMA_FIELD_MISMATCH');
  assert(defects.length > 0, 'Initial code triggers SCHEMA_FIELD_MISMATCH');

  // VERIFIED CORRECTED BEHAVIOR:
  // autoHealProjectContracts fixes OrderItem query to Product and imports Product
  const files = [models, { ...orders }, main];
  const changed = autoHealProjectContracts(files, defects, () => {});
  assert.equal(changed, true, 'autoHealProjectContracts healed schema mismatch');
  assert(files[1].content.includes('db.query(Product).filter(Product.id == item_id)'), 'Query corrected to Product');
  assert(files[1].content.includes('Product'), 'Product imported');

  const recheck = await validateProjectContracts(files);
  const recheckDefects = recheck.defects.filter(d => d.code === 'SCHEMA_FIELD_MISMATCH');
  assert.equal(recheckDefects.length, 0, 'Zero SCHEMA_FIELD_MISMATCH defects after auto-heal');
});

// -------------------------------------------------------------------------------------------------
// Defect 4: Multiple commits in multi-record order workflow trigger NON_ATOMIC_WORKFLOW
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 4: autoHeal replaces intermediate commits with db.flush() resolving NON_ATOMIC_WORKFLOW', async () => {
  const orders = file('backend/app/api/orders.py', `
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db

router = APIRouter()

@router.post("/orders")
def create_order(items: list, db: Session = Depends(get_db)):
    for item in items:
        pass
    db.commit()
    for item in items:
        pass
    db.commit()
    return {"status": "ok"}
  `);

  const main = file('backend/main.py', 'from fastapi import FastAPI\nfrom app.api.orders import router\napp = FastAPI()\napp.include_router(router, prefix="/api")');

  const result = await validateProjectContracts([
    ...baseFiles,
    orders,
    main
  ]);

  const nonAtomicDefect = result.defects.find(d => d.code === 'NON_ATOMIC_WORKFLOW');
  assert.ok(nonAtomicDefect, 'Initial code triggers NON_ATOMIC_WORKFLOW');

  // VERIFIED CORRECTED BEHAVIOR:
  // autoHealProjectContracts replaces intermediate commits with flush, leaving exactly 1 atomic commit
  const files = [{ ...orders }, main];
  const changed = autoHealProjectContracts(files, [nonAtomicDefect], () => {});
  assert.equal(changed, true, 'autoHeal healed NON_ATOMIC_WORKFLOW');
  assert(files[0].content.includes('db.flush()'), 'Intermediate commit replaced with db.flush()');

  const recheck = await validateProjectContracts(files);
  const recheckNonAtomic = recheck.defects.filter(d => d.code === 'NON_ATOMIC_WORKFLOW');
  assert.equal(recheckNonAtomic.length, 0, 'Zero NON_ATOMIC_WORKFLOW defects after auto-heal');
});

// -------------------------------------------------------------------------------------------------
// Defect 5: Missing GET /api/orders when orders.py declares @router.get("/list")
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 5: autoHeal maps root @router.get("") and @router.get("/") resolving missing GET /api/orders', async () => {
  const orders = file('backend/app/api/orders.py', `
from fastapi import APIRouter
router = APIRouter()
@router.get("/list")
def list_orders():
    return [{"id": 1}]
  `);

  const main = file('backend/main.py', `
from fastapi import FastAPI
from app.api.orders import router as orders_router
app = FastAPI()
app.include_router(orders_router, prefix="/api/orders")
  `);

  const contract = {
    schemaVersion: 2,
    endpoints: [
      { method: 'GET', path: '/api/orders', backendFile: 'backend/app/api/orders.py', requestFields: [], responseFields: [] }
    ]
  };

  const result = await validateProjectContracts([...baseFiles, orders, main], { integrationContract: contract });
  const missingEp = result.defects.find(d => d.code === 'PLANNED_ENDPOINT_MISSING' && d.message.includes('GET /api/orders'));
  assert.ok(missingEp, 'Initial code misses contracted GET /api/orders');

  // VERIFIED CORRECTED BEHAVIOR:
  // autoHealProjectContracts adds root route decorators to list_orders
  const files = [{ ...orders }, main];
  const changed = autoHealProjectContracts(files, [missingEp], () => {});
  assert.equal(changed, true, 'autoHeal healed missing GET /api/orders');
  assert(files[0].content.includes('@router.get("")'), 'Root route alias added');

  const recheck = await validateProjectContracts(files, { integrationContract: contract });
  const recheckMissing = recheck.defects.filter(d => d.code === 'PLANNED_ENDPOINT_MISSING' && d.message.includes('GET /api/orders'));
  assert.equal(recheckMissing.length, 0, 'Zero PLANNED_ENDPOINT_MISSING defects after auto-heal');
});

// -------------------------------------------------------------------------------------------------
// Defect 6: Missing auth guards on cart, checkout, and admin routes trigger API_AUTH_POLICY_MISMATCH
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 6: autoHeal injects required auth dependencies resolving API_AUTH_POLICY_MISMATCH', async () => {
  const products = file('backend/app/api/products.py', `
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db

router = APIRouter()

@router.get("/cart")
def get_cart(db: Session = Depends(get_db)):
    return []

@router.post("/checkout")
def checkout(db: Session = Depends(get_db)):
    return {"status": "ok"}

@router.get("/admin/products")
def admin_products(db: Session = Depends(get_db)):
    return []
  `);

  const main = file('backend/main.py', `
from fastapi import FastAPI
from app.api.products import router
app = FastAPI()
app.include_router(router, prefix="/api")
  `);

  const contract = {
    schemaVersion: 2,
    endpoints: [
      { method: 'GET', path: '/api/cart', backendFile: 'backend/app/api/products.py', auth: 'user', requestFields: [], responseFields: [] },
      { method: 'POST', path: '/api/checkout', backendFile: 'backend/app/api/products.py', auth: 'user', requestFields: [], responseFields: [] },
      { method: 'GET', path: '/api/admin/products', backendFile: 'backend/app/api/products.py', auth: 'admin', requestFields: [], responseFields: [] }
    ]
  };

  const result = await validateProjectContracts([...baseFiles, products, main], { integrationContract: contract });
  const authDefects = result.defects.filter(d => d.code === 'API_AUTH_POLICY_MISMATCH');
  assert.equal(authDefects.length, 3, 'Initial code triggers 3 API_AUTH_POLICY_MISMATCH defects');

  // VERIFIED CORRECTED BEHAVIOR:
  // autoHealProjectContracts injects required Depends(get_current_user) and Depends(get_current_admin)
  const files = [{ ...products }, main];
  const changed = autoHealProjectContracts(files, authDefects, () => {});
  assert.equal(changed, true, 'autoHeal healed API_AUTH_POLICY_MISMATCH defects');
  assert(files[0].content.includes('get_current_user'), 'User guard injected');
  assert(files[0].content.includes('get_current_admin'), 'Admin guard injected');

  const recheck = await validateProjectContracts(files, { integrationContract: contract });
  const recheckAuth = recheck.defects.filter(d => d.code === 'API_AUTH_POLICY_MISMATCH');
  assert.equal(recheckAuth.length, 0, 'Zero API_AUTH_POLICY_MISMATCH defects after auto-heal');
});

// -------------------------------------------------------------------------------------------------
// Defect 7: Router mounting produces duplicate prefixes (/api/cart/cart/add)
// -------------------------------------------------------------------------------------------------
test('FIX DEFECT 7: Wire application mounts router once at canonical prefix /api preventing duplicate prefixes', async () => {
  const initialMain = `
from fastapi import FastAPI
from app.api.products import router as products_router
app = FastAPI()
  `;

  const endpoints = [
    { backendFile: 'backend/app/api/products.py', routerPrefix: '/api/products' },
    { backendFile: 'backend/app/api/products.py', routerPrefix: '/api/cart' }
  ];

  const wiredSource = await runWire(initialMain, endpoints);

  // VERIFIED CORRECTED BEHAVIOR:
  // wireApplication collapses multiple subpath prefixes to canonical prefix='/api' and mounts router exactly once
  assert(wiredSource.includes("app.include_router(products_router, prefix='/api')"), 'products_router mounted once with canonical prefix /api');
  assert(!wiredSource.includes("prefix='/api/cart'"), 'products_router not mounted with conflicting subpath prefix /api/cart');

  // When products.py defines @router.post("/cart/add")
  const products = file('backend/app/api/products.py', `
from fastapi import APIRouter
router = APIRouter()
@router.post("/cart/add")
def add_to_cart():
    return {"status": "added"}
  `);

  const main = file('backend/main.py', wiredSource);
  const checkoutPage = file('frontend/src/pages/ProductDetailsPage.tsx', `
import axios from 'axios';
export async function addToCart() {
  return await axios.post('/api/cart/add', { id: 1 });
}
  `);

  const result = await validateProjectContracts([...baseFiles, products, main, checkoutPage]);

  // Because products_router is mounted at /api, @router.post("/cart/add") becomes /api/cart/add exactly
  const routeMismatch = result.defects.find(d => d.code === 'API_ROUTE_MISMATCH' && d.message.includes('POST /api/cart/add'));
  assert.equal(routeMismatch, undefined, 'Zero route mismatch for /api/cart/add when mounted with canonical prefix');
});
