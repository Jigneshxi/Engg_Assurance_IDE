import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';

let callCount = 0;

function createMockLLM() {
  return async (sys, user) => {
    if (sys.includes('Principal Software Architect')) {
      return JSON.stringify({ 
        project_id: "continuation_test", 
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
    
    // Simulate generation loop
    callCount++;
    if (callCount === 1) {
      // First attempt: return incomplete file
      return `<file path="app.js">\nconst x = 1;\nconsole.log(x); // I am stopping here`;
    } else if (callCount === 2) {
      // Continuation attempt
      if (user.includes('YOUR PREVIOUS OUTPUT WAS INCOMPLETE')) {
         return `\nconst y = 2;\nconsole.log(y);\n</file>`;
      } else {
         throw new Error("Continuation prompt not detected!");
      }
    } else if (callCount === 3) {
      // Contract extraction
      return `// Contract for app.js\nconst x = 1;\nconst y = 2;`;
    }
    
    return `<file path="app.js"></file>`;
  };
}

async function runContinuationTest() {
  console.log(`\n=== RUNNING CONTINUATION TEST ===`);
  let logs = [];
  const sendEvent = (event, data) => {
    if (event === 'log') logs.push(data);
  };

  try {
    if (fs.existsSync('.openclaw/manifest.json')) {
      fs.unlinkSync('.openclaw/manifest.json');
    }

    await executeGeneration({
      prd: `test_continuation`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM()
    }, sendEvent);
    
    const manifest = JSON.parse(fs.readFileSync('.openclaw/manifest.json', 'utf8'));
    const fileStat = manifest.modules[0].required_files[0];
    
    if (fileStat.status === 'validated' && fileStat.content.includes('const y = 2')) {
      console.log(`✅ PASSED: Continuation correctly appended the missing file chunk.`);
    } else {
      console.log(`❌ FAILED: Continuation did not append correctly.`);
      console.log(fileStat);
      console.log(logs.join('\n'));
    }
  } catch (err) {
      console.log(`❌ FAILED: Caught error -> ${err.message}`);
  }
}

runContinuationTest();
