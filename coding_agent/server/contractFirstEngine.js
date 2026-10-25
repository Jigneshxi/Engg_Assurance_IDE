import path from 'path';
import fs from 'fs';

/**
 * Step 5(a): Slice contract.json per module and return ONLY that slice.
 */
export function sliceContractForModule(contract, moduleDef, targetFile = null) {
  if (!contract || !Array.isArray(contract.endpoints)) {
    return { schemaVersion: 2, endpoints: [], schemas: [], workflows: [] };
  }

  const moduleFiles = (moduleDef?.required_files || [])
    .map(f => typeof f === 'string' ? f : f?.path)
    .filter(Boolean);
  const filePaths = targetFile ? [targetFile] : moduleFiles;

  // Determine resources associated with this module / target file
  const resources = new Set();
  filePaths.forEach(fp => {
    const norm = fp.replace(/\\/g, '/');
    const base = path.basename(norm, path.extname(norm)).toLowerCase();
    resources.add(base);
    // Segments: e.g. "backend/app/api/products.py" -> "products"
    const segs = norm.split('/');
    segs.forEach(s => {
      const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean && clean.length > 2 && !['backend', 'frontend', 'app', 'api', 'src', 'pages', 'components', 'routes', 'tests'].includes(clean)) {
        resources.add(clean);
      }
    });
  });

  // Filter endpoints matching backendFile or resource
  const sliceEndpoints = contract.endpoints.filter(ep => {
    if (filePaths.some(fp => ep.backendFile && (ep.backendFile === fp || ep.backendFile.endsWith(fp)))) {
      return true;
    }
    const epPath = (ep.path || '').toLowerCase();
    const routerPrefix = (ep.routerPrefix || '').toLowerCase();
    for (const res of resources) {
      if (res.length > 2 && (epPath.includes(`/${res}`) || routerPrefix.includes(res))) {
        return true;
      }
    }
    return false;
  });

  // Collect schema names from sliced endpoints
  const requiredSchemaNames = new Set();
  sliceEndpoints.forEach(ep => {
    if (ep.requestSchema) requiredSchemaNames.add(ep.requestSchema);
    if (ep.responseSchema) requiredSchemaNames.add(ep.responseSchema);
    if (Array.isArray(ep.requestFields)) ep.requestFields.forEach(f => requiredSchemaNames.add(f));
  });

  // Filter schemas
  const allSchemas = Array.isArray(contract.schemas) ? contract.schemas : [];
  const sliceSchemas = allSchemas.filter(s =>
    requiredSchemaNames.has(s.name) ||
    Array.from(resources).some(r => r.length > 2 && s.name.toLowerCase().includes(r))
  );

  // Filter workflows
  const allWorkflows = Array.isArray(contract.workflows) ? contract.workflows : [];
  const sliceWorkflows = allWorkflows.filter(w =>
    filePaths.some(fp => w.testFile && (w.testFile === fp || w.testFile.endsWith(fp)))
  );

  return {
    schemaVersion: 2,
    module: moduleDef?.id || 'GLOBAL',
    endpoints: sliceEndpoints,
    schemas: sliceSchemas,
    workflows: sliceWorkflows
  };
}

/**
 * Step 5(b): Enforce router path convention.
 * Routers must declare RELATIVE paths (/ and /{id}), and main.py mounts them with prefix="/api/<resource>".
 * Strips repeated mount prefixes from route decorators.
 */
