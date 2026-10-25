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

async function testGoogleKey(keyName, key, model = 'gemini-2.5-flash') {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK.' }] }] })
    });
    const d = await res.json();
    if (res.ok && d.candidates?.[0]?.content?.parts?.[0]?.text) {
      return { ok: true, text: d.candidates[0].content.parts[0].text.trim() };
    }
    return { ok: false, error: d.error?.message || res.statusText };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function testGroqKey(keyName, key, model = 'openai/gpt-oss-120b') {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Respond with OK.' }],
        max_tokens: 5
      })
    });
    const d = await res.json();
    if (res.ok && d.choices?.[0]?.message?.content) {
      return { ok: true, text: d.choices[0].message.content.trim() };
    }
    return { ok: false, error: d.error?.message || res.statusText };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function run() {
  console.log('--- Testing Google Gemini Keys (model: gemini-2.5-flash) ---');
  let googleWorking = 0;
  for (let i = 1; i <= 25; i++) {
    const k = env[`GOOGLE_API_KEY_${i}`];
    if (k) {
      const res = await testGoogleKey(`GOOGLE_API_KEY_${i}`, k, 'gemini-2.5-flash');
      console.log(`GOOGLE_API_KEY_${i}: ${res.ok ? '✅ OK' : '❌ ' + res.error}`);
      if (res.ok) googleWorking++;
    }
  }
  console.log(`Google working keys: ${googleWorking}`);

  console.log('\n--- Testing Groq Keys (model: openai/gpt-oss-120b) ---');
  let groqWorking = 0;
  for (let i = 1; i <= 25; i++) {
    const k = env[`GROQ_API_KEY_${i}`];
    if (k) {
      const res = await testGroqKey(`GROQ_API_KEY_${i}`, k, 'openai/gpt-oss-120b');
      console.log(`GROQ_API_KEY_${i}: ${res.ok ? '✅ OK' : '❌ ' + res.error}`);
      if (res.ok) groqWorking++;
    }
  }
  console.log(`Groq working keys: ${groqWorking}`);
}

await run();
