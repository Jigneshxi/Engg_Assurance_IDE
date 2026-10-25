import fs from 'fs';
import path from 'path';
import * as orchestrator from '../orchestrator.js';

let _callCount = 0;

const mockLLM = async (systemPrompt, userPrompt) => {
  _callCount++;
  
  if (systemPrompt.includes('Principal Software Architect')) {
    // Return a manifest for a 2-file project
    return `
    {
      "project": { "name": "Test Project", "description": "Mock project" },
      "stack": { "language": "JS" },
      "files": [
        { "path": "utils.js", "purpose": "helpers", "type": "backend", "dependsOn": [] },
        { "path": "main.js", "purpose": "entry", "type": "backend", "dependsOn": ["utils.js"] }
      ]
    }`;
  }
  
  if (systemPrompt.includes('Generate 100% complete')) {
    if (userPrompt.includes('TARGET FILE: utils.js')) {
      return `<file path="utils.js">
function add(a, b) { return a + b; }
module.exports = { add };
</file>`;
    }
    if (userPrompt.includes('TARGET FILE: main.js')) {
      // Intentionally introduce a syntax error on the first attempt
      if (userPrompt.includes('PREVIOUS VALIDATION ERRORS')) {
        // Repair attempt -> Return valid code
        return `<file path="main.js">
const { add } = require('./utils.js');
console.log(add(2, 3));
</file>`;
      } else {
        // First attempt -> Syntax Error
        return `<file path="main.js">
const { add } = require('./utils.js');
consle.log(add(2, 3) // Missing parenthesis and typo
</file>`;
      }
    }
  }
  
  if (systemPrompt.includes('Principal QA Engineer')) {
    // Semantic Validation
    return `
    {
      "complianceScore": 100,
      "missingFeatures": [],
      "implementedFeatures": ["math"],
      "missingFiles": [],
      "unexpectedFiles": [],
      "validationResults": "Pass"
    }`;
  }
  
  return "";
};

async function runE2E() {
  const workspacePath = path.join(process.cwd(), 'test_workspace');
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

  console.log("=== STARTING E2E MOCK GENERATION ===");
  try {
    await orchestrator.executeGeneration({
      prd: "Build a tiny math project",
      existingFiles: [],
      generationMode: 'new',
      workspacePath,
      mockLLM
    }, sendEvent);
    
    // VERIFICATION
    console.log("\n=== VERIFICATION RESULTS ===");
    
    const manifestPath = path.join(workspacePath, '.openclaw/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    const reportPath = path.join(workspacePath, '.openclaw/generation-report.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    console.log(`FILES PLANNED: ${report.plannedFiles}`);
    console.log(`FILES GENERATED: ${report.generatedFiles}`);
    console.log(`FILES VALIDATED: ${report.validatedFiles}`);
    console.log(`FILES FAILED: ${report.failedFiles}`);
    
    const mainFile = manifest.files.find(f => f.path === 'main.js');
    console.log(`REPAIR ATTEMPTS FOR main.js: ${mainFile.repairAttempts}`);
    console.log(`OLLAMA MODEL USED: Controlled by .env`);
    console.log(`MANIFEST PATH: ${manifestPath}`);
    console.log(`COMPLIANCE REPORT PATH: ${reportPath}`);
    
    if (mainFile.repairAttempts === 1 && report.validatedFiles === 2) {
      console.log("\n✅ E2E TEST PASSED: Validation caught the syntax error, triggered exactly 1 repair, and successfully recovered the file independently.");
    } else {
      console.log("\n❌ E2E TEST FAILED.");
    }
    
  } catch (e) {
    console.error("E2E Test Exception:", e);
  }
}

runE2E();