export function enforceRelativeRouterPaths(content, resourceName = '') {
  if (!content || typeof content !== 'string') return content;
  if (!content.includes('@router.') && !content.includes('@app.')) return content;

  let updated = content;

  // Patterns: @router.get("/api/products"), @router.get("/products"), @router.get("/products/{id}")
  const resource = (resourceName || '').replace(/\.py$/, '').split('/').pop().toLowerCase();
  
  if (resource) {
    // Replace @router.<method>("/api/<resource>...") with relative path
    const fullPrefixRe = new RegExp(`(@router\\.(?:get|post|put|patch|delete)\\s*\\(\\s*['"])/api/${resource}(/?|/[^'"]*)(['"])`, 'g');
    updated = updated.replace(fullPrefixRe, (match, prefix, rest, quote) => {
      const relPath = rest === '' || rest === '/' ? '' : rest;
      return `${prefix}${relPath}${quote}`;
    });

    // Replace @router.<method>("/<resource>...") with relative path
    const segPrefixRe = new RegExp(`(@router\\.(?:get|post|put|patch|delete)\\s*\\(\\s*['"])/${resource}(/?|/[^'"]*)(['"])`, 'g');
    updated = updated.replace(segPrefixRe, (match, prefix, rest, quote) => {
      const relPath = rest === '' || rest === '/' ? '' : rest;
      return `${prefix}${relPath}${quote}`;
    });
  }

  return updated;
}

/**
 * Step 5(c): Single backend entrypoint enforcement.
 * Enforces backend/app/main.py as the ONLY file with app = FastAPI().
 * Removes or converts any other FastAPI() instantiation.
 */
export function enforceSingleFastApiEntrypoint(files = []) {
  const canonicalPath = 'backend/app/main.py';

  for (const f of files) {
    if (!f || !f.path || typeof f.content !== 'string') continue;
    const norm = f.path.replace(/\\/g, '/');

    // Only backend/app/main.py is allowed to instantiate app = FastAPI()
    if (norm === canonicalPath || norm.endsWith('/app/main.py')) {
      continue;
    }

    if (/app\s*=\s*FastAPI\s*\(/.test(f.content)) {
      if (norm === 'backend/main.py' || norm === 'main.py') {
        // Convert root forwarder to import canonical app
        f.content = `"""Root application forwarder.
Canonical FastAPI instance is defined in app.main.
"""
from app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
`;
        f.status = 'validated';
      } else if (norm.includes('/api/') || norm.includes('/routes/')) {
        // Router file accidentally called app = FastAPI() instead of router = APIRouter()
        f.content = f.content.replace(/app\s*=\s*FastAPI\s*\([^)]*\)/g, 'router = APIRouter()');
      }
    }
  }
}

/**
 * Step 5(d): Ahead-of-time client generation.
 * Generates frontend/src/api/client.ts directly from contract.json BEFORE frontend pages are generated.
 */
