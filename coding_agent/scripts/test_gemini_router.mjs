import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { callGemini, getLLMConfig } from '../server/llmRouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env'), override: true });

async function main() {
  const config = getLLMConfig();
  console.log('Testing Google Gemini Keys using active llmRouter configuration:');
  console.log('Active Gemini Model:', config.models.google);

  const results = [];
  for (let i = 1; i <= 19; i++) {
    const key = process.env[`GOOGLE_API_KEY_${i}`];
    if (!key) continue;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await callGemini(key, config.models.google, 'You are a test agent.', 'Reply with OK.', config);
      clearTimeout(timeout);
      console.log(`GOOGLE_API_KEY_${i}: ✅ ACTIVE! (Reply: "${res.trim().slice(0, 30)}")`);
      results.push({ id: `GOOGLE_API_KEY_${i}`, key, status: 'ACTIVE' });
    } catch (e) {
      console.log(`GOOGLE_API_KEY_${i}: ❌ FAILED (${e.message.slice(0, 80)})`);
      results.push({ id: `GOOGLE_API_KEY_${i}`, key, status: 'FAILED', reason: e.message });
    }
  }

  console.log('\n--- SUMMARY ---');
  const active = results.filter(r => r.status === 'ACTIVE');
  const failed = results.filter(r => r.status === 'FAILED');
  console.log(`Active Keys: ${active.length} (${active.map(a => a.id).join(', ')})`);
  console.log(`Failed / Expired Keys: ${failed.length} (${failed.map(f => f.id).join(', ')})`);
}

main().catch(console.error);
