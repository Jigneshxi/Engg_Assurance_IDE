import { mergeFileContinuation } from '../../server/orchestrator.js';

// Test 1: mid-identifier cut on RHS of assignment
const acc1 = `<file path="backend/app/db/seed.py">
def seed():
    pwd_context = passlib.context.CryptContext(sche`;

const chunk1 = `mes=["bcrypt"], deprecated="auto")
    return pwd_context
</file>`;

const res1 = mergeFileContinuation(acc1, chunk1, 'backend/app/db/seed.py');
console.log('Test 1 Merged:\n', res1.merged);
const ok1 = res1.merged.includes('CryptContext(schemes=["bcrypt"]');
console.log('Test 1 Passed:', ok1);

// Test 2: Indentation restoration
const acc2 = `<file path="backend/app/db/migrations/script.py">
def downgrade():
    op.drop_table('reviews')`;

const chunk2 = `op.drop_table('order_items')
    op.drop_table('orders')
</file>`;

const res2 = mergeFileContinuation(acc2, chunk2, 'backend/app/db/migrations/script.py');
console.log('Test 2 Merged:\n', res2.merged);
const ok2 = res2.merged.includes("    op.drop_table('order_items')");
console.log('Test 2 Passed:', ok2);
