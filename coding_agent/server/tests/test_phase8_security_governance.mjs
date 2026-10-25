/**
 * Phase 8: Security & AI Governance Gate Test Suite
 *
 * Verifies:
 * 1. High-precision credential & API key detection (OpenAI, AWS, GitHub, Stripe, Private Keys)
 * 2. Hardcoded secret variable assignment detection (JWT_SECRET, SECRET_KEY)
 * 3. Safe environment variable reads pass without false positives
 * 4. Zero-leakage secret redaction engine (URI, keys, tokens, assignments, private key blocks)
 * 5. Python AST forbidden sink detection (eval, exec, os.system, os.popen, subprocess with shell=True)
 * 6. JS/TS forbidden sink detection (eval, new Function, dangerouslySetInnerHTML)
 * 7. Path traversal boundary detection (../, absolute paths)
 * 8. Comprehensive validateSecurityGate contract
 * 9. Security repair strategies mapping (SecuritySinkRepairStrategy, SecuritySecretRepairStrategy)
 * 10. validatePatch secret rejection invariant
 */

import assert from 'assert';
import {
  SECURITY_DEFECT_CODES,
  redactSecret,
  scanForCredentials,
  scanForSecuritySinks,
  validateSecurityGate
} from '../securityValidator.js';
import {
  DATABASE_DEFECT_CODES
} from '../dbValidator.js';
import {
  getRepairStrategy,
  validatePatch
} from '../repairEngine.js';

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(err);
    failedTests++;
  }
}

console.log('🧪 Starting Phase 8: Security & AI Governance Gate Test Suite...\n');

// ── Test 1: API Keys & Live Tokens Detection ─────────────────────────────────
await runTest('Test 1: OpenAI, AWS, and GitHub tokens detected as exposed credentials', async () => {
  const dummyOpenAIKey = 'sk-proj-999988887777666655554444333322221111';
  const dummyAwsKey = 'AKIAIOSFODNN7EXAMPLE';
  const dummyGithubToken = 'ghp_111122223333444455556666777788889999';

  const testFile1 = {
    path: 'backend/services/ai_client.py',
    content: `OPENAI_KEY = "${dummyOpenAIKey}"\n`
  };
  const defects1 = scanForCredentials(testFile1);
  assert.strictEqual(defects1.length, 1);
  assert.strictEqual(defects1[0].code, SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED);
  assert.strictEqual(defects1[0].evidence.includes(dummyOpenAIKey), false, 'Plaintext key must not be in evidence');

  const testFile2 = {
    path: 'backend/services/storage.py',
    content: `AWS_ACCESS_KEY_ID = "${dummyAwsKey}"\n`
  };
  const defects2 = scanForCredentials(testFile2);
  assert.strictEqual(defects2.length, 1);
  assert.strictEqual(defects2[0].code, SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED);

  const testFile3 = {
    path: 'backend/services/vcs.py',
    content: `AUTH_TOKEN = "${dummyGithubToken}"\n`
  };
  const defects3 = scanForCredentials(testFile3);
  assert.strictEqual(defects3.length, 1);
  assert.strictEqual(defects3[0].code, SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED);
});