export function generateFrontendApiClientCode(contract) {
  const endpoints = Array.isArray(contract?.endpoints) ? contract.endpoints : [];

  // Group endpoints by resource segment: e.g. "products", "cart", "orders", "auth"
  const resources = new Map();
  endpoints.forEach(ep => {
    const rawPath = ep.path || '';
    const cleanPath = rawPath.replace(/^\/api\//, '').replace(/^\//, '');
    const seg = cleanPath.split('/')[0] || 'general';
    if (!resources.has(seg)) resources.set(seg, []);
    resources.get(seg).push(ep);
  });

  let groupMethods = '';
  for (const [res, eps] of resources.entries()) {
    const methods = [];
    eps.forEach(ep => {
      const method = (ep.method || 'GET').toUpperCase();
      const rawPath = ep.path || `/${res}`;
      // Normalized subpath relative to /api: e.g. /api/products -> /products
      const apiRelativePath = rawPath.startsWith('/api') ? rawPath.slice(4) : rawPath;
      
      let actionName = method.toLowerCase();
      if (method === 'GET' && apiRelativePath.includes('{')) actionName = 'getById';
      else if (method === 'GET') actionName = 'list';
      else if (method === 'POST' && (res === 'auth' || apiRelativePath.includes('login'))) actionName = 'login';
      else if (method === 'POST' && apiRelativePath.includes('register')) actionName = 'register';
      else if (method === 'POST') actionName = 'create';
      else if (method === 'PUT') actionName = 'update';
      else if (method === 'PATCH') actionName = 'patch';
      else if (method === 'DELETE') actionName = 'remove';

      // Disambiguate duplicate action names
      let finalName = actionName;
      let count = 1;
      while (methods.some(m => m.name === finalName)) {
        finalName = `${actionName}${count++}`;
      }

      const hasParam = apiRelativePath.includes('{');
      if (hasParam) {
        // e.g. /products/{id} -> (id: string | number, data?: any) => api.get(`/products/${id}`)
        const templatePath = apiRelativePath.replace(/\{([^}]+)\}/g, '${$1}');
        const paramMatch = apiRelativePath.match(/\{([^}]+)\}/);
        const paramName = paramMatch ? paramMatch[1] : 'id';
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          methods.push({ name: finalName, fn: `(${paramName}: string | number, data?: any) => api.${method.toLowerCase()}(\`${templatePath}\`, data)` });
        } else {
          methods.push({ name: finalName, fn: `(${paramName}: string | number, params?: any) => api.${method.toLowerCase()}(\`${templatePath}\`, params)` });
        }
      } else {
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          methods.push({ name: finalName, fn: `(data?: any) => api.${method.toLowerCase()}('${apiRelativePath}', data)` });
        } else {
          methods.push({ name: finalName, fn: `(params?: any) => api.${method.toLowerCase()}('${apiRelativePath}', params)` });
        }
      }
    });

    groupMethods += `  ${res}: {\n${methods.map(m => `    ${m.name}: ${m.fn}`).join(',\n')}\n  },\n`;
  }

  return `/**
 * Auto-generated Ahead-Of-Time API Client
 * Generated directly from .openclaw/contract.json
 * Enforces contract-first integration: pages import from this client to prevent route drift.
 */

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : '/api';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('token') || localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
  } catch {}
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
  } catch {}
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : \`/\${endpoint}\`;
  const url = endpoint.startsWith('http')
    ? endpoint
    : \`\${API_BASE_URL.replace(/\\/+$/, '')}\${cleanEndpoint}\`;

  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = \`Bearer \${token}\`;
  }

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    let errorJson: any = null;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      errorJson = null;
    }
    const error = new Error(errorJson?.detail || errorJson?.message || \`HTTP \${response.status}: \${response.statusText}\`);
    (error as any).status = response.status;
    (error as any).data = errorJson;
    throw error;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T = any>(url: string, params?: any, options?: RequestInit) => {
    let finalUrl = url;
    if (params && typeof params === 'object') {
      const query = new URLSearchParams(params).toString();
      if (query) finalUrl += (finalUrl.includes('?') ? '&' : '?') + query;
    }
    return request<T>(finalUrl, { method: 'GET', ...options });
  },
  post: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined, ...options }),
  put: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined, ...options }),
  patch: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined, ...options }),
  delete: <T = any>(url: string, options?: RequestInit) =>
    request<T>(url, { method: 'DELETE', ...options }),

${groupMethods}
};

export default api;
`;
}

/**
 * Creates and registers frontend/src/api/client.ts ahead of time.
 */
export function ensureAheadOfTimeApiClient(contract, workspacePath, files = []) {
  if (!contract || !Array.isArray(contract.endpoints)) return null;

  const clientCode = generateFrontendApiClientCode(contract);
  const targetRelPath = 'frontend/src/api/client.ts';

  // 1. Add or update in memory files array
  let existing = files.find(f => f && (f.path === targetRelPath || f.path.endsWith('src/api/client.ts')));
  if (existing) {
    existing.content = clientCode;
    existing.status = 'validated';
  } else {
    existing = { path: targetRelPath, content: clientCode, status: 'validated' };
    files.push(existing);
  }

  // 2. Persist to disk if workspacePath is provided
  if (workspacePath && fs.existsSync(workspacePath)) {
    try {
      const fullPath = path.join(workspacePath, targetRelPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, clientCode, 'utf8');
    } catch (_) {}
  }

  return existing;
}
