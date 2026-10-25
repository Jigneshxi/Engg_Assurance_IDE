import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ws = path.resolve('server/workspaces/amereyconnect-medicinal-platform');
console.log('Auditing workspace:', ws);

// 1. Check entrypoints
const entrypoints = [
  'backend/main.py',
  'backend/app/db/models.py',
  'backend/app/db/database.py',
  'frontend/src/App.tsx',
  'frontend/src/main.tsx',
  'frontend/index.html',
  'frontend/src/api/client.ts',
  'frontend/package.json',
  'backend/requirements.txt'
];

console.log('\n--- Entrypoint Check ---');
for (const ep of entrypoints) {
  const exists = fs.existsSync(path.join(ws, ep));
  console.log(`${exists ? '✅' : '❌'} ${ep}`);
}

// 2. Python syntax check
console.log('\n--- Python Syntax Check ---');
function getPyFiles(dir) {
  let res = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== '__pycache__' && ent.name !== '.openclaw') {
      res.push(...getPyFiles(full));
    } else if (ent.isFile() && ent.name.endsWith('.py')) {
      res.push(full);
    }
  }
  return res;
}

const pyFiles = fs.existsSync(path.join(ws, 'backend')) ? getPyFiles(path.join(ws, 'backend')) : [];
let pySyntaxErrors = 0;
for (const py of pyFiles) {
  const rel = path.relative(ws, py);
  const res = spawnSync('python', ['-m', 'py_compile', py], { encoding: 'utf8' });
  if (res.status !== 0) {
    pySyntaxErrors++;
    console.log(`❌ Syntax error in ${rel}: ${res.stderr.trim()}`);
  }
}
if (pySyntaxErrors === 0) {
  console.log(`✅ All ${pyFiles.length} Python files have valid syntax.`);
}

// 3. Frontend imports & syntax check
console.log('\n--- Frontend TS/TSX Check ---');
function getTsFiles(dir) {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') {
      res.push(...getTsFiles(full));
    } else if (ent.isFile() && (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx'))) {
      res.push(full);
    }
  }
  return res;
}
const tsFiles = getTsFiles(path.join(ws, 'frontend'));
console.log(`Found ${tsFiles.length} TS/TSX files in frontend.`);
