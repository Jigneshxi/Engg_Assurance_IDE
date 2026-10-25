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

async function checkGroqModels() {
  const key = env.GROQ_API_KEY_1;
  if (!key) return console.log('GROQ: No key found in .env');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const d = await res.json();
    if (d.data) {
      console.log('GROQ MODELS (' + d.data.length + '):');
      for (const m of d.data) {
        console.log(`  - ${m.id} (owned_by: ${m.owned_by})`);
      }
    } else {
      console.log('GROQ ERROR:', d?.error?.message || d);
    }
  } catch(e) { console.error('GROQ fetch error:', e.message); }
}

async function checkGoogleModels() {
  const key = env.GOOGLE_API_KEY_1;
  if (!key) return console.log('GOOGLE: No key found in .env');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const d = await res.json();
    if (d.models) {
      console.log('GOOGLE MODELS (' + d.models.length + '):');
      for (const m of d.models) {
        const id = m.name.replace('models/', '');
        if (id.includes('gemini') || id.includes('flash') || id.includes('pro')) {
          console.log(`  - ${id} (${m.displayName || ''})`);
        }
      }
    } else {
      console.log('GOOGLE ERROR:', d?.error?.message || d);
    }
  } catch(e) { console.error('GOOGLE fetch error:', e.message); }
}

async function checkOpenRouterModels() {
  const key = env.OPENROUTER_API_KEY_1;
  if (!key) return console.log('OPENROUTER: No key found in .env');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const d = await res.json();
    if (d.data) {
      console.log('OPENROUTER MODELS count:', d.data.length);
    } else {
      console.log('OPENROUTER ERROR:', d?.error?.message || d);
    }
  } catch(e) { console.error('OPENROUTER fetch error:', e.message); }
}

console.log('Querying Provider Model APIs (keys loaded from .env)...\n');
await checkGroqModels();
console.log('');
await checkGoogleModels();
console.log('');
await checkOpenRouterModels();
