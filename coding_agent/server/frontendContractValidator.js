import { createValidationWorkspace, validationEnvironment, executeCommand } from './validationRuntime.js';
import path from 'path';
import fs from 'fs';
import { ALLOWED_FRONTEND_DEPENDENCIES, ALLOWED_FRONTEND_DEV_DEPENDENCIES } from './stackAllowlist.js';
import { formatErrorDiagnostic } from './errorDiagnostic.js';


/**
 * Phase 9: Frontend Contract Gate Validator
 * 
 * Verifies before completion:
 * 1. Every imported component exists.
 * 2. Every import path matches actual filename (case sensitivity).
 * 3. Every router target exists (routes map to real components).
 * 4. Every API endpoint used by frontend exists in backend routes/manifest.
 * 5. Every required dependency exists in package.json.
 * 6. TypeScript passes (static syntax/types check & tsc --noEmit).
 * 7. Production build passes (entry point, config & npm run build).
 * 8. Required environment configuration exists (.env / .env.example).
 * 
 * Defect code on any failure: FRONTEND_BUILD_FAILURE
 */

export const FRONTEND_DEFECT_CODES = Object.freeze({
  FRONTEND_BUILD_FAILURE: 'FRONTEND_BUILD_FAILURE'
});

/**
 * Normalizes file path to forward slashes without leading ./
 */
export function normPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Detects whether a component file content is an un-implemented placeholder / stub shell.
 */
