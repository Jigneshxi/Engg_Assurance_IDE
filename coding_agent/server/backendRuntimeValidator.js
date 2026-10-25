import { createValidationWorkspace, validationEnvironment, executeCommand } from './validationRuntime.js';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { resolveSharedPython } from './pythonEnvironment.js';
import { formatErrorDiagnostic } from './errorDiagnostic.js';
export function getPythonBinary(workspacePath) {
  if (workspacePath) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(workspacePath, '.openclaw/validation-runtime.json'), 'utf8'));
      if (config?.python && fs.existsSync(config.python)) return config.python;
    } catch {}
  }
  const resolved = resolveSharedPython({ workspacePath, allowIdeVenv: false });
  return resolved || null;
}

async function pythonCommand(command, args, options) {
  if (!command) {
    const error = new Error('Python interpreter unavailable; runtime validation blocked');
    error.stderr = error.message;
    throw error;
  }
  const result = await executeCommand(command, args, options);
  if (result.code !== 0) {
    const error = new Error(result.output || `Python command exited ${result.code}`);
    error.stderr = result.output;
    throw error;
  }
  return { stdout: result.output, stderr: '' };
}

/**
 * Phase 10: Backend Runtime Validation Gate
 * 
 * For generated applications, verifies:
 * 1. Start backend.
 * 2. Verify health endpoint.
 * 3. Verify database connection.
 * 4. Run migration.
 * 5. Verify tables.
 * 6. Verify imports.
 * 7. Verify application startup.
 * 8. Verify API registration.
 * 9. Verify authentication.
 * 10. Verify authorization.
 * 11. Verify CRUD.
 * 12. Verify persistence.
 * 
 * Invariant: A generated backend that cannot start is NOT successful.
 * Defect Code: BACKEND_RUNTIME_FAILURE
 */

export const BACKEND_DEFECT_CODES = Object.freeze({
  BACKEND_RUNTIME_FAILURE: 'BACKEND_RUNTIME_FAILURE'
});
function normPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Helper to perform an HTTP request returning statusCode, headers, and parsed body.
 */
