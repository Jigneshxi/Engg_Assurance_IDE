import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { executeGeneration } from '../orchestrator.js';
import { callLLM } from '../llmRouter.js';
import { execSync } from 'child_process';

const prd = `Build a small 10-file Node.js/Express API with an SQLite database and a React frontend.
Backend requirements:
- backend/package.json (dependencies: express, sqlite3, jest, supertest, scripts: test)
- backend/server.js (Express server, exports app)
- backend/db.js (SQLite setup, MUST export all required db functions directly)
- backend/routes.js (GET /api/users, POST /api/users)
- backend/server.test.js (Jest tests for the API using supertest)
Frontend requirements:
- frontend/package.json (dependencies: react, react-dom, scripts: test)
- frontend/index.html
- frontend/src/index.js
- frontend/src/App.js (Fetches and displays /api/users)
Ensure all code is valid, production-ready, and uses no placeholders. Use CommonJS for backend.`;

async function runTest() {
  const workspacePath = path.join(process.cwd(), 'small_real_test_workspace');
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
  fs.mkdirSync(workspacePath);

  const logs = [];
  const sendEvent = (type, data) => {
    if (type === 'log') {
      console.log(data);
      logs.push(data);
    }
  };

  let generatedFileCount = 0;
  let hasInjectedError = false;
  let hasSimulatedCrash = false;

  // Intercept the REAL LLM to inject an error for testing repair, and simulate a crash
  const interceptedLLM = async (sys, user) => {
    if (user.includes('TARGET FILE: backend/server.js') && !hasInjectedError && !user.includes('PREVIOUS VALIDATION ERRORS')) {
      hasInjectedError = true;
      console.log('💉 [TEST INJECTION] Intercepting backend/server.js to inject syntax error...');
      return `<file path="backend/server.js">
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./routes'))
const server = app.listen(3000, () => console.log('OK'); // missing parenthesis!
module.exports = app;
</file>`;
    }
    
    // Pass through to the real LLM (Ollama)
    return await callLLM(sys, user);
  };

  // We can't easily hook into the exact iteration inside the while loop without modifying orchestrator to fire an event.
  // Wait, I can track file generation count via `sendEvent`.
  const testSendEvent = (type, data) => {
    sendEvent(type, data);
    if (type === 'file') {
      generatedFileCount++;
      if (generatedFileCount === 4 && !hasSimulatedCrash) {
        hasSimulatedCrash = true;
        console.log('💥 [TEST CRASH] Simulating unexpected network drop or server crash...');
        throw new Error('SIMULATED_NETWORK_CRASH');
      }
    }
  };
  
  const testResumeSendEvent = (type, data) => {
    sendEvent(type, data);
    if (type === 'done') {
      // Write files to disk for phase 3!
      console.log('💾 Writing generated files to workspace...');
      data.files.forEach(f => {
        const fullPath = path.join(workspacePath, f.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, f.content, 'utf8');
      });
    }
  };

  console.log("=== STARTING PHASE 1: GENERATION & CRASH SIMULATION ===");
  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM: interceptedLLM
    }, testSendEvent);
  } catch (e) {
    if (e.message === 'SIMULATED_NETWORK_CRASH') {
      console.log("✅ [TEST] Successfully caught simulated crash.");
    } else {
      console.error("❌ [TEST] Unexpected error during Phase 1:", e);
      return;
    }
  }

  console.log("\n=== STARTING PHASE 2: RESUMPTION ===");
  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM: interceptedLLM
    }, testResumeSendEvent); // Use custom event to catch 'done' and write files
  } catch (e) {
    console.error("❌ [TEST] Error during Phase 2:", e);
    return;
  }

  console.log("\n=== STARTING PHASE 3: REAL BUILD & TEST ===");
  try {
    const backendPath = path.join(workspacePath, 'backend');
    if (fs.existsSync(backendPath)) {
      console.log('📦 Installing backend dependencies...');
      execSync('npm install', { cwd: backendPath, stdio: 'inherit' });
      console.log('🧪 Running backend tests...');
      execSync('npm test', { cwd: backendPath, stdio: 'inherit' });
      console.log('✅ Backend tests passed.');
    } else {
      console.log('⚠️ Backend folder not found.');
    }
  } catch (e) {
    console.error("❌ [TEST] Build/Tests failed:", e.message);
  }

  console.log("\n=== FULL PIPELINE VERIFICATION COMPLETE ===");
}

runTest();
