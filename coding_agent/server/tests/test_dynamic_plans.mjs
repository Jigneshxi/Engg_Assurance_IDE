import { executeGeneration } from '../orchestrator.js';

function createMockLLM(moduleCount, circular = false) {
  return async (sys, user) => {
    if (sys.includes('Principal Software Architect')) {
      const modules = [];
      for (let i = 1; i <= moduleCount; i++) {
        let deps = [];
        if (circular) {
           deps = [(i === moduleCount) ? 'MOD-001' : `MOD-${String(i+1).padStart(3, '0')}`];
        } else if (i > 1) {
           deps = [`MOD-${String(i-1).padStart(3, '0')}`]; // Linear chain
        }
        
        modules.push({
          id: `MOD-${String(i).padStart(3, '0')}`,
          name: `Module ${i}`,
          dependencies: deps,
          required_files: [{ path: `file${i}.js`, purpose: "test" }]
        });
      }
      return JSON.stringify({ project_id: "test", modules });
    } else if (sys.includes('Principal QA Engineer')) {
      return JSON.stringify({ complianceScore: 100 });
    } else {
      // Mock File output
      const match = user.match(/TARGET FILE: (.*\.js)/);
      const path = match ? match[1] : 'unknown.js';
      return `<file path="${path}">console.log('generated');</file>`;
    }
  };
}

async function runDynamicTest(name, moduleCount, circular = false) {
  console.log(`\n=== RUNNING TEST: ${name} (${moduleCount} modules) ===`);
  let maxPhase = 0;
  
  const sendEvent = (event, data) => {
    if (event === 'phase_started') {
      maxPhase = Math.max(maxPhase, data.phase);
      console.log(`[Phase ${data.phase}] Started with ${data.modules.length} modules`);
    } else if (event === 'log') {
       if (data.includes('Circular dependency')) console.log(data);
    }
  };

  try {
    await executeGeneration({
      prd: `test_${name}`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM(moduleCount, circular)
    }, sendEvent);
    
    console.log(`✅ TEST PASSED. Max phases calculated: ${maxPhase}`);
  } catch (e) {
    if (circular && e.message.includes('Circular dependency')) {
      console.log(`✅ TEST PASSED: Successfully detected circular dependency.`);
    } else {
      console.error("❌ TEST FAILED:", e.message);
    }
  }
}

async function main() {
  await runDynamicTest('3 Module Linear', 3);
  await runDynamicTest('7 Module Linear', 7);
  await runDynamicTest('40 Module Linear', 40);
  await runDynamicTest('Circular Dependency', 3, true);
}

main();
