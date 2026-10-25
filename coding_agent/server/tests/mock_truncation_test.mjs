import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';
import path from 'path';

const prd = "Simple PRD";
const workspacePath = path.join(process.cwd(), 'mock_test_workspace');
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

function sendEvent(type, data) {
  if (type === 'log') {
    console.log(`[LOG] ${data.message || data}`);
  }
}

let callCount = 0;

async function mockLLM(sys, usr) {
  callCount++;
  
  if (sys.includes("Requirement Contract")) {
     return JSON.stringify({ requirements: [{id: "1", description: "test", source: "test", type: "feature"}] });
  }
  
  if (sys.includes("Strict QA Architect")) {
     // Return valid
     return JSON.stringify({ isValid: true, errors: [] });
  }

  if (sys.includes("Requirement Coverage")) {
     return JSON.stringify({ coverage: [{requirementId: "1", status: "COVERED"}] });
  }
  
  if (usr.includes("Output Manifest JSON")) {
    if (callCount === 1 || usr.includes("CONTINUATION INSTRUCTION") === false) {
      // First attempt, return truncated
      return `\`\`\`json\n{
  "project_requirements": {
    "database": {
      "entities": ["User"],
      "tables": ["users"],
      "migrations_required": true,
      "seed_required": true,
      "initialization_requirements": true
    }
  },
  "modules": [
    {
      "id": "MOD-000",
      "name": "Database",
      "layer": "DATABASE",
      "required_files": [{"path": "backend/app/db/base.py"}]
    },
    {
      "id": "MOD-001",
      "name": "Backend Foundation",
      "layer": "BACKEND_FOUNDATION",
      "dependencies": ["MOD-000"],
      "required_files": [{"path": "backend/requirements.txt"}]
    },
    {
      "id": "MOD-999",
      "name": "Wiring",
      "layer": "BACKEND",
      "dependencies": ["MOD-000", "MOD-001"],
      "required_files": [{"path": "backend/main.py"}]
    }
  ]
`; // INTENTIONALLY TRUNCATED, NO BRACE
    } else {
      // Continuation
      return `}\n\`\`\``; 
    }
  }
  
  if (sys.includes("dependency contract")) {
    return "// mock contract";
  }
  
  // File generation
  return "print('hello')";
}

async function runTest() {
  console.log("=== STARTING MOCK TRUNCATION TEST ===");
  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM
    }, sendEvent);
  } catch (e) {
    console.error("Execution failed:", e);
  }

  const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log("Manifest was never generated!");
    return;
  }
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`\nGlobal Status: ${manifest.globalStatus}, Current Layer: ${manifest.currentLayer}`);
}

runTest().catch(console.error);
