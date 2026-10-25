import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prd = `# WellTrack - Personal Health and Wellness Tracker

## Overview
WellTrack is a personal health and wellness tracking application designed to help users record, monitor, and understand their everyday wellness information. It provides a simple dashboard to review historical records, identify trends, set personal goals, and maintain consistent wellness habits.

## Features
- User Account Management: Registration, login, profile viewing/editing, password changes, and tracking preferences.
- Daily Health Dashboard: A centralized view of daily steps, exercise duration, water intake, sleep duration, calories/nutrition, weight, mood, and goal progress.
- Activity Tracking: Record various physical activities with details like type, duration, distance, calories burned, date, start time, and notes.
- Step Tracking: Daily step count recording with goal setting and trend analysis.
- Sleep Tracking: Record sleep sessions with bedtime, wake-up time, duration, quality rating, and notes.
- Hydration Tracking: Daily water intake recording with goal setting and progress visualization.
- Nutrition Tracking: Record meals, food names, calories, macronutrients (protein, carbs, fat), date, time, and notes.
- Weight Tracking: Record body weight with date, unit, and notes, and view historical trends.
- Mood Tracking: Daily mood recording with rating, category, and notes.
- Wellness Goals: Create and manage personal goals for steps, exercise, water intake, sleep, and tracking frequency.
- Wellness History: Review historical data for all tracked categories.
- Trends and Reports: Visualize trends over time for various metrics.
- Reminders: Configure optional reminders for tracking activities.

## Architecture
- Frontend: React
- Backend: FastAPI (Python)
- Database: SQLite, SQLAlchemy ORM`;

const projectName = 'welltrackhealthwellnesstracker';
const endpoint = 'http://localhost:3001/api/openclaw/execute';

console.log('====================================================');
console.log('🚀 LIVE WELLTRACK GENERATION VIA HTTP SSE');
console.log('Endpoint:', endpoint);
console.log('Project:', projectName);
console.log('Model: Ollama (gemma3:27b)');
console.log('====================================================\n');

const continuationEvents = [];
const repairEvents = [];
const generatedFiles = new Map();
const validatedFiles = new Set();
const failedFiles = new Set();
let finalReport = null;

