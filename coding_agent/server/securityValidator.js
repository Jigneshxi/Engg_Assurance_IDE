import path from 'path';

/**
 * Phase 8 Security & AI Governance Gate
 *
 * Provides:
 * 1. High-precision credential and secret scanning (DB URIs, API keys, JWT secrets, private keys).
 * 2. Static AST / sink analysis to detect forbidden execution sinks (eval, exec, os.system, subprocess with shell=True, dangerouslySetInnerHTML).
 * 3. Path traversal and command injection boundary enforcement.
 * 4. Zero-leakage secret redaction engine for logs, prompts, failure telemetry, and reports.
 */

export const SECURITY_DEFECT_CODES = Object.freeze({
  CREDENTIALS_EXPOSED: 'DB001',
  SECURITY_FORBIDDEN_SINK: 'SEC_SINK001',
  SECURITY_SECRET_LEAK: 'SEC_LEAK001',
  SECURITY_PATH_TRAVERSAL: 'SEC_TRAV001'
});

/**
 * Redacts sensitive credentials, API keys, tokens, and private keys from strings
 * so secrets never leak into telemetry, logs, prompts, or reports.
 */
export function redactSecret(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\bAIza[a-zA-Z0-9_-]{20,}\b/g, '[REDACTED]')
    .replace(/\bgsk_[a-zA-Z0-9_-]{20,}\b/g, '[REDACTED]')
    .replace(/\bsk-or-v1-[a-zA-Z0-9_-]{20,}\b/g, '[REDACTED]')
    // 1. Redact password in connection URIs (e.g. postgresql://user:secret@host -> postgresql://user:***@host)
    .replace(/(:\/\/[a-zA-Z0-9_.\-%]+):([^@\s/]+)@/g, '$1:***@')
    // 2. Redact password assignments (e.g. DB_PASSWORD = '...')
    .replace(/(\b(?:DB_PASSWORD|DATABASE_PASSWORD|POSTGRES_PASSWORD|MYSQL_PWD|DB_PASS|DATABASE_PASS|PASSWORD)\s*=\s*['"])([^'"]+)(['"])/gi, '$1***$3')
    // 3. Redact secret & key assignments (JWT_SECRET, SECRET_KEY, API_KEY, etc.)
    .replace(/(\b(?:SECRET_KEY|JWT_SECRET|API_KEY|APP_SECRET|AUTH_SECRET|PRIVATE_KEY)\s*=\s*['"])([^'"]+)(['"])/gi, '$1***$3')
    // 4. Redact OpenAI API keys (sk-... or sk-proj-...)
    .replace(/\b(sk-(?:proj-)?[a-zA-Z0-9_-]{8})[a-zA-Z0-9_-]+/gi, '$1***')
    // 5. Redact AWS Access Key IDs
    .replace(/\b(AKIA[0-9A-Z]{4})[0-9A-Z]{12}\b/g, '$1************')
    // 6. Redact GitHub Tokens
    .replace(/\b(ghp_[a-zA-Z0-9]{4})[a-zA-Z0-9]{32}\b/g, '$1********************************')
    .replace(/\b(github_pat_[a-zA-Z0-9_]{4})[a-zA-Z0-9_]{20,}\b/g, '$1********************')
    // 7. Redact Stripe live keys
    .replace(/\b(sk_live_[a-zA-Z0-9]{4})[a-zA-Z0-9]{20,}\b/g, '$1********************')
    // 8. Redact Private Key blocks
    .replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----');
}

/**
 * Scans a file for hardcoded database credentials, tokens, API keys, and private keys.
 * Distinguishes safe configuration (env lookups, local SQLite paths) from actual credentials.
 */
