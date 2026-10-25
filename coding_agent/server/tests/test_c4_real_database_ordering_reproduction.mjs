import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeGeneration } from '../orchestrator.js';

test('c4_real Reproduction: Database files importing app.db.database before it is generated', async (t) => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-c4-repro-'));
  const events = [];
  const sendEvent = (event, data) => events.push({ event, data });

  // Mock LLM dispatcher that provides database files in the c4_real problematic order:
  // models.py, env.py, seed.py ALL generated while database.py is not yet generated.
  const mockLLM = async (system, user) => {
    // 1. Systems Architect (Stack & Structure)
    if (system.includes('Enterprise Systems Architect')) {
      return JSON.stringify({
        project_name: "C4RealRepro",
        domain: "ecommerce",
        language: "python",
        backend_framework: "fastapi",
        frontend_framework: "react",
        database: "sqlite",
        orm: "sqlalchemy",
        project_structure: {
          backend_root: "backend",
          frontend_root: "frontend",
          db_models_path: "backend/app/db/models.py",
          db_connection_path: "backend/app/db/database.py",
          base_import: "from app.db.database import Base",
          get_db_import: "from app.db.database import get_db",
          backend_entrypoint: "backend/main.py",
          frontend_entrypoint: "frontend/src/App.tsx"
        },
        auth_architecture: "jwt",
        api_prefix: "/api",
        entities: [{ name: "User", table: "users" }],
        environment_variables: [{ name: "DATABASE_URL", required: true, default_dev: "sqlite:///./app.db" }]
      });
    }

    // 2. Requirement contract
    if (system.includes('Requirement Contract') && !system.includes('generated Manifest')) {
      return JSON.stringify({
        requirements: [
          { id: "REQ-001", description: "Database schema and models", source: "PRD", type: "database" },
          { id: "REQ-002", description: "System health check endpoint", source: "PRD", type: "backend" }
        ]
      });
    }

    // 3. Manifest generation with Database module (MOD-000) and Independent Backend module (MOD-001)
    if (system.includes('Principal Software Architect') && system.includes('JSON manifest')) {
      return JSON.stringify({
        project_id: 'c4_real_repro',
        project_requirements: {
          database: {
            entities: ['User'],
            tables: ['users'],
            relationships: [],
            foreign_keys: [],
            constraints: [],
            indexes: [],
            migrations_required: false,
            seed_required: true,
            initialization_requirements: true
          },
          backend: { apis: ['/api/health'] }
        },
        modules: [
          {
            id: 'MOD-000',
            name: 'Database Architecture & Schema',
            layer: 'DATABASE',
            dependencies: [],
            required_files: [
              { path: 'backend/app/db/models.py', purpose: 'Authoritative ORM Models' },
              { path: 'backend/app/db/env.py', purpose: 'Migration environment configuration' },
              { path: 'backend/app/db/script.py', purpose: 'Migration template script' },
              { path: 'backend/app/db/seed.py', purpose: 'Database seeding routine' },
              { path: 'backend/app/db/database.py', purpose: 'Database engine and session infrastructure' }
            ]
          },
          {
            id: 'MOD-001',
            name: 'System Health API',
            layer: 'BACKEND',
            dependencies: [], // Independent module!
            required_files: [
              { path: 'backend/app/api/health.py', purpose: 'Health check endpoint' }
            ]
          }
        ]
      });
    }

    // 4. File generation:
    const targetMatch = user.match(/TARGET FILE:\s*([^\r\n]+)/) || system.match(/<file path="([^"]+)">/);
    const target = targetMatch ? targetMatch[1].trim() : '';

    if (target.endsWith('models.py')) {
      return `<file path="backend/app/db/models.py">
from sqlalchemy import Column, Integer, String, Boolean
from app.db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    role = Column(String, default="Retailer")
    is_active = Column(Boolean, default=True)
</file>`;
    }

    if (target.endsWith('env.py')) {
      return `<file path="backend/app/db/env.py">
import os
from sqlalchemy import create_engine
from app.db.database import Base

target_metadata = Base.metadata
</file>`;
    }

    if (target.endsWith('script.py')) {
      return `<file path="backend/app/db/script.py">
from app.db.database import Base

metadata = Base.metadata
</file>`;
    }

    if (target.endsWith('seed.py')) {
      return `<file path="backend/app/db/seed.py">
from sqlalchemy.orm import Session
from app.db.database import engine, SessionLocal, Base
from app.db.models import User

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        user = User(username="admin", email="admin@example.com", role="Admin")
        db.add(user)
        db.commit()
    finally:
        db.close()
</file>`;
    }

    if (target.endsWith('database.py')) {
      return `<file path="backend/app/db/database.py">
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
</file>`;
    }

    if (target.endsWith('health.py')) {
      return `<file path="backend/app/api/health.py">
from fastapi import APIRouter

router = APIRouter(prefix="/api/health", tags=["health"])

@router.get("/")
def health_check():
    return {"status": "ok"}
</file>`;
    }

    if (target.includes('auth.py') && target.includes('schemas')) {
      return `<file path="${target}">
from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str
</file>`;
    }

    if (target.includes('auth.py')) {
      return `<file path="${target}">
from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
def login():
    return {"token": "xyz"}
</file>`;
    }

    if (target.endsWith('.md')) {
      return `<file path="${target}">\n# Project\n</file>`;
    }

    if (target.endsWith('.py')) {
      return `<file path="${target}">\n# Module file\n</file>`;
    }

    // Generic fallback for boilerplate/contracts
    if (user.includes('contract') || system.includes('contract')) {
      return JSON.stringify({ endpoints: [], schemas: [], dependencies: [] });
    }

    return `<file path="backend/requirements.txt">\nfastapi\nsqlalchemy\npydantic\n</file>`;
  };

  const prd = `# Test PRD: High-Resilience Database Schema
Must generate users table and health check.`;

  console.log('🧪 Running c4_real reproduction test...');
  await executeGeneration(
    {
      prd,
      workspacePath,
      mockLLM,
      generationId: 'c4_real_repro',
      autoApprove: true
    },
    sendEvent
  );

  const manifestPath = path.join(workspacePath, '.openclaw', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest, 'Manifest must exist');

  const dbMod = manifest.modules.find(m => m.id === 'MOD-000');
  assert.ok(dbMod, 'MOD-000 (Database) must exist in manifest');

  const independentMod = manifest.modules.find(m => m.id === 'MOD-001');
  assert.ok(independentMod, 'MOD-001 (Independent Health API) must exist in manifest');

  // ASSERTION 1: No repair attempts were spent on "not generated yet"
  const modelsFile = dbMod.required_files.find(f => f.path.endsWith('models.py'));
  const envFile = dbMod.required_files.find(f => f.path.endsWith('env.py'));
  const scriptFile = dbMod.required_files.find(f => f.path.endsWith('script.py'));
  const seedFile = dbMod.required_files.find(f => f.path.endsWith('seed.py'));
  const dbFile = dbMod.required_files.find(f => f.path.endsWith('database.py'));

  assert.ok(modelsFile, 'models.py must be present');
  assert.ok(envFile, 'env.py must be present');
  assert.ok(scriptFile, 'script.py must be present');
  assert.ok(seedFile, 'seed.py must be present');
  assert.ok(dbFile, 'database.py must be present');

  // Verify repairAttempts: must not have spent repair attempts on pending database.py
  assert.equal(modelsFile.repairAttempts || 0, 0, 'models.py must not spend repair attempts waiting for database.py');
  assert.equal(envFile.repairAttempts || 0, 0, 'env.py must not spend repair attempts waiting for database.py');
  assert.equal(scriptFile.repairAttempts || 0, 0, 'script.py must not spend repair attempts waiting for database.py');
  assert.equal(seedFile.repairAttempts || 0, 0, 'seed.py must not spend repair attempts waiting for database.py');

  const falseRepairEvents = events.filter(e =>
    e.event === 'import_closure_repair_queued' &&
    (e.data?.file?.includes('database.py') || JSON.stringify(e.data).includes('app.db.database'))
  );
  assert.equal(falseRepairEvents.length, 0, 'No import closure repairs must be queued for pending database.py');

  // ASSERTION 2: The database module does not fail
  assert.notEqual(dbMod.status, 'FAILED', 'MOD-000 must not fail due to file ordering');
  assert.ok(dbMod.status === 'PASSED' || dbMod.status === 'VALIDATED', `MOD-000 should pass/validate, got: ${dbMod.status}`);

  // ASSERTION 3: Independent modules still run and pass
  assert.notEqual(independentMod.status, 'FAILED', 'MOD-001 must not fail');
  assert.ok(independentMod.status === 'PASSED' || independentMod.status === 'VALIDATED', `Independent MOD-001 should pass/validate, got: ${independentMod.status}`);

  // ASSERTION 4: A module whose files are all validated is NOT left FAILED
  const allDbFilesValidated = dbMod.required_files.every(f => f.status === 'validated' || f.status === 'passed');
  assert.ok(allDbFilesValidated, 'All database files must have validated/passed status');
  assert.notEqual(dbMod.status, 'FAILED', 'Module with all validated files must NOT be left FAILED');

  console.log('✅ c4_real Reproduction Test Passed!');
});
