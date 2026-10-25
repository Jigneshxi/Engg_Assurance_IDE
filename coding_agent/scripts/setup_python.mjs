import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getIdePythonPath } from '../server/pythonEnvironment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'packages', 'python-engine', '.venv');
const python = getIdePythonPath(root);
const bootstrap = process.argv[2] || (process.platform === 'win32' ? 'python' : 'python3');
// Do not inherit provider/database keys or user pip credential configuration.
const env = {
  PYTHONNOUSERSITE: '1',
  PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
  PIP_NO_INPUT: '1',
  PIP_DISABLE_PIP_VERSION_CHECK: '1'
};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']) {
  if (process.env[key]) env[key] = process.env[key];
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
  throw new Error('Refusing a symlink as the IDE Python environment.');
}
if (fs.existsSync(directory) && !fs.existsSync(python) && fs.readdirSync(directory).length) {
  throw new Error('This IDE environment is incomplete or belongs to another OS. Preserve it elsewhere and recreate it; do not merge environments.');
}
if (!fs.existsSync(python)) run(bootstrap, ['-m', 'venv', directory]);
run(python, ['-m', 'pip', 'install', '--no-cache-dir', '-r', 'packages/python-engine/requirements-validation.txt']);
run(python, ['-c', 'import flask, flask_cors, fastapi, sqlalchemy, pytest, httpx, uvicorn, alembic; print("PASS: IDE bridge and validation imports")']);
console.log('IDE Python environment ready: packages/python-engine/.venv');