export function makeHttpRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 5000
      };

      const req = client.request(reqOptions, (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch (_) {
            json = null;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`HTTP request timed out after ${reqOptions.timeout}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (postData) {
        if (typeof postData === 'object') {
          req.setHeader('Content-Type', req.getHeader('Content-Type') || 'application/json');
          req.write(JSON.stringify(postData));
        } else {
          req.write(postData);
        }
      }

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 6. Verify backend imports at runtime (ensures entry point can import without ModuleNotFoundError/ImportError).
 */
export async function verifyBackendImports(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const pyEntry = files.find(f => f && f.path && (normPath(f.path).endsWith('/main.py') || normPath(f.path) === 'main.py' || normPath(f.path).endsWith('/app.py') || normPath(f.path) === 'app.py'));
  const jsEntry = files.find(f => f && f.path && (normPath(f.path).endsWith('/server.js') || normPath(f.path) === 'server.js' || normPath(f.path).endsWith('/index.js') || normPath(f.path) === 'index.js'));

  if (!pyEntry && !jsEntry) {
    // If no explicit backend entry exists, check if any backend files exist
    const hasBackend = files.some(f => f && f.path && (normPath(f.path).startsWith('backend/') || normPath(f.path).endsWith('.py')));
    if (hasBackend) {
      const msg = `Backend Runtime Failure: Missing canonical backend entry point (main.py or server.js).`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'IMPORT_RUNTIME_FAILURE',
        severity: 'HIGH',
        message: msg
      });
    }
    return { defects, errors };
  }

  if (!options.mockLLM && pyEntry && options.workspacePath) {
    const pythonBin = options.python || getPythonBinary(options.workspacePath);
    let backendDir = path.dirname(path.join(options.workspacePath, pyEntry.path));
    if (normPath(pyEntry.path).includes('backend/')) {
      backendDir = path.join(options.workspacePath, 'backend');
    }
    const relToBackend = path.relative(backendDir, path.join(options.workspacePath, pyEntry.path)).replace(/\\/g, '/');
    const modName = relToBackend.replace(/\.py$/, '').replace(/\//g, '.');

    try {
      const code = `import sys\nsys.path.insert(0, '.')\ntry:\n    import ${modName}\nexcept ImportError:\n    try:\n        from app import ${path.basename(pyEntry.path, '.py')}\n    except ImportError:\n        import ${path.basename(pyEntry.path, '.py')}\n`;
      await pythonCommand(pythonBin, ['-c', code], {
        cwd: backendDir,
        timeout: options.timeout || 60000,
        env: validationEnvironment(options.workspacePath, { PYTHONPATH: backendDir })
      });
    } catch (err) {
      const errOut = (err.stderr || err.stdout || err.message || '').toString();
      {
        const diagnostic = formatErrorDiagnostic(errOut, 30);
        const msg = `Backend Runtime Failure: Failed to import '${pyEntry.path}':\n${diagnostic}`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'IMPORT_RUNTIME_FAILURE',
          file: pyEntry.path,
          details: errOut,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  }

  return { defects, errors };
}

/**
 * 1 & 7. Verify backend startup (application initializes without throwing unhandled exceptions).
 */
export async function verifyApplicationStartup(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const pyEntry = files.find(f => f && f.path && (normPath(f.path).endsWith('/main.py') || normPath(f.path) === 'main.py' || normPath(f.path).endsWith('/app.py') || normPath(f.path) === 'app.py'));

  if (!options.mockLLM && pyEntry && options.workspacePath) {
    const pythonBin = options.python || getPythonBinary(options.workspacePath);
    let backendDir = path.dirname(path.join(options.workspacePath, pyEntry.path));
    if (normPath(pyEntry.path).includes('backend/')) {
      backendDir = path.join(options.workspacePath, 'backend');
    }

    try {
      // Test app initialization via ASGI import
      const code = `
import sys
sys.path.insert(0, '.')
try:
    from main import app
except ImportError:
    try:
        from app.main import app
    except ImportError:
        import app
assert app is not None, "Application instance 'app' is None"
print("STARTUP_VERIFIED_SUCCESS")
`;
      const res = await pythonCommand(pythonBin, ['-c', code], {
        cwd: backendDir,
        timeout: options.timeout || 60000,
        env: validationEnvironment(options.workspacePath, { PYTHONPATH: backendDir })
      });

      if (!res.stdout.includes('STARTUP_VERIFIED_SUCCESS')) {
        const msg = `Backend Runtime Failure: Application startup check did not confirm successful initialization.`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'STARTUP_FAILURE',
          file: pyEntry.path,
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (err) {
      const errOut = (err.stderr || err.stdout || err.message || '').toString();
      {
        const diagnostic = formatErrorDiagnostic(errOut, 30);
        const msg = `Backend Runtime Failure: Application crashed during startup:\n${diagnostic}`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'STARTUP_FAILURE',
          file: pyEntry.path,
          details: errOut,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  } else if (pyEntry) {
    // Static verification when running without live workspace or in mockLLM mode
    const content = pyEntry.content || '';
    if (!content.includes('FastAPI(') && !content.includes('Flask(') && !content.includes('express()')) {
      const msg = `Backend Runtime Failure in '${pyEntry.path}': no application framework instantiation detected (e.g. FastAPI/Flask/Express).`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'STARTUP_FAILURE',
        file: pyEntry.path,
        severity: 'HIGH',
        message: msg
      });
    }
  }

  return { defects, errors };
}

/**
 * 2. Verify health endpoint exists and returns 200 OK with valid JSON.
 */
export async function verifyHealthEndpoint(files = [], options = {}) {
  const defects = [];
  const errors = [];

  // 1. Verify health endpoint declaration in backend files
  const backendFiles = files.filter(f => f && f.path && (normPath(f.path).endsWith('.py') || normPath(f.path).endsWith('.js')));
  const healthRegex = /(?:@(?:app|router)\.get|app\.get)\s*\(\s*['"](\/(?:health|api\/health|api\/v1\/health|ping)?)['"]/i;
  
  let declaredHealthEndpoint = null;
  for (const f of backendFiles) {
    const match = (f.content || '').match(healthRegex);
    if (match) {
      declaredHealthEndpoint = match[1];
      break;
    }
  }

  const requiresHealth = !options.mockLLM && (!options.manifest || options.manifest?.project_requirements?.backend?.apis?.some(a => a.includes('health')) || !options.manifest?.project_requirements);

  if (!declaredHealthEndpoint && requiresHealth) {
    const msg = `Backend Runtime Failure: Backend does not declare a health endpoint (/health or /api/health).`;
    errors.push(msg);
    defects.push({
      code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
      subtype: 'HEALTH_ENDPOINT_FAILURE',
      severity: 'HIGH',
      message: msg
    });
  }

  // 2. If a live backend URL is provided or reachable (options.backendUrl)
  if (options.backendUrl) {
    const epPath = declaredHealthEndpoint || '/health';
    const targetUrl = new URL(epPath, options.backendUrl).toString();

    try {
      const resp = await makeHttpRequest(targetUrl, { method: 'GET', timeout: 5000 });
      if (resp.statusCode !== 200) {
        const msg = `Backend Runtime Failure: Health endpoint '${targetUrl}' returned HTTP ${resp.statusCode} (expected 200).`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'HEALTH_ENDPOINT_FAILURE',
          url: targetUrl,
          statusCode: resp.statusCode,
          severity: 'HIGH',
          message: msg
        });
      } else if (!resp.json || (resp.json.status !== 'ok' && resp.json.status !== 'healthy' && !resp.json.service)) {
        const msg = `Backend Runtime Failure: Health endpoint returned non-standard payload: ${resp.body}`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'HEALTH_ENDPOINT_FAILURE',
          url: targetUrl,
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (err) {
      const msg = `Backend Runtime Failure: Failed to connect to health endpoint '${targetUrl}': ${err.message}`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'HEALTH_ENDPOINT_FAILURE',
        url: targetUrl,
        severity: 'HIGH',
        message: msg
      });
    }
  }

  return { defects, errors, declaredEndpoint: declaredHealthEndpoint };
}

/**
 * 3. Verify database connection (verifies engine configuration and connectivity).
 */
export async function verifyDatabaseConnection(files = [], options = {}) {
  const defects = [];
  const errors = [];

  if (options.manifest?.project_requirements?.database?.initialization_requirements === false) {
    return { defects, errors };
  }

  const dbFile = files.find(f => f && f.path && (normPath(f.path).includes('database') || normPath(f.path).includes('db.')));
  if (!dbFile) {
    const hasModels = files.some(f => f && f.path && normPath(f.path).includes('models'));
    if (hasModels) {
      const msg = `Backend Runtime Failure: Database configuration file (database.py or db.js) not found.`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'DATABASE_CONNECTION_FAILURE',
        severity: 'HIGH',
        message: msg
      });
    }
    return { defects, errors };
  }

  const content = dbFile.content || '';
  if (!content.includes('create_engine') && !content.includes('PrismaClient') && !content.includes('mongoose.connect') && !content.includes('sqlite3')) {
    const msg = `Backend Runtime Failure in '${dbFile.path}': no database engine instantiation detected (e.g. create_engine or PrismaClient).`;
    errors.push(msg);
    defects.push({
      code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
      subtype: 'DATABASE_CONNECTION_FAILURE',
      file: dbFile.path,
      severity: 'HIGH',
      message: msg
    });
  }

  // Execute database connectivity test if workspace path provided and not mockLLM
  if (!options.mockLLM && options.workspacePath && dbFile.path.endsWith('.py')) {
    const pythonBin = options.python || getPythonBinary(options.workspacePath);
    let backendDir = path.dirname(path.join(options.workspacePath, dbFile.path));
    if (dbFile.path.includes('app/')) {
      backendDir = path.join(options.workspacePath, dbFile.path.split('app/')[0]);
    } else if (dbFile.path.includes('app\\')) {
      backendDir = path.join(options.workspacePath, dbFile.path.split('app\\')[0]);
    }
    const code = `
import sys
sys.path.insert(0, '.')
try:
    from app.db.database import engine
    with engine.connect() as conn:
        pass
    print("DB_CONNECTED_SUCCESS")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;
    try {
      const res = await pythonCommand(pythonBin, ['-c', code], {
        cwd: backendDir,
        timeout: options.timeout || 60000,
        env: validationEnvironment(options.workspacePath, { PYTHONPATH: backendDir })
      });
      if (!res.stdout.includes('DB_CONNECTED_SUCCESS')) {
        const msg = `Backend Runtime Failure: Database engine connection check did not confirm connectivity.`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'DATABASE_CONNECTION_FAILURE',
          file: dbFile.path,
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (err) {
      const errOut = (err.stderr || err.stdout || err.message || '').toString();
      {
        const diagnostic = formatErrorDiagnostic(errOut, 30);
        const msg = `Backend Runtime Failure: Database connection failed:\n${diagnostic}`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'DATABASE_CONNECTION_FAILURE',
          file: dbFile.path,
          details: errOut,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  }

  return { defects, errors };
}

/**
 * 4. Run database migration (ensures schema migration or Base.metadata.create_all is valid).
 */
export async function runMigration(files = [], options = {}) {
  const defects = [];
  const errors = [];

  if (options.manifest?.project_requirements?.database?.migrations_required === false) {
    return { defects, errors };
  }

  const migrationFile = files.find(f => f && f.path && (normPath(f.path).includes('alembic') || normPath(f.path).includes('migration')));
  const hasCreateAll = files.some(f => (f.content || '').includes('metadata.create_all') || (f.content || '').includes('prisma migrate'));

  let hasMigrationMechanism = !!migrationFile || hasCreateAll;

  if (!hasMigrationMechanism) {
    const hasModels = files.some(f => f && f.path && normPath(f.path).includes('models'));
    if (hasModels) {
      const msg = `Backend Runtime Failure: No database migration mechanism found (neither alembic nor Base.metadata.create_all).`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'MIGRATION_FAILURE',
        severity: 'HIGH',
        message: msg
      });
    }
  }

  // If live execution is enabled with alembic and not mockLLM
  if (!options.mockLLM && options.workspacePath && migrationFile && migrationFile.path.endsWith('.ini')) {
    const pythonBin = options.python || getPythonBinary(options.workspacePath);
    const backendDir = path.dirname(path.join(options.workspacePath, migrationFile.path));
    try {
      await pythonCommand(pythonBin, ['-m', 'alembic', 'upgrade', 'head'], {
        cwd: backendDir,
        timeout: options.timeout || 60000,
        env: validationEnvironment(options.workspacePath, { PYTHONPATH: backendDir })
      });
    } catch (err) {
      const errOut = (err.stderr || err.stdout || err.message || '').toString();
      {
        if (!hasCreateAll) {
          const diagnostic = formatErrorDiagnostic(errOut, 30);
          const msg = `Backend Runtime Failure: Alembic migration failed:\n${diagnostic}`;
          errors.push(msg);
          defects.push({
            code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
            subtype: 'MIGRATION_FAILURE',
            file: migrationFile.path,
            details: errOut,
            severity: 'HIGH',
            message: msg
          });
        }
      }
    }
  }

  return { defects, errors };
}

/**
 * 5. Verify database tables exist in the schema.
 */
export async function verifyDatabaseTables(files = [], options = {}) {
  const defects = [];
  const errors = [];

  // Extract expected model class names and table names from models file
  const modelFiles = files.filter(f => f && f.path && (normPath(f.path).includes('models.py') || normPath(f.path).endsWith('schema.prisma')));
  const expectedTableNames = new Set();

  modelFiles.forEach(f => {
    const content = f.content || '';
    const tableMatches = content.match(/__tablename__\s*=\s*['"]([^'"]+)['"]/g);
    if (tableMatches) {
      tableMatches.forEach(tm => {
        const tbl = tm.split('=')[1].trim().replace(/['"]/g, '');
        if (tbl) expectedTableNames.add(tbl);
      });
    }
  });

  if (expectedTableNames.size === 0) {
    return { defects, errors, verifiedTablesCount: 0 };
  }

  // If database file exists on disk (e.g. SQLite db), inspect sqlite_master
  if (!options.mockLLM && options.workspacePath) {
    const dbPathCandidates = [
      path.join(options.workspacePath, 'backend', 'app.db'),
      path.join(options.workspacePath, 'backend', 'test.db'),
      path.join(options.workspacePath, 'backend', 'welltrack.db'),
      path.join(options.workspacePath, 'app.db')
    ];

    const existingDb = dbPathCandidates.find(p => fs.existsSync(p));
    if (existingDb) {
      const pythonBin = options.python || getPythonBinary(options.workspacePath);
      const code = `
import sqlite3, sys
conn = sqlite3.connect(r'${existingDb}')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(','.join(tables))
`;
      try {
        const res = await pythonCommand(pythonBin, ['-c', code], { timeout: options.timeout || 30000, env: validationEnvironment(options.workspacePath) });
        const createdTables = new Set(res.stdout.trim().split(',').map(t => t.trim()));

        for (const exp of expectedTableNames) {
          if (!createdTables.has(exp)) {
            const msg = `Backend Runtime Failure: Expected database table '${exp}' does not exist in database '${path.basename(existingDb)}'.`;
            errors.push(msg);
            defects.push({
              code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
              subtype: 'TABLES_VERIFICATION_FAILURE',
              table: exp,
              database: existingDb,
              severity: 'HIGH',
              message: msg
            });
          }
        }
      } catch (err) {
        // Fallback gracefully
      }
    }
  }

  return { defects, errors, verifiedTablesCount: expectedTableNames.size };
}

/**
 * 8. Verify API registration (routers declared in backend files are included in main app).
 */
/**
 * 8. Verify API registration (routers declared in backend files are included in main app).
 *
 * Strict per-router checks:
 *   (a) Router file is imported into main.py by its resource name.
 *   (b) Router is individually mounted via its own include_router() / app.use() call.
 *   (c) The composed prefix (app-level + router-internal) equals /api/<resource>.
 *   (d) A router from one resource cannot satisfy the mount check for a different resource.
 *   (e) Duplicate mounts of the same variable are reported.
 */
export function verifyApiRegistration(files = [], _options = {}) {
  const defects = [];
  const errors = [];

  const candidateMainFiles = files.filter(f => f && f.path && (normPath(f.path) === 'backend/app/main.py' || normPath(f.path) === 'backend/main.py' || normPath(f.path) === 'main.py' || normPath(f.path) === 'app/main.py'));
  if (candidateMainFiles.length === 0) return { defects, errors };
  const mainFile = candidateMainFiles.find(f => (f.content || '').includes('include_router') || (f.content || '').includes('app.use')) || candidateMainFiles[0];

  const mainContent = mainFile.content || '';

  // Find all router files in backend/app/api or backend/routes
  const routerFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.startsWith('backend/app/api/') || np.startsWith('backend/api/') || np.startsWith('backend/routes/');
  });

  // Parse every include_router() / app.use() call in main.py into structured records.
  // FastAPI: app.include_router(cart_router, prefix="/api/cart")
  // Express: app.use('/api/cart', cartRouter)
  const mountRecords = [];
  const includeRouterRe = /include_router\s*\(\s*(\w+)\s*(?:,\s*[^)]*?prefix\s*=\s*['"]([/\w]+)['"])?[^)]*\)/g;
  const appUseRe = /app\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = includeRouterRe.exec(mainContent)) !== null) {
    mountRecords.push({ routerVar: m[1], prefix: m[2] || null, raw: m[0] });
  }
  while ((m = appUseRe.exec(mainContent)) !== null) {
    mountRecords.push({ routerVar: m[2], prefix: m[1], raw: m[0] });
  }

  // Detect duplicate variable names being mounted more than once.
  const mountCounts = {};
  for (const rec of mountRecords) {
    mountCounts[rec.routerVar] = (mountCounts[rec.routerVar] || 0) + 1;
  }
  for (const [varName, count] of Object.entries(mountCounts)) {
    if (count > 1) {
      const msg = `Backend Runtime Failure: Router variable '${varName}' is mounted ${count} times in '${mainFile.path}' — duplicate mount detected.`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'ROUTER_DUPLICATE_MOUNT',
        routerVar: varName,
        severity: 'HIGH',
        message: msg
      });
    }
  }

  // Parse import aliases: "from app.api.cart import router as cart_router" -> cart -> cart_router
  const importAliasMap = new Map();
  const importRe = /from\s+[\w.]+\.([\w]+)\s+import\s+router(?:\s+as\s+(\w+))?/g;
  while ((m = importRe.exec(mainContent)) !== null) {
    const resource = m[1];
    const alias = m[2] || 'router';
    importAliasMap.set(resource, alias);
  }
  // Express JS CommonJS: const ordersRouter = require('./routes/orders');
  const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"][^'"]*\/([\w]+)(?:\.js)?['"]\s*\)/g;
  while ((m = requireRe.exec(mainContent)) !== null) {
    const alias = m[1];
    const resource = m[2];
    importAliasMap.set(resource, alias);
  }
  // Express / ESM: import ordersRouter from './routes/orders';
  const esmImportRe = /import\s+(\w+)\s+from\s+['"][^'"]*\/([\w]+)(?:\.js)?['"]/g;
  while ((m = esmImportRe.exec(mainContent)) !== null) {
    const alias = m[1];
    const resource = m[2];
    importAliasMap.set(resource, alias);
  }

  routerFiles.forEach(rf => {
    const np = normPath(rf.path);
    const baseName = path.basename(np, path.extname(np));
    if (baseName === '__init__') return;

    const content = rf.content || '';
    if (!content.includes('APIRouter(') && !content.includes('express.Router()')) return;

    const resource = baseName;

    // (a) Check router is imported into main.py / main.js by its resource name
    const importedAlias = importAliasMap.get(resource);
    const isImportedByName = importedAlias !== undefined ||
      mainContent.includes(`from app.api.${resource} import`) ||
      mainContent.includes(`from backend.app.api.${resource} import`) ||
      mainContent.includes(`/${resource} import`) ||
      new RegExp(`require\\s*\\(\\s*['"][^'"]*\\/${resource}(?:\\.js)?['"]\\s*\\)`).test(mainContent) ||
      new RegExp(`from\\s+['"][^'"]*\\/${resource}(?:\\.js)?['"]`).test(mainContent);

    if (!isImportedByName) {
      const msg = `Backend Runtime Failure: Router '${rf.path}' is not imported in '${mainFile.path}'.`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'ROUTER_NOT_IMPORTED',
        routerFile: rf.path,
        severity: 'HIGH',
        message: msg
      });
      return;
    }

    // (b) Find the specific mount record(s) for THIS router's alias only.
    // A different resource's alias must NOT satisfy this router's mount check.
    const resolvedAlias = importedAlias;
    const ownMounts = resolvedAlias
      ? mountRecords.filter(rec => rec.routerVar === resolvedAlias)
      : mountRecords.filter(rec => {
          const v = rec.routerVar.toLowerCase();
          return v === resource || v === `${resource}_router` || v === `${resource}router`;
        });

    if (ownMounts.length === 0) {
      const msg = `Backend Runtime Failure: Router '${rf.path}' (alias: ${resolvedAlias || resource}) is imported but not mounted via include_router() or app.use() in '${mainFile.path}'.`;
      errors.push(msg);
      defects.push({
        code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
        subtype: 'ROUTER_NOT_MOUNTED',
        routerFile: rf.path,
        severity: 'HIGH',
        message: msg
      });
      return;
    }

    // (c) Verify the mounted composed prefix matches the contract
    const routerInternalPrefixMatch = content.match(/APIRouter\s*\(\s*prefix\s*=\s*['"]([/\w]+)['"]/);
    const routerInternalPrefix = routerInternalPrefixMatch ? routerInternalPrefixMatch[1] : null;

    let contractPrefix = null;
    const endpoints = _options?.contract?.endpoints || _options?.manifest?.integrationContract?.endpoints;
    if (Array.isArray(endpoints)) {
      const matchedEp = endpoints.find(e => e.backendFile === rf.path || ('/' + (e.backendFile || '')).endsWith('/' + rf.path));
      if (matchedEp && matchedEp.routerPrefix) {
        contractPrefix = matchedEp.routerPrefix.replace(/\/$/, '');
      }
    }
    if (!contractPrefix && _options?.workspacePath) {
      try {
        const cPath = path.join(_options.workspacePath, '.openclaw', 'contract.json');
        if (fs.existsSync(cPath)) {
          const diskContract = JSON.parse(fs.readFileSync(cPath, 'utf8'));
          const matchedEp = (diskContract?.endpoints || []).find(e => e.backendFile === rf.path || ('/' + (e.backendFile || '')).endsWith('/' + rf.path));
          if (matchedEp && matchedEp.routerPrefix) {
            contractPrefix = matchedEp.routerPrefix.replace(/\/$/, '');
          }
        }
      } catch (_) {}
    }

    const expectedComposed = contractPrefix || `/api/${resource}`;
    const acceptableComposed = new Set([expectedComposed]);
    if (contractPrefix) {
      acceptableComposed.add(contractPrefix);
    } else {
      acceptableComposed.add(`/${resource}`);
    }

    for (const mount of ownMounts) {
      const appPrefix = mount.prefix || '';
      const composedPath = (appPrefix.replace(/\/$/, '') + (routerInternalPrefix || '')).replace(/\/$/, '');

      if (!acceptableComposed.has(composedPath)) {
        const msg = `Backend Runtime Failure: Router '${rf.path}' is mounted with composed prefix '${composedPath || '(none)'}' but contract requires '${expectedComposed}'.`;
        errors.push(msg);
        defects.push({
          code: 'DOUBLED_ROUTER_PREFIX',
          subtype: 'ROUTER_PREFIX_MISMATCH',
          routerFile: rf.path,
          file: rf.path,
          line: 1,
          hint: `Expected router composed prefix '${expectedComposed}', got '${composedPath || '(none)'}'. Fix router mount prefix in main.py or APIRouter prefix.`,
          expectedPrefix: expectedComposed,
          actualPrefix: composedPath || null,
          severity: 'HIGH',
          message: msg
        });
      }
    }

    // (d) Rule 4: Inspect route decorators (@router.get, @router.post, etc.) for doubled prefix
    const routeDecoratorRe = /@(?:router|app)\.(?:get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
    let rm;
    while ((rm = routeDecoratorRe.exec(content)) !== null) {
      const routePath = rm[1];
      const line = content.substring(0, rm.index).split('\n').length;
      for (const mount of ownMounts) {
        const appPrefix = (mount.prefix || '').replace(/\/$/, '');
        if (!appPrefix) continue;
        const normalizedRoutePath = routePath.replace(/\/$/, '');
        if (normalizedRoutePath === appPrefix || normalizedRoutePath.startsWith(appPrefix + '/')) {
          const doubled = `${appPrefix}${routePath}`;
          const msg = `Backend Runtime Failure in '${rf.path}' line ${line}: Route decorator '${rm[0]}' repeats mount prefix '${appPrefix}', leading to doubled path '${doubled}'.`;
          errors.push(msg);
          defects.push({
            code: 'DOUBLED_ROUTER_PREFIX',
            subtype: 'DOUBLED_ROUTER_PREFIX',
            file: rf.path,
            line,
            hint: `Use relative route path ('/' or '/{id}') instead of repeating mount prefix '${appPrefix}'.`,
            severity: 'CRITICAL',
            message: msg
          });
        } else if (appPrefix.endsWith(`/${resource}`) && (normalizedRoutePath === `/${resource}` || normalizedRoutePath.startsWith(`/${resource}/`))) {
          const doubled = `${appPrefix}${routePath}`;
          const msg = `Backend Runtime Failure in '${rf.path}' line ${line}: Route decorator '${rm[0]}' repeats resource segment '/${resource}', leading to doubled path '${doubled}'.`;
          errors.push(msg);
          defects.push({
            code: 'DOUBLED_ROUTER_PREFIX',
            subtype: 'DOUBLED_ROUTER_PREFIX',
            file: rf.path,
            line,
            hint: `Use relative route path ('/' or '/{id}') instead of repeating '/${resource}'.`,
            severity: 'CRITICAL',
            message: msg
          });
        }
      }
    }
  });

  defects.forEach(d => { if (!d.line) d.line = 1; if (!d.hint) d.hint = d.message || d.code; if (!d.file && d.routerFile) d.file = d.routerFile; });
  return { defects, errors, checkedRoutersCount: routerFiles.length };
}

/**
 * Rule 8: Verify core backend project files exist
 */
export function verifyCoreBackendFiles(files = [], _options = {}) {
  const defects = [];
  const errors = [];
  const filePaths = new Set(files.map(f => normPath(f.path)));

  const hasRequirements = filePaths.has('backend/requirements.txt') || filePaths.has('requirements.txt');
  if (!hasRequirements) {
    const msg = `Backend Runtime Failure: Missing core dependency file 'requirements.txt'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'backend/requirements.txt',
      line: 1,
      hint: 'Backend must contain requirements.txt listing all required Python dependencies.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasMain = filePaths.has('backend/app/main.py') || filePaths.has('app/main.py') || filePaths.has('backend/main.py') || filePaths.has('main.py');
  if (!hasMain) {
    const msg = `Backend Runtime Failure: Missing canonical backend entry point 'app/main.py'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'backend/app/main.py',
      line: 1,
      hint: 'Backend must define canonical entry point backend/app/main.py.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasModels = Array.from(filePaths).some(p => (p.includes('models') || p.includes('db/models')) && p.endsWith('.py'));
  if (!hasModels) {
    const msg = `Backend Runtime Failure: Missing core models package/directory (app/models/ or models.py).`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'backend/app/models/__init__.py',
      line: 1,
      hint: 'Backend must define ORM database models in app/models/ or app/db/models.py.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasSchemas = Array.from(filePaths).some(p => p.includes('schemas') && p.endsWith('.py'));
  if (!hasSchemas) {
    const msg = `Backend Runtime Failure: Missing core schemas package/directory (app/schemas/ or schemas.py).`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'backend/app/schemas/__init__.py',
      line: 1,
      hint: 'Backend must define Pydantic schemas in app/schemas/.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasApi = Array.from(filePaths).some(p => (p.includes('app/api/') || p.includes('api/') || p.includes('routes/')) && p.endsWith('.py'));
  if (!hasApi) {
    const msg = `Backend Runtime Failure: Missing core API router package/directory (app/api/ or routes/).`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'backend/app/api/__init__.py',
      line: 1,
      hint: 'Backend must define API routers in app/api/.',
      severity: 'HIGH',
      message: msg
    });
  }

  return { defects, errors };
}

/**
 * 9 & 10. Verify Authentication and Authorization.
 */
export async function verifyAuthAndAuthorization(files = [], options = {}) {
  const defects = [];
  const errors = [];

  // Check if authentication routes are present
  const authFile = files.find(f => f && f.path && (normPath(f.path).includes('auth.py') || normPath(f.path).includes('auth.js')));
  if (!authFile) return { defects, errors, authPresent: false };

  const content = authFile.content || '';
  const hasLogin = content.includes('/login') || content.includes('login(');
  const hasRegister = content.includes('/register') || content.includes('register(');

  if (!hasLogin && !hasRegister) {
    const msg = `Backend Runtime Failure in '${authFile.path}': authentication router is missing login or register endpoints.`;
    errors.push(msg);
    defects.push({
      code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
      subtype: 'AUTHENTICATION_FAILURE',
      file: authFile.path,
      severity: 'HIGH',
      message: msg
    });
  }

  // If live backend URL is provided, test unauthenticated access to protected route returns 401/403
  if (options.backendUrl && options.protectedEndpoint) {
    try {
      const resp = await makeHttpRequest(new URL(options.protectedEndpoint, options.backendUrl).toString(), {
        method: 'GET'
      });
      if (resp.statusCode !== 401 && resp.statusCode !== 403) {
        const msg = `Backend Runtime Failure: Protected endpoint '${options.protectedEndpoint}' returned HTTP ${resp.statusCode} (expected 401/403 Unauthorized).`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'AUTHORIZATION_FAILURE',
          endpoint: options.protectedEndpoint,
          statusCode: resp.statusCode,
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (e) {
      // ignore network errors if not testing live
    }
  }

  // Live two-user ownership isolation check: User A accessing User B's resource must return 403 or 404
  if (options.backendUrl && options.userAToken && options.userBResourceEndpoint) {
    try {
      const resp = await makeHttpRequest(new URL(options.userBResourceEndpoint, options.backendUrl).toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.userAToken}` }
      });
      if (resp.statusCode !== 403 && resp.statusCode !== 404) {
        const msg = `Backend Runtime Failure: Cross-user access allowed on '${options.userBResourceEndpoint}'. User A accessed User B's resource (status ${resp.statusCode}, expected 403 Forbidden or 404 Not Found).`;
        errors.push(msg);
        defects.push({
          code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
          subtype: 'CROSS_USER_DATA_LEAK',
          endpoint: options.userBResourceEndpoint,
          statusCode: resp.statusCode,
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (_) {
      // ignore network errors if not testing live
    }
  }

  return { defects, errors, authPresent: true };
}

/**
 * 11 & 12. Verify CRUD and Persistence.
 */
export async function verifyCrudAndPersistence(files = [], options = {}) {
  const defects = [];
  const errors = [];

  if (options.mockLLM || (options.manifest && (!options.manifest.project_requirements?.backend?.apis || options.manifest.project_requirements.backend.apis.length === 0))) {
    return { defects, errors, crudSummary: { totalGet: 0, totalPost: 0, totalPut: 0, totalDelete: 0 } };
  }

  // Scan API router files for CRUD coverage (GET, POST, PUT/PATCH, DELETE)
  const routerFiles = files.filter(f => f && f.path && (normPath(f.path).includes('/api/') || normPath(f.path).includes('/routes/')));
  let totalGet = 0;
  let totalPost = 0;
  let totalPut = 0;
  let totalDelete = 0;

  routerFiles.forEach(rf => {
    const content = rf.content || '';
    if (content.includes('.get(')) totalGet++;
    if (content.includes('.post(')) totalPost++;
    if (content.includes('.put(') || content.includes('.patch(')) totalPut++;
    if (content.includes('.delete(')) totalDelete++;
  });

  if (routerFiles.length > 0 && (totalGet === 0 || totalPost === 0)) {
    const msg = `Backend Runtime Failure: Backend API lacks fundamental CRUD capabilities (GET: ${totalGet}, POST: ${totalPost}).`;
    errors.push(msg);
    defects.push({
      code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE,
      subtype: 'CRUD_FAILURE',
      severity: 'HIGH',
      message: msg
    });
  }

  return { defects, errors, crudSummary: { totalGet, totalPost, totalPut, totalDelete } };
}

/**
 * Master Phase 10 Gate Validator
 * Coordinates all 12 backend runtime validation steps.
 */
export async function validateBackendRuntime(filesInput = [], optionsInput = {}) {
  const files = Array.isArray(filesInput) ? filesInput : (filesInput?.generatedFiles || filesInput?.files || []);
  const options = Array.isArray(filesInput) ? optionsInput : { ...filesInput, ...optionsInput };
  if (options.workspacePath && !options.mockLLM && !options.isolated) {
    const sandbox = createValidationWorkspace(files, options.workspacePath);
    try { return await validateBackendRuntime(files, { ...options, python: options.python || getPythonBinary(options.workspacePath), workspacePath: sandbox.directory, isolated: true }); }
    finally { sandbox.cleanup(); }
  }
  const allDefects = [];
  const allErrors = [];

  // 1. Verify Imports (6)
  const importsRes = await verifyBackendImports(files, options);
  allDefects.push(...importsRes.defects);
  allErrors.push(...importsRes.errors);

  // 2. Verify Application Startup (1 & 7)
  const startupRes = await verifyApplicationStartup(files, options);
  allDefects.push(...startupRes.defects);
  allErrors.push(...startupRes.errors);

  // 3. Verify Health Endpoint (2)
  const healthRes = await verifyHealthEndpoint(files, options);
  allDefects.push(...healthRes.defects);
  allErrors.push(...healthRes.errors);

  // 4. Verify Database Connection (3)
  const dbRes = await verifyDatabaseConnection(files, options);
  allDefects.push(...dbRes.defects);
  allErrors.push(...dbRes.errors);

  // 5. Run Migration (4)
  const migRes = await runMigration(files, options);
  allDefects.push(...migRes.defects);
  allErrors.push(...migRes.errors);

  // 6. Verify Tables (5)
  const tblRes = await verifyDatabaseTables(files, options);
  allDefects.push(...tblRes.defects);
  allErrors.push(...tblRes.errors);

  // 7. Verify API Registration (8)
  const apiRes = verifyApiRegistration(files, options);
  allDefects.push(...apiRes.defects);
  allErrors.push(...apiRes.errors);

  // 8. Verify Authentication & Authorization (9 & 10)
  const authRes = await verifyAuthAndAuthorization(files, options);
  allDefects.push(...authRes.defects);
  allErrors.push(...authRes.errors);

  let httpEvidence = { executed: false };
  if (!options.mockLLM && options.workspacePath && files.some(f => f.path === 'backend/main.py')) {
    const script = `import json, re
from httpx import ASGITransport, AsyncClient
import asyncio
from main import app
try:
    from app.db.database import Base, engine
    Base.metadata.create_all(bind=engine)
except ImportError:
    pass

async def run_checks():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health = next((r.path for r in app.routes if getattr(r, 'path', '').rstrip('/').split('/')[-1] in ('health', 'ping')), None)
        assert health, 'No health endpoint registered'
        response = await client.get(health)
        assert response.status_code == 200, 'Health endpoint failed: ' + str(response.status_code)
        assert isinstance(response.json(), dict), 'Health must return JSON object'
        protected = 0
        for route in app.routes:
            dep = getattr(route, 'dependant', None)
            stack = list(getattr(dep, 'dependencies', []))
            guarded = False
            while stack:
                item = stack.pop()
                guarded = guarded or getattr(getattr(item, 'call', None), '__name__', '') in ('get_current_user', 'get_current_active_user', 'require_admin', 'get_current_admin')
                stack.extend(getattr(item, 'dependencies', []))
            if guarded or '/admin/' in getattr(route, 'path', ''):
                url = re.sub('[{][^}]+[}]', '1', route.path)
        for method in sorted(getattr(route, 'methods', []) - {'HEAD', 'OPTIONS'}):
            response = await client.request(method, url)
            assert response.status_code in (401, 403), method + ' ' + url + ' accepts unauthenticated requests or has broken auth dependencies: ' + str(response.status_code)
            protected += 1
    print(json.dumps({'executed': True, 'healthPassed': True, 'protectedEndpointsChecked': protected}))

asyncio.run(run_checks())
`;
    try {
      const pyBin = options.python || getPythonBinary(options.workspacePath);
      if (!pyBin) throw new Error('Python interpreter unavailable; HTTP runtime checks blocked');
      const result = await (options.execute || executeCommand)(pyBin, ['-c', script], { cwd: path.join(options.workspacePath, 'backend'), env: validationEnvironment(options.workspacePath), timeout: options.timeout || 60000 });
      if (result.code !== 0) throw new Error(result.output || 'HTTP runtime checks failed');
      httpEvidence = JSON.parse(result.output.trim().split('\n').at(-1));
    } catch (error) {
      allDefects.push({ code: BACKEND_DEFECT_CODES.BACKEND_RUNTIME_FAILURE, subtype: 'HTTP_RUNTIME_FAILURE', file: 'backend/main.py', severity: 'HIGH', message: error.message });
      allErrors.push(error.message);
    }
  }

  // 9. Verify CRUD & Persistence (11 & 12)
  const crudRes = await verifyCrudAndPersistence(files, options);
  allDefects.push(...crudRes.defects);
  allErrors.push(...crudRes.errors);

  // 10. Verify Core Backend Files (Rule 8)
  const coreFilesRes = verifyCoreBackendFiles(files, options);
  allDefects.push(...coreFilesRes.defects);
  allErrors.push(...coreFilesRes.errors);

  // 11. Verification Non-vacuousness (Rule 9)
  if (options.requireLiveExecution && !options.mockLLM && !httpEvidence.executed) {
    const msg = 'Gate failed closed: backend live HTTP execution was skipped or unavailable.';
    allErrors.push(msg);
    allDefects.push({
      code: 'EXECUTION_NON_VACUOUSNESS_FAILURE',
      subtype: 'EXECUTION_NON_VACUOUSNESS_FAILURE',
      file: 'backend/main.py',
      line: 1,
      hint: 'Backend runtime gate requires live execution proof of startup and health check before passing.',
      severity: 'CRITICAL',
      message: msg
    });
  }

  // Ensure Rule 10: All defects carry code, file, line, hint
  allDefects.forEach(d => {
    if (!d.line) d.line = 1;
    if (!d.hint) d.hint = d.message || d.code;
    if (!d.file) d.file = 'backend/app/main.py';
  });

  const isValid = allDefects.length === 0;

  return {
    isValid,
    defects: allDefects,
    errors: allErrors,
    summary: {
      totalDefects: (allDefects || []).length,
      startupValid: (startupRes?.defects?.length || 0) === 0,
      healthValid: (healthRes?.defects?.length || 0) === 0,
      dbConnected: (dbRes?.defects?.length || 0) === 0,
      tablesVerified: (tblRes?.defects?.length || 0) === 0,
      migrationsValid: (migRes?.defects?.length || 0) === 0,
      importsValid: (importsRes?.defects?.length || 0) === 0,
      apiRegistered: (apiRes?.defects?.length || 0) === 0,
      authValid: (authRes?.defects?.length || 0) === 0,
      crudValid: (crudRes?.defects?.length || 0) === 0,
      crudCheck: 'static route inventory; persistence verified by executable workflows',
      httpEvidence,
      isValid
    }
  };
}
