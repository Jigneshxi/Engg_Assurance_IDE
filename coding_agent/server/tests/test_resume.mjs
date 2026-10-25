import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';

function createMockLLM() {
  return async (sys, user) => {
    if (sys.includes('Enterprise Systems Architect')) {
      return JSON.stringify({
        project_name: "ResumeTest",
        domain: "test",
        language: "javascript",
        backend_framework: "express",
        frontend_framework: "react",
        database: "sqlite",
        orm: "sqlalchemy",
        project_structure: {
          backend_root: "backend",
          frontend_root: "frontend",
          db_models_path: "file1.js",
          db_connection_path: "file1.js",
          base_import: "const Base = {}",
          get_db_import: "const get_db = () => {}",
          backend_entrypoint: "file1.js",
          frontend_entrypoint: "file2.js"
        },
        auth_architecture: "none",
        api_prefix: "/api",
        entities: [{ name: "First", table: "first" }],
        environment_variables: []
      });
    } else if (sys.includes('Principal Software Architect')) {
      return JSON.stringify({ 
        project_id: "resume_test", 
        requirements: [{ id: "REQ-001", description: "test", type: "feature" }],
        modules: [
          { 
            id: "MOD-001", 
            name: "First", 
            dependencies: [], 
            required_files: [{ path: "file1.js", purpose: "test" }] 
          },
          { 
            id: "MOD-002", 
            name: "Second", 
            dependencies: ["MOD-001"], 
            required_files: [{ path: "file2.js", purpose: "test" }] 
          }
        ] 
      });
    } else if (sys.includes('Principal QA Engineer')) {
      return JSON.stringify({ complianceScore: 100 });
    }
    
    if (user.includes('TARGET FILE: file2.js')) {
      throw new Error("FATAL SERVER CRASH SIMULATION");
    }
    
    const match = user.match(/TARGET FILE: (.*\.js)/);
    const path = match ? match[1] : 'unknown.js';
    return `<file path="${path}">console.log('done');</file>`;
  };
}

async function runResumeTest() {
  console.log(`\n=== RUNNING RESUME TEST ===`);
  
  if (fs.existsSync('.openclaw/manifest.json')) {
    fs.unlinkSync('.openclaw/manifest.json');
  }

  // First run - will crash
  try {
    await executeGeneration({
      prd: `test_resume`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM()
    }, () => {});
  } catch (err) {
    console.log(`Caught expected fatal crash: ${err.message}`);
  }

  const manifestAfterCrash = JSON.parse(fs.readFileSync('.openclaw/manifest.json', 'utf8'));
  console.log(`After Crash -> MOD-001 Status: ${manifestAfterCrash.modules[0].status}, MOD-002 Status: ${manifestAfterCrash.modules[1].status}`);

  // Second run - Resume
  let phaseLogs = [];
  const sendEvent = (event, data) => {
    if (event === 'module_started') {
      phaseLogs.push(`Started ${data.moduleId}`);
    }
  };

  try {
    await executeGeneration({
      prd: `test_resume`, // Same PRD hash
      existingFiles: [],
      generationMode: 'existing',
      workspacePath: process.cwd(),
      mockLLM: async (sys, user) => {
        if (sys.includes('QA')) return JSON.stringify({ complianceScore: 100 });
        const match = user.match(/TARGET FILE: (.*\.js)/);
        const path = match ? match[1] : 'unknown.js';
        return `<file path="${path}">console.log('resumed');</file>`;
      }
    }, sendEvent);
    
    if (!phaseLogs.includes('Started MOD-001') && phaseLogs.includes('Started MOD-002')) {
      console.log(`✅ PASSED: Resume correctly skipped MOD-001 and successfully started MOD-002.`);
    } else {
      console.log(`❌ FAILED: Resume did not behave as expected.`);
      console.log(phaseLogs);
    }

  } catch (err) {
      console.log(`❌ FAILED: Second run crashed -> ${err.message}`);
  }
}

runResumeTest();
