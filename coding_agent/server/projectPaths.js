import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Robust helper that locates the repository root dynamically by walking upward
 * until the root package.json (with name "ide") or .git marker is found.
 * This makes path resolution resilient regardless of directory depth or moving packages.
 */
export function findProjectRoot(startDir = path.dirname(fileURLToPath(import.meta.url))) {
  let current = path.resolve(startDir);
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'ide') return current;
      } catch (_) {}
    }
    if (fs.existsSync(path.join(current, '.git'))) return current;
    current = path.dirname(current);
  }
  // Fallback if marker not found
  return path.resolve(startDir, '..');
}

export const PROJECT_ROOT = findProjectRoot();
export const WORKSPACES_DIR = path.join(PROJECT_ROOT, 'workspaces');
export const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');
export const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
export const APPS_DIR = path.join(PROJECT_ROOT, 'apps');
export const PACKAGES_DIR = path.join(PROJECT_ROOT, 'packages');
export const ENV_PATH = path.join(PROJECT_ROOT, '.env');
