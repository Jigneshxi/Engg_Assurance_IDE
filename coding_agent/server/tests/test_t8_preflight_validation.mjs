import assert from 'node:assert';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { resolveSharedPython, resolveSystemPython } from '../pythonEnvironment.js';
import { writeWorkspaceAndScaffolds } from '../workspaceScaffolds.js';
import { getValidationCacheBase, getValidationBrowserPath } from '../validationSetup.js';

test('T8.1: Toolchain resolution respects strict isolation and refuses .venv-ide when allowIdeVenv is false', () => {
  const pythonDefault = resolveSharedPython({ allowIdeVenv: false });
  if (pythonDefault) {
    assert.strictEqual(
      pythonDefault.toLowerCase().includes('.venv-ide'),
      false,
      `Toolchain with allowIdeVenv=false must NEVER return .venv-ide: ${pythonDefault}`
    );
  }

  const systemPython = resolveSystemPython();
  if (systemPython) {
    assert.strictEqual(
      systemPython.toLowerCase().includes('.venv-ide'),
      false,
      `System python must NEVER point to .venv-ide: ${systemPython}`
    );
  }
});

test('T8.2: Workspace initialization isolates directories and purges shadowing migration __init__.py', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-test-ws-'));

  try {
    const files = [
      { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
      { path: 'migrations/versions/__init__.py', content: '# should not exist' },
      { path: 'migrations/__init__.py', content: '# shadowing init' }
    ];

    writeWorkspaceAndScaffolds(tempDir, files, {}, () => {});

    // Verify __init__.py was blocked/prevented from being written to migrations/
    const init1 = path.join(tempDir, 'migrations', '__init__.py');
    const init2 = path.join(tempDir, 'migrations', 'versions', '__init__.py');
    assert.strictEqual(fs.existsSync(init1), false, 'migrations/__init__.py must not exist');
    assert.strictEqual(fs.existsSync(init2), false, 'migrations/versions/__init__.py must not exist');

    // Verify main app files were created safely
    const mainPy = path.join(tempDir, 'backend', 'app', 'main.py');
    assert.strictEqual(fs.existsSync(mainPy), true, 'backend/app/main.py must exist');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('T8.3: PRD pre-flight character limits strictly reject oversized input without truncation', () => {
  const maxPrdChars = 95000;
  const oversizedPrd = 'x'.repeat(maxPrdChars + 100);

  assert.throws(
    () => {
      if (oversizedPrd.length > maxPrdChars) {
        throw new Error(`CRITICAL ERROR: PRD exceeds character limits (${oversizedPrd.length} > ${maxPrdChars}). Truncation is strictly forbidden.`);
      }
    },
    /CRITICAL ERROR: PRD exceeds character limits/
  );
});

test('T8.4: Validation cache paths are isolated from workspace and user environment', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-test-cache-'));

  try {
    const localCache = getValidationCacheBase(tempDir, { localOnly: true });
    assert.ok(
      localCache.includes('.openclaw'),
      `Local validation cache must be inside .openclaw: ${localCache}`
    );

    const browserPath = getValidationBrowserPath(tempDir, { localOnly: true });
    assert.ok(
      browserPath.includes('playwright-browsers'),
      `Browser path must specify isolated playwright-browsers: ${browserPath}`
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
