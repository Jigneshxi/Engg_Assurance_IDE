/**
 * Deterministic Manifest Validation Module
 * Enforces structural correctness, required files presence, path validity,
 */
import path from 'path';

export function cleanJsonString(str) {
  if (!str) return str;
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escape) {
        escape = false;
        out += ch;
      } else if (ch === '\\') {
        escape = true;
        out += ch;
      } else if (ch === '"') {
        const rest = str.slice(i + 1).trimStart();
        if (/^[:,}\]]/.test(rest)) {
          inString = false;
          out += ch;
        } else {
          out += '\\"';
        }
      } else if (ch === '\n' || ch === '\r') {
        out += '\\n';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        out += ch;
      } else if (ch === '/' && i + 1 < str.length && str[i + 1] === '*') {
        i += 2;
        while (i < str.length - 1 && !(str[i] === '*' && str[i + 1] === '/')) i++;
        i++;
      } else {
        out += ch;
      }
    }
  }
  return out;
}

export const MANIFEST_ERROR_CODES = {
  MODULES_EMPTY: 'MANIFEST_MODULES_EMPTY',
  MODULE_ID_MISSING: 'MANIFEST_MODULE_ID_MISSING',
  DUPLICATE_MODULE_ID: 'MANIFEST_DUPLICATE_MODULE_ID',
  UNKNOWN_DEPENDENCY: 'MANIFEST_UNKNOWN_DEPENDENCY',
  REQUIRED_FILES_MISSING: 'MANIFEST_REQUIRED_FILES_MISSING',
  REQUIRED_FILES_EMPTY: 'MANIFEST_REQUIRED_FILES_EMPTY',
  REQUIRED_FILES_MALFORMED: 'MANIFEST_REQUIRED_FILES_MALFORMED',
  INVALID_FILE_PATH: 'MANIFEST_INVALID_FILE_PATH',
  DUPLICATE_FILE_PATH: 'MANIFEST_DUPLICATE_FILE_PATH',
  TOTAL_FILES_ZERO: 'MANIFEST_TOTAL_FILES_ZERO',
  MISSING_REQUIREMENTS: 'MANIFEST_MISSING_REQUIREMENTS',
  STACK_INCOMPATIBLE: 'MANIFEST_STACK_INCOMPATIBLE',
  MANIFEST_INCOMPLETE: 'MANIFEST_INCOMPLETE',
  DUPLICATE_REQUIREMENT_ID: 'MANIFEST_DUPLICATE_REQUIREMENT_ID',
  TRUNCATED_JSON: 'MANIFEST_TRUNCATED_JSON'
};

export function validateFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { valid: false, reason: 'File path must be a non-empty string.' };
  }
  const normalized = filePath.trim().replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return { valid: false, reason: `Absolute file path not allowed: ${filePath}` };
  }
  if (normalized.split('/').some(segment => segment === '..')) {
    return { valid: false, reason: `Path traversal not allowed: ${filePath}` };
  }
  if (normalized.endsWith('/')) {
    return { valid: false, reason: `File path cannot be a directory: ${filePath}` };
  }
  const basename = normalized.split('/').pop();
  const allowedWithoutExt = new Set(['dockerfile', 'makefile', 'procfile', 'license', 'caddyfile', 'gemfile', 'docker-compose', 'vagrantfile']);
  if (!basename) {
    return { valid: false, reason: 'File path cannot be empty.' };
  }
  const lower = normalized.toLowerCase();
  const binaryExtensions = ['.db', '.sqlite', '.sqlite3', '.bin', '.exe', '.tar', '.gz', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'];
  if (binaryExtensions.some(ext => lower.endsWith(ext))) {
    return { valid: false, reason: `Binary or database data file cannot be a generated source file: ${filePath}. Database files are created at runtime via ORM migrations or Base.metadata.create_all.` };
  }
  if (!basename.includes('.') && !allowedWithoutExt.has(basename.toLowerCase())) {
    return { valid: false, reason: `File path must include a filename with extension: ${filePath}` };
  }
  return { valid: true, normalizedPath: normalized };
}

