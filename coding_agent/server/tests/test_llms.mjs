import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

async function testGoogle() {
  const key = process.env.GOOGLE_API_KEY_1;
  const models = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];
  for (const model of models) {
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        system_instruction: { parts: [{ text: "You are a helpful assistant" }] },
        contents: [{ parts: [{ text: "Hello" }] }],
        generationConfig: { maxOutputTokens: 50 }
      });
      console.log(`Google [${model}] SUCCESS:`, res.data.candidates[0].content.parts[0].text);
    } catch (e) {
      console.log(`Google [${model}] Error:`, e.response?.data?.error?.message || e.message);
    }
  }
}

async function testOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY_1;
  const models = ['nvidia/nemotron-3.5-lightning:free', 'liquid/lfm-2.5-2.6b:free', 'nex-agi/nex-n2.5-pro:free'];
  for (const model of models) {
    try {
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 50
      }, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      console.log(`OpenRouter [${model}] SUCCESS:`, res.data.choices[0].message.content);
    } catch (e) {
      console.log(`OpenRouter [${model}] Error:`, e.response?.data?.error?.message || e.message);
    }
  }
}

async function runAll() {
  await testGoogle();
  await testOpenRouter();
}
runAll();
