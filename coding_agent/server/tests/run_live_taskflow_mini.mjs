import fs from 'fs';
import path from 'path';

const prd = `PROJECT: TaskFlow Mini

Build a small full-stack task management application.

Backend:
- Python
- FastAPI
- SQLite
- SQLAlchemy

Frontend:
- React
- TypeScript

Features:
- Create task
- List tasks
- Update task status
- Delete task

Task fields:
- id
- title
- description
- status
- created_at

API:
GET /tasks
POST /tasks
PUT /tasks/{id}
DELETE /tasks/{id}

Include:
- SQLAlchemy model
- SQLite database
- basic API tests
- basic frontend
- README

Keep the generated project small. Ensure all code is complete, valid, syntactically correct, and production-ready.`;

async function runLiveGeneration() {
  console.log('====================================================');
  console.log('🚀 TRIGGERING LIVE TASKFLOW MINI E2E GENERATION VIA API');
  console.log('Endpoint: http://localhost:3001/api/openclaw/execute');
  console.log('Target Project: taskflow_mini');
  console.log('Model: Ollama (gemma3:27b)');
  console.log('====================================================\n');

  const startTime = Date.now();
  const generatedFiles = new Map();
  const repairs = [];
  const logs = [];
  const phases = [];
  let isDone = false;
  let _finalResult = null;
  let failureReason = null;

  try {
    const response = await fetch('http://localhost:3001/api/openclaw/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prd,
        projectName: 'taskflow_mini',
        generationMode: 'new',
        autoApprove: true
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        const eventMatch = block.match(/event:\s*([^\n]+)/);
        const dataMatch = block.match(/data:\s*([\s\S]+)/);

        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1].trim();
          let eventData = {};
          try {
            eventData = JSON.parse(dataMatch[1].trim());
          } catch (e) {
            eventData = { raw: dataMatch[1].trim() };
          }

          if (eventType === 'log') {
            const msg = typeof eventData === 'string' ? eventData : (eventData.message || JSON.stringify(eventData));
            console.log(`[LOG] ${msg}`);
            logs.push({ time: Date.now() - startTime, message: msg });
          } else if (eventType === 'file') {
            console.log(`📁 [FILE] Generated: ${eventData.path} (${eventData.content?.length || 0} bytes)`);
            generatedFiles.set(eventData.path, eventData.content);
          } else if (eventType === 'phase_started' || eventType === 'phase_completed') {
            console.log(`🔷 [PHASE] ${eventType}: Phase ${eventData.phase} (${eventData.layer || ''})`);
            phases.push({ type: eventType, data: eventData });
          } else if (eventType === 'repair_started' || eventType === 'repair_completed') {
            console.log(`🔧 [REPAIR] ${eventType}: ${JSON.stringify(eventData)}`);
            repairs.push({ type: eventType, data: eventData });
          } else if (eventType === 'done') {
            console.log('🎉 [DONE] Generation pipeline completed successfully!');
            isDone = true;
            _finalResult = eventData;
          } else if (eventType === 'error' || eventType === 'execution_failed') {
            console.error(`❌ [FAILURE] ${eventType}:`, eventData);
            failureReason = eventData;
          } else {
            console.log(`[EVENT: ${eventType}]`, typeof eventData === 'object' ? JSON.stringify(eventData) : eventData);
          }
        }
      }
    }
  } catch (err) {
    console.error('Fatal connection or execution error:', err.message);
    failureReason = err.message;
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log('\n====================================================');
  console.log(`🏁 EXECUTION SUMMARY (Duration: ${durationSec}s)`);
  console.log(`Success: ${isDone && !failureReason ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Files Generated: ${generatedFiles.size}`);
  generatedFiles.forEach((_, p) => console.log(`   - ${p}`));
  console.log(`Repairs Performed: ${repairs.length}`);
  if (failureReason) console.log(`Failure details:`, failureReason);
  console.log('====================================================\n');

  // Save telemetry
  const reportPath = path.join(process.cwd(), 'workspaces', 'taskflow_mini_run_result.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    success: isDone && !failureReason,
    durationSec,
    filesGenerated: Array.from(generatedFiles.keys()),
    repairsCount: repairs.length,
    repairs,
    failureReason,
    phases,
    logCount: logs.length
  }, null, 2));
  console.log(`Telemetry saved to: ${reportPath}`);
}

runLiveGeneration();
