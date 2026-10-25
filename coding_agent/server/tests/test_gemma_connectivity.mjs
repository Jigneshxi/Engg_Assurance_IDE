import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

import { getLLMConfig, callOllama } from '../llmRouter.js';

async function testGemmaDirect() {
  const config = getLLMConfig();
  if (process.argv[2]) config.ollamaUrl = process.argv[2];
  if (process.argv[3]) config.ollamaModel = process.argv[3];
  console.log('=== GEMMA / OLLAMA DIRECT CONNECTIVITY TEST ===');
  console.log('Configured URL:   ', config.ollamaUrl);
  console.log('Configured Model: ', config.ollamaModel);
  console.log('Ollama Enabled:   ', config.isOllamaEnabled);

  // 1. Test /api/tags
  console.log('\n[1/2] Checking endpoint tags (/api/tags)...');
  try {
    const tagsUrl = config.ollamaUrl.replace(/\/+$/, '') + '/api/tags';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(tagsUrl, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!res.ok) {
      console.log(`❌ HTTP Error: ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    console.log('✅ Endpoint Reachable! Available models:');
    (data.models || []).forEach(m => console.log(`   - ${m.name} (${Math.round(m.size / 1e9 * 10) / 10} GB)`));

    const modelMatch = (data.models || []).some(m => m.name === config.ollamaModel || m.name.startsWith(config.ollamaModel));
    console.log(`\nModel "${config.ollamaModel}" installed: ${modelMatch ? 'YES ✅' : 'NO ❌'}`);

  } catch (err) {
    console.log(`❌ Connectivity failed to ${config.ollamaUrl}: ${err.message}`);
    return;
  }

  // 2. Test generation call
  console.log('\n[2/2] Testing minimal generation with Gemma...');
  try {
    const reply = await callOllama('You are a test assistant.', 'Reply with exactly: "GEMMA ONLINE"', config, 50);
    console.log('✅ Generation SUCCESS:');
    console.log(reply.trim());
  } catch (err) {
    console.log(`❌ Generation call failed: ${err.message}`);
  }
}

testGemmaDirect();
