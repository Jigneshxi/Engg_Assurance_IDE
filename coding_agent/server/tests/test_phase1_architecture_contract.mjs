import assert from 'assert';
import { validateManifestStackCompatibility, validateManifestStructurally, MANIFEST_ERROR_CODES } from '../manifestValidator.js';
import { validateDatabasePhase, DATABASE_DEFECT_CODES } from '../dbValidator.js';

console.log('--- RUNNING PHASE 1: AUTHORITATIVE ARCHITECTURE CONTRACT TESTS ---\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Stack Contract Mismatch detection (Python requested, TS/Prisma provided)
// Must emit STACK_CONTRACT_MISMATCH, NOT DB_REL001
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
        entities: ['Account', 'Entry'],
        tables: ['accounts', 'entries']
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
            content: `import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\n`
          }
        ]
      }
    ]
  };

  // Pre-generation check
  const manifestVal = validateManifestStackCompatibility(manifest, archContract);
  assert.strictEqual(manifestVal.isValid, false);
  assert.ok(manifestVal.defects.some(d => d.code === MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE));

  // Phase validator check
  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'test', async () => '{}', () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  assert.strictEqual(dbVal.isValid, false);
  assert.strictEqual(dbVal.errorCode, DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH);
  assert.ok(!dbVal.defects.some(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP), 'Must NOT misclassify stack mismatch as broken relationship');
  console.log('✅ PASS: Requirement 5, 6, 7: STACK_CONTRACT_MISMATCH detected and not misclassified as DB_REL001');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Stack Contract Mismatch detection (TypeScript requested, Python provided)
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
        entities: ['Account'],
        tables: ['accounts']
      }
    },
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Architecture',
        layer: 'DATABASE',
        required_files: [
          {
            path: 'backend/app/db/models.py',
            content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`
          }
        ]
      }
    ]
  };

  const manifestVal = validateManifestStackCompatibility(manifest, archContract);
  assert.strictEqual(manifestVal.isValid, false);
  assert.ok(manifestVal.defects.some(d => d.code === MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE));

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'test', async () => '{}', () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  assert.strictEqual(dbVal.isValid, false);
  assert.strictEqual(dbVal.errorCode, DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH);
  console.log('✅ PASS: Requirement 8, 9: Python rejected when TypeScript/Prisma is mandated');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Single ownership per file (One owner per generated file)
// ─────────────────────────────────────────────────────────────────────────────
{
  const duplicateOwnershipManifest = {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Foundation',
        layer: 'BACKEND_FOUNDATION',
        required_files: [{ path: 'backend/main.py', purpose: 'Entry' }]
      },
      {
        id: 'MOD-999',
        name: 'Wiring',
        layer: 'INTEGRATION',
        required_files: [{ path: 'backend/main.py', purpose: 'Duplicate' }]
      }
    ]
  };

  const structuralVal = validateManifestStructurally(duplicateOwnershipManifest);
  assert.strictEqual(structuralVal.isValid, false);
  assert.ok(structuralVal.defects.some(d => d.code === MANIFEST_ERROR_CODES.DUPLICATE_FILE_PATH));
  console.log('✅ PASS: Requirement 10: Single ownership per file strictly enforced');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Architectural separation (database.py may own only Base, engine, session, get_db)
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
        entities: ['Category'],
        tables: ['categories']
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
            content: `from sqlalchemy import create_engine, Column, Integer, String\nfrom sqlalchemy.orm import declarative_base, sessionmaker\nengine = create_engine('sqlite:///./app.db')\nBase = declarative_base()\nclass Category(Base):\n    __tablename__ = 'categories'\n    id = Column(Integer, primary_key=True)\n`
          },
          {
            path: 'backend/app/db/models.py',
            content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String\n`
          }
        ]
      }
    ]
  };

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'test', async () => '{}', () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  assert.strictEqual(dbVal.isValid, false);
  assert.ok(dbVal.defects.some(d => d.code === DATABASE_DEFECT_CODES.ARCHITECTURAL_SEPARATION_VIOLATION));
  console.log('✅ PASS: Requirement 12: database.py defining ORM models produces ARCHITECTURAL_SEPARATION_VIOLATION');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Prevent duplicate ORM model declarations across files
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
        entities: ['Task'],
        tables: ['tasks']
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
            content: `from sqlalchemy import create_engine\nfrom sqlalchemy.orm import declarative_base, sessionmaker\nengine = create_engine('sqlite:///./app.db')\nSessionLocal = sessionmaker(bind=engine)\nBase = declarative_base()\ndef get_db():\n    yield None\n`
          },
          {
            path: 'backend/app/db/models.py',
            content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String\nclass Task(Base):\n    __tablename__ = 'tasks'\n    id = Column(Integer, primary_key=True)\n`
          },
          {
            path: 'backend/app/db/schema.py',
            content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String\nclass Task(Base):\n    __tablename__ = 'tasks'\n    id = Column(Integer, primary_key=True)\n`
          }
        ]
      }
    ]
  };

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'test', async () => '{}', () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  assert.strictEqual(dbVal.isValid, false);
  assert.ok(dbVal.defects.some(d => d.code === DATABASE_DEFECT_CODES.DUPLICATE_MODEL));
  console.log('✅ PASS: Requirement 11, 14: Duplicate ORM model across files rejected with DB_DUPLICATE_MODEL');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Fully compliant Architecture Contract implementation PASSES
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
        entities: ['Category', 'Task'],
        tables: ['categories', 'tasks'],
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
            content: `from sqlalchemy import create_engine\nfrom sqlalchemy.orm import declarative_base, sessionmaker\nDATABASE_URL = "sqlite:///./app.db"\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(bind=engine)\nBase = declarative_base()\ndef get_db():\n    db = SessionLocal()\n    try:\n        yield db\n    finally:\n        db.close()\n`
          },
          {
            path: 'backend/app/db/models.py',
            content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nclass Category(Base):\n    __tablename__ = 'categories'\n    id = Column(Integer, primary_key=True)\n    name = Column(String)\n    tasks = relationship("Task", back_populates="category")\nclass Task(Base):\n    __tablename__ = 'tasks'\n    id = Column(Integer, primary_key=True)\n    title = Column(String)\n    category_id = Column(Integer, ForeignKey('categories.id'))\n    category = relationship("Category", back_populates="tasks")\n`
          }
        ]
      }
    ]
  };

  const manifestVal = validateManifestStackCompatibility(manifest, archContract);
  assert.strictEqual(manifestVal.isValid, true);

  const dbModules = manifest.modules.filter(m => m.layer === 'DATABASE');
  const dbVal = await validateDatabasePhase(dbModules, manifest, 'test', async () => JSON.stringify({ isValid: true }), () => {}, {
    authoritativeOrm: true,
    architectureContract: archContract
  });

  if (!dbVal.isValid) {
    console.error('Test 6 errors:', dbVal.errors);
  }
  assert.strictEqual(dbVal.isValid, true);
  console.log('✅ PASS: Requirement 1-4, 13: Canonical architecture contract implementation PASSES');
}

console.log('\n🎉 ALL PHASE 1 ARCHITECTURE CONTRACT TESTS PASSED!');
