// test_phase_gate.mjs

async function runTests() {
  let passed = 0;
  let total = 0;
  
  const test = (name, modules, expectedGlobalStatus) => {
    total++;
    
    // Simulate orchestrator logic 434-442
    let globalStatus = 'RUNNING';
    const pendingModules = modules.filter(m => m.status === 'PENDING' || m.status === 'REPAIRING');
    const failedModules = modules.filter(m => m.status === 'FAILED');
    
    if (failedModules.length > 0) {
      globalStatus = 'BLOCKED';
    } else if (pendingModules.length === 0) {
      globalStatus = 'DONE_PHASE';
    }
    
    if (globalStatus === expectedGlobalStatus) {
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ Test ${total} FAIL: ${name} (Expected ${expectedGlobalStatus}, got ${globalStatus})`);
    }
  };

  test('All modules PASSED -> DONE_PHASE', [{status: 'PASSED'}, {status: 'PASSED'}], 'DONE_PHASE');
  test('One module PENDING -> RUNNING', [{status: 'PASSED'}, {status: 'PENDING'}], 'RUNNING');
  test('One module REPAIRING -> RUNNING', [{status: 'PASSED'}, {status: 'REPAIRING'}], 'RUNNING');
  test('One module FAILED -> BLOCKED', [{status: 'PASSED'}, {status: 'FAILED'}], 'BLOCKED');
  test('One module FAILED, One PENDING -> BLOCKED', [{status: 'PENDING'}, {status: 'FAILED'}], 'BLOCKED');

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
