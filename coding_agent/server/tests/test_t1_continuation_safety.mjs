import assert from 'node:assert';
import test from 'node:test';
import {
  mergeFileContinuation,
  normalizeGluedCodeStatements,
  verifyMergedCodeSyntax
} from '../orchestrator.js';

test('T1.1: Basefrom stitch prevention - complete Python import is never concatenated mid-token', () => {
  const accumulatedRaw = `<file path="backend/app/db/base.py">\nfrom app.db.database import Base`;
  const nextChunk = `from app.models.user import User\n</file>`;

  const result = mergeFileContinuation(accumulatedRaw, nextChunk, 'backend/app/db/base.py');
  
  assert.strictEqual(result.merged.includes('Basefrom'), false, 'Glued "Basefrom" must never appear');
  assert.match(result.merged, /from app\.db\.database import Base\r?\nfrom app\.models\.user import User/, 'Both import statements must be separated by a newline');
  
  const innerCode = result.merged.replace(/^[\s\S]*?<file\s+path=["'][^"']+["']>\r?\n?/i, '').replace(/\r?\n?<\/file>[\s\S]*$/i, '').trim();
  const syntaxCheck = verifyMergedCodeSyntax(innerCode, 'backend/app/db/base.py');
  assert.strictEqual(syntaxCheck.valid, true, `Merged Python code must be syntactically valid: ${syntaxCheck.reason}`);
});

test('T1.2: UsageLogfrom normalization - handles multiple consecutive glued statements', () => {
  const malformedInput = `from app.db.database import Basefrom app.models.user import User\nUsageLogfrom app.db.models import RateLimit, AuditLogfrom app.db.models import Alert`;
  const normalized = normalizeGluedCodeStatements(malformedInput, 'backend/app/db/base.py');

  assert.strictEqual(normalized.includes('Basefrom'), false, 'Glued "Basefrom" must be separated');
  assert.strictEqual(normalized.includes('UsageLogfrom'), false, 'Glued "UsageLogfrom" must be separated');
  assert.strictEqual(normalized.includes('AuditLogfrom'), false, 'Glued "AuditLogfrom" must be separated');
  assert.match(normalized, /from app\.models\.user import User\r?\nUsageLog/);
  assert.match(normalized, /from app\.db\.models import RateLimit, AuditLog\r?\nfrom app\.db\.models import Alert/);
});

test('T1.3: JSON cut mid-key cleanly merges into valid parseable JSON', () => {
  const accumulatedRaw = `<file path="backend/config.json">\n{\n  "project_id": "taskflow",\n  "con`;
  const nextChunk = `fig": {\n    "enabled": true\n  }\n}\n</file>`;

  const result = mergeFileContinuation(accumulatedRaw, nextChunk, 'backend/config.json');

  assert.strictEqual(result.completed, true, 'JSON continuation must complete');
  const innerCode = result.merged.replace(/^[\s\S]*?<file\s+path=["'][^"']+["']>\r?\n?/i, '').replace(/\r?\n?<\/file>[\s\S]*$/i, '').trim();
  
  const syntaxCheck = verifyMergedCodeSyntax(innerCode, 'backend/config.json');
  assert.strictEqual(syntaxCheck.valid, true, `Merged JSON must be valid: ${syntaxCheck.reason}`);
  const parsed = JSON.parse(innerCode);
  assert.strictEqual(parsed.config.enabled, true);
});

test('T1.4: Python AST verification catches syntax errors and permits valid syntax', () => {
  const validPython = `from app.db.database import Base\nfrom app.models.user import User\n\nclass User(Base):\n    __tablename__ = 'users'\n    id = 1\n`;
  const validCheck = verifyMergedCodeSyntax(validPython, 'backend/app/db/models.py');
  assert.strictEqual(validCheck.valid, true, `Valid Python must pass AST check: ${validCheck.reason}`);

  const invalidPython = `from app.db.database import Basefrom app.models.user import User\n`;
  const invalidCheck = verifyMergedCodeSyntax(invalidPython, 'backend/app/db/models.py');
  assert.strictEqual(invalidCheck.valid, false, 'Glued Python statement must fail verification');
});

test('T1.5: JS/TS statement continuation is newline-safe and prevents token glue', () => {
  const accumulatedRaw = `<file path="frontend/src/api/client.ts">\nimport axios from 'axios';\nexport const API_BASE = '/api';`;
  const nextChunk = `export async function getHealth() {\n  return axios.get('/health');\n}\n</file>`;

  const result = mergeFileContinuation(accumulatedRaw, nextChunk, 'frontend/src/api/client.ts');
  assert.strictEqual(result.merged.includes("';export"), false);
  assert.match(result.merged, /export const API_BASE = '\/api';\r?\nexport async function getHealth\(\)/);
  
  const innerCode = result.merged.replace(/^[\s\S]*?<file\s+path=["'][^"']+["']>\r?\n?/i, '').replace(/\r?\n?<\/file>[\s\S]*$/i, '').trim();
  const syntaxCheck = verifyMergedCodeSyntax(innerCode, 'frontend/src/api/client.ts');
  assert.strictEqual(syntaxCheck.valid, true);
});
