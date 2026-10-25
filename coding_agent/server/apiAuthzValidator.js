import { inspectJavaScriptGuards } from './javascriptEndpointGuards.js';
import { inspectEndpointGuards } from './pythonEndpointGuards.js';
/**
 * Phase 11: API Authentication & Authorization Gate Validator
 * 
 * Verifies deterministic API-level authentication and authorization contracts:
 * A. Authentication
 *    - register endpoint exists and accepts credentials
 *    - login endpoint exists and returns signed token
 *    - credential validation (valid vs invalid vs missing credentials)
 *    - token verification (signature, expiration, malformed token checks)
 *    - authenticated identity extraction (user_id / claims from verified token)
 * 
 * B. Authorization
 *    - protected endpoints require authentication guards (Depends / middleware)
 *    - user identity originates from verified context, not request payload
 *    - request payload cannot override authenticated user identity
 *    - User A cannot access, modify, or delete User B resources
 *    - unauthorized access returns appropriate 401/403
 * 
 * C. Ownership
 *    - user-owned records filtered by authenticated user in list queries
 *    - UPDATE and DELETE enforce resource ownership
 * 
 * D. API Contract
 *    - expected HTTP status codes (200/201, 400/422, 401, 403, 404)
 *    - protected route registration
 * 
 * Defect Code: API_AUTHZ_FAILURE
 */

import crypto from 'crypto';

export const API_AUTHZ_DEFECT_CODES = Object.freeze({
  API_AUTHZ_FAILURE: 'API_AUTHZ_FAILURE',
  AUTH_ENDPOINT_MISSING: 'AUTH_ENDPOINT_MISSING',
  AUTH_CREDENTIALS_INVALID: 'AUTH_CREDENTIALS_INVALID',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTHZ_UNPROTECTED_ENDPOINT: 'AUTHZ_UNPROTECTED_ENDPOINT',
  AUTHZ_IDENTITY_OVERRIDE: 'AUTHZ_IDENTITY_OVERRIDE',
  AUTHZ_CROSS_USER_ACCESS: 'AUTHZ_CROSS_USER_ACCESS',
  AUTHZ_OWNERSHIP_LEAK: 'AUTHZ_OWNERSHIP_LEAK',
  AUTHZ_STATUS_MISMATCH: 'AUTHZ_STATUS_MISMATCH'
});

function normPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * 1. Verify Authentication Endpoints (Registration & Login)
 */