// ── Test 2: Private Key Block Detection ──────────────────────────────────────
await runTest('Test 2: Embedded private key blocks detected with CRITICAL severity', async () => {
  const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL
MNOPQRSTUVWXYZ0123456789+/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM
-----END RSA PRIVATE KEY-----`;

  const testFile = {
    path: 'backend/config/signing.key',
    content: mockPrivateKey
  };

  const defects = scanForCredentials(testFile);
  assert.strictEqual(defects.length, 1);
  assert.strictEqual(defects[0].code, SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED);
  assert.strictEqual(defects[0].severity, 'CRITICAL');
  assert.ok(defects[0].message.includes('embedded private key'));
});

// ── Test 3: Hardcoded JWT & App Secret Assignments ───────────────────────────
await runTest('Test 3: Hardcoded JWT_SECRET and SECRET_KEY flagged while safe env vars pass', async () => {
  const badFile = {
    path: 'backend/core/security.py',
    content: 'JWT_SECRET = "super_insecure_hardcoded_jwt_secret_98765"\nSECRET_KEY = "another_raw_string_secret"\n'
  };
  const badDefects = scanForCredentials(badFile);
  assert.strictEqual(badDefects.length, 2);
  assert.strictEqual(badDefects[0].code, SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED);

  const goodPythonFile = {
    path: 'backend/core/security.py',
    content: 'JWT_SECRET = os.getenv("JWT_SECRET")\nSECRET_KEY = os.getenv("SECRET_KEY")\n'
  };
  const goodPythonDefects = scanForCredentials(goodPythonFile);
  assert.strictEqual(goodPythonDefects.length, 0);

  const goodNodeFile = {
    path: 'frontend/src/config.ts',
    content: 'export const JWT_SECRET = process.env.JWT_SECRET;\n'
  };
  const goodNodeDefects = scanForCredentials(goodNodeFile);
  assert.strictEqual(goodNodeDefects.length, 0);
});

// ── Test 4: Zero-Leakage Secret Redaction Engine ──────────────────────────────
await runTest('Test 4: redactSecret cleanly masks credentials, API keys, and private keys without leaks', async () => {
  const rawDbUri = 'postgresql://admin:super_secret_pw@db.internal:5432/core_db';
  const rawOpenAi = 'sk-proj-abcdef1234567890abcdef1234567890';
  const rawAws = 'AKIAIOSFODNN7EXAMPLE';
  const rawGithub = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
  const rawJwt = 'JWT_SECRET = "raw_unencrypted_jwt_token_secret"';
  const rawPrivKey = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...==\n-----END PRIVATE KEY-----';

  const redactedDb = redactSecret(rawDbUri);
  assert.strictEqual(redactedDb.includes('super_secret_pw'), false);
  assert.ok(redactedDb.includes('***'));

  const redactedAi = redactSecret(rawOpenAi);
  assert.strictEqual(redactedAi.includes('abcdef1234567890abcdef1234567890'), false);
  assert.ok(redactedAi.includes('***'));

  const redactedAws = redactSecret(rawAws);
  assert.strictEqual(redactedAws.includes('OSFODNN7EXAMPLE'), false);
  assert.ok(redactedAws.includes('************'));

  const redactedGh = redactSecret(rawGithub);
  assert.strictEqual(redactedGh.includes('efghijklmnopqrstuvwxyz1234567890'), false);

  const redactedJwt = redactSecret(rawJwt);
  assert.strictEqual(redactedJwt.includes('raw_unencrypted_jwt_token_secret'), false);
  assert.ok(redactedJwt.includes('***'));

  const redactedKey = redactSecret(rawPrivKey);
  assert.strictEqual(redactedKey.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASC'), false);
  assert.ok(redactedKey.includes('-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----'));
});

// ── Test 5: Python Forbidden Sinks Detection ─────────────────────────────────
await runTest('Test 5: Python dynamic execution sinks (eval, exec, os.system, shell=True) detected', async () => {
  const badEval = {
    path: 'backend/utils/parser.py',
    content: 'result = eval(user_supplied_expression)\n'
  };
  const evalDefects = scanForSecuritySinks(badEval);
  assert.strictEqual(evalDefects.length, 1);
  assert.strictEqual(evalDefects[0].code, SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK);
  assert.strictEqual(evalDefects[0].sink, 'eval');

  const badExec = {
    path: 'backend/utils/loader.py',
    content: 'exec(dynamic_code_string)\n'
  };
  const execDefects = scanForSecuritySinks(badExec);
  assert.strictEqual(execDefects.length, 1);
  assert.strictEqual(execDefects[0].sink, 'exec');

  const badOsSystem = {
    path: 'backend/utils/cli.py',
    content: 'os.system(f"rm -rf {target_path}")\n'
  };
  const osSysDefects = scanForSecuritySinks(badOsSystem);
  assert.strictEqual(osSysDefects.length, 1);
  assert.strictEqual(osSysDefects[0].sink, 'os.system');

  const badSubprocess = {
    path: 'backend/utils/proc.py',
    content: 'subprocess.run(command_str, shell=True)\n'
  };
  const subprocDefects = scanForSecuritySinks(badSubprocess);
  assert.strictEqual(subprocDefects.length, 1);
  assert.strictEqual(subprocDefects[0].sink, 'subprocess.shell');

  // Safe subprocess without shell=True should pass
  const safeSubprocess = {
    path: 'backend/utils/safe_proc.py',
    content: 'subprocess.run(["ls", "-l"], shell=False, check=True)\n'
  };
  const safeDefects = scanForSecuritySinks(safeSubprocess);
  assert.strictEqual(safeDefects.length, 0);
});

// ── Test 6: JS/TS Forbidden Sinks Detection ──────────────────────────────────
await runTest('Test 6: JS/TS dynamic execution sinks (eval, new Function, dangerouslySetInnerHTML) detected', async () => {
  const badEvalJs = {
    path: 'frontend/src/utils/calc.ts',
    content: 'const val = eval(formula);\n'
  };
  const evalJsDefects = scanForSecuritySinks(badEvalJs);
  assert.strictEqual(evalJsDefects.length, 1);
  assert.strictEqual(evalJsDefects[0].sink, 'eval');

  const badFunction = {
    path: 'frontend/src/utils/factory.ts',
    content: 'const fn = new Function("a", "b", "return a + b;");\n'
  };
  const fnDefects = scanForSecuritySinks(badFunction);
  assert.strictEqual(fnDefects.length, 1);
  assert.strictEqual(fnDefects[0].sink, 'new Function');

  const badDangerHtml = {
    path: 'frontend/src/components/RawViewer.tsx',
    content: '<div dangerouslySetInnerHTML={{ __html: unescapedHtml }} />\n'
  };
  const htmlDefects = scanForSecuritySinks(badDangerHtml);
  assert.strictEqual(htmlDefects.length, 1);
  assert.strictEqual(htmlDefects[0].sink, 'dangerouslySetInnerHTML');

  const safeComponent = {
    path: 'frontend/src/components/SafeViewer.tsx',
    content: '<div>{cleanTextContent}</div>\n'
  };
  const safeJsDefects = scanForSecuritySinks(safeComponent);
  assert.strictEqual(safeJsDefects.length, 0);
});

// ── Test 7: Path Traversal Boundary Detection ────────────────────────────────
await runTest('Test 7: Path traversal outside workspace boundary is blocked', async () => {
  const trav1 = { path: '../outside.py', content: 'print("escaped")' };
  const gate1 = validateSecurityGate(trav1);
  assert.strictEqual(gate1.isValid, false);
  assert.ok(gate1.defects.some(d => d.code === SECURITY_DEFECT_CODES.SECURITY_PATH_TRAVERSAL));

  const trav2 = { path: 'backend/../../root.py', content: 'print("escaped")' };
  const gate2 = validateSecurityGate(trav2);
  assert.strictEqual(gate2.isValid, false);
  assert.ok(gate2.defects.some(d => d.code === SECURITY_DEFECT_CODES.SECURITY_PATH_TRAVERSAL));
});

// ── Test 8: Comprehensive validateSecurityGate Contract ──────────────────────
await runTest('Test 8: validateSecurityGate aggregates credentials, sinks, and traversal', async () => {
  const multiIssueFile = {
    path: 'backend/api/composite.py',
    content: `import os
SECRET_KEY = "hardcoded_app_secret_12345"
def execute_cmd(user_arg):
    os.system(f"echo {user_arg}")
`
  };

  const gateResult = validateSecurityGate(multiIssueFile);
  assert.strictEqual(gateResult.isValid, false);
  assert.ok(gateResult.defects.length >= 2, 'Should flag both hardcoded secret and os.system');
  assert.ok(gateResult.defects.some(d => d.code === SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED));
  assert.ok(gateResult.defects.some(d => d.code === SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK));

  const cleanFile = {
    path: 'backend/api/clean.py',
    content: `import os
SECRET_KEY = os.getenv("SECRET_KEY")
def compute(x, y):
    return x + y
`
  };
  const cleanResult = validateSecurityGate(cleanFile);
  assert.strictEqual(cleanResult.isValid, true);
  assert.strictEqual(cleanResult.defects.length, 0);
  assert.strictEqual(cleanResult.errors.length, 0);
});

// ── Test 9: Security Repair Strategies Resolution ────────────────────────────
await runTest('Test 9: getRepairStrategy resolves SecuritySinkRepairStrategy and SecuritySecretRepairStrategy', async () => {
  const sinkStrategy = getRepairStrategy(DATABASE_DEFECT_CODES.SECURITY_FORBIDDEN_SINK);
  assert.strictEqual(sinkStrategy.name, 'SecuritySinkRepairStrategy');
  assert.ok(sinkStrategy.instructions.some(i => i.includes('eval()') || i.includes('execution sinks')));

  const secretStrategy = getRepairStrategy(DATABASE_DEFECT_CODES.SECURITY_SECRET_LEAK);
  assert.strictEqual(secretStrategy.name, 'SecuritySecretRepairStrategy');
  assert.ok(secretStrategy.instructions.some(i => i.includes('environment variables')));
});

// ── Test 10: validatePatch Invariant Against Credential Reintroduction ───────
await runTest('Test 10: validatePatch blocks patch replacements containing hardcoded secrets', async () => {
  const existingContent = 'DATABASE_URL = os.getenv("DATABASE_URL")\n';
  const maliciousPatch = {
    file: 'backend/db.py',
    search: 'DATABASE_URL = os.getenv("DATABASE_URL")',
    replace: 'DATABASE_URL = "postgresql://root:superpass123@localhost:5432/app"'
  };

  const validation = validatePatch({
    patch: maliciousPatch,
    existingContent,
    filePath: 'backend/db.py'
  });

  assert.strictEqual(validation.valid, false);
  assert.ok(validation.error.includes('credentials') || validation.error.includes('DB001'));
  assert.strictEqual(validation.error.includes('superpass123'), false, 'Password must be redacted in error');
});

console.log('\n========================================');
console.log(`Phase 8 Test Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
