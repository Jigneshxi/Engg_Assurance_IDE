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

async function debugGroq() {
  const key = env.GROQ_API_KEY_1;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    })
  });
  const data = await res.json();
  console.log('Status:', res.status, res.statusText);
  console.log('Response body:', JSON.stringify(data, null, 2));
}

async function debugGoogle() {
  const key = env.GOOGLE_API_KEY_1;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello' }] }] })
  });
  const data = await res.json();
  console.log('Google Status:', res.status, res.statusText);
  console.log('Google Response:', JSON.stringify(data, null, 2));
}

await debugGroq();
await debugGoogle();
