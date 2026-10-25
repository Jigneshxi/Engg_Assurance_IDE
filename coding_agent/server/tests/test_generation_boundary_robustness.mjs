import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  mergeFileContinuation,
  executeGeneration,
  DATABASE_DEFECT_CODES
} from '../orchestrator.js';
import { getRepairStrategy } from '../repairEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
  }
}

console.log('====================================================');
console.log('🧪 RUNNING GENERATION BOUNDARY ROBUSTNESS TESTS');
console.log('====================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: mergeFileContinuation Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

await test('mergeFileContinuation: One continuation success with clean stitching', () => {
  const accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass ActivityBase(BaseModel):\n    name: str';
  const continuation = '    description: str\n    duration: int\n</file>';
  const targetPath = 'backend/app/schemas/activity.py';

  const res = mergeFileContinuation(accumulated, continuation, targetPath);
  assert.strictEqual(res.progress, true);
  assert.strictEqual(res.completed, true);
  assert.strictEqual(res.strategy, 'incremental_continuation');
  assert.ok(res.merged.includes('name: str'));
  assert.ok(res.merged.includes('description: str'));
  assert.ok(res.merged.includes('duration: int'));
  assert.ok(res.merged.endsWith('</file>'));
});

await test('mergeFileContinuation: Multiple continuation success across chunks', () => {
  const targetPath = 'backend/app/schemas/activity.py';
  let accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass ActivityBase(BaseModel):\n    id: int';

  // Chunk 1: adds fields, no </file>
  const chunk1 = '    title: str\n    calories: float';
  const res1 = mergeFileContinuation(accumulated, chunk1, targetPath);
  assert.strictEqual(res1.progress, true);
  assert.strictEqual(res1.completed, false);
  accumulated = res1.merged;

  // Chunk 2: adds remaining fields and closing tag
  const chunk2 = '    steps: int\n\nclass ActivityResponse(ActivityBase):\n    pass\n</file>';
  const res2 = mergeFileContinuation(accumulated, chunk2, targetPath);
  assert.strictEqual(res2.progress, true);
  assert.strictEqual(res2.completed, true);
  assert.ok(res2.merged.includes('calories: float'));
  assert.ok(res2.merged.includes('steps: int'));
  assert.ok(res2.merged.includes('ActivityResponse'));
  assert.ok(res2.merged.endsWith('</file>'));
});

await test('mergeFileContinuation: Overlap detection strips repeated lines without duplicating code', () => {
  const accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass ActivityBase(BaseModel):\n    id: int\n    title: str';
  // LLM repeated the last two lines before continuing
  const continuation = '    id: int\n    title: str\n    description: str\n</file>';
  const targetPath = 'backend/app/schemas/activity.py';

  const res = mergeFileContinuation(accumulated, continuation, targetPath);
  assert.strictEqual(res.progress, true);
  assert.strictEqual(res.completed, true);

  // Count occurrences of "id: int" and "title: str"
  const idMatches = res.merged.match(/id: int/g) || [];
  const titleMatches = res.merged.match(/title: str/g) || [];
  assert.strictEqual(idMatches.length, 1, 'id: int must not be duplicated');
  assert.strictEqual(titleMatches.length, 1, 'title: str must not be duplicated');
  assert.ok(res.merged.includes('description: str'));
  assert.ok(res.merged.endsWith('</file>'));
});

await test('mergeFileContinuation: Full file restart replacement when LLM provides complete file', () => {
  const accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n# cut off here';
  // LLM restarts from beginning with full file
  const fullRestart = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass Activity(BaseModel):\n    id: int\n    name: str\n</file>';
  const targetPath = 'backend/app/schemas/activity.py';

  const res = mergeFileContinuation(accumulated, fullRestart, targetPath);
  assert.strictEqual(res.progress, true);
  assert.strictEqual(res.completed, true);
  assert.strictEqual(res.strategy, 'full_restart_replacement');
  assert.strictEqual(res.merged, fullRestart);
  assert.strictEqual(res.merged.includes('# cut off here'), false, 'Partial old content should be cleanly replaced');
});

await test('mergeFileContinuation: Mid-line cutoff completion', () => {
  const accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass Activity(BaseModel):\n    user_id: Optio';
  const continuation = '    user_id: Optional[int] = None\n    name: str\n</file>';
  const targetPath = 'backend/app/schemas/activity.py';

  const res = mergeFileContinuation(accumulated, continuation, targetPath);
  assert.strictEqual(res.progress, true);
  assert.strictEqual(res.completed, true);
  assert.ok(res.merged.includes('user_id: Optional[int] = None'));
  assert.strictEqual(res.merged.includes('Optio user_id'), false);
});

await test('mergeFileContinuation: Stalled detection when continuation produces zero new content', () => {
  const accumulated = '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n    name: str';
  // Exact repeat with nothing new
  const continuation = '    name: str';
  const targetPath = 'backend/app/schemas/activity.py';

  const res = mergeFileContinuation(accumulated, continuation, targetPath);
  assert.strictEqual(res.progress, false);
  assert.strictEqual(res.strategy, 'stalled');
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: Orchestrator Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

const validManifestPayload = JSON.stringify({
  project_name: "boundary_test",
  project_requirements: {
    database: {
      entities: ["Activity"],
      tables: ["activities"],
      migrations_required: false,
      seed_required: false,
      initialization_requirements: false
    },
    backend: {
      framework: "fastapi",
      features: ["track activity"]
    }
  },
  modules: [
    {
      id: "MOD-000",
      name: "Database",
      layer: "DATABASE",
      required_files: [{ path: "backend/app/db/base.py" }]
    },
    {
      id: "MOD-001",
      name: "Backend Foundation",
      layer: "BACKEND_FOUNDATION",
      dependencies: ["MOD-000"],
      required_files: [{ path: "backend/requirements.txt" }]
    },
    {
      id: "MOD-002",
      name: "Schemas",
      layer: "BACKEND",
      dependencies: ["MOD-001"],
      required_files: [{ path: "backend/app/schemas/activity.py" }]
    }
  ]
});

const baseMockDispatcher = (continuationHandler, initialFileHandler) => {
  return async (sys, usr) => {
    if (sys.includes("Requirement Contract")) {
      return JSON.stringify({ requirements: [{ id: "1", description: "test", source: "test", type: "feature" }] });
    }
    if (sys.includes("Strict QA Architect") || sys.includes("pragmatic Software Architect") || usr.includes("Is the manifest complete?")) {
      return JSON.stringify({ isValid: true, errors: [] });
    }
    if (sys.includes("Requirement Coverage")) {
      return JSON.stringify({ coverage: [{ requirementId: "1", status: "COVERED" }] });
    }
    if (sys.includes("Architecture Contract")) {
      return JSON.stringify({
        project_name: "boundary_test",
        architecture: {
          language: "python",
          backend_framework: "fastapi",
          database: "sqlite",
          orm: "sqlalchemy"
        }
      });
    }
    if (usr.includes("project manifest") || usr.includes("Output Manifest JSON") || sys.includes("COHESIVE MODULE GROUPING")) {
      return validManifestPayload;
    }
    if (sys.includes("dependency contract")) {
      return "// dependency contract";
    }

    // File generation
    if (usr.includes("CONTINUATION REQUIRED: FILE GENERATION WAS INTERRUPTED")) {
      return await continuationHandler(sys, usr);
    }

    const targetMatch = usr.match(/TARGET FILE:\s*([^\r\n]+)/) || sys.match(/<file path="([^"]+)">/);
    const targetFile = targetMatch ? targetMatch[1].trim() : 'backend/app/db/base.py';

    if (targetFile === "backend/app/schemas/activity.py") {
      return await initialFileHandler(sys, usr);
    }

    if (targetFile === "backend/requirements.txt") {
      return '<file path="backend/requirements.txt">\nfastapi==0.100.0\npydantic==2.0.0\n</file>';
    }

    if (targetFile === "backend/app/db/models.py") {
      return `<file path="backend/app/db/models.py">
from sqlalchemy import Column, Integer, String
from app.db.base import Base

class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True)
    name = Column(String)
</file>`;
    }

    if (targetFile === "backend/app/db/database.py") {
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

    if (targetFile === "README.md") {
      return `<file path="README.md">\n# boundary_test\n</file>`;
    }

    // Default base.py with Activity entity
    return `<file path="${targetFile}">
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String

Base = declarative_base()

class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True)
    name = Column(String)
</file>`;
  };
};

await test('Orchestrator integration: One continuation success in live pipeline', async () => {
  const workspacePath = path.join(__dirname, 'scratch', 'test_boundary_one_continuation');
  if (fs.existsSync(workspacePath)) fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  const mockLLM = baseMockDispatcher(
    async () => '    duration: int\n    notes: str\n</file>',
    async () => '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass Activity(BaseModel):\n    id: int\n    name: str'
  );

  await executeGeneration({
    prd: "Track activity",
    projectName: 'boundary_test',
    workspacePath,
    autoApprove: true,
    generationId: 'test-gen-' + Date.now(),
    mockLLM
  }, sendEvent);

  const continuationStarted = events.some(e => typeof e.data === 'string' && e.data.includes('file_generation_continuation_started'));
  const continuationCompleted = events.some(e => typeof e.data === 'string' && e.data.includes('file_generation_continuation_completed'));
  assert.ok(continuationStarted, 'Continuation started event must be logged');
  assert.ok(continuationCompleted, 'Continuation completed event must be logged');

  const generatedFilePath = path.join(workspacePath, 'backend/app/schemas/activity.py');
  assert.ok(fs.existsSync(generatedFilePath), 'Generated file must exist');
  const content = fs.readFileSync(generatedFilePath, 'utf8');
  assert.ok(content.includes('name: str'), 'Original part must be present');
  assert.ok(content.includes('duration: int'), 'Continued part must be present');
  assert.ok(content.includes('notes: str'), 'End of continued part must be present');
});

await test('Orchestrator integration: Multiple continuation success across 2 continuation chunks', async () => {
  const workspacePath = path.join(__dirname, 'scratch', 'test_boundary_multi_continuation');
  if (fs.existsSync(workspacePath)) fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  let continuationChunkIndex = 0;
  const mockLLM = baseMockDispatcher(
    async () => {
      continuationChunkIndex++;
      if (continuationChunkIndex === 1) {
        return '    calories: float\n    steps: int';
      }
      return '    heart_rate: int\n</file>';
    },
    async () => '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass Activity(BaseModel):\n    id: int'
  );

  await executeGeneration({
    prd: "Track activity",
    projectName: 'boundary_test',
    workspacePath,
    autoApprove: true,
    generationId: 'test-gen-' + Date.now(),
    mockLLM
  }, sendEvent);

  assert.strictEqual(continuationChunkIndex, 2, 'Must have made 2 continuation calls');
  const generatedFilePath = path.join(workspacePath, 'backend/app/schemas/activity.py');
  const content = fs.readFileSync(generatedFilePath, 'utf8');
  assert.ok(content.includes('calories: float'), 'Chunk 1 content must be present');
  assert.ok(content.includes('steps: int'), 'Chunk 1 content must be present');
  assert.ok(content.includes('heart_rate: int'), 'Chunk 2 content must be present');
});

await test('Orchestrator integration: Continuation exhaustion triggers final boundary fallback', async () => {
  const workspacePath = path.join(__dirname, 'scratch', 'test_boundary_exhaustion');
  if (fs.existsSync(workspacePath)) fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  let continuationCallCount = 0;
  const mockLLM = baseMockDispatcher(
    async () => {
      continuationCallCount++;
      return `    field_${continuationCallCount}: str`;
    },
    async () => '<file path="backend/app/schemas/activity.py">\nfrom pydantic import BaseModel\n\nclass Activity(BaseModel):\n    id: int'
  );

  await executeGeneration({
    prd: "Track activity",
    projectName: 'boundary_test',
    workspacePath,
    autoApprove: true,
    generationId: 'test-gen-' + Date.now(),
    mockLLM
  }, sendEvent);

  assert.strictEqual(continuationCallCount, 4, 'Must have attempted 4 continuations before exhaustion');
  const autoAppendedLog = events.some(e => typeof e.data === 'string' && e.data.includes('Auto-appended missing </file> tag') && e.data.includes('final safety fallback'));
  assert.ok(autoAppendedLog, 'Must log auto-append as final safety fallback');

  const generatedFilePath = path.join(workspacePath, 'backend/app/schemas/activity.py');
  assert.ok(fs.existsSync(generatedFilePath), 'File must exist via final safety fallback');
  const content = fs.readFileSync(generatedFilePath, 'utf8');
  assert.ok(content.includes('field_1: str'));
  assert.ok(content.includes('field_4: str'));
});

await test('Repair status semantics: OutputFormatRepairStrategy preserved for format defects', () => {
  const stratMissing = getRepairStrategy(DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING);
  const stratTruncated = getRepairStrategy(DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED);
  const stratCreds = getRepairStrategy(DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED);

  assert.strictEqual(stratMissing.name, 'OutputFormatRepairStrategy');
  assert.strictEqual(stratTruncated.name, 'OutputFormatRepairStrategy');
  assert.strictEqual(stratCreds.name, 'DatabaseCredentialRepairStrategy');
  assert.notStrictEqual(stratMissing.name, 'DatabaseCredentialRepairStrategy');
});

console.log('\n====================================================');
console.log(`Results: ${passed}/${total} Generation Boundary Robustness tests passed.`);
console.log('====================================================\n');

if (passed !== total) {
  process.exit(1);
}
