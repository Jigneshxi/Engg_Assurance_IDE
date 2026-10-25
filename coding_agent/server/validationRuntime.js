import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { redactSecret } from './securityValidator.js';

export function validationEnvironment(directory, extra = {}) {
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  return { ...env, HOME: directory, USERPROFILE: directory, CI: 'true', NODE_ENV: 'test', PYTHONDONTWRITEBYTECODE: '1',
    DATABASE_URL: `sqlite:///${path.join(directory, 'validation.sqlite').replace(/\\/g, '/')}`,
    JWT_SECRET: 'mock-validation-secret-not-for-production', SECRET_KEY: 'mock-validation-secret-not-for-production',
    PAYMENT_PROVIDER: 'mock', NOTIFICATION_PROVIDER: 'mock', ...extra,
    PYTHONPATH: [path.join(directory, '.validation-python'), extra.PYTHONPATH || path.join(directory, 'backend')].join(path.delimiter) };
}

export function createValidationWorkspace(files, workspacePath) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-validation-'));
  try {
    for (const file of files) {
      const name = file.path.replace(/\\/g, '/');
      if (/(^|\/)\.env($|\.(?!example$))/.test(name) || /\.(db|sqlite|sqlite3|pem|key)$/i.test(name)) continue;
      if (name.split('/').some(p => ['node_modules', '.git', '__pycache__', '.openclaw'].includes(p))) continue;
      const target = path.resolve(directory, name);
      const relative = path.relative(directory, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid validation path');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content || '', 'utf8');
    }
    fs.mkdirSync(path.join(directory, '.validation-python'), { recursive: true });
    fs.writeFileSync(path.join(directory, '.validation-python/sitecustomize.py'), `import socket\n_original_connect = socket.socket.connect\ndef _local_connect(self, address):\n    if isinstance(address, tuple) and address[0] not in ('127.0.0.1', 'localhost', '::1'):\n        raise RuntimeError('Validation allows loopback network only')\n    return _original_connect(self, address)\nsocket.socket.connect = _local_connect\ntry:\n    import sqlalchemy\n    _create_engine = sqlalchemy.create_engine\n    def _sqlite_only(url, *args, **kwargs):\n        if not str(url).startswith('sqlite:'):\n            raise RuntimeError('Validation requires a disposable SQLite database')\n        return _create_engine(url, *args, **kwargs)\n    sqlalchemy.create_engine = _sqlite_only\nexcept ImportError:\n    pass\n`);
    if (workspacePath) {
      const dependencies = path.resolve(workspacePath, 'frontend/node_modules');
      if (fs.existsSync(dependencies) && fs.existsSync(path.join(directory, 'frontend'))) fs.symlinkSync(dependencies, path.join(directory, 'frontend/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    return {
      directory,
      cleanup: () => {
        try {
          fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch (_) {}
      }
    };
  } catch (error) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (_) {}
    throw error;
  }
}

export function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command) });
    let output = '';
    const collect = data => { output = (output + data).slice(-32000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => { stopProcess(child); }, options.timeout || 120000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code: code ?? 1, signal, output: redactSecret(output) }); });
  });
}

export function stopProcess(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('error', () => child.kill());
    } else process.kill(-child.pid, 'SIGKILL');
  } catch { try { child.kill(); } catch {} }
}
