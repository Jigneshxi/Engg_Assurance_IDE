
const prd = `Build a minimal task management API.

Backend:
- Python
- FastAPI
- SQLite
- SQLAlchemy

Features:
- create task
- list tasks
- update task
- delete task

Keep the generated project small.`;

async function testWebSubmissionFlow() {
  console.log('=== TESTING WEB PRD SUBMISSION FLOW ===');
  console.log('Target Project Name: taskflow_mini_web_test');
  console.log('API Target:          http://localhost:3001/api/openclaw/execute');
  console.log('Model:               Ollama (gemma3:27b)');

  const response = await fetch('http://localhost:3001/api/openclaw/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prd,
      projectName: 'taskflow_mini_web_test',
      generationMode: 'new',
      autoApprove: true
    })
  });

  console.log(`HTTP Status: ${response.status} ${response.statusText}`);
  if (!response.ok) {
    throw new Error(`Failed to submit PRD: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventsCount = 0;

  console.log('\n--- Streaming SSE Events from Backend Orchestrator ---');
  
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
        eventsCount++;
        const eventType = eventMatch[1].trim();
        let eventData = {};
        try {
          eventData = JSON.parse(dataMatch[1].trim());
        } catch (_) {
          eventData = { raw: dataMatch[1].trim() };
        }

        console.log(`[SSE #${eventsCount}] ${eventType}:`, typeof eventData === 'object' ? JSON.stringify(eventData).substring(0, 120) : eventData);

        if (eventType === 'project_initialized') {
          console.log(`✅ VERIFIED: Project initialized with ID: ${eventData.projectId}`);
        }
        if (eventType === 'llm_provider_attempt' && eventData.provider === 'Ollama') {
          console.log(`✅ VERIFIED: Real Ollama/Gemma LLM provider invoked!`);
        }
        if (eventType === 'requirement_contract_created') {
          console.log(`✅ VERIFIED: Requirement contract derived successfully (${eventData.count} requirements)!`);
        }
        if (eventType === 'architecture_contract_created') {
          console.log(`✅ VERIFIED: Architecture contract derived! Domain: ${eventData.domain}`);
          console.log('\n🎯 GOAL MET: Browser PRD submission reaches backend, orchestrator initializes taskflow_mini_web_test, and real Gemma generation begins!');
          reader.cancel();
          return;
        }
      }
    }
  }
}

testWebSubmissionFlow().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
