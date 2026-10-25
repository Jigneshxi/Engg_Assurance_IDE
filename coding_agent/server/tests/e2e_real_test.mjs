import 'dotenv/config';
import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';
import path from 'path';

const prd = `
Small Project Requirement:
Database: Users table with id, name, email.
Backend: API to get all users.
`;

const workspacePath = path.join(process.cwd(), 'e2e_test_workspace');
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

function sendEvent(type, data) {
  if (type === 'log') {
    console.log(`[LOG] ${data.message || data}`);
  } else {
    // console.log(`[EVENT] ${type}`); // too noisy
  }
}

async function runTest() {
  console.log("=== STARTING GENERATION ===");
  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath
    }, sendEvent);
  } catch (e) {
    console.error("Execution failed:", e);
  }

  const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`\nGlobal Status: ${manifest.globalStatus}, Current Layer: ${manifest.currentLayer}`);

  if (manifest.globalStatus === 'WAITING_FOR_APPROVAL' && manifest.currentLayer === 'DATABASE') {
    console.log("\n=== DATABASE PHASE COMPLETED AND GATED ===");
    console.log("APPROVING DATABASE...");
    
    // Simulate API approve action
    manifest.globalStatus = 'RUNNING';
    manifest.approvedLayer = manifest.currentLayer;
    manifest.approvalState = [{ phase: manifest.currentLayer, status: 'approved' }];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log("\n=== RESUMING GENERATION FOR BACKEND FOUNDATION ===");
    try {
      await executeGeneration({
        prd,
        existingFiles: [],
        generationMode: 'existing',
        workspacePath
      }, sendEvent);
    } catch (e) {
      console.error("Execution failed:", e);
    }
    
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`\nGlobal Status: ${manifest.globalStatus}, Current Layer: ${manifest.currentLayer}`);
    
    if (manifest.globalStatus === 'WAITING_FOR_APPROVAL' && manifest.currentLayer === 'BACKEND_FOUNDATION') {
      console.log("\n=== BACKEND FOUNDATION PHASE COMPLETED AND GATED ===");
      console.log("Test reached intended stopping point.");
      
      // Verify protection
      const dbModule = manifest.modules.find(m => m.layer === 'DATABASE');
      const bfModule = manifest.modules.find(m => m.layer === 'BACKEND_FOUNDATION');
      console.log("\nDATABASE MODULE STATUS:", dbModule?.status);
      console.log("BACKEND FOUNDATION MODULE STATUS:", bfModule?.status);
    } else {
      console.log("Unexpected state after Backend Foundation!");
    }
  } else {
    console.log("Failed to stop at Database gate!");
  }
}

runTest().catch(console.error);
