import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { executeGeneration } from '../orchestrator.js';

const projectName = 'taskflow_final_core_test';
const prd = `Build a minimal task management API.

Technology:
Python
FastAPI
SQLAlchemy
SQLite

Entities:
Task
Category

Features:
- create task
- list tasks
- update task
- delete task
- assign a task to a category

Keep the project intentionally small.`;

console.log('====================================================');
console.log('🚀 RUNNING FINAL REAL GEMMA 3 27B TEST: taskflow_final_core_test');
console.log('====================================================\n');

const workspacePath = path.resolve(__dirname, '../../workspaces', projectName);
if (fs.existsSync(workspacePath)) {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
fs.mkdirSync(workspacePath, { recursive: true });

let requirementContract = null;
let architectureContract = null;
let manifest = null;
const databaseFilesGenerated = [];
let databaseValidated = false;
let stackMismatch = false;
const modulesStarted = [];
const modulesCompleted = [];

const sendEvent = (eventType, data) => {
  const ts = new Date().toISOString().substring(11, 19);

  if (eventType === 'log') {
    const msg = typeof data === 'string' ? data : data?.message || '';
    if (
      msg.includes('Architecture Contract') ||
      msg.includes('Requirement Contract') ||
      msg.includes('Manifest') ||
      msg.includes('database_validation') ||
      msg.includes('module_started') ||
      msg.includes('module_completed') ||
      msg.includes('STACK_CONTRACT_MISMATCH')
    ) {
      console.log(`[${ts}] 📋 ${msg}`);
    }
  } else if (eventType === 'requirement_contract_created') {
    requirementContract = data;
    console.log(`[${ts}] ✅ Requirement Contract created: ${data?.count} requirements`);
  } else if (eventType === 'architecture_contract_created') {
    architectureContract = data;
    console.log(`[${ts}] ✅ Architecture Contract created: domain=${data?.domain}, db=${data?.db}`);
  } else if (eventType === 'manifest_created') {
    manifest = data;
    console.log(`[${ts}] ✅ Manifest created: ${data?.modules} modules`);
  } else if (eventType === 'file_generating' || eventType === 'file_queued' || eventType === 'validation_passed' || eventType === 'file_generated') {
    if (data?.path && (data.path.includes('/db/') || data.path.includes('models') || data.path.includes('database'))) {
      if (!databaseFilesGenerated.includes(data.path)) {
        databaseFilesGenerated.push(data.path);
        console.log(`[${ts}] 📦 Database file tracked: ${data.path}`);
      }
    }
  } else if (eventType === 'module_started') {
    modulesStarted.push(data?.moduleId);
    console.log(`[${ts}] 🚀 Module started: ${data?.moduleId} (${data?.moduleName || ''})`);
  } else if (eventType === 'module_completed') {
    modulesCompleted.push(data?.moduleId);
    console.log(`[${ts}] 🎉 Module completed: ${data?.moduleId}`);
    if (data?.moduleId === 'MOD-000') {
      databaseValidated = true;
    }
  } else if (eventType === 'stack_contract_mismatch') {
    stackMismatch = true;
    console.log(`[${ts}] ❌ STACK_CONTRACT_MISMATCH:`, data);
  }
};

try {
  await executeGeneration({
    prd,
    projectName,
    workspacePath,
    autoApprove: true,
    generationId: 'final-core-' + Date.now()
  }, sendEvent);

  // Inspect files on disk
  const dbDir = path.join(workspacePath, 'backend/app/db');
  let diskDbFiles = [];
  if (fs.existsSync(dbDir)) {
    diskDbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.py') || f.endsWith('.ts') || f.endsWith('.prisma') || f.endsWith('.js'));
  }

  console.log('\n====================================================');
  console.log('REAL GEMMA FINAL CORE TEST VERIFICATION:');
  console.log('- Requirement Contract Created:', Boolean(requirementContract));
  console.log('- Architecture Contract Created:', Boolean(architectureContract));
  console.log('- Manifest Created:', Boolean(manifest));
  console.log('- Database Files Tracked:', databaseFilesGenerated);
  console.log('- Database Files on Disk:', diskDbFiles);
  console.log('- Stack Mismatch Detected:', stackMismatch);
  console.log('- Database Module (MOD-000) Validated:', databaseValidated);
  console.log('- Modules Started:', modulesStarted);
  console.log('- Modules Completed:', modulesCompleted);
  console.log('====================================================\n');

  // Verify database content
  let modelsContent = '';
  const modelsPath = path.join(dbDir, 'models.py');
  if (fs.existsSync(modelsPath)) {
    modelsContent = fs.readFileSync(modelsPath, 'utf8');
  }

  let dbContent = '';
  const dbPath = path.join(dbDir, 'database.py');
  if (fs.existsSync(dbPath)) {
    dbContent = fs.readFileSync(dbPath, 'utf8');
  }

  const hasCanonicalBase = dbContent.includes('declarative_base') || modelsContent.includes('declarative_base') || dbContent.includes('Base =');
  const hasTaskEntity = modelsContent.includes('class Task(') || modelsContent.includes('class Task:');
  const hasCategoryEntity = modelsContent.includes('class Category(') || modelsContent.includes('class Category:');
  const hasSqlAlchemy = modelsContent.includes('sqlalchemy') || dbContent.includes('sqlalchemy');
  const hasPrisma = modelsContent.includes('@prisma/client') || modelsContent.includes('PrismaClient') || diskDbFiles.some(f => f.endsWith('.ts') || f.endsWith('.prisma'));

  console.log('DATABASE LAYER VERIFICATION:');
  console.log('- Files exclusively Python (.py):', diskDbFiles.length > 0 && diskDbFiles.every(f => f.endsWith('.py')));
  console.log('- Uses SQLAlchemy:', hasSqlAlchemy);
  console.log('- Canonical Base present:', hasCanonicalBase);
  console.log('- Task entity present:', hasTaskEntity);
  console.log('- Category entity present:', hasCategoryEntity);
  console.log('- Inappropriate Prisma/TypeScript code generated:', hasPrisma);

  if (diskDbFiles.length > 0 && diskDbFiles.every(f => f.endsWith('.py')) && !hasPrisma) {
    console.log('✅ PASS: Database files exclusively Python (.py) - Stack consistency confirmed.');
  } else {
    console.error('❌ FAIL: Database files violate stack consistency!');
    process.exit(1);
  }

  if (databaseValidated && hasTaskEntity && hasCategoryEntity) {
    console.log('✅ PASS: Database Module (MOD-000) semantic validation passed.');
  } else {
    console.error('❌ FAIL: Database validation failed or entities missing!');
    process.exit(1);
  }

  const downstreamStarted = modulesStarted.some(id => id !== 'MOD-000');
  if (downstreamStarted) {
    console.log('✅ PASS: Downstream dependent module(s) proceeded after database pass.');
  } else {
    console.error('❌ FAIL: Downstream modules did not proceed!');
    process.exit(1);
  }

  console.log('\n🎉 ALL REAL GEMMA FINAL CORE TEST CHECKS PASSED!');

} catch (err) {
  console.error('\n❌ Final core Gemma test error:', err.message);
  process.exit(1);
}
