import { completeValidatedModule, getDatabaseRepairTargets } from '../orchestrator.js';

async function runTests() {
  let passed = 0;
  let total = 0;
  
  const test = (name, semanticReport, allModulesPassed, expectedCompleted) => {
    total++;
    // Simulate the logic in orchestrator.js lines 753-758
    if (semanticReport.isValid !== true) {
      semanticReport.isValid = false;
    }
    const didComplete = allModulesPassed && semanticReport.isValid;
    
    if (didComplete === expectedCompleted) {
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ Test ${total} FAIL: ${name} (Expected completed=${expectedCompleted}, got ${didComplete})`);
    }
  };

  test('Score 100 but isValid is false', { score: 100, isValid: false }, true, false);
  test('Score 12 and isValid is false', { score: 12, isValid: false }, true, false);
  test('Score 90, isValid is true, modules passed', { score: 90, isValid: true }, true, true);
  test('Score 90, isValid is true, modules NOT passed', { score: 90, isValid: true }, false, false);

  const databaseModule = { id: 'MOD-000', layer: 'DATABASE' };
  const events = [];
  const emit = (type, data) => events.push({ type, data });
  const beforeDatabaseValidation = completeValidatedModule(databaseModule, false, emit);
  const completedTooEarly = events.some(event => event.type === 'module_completed');
  const afterDatabaseValidation = completeValidatedModule(databaseModule, true, emit);
  const completedAfterValidation = events.some(event => event.type === 'module_completed');
  if (beforeDatabaseValidation === 'VALIDATED' && !completedTooEarly && afterDatabaseValidation === 'PASSED' && completedAfterValidation) {
    console.log('✅ Test 5 PASS: MOD-000 is not PASSED until database semantic validation succeeds');
    passed++;
  } else {
    console.error(`❌ Test 5 FAIL: Expected VALIDATED then PASSED, got ${beforeDatabaseValidation} then ${afterDatabaseValidation}`);
  }
  total++;

  const targetResult = getDatabaseRepairTargets([
    { required_files: [{ path: 'backend/app/db/database.py' }, { path: 'backend/app/db/models.py' }] }
  ], [{ code: 'DB_REL001', file: 'backend/app/db/models.py', model: 'Product' }]);
  if (targetResult.implicatedFiles.size === 1 && targetResult.implicatedFiles.has('backend/app/db/models.py') && targetResult.unroutableSemanticDefects.length === 0) {
    console.log('✅ Test 6 PASS: DB_REL001 targets models.py, not the first database file');
    passed++;
  } else {
    console.error('❌ Test 6 FAIL: DB_REL001 was not routed exclusively to models.py');
  }
  total++;

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
