import { executeGeneration } from '../orchestrator.js';

function createMockLLM(modules) {
  return async (sys, _user) => {
    if (sys.includes('Principal Software Architect')) {
      return JSON.stringify({ project_id: "dag_test", modules });
    }
    return `<file path="dummy.js">console.log('dummy');</file>`;
  };
}

async function runDAGTest(name, modules, expectError) {
  console.log(`\n=== RUNNING DAG TEST: ${name} ===`);
  
  const sendEvent = (_event, _data) => {
    // suppress
  };

  try {
    await executeGeneration({
      prd: `test_${name}`,
      existingFiles: [],
      generationMode: 'new',
      workspacePath: process.cwd(),
      mockLLM: createMockLLM(modules)
    }, sendEvent);
    
    if (expectError) {
      console.log(`❌ FAILED: Expected an error but validation passed.`);
    } else {
      console.log(`✅ PASSED: DAG validated successfully.`);
    }
  } catch (err) {
    if (expectError) {
      console.log(`✅ PASSED: Correctly caught expected error -> ${err.message}`);
    } else {
      console.log(`❌ FAILED: Unexpected error -> ${err.message}`);
    }
  }
}

async function runAllDAGTests() {
  // Valid: A -> B -> C
  await runDAGTest("Linear A -> B -> C", [
    { id: "A", dependencies: [], required_files: [] },
    { id: "B", dependencies: ["A"], required_files: [] },
    { id: "C", dependencies: ["B"], required_files: [] }
  ], false);

  // Valid: Independent A, B, C
  await runDAGTest("Independent A, B, C", [
    { id: "A", dependencies: [], required_files: [] },
    { id: "B", dependencies: [], required_files: [] },
    { id: "C", dependencies: [], required_files: [] }
  ], false);

  // Valid: A,B -> C
  await runDAGTest("Converging A, B -> C", [
    { id: "A", dependencies: [], required_files: [] },
    { id: "B", dependencies: [], required_files: [] },
    { id: "C", dependencies: ["A", "B"], required_files: [] }
  ], false);

  // Valid: A -> B,C -> D
  await runDAGTest("Diamond A -> B,C -> D", [
    { id: "A", dependencies: [], required_files: [] },
    { id: "B", dependencies: ["A"], required_files: [] },
    { id: "C", dependencies: ["A"], required_files: [] },
    { id: "D", dependencies: ["B", "C"], required_files: [] }
  ], false);

  // Invalid: Circular A -> B -> C -> A
  await runDAGTest("Circular A -> B -> C -> A", [
    { id: "A", dependencies: ["C"], required_files: [] },
    { id: "B", dependencies: ["A"], required_files: [] },
    { id: "C", dependencies: ["B"], required_files: [] }
  ], true);

  // Invalid: Missing Dependency
  await runDAGTest("Missing Dependency A -> Z", [
    { id: "A", dependencies: ["Z"], required_files: [] }
  ], true);

  // Invalid: Duplicate Module ID
  await runDAGTest("Duplicate Module ID (A, A)", [
    { id: "A", dependencies: [], required_files: [] },
    { id: "A", dependencies: [], required_files: [] }
  ], true);

  // Invalid: Duplicate File Ownership
  await runDAGTest("Duplicate File Ownership", [
    { id: "A", dependencies: [], required_files: [{ path: "app.js" }] },
    { id: "B", dependencies: ["A"], required_files: [{ path: "app.js" }] }
  ], true);
}

runAllDAGTests();
