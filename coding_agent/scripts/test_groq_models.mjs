import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env'), override: true });

async function main() {
  const key = process.env.GROQ_API_KEY_1;
  console.log('Testing GROQ_API_KEY_1...');
  
  // Test listing models
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    const data = await res.json();
    if (res.ok && data.data) {
      console.log('Groq Models Available:');
      const modelIds = data.data.map(m => m.id);
      console.log(modelIds.filter(id => id.includes('llama') || id.includes('qwen') || id.includes('gemma') || id.includes('mixtral')).join('\n'));
    } else {
      console.log('Groq Models list error:', data);
    }
  } catch (err) {
    console.error('Groq fetch error:', err.message);
  }
}

main().catch(console.error);
