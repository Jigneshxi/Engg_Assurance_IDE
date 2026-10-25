/**
 * Phase 10: Backend Runtime Validation Gate Test Suite
 * 
 * Verifies:
 * 1. Start backend.
 * 2. Verify health endpoint.
 * 3. Verify database connection.
 * 4. Run migration / schema creation.
 * 5. Verify database tables.
 * 6. Verify imports at runtime.
 * 7. Verify application startup.
 * 8. Verify API registration.
 * 9. Verify authentication endpoints.
 * 10. Verify authorization protections.
 * 11. Verify CRUD capabilities.
 * 12. Verify persistence.
 * 
 * Invariant: A generated backend that cannot start is NOT successful.
 * Defect Code: BACKEND_RUNTIME_FAILURE
 */

import assert from 'assert';
import {
  BACKEND_DEFECT_CODES,
  verifyBackendImports,
  verifyApplicationStartup,
  verifyHealthEndpoint,
  verifyDatabaseConnection,
  runMigration,
  verifyDatabaseTables,
  verifyApiRegistration,
  verifyAuthAndAuthorization,
  verifyCrudAndPersistence,
  validateBackendRuntime
} from '../backendRuntimeValidator.js';
import {
  DATABASE_DEFECT_CODES
} from '../dbValidator.js';
import {
  getRepairStrategy
} from '../repairEngine.js';

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

console.log('🧪 Starting Phase 10: Backend Runtime Validation Gate Test Suite...\n');

// ── Test 1: Runtime Imports Verification ─────────────────────────────────────
await runTest('Test 1: Backend entry point must exist and import cleanly', async () => {
  const validFiles = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\napp = FastAPI()\n`
    }
  ];

  const res1 = await verifyBackendImports(validFiles);
  assert.strictEqual(res1.defects.length, 0, 'Valid entry point produces 0 defects');

  // Backend files exist but no main.py / server.js entry point
  const missingEntryFiles = [
    {
      path: 'backend/services/helper.py',
      content: `def compute(): return 42\n`
    }
  ];

  const res2 = await verifyBackendImports(missingEntryFiles);
  assert.strictEqual(res2.defects.length, 1, 'Missing canonical entry point must be flagged');
  assert.strictEqual(res2.defects[0].code, BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE);
  assert.strictEqual(res2.defects[0].subtype, 'IMPORT_RUNTIME_FAILURE');
});

// ── Test 2: Application Startup Verification ─────────────────────────────────
await runTest('Test 2: Application framework instantiation verified; missing app crashes caught', async () => {
  const validFiles = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI\napp = FastAPI(title="Service")\n`
    }
  ];

  const res1 = await verifyApplicationStartup(validFiles);
  assert.strictEqual(res1.defects.length, 0, 'Instantiated FastAPI app passes');

  const invalidFiles = [
    {
      path: 'backend/main.py',
      content: `# Empty script with no framework initialization\nprint("hello")\n`
    }
  ];

  const res2 = await verifyApplicationStartup(invalidFiles);
  assert.strictEqual(res2.defects.length, 1, 'File lacking framework initialization must fail');
  assert.strictEqual(res2.defects[0].code, BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE);
  assert.strictEqual(res2.defects[0].subtype, 'STARTUP_FAILURE');
});

// ── Test 3: Health Endpoint Declaration & Live Verification ──────────────────
await runTest('Test 3: Health endpoint must be declared and return 200 OK', async () => {
  const validFiles = [
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
app = FastAPI()
@app.get("/health")
def health():
    return {"status": "ok"}
`
    }
  ];

  const res1 = await verifyHealthEndpoint(validFiles);
  assert.strictEqual(res1.defects.length, 0, 'Declared health endpoint passes');
  assert.strictEqual(res1.declaredEndpoint, '/health');

  const invalidFiles = [
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
app = FastAPI()
# No health endpoint
`
    }
  ];

  const res2 = await verifyHealthEndpoint(invalidFiles);
  assert.strictEqual(res2.defects.length, 1, 'Missing health endpoint must fail');
  assert.strictEqual(res2.defects[0].subtype, 'HEALTH_ENDPOINT_FAILURE');

  // Verify live health endpoint on local backend if running (port 8000)
  try {
    const liveRes = await verifyHealthEndpoint(validFiles, { backendUrl: 'http://127.0.0.1:8000' });
    if (liveRes.defects.length === 0) {
      console.log('   ↳ Verified live backend health endpoint on port 8000 (200 OK)');
    }
  } catch (_) {
    // optional live probe
  }
});

