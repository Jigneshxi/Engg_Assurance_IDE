import fs from 'node:fs';
import path from 'node:path';
import { prepareValidationDependencies } from '../server/validationSetup.js';
const workspace = process.argv[2];
if (!workspace) throw new Error('Usage: node scripts/setup_validation.mjs <generated-project-directory>');
const root = path.resolve(workspace);
const files = ['frontend/package.json', 'backend/requirements.txt'].filter(p => fs.existsSync(path.join(root, p))).map(p => ({ path: p, content: fs.readFileSync(path.join(root, p), 'utf8') }));
await prepareValidationDependencies(files, root, { sendEvent: (event, data) => event === 'log' && console.log(data) });
console.log('Validation dependencies ready. Environment files and existing databases were not used.');
