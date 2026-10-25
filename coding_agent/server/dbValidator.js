import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { getIdePythonCandidates } from './pythonEnvironment.js';

const execAsync = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deterministic Database Phase Validator
 * Performs schema, relationship, import, migration, seed, initialization,
 * and security / credential checks returning structured defects.
 */

import {
  SECURITY_DEFECT_CODES,
  redactSecret,
  scanForCredentials,
  scanForSecuritySinks,
  validateSecurityGate
} from './securityValidator.js';

import {
  FRONTEND_DEFECT_CODES,
  validateFrontendContract
} from './frontendContractValidator.js';

import {
  BACKEND_DEFECT_CODES,
  validateBackendRuntime
} from './backendRuntimeValidator.js';

import {
  API_AUTHZ_DEFECT_CODES,
  validateApiAuthz
} from './apiAuthzValidator.js';

import {
  PRD_COVERAGE_DEFECT_CODES,
  validatePrdCoverage
} from './prdCoverageValidator.js';

export {
  redactSecret,
  scanForCredentials,
  scanForSecuritySinks,
  validateSecurityGate,
  SECURITY_DEFECT_CODES,
  FRONTEND_DEFECT_CODES,
  validateFrontendContract,
  BACKEND_DEFECT_CODES,
  validateBackendRuntime,
  API_AUTHZ_DEFECT_CODES,
  validateApiAuthz,
  PRD_COVERAGE_DEFECT_CODES,
  validatePrdCoverage
};

export const DATABASE_DEFECT_CODES = {
  CREDENTIALS_EXPOSED: 'DB001',
  SYNTAX_ERROR: 'SYN001',
  SYNTAX_VALIDATION_FAILURE: 'SYNTAX_VALIDATION_FAILURE',
  MISSING_ENTITY: 'DB_REQ001',
  BROKEN_IMPORT: 'DB_IMP001',
  IMPORT_CLOSURE_FAILURE: 'IMPORT_CLOSURE_FAILURE',
  BROKEN_RELATIONSHIP: 'DB_REL001',
  FOREIGN_KEY_FAILURE: 'DB_FK001',
  CONSTRAINT_ISSUE: 'DB_CST001',
  MIGRATION_ISSUE: 'DB_MIG001',
  SEED_ISSUE: 'DB_SED001',
  INITIALIZATION_ISSUE: 'DB_INI001',
  SEMANTIC_ISSUE: 'DB_SEM001',
  STACK_CONTRACT_MISMATCH: 'STACK_CONTRACT_MISMATCH',
  OUTPUT_FORMAT_TRUNCATED: 'OUTPUT_FORMAT_TRUNCATED',
  FILE_BOUNDARY_MISSING: 'FILE_BOUNDARY_MISSING',
  GENERATION_CONTINUATION_INVALID: 'GENERATION_CONTINUATION_INVALID',
  DUPLICATE_MODEL: 'DB_DUPLICATE_MODEL',
  ARCHITECTURAL_SEPARATION_VIOLATION: 'DB_ARCH_SEP001',
  SECURITY_FORBIDDEN_SINK: SECURITY_DEFECT_CODES.SECURITY_FORBIDDEN_SINK,
  SECURITY_SECRET_LEAK: SECURITY_DEFECT_CODES.SECURITY_SECRET_LEAK,
  SECURITY_PATH_TRAVERSAL: SECURITY_DEFECT_CODES.SECURITY_PATH_TRAVERSAL,
  FRONTEND_BUILD_FAILURE: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
  BACKEND_RUNTIME_FAILURE: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
  API_AUTHZ_FAILURE: API_AUTHZ_DEFECT_CODES.API_AUTHZ_FAILURE,
  PRD_COVERAGE_FAILURE: PRD_COVERAGE_DEFECT_CODES.PRD_COVERAGE_FAILURE
};

let _cachedPythonBin = null;
let _cachedSqlalchemyAvailable = null;
let _cachedReason = null;

export function resetSqlalchemyCache() {
  _cachedPythonBin = null;
  _cachedSqlalchemyAvailable = null;
  _cachedReason = null;
}

export function extractExecError(e) {
  if (!e) return 'execution_failed';
  if (e.stderr && typeof e.stderr === 'string' && e.stderr.trim()) {
    const firstStderr = e.stderr.trim().split('\n')[0].trim();
    if (firstStderr) return firstStderr;
  }
  if (e.message && typeof e.message === 'string') {
    const lines = e.message.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('Command failed:'));
    if (lines.length > 0) return lines[0];
    return e.message.trim().split('\n')[0].trim();
  }
  return String(e);
}

export function resolvePythonCandidates(options = {}) {
  const isWin = process.platform === 'win32';
  const projectRoot = path.resolve(__dirname, '..');
  const candidates = [];

  // 1. Explicit options.pythonBin or process.env.PYTHON_BIN
  const explicitBin = options.pythonBin || process.env.PYTHON_BIN;
  if (explicitBin && typeof explicitBin === 'string') {
    let normalizedBin = explicitBin.trim();
    if (isWin && (normalizedBin.includes('/bin/python') || normalizedBin.includes('\\bin\\python'))) {
      const winNorm = normalizedBin.replace(/[/\\]bin[/\\]python(\.exe)?$/i, () => path.join('Scripts', 'python.exe'));
      if (fs.existsSync(winNorm)) {
        normalizedBin = winNorm;
      }
    }
    candidates.push(normalizedBin);
  }

  // Prefer the shared IDE toolchain before legacy root environments.
  candidates.push(...getIdePythonCandidates(projectRoot, { includeLegacy: false }));

  // 2. Virtual environments in search directories (cwd & projectRoot)
  const searchRoots = [process.cwd(), projectRoot];
  const venvNames = ['.venv-ide', '.venv', '.venv-runtime'];

  for (const root of searchRoots) {
    for (const venv of venvNames) {
      if (isWin) {
        // Windows venv layout
        candidates.push(path.join(root, venv, 'Scripts', 'python.exe'));
        candidates.push(path.join(root, venv, 'Scripts', 'python'));
      } else {
        // POSIX venv layout
        candidates.push(path.join(root, venv, 'bin', 'python'));
        candidates.push(path.join(root, venv, 'bin', 'python3'));
      }
    }
  }

  // 3. System PATH executables
  if (isWin) {
    candidates.push('py', 'python', 'python3');
  } else {
    candidates.push('python3', 'python');
  }

  // Filter and deduplicate
  const result = [];
  const seen = new Set();

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'string') continue;
    const trimmed = cand.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);

    const isFilePath = trimmed.includes('/') || trimmed.includes('\\') || trimmed.endsWith('.exe');
    if (isFilePath) {
      // Reject file paths that do not exist on disk
      if (!fs.existsSync(trimmed)) {
        continue;
      }
      result.push(path.normalize(trimmed));
    } else {
      result.push(trimmed);
    }
  }

  return result;
}

export async function checkSqlalchemyAvailability(options = {}) {
  if (options.skipSqlalchemy) {
    return { available: false, reason: 'skipped_by_option' };
  }

  if (options.pythonBin) {
    let bin = options.pythonBin;
    if (process.platform === 'win32' && !fs.existsSync(bin) && (bin.includes('/bin/python') || bin.includes('\\bin\\python'))) {
      const winNormalized = bin.replace(/[/\\]bin[/\\]python(\.exe)?$/i, () => path.join('Scripts', 'python.exe'));
      if (fs.existsSync(winNormalized)) {
        bin = winNormalized;
      }
    }
    const isPath = bin.includes('/') || bin.includes('\\') || bin.endsWith('.exe');
    if (isPath && !fs.existsSync(bin)) {
      return { available: false, reason: `Executable path does not exist: "${bin}"` };
    }
    try {
      await execAsync(`"${bin}" -c "import sqlalchemy; from sqlalchemy.orm import configure_mappers"`);
      return { available: true, pythonBin: bin };
    } catch (e) {
      const cleanError = extractExecError(e);
      return { available: false, reason: cleanError };
    }
  }

  if (_cachedSqlalchemyAvailable !== null) {
    if (_cachedSqlalchemyAvailable) {
      return {
        available: true,
        pythonBin: _cachedPythonBin
      };
    }
    return {
      available: false,
      reason: _cachedReason || 'python_or_sqlalchemy_unavailable'
    };
  }

  const candidates = resolvePythonCandidates(options);

  let primaryEnvError = null;
  let lastError = null;

  for (const bin of candidates) {
    try {
      await execAsync(`"${bin}" -c "import sqlalchemy; from sqlalchemy.orm import configure_mappers"`);
      _cachedPythonBin = bin;
      _cachedSqlalchemyAvailable = true;
      _cachedReason = null;
      return { available: true, pythonBin: bin };
    } catch (e) {
      const errReason = extractExecError(e);
      lastError = errReason;
      if (!primaryEnvError && (bin.includes('.venv') || bin.includes('.venv-ide'))) {
        primaryEnvError = errReason;
      }
    }
  }

  _cachedSqlalchemyAvailable = false;
  _cachedPythonBin = null;
  _cachedReason = primaryEnvError || lastError || 'python_or_sqlalchemy_unavailable';
  return { available: false, reason: _cachedReason };
}

export const detectSqlAlchemyAvailability = checkSqlalchemyAvailability;