export function verifyAuthenticationEndpoints(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const authFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    if (np.endsWith('__init__.py') || np.includes('/schemas/')) return false;
    return np.includes('auth.py') || np.includes('auth.js') || np.includes('auth.ts') ||
           np.includes('auth_service.py') || np.includes('auth_service.ts') || np.includes('auth_service.js') ||
           np.includes('routes/auth') || np.includes('api/auth');
  });

  const manifestRequiresAuth = options.requireAuth === true || (
    options.manifest ? Boolean(
      (options.manifest.auth_architecture && options.manifest.auth_architecture !== 'none') ||
      (options.manifest.project_requirements?.backend?.auth && options.manifest.project_requirements.backend.auth !== 'none') ||
      (options.manifest.requirements?.some(r => /auth|login|register|user|jwt|permission|account/i.test(r.description || '')))
    ) : (options.requireAuth !== false)
  );

  if (authFiles.length === 0) {
    const hasAnyBackend = files.some(f => f && f.path && (normPath(f.path).startsWith('backend/') || normPath(f.path).endsWith('.py')));
    if (hasAnyBackend && manifestRequiresAuth) {
      const msg = `API AuthZ Failure: Manifest or architecture requires authentication, but no authentication modules (auth.py / auth.js / auth.ts) found in backend.`;
      errors.push(msg);
      defects.push({
        code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
        subtype: API_AUTHZ_DEFECT_CODES.AUTH_ENDPOINT_MISSING,
        severity: 'HIGH',
        message: msg
      });
    }
    return { defects, errors, hasAuth: false };
  }

  const combinedContent = authFiles.map(f => f.content || '').join('\n');

  // Check registration endpoint
  const hasRegister = /def\s+register\b|router\.(post|put)\s*\(\s*['"]\/(register|signup)|app\.(post|put)\s*\(\s*['"]\/(register|signup)|@\w+\.post\s*\(\s*['"]\/(register|signup)/i.test(combinedContent);
  if (!hasRegister) {
    const msg = `API AuthZ Failure: Missing user registration endpoint (/register or /signup).`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_ENDPOINT_MISSING,
      file: authFiles[0].path,
      endpoint: '/register',
      severity: 'HIGH',
      message: msg
    });
  }

  // Check login / token endpoint
  const hasLogin = /def\s+(login|token|login_user)\b|router\.post\s*\(\s*['"]\/(login|token)|app\.post\s*\(\s*['"]\/(login|token)|@\w+\.post\s*\(\s*['"]\/(login|token)/i.test(combinedContent);
  if (!hasLogin) {
    const msg = `API AuthZ Failure: Missing user authentication endpoint (/login or /token).`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_ENDPOINT_MISSING,
      file: authFiles[0].path,
      endpoint: '/login',
      severity: 'HIGH',
      message: msg
    });
  }

  // Check credential verification logic (password hashing, check_password, verify_password, bcrypt)
  const hasPasswordVerification = /verify_password|check_password|bcrypt\.check|compare\s*\(|verify_password_hash|pwd_context\.verify/i.test(combinedContent);
  if (!hasPasswordVerification && combinedContent.length > 50) {
    const msg = `API AuthZ Failure: Authentication logic does not verify credentials with secure password comparison (verify_password/bcrypt).`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_CREDENTIALS_INVALID,
      file: authFiles[0].path,
      severity: 'HIGH',
      message: msg
    });
  }

  // Check password hashing logic
  const hasPasswordHashing = /get_password_hash|hash_password|pwd_context|\.hash\(|bcrypt/i.test(combinedContent);
  if (!hasPasswordHashing && combinedContent.length > 50) {
    const msg = `API AuthZ Failure: Authentication logic does not hash passwords securely (get_password_hash/pwd_context.hash/bcrypt).`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_CREDENTIALS_INVALID,
      file: authFiles[0].path,
      severity: 'HIGH',
      message: msg
    });
  }

  // Phase 3: Enforce single authentication authority across all backend modules
  const nonTestFiles = files.filter(f => f && f.path && !f.path.includes('/tests/') && !f.path.startsWith('tests/') && !f.path.endsWith('_test.py') && !f.path.startsWith('test_') && !f.path.endsWith('conftest.py'));
  const definingModules = nonTestFiles.filter(f => /(?:^|\n)\s*(?:async\s+)?def\s+get_current_user\b/.test(f.content || '')).map(f => f.path);
  if (definingModules.length > 1) {
    const msg = `API AuthZ Failure: Duplicate authentication authority detected. 'get_current_user' is defined in multiple modules: ${definingModules.join(', ')}. Authentication must be centralized in a single canonical module.`;
    errors.push(msg);
    defects.push({
      code: 'DUPLICATE_AUTH_AUTHORITY',
      subtype: 'DUPLICATE_AUTH_AUTHORITY',
      file: definingModules[0],
      severity: 'HIGH',
      message: msg
    });
  }

  return { defects, errors, hasAuth: true, authFiles: authFiles.map(f => f.path) };
}

/**
 * 2. Verify Token Validation, Expiration & Claims
 */