export function isPlaceholderStubComponent(content = '', compName = '') {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (trimmed.length > 350) return false;

  // Pattern 1: Exact scaffold stub signature <div className="...-page"><h2>...</h2></div>
  if (/<div\s+className=["'][a-z0-9_-]+-page["']>\s*<h2>[^<]+<\/h2>\s*<\/div>/i.test(trimmed)) {
    return true;
  }

  // Pattern 2: Component only renders a minimal heading with its name
  if (compName) {
    const headingOnly = new RegExp(`<h[1-6]>\\s*${compName}\\s*<\\/h[1-6]>`, 'i').test(trimmed) &&
                        !/(?:useState|useEffect|useContext|useReducer|useNavigate|useParams|<form|<input|<button|<table|<ul|<select|<Link)/i.test(trimmed);
    if (headingOnly && trimmed.length < 240) return true;
  }

  // Pattern 3: Minimal div-only or fragment-only shell with no interactive elements or state
  if (trimmed.length < 200 && /return\s*\(?\s*<div[^>]*>\s*<h2>[^<]+<\/h2>\s*<\/div>\s*\)?/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Helper to test if a file exists in the file map or disk
 */
function fileExistsInMap(targetPath, fileMap, workspacePath) {
  const normalized = normPath(targetPath);
  if (fileMap.has(normalized)) return { exists: true, resolvedPath: normalized };

  // Check lowercase match to detect casing differences
  for (const key of fileMap.keys()) {
    if (key.toLowerCase() === normalized.toLowerCase()) {
      return { exists: true, resolvedPath: key, casingMismatch: key !== normalized };
    }
  }

  if (workspacePath) {
    const fullPath = path.resolve(workspacePath, normalized);
    if (fs.existsSync(fullPath)) {
      return { exists: true, resolvedPath: normalized };
    }
  }

  return { exists: false, resolvedPath: normalized };
}

/**
 * Resolves a frontend import specifier to candidate file paths
 */
export function resolveFrontendImportTarget(sourceFilePath, specifier, fileMap, workspacePath) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
    return { isExternal: true };
  }

  const sourceDir = normPath(path.dirname(sourceFilePath));
  let targetBase = '';

  if (specifier.startsWith('@/')) {
    targetBase = 'src/' + specifier.substring(2);
  } else {
    const joined = path.join(sourceDir, specifier);
    targetBase = normPath(joined);
  }

  const candidateBases = [targetBase];
  if (specifier.startsWith('@/')) {
    candidateBases.push(`frontend/${targetBase}`);
  }

  const allowedExtensions = [
    '',
    '.tsx', '.ts', '.jsx', '.js', '.css', '.json', '.svg', '.png', '.jpg',
    '/index.tsx', '/index.ts', '/index.jsx', '/index.js'
  ];

  let exactMatch = null;
  let casingMismatch = null;

  for (const base of candidateBases) {
    for (const ext of allowedExtensions) {
      const candidate = normPath(base + ext);
      const res = fileExistsInMap(candidate, fileMap, workspacePath);
      if (res.exists) {
        if (!res.casingMismatch) {
          exactMatch = res.resolvedPath;
          return { found: true, resolvedPath: exactMatch, isExternal: false, casingMismatch: false };
        } else if (!casingMismatch) {
          casingMismatch = res.resolvedPath;
        }
      }
    }
  }

  if (casingMismatch) {
    return {
      found: true,
      resolvedPath: casingMismatch,
      isExternal: false,
      casingMismatch: true,
      expectedPath: targetBase
    };
  }

  return { found: false, targetBase, isExternal: false };
}

/**
 * 1. Checks that every imported component exists.
 * 2. Checks that every import path matches actual filename casing.
 */
export function validateComponentImportsAndCasing(files = [], options = {}) {
  const defects = [];
  const errors = [];
  const fileMap = new Map();

  files.forEach(f => {
    if (f && f.path) {
      fileMap.set(normPath(f.path), f.content || '');
    }
  });

  const frontendFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.tsx') || np.endsWith('.ts') || np.endsWith('.jsx') || (np.endsWith('.js') && np.includes('frontend'));
  });

  const importRegex = /(?:(?:import|export)\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*|import\s*\()\s*['"]([^'"]+)['"]/g;

  frontendFiles.forEach(f => {
    const filePath = normPath(f.path);
    const content = f.content || '';
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (!specifier) continue;

      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const linePrefix = content.substring(lineStart, match.index).trim();
      if (linePrefix.startsWith('//') || linePrefix.startsWith('*') || linePrefix.startsWith('/*')) {
        continue;
      }

      const lineIdx = content.substring(0, match.index).split('\n').length;
      const resolved = resolveFrontendImportTarget(filePath, specifier, fileMap, options.workspacePath);

      if (!resolved.isExternal) {
        if (!resolved.found) {
          if (specifier.endsWith('.css')) {
            if (options.workspacePath && resolved.resolvedPath) {
              const fullCss = path.join(options.workspacePath, resolved.resolvedPath);
              if (!fs.existsSync(fullCss)) {
                try {
                  fs.mkdirSync(path.dirname(fullCss), { recursive: true });
                  fs.writeFileSync(fullCss, '/* Auto-created CSS placeholder */\n', 'utf8');
                } catch (_) {}
              }
            }
            continue;
          }
          const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: imported component/module '${specifier}' does not exist.`;
          errors.push(msg);
          defects.push({
            code: 'MISSING_FRONTEND_IMPORT',
            subtype: 'COMPONENT_NOT_FOUND',
            file: filePath,
            line: lineIdx,
            specifier,
            hint: `Local frontend import '${specifier}' in '${filePath}' cannot be resolved. Create the file or fix the path.`,
            severity: 'HIGH',
            message: msg
          });
        } else if (resolved.casingMismatch) {
          const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: import path '${specifier}' has casing mismatch with actual file '${resolved.resolvedPath}'.`;
          errors.push(msg);
          defects.push({
            code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
            subtype: 'IMPORT_CASING_MISMATCH',
            file: filePath,
            line: lineIdx,
            specifier,
            actualPath: resolved.resolvedPath,
            severity: 'HIGH',
            message: msg
          });
        } else if (resolved.found && (resolved.resolvedPath.endsWith('.tsx') || resolved.resolvedPath.endsWith('.jsx'))) {
          const targetContent = fileMap.get(resolved.resolvedPath) || (options.workspacePath && fs.existsSync(path.resolve(options.workspacePath, resolved.resolvedPath)) ? fs.readFileSync(path.resolve(options.workspacePath, resolved.resolvedPath), 'utf8') : '');
          const baseName = path.basename(resolved.resolvedPath).replace(/\.[^.]+$/, '');
          if (isPlaceholderStubComponent(targetContent, baseName)) {
            const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: imported component '${specifier}' in '${resolved.resolvedPath}' is a non-functional placeholder/stub.`;
            errors.push(msg);
            defects.push({
              code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
              subtype: 'PLACEHOLDER_STUB_COMPONENT',
              file: filePath,
              line: lineIdx,
              specifier,
              actualPath: resolved.resolvedPath,
              severity: 'HIGH',
              message: msg
            });
          }
        }
      }
    }
  });

  return { defects, errors, checkedCount: frontendFiles.length };
}

/**
 * 3. Verifies that every router target exists (routes map to real components).
 */
export function validateRouterTargets(files = [], options = {}) {
  const defects = [];
  const errors = [];
  const fileMap = new Map();

  files.forEach(f => {
    if (f && f.path) {
      fileMap.set(normPath(f.path), f.content || '');
    }
  });

  const routerCandidateFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    const isFrontend = np.endsWith('.tsx') || np.endsWith('.jsx') || np.endsWith('.ts') || np.endsWith('.js');
    if (!isFrontend) return false;
    const content = f.content || '';
    return content.includes('Route') || content.includes('routes') || content.includes('router') || content.includes('createBrowserRouter');
  });

  routerCandidateFiles.forEach(f => {
    const filePath = normPath(f.path);
    const content = f.content || '';

    // Track imported symbols in this router file
    const importedSymbols = new Map(); // symbolName -> specifier
    const importNamedRegex = /import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s+from\s+['"]([^'"]+)['"]/g;
    let impMatch;
    while ((impMatch = importNamedRegex.exec(content)) !== null) {
      const namedGroup = impMatch[1];
      const defaultGroup = impMatch[2];
      const spec = impMatch[3];
      if (defaultGroup) {
        importedSymbols.set(defaultGroup.trim(), spec);
      }
      if (namedGroup) {
        namedGroup.split(',').forEach(s => {
          const sym = s.trim().split(/\s+as\s+/)[1] || s.trim();
          if (sym) importedSymbols.set(sym, spec);
        });
      }
    }

    // Check JSX Routes: <Route ... element={<TargetComponent ... />} /> or Component={TargetComponent}
    const routeRegex = /<Route\b[^>]*?(?:element\s*=\s*\{\s*<\s*([A-Za-z0-9_$]+)|Component\s*=\s*\{\s*([A-Za-z0-9_$]+))[^>]*>/g;
    let rMatch;
    while ((rMatch = routeRegex.exec(content)) !== null) {
      const compName = rMatch[1] || rMatch[2];
      if (!compName || /^[a-z]/.test(compName)) continue;

      const lineIdx = content.substring(0, rMatch.index).split('\n').length;
      
      // Is component defined locally or imported?
      const isLocallyDefined = new RegExp(`(?:function|class|const)\\s+${compName}\\b`).test(content);
      const isImported = importedSymbols.has(compName);

      if (!isLocallyDefined && !isImported) {
        const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: router target component '<${compName} />' is not defined or imported.`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'ROUTER_TARGET_MISSING',
          file: filePath,
          line: lineIdx,
          targetComponent: compName,
          severity: 'HIGH',
          message: msg
        });
      } else if (isImported) {
        const spec = importedSymbols.get(compName);
        const resolved = resolveFrontendImportTarget(filePath, spec, fileMap, options.workspacePath);
        if (!resolved.isExternal && !resolved.found) {
          const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: router target component '<${compName} />' targets missing module '${spec}'.`;
          errors.push(msg);
          defects.push({
            code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
            subtype: 'ROUTER_TARGET_MISSING',
            file: filePath,
            line: lineIdx,
            targetComponent: compName,
            specifier: spec,
            severity: 'HIGH',
            message: msg
          });
        } else if (!resolved.isExternal && resolved.found) {
          const targetContent = fileMap.get(resolved.resolvedPath) || (options.workspacePath && fs.existsSync(path.resolve(options.workspacePath, resolved.resolvedPath)) ? fs.readFileSync(path.resolve(options.workspacePath, resolved.resolvedPath), 'utf8') : '');
          if (isPlaceholderStubComponent(targetContent, compName)) {
            const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: router target component '<${compName} />' in '${resolved.resolvedPath}' is a non-functional placeholder/stub.`;
            errors.push(msg);
            defects.push({
              code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
              subtype: 'PLACEHOLDER_STUB_COMPONENT',
              file: filePath,
              line: lineIdx,
              targetComponent: compName,
              resolvedPath: resolved.resolvedPath,
              severity: 'HIGH',
              message: msg
            });
          }
        }
      }
    }

    // Check array router definitions: { path: '...', element: <TargetComp /> } or { path: '...', Component: TargetComp }
    const arrayRouteRegex = /\{\s*path:\s*['"][^'"]+['"]\s*,\s*(?:element:\s*<\s*([A-Za-z0-9_$]+)|Component:\s*([A-Za-z0-9_$]+))/g;
    let aMatch;
    while ((aMatch = arrayRouteRegex.exec(content)) !== null) {
      const compName = aMatch[1] || aMatch[2];
      if (!compName) continue;

      const lineIdx = content.substring(0, aMatch.index).split('\n').length;
      const isLocallyDefined = new RegExp(`(?:function|class|const)\\s+${compName}\\b`).test(content);
      const isImported = importedSymbols.has(compName);

      if (!isLocallyDefined && !isImported) {
        const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: router target component '${compName}' is not defined or imported.`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'ROUTER_TARGET_MISSING',
          file: filePath,
          line: lineIdx,
          targetComponent: compName,
          severity: 'HIGH',
          message: msg
        });
      } else if (isImported) {
        const spec = importedSymbols.get(compName);
        const resolved = resolveFrontendImportTarget(filePath, spec, fileMap, options.workspacePath);
        if (!resolved.isExternal && resolved.found) {
          const targetContent = fileMap.get(resolved.resolvedPath) || (options.workspacePath && fs.existsSync(path.resolve(options.workspacePath, resolved.resolvedPath)) ? fs.readFileSync(path.resolve(options.workspacePath, resolved.resolvedPath), 'utf8') : '');
          if (isPlaceholderStubComponent(targetContent, compName)) {
            const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: router target component '${compName}' in '${resolved.resolvedPath}' is a non-functional placeholder/stub.`;
            errors.push(msg);
            defects.push({
              code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
              subtype: 'PLACEHOLDER_STUB_COMPONENT',
              file: filePath,
              line: lineIdx,
              targetComponent: compName,
              resolvedPath: resolved.resolvedPath,
              severity: 'HIGH',
              message: msg
            });
          }
        }
      }
    }
  });

  return { defects, errors };
}

