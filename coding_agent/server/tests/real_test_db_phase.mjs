
import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';
import path from 'path';

const prd = `
Small Test Project

Database:
- users
  - id
  - name
  - email

- products
  - id
  - name
  - price
  - stock

Backend:
- User API
- Product API

Frontend:
- Login page
- Product listing page
`;

const workspacePath = path.join(process.cwd(), 'real_test_workspace');
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

function sendEvent(type, data) {
  if (type === 'log') {
    console.log(`[LOG] ${data.message || data}`);
  } else {
    console.log(`[EVENT] ${type}`, typeof data === 'object' ? JSON.stringify(data) : data);
  }
}

async function runTest() {
  console.log("=== STARTING REAL EXECUTION (DATABASE PHASE ONLY) ===");
  await executeGeneration({
    prd,
    existingFiles: [],
    generationMode: 'new',
    workspacePath
  }, sendEvent);
  
  const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`\nGlobal Status: ${manifest.globalStatus}`);
    console.log(`Current Layer: ${manifest.currentLayer}\n`);
    
    console.log("\nPending Modules:");
    manifest.modules.filter(m => m.status === 'PENDING').forEach(m => {
      console.log(`- [${m.layer}] ${m.name}`);
    });
  } else {
    console.log("Manifest was not generated!");
  }
}

runTest().catch(console.error);