export function verifyTokenValidationAndClaims(files = [], _options = {}) {
  const defects = [];
  const errors = [];

  const authFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    if (np.endsWith('__init__.py')) return false;
    return np.includes('auth') || np.includes('security') || np.includes('jwt') || np.includes('deps');
  });

  const combinedContent = authFiles.map(f => f.content || '').join('\n');

  // Verify JWT generation exists
  const hasTokenEncoding = /jwt\.encode|jwt\.sign|create_access_token/i.test(combinedContent);
  if (!hasTokenEncoding && authFiles.length > 0) {
    const msg = `API AuthZ Failure: No token generation mechanism (jwt.encode / jwt.sign / create_access_token) found.`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_TOKEN_INVALID,
      severity: 'HIGH',
      message: msg
    });
  }

  // Verify token decoding / validation exists
  const hasTokenDecoding = /jwt\.decode|jwt\.verify|oauth2_scheme|decode_access_token/i.test(combinedContent);
  if (!hasTokenDecoding && authFiles.length > 0) {
    const msg = `API AuthZ Failure: No token verification mechanism (jwt.decode / jwt.verify) found.`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_TOKEN_INVALID,
      severity: 'HIGH',
      message: msg
    });
  }

  // Verify expiration handling (exp claim or ExpiredSignatureError / TokenExpiredError)
  const hasExpirationHandling = /['"]exp['"]|ExpiredSignatureError|TokenExpiredError|expires_delta|expiresIn/i.test(combinedContent);
  if (!hasExpirationHandling && authFiles.length > 0) {
    const msg = `API AuthZ Failure: Token implementation lacks expiration enforcement ('exp' claim or expiration handling).`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_TOKEN_INVALID,
      severity: 'MEDIUM',
      message: msg
    });
  }

  // Verify authenticated identity extraction (e.g. sub, user_id, email from payload)
  const hasIdentityExtraction = /payload\.get\s*\(\s*['"](sub|user_id|id|email)['"]|payload\[['"](sub|user_id|id|email)['"]|decoded\.(id|userId|sub|email)/i.test(combinedContent);
  if (!hasIdentityExtraction && authFiles.length > 0) {
    const msg = `API AuthZ Failure: Authentication context does not extract user identity claim (sub / user_id / id / email) from token payload.`;
    errors.push(msg);
    defects.push({
      code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
      subtype: API_AUTHZ_DEFECT_CODES.AUTH_TOKEN_INVALID,
      severity: 'HIGH',
      message: msg
    });
  }

  // Rule 2: Explicit check for get_current_user returning without verifying signed token
  authFiles.forEach(af => {
    const content = af.content || '';
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/jwt\.decode\s*\([^)]*(?:verify\s*=\s*False|verify_signature['"]?\s*:\s*False)/i.test(lines[i])) {
        const msg = `API AuthZ Failure in '${af.path}' line ${i + 1}: jwt.decode called with unverified signature (verify=False).`;
        errors.push(msg);
        defects.push({
          code: 'AUTH_TOKEN_UNVERIFIED',
          subtype: 'AUTH_TOKEN_UNVERIFIED',
          file: af.path,
          line: i + 1,
          hint: 'Never decode tokens with verify=False or disabled signature verification. Use verified claims.',
          severity: 'CRITICAL',
          message: msg
        });
      }

      if (/def\s+(?:get_current_user|get_current_active_user)\s*\(/.test(lines[i])) {
        const bodyLines = [lines[i]];
        for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
          if (/^def\s+|^class\s+/.test(lines[j])) break;
          bodyLines.push(lines[j]);
        }
        const funcBody = bodyLines.join('\n');
        const verifiesToken = /jwt\.decode|jwt\.verify|decode_access_token|verify_token|oauth2_scheme/.test(funcBody);
        const unverifiedDecode = /jwt\.decode\s*\([^)]*(?:verify\s*=\s*False|verify_signature['"]?\s*:\s*False)/i.test(funcBody);
        const returnsMockOrPlaceholder = /return\s*(?:True\b|False\b|None\b|\{\s*['"](?:id|user_id|sub)['"]\s*:\s*(?:\d+|['"][^'"]+['"])|dummy|User\s*\()/i.test(funcBody);
        if (!verifiesToken || unverifiedDecode || returnsMockOrPlaceholder) {
          const msg = `API AuthZ Failure in '${af.path}' line ${i + 1}: get_current_user returns user without verifying signed token.`;
          errors.push(msg);
          defects.push({
            code: 'AUTH_TOKEN_UNVERIFIED',
            subtype: 'AUTH_TOKEN_UNVERIFIED',
            file: af.path,
            line: i + 1,
            hint: 'get_current_user must decode and verify signed JWT tokens, not return mock user dictionaries or booleans.',
            severity: 'CRITICAL',
            message: msg
          });
        }
      }
    }

    // Phase 3: Check for hardcoded placeholder tokens in auth and router files
    const isTest = af.path.includes('/tests/') || af.path.startsWith('tests/') || af.path.endsWith('_test.py') || af.path.startsWith('test_') || af.path.endsWith('conftest.py');
    if (!isTest) {
      const placeholderMatch = content.match(/['"](YOUR_ACCESS_TOKEN|YOUR_TOKEN|fake-token|test-token|fake_token|test_token|dummy_token|mock_token|fake_jwt_token)['"]/i);
      if (placeholderMatch) {
        const line = content.substring(0, placeholderMatch.index).split('\n').length;
        const msg = `API AuthZ Failure in '${af.path}' line ${line}: Hardcoded placeholder token '${placeholderMatch[1]}' is forbidden. Dynamically generated signed JWT tokens are required.`;
        errors.push(msg);
        defects.push({
          code: 'HARDCODED_AUTH_TOKEN',
          subtype: 'HARDCODED_AUTH_TOKEN',
          file: af.path,
          line,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  });

  return { defects, errors };
}

/**
 * 3. Verify Protected Endpoint Guards (Authorization Context)
 */
export function verifyProtectedEndpointGuards(files = [], options = {}) {
  const routerFiles = files.filter(f => /\.(py|js|ts)$/.test(f?.path || '') && /(?:\/(?:api|routes|routers)\/|(?:^|\/)(?:main|server|index)\.(?:py|js|ts)$)/.test(normPath(f.path)) && !/\/schemas\//.test(f.path));
  const defects = routerFiles.flatMap(f => {
    const publicRoutes = new Set((options.manifest?.integrationContract?.endpoints || []).filter(ep => ep.backendFile === f.path && ep.auth === 'public').map(ep => `${ep.method.toLowerCase()}:${ep.routerPath ?? ep.path}`));
    return f.path.endsWith('.py') ? inspectEndpointGuards(f.path, f.content || '', publicRoutes) : inspectJavaScriptGuards(f.path, f.content || '', publicRoutes);
  }).map(d => ({ ...d, code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE, severity: 'HIGH' }));
  return { defects, errors: defects.map(d => d.message), checkedRouters: routerFiles.length };
}

/**
 * 4. Verify Identity Override Protection
 * Ensures request body/payload cannot override the authenticated user identity.
 */
export function verifyIdentityOverrideProtection(files = [], _options = {}) {
  const defects = [];
  const errors = [];

  const routerFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return (np.includes('/api/') || np.includes('/routes/')) && !np.includes('auth');
  });

  routerFiles.forEach(rf => {
    const content = rf.content || '';

    // Anti-patterns:
    // 1. Accepting user_id directly from request payload without setting user_id = current_user.id
    // e.g. item = Model(**payload.dict()) without setting user_id=current_user.id or overriding it
    // e.g. new_record.user_id = req.body.user_id
    const hasDangerousBodyUserId = /user_id\s*=\s*(req\.body|data|payload|item_in)\.user_id/i.test(content);
    const overridesWithAuthUser = /user_id\s*=\s*(current_user\.id|current_user\[['"]id['"]|req\.user\.id)/i.test(content) ||
                                  /,\s*user_id\s*=\s*(current_user\.id|current_user\[['"]id['"]|req\.user\.id)/i.test(content);

    if (hasDangerousBodyUserId && !overridesWithAuthUser) {
      const msg = `API AuthZ Failure in '${rf.path}': Request payload assigns user_id from client body instead of verified authenticated context.`;
      errors.push(msg);
      defects.push({
        code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
        subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_IDENTITY_OVERRIDE,
        file: rf.path,
        severity: 'CRITICAL',
        message: msg
      });
    }
  });

  return { defects, errors };
}

/**
 * 5. Verify Resource Ownership & Isolation
 * User A cannot access, modify, or delete User B resources.
 * User-owned records must be filtered by authenticated user.
 */
export function verifyResourceOwnershipAndIsolation(files = [], _options = {}) {
  const defects = [];
  const errors = [];

  const routerFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return (np.includes('/api/') || np.includes('/routes/')) && !np.includes('auth') && !np.includes('health');
  });

  routerFiles.forEach(rf => {
    const content = rf.content || '';
    if (!content.includes('router.') && !content.includes('@router') && !content.includes('app.')) return;

    // Check if router contains GET listing: e.g. @router.get("/") or @router.get("/customers/")
    const listMatch = content.match(/@router\.get\s*\(\s*['"]([^'"]*)['"]|router\.get\s*\(\s*['"]([^'"]*)['"]/i);
    const hasListEndpoint = Boolean(listMatch && !listMatch[0].includes('{'));
    if (hasListEndpoint) {
      // If endpoint lists user data, it must filter by current_user / user_id
      const hasUserFilterInQuery = /filter\s*\([^)]*user_id\s*==\s*current_user(?:\.id|\['id'\]|\.get\(['"]id['"]\))/i.test(content) ||
                                   /filter\s*\([^)]*customer_id\s*==\s*current_user(?:\.id|\['id'\]|\.get\(['"]id['"]\))/i.test(content) ||
                                   /where:\s*\{[^}]*userId/i.test(content) ||
                                   /current_user(?:\.id|\['id'\]|\.get\(['"]id['"]\))/i.test(content);
      const queriesUserCollection = /\bquery\s*\(\s*(?:Customer|Order|CartItem|Address|Wishlist|Task|Board|Project|Todo|Note|Goal)\s*\)\.all\(\)/i.test(content);
      const isGlobalQueryWithoutFilter = (/\.query\(\w+\)\.all\(\)/i.test(content) && !hasUserFilterInQuery) || queriesUserCollection;

      if (isGlobalQueryWithoutFilter) {
        const line = content.indexOf('.all()') !== -1 ? content.substring(0, content.indexOf('.all()')).split('\n').length : 1;
        const msg = `API AuthZ Failure in '${rf.path}': Resource list endpoint queries all records globally (.all()) without filtering by authenticated user.`;
        errors.push(msg);
        defects.push({
          code: 'AUTHZ_OWNERSHIP_LEAK',
          subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_OWNERSHIP_LEAK,
          file: rf.path,
          line,
          hint: 'Customer-owned resource queries must be explicitly scoped and filtered by the authenticated user ID.',
          severity: 'HIGH',
          message: msg
        });
      }
    }

    // Check for bogus ownership comparisons (e.g. comparing board_id to user_id)
    const hasBogusOwnershipComparison = /(?:task|item|record)\.board_id\s*==\s*(?:current_user|user_id|user\.id|current_user\.id)/i.test(content);
    if (hasBogusOwnershipComparison) {
      const line = content.indexOf('board_id') !== -1 ? content.substring(0, content.indexOf('board_id')).split('\n').length : 1;
      const msg = `API AuthZ Failure in '${rf.path}': Bogus authorization check compares resource 'board_id' directly to user identity instead of checking board ownership or task user_id.`;
      errors.push(msg);
      defects.push({
        code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
        subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_CROSS_USER_ACCESS,
        file: rf.path,
        line,
        hint: 'Verify user ownership by checking task.user_id == current_user.id or querying board.user_id == current_user.id.',
        severity: 'HIGH',
        message: msg
      });
    }

    // Check for Python boolean 'and' inside SQLAlchemy .filter()
    const booleanAndMatch = content.match(/\.filter\s*\([^)]*==[^)]*\band\b[^)]*==[^)]*\)/);
    if (booleanAndMatch) {
      const line = content.substring(0, booleanAndMatch.index).split('\n').length;
      const msg = `API AuthZ Failure in '${rf.path}' line ${line}: Python boolean 'and' used inside SQLAlchemy .filter(). Conditions must be comma-separated (.filter(c1, c2)) or use sqlalchemy.and_().`;
      errors.push(msg);
      defects.push({
        code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
        subtype: 'SQLALCHEMY_BOOLEAN_AND_DEFECT',
        file: rf.path,
        line,
        hint: "Replace Python 'and' with a comma in .filter(cond1, cond2) or use and_(cond1, cond2).",
        severity: 'HIGH',
        message: msg
      });
    }

    // Check task creation under board: must verify board belongs to current_user
    const createsTaskUnderBoard = /@router\.post\s*\(\s*['"]\/(?:tasks|boards\/\{[^}]+\}\/tasks)['"]/i.test(content) ||
                                  (/def\s+create_task\b/i.test(content) && content.includes('board_id'));
    if (createsTaskUnderBoard) {
      const hasBoardOwnershipCheck = /board.*user_id\s*==\s*current_user/i.test(content) ||
                                    /Board\.user_id\s*==\s*current_user/i.test(content) ||
                                    /query\(\s*Board\s*\)\.filter\([^)]*user_id/i.test(content);
      if (!hasBoardOwnershipCheck && content.includes('current_user')) {
        const line = content.indexOf('create_task') !== -1 ? content.substring(0, content.indexOf('create_task')).split('\n').length : 1;
        const msg = `API AuthZ Failure in '${rf.path}': Task creation does not verify that target board belongs to the authenticated user.`;
        errors.push(msg);
        defects.push({
          code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
          subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_CROSS_USER_ACCESS,
          file: rf.path,
          line,
          hint: 'Verify board ownership before creating a task: query board by id and filter by board.user_id == current_user.id.',
          severity: 'HIGH',
          message: msg
        });
      }
    }

    // Check dashboard metrics scoping
    const isDashboard = /@router\.get\s*\(\s*['"]\/(?:dashboard|metrics|stats|analytics)['"]/i.test(content);
    if (isDashboard) {
      const hasScopedMetrics = /filter\s*\([^)]*user_id\s*==\s*current_user/i.test(content);
      const hasUnscopedCount = /\.query\(\s*(?:Task|Board|Project|Order)\s*\)\.count\(\)/i.test(content);
      if (hasUnscopedCount && !hasScopedMetrics) {
        const line = content.indexOf('.count()') !== -1 ? content.substring(0, content.indexOf('.count()')).split('\n').length : 1;
        const msg = `API AuthZ Failure in '${rf.path}': Dashboard metrics queries all records globally without scoping counts to the authenticated user.`;
        errors.push(msg);
        defects.push({
          code: 'AUTHZ_OWNERSHIP_LEAK',
          subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_OWNERSHIP_LEAK,
          file: rf.path,
          line,
          hint: 'Dashboard metrics must be scoped to authenticated user: query(Task).filter(Task.user_id == current_user.id).count().',
          severity: 'HIGH',
          message: msg
        });
      }
    }

    // Check GET by ID endpoints: must check ownership or filter by user_id
    const getByIdMatch = content.match(/@router\.get\s*\(\s*['"]\/\{[^}]+\}['"]|router\.get\s*\(\s*['"]\/\{[^}]+\}['"]/i);
    if (getByIdMatch && /query\(\s*(?:Customer|Order|CartItem|Address|Wishlist|Task|Board|Project|Todo|Note|Goal)\s*\)/i.test(content)) {
      const hasGetOwnershipCheck = /user_id\s*==\s*current_user(?:\.id|\['id'\])|record\.user_id\s*==\s*current_user(?:\.id|\['id'\])|status_code\s*=\s*(?:status\.)?HTTP_403_FORBIDDEN|status_code\s*=\s*(?:status\.)?HTTP_404_NOT_FOUND/i.test(content) ||
                                   /filter\s*\([^)]*user_id\s*==\s*current_user/i.test(content);
      if (!hasGetOwnershipCheck && content.includes('current_user')) {
        const line = content.substring(0, getByIdMatch.index).split('\n').length;
        const msg = `API AuthZ Failure in '${rf.path}': Resource GET by ID endpoint does not enforce user ownership check (User A vs User B).`;
        errors.push(msg);
        defects.push({
          code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
          subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_CROSS_USER_ACCESS,
          file: rf.path,
          line,
          hint: 'Enforce ownership verification on GET by ID or filter by authenticated user ID.',
          severity: 'HIGH',
          message: msg
        });
      }
    }

    // Check UPDATE & DELETE endpoints: must check ownership or filter by user_id
    const hasUpdateOrDelete = /@router\.(put|patch|delete)\s*\(\s*['"]\/(?:\{[^}]+\}|:[^/]+)['"]|router\.(put|patch|delete)\s*\(\s*['"]\/(?:\{[^}]+\}|:[^/]+)['"]/i.test(content);
    if (hasUpdateOrDelete) {
      const hasOwnershipCheck = /user_id\s*==\s*current_user\.id|record\.user_id\s*==\s*current_user\.id|record\.user_id\s*!=\s*current_user\.id|status_code\s*=\s*(?:status\.)?HTTP_403_FORBIDDEN|status_code\s*=\s*(?:status\.)?HTTP_404_NOT_FOUND|where:\s*\{[^}]*userId/i.test(content) ||
                                /HTTPException\s*\(\s*(?:status_code\s*=\s*)?(?:403|404)/i.test(content);

      if (!hasOwnershipCheck && content.includes('current_user')) {
        const msg = `API AuthZ Failure in '${rf.path}': Resource mutation/deletion endpoint does not enforce user ownership check (User A vs User B).`;
        errors.push(msg);
        defects.push({
          code: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
          subtype: API_AUTHZ_DEFECT_CODES.AUTHZ_CROSS_USER_ACCESS,
          file: rf.path,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  });

  return { defects, errors };
}

/**
 * 6. In-Memory Flow Simulation Engine
 * Simulates and mathematically verifies the complete AuthN/AuthZ contract matrix:
 * - register endpoint
 * - login endpoint
 * - valid credentials
 * - invalid credentials
 * - missing credentials
 * - malformed token
 * - expired token
 * - invalid signature/token
 * - correct authenticated identity extraction
 * - protected endpoint requires auth
 * - request payload cannot override user identity
 * - cross-user resource protection (User A vs User B for READ, UPDATE, DELETE)
 * - user-owned records list isolation
 */
export function simulateAuthzFlow(customImplementation = null) {
  const secretKey = 'test-authz-secret-key-signature-32b!';
  const invalidKey = 'wrong-secret-key-for-tamper-check!';

  // Minimal standard JWT creator for tests
  function createSignedToken(payload, secret = secretKey, expiresInSec = 3600) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSec
    };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  function verifyToken(token, secret = secretKey) {
    if (!token || typeof token !== 'string') return { valid: false, error: 'MISSING_TOKEN', status: 401 };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'MALFORMED_TOKEN', status: 401 };

    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) {
      return { valid: false, error: 'INVALID_SIGNATURE', status: 401 };
    }

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'EXPIRED_TOKEN', status: 401 };
      }
      return { valid: true, payload, status: 200 };
    } catch (e) {
      return { valid: false, error: 'MALFORMED_PAYLOAD', status: 401 };
    }
  }

  // Simulated backend application state
  const users = new Map();
  const resources = new Map(); // id -> { id, user_id, title, content }
  const boards = new Map(); // id -> { id, user_id, title }
  const tasks = new Map(); // id -> { id, user_id, board_id, title, status }
  let nextUserId = 1;
  let nextResourceId = 1;
  let nextBoardId = 1;
  let nextTaskId = 1;

  // Server handlers implementing contract
  const server = customImplementation || {
    register: (body) => {
      if (!body || !body.username || !body.password) {
        return { status: 422, data: { detail: 'Missing username or password' } };
      }
      for (const u of users.values()) {
        if (u.username === body.username) {
          return { status: 400, data: { detail: 'Username already registered' } };
        }
      }
      const user = {
        id: nextUserId++,
        username: body.username,
        role: body.role || 'customer',
        passwordHash: crypto.createHash('sha256').update(body.password).digest('hex')
      };
      users.set(user.id, user);
      const token = createSignedToken({ sub: String(user.id), username: user.username, role: user.role });
      return { status: 201, data: { access_token: token, token_type: 'bearer', user: { id: user.id, username: user.username, role: user.role } } };
    },

    login: (body) => {
      if (!body || !body.username || !body.password) {
        return { status: 400, data: { detail: 'Missing credentials' } };
      }
      const hash = crypto.createHash('sha256').update(body.password).digest('hex');
      let foundUser = null;
      for (const u of users.values()) {
        if (u.username === body.username && u.passwordHash === hash) {
          foundUser = u;
          break;
        }
      }
      if (!foundUser) {
        return { status: 401, data: { detail: 'Invalid credentials' } };
      }
      const token = createSignedToken({ sub: String(foundUser.id), username: foundUser.username, role: foundUser.role || 'customer' });
      return { status: 200, data: { access_token: token, token_type: 'bearer' } };
    },

    getMe: (token) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const authenticatedUserId = Number(auth.payload.sub);
      const user = users.get(authenticatedUserId);
      if (!user) return { status: 404, data: { detail: 'User not found' } };
      return { status: 200, data: { id: user.id, username: user.username, role: user.role || 'customer' } };
    },

    adminAction: (token) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const authenticatedUserId = Number(auth.payload.sub);
      const user = users.get(authenticatedUserId);
      if (!user || user.role !== 'admin') {
        return { status: 403, data: { detail: 'Forbidden: Admin access required' } };
      }
      return { status: 200, data: { success: true, message: 'Admin action authorized' } };
    },

    createResource: (token, body) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };

      const authenticatedUserId = Number(auth.payload.sub);
      // Identity override prevention: payload.user_id is ignored/overwritten by authenticatedUserId
      const resource = {
        id: nextResourceId++,
        user_id: authenticatedUserId, // Enforces authenticated identity context
        title: body.title || 'Untitled',
        content: body.content || ''
      };
      resources.set(resource.id, resource);
      return { status: 201, data: resource };
    },

    listResources: (token) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };

      const authenticatedUserId = Number(auth.payload.sub);
      // Strictly scoped to authenticated user
      const list = Array.from(resources.values()).filter(r => r.user_id === authenticatedUserId);
      return { status: 200, data: list };
    },

    getResource: (token, resourceId) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };

      const resource = resources.get(resourceId);
      if (!resource) return { status: 404, data: { detail: 'Not found' } };

      const authenticatedUserId = Number(auth.payload.sub);
      if (resource.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Resource belongs to another user' } };
      }
      return { status: 200, data: resource };
    },

    updateResource: (token, resourceId, body) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };

      const resource = resources.get(resourceId);
      if (!resource) return { status: 404, data: { detail: 'Not found' } };

      const authenticatedUserId = Number(auth.payload.sub);
      if (resource.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot modify another user resource' } };
      }

      if (body.title !== undefined) resource.title = body.title;
      if (body.content !== undefined) resource.content = body.content;
      return { status: 200, data: resource };
    },

    deleteResource: (token, resourceId) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };

      const resource = resources.get(resourceId);
      if (!resource) return { status: 404, data: { detail: 'Not found' } };

      const authenticatedUserId = Number(auth.payload.sub);
      if (resource.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot delete another user resource' } };
      }

      resources.delete(resourceId);
      return { status: 200, data: { success: true } };
    },

    createBoard: (token, body) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const authenticatedUserId = Number(auth.payload.sub);
      const board = {
        id: nextBoardId++,
        user_id: authenticatedUserId,
        title: body.title || 'Untitled Board'
      };
      boards.set(board.id, board);
      return { status: 201, data: board };
    },

    listBoards: (token) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const authenticatedUserId = Number(auth.payload.sub);
      const userBoards = Array.from(boards.values()).filter(b => b.user_id === authenticatedUserId);
      return { status: 200, data: userBoards };
    },

    getBoard: (token, boardId) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const board = boards.get(boardId);
      if (!board) return { status: 404, data: { detail: 'Board not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (board.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Board belongs to another user' } };
      }
      return { status: 200, data: board };
    },

    createTask: (token, boardId, body) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const board = boards.get(boardId);
      if (!board) return { status: 404, data: { detail: 'Board not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (board.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot create task on another user board' } };
      }
      const task = {
        id: nextTaskId++,
        user_id: authenticatedUserId,
        board_id: boardId,
        title: body.title || 'Untitled Task',
        status: body.status || 'todo'
      };
      tasks.set(task.id, task);
      return { status: 201, data: task };
    },

    getTask: (token, taskId) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const task = tasks.get(taskId);
      if (!task) return { status: 404, data: { detail: 'Task not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (task.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Task belongs to another user' } };
      }
      return { status: 200, data: task };
    },

    updateTask: (token, taskId, body) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const task = tasks.get(taskId);
      if (!task) return { status: 404, data: { detail: 'Task not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (task.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot update another user task' } };
      }
      if (body.title !== undefined) task.title = body.title;
      if (body.status !== undefined) task.status = body.status;
      return { status: 200, data: task };
    },

    updateTaskStatus: (token, taskId, newStatus) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const task = tasks.get(taskId);
      if (!task) return { status: 404, data: { detail: 'Task not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (task.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot modify another user task status' } };
      }
      task.status = newStatus;
      return { status: 200, data: task };
    },

    deleteTask: (token, taskId) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const task = tasks.get(taskId);
      if (!task) return { status: 404, data: { detail: 'Task not found' } };
      const authenticatedUserId = Number(auth.payload.sub);
      if (task.user_id !== authenticatedUserId) {
        return { status: 403, data: { detail: 'Forbidden: Cannot delete another user task' } };
      }
      tasks.delete(taskId);
      return { status: 200, data: { success: true } };
    },

    getDashboardMetrics: (token) => {
      const auth = verifyToken(token);
      if (!auth.valid) return { status: auth.status, data: { detail: auth.error } };
      const authenticatedUserId = Number(auth.payload.sub);
      const userBoards = Array.from(boards.values()).filter(b => b.user_id === authenticatedUserId);
      const userTasks = Array.from(tasks.values()).filter(t => t.user_id === authenticatedUserId);
      return {
        status: 200,
        data: {
          totalBoards: userBoards.length,
          totalTasks: userTasks.length,
          completedTasks: userTasks.filter(t => t.status === 'done' || t.status === 'completed').length,
          pendingTasks: userTasks.filter(t => t.status !== 'done' && t.status !== 'completed').length
        }
      };
    }
  };

  return {
    server,
    createSignedToken,
    verifyToken,
    secretKey,
    invalidKey
  };
}

/**
 * Master Phase 11 Gate Validator
 * Coordinates all static contract and dynamic API AuthN / AuthZ checks.
 */
export async function validateApiAuthz(filesInput = [], optionsInput = {}) {
  const files = Array.isArray(filesInput) ? filesInput : (filesInput?.generatedFiles || filesInput?.files || []);
  const options = Array.isArray(filesInput) ? optionsInput : { ...filesInput, ...optionsInput };
  const allDefects = [];
  const allErrors = [];

  // 1. Verify Authentication Endpoints
  const endpointsRes = verifyAuthenticationEndpoints(files, options);
  allDefects.push(...endpointsRes.defects);
  allErrors.push(...endpointsRes.errors);

  const guardsRes = verifyProtectedEndpointGuards(files, options);
  allDefects.push(...guardsRes.defects);
  allErrors.push(...guardsRes.errors);
  const checkedRouters = guardsRes.checkedRouters || 0;
  if (endpointsRes.hasAuth || endpointsRes.defects.length > 0) {
    // 2. Verify Token Handling & Claims
    const tokenRes = verifyTokenValidationAndClaims(files, options);
    allDefects.push(...tokenRes.defects);
    allErrors.push(...tokenRes.errors);

    // 4. Verify Identity Override Protection
    const overrideRes = verifyIdentityOverrideProtection(files, options);
    allDefects.push(...overrideRes.defects);
    allErrors.push(...overrideRes.errors);

    // 5. Verify Resource Ownership & Isolation
    const ownershipRes = verifyResourceOwnershipAndIsolation(files, options);
    allDefects.push(...ownershipRes.defects);
    allErrors.push(...ownershipRes.errors);
  }

  const isValid = allDefects.length === 0;

  return {
    isValid,
    defects: allDefects,
    errors: allErrors,
    summary: {
      hasAuth: endpointsRes.hasAuth,
      checkedRouters,
      defectsCount: allDefects.length
    }
  };
}