export function scanForCredentials(fileObj) {
  const defects = [];
  if (!fileObj || !fileObj.content) return defects;
  if (fileObj.path && (fileObj.path.endsWith('alembic.ini') || fileObj.path.endsWith('docker-compose.yml') || fileObj.path.endsWith('.env.example'))) return defects;

  const lines = fileObj.content.split('\n');

  // Regex matching connection URIs that explicitly embed user:password
  const uriRegex = /(postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|mongodb(?:\+srv)?|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/([a-zA-Z0-9_.\-%]+):([a-zA-Z0-9_.\-%]+)@/i;
  const documentationPlaceholderUriRegex = /(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?):\/\/(?:user|username):(?:password|your_password)@(?:host|localhost|127\.0\.0\.1)(?::(?:port|\d{1,5}))?\/(?:database|dbname|db|test_db|testdb)(?=$|[\s'"`),;])/i;
  const isDocumentation = fileObj.path && /\.(?:md|mdx|rst|txt)$/i.test(fileObj.path);

  // Regex matching direct hardcoded credential variable assignments with string literals >= 2 chars
  const varRegex = /\b(DB_PASSWORD|DATABASE_PASSWORD|POSTGRES_PASSWORD|MYSQL_PWD|DB_PASS|DATABASE_PASS)\s*=\s*(['"][^'"]{2,}['"])/i;

  // Regex matching secret keys / JWT secrets / API keys
  const secretKeyRegex = /\b(JWT_SECRET|SECRET_KEY|API_KEY|APP_SECRET|AUTH_SECRET)\s*=\s*(['"][^'"]{6,}['"])/i;

  // Regex matching live API tokens
  const tokenRegex = /\b(AIza[a-zA-Z0-9_-]{20,}|gsk_[a-zA-Z0-9_-]{20,}|sk-(?:proj-)?[a-zA-Z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|sk_live_[a-zA-Z0-9]{24})\b/;

  // Check for embedded private key
  const hasPrivateKey = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(fileObj.content);
  if (hasPrivateKey && !isDocumentation) {
    defects.push({
      code: SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED,
      validator: 'security_governance',
      severity: 'CRITICAL',
      file: fileObj.path,
      message: `${fileObj.path} contains an embedded private key.`,
      locations: [{ line: 1, column: 1 }],
      evidence: '-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----',
      remediation: 'Load private keys securely from environment variables, secret managers, or key vaults.'
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comment lines that document generic driver formats without literal secrets
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      if (trimmed.includes('driver://') || trimmed.includes('user:password@localhost') || trimmed.includes('username:password@')) {
        continue;
      }
    }

    // 1. Connection string with embedded password
    const uriMatch = rawLine.match(uriRegex);
    if (uriMatch) {
      if (isDocumentation && documentationPlaceholderUriRegex.test(rawLine)) continue;

      const col = rawLine.indexOf(uriMatch[0]) + 1;
      const redactedEvidence = redactSecret(trimmed);
      defects.push({
        code: SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED,
        validator: 'database_credentials',
        severity: 'HIGH',
        file: fileObj.path,
        message: `${fileObj.path} contains hardcoded database credentials.`,
        locations: [{ line: i + 1, column: col }],
        evidence: redactedEvidence,
        remediation: 'Load database credentials from environment/configuration (e.g. os.getenv("DATABASE_URL") or process.env.DATABASE_URL).'
      });
      continue;
    }

    // 2. Direct hardcoded password variable assignments
    const varMatch = rawLine.match(varRegex);
    if (varMatch) {
      const col = rawLine.indexOf(varMatch[0]) + 1;
      const redactedEvidence = redactSecret(trimmed);
      defects.push({
        code: SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED,
        validator: 'database_credentials',
        severity: 'HIGH',
        file: fileObj.path,
        message: `${fileObj.path} contains hardcoded database credentials in variable ${varMatch[1]}.`,
        locations: [{ line: i + 1, column: col }],
        evidence: redactedEvidence,
        remediation: `Load ${varMatch[1]} from environment variables (e.g. os.getenv("${varMatch[1]}")) instead of hardcoding.`
      });
      continue;
    }

    // 3. Hardcoded secret keys & tokens (excluding documentation and comment examples)
    if (!isDocumentation && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      const tokMatch = rawLine.match(tokenRegex);
      if (tokMatch) {
        const col = rawLine.indexOf(tokMatch[0]) + 1;
        defects.push({
          code: SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED,
          validator: 'security_governance',
          severity: 'CRITICAL',
          file: fileObj.path,
          message: `${fileObj.path} contains hardcoded API key / access token.`,
          locations: [{ line: i + 1, column: col }],
          evidence: redactSecret(trimmed),
          remediation: 'Load access tokens and API keys from environment variables (e.g. os.getenv or process.env).'
        });
        continue;
      }

      const secMatch = rawLine.match(secretKeyRegex);
      if (secMatch) {
        if (!rawLine.includes('os.getenv') && !rawLine.includes('process.env') && !rawLine.includes('your-secret-key-here')) {
          const col = rawLine.indexOf(secMatch[0]) + 1;
          defects.push({
            code: SECURITY_DEFECT_CODES.CREDENTIALS_EXPOSED,
            validator: 'security_governance',
            severity: 'HIGH',
            file: fileObj.path,
            line: i + 1,
            hint: 'Secret keys and tokens must not use hardcoded insecure placeholder defaults in code; load them strictly from environment variables without hardcoded secrets.',
            message: `${fileObj.path} contains hardcoded secret in ${secMatch[1]}.`,
            locations: [{ line: i + 1, column: col }],
            evidence: redactSecret(trimmed),
            remediation: `Load ${secMatch[1]} from environment variables instead of hardcoding.`
          });
        }
      }

      // Check for placeholder authentication tokens (e.g. YOUR_ACCESS_TOKEN, test_token, fake_token, dummy_token)
      const isTestFile = fileObj.path && (/(?:\/|^)(?:tests?|__tests?__)\//i.test(fileObj.path) || /_test\.[jt]sx?$|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|test_[a-zA-Z0-9_]+\.py$/.test(fileObj.path));
      if (!isTestFile) {
        const placeholderTokenRegex = /['"](YOUR_ACCESS_TOKEN|YOUR_TOKEN|fake-token|test-token|fake_token|test_token|dummy_token|mock_token|fake_jwt_token)['"]/i;
        const placeholderMatch = rawLine.match(placeholderTokenRegex);
        if (placeholderMatch) {
          const col = rawLine.indexOf(placeholderMatch[0]) + 1;
          defects.push({
            code: 'HARDCODED_AUTH_TOKEN',
            validator: 'security_governance',
            severity: 'HIGH',
            file: fileObj.path,
            line: i + 1,
            hint: 'Placeholder tokens like YOUR_ACCESS_TOKEN, fake_token, and test_token are forbidden; generate signed JWT tokens dynamically.',
            message: `${fileObj.path} contains hardcoded placeholder authentication token: '${placeholderMatch[1]}'. Real signed JWT tokens are required.`,
            locations: [{ line: i + 1, column: col }],
            evidence: redactSecret(trimmed),
            remediation: 'Generate authentic signed JWT tokens using create_access_token() instead of hardcoded placeholder tokens.'
          });
        }
      }

      // Rule 3: Catch insecure hardcoded secret defaults inside os.getenv or direct strings
      const insecureDefaultRegex = /(?:SECRET_KEY|JWT_SECRET|API_KEY|PASSWORD|AUTH_SECRET)\s*=\s*(?:os\.(?:getenv|environ\.get)\s*\([^)]*,\s*|process\.env\.[A-Z_]+\s*\|\|\s*)?['"](your_secret_key|secret|secret_key|your-secret-key|your_jwt_secret|quickcart-production-secret-key-change-in-env|change-this-secret|test_secret|placeholder|supersecret|7b8f9e0a1c2d3e4f5a6b7c8d9e0f1a2b)['"]/i;
      const insecureDefaultMatch = rawLine.match(insecureDefaultRegex);
      if (insecureDefaultMatch && !isTestFile) {
        const col = rawLine.indexOf(insecureDefaultMatch[0]) + 1;
        defects.push({
          code: 'HARDCODED_SECRET_DEFAULT',
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          hint: 'Secret keys and tokens must not use hardcoded insecure placeholder defaults in code; load them strictly from environment variables without hardcoded secrets.',
          message: `${fileObj.path} uses hardcoded placeholder/insecure secret default: '${insecureDefaultMatch[1]}'`,
          locations: [{ line: i + 1, column: col }],
          evidence: redactSecret(trimmed),
          remediation: 'Load secrets exclusively from environment variables with no hardcoded fallback value.'
        });
      }
    }
  }

  return defects;
}

/**
 * Scans code for forbidden dynamic execution sinks:
 * - Python: eval, exec, os.system, os.popen, subprocess with shell=True
 * - JavaScript/TypeScript: eval, new Function, dangerouslySetInnerHTML
 */
export function scanForSecuritySinks(fileObj) {
  const defects = [];
  if (!fileObj || !fileObj.content) return defects;
  const isDoc = fileObj.path && /\.(?:md|mdx|rst|txt)$/i.test(fileObj.path);
  if (isDoc) return defects;

  const lines = fileObj.content.split('\n');
  const isPython = fileObj.path && fileObj.path.endsWith('.py');
  const isJsTs = fileObj.path && /\.[jt]sx?$/i.test(fileObj.path);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comment lines
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    if (isPython) {
      // 1. eval()
      if (/\beval\s*\(/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'eval',
          message: `Forbidden execution sink detected: eval() in ${fileObj.path}:${i + 1}. Arbitrary code evaluation is prohibited.`,
          remediation: 'Replace eval() with safe parsing (e.g. ast.literal_eval or explicit dictionary lookup).'
        });
      }

      // 2. exec()
      if (/\bexec\s*\(/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'exec',
          message: `Forbidden execution sink detected: exec() in ${fileObj.path}:${i + 1}. Arbitrary code execution is prohibited.`,
          remediation: 'Refactor dynamic execution to use static classes, functions, or registries.'
        });
      }

      // 3. os.system() and os.popen()
      if (/\bos\.system\s*\(/.test(trimmed) || /\bos\.popen\s*\(/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'os.system',
          message: `Forbidden execution sink detected: os.system/popen in ${fileObj.path}:${i + 1}. Command injection risk.`,
          remediation: 'Use subprocess.run with argument array (shell=False) and validate input parameters.'
        });
      }

      // 4. subprocess with shell=True
      if (/\bsubprocess\.(?:Popen|run|call|check_output|check_call)\s*\([^)]*shell\s*=\s*True/i.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'subprocess.shell',
          message: `Forbidden execution sink detected: subprocess with shell=True in ${fileObj.path}:${i + 1}.`,
          remediation: 'Pass command and arguments as a list with shell=False.'
        });
      }
    }

    if (isJsTs) {
      // 1. eval()
      if (/\beval\s*\(/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'eval',
          message: `Forbidden execution sink detected: eval() in ${fileObj.path}:${i + 1}.`,
          remediation: 'Eliminate eval(); use JSON.parse() or typed schemas instead.'
        });
      }

      // 2. new Function()
      if (/\bnew\s+Function\s*\(/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'new Function',
          message: `Forbidden execution sink detected: new Function() in ${fileObj.path}:${i + 1}.`,
          remediation: 'Replace dynamic function construction with static handlers.'
        });
      }

      // 3. dangerouslySetInnerHTML
      if (/dangerouslySetInnerHTML\s*=\s*\{/.test(trimmed)) {
        defects.push({
          code: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
          validator: 'security_governance',
          severity: 'HIGH',
          file: fileObj.path,
          line: i + 1,
          sink: 'dangerouslySetInnerHTML',
          message: `Forbidden execution sink detected: dangerouslySetInnerHTML in ${fileObj.path}:${i + 1}. Cross-site scripting (XSS) risk.`,
          remediation: 'Render standard React children or sanitize content using DOMPurify before rendering.'
        });
      }
    }
  }

  return defects;
}

/**
 * Comprehensive Security Gate: checks path traversal, credentials/secrets, and execution sinks.
 */
export function validateSecurityGate(fileObj) {
  const defects = [];
  const errors = [];

  if (!fileObj || !fileObj.path) {
    return { isValid: false, defects: [{ code: 'SEC_ERR', message: 'Missing file object or path.' }], errors: ['Missing file object or path.'] };
  }

  // 1. Path Traversal Guard
  const normPath = path.normalize(fileObj.path);
  if (normPath.startsWith('..') || path.isAbsolute(fileObj.path) || /\.\.[/\\]/.test(fileObj.path)) {
    const err = `Security Violation: Path traversal detected in ${fileObj.path}`;
    errors.push(err);
    defects.push({
      code: SECURITY_DEFECT_CODES.SECURITY_PATH_TRAVERSAL,
      validator: 'security_governance',
      severity: 'CRITICAL',
      file: fileObj.path,
      message: err
    });
  }

  // 2. Credential & Secret Scanner
  const credDefects = scanForCredentials(fileObj);
  defects.push(...credDefects);
  credDefects.forEach(d => errors.push(redactSecret(d.message)));

  // 3. Forbidden Sink Scanner
  const sinkDefects = scanForSecuritySinks(fileObj);
  defects.push(...sinkDefects);
  sinkDefects.forEach(d => errors.push(d.message));

  return {
    isValid: errors.length === 0,
    defects,
    errors
  };
}
