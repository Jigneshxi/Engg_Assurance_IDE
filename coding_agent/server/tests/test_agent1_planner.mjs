import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRequirementContract,
  generateArchitectureContract,
  generateManifest,
  detectCircularDependencies
} from '../orchestrator.js';
import { validateManifestStructurally } from '../manifestValidator.js';
import { generateIntegrationContract, validateIntegrationContract } from '../integrationContract.js';

// Realistic multi-domain e-commerce PRD sample (QuickCart style)
const samplePRD = `
# QuickCart E-Commerce Platform PRD

## 1. Overview
A modern e-commerce web application featuring user authentication, product catalog, cart management, checkout, wishlist, and admin dashboard.

## 2. Functional Requirements
- REQ-AUTH-001: User registration and login with JWT bearer tokens.
- REQ-AUTH-002: Role-based access control with customer and admin roles.
- REQ-CAT-001: Browse products by category with price and rating filters.
- REQ-CART-001: Add products to cart, update quantity, and remove items.
- REQ-WISH-001: Add products to wishlist and remove from wishlist.
- REQ-ORD-001: Checkout cart items and create orders with shipping addresses.
- REQ-PAY-001: Process mock payments for created orders.
- REQ-ADM-001: Admin dashboard to manage products, categories, and view all orders.

## 3. API Endpoints
- POST /api/auth/register
- POST /api/auth/login
- GET /api/products
- GET /api/categories
- GET /api/cart
- POST /api/cart
- DELETE /api/cart/{item_id}
- GET /api/wishlist
- POST /api/wishlist
- DELETE /api/wishlist/{item_id}
- POST /api/orders/checkout
- GET /api/orders
- POST /api/payments/process
`;

