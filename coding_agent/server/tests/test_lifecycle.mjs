import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';

function createMockLLM() {
  let attempt = 0;
  return async (sys, _user) => {
    if (sys.includes('Principal Software Architect')) {
      return JSON.stringify({ 
        project_id: "lifecycle_test", 
        modules: [{ 
          id: "MOD-001", 
          name: "Test Module", 
          dependencies: [], 
          required_files: [{ path: "app.js", purpose: "test" }] 
        }] 
      });
    } else if (sys.includes('Principal QA Engineer')) {
      return JSON.stringify({ complianceScore: 100 });
    }
    
    // First attempt: return bad syntax to trigger repair
    if (attempt === 0) {
      attempt++;
      return `<file path="app.js">const x = {;</file>`;
    } else {
      // Second attempt: return fixed code
      return `<file path="app.js">const x = {};</file>`;
    }
  };
}

async function runLifecycleTest() {
  console.log(`\n=== RUNNING LIFECYCLE (REPAIR) TEST ===`);
  let statusLog = [];

  const sendEvent = (event, data) => {
    if (event === 'log') {
       const msg = typeof data === 'string' ? data : JSON.stringify(data);
       if (msg.includes('Repairing') || msg.includes('Validation failed') || msg.includes('Syntax checks passed')) {
           statusLog.push(msg);
       }
    }
  };

  try {
    if (fs.existsSync('.openclaw/manifest.json')) {
      fs.unlinkSync('.openclaw/manifest.json');
    }

    await executeGeneration({
      prd: `test_lifecycle`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM()
    }, sendEvent);
    
    const manifest = JSON.parse(fs.readFileSync('.openclaw/manifest.json', 'utf8'));
    const fileStat = manifest.modules[0].required_files[0];
    
    if (fileStat.status === 'validated' && statusLog.some(msg => msg.includes('Repairing'))) {
      console.log(`✅ PASSED: File was generated, failed validation, successfully entered repair loop, and was fixed.`);
      console.log(statusLog.join('\n'));
    } else {
      console.log(`❌ FAILED: Repair lifecycle did not execute correctly.`);
      console.log(fileStat);
      console.log(statusLog);
    }
  } catch (err) {
      console.log(`❌ FAILED: Caught error -> ${err.message}`);
  }
}

runLifecycleTest();
