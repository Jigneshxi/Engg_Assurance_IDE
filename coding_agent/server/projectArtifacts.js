import crypto from 'node:crypto';
import { validateFilePath } from './manifestValidator.js';

export function createArtifactSnapshot(files) {
  const paths = new Set();
  const snapshot = [];
  for (const file of files) {
    if (!file || typeof file.content !== 'string') continue;
    const checked = validateFilePath(file.path);
    if (!checked.valid) throw new Error(checked.reason);
    const name = checked.normalizedPath;
    if (name.split('/').some(part => part === '.env' || part.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(part))) continue;
    if (paths.has(name)) throw new Error(`Duplicate artifact path: ${name}`);
    paths.add(name);
    snapshot.push({ path: name, content: file.content });
  }
  snapshot.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { files: snapshot, hash };
}
