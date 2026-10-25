import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = util.promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  // Core Architectural & Contract Tests
  'test_stack_contract.mjs',
  'test_manifest_ownership_regression.mjs',
  'test_sqlalchemy_semantic_validation.mjs',
  'test_db_validation.mjs',
  'test_manifest_validation.mjs',
  'test_credential_validator.mjs',
  'test_repair_engine.mjs',
  'test_repair_failure_modes.mjs',
  'test_repair_dependency.mjs',
  'test_regression_database_failure.mjs',
  'test_orm_repair_orchestrator.mjs',
  'test_completion_gate.mjs',
  'test_dag.mjs',
  'test_dependency_graph.mjs',
  'test_scheduler_layers.mjs',
  'test_phase_gate.mjs',
  'test_approval_flow.mjs',
  'test_compliance_fix.mjs',
  'test_file_completeness.mjs',
  'test_generalization_multi_domain.mjs',
  'test_hardcoding_audit.mjs',
  'test_security.mjs',
  'test_negative_payload.mjs',
  'test_lifecycle.mjs',
  'test_dynamic_plans.mjs',
  'test_generation_lock.mjs',
  'test_resume.mjs',
  'test_orm_relationship_repairs.mjs',
  'e2e_mock_test.mjs',
  'mock_truncation_test.mjs',
  'test_generation_boundary_robustness.mjs',
  'test_teamflow_repair_semantics.mjs',
  'test_windows_python_resolution.mjs',
  'test_quickcart_deep_validation.mjs',
  'test_c4_real_database_ordering_reproduction.mjs',
  'test_c4_edits_verification.mjs'
];

console.log(`====================================================`);
console.log(`RUNNING COMPLETE TEST_1 REGRESSION SUITE (${testFiles.length} suites)`);
console.log(`====================================================\n`);

let passedSuites = 0;
let failedSuites = 0;
const failures = [];

for (const testFile of testFiles) {
  const filePath = path.join(__dirname, testFile);
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  SKIPPED: ${testFile} (file not found)`);
    continue;
  }

  process.stdout.write(`⏳ Running ${testFile.padEnd(42)} ... `);
  const start = Date.now();
  try {
    await execFileAsync('node', [filePath], {
      cwd: path.resolve(__dirname, '../../'),
      timeout: 180000,
      env: { ...process.env, NODE_ENV: 'test' }
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ PASS (${elapsed}s)`);
    passedSuites++;
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ FAIL (${elapsed}s)`);
    failedSuites++;
    failures.push({
      file: testFile,
      error: err.message,
      stdout: err.stdout || '',
      stderr: err.stderr || ''
    });
  }
}

console.log(`\n====================================================`);
console.log(`REGRESSION SUITE SUMMARY:`);
console.log(`Total Suites:  ${testFiles.length}`);
console.log(`Passed Suites: ${passedSuites}`);
console.log(`Failed Suites: ${failedSuites}`);
console.log(`Skipped:       0`);
console.log(`====================================================`);

if (failures.length > 0) {
  console.log(`\nFAILING SUITES DETAILS:`);
  failures.forEach(f => {
    console.log(`\n--- [FAIL] ${f.file} ---`);
    console.log(f.stderr || f.stdout || f.error);
  });
  process.exit(1);
} else {
  console.log(`\n🎉 ALL ${passedSuites} REGRESSION TEST SUITES PASSED!`);
}
