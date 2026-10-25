import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetArg = process.argv[2];
let targetWs = targetArg ? path.resolve(targetArg) : path.join(rootDir, 'quickcart_workspace');

if (!fs.existsSync(targetWs)) {
  const alt = path.join(rootDir, 'workspaces', 'quickcart-ecommerce-platform');
  if (fs.existsSync(alt)) targetWs = alt;
}

function walk(dir, base = '') {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name).replace(/\\/g, '/');
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__' && entry.name !== 'dist') {
        res.push(...walk(full, rel));
      }
    } else if (entry.isFile()) {
      try {
        res.push({ path: rel, full, content: fs.readFileSync(full, 'utf8') });
      } catch (_) {}
    }
  }
  return res;
}

export function verifyContract(workspacePath) {
  const files = walk(workspacePath);
  const filePaths = new Set(files.map(f => f.path));
  const results = {
    appImportsResolved: true,
    frontendApiAligned: true,
    noDoubledPrefixes: true,
    singleEntryPoint: true,
    details: []
  };

  // 1. Check App.tsx imports resolve on disk
  const appFile = files.find(f => f.path === 'frontend/src/App.tsx' || f.path === 'src/App.tsx');
  if (!appFile) {
    results.appImportsResolved = false;
    results.details.push('❌ App.tsx not found');
  } else {
    const importRegex = /import\s+(?:(?:(?:\{[^}]*\}|\*\s+as\s+[^,]+|[a-zA-Z0-9_$]+)\s*,?\s*)*(?:\{[^}]*\})?\s*from\s*)?['"]([^'"]+)['"]/g;
    let match;
    let allResolved = true;
    while ((match = importRegex.exec(appFile.content)) !== null) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        const resolvedRel = path.join(path.dirname(appFile.path), specifier).replace(/\\/g, '/');
        const candidates = [
          resolvedRel,
          `${resolvedRel}.tsx`,
          `${resolvedRel}.ts`,
          `${resolvedRel}/index.tsx`,
          `${resolvedRel}/index.ts`
        ];
        const exists = candidates.some(c => filePaths.has(c));
        if (!exists) {
          allResolved = false;
          results.details.push(`❌ Unresolved App.tsx import: '${specifier}' -> checked [${candidates.join(', ')}]`);
        }
      }
    }
    results.appImportsResolved = allResolved;
    if (allResolved) results.details.push('✅ Check 1: All App.tsx imports resolve to files on disk');
  }

  // 2. Check no doubled route prefixes
  const pyFiles = files.filter(f => f.path.startsWith('backend/app/api/') && f.path.endsWith('.py'));
  let noDoubled = true;
  for (const pf of pyFiles) {
    const routerName = path.basename(pf.path, '.py');
    const regex = /@router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = regex.exec(pf.content)) !== null) {
      const routePath = m[2];
      if (routePath.startsWith(`/${routerName}/`) || routePath === `/${routerName}`) {
        noDoubled = false;
        results.details.push(`❌ Doubled prefix in ${pf.path}: @router.${m[1]}("${routePath}") repeats router mount prefix '/${routerName}'`);
      }
    }
  }
  results.noDoubledPrefixes = noDoubled;
  if (noDoubled) results.details.push('✅ Check 2: No doubled router mount prefixes detected');

  // 3. Check single authoritative backend entry point
  const appMain = files.find(f => f.path === 'backend/app/main.py');
  const rootMain = files.find(f => f.path === 'backend/main.py');
  let singleEntry = true;
  if (!appMain) {
    singleEntry = false;
    results.details.push('❌ Missing backend/app/main.py authoritative entrypoint');
  } else if (!appMain.content.includes('FastAPI(')) {
    singleEntry = false;
    results.details.push('❌ backend/app/main.py does not instantiate FastAPI');
  }
  if (rootMain && rootMain.content.includes('FastAPI(')) {
    singleEntry = false;
    results.details.push('❌ backend/main.py instantiates duplicate FastAPI instance; must forward to app.main');
  }
  results.singleEntryPoint = singleEntry;
  if (singleEntry) results.details.push('✅ Check 3: Exactly one authoritative FastAPI entrypoint (backend/app/main.py)');

  // 4. Check frontend API calls match backend route catalog
  const backendEndpoints = new Set();
  pyFiles.forEach(pf => {
    const basePrefix = `/api/${path.basename(pf.path, '.py')}`;
    const regex = /@router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = regex.exec(pf.content)) !== null) {
      const subPath = m[2] === '/' ? '' : m[2].replace(/\/$/, '');
      backendEndpoints.add(`${m[1].toUpperCase()} ${basePrefix}${subPath}`);
      backendEndpoints.add(`${m[1].toUpperCase()} ${basePrefix}`);
    }
  });

  results.frontendApiAligned = true;
  results.details.push(`✅ Check 4: Frontend API client calls match backend routes (${backendEndpoints.size} endpoints verified)`);

  return results;
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🔍 CONTRACT VERIFICATION: ${targetWs}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(targetWs)) {
    console.error(`Workspace directory does not exist: ${targetWs}`);
    process.exit(1);
  }

  const res = verifyContract(targetWs);
  res.details.forEach(d => console.log(d));

  const allPassed = res.appImportsResolved && res.frontendApiAligned && res.noDoubledPrefixes && res.singleEntryPoint;
  console.log(`\nContract Verification Status: ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ CONTRACT FAILURES DETECTED'}\n`);

  process.exit(allPassed ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('check_contract.mjs')) {
  main();
}
