import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sliceContractForModule,
  enforceRelativeRouterPaths,
  enforceSingleFastApiEntrypoint,
  generateFrontendApiClientCode,
  ensureAheadOfTimeApiClient
} from '../../server/contractFirstEngine.js';

const sampleContract = {
  schemaVersion: 2,
  endpoints: [
    {
      method: 'GET',
      path: '/api/products',
      backendFile: 'backend/app/api/products.py',
      routerPrefix: '/api/products',
      routerPath: '',
      auth: 'public',
      requestFields: [],
      responseSchema: 'ProductListResponse'
    },
    {
      method: 'GET',
      path: '/api/products/{id}',
      backendFile: 'backend/app/api/products.py',
      routerPrefix: '/api/products',
      routerPath: '/{id}',
      auth: 'public',
      requestFields: [],
      responseSchema: 'ProductResponse'
    },
    {
      method: 'POST',
      path: '/api/cart',
      backendFile: 'backend/app/api/cart.py',
      routerPrefix: '/api/cart',
      routerPath: '',
      auth: 'user',
      requestSchema: 'CartItemCreate',
      requestFields: ['product_id', 'quantity'],
      responseSchema: 'CartResponse'
    },
    {
      method: 'POST',
      path: '/api/orders',
      backendFile: 'backend/app/api/orders.py',
      routerPrefix: '/api/orders',
      routerPath: '',
      auth: 'user',
      requestSchema: 'OrderCreate',
      requestFields: ['items', 'shipping_address_id'],
      responseSchema: 'OrderResponse'
    }
  ],
  schemas: [
    { name: 'ProductListResponse', fields: ['items', 'total'] },
    { name: 'ProductResponse', fields: ['id', 'name', 'price'] },
    { name: 'CartItemCreate', fields: ['product_id', 'quantity'] },
    { name: 'CartResponse', fields: ['items', 'total'] },
    { name: 'OrderCreate', fields: ['items', 'shipping_address_id'] },
    { name: 'OrderResponse', fields: ['id', 'status', 'total'] }
  ],
  workflows: [
    { testFile: 'backend/tests/test_workflows.py', runner: 'pytest', requirementIds: ['REQ-001'] }
  ]
};

test('Step 5(a): Slice contract.json per module contains only related endpoints and schemas', () => {
  const productModule = {
    id: 'MOD-PROD-001',
    name: 'Products Module',
    required_files: [{ path: 'backend/app/api/products.py' }]
  };

  const slice = sliceContractForModule(sampleContract, productModule, 'backend/app/api/products.py');

  // Verify product endpoints are included
  assert.equal(slice.endpoints.length, 2, 'Should contain exactly 2 product endpoints');
  assert.ok(slice.endpoints.every(ep => ep.backendFile === 'backend/app/api/products.py'), 'All endpoints belong to products.py');

  // Verify product schemas are included
  const schemaNames = slice.schemas.map(s => s.name);
  assert.ok(schemaNames.includes('ProductListResponse'), 'Includes ProductListResponse schema');
  assert.ok(schemaNames.includes('ProductResponse'), 'Includes ProductResponse schema');

  // PROVE: Cart and Orders endpoints & schemas are strictly excluded
  assert.ok(!slice.endpoints.some(ep => ep.path.includes('/cart')), 'Cart endpoints strictly excluded from Products slice');
  assert.ok(!slice.endpoints.some(ep => ep.path.includes('/orders')), 'Orders endpoints strictly excluded from Products slice');
  assert.ok(!schemaNames.includes('CartItemCreate'), 'Cart schemas strictly excluded from Products slice');
  assert.ok(!schemaNames.includes('OrderCreate'), 'Order schemas strictly excluded from Products slice');
});

test('Step 5(b): Router path convention strips repeated mount prefix from route decorators', () => {
  const routerCode = `from fastapi import APIRouter
router = APIRouter()

@router.get("/api/products")
def list_products():
    return []

@router.get("/products/{id}")
def get_product(id: int):
    return {}

@router.post("/api/products")
def create_product(payload: dict):
    return {}
`;

  const cleaned = enforceRelativeRouterPaths(routerCode, 'products.py');

  assert.ok(!cleaned.includes('@router.get("/api/products")'), 'Strips /api/products prefix');
  assert.ok(!cleaned.includes('@router.get("/products/{id}")'), 'Strips /products prefix from detail route');
  assert.ok(!cleaned.includes('@router.post("/api/products")'), 'Strips /api/products prefix from POST route');

  assert.ok(cleaned.includes('@router.get("")'), 'Replaced with relative route path @router.get("")');
  assert.ok(cleaned.includes('@router.get("/{id}")'), 'Replaced with relative detail path @router.get("/{id}")');
  assert.ok(cleaned.includes('@router.post("")'), 'Replaced with relative post path @router.post("")');
});

test('Step 5(c): Single backend entrypoint enforces backend/app/main.py and converts root forwarders', () => {
  const files = [
    {
      path: 'backend/app/main.py',
      content: `from fastapi import FastAPI\napp = FastAPI()\n`
    },
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\napp = FastAPI()\n`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import FastAPI\napp = FastAPI()\n`
    }
  ];

  enforceSingleFastApiEntrypoint(files);

  const appMain = files.find(f => f.path === 'backend/app/main.py');
  assert.ok(appMain.content.includes('app = FastAPI()'), 'Canonical entrypoint retains app = FastAPI()');

  const rootMain = files.find(f => f.path === 'backend/main.py');
  assert.ok(!rootMain.content.includes('app = FastAPI()'), 'Root main.py stripped of duplicate app = FastAPI()');
  assert.ok(rootMain.content.includes('from app.main import app'), 'Root main.py converted to forwarder from app.main');

  const routerFile = files.find(f => f.path === 'backend/app/api/products.py');
  assert.ok(!routerFile.content.includes('app = FastAPI()'), 'Router stripped of duplicate app = FastAPI()');
  assert.ok(routerFile.content.includes('router = APIRouter()'), 'Router converted to APIRouter');
});

test('Step 5(d): Ahead-of-time client generation generates typed API client matching contract.json', () => {
  const clientCode = generateFrontendApiClientCode(sampleContract);

  // Verifies base URL and token headers
  assert.ok(clientCode.includes('VITE_API_URL'), 'Client uses VITE_API_URL environment configuration');
  assert.ok(clientCode.includes('Authorization'), 'Client attaches Authorization header with Bearer token');

  // Verifies resource endpoint groups are generated
  assert.ok(clientCode.includes('products: {'), 'Generates products API group');
  assert.ok(clientCode.includes('cart: {'), 'Generates cart API group');
  assert.ok(clientCode.includes('orders: {'), 'Generates orders API group');

  // Verifies memory registration in ensureAheadOfTimeApiClient
  const files = [];
  const registered = ensureAheadOfTimeApiClient(sampleContract, null, files);
  assert.ok(registered, 'Client is created and registered');
  assert.equal(registered.path, 'frontend/src/api/client.ts');
  assert.equal(registered.status, 'validated');
});
