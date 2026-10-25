import dotenv from 'dotenv';
dotenv.config();
import { callLLM } from '../llmRouter.js';

async function runTests() {
  console.log('================================================');
  console.log('   STRICT LLM ROUTER AUDIT TEST SUITE   ');
  console.log('================================================\n');

  // TEST 1: Identifiable Markers
  console.log('--- TEST 1: Identifiable Markers (No Trimming) ---');
  process.env.LLM_FALLBACK_1 = 'google';
  process.env.LLM_FALLBACK_GOOGLE_MODEL = 'gemini-3.5-flash';
  
  const markerPrompt = `[BEGIN_MARKER]
${'A'.repeat(1000)}
[MIDDLE_MARKER]
${'B'.repeat(1000)}
[END_MARKER]

Instruction: Reply ONLY with "I SAW ALL THREE MARKERS" if you see BEGIN_MARKER, MIDDLE_MARKER, and END_MARKER.`;

  try {
     const res1 = await callLLM('You are a helpful assistant', markerPrompt);
     console.log('Test 1 Result:', res1.trim().substring(0, 50));
  } catch(e) { console.error('Test 1 Error:', e.message); }


  // TEST 2 & TEST 3: Force Groq REQUEST_TOO_LARGE and verify Fallback
  console.log('\n--- TEST 2 & 3: Groq REQUEST_TOO_LARGE & Immutable Fallback ---');
  process.env.LLM_FALLBACK_1 = 'groq';
  process.env.LLM_FALLBACK_2 = 'google';
  
  const oversizedPrompt = `[BEGIN_MARKER]
${'C'.repeat(50000)} 
[MIDDLE_MARKER]
${'D'.repeat(10000)}
[END_MARKER]

Instruction: Reply ONLY with "FALLBACK RECEIVED FULL PROMPT" if you see all three markers and the massive payload.`;

  try {
     const res2 = await callLLM('You are a helpful assistant', oversizedPrompt);
     console.log('Test 2/3 Result:', res2.trim().substring(0, 50));
  } catch(e) { console.error('Test 2/3 Error:', e.message); }


  // TEST 4: Implementation Plan Sections
  console.log('\n--- TEST 4: Implementation Plan Sections (No Section Drops) ---');
  process.env.LLM_FALLBACK_1 = 'google';
  
  const sectionsPrompt = `ORIGINAL PRD / IMPLEMENTATION PLAN:
This is the PRD.
CURRENT MODULE EXECUTION CONTEXT:
This is the module context.
COMPLETED DEPENDENCY CONTEXT:
This is the dependency context.
TARGET FILE: src/index.js
PREVIOUS VALIDATION ERRORS:
No errors.

Instruction: Reply ONLY with "ALL SECTIONS INTACT" if you see the PRD, EXECUTION CONTEXT, DEPENDENCY CONTEXT, TARGET FILE, and VALIDATION ERRORS.`;

  try {
     const res4 = await callLLM('You are a helpful assistant', sectionsPrompt);
     console.log('Test 4 Result:', res4.trim().substring(0, 50));
  } catch(e) { console.error('Test 4 Error:', e.message); }


  // TEST 5: Verify no generated response is silently truncated (OpenRouter Exhaustion)
  console.log('\n--- TEST 5: OpenRouter Capacity Exhaustion (No Partial Success) ---');
  process.env.LLM_FALLBACK_1 = 'openrouter';
  process.env.LLM_FALLBACK_2 = ''; // Force failure if openrouter fails
  process.env.LLM_MAX_TOKENS = '8192'; // Force high tokens
  
  try {
     const res5 = await callLLM('You are a helpful assistant', 'Write a very long essay.');
     console.log('Test 5 Result (Unexpected Success):', res5.trim().substring(0, 50));
  } catch(e) { 
     console.log('Test 5 Error (Expected Failure):', e.message); 
     if (e.message.includes('All configured LLMs failed')) {
         console.log('-> Verified: Provider capacity failure was correctly surfaced, no partial generation allowed.');
     }
  }
}

runTests();
