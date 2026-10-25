import ts from 'typescript';

const AUTH = new Set(['authenticateToken', 'requireAuth', 'require_auth', 'authMiddleware', 'requireAdmin', 'require_admin']);
const ADMIN = new Set(['requireAdmin', 'require_admin']);
export function inspectJavaScriptGuards(file, content, publicRoutes = new Set()) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const defects = []; const globals = []; const routes = [];
  const name = node => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';
  const names = node => ts.isArrayLiteralExpression(node) ? node.elements.map(name) : [name(node)];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(source);
      const method = node.expression.name.text;
      if (/^(?:app|router|routes|api|[A-Za-z_]\w*Router)$/.test(receiver)) {
        if (method === 'use' && ts.isExpressionStatement(node.parent) && ts.isSourceFile(node.parent.parent)) globals.push({ receiver, prefix: node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : '', guards: node.arguments.flatMap(names) });
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) routes.push({ node, globals: globals.filter(g => g.receiver === receiver && (!g.prefix || node.arguments[0].text === g.prefix || node.arguments[0].text.startsWith(g.prefix.replace(/\/$/, '') + '/'))).flatMap(g => g.guards) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const entry of routes) {
    const route = entry.node;
    const method = route.expression.name.text; const url = route.arguments[0].text;
    if (['login', 'register', 'signup', 'token'].includes(url.replace(/\/$/, '').split('/').pop()) || publicRoutes.has(`${method}:${url}`)) continue;
    const guards = new Set([...entry.globals, ...route.arguments.slice(1, -1).flatMap(names)]);
    const admin = /admin/i.test(file.split('/').pop()) || url.split('/').includes('admin');
    if (admin && ![...guards].some(n => ADMIN.has(n)) || method !== 'get' && ![...guards].some(n => AUTH.has(n))) defects.push({ file, line: source.getLineAndCharacterOfPosition(route.getStart(source)).line + 1, subtype: admin ? 'AUTHZ_ADMIN_GUARD_MISSING' : 'AUTHZ_UNPROTECTED_ENDPOINT', message: `Endpoint requires ${admin ? 'admin' : 'authentication'} middleware: ${method.toUpperCase()} ${url}` });
  }
  return defects;
}
