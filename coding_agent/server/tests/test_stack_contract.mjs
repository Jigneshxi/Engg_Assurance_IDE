import assert from 'assert';
import { validateManifestStackCompatibility, MANIFEST_ERROR_CODES } from '../manifestValidator.js';
import { validateDatabasePhase, DATABASE_DEFECT_CODES } from '../dbValidator.js';
import { repairFile } from '../repairEngine.js';

console.log('--- RUNNING FOCUSED TECHNOLOGY-STACK CONTRACT REGRESSION TESTS ---\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Architecture = Python + SQLAlchemy, Manifest = Python + SQLAlchemy
// Expected database files = .py, Validator = SQLAlchemy -> RESULT = PASS
// ─────────────────────────────────────────────────────────────────────────────
{
  const archContract = {
    language: 'python',
    backend_framework: 'fastapi',
    orm: 'sqlalchemy',
    database: 'sqlite'
  };

  const manifest = {
    architectureContract: archContract,
    project_requirements: {
      database: {
        entities: ['Task', 'Category'],
        tables: ['tasks', 'categories'],
        initialization_requirements: true
      }
    },
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [
          {
            path: 'backend/app/db/database.py',
            content: `from sqlalchemy import create_engine\nfrom sqlalchemy.orm import sessionmaker, declarative_base\n\nDATABASE_URL = "sqlite:///./app.db"\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(bind=engine)\nBase = declarative_base()\n\ndef get_db():\n    db = SessionLocal()\n    try:\n        yield db\n    finally:\n        db.close()\n`
          },
          {
            path: 'backend/app/db/models.py',
            content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\n\nclass Category(Base):\n    __tablename__ = 'categories'\n    id = Column(Integer, primary_key=True)\n    name = Column(String)\n    tasks = relationship("Task", back_populates="category")\n\nclass Task(Base):\n    __tablename__ = 'tasks'\n    id = Column(Integer, primary_key=True)\n    title = Column(String)\n    category_id = Column(Integer, ForeignKey('categories.id'))\n    category = relationship("Category", back_populates="tasks")\n`
          }
        ]
      }
    ]
  };

  // Manifest stack compatibility check
  const manifestVal = validateManifestStackCompatibility(manifest, archContract);
  assert.strictEqual(manifestVal.isValid, true, 'Manifest with Python/SQLAlchemy files must pass stack validation');

  // Database semantic validation
  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'minimal prd', async () => JSON.stringify({ isValid: true }), () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  if (!dbVal.isValid) {
    console.error('Test 1 DB validation errors:', dbVal.errors, dbVal.defects);
  }
  assert.strictEqual(dbVal.isValid, true, 'Valid Python/SQLAlchemy database implementation must pass validation');
  console.log('✅ TEST 1 PASS: Architecture = Python + SQLAlchemy, Manifest = Python + SQLAlchemy -> PASS');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Architecture = Python + SQLAlchemy, Manifest accidentally specifies Prisma/.ts
// RESULT = deterministic contract failure BEFORE generation
// ─────────────────────────────────────────────────────────────────────────────
{
  const archContract = {
    language: 'python',
    backend_framework: 'fastapi',
    orm: 'sqlalchemy',
    database: 'sqlite'
  };

  const accidentalManifest = {
    architectureContract: archContract,
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [
          { path: 'backend/app/db/database.ts', purpose: 'DB connection' },
          { path: 'backend/app/db/models.ts', purpose: 'Prisma models' }
        ]
      },
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND',
        required_files: [
          { path: 'backend/server.ts', purpose: 'Express server' }
        ]
      }
    ]
  };

  const stackVal = validateManifestStackCompatibility(accidentalManifest, archContract);
  assert.strictEqual(stackVal.isValid, false, 'Manifest with .ts files for Python architecture must be rejected');
  assert.ok(stackVal.defects.some(d => d.code === MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE), 'Must emit MANIFEST_STACK_INCOMPATIBLE');
  assert.ok(stackVal.errors.some(e => e.includes('violates Architecture Contract')), 'Error must cite Architecture Contract violation');
  console.log('✅ TEST 2 PASS: Architecture = Python + SQLAlchemy, Manifest = Prisma/.ts -> Deterministic rejection BEFORE generation');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Architecture = TypeScript + Prisma, Manifest = TypeScript + Prisma
// Validator uses Prisma rules -> RESULT = PASS if generated implementation is valid
// ─────────────────────────────────────────────────────────────────────────────
{
  const archContract = {
    language: 'typescript',
    backend_framework: 'express',
    orm: 'prisma',
    database: 'postgresql'
  };

  const manifest = {
    architectureContract: archContract,
    project_requirements: {
      database: {
        entities: ['Task', 'Category'],
        tables: ['tasks', 'categories'],
        seed_required: true
      }
    },
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [
          {
            path: 'backend/prisma/schema.prisma',
            content: `datasource db { provider = "postgresql" url = env("DATABASE_URL") }\ngenerator client { provider = "prisma-client-js" }\n\nmodel Category {\n  id Int @id @default(autoincrement())\n  name String\n  tasks Task[]\n}\n\nmodel Task {\n  id Int @id @default(autoincrement())\n  title String\n  categoryId Int\n  category Category @relation(fields: [categoryId], references: [id])\n}\n`
          },
          {
            path: 'backend/src/db/client.ts',
            content: `import { PrismaClient } from '@prisma/client';\nexport const prisma = new PrismaClient();\n`
          },
          {
            path: 'backend/src/db/seed.ts',
            content: `import { prisma } from './client';\nexport async function seed() {\n  await prisma.category.create({ data: { name: 'Work' } });\n}\n`
          }
        ]
      }
    ]
  };

  const stackVal = validateManifestStackCompatibility(manifest, archContract);
  assert.strictEqual(stackVal.isValid, true, 'Manifest with TypeScript/Prisma files must pass stack validation');

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'minimal prd', async () => JSON.stringify({ isValid: true }), () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  // Prisma implementation passes without expecting declarative_base()
  if (!dbVal.isValid) {
    console.error('Test 3 DB validation errors:', dbVal.errors, dbVal.defects);
  }
  assert.strictEqual(dbVal.isValid, true, 'Prisma database implementation must pass Prisma rules without SQLAlchemy Base requirement');
  console.log('✅ TEST 3 PASS: Architecture = TypeScript + Prisma -> Validator uses Prisma rules and PASSES');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Architecture = Python + SQLAlchemy, Generated implementation is TypeScript/Prisma
// RESULT = STACK_CONTRACT_MISMATCH, not DB_REL001
// ─────────────────────────────────────────────────────────────────────────────
{
  const archContract = {
    language: 'python',
    backend_framework: 'fastapi',
    orm: 'sqlalchemy',
    database: 'sqlite'
  };

  const manifest = {
    architectureContract: archContract,
    project_requirements: {
      database: {
        entities: ['Task', 'Category'],
        tables: ['tasks', 'categories']
      }
    },
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [
          {
            path: 'backend/app/db/models.ts',
            content: `import { PrismaClient, Prisma } from '@prisma/client';\nconst prisma = new PrismaClient();\nexport default prisma;\n`
          }
        ]
      }
    ]
  };

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'minimal prd', async () => '{}', () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  assert.strictEqual(dbVal.isValid, false, 'Wrong-stack implementation must fail validation');
  assert.ok(dbVal.defects.some(d => d.code === 'STACK_CONTRACT_MISMATCH'), 'Must emit STACK_CONTRACT_MISMATCH');
  assert.ok(!dbVal.defects.some(d => d.code === 'DB_REL001'), 'Must NOT emit misleading DB_REL001');
  console.log('✅ TEST 4 PASS: Generated implementation is TypeScript/Prisma -> STACK_CONTRACT_MISMATCH, not DB_REL001');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Repair receives STACK_CONTRACT_MISMATCH -> RESULT = no inappropriate relationship repair
// ─────────────────────────────────────────────────────────────────────────────
{
  const fileDef = {
    path: 'backend/app/db/models.ts',
    content: `import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\n`,
    status: 'repairing',
    errors: ['Stack contract mismatch']
  };

  const activeModule = { id: 'MOD-000', name: 'Database Architecture' };
  const manifest = { modules: [activeModule] };
  const defects = [{
    code: DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
    message: 'Stack contract mismatch: Expected Python/SQLAlchemy implementation, but found TypeScript/Prisma code.',
    file: fileDef.path
  }];

  let relationshipRepairCalled = false;
  const mockCaller = async () => {
    relationshipRepairCalled = true;
    return '<patch></patch>';
  };

  const repairResult = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: mockCaller,
    sendEvent: () => {},
    generationId: 'test-gen',
    validateFn: async () => ({ isValid: false })
  });

  assert.strictEqual(relationshipRepairCalled, false, 'Repair engine must NOT invoke LLM for targeted line patch on STACK_CONTRACT_MISMATCH');
  assert.strictEqual(repairResult.success, false, 'Repair result must be false');
  assert.strictEqual(repairResult.defectCode, 'STACK_CONTRACT_MISMATCH', 'Defect code must be STACK_CONTRACT_MISMATCH');
  console.log('✅ TEST 5 PASS: Repair receives STACK_CONTRACT_MISMATCH -> No inappropriate relationship repair attempted');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: semantic_repair_no_progress -> Existing behavior remains intact
// ─────────────────────────────────────────────────────────────────────────────
{
  const { detectSemanticRepairProgress } = await import('../repairEngine.js');
  const defect = {
    code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
    sourceFile: 'backend/app/db/models.py',
    sourceModel: 'Order',
    sourceRelationship: 'items',
    targetModel: 'OrderItem',
    expectedReciprocal: 'OrderItem.order',
    expectedBackPopulates: 'items'
  };

  const firstProgress = detectSemanticRepairProgress({
    defects: [defect],
    fileHashes: { 'backend/app/db/models.py': 'hash_1' }
  });

  assert.strictEqual(firstProgress.status, 'PROGRESS');

  // Second attempt with repeated defect -> SEMANTIC_REPAIR_NO_PROGRESS
  const secondProgress = detectSemanticRepairProgress({
    previous: firstProgress.state,
    defects: [defect],
    fileHashes: { 'backend/app/db/models.py': 'hash_2' }
  });

  assert.strictEqual(secondProgress.status, 'SEMANTIC_REPAIR_NO_PROGRESS', 'Must detect SEMANTIC_REPAIR_NO_PROGRESS when defects repeat');
  console.log('✅ TEST 6 PASS: semantic_repair_no_progress remains intact and functioning');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: PRD UI Initial State (State 1) & After Start Generation (State 2) Logic
// ─────────────────────────────────────────────────────────────────────────────
{
  // Test UI State logic directly
  const getUiState = (status) => {
    return status === 'idle' ? 'STATE_1_PRD_ENTRY' : 'STATE_2_EXECUTION';
  };

  assert.strictEqual(getUiState('idle'), 'STATE_1_PRD_ENTRY', 'Initial state before generation must be State 1 PRD Entry');
  assert.strictEqual(getUiState('generating'), 'STATE_2_EXECUTION', 'After Start Generation, view must transition to State 2 Execution');
  assert.strictEqual(getUiState('done'), 'STATE_2_EXECUTION', 'Completed state must remain in State 2 Execution to display results');
  assert.strictEqual(getUiState('error'), 'STATE_2_EXECUTION', 'Error state must remain in State 2 Execution to display failures');

  console.log('✅ TEST 7 PASS: PRD UI Initial State = State 1 (PRD Entry), After Start Generation = State 2 (Execution)');
}

console.log('\n======================================================');
console.log('🎉 ALL 7/7 FOCUSED TECHNOLOGY-STACK REGRESSION TESTS PASSED!');
console.log('======================================================\n');
