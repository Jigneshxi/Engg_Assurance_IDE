import fs from 'fs';
import path from 'path';
import { autoHealProjectContracts } from '../../server/integrationContract.js';
import { validateFrontendContract } from '../../server/frontendContractValidator.js';
import { validateApiAuthz } from '../../server/apiAuthzValidator.js';
import { validateImportClosure } from '../../server/importClosureValidator.js';
import { validateBackendRuntime } from '../../server/backendRuntimeValidator.js';

const ws = path.resolve('server/workspaces/quickcart-ecommerce-platform');
const manifest = JSON.parse(fs.readFileSync(path.join(ws, '.openclaw/manifest.json'), 'utf8'));

function collect(dir, base = '') {
  let list = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.openclaw' || ent.name === 'node_modules' || ent.name === '.git' || ent.name === '__pycache__' || ent.name.endsWith('.db') || ent.name.endsWith('.sqlite')) continue;
    const full = path.join(dir, ent.name);
    const rel = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) list.push(...collect(full, rel));
    else list.push({ path: rel.replace(/\\/g, '/'), content: fs.readFileSync(full, 'utf8') });
  }
  return list;
}

const files = collect(ws);
console.log(`Total workspace files: ${files.length}`);

// Pre-heal any contract mismatches
let defects = [];
const initFc = await validateFrontendContract(files, { workspacePath: ws, manifest });
if (!initFc.isValid) defects.push(...initFc.defects);
const initBr = await validateBackendRuntime(files, { workspacePath: ws, manifest });
if (!initBr.isValid) defects.push(...initBr.defects);
const initAa = await validateApiAuthz(files, { workspacePath: ws, manifest });
if (!initAa.isValid) defects.push(...initAa.defects);

for (let i = 0; i < 3; i++) {
  const healed = autoHealProjectContracts(files, defects, console.log);
  if (!healed) break;
  for (const f of files) {
    const full = path.join(ws, f.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content, 'utf8');
  }
}

const ic = validateImportClosure(files, { workspacePath: ws, manifest });
console.log(`Import Closure: isValid=${ic.isValid}, defects=${ic.defects?.length || 0}`);
if (!ic.isValid) console.log(JSON.stringify(ic.defects, null, 2));

const fc = await validateFrontendContract(files, { workspacePath: ws, manifest });
console.log(`Frontend Contract: isValid=${fc.isValid}, defects=${fc.defects?.length || 0}`);
if (!fc.isValid) console.log(JSON.stringify(fc.defects, null, 2));

const br = await validateBackendRuntime(files, { workspacePath: ws, manifest });
console.log(`Backend Runtime: isValid=${br.isValid}, defects=${br.defects?.length || 0}`);
if (!br.isValid) console.log(JSON.stringify(br.defects, null, 2));

const aa = await validateApiAuthz(files, { workspacePath: ws, manifest });
console.log(`API Authz: isValid=${aa.isValid}, defects=${aa.defects?.length || 0}`);
if (!aa.isValid) console.log(JSON.stringify(aa.defects, null, 2));
