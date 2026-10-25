import { callLLM } from '../llmRouter.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

let events = [];
const mockSendEvent = (type, data) => {
  events.push({ type, data });
};

async function runTest() {
  console.log('Running test_provider_streaming...');

  const originalFetch = global.fetch;
  global.fetch = async (url, _options) => {
    if (url.includes('google')) {
      return {
        ok: false,
        json: async () => ({ error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } })
      };
    }
    if (url.includes('groq')) {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Success from Groq' } }] })
      };
    }
    throw new Error('Unknown URL: ' + url);
  };

  try {
    const result = await callLLM('system', 'user', { sendEvent: mockSendEvent, generationId: 'test-gen-id' });
    
    const started = events.find(e => e.type === 'llm_request_started');
    const googleAttempt = events.find(e => e.type === 'llm_provider_attempt' && e.data.provider === 'Google');
    const googleFailed = events.find(e => e.type === 'llm_provider_failed' && e.data.provider === 'Google');
    const fallback = events.find(e => e.type === 'llm_provider_fallback');
    const groqAttempt = events.find(e => e.type === 'llm_provider_attempt' && e.data.provider === 'Groq');
    const groqSelected = events.find(e => e.type === 'llm_provider_selected' && e.data.provider === 'Groq');

    if (!started || !googleAttempt || !googleFailed || !fallback || !groqAttempt || !groqSelected) {
      console.error('Failed: Missing expected events.');
      console.error(events.map(e => e.type));
      process.exit(1);
    }

    if (fallback.data.from !== 'Google' || fallback.data.to !== 'Groq') {
      console.error('Failed: Incorrect fallback data.', fallback.data);
      process.exit(1);
    }

    if (result !== 'Success from Groq') {
      console.error('Failed: Incorrect result.');
      process.exit(1);
    }

    console.log('✅ test_provider_streaming passed!');
  } catch (err) {
    console.error('Failed with error:', err);
    process.exit(1);
  } finally {
    global.fetch = originalFetch;
  }
}

runTest();