async function run() {
  const startTime = Date.now();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prd,
      projectName,
      autoApprove: true,
      generationMode: 'new'
    })
  });

  if (!resp.ok) {
    throw new Error(`Server returned HTTP ${resp.status} ${resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const lines = chunk.split('\n');
      let eventType = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.replace('event:', '').trim();
        } else if (line.startsWith('data:')) {
          dataStr += line.replace('data:', '').trim();
        }
      }

      let data;
      try {
        data = JSON.parse(dataStr);
      } catch (e) {
        data = dataStr;
      }

      handleEvent(eventType, data);
    }
  }

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(2);
  console.log(`\n====================================================`);
  console.log(`⏱️ Live Generation Finished in ${elapsedMin} minutes`);
  console.log(`====================================================`);

  await verifyTargetFiles();
}

function handleEvent(type, data) {
  const ts = new Date().toISOString().substring(11, 19);

  if (type === 'log') {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    if (msg.includes('continuation') || msg.includes('auto_recovery') || msg.includes('repair') || msg.includes('FILE_BOUNDARY') || msg.includes('OUTPUT_FORMAT') || msg.includes('phase_started') || msg.includes('phase_completed') || msg.includes('generation_completed')) {
      console.log(`[${ts}] 📋 ${msg}`);
    }
    if (msg.includes('continuation') || msg.includes('auto_recovery')) {
      continuationEvents.push({ ts, msg });
    }
  } else if (type === 'file_generating') {
    generatedFiles.set(data.path, { status: 'generating' });
    console.log(`[${ts}] 🔨 Generating: ${data.path}`);
  } else if (type === 'file_validated') {
    validatedFiles.add(data.path);
    console.log(`[${ts}] ✅ Validated: ${data.path}`);
  } else if (type === 'file_failed') {
    failedFiles.add(data.path);
    console.log(`[${ts}] ❌ Failed: ${data.path} - ${data.error || ''}`);
  } else if (type === 'repair_defect_classified') {
    repairEvents.push({ type, data });
    console.log(`[${ts}] 🏷️ Repair Defect: ${data.code} in ${data.path} (${data.message})`);
  } else if (type === 'repair_strategy_selected') {
    repairEvents.push({ type, data });
    console.log(`[${ts}] 🎯 Repair Strategy: ${data.strategy} for ${data.path}`);
  } else if (type === 'repair_completed') {
    repairEvents.push({ type, data });
    console.log(`[${ts}] ✅ Repair Completed: status=${data.status} for ${data.path}`);
  } else if (type === 'generation_completed') {
    finalReport = data.report || data;
    console.log(`[${ts}] 🏁 Generation Completed: isValid=${finalReport?.isValid}, score=${finalReport?.score}`);
  }
}

async function verifyTargetFiles() {
  console.log('\n====================================================');
  console.log('🔍 VERIFYING TARGET LARGE FILES & CONTINUATION STATUS');
  console.log('====================================================\n');

  const targetFiles = [
    'backend/app/api/hydration.py',
    'backend/app/api/nutrition.py',
    'backend/app/schemas/activity.py',
    'backend/tests/test_api.py',
    'frontend/src/tests/App.test.tsx'
  ];

  const wsPath = path.resolve(__dirname, '../workspaces/welltrackhealthwellnesstracker');
  
  for (let relPath of targetFiles) {
    let fullPath = path.join(wsPath, relPath);
    if (!fs.existsSync(fullPath) && relPath === 'frontend/src/tests/App.test.tsx') {
      const altPath = path.join(wsPath, 'frontend/src/test/App.test.tsx');
      if (fs.existsSync(altPath)) {
        relPath = 'frontend/src/test/App.test.tsx';
        fullPath = altPath;
      }
    }
    console.log(`Checking ${relPath}:`);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ❌ FILE DOES NOT EXIST ON DISK!`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    console.log(`  - Exists on disk: YES (${lines.length} lines, ${content.length} bytes)`);

    // Check for syntax issues or obvious corruption:
    // 1. Unclosed tag markers inside file
    const hasUnclosedTag = content.includes('</file>') || content.includes('<file');
    console.log(`  - Stray <file> tags in content: ${hasUnclosedTag ? '⚠️ YES' : 'NO'}`);

    // 2. Duplicate line chunks (e.g. 5+ consecutive lines identical)
    let duplicateChunkFound = false;
    for (let i = 0; i < lines.length - 10; i++) {
      const chunk = lines.slice(i, i + 5).join('\n').trim();
      if (chunk.length > 50) {
        const rest = lines.slice(i + 5).join('\n');
        if (rest.includes(chunk)) {
          duplicateChunkFound = true;
          console.log(`  - ⚠️ Possible duplicate chunk detected around line ${i + 1}`);
          break;
        }
      }
    }
    if (!duplicateChunkFound) {
      console.log(`  - Repeated line chunk duplication: NONE detected`);
    }

    // 3. Check Python syntax if python is available
    if (relPath.endsWith('.py')) {
      // Basic sanity check: starts with comments/imports, defs/classes exist
      const hasDefs = content.includes('def ') || content.includes('class ') || content.includes('router =') || content.includes('BaseModel');
      console.log(`  - Valid Python structures (def/class/router): ${hasDefs ? 'YES' : 'NO'}`);
    }
  }

  console.log('\n====================================================');
  console.log('SUMMARY OF CONTINUATION & REPAIR EVENTS:');
  console.log('====================================================');
  console.log(`Continuation / auto-recovery events logged: ${continuationEvents.length}`);
  continuationEvents.forEach(e => console.log(`  [${e.ts}] ${e.msg}`));

  console.log(`\nRepair events logged: ${repairEvents.length}`);
  repairEvents.forEach(e => console.log(`  [${e.type}] ${JSON.stringify(e.data)}`));

  console.log(`\nValidated files: ${validatedFiles.size}`);
  console.log(`Failed files: ${failedFiles.size}`);
  if (finalReport) {
    console.log(`\nFinal Report:`);
    console.log(`  Score: ${finalReport.score}`);
    console.log(`  isValid: ${finalReport.isValid}`);
    console.log(`  generatedFiles: ${finalReport.generatedFiles}`);
    console.log(`  validatedFiles: ${finalReport.validatedFiles}`);
    console.log(`  failedFiles: ${finalReport.failedFiles}`);
    console.log(`  warnings:`, finalReport.warnings);
    console.log(`  errors:`, finalReport.errors);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
