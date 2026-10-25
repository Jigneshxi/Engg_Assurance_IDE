import assert from 'node:assert';
import {
  validateSourceCompleteness,
  findLastStableSyntacticBoundary,
  mergeFileContinuation
} from '../orchestrator.js';

console.log('================================================');
console.log('   TEST S3: LANGUAGE-AWARE COMPLETENESS CHECKS  ');
console.log('================================================\n');

// --- TEST 1: Dockerfile with wildcard glob (/app/*) passes ---
console.log('--- TEST 1: Dockerfile with Wildcard COPY Passes ---');
{
  const validDockerfile = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app/*
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

  const result = validateSourceCompleteness(validDockerfile, 'backend/Dockerfile');
  assert.strictEqual(result.isComplete, true, 'Dockerfile with /app/* must NOT fail with unclosed multi-line comment');

  // Verify missing FROM fails
  const missingFrom = `WORKDIR /app\nCOPY . /app/*\nCMD ["python", "app.py"]\n`;
  const missingFromResult = validateSourceCompleteness(missingFrom, 'Dockerfile');
  assert.strictEqual(missingFromResult.isComplete, false, 'Dockerfile without FROM instruction must fail');
  assert.ok(missingFromResult.reason.includes('FROM'), 'Reason indicates missing FROM');

  // Verify cut instruction (trailing backslash) fails
  const cutInstruction = `FROM python:3.12\nRUN apt-get update && \\\n`;
  const cutResult = validateSourceCompleteness(cutInstruction, 'frontend/Dockerfile');
  assert.strictEqual(cutResult.isComplete, false, 'Dockerfile with trailing backslash must fail as incomplete');

  console.log('✅ PASS: Dockerfile correctly parsed with language-aware rules; wildcard /app/* passes.');
}

// --- TEST 2: 30% Rollback Threshold Enforced ---
console.log('\n--- TEST 2: Rollback Drops > 30% are Rejected ---');
{
  // Create a 10,000 character file where the stable boundary is at 5,000 characters (50% drop)
  const header = `import React from 'react';\n\n`;
  const blockA = `export const ComponentA = () => {\n  return <div>${'A'.repeat(4500)}</div>;\n};\n\n`;
  const blockB = `export const ComponentB = () => {\n  return <div>${'B'.repeat(4500)}</div>;\n`; // unclosed brace at end

  const totalContent = header + blockA + blockB;
  assert.ok(totalContent.length > 9000);

  // Rollback to ComponentA would drop ~50% of the file (> 30% threshold)
  const rollbackResult = findLastStableSyntacticBoundary(totalContent, 'frontend/src/App.tsx');
  assert.strictEqual(rollbackResult.rolledBack, false, 'findLastStableSyntacticBoundary must reject dropping > 30% of content');

  // Conversely, if a boundary drops only 10%, it should be accepted
  const smallDropBlockB = `export const ComponentB = () => {\n  return <div>${'B'.repeat(300)}</div>;\n`; // small truncated addition
  const contentSmallDrop = header + blockA + smallDropBlockB;
  const smallRollback = findLastStableSyntacticBoundary(contentSmallDrop, 'frontend/src/App.tsx');
  assert.strictEqual(smallRollback.rolledBack, true, 'Boundary dropping <= 30% is safely accepted');

  console.log('✅ PASS: Boundary rollback enforces 30% drop threshold, preventing massive file amputations.');
}

// --- TEST 3: Stalled Identical Continuation Detection ---
console.log('\n--- TEST 3: Identical-Size Continuations Detect Stall ---');
{
  const targetPath = 'backend/Dockerfile';
  const truncatedAccumulated = `<file path="backend/Dockerfile">\nFROM python:3.12\nWORKDIR /app\nRUN apt-get update && \\\n`;

  // LLM returns the exact same content wrapped in <file> tag (identical restart)
  const identicalRestart = `<file path="backend/Dockerfile">\nFROM python:3.12\nWORKDIR /app\nRUN apt-get update && \\\n</file>`;

  const stitchResult = mergeFileContinuation(truncatedAccumulated, identicalRestart, targetPath);
  assert.strictEqual(stitchResult.progress, false, 'Identical incomplete restart must report progress=false');
  assert.strictEqual(stitchResult.strategy, 'stalled_identical_restart', 'Strategy indicates stalled identical restart');

  console.log('✅ PASS: Identical-size continuations trigger stalled detection immediately.');
}

// --- TEST 4: Non-JS Files Never Parse Wildcards as Multi-Line Comments ---
console.log('\n--- TEST 4: Wildcard Globs in Shell and YAML Not Parsed as /* Comments ---');
{
  const bashScript = `#!/bin/bash\nrm -rf /tmp/*\nchown -R app:app /app/*\n`;
  const bashResult = validateSourceCompleteness(bashScript, 'scripts/cleanup.sh');
  assert.strictEqual(bashResult.isComplete, true, 'Bash script with /* globs must be complete');

  const yamlConfig = `version: "3.9"\nservices:\n  web:\n    command: rm -f /var/run/*\n`;
  const yamlResult = validateSourceCompleteness(yamlConfig, 'docker-compose.yml');
  assert.strictEqual(yamlResult.isComplete, true, 'YAML with /* globs must be complete');

  console.log('✅ PASS: /* comment rule applies strictly to JS/TS/CSS.');
}

console.log('\n================================================');
console.log('   ALL S3 COMPLETENESS & STALL TESTS PASSED!    ');
console.log('================================================\n');
