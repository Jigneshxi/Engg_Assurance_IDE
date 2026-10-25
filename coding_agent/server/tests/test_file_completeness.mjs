// test_file_completeness.mjs
async function runTests() {
  let passed = 0;
  let total = 0;
  
  const test = (name, requiredCount, generatedCount, validatedCount, missingCount, failedCount, repairingCount, semanticValid, allModulesPassed, expectedFinalPassed) => {
    total++;
    
    const fileCompletenessPassed = (
      requiredCount === generatedCount &&
      requiredCount === validatedCount &&
      missingCount === 0 &&
      failedCount === 0 &&
      repairingCount === 0
    );

    const finalPassed = allModulesPassed && semanticValid && fileCompletenessPassed;
    
    if (finalPassed === expectedFinalPassed) {
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ Test ${total} FAIL: ${name} (Expected finalPassed=${expectedFinalPassed}, got ${finalPassed})`);
    }
  };

  test('required=17 generated=5 -> FAIL', 17, 5, 5, 12, 0, 0, true, true, false);
  test('required=5 generated=5 validated=5 -> PASS', 5, 5, 5, 0, 0, 0, true, true, true);
  test('missing required file -> FAIL', 5, 4, 4, 1, 0, 0, true, true, false);
  test('one FAILED module -> FAIL', 5, 5, 5, 0, 1, 0, true, false, false);
  test('one REPAIRING module -> FAIL', 5, 5, 5, 0, 0, 1, true, false, false); // if module repairing, allModulesPassed is false
  test('score=100/isValid=true/missing file -> FAIL', 17, 16, 16, 1, 0, 0, true, true, false);
  test('valid complete project -> PASS', 20, 20, 20, 0, 0, 0, true, true, true);

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