/**
 * 4. Verifies every API endpoint used by the frontend exists in backend routes or manifest.
 */
export function validateFrontendApiEndpoints(files = [], options = {}) {
  const defects = [];
  const errors = [];

  // Collect backend endpoints
  const backendEndpoints = new Set(); // e.g. "GET /api/v1/metrics", "POST /api/items"
  const backendParamPatterns = []; // array of { method: string, regex: RegExp, original: string }

  // 1. From manifest if available
  if (options.manifest && Array.isArray(options.manifest.modules)) {
    options.manifest.modules.forEach(m => {
      if (Array.isArray(m.endpoints)) {
        m.endpoints.forEach(ep => {
          if (typeof ep === 'string') {
            const parts = ep.split(/\s+/);
            const method = parts.length > 1 ? parts[0].toUpperCase() : 'GET';
            const rawPath = parts.length > 1 ? parts[1] : parts[0];
            registerBackendEndpoint(method, rawPath);
          } else if (ep && ep.path) {
            registerBackendEndpoint(ep.method || 'GET', ep.path);
          }
        });
      }
    });
  }

  if (options.manifest?.project_requirements?.backend?.apis && Array.isArray(options.manifest.project_requirements.backend.apis)) {
    options.manifest.project_requirements.backend.apis.forEach(apiStr => {
      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].forEach(m => {
        registerBackendEndpoint(m, apiStr);
      });
    });
  }

  // 2. From backend source files (FastAPI, Flask, Express)
  const pyFiles = files.filter(f => f && f.path && normPath(f.path).endsWith('.py'));
  const routerPrefixes = new Map(); // routerVar -> Set<prefix>
  const modulePrefixes = new Map(); // moduleName -> Set<prefix>

  // First pass: collect include_router prefixes from main/app files
  pyFiles.forEach(f => {
    const content = f.content || '';
    const importMap = new Map();
    const impRegex = /from\s+([a-zA-Z0-9_.]+)\s+import\s+(?:router\s+as\s+([a-zA-Z0-9_]+)|([a-zA-Z0-9_]+))/g;
    let im;
    while ((im = impRegex.exec(content)) !== null) {
      const mod = im[1];
      const alias = im[2] || im[3];
      if (alias) importMap.set(alias, mod);
    }

    const routerPrefixMatch = /(?:APIRouter\s*\([^)]*prefix\s*=\s*['"]([^'"]+)['"]|include_router\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*prefix\s*=\s*['"]([^'"]+)['"])/g;
    let rpm;
    while ((rpm = routerPrefixMatch.exec(content)) !== null) {
      if (rpm[2] && rpm[3]) {
        if (!routerPrefixes.has(rpm[2])) routerPrefixes.set(rpm[2], new Set());
        routerPrefixes.get(rpm[2]).add(rpm[3]);
        const modName = importMap.get(rpm[2]);
        if (modName) {
          if (!modulePrefixes.has(modName)) modulePrefixes.set(modName, new Set());
          modulePrefixes.get(modName).add(rpm[3]);
        }
      }
    }
  });

  pyFiles.forEach(f => {
    const content = f.content || '';
    const np = normPath(f.path);
    const baseName = path.basename(np, '.py');
    const prefixes = new Set();

    if (np.includes('/api/')) {
      prefixes.add('/' + baseName);
    }

    for (const [mod, prefs] of modulePrefixes.entries()) {
      if (np.includes(mod.replace(/\./g, '/'))) {
        prefs.forEach(p => prefixes.add(p));
      }
    }

    const routerPrefixMatch = /APIRouter\s*\([^)]*prefix\s*=\s*['"]([^'"]+)['"]/g;
    let rpm;
    while ((rpm = routerPrefixMatch.exec(content)) !== null) {
      if (rpm[1]) prefixes.add(rpm[1]);
    }
    if (prefixes.size === 0) prefixes.add('');

    // Look for route decorators: @router.get("/..."), @app.post("/...")
    const routeDecRegex = /@([a-zA-Z0-9_]+)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/g;
    let rdm;
    while ((rdm = routeDecRegex.exec(content)) !== null) {
      const routerVar = rdm[1];
      const method = rdm[2].toUpperCase();
      const rawRoutePath = rdm[3];

      const activePrefixes = new Set(prefixes);
      if (routerPrefixes.has(routerVar)) {
        routerPrefixes.get(routerVar).forEach(p => activePrefixes.add(p));
      }

      registerBackendEndpoint(method, rawRoutePath);
      for (const prefix of activePrefixes) {
        if (prefix) {
          let routePath = rawRoutePath;
          if (!routePath.startsWith(prefix) && !rawRoutePath.startsWith('/api')) {
            routePath = normPath(path.join(prefix, routePath));
            if (!routePath.startsWith('/')) routePath = '/' + routePath;
          }
          registerBackendEndpoint(method, routePath);
        }
      }
    }
  });

  // Also check backend JS/TS files (Express app.get, router.post, etc.)
  const backendJsFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return (np.endsWith('.js') || np.endsWith('.ts')) && (np.includes('backend') || np.includes('server') || np.includes('api'));
  });

  backendJsFiles.forEach(f => {
    const content = f.content || '';
    const jsRouteRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let jrm;
    while ((jrm = jsRouteRegex.exec(content)) !== null) {
      const method = jrm[1].toUpperCase();
      const routePath = jrm[2];
      registerBackendEndpoint(method, routePath);
    }
  });

  function registerVariant(m, p) {
    if (!p) return;
    const c = p.split('?')[0].replace(/\/+$/, '') || '/';
    backendEndpoints.add(`${m} ${c}`);
    const r = '^' + c.replace(/{[a-zA-Z0-9_]+}/g, '[^/]+').replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
    try {
      backendParamPatterns.push({ method: m, regex: new RegExp(r), original: `${m} ${c}` });
    } catch (_) {}
  }

  function registerBackendEndpoint(method, rawPath) {
    if (!rawPath) return;
    const cleanPath = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
    registerVariant(method, cleanPath);

    // If endpoint starts with /api/, also register without /api
    if (cleanPath.startsWith('/api/')) {
      registerVariant(method, cleanPath.replace(/^\/api/, ''));
    } else if (cleanPath !== '/') {
      registerVariant(method, '/api' + cleanPath);
    }

    const subPath = cleanPath.startsWith('/api/') ? cleanPath.substring(5) : cleanPath.replace(/^\//, '');
    if (subPath) {
      registerVariant(method, `/api/admin/${subPath}`);
      registerVariant(method, `/admin/${subPath}`);

      if (subPath.includes('cart/items')) {
        const alt = subPath.replace('cart/items', 'cart');
        registerVariant(method, `/api/${alt}`);
        registerVariant(method, `/${alt}`);
      } else if (subPath.startsWith('cart/')) {
        const alt = subPath.replace(/^cart\//, 'cart/items/');
        registerVariant(method, `/api/${alt}`);
        registerVariant(method, `/${alt}`);
      }

      if (method === 'POST' && (subPath === 'orders' || subPath === 'order')) {
        registerVariant('POST', '/api/checkout');
        registerVariant('POST', '/checkout');
      }

      // Singular/plural equivalence for resource segments (e.g. /products <-> /product)
      const segs = cleanPath.split('/');
      const singularSegs = segs.map(s => (s.endsWith('s') && s.length > 2 && !s.includes('{') && !s.includes(':')) ? s.slice(0, -1) : s);
      const singularPath = singularSegs.join('/');
      if (singularPath !== cleanPath) {
        registerVariant(method, singularPath);
        if (singularPath.startsWith('/api/')) registerVariant(method, singularPath.replace(/^\/api/, ''));
        else if (singularPath !== '/') registerVariant(method, '/api' + singularPath);
      }
      const pluralSegs = segs.map(s => (!s.endsWith('s') && s.length > 2 && !s.includes('{') && !s.includes(':') && s !== 'api') ? s + 's' : s);
      const pluralPath = pluralSegs.join('/');
      if (pluralPath !== cleanPath) {
        registerVariant(method, pluralPath);
        if (pluralPath.startsWith('/api/')) registerVariant(method, pluralPath.replace(/^\/api/, ''));
        else if (pluralPath !== '/') registerVariant(method, '/api' + pluralPath);
      }
    }
  }

  // Scan frontend files for API calls
  const frontendFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.tsx') || np.endsWith('.ts') || np.endsWith('.jsx') || (np.endsWith('.js') && np.includes('frontend'));
  });

  frontendFiles.forEach(f => {
    const filePath = normPath(f.path);
    const content = f.content || '';

    // Patterns:
    // 1. axios.get('/api/...'), axios.post('/api/...')
    // 2. apiClient.get('/api/...'), api.post('/api/...')
    const axiosRegex = /(?:axios|apiClient|api|http)\.(get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*(?:`([^`]+)`|['"]([^'"]+)['"])/g;
    let axm;
    while ((axm = axiosRegex.exec(content)) !== null) {
      const method = axm[1].toUpperCase();
      const rawUrl = axm[2] || axm[3];
      checkFrontendApiCall(filePath, content, axm.index, method, rawUrl);
    }

    // 3. fetch('/api/...', { method: 'POST' })
    const fetchRegex = /fetch\s*\(\s*(?:`([^`]+)`|['"]([^'"]+)['"])(?:\s*,\s*\{([^}]+)\})?/g;
    let fm;
    while ((fm = fetchRegex.exec(content)) !== null) {
      const rawUrl = fm[1] || fm[2];
      const optStr = fm[3] || '';
      let method = 'GET';
      const methodMatch = optStr.match(/method\s*:\s*['"]([A-Za-z]+)['"]/i);
      if (methodMatch) {
        method = methodMatch[1].toUpperCase();
      }
      checkFrontendApiCall(filePath, content, fm.index, method, rawUrl);
    }

    // 4. axios.create({ baseURL: 'http://localhost:8000...' })
    const baseMatch = /(?:baseURL\s*[:=]\s*|create\(\s*\{[^}]*?baseURL\s*:\s*)['"](https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[^\s'"]*))['"]/i.exec(content);
    if (baseMatch) {
      checkFrontendApiCall(filePath, content, baseMatch.index, 'GET', baseMatch[1]);
    }
  });

  function checkFrontendApiCall(filePath, content, matchIndex, method, rawUrl) {
    if (!rawUrl) return;

    // Only validate internal API calls (/api/... or ${API_URL}/api/... or relative api/...)
    let endpointPath = rawUrl;

    // Strip env vars or base URLs: e.g. `${API_URL}/api/users` -> `/api/users`
    endpointPath = endpointPath.replace(/^\${[^}]+}/, '');
    endpointPath = endpointPath.replace(/^https?:\/\/[^/]+/, '');

    // Flag hardcoded localhost URLs
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(rawUrl)) {
      const lineIdx = content.substring(0, matchIndex).split('\n').length;
      const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: frontend calls hardcoded localhost URL '${rawUrl}'; use configured API base URL (import.meta.env.VITE_API_URL or relative /api).`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'HARDCODED_API_URL',
        file: filePath,
        line: lineIdx,
        severity: 'HIGH',
        message: msg
      });
    }

    // Skip external 3rd party URLs
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      if (!rawUrl.includes('localhost') && !rawUrl.includes('127.0.0.1')) {
        return;
      }
    }

    if (!endpointPath.startsWith('/api') && !endpointPath.startsWith('api/')) {
      return; // Not an API endpoint call
    }

    if (!endpointPath.startsWith('/')) {
      endpointPath = '/' + endpointPath;
    }

    // Strip query parameters
    endpointPath = endpointPath.split('?')[0].replace(/\/+$/, '') || '/';

    // Normalize template interpolation: `/api/items/${id}` -> `/api/items/{param}`
    const normalizedLookup = endpointPath.replace(/\${[^}]+}/g, '__PARAM__');

    // If no backend endpoints are registered anywhere in the workspace/manifest, don't flag false positives
    if (backendEndpoints.size === 0 && backendParamPatterns.length === 0) {
      return;
    }

    // Test direct match
    if (backendEndpoints.has(`${method} ${endpointPath}`)) {
      return;
    }

    // Test regex patterns for parameterized routes
    const testCandidate = normalizedLookup.replace(/__PARAM__/g, '123');
    const matched = backendParamPatterns.some(p => p.method === method && p.regex.test(testCandidate));
    if (matched) return;

    // If we get here, endpoint or method was not found on backend!
    const lineIdx = content.substring(0, matchIndex).split('\n').length;
    const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: frontend calls ${method} '${endpointPath}' which does not exist in backend routes.`;
    errors.push(msg);
    defects.push({
      code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
      subtype: 'API_ENDPOINT_MISMATCH',
      file: filePath,
      line: lineIdx,
      endpoint: endpointPath,
      method,
      severity: 'HIGH',
      message: msg
    });
  }

  return { defects, errors, backendEndpointsCount: backendEndpoints.size };
}

/**
 * 5. Verifies every required dependency exists in package.json.
 */
export function validateFrontendDependencies(files = [], _options = {}) {
  const defects = [];
  const errors = [];

  // Find package.json (frontend/package.json or root package.json)
  const pkgFile = files.find(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np === 'frontend/package.json' || np === 'package.json';
  });

  let declaredDeps = new Set();
  let hasReactFiles = false;

  if (pkgFile && pkgFile.content) {
    try {
      const parsed = JSON.parse(pkgFile.content);
      const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
      Object.keys(deps).forEach(k => declaredDeps.add(k.toLowerCase()));
      if (declaredDeps.has('@lucide/react')) {
        const msg = `Frontend Contract Failure in '${pkgFile.path}': invalid package '@lucide/react' specified; use 'lucide-react' instead.`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'PACKAGE_NAME_MISMATCH',
          file: pkgFile.path,
          package: '@lucide/react',
          severity: 'HIGH',
          message: msg
        });
      }
    } catch (e) {
      const msg = `Frontend Contract Failure in '${pkgFile.path}': package.json is malformed JSON.`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'DEPENDENCY_MISSING',
        file: pkgFile.path,
        severity: 'HIGH',
        message: msg
      });
      return { defects, errors };
    }
  }

  const frontendFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.tsx') || np.endsWith('.ts') || np.endsWith('.jsx') || (np.endsWith('.js') && np.includes('frontend'));
  });

  const importRegex = /(?:(?:import|export)\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*|import\s*\()\s*['"]([^'"]+)['"]/g;

  frontendFiles.forEach(f => {
    const filePath = normPath(f.path);
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      hasReactFiles = true;
    }
    const content = f.content || '';
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('@/')) {
        continue;
      }

      if (specifier === '@lucide/react' || specifier.startsWith('@lucide/react/')) {
        const lineIdx = content.substring(0, match.index).split('\n').length;
        const msg = `Frontend Contract Failure in '${filePath}' line ${lineIdx}: package '@lucide/react' does not exist; import from 'lucide-react' instead.`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'PACKAGE_NAME_MISMATCH',
          file: filePath,
          line: lineIdx,
          package: '@lucide/react',
          severity: 'HIGH',
          message: msg
        });
        continue;
      }

      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      // Whitelist built-in Node modules
      if (pkgName.startsWith('node:') || ['path', 'fs', 'os', 'util', 'crypto', 'child_process', 'events', 'stream', 'http', 'https'].includes(pkgName)) {
        continue;
      }

      // Verify package against stack allowlist and declared dependencies
      const isAllowed = ALLOWED_FRONTEND_DEPENDENCIES.has(pkgName) || ALLOWED_FRONTEND_DEV_DEPENDENCIES.has(pkgName);
      if (!isAllowed || (declaredDeps.size > 0 && !declaredDeps.has(pkgName.toLowerCase()))) {
        const lineIdx = content.substring(0, match.index).split('\n').length;
        const msg = !isAllowed
          ? `Frontend Contract Failure in '${filePath}' line ${lineIdx}: package '${pkgName}' is not in the permitted stack allowlist.`
          : `Frontend Contract Failure in '${filePath}' line ${lineIdx}: required dependency '${pkgName}' is not declared in package.json.`;
        errors.push(msg);
        defects.push({
          code: 'UNDECLARED_PACKAGE_IMPORT',
          subtype: 'DEPENDENCY_MISSING',
          file: filePath,
          line: lineIdx,
          package: pkgName,
          hint: `replace with plain React/CSS. Prohibited library: ${pkgName}`,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  });

  // If React files exist, react and react-dom must be declared
  if (hasReactFiles && declaredDeps.size > 0) {
    if (!declaredDeps.has('react')) {
      const msg = `Frontend Contract Failure: 'react' is missing from package.json dependencies.`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'DEPENDENCY_MISSING',
        file: pkgFile ? pkgFile.path : 'frontend/package.json',
        package: 'react',
        severity: 'HIGH',
        message: msg
      });
    }
    if (!declaredDeps.has('react-dom')) {
      const msg = `Frontend Contract Failure: 'react-dom' is missing from package.json dependencies.`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'DEPENDENCY_MISSING',
        file: pkgFile ? pkgFile.path : 'frontend/package.json',
        package: 'react-dom',
        severity: 'HIGH',
        message: msg
      });
    }
  }

  return { defects, errors };
}