export async function validateSqlAlchemyMappers(files, options = {}) {
  const sendEvent = options.sendEvent || (() => {});
  const detection = await checkSqlalchemyAvailability(options);
  if (!detection.available) {
    sendEvent('log', `ℹ️ [sqlalchemy_validation] Python/SQLAlchemy unavailable (${detection.reason}). Falling back to deterministic AST/regex validation.`);
    return { isValid: true, skipped: true, reason: detection.reason, defects: [] };
  }

  const pyFiles = (files || []).filter(f => f.path && f.path.endsWith('.py') && f.content);
  if (pyFiles.length === 0) {
    return { isValid: true, skipped: true, reason: 'no_python_files', defects: [] };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-orm-val-'));
  try {
    for (const f of pyFiles) {
      const normPath = path.normalize(f.path).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(tmpDir, normPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, f.content, 'utf8');
    }

    const runnerScriptContent = `
import sys
import os
import json
import importlib

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"isValid": True, "defects": []}))
        return
    root = sys.argv[1]
    sys.path.insert(0, root)
    if not os.environ.get("DATABASE_URL"):
        os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    for sub in ['backend', 'app', 'src', os.path.join('backend', 'app'), os.path.join('backend', 'app', 'db'), os.path.join('backend', 'app', 'models')]:
        sp = os.path.join(root, sub)
        if os.path.isdir(sp) and sp not in sys.path:
            sys.path.insert(0, sp)

    for dirpath, dirnames, filenames in os.walk(root):
        dirpath_lower = dirpath.replace('\\\\', '/').lower()
        if any(skip in dirpath_lower for skip in ['migration', 'alembic', 'version', '.git', '__pycache__', 'node_modules', '.venv']):
            init_file = os.path.join(dirpath, '__init__.py')
            if os.path.exists(init_file):
                try:
                    os.remove(init_file)
                except Exception:
                    pass
            continue
        if dirpath != root and '__init__.py' not in filenames:
            try:
                with open(os.path.join(dirpath, '__init__.py'), 'w', encoding='utf-8') as f:
                    f.write('')
            except Exception:
                pass

    py_files = []
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith('.py') and fn != '_run_orm_validation.py':
                rel = os.path.relpath(os.path.join(dirpath, fn), root).replace('\\\\', '/')
                rel_lower = rel.lower()
                if any(skip in rel_lower for skip in ['migration', 'alembic', 'seed']):
                    continue
                py_files.append(rel)

    def sort_key(p):
        pl = p.lower()
        if 'base' in pl: return 0
        if 'database' in pl or 'session' in pl or 'connection' in pl: return 1
        if 'model' in pl: return 2
        return 3

    py_files.sort(key=sort_key)
    
    for rel_path in py_files:
        full_path = os.path.join(root, rel_path)
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception:
            continue

        if 'class ' not in content and 'declarative_base' not in content and 'DeclarativeBase' not in content:
            continue

        norm_rel = rel_path[:-3].replace('\\\\', '/').replace('/', '.')
        mod_name = norm_rel
        try:
            importlib.import_module(mod_name)
        except Exception as e:
            alt_candidates = []
            if mod_name.startswith('backend.'):
                alt_candidates.append(mod_name[8:])
            if mod_name.startswith('src.'):
                alt_candidates.append(mod_name[4:])
            if mod_name.startswith('backend.app.'):
                alt_candidates.append(mod_name[12:])
            success = False
            for alt in alt_candidates:
                try:
                    importlib.import_module(alt)
                    success = True
                    break
                except Exception:
                    pass
            if not success:
                print(json.dumps({
                    "isValid": False,
                    "failureType": "IMPORT_ERROR",
                    "exceptionClass": type(e).__name__,
                    "message": str(e),
                    "file": rel_path
                }))
                return

    try:
        from sqlalchemy.orm import configure_mappers
        configure_mappers()
        print(json.dumps({"isValid": True, "defects": []}))
    except Exception as e:
        print(json.dumps({
            "isValid": False,
            "failureType": "MAPPER_ERROR",
            "exceptionClass": type(e).__name__,
            "message": str(e)
        }))

if __name__ == '__main__':
    main()
`;

    const runnerPath = path.join(tmpDir, '_run_orm_validation.py');
    fs.writeFileSync(runnerPath, runnerScriptContent, 'utf8');

    let stdout = '';
    try {
      const res = await execAsync(`"${detection.pythonBin}" "${runnerPath}" "${tmpDir}"`, {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'sqlite:///:memory:' }
      });
      stdout = res.stdout;
    } catch (execErr) {
      stdout = execErr.stdout || execErr.stderr || execErr.message;
    }

    let parsed = null;
    try {
      const match = stdout.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (e) {
      sendEvent('log', `❌ [sqlalchemy_validation] Could not parse ORM validation output: ${stdout.slice(0, 150)}`);
      return {
        isValid: false,
        skipped: false,
        reason: 'unparseable_output',
        defects: [{
          code: DATABASE_DEFECT_CODES.SEMANTIC_ISSUE,
          validator: 'sqlalchemy_orm_mapper',
          severity: 'HIGH',
          file: pyFiles[0]?.path || null,
          message: `SQLAlchemy ORM validation output was unparseable: ${stdout.slice(0, 150)}`,
          remediation: 'Inspect Python model definitions and resolve syntax or execution errors.'
        }]
      };
    }

    if (!parsed) {
      const errorSnippet = stdout.slice(0, 200).replace(/\r?\n/g, ' ');
      sendEvent('log', `❌ [sqlalchemy_validation] Authoritative SQLAlchemy check failed to return result JSON: ${errorSnippet}`);
      return {
        isValid: false,
        skipped: false,
        reason: 'runner_execution_failure',
        defects: [{
          code: DATABASE_DEFECT_CODES.SEMANTIC_ISSUE,
          validator: 'sqlalchemy_orm_mapper',
          severity: 'HIGH',
          file: pyFiles[0]?.path || null,
          message: `Authoritative SQLAlchemy validation execution failed: ${errorSnippet}`,
          remediation: 'Inspect Python model syntax, imports, and database declarations.'
        }]
      };
    }

    if (parsed.isValid) {
      sendEvent('log', '✅ [sqlalchemy_validation] Authoritative SQLAlchemy configure_mappers() check PASSED.');
      return { isValid: true, defects: [] };
    }

    const classDefinitions = options.classDefinitions || {};
    const resolveFile = (modelName) => {
      if (modelName && classDefinitions[modelName]?.file) {
        return classDefinitions[modelName].file;
      }
      if (modelName) {
        const found = pyFiles.find(f => f.content && f.content.includes(`class ${modelName}`));
        if (found) return found.path;
      }
      const modelFile = pyFiles.find(f => f.path.includes('models') || f.path.includes('model'));
      if (modelFile) return modelFile.path;
      return pyFiles[0]?.path || null;
    };

    const defects = [];
    if (parsed.failureType === 'IMPORT_ERROR') {
      const targetFile = parsed.file ? pyFiles.find(f => f.path.endsWith(parsed.file))?.path || parsed.file : resolveFile(null);
      const isRelError = /relationship|RelationshipProperty|remote_side|remote_only|foreign_key/i.test(parsed.message || '');
      defects.push({
        code: isRelError ? DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP : DATABASE_DEFECT_CODES.BROKEN_IMPORT,
        validator: isRelError ? 'sqlalchemy_orm_relationship' : 'sqlalchemy_orm_import',
        severity: 'HIGH',
        file: targetFile,
        message: `SQLAlchemy ORM ${isRelError ? 'relationship definition failure' : 'import failure'} in ${targetFile}: ${parsed.message}`,
        remediation: isRelError
          ? `Correct relationship() keyword arguments and ensure remote_side=[id] is specified without invalid parameters.`
          : `Ensure imported module is installed and package directories are properly imported.`
      });
      return { isValid: false, defects };
    }

    const msg = parsed.message || '';
    // Pattern 1: Missing reciprocal property on target model
    const missingPropMatch = msg.match(/Mapper 'Mapper\[([A-Za-z0-9_]+)\(([^)]+)\)\]' has no property '([A-Za-z0-9_]+)'/);
    if (missingPropMatch) {
      const targetModel = missingPropMatch[1];
      const targetRel = missingPropMatch[3];
      const targetFile = resolveFile(targetModel);

      // Find source model that references this back_populates
      let sourceModel = null;
      let sourceRel = null;
      let sourceFile = null;
      for (const f of pyFiles) {
        const bpMatch = f.content.match(new RegExp(`([a-zA-Z0-9_]+)\\s*=\\s*relationship\\s*\\(\\s*['"]${targetModel}['"][^)]*back_populates\\s*=\\s*['"]${targetRel}['"]`));
        if (bpMatch) {
          sourceRel = bpMatch[1];
          sourceFile = f.path;
          const clsMatch = f.content.substring(0, bpMatch.index).match(/class\s+([A-Za-z0-9_]+)[^:]*:\s*(?:(?!class\s+)[\s\S])*$/);
          sourceModel = clsMatch ? clsMatch[1] : null;
          break;
        }
      }

      defects.push({
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        file: targetFile,
        model: targetModel,
        relationship: targetRel,
        sourceFile,
        sourceModel,
        sourceRelationship: sourceRel,
        targetModel,
        expectedReciprocal: `${targetModel}.${targetRel}`,
        expectedBackPopulates: sourceRel || null,
        actualState: 'missing',
        message: `${targetModel}.${targetRel} reciprocal relationship is missing in '${targetFile}': ${msg}`,
        remediation: `Define reciprocal relationship '${targetRel}' on model '${targetModel}' targeting '${sourceModel || 'source model'}'.`
      });
      return { isValid: false, defects };
    }

    // Pattern 2: Unknown target model in relationship
    const unknownTargetMatch = msg.match(/Mapper\[([A-Za-z0-9_]+)\(([^)]+)\)\][\s\S]*failed to locate a name \('([A-Za-z0-9_]+)'\)/);
    if (unknownTargetMatch) {
      const sourceModel = unknownTargetMatch[1];
      const targetModel = unknownTargetMatch[3];
      const sourceFile = resolveFile(sourceModel);

      defects.push({
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        file: sourceFile,
        model: sourceModel,
        targetModel,
        actualState: 'unknown_target_model',
        message: `Model '${sourceModel}' relationship references unknown model '${targetModel}': ${msg}`,
        remediation: `Ensure model '${targetModel}' is defined and imported in '${sourceFile}'.`
      });
      return { isValid: false, defects };
    }

    // Pattern 3: No foreign keys linking parent/child
    const noFkMatch = msg.match(/relationship ([A-Za-z0-9_]+)\.([a-zA-Z0-9_]+) - there are no foreign keys/);
    if (noFkMatch) {
      const model = noFkMatch[1];
      const rel = noFkMatch[2];
      const targetFile = resolveFile(model);

      defects.push({
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        file: targetFile,
        model,
        relationship: rel,
        actualState: 'no_foreign_keys',
        message: `Relationship '${model}.${rel}' has no foreign keys linking parent and child tables: ${msg}`,
        remediation: `Define ForeignKey linking '${model}' and target table, or specify join condition.`
      });
      return { isValid: false, defects };
    }

    // Pattern 4: NoReferencedTableError
    const missingTableMatch = msg.match(/column '([^']+)' could not find table '([^']+)'/);
    if (missingTableMatch) {
      const col = missingTableMatch[1];
      const missingTable = missingTableMatch[2];
      const targetFile = resolveFile(null);

      defects.push({
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        secondaryCode: DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        file: targetFile,
        targetTable: missingTable,
        actualState: 'missing_referenced_table',
        message: `Column '${col}' references unknown table '${missingTable}': ${msg}`,
        remediation: `Ensure database table '${missingTable}' is defined or update ForeignKey to reference an existing table.`
      });
      return { isValid: false, defects };
    }

    // Pattern 4b: NoReferencedColumnError
    const missingColMatch = msg.match(/table '([^']+)' has no column named '([^']+)'/i);
    if (missingColMatch) {
      const targetTable = missingColMatch[1];
      const targetCol = missingColMatch[2];
      const targetFile = resolveFile(null);

      defects.push({
        code: DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        file: targetFile,
        targetTable,
        targetColumn: targetCol,
        actualState: 'missing_referenced_column',
        message: `Table '${targetTable}' has no column named '${targetCol}': ${msg}`,
        remediation: `Ensure table '${targetTable}' defines column '${targetCol}', or update ForeignKey to reference an existing column.`
      });
      return { isValid: false, defects };
    }

    // Fallback Pattern 5: Generic mapper error
    const anyClassMatch = Object.keys(classDefinitions).find(cls => msg.includes(cls));
    const targetFile = resolveFile(anyClassMatch);
    defects.push({
      code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
      validator: 'sqlalchemy_orm_mapper',
      severity: 'HIGH',
      file: targetFile,
      model: anyClassMatch || null,
      actualState: 'mapper_error',
      message: `SQLAlchemy mapper configuration failed: ${msg}`,
      remediation: `Inspect model declarations and repair ORM relationships.`
    });
    return { isValid: false, defects };

  } catch (err) {
    sendEvent('log', `❌ [sqlalchemy_validation] Unexpected error during sandbox ORM validation: ${err.message}`);
    return {
      isValid: false,
      skipped: false,
      error: err.message,
      defects: [{
        code: DATABASE_DEFECT_CODES.SEMANTIC_ISSUE,
        validator: 'sqlalchemy_orm_mapper',
        severity: 'HIGH',
        message: `Unexpected error during sandbox ORM validation: ${err.message}`,
        remediation: 'Inspect model declarations and database configuration.'
      }]
    };
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

/**
 * Automatically reconciles missing SQLAlchemy ORM/Core types and standard imports
 * (e.g. Boolean, DateTime, Float, ForeignKey, Text, datetime, os) in Python files.
 */
export function reconcileSqlAlchemyImports(sourceCode, sendEvent = () => {}) {
  if (!sourceCode || typeof sourceCode !== 'string') return sourceCode;
  let content = sourceCode;

  // 0. Strip keyword arguments erroneously imported as symbols from sqlalchemy or sqlalchemy.orm
  content = content.replace(/(from\s+sqlalchemy(?:\.orm)?\s+import\s+[^;\n#]+)/g, (match) => {
    return match.replace(/\b(?:back_populates|foreign_keys|cascade|lazy|order_by)\b\s*,?\s*/g, '').replace(/,\s*$/, '');
  });

  // 1. Python standard library imports
  // datetime
  if (/\bdatetime\b/.test(content)) {
    if (!/from\s+datetime\s+import\s+[^;\n]*\bdatetime\b/.test(content)) {
      content = 'from datetime import datetime\n' + content;
      sendEvent('log', '🩹 [db_normalize] Injected missing from datetime import datetime.');
    }
  }

  // func
  if (/\bfunc\b/.test(content)) {
    if (!/from\s+sqlalchemy(?:\.[a-z_]+)?\s+import\s+[^;\n]*\bfunc\b/.test(content)) {
      content = 'from sqlalchemy import func\n' + content;
      sendEvent('log', '🩹 [db_normalize] Injected missing from sqlalchemy import func.');
    }
  }

  // os
  if (/\bos\.(?:getenv|environ)\b/.test(content)) {
    if (!/(?:import\s+os\b|from\s+os\b)/.test(content)) {
      content = 'import os\n' + content;
      sendEvent('log', '🩹 [db_normalize] Injected missing import os.');
    }
  }

  // 2. SQLAlchemy ORM symbols (from sqlalchemy.orm import ...)
  const ormSymbols = ['relationship', 'backref', 'declarative_base', 'DeclarativeBase', 'validates', 'sessionmaker', 'Session'];
  for (const sym of ormSymbols) {
    const symRegex = new RegExp(`\\b${sym}\\b`);
    if (symRegex.test(content)) {
      const isImported = (
        new RegExp(`from\\s+sqlalchemy\\.orm\\s+import\\s*\\([\\s\\S]*?\\b${sym}\\b[\\s\\S]*?\\)`).test(content) ||
        new RegExp(`from\\s+sqlalchemy\\.orm\\s+import\\s+[^;\\n(]*\\b${sym}\\b`).test(content) ||
        new RegExp(`from\\s+sqlalchemy\\s+import\\s*\\([\\s\\S]*?\\b${sym}\\b[\\s\\S]*?\\)`).test(content) ||
        new RegExp(`from\\s+sqlalchemy\\s+import\\s+[^;\\n(]*\\b${sym}\\b`).test(content)
      );
      if (!isImported) {
        const parenMatch = content.match(/from\s+sqlalchemy\.orm\s+import\s*\([\s\S]*?\)/);
        if (parenMatch) {
          content = content.replace(/(from\s+sqlalchemy\.orm\s+import\s*\()([\s\S]*?)(\))/, (m, p1, p2, p3) => {
            const trimmed = p2.trimEnd();
            const delimiter = trimmed.length > 0 && !trimmed.endsWith(',') ? ',\n    ' : '\n    ';
            return `${p1}${trimmed}${delimiter}${sym},\n${p3}`;
          });
          sendEvent('log', `🩹 [db_normalize] Re-exported ${sym} from sqlalchemy.orm.`);
        } else if (/from\s+sqlalchemy\.orm\s+import\s+[^;\n(]*/.test(content)) {
          content = content.replace(/(from\s+sqlalchemy\.orm\s+import\s+[^;\n(]*)/, `$1, ${sym}`);
          sendEvent('log', `🩹 [db_normalize] Re-exported ${sym} from sqlalchemy.orm.`);
        } else if (/from\s+sqlalchemy\s+import\s+[^;\n(]*/.test(content)) {
          content = content.replace(/(from\s+sqlalchemy\s+import\s+[^;\n(]*)/, `from sqlalchemy.orm import ${sym}\n$1`);
          sendEvent('log', `🩹 [db_normalize] Injected from sqlalchemy.orm import ${sym}.`);
        } else {
          content = `from sqlalchemy.orm import ${sym}\n` + content;
          sendEvent('log', `🩹 [db_normalize] Injected from sqlalchemy.orm import ${sym}.`);
        }
      }
    }
  }

  // 3. SQLAlchemy core types and schema elements (from sqlalchemy import ...)
  const coreSymbols = [
    'Column', 'Integer', 'BigInteger', 'SmallInteger', 'String', 'Float',
    'DateTime', 'Date', 'Time', 'Boolean', 'Text', 'ForeignKey', 'Numeric',
    'DECIMAL', 'Enum', 'JSON', 'LargeBinary', 'func', 'UniqueConstraint',
    'CheckConstraint', 'Index', 'Table', 'ForeignKeyConstraint'
  ];

  for (const sym of coreSymbols) {
    const symRegex = new RegExp(`\\b${sym}\\b`);
    if (symRegex.test(content)) {
      const isImported = (
        new RegExp(`from\\s+sqlalchemy(?:\\.[a-z_]+)?\\s+import\\s*\\([\\s\\S]*?\\b${sym}\\b[\\s\\S]*?\\)`).test(content) ||
        new RegExp(`from\\s+sqlalchemy(?:\\.[a-z_]+)?\\s+import\\s+[^;\\n(]*\\b${sym}\\b`).test(content)
      );
      if (!isImported) {
        const parenMatch = content.match(/from\s+sqlalchemy\s+import\s*\([\s\S]*?\)/);
        if (parenMatch) {
          content = content.replace(/(from\s+sqlalchemy\s+import\s*\()([\s\S]*?)(\))/, (m, p1, p2, p3) => {
            const trimmed = p2.trimEnd();
            const delimiter = trimmed.length > 0 && !trimmed.endsWith(',') ? ',\n    ' : '\n    ';
            return `${p1}${trimmed}${delimiter}${sym},\n${p3}`;
          });
          sendEvent('log', `🩹 [db_normalize] Re-exported ${sym} from sqlalchemy.`);
        } else if (/from\s+sqlalchemy\s+import\s+[^;\n(]*/.test(content)) {
          content = content.replace(/(from\s+sqlalchemy\s+import\s+[^;\n(]*)/, `$1, ${sym}`);
          sendEvent('log', `🩹 [db_normalize] Re-exported ${sym} from sqlalchemy.`);
        } else if (/from\s+sqlalchemy\.orm\s+import\s+[^;\n(]*/.test(content)) {
          content = content.replace(/(from\s+sqlalchemy\.orm\s+import\s+[^;\n(]*)/, `from sqlalchemy import ${sym}\n$1`);
          sendEvent('log', `🩹 [db_normalize] Injected from sqlalchemy import ${sym}.`);
        } else {
          content = `from sqlalchemy import ${sym}\n` + content;
          sendEvent('log', `🩹 [db_normalize] Injected from sqlalchemy import ${sym}.`);
        }
      }
    }
  }

  return content;
}

/**
 * Deterministically normalizes database layer files before semantic validation:
 * 0. Strips hardcoded DB credentials from database.py and env.py, replacing them with os.getenv("DATABASE_URL") (DB001 prevention).
 * 1. Corrects non-canonical Base imports in seed.py.
 * 2. Prunes duplicate ORM model declarations from Alembic migration script.py.
 * 3. Auto-defines missing referenced models (e.g. Customer, User) and cleans self-referential relationship loops in models.py.
 */
export function normalizeDatabaseLayerFiles(files, manifest, options = {}, sendEvent = () => {}) {
  const wsPath = options.workspacePath || null;
  const modelsFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]models\.py$/i.test(f.path));
  const baseFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]base\.py$/i.test(f.path));
  const seedFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]seed\.py$/i.test(f.path));
  const scriptFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]migrations[/\\]script\.py$/i.test(f.path));
  const databaseFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]database\.py$/i.test(f.path));
  const envMigFile = files.find(f => f && f.path && /backend[/\\]app[/\\]db[/\\]migrations[/\\]env\.py$/i.test(f.path));

  // 0. DETERMINISTIC CREDENTIAL SANITIZER (DB001 prevention — runs before any validation)
  // Replaces hardcoded DB connection URIs in database.py and migrations/env.py with os.getenv("DATABASE_URL") so that
  // the security gate never fires for these files. This eliminates the LLM repair loop oscillation for the most
  // common generation defect pattern where models produce `postgresql://user:pass@host/db` or `sqlite:///./app.db`
  // directly instead of reading from the environment.
  const sanitizeDatabaseCredentials = (fileObj, label) => {
    if (!fileObj || !fileObj.content) return;
    let content = fileObj.content;
    let modified = false;

    // Pattern A: create_engine("<hardcoded_uri>") → create_engine(os.getenv("DATABASE_URL", "sqlite:///./app.db"))
    // Matches both single and double quoted URIs with scheme://... inside create_engine(...)
    const createEngineHardcoded = content.replace(
      /create_engine\(\s*(['"])(?!os\.getenv|process\.env)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?|mongodb(?:\+srv)?):\/\/[^'"\s]+\1/gi,
      'create_engine(os.getenv("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (createEngineHardcoded !== content) {
      content = createEngineHardcoded;
      modified = true;
      sendEvent('log', `🩹 [db_normalize] Sanitized hardcoded create_engine URI to os.getenv("DATABASE_URL") in ${label}.`);
    }

    // Pattern B: SQLALCHEMY_DATABASE_URL = "<hardcoded_uri>" (variable assignment form)
    const varAssignHardcoded = content.replace(
      /^([ \t]*(?:SQLALCHEMY_)?DATABASE_URL\s*=\s*)(['"])(?!os\.getenv|process\.env|\{)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"\s]+\2/gm,
      '$1os.getenv("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (varAssignHardcoded !== content) {
      content = varAssignHardcoded;
      modified = true;
      sendEvent('log', `🩹 [db_normalize] Sanitized hardcoded DATABASE_URL variable to os.getenv("DATABASE_URL") in ${label}.`);
    }

    // Pattern C: alembic env.py — config.set_main_option("sqlalchemy.url", "<hardcoded>") → use env var
    const alembicSetMain = content.replace(
      /config\.set_main_option\(\s*['"]sqlalchemy\.url['"]\s*,\s*['"](?!os\.getenv|\{|%\()(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"]+['"]\s*\)/gi,
      'config.set_main_option("sqlalchemy.url", os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url")))'
    );
    if (alembicSetMain !== content) {
      content = alembicSetMain;
      modified = true;
      sendEvent('log', `🩹 [db_normalize] Sanitized hardcoded sqlalchemy.url in alembic config.set_main_option in ${label}.`);
    }

    // Pattern D: url = "<hardcoded_uri>" inside run_migrations_online() (alembic env.py pattern)
    const alembicConnUrl = content.replace(
      /(connectable\s*=\s*create_engine\()(['"])(?!os\.getenv)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"\s]+\2/gi,
      '$1os.environ.get("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (alembicConnUrl !== content) {
      content = alembicConnUrl;
      modified = true;
      sendEvent('log', `🩹 [db_normalize] Sanitized hardcoded connectable create_engine URI in ${label}.`);
    }

    // Ensure `import os` is present if we just added os.getenv/os.environ
    if (modified && content.includes('os.') && !/^import os\b/m.test(content)) {
      content = 'import os\n' + content;
      sendEvent('log', `🩹 [db_normalize] Injected missing 'import os' into ${label}.`);
    }

    if (modified) {
      fileObj.content = content;
      if (wsPath) {
        try { fs.writeFileSync(path.resolve(wsPath, fileObj.path), content, 'utf8'); } catch (_) {}
      }
    }
  };

  sanitizeDatabaseCredentials(databaseFile, 'database.py');
  sanitizeDatabaseCredentials(envMigFile, 'migrations/env.py');
  const allEnvFiles = files.filter(f => f && f.path && /alembic\/env\.py$/i.test(f.path));
  for (const envF of allEnvFiles) {
    sanitizeDatabaseCredentials(envF, envF.path);
  }

  // 1. Normalize seed.py imports
  if (seedFile && seedFile.content) {
    let seedModified = false;
    if (/Base\s*=\s*from\s+/.test(seedFile.content)) {
      seedFile.content = seedFile.content.replace(/Base\s*=\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+Base/g, 'from $1 import Base');
      seedModified = true;
    }
    if (seedFile.content.includes('from app.db.models import Base')) {
      seedFile.content = seedFile.content.replace(/from\s+app\.db\.models\s+import\s+Base/g, 'from app.db.database import Base');
      seedModified = true;
    }
    if (/from\s+app\.models\.[a-zA-Z0-9_]+\s+import\s+/.test(seedFile.content)) {
      seedFile.content = seedFile.content.replace(/from\s+app\.models\.[a-zA-Z0-9_]+\s+import\s+/g, 'from app.db.models import ');
      seedModified = true;
    }
    if (seedModified) {
      if (wsPath) {
        try { fs.writeFileSync(path.resolve(wsPath, seedFile.path), seedFile.content, 'utf8'); } catch (_) {}
      }
      sendEvent('log', '🩹 [db_normalize] Corrected Base and model imports in seed.py.');
    }
  }

  // 1a. Deterministically normalize Base imports across all DB layer files to the canonical Base module
  let canonicalBaseModule = null;
  if (baseFile && baseFile.content && (baseFile.content.includes('declarative_base(') || /class\s+Base\s*[(:]/.test(baseFile.content))) {
    canonicalBaseModule = baseFile.path.replace(/^(?:backend\/)?/, '').replace(/\.py$/, '').replace(/\//g, '.');
  } else if (databaseFile && databaseFile.content && (databaseFile.content.includes('declarative_base(') || /class\s+Base\s*[(:]/.test(databaseFile.content))) {
    canonicalBaseModule = databaseFile.path.replace(/^(?:backend\/)?/, '').replace(/\.py$/, '').replace(/\//g, '.');
  }

  if (canonicalBaseModule) {
    for (const f of files) {
      if (!f || !f.path || !f.content || !f.path.endsWith('.py')) continue;
      // Do not touch the canonical Base file itself
      if (baseFile && f.path === baseFile.path) continue;
      if (!baseFile && databaseFile && f.path === databaseFile.path) continue;

      let fileModified = false;
      const content = f.content;

      // Replace any non-canonical Base import line
      const baseImportRegex = /^([ \t]*from\s+)([a-zA-Z0-9_.]+)(\s+import\s+[^#\n]*\bBase\b[^#\n]*)$/gm;
      const normalizedContent = content.replace(baseImportRegex, (match, prefix, modSource, suffix) => {
        if (modSource === canonicalBaseModule || modSource.endsWith('.' + canonicalBaseModule)) {
          return match;
        }
        const importedSymbols = suffix.replace(/^\s*import\s+/, '').split(',').map(s => s.trim()).filter(Boolean);
        const nonBaseSymbols = importedSymbols.filter(s => s !== 'Base');
        fileModified = true;
        if (nonBaseSymbols.length > 0) {
          return `${prefix}${canonicalBaseModule} import Base\n${prefix}${modSource} import ${nonBaseSymbols.join(', ')}`;
        } else {
          return `${prefix}${canonicalBaseModule} import Base`;
        }
      });

      if (fileModified) {
        f.content = normalizedContent;
        if (wsPath) {
          try { fs.writeFileSync(path.resolve(wsPath, f.path), normalizedContent, 'utf8'); } catch (_) {}
        }
        sendEvent('log', `🩹 [db_normalize] Aligned Base import to canonical '${canonicalBaseModule}' in ${f.path}.`);
      }
    }
  }

  // 1b. Normalize base.py (strip duplicate ORM model declarations - base.py owns only Base definition)
  if (baseFile && baseFile.content && modelsFile && modelsFile.content) {
    let baseModified = false;
    const modelClasses = [...modelsFile.content.matchAll(/class\s+([A-Za-z0-9_]+)\s*\([^)]*Base[^)]*\):/g)].map(m => m[1]);
    for (const mName of modelClasses) {
      const clsRegex = new RegExp(`class\\s+${mName}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\nclass\\s+|\\ndef\\s+|\\nif\\s+__name__|$)`, 'g');
      if (clsRegex.test(baseFile.content)) {
        baseFile.content = baseFile.content.replace(clsRegex, '').trim() + '\n';
        baseModified = true;
      }
    }
    if (baseModified) {
      if (wsPath) {
        try { fs.writeFileSync(path.resolve(wsPath, baseFile.path), baseFile.content, 'utf8'); } catch (_) {}
      }
      sendEvent('log', '🩹 [db_normalize] Pruned duplicate ORM model classes from base.py.');
    }
  }

  // 2. Normalize script.py (strip duplicate ORM model declarations and rogue env.py offline_mode logic)
  if (scriptFile && scriptFile.content) {
    let scriptModified = false;
    if (scriptFile.content.includes('context.is_offline_mode')) {
      scriptFile.content = scriptFile.content.replace(/(\ndef\s+downgrade\(\):[\s\S]*?)(?:\r?\n\s*<?\/?(?:if\s+)?context\.is_offline_mode[\s\S]*)$/i, '$1\n');
      scriptModified = true;
    }
    if (/^\s*<\/[a-zA-Z0-9_.:-]+/m.test(scriptFile.content)) {
      scriptFile.content = scriptFile.content.replace(/^\s*<\/[a-zA-Z0-9_.:-]+[^\n]*\r?\n?/gm, '');
      scriptModified = true;
    }
    if (modelsFile && modelsFile.content) {
      const modelClasses = [...modelsFile.content.matchAll(/class\s+([A-Za-z0-9_]+)\s*\(\s*Base\s*\):/g)].map(m => m[1]);
      for (const mName of modelClasses) {
        const clsRegex = new RegExp(`class\\s+${mName}\\s*\\([^)]*\\):[\\s\\S]*?(?=\\nclass\\s+|\\ndef\\s+|\\nif\\s+__name__|$)`, 'g');
        if (clsRegex.test(scriptFile.content)) {
          scriptFile.content = scriptFile.content.replace(clsRegex, '').trim();
          scriptModified = true;
        }
      }
    }
    if (/server_default\s*=\s*(?:DateTime|datetime|dt)\.(?:now|utcnow)(?:\(\s*\))?/i.test(scriptFile.content)) {
      scriptFile.content = scriptFile.content.replace(/server_default\s*=\s*(?:DateTime|datetime|dt)\.(?:now|utcnow)(?:\(\s*\))?/gi, 'server_default=sa.func.now()');
      scriptModified = true;
      sendEvent('log', '🩹 [db_normalize] Corrected server_default datetime calls to sa.func.now() in Alembic migration script.');
    }
    if (scriptModified) {
      if (wsPath) {
        try { fs.writeFileSync(path.resolve(wsPath, scriptFile.path), scriptFile.content, 'utf8'); } catch (_) {}
      }
      sendEvent('log', '🩹 [db_normalize] Pruned duplicate ORM model classes and rogue offline_mode blocks from Alembic migration script.');
    }
  }

  // 3. Normalize models.py (auto-create missing referenced entities & clean invalid reciprocal loops)
  if (modelsFile && modelsFile.content) {
    let content = modelsFile.content;
    let modified = false;

    // Fix SQLAlchemy DateTime defaults & server_default assignments:
    // In SQLAlchemy, server_default expects a SQL text/clause expression (e.g. func.now()), NOT a Python datetime instance.
    // Passing server_default=datetime.utcnow() raises ArgumentError: Argument 'arg' is expected to be one of type '<class 'str'>' or '<class 'ClauseElement'>'... got datetime.datetime.
    // Converting server_default with Python datetime to default=datetime.utcnow establishes proper Python-side ORM defaults.
    if (/server_default\s*=\s*['"]?(?:DateTime|datetime|dt)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)(?:\(\s*\))?['"]?/i.test(content)) {
      content = content.replace(/server_default\s*=\s*['"]?(?:DateTime|datetime|dt)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)(?:\(\s*\))?['"]?/gi, 'default=datetime.utcnow');
      modified = true;
      sendEvent('log', '🩹 [db_normalize] Corrected server_default datetime to default=datetime.utcnow in models.py.');
    }

    // Fix default/onupdate with called parentheses (e.g. default=datetime.utcnow() -> default=datetime.utcnow callable reference)
    if (/(?:default|onupdate)\s*=\s*(?:DateTime|datetime|dt)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)\s*\(\s*\)/i.test(content)) {
      content = content.replace(/(\b(?:default|onupdate)\s*=\s*)(?:DateTime|datetime|dt)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)\s*\(\s*\)/gi, '$1datetime.utcnow');
      modified = true;
      sendEvent('log', '🩹 [db_normalize] Converted executed datetime.utcnow() to callable reference in models.py.');
    }

    // Fix remaining standalone DateTime.now() references to datetime.utcnow
    if (/(?:DateTime|datetime)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)\s*(?:\(\s*\))?/.test(content)) {
      content = content.replace(/(?:DateTime|datetime)(?:\.(?:datetime|DateTime))?\.(?:now|utcnow)\s*(?:\(\s*\))?/g, 'datetime.utcnow');
      if (!/from\s+datetime\s+import\s+[^;\n]*\bdatetime\b/.test(content)) {
        content = 'from datetime import datetime\n' + content;
      }
      modified = true;
      sendEvent('log', '🩹 [db_normalize] Corrected DateTime.now() to datetime.utcnow in models.py.');
    }

    // Reconcile missing SQLAlchemy & standard library imports
    const beforeImports = content;
    content = reconcileSqlAlchemyImports(content, sendEvent);
    if (content !== beforeImports) modified = true;

    // Remove invalid self-referential relationships without parent foreign keys (e.g. addresses = relationship("Address", back_populates="addresses"))
    const selfRelRegex = /\n\s*([a-zA-Z0-9_]+)\s*=\s*relationship\s*\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*back_populates\s*=\s*['"]\1['"]\s*\)/g;
    if (selfRelRegex.test(content)) {
      content = content.replace(selfRelRegex, '');
      modified = true;
    }

    // Extract defined classes and tables
    const definedClasses = new Set([...content.matchAll(/class\s+([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]));
    const definedTables = new Set([...content.matchAll(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/g)].map(m => m[1]));

    const missingCandidates = new Map(); // EntityName -> { table: string, reciprocalRels: [] }

    // Only auto-define missing required entities declared in manifest or architecture contract that the LLM omitted
    const reqEntities = [
      ...(manifest?.project_requirements?.database?.entities || []),
      ...(manifest?.architectureContract?.entities || []).map(e => typeof e === 'string' ? e : e?.name).filter(Boolean)
    ];
    for (const reqEnt of reqEntities) {
      if (!definedClasses.has(reqEnt)) {
        let tblName = reqEnt.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2');
        if (tblName.endsWith('y') && !tblName.endsWith('ey')) tblName = tblName.slice(0, -1) + 'ies';
        else if (!tblName.endsWith('s')) tblName += 's';
        if (!definedTables.has(tblName) && !missingCandidates.has(reqEnt)) {
          missingCandidates.set(reqEnt, { table: tblName, reciprocalRels: [] });
        }
      }
    }

    // Parse class blocks properly
    const parseClassBlocks = (sourceCode) => {
      const blocks = [];
      const parts = sourceCode.split(/\n(?=class\s+[A-Za-z0-9_]+)/);
      for (const p of parts) {
        const m = p.match(/^class\s+([A-Za-z0-9_]+)/);
        if (m) blocks.push({ className: m[1], block: p });
      }
      return blocks;
    };

    for (const [eName, info] of missingCandidates) {
      if (definedClasses.has(eName)) continue;

      const existingBlocks = parseClassBlocks(content);
      for (const { className: sourceModel, block } of existingBlocks) {
        const relInBlock = new RegExp(`([a-zA-Z0-9_]+)\\s*=\\s*relationship\\s*\\(\\s*['"]${eName}['"]\\s*,\\s*back_populates\\s*=\\s*['"]([a-zA-Z0-9_]+)['"]`, 'g');
        let rm;
        while ((rm = relInBlock.exec(block)) !== null) {
          const propOnTarget = rm[2];
          const propOnSource = rm[1];
          if (!info.reciprocalRels.some(r => r.propName === propOnTarget)) {
            info.reciprocalRels.push({
              propName: propOnTarget,
              targetModel: sourceModel,
              backPop: propOnSource
            });
          }
        }
      }

      // Synthesize missing required ORM model class
      let modelClass = `\nclass ${eName}(Base):\n    __tablename__ = "${info.table}"\n\n    id = Column(Integer, primary_key=True)\n`;
      if (eName === 'Customer' || eName === 'User' || eName.endsWith('User') || eName === 'Member' || eName === 'Patient') {
        modelClass += `    name = Column(String, nullable=True)\n    email = Column(String, unique=True, nullable=True)\n    password = Column(String, nullable=True)\n    is_active = Column(Boolean, default=True)\n    created_date = Column(DateTime, default=datetime.utcnow)\n`;
      } else if (eName === 'Payment' || eName === 'Transaction' || eName === 'Billing') {
        const orderFk = definedTables.has('orders') ? `    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)\n` : '';
        modelClass += `${orderFk}    amount = Column(Float, default=0.0)\n    status = Column(String, default="PENDING")\n    payment_method = Column(String, default="standard")\n    created_date = Column(DateTime, default=datetime.utcnow)\n`;
      } else {
        modelClass += `    name = Column(String, nullable=True)\n    status = Column(String, default="ACTIVE")\n    created_date = Column(DateTime, default=datetime.utcnow)\n`;
      }

      for (const rel of info.reciprocalRels) {
        modelClass += `    ${rel.propName} = relationship("${rel.targetModel}", back_populates="${rel.backPop}")\n`;
      }

      content += '\n' + modelClass;
      definedClasses.add(eName);
      definedTables.add(info.table);
      modified = true;
      sendEvent('log', `🩹 [db_normalize] Auto-synthesized missing required model ${eName} in models.py.`);
    }

    // Reconcile missing SQLAlchemy & standard library imports after model synthesis
    const afterSynthImports = content;
    content = reconcileSqlAlchemyImports(content, sendEvent);
    if (content !== afterSynthImports) modified = true;

    // Sanitize misnamed plural relationships on models with scalar ForeignKeys (e.g. Order.customers -> Order.customer)
    const blocksBeforeRel = parseClassBlocks(content);
    for (const b of blocksBeforeRel) {
      const fkMatches = [...b.block.matchAll(/\b([a-zA-Z0-9_]+)_id\s*=\s*Column\s*\([^)]*ForeignKey\s*\(\s*['"]([a-zA-Z0-9_]+)\.id['"]/g)];
      for (const fkm of fkMatches) {
        const singularName = fkm[1];
        const pluralName = singularName.endsWith('y') ? singularName.slice(0, -1) + 'ies' : singularName + 's';
        const pluralRelRegex = new RegExp(`(\\n[ \\t]*)${pluralName}\\s*=\\s*relationship\\s*\\(\\s*['"]([A-Za-z0-9_]+)['"]([^)]*)\\)`);
        const pluralRelMatch = b.block.match(pluralRelRegex);
        if (pluralRelMatch) {
          const targetEntity = pluralRelMatch[2];
          const restArgs = pluralRelMatch[3];
          const singularRelRegex = new RegExp(`\\n[ \\t]*${singularName}\\s*=\\s*relationship`);
          if (singularRelRegex.test(b.block)) {
            content = content.replace(pluralRelMatch[0], '');
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Pruned redundant plural relationship ${b.className}.${pluralName} in favor of ${singularName}.`);
          } else {
            const newRelDef = `${pluralRelMatch[1]}${singularName} = relationship("${targetEntity}"${restArgs})`;
            content = content.replace(pluralRelMatch[0], newRelDef);
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Corrected scalar relationship name ${b.className}.${pluralName} -> ${singularName}.`);
          }
        }
      }
    }

    // Bidirectional back_populates reconciliation across all models
    const classBlocks = parseClassBlocks(content);
    for (const source of classBlocks) {
      const relMatches = [...source.block.matchAll(/(?:([a-zA-Z0-9_]+)\s*=\s*)?relationship\s*\(([^)]*)\)/g)];
      for (const rm of relMatches) {
        const localRelName = rm[1];
        const relArgs = rm[2];
        if (!localRelName || !relArgs) continue;

        const bpMatch = relArgs.match(/\bback_populates\s*=\s*['"]([A-Za-z0-9_]+)['"]/i);
        if (!bpMatch) continue;
        const targetRelName = bpMatch[1];

        const targetClassMatch = relArgs.match(/^\s*['"]([A-Za-z0-9_]+)['"]/) ||
                                 relArgs.match(/\bargument\s*=\s*['"]?([A-Za-z0-9_]+)['"]?/) ||
                                 relArgs.match(/^\s*([A-Za-z0-9_]+)\b/);
        const targetClass = targetClassMatch ? targetClassMatch[1] : null;
        let currentDef = rm[0];
        let currentArgs = relArgs;


        // Strip invalid or hallucinated relationship arguments like remote_only
        if (currentArgs.includes('remote_only')) {
          const strippedRelDef = currentDef.replace(/,\s*remote_only\s*=\s*[^,)]+/g, '').replace(/remote_only\s*=\s*[^,)]+,\s*/g, '');
          if (strippedRelDef !== currentDef) {
            content = content.replace(currentDef, strippedRelDef);
            currentDef = strippedRelDef;
            currentArgs = currentArgs.replace(/,\s*remote_only\s*=\s*[^,)]+/g, '').replace(/remote_only\s*=\s*[^,)]+,\s*/g, '');
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Stripped invalid remote_only argument from ${source.className}.${localRelName}.`);
          }
        }

        // Auto-inject remote_side=[id] for self-referential relationships (e.g. Category.parent -> Category)
        if (targetClass === source.className) {
          const isCollection = /children|subordinates|subcategories|items/i.test(localRelName) || 
                               (localRelName.endsWith('s') && !/parent|boss|manager/i.test(localRelName));
          const isScalarParent = /parent|manager|supervisor|master|ancestor|boss/i.test(localRelName) ||
                                 /children|subordinates|subcategories|items/i.test(targetRelName);

          if (isCollection && currentArgs.includes('remote_side')) {
            // Strip remote_side from collection side if mistakenly placed
            const newDef = currentDef.replace(/,\s*remote_side=\[[^\]]+\]/, '').replace(/remote_side=\[[^\]]+\],\s*/, '');
            if (newDef !== currentDef) {
              content = content.replace(currentDef, newDef);
              currentDef = newDef;
              modified = true;
              sendEvent('log', `🩹 [db_normalize] Removed redundant remote_side from collection relationship ${source.className}.${localRelName}.`);
            }
          } else if (isScalarParent && !isCollection && !currentArgs.includes('remote_side')) {
            const pkMatch = source.block.match(/\b([A-Za-z0-9_]+)\s*=\s*Column\s*\([^)]*primary_key\s*=\s*True/i);
            const pkCol = pkMatch ? pkMatch[1] : 'id';
            const newDef = currentDef.replace(/\brelationship\s*\(([^)]*)\)/, (match, args) => {
              return `relationship(${args.trim()}, remote_side=[${pkCol}])`;
            });
            content = content.replace(currentDef, newDef);
            currentDef = newDef;
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Added remote_side=[${pkCol}] to self-referential relationship ${source.className}.${localRelName}.`);
          }
          continue;
        }

        // Reconcile reciprocal back_populates between distinct models (e.g. Category.products <-> Product.category)
        if (options.skipSqlalchemy) continue;
        const latestBlocks = parseClassBlocks(content);
        const targetDef = latestBlocks.find(c => c.className === targetClass);
        if (!targetDef) continue;

        const targetRelPattern = new RegExp(`(?:^|\\n)\\s*${targetRelName}(?:\\s*:[^=]+)?\\s*=\\s*relationship\\s*\\(([^)]*)\\)`, 's');
        const targetRelMatch = targetDef.block.match(targetRelPattern);

        if (!targetRelMatch) {
          // Check if target class ALREADY has a relationship pointing to source.className under a plural or different name
          const existingRelPattern = new RegExp(`(?:^|\\n)[ \\t]*([a-zA-Z0-9_]+)(?:\\s*:[^=]+)?\\s*=\\s*relationship\\s*\\(\\s*['"]${source.className}['"]([^)]*)\\)`);
          const existingRelMatch = targetDef.block.match(existingRelPattern);
          if (existingRelMatch) {
            const existingRelName = existingRelMatch[1];
            const oldDef = existingRelMatch[0];
            const newDef = oldDef.replace(new RegExp(`\\b${existingRelName}\\b`), targetRelName)
                                 .replace(/back_populates\s*=\s*['"][^'"]*['"]/, `back_populates="${localRelName}"`);
            content = content.replace(oldDef, newDef);
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Aligned existing relationship ${targetClass}.${existingRelName} -> ${targetRelName} (back_populates="${localRelName}").`);
            continue;
          }

          // Check if target class has a scalar column with the exact same name (e.g. category = Column(String))
          const colPattern = new RegExp(`(\\n[ \\t]*)${targetRelName}\\s*=\\s*Column\\s*\\([^)]*\\)`);
          const hasCol = targetDef.block.match(colPattern);
          const fkColPattern = new RegExp(`\\b${targetRelName}_id\\s*=\\s*Column`);
          const hasFkCol = targetDef.block.match(fkColPattern);

          // Find table name for source class
          let sourceTable = null;
          const srcTm = source.block.match(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/);
          if (srcTm) {
            sourceTable = srcTm[1];
          } else {
            const sn = source.className.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2');
            let pl = sn;
            if (pl.endsWith('y') && !pl.endsWith('ey')) pl = pl.slice(0, -1) + 'ies';
            else if (!pl.endsWith('s')) pl += 's';
            sourceTable = pl;
          }

          if (hasCol) {
            const indent = hasCol[1];
            let replacement = '';
            if (!hasFkCol) {
              replacement += `${indent}${targetRelName}_id = Column(Integer, ForeignKey("${sourceTable}.id"))`;
            }
            replacement += `${indent}${targetRelName} = relationship("${source.className}", back_populates="${localRelName}")`;
            content = content.replace(hasCol[0], replacement);
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Reconciled scalar ${targetClass}.${targetRelName} to reciprocal relationship and foreign key to ${source.className}.`);
          } else if (options.autoSynthesizeReciprocals === true) {
            const isSourceCollection = /s$|list|children|items/i.test(localRelName);
            let fkInjection = '';
            if (isSourceCollection && !hasFkCol) {
              fkInjection = `    ${targetRelName}_id = Column(Integer, ForeignKey("${sourceTable}.id"), nullable=True)\n`;
            }
            const relInjection = `    ${targetRelName} = relationship("${source.className}", back_populates="${localRelName}")\n`;

            const classHeader = new RegExp(`(class\\s+${targetClass}\\b[^:]*:[\\s\\S]*?)(?=\\nclass\\s+|$)`);
            content = content.replace(classHeader, (fullClass) => {
              if (fullClass.includes('# Relationships')) {
                return fullClass.replace(/([ \t]*#[ \t]*Relationships[^\n]*\n)/, `$1${fkInjection}${relInjection}`);
              } else {
                return fullClass.trimEnd() + `\n\n    # Relationships\n${fkInjection}${relInjection}\n`;
              }
            });
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Injected missing reciprocal relationship ${targetClass}.${targetRelName} -> ${source.className}.${localRelName}.`);
          }

          if (!content.includes('ForeignKey')) {
            content = content.replace(/(from\s+sqlalchemy(?:\.[a-z_]+)?\s+import\s+[^;\n]*\bColumn\b[^;\n]*)/, '$1, ForeignKey');
          }
          if (!content.includes('relationship')) {
            content = content.replace(/(from\s+sqlalchemy(?:\.[a-z_]+)?\s+import\s+[^;\n]*)/, '$1, relationship');
          }
        } else {
          // Reciprocal relationship exists, check if its targetClass and back_populates match
          const currentTargetRel = targetRelMatch[0];
          const currentTargetArgs = targetRelMatch[1];
          const bpInTarget = currentTargetArgs.match(/\bback_populates\s*=\s*['"]([A-Za-z0-9_]+)['"]/i);
          const targetOfTarget = currentTargetArgs.match(/^\s*['"]([A-Za-z0-9_]+)['"]/) ||
                                 currentTargetArgs.match(/\bargument\s*=\s*['"]?([A-Za-z0-9_]+)['"]?/) ||
                                 currentTargetArgs.match(/^\s*([A-Za-z0-9_]+)\b/);

          let newArgs = currentTargetArgs;
          let changedRel = false;

          if (!targetOfTarget || targetOfTarget[1] !== source.className) {
            newArgs = newArgs.replace(/^\s*['"]?[A-Za-z0-9_]+['"]?/, `"${source.className}"`);
            changedRel = true;
          }

          if (!bpInTarget) {
            newArgs = `${newArgs.trimEnd()}, back_populates="${localRelName}"`;
            changedRel = true;
          } else if (bpInTarget[1] !== localRelName) {
            newArgs = newArgs.replace(/\bback_populates\s*=\s*['"][A-Za-z0-9_]+['"]/i, `back_populates="${localRelName}"`);
            changedRel = true;
          }

          if (changedRel) {
            const newTargetRel = currentTargetRel.replace(/\brelationship\s*\([^)]*\)/, `relationship(${newArgs})`);
            content = content.replace(currentTargetRel, newTargetRel);
            modified = true;
            sendEvent('log', `🩹 [db_normalize] Corrected reciprocal back_populates on ${targetClass}.${targetRelName} to ${source.className}.${localRelName}.`);
          }
        }
      }
    }

    // Auto-inject missing ForeignKeys on relationship columns (e.g. Order.customer_id missing ForeignKey('customers.id'))
    const allModelBlocks = parseClassBlocks(content);
    const tableByClass = new Map();
    for (const b of allModelBlocks) {
      const tm = b.block.match(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/);
      if (tm) {
        tableByClass.set(b.className, tm[1]);
      } else {
        const sn = b.className.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2');
        let pl = sn;
        if (pl.endsWith('y') && !pl.endsWith('ey')) pl = pl.slice(0, -1) + 'ies';
        else if (!pl.endsWith('s')) pl += 's';
        tableByClass.set(b.className, pl);
      }
    }

    for (const b of allModelBlocks) {
      const relMatches = [...b.block.matchAll(/(?:([a-zA-Z0-9_]+)\s*=\s*)?relationship\s*\(([^)]*)\)/g)];
      for (const rm of relMatches) {
        const localRelName = rm[1];
        const relArgs = rm[2];
        if (!relArgs) continue;

        const targetClassMatch = relArgs.match(/^\s*['"]([A-Za-z0-9_]+)['"]/) ||
                                 relArgs.match(/\bargument\s*=\s*['"]?([A-Za-z0-9_]+)['"]?/) ||
                                 relArgs.match(/^\s*([A-Za-z0-9_]+)\b/);
        const targetClass = targetClassMatch ? targetClassMatch[1] : null;
        if (!targetClass) continue;

        const targetTable = tableByClass.get(targetClass) || (targetClass.toLowerCase() + 's');
        const candidateColNames = new Set();
        if (localRelName) candidateColNames.add(`${localRelName}_id`);
        candidateColNames.add(`${targetClass.toLowerCase()}_id`);
        if (targetClass === b.className) {
          candidateColNames.add('parent_id');
          candidateColNames.add(`parent_${targetClass.toLowerCase()}_id`);
        }

        for (const colName of candidateColNames) {
          const colDefPattern = new RegExp(`(\\b${colName}\\s*=\\s*Column\\s*\\(\\s*)([A-Za-z0-9_.]+)([\\s\\S]*?\\n)`);
          const colMatch = b.block.match(colDefPattern);
          if (colMatch && !colMatch[0].includes('ForeignKey')) {
            const oldDef = colMatch[0];
            const newDef = `${colMatch[1]}${colMatch[2]}, ForeignKey('${targetTable}.id')${colMatch[3]}`;
            content = content.replace(oldDef, newDef);
            modified = true;
            if (!content.includes('ForeignKey')) {
              content = content.replace(/(from\s+sqlalchemy(?:\.[a-z_]+)?\s+import\s+[^;\n]*\bColumn\b[^;\n]*)/, '$1, ForeignKey');
            }
            sendEvent('log', `🩹 [db_normalize] Injected missing ForeignKey('${targetTable}.id') on ${b.className}.${colName}.`);
          }
        }
      }
    }

    const finalImports = content;
    content = reconcileSqlAlchemyImports(content, sendEvent);
    if (content !== finalImports) modified = true;

    if (modified) {
      modelsFile.content = content;
      if (wsPath) {
        try { fs.writeFileSync(path.resolve(wsPath, modelsFile.path), content, 'utf8'); } catch (_) {}
      }
    }
  }
}

export async function validateDatabasePhase(dbModules, manifest, prd, caller, sendEvent, options = {}) {
  sendEvent('log', `🧪 [database_validation] Starting Deterministic Database Phase Validation...`);

  const result = {
    isValid: true,
    phase: "DATABASE",
    errorCode: null,
    message: null,
    errors: [],
    warnings: [],
    defects: [],
    missingEntities: [],
    brokenImports: [],
    brokenRelationships: [],
    foreignKeyIssues: [],
    migrationIssues: [],
    seedIssues: [],
    constraintIssues: [],
    initializationIssues: [],
    semanticIssues: []
  };

  const fail = (category, msg, code = null, defectData = null) => {
    result.isValid = false;
    if (category) result[category].push(msg);
    result.errors.push(msg);
    if (code && !result.errorCode) {
      result.errorCode = code;
      result.message = msg;
    }
    if (defectData) {
      result.defects.push({
        ...defectData,
        code: code || defectData.code || 'DB_VALIDATION_ERROR',
        validator: defectData.validator || 'database_validator',
        severity: defectData.severity || 'HIGH',
        file: defectData.file || null,
        message: msg,
        locations: defectData.locations || [],
        evidence: defectData.evidence ? redactSecret(defectData.evidence) : '<REDACTED>',
        remediation: defectData.remediation || 'Correct the database layer implementation.'
      });
    } else if (code) {
      result.defects.push({
        code,
        validator: 'database_validator',
        severity: 'HIGH',
        file: null,
        message: msg,
        locations: [],
        evidence: '<REDACTED>',
        remediation: 'Correct the database layer implementation.'
      });
    }
  };

  // 1. REQUIREMENTS CHECK
  const reqs = manifest?.project_requirements?.database;
  if (!reqs || !reqs.entities) {
    fail(null, 'Structured project requirements are missing.', 'REQUIREMENTS_NOT_AVAILABLE');
    sendEvent('log', `❌ [database_validation] REQUIREMENTS_NOT_AVAILABLE: Structured project requirements are missing.`);
    return result;
  }

  // Combine all files from all DB modules
  const files = dbModules.flatMap(m => m.required_files || []).filter(f => f && f.content);

  // Deterministically normalize database layer files before validation (e.g. Base imports, duplicate ORM models, missing referenced entities)
  try {
    normalizeDatabaseLayerFiles(files, manifest, options, sendEvent);
  } catch (err) {
    sendEvent('log', `⚠️ [db_normalize] Warning: Normalization error: ${err.message}`);
  }

  const allPaths = new Set((manifest?.modules || []).flatMap(m => (m.required_files || []).map(f => f ? f.path : null)).filter(Boolean));

  // Authoritative Technology Stack Contract
  const archContract = manifest?.architectureContract || options?.architectureContract || null;
  const authoritativeLang = (archContract?.language || (Array.from(allPaths).some(p => p.endsWith('.py')) ? 'python' : 'typescript')).toLowerCase();
  const authoritativeOrm = (archContract?.orm || (authoritativeLang === 'python' ? 'sqlalchemy' : 'prisma')).toLowerCase();

  // 1.5. EXPLICIT STACK CONTRACT CONSISTENCY CHECK
  if (authoritativeLang === 'python' || authoritativeOrm === 'sqlalchemy') {
    const wrongStackFiles = files.filter(f => 
      f.path.endsWith('.ts') || 
      f.path.endsWith('.js') || 
      f.path.endsWith('.prisma') || 
      (f.content && (f.content.includes('@prisma/client') || f.content.includes('PrismaClient')))
    );
    if (wrongStackFiles.length > 0) {
      const wrongFile = wrongStackFiles[0];
      const mismatchMsg = `Stack contract mismatch in ${wrongFile.path}: Architecture specifies Python/SQLAlchemy, but found TypeScript/Prisma code.`;
      fail(
        'brokenImports',
        mismatchMsg,
        DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
        {
          code: DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
          validator: 'stack_contract',
          severity: 'CRITICAL',
          file: wrongFile.path,
          expectedStack: 'Python/SQLAlchemy',
          actualStack: 'TypeScript/Prisma',
          remediation: 'Regenerate database files in Python using SQLAlchemy canonical Base and models matching the Architecture Contract.'
        }
      );
      sendEvent('log', `❌ [database_validation] STACK_CONTRACT_MISMATCH: ${mismatchMsg}`);
      return result;
    }
  } else if (authoritativeLang === 'typescript' || authoritativeOrm === 'prisma') {
    const wrongStackFiles = files.filter(f => 
      f.path.endsWith('.py') || 
      (f.content && (f.content.includes('declarative_base') || f.content.includes('from sqlalchemy')))
    );
    if (wrongStackFiles.length > 0) {
      const wrongFile = wrongStackFiles[0];
      const mismatchMsg = `Stack contract mismatch in ${wrongFile.path}: Architecture specifies TypeScript/Prisma, but found Python/SQLAlchemy code.`;
      fail(
        'brokenImports',
        mismatchMsg,
        DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
        {
          code: DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
          validator: 'stack_contract',
          severity: 'CRITICAL',
          file: wrongFile.path,
          expectedStack: 'TypeScript/Prisma',
          actualStack: 'Python/SQLAlchemy',
          remediation: 'Regenerate database files in TypeScript using Prisma schema/client matching the Architecture Contract.'
        }
      );
      sendEvent('log', `❌ [database_validation] STACK_CONTRACT_MISMATCH: ${mismatchMsg}`);
      return result;
    }
  }

  // Extract from code
  const foundEntities = new Set();
  const foundTables = new Set();
  const baseImports = [];
  let canonicalBaseFile = null;
  let baseDefCount = 0;

  const isPython = (authoritativeLang === 'python' || authoritativeOrm === 'sqlalchemy') && Array.from(allPaths).some(p => p.endsWith('.py'));

  if (isPython) {

  files.forEach(f => {
    // Entities
    const classMatches = [...f.content.matchAll(/class\s+([A-Za-z0-9_]+)(?:\(|:)/g)];
    classMatches.forEach(m => {
      foundEntities.add(m[1]);
      // Heuristic: SQLAlchemy often auto-generates tablenames from class names (e.g. User -> users)
      const snake = m[1].replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
      let plural = snake;
      if (plural.endsWith('y')) plural = plural.slice(0, -1) + 'ies';
      else if (plural.endsWith('s') || plural.endsWith('sh') || plural.endsWith('ch') || plural.endsWith('x') || plural.endsWith('z')) plural += 'es';
      else plural += 's';
      foundTables.add(plural);
      foundTables.add(snake); // Also add the singular just in case
    });

    // Explicit Tables
    const tableMatches = [...f.content.matchAll(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/g)];
    tableMatches.forEach(m => foundTables.add(m[1]));

    // Base Definitions
    if (f.content.includes('declarative_base(') || f.content.match(/class\s+Base\s*[(:]/)) {
      baseDefCount++;
      if (!canonicalBaseFile) canonicalBaseFile = f.path;
    }

    // Import Resolution
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('from ') || line.startsWith('import ')) {
        if (line.includes(' import Base') || line.endsWith('import Base')) {
          baseImports.push({
            file: f.path,
            line: i + 1,
            statement: line.replace(/\s+/g, ' ')
          });
        }

        const match = line.match(/^(?:from|import)\s+([a-zA-Z0-9_.]+)/);
        if (match) {
          const mod = match[1];
          if (mod.startsWith('.')) {
            let possiblePath = mod.replace(/\./g, '/') + '.py';
            let possibleDir = mod.replace(/\./g, '/') + '/__init__.py';
            
            const levels = mod.match(/^\.+/)[0].length;
            let dirParts = f.path.split('/');
            dirParts.pop(); // remove filename
            for(let l=1; l<levels; l++) dirParts.pop();
            const remainingMod = mod.substring(levels).replace(/\./g, '/');
            possiblePath = [...dirParts, remainingMod].join('/') + '.py';
            possibleDir = [...dirParts, remainingMod, '__init__'].join('/') + '.py';

            let found = false;
            for (const p of allPaths) {
              if (p.endsWith(possiblePath) || p.endsWith(possibleDir)) {
                found = true; break;
              }
            }
            if (!found) {
              fail('brokenImports', `${f.path}:${i+1} imports missing relative module '${mod}'`, DATABASE_DEFECT_CODES.BROKEN_IMPORT, {
                code: DATABASE_DEFECT_CODES.BROKEN_IMPORT,
                validator: 'broken_imports',
                file: f.path,
                locations: [{ line: i + 1, column: 1 }],
                evidence: line,
                remediation: `Ensure relative module '${mod}' exists in project.`
              });
            }
          } else {
             const topLevelDir = mod.split('.')[0];
             const hasLocalDir = Array.from(allPaths).some(p => p.startsWith(topLevelDir + '/'));
             if (hasLocalDir) {
                let possiblePath = mod.replace(/\./g, '/') + '.py';
                let possibleDir = mod.replace(/\./g, '/') + '/__init__.py';
                let isDirectoryPackage = mod.replace(/\./g, '/') + '/';
                let found = false;
                for (const p of allPaths) {
                  if (p.endsWith(possiblePath) || p.endsWith(possibleDir) || p.replace(/\.py$/, '').endsWith(mod.replace(/\./g, '/')) || p.includes(isDirectoryPackage)) {
                    found = true; break;
                  }
                }
                if (!found) {
                   fail('brokenImports', `${f.path}:${i+1} absolute import '${mod}' is missing from project.`, DATABASE_DEFECT_CODES.BROKEN_IMPORT, {
                     code: DATABASE_DEFECT_CODES.BROKEN_IMPORT,
                     validator: 'broken_imports',
                     file: f.path,
                     locations: [{ line: i + 1, column: 1 }],
                     evidence: line,
                     remediation: `Ensure absolute module '${mod}' is defined in project or installed as a package.`
                   });
                }
             }
          }
        }
      }
    }
  });

  // 2. REQUIRED ENTITIES & TABLES
  (reqs.entities || []).forEach(ent => {
    if (!foundEntities.has(ent)) {
      fail('missingEntities', `Missing required entity: ${ent}`, DATABASE_DEFECT_CODES.MISSING_ENTITY, {
        code: DATABASE_DEFECT_CODES.MISSING_ENTITY,
        validator: 'required_entities',
        remediation: `Define model class for entity '${ent}'.`
      });
    }
  });
  
  (reqs.tables || []).forEach(tbl => {
    if (!foundTables.has(tbl)) {
      fail('missingEntities', `Missing required table: ${tbl}`, DATABASE_DEFECT_CODES.MISSING_ENTITY, {
        code: DATABASE_DEFECT_CODES.MISSING_ENTITY,
        validator: 'required_tables',
        remediation: `Define database table '${tbl}'.`
      });
    }
  });

  // 3. BASE VALIDATION
  if (baseDefCount === 0) {
    fail('brokenImports', 'No canonical Base definition found (e.g. Base = declarative_base()).', DATABASE_DEFECT_CODES.BROKEN_IMPORT, {
      code: DATABASE_DEFECT_CODES.BROKEN_IMPORT,
      validator: 'base_definition',
      remediation: 'Define Base = declarative_base() in canonical base file.'
    });
  }
  const uniqueBasePaths = new Set(baseImports.map(imp => imp.statement.split(' import ')[0]));
  if (uniqueBasePaths.size > 1) {
    let canonicalModule = 'app.db.database';
    if (canonicalBaseFile) {
      canonicalModule = canonicalBaseFile
        .replace(/^(?:backend\/)?/, '')
        .replace(/\.py$/, '')
        .replace(/\//g, '.');
    }

    const nonCanonicalImports = baseImports.filter(imp => {
      const source = imp.statement.split(' import ')[0].replace(/^from\s+/, '').trim();
      return !source.endsWith(canonicalModule) && source !== canonicalModule && source !== 'database' && source !== '.database';
    });

    if (nonCanonicalImports.length > 0) {
      nonCanonicalImports.forEach(imp => {
        fail('brokenImports', `${imp.file}:${imp.line} Inconsistent Base import: imports Base from non-canonical source (${imp.statement}). Canonical Base is defined in ${canonicalModule}.`, DATABASE_DEFECT_CODES.BROKEN_IMPORT, {
          code: DATABASE_DEFECT_CODES.BROKEN_IMPORT,
          validator: 'base_imports',
          file: imp.file,
          locations: [{ line: imp.line, column: 1 }],
          evidence: imp.statement,
          remediation: `Change import to 'from ${canonicalModule} import Base'`
        });
      });
    } else {
      fail('brokenImports', `Inconsistent Base imports detected: ${Array.from(uniqueBasePaths).join(' | ')}`, DATABASE_DEFECT_CODES.BROKEN_IMPORT, {
        code: DATABASE_DEFECT_CODES.BROKEN_IMPORT,
        validator: 'base_imports',
        remediation: `Consolidate Base import to use 'from ${canonicalModule} import Base' across all models.`
      });
    }
  } else if (uniqueBasePaths.size === 0 && baseDefCount === 0) {
    fail('brokenImports', `No Base imports or definitions found.`, DATABASE_DEFECT_CODES.BROKEN_IMPORT);
  }

  // 4. FOREIGN KEYS & RELATIONSHIPS
  const classDefinitions = {};
  const tableColumnsMap = new Map();

  files.forEach(f => {
    const classBlocks = f.content.split(/\n\s*class\s+/);
    // Check database.py architectural separation: database.py may own ONLY Base, engine, SessionLocal, get_db
    if (f.path && f.path.endsWith('database.py')) {
      const ormClassMatch = f.content.match(/class\s+([A-Za-z0-9_]+)\s*\([^)]*Base[^)]*\):/);
      const tablenameMatch = f.content.match(/__tablename__\s*=/);
      if (ormClassMatch || tablenameMatch) {
        fail(
          'semanticIssues',
          `Architectural separation violation in ${f.path}: database.py may own only Base, engine, SessionLocal, and get_db. ORM models must be placed in models.py.`,
          DATABASE_DEFECT_CODES.ARCHITECTURAL_SEPARATION_VIOLATION,
          {
            code: DATABASE_DEFECT_CODES.ARCHITECTURAL_SEPARATION_VIOLATION,
            validator: 'database_separation',
            severity: 'CRITICAL',
            file: f.path,
            remediation: 'Move ORM model classes from database.py to models.py.'
          }
        );
      }
    }

    classBlocks.slice(1).forEach(block => {
      const classNameMatch = block.match(/^([A-Za-z0-9_]+)/);
      if (classNameMatch) {
         const cls = classNameMatch[1];
         const isOrmModel = block.includes('__tablename__') || block.match(/\([^)]*Base[^)]*\):/);
         if (isOrmModel && classDefinitions[cls]) {
             const existingFile = classDefinitions[cls].file;
             if (existingFile !== f.path) {
               const badFile = (f.path && f.path.endsWith('database.py')) ? f.path : ((existingFile && existingFile.endsWith('database.py')) ? existingFile : f.path);
               fail(
                 'semanticIssues',
                 `Duplicate ORM model declaration: Model '${cls}' is defined in both '${existingFile}' and '${f.path}'. Every entity must have exactly one owner.`,
                 DATABASE_DEFECT_CODES.DUPLICATE_MODEL,
                 {
                   code: DATABASE_DEFECT_CODES.DUPLICATE_MODEL,
                   validator: 'duplicate_entity_owner',
                   severity: 'CRITICAL',
                   file: badFile,
                   existingFile,
                   model: cls,
                   remediation: `Remove duplicate class definition of '${cls}' from '${badFile}'. Consolidate models into canonical 'models.py'.`
                 }
               );
               return;
             }
         }
         if (isOrmModel || !classDefinitions[cls]) {
           const tablenameMatch = block.match(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/);
           const tableName = tablenameMatch ? tablenameMatch[1] : null;
           const colMatches = [...block.matchAll(/(?:^|\n)\s*([a-zA-Z0-9_]+)\s*=\s*(?:mapped_column|Column)\s*\(/g)];
           const columns = new Set(colMatches.map(c => c[1]));
           if (tableName) {
             tableColumnsMap.set(tableName, { model: cls, file: f.path, columns });
           }
           classDefinitions[cls] = { block, file: f.path, tableName, columns };
         }
      }
    });

    const resolveModelForPosition = (content, matchIndex) => {
      const match = content.substring(0, matchIndex).match(/class\s+([A-Za-z0-9_]+)[^:]*:\s*(?:(?!class\s+)[\s\S])*$/);
      return match ? match[1] : null;
    };

    // Foreign Keys
    const fkMatches = [...f.content.matchAll(/ForeignKey\s*\(\s*['"]([a-zA-Z0-9_.]+)(?:\.([a-zA-Z0-9_]+))?['"]/g)];
    fkMatches.forEach(m => {
      const fullTarget = m[1];
      const targetTable = fullTarget.includes('.') ? fullTarget.split('.')[0] : fullTarget;
      const targetColumn = m[2] || (fullTarget.includes('.') ? fullTarget.split('.')[1] : null);
      const containingModel = resolveModelForPosition(f.content, m.index);

      if (!foundTables.has(targetTable) && !foundTables.has(fullTarget)) {
        fail('brokenRelationships', `${f.path} ForeignKey points to unknown table '${fullTarget}'`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
          code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
          secondaryCode: DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE,
          validator: 'foreign_keys',
          file: f.path,
          model: containingModel,
          targetTable: targetTable,
          remediation: `Point ForeignKey in '${containingModel || f.path}' to an existing table (unknown: '${targetTable}').`
        });
      } else if (targetColumn && targetColumn !== 'id' && tableColumnsMap.has(targetTable)) {
        const knownCols = tableColumnsMap.get(targetTable).columns;
        if (knownCols && knownCols.size > 0 && !knownCols.has(targetColumn)) {
          fail('foreignKeyIssues', `${f.path} ForeignKey references column '${targetColumn}' which does not exist in table '${targetTable}'`, DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE, {
            code: DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE,
            validator: 'foreign_key_column_integrity',
            file: f.path,
            model: containingModel,
            targetTable: targetTable,
            targetColumn: targetColumn,
            remediation: `Column '${targetColumn}' does not exist on referenced table '${targetTable}'. Ensure ForeignKey references a valid column.`
          });
        }
      }
    });

    // Relationships
    const relMatches = [...f.content.matchAll(/(?:([a-zA-Z0-9_]+)\s*=\s*)?relationship\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g)];
    relMatches.forEach(m => {
      const relPropName = m[1] || null;
      const targetEntity = m[2];
      if (!foundEntities.has(targetEntity)) {
        const containingModel = resolveModelForPosition(f.content, m.index);
        fail('brokenRelationships', `${f.path} relationship points to unknown class '${targetEntity}'`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
          code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
          validator: 'relationships',
          file: f.path,
          model: containingModel,
          relationship: relPropName,
          targetModel: targetEntity,
          remediation: `Ensure relationship target '${targetEntity}' referenced by '${containingModel ? `${containingModel}.${relPropName || 'relationship'}` : f.path}' is defined and imported.`
        });
      }
    });
    
    // Security / Credentials (Deterministic check using scanForCredentials)
    const credDefects = scanForCredentials(f);
    credDefects.forEach(defect => {
      fail('initializationIssues', defect.message, DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED, defect);
    });
  });

  // back_populates bidirectional validation
  Object.keys(classDefinitions).forEach(className => {
    const sourceDefinition = classDefinitions[className];
    const block = sourceDefinition.block;
    const bpMatches = [...block.matchAll(/(?:([a-zA-Z0-9_]+)(?:\s*:[^=]+)?\s*=\s*)?relationship\s*\(([^)]*)\)/g)];
    bpMatches.forEach(m => {
       const localRelName = m[1];
       const relArgs = m[2];
       if (!localRelName || !relArgs) return;
       const bpMatch = relArgs.match(/\bback_populates\s*=\s*['"]([A-Za-z0-9_]+)['"]/i);
       if (!bpMatch) return;
       const targetRelName = bpMatch[1];

       // Extract target class from string literal or argument keyword or identifier
       const targetClassMatch = relArgs.match(/^\s*['"]([A-Za-z0-9_]+)['"]/) ||
                                relArgs.match(/\barguments*=s*['"]?([A-Za-z0-9_]+)['"]?/) ||
                                relArgs.match(/^\s*([A-Za-z0-9_]+)\b/);
       const targetClass = targetClassMatch ? targetClassMatch[1] : null;
       if (!targetClass) return;

       const sourceForeignKeys = [...block.matchAll(/ForeignKey\s*\(\s*['"]([A-Za-z0-9_.]+)['"]/g)].map(fk => fk[1]);
       
       if (!classDefinitions[targetClass]) {
         if (foundEntities.has(targetClass)) {
             fail('brokenRelationships', `${className}.${localRelName} back_populates to '${targetRelName}' in '${targetClass}', but could not parse '${targetClass}'.`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
               validator: 'back_populates',
               file: sourceDefinition.file,
               model: targetClass,
               relationship: targetRelName,
               sourceFile: sourceDefinition.file,
               sourceModel: className,
               sourceRelationship: localRelName,
               targetModel: targetClass,
               expectedReciprocal: `${targetClass}.${targetRelName}`,
               expectedBackPopulates: localRelName,
               foreignKeys: sourceForeignKeys,
               actualState: 'target_model_unparseable',
               remediation: `Inspect model '${targetClass}' and define '${targetRelName}' as the reciprocal relationship to '${className}.${localRelName}'.`
             });
         }
         return;
       }
       
       const targetDefinition = classDefinitions[targetClass];
       const targetRelPattern = new RegExp(`(?:^|\\n)\\s*${targetRelName}(?:\\s*:[^=]+)?\\s*=\\s*relationship\\s*\\(([^)]*)\\)`, 's');
       const targetRelationship = targetDefinition.block.match(targetRelPattern);
       const actualArguments = targetRelationship?.[1] || '';
       const actualTargetClassMatch = actualArguments.match(/^\s*['"]([A-Za-z0-9_]+)['"]/) ||
                                      actualArguments.match(/\bargument\s*=\s*['"]?([A-Za-z0-9_]+)['"]?/) ||
                                      actualArguments.match(/^\s*([A-Za-z0-9_]+)\b/);
       const actualTargetClass = actualTargetClassMatch?.[1] || null;
       const actualBackPopulates = actualArguments.match(/\bback_populates\s*=\s*['"]([A-Za-z0-9_]+)['"]/i)?.[1] || null;
       let actualState = null;
       let message = '';

       if (!targetRelationship) {
         actualState = 'missing';
         message = `${className}.${localRelName} specifies back_populates='${targetRelName}', but '${targetClass}' has no reciprocal relationship named '${targetRelName}'.`;
       } else if (actualTargetClass !== className) {
         actualState = 'wrong_target_model';
         message = `${targetClass}.${targetRelName} targets '${actualTargetClass || 'unspecified'}', but its reciprocal source model is '${className}'.`;
       } else if (actualBackPopulates !== localRelName) {
         actualState = actualBackPopulates ? 'wrong_back_populates' : 'missing_back_populates';
         message = `${targetClass}.${targetRelName} must back_populates='${localRelName}', but actual value is '${actualBackPopulates || 'missing'}'.`;
       }

       if (actualState) {
         const targetForeignKeys = [...targetDefinition.block.matchAll(/ForeignKey\s*\(\s*['"]([A-Za-z0-9_.]+)['"]/g)].map(fk => fk[1]);
         fail('brokenRelationships', message, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
           validator: 'back_populates',
           file: targetDefinition.file,
           model: targetClass,
           relationship: targetRelName,
           sourceFile: sourceDefinition.file,
           sourceModel: className,
           sourceRelationship: localRelName,
           targetModel: targetClass,
           expectedReciprocal: `${targetClass}.${targetRelName}`,
           expectedBackPopulates: localRelName,
           actualBackPopulates,
           actualTargetModel: actualTargetClass,
           foreignKeys: [...new Set([...sourceForeignKeys, ...targetForeignKeys])],
           actualState,
           remediation: `Define '${targetClass}.${targetRelName}' as the reciprocal relationship to '${className}.${localRelName}', targeting '${className}' and using back_populates='${localRelName}'.`
         });
       }
    });
  });

  const resolveTargetModelFile = (modelName) => {
    if (modelName && classDefinitions[modelName]?.file) {
      return classDefinitions[modelName].file;
    }
    if (modelName) {
      const found = files.find(f => f.content && f.content.includes(`class ${modelName}`));
      if (found) return found.path;
    }
    const modelFile = files.find(f => f.path && (f.path.includes('models') || f.path.includes('model')));
    if (modelFile) return modelFile.path;
    const pyFile = files.find(f => f.path && f.path.endsWith('.py'));
    return pyFile ? pyFile.path : (files[0]?.path || null);
  };

  // Ensure requirements matches code
  (reqs.foreign_keys || []).forEach(fk => {
    const expectedTable = fk.references ? fk.references.split('.')[0] : fk.table;
    if (!foundTables.has(expectedTable)) {
      const sourceDef = Object.entries(classDefinitions).find(([, def]) => {
        const tMatch = def.block.match(/__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/);
        return tMatch && tMatch[1] === fk.table;
      });
      const targetFile = sourceDef ? sourceDef[1].file : resolveTargetModelFile(fk.table);
      fail('brokenRelationships', `Required FK references unknown table '${expectedTable}'`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'required_foreign_keys',
        file: targetFile,
        model: sourceDef ? sourceDef[0] : null,
        targetTable: expectedTable,
        remediation: `Ensure table '${expectedTable}' is created or referenced correctly by table '${fk.table}'.`
      });
    }
  });

  (reqs.relationships || []).forEach(rel => {
    const target = rel.to;
    if (!foundEntities.has(target)) {
      const sourceDef = classDefinitions[rel.from];
      const targetFile = sourceDef ? sourceDef.file : resolveTargetModelFile(rel.from);
      fail('brokenRelationships', `Required relationship to unknown entity '${target}'`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'required_relationships',
        file: targetFile,
        model: rel.from || null,
        relationship: rel.name || target?.toLowerCase() || null,
        targetModel: target,
        remediation: `Define required entity model '${target}' referenced by '${rel.from || 'project requirements'}'.`
      });
    }
  });

  // 5. CONSTRAINTS & INDEXES
  (reqs.constraints || []).forEach(c => {
    const type = (c.type || '').toLowerCase();
    const target = c.table || c.column;
    const targetLower = (target || '').toLowerCase();
    const targetSingular = targetLower.endsWith('s') ? targetLower.slice(0, -1) : targetLower;
    const hasType = files.some(f => {
      const content = f.content || '';
      const contentLower = content.toLowerCase();
      if (target && !contentLower.includes(targetLower) && !contentLower.includes(targetSingular)) return false;
      if (type.includes('unique') && (content.includes('unique=True') || content.includes('UniqueConstraint') || /@unique/.test(content))) return true;
      if (type.includes('check') && (content.includes('CheckConstraint') || /CHECK\s*\(/i.test(content))) return true;
      if ((type.includes('not_null') || type.includes('not null')) && (content.includes('nullable=False') || /^\s*[a-zA-Z0-9_]+\s+[A-Z][a-zA-Z0-9_]*\b(?!\?)/m.test(content))) return true;
      if (type.includes('index') && (content.includes('index=True') || content.includes('Index(') || /@@index/.test(content))) return true;
      if (type.includes('foreign') && (content.includes('ForeignKey(') || /@relation/.test(content))) return true;
      if (type.includes('primary') && (content.includes('primary_key=True') || /@id/.test(content))) return true;
      return false;
    });
    if (!hasType) {
      const targetFile = resolveTargetModelFile(target) || files.find(f => f.path && (f.path.endsWith('models.py') || f.path.endsWith('schema.prisma')))?.path || null;
      fail('constraintIssues', `Missing required constraint type '${c.type}' for ${target}`, DATABASE_DEFECT_CODES.CONSTRAINT_ISSUE, {
        code: DATABASE_DEFECT_CODES.CONSTRAINT_ISSUE,
        validator: 'constraints',
        file: targetFile,
        remediation: `Add constraint '${c.type}' to ${target} in ${targetFile || 'models.py'}.`
      });
    }
  });

  (reqs.indexes || []).forEach(i => {
    const target = i.table || i.column;
    const targetLower = (target || '').toLowerCase();
    const targetSingular = targetLower.endsWith('s') ? targetLower.slice(0, -1) : targetLower;
    const hasIndex = files.some(f => {
      const content = f.content || '';
      const contentLower = content.toLowerCase();
      if (target && !contentLower.includes(targetLower) && !contentLower.includes(targetSingular)) return false;
      return content.includes('index=True') || content.includes('Index(') || /@@index/.test(content);
    });
    if (!hasIndex) {
      const targetFile = resolveTargetModelFile(target) || files.find(f => f.path && (f.path.endsWith('models.py') || f.path.endsWith('schema.prisma')))?.path || null;
      fail('constraintIssues', `Missing required index for ${target}`, DATABASE_DEFECT_CODES.CONSTRAINT_ISSUE, {
        code: DATABASE_DEFECT_CODES.CONSTRAINT_ISSUE,
        validator: 'indexes',
        file: targetFile,
        remediation: `Add index for ${target} in ${targetFile || 'models.py'}.`
      });
    }
  });

  // 6. MIGRATIONS
  if (reqs.migrations_required) {
    const hasMigrations = Array.from(allPaths).some(p => 
      p.includes('alembic') || 
      p.includes('migrations/') || 
      p.includes('migration') || 
      p.includes('manage.py makemigrations')
    );
    if (!hasMigrations) {
      fail('migrationIssues', 'Missing expected migration artifacts based on project requirements.', DATABASE_DEFECT_CODES.MIGRATION_ISSUE);
    }
  }

  // 7. SEEDS
  if (reqs.seed_required) {
    const seedFiles = files.filter(f => f.path.includes('seed') || f.path.includes('data'));
    const hasSeedLogic = seedFiles.some(f => f.content.includes('def ') || f.content.includes('INSERT') || f.content.includes('add(') || f.content.includes('create('));
    if (!hasSeedLogic) {
      fail('seedIssues', 'Missing actual seed implementation logic.', DATABASE_DEFECT_CODES.SEED_ISSUE);
    }
  }

  // 8. INITIALIZATION
  // Prioritize dedicated init files first, then files with engine/connection logic, before falling back to models/base
  if (reqs.initialization_requirements) {
    const initFile = files.find(f => 
      f.path.includes('init_db') || 
      f.path.includes('database') || 
      f.path.includes('session') || 
      f.path.includes('connection')
    ) || files.find(f => 
      f.content && (f.content.includes('create_engine') || f.content.includes('sessionmaker') || f.content.includes('connect(') || f.content.includes('MongoClient'))
    ) || files.find(f =>
      f.path.includes('base') || f.path.includes('models')
    );

    if (!initFile) {
      fail('initializationIssues', 'Missing database initialization file.', DATABASE_DEFECT_CODES.INITIALIZATION_ISSUE);
    } else {
      const hasInit = initFile.content.includes('create_engine') || 
                      initFile.content.includes('sessionmaker') || 
                      initFile.content.includes('connect(') || 
                      initFile.content.includes('declarative_base') ||
                      initFile.content.includes('Base =') ||
                      initFile.content.includes('MongoClient');
      if (!hasInit) {
        fail('initializationIssues', 'Init file lacks actual engine/session creation logic.', DATABASE_DEFECT_CODES.INITIALIZATION_ISSUE);
      }
    }
  }

  // 8.5 AUTHORITATIVE SQLALCHEMY MAPPER VALIDATION (when requested and applicable)
  const shouldRunAuthoritativeOrm = Boolean(options.authoritativeOrm);

  if (shouldRunAuthoritativeOrm && result.isValid) {
    const ormResult = await validateSqlAlchemyMappers(files, { ...options, sendEvent, classDefinitions, foundEntities, foundTables });
    if (!ormResult.isValid && ormResult.defects && ormResult.defects.length > 0) {
      ormResult.defects.forEach(defect => {
        fail(defect.code === DATABASE_DEFECT_CODES.BROKEN_IMPORT ? 'brokenImports' : 'brokenRelationships',
             defect.message,
             defect.code,
             defect);
      });
    }
  }

  } // End of isPython deterministic checks

  // Deterministic checks for Prisma / TypeScript stack
  if (!isPython && (authoritativeOrm === 'prisma' || authoritativeLang === 'typescript')) {
    files.forEach(f => {
      // Prisma schema models: model EntityName { ... }
      const modelMatches = [...f.content.matchAll(/\bmodel\s+([A-Za-z0-9_]+)\s*\{/g)];
      modelMatches.forEach(m => {
        foundEntities.add(m[1]);
        const snake = m[1].replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
        let plural = snake;
        if (plural.endsWith('y')) plural = plural.slice(0, -1) + 'ies';
        else if (plural.endsWith('s') || plural.endsWith('sh') || plural.endsWith('ch') || plural.endsWith('x') || plural.endsWith('z')) plural += 'es';
        else plural += 's';
        foundTables.add(plural);
        foundTables.add(snake);
        foundTables.add(m[1].toLowerCase());
      });

      // Prisma schema relations: fieldName TargetModel @relation(fields: [fkField], references: [refField])
      if (f.path && f.path.endsWith('.prisma')) {
        const modelBlocks = f.content.split(/\bmodel\s+/);
        modelBlocks.slice(1).forEach(block => {
          const mName = block.match(/^([A-Za-z0-9_]+)/)?.[1];
          if (!mName) return;
          const relLines = [...block.matchAll(/([a-zA-Z0-9_]+)\s+([A-Za-z0-9_]+)\s+@relation\s*\(\s*([^)]*)\)/g)];
          relLines.forEach(rl => {
            const relField = rl[1];
            const targetModel = rl[2];
            const args = rl[3];

            if (!foundEntities.has(targetModel)) {
              fail('brokenRelationships', `Prisma model '${mName}' relation '${relField}' references unknown model '${targetModel}'.`, DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, {
                code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
                validator: 'prisma_relations',
                file: f.path,
                model: mName,
                relationship: relField,
                targetModel: targetModel,
                remediation: `Ensure Prisma model '${targetModel}' is defined.`
              });
            }

            const fieldsMatch = args.match(/fields\s*:\s*\[\s*([a-zA-Z0-9_,\s]+)\s*\]/);
            if (fieldsMatch) {
              const declaredFkField = fieldsMatch[1].trim();
              const hasFk = new RegExp(`(?:^|\\n)\\s*${declaredFkField}\\s+`).test(block);
              if (!hasFk) {
                fail('foreignKeyIssues', `Prisma model '${mName}' relation '${relField}' references foreign key field '${declaredFkField}' which is not defined in '${mName}'.`, DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE, {
                  code: DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE,
                  validator: 'prisma_foreign_key',
                  file: f.path,
                  model: mName,
                  relationship: relField,
                  field: declaredFkField,
                  remediation: `Define foreign key field '${declaredFkField}' on model '${mName}'.`
                });
              }
            }
          });
        });
      }

      // TypeScript classes / interfaces / types / Mongoose models
      const tsMatches = [...f.content.matchAll(/\b(?:class|interface|type)\s+([A-Za-z0-9_]+)/g)];
      tsMatches.forEach(m => {
        foundEntities.add(m[1]);
        foundTables.add(m[1].toLowerCase());
      });

      const mongooseMatches = [...f.content.matchAll(/mongoose\.model\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g)];
      mongooseMatches.forEach(m => {
        foundEntities.add(m[1]);
        foundTables.add(m[1].toLowerCase());
        foundTables.add(m[1].toLowerCase() + 's');
      });

      // PrismaClient initialization or import
      if (f.content.includes('new PrismaClient') || f.content.includes('@prisma/client') || f.content.includes('prisma.')) {
        baseDefCount++;
      }

      // Security / Credentials check
      const credDefects = scanForCredentials(f);
      credDefects.forEach(defect => {
        fail('initializationIssues', defect.message, DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED, defect);
      });
    });

    // Required entities
    (reqs.entities || []).forEach(ent => {
      if (!foundEntities.has(ent)) {
        fail('missingEntities', `Missing required entity: ${ent}`, DATABASE_DEFECT_CODES.MISSING_ENTITY, {
          code: DATABASE_DEFECT_CODES.MISSING_ENTITY,
          validator: 'required_entities',
          remediation: `Define Prisma model or TypeScript class for entity '${ent}'.`
        });
      }
    });

    // Required tables
    (reqs.tables || []).forEach(tbl => {
      if (!foundTables.has(tbl) && !foundTables.has(tbl.toLowerCase())) {
        fail('missingEntities', `Missing required table: ${tbl}`, DATABASE_DEFECT_CODES.MISSING_ENTITY, {
          code: DATABASE_DEFECT_CODES.MISSING_ENTITY,
          validator: 'required_tables',
          remediation: `Define database table/model for '${tbl}'.`
        });
      }
    });

    // Seed logic
    if (reqs.seed_required) {
      const seedFiles = files.filter(f => f.path.includes('seed') || f.path.includes('data'));
      const hasSeedLogic = seedFiles.some(f => f.content.includes('prisma.') || f.content.includes('create(') || f.content.includes('upsert(') || f.content.includes('insert'));
      if (!hasSeedLogic) {
        fail('seedIssues', 'Missing actual seed implementation logic.', DATABASE_DEFECT_CODES.SEED_ISSUE);
      }
    }
  }

  if (!result.isValid) {
    sendEvent('log', `❌ [database_validation] Deterministic DB Validation Failed:\n${result.errors.join('\n')}`);
    return result;
  }

  // 9. LLM SEMANTIC QA (Secondary Layer, ZERO-TRUNCATION)
  const qaSystem = `You are a Principal Software Architect QA.
Review the provided COMPLETE IMPLEMENTATION PLAN and the COMPLETE generated Database layer.
Your ONLY job is to verify Business Completeness and Domain Correctness according to the PRD.
Return EXACTLY this JSON structure:
{
  "isValid": true|false,
  "semanticIssues": ["List any missing business rules, broken domain logic, missing seed dependencies, etc."]
}
DO NOT shorten or truncate your output. ZERO-TRUNCATION RULE APPLIES.`;

  let qaUser = `PRD / IMPLEMENTATION PLAN:\n${prd}\n\nGENERATED FILES:\n`;
  for (const f of files) {
    qaUser += `\n--- ${f.path} ---\n${f.content}\n`;
  }

  try {
    const rawQa = await caller(qaSystem, qaUser, { sendEvent, generationId: manifest.generationId || 'unknown' });
    let cleanQa = (rawQa || '').replace(/```json\n?/gi, '').replace(/\n?```/gi, '').trim();
    const firstBrace = cleanQa.indexOf('{');
    const lastBrace = cleanQa.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const qaResult = JSON.parse(cleanQa.substring(firstBrace, lastBrace + 1));
      if (!qaResult.isValid) {
        if (qaResult.semanticIssues && Array.isArray(qaResult.semanticIssues)) {
          qaResult.semanticIssues.forEach(i => {
            // Seed logic, dummy test users, or mock seed arguments are non-fatal: do NOT fail the database architecture phase over mock seed scripts!
            if (/seed\.py|seed data|sample user|sample order|seeding/i.test(i)) {
              result.warnings.push(i);
              sendEvent('log', `⚠️ [database_validation] Advisory seed notice (non-fatal): ${i}`);
              return;
            }
            const targetFile = files.find(f => {
              const base = f.path.split('/').pop().toLowerCase();
              return i.toLowerCase().includes(base) || i.toLowerCase().includes(f.path.toLowerCase());
            });
            fail('semanticIssues', i, DATABASE_DEFECT_CODES.SEMANTIC_ISSUE, targetFile ? { file: targetFile.path } : null);
          });
        } else {
          fail('semanticIssues', 'Semantic issues detected by QA.', DATABASE_DEFECT_CODES.SEMANTIC_ISSUE);
        }
      }
    } else {
      sendEvent('log', `⚠️ [database_validation] Semantic QA returned non-JSON output, proceeding with deterministic DB checks.`);
    }
  } catch (e) {
    sendEvent('log', `⚠️ [database_validation] Semantic QA parse skipped: ${e.message}`);
  }

  if (result.isValid) {
    sendEvent('log', `✅ [database_validation] Generic Database Validation PASSED.`);
  } else {
    sendEvent('log', `❌ [database_validation] Semantic DB Validation Failed:\n${result.errors.join('\n')}`);
  }

  return result;
}
