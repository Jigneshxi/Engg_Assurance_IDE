import assert from 'node:assert/strict';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getIdePythonCandidates, isPythonExecutable } from '../server/pythonEnvironment.js';
import { executeCommand, stopProcess } from '../server/validationRuntime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = getIdePythonCandidates(root);
const python = candidates.find(isPythonExecutable);
assert.ok(python, 'Run node scripts/setup_python.mjs first');
const env = { PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' };
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG']) {
  if (process.env[key]) env[key] = process.env[key];
}
const probe = await executeCommand(python, ['-c', `
import importlib.util
import flask, flask_cors, fastapi, sqlalchemy, pytest, httpx, uvicorn, alembic
spec = importlib.util.spec_from_file_location('ide_bridge', 'packages/python-engine/main.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda seconds: None
with module.app.test_client() as client:
    for route in ('crewai', 'aider'):
        response = client.post('/api/python_engine/' + route, json={'prd': 'mock bridge test'}, buffered=True)
        assert response.status_code == 200
        assert response.mimetype == 'text/event-stream'
        assert b'event: done' in response.data
print('PASS: shared Python imports and both mock bridge routes')
`], { cwd: root, env, timeout: 20000 });
assert.equal(probe.code, 0, probe.output);
const socket = net.createServer();
await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const child = spawn(process.execPath, ['packages/python-engine/start.mjs'], {
  cwd: root, env: { ...env, OPENCLAW_PYTHON_PORT: String(port) },
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
});
let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
let startupError; child.on('error', error => { startupError = error; });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/python_engine/crewai`, { signal: AbortSignal.timeout(500) });
      if (response.status === 405) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, logs || 'Python bridge did not start');
  console.log(probe.output.trim());
  console.log('PASS: real bridge launcher selects python_engine/.venv and serves HTTP');
} finally { stopProcess(child); }
