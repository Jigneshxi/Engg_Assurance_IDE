import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env'), override: true });

async function testGeminiKey(key, _name) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data?.error?.message || res.statusText };
    }
    return { ok: true, candidate: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testGroqKey(key, _name) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data?.error?.message || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testOpenRouterKey(key, _name) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data?.error?.message || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testOpenAIKey(key, _name) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data?.error?.message || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('=== AUDITING ALL API KEYS IN .ENV ===\n');

  console.log('--- TESTING GOOGLE GEMINI KEYS ---');
  const googleKeys = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`GOOGLE_API_KEY_${i}`];
    if (key) {
      const res = await testGeminiKey(key, `GOOGLE_API_KEY_${i}`);
      console.log(`GOOGLE_API_KEY_${i}: ${res.ok ? '✅ WORKING' : '❌ ' + res.error}`);
      googleKeys.push({ id: `GOOGLE_API_KEY_${i}`, key, ok: res.ok, err: res.error });
    }
  }

  console.log('\n--- TESTING GROQ KEYS ---');
  const groqKeys = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`GROQ_API_KEY_${i}`];
    if (key) {
      const res = await testGroqKey(key, `GROQ_API_KEY_${i}`);
      console.log(`GROQ_API_KEY_${i}: ${res.ok ? '✅ WORKING' : '❌ ' + res.error}`);
      groqKeys.push({ id: `GROQ_API_KEY_${i}`, key, ok: res.ok, err: res.error });
    }
  }

  console.log('\n--- TESTING OPENROUTER KEYS ---');
  const openRouterKeys = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`OPENROUTER_API_KEY_${i}`];
    if (key) {
      const res = await testOpenRouterKey(key, `OPENROUTER_API_KEY_${i}`);
      console.log(`OPENROUTER_API_KEY_${i}: ${res.ok ? '✅ WORKING' : '❌ ' + res.error}`);
      openRouterKeys.push({ id: `OPENROUTER_API_KEY_${i}`, key, ok: res.ok, err: res.error });
    }
  }

  console.log('\n--- TESTING OPENAI KEYS ---');
  const openAIKeys = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`OPENAI_API_KEY_${i}`];
    if (key) {
      const res = await testOpenAIKey(key, `OPENAI_API_KEY_${i}`);
      console.log(`OPENAI_API_KEY_${i}: ${res.ok ? '✅ WORKING' : '❌ ' + res.error}`);
      openAIKeys.push({ id: `OPENAI_API_KEY_${i}`, key, ok: res.ok, err: res.error });
    }
  }
}

main().catch(console.error);
