import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = { ...loadEnv(path.join(__dirname, '../.env')), ...loadEnv(path.join(__dirname, '../server/.env')) };

async function testGroqKeys() {
  console.log('Testing Groq with openai/gpt-oss-120b (max_tokens: 100)...');
  const workingGroq = [];
  for (let i = 1; i <= 21; i++) {
    const key = env[`GROQ_API_KEY_${i}`];
    if (!key) continue;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'Say hello world in 3 words' }],
          max_tokens: 100
        })
      });
      const d = await res.json();
      if (res.ok) {
        const text = d.choices?.[0]?.message?.content || d.choices?.[0]?.message?.reasoning || 'OK';
        console.log(`GROQ_API_KEY_${i}: ✅ OK ("${text.trim().replace(/\n/g, ' ')}")`);
        workingGroq.push(`GROQ_API_KEY_${i}`);
      } else {
        console.log(`GROQ_API_KEY_${i}: ❌ ${d.error?.message || res.statusText}`);
      }
    } catch (e) {
      console.log(`GROQ_API_KEY_${i}: ❌ ${e.message}`);
    }
  }
  console.log(`Groq working: ${workingGroq.length}/21`);
}

async function testGoogleKeys() {
  console.log('\nTesting Google with gemini-3.8-flash...');
  const workingGoogle = [];
  for (let i = 1; i <= 24; i++) {
    const key = env[`GOOGLE_API_KEY_${i}`];
    if (!key) continue;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello world in 3 words' }] }] })
      });
      const d = await res.json();
      if (res.ok) {
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
        console.log(`GOOGLE_API_KEY_${i}: ✅ OK ("${text.trim().replace(/\n/g, ' ')}")`);
        workingGoogle.push(`GOOGLE_API_KEY_${i}`);
      } else {
        const err = d.error?.status || d.error?.message || res.statusText;
        console.log(`GOOGLE_API_KEY_${i}: ❌ ${err.slice(0, 70)}`);
      }
    } catch (e) {
      console.log(`GOOGLE_API_KEY_${i}: ❌ ${e.message}`);
    }
  }
  console.log(`Google working: ${workingGoogle.length}/24`);
}

async function testOllama() {
  const url = env.OLLAMA_URL || 'http://192.168.0.49:11434';
  console.log(`\nTesting Ollama at ${url}...`);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      console.log('Ollama models:', data.models?.map(m => m.name).join(', ') || 'none');
    } else {
      console.log('Ollama error:', res.status, res.statusText);
    }
  } catch (e) {
    console.log('Ollama unreachable:', e.message);
  }
}

await testGroqKeys();
await testGoogleKeys();
await testOllama();
