import {
  mergeFileContinuation,
  validateSourceCompleteness,
  DATABASE_DEFECT_CODES
} from '../orchestrator.js';

async function runPhase3Tests() {
  console.log('======================================================================');
  console.log('RUNNING PHASE 3 — GENERATION BOUNDARY HARDENING SUITE');
  console.log('======================================================================');

  let passed = 0;
  let total = 0;

  function assertTest(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`✅ TEST ${total} PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ TEST ${total} FAIL: ${name}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Leaked Markdown Fences are Rejected
  // -------------------------------------------------------------
  const fencedPython = "```python\nfrom fastapi import APIRouter\nrouter = APIRouter()\n```";
  const fenceCheck = validateSourceCompleteness(fencedPython, 'backend/app/api/auth.py');
  assertTest(
    fenceCheck.isComplete === false &&
    fenceCheck.defect === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED &&
    fenceCheck.reason.includes('markdown code block backticks leaked'),
    'Raw markdown fences inside source are strictly rejected'
  );

  // -------------------------------------------------------------
  // TEST 2: Mid-Source Python Truncation Detection
  // -------------------------------------------------------------
  const pythonTruncatedUnclosedParen = `from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter()

@router.get('/items')
def get_items(db: Session = Depends(get_db`; // cut off mid-paren

  const pyParenCheck = validateSourceCompleteness(pythonTruncatedUnclosedParen, 'backend/app/api/items.py');

  const pythonTruncatedUnclosedBlock = `class TaskStatus:
    PENDING = 'pending'
    COMPLETED = 'completed'

def process_task(task_id: int):`; // cut off with colon at EOF

  const pyBlockCheck = validateSourceCompleteness(pythonTruncatedUnclosedBlock, 'backend/app/tasks.py');

  const pythonTruncatedDanglingOp = `total_cost = item_price + shipping_fee +`; // cut off mid-operator

  const pyOpCheck = validateSourceCompleteness(pythonTruncatedDanglingOp, 'backend/app/billing.py');

  assertTest(
    pyParenCheck.isComplete === false &&
    pyBlockCheck.isComplete === false &&
    pyOpCheck.isComplete === false &&
    pyParenCheck.defect === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED,
    'Python mid-source truncation (unclosed parens, dangling block headers, dangling operators) strictly detected'
  );

  // -------------------------------------------------------------
  // TEST 3: Mid-Source TypeScript / JSX Truncation Detection
  // -------------------------------------------------------------
  const tsTruncatedUnclosedBrace = `import React from 'react';

export const Dashboard: React.FC = () => {
  return (
    <div className="p-4">
      <h1>Dashboard</h1>
  ); // missing outer closing brace`;

  const tsBraceCheck = validateSourceCompleteness(tsTruncatedUnclosedBrace, 'frontend/src/Dashboard.tsx');

  const tsTruncatedDanglingOp = `const activeUsers = users.filter(u => u.isActive &&`; // cut off mid-operator
  const tsOpCheck = validateSourceCompleteness(tsTruncatedDanglingOp, 'frontend/src/utils.ts');

  assertTest(
    tsBraceCheck.isComplete === false &&
    tsOpCheck.isComplete === false &&
    tsBraceCheck.defect === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED,
    'TypeScript mid-source truncation (unbalanced braces, dangling operators) strictly detected'
  );

  // -------------------------------------------------------------
  // TEST 4: Missing Closing File Boundary Detection
  // -------------------------------------------------------------
  const unclosedAccumulated = '<file path="backend/main.py">\nfrom fastapi import FastAPI\napp = FastAPI()\n';
  // Attempting to merge an empty or stalled continuation
  const stalledContinuation = mergeFileContinuation(unclosedAccumulated, '', 'backend/main.py');
  assertTest(
    stalledContinuation.completed === false &&
    stalledContinuation.progress === false,
    'Missing closing file boundary without completion remains uncompleted'
  );

  // -------------------------------------------------------------
  // TEST 5: Malformed Continuation (Target Mismatch / Conversational Refusal)
  // -------------------------------------------------------------
  const mismatchedTargetChunk = '<file path="frontend/src/Wrong.tsx">\nconsole.log("wrong");\n</file>';
  const mismatchMerge = mergeFileContinuation(unclosedAccumulated, mismatchedTargetChunk, 'backend/main.py');

  const refusalChunk = 'I cannot continue this code because it exceeds context limit.';
  const refusalMerge = mergeFileContinuation(unclosedAccumulated, refusalChunk, 'backend/main.py');

  assertTest(
    mismatchMerge.progress === false &&
    mismatchMerge.defect === DATABASE_DEFECT_CODES.GENERATION_CONTINUATION_INVALID &&
    refusalMerge.progress === false &&
    refusalMerge.defect === DATABASE_DEFECT_CODES.GENERATION_CONTINUATION_INVALID,
    'Malformed continuations (file target mismatch or conversational refusal) detected with GENERATION_CONTINUATION_INVALID'
  );

  // -------------------------------------------------------------
  // TEST 6: Duplicated and Overlapping Continuation Merging
  // -------------------------------------------------------------
  const baseCode = '<file path="backend/app/db/models.py">\nfrom sqlalchemy import Column, Integer, String\nfrom app.db.database import Base\n\nclass Item(Base):\n    __tablename__ = "items"\n    id = Column(Integer, primary_key=True)';
  // LLM repeated the last two lines before continuing
  const overlappingChunk = '    __tablename__ = "items"\n    id = Column(Integer, primary_key=True)\n    name = Column(String, index=True)\n</file>';

  const overlapMerge = mergeFileContinuation(baseCode, overlappingChunk, 'backend/app/db/models.py');
  const countOccurrences = (str, sub) => (str.match(new RegExp(sub, 'g')) || []).length;

  assertTest(
    overlapMerge.completed === true &&
    overlapMerge.progress === true &&
    countOccurrences(overlapMerge.merged, 'id = Column') === 1 &&
    countOccurrences(overlapMerge.merged, '__tablename__ = "items"') === 1 &&
    overlapMerge.merged.includes('name = Column(String, index=True)'),
    'Overlapping continuation deduplicates repeated lines without duplicating code statements'
  );

  // -------------------------------------------------------------
  // TEST 7: Revalidation on Continuation (Premature </file> on Truncated Body)
  // -------------------------------------------------------------
  // The LLM emitted </file> tag, but the code inside is truncated mid-def!
  const prematureCloseChunk = '    def broken_func(param1, \n</file>';
  const prematureMerge = mergeFileContinuation(baseCode, prematureCloseChunk, 'backend/app/db/models.py');

  assertTest(
    prematureMerge.completed === false &&
    prematureMerge.defect === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED,
    'Revalidation prevents marking premature closing </file> tag valid when code is truncated mid-statement'
  );

  // -------------------------------------------------------------
  // TEST 8: Syntactically Complete Source Validated Successfully
  // -------------------------------------------------------------
  const completePython = `from pydantic import BaseModel

class UserDTO(BaseModel):
    id: int
    username: str
`;
  const validCheck = validateSourceCompleteness(completePython, 'backend/app/schemas/dto.py');
  assertTest(
    validCheck.isComplete === true,
    'Syntactically complete and balanced source passes validateSourceCompleteness'
  );

  console.log('======================================================================');
  console.log(`PHASE 3 TEST SUMMARY: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('======================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase3Tests().catch(err => {
  console.error('Unhandled Phase 3 Test Error:', err);
  process.exit(1);
});