function createPlannerMockLLM() {
  return async (systemPrompt, userPrompt) => {
    // 0. Semantic QA
    if (systemPrompt.includes('evaluating a generated project manifest') || userPrompt.includes('GENERATED MANIFEST:')) {
      return JSON.stringify({ isValid: true, errors: [] });
    }

    // 1. Requirement Contract Request
    if (systemPrompt.includes('JSON Requirement Contract')) {
      return JSON.stringify({
        requirements: [
          { id: "REQ-AUTH-001", description: "User registration and login with JWT", source: "Auth", type: "backend" },
          { id: "REQ-AUTH-002", description: "Role-based access control", source: "Auth", type: "backend" },
          { id: "REQ-CAT-001", description: "Browse products by category", source: "Catalog", type: "feature" },
          { id: "REQ-CART-001", description: "Add products to cart and update", source: "Cart", type: "feature" },
          { id: "REQ-WISH-001", description: "Wishlist management", source: "Wishlist", type: "feature" },
          { id: "REQ-ORD-001", description: "Checkout cart items into orders", source: "Orders", type: "feature" },
          { id: "REQ-PAY-001", description: "Process mock payments", source: "Payments", type: "backend" },
          { id: "REQ-ADM-001", description: "Admin dashboard management", source: "Admin", type: "frontend" }
        ]
      });
    }

    // 2. Architecture Contract Request
    if (systemPrompt.includes('Principal Enterprise Systems Architect') || userPrompt.includes('Generate Architecture Contract JSON:')) {
      return JSON.stringify({
        project_name: "quickcart",
        domain: "e-commerce",
        language: "python",
        backend_framework: "fastapi",
        frontend_framework: "react",
        database: "sqlite",
        orm: "sqlalchemy",
        auth_architecture: "jwt_bearer",
        api_prefix: "/api",
        entities: [
          { name: "Product", table: "products", fields: ["id", "name", "price"] },
          { name: "Category", table: "categories", fields: ["id", "name"] },
          { name: "Order", table: "orders", fields: ["id", "customer_id", "total_amount"] },
          { name: "Customer", table: "customers", fields: ["id", "email", "role"] }
        ]
      });
    }

    // 3. Manifest Generation Request
    if (systemPrompt.includes('JSON manifest containing the MODULES') || userPrompt.includes('Output Manifest JSON:')) {
      return JSON.stringify({
        project_id: "quickcart-ecommerce-platform",
        modules: [
          {
            id: "MOD-000",
            name: "Database Architecture & Schema",
            layer: "DATABASE",
            dependencies: [],
            required_files: [
              { path: "backend/app/db/models.py" },
              { path: "backend/app/db/database.py" }
            ]
          },
          {
            id: "MOD-001",
            name: "Backend Foundation",
            layer: "BACKEND_FOUNDATION",
            dependencies: ["MOD-000"],
            required_files: [
              { path: "backend/main.py" },
              { path: "backend/app/core/config.py" }
            ]
          },
          {
            id: "MOD-002",
            name: "Catalog & Products API",
            layer: "BACKEND",
            dependencies: ["MOD-001"],
            required_files: [
              { path: "backend/app/api/products.py" },
              { path: "backend/app/schemas/products.py" }
            ]
          },
          {
            id: "MOD-003",
            name: "Cart & Wishlist API",
            layer: "BACKEND",
            dependencies: ["MOD-001"],
            required_files: [
              { path: "backend/app/api/cart.py" },
              { path: "backend/app/schemas/cart.py" },
              { path: "backend/app/api/wishlist.py" },
              { path: "backend/app/schemas/wishlist.py" }
            ]
          },
          {
            id: "MOD-004",
            name: "Orders & Payments API",
            layer: "BACKEND",
            dependencies: ["MOD-001"],
            required_files: [
              { path: "backend/app/api/orders.py" },
              { path: "backend/app/schemas/orders.py" },
              { path: "backend/app/api/payments.py" },
              { path: "backend/app/schemas/payments.py" }
            ]
          },
          {
            id: "MOD-005",
            name: "Frontend Application",
            layer: "FRONTEND",
            dependencies: ["MOD-002", "MOD-003", "MOD-004"],
            required_files: [
              { path: "frontend/src/App.tsx" },
              { path: "frontend/src/Catalog.tsx" },
              { path: "frontend/src/Cart.tsx" },
              { path: "frontend/src/Wishlist.tsx" }
            ]
          },
          {
            id: "MOD-006",
            name: "Tests & QA Verification",
            layer: "TESTS",
            dependencies: ["MOD-005"],
            required_files: [
              { path: "backend/tests/test_workflows.py" }
            ]
          }
        ]
      });
    }

    // 4. Integration Contract Request
    if (systemPrompt.includes('Integration Contract Designer')) {
      return JSON.stringify({
        schemaVersion: 2,
        endpoints: [
          { method: "GET", path: "/api/products", backendFile: "backend/app/api/products.py", routerPrefix: "/api/products", routerPath: "", auth: "public", requestSchema: null, requestFields: [], responseSchema: "ProductListResponse", responseFields: ["id", "name"], requirementIds: ["REQ-CAT-001"] },
          { method: "GET", path: "/api/cart", backendFile: "backend/app/api/cart.py", routerPrefix: "/api/cart", routerPath: "", auth: "user", requestSchema: null, requestFields: [], responseSchema: "CartResponse", responseFields: ["items"], requirementIds: ["REQ-CART-001"] },
          { method: "GET", path: "/api/wishlist", backendFile: "backend/app/api/wishlist.py", routerPrefix: "/api/wishlist", routerPath: "", auth: "user", requestSchema: null, requestFields: [], responseSchema: "WishlistResponse", responseFields: ["product_id"], requirementIds: ["REQ-WISH-001"] },
          { method: "POST", path: "/api/orders/checkout", backendFile: "backend/app/api/orders.py", routerPrefix: "/api/orders", routerPath: "/checkout", auth: "user", requestSchema: "CheckoutRequest", requestFields: ["items"], responseSchema: "OrderConfirmationResponse", responseFields: ["order_id"], requirementIds: ["REQ-ORD-001"] },
          { method: "POST", path: "/api/payments/process", backendFile: "backend/app/api/payments.py", routerPrefix: "/api/payments", routerPath: "/process", auth: "user", requestSchema: "PaymentRequest", requestFields: ["order_id", "amount"], responseSchema: "PaymentResponse", responseFields: ["status"], requirementIds: ["REQ-PAY-001"] }
        ],
        workflows: [
          { testFile: "backend/tests/test_workflows.py", runner: "pytest", requirementIds: ["REQ-AUTH-001", "REQ-AUTH-002", "REQ-CAT-001", "REQ-CART-001", "REQ-WISH-001", "REQ-ORD-001", "REQ-PAY-001", "REQ-ADM-001"] }
        ]
      });
    }

    return "{}";
  };
}

test('AGENT 1 CHECKLIST 1: Requirement Contract extracts complete requirement catalog', async () => {
  const caller = createPlannerMockLLM();
  const reqContract = await generateRequirementContract(samplePRD, caller, () => {}, 'test-gen');

  assert(Array.isArray(reqContract.requirements), 'Requirements must be an array');
  assert(reqContract.requirements.length >= 8, `Expected at least 8 requirements, got ${reqContract.requirements.length}`);
  
  for (const r of reqContract.requirements) {
    assert(r.id && r.id.startsWith('REQ-'), `Requirement ID must be formatted REQ-*: ${r.id}`);
    assert(r.description && r.description.length > 5, `Requirement description missing or short: ${r.id}`);
    assert(['frontend', 'backend', 'database', 'feature'].includes(r.type), `Invalid requirement type: ${r.type}`);
  }
});

