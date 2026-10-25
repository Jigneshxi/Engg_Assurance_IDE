import {
  checkSqlalchemyAvailability,
  detectSqlAlchemyAvailability,
  resolvePythonCandidates,
  resetSqlalchemyCache
} from '../dbValidator.js';

console.log('====================================================');
console.log('🔍 LIVE WINDOWS PYTHON & SQLALCHEMY AVAILABILITY VERIFICATION');
console.log('====================================================\n');

console.log('1. Platform & Environment:');
console.log(`   - OS Platform: ${process.platform}`);
console.log(`   - Current Working Directory: ${process.cwd()}`);
console.log(`   - process.env.PYTHON_BIN: ${process.env.PYTHON_BIN || '<not set>'}\n`);

console.log('2. Resolved Candidates:');
const candidates = resolvePythonCandidates();
candidates.forEach((cand, idx) => {
  console.log(`   [${idx + 1}] ${cand}`);
});

console.log('\n3. Running checkSqlalchemyAvailability():');
resetSqlalchemyCache();
const result = await checkSqlalchemyAvailability();

console.log('----------------------------------------------------');
console.log(`   available: ${result.available}`);
if (result.available) {
  console.log(`   pythonBin: ${result.pythonBin}`);
  console.log('   SQLAlchemy import: SUCCESSFUL');
} else {
  console.log(`   reason: ${result.reason}`);
  console.log('   deterministic fallback: ACTIVE');
}
console.log('----------------------------------------------------');

console.log('\n4. Verifying detectSqlAlchemyAvailability alias:');
const aliasResult = await detectSqlAlchemyAvailability();
console.log(`   alias matches: ${aliasResult.available === result.available && aliasResult.reason === result.reason}`);

console.log('\n====================================================');
console.log('VERIFICATION COMPLETE');
console.log('====================================================');