// ── Test 4: Database Connection Configuration ────────────────────────────────
await runTest('Test 4: Database engine instantiation verified; missing DB config caught', async () => {
  const validFiles = [
    {
      path: 'backend/app/db/database.py',
      content: `
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
engine = create_engine("sqlite:///./app.db")
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
`
    }
  ];

  const res1 = await verifyDatabaseConnection(validFiles);
  assert.strictEqual(res1.defects.length, 0, 'Configured database engine passes');

  const invalidFiles = [
    {
      path: 'backend/app/db/models.py',
      content: `class Record:\n    pass\n`
    }
  ];

  const res2 = await verifyDatabaseConnection(invalidFiles);
  assert.strictEqual(res2.defects.length, 1, 'Models present without database configuration must fail');
  assert.strictEqual(res2.defects[0].subtype, 'DATABASE_CONNECTION_FAILURE');
});

// ── Test 5: Database Migration & Schema Creation ─────────────────────────────
await runTest('Test 5: Migration runner or create_all mechanism verified', async () => {
  const validWithCreateAll = [
    {
      path: 'backend/app/db/models.py',
      content: `class Entity:\n    pass\n`
    },
    {
      path: 'backend/main.py',
      content: `
from app.db.database import engine, Base
Base.metadata.create_all(bind=engine)
`
    }
  ];

  const res1 = await runMigration(validWithCreateAll);
  assert.strictEqual(res1.defects.length, 0, 'Schema creation via metadata.create_all passes');

  const invalidNoMigration = [
    {
      path: 'backend/app/db/models.py',
      content: `class Entity:\n    pass\n`
    },
    {
      path: 'backend/main.py',
      content: `app = FastAPI()\n`
    }
  ];

  const res2 = await runMigration(invalidNoMigration);
  assert.strictEqual(res2.defects.length, 1, 'Missing migration/creation mechanism must fail');
  assert.strictEqual(res2.defects[0].subtype, 'MIGRATION_FAILURE');
});

// ── Test 6: Database Tables Discovery ────────────────────────────────────────
await runTest('Test 6: Database table declarations discovered and verified', async () => {
  const filesWithModels = [
    {
      path: 'backend/app/db/models.py',
      content: `
class HealthRecord(Base):
    __tablename__ = "health_records"
    id = Column(Integer, primary_key=True)

class MetricEntry(Base):
    __tablename__ = "metric_entries"
    id = Column(Integer, primary_key=True)
`
    }
  ];

  const res = await verifyDatabaseTables(filesWithModels);
  assert.strictEqual(res.defects.length, 0);
  assert.strictEqual(res.verifiedTablesCount, 2, 'Must discover 2 declared tables');
});

// ── Test 7: API Registration Verification ────────────────────────────────────
await runTest('Test 7: Declared API routers must be mounted in main application', async () => {
  const validFiles = [
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
from app.api.metrics import router as metrics_router
app = FastAPI()
app.include_router(metrics_router, prefix="/metrics")
`
    },
    {
      path: 'backend/app/api/metrics.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.get("/")
def list_metrics(): return []
`
    }
  ];

  const res1 = verifyApiRegistration(validFiles);
  assert.strictEqual(res1.defects.length, 0, 'Mounted router passes validation');

  // Router declared but not mounted in main.py
  const unmountedFiles = [
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
app = FastAPI()
# metrics router not imported or mounted!
`
    },
    {
      path: 'backend/app/api/metrics.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.get("/")
def list_metrics(): return []
`
    }
  ];

  const res2 = verifyApiRegistration(unmountedFiles);
  assert.strictEqual(res2.defects.length, 1, 'Unmounted router must be flagged');
  assert.strictEqual(res2.defects[0].code, BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE);
  assert.strictEqual(res2.defects[0].subtype, 'API_REGISTRATION_FAILURE');
  assert.strictEqual(res2.defects[0].routerFile, 'backend/app/api/metrics.py');
});

// ── Test 8: Authentication & Authorization Flow ──────────────────────────────
await runTest('Test 8: Auth routes must provide login/register; auth checks enforced', async () => {
  const validAuth = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.post("/register")
def register(): return {"token": "jwt"}
@router.post("/login")
def login(): return {"access_token": "jwt", "token_type": "bearer"}
`
    }
  ];

  const res1 = await verifyAuthAndAuthorization(validAuth);
  assert.strictEqual(res1.defects.length, 0, 'Valid auth endpoints pass');
  assert.strictEqual(res1.authPresent, true);

  const brokenAuth = [
    {
      path: 'backend/app/api/auth.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
# Missing both login and register handlers
`
    }
  ];

  const res2 = await verifyAuthAndAuthorization(brokenAuth);
  assert.strictEqual(res2.defects.length, 1, 'Missing login/register in auth router must fail');
  assert.strictEqual(res2.defects[0].subtype, 'AUTHENTICATION_FAILURE');
});

