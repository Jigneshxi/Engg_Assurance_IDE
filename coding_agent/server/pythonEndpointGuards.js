// A lexical reader for Python signatures. Comments and string contents never
// count as dependency identifiers; nested calls and multiline signatures balance.
function tokens(source) {
  const result = []; let i = 0; let line = 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
    if (c === '"' || c === "'") {
      const start = i; const quote = source.slice(i, i + 3) === c.repeat(3) ? c.repeat(3) : c;
      i += quote.length;
      while (i < source.length && source.slice(i, i + quote.length) !== quote) { if (source[i] === '\n') line++; if (source[i] === '\\') i++; i++; }
      i += quote.length; result.push({ value: source.slice(start + quote.length, i - quote.length), string: true, line }); continue;
    }
    if (/[A-Za-z_]/.test(c)) { const start = i++; while (i < source.length && /[\w]/.test(source[i])) i++; result.push({ value: source.slice(start, i), line }); continue; }
    result.push({ value: c, line }); i++;
  }
  return result;
}
function closing(ts, start) {
  const stack = []; const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let i = start; i < ts.length; i++) {
    if (ts[i].string) continue;
    const c = ts[i].value;
    if ('([{'.includes(c)) stack.push(c);
    if (pairs[c] && stack.pop() !== pairs[c]) return -1;
    if (stack.length === 0) return i;
  }
  return -1;
}
const AUTH = new Set(['get_current_user', 'get_current_active_user', 'require_auth', 'require_admin', 'get_current_admin', 'require_admin_user']);
const ADMIN = new Set(['require_admin', 'get_current_admin', 'require_admin_user']);
function dependencies(ts) {
  const result = new Set();
  for (let i = 0; i < ts.length - 2; i++) if (!ts[i].string && ['Depends', 'Security'].includes(ts[i].value) && ts[i + 1].value === '(') {
    let j = i + 2;
    while (ts[j + 1]?.value === '.') j += 2;
    if (!ts[j]?.string) result.add(ts[j]?.value);
  }
  return result;
}
export function inspectEndpointGuards(file, source, publicRoutes = new Set()) {
  const ts = tokens(source); const defects = []; const routers = new Map(); let decorators = [];
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].string) continue;
    if (ts[i + 1]?.value === '=' && ts[i + 2]?.value === 'APIRouter' && ts[i + 3]?.value === '(') {
      const end = closing(ts, i + 3); if (end >= 0) routers.set(ts[i].value, dependencies(ts.slice(i + 3, end)));
    }
    if (ts[i].value === '@' && ts[i + 2]?.value === '.' && ['get', 'post', 'put', 'patch', 'delete'].includes(ts[i + 3]?.value) && ts[i + 4]?.value === '(') {
      const end = closing(ts, i + 4);
      if (end < 0) continue;
      decorators.push({ receiver: ts[i + 1].value, method: ts[i + 3].value, route: ts[i + 5]?.string ? ts[i + 5].value : '', guards: dependencies(ts.slice(i + 4, end)) });
      i = end; continue;
    }
    if (ts[i].value !== 'def' || ts[i + 2]?.value !== '(') continue;
    const end = closing(ts, i + 2); if (end < 0) continue;
    const guards = dependencies(ts.slice(i + 2, end));
    for (const d of decorators) {
      const auth = new Set([...guards, ...d.guards, ...(routers.get(d.receiver) || [])]);
      const admin = /admin/i.test(file.split('/').pop()) || d.route.split('/').includes('admin');
      const publicAuth = ['login', 'register', 'token', 'signup'].includes(d.route.replace(/\/$/, '').split('/').pop());
      if (publicAuth || publicRoutes.has(`${d.method}:${d.route}`) || publicRoutes.has(d.route)) continue;
      if (admin && ![...auth].some(n => ADMIN.has(n))) defects.push({ code: 'API_AUTHZ_FAILURE', file, line: ts[i].line, subtype: 'AUTHZ_ADMIN_GUARD_MISSING', message: `Admin endpoint requires a server-side admin dependency: ${ts[i + 1].value}` });
      else if (!publicAuth && d.method !== 'get' && ![...auth].some(n => AUTH.has(n))) defects.push({ code: 'API_AUTHZ_FAILURE', file, line: ts[i].line, subtype: 'AUTHZ_UNPROTECTED_ENDPOINT', message: `Mutation endpoint lacks an authentication dependency: ${ts[i + 1].value}` });
    }
    decorators = []; i = end;
  }
  return defects;
}
