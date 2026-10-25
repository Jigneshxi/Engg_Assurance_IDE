import assert from 'assert';
import path from 'path';
import fs from 'fs';
import {
  checkSqlalchemyAvailability,
  detectSqlAlchemyAvailability,
  resetSqlalchemyCache,
  resolvePythonCandidates,
  extractExecError
} from '../dbValidator.js';

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
  }
}

console.log('====================================================');
console.log('🧪 RUNNING WINDOWS PYTHON / SQLALCHEMY RESOLUTION TESTS');
console.log('====================================================\n');

// 1. Candidate resolution on Windows rejects invalid Unix paths and prioritizes Scripts/python.exe
await test('Candidate resolution rejects non-existent Unix paths on Windows', () => {
  const candidates = resolvePythonCandidates();
  assert.ok(Array.isArray(candidates), 'Candidates must be an array');

  // Verify no non-existent Unix /bin/python paths exist in resolved candidates
  for (const cand of candidates) {
    const isFilePath = cand.includes('/') || cand.includes('\\') || cand.endsWith('.exe');
    if (isFilePath) {
      assert.ok(
        fs.existsSync(cand),
        `Resolved candidate file path must exist on disk: ${cand}`
      );
      assert.strictEqual(
        cand.includes('.venv-ide/bin/python') || cand.includes('.venv-ide\\bin\\python'),
        false,
        `Candidates must not include non-existent .venv-ide/bin/python: ${cand}`
      );
    }
  }
});

// 2. Candidate resolution includes existing Windows venv executables
await test('Candidate resolution includes existing Windows venv executables', () => {
  const candidates = resolvePythonCandidates();
  if (process.platform === 'win32') {
    const venvIdeScripts = path.join(process.cwd(), '.venv-ide', 'Scripts', 'python.exe');
    if (fs.existsSync(venvIdeScripts)) {
      assert.ok(
        candidates.includes(path.normalize(venvIdeScripts)),
        `Candidates should include existing .venv-ide\\Scripts\\python.exe`
      );
    }
  }
});

// 3. Normalization of Unix-style PYTHON_BIN on Windows
await test('PYTHON_BIN with Unix /bin/python normalizes to Windows Scripts/python.exe if present', () => {
  if (process.platform === 'win32') {
    const fakeUnixPath = path.join(process.cwd(), '.venv-ide', 'bin', 'python');
    const expectedWinPath = path.join(process.cwd(), '.venv-ide', 'Scripts', 'python.exe');

    if (fs.existsSync(expectedWinPath)) {
      const candidates = resolvePythonCandidates({ pythonBin: fakeUnixPath });
      assert.ok(
        candidates.includes(path.normalize(expectedWinPath)),
        `Should have normalized fake Unix path to existing Windows path: ${expectedWinPath}`
      );
    }
  }
});

// 4. detectSqlAlchemyAvailability is exported and identical to checkSqlalchemyAvailability
await test('detectSqlAlchemyAvailability alias is exported and functional', async () => {
  assert.strictEqual(
    typeof detectSqlAlchemyAvailability,
    'function',
    'detectSqlAlchemyAvailability must be a function'
  );
  assert.strictEqual(
    detectSqlAlchemyAvailability,
    checkSqlalchemyAvailability,
    'detectSqlAlchemyAvailability must be the canonical checkSqlalchemyAvailability function'
  );
});

// 5. Explicit non-existent pythonBin returns available=false with meaningful reason
await test('Explicit non-existent pythonBin path returns available=false with clear reason', async () => {
  resetSqlalchemyCache();
  const nonExistentPath = path.join(process.cwd(), 'does_not_exist_venv', 'bin', 'python');
  const res = await checkSqlalchemyAvailability({ pythonBin: nonExistentPath });
  assert.strictEqual(res.available, false);
  assert.strictEqual(typeof res.reason, 'string');
  assert.ok(res.reason.includes('does not exist') || res.reason.includes('failed') || res.reason.includes('not found'));
  assert.notStrictEqual(res.reason, 'undefined');
});

// 6. extractExecError properly parses stderr and message
await test('extractExecError cleans up error output and ignores boilerplate', () => {
  const errWithStderr = {
    message: 'Command failed: python.exe -c "..."\nNo Python at C:\\path\\python.exe',
    stderr: 'No Python at C:\\path\\python.exe\n'
  };
  assert.strictEqual(
    extractExecError(errWithStderr),
    'No Python at C:\\path\\python.exe'
  );

  const errWithMessageOnly = {
    message: 'Command failed: "C:\\bin\\python.exe" -c "..."\nModuleNotFoundError: No module named \'sqlalchemy\''
  };
  assert.strictEqual(
    extractExecError(errWithMessageOnly),
    "ModuleNotFoundError: No module named 'sqlalchemy'"
  );
});

// 7. Caching behavior: cached result is identical and does not return undefined reason
await test('Cached detection returns identical result without returning undefined', async () => {
  resetSqlalchemyCache();
  const res1 = await checkSqlalchemyAvailability();
  assert.notStrictEqual(res1.available, undefined);
  if (!res1.available) {
    assert.strictEqual(typeof res1.reason, 'string');
    assert.ok(res1.reason.length > 0);
    assert.notStrictEqual(res1.reason, 'undefined');
  } else {
    assert.strictEqual(typeof res1.pythonBin, 'string');
  }

  // Second call must hit cache
  const res2 = await checkSqlalchemyAvailability();
  assert.strictEqual(res2.available, res1.available);
  assert.strictEqual(res2.pythonBin, res1.pythonBin);
  assert.strictEqual(res2.reason, res1.reason);
});

// 8. resetSqlalchemyCache properly resets cached state
await test('resetSqlalchemyCache properly resets cache', async () => {
  resetSqlalchemyCache();
  const res = await checkSqlalchemyAvailability({ skipSqlalchemy: true });
  assert.strictEqual(res.available, false);
  assert.strictEqual(res.reason, 'skipped_by_option');

  resetSqlalchemyCache();
  // Next call should run full check, not return skipped_by_option
  const resFull = await checkSqlalchemyAvailability();
  assert.notStrictEqual(resFull.reason, 'skipped_by_option');
});

console.log('\n====================================================');
console.log(`Results: ${passed}/${total} Windows Python resolution tests passed.`);
console.log('====================================================\n');

if (passed !== total) {
  process.exit(1);
}
