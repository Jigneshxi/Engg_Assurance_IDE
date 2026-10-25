import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getIdePythonCandidates } from '../../server/pythonEnvironment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const localPython = getIdePythonCandidates(root)[0];
const executable = process.env.PYTHON_PATH || localPython || (process.platform === 'win32' ? 'python' : 'python3');
const child = spawn(executable, [path.join(root, 'packages/python-engine/main.py')], { cwd: root, stdio: 'inherit' });
child.on('error', error => {
  console.error(`Unable to start Python: ${error.message}. Run node scripts/setup_python.mjs, or set PYTHON_PATH.`);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
