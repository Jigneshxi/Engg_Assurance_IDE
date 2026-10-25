import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeGeneration } from '../orchestrator.js';

async function runRegressionTest() {
  process.env.DISABLE_DETERMINISTIC_REPAIR = 'true';
  console.log('🧪 Starting Regression Test: Exact Database Credential Failure & Targeted Repair...');

  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-db-regression-'));

  const events = [];
  const sendEvent = (event, data) => {
    events.push({ event, data });
  };

  let initialGenerationDone = false;
  let repairReceivedExistingContent = false;
  let repairReceivedDefect = false;

  const initialDefectiveCode = `import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

# Hardcoded database credentials (the defect!)
DATABASE_URL = "postgresql://postgres:supersecret99@localhost:5432/mydb"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`;

  const mockLLM = async (system, user) => {
    if (system.includes('Enterprise Systems Architect')) {
      return JSON.stringify({
        project_name: "TestDBRepair",
        domain: "database",
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
          backend_entrypoint: "backend/app/main.py",
          frontend_entrypoint: "frontend/src/App.tsx"
        },
        auth_architecture: "none",
        api_prefix: "/api",
        entities: [{ name: "User", table: "users" }],
        environment_variables: [{ name: "DATABASE_URL", required: true, default_dev: "sqlite:///./app.db" }]
      });
    }

    if (system.includes('Requirement Contract') && !system.includes('generated Manifest')) {
      return JSON.stringify({
        requirements: [
          { id: "REQ-001", description: "Database setup", source: "PRD", type: "database" }
        ]
      });
    }

    // 1. Manifest generation
    if (system.includes('Principal Software Architect') && system.includes('JSON manifest')) {
      return JSON.stringify({
        project_id: 'test_db_repair',
        project_requirements: {
          database: {
            entities: ['User'],
            tables: ['users'],
            initialization_requirements: true,
            migrations_required: false,
            seed_required: false
          },
          backend: { apis: ['/api/health'] }
        },
        modules: [
          {
            id: 'MOD-000',
            name: 'Database Architecture',
            layer: 'DATABASE',
            dependencies: [],
            required_files: [
              { path: 'backend/app/db/database.py', purpose: 'Database engine and session' },
              { path: 'backend/app/db/models.py', purpose: 'User model' }
            ]
          },
          {
            id: 'MOD-001',
            name: 'Backend Foundation',
            layer: 'BACKEND_FOUNDATION',
            dependencies: ['MOD-000'],
            required_files: [
              { path: 'backend/app/main.py', purpose: 'FastAPI entrypoint' }
            ]
          }
        ]
      });
    }

    // Semantic QA for manifest
    if (system.includes('semantic completeness QA') || system.includes('pragmatic Software Architect')) {
      return JSON.stringify({ isValid: true, errors: [] });
    }

    // 2. Targeted Repair Prompt
    if (system.includes('targeted, zero-regression code repair') || user.includes('VALIDATION DEFECTS TO REMEDY')) {
      if (user.includes('backend/app/db/database.py')) {
        repairReceivedExistingContent = user.includes('SessionLocal = sessionmaker');
        repairReceivedDefect = user.includes('DB001');

        // Confirm secret was redacted in the repair prompt
        if (user.includes('supersecret99')) {
          throw new Error('SECURITY VIOLATION: Unredacted secret appeared in repair prompt!');
        }

        // Return a targeted replacement patch
        return `<patch file="backend/app/db/database.py">
<search>
DATABASE_URL = "postgresql://postgres:supersecret99@localhost:5432/mydb"
</search>
<replace>
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")
</replace>
</patch>`;
      }
    }

    // 3. Initial File Generation
    if (user.includes('TARGET FILE: backend/app/db/database.py')) {
      initialGenerationDone = true;
      return `<file path="backend/app/db/database.py">
${initialDefectiveCode}
</file>`;
    }

    if (user.includes('TARGET FILE: backend/app/db/models.py')) {
      return `<file path="backend/app/db/models.py">
from backend.app.db.database import Base
from sqlalchemy import Column, Integer, String

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String)
</file>`;
    }

    if (user.includes('TARGET FILE: backend/app/main.py')) {
      return `<file path="backend/app/main.py">
from fastapi import FastAPI
app = FastAPI()
@app.get("/api/health")
def health():
    return {"status": "ok"}
</file>`;
    }

    // Dependency contract
    if (system.includes('dependency contract')) {
      return '// Exports User, get_db';
    }

    // Layer Semantic QA
    if (system.includes('Principal Software Architect QA')) {
      return JSON.stringify({ isValid: true, semanticIssues: [] });
    }

    // Project compliance report
    if (system.includes('Principal QA Engineer')) {
      return JSON.stringify({
        isValid: true,
        score: 98,
        errors: [],
        warnings: [],
        missingFeatures: [],
        implementedFeatures: ['database', 'health'],
        missingFiles: [],
        unexpectedFiles: []
      });
    }

    return `<file path="dummy.txt">dummy</file>`;
  };

  try {
    await executeGeneration({
      prd: 'Build a system with User database and FastAPI backend health endpoint.',
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM,
      autoApprove: true
    }, sendEvent);

    // Verify Assertions:
    // 1. Initial file was generated with the deliberate defect
    if (!initialGenerationDone) {
      throw new Error('Initial generation of database.py was not performed.');
    }
    console.log('✅ Assertion 1: Initial defective database.py generated.');

    // 2. Validator detected DB001 and entered repair mode
    const repairStartedEvent = events.find(e => e.event === 'repair_started' && e.data?.path === 'backend/app/db/database.py');
    if (!repairStartedEvent) {
      throw new Error('repair_started event was not emitted for database.py.');
    }
    console.log('✅ Assertion 2: Repair mode entered with repair_started event.');

    // 3. Repair layer received the existing file content
    if (!repairReceivedExistingContent) {
      throw new Error('Repair prompt did not receive existing file content.');
    }
    console.log('✅ Assertion 3: Repair received existing file content.');

    // 4. Repair prompt contained the exact defect code DB001
    if (!repairReceivedDefect) {
      throw new Error('Repair prompt did not receive structured DB001 defect code.');
    }
    console.log('✅ Assertion 4: Repair prompt contained structured DB001 defect code.');

    // 5. Targeted patch was generated, validated, and applied
    const patchAppliedEvent = events.find(e => e.event === 'repair_patch_applied' && e.data?.path === 'backend/app/db/database.py');
    if (!patchAppliedEvent) {
      throw new Error('repair_patch_applied event was not emitted for database.py.');
    }
    console.log('✅ Assertion 5: Targeted patch validated and applied.');

    // 6. Repair completed event emitted
    const repairCompletedEvent = events.find(e => e.event === 'repair_completed' && e.data?.path === 'backend/app/db/database.py');
    if (!repairCompletedEvent) {
      throw new Error('repair_completed event was not emitted.');
    }
    console.log('✅ Assertion 6: Repair completed successfully.');

    // 7. Module MOD-000 completed and passed
    const mod000Completed = events.find(e => e.event === 'module_completed' && e.data?.moduleId === 'MOD-000');
    if (!mod000Completed) {
      throw new Error('MOD-000 was not marked completed.');
    }
    const databaseValidationPassedIndex = events.findIndex(e =>
      e.event === 'log' && String(e.data).includes('Generic Database Validation PASSED.')
    );
    const moduleCompletedIndex = events.indexOf(mod000Completed);
    if (databaseValidationPassedIndex < 0 || moduleCompletedIndex <= databaseValidationPassedIndex) {
      throw new Error('MOD-000 completed before database semantic validation passed.');
    }
    console.log('✅ Assertion 7: Module MOD-000 passed.');
    console.log('✅ Assertion 7a: MOD-000 completed only after database semantic validation passed.');

    // 8. Orchestrator proceeded to the next module MOD-001
    const mod001Started = events.find(e => e.event === 'module_started' && e.data?.moduleId === 'MOD-001');
    if (!mod001Started) {
      throw new Error('Orchestrator did not proceed to MOD-001.');
    }
    console.log('✅ Assertion 8: Orchestrator proceeded to MOD-001.');

    // 9. Inspect manifest file to verify repaired code persisted without credentials
    const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
    const storedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const dbFile = storedManifest.modules.flatMap(m => m.required_files).find(f => f.path === 'backend/app/db/database.py');

    if (!dbFile || !dbFile.content) {
      throw new Error('database.py is missing from manifest or has empty content.');
    }
    if (dbFile.content.includes('supersecret99')) {
      throw new Error('Hardcoded secret is still present in final database.py content!');
    }
    if (!dbFile.content.includes('os.getenv("DATABASE_URL"')) {
      throw new Error('Patched environment variable code is missing in final database.py!');
    }
    if (!dbFile.content.includes('SessionLocal = sessionmaker')) {
      throw new Error('Unrelated code was lost during repair!');
    }
    console.log('✅ Assertion 9: Patched file verified in manifest; surrounding code intact, credentials eliminated.');

    console.log('\n🎉 ALL REGRESSION ASSERTIONS PASSED! The exact database credential generation and repair failure is resolved.');
  } catch (err) {
    console.error('❌ REGRESSION TEST FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(workspacePath)) {
      try {
        fs.rmSync(workspacePath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`Could not remove temporary regression workspace: ${cleanupError.message}`);
        process.exitCode = 1;
      }
    }
  }
}

runRegressionTest().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
