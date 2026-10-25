import dotenv from 'dotenv';
dotenv.config();
import { callLLM } from '../llmRouter.js';

async function testAll() {
  console.log('Testing full LLM Router Fallback Pipeline with updated config...');
  try {
    const res = await callLLM('You are a helpful assistant.', 'Reply with "SYSTEM ONLINE AND WORKING PERFECTLY".');
    console.log('Router Result SUCCESS:', res);
  } catch (err) {
    console.error('Router Result Error:', err.message);
  }
}

testAll();
