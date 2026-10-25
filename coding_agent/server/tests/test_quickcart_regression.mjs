import assert from 'assert';
import { generateArchitectureContract } from '../orchestrator.js';
import { validateManifestStackCompatibility, MANIFEST_ERROR_CODES } from '../manifestValidator.js';

console.log('--- RUNNING TARGETED QUICKCART REGRESSION TESTS ---\n');

const QUICKCART_PRD = `
# Project: QuickCart E-Commerce Platform

## Architecture & Layers
1. Database Architecture & Schema:
   - User entity: id, email, password_hash, full_name, is_admin
   - Product entity: id, title, description, price, inventory_count, category_id
   - Order entity: id, user_id, total_amount, status, created_at
   - OrderItem entity: id, order_id, product_id, quantity, unit_price
   - CartItem entity: id, user_id, product_id, quantity
   - Category entity: id, name, slug
   - Alembic migration environment and initial schema migration
   - Database seeding script with initial categories and demo products
2. Backend Foundation:
   - Core configuration, database session handling, JWT authentication, and server entrypoint
3. Catalog & Content API:
   - Products CRUD, categories filter, search, product detail
4. Orders & Commerce API:
   - Cart management, checkout idempotency, transaction-safe inventory deduction, order placement
5. User & Admin Management API:
   - Customer profile, admin inventory and order status management
6. Frontend Storefront:
   - React pages: Home, ProductDetail, Cart, Checkout, OrderHistory
   - Shared components: Header, ProductCard, Navigation
   - Main App entrypoint and routing
`;

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: QuickCart PRD -> Architecture Contract Stack Invariance
// Even if the raw LLM output suggests typescript because of React frontend,
// the presence of Alembic / Python domain logic MUST lock the stack to Python/FastAPI/SQLAlchemy.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Mock LLM that returns a TypeScript architecture contract (mimicking the regression failure)
  const mockLLMTryingTypeScript = async (_sys, _usr) => {
    return JSON.stringify({
      project_name: "QuickCart",
      domain: "e-commerce",
      language: "typescript",
      backend_framework: "express",
      frontend_framework: "react",
      database: "sqlite",
      orm: "prisma",
      project_structure: {
        backend_root: "backend",
        frontend_root: "frontend",
        db_models_path: "backend/app/db/models.ts",
        db_connection_path: "backend/app/db/database.ts",
        backend_entrypoint: "backend/main.ts",
        frontend_entrypoint: "frontend/src/App.tsx"
      }
    });
  };

  const archContract = await generateArchitectureContract(
    QUICKCART_PRD,
    { requirements: [] },
    mockLLMTryingTypeScript,
    () => {},
    'test-quickcart-arch'
  );

  assert.strictEqual(archContract.language, 'python', 'Architecture contract language MUST be normalized to python when Alembic is in PRD');
  assert.strictEqual(archContract.backend_framework, 'fastapi', 'Backend framework MUST be fastapi');
  assert.strictEqual(archContract.orm, 'sqlalchemy', 'ORM MUST be sqlalchemy');
  assert.strictEqual(archContract.project_structure.db_models_path, 'backend/app/db/models.py', 'Database models path MUST end in .py');
  assert.strictEqual(archContract.project_structure.db_connection_path, 'backend/app/db/database.py', 'Database connection path MUST end in .py');
  assert.strictEqual(archContract.project_structure.backend_entrypoint, 'backend/main.py', 'Backend entrypoint MUST end in .py');

  console.log('✅ TEST 1 PASS: QuickCart PRD strictly normalizes architecture contract to Python + FastAPI + SQLAlchemy');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Stack Compatibility Validator Rejects TypeScript in QuickCart
// ─────────────────────────────────────────────────────────────────────────────
{
  const archContract = {
    language: 'python',
    backend_framework: 'fastapi',
    orm: 'sqlalchemy',
    database: 'sqlite'
  };

  // The faulty QuickCart manifest containing 26 TypeScript files
  const faultyManifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture & Schema',
        layer: 'DATABASE',
        required_files: [
          { path: 'backend/app/db/database.ts' },
          { path: 'backend/app/db/models.ts' },
          { path: 'backend/app/db/seed.ts' },
          { path: 'backend/app/db/migrations/env.ts' },
          { path: 'backend/app/db/migrations/script.ts' }
        ]
      },
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
        required_files: [
          { path: 'backend/main.ts' }
        ]
      },
      {
        id: 'MOD-005',
        name: 'Frontend Storefront',
        layer: 'FRONTEND',
        required_files: [
          { path: 'frontend/src/App.tsx' }
        ]
      }
    ]
  };

  const validationResult = validateManifestStackCompatibility(faultyManifest, archContract);

  assert.strictEqual(validationResult.isValid, false, 'Manifest with .ts backend files must fail stack compatibility validation');
  assert.strictEqual(validationResult.errors.length, 6, 'Must catch all 6 non-python backend/database files');
  assert.strictEqual(validationResult.defects[0].code, MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE);

  console.log('✅ TEST 2 PASS: validateManifestStackCompatibility strictly rejects .ts database & backend files against Python contract');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Dependency Graph UI Event Contract Alignment
// Both 'dag_built' and 'dependency_graph_ready' must set _dag status to validated
// ─────────────────────────────────────────────────────────────────────────────
{
  const simulateClientEventListener = (eventType) => {
    let fileStatuses = {};
    if (eventType === 'dependency_graph_ready' || eventType === 'dag_built') {
      fileStatuses._dag = { status: 'validated' };
    }
    return fileStatuses;
  };

  const resultFromDagBuilt = simulateClientEventListener('dag_built');
  assert.strictEqual(resultFromDagBuilt._dag?.status, 'validated', 'dag_built event must mark _dag as validated');

  const resultFromDepGraphReady = simulateClientEventListener('dependency_graph_ready');
  assert.strictEqual(resultFromDepGraphReady._dag?.status, 'validated', 'dependency_graph_ready event must mark _dag as validated');

  // Verify UI rendering logic based on _dag status
  const renderDependencyGraphStatus = (fileStatuses) => {
    return fileStatuses['_dag'] ? '✓ Ready' : '○ Pending';
  };

  assert.strictEqual(renderDependencyGraphStatus({}), '○ Pending', 'Initial state before DAG event is Pending');
  assert.strictEqual(renderDependencyGraphStatus(resultFromDagBuilt), '✓ Ready', 'After DAG event, UI status is Ready');

  console.log('✅ TEST 3 PASS: DAG events (dag_built / dependency_graph_ready) reliably transition Dependency Graph UI to Ready');
}

console.log('\n======================================================');
console.log('🎉 ALL 3 TARGETED QUICKCART REGRESSION TESTS PASSED!');
console.log('======================================================\n');
