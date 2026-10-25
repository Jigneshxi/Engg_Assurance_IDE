import dotenv from 'dotenv';
dotenv.config();
import { callLLM } from '../server/llmRouter.js';

console.log('Testing callLLM via router...');
try {
  const res = await callLLM('System: Test', 'Reply with ROUTER_VERIFIED', {
    sendEvent: (event, data) => console.log(`[Event: ${event}]`, data)
  });
  console.log('Router response:', res.trim());
  if (res.includes('ROUTER_VERIFIED')) {
    console.log('✅ Provider & Router Verified Successfully!');
  }
} catch (e) {
  console.error('❌ callLLM failed:', e.message);
  process.exit(1);
}
