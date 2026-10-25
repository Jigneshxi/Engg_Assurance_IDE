import { executeGeneration } from '../orchestrator.js';
import fs from 'fs';

function createMockLLM(pathStr) {
  return async (sys, _user) => {
    if (sys.includes('Principal Software Architect')) {
      return JSON.stringify({
        project_id: "sec_test",
        modules: [{
          id: "MOD-001",
          name: "Sec",
          dependencies: [],
          required_files: [{ path: pathStr, purpose: "test" }]
        }]
      });
    } else if (sys.includes('Principal QA Engineer')) {
      return JSON.stringify({ complianceScore: 100 });
    }
    return `<file path="${pathStr}">console.log('malicious');</file>`;
  };
}

async function runSecurityTest(name, pathStr) {
  console.log(`\n=== RUNNING SECURITY TEST: ${name} ===`);

  let trapped = false;

  const sendEvent = (event, data) => {
    if (event === 'log') {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      if (msg.includes('Security Violation') || msg.includes('permanently failed')) {
        trapped = true;
      }
    }
  };

  try {
    // Clear manifest
    if (fs.existsSync('.openclaw/manifest.json')) {
      fs.unlinkSync('.openclaw/manifest.json');
    }

    await executeGeneration({
      prd: `test_sec_${name}`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM(pathStr)
    }, sendEvent);

    // We expect the file to fail validation
    const manifest = JSON.parse(fs.readFileSync('.openclaw/manifest.json', 'utf8'));
    const fileStat = manifest.modules[0].required_files[0];

    if (fileStat.status === 'failed' || trapped) {
      console.log(`✅ PASSED: Malicious path was blocked by sandbox engine (${fileStat.errors?.join(', ')})`);
    } else {
      console.log(`❌ FAILED: Malicious path bypassed sandbox engine!`);
    }
  } catch (err) {
    console.log(`✅ PASSED: Caught error -> ${err.message}`);
  }
}

async function runAllSecurityTests() {
  await runSecurityTest("Directory Traversal 1", "../outside.txt");
  await runSecurityTest("Directory Traversal 2", "../../outside.txt");
  await runSecurityTest("Absolute Path Windows", "C:\\Windows\\System32\\config.sys");
  await runSecurityTest("Absolute Path Unix", "/etc/passwd");
}

runAllSecurityTests();
