import fs from 'fs';
const envFile = fs.readFileSync('../.env', 'utf-8');
for (const line of envFile.split('\n')) {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/(^"|"$)/g, '');
  }
}
import { executeGeneration } from '../orchestrator.js';

const prd = `
Build a simple API with a Foundation module, a Backend module, and a Frontend module.
`;

async function runE2E() {
  console.log(`\n=== RUNNING REAL E2E TEST ===`);

  const sendEvent = (event, data) => {
    if (event === 'log') {
       const msg = typeof data === 'string' ? data : JSON.stringify(data);
       console.log(msg);
    }
  };

  try {
    await executeGeneration({
      prd: prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: null // Force REAL LLM
    }, sendEvent);
    console.log("✅ REAL E2E TEST FINISHED SUCCESSFULLY");
  } catch (err) {
    console.log(`❌ REAL E2E TEST FAILED: ${err.message}`);
  }
}

runE2E();