// ── Test 9: CRUD Capabilities & Persistence ──────────────────────────────────
await runTest('Test 9: CRUD operation coverage verified in backend routers', async () => {
  const fullCrudFiles = [
    {
      path: 'backend/app/api/records.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.get("/records")
def get_all(): return []
@router.post("/records")
def create_one(): return {"id": 1}
@router.put("/records/{id}")
def update_one(id: int): return {"id": id}
@router.delete("/records/{id}")
def delete_one(id: int): return {"deleted": True}
`
    }
  ];

  const res1 = await verifyCrudAndPersistence(fullCrudFiles);
  assert.strictEqual(res1.defects.length, 0, 'Full CRUD coverage passes');
  assert.strictEqual(res1.crudSummary.totalGet, 1);
  assert.strictEqual(res1.crudSummary.totalPost, 1);
  assert.strictEqual(res1.crudSummary.totalPut, 1);
  assert.strictEqual(res1.crudSummary.totalDelete, 1);

  const missingCrudFiles = [
    {
      path: 'backend/app/api/records.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
# Only DELETE, missing GET and POST
@router.delete("/records/{id}")
def delete_one(id: int): return {}
`
    }
  ];

  const res2 = await verifyCrudAndPersistence(missingCrudFiles);
  assert.strictEqual(res2.defects.length, 1, 'Lacking GET/POST must fail CRUD verification');
  assert.strictEqual(res2.defects[0].subtype, 'CRUD_FAILURE');
});

// ── Test 10: Composite validateBackendRuntime Gate & Repair Strategy ─────────
await runTest('Test 10: Composite gate evaluates full project and maps BackendRuntimeRepairStrategy', async () => {
  const completeBackendProject = [
    {
      path: 'backend/app/db/database.py',
      content: `
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
engine = create_engine("sqlite:///./app.db")
Base = declarative_base()
`
    },
    {
      path: 'backend/app/db/models.py',
      content: `
from app.db.database import Base
from sqlalchemy import Column, Integer, String
class Entity(Base):
    __tablename__ = "entities"
    id = Column(Integer, primary_key=True)
`
    },
    {
      path: 'backend/app/api/entities.py',
      content: `
from fastapi import APIRouter
router = APIRouter()
@router.get("/")
def list_all(): return []
@router.post("/")
def create_one(): return {"id": 1}
`
    },
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
from app.db.database import engine, Base
from app.api.entities import router as entities_router

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Service")

@app.get("/health")
def health(): return {"status": "ok"}

app.include_router(entities_router, prefix="/entities")
`
    }
  ];

  const result = await validateBackendRuntime(completeBackendProject);
  assert.strictEqual(result.isValid, true, 'Coherent complete backend passes gate');
  assert.strictEqual(result.defects.length, 0);

  // Invariant verification: defective backend fails gate
  const failingProject = [
    ...completeBackendProject.filter(f => f.path !== 'backend/main.py'),
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
app = FastAPI()
# Missing health endpoint, missing create_all, missing router registration
`
    }
  ];

  const failingResult = await validateBackendRuntime(failingProject);
  assert.strictEqual(failingResult.isValid, false, 'Defective backend must fail gate');
  assert.ok(failingResult.defects.length >= 2, 'Multiple defects should be captured');
  assert.strictEqual(failingResult.defects[0].code, BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE);

  // Defect code & repair strategy invariant
  assert.strictEqual(DATABASE_DEFECT_CODES.BACKEND_RUNTIME_FAILURE, 'BACKEND_RUNTIME_FAILURE');
  const strategy = getRepairStrategy(DATABASE_DEFECT_CODES.BACKEND_RUNTIME_FAILURE);
  assert.ok(strategy, 'Repair strategy must exist for BACKEND_RUNTIME_FAILURE');
  assert.strictEqual(strategy.name, 'BackendRuntimeRepairStrategy');
  assert.ok(strategy.instructions.length >= 5);
  assert.ok(strategy.forbidden.length >= 2);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n==================================================`);
console.log(`Phase 10 Backend Runtime Validation Suite Completed`);
console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`==================================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
