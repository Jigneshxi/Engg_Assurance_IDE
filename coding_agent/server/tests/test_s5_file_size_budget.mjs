import assert from 'assert';
import {
  validateFileSizeBudget,
  isBudgetExceededBeforeContinuation,
  FILE_SIZE_DEFECT_CODES
} from '../fileSizeBudgetValidator.js';
import { validateProjectContracts } from '../projectContractValidator.js';

console.log('====================================================');
console.log('  TEST S5: FILE SIZE BUDGET & ARCHITECTURAL SPLIT   ');
console.log('====================================================\n');

// Helper to generate text with a given line count
function generateLines(count, prefix = '// line') {
  const arr = [];
  for (let i = 1; i <= count; i++) {
    arr.push(`${prefix} ${i}`);
  }
  return arr.join('\n');
}

// ── TEST 1: Page Size Budget (Max 250 Lines) ──
console.log('--- TEST 1: Frontend Page Size Budget (limit: 250 lines) ---');
const validPageContent = `import React from 'react';\n${generateLines(230)}\nexport default function DashboardPage() { return <div>Dashboard</div>; }`;
const validPageResult = validateFileSizeBudget(validPageContent, 'frontend/src/pages/DashboardPage.tsx');
assert.strictEqual(validPageResult.isValid, true, 'Page under 250 lines must pass validation');

const oversizedPageContent = `import React from 'react';\n${generateLines(260)}\nexport default function DashboardPage() { return <div>Dashboard</div>; }`;
const oversizedPageResult = validateFileSizeBudget(oversizedPageContent, 'frontend/src/pages/DashboardPage.tsx');
assert.strictEqual(oversizedPageResult.isValid, false, 'Page over 250 lines must be rejected');
assert.strictEqual(oversizedPageResult.defects[0].code, FILE_SIZE_DEFECT_CODES.FILE_SIZE_BUDGET_EXCEEDED);
assert.strictEqual(oversizedPageResult.defects[0].limit, 250);
console.log('✅ PASS: Pages <= 250 lines pass; pages > 250 lines rejected with FILE_SIZE_BUDGET_EXCEEDED.\n');

// ── TEST 2: Router Size Budget (Max 200 Lines) ──
console.log('--- TEST 2: Router Size Budget (limit: 200 lines) ---');
const validRouterContent = `from fastapi import APIRouter\nrouter = APIRouter()\n${generateLines(180)}\n`;
const validRouterResult = validateFileSizeBudget(validRouterContent, 'backend/app/api/tasks.py');
assert.strictEqual(validRouterResult.isValid, true, 'Router under 200 lines must pass validation');

const oversizedRouterContent = `from fastapi import APIRouter\nrouter = APIRouter()\n${generateLines(210)}\n`;
const oversizedRouterResult = validateFileSizeBudget(oversizedRouterContent, 'backend/app/api/tasks.py');
assert.strictEqual(oversizedRouterResult.isValid, false, 'Router over 200 lines must be rejected');
assert.strictEqual(oversizedRouterResult.defects[0].code, FILE_SIZE_DEFECT_CODES.FILE_SIZE_BUDGET_EXCEEDED);
assert.strictEqual(oversizedRouterResult.defects[0].limit, 200);
console.log('✅ PASS: Routers <= 200 lines pass; routers > 200 lines rejected with FILE_SIZE_BUDGET_EXCEEDED.\n');

// ── TEST 3: App.tsx Router-Only Shell (~60 lines, Max 100 Lines) ──
console.log('--- TEST 3: App.tsx Router-Only Shell ---');
// 3a. Clean modular router shell under 100 lines
const validAppTsx = `import React from 'react';
import { Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <div className="app-container">
      <nav>TaskFlow</nav>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </div>
  );
}
`;
const validAppResult = validateFileSizeBudget(validAppTsx, 'frontend/src/App.tsx');
assert.strictEqual(validAppResult.isValid, true, 'Clean App.tsx router shell must pass');

