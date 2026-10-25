import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRD = `# Product Requirements Document: Personal Expense Management Application

## 1. Overview
A modern web application allowing individuals to track personal finances, manage incomes and expenses, categorize transactions, and view monthly balance summaries.

## 2. Target Architecture
- Backend: Python FastAPI with SQLAlchemy ORM, SQLite database, Pydantic schemas, and JWT authentication.
- Frontend: Single-page application connecting to FastAPI REST endpoints.

## 3. Core Functional Requirements
1. User Authentication:
   - User registration (POST /api/auth/register) with username and password.
   - User login (POST /api/auth/login) returning JWT access token.
   - Current user profile (GET /api/auth/me).

2. Category Management:
   - Categories for transactions (e.g. Salary, Groceries, Rent, Utilities, Entertainment).
   - Endpoints: GET /api/categories, POST /api/categories.

3. Transaction Management (Income & Expense):
   - Create transaction (POST /api/transactions): amount, type ('income' or 'expense'), category_id, date, description.
   - List transaction history (GET /api/transactions): filter by month/type.
   - Update transaction (PUT /api/transactions/{id}).
   - Delete transaction (DELETE /api/transactions/{id}).

4. Financial Summaries & Analytics:
   - Monthly summary (GET /api/analytics/monthly-summary): total income, total expenses, net balance.

## 4. Technical Specifications
- Database models: User, Category, Transaction.
- Clean separation of database setup (backend/app/db/database.py), models (backend/app/db/models.py), API routers, and business logic.
`;

async function runLiveTest() {
  console.log('=== OPENCLAW LIVE PRD EXECUTION TEST ===');
  console.log('Target: Personal Expense Management Application');
  console.log('Project ID: expense_tracker');
  console.log('Timestamp:', new Date().toISOString());

  // 1. Verify LLM Health
  console.log('\n--- STEP 1: Verifying LLM Health ---');
  const healthRes = await fetch('http://localhost:3001/api/llm/health');
  const health = await healthRes.json();
  console.log('LLM Health Status:', health.status);
  console.log('Active Provider:', health.activeProvider);
  console.log('Ollama Available:', health.ollama?.available);
  console.log('Ollama Model:', health.ollama?.configuredModel);

  if (!health.ollama?.available) {
    console.error('FATAL: Ollama is not available at', health.ollama?.url);
    process.exit(1);
  }

  // 2. Initialize Project
  console.log('\n--- STEP 2: Initializing Project in isolated workspace ---');
  const initRes = await fetch('http://localhost:3001/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'expense_tracker',
      name: 'Personal Expense Management Application',
      prd: PRD
    })
  });
  const project = await initRes.json();
  console.log('Project initialized:', project);

  // 3. Start Live Execution
  console.log('\n--- STEP 3: Starting Real OpenClaw Pipeline ---');
  const executeRes = await fetch('http://localhost:3001/api/projects/expense_tracker/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prd: PRD,
      autoApprove: true,
      generationMode: 'new'
    })
  });

  if (!executeRes.ok) {
    const errText = await executeRes.text();
    console.error('Execution request failed:', executeRes.status, errText);
    process.exit(1);
  }

  const reader = executeRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalStatus = 'UNKNOWN';
  let completionGateData = null;
  const events = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const chunk of lines) {
      const eventMatch = chunk.match(/event:\s*([^\n]+)/);
      const dataMatch = chunk.match(/data:\s*([^\n]+)/);
      if (eventMatch && dataMatch) {
        const eventType = eventMatch[1].trim();
        let eventData = {};
        try { eventData = JSON.parse(dataMatch[1].trim()); } catch (_) {}
        events.push({ type: eventType, data: eventData });

        if (eventType === 'log') {
          console.log(`[LOG] ${eventData}`);
        } else if (eventType === 'file_generating') {
          console.log(`[GENERATING] ${eventData.path} (${eventData.moduleId})`);
        } else if (eventType === 'file_generated') {
          console.log(`[GENERATED] ${eventData.path}`);
        } else if (eventType === 'validation_passed') {
          console.log(`[VALIDATED] ${eventData.path} ✓`);
        } else if (eventType === 'repair_started') {
          console.log(`[REPAIR] ${eventData.path} Attempt ${eventData.attempt}`);
        } else if (eventType === 'phase_started') {
          console.log(`\n=== PHASE STARTED: Phase ${eventData.phase} (${eventData.layer}) ===`);
        } else if (eventType === 'module_completed') {
          console.log(`[MODULE COMPLETED] ${eventData.moduleId} ✓`);
        } else if (eventType === 'completion_gate') {
          completionGateData = eventData;
          finalStatus = eventData.status;
          console.log('\n=== COMPLETION GATE ===');
          console.log(JSON.stringify(eventData, null, 2));
        } else if (eventType === 'done') {
          console.log('\n=== DONE EVENT RECEIVED ===');
          console.log(`Summary: ${eventData.report?.plannedModules} modules, ${eventData.report?.generatedFiles} files`);
        } else if (eventType === 'error') {
          console.error(`[ERROR EVENT] ${eventData.message || JSON.stringify(eventData)}`);
          finalStatus = 'ERROR';
        }
      }
    }
  }

  console.log('\n========================================');
  console.log(`FINAL RESULT: ${finalStatus}`);
  console.log('========================================');

  // Check workspace directory
  const wsDir = path.resolve(__dirname, '..', 'workspaces', 'expense_tracker');
  console.log('Target Workspace Directory:', wsDir);
  if (fs.existsSync(wsDir)) {
    try {
      const files = fs.readdirSync(wsDir, { recursive: true }).filter(f => !f.includes('.openclaw_sandbox_'));
      console.log(`Total files created on disk: ${files.length}`);
    } catch (e) {
      console.log('Workspace scanned (some sandbox folders cleaned up by OS)');
    }
  }

  return { finalStatus, completionGateData, eventsCount: events.length };
}

runLiveTest().catch(err => {
  console.error('Live test unhandled error:', err);
  process.exit(1);
});
