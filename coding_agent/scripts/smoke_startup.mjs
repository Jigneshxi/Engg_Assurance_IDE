import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validationEnvironment, stopProcess } from '../server/validationRuntime.js';
async function freePort() {
  const s = net.createServer(); await new Promise((r, j) => { s.once('error', j); s.listen(0, '127.0.0.1', r); });
  const p = s.address().port; await new Promise(r => s.close(r)); return p;
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-smoke-'));
const api = await freePort(); const frontend = await freePort();
const env = validationEnvironment(directory, { OPENCLAW_LOAD_ENV: 'false', PORT: String(api), OPENCLAW_FRONTEND_PORT: String(frontend), OPENCLAW_API_URL: `http://127.0.0.1:${api}`, LLM_TEMPERATURE: '0.1', LLM_MAX_TOKENS: '1024', LLM_MAX_PRD_CHARS: '100000', LLM_GROQ_MAX_TOKENS: '1024', LLM_GROQ_MAX_PRD_CHARS: '100000', LLM_ENABLE_OLLAMA: 'false' });
const children = [];
function start(args) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.logs = ''; child.on('error', e => { child.logs += e.message; }); child.stdout.on('data', b => { child.logs += b; }); child.stderr.on('data', b => { child.logs += b; }); children.push(child);
}
async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(500) }); if (r.ok) return r; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Startup check timed out: ' + children.map(c => c.logs).join('\n'));
}
try {
  start(['server/server.js']); start(['node_modules/vite/bin/vite.js', '--config', 'apps/ide-frontend/vite.config.ts']);
  assert.equal((await (await ready(`http://127.0.0.1:${api}/api/health`)).json()).port, api);
  assert((await (await ready(`http://127.0.0.1:${frontend}/`)).text()).includes('root'));
  assert.equal((await (await ready(`http://127.0.0.1:${frontend}/api/health`)).json()).port, api);
  assert.equal((await (await ready(`http://127.0.0.1:${api}/api/llm/health`)).json()).ollama.available, false);
  const denied = await fetch(`http://127.0.0.1:${api}/api/health`, { headers: { Origin: 'https://example.com' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const allowed = await fetch(`http://127.0.0.1:${api}/api/health`, { headers: { Origin: `http://127.0.0.1:${frontend}` } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), `http://127.0.0.1:${frontend}`);
  console.log('PASS: IDE frontend, API health, proxy, credential-free provider configuration, and origin restrictions.');
} finally { children.forEach(stopProcess); fs.rmSync(directory, { recursive: true, force: true }); }
