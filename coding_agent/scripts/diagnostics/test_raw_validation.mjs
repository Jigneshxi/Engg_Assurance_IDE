import fs from 'fs';
import path from 'path';
import { validateDatabasePhase } from '../../server/dbValidator.js';

const ws = path.resolve('server/workspaces/quickcar-ecommerce-platform');
const manifestPath = path.join(ws, '.openclaw/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const dbModule = manifest.modules.find(m => m.layer === 'DATABASE');

dbModule.required_files.forEach(f => {
  const p = path.resolve(ws, f.path);
  if (fs.existsSync(p)) f.content = fs.readFileSync(p, 'utf8');
});

validateDatabasePhase([dbModule], manifest, '', () => {}, (t, d) => console.log(d), { workspacePath: ws }).then(res => {
  console.log('--- RAW Test Validation Result ---');
  console.log('isValid:', res.isValid);
  console.log('Errors count:', res.errors.length);
  if (!res.isValid) console.log('Errors:', res.errors);
});
