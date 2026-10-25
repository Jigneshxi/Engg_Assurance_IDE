/**
 * File Size Budget & Architectural Decomposition Validator (Step S5)
 * 
 * Enforces modular architecture by preventing monolithic files:
 * - Frontend Pages (in /pages/): Max 250 lines.
 * - Routers (in /api/ or /routes/): Max 200 lines.
 * - App.tsx: Max 100 lines (target ~60 lines), must be a router-only shell mounting page routes.
 */

export const FILE_SIZE_LIMITS = {
  PAGE_MAX_LINES: 250,
  ROUTER_MAX_LINES: 200,
  APP_TSX_MAX_LINES: 100,
  APP_TSX_TARGET_LINES: 60
};

export const FILE_SIZE_DEFECT_CODES = {
  FILE_SIZE_BUDGET_EXCEEDED: 'FILE_SIZE_BUDGET_EXCEEDED',
  APP_TSX_NOT_ROUTER: 'APP_TSX_NOT_ROUTER'
};

/**
 * Identify file role and applicable line budget.
 */
export function getFileTypeAndBudget(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const p = filePath.replace(/\\/g, '/').toLowerCase();

  // App.tsx entrypoint router
  if (p.endsWith('/app.tsx') || p === 'app.tsx' || p.endsWith('/app.jsx') || p === 'app.jsx') {
    return { type: 'app', maxLines: FILE_SIZE_LIMITS.APP_TSX_MAX_LINES, label: 'App.tsx' };
  }

  // Frontend pages
  if (p.includes('/pages/') || /page\.[jt]sx?$/.test(p) || /[a-z0-9_-]+page\.[jt]sx?$/.test(p)) {
    return { type: 'page', maxLines: FILE_SIZE_LIMITS.PAGE_MAX_LINES, label: 'Frontend page' };
  }

  // Routers (backend FastAPI routers or Express/React routes)
  if (
    p.includes('/api/') ||
    p.includes('/routes/') ||
    /(?:^|\/)[a-z0-9_-]+router\.[jt]sx?$/.test(p) ||
    /(?:^|\/)[a-z0-9_-]+routes?\.[jt]s$/.test(p) ||
    /(?:^|\/)[a-z0-9_-]+router\.py$/.test(p) ||
    /(?:^|\/)[a-z0-9_-]+routes\.py$/.test(p)
  ) {
    // Exclude static utilities, db config, schemas, models, or entrypoints
    if (
      p.endsWith('deps.py') ||
      p.endsWith('config.py') ||
      p.endsWith('database.py') ||
      p.endsWith('errors.py') ||
      p.endsWith('security.py') ||
      p.endsWith('client.ts') ||
      p.includes('/schemas/') ||
      p.includes('/models/') ||
      p.endsWith('main.py')
    ) {
      return null;
    }
    return { type: 'router', maxLines: FILE_SIZE_LIMITS.ROUTER_MAX_LINES, label: 'Router' };
  }

  return null;
}

/**
 * Check if an incomplete generation has already consumed its budget before running continuation.
 * If true, continuing will only bloat the file further; the engine should abort continuation
 * and trigger clean regeneration with split instructions.
 */
export function isBudgetExceededBeforeContinuation(content, filePath) {
  if (!content || typeof content !== 'string') return false;
  const budget = getFileTypeAndBudget(filePath);
  if (!budget) return false;

  const lines = content.split('\n').length;
  // Threshold: 85% of maximum allowed lines
  const threshold = Math.floor(budget.maxLines * 0.85);
  return lines >= threshold;
}

/**
 * Validate that a file stays within its allocated line budget and satisfies architectural layout rules.
 */
export function validateFileSizeBudget(content, filePath) {
  if (!content || typeof content !== 'string') return { isValid: true, defects: [], errors: [] };
  const budget = getFileTypeAndBudget(filePath);
  if (!budget) return { isValid: true, defects: [], errors: [] };

  const lines = content.split('\n').length;
  const defects = [];

  // 1. Line count budget enforcement
  if (lines > budget.maxLines) {
    const msg = `${budget.label} "${filePath}" exceeds size budget (${lines} lines, limit: ${budget.maxLines} lines). Split into components/hooks.`;
    defects.push({
      code: FILE_SIZE_DEFECT_CODES.FILE_SIZE_BUDGET_EXCEEDED,
      file: filePath,
      line: lines,
      lines,
      limit: budget.maxLines,
      type: budget.type,
      severity: 'HIGH',
      message: msg,
      hint: `Refactor ${filePath} into smaller components or custom hooks to stay under ${budget.maxLines} lines.`
    });
    return { isValid: false, defects, errors: [msg] };
  }

  // 2. App.tsx router-only enforcement
  if (budget.type === 'app') {
    const hasRoutes = /<Routes[\s>]|<Route\s|createBrowserRouter|RouterProvider|useRoutes|<Switch[\s>]/i.test(content);
    // Inlined domain state pattern without routing
    const inlinesDomainState = (
      /useState<[^>]*\[\]>\s*\(\s*\[\s*\{/i.test(content) ||
      /const\s+\[todos,\s*setTodos\]/i.test(content) ||
      /const\s+\[tasks,\s*setTasks\]/i.test(content) ||
      /const\s+\[products,\s*setProducts\]/i.test(content) ||
      /const\s+\[cart,\s*setCart\]/i.test(content) ||
      /const\s+\[items,\s*setItems\]/i.test(content)
    );

    if (!hasRoutes && inlinesDomainState && lines > 50) {
      const msg = `App.tsx must be a router-only shell mounting page routes (~60 lines). Inlining entire domain state and handlers into App.tsx is prohibited.`;
      defects.push({
        code: FILE_SIZE_DEFECT_CODES.APP_TSX_NOT_ROUTER,
        file: filePath,
        line: 1,
        lines,
        severity: 'HIGH',
        message: msg,
        hint: `Move domain state into dedicated page components under frontend/src/pages/ and keep App.tsx as a clean router mounting <Routes> and <Route> paths.`
      });
      return { isValid: false, defects, errors: [msg] };
    }
  }

  return { isValid: true, defects: [], errors: [] };
}