test('AGENT 1 CHECKLIST 2: Architecture Contract infers implied entities (CartItem, Wishlist)', async () => {
  const caller = createPlannerMockLLM();
  const reqContract = await generateRequirementContract(samplePRD, caller, () => {}, 'test-gen');
  const archContract = await generateArchitectureContract(samplePRD, reqContract, caller, () => {}, 'test-gen');

  assert.equal(archContract.language, 'python', 'Default backend language must be Python');
  assert.equal(archContract.backend_framework, 'fastapi', 'Default backend framework must be FastAPI');
  assert.equal(archContract.orm, 'sqlalchemy', 'Default ORM must be SQLAlchemy');

  const entityNames = (archContract.entities || []).map(e => e.name);
  assert(entityNames.includes('CartItem'), `Agent 1 must infer CartItem entity from PRD cart endpoints. Entities: ${entityNames.join(', ')}`);
  assert(entityNames.includes('Wishlist'), `Agent 1 must infer Wishlist entity from PRD wishlist endpoints. Entities: ${entityNames.join(', ')}`);
});

test('AGENT 1 CHECKLIST 3: Manifest enforces MOD-000 isolation, MOD-001 auth.py, single file ownership, and acyclic DAG', async () => {
  const caller = createPlannerMockLLM();
  const reqContract = await generateRequirementContract(samplePRD, caller, () => {}, 'test-gen');
  const archContract = await generateArchitectureContract(samplePRD, reqContract, caller, () => {}, 'test-gen');
  const manifest = await generateManifest(samplePRD, [], 'NEW_PROJECT', (t, d) => console.log(`[${t}]`, d?.logMsg || d || ''), caller, 'test-gen', archContract, reqContract);

  // 1. Structural Validation
  const validation = validateManifestStructurally(manifest);
  assert(validation.isValid, `Manifest must be structurally valid. Errors: ${validation.errors.join('; ')}`);

  // 2. MOD-000 Database isolation
  const mod0 = manifest.modules.find(m => m.id === 'MOD-000');
  assert(mod0, 'MOD-000 must exist');
  assert.equal(mod0.layer, 'DATABASE', 'MOD-000 layer must be DATABASE');
  assert.equal(mod0.dependencies.length, 0, 'MOD-000 must have 0 dependencies');
  const mod0Files = mod0.required_files.map(f => typeof f === 'string' ? f : f.path);
  assert(mod0Files.includes('backend/app/db/models.py'), 'MOD-000 must include backend/app/db/models.py');
  assert(mod0Files.includes('backend/app/db/database.py'), 'MOD-000 must include backend/app/db/database.py');

  // 3. MOD-001 Backend Foundation & auth.py guarantee
  const allFiles = manifest.modules.flatMap(m => m.required_files.map(f => typeof f === 'string' ? f : f.path));
  assert(allFiles.includes('backend/app/api/auth.py'), 'Agent 1 must plan backend/app/api/auth.py when PRD requires authentication');

  // 4. README.md documentation guarantee
  assert(allFiles.includes('README.md'), 'Agent 1 must plan README.md in documentation');

  // 5. Single file ownership (no duplicate files across modules)
  const fileCounts = {};
  for (const f of allFiles) {
    fileCounts[f] = (fileCounts[f] || 0) + 1;
    assert.equal(fileCounts[f], 1, `File ${f} is claimed by multiple modules! Single file ownership violated.`);
  }

  // 6. Acyclic dependency DAG
  assert.doesNotThrow(() => {
    detectCircularDependencies(manifest);
  }, 'Manifest module dependencies must be strictly acyclic (no cycles)');
});

test('AGENT 1 CHECKLIST 4: Integration Contract achieves 100% requirement coverage with strict schemas', async () => {
  const caller = createPlannerMockLLM();
  const reqContract = await generateRequirementContract(samplePRD, caller, () => {}, 'test-gen');
  const archContract = await generateArchitectureContract(samplePRD, reqContract, caller, () => {}, 'test-gen');
  const manifest = await generateManifest(samplePRD, [], 'NEW_PROJECT', () => {}, caller, 'test-gen', archContract, reqContract);
  manifest.architectureContract = archContract;
  manifest.requirementContract = reqContract;

  const intContract = await generateIntegrationContract(samplePRD, manifest, caller, () => {}, 'test-gen');

  // Validate integration contract
  const validation = validateIntegrationContract(intContract, manifest);
  assert(validation.isValid, `Integration contract must be valid. Errors: ${validation.errors.join('; ')}`);

  // Verify requirement coverage
  const coveredIds = new Set();
  for (const ep of intContract.endpoints) {
    for (const rid of ep.requirementIds || []) coveredIds.add(rid);
    assert(ep.responseSchema, `Endpoint ${ep.method} ${ep.path} missing responseSchema`);
    assert(!['Any', 'dict', 'Dict', 'object'].includes(ep.responseSchema), `Endpoint ${ep.method} ${ep.path} cannot use generic response schema`);
  }
  for (const wf of intContract.workflows) {
    for (const rid of wf.requirementIds || []) coveredIds.add(rid);
  }

  for (const req of reqContract.requirements) {
    assert(coveredIds.has(req.id), `Requirement ID ${req.id} is not covered in Integration Contract!`);
  }
});
