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

const projectName = 'welltrack_fresh_acceptance';
const endpoint = 'http://localhost:3001/api/openclaw/execute';

console.log('====================================================');
console.log('🚀 RUNNING FRESH WELLTRACK GENERATION ACCEPTANCE TEST');
console.log('Endpoint:', endpoint);
console.log('Target Workspace:', projectName);
console.log('Provider: Ollama (gemma3:27b)');
console.log('====================================================\n');

const generatedFiles = new Map();
const validatedFiles = new Set();
const failedFiles = new Set();
let _manifestCreated = null;
let _finalReport = null;

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
  console.log(`⏱️ Fresh Generation Finished in ${elapsedMin} minutes`);
  console.log(`====================================================`);

  verifyFreshGeneration();
}

function handleEvent(type, data) {
  const ts = new Date().toISOString().substring(11, 19);

  if (type === 'log') {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    console.log(`[${ts}] 📋 ${msg}`);
  } else if (type === 'manifest_created') {
    _manifestCreated = data;
    console.log(`[${ts}] 📑 Manifest created: ${JSON.stringify(data)}`);
  } else if (type === 'file_generating') {
    generatedFiles.set(data.path, { status: 'generating' });
    console.log(`[${ts}] 🔨 Generating: ${data.path}`);
  } else if (type === 'file_validated') {
    validatedFiles.add(data.path);
    console.log(`[${ts}] ✅ Validated: ${data.path}`);
  } else if (type === 'file_failed') {
    failedFiles.add(data.path);
    console.log(`[${ts}] ❌ Failed: ${data.path} - ${data.error || ''}`);
  } else if (type === 'generation_completed') {
    _finalReport = data;
    console.log(`[${ts}] 🏁 Generation Completed:`, data);
  }
}

function verifyFreshGeneration() {
  const wsPath = path.resolve(__dirname, '../workspaces', projectName);
  const manifestPath = path.join(wsPath, '.openclaw/manifest.json');

  console.log('\n====================================================');
  console.log('🔍 VERIFYING FRESH WELLTRACK GENERATION RESULTS');
  console.log('====================================================');

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found at: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Total Modules in Manifest: ${manifest.modules.length}`);
  
  const allRequiredFiles = manifest.modules.flatMap(m => m.required_files || []);
  console.log(`Total Required Files: ${allRequiredFiles.length}`);

  console.log('\nChecking PRD-Mandated Capabilities in Manifest:');

  const hasReminders = allRequiredFiles.some(f => f.path.toLowerCase().includes('reminder'));
  const hasTrends = allRequiredFiles.some(f => f.path.toLowerCase().includes('trend') || f.path.toLowerCase().includes('report') || f.path.toLowerCase().includes('chart'));
  const hasSettings = allRequiredFiles.some(f => f.path.toLowerCase().includes('setting') || f.path.toLowerCase().includes('profile') || f.path.toLowerCase().includes('preference'));

  console.log(`  - Reminders module/file: ${hasReminders ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`  - Trends & Reports / Charts module/file: ${hasTrends ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`  - Settings / Preferences module/file: ${hasSettings ? '✅ PRESENT' : '❌ MISSING'}`);

  let existingFilesCount = 0;
  for (const f of allRequiredFiles) {
    const full = path.join(wsPath, f.path);
    const exists = fs.existsSync(full);
    if (exists) existingFilesCount++;
    console.log(`  ${exists ? '✅' : '❌'} ${f.path} (${f.purpose || 'no purpose'})`);
  }

  console.log(`\nFiles on Disk: ${existingFilesCount} / ${allRequiredFiles.length}`);

  const passed = hasReminders && hasTrends && hasSettings && (existingFilesCount > 0);
  console.log(`\nFRESH WELLTRACK PRD ACCEPTANCE: ${passed ? '✅ PASS' : '❌ FAIL'}`);
}

run().catch(err => {
  console.error('Fatal error during fresh generation:', err);
  process.exit(1);
});