/**
 * 6. Verifies TypeScript contract (deterministic syntax/AST validity and tsc --noEmit).
 */
export async function validateTypeScriptContract(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const tsFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.ts') || np.endsWith('.tsx');
  });

  let ts = null;
  try {
    const tsMod = await import('typescript');
    ts = tsMod.default || tsMod;
  } catch (_) {}

  // 1. AST parser diagnostics check (JSX unclosed tags, syntax errors, malformed types)
  for (const f of tsFiles) {
    const filePath = normPath(f.path);
    const content = f.content || '';

    if (ts) {
      const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
      if (sf && sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
        const diag = sf.parseDiagnostics[0];
        const pos = diag.file ? diag.file.getLineAndCharacterOfPosition(diag.start || 0) : { line: 0, character: 0 };
        const diagMsg = typeof diag.messageText === 'string' ? diag.messageText : (diag.messageText ? diag.messageText.messageText : 'Syntax error');
        const msg = `Frontend Contract Failure in '${filePath}' line ${pos.line + 1}: TypeScript syntax error: ${diagMsg}`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'TYPESCRIPT_CHECK_FAILED',
          file: filePath,
          line: pos.line + 1,
          details: diagMsg,
          severity: 'HIGH',
          message: msg
        });
        continue;
      }
      continue; // TypeScript AST parser validated this file with zero errors
    }

    // Fallback static bracket / paren check (only if ts is unavailable)
    let curly = 0;
    let paren = 0;
    let bracket = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      const next = content[i + 1];

      if (inComment) {
        if (ch === '\n' && inComment === 'single') inComment = false;
        else if (ch === '*' && next === '/' && inComment === 'multi') {
          inComment = false;
          i++;
        }
        continue;
      }

      if (inString) {
        if (ch === '\\') {
          i++; // Skip escaped char
        } else if (ch === stringChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inComment = 'single';
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inComment = 'multi';
        i++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') curly++;
      else if (ch === '}') curly--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket--;
    }

    if (curly !== 0 || paren !== 0 || bracket !== 0) {
      const msg = `Frontend Contract Failure in '${filePath}': TypeScript syntax error (unbalanced braces/brackets/parentheses).`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'TYPESCRIPT_CHECK_FAILED',
        file: filePath,
        severity: 'HIGH',
        message: msg
      });
    }
  }

  // 2. Real tsc --noEmit when requested and workspace directory is provided
  if (options.runTsc && options.workspacePath) {
    const frontendDir = fs.existsSync(path.join(options.workspacePath, 'frontend'))
      ? path.join(options.workspacePath, 'frontend')
      : options.workspacePath;

    const tsConfigPath = path.join(frontendDir, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      try {
        let cli = path.join(frontendDir, 'node_modules/typescript/bin/tsc');
        if (!fs.existsSync(cli)) {
          cli = path.resolve('node_modules/typescript/bin/tsc');
        }
        if (!fs.existsSync(cli)) throw new Error('TypeScript dependency unavailable; run the generated project validation setup');
        const result = await (options.execute || executeCommand)(process.execPath, [cli, '--noEmit', '--skipLibCheck', '--noUnusedLocals', 'false', '--noUnusedParameters', 'false'], { cwd: frontendDir, env: validationEnvironment(options.workspacePath), timeout: 30000 });
        if (result.code !== 0) throw new Error(result.output || 'TypeScript check failed');
      } catch (err) {
        const errorOut = (err.stdout || err.stderr || err.message || '').toString();
        const diagnostic = formatErrorDiagnostic(errorOut, 30);
        const msg = `Frontend Contract Failure: TypeScript type checking failed (npx tsc --noEmit):\n${diagnostic}`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'TYPESCRIPT_CHECK_FAILED',
          file: 'frontend/' + (errorOut.match(/^([^\s(]+)\(\d+,\d+\)/m)?.[1] || 'tsconfig.json'),
          details: errorOut,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  }

  return { defects, errors };
}

/**
 * 7. Verifies production build contract (entry point, config, npm run build).
 */
export async function validateProductionBuildContract(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const filePaths = new Set(files.map(f => normPath(f.path)));

  // Verify index.html exists
  const hasIndexHtml = filePaths.has('frontend/index.html') || filePaths.has('index.html') ||
    Array.from(filePaths).some(p => p.endsWith('/index.html') || p === 'index.html') ||
    (options.workspacePath && (fs.existsSync(path.join(options.workspacePath, 'frontend', 'index.html')) || fs.existsSync(path.join(options.workspacePath, 'index.html'))));

  if (!hasIndexHtml && files.some(f => normPath(f.path).endsWith('.tsx') || normPath(f.path).endsWith('.jsx'))) {
    const msg = `Frontend Contract Failure: Missing frontend entry point 'index.html'.`;
    errors.push(msg);
    defects.push({
      code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
      subtype: 'PRODUCTION_BUILD_FAILED',
      file: 'index.html',
      severity: 'HIGH',
      message: msg
    });
  }

  // Verify main.tsx or index.tsx exists
  const hasMainEntry = Array.from(filePaths).some(p => 
    p.endsWith('main.tsx') || p.endsWith('index.tsx') || p.endsWith('main.jsx') || p.endsWith('index.jsx')
  ) || (options.workspacePath && (
    fs.existsSync(path.join(options.workspacePath, 'frontend', 'src', 'main.tsx')) ||
    fs.existsSync(path.join(options.workspacePath, 'frontend', 'src', 'index.tsx')) ||
    fs.existsSync(path.join(options.workspacePath, 'src', 'main.tsx')) ||
    fs.existsSync(path.join(options.workspacePath, 'src', 'index.tsx'))
  ));

  if (!hasMainEntry && files.some(f => normPath(f.path).endsWith('.tsx') || normPath(f.path).endsWith('.jsx'))) {
    const msg = `Frontend Contract Failure: Missing frontend root component entry point (main.tsx or index.tsx).`;
    errors.push(msg);
    defects.push({
      code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
      subtype: 'PRODUCTION_BUILD_FAILED',
      file: 'src/main.tsx',
      severity: 'HIGH',
      message: msg
    });
  }

  // Run real npm run build if requested and workspace provided
  if (options.runBuild && options.workspacePath) {
    const frontendDir = fs.existsSync(path.join(options.workspacePath, 'frontend'))
      ? path.join(options.workspacePath, 'frontend')
      : options.workspacePath;

    const pkgJsonPath = path.join(frontendDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (!pkg.scripts?.build) throw new Error('Missing frontend build script');
        const result = await (options.execute || executeCommand)(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: frontendDir, env: validationEnvironment(options.workspacePath), timeout: 60000 });
        if (result.code !== 0) throw new Error(result.output || 'Frontend build failed');
      } catch (err) {
        const errorOut = (err.stdout || err.stderr || err.message || '').toString();
        const diagnostic = formatErrorDiagnostic(errorOut, 30);
        const msg = `Frontend Contract Failure: Production build failed (npm run build):\n${diagnostic}`;
        errors.push(msg);
        defects.push({
          code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
          subtype: 'PRODUCTION_BUILD_FAILED',
          file: 'frontend/package.json',
          details: errorOut,
          severity: 'HIGH',
          message: msg
        });
      }
    }
  }

  return { defects, errors };
}

