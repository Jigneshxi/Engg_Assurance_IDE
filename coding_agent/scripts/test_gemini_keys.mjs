import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env'), override: true });

async function main() {
  console.log('Testing Google Gemini Keys 1 to 19 with models/gemini-3.8-flash and gemini-flash-latest...\n');
  const validKeys = [];
  const expiredKeys = [];

  for (let i = 1; i <= 25; i++) {
    const key = process.env[`GOOGLE_API_KEY_${i}`];
    if (!key) continue;

    // Test with gemini-flash-latest
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
    try {
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      let data = await res.json();
      if (!res.ok || data.error) {
        // Try gemini-3.8-flash
        url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
        });
        data = await res.json();
      }

      if (res.ok && data.candidates) {
        console.log(`GOOGLE_API_KEY_${i}: ✅ VALID & ACTIVE! (Response: ${data.candidates[0].content.parts[0].text.trim().slice(0, 30)})`);
        validKeys.push({ id: `GOOGLE_API_KEY_${i}`, key });
      } else {
        const msg = data?.error?.message || res.statusText || 'Unknown error';
        console.log(`GOOGLE_API_KEY_${i}: ❌ EXPIRED / INVALID (${msg.slice(0, 80)})`);
        expiredKeys.push({ id: `GOOGLE_API_KEY_${i}`, key, reason: msg });
      }
    } catch (err) {
      console.log(`GOOGLE_API_KEY_${i}: ❌ NETWORK ERROR (${err.message})`);
      expiredKeys.push({ id: `GOOGLE_API_KEY_${i}`, key, reason: err.message });
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Valid Active Keys: ${validKeys.length}`);
  console.log(`Expired / Invalid Keys: ${expiredKeys.length}`);
}

main().catch(console.error);