export function validateManifestStructurally(manifest) {
  const errors = [];
  const defects = [];
  const moduleIds = new Set();

  const addError = (code, message, moduleId = null, file = null) => {
    errors.push(message);
    defects.push({
      code,
      message,
      moduleId,
      file,
      severity: 'CRITICAL'
    });
  };

  if (!manifest || !manifest.modules || !Array.isArray(manifest.modules) || manifest.modules.length === 0) {
    addError(MANIFEST_ERROR_CODES.MODULES_EMPTY, 'Manifest is missing "modules" array or it is empty.');
    return {
      isValid: false,
      errors,
      defects,
      totalRequiredFiles: 0,
      hasDatabase: false,
      hasBackend: false,
      hasFrontend: false
    };
  }

  manifest.modules.forEach(m => {
    if (!m || !m.id) {
      addError(MANIFEST_ERROR_CODES.MODULE_ID_MISSING, 'A module is missing an "id" field.');
    } else {
      if (moduleIds.has(m.id)) {
        addError(MANIFEST_ERROR_CODES.DUPLICATE_MODULE_ID, `Duplicate module ID: ${m.id}`, m.id);
      }
      moduleIds.add(m.id);
    }
  });

  manifest.modules.forEach(m => {
    if (!m) return;
    (m.dependencies || []).forEach(dep => {
      if (!moduleIds.has(dep)) {
        addError(MANIFEST_ERROR_CODES.UNKNOWN_DEPENDENCY, `Module ${m.id} depends on unknown module: ${dep}`, m.id);
      }
    });
  });

  const conflicts = [];
  const filePaths = new Map(); // path -> moduleId
  let hasDatabase = false;
  let hasBackend = false;
  let hasFrontend = false;
  let totalRequiredFiles = 0;

  manifest.modules.forEach(m => {
    if (!m) return;
    if (m.layer === 'DATABASE') hasDatabase = true;
    if (m.layer === 'BACKEND_FOUNDATION' || m.layer === 'BACKEND') hasBackend = true;
    if (m.layer === 'FRONTEND') hasFrontend = true;

    if (!('required_files' in m)) {
      addError(
        MANIFEST_ERROR_CODES.REQUIRED_FILES_MISSING,
        `Module ${m.id} (${m.name || 'unnamed'}) is missing "required_files" field.`,
        m.id
      );
      return;
    }

    if (!Array.isArray(m.required_files)) {
      addError(
        MANIFEST_ERROR_CODES.REQUIRED_FILES_MALFORMED,
        `Module ${m.id} (${m.name || 'unnamed'}) "required_files" must be an array.`,
        m.id
      );
      return;
    }

    if (m.required_files.length === 0) {
      addError(
        MANIFEST_ERROR_CODES.REQUIRED_FILES_EMPTY,
        `Module ${m.id} (${m.name || 'unnamed'}) has no required_files defined. Every module MUST list at least one concrete file to generate.`,
        m.id
      );
      return;
    }

    m.required_files.forEach(f => {
      totalRequiredFiles++;
      if (!f || typeof f !== 'object') {
        addError(
          MANIFEST_ERROR_CODES.REQUIRED_FILES_MALFORMED,
          `Module ${m.id} contains malformed file entry (not an object).`,
          m.id
        );
        return;
      }

      const pathVal = validateFilePath(f.path);
      if (!pathVal.valid) {
        addError(
          MANIFEST_ERROR_CODES.INVALID_FILE_PATH,
          `A file in module ${m.id} has invalid path: ${pathVal.reason}`,
          m.id,
          f.path
        );
        return;
      }

      const normPath = pathVal.normalizedPath;
      if (filePaths.has(normPath)) {
        const previousModule = filePaths.get(normPath);
        const resolution = `Choose exactly one owner according to module responsibilities. Remove "${normPath}" from every other module.`;
        const conflictMsg = `Duplicate file ownership detected: "${normPath}" is claimed by both ${previousModule} and ${m.id}. Resolution: ${resolution}`;
        errors.push(conflictMsg);
        defects.push({
          code: MANIFEST_ERROR_CODES.DUPLICATE_FILE_PATH,
          message: conflictMsg,
          moduleId: m.id,
          file: normPath,
          existingOwner: previousModule,
          conflictingOwner: m.id,
          resolution,
          severity: 'CRITICAL'
        });
        conflicts.push({
          file: normPath,
          existingOwner: previousModule,
          conflictingOwner: m.id,
          currentOwners: [previousModule, m.id],
          resolution
        });
      } else {
        filePaths.set(normPath, m.id);
      }
    });
  });

  if (totalRequiredFiles === 0 && errors.length === 0) {
    addError(MANIFEST_ERROR_CODES.TOTAL_FILES_ZERO, 'Manifest contains 0 required files across all modules. Manifest cannot be empty.');
  }

  if (!manifest.project_requirements) {
    if (hasDatabase || hasBackend || hasFrontend) {
      addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Manifest is missing "project_requirements" despite having specific layer modules.');
    }
  } else {
    if (hasDatabase) {
      const db = manifest.project_requirements.database;
      if (!db) {
        addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Manifest is missing "project_requirements.database" despite having a DATABASE module.');
      } else {
        if (!Array.isArray(db.entities)) addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Database requirement missing entities array.');
        if (!Array.isArray(db.tables)) addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Database requirement missing tables array.');
      }
    }
    if (hasBackend && !manifest.project_requirements.backend) {
      addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Manifest is missing "project_requirements.backend" despite having a BACKEND module.');
    }
    if (hasFrontend && !manifest.project_requirements.frontend) {
      addError(MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, 'Manifest is missing "project_requirements.frontend" despite having a FRONTEND module.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    defects,
    conflicts,
    totalRequiredFiles,
    hasDatabase,
    hasBackend,
    hasFrontend
  };
}

/**
 * Deterministically repairs and normalizes file ownership across manifest modules.
 * - Enforces single ownership: each concrete file has exactly one owner.
 * - Resolves conflicts by module responsibility (functional modules keep core domain files over MOD-999 wiring).
 * - Prunes empty MOD-999 wiring module if all files are already owned by functional modules.
 * - Idempotent: repeating normalization on an already normalized manifest produces identical output.
 */
export function repairManifestOwnership(manifest) {
  if (!manifest || !manifest.modules || !Array.isArray(manifest.modules)) {
    return manifest;
  }

  const cloned = JSON.parse(JSON.stringify(manifest));

  // 1. Group claims for each normalized file path across modules
  const fileClaims = new Map(); // path -> Array<{ moduleId, module, fileObj, idx }>

  cloned.modules.forEach(m => {
    if (!m || !Array.isArray(m.required_files)) return;
    m.required_files.forEach((f, idx) => {
      if (!f || typeof f !== 'object' || !f.path) return;
      const normalized = f.path.trim().replace(/\\/g, '/');
      if (!fileClaims.has(normalized)) {
        fileClaims.set(normalized, []);
      }
      fileClaims.get(normalized).push({ moduleId: m.id, module: m, fileObj: f, idx });
    });
  });

  // 2. Resolve duplicate ownership deterministically
  for (const [filePath, claims] of fileClaims.entries()) {
    if (claims.length <= 1) continue;

    // RULE 2 & RULE 6: If MOD-999 (or Application Wiring) claims a file already owned
    // by a functional module (e.g. MOD-001 Backend Foundation, MOD-005 Frontend),
    // the functional module retains it.
    const isWiring = c => c.moduleId === 'MOD-999' || c.module?.name === 'Application Wiring';
    const wiringClaim = claims.find(isWiring);
    const functionalClaim = claims.find(c => !isWiring(c));

    let canonicalClaim;
    if (wiringClaim && functionalClaim) {
      canonicalClaim = functionalClaim;
    } else {
      // Multiple functional modules: match by layer responsibilities
      const bestMatch = claims.find(c => {
        const layer = c.module?.layer;
        if (filePath.includes('/db/') || filePath.includes('models.') || filePath.includes('schema.') || filePath.includes('database.')) {
          return layer === 'DATABASE';
        }
        if (filePath.startsWith('frontend/') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
          return layer === 'FRONTEND';
        }
        if (filePath.startsWith('backend/') || filePath.endsWith('.py') || filePath.endsWith('.js')) {
          return layer === 'BACKEND_FOUNDATION' || layer === 'BACKEND';
        }
        return false;
      });
      canonicalClaim = bestMatch || claims[0];
    }

    // Remove the file from all other modules claiming it
    for (const claim of claims) {
      if (claim.moduleId !== canonicalClaim.moduleId) {
        claim.module.required_files = claim.module.required_files.filter(f => {
          if (!f || !f.path) return true;
          return f.path.trim().replace(/\\/g, '/') !== filePath;
        });
      }
    }
  }

  // 3. RULE 3: If MOD-999 / Application Wiring has zero required_files,
  // and other functional modules exist to provide application components,
  // prune the empty MOD-999 module so the manifest explicitly represents
  // the architecture without an empty shell module.
  const hasFunctionalModules = cloned.modules.some(
    m => m.id !== 'MOD-999' && Array.isArray(m.required_files) && m.required_files.length > 0
  );

  if (hasFunctionalModules) {
    const mod999 = cloned.modules.find(m => m.id === 'MOD-999');
    if (mod999 && (!mod999.required_files || mod999.required_files.length === 0)) {
      cloned.modules = cloned.modules.filter(m => m.id !== 'MOD-999');
      // Clean up any dependencies referencing MOD-999
      cloned.modules.forEach(m => {
        if (Array.isArray(m.dependencies)) {
          m.dependencies = m.dependencies.filter(dep => dep !== 'MOD-999');
        }
      });
    }
  }

  return cloned;
}

/**
 * Validates that the manifest's required files and layers strictly adhere to
 * the authoritative Architecture Contract's technology stack (language, ORM, framework).
 * Prevents stack mismatches (e.g. Prisma/.ts database files when architecture is Python/SQLAlchemy)
 * BEFORE any code generation begins.
 */
export function validateManifestStackCompatibility(manifest, architectureContract) {
  const contract = architectureContract || manifest?.architectureContract;
  if (!contract || (!contract.language && !contract.orm)) {
    return { isValid: true, errors: [], defects: [] };
  }

  const expectedLang = (contract.language || 'python').toLowerCase();
  const expectedOrm = (contract.orm || (expectedLang === 'python' ? 'sqlalchemy' : 'prisma')).toLowerCase();
  const errors = [];
  const defects = [];

  const addError = (code, message, moduleId, file) => {
    errors.push(message);
    defects.push({
      code,
      message,
      moduleId,
      file,
      severity: 'CRITICAL',
      expectedStack: { language: expectedLang, orm: expectedOrm }
    });
  };

  (manifest.modules || []).forEach(m => {
    (m.required_files || []).forEach(f => {
      const p = f.path ? f.path.trim().replace(/\\/g, '/') : '';
      if (!p) return;

      if (m.layer === 'DATABASE') {
        if (expectedLang === 'python') {
          if (p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.prisma')) {
            addError(
              MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE,
              `Database file "${p}" in module ${m.id} violates Architecture Contract (${expectedLang}/${expectedOrm}). Expected Python (.py) database file, but got "${p}".`,
              m.id,
              p
            );
          }
        } else if (expectedLang === 'typescript') {
          if (p.endsWith('.py')) {
            addError(
              MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE,
              `Database file "${p}" in module ${m.id} violates Architecture Contract (${expectedLang}/${expectedOrm}). Expected TypeScript/Prisma (.ts/.prisma) database file, but got "${p}".`,
              m.id,
              p
            );
          }
        }
      } else if (m.layer === 'BACKEND' || m.layer === 'BACKEND_FOUNDATION') {
        if (expectedLang === 'python') {
          if (p.endsWith('.ts') || p.endsWith('.js')) {
            addError(
              MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE,
              `Backend file "${p}" in module ${m.id} violates Architecture Contract (${expectedLang}). Expected Python (.py) file, but got "${p}".`,
              m.id,
              p
            );
          }
        } else if (expectedLang === 'typescript') {
          if (p.endsWith('.py')) {
            addError(
              MANIFEST_ERROR_CODES.STACK_INCOMPATIBLE,
              `Backend file "${p}" in module ${m.id} violates Architecture Contract (${expectedLang}). Expected TypeScript (.ts) file, but got "${p}".`,
              m.id,
              p
            );
          }
        }
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
    defects
  };
}

/**
 * Validates that a Requirement Contract is well-formed:
 * - Contains non-empty requirements array
 * - Every requirement has a unique, non-empty ID
 * - No duplicate requirement IDs
 */
export function validateRequirementContract(contract) {
  const errors = [];
  const defects = [];
  const seenIds = new Set();

  if (!contract || !Array.isArray(contract.requirements) || contract.requirements.length === 0) {
    const msg = 'Requirement Contract is missing or contains an empty "requirements" array.';
    errors.push(msg);
    defects.push({
      code: MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS,
      message: msg,
      severity: 'CRITICAL'
    });
    return { isValid: false, errors, defects, requirementCount: 0 };
  }

  contract.requirements.forEach((req, idx) => {
    if (!req || typeof req !== 'object') {
      const msg = `Requirement at index ${idx} is malformed (not an object).`;
      errors.push(msg);
      defects.push({ code: MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, message: msg, severity: 'CRITICAL' });
      return;
    }

    const reqId = req.id ? String(req.id).trim() : '';
    if (!reqId) {
      const msg = `Requirement at index ${idx} is missing a non-empty "id" field.`;
      errors.push(msg);
      defects.push({ code: MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, message: msg, severity: 'CRITICAL' });
    } else {
      if (seenIds.has(reqId)) {
        const msg = `Duplicate requirement ID detected: "${reqId}". All requirement IDs must be globally unique.`;
        errors.push(msg);
        defects.push({
          code: MANIFEST_ERROR_CODES.DUPLICATE_REQUIREMENT_ID,
          message: msg,
          requirementId: reqId,
          severity: 'CRITICAL'
        });
      }
      seenIds.add(reqId);
    }

    if (!req.description || typeof req.description !== 'string' || !req.description.trim()) {
      const msg = `Requirement "${reqId || idx}" is missing a description.`;
      errors.push(msg);
      defects.push({ code: MANIFEST_ERROR_CODES.MISSING_REQUIREMENTS, message: msg, severity: 'CRITICAL' });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    defects,
    requirementCount: seenIds.size
  };
}

const GENERIC_STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'this', 'that', 'these', 'those', 'caller', 'callers',
  'client', 'clients', 'patient', 'patients', 'doctor', 'doctors',
  'platform', 'platforms', 'negative', 'positive', 'concurrent', 'concurrency', 'error', 'errors', 'securely', 'operations', 'operation', 'protected',
  'consistent', 'consistency', 'consistently', 'inconsistent',
  'standard', 'standards', 'proper', 'properly', 'accurate', 'accurately',
  'various', 'multiple', 'appropriate', 'appropriately', 'efficient', 'efficiently',
  'reliable', 'reliability', 'based', 'role-based', 'level', 'levels',
  'request', 'requests', 'response', 'responses',
  'amount', 'amounts', 'between', 'format', 'formats', 'hash', 'hashes', 'hashing', 'admin', 'admins',
  'system', 'data', 'application', 'app', 'apps', 'complete', 'full', 'basic', 'simple',
  'advanced', 'support', 'supports', 'supported', 'supporting', 'able', 'allow', 'allows',
  'allowed', 'enable', 'enables', 'enabled', 'implement', 'implements', 'implementation',
  'require', 'requires', 'required', 'requirement', 'requirements', 'feature', 'features',
  'function', 'functions', 'functionality', 'service', 'services', 'management', 'manage',
  'manages', 'managed', 'managing', 'create', 'creates', 'created', 'creating', 'read',
  'reads', 'update', 'updates', 'updated', 'updating', 'delete', 'deletes', 'deleted',
  'deleting', 'view', 'views', 'viewing', 'list', 'lists', 'listing', 'display', 'displays',
  'displaying', 'show', 'shows', 'showing', 'handling', 'handle', 'handles', 'handled',
  'provide', 'provides', 'provided', 'providing', 'portal', 'dashboard', 'screen', 'screens',
  'page', 'pages', 'component', 'components', 'interface', 'workflow', 'workflows', 'flow',
  'flows', 'module', 'modules', 'section', 'sections', 'button', 'buttons', 'form', 'forms',
  'table', 'tables', 'model', 'models', 'schema', 'schemas', 'endpoint', 'endpoints',
  'route', 'routes', 'backend', 'frontend', 'database', 'layer', 'layers', 'each', 'every',
  'both', 'into', 'over', 'such', 'only', 'some', 'well', 'also', 'will', 'must', 'should',
  // Common action verbs & adjectives (never standalone domain modules)
  'apply', 'applies', 'applying', 'applied',
  'calculate', 'calculates', 'calculating', 'calculated', 'calculation',
  'final', 'finally',
  'secure', 'secures', 'secured', 'securing', 'security',
  'prevent', 'prevents', 'preventing', 'prevented', 'prevention',
  'abstract', 'abstracts', 'abstracted', 'abstracting', 'abstraction',
  'store', 'stores', 'stored', 'storing', 'storage',
  'token', 'tokens', 'tokenization',
  'password', 'passwords',
  'authenticate', 'authenticated', 'authenticating', 'authentication',
  'process', 'processes', 'processing', 'processed',
  'verify', 'verifies', 'verifying', 'verified', 'verification',
  'validate', 'validates', 'validating', 'validated', 'validation',
  'generate', 'generates', 'generating', 'generated', 'generation',
  'ensure', 'ensures', 'ensuring', 'ensured',
  'include', 'includes', 'including', 'included',
  'perform', 'performs', 'performing', 'performed',
  'contain', 'contains', 'containing', 'contained',
  'return', 'returns', 'returning', 'returned',
  'check', 'checks', 'checking', 'checked',
  'total', 'totals', 'subtotal',
  'item', 'items', 'type', 'types', 'field', 'fields', 'value', 'values',
  'code', 'codes', 'event', 'events', 'status', 'statuses', 'state', 'states',
  'rule', 'rules', 'policy', 'policies', 'logic',
  // Common architectural and secondary concepts
  'entity', 'entities', 'session', 'sessions', 'discount', 'discounts', 'rating', 'ratings',
  'user', 'users',
  'search', 'searches', 'searching', 'searched',
  'filter', 'filters', 'filtering', 'filtered',
  'sort', 'sorts', 'sorting', 'sorted',
  'select', 'selects', 'selecting', 'selected',
  'detail', 'details', 'detailed',
  'input', 'inputs', 'output', 'outputs',
  'entry', 'entries', 'action', 'actions',
  'send', 'sends', 'sending', 'sent',
  'receive', 'receives', 'receiving', 'received'
]);

/**
 * Extracts substantive, distinctive subject-matter tokens from a requirement description.
 * Strips grammatical and structural stop-words so that novel domain terms
 * (e.g., 'recipe', 'telemetry', 'prescription', 'appointment') are isolated.
 */
export function extractRequirementDistinctiveTokens(description = '') {
  if (!description || typeof description !== 'string') return [];
  const rawWords = description.toLowerCase().replace(/[^a-z0-9_-]/g, ' ').split(/\s+/);
  const distinctive = [];
  for (const w of rawWords) {
    const cleaned = w.replace(/^[-_]+|[-_]+$/g, '');
    if (cleaned.startsWith('auth') || cleaned.startsWith('role') || cleaned.includes('role') || cleaned === 'rbac' || cleaned === 'role-based') {
      distinctive.push('auth');
      continue;
    }
    if (cleaned.length >= 4 && !GENERIC_STOP_WORDS.has(cleaned)) {
      distinctive.push(cleaned);
      if (cleaned.endsWith('s') && cleaned.length > 4 && !cleaned.endsWith('ss')) {
        distinctive.push(cleaned.slice(0, -1));
      }
      if (cleaned.startsWith('invent')) {
        distinctive.push('invent');
        distinctive.push('product');
        distinctive.push('stock');
      }
      if (cleaned.startsWith('admin')) {
        distinctive.push('admin');
        distinctive.push('auth');
      }
      if (cleaned.startsWith('notif')) distinctive.push('notif');
      if (cleaned.startsWith('config')) distinctive.push('config');
    }
  }
  return [...new Set(distinctive)];
}

/**
 * Detects whether a requirement represents an architectural stack constraint,
 * non-functional requirement, or cross-cutting invariant (e.g. "Use FastAPI",
 * "Bcrypt password hashing", "CORS enabled") rather than an individual domain feature.
 */
export function isConstraintOrCrossCuttingRequirement(req) {
  if (!req) return false;
  const rawType = String(req.type || '').toLowerCase();
  if (['constraint', 'cross-cutting', 'cross_cutting', 'non-functional', 'non_functional', 'documentation', 'configuration', 'infrastructure', 'stack'].includes(rawType)) {
    return true;
  }
  const desc = String(req.description || '').toLowerCase();
  return (
    /(?:built with|written in|stack:|tech stack|technology stack|framework:|database:)/i.test(desc) ||
    /^(?:the )?(?:application|backend|frontend|system|codebase|project) must (?:be built|use|utilize|implement|run on)/i.test(desc) ||
    /(?:use|utilize|built with|implemented with) (?:fastapi|express|react|vue|angular|sqlite|postgres|postgresql|mongodb|typescript|python|tailwind|plain css)/i.test(desc) ||
    /(?:all )?passwords? (?:must be |are )?hashed (?:using|with) (?:bcrypt|argon|pbkdf2)/i.test(desc) ||
    /cors (?:must be |is )?enabled/i.test(desc) ||
    /(?:response time|latency|performance) (?:must be|under|less than) \d+/i.test(desc) ||
    /(?:code quality|clean code|production[- ]ready|well[- ]structured|modular)/i.test(desc)
  );
}

/**
 * Derives concrete implementation obligations dynamically from requirement text and type.
 * Determines required layers (API/backend, UI/frontend, database/data, workflow/integration,
 * security, configuration, testing) dynamically with zero hardcoded domain lists.
 */
export function deriveRequirementObligations(req, _archContract = null) {
  const desc = (req.description || '').toLowerCase();
  const rawType = (req.type || '').toLowerCase();
  const isConstraint = isConstraintOrCrossCuttingRequirement(req);

  const isApiBackend = !isConstraint && (rawType === 'backend' || rawType === 'api' ||
    /(?:api\b|endpoint|router|route|crud|rest\b|\/api\/|service|handler|controller|backend|server|grpc|graphql)/i.test(desc) ||
    ((rawType === 'feature' || !rawType) && /(?:calculate|calculation|process|processing|verify|verification|validate|validation|generate|generation|ingest|ingestion|download|upload|export|import)/i.test(desc)));

  const isFrontendUi = !isConstraint && (rawType === 'frontend' || rawType === 'ui' ||
    /(?:ui\b|frontend|\bviews?\b|\bpages?\b|\bcomponents?\b|\bdashboards?\b|\bscreens?\b|\bmodals?\b|\bforms?\b|storefront|viewing|render|display|visualize|calendar|editor)/i.test(desc));

  const isDatabaseData = !isConstraint && (rawType === 'database' || rawType === 'data' ||
    /(?:database|schema|tables?|models?|entity|entities|persistence|foreign key|migration|columns?|records?|store\b|storing)/i.test(desc));

  const isWorkflowIntegration = !isConstraint && (rawType === 'workflow' || rawType === 'integration' ||
    /(?:workflow|workflows|multi-step|lifecycle|pipeline|flow|checkout|integration|third-party|webhook|gateway)/i.test(desc));

  const isSecurity = rawType === 'security' || rawType === 'auth' ||
    /(?:auth\b|authentication|authorization|login|register|password|permission|rbac|roles?|jwt|token|encryption|secret)/i.test(desc);

  const isConfig = isConstraint || rawType === 'config' || rawType === 'infrastructure' ||
    /(?:config|configuration|environment|docker|compose|deployment|settings)/i.test(desc);

  const isTesting = rawType === 'test' || rawType === 'testing' ||
    /(?:tests?|testing|unit test|integration test|e2e|coverage)/i.test(desc);

  const isPureDatabase = !isConstraint && (rawType === 'database' || /(?:database schema|data persistence|orm model|table definitions?)/i.test(desc)) &&
    !/(?:api\b|endpoint|route|ui\b|frontend|\bpages?\b|\bviews?\b)/i.test(desc);

  return {
    isConstraint,
    isApiBackend,
    isFrontendUi,
    isDatabaseData,
    isWorkflowIntegration,
    isSecurity,
    isConfig,
    isTesting,
    isPureDatabase,
    distinctiveTokens: extractRequirementDistinctiveTokens(req.description)
  };
}

/**
 * Automatically derives standard requirement mappings from the manifest modules
 * when no explicit requirement_mappings are provided in the manifest.
 */
export function autoDeriveRequirementMappings(manifest, requirementContract) {
  if (!requirementContract || !Array.isArray(requirementContract.requirements)) {
    return [];
  }
  const modules = manifest?.modules || [];
  if (modules.length === 0) return [];

  const mappings = [];

  // Collect all files across all modules
  const allFilesWithModule = [];
  modules.forEach(m => {
    (m.required_files || []).forEach(f => {
      const p = typeof f === 'string' ? f : f?.path;
      const purpose = typeof f === 'object' ? f?.purpose : '';
      if (p) allFilesWithModule.push({
        path: p.trim().replace(/\\/g, '/'),
        purpose: purpose || '',
        module: m.id,
        layer: m.layer
      });
    });
  });

  const declaredEntities = (manifest?.project_requirements?.database?.entities || [])
    .map(e => String(e).toLowerCase());
  const moduleNames = modules.map(m => String(m.name || '').toLowerCase());

  for (const req of requirementContract.requirements) {
    const reqId = req.id || 'REQ-GENERIC';
    const obligations = deriveRequirementObligations(req);

    // Search for planned files that match the requirement's distinctive tokens
    const domainMatches = allFilesWithModule.filter(f =>
      obligations.distinctiveTokens.some(tok => {
        const stem = tok.endsWith('s') && tok.length > 4 ? tok.slice(0, -1) : tok;
        const p = f.path.toLowerCase();
        const purp = (f.purpose || '').toLowerCase();
        return p.includes(tok) || p.includes(stem) || purp.includes(tok) || purp.includes(stem);
      })
    );

    let candidate = null;
    let candidateFiles = [];

    let relevantMatches = domainMatches;
    if (obligations.isFrontendUi) {
      const uiMatches = domainMatches.filter(m => m.layer === 'FRONTEND');
      if (uiMatches.length > 0) {
        relevantMatches = uiMatches;
      } else {
        const feMod = modules.find(m => m.layer === 'FRONTEND');
        if (feMod && Array.isArray(feMod.required_files) && feMod.required_files.length > 0) {
          relevantMatches = feMod.required_files.map(f => ({
            path: typeof f === 'string' ? f : f?.path,
            module: feMod.id,
            layer: feMod.layer
          })).filter(f => f.path);
        }
      }
    } else if (obligations.isApiBackend && !obligations.isPureDatabase) {
      const apiMatches = domainMatches.filter(m => m.layer === 'BACKEND' || m.layer === 'BACKEND_FOUNDATION');
      if (apiMatches.length > 0) relevantMatches = apiMatches;
      else relevantMatches = []; // Do not map API obligations to database-only modules
    }

    if (relevantMatches.length > 0) {
      const bestModuleId = relevantMatches[0].module;
      candidate = modules.find(m => m.id === bestModuleId);
      candidateFiles = relevantMatches.filter(m => m.module === bestModuleId).map(m => m.path);
    } else {
      const domainCoveredInManifest = obligations.distinctiveTokens.length === 0 ||
        obligations.distinctiveTokens.some(tok => {
          const stem = tok.endsWith('s') && tok.length > 4 ? tok.slice(0, -1) : tok;
          return declaredEntities.some(e => e.includes(tok) || e.includes(stem) || tok.includes(e) || stem.includes(e)) ||
            moduleNames.some(mn => mn.includes(tok) || mn.includes(stem) || tok.includes(mn) || stem.includes(mn)) ||
            allFilesWithModule.some(f => {
              const p = f.path.toLowerCase();
              return p.includes(tok) || p.includes(stem);
            });
        });

      if (domainCoveredInManifest) {
        if (obligations.isSecurity) {
          candidate = modules.find(m => m.layer === 'BACKEND' && (m.id.toLowerCase().includes('auth') || (m.name && m.name.toLowerCase().includes('auth')) || m.id.toLowerCase().includes('sec'))) ||
            modules.find(m => m.layer === 'BACKEND') ||
            modules.find(m => m.layer === 'BACKEND_FOUNDATION');
        } else if (obligations.isFrontendUi) {
          candidate = modules.find(m => m.layer === 'FRONTEND');
        } else if (obligations.isApiBackend && !obligations.isPureDatabase) {
          candidate = modules.find(m => m.layer === 'BACKEND') || modules.find(m => m.layer === 'BACKEND_FOUNDATION');
        } else if (obligations.isPureDatabase || obligations.isDatabaseData) {
          candidate = modules.find(m => m.layer === 'DATABASE');
        }
      } else {
        // Fallback mapping: Map cross-cutting and secondary requirements to the appropriate layer
        if (obligations.isSecurity || req.description?.toLowerCase().includes('admin') || req.description?.toLowerCase().includes('auth') || req.description?.toLowerCase().includes('hash')) {
          candidate = modules.find(m => m.layer === 'BACKEND' && (m.id.toLowerCase().includes('auth') || (m.name && m.name.toLowerCase().includes('auth')) || m.id.toLowerCase().includes('sec'))) ||
            modules.find(m => m.layer === 'BACKEND') ||
            modules.find(m => m.layer === 'BACKEND_FOUNDATION') ||
            modules[0];
        } else if (obligations.isFrontendUi) {
          candidate = modules.find(m => m.layer === 'FRONTEND') || modules[0];
        } else if (obligations.isPureDatabase || obligations.isDatabaseData) {
          candidate = modules.find(m => m.layer === 'DATABASE') || modules.find(m => m.layer === 'BACKEND') || modules[0];
        } else {
          candidate = modules.find(m => m.layer === 'BACKEND') || modules.find(m => m.layer === 'BACKEND_FOUNDATION') || modules[0];
        }
      }
    }

    if (!candidate) {
      candidate = modules.find(m => m.layer === 'BACKEND') || modules.find(m => m.layer === 'BACKEND_FOUNDATION') || modules[0];
    }

    const files = candidateFiles.length > 0 ? candidateFiles : (candidate.required_files || []).map(f => typeof f === 'string' ? f : f?.path).filter(Boolean);
    mappings.push({
      id: reqId,
      status: 'SUPPORTED',
      module: candidate.id,
      files: files.slice(0, 2),
      implementation_responsibility: `Implements requirement ${reqId}: ${req.description || 'Core feature logic'}`,
      dependency: candidate.dependencies || [],
      validation_responsibility: `Validated by module ${candidate.id} tests and syntax verification`
    });
  }

  return mappings;
}

/**
 * Validates that every PRD requirement from the Requirement Contract is deterministically
 * covered by the Manifest.
 *
 * Invariant: covered_requirements === total_requirements
 * If any requirement is missing, unmapped, deferred without a reason, or invalidly mapped,
 * emits MANIFEST_INCOMPLETE and returns isValid = false.
 */
export function validateManifestRequirementCoverage(manifest, requirementContract) {
  const errors = [];
  const defects = [];

  const addError = (code, message, reqId = null) => {
    errors.push(message);
    defects.push({
      code,
      message,
      requirementId: reqId,
      severity: 'CRITICAL'
    });
  };

  // 1. Validate the Requirement Contract itself
  const contractValidation = validateRequirementContract(requirementContract);
  if (!contractValidation.isValid) {
    return {
      isValid: false,
      code: contractValidation.defects[0]?.code || MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
      errors: contractValidation.errors,
      defects: contractValidation.defects,
      coveredRequirements: 0,
      totalRequirements: contractValidation.requirementCount
    };
  }

  const expectedReqs = new Map();
  requirementContract.requirements.forEach(r => expectedReqs.set(String(r.id).trim(), r));
  const totalRequirements = expectedReqs.size;

  // 2. Build index of modules and their required files
  const moduleFileMap = new Map(); // moduleId -> Set<filePath>
  (manifest?.modules || []).forEach(m => {
    if (!m || !m.id) return;
    const fileSet = new Set();
    (m.required_files || []).forEach(f => {
      const p = typeof f === 'string' ? f : f?.path;
      if (p) fileSet.add(p.trim().replace(/\\/g, '/'));
    });
    moduleFileMap.set(m.id, fileSet);
  });

  // 3. Locate requirement mappings in manifest
  let rawMappings = manifest?.requirement_mappings || manifest?.requirementCoverage;
  if (!rawMappings && Array.isArray(manifest?.requirements)) {
    // If manifest.requirements exists, only use as mappings if items have a status field
    if (manifest.requirements.some(r => r && r.status)) {
      rawMappings = manifest.requirements;
    }
  }

  if (!rawMappings || !Array.isArray(rawMappings) || rawMappings.length === 0) {
    // If not explicitly provided, try auto-deriving if modules exist
    if (manifest?.modules && manifest.modules.length > 0) {
      rawMappings = autoDeriveRequirementMappings(manifest, requirementContract);
      if (manifest && (!manifest.requirement_mappings || !Array.isArray(manifest.requirement_mappings))) {
        manifest.requirement_mappings = rawMappings;
      }
    } else {
      addError(
        MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
        'Manifest has no requirement mappings or modules to cover PRD requirements.'
      );
      return {
        isValid: false,
        code: MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
        errors,
        defects,
        coveredRequirements: 0,
        totalRequirements
      };
    }
  }

  // 4. Map each expected requirement to its manifest declaration
  const mappedIndex = new Map(); // reqId -> mapping object
  rawMappings.forEach(item => {
    const id = item.id || item.requirementId;
    if (id) mappedIndex.set(String(id).trim(), item);
  });

  let coveredRequirements = 0;

  for (const [reqId, expectedReq] of expectedReqs.entries()) {
    if (!mappedIndex.has(reqId)) {
      addError(
        MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
        `Requirement "${reqId}" (${expectedReq.description || 'unspecified'}) cannot silently disappear. It is missing from manifest requirement mappings.`,
        reqId
      );
      continue;
    }

    const mapping = mappedIndex.get(reqId);
    const rawStatus = (mapping.status || '').toUpperCase();

    if (rawStatus === 'DEFERRED') {
      if (!mapping.reason || typeof mapping.reason !== 'string' || !mapping.reason.trim()) {
        addError(
          MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
          `Requirement "${reqId}" is marked DEFERRED but is missing an explicit non-empty reason.`,
          reqId
        );
        continue;
      }
      coveredRequirements++;
      continue;
    }

    if (rawStatus === 'SUPPORTED' || rawStatus === 'COVERED') {
      // Must map to: module, file(s), implementation_responsibility, dependency, validation_responsibility
      if (!mapping.module || !moduleFileMap.has(mapping.module)) {
        addError(
          MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
          `Requirement "${reqId}" maps to unknown module "${mapping.module}". Module must exist in manifest.modules.`,
          reqId
        );
        continue;
      }

      const files = Array.isArray(mapping.files) ? mapping.files : (mapping.mappedTo ? [mapping.mappedTo] : []);
      if (files.length === 0) {
        addError(
          MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
          `Requirement "${reqId}" has no concrete file(s) assigned in its mapping.`,
          reqId
        );
        continue;
      }

      const validModuleFiles = moduleFileMap.get(mapping.module);
      let fileMissingFromModule = false;
      for (const f of files) {
        const normalized = String(f).trim().replace(/\\/g, '/');
        if (!validModuleFiles.has(normalized)) {
          addError(
            MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
            `Requirement "${reqId}" references file "${normalized}" which is not declared in module ${mapping.module}'s required_files.`,
            reqId
          );
          fileMissingFromModule = true;
          break;
        }
      }
      if (fileMissingFromModule) continue;

      if (!mapping.implementation_responsibility && !mapping.responsibility && !mapping.reason) {
        addError(
          MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
          `Requirement "${reqId}" is missing "implementation_responsibility" describing what is implemented.`,
          reqId
        );
        continue;
      }

      if (!mapping.validation_responsibility && !mapping.validation) {
        addError(
          MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
          `Requirement "${reqId}" is missing "validation_responsibility" describing how the requirement is validated.`,
          reqId
        );
        continue;
      }

      const obligations = deriveRequirementObligations(expectedReq);
      let reqHasError = false;

      // Enforce Distinctive Feature Decomposition Completeness:
      // Verify that the requirement's specific feature domain has concrete planned implementation files
      if (obligations.distinctiveTokens.length > 0) {
        let domainHasPlannedFile = false;
        for (const fileSet of moduleFileMap.values()) {
          for (const f of fileSet) {
            const lowF = f.toLowerCase();
            if (obligations.distinctiveTokens.some(tok => {
              const stem = tok.endsWith('s') && tok.length > 4 ? tok.slice(0, -1) : tok;
              return lowF.includes(tok) || lowF.includes(stem);
            })) {
              domainHasPlannedFile = true;
              break;
            }
          }
          if (domainHasPlannedFile) break;
        }

        // Also check declared entities or module names
        const declaredEntities = (manifest?.project_requirements?.database?.entities || []).map(e => String(e).toLowerCase());
        const moduleNames = (manifest?.modules || []).map(m => String(m.name || '').toLowerCase());
        const domainCoveredInArchitecture = domainHasPlannedFile ||
          obligations.distinctiveTokens.some(tok => {
            const stem = tok.endsWith('s') && tok.length > 4 ? tok.slice(0, -1) : tok;
            return declaredEntities.some(e => e.includes(tok) || e.includes(stem) || tok.includes(e) || stem.includes(e)) ||
              moduleNames.some(mn => mn.includes(tok) || mn.includes(stem) || tok.includes(mn) || stem.includes(mn));
          });

        if (!domainCoveredInArchitecture) {
          const hasAlternativeDedicatedFeatureFile = files.some(f => {
            const base = path.basename(f).toLowerCase();
            if (obligations.isPureDatabase || obligations.isDatabaseData) {
              return base.includes('models') || base.includes('database') || base.includes('schema');
            }
            return !base.includes('models') && !base.includes('database') && !base.includes('schemas') && !base.includes('main.py') && !base.includes('app.tsx');
          });
          if (!hasAlternativeDedicatedFeatureFile) {
            const tokenNames = obligations.distinctiveTokens.join('/') || 'feature';
            addError(
              MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
              `Requirement "${reqId}" covers "${tokenNames}" feature, but no concrete implementation files for this domain are planned in manifest modules. Secondary domain features cannot be omitted from module decomposition.`,
              reqId
            );
            reqHasError = true;
          }
        }
      }

      // Enforce Requirement -> Implementation Contract obligations:
      // Do not allow model/database-only mapping to satisfy an API/UI requirement
      if (obligations.isApiBackend && !obligations.isPureDatabase) {
        const onlyDbOrModelFiles = files.every(f =>
          /(?:models?|database|db|schemas?)\.(?:py|ts|js)/i.test(f) ||
          /(?:^|\/)(?:models|db|database|schemas)(?:\/|$)/i.test(f)
        );
        if (onlyDbOrModelFiles) {
          addError(
            MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
            `Requirement "${reqId}" specifies an API/backend obligation, but is mapped only to database/model/schema files (${files.join(', ')}). Model/database-only mapping cannot satisfy an API requirement.`,
            reqId
          );
          reqHasError = true;
        }
      }

      if (obligations.isFrontendUi) {
        const hasFrontendFile = files.some(f =>
          /\.(tsx|jsx|vue|html)$/i.test(f) || f.startsWith('frontend/')
        );
        if (!hasFrontendFile) {
          addError(
            MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
            `Requirement "${reqId}" specifies a UI/frontend obligation, but contains no frontend component or page file in its mapping (${files.join(', ')}). Model/database-only mapping cannot satisfy a UI requirement.`,
            reqId
          );
          reqHasError = true;
        }
      }

      if (!reqHasError) {
        coveredRequirements++;
      }
      continue;
    }

    if (rawStatus === 'MISSING') {
      addError(
        MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
        mapping.reason || `Requirement "${reqId}" is missing from manifest modules. Secondary domain features cannot be omitted from module decomposition.`,
        reqId
      );
      continue;
    }

    addError(
      MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
      `Requirement "${reqId}" has invalid status "${mapping.status}". Every requirement must be either SUPPORTED or explicitly DEFERRED with reason.`,
      reqId
    );
  }

  const isComplete = errors.length === 0 && coveredRequirements === totalRequirements;

  if (!isComplete && errors.length === 0) {
    addError(
      MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
      `Manifest requirement coverage incomplete: covered_requirements (${coveredRequirements}) !== total_requirements (${totalRequirements}).`
    );
  }

  return {
    isValid: isComplete,
    code: isComplete ? null : MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE,
    errors,
    defects,
    coveredRequirements,
    totalRequirements,
    isComplete
  };
}

/**
 * Detects whether a raw manifest string represents truncated or incomplete JSON.
 */
export function sanitizeJsonStringLiterals(str) {
  if (!str || typeof str !== 'string') return '';
  let inString = false;
  let escaped = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }
    if (!inString) {
      if (ch === '/' && str[i + 1] === '/') {
        while (i < str.length && str[i] !== '\n') i++;
        if (i < str.length) result += '\n';
        continue;
      }
      if (ch === '/' && str[i + 1] === '*') {
        i += 2;
        while (i < str.length - 1 && !(str[i] === '*' && str[i + 1] === '/')) i++;
        i++;
        continue;
      }
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') {
        result += '\\n';
        continue;
      }
      if (ch === '\r') {
        result += '\\r';
        continue;
      }
      if (ch === '\t') {
        result += '\\t';
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 32 || (code >= 127 && code <= 159)) {
        continue;
      }
    }
    result += ch;
  }
  return result.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Detects whether a raw manifest string represents truncated or incomplete JSON.
 */
export function detectManifestJsonTruncation(rawJsonString) {
  if (!rawJsonString || typeof rawJsonString !== 'string' || !rawJsonString.trim()) {
    return { isTruncated: true, reason: 'Empty or missing JSON string.' };
  }

  let clean = rawJsonString.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
  clean = clean.trim();

  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return { isTruncated: true, reason: 'No complete enclosing curly braces found in manifest output.' };
  }

  const jsonCandidate = clean.substring(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(jsonCandidate);
    if (!parsed || typeof parsed !== 'object') {
      return { isTruncated: true, reason: 'Parsed output is not an object.' };
    }
    if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
      return { isTruncated: true, reason: 'Manifest modules array is missing or empty.' };
    }
    return { isTruncated: false, parsed };
  } catch (err) {
    // If it threw due to comments, control characters or minor formatting inside string literals, retry with sanitization
    try {
      const sanitizedCandidate = sanitizeJsonStringLiterals(jsonCandidate);
      const parsed = JSON.parse(sanitizedCandidate);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
        return { isTruncated: false, parsed };
      }
      if (parsed && typeof parsed === 'object' && (!Array.isArray(parsed.modules) || parsed.modules.length === 0)) {
        return { isTruncated: true, reason: 'Manifest modules array is missing or empty.' };
      }
    } catch (sanErr) {
      return { isTruncated: true, reason: `JSON syntax error: ${sanErr.message}` };
    }
    return { isTruncated: true, reason: `JSON syntax error: ${err.message}` };
  }
}

/**
 * Deterministically merges a continuation chunk for manifest JSON.
 * - Handles full restart replacement if nextChunk contains a complete valid JSON manifest.
 * - Strips conversational preambles and markdown fences.
 * - Deduplicates overlapping text between the end of accumulated output and the start of the chunk.
 */
export function mergeManifestContinuation(accumulatedRaw, nextChunk) {
  if (!nextChunk || typeof nextChunk !== 'string' || !nextChunk.trim()) {
    const isTrunc = detectManifestJsonTruncation(accumulatedRaw).isTruncated;
    return { merged: accumulatedRaw, progress: false, isTruncated: isTrunc, strategy: 'no_input' };
  }

  const trimmedNext = nextChunk.trim();

  // Case 1: Full restart with valid complete JSON object
  const checkFull = detectManifestJsonTruncation(trimmedNext);
  if (!checkFull.isTruncated && checkFull.parsed) {
    return {
      merged: trimmedNext,
      progress: true,
      isTruncated: false,
      strategy: 'full_restart_replacement',
      parsed: checkFull.parsed
    };
  }

  // Case 2: Incremental continuation
  let cleanNext = trimmedNext
    .replace(/^```json\r?\n?/i, '')
    .replace(/^```\r?\n?/i, '')
    .replace(/^(\.\.\.|\.\.|\u2026)\s*/, '')
    .trim();

  // Strip conversational prefixes and leading ellipses
  const conversationalPrefixes = [
    /^(\.\.\.|\.\.|\u2026)\s*/,
    /^here('?s| is) (the )?(rest|continuation|remaining)/i,
    /^continuing (from|the|with)/i,
    /^sure[,!.]?/i,
    /^certainly[,!.]?/i,
    /^below is (the )?(continuation|remaining)/i,
    /^resuming (from|with)/i,
    /^okay[,!.]?/i
  ];

  const lines = cleanNext.split(/\r?\n/);
  while (lines.length > 0 && conversationalPrefixes.some(p => p.test(lines[0].trim()))) {
    lines.shift();
  }
  cleanNext = lines.join('\n').replace(/\r?\n```\s*$/i, '').trim();

  if (cleanNext.length === 0) {
    const isTrunc = detectManifestJsonTruncation(accumulatedRaw).isTruncated;
    return { merged: accumulatedRaw, progress: false, isTruncated: isTrunc, strategy: 'stalled' };
  }

  // Remove trailing unclosed fences from accumulatedRaw
  let base = (accumulatedRaw || '').replace(/```[a-z]*\s*$/i, '').trimEnd();

  // Line-level and token-level overlap detection
  let baseLines = base.split('\n');
  const nextLines = cleanNext.split('\n');

  let overlapCount = 0;
  let lastLineReplaced = false;
  const maxOverlap = Math.min(20, baseLines.length, nextLines.length);

  for (let k = maxOverlap; k >= 1; k--) {
    const baseSlice = baseLines.slice(-k).map(l => l.trim());
    const nextSlice = nextLines.slice(0, k).map(l => l.trim());

    if (baseSlice.every(l => l.length === 0)) continue;

    let matches = true;
    for (let i = 0; i < k; i++) {
      if (i === k - 1) {
        // Last line can match exactly, or nextSlice can be a completion of baseSlice (e.g. added comma or more characters)
        if (baseSlice[i] !== nextSlice[i] && !nextSlice[i].startsWith(baseSlice[i])) {
          matches = false;
          break;
        }
      } else {
        if (baseSlice[i] !== nextSlice[i]) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      overlapCount = k;
      // If the last line of nextSlice had more characters than baseSlice, replace the entire overlap from base
      if (nextSlice[k - 1].length > baseSlice[k - 1].length) {
        lastLineReplaced = true;
      }
      break;
    }
  }

  let linesToAdd = nextLines;
  if (overlapCount > 0) {
    if (lastLineReplaced) {
      // Remove all k overlapping lines from base and take all of nextLines
      baseLines = baseLines.slice(0, -overlapCount);
      base = baseLines.join('\n');
      linesToAdd = nextLines;
    } else {
      linesToAdd = nextLines.slice(overlapCount);
    }
  } else {
    // Check if the last base line was cut off mid-token/word
    const lastBaseLine = baseLines[baseLines.length - 1];
    const firstNextLine = nextLines[0];

    if (lastBaseLine && firstNextLine && firstNextLine.trim().startsWith(lastBaseLine.trim()) && firstNextLine.trim().length > lastBaseLine.trim().length) {
      baseLines[baseLines.length - 1] = firstNextLine;
      base = baseLines.join('\n');
      linesToAdd = nextLines.slice(1);
    }
  }

  const addedText = linesToAdd.join('\n');
  if (addedText.trim().length === 0) {
    const isTrunc = detectManifestJsonTruncation(base).isTruncated;
    return { merged: base, progress: false, isTruncated: isTrunc, strategy: 'stalled' };
  }

  const separator = (base.endsWith('\n') || addedText.startsWith('\n')) ? '' : '\n';
  const merged = base + separator + addedText;

  const truncationCheck = detectManifestJsonTruncation(merged);

  return {
    merged,
    progress: true,
    isTruncated: truncationCheck.isTruncated,
    strategy: 'incremental_continuation',
    parsed: truncationCheck.isTruncated ? null : truncationCheck.parsed
  };
}