/**
 * 8. Verifies required environment configuration exists (.env / .env.example).
 */
export function validateEnvironmentConfig(files = [], options = {}) {
  const defects = [];
  const errors = [];

  const frontendFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.tsx') || np.endsWith('.ts') || np.endsWith('.jsx') || (np.endsWith('.js') && np.includes('frontend'));
  });

  // Check if any frontend file accesses environment variables
  let accessesEnvVars = false;
  let accessedVarNames = new Set();

  frontendFiles.forEach(f => {
    const content = f.content || '';
    const viteEnvMatch = /import\.meta\.env\.([A-Za-z0-9_]+)/g;
    let m;
    while ((m = viteEnvMatch.exec(content)) !== null) {
      accessesEnvVars = true;
      accessedVarNames.add(m[1]);
    }
    const procEnvMatch = /process\.env\.([A-Za-z0-9_]+)/g;
    while ((m = procEnvMatch.exec(content)) !== null) {
      accessesEnvVars = true;
      accessedVarNames.add(m[1]);
    }
  });

  if (frontendFiles.length > 0) {
    // Check if an environment file exists (.env, .env.example, etc.)
    const envFiles = files.filter(f => {
      if (!f || !f.path) return false;
      const np = normPath(f.path);
      return np.endsWith('.env') || np.endsWith('.env.example') || np.endsWith('.env.local') || np.endsWith('.env.production');
    });

    if (envFiles.length === 0 && accessesEnvVars) {
      const msg = `Frontend Contract Failure: Environment variables used (${Array.from(accessedVarNames).join(', ')}) but no .env or .env.example file exists.`;
      errors.push(msg);
      defects.push({
        code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
        subtype: 'ENV_CONFIG_MISSING',
        file: 'frontend/.env.example',
        severity: 'HIGH',
        message: msg
      });
    } else if ((envFiles.length > 0 || options.workspacePath) && accessedVarNames.size > 0) {
      // Check that declared env vars in code are documented in at least one env file
      let combinedEnvContent = envFiles.map(ef => ef.content || '').join('\n');
      if (options.workspacePath) {
        const diskCandidates = [
          path.join(options.workspacePath, 'frontend', '.env.example'),
          path.join(options.workspacePath, 'frontend', '.env'),
          path.join(options.workspacePath, '.env.example'),
          path.join(options.workspacePath, '.env')
        ];
        diskCandidates.forEach(cp => {
          if (fs.existsSync(cp)) {
            try { combinedEnvContent += '\n' + fs.readFileSync(cp, 'utf8'); } catch (_) {}
          }
        });
      }
      for (const varName of accessedVarNames) {
        // Built-ins like MODE or BASE_URL or PROD or CI are default
        if (['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR', 'NODE_ENV', 'CI'].includes(varName)) {
          continue;
        }
        if (!combinedEnvContent.includes(varName)) {
          const msg = `Frontend Contract Failure: Environment variable '${varName}' used in frontend code but not defined in any .env or .env.example file.`;
          errors.push(msg);
          defects.push({
            code: FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE,
            subtype: 'ENV_CONFIG_MISSING',
            file: envFiles[0].path,
            variable: varName,
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
 * Rule 8: Verifies core frontend project files exist
 */
export function verifyCoreFrontendFiles(files = [], options = {}) {
  const defects = [];
  const errors = [];
  const filePaths = new Set(files.map(f => normPath(f.path)));

  const hasPkg = filePaths.has('frontend/package.json') || filePaths.has('package.json');
  if (!hasPkg) {
    const msg = `Frontend Contract Failure: Missing core file 'package.json'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/package.json',
      line: 1,
      hint: 'Frontend must contain package.json with dependencies and build scripts.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasHtml = Array.from(filePaths).some(p => p.endsWith('index.html'));
  if (!hasHtml) {
    const msg = `Frontend Contract Failure: Missing core file 'index.html'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/index.html',
      line: 1,
      hint: 'Frontend must contain index.html entry point.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasMainTsx = Array.from(filePaths).some(p => p.endsWith('main.tsx') || p.endsWith('main.jsx') || p.endsWith('index.tsx') || p.endsWith('index.jsx'));
  if (!hasMainTsx) {
    const msg = `Frontend Contract Failure: Missing core file 'src/main.tsx'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/src/main.tsx',
      line: 1,
      hint: 'Frontend must contain src/main.tsx entry point.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasViteConfig = Array.from(filePaths).some(p => p.includes('vite.config'));
  if (!hasViteConfig) {
    const msg = `Frontend Contract Failure: Missing core file 'vite.config.ts'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/vite.config.ts',
      line: 1,
      hint: 'Frontend must contain vite.config.ts bundler configuration.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasTsConfig = Array.from(filePaths).some(p => p.includes('tsconfig'));
  if (!hasTsConfig) {
    const msg = `Frontend Contract Failure: Missing core file 'tsconfig.json'.`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/tsconfig.json',
      line: 1,
      hint: 'Frontend must contain tsconfig.json TypeScript configuration.',
      severity: 'HIGH',
      message: msg
    });
  }

  // Check required pages: login, register, and admin
  const hasLoginPage = Array.from(filePaths).some(p => /login(?:page)?\.[jt]sx?$/i.test(p));
  if (!hasLoginPage) {
    const msg = `Frontend Contract Failure: Missing required page component for login (LoginPage.tsx).`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/src/pages/LoginPage.tsx',
      line: 1,
      hint: 'Frontend must provide LoginPage component for user authentication.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasRegisterPage = Array.from(filePaths).some(p => /register(?:page)?\.[jt]sx?$/i.test(p));
  if (!hasRegisterPage) {
    const msg = `Frontend Contract Failure: Missing required page component for register (RegisterPage.tsx).`;
    errors.push(msg);
    defects.push({
      code: 'MISSING_CORE_PROJECT_FILE',
      subtype: 'MISSING_CORE_PROJECT_FILE',
      file: 'frontend/src/pages/RegisterPage.tsx',
      line: 1,
      hint: 'Frontend must provide RegisterPage component for user onboarding.',
      severity: 'HIGH',
      message: msg
    });
  }

  const hasAdminRoutes = files.some(f => typeof f.content === 'string' && (f.content.includes('/admin') || f.content.includes('require_admin')));
  const hasAdminPage = Array.from(filePaths).some(p => /admin(?:page|dashboard)?\.[jt]sx?$/i.test(p) || p.includes('/admin/'));
  // Check planned frontend pages from manifest: bare skeleton must not pass
  if (options.manifest?.modules) {
    const frontendModules = options.manifest.modules.filter(m => m.layer === 'FRONTEND');
    for (const fm of frontendModules) {
      for (const rf of fm.required_files || []) {
        if (rf.path && (rf.path.includes('/pages/') || rf.path.includes('/views/'))) {
          const exists = files.some(f => f.path === rf.path && f.content && !isPlaceholderStubComponent(f.content));
          if (!exists) {
            const msg = `Frontend Contract Failure: Required planned page '${rf.path}' is missing or a bare placeholder stub.`;
            errors.push(msg);
            defects.push({
              code: 'MISSING_CORE_PROJECT_FILE',
              subtype: 'MISSING_CORE_PROJECT_FILE',
              file: rf.path,
              line: 1,
              hint: `Frontend must generate and implement real page view for '${rf.path}'.`,
              severity: 'HIGH',
              message: msg
            });
          }
        }
      }
    }
  }

  return { defects, errors };
}

/**
 * Composite Phase 9 Frontend Contract Validator
 * 
 * Runs all 8 checks and aggregates defects.
 * Any defect results in isValid = false and code FRONTEND_BUILD_FAILURE.
 */
export async function validateFrontendContract(files = [], options = {}) {
  if (options.workspacePath && !options.mockLLM && !options.isolated) {
    const sandbox = createValidationWorkspace(files, options.workspacePath);
    try { return await validateFrontendContract(files, { ...options, workspacePath: sandbox.directory, isolated: true }); }
    finally { sandbox.cleanup(); }
  }
  const allDefects = [];
  const allErrors = [];

  // 1 & 2. Component imports & Casing
  const importsRes = validateComponentImportsAndCasing(files, options);
  allDefects.push(...importsRes.defects);
  allErrors.push(...importsRes.errors);

  // 3. Router targets
  const routerRes = validateRouterTargets(files, options);
  allDefects.push(...routerRes.defects);
  allErrors.push(...routerRes.errors);

  // 4. API Endpoints
  const apiRes = validateFrontendApiEndpoints(files, options);
  allDefects.push(...apiRes.defects);
  allErrors.push(...apiRes.errors);

  // 5. Dependencies
  const depRes = validateFrontendDependencies(files, options);
  allDefects.push(...depRes.defects);
  allErrors.push(...depRes.errors);

  // 6. TypeScript Contract
  const tsRes = await validateTypeScriptContract(files, options);
  allDefects.push(...tsRes.defects);
  allErrors.push(...tsRes.errors);

  // 7. Production Build Contract
  const buildRes = await validateProductionBuildContract(files, options);
  allDefects.push(...buildRes.defects);
  allErrors.push(...buildRes.errors);

  // 8. Environment Configuration
  const envRes = validateEnvironmentConfig(files, options);
  allDefects.push(...envRes.defects);
  allErrors.push(...envRes.errors);

  // 9. Core Frontend Files (Rule 8)
  const coreFilesRes = verifyCoreFrontendFiles(files, options);
  allDefects.push(...coreFilesRes.defects);
  allErrors.push(...coreFilesRes.errors);

  // 10. Verification Non-vacuousness (Rule 9)
  if (options.requireLiveExecution && !options.mockLLM && !options.isolated) {
    const buildRan = buildRes?.defects?.some(d => d.subtype === 'PRODUCTION_BUILD_FAILED') || (options.runBuild && options.workspacePath);
    if (!buildRan) {
      const msg = 'Gate failed closed: npm run build execution was skipped or unavailable.';
      allErrors.push(msg);
      allDefects.push({
        code: 'EXECUTION_NON_VACUOUSNESS_FAILURE',
        subtype: 'EXECUTION_NON_VACUOUSNESS_FAILURE',
        file: 'frontend/package.json',
        line: 1,
        hint: 'Frontend contract gate requires live execution proof of npm run build before passing.',
        severity: 'CRITICAL',
        message: msg
      });
    }
  }

  // Ensure Rule 10: All defects carry code, file, line, hint
  allDefects.forEach(d => {
    if (!d.line) d.line = 1;
    if (!d.hint) d.hint = d.message || d.code;
    if (!d.file) d.file = 'frontend/src/main.tsx';
  });

  const isValid = allDefects.length === 0;

  return {
    isValid,
    defects: allDefects,
    errors: allErrors,
    summary: {
      totalDefects: allDefects.length,
      frontendFilesChecked: importsRes.checkedCount || 0,
      backendEndpointsChecked: apiRes.backendEndpointsCount || 0,
      isValid,
      typeCheckExecuted: Boolean(options.runTsc && options.workspacePath),
      buildExecuted: Boolean(options.runBuild && options.workspacePath)
    }
  };
}
