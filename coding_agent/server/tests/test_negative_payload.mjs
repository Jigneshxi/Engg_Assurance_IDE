// We'll mock the LLM by changing llmRouter or setting mockLLM in orchestrator, 
// but since the API takes `mockLLM` we can't easily pass it over HTTP.
// Instead, we will look at the `.openclaw/manifest.json` and the server logs 
// or write a quick unit test that imports orchestrator.js directly.

import { executeGeneration } from '../orchestrator.js';

async function testNegativePayload() {
  const prd = `
Project: Negative Payload Test
MOD-001 First Module (Dependencies: none)
- file1.js (purpose: do something)
MOD-002 Second Module (Dependencies: MOD-001)
- file2.js (purpose: do another thing)
  `;

  let capturedPrompts = [];

  const mockLLM = async (sys, user) => {
    if (sys.includes('Architecture Contract') || user.includes('Generate Architecture Contract JSON:')) {
      return JSON.stringify({
        project_name: "test",
        domain: "test",
        language: "javascript",
        backend_framework: "express",
        frontend_framework: "none",
        database: "sqlite",
        orm: "none",
        project_structure: {
          backend_root: ".",
          backend_entrypoint: "file1.js"
        },
        auth_architecture: "none",
        api_prefix: "/api",
        entities: [],
        layers: [],
        api_routes: []
      });
    } else if (sys.includes('Requirement Contract') || user.includes('Generate Requirement Contract JSON:')) {
      return JSON.stringify({
        requirements: [{ id: "REQ-001", description: "test", source: "PRD", type: "feature" }]
      });
    } else if (sys.includes('Principal Software Architect')) {
      // Manifest gen
      return JSON.stringify({
        project_id: "test",
        modules: [
          { id: "MOD-001", name: "First", dependencies: [], required_files: [{ path: "file1.js", purpose: "do something" }] },
          { id: "MOD-002", name: "Second", dependencies: ["MOD-001"], required_files: [{ path: "file2.js", purpose: "do another thing" }] }
        ]
      });
    } else if (sys.includes('pragmatic Software Architect') || user.includes('Is the manifest complete?')) {
      return JSON.stringify({ isValid: true, errors: [] });
    } else if (sys.includes('dependency contract')) {
      return 'Exports the generated files.';
    } else if (sys.includes('Principal Software Architect QA')) {
      return JSON.stringify({ isValid: true, semanticIssues: [] });
    } else if (sys.includes('Principal QA Engineer')) {
      return JSON.stringify({ complianceScore: 100 });
    } else {
      // File generation
      capturedPrompts.push(user);
      return `<file path="unknown">console.log('mock');</file>`;
    }
  };

  const sendEvent = (_event, _data) => {
    // console.log(event, data);
  };

  try {
    await executeGeneration({
      prd,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM
    }, sendEvent);

    console.log("Captured Prompts Count:", capturedPrompts.length);
    if (capturedPrompts.length > 0) {
      const firstPrompt = capturedPrompts[0];
      if (firstPrompt.includes('MOD-001') && !firstPrompt.includes('MOD-002')) {
        console.log("✅ NEGATIVE TEST PASSED: MOD-002 is completely isolated from MOD-001's prompt.");
      } else {
        console.log("❌ NEGATIVE TEST FAILED: Prompt contains unrelated module information.");
        console.log(firstPrompt);
      }
    }

  } catch (e) {
    console.error("Test error:", e);
  }
}

testNegativePayload();
