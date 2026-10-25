import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeGeneration } from '../orchestrator.js';

async function runOrmRepairTest({ leaveDefect = false } = {}) {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-orm-repair-'));
  const events = [];
  const sendEvent = (event, data) => events.push({ event, data });
  const modelsPath = 'backend/app/db/models.py';
  const databasePath = 'backend/app/db/database.py';
  const backendPath = 'backend/app/main.py';
  let repairTarget = null;
  let repairStrategy = null;

  const initialModels = `from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
`;

  const reciprocalPatch = `<patch file="${modelsPath}">
<search>
class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
</search>
<replace>
class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    order_items = relationship('OrderItem', back_populates='product')
</replace>
</patch>`;
  const noProgressPatch = `<patch file="${modelsPath}">
<search>
class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
</search>
<replace>
class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    # Preserve the existing product model.
</replace>
</patch>`;

  const mockLLM = async (system, user) => {
    if (system.includes('Principal Software Architect') && system.includes('JSON manifest')) {
      return JSON.stringify({
        project_id: 'orm_relationship_repair',
        project_requirements: {
          database: {
            entities: ['OrderItem', 'Product'],
            tables: ['order_items', 'products'],
            relationships: [],
            foreign_keys: [],
            constraints: [],
            indexes: [],
            migrations_required: false,
            seed_required: false,
            initialization_requirements: false
          },
          backend: { apis: ['/health'] }
        },
        modules: [
          {
            id: 'MOD-000',
            name: 'Database Architecture & Schema',
            layer: 'DATABASE',
            dependencies: [],
            required_files: [
              { path: databasePath, purpose: 'Database Base setup' },
              { path: modelsPath, purpose: 'ORM model classes' }
            ]
          },
          {
            id: 'MOD-001',
            name: 'Backend Foundation',
            layer: 'BACKEND_FOUNDATION',
            dependencies: ['MOD-000'],
            required_files: [{ path: backendPath, purpose: 'FastAPI entrypoint' }]
          }
        ]
      });
    }

    if (system.includes('pragmatic Software Architect')) {
      return JSON.stringify({ isValid: true, errors: [] });
    }

    if (system.includes('targeted, zero-regression code repair')) {
      const targetMatch = user.match(/TARGET FILE: ([^\n]+)/);
      repairTarget = targetMatch?.[1] || null;
      const strategyMatch = user.match(/STRATEGY: ([^\n]+)/);
      repairStrategy = strategyMatch?.[1] || null;
      if (repairTarget !== modelsPath || !user.includes('Product.order_items')) {
        throw new Error(`ORM repair was not targeted to ${modelsPath} with the expected reciprocal context.`);
      }
      return leaveDefect ? noProgressPatch : reciprocalPatch;
    }

    const isTargetFile = (p) => new RegExp(`(?:PATH|TARGET FILE|FILE):\\s*${p.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(user);

    if (isTargetFile(databasePath)) {
      return `<file path="${databasePath}">import os\nfrom sqlalchemy import create_engine\nfrom sqlalchemy.orm import declarative_base, sessionmaker\nBase = declarative_base()\nDATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)\ndef get_db():\n    db = SessionLocal()\n    try:\n        yield db\n    finally:\n        db.close()\n</file>`;
    }
    if (isTargetFile(modelsPath)) {
      return `<file path="${modelsPath}">${initialModels}</file>`;
    }
    if (isTargetFile(backendPath)) {
      return `<file path="${backendPath}">from fastapi import FastAPI\napp = FastAPI()</file>`;
    }
    if (isTargetFile('README.md')) {
      return `<file path="README.md"># Project Catalog\nComprehensive catalog API implementation with models.</file>`;
    }
    if (system.includes('dependency contract')) return 'Exports the generated database models.';
    if (system.includes('Principal Software Architect QA')) {
      return JSON.stringify({ isValid: true, semanticIssues: [] });
    }
    if (system.includes('Principal QA Engineer')) {
      return JSON.stringify({
        isValid: true,
        score: 100,
        errors: [],
        warnings: [],
        missingFeatures: [],
        implementedFeatures: ['database', 'backend'],
        missingFiles: [],
        unexpectedFiles: []
      });
    }

    const tf = user.match(/TARGET FILE: ([^\n]+)/)?.[1] || user.match(/Path: ([^\n]+)/)?.[1] || 'UNKNOWN';
    throw new Error(`Unexpected mock LLM request: TARGET=${tf}`);
  };

  try {
    await executeGeneration({
      prd: 'Build a small catalog API with Product and OrderItem models. Each OrderItem belongs to a Product.',
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM,
      autoApprove: true
    }, sendEvent);

    if (repairTarget !== modelsPath) throw new Error(`Expected repair target ${modelsPath}, got ${repairTarget}`);
    if (repairStrategy !== 'RelationshipRepairStrategy') throw new Error(`Unexpected repair strategy: ${repairStrategy}`);
    if (!events.some(event => event.event === 'repair_patch_applied' && event.data?.path === modelsPath)) {
      throw new Error('Targeted ORM patch was not applied to models.py.');
    }
    if (events.some(event => event.event === 'repair_started' && event.data?.path === databasePath)) {
      throw new Error('DB_REL001 was incorrectly routed to database.py.');
    }

    if (leaveDefect) {
      const noProgressEvent = events.find(event => event.event === 'semantic_repair_no_progress');
      const modelRepairAttempts = events.filter(event => event.event === 'repair_started' && event.data?.path === modelsPath).length;
      if (!noProgressEvent || modelRepairAttempts !== 1) {
        throw new Error(`Expected one ORM repair then no-progress stop; event=${Boolean(noProgressEvent)}, attempts=${modelRepairAttempts}`);
      }
      if (events.some(event => event.event === 'module_completed' && event.data?.moduleId === 'MOD-000')) {
        throw new Error('MOD-000 completed despite the unresolved DB_REL001 defect.');
      }
      if (!events.some(event => event.event === 'module_blocked' && event.data?.moduleId === 'MOD-001')) {
        throw new Error('Dependent MOD-001 was not blocked after MOD-000 failed.');
      }

      const manifestPath = path.join(workspacePath, '.openclaw', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.phaseRepairAttempts !== 2) {
        throw new Error(`Expected stop after the first semantic repair, got ${manifest.phaseRepairAttempts} phase attempts.`);
      }
      if (manifest.modules.find(module => module.id === 'MOD-000')?.status !== 'FAILED') {
        throw new Error('MOD-000 was not marked FAILED after semantic no-progress.');
      }
      if (!events.some(event => event.event === 'generation_failed_final_validation')) {
        throw new Error('Unresolved semantic defect did not fail the final completion gate.');
      }
      console.log('ORM no-progress regression passed: identical DB_REL001 stopped after one targeted repair and blocked dependents.');
      return;
    }

    const validationPassedIndex = events.findIndex(event =>
      event.event === 'log' && String(event.data).includes('Generic Database Validation PASSED.')
    );
    const moduleCompletedIndex = events.findIndex(event =>
      event.event === 'module_completed' && event.data?.moduleId === 'MOD-000'
    );
    if (validationPassedIndex < 0 || moduleCompletedIndex <= validationPassedIndex) {
      throw new Error('MOD-000 completed before its database semantic validation passed.');
    }
    if (!events.some(event => event.event === 'module_started' && event.data?.moduleId === 'MOD-001')) {
      throw new Error('Dependent MOD-001 did not proceed after MOD-000 passed.');
    }

    const manifestPath = path.join(workspacePath, '.openclaw', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const storedModels = manifest.modules.flatMap(module => module.required_files).find(file => file.path === modelsPath)?.content || '';
    if (!storedModels.includes("order_items = relationship('OrderItem', back_populates='product')")) {
      throw new Error('Reciprocal relationship was not persisted in the generated model.');
    }
    if (!storedModels.includes('class OrderItem(Base):')) {
      throw new Error('Targeted patch removed the unrelated OrderItem model.');
    }
    const gateEvents = events.filter(e => e.event.includes('gate') || e.event.includes('completed') || e.event.includes('failed'));
    console.log('Gate events:', JSON.stringify(gateEvents, null, 2));
    if (!events.some(event => event.event === 'module_completed' && event.data?.moduleId === 'MOD-001')) {
      throw new Error('MOD-001 did not complete successfully after MOD-000 unblocked it.');
    }

    console.log('ORM orchestrator regression passed: DB_REL001 targeted models.py, patched reciprocally, revalidated, and unblocked MOD-001.');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

(async () => {
  await runOrmRepairTest();
  await runOrmRepairTest({ leaveDefect: true });
})().catch(error => {
  console.error('ORM orchestrator regression failed:', error);
  process.exitCode = 1;
});
