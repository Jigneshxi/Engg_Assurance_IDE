import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIdePythonPath, getIdePythonCandidates, getWindowsPythonLauncherCandidates } from '../pythonEnvironment.js';
import { getPythonBinary } from '../backendRuntimeValidator.js';
import { resolvePythonCandidates } from '../dbValidator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('canonical toolchain uses the correct executable layout for Windows and POSIX', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const candidates = getIdePythonCandidates(root, { platform, exists: () => true });
    assert.equal(candidates[0], getIdePythonPath(root, platform));
    assert(candidates.every(p => platform === 'win32' ? p.endsWith('python.exe') : p.replace(/\\/g, '/').endsWith('/bin/python')));
  }
});

test('missing canonical interpreter falls back only to existing legacy interpreters', () => {
  const legacy = path.join(root, '.venv', 'bin/python');
  assert.deepEqual(getIdePythonCandidates(root, { platform: 'linux', exists: p => p === legacy }), [legacy]);
  assert.deepEqual(getIdePythonCandidates(root, { exists: () => false }), []);
  assert.deepEqual(getIdePythonCandidates(root, { exists: () => true, includeLegacy: false }), [getIdePythonPath(root)]);
});

test('prepared project interpreter retains precedence over shared IDE tools', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'python-selection-'));
  try {
    fs.mkdirSync(path.join(directory, '.openclaw'));
    const python = path.join(directory, process.platform === 'win32' ? 'python.exe' : 'python');
    fs.writeFileSync(python, 'mock interpreter; never executed');
    fs.writeFileSync(path.join(directory, '.openclaw/validation-runtime.json'), JSON.stringify({ python }));
    assert.equal(getPythonBinary(directory), python);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('explicit database Python override remains first and canonical discovery is independent of cwd', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'python-cwd-'));
  const original = process.cwd();
  try {
    const python = path.join(directory, process.platform === 'win32' ? 'python.exe' : 'python');
    fs.writeFileSync(python, 'mock interpreter; never executed');
    process.chdir(directory);
    const candidates = resolvePythonCandidates({ pythonBin: python });
    assert.equal(candidates[0], python);
    const canonical = getIdePythonPath(root);
    if (fs.existsSync(canonical)) assert(candidates.includes(canonical));
  } finally { process.chdir(original); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Windows setup and bridge launcher use the canonical location', () => {
  const batch = fs.readFileSync(path.join(root, 'setup_all_tools.bat'), 'utf8');
  assert(batch.includes('scripts\\setup_python.mjs'));
  assert(!batch.includes('".venv-ide\\Scripts\\python.exe"'));
  const launcher = fs.readFileSync(path.join(root, 'packages/python-engine/start.mjs'), 'utf8');
  assert(launcher.includes('getIdePythonCandidates(root)'));
  assert(launcher.includes('process.env.PYTHON_PATH || localPython'));
});

test('Windows Python discovery includes the standard per-user launcher folder', () => {
  const candidates = getWindowsPythonLauncherCandidates({
    pathDirs: ['C:\\Tools'],
    systemRoot: 'C:\\Windows',
    localAppData: 'C:\\Users\\Example\\AppData\\Local'
  });
  assert(candidates.includes(path.join('C:\\Users\\Example\\AppData\\Local', 'Programs', 'Python', 'Launcher', 'py.exe')));
});