// 3b. Oversized App.tsx (> 100 lines)
const oversizedAppTsx = `import React from 'react';\nimport { Routes, Route } from 'react-router-dom';\n${generateLines(105)}\nexport default function App() { return <Routes/>; }`;
const oversizedAppResult = validateFileSizeBudget(oversizedAppTsx, 'frontend/src/App.tsx');
assert.strictEqual(oversizedAppResult.isValid, false, 'App.tsx over 100 lines must be rejected');
assert.strictEqual(oversizedAppResult.defects[0].code, FILE_SIZE_DEFECT_CODES.FILE_SIZE_BUDGET_EXCEEDED);

// 3c. Monolithic App.tsx inlining domain state without routes
const monolithicAppTsx = `import React, { useState } from 'react';

export default function App() {
  const [todos, setTodos] = useState<any[]>([
    { id: 1, title: 'Item 1', completed: false }
  ]);
  const [newTodo, setNewTodo] = useState('');

  ${generateLines(60, '// inlined business state handler')}

  return (
    <div>
      <h1>TaskFlow Monolith</h1>
      <ul>
        {todos.map(t => <li key={t.id}>{t.title}</li>)}
      </ul>
    </div>
  );
}
`;
const monolithicAppResult = validateFileSizeBudget(monolithicAppTsx, 'frontend/src/App.tsx');
assert.strictEqual(monolithicAppResult.isValid, false, 'Monolithic App.tsx inlining state without routes must be rejected');
assert.strictEqual(monolithicAppResult.defects[0].code, FILE_SIZE_DEFECT_CODES.APP_TSX_NOT_ROUTER);
console.log('✅ PASS: App.tsx must be clean router-only shell; inlined domain state and >100 lines rejected.\n');

// ── TEST 4: Pre-continuation Budget Guard (Stall Prevention) ──
console.log('--- TEST 4: isBudgetExceededBeforeContinuation (stall prevention) ---');
const cutShortEarly = generateLines(120);
assert.strictEqual(
  isBudgetExceededBeforeContinuation(cutShortEarly, 'frontend/src/pages/DashboardPage.tsx'),
  false,
  'Early truncated page at 120 lines should proceed to continuation'
);

const cutShortNearLimit = generateLines(225);
assert.strictEqual(
  isBudgetExceededBeforeContinuation(cutShortNearLimit, 'frontend/src/pages/DashboardPage.tsx'),
  true,
  'Incomplete page at 225 lines (>85% of budget) must abort continuation and trigger clean modular regeneration'
);

const cutRouterNearLimit = generateLines(175);
assert.strictEqual(
  isBudgetExceededBeforeContinuation(cutRouterNearLimit, 'backend/app/api/tasks.py'),
  true,
  'Incomplete router at 175 lines (>85% of budget) must abort continuation'
);
console.log('✅ PASS: Pre-continuation check aborts continuation loops before wasting quota on bloated files.\n');

// ── TEST 5: Integration with validateProjectContracts ──
console.log('--- TEST 5: Integration with validateProjectContracts ---');
const testFiles = [
  { path: 'backend/app/api/tasks.py', content: oversizedRouterContent },
  { path: 'frontend/src/App.tsx', content: validAppTsx }
];

const contractRes = await validateProjectContracts(testFiles);
assert.strictEqual(contractRes.isValid, false, 'validateProjectContracts must report budget defect');
const budgetDefect = contractRes.defects.find(d => d.code === FILE_SIZE_DEFECT_CODES.FILE_SIZE_BUDGET_EXCEEDED);
assert.ok(budgetDefect, 'FILE_SIZE_BUDGET_EXCEEDED defect must be present in defects list');
assert.strictEqual(budgetDefect.file, 'backend/app/api/tasks.py');
console.log('✅ PASS: validateProjectContracts detects oversized files and blocks completion gate.\n');

console.log('====================================================');
console.log('  ALL S5 FILE SIZE BUDGET TESTS PASSED!             ');
console.log('====================================================');
