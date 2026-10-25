import assert from 'assert';
import { repairFile } from '../repairEngine.js';

console.log('================================================');
console.log('   TEST R1: QUOTA & TRANSIENT RESILIENCE TEST   ');
console.log('================================================\n');

async function testQuotaDoesNotBurnAttempts() {
  console.log('--- TEST 1: Simulated 429 Quota Error Does NOT Burn Repair Attempts ---');

  const fileDef = {
    path: 'backend/app/api/tasks.py',
    content: 'def get_tasks():\n    return []\n',
    repairAttempts: 0,
    status: 'repairing'
  };

  const activeModule = { id: 'MOD-001', layer: 'BACKEND' };
  const manifest = { modules: [{ id: 'MOD-001', required_files: [fileDef] }] };
  const defects = [{ code: 'SYNTAX_ERROR', message: 'Syntax error on line 1' }];

  let quotaCallCount = 0;
  // Mock caller simulating 429 quota exhausted
  const quotaCaller = async () => {
    quotaCallCount++;
    throw new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for metric: free_tier_requests, limit: 15. Please retry in 20s.');
  };

  const events = [];
  const sendEvent = (ev, data) => events.push({ ev, data });

  // Call repairFile 3 consecutive times with simulated quota failures
  for (let i = 1; i <= 3; i++) {
    const res = await repairFile({
      fileDef,
      activeModule,
      manifest,
      defects,
      caller: quotaCaller,
      sendEvent,
      generationId: `gen-quota-${i}`,
      validateFn: async () => ({ isValid: false, errors: ['syntax'] })
    });

    assert.strictEqual(res.success, false, 'Repair should return success=false during quota pause');
    assert.strictEqual(res.isTransient, true, 'Result must be flagged as isTransient');
    assert.strictEqual(fileDef.repairAttempts, 0, `Repair attempts must NOT be burned by quota error on call ${i}`);
    assert.notStrictEqual(fileDef.status, 'failed', `File status must NOT be set to failed by quota error on call ${i}`);
  }

  assert.strictEqual(quotaCallCount, 3, 'Mock caller should have been called 3 times');
  assert.strictEqual(fileDef.repairAttempts, 0, 'After 3 consecutive quota errors, repairAttempts must still be 0');
  assert.notStrictEqual(fileDef.status, 'failed', 'File must NOT be marked permanently failed after 3 quota errors');

  console.log('✅ PASS: 3 consecutive quota errors did not burn repair attempts or fail module.\n');

  console.log('--- TEST 2: Quota Recovery Leads to Successful Repair ---');
  // Next call succeeds with valid patch
  const successCaller = async () => `<patch file="backend/app/api/tasks.py">
<search>
def get_tasks():
    return []
</search>
<replace>
def get_tasks():
    return [{"id": 1, "title": "Done"}]
</replace>
</patch>`;

  const recoveryRes = await repairFile({
    fileDef,
    activeModule,
    manifest,
    defects,
    caller: successCaller,
    sendEvent,
    generationId: 'gen-quota-recovery',
    validateFn: async () => ({ isValid: true, errors: [] })
  });

  assert.strictEqual(recoveryRes.success, true, 'Repair should succeed once quota clears');
  assert.strictEqual(fileDef.status, 'validated', 'File status must be validated after recovery');
  assert.strictEqual(fileDef.repairAttempts, 1, 'File repair attempts should only count the actual valid repair attempt (1)');

  console.log('✅ PASS: Repair successfully recovered after quota cleared.\n');
  console.log('================================================');
  console.log('   ALL R1 QUOTA RESILIENCE TESTS PASSED!       ');
  console.log('================================================');
}

testQuotaDoesNotBurnAttempts().catch(err => {
  console.error('❌ Test R1 Failed:', err);
  process.exit(1);
});
