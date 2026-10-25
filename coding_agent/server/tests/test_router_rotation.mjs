import { callLLM } from '../llmRouter.js';
import process from 'process';

async function run() {
    process.env.LLM_ENABLE_GOOGLE = 'true';
    process.env.GOOGLE_API_KEY_1 = 'fake-key-1';
    process.env.GOOGLE_API_KEY_2 = 'fake-key-2';
    process.env.LLM_ENABLE_GROQ = 'true';
    process.env.GROQ_API_KEY_1 = 'fake-groq-key';
    process.env.LLM_FALLBACK_1 = 'google';
    process.env.LLM_FALLBACK_2 = 'groq';
    process.env.LLM_TEMPERATURE = '0.7';
    process.env.LLM_MAX_TOKENS = '8000';
    process.env.LLM_MAX_PRD_CHARS = '50000';
    process.env.LLM_GROQ_MAX_TOKENS = '4000';
    process.env.LLM_GROQ_MAX_PRD_CHARS = '20000';
    
    const events = [];
    const sendEvent = (type, data) => events.push({ type, data });

    console.log("Testing router rotation...");
    try {
        await callLLM("system", "user", { sendEvent, generationId: 'test-gen-1' });
    } catch (e) {
        console.log("Expected failure:", e.message);
    }
    
    const rotationEvents = events.filter(e => e.type === 'llm_key_rotation');
    const fallbackEvents = events.filter(e => e.type === 'llm_provider_fallback');
    
    console.log("Rotation events:", rotationEvents.length);
    console.log("Fallback events:", fallbackEvents.length);
    
    if (rotationEvents.length >= 2 && fallbackEvents.length >= 1) {
        console.log("✅ test_router_rotation PASSED");
        process.exit(0);
    } else {
        console.log("❌ test_router_rotation FAILED");
        process.exit(1);
    }
}
run();
