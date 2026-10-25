import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { resolveSharedPython } from './pythonEnvironment.js';
import { validateFileSizeBudget } from './fileSizeBudgetValidator.js';

function analyzePython(files, python) {
  const pythonExe = resolveSharedPython({ configuredPython: python });
  if (!pythonExe) {
    return Promise.reject(new Error('No usable Python interpreter available; Python contract validation unavailable'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe, [fileURLToPath(new URL('./analyzeProjectContracts.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Contract parser timed out')); }, 45000);
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Contract parser exited ${code}: ${stderr.slice(0, 500)}`));
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(Object.fromEntries(files.map(f => [f.path, f.content]))));
  });
}

export function extractFrontendRequests(files) {
  const requests = [];
  for (const file of (files || []).filter(f => f && typeof f.path === 'string' && /^frontend\//.test(f.path) && /\.[jt]sx?$/.test(f.path))) {
    const content = typeof file.content === 'string' ? file.content : '';
    const source = ts.createSourceFile(file.path, content, ts.ScriptTarget.Latest, true, file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const strings = new Map();
    const literal = node => ts.isStringLiteralLike(node) ? node.text : ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(s => `{param}${s.literal.text}`).join('') : ts.isIdentifier(node) ? strings.get(node.text) : undefined;
    const normalizeRequestPath = raw => {
      if (!raw) return '';
      const pathOnly = raw.split('?')[0];
      const apiIdx = pathOnly.indexOf('/api/');
      return apiIdx !== -1 ? pathOnly.slice(apiIdx) : (pathOnly.startsWith('/api') ? pathOnly : '');
    };
    const visit = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const value = literal(node.initializer);
        if (value !== undefined) strings.set(node.name.text, value);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch' && node.arguments[0]) {
        const url = literal(node.arguments[0]);
        if (url) {
          const isHardcodedLocalhost = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(url);
          const reqPath = normalizeRequestPath(url);
          if (reqPath) {
            let method = 'GET';
            let bodyFields = null;
            const options = node.arguments[1];
            if (options && ts.isObjectLiteralExpression(options)) {
              for (const property of options.properties) {
                if (!ts.isPropertyAssignment(property)) continue;
                const name = property.name.getText(source).replace(/['"]/g, '');
                if (name === 'method') method = (literal(property.initializer) || '').toUpperCase();
                if (name === 'body') {
                  bodyFields = [];
                  if (ts.isCallExpression(property.initializer) && property.initializer.expression.getText(source) === 'JSON.stringify' && property.initializer.arguments[0] && ts.isObjectLiteralExpression(property.initializer.arguments[0])) {
                    const properties = property.initializer.arguments[0].properties;
                    if (!properties.some(ts.isSpreadAssignment)) bodyFields = properties.map(p => p.name?.getText(source).replace(/['"]/g, '')).filter(Boolean);
                  }
                }
              }
            }
            requests.push({ file: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method, path: reqPath, bodyFields, isHardcodedLocalhost, rawUrl: url });
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text) && node.arguments[0]) {
        const receiver = node.expression.expression.getText(source);
        const url = literal(node.arguments[0]);
        if (/axios|api|client/i.test(receiver) && url) {
          const isHardcodedLocalhost = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(url);
          const reqPath = normalizeRequestPath(url);
          if (reqPath) {
            const generic = node.typeArguments?.[0];
            const expectedShape = generic && (ts.isArrayTypeNode(generic) || (ts.isTypeReferenceNode(generic) && generic.typeName.getText(source) === 'Array')) ? 'array' : undefined;
            const body = node.arguments[1];
            requests.push({ file: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method: node.expression.name.text.toUpperCase(), path: reqPath, bodyFields: body && ts.isObjectLiteralExpression(body) ? body.properties.map(p => p.name?.getText(source).replace(/['"]/g, '')).filter(Boolean) : (['POST', 'PUT', 'PATCH'].includes(node.expression.name.text.toUpperCase()) ? (body ? [] : null) : null), expectedShape, isHardcodedLocalhost, rawUrl: url });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    // Also check for baseURL: 'http://localhost:8000...' or axios.create({ baseURL: ... })
    const baseMatch = /(?:baseURL\s*[:=]\s*|create\(\s*\{[^}]*?baseURL\s*:\s*)['"](https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[^\s'"]*))['"]/i.exec(file.content);
    if (baseMatch) {
      const line = file.content.substring(0, baseMatch.index).split('\n').length;
      requests.push({ file: file.path, line, method: 'GET', path: '/api', bodyFields: null, isHardcodedLocalhost: true, rawUrl: baseMatch[1] });
    }
  }
  return requests;
}

export function detectFrontendStackDefects(files, add) {
  const frontendFiles = (files || []).filter(f => f && typeof f.path === 'string' && f.path.startsWith('frontend/') && typeof f.content === 'string');
  if (!frontendFiles.length) return;

  let packageJson = null;
  const packageFile = frontendFiles.find(f => f.path === 'frontend/package.json');
  if (packageFile) {
    try { packageJson = JSON.parse(packageFile.content); } catch { /* package validation reports malformed JSON elsewhere */ }
  }
  const dependencies = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
  const isReactProject = Boolean(dependencies.react || dependencies['react-dom']) ||
    frontendFiles.some(f => /\.(?:tsx|jsx)$/.test(f.path) && /(?:from\s+['"]react['"]|ReactDOM\.createRoot|<React\.)/.test(f.content));
  if (!isReactProject) return;

  const angularMarkers = [
    /@angular\/(?:core|common|router|platform-browser)/,
    /\bTestBed\b/,
    /\bComponentFixture\b/,
    /(?<!\.)\b(?:describe|it)\s*\(/,
    /from\s+['"]rxjs['"]/
  ];
  for (const file of frontendFiles) {
    if (!/(?:frontend\/tests\/|\.spec\.|\.test\.)/.test(file.path)) continue;
    const match = angularMarkers.find(marker => marker.test(file.content));
    if (match) {
      const line = file.content.split(/\r?\n/).findIndex(value => match.test(value)) + 1;
      add('STACK_MISMATCH', file.path, `React frontend test contains incompatible Angular/Jasmine/RxJS test markers (${match}). Generate tests for the declared React/Vite stack.`, line || 1, 'Use React-compatible Playwright or the configured React test runner; do not import Angular TestBed, ComponentFixture, or RxJS workflow templates.');
    }
  }
}

export function extractStaticPythonContracts(files) {
  const pythonFiles = files.filter(f => f.path.endsWith('.py') && typeof f.content === 'string');
  const schemas = new Map();
  const classesByFile = new Map();
  const models = new Map();
  const routes = [];
  const testNames = {};

  for (const f of pythonFiles) {
    if (f.path.includes('/tests/') || f.path.endsWith('_test.py') || f.path.startsWith('test_')) {
      const tnames = [];
      const testMatch = /def\s+(test_[a-zA-Z0-9_]+)/g;
      let tm;
      while ((tm = testMatch.exec(f.content)) !== null) {
        tnames.push(tm[1]);
      }
      if (tnames.length) testNames[f.path] = tnames;
    }
  }

  for (const f of pythonFiles) {
    const classSet = new Set();
    classesByFile.set(f.path, classSet);
    const ormBaseNames = new Set(['Base', 'DeclarativeBase', 'Model']);
    for (const importMatch of f.content.matchAll(/^\s*from\s+([\w.]+)\s+import\s+([^\r\n#]+)/gm)) {
      const sourceModule = importMatch[1];
      for (const imported of importMatch[2].split(',')) {
        const parts = imported.trim().split(/\s+as\s+/);
        const original = parts[0].trim();
        const local = (parts[1] || original).trim();
        if (original === 'Base' || (original === 'DeclarativeBase' && sourceModule.includes('sqlalchemy.orm'))) ormBaseNames.add(local);
      }
    }
    const lines = f.content.split(/\r?\n/);
    let currentClass = null;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const classMatch = /^(\s*)class\s+([A-Za-z0-9_]+)\s*(?:\(([^)]*)\))?:/.exec(line);
      if (classMatch) {
        currentIndent = classMatch[1].length;
        currentClass = classMatch[2];
        const bases = classMatch[3] || '';
        const isDuplicateClass = classSet.has(currentClass);
        classSet.add(currentClass);
        // A repeated class name in the same file is a redefinition, not an
        // extension of the previous schema. Keep the latest definition so
        // overwritten fields are detected by downstream attribute checks.
        if (isDuplicateClass) {
          schemas.set(currentClass, { fields: new Set(), required: new Set(), allowsExtra: false });
          if (models.has(currentClass)) models.set(currentClass, { fields: new Set() });
        } else if (!schemas.has(currentClass)) {
          schemas.set(currentClass, { fields: new Set(), required: new Set(), allowsExtra: false });
        }
        const baseNames = bases.split(',').map(base => base.trim().split(/[.(]/)[0]).filter(Boolean);
        const isOrmClass = baseNames.some(base => ormBaseNames.has(base)) && !baseNames.includes('BaseModel');
        if (isOrmClass) {
          if (!models.has(currentClass)) models.set(currentClass, { fields: new Set() });
        }
        continue;
      }

      if (currentClass) {
        const indentMatch = /^(\s*)/.exec(line);
        const lineIndent = indentMatch ? indentMatch[1].length : 0;
        const trimmed = line.trim();
        if (trimmed && lineIndent <= currentIndent && !trimmed.startsWith('#')) {
          currentClass = null;
          continue;
        }
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('def ') && !trimmed.startsWith('@')) {
          if (/(?:extra\s*[:=]\s*['"]allow['"]|extra\s*=\s*Extra\.allow)/.test(trimmed)) {
            const schemaObj = schemas.get(currentClass);
            if (schemaObj) schemaObj.allowsExtra = true;
          }
          const fieldMatch = /^([a-zA-Z0-9_]+)\s*:\s*([^=]+)(?:=\s*(.*))?$/.exec(trimmed);
          if (fieldMatch) {
            const fieldName = fieldMatch[1];
            const defaultValue = fieldMatch[3]?.trim();
            const schemaObj = schemas.get(currentClass);
            if (schemaObj && fieldName !== 'model_config') {
              schemaObj.fields.add(fieldName);
              if (!defaultValue || defaultValue === 'Field(...)' || defaultValue.startsWith('Field(...,') || (!defaultValue.includes('default=') && !defaultValue.includes('None') && defaultValue.startsWith('Field('))) {
                schemaObj.required.add(fieldName);
              }
            }
            const modelObj = models.get(currentClass);
            if (modelObj) modelObj.fields.add(fieldName);
          } else {
            const assignMatch = /^([a-zA-Z0-9_]+)\s*=\s*(.*)$/.exec(trimmed);
            if (assignMatch && assignMatch[1] !== '__tablename__' && assignMatch[1] !== 'model_config') {
              const fieldName = assignMatch[1];
              const schemaObj = schemas.get(currentClass);
              if (schemaObj) schemaObj.fields.add(fieldName);
              const modelObj = models.get(currentClass);
              if (modelObj) modelObj.fields.add(fieldName);
            }
          }
        }
      }
    }
  }

  const mainFile = pythonFiles.find(f => f.path === 'backend/main.py');
  const mainIncludes = [];
  if (mainFile) {
    const includeRegex = /app\.include_router\s*\(\s*([a-zA-Z0-9_.]+)(?:\s*,\s*prefix\s*=\s*['"]([^'"]+)['"])?/g;
    let m;
    while ((m = includeRegex.exec(mainFile.content)) !== null) {
      const routerVar = m[1];
      const prefix = m[2] || '';
      mainIncludes.push({ routerVar, prefix });
    }
  }

  for (const f of pythonFiles) {
    const routerPrefixMatch = /APIRouter\s*\(\s*prefix\s*=\s*['"]([^'"]+)['"]/.exec(f.content);
    const fileRouterPrefix = routerPrefixMatch ? routerPrefixMatch[1] : '';

    let parentPrefix = '';
    const resourceName = f.path.split('/').pop().replace(/\.py$/, '');
    for (const inc of mainIncludes) {
      const incMatchesResource = inc.routerVar.toLowerCase().includes(resourceName.toLowerCase()) ||
        inc.prefix.toLowerCase().includes(resourceName.toLowerCase()) ||
        new RegExp(`from\\s+app\\.api\\.${resourceName}\\s+import\\s+(?:router\\s+as\\s+)?${inc.routerVar}\\b`).test(mainFile?.content || '') ||
        (mainFile?.content || '').includes(`from app.api import ${resourceName}`);
      if (incMatchesResource) {
        parentPrefix = inc.prefix;
        break;
      }
    }
    if (!parentPrefix) {
      if (mainIncludes.length === 1 && f.path.includes('/api/')) {
        parentPrefix = mainIncludes[0].prefix;
      } else if (f.path.includes('/api/')) {
        parentPrefix = `/api/${resourceName}`;
      }
    }

    let effectivePrefix = parentPrefix;
    if (fileRouterPrefix) {
      if (fileRouterPrefix.startsWith('/api') || !parentPrefix) {
        effectivePrefix = fileRouterPrefix;
      } else if (!effectivePrefix.endsWith(fileRouterPrefix)) {
        effectivePrefix = (effectivePrefix + '/' + fileRouterPrefix).replace(/\/+/g, '/');
      }
    }

    const routeRegex = /@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*(?:['"]([^'"]*)['"])?([^)]*)\)\s*(?:@[a-zA-Z0-9_.]+\s*\([^)]*\)\s*)*\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
    let rm;
    while ((rm = routeRegex.exec(f.content)) !== null) {
      const method = rm[1].toUpperCase();
      const subpath = rm[2] !== undefined ? rm[2] : '';
      const decoratorExtra = rm[3] || '';
      const paramsStr = rm[5] || '';
      const line = f.content.substring(0, rm.index).split('\n').length;

      const cleanSubpath = subpath ? (subpath.startsWith('/') ? subpath : '/' + subpath) : '';
      // A router decorator that already declares the canonical /api prefix is
      // absolute for contract purposes; do not prepend the inferred module
      // mount and produce paths such as /api/cart/api/cart.
      let fullPath = (cleanSubpath.startsWith('/api/') || cleanSubpath === '/api')
        ? cleanSubpath
        : (effectivePrefix + cleanSubpath).replace(/\/+/g, '/');
      fullPath = fullPath.replace(/\/$/, '') || '/';

      let requestSchema = null;
      let requiredFields = [];
      for (const param of paramsStr.split(',')) {
        const paramMatch = /([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)/.exec(param.trim());
        if (paramMatch) {
          const typeName = paramMatch[2];
          if (schemas.has(typeName)) {
            requestSchema = typeName;
            requiredFields = Array.from(schemas.get(typeName).required);
            break;
          }
        }
      }

      let responseFields = null;
      let responseShape = null;
      const respModelMatch = /response_model\s*=\s*(?:List\[)?([a-zA-Z0-9_]+)/.exec(decoratorExtra);
      if (respModelMatch && schemas.has(respModelMatch[1])) {
        responseFields = Array.from(schemas.get(respModelMatch[1]).fields);
        responseShape = decoratorExtra.includes('List[') ? 'array' : 'object';
      } else if (respModelMatch) {
        // Preserve the declared response container shape even when the schema
        // file is unavailable to the static registry. This still lets the
        // frontend contract check catch array/object mismatches.
        responseShape = decoratorExtra.includes('List[') ? 'array' : 'object';
      }

      const funcStart = rm.index + rm[0].length;
      const nextDef = f.content.indexOf('\ndef ', funcStart);
      const funcBody = f.content.substring(funcStart, nextDef !== -1 ? nextDef : undefined);
      const genericResponseModel = /response_model\s*=\s*(?:Any|dict|Dict|object|list|List)\b/.test(decoratorExtra);
      if (!responseFields) {
        const dictReturnMatch = /return\s*\{([^}]+)\}/.exec(funcBody);
        if (dictReturnMatch) {
          const keys = [];
          const keyRegex = /['"]([a-zA-Z0-9_]+)['"]\s*:/g;
          let km;
          while ((km = keyRegex.exec(dictReturnMatch[1])) !== null) {
            keys.push(km[1]);
          }
          if (keys.length) responseFields = keys;
          responseShape = 'object';
        }
      }

      const authGuards = [];
      const dependsRegex = /Depends\s*\(\s*([a-zA-Z0-9_]+)\s*\)/g;
      let dm;
      while ((dm = dependsRegex.exec(paramsStr + decoratorExtra)) !== null) {
        authGuards.push(dm[1]);
      }
      // Function parameters can contain nested Depends(...) calls. The route
      // matcher intentionally stops at the first closing parenthesis, so also
      // inspect the complete function signature to retain auth guards that
      // appear after another dependency such as Depends(get_db).
      const signature = new RegExp(`def\\s+${rm[4]}\\s*\\(([\\s\\S]*?)\\):`).exec(f.content.slice(rm.index))?.[1] || '';
      while ((dm = dependsRegex.exec(signature)) !== null) {
        if (!authGuards.includes(dm[1])) authGuards.push(dm[1]);
      }

      routes.push({
        file: f.path,
        line,
        method,
        path: fullPath,
        requestSchema,
        requiredFields,
        responseFields,
        responseModelName: respModelMatch?.[1] || null,
        responseShape,
        authGuards,
        stubEndpoint: /(?:^|\n)\s*(?:pass|return\s+(?:\[\]|\{\}))\s*(?:\n|$)/.test(funcBody) || (genericResponseModel && /return\s*\{/.test(funcBody) && !/\b(?:db\.|session\.|query\(|commit\(|delete\(|add\(|execute\(|filter\(|filter_by\()\b/.test(funcBody))
      });
    }
  }

  return { routes, schemas, models, testNames };
}

export function detectStaticPythonDefects(files, add, schemas = new Map(), models = new Map()) {
  const pythonFiles = files.filter(f => f.path.endsWith('.py') && typeof f.content === 'string');

  let currentUserReturnsDict = false;
  let currentUserReturnsObj = false;
  for (const f of pythonFiles) {
    if (f.content.includes('def get_current_user')) {
      if (/return\s*\{/.test(f.content)) currentUserReturnsDict = true;
      if (/return\s+(?:CurrentUser|User|UserModel)\(/.test(f.content)) currentUserReturnsObj = true;
    }
  }

  // Phase 3: Enforce single canonical authentication authority across backend modules
  const nonTestPyFiles = pythonFiles.filter(f => !f.path.includes('/tests/') && !f.path.startsWith('tests/') && !f.path.endsWith('_test.py') && !f.path.startsWith('test_') && !f.path.endsWith('conftest.py'));
  const currentUserDefs = [];
  const tokenEncodeDefs = [];
  const tokenDecodeDefs = [];
  for (const f of nonTestPyFiles) {
    if (/(?:^|\n)\s*(?:async\s+)?def\s+get_current_user\b/.test(f.content)) {
      currentUserDefs.push(f.path);
    }
    if (/(?:^|\n)\s*(?:async\s+)?def\s+create_access_token\b/.test(f.content)) {
      tokenEncodeDefs.push(f.path);
    }
    if (/(?:^|\n)\s*(?:async\s+)?def\s+decode_access_token\b/.test(f.content)) {
      tokenDecodeDefs.push(f.path);
    }
  }
  if (currentUserDefs.length > 1) {
    for (const p of currentUserDefs) {
      add('DUPLICATE_AUTH_AUTHORITY', p, `Duplicate authentication authority: 'get_current_user' is defined in multiple modules (${currentUserDefs.join(', ')}). Centralize authentication in a single canonical module.`, 1, 'Centralize get_current_user in a single canonical module (e.g. app.api.deps or app.core.security) and import it across routers.');
    }
  }
  if (tokenEncodeDefs.length > 1) {
    for (const p of tokenEncodeDefs) {
      add('DUPLICATE_AUTH_AUTHORITY', p, `Duplicate token generation authority: 'create_access_token' is defined in multiple modules (${tokenEncodeDefs.join(', ')}). Centralize in app.core.security.`, 1, 'Centralize token generation in app.core.security and import it elsewhere.');
    }
  }
  if (tokenDecodeDefs.length > 1) {
    for (const p of tokenDecodeDefs) {
      add('DUPLICATE_AUTH_AUTHORITY', p, `Duplicate token decoding authority: 'decode_access_token' is defined in multiple modules (${tokenDecodeDefs.join(', ')}). Centralize in app.core.security.`, 1, 'Centralize token verification in app.core.security and import it elsewhere.');
    }
  }

  for (const f of pythonFiles) {
    const lines = f.content.split(/\r?\n/);

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      const colonMatch = /^(\s*)(?:def|class|if|elif|else|for|while|try|except|finally|with)\b.*:\s*$/.exec(line);
      if (colonMatch) {
        const headerIndent = colonMatch[1].length;
        const nextIndentMatch = /^(\s*)([^\s#].*)$/.exec(nextLine);
        if (nextIndentMatch) {
          const nextIndent = nextIndentMatch[1].length;
          if (nextIndent <= headerIndent) {
            add('PYTHON_SYNTAX_ERROR', f.path, `expected an indented block after '${line.trim()}' on line ${i + 1}`, i + 2);
          }
        }
      }
    }

    const seenDefs = new Set();
    for (let i = 0; i < lines.length; i++) {
      const defMatch = /^class\s+([a-zA-Z0-9_]+)|^def\s+([a-zA-Z0-9_]+)/.exec(lines[i]);
      if (defMatch) {
        const name = defMatch[1] || defMatch[2];
        if (seenDefs.has(name)) {
          add('DUPLICATE_DEFINITION', f.path, `Repeated top-level definition: ${name}`, i + 1);
        }
        seenDefs.add(name);
      }
    }

    const typingSymbols = ['Any', 'List', 'Optional', 'Dict', 'Union', 'Tuple', 'Callable', 'Set', 'Sequence', 'Mapping'];
    for (const sym of typingSymbols) {
      const symRegex = new RegExp(`(?::|->|\\[|,)\\s*\\b${sym}\\b|\\b${sym}\\[`);
      if (symRegex.test(f.content)) {
        const hasImport = new RegExp(`from\\s+typing\\s+import\\s+.*\\b${sym}\\b|import\\s+typing\\b`).test(f.content);
        if (!hasImport) {
          add('MISSING_TYPING_IMPORT', f.path, `Symbol '${sym}' is used but not imported from typing`, 1);
        }
      }
    }

    const isTest = f.path.includes('/tests/') || f.path.startsWith('tests/') || f.path.endsWith('_test.py') || f.path.startsWith('test_') || f.path.endsWith('conftest.py');
    const placeholderTokens = ["YOUR_ACCESS_TOKEN", "YOUR_TOKEN", "fake-token", "test-token", "fake_token", "test_token", "dummy_token", "mock_token", "fake_jwt_token"];
    if (!isTest) {
      for (let i = 0; i < lines.length; i++) {
        for (const tok of placeholderTokens) {
          if (lines[i].includes(`"${tok}"`) || lines[i].includes(`'${tok}'`)) {
            add('HARDCODED_AUTH_TOKEN', f.path, `Hardcoded placeholder authentication token is not permitted: ${tok}`, i + 1, "Do not hardcode placeholder tokens; dynamically generate signed JWT credentials.");
            break;
          }
        }
      }
    }

    // Rule 1: Wildcard schemas (classes with mostly Optional[Any] or extra='allow')
    const classRegex = /class\s+([A-Za-z0-9_]+)\s*(?:\([^)]*\))?:([\s\S]*?)(?=\nclass\s|\ndef\s|$)/g;
    let cm;
    while ((cm = classRegex.exec(f.content)) !== null) {
      const clsName = cm[1];
      const clsBody = cm[2];
      const classLine = f.content.substring(0, cm.index).split('\n').length;

      if (/extra\s*=\s*['"]allow['"]|extra\s*=\s*Extra\.allow/.test(clsBody)) {
        add('WILDCARD_SCHEMA_MODEL', f.path, `Model '${clsName}' defines extra='allow'; request schemas must use extra='forbid'.`, classLine, "Request models must use extra='forbid' instead of extra='allow'.");
      }

      const fieldLines = clsBody.split('\n').filter(l => /^\s+[a-zA-Z0-9_]+\s*:\s*/.test(l) && !l.includes('model_config'));
      if (fieldLines.length > 0) {
        const anyFields = fieldLines.filter(l => /:\s*(?:Optional\[)?Any\]?/.test(l));
        if (anyFields.length >= Math.ceil(fieldLines.length * 0.5)) {
          add('WILDCARD_SCHEMA_MODEL', f.path, `Pydantic model '${clsName}' uses wildcard Optional[Any] fields (${anyFields.length}/${fieldLines.length}); concrete typing is required.`, classLine, "Pydantic models must use concrete types and request schemas must set extra=\"forbid\".");
        }
      }
    }

    // Rule 3: Hardcoded secret defaults in configuration / env lookups
    const insecureSecretRegex = /(?:SECRET_KEY|JWT_SECRET|API_KEY|PASSWORD|AUTH_SECRET)\s*=\s*(?:os\.(?:getenv|environ\.get)\s*\([^)]*,\s*|process\.env\.[A-Z_]+\s*\|\|\s*)?['"](your_secret_key|secret|secret_key|your-secret-key|your_jwt_secret|quickcart-production-secret-key-change-in-env|change-this-secret|test_secret|placeholder|supersecret|7b8f9e0a1c2d3e4f5a6b7c8d9e0f1a2b)['"]/i;
    if (!isTest) {
      for (let i = 0; i < lines.length; i++) {
        const lineStr = lines[i];
        const secMatch = lineStr.match(insecureSecretRegex);
        if (secMatch) {
          add('HARDCODED_SECRET_DEFAULT', f.path, `Hardcoded insecure secret default is not permitted: '${secMatch[1]}'`, i + 1, "Secret keys and tokens must not use hardcoded insecure placeholder defaults in code; load them strictly from environment variables without hardcoded secrets.");
        }
      }
    }

    // Rule 5: Swallowed ImportError / ModuleNotFoundError in forwarder or entry points
    for (let i = 0; i < lines.length - 2; i++) {
      if (/except\s+(?:ImportError|ModuleNotFoundError)\s*:/.test(lines[i])) {
        const nextLines = [lines[i + 1] || '', lines[i + 2] || ''].map(l => l.trim());
        if (nextLines.includes('pass') || nextLines.includes('...')) {
          add('IMPORT_ERROR_SWALLOWED', f.path, `ImportError is swallowed with pass on line ${i + 1}; entry points must allow import errors to raise.`, i + 1, "Do not swallow ImportError in entry point forwarders; allow missing dependencies to raise.");
        }
      }
    }

    // Phase 4: Reject Python boolean 'and' inside SQLAlchemy .filter()
    for (let i = 0; i < lines.length; i++) {
      if (/\.filter\s*\([^)]*==[^)]*\band\b[^)]*==[^)]*\)/.test(lines[i])) {
        add('SQLALCHEMY_FILTER_BOOLEAN_AND', f.path, "Python boolean 'and' used inside SQLAlchemy .filter(); multiple conditions must be separated by commas (.filter(c1, c2)) or use sqlalchemy.and_()", i + 1, "Replace 'and' with a comma in .filter(cond1, cond2)");
      }
    }

    // Phase 4: Reject bogus comparisons comparing board_id to user_id
    for (let i = 0; i < lines.length; i++) {
      if (/(?:\b\w+\.board_id|\bboard_id)\s*==\s*(?:current_user(?:\.id|\['id'\])?|user_id)/.test(lines[i])) {
        add('BOGUS_OWNERSHIP_COMPARISON', f.path, "Bogus authorization check compares 'board_id' directly to user identity instead of checking board ownership (board.user_id == current_user.id).", i + 1, "Verify board ownership with board.user_id == current_user.id instead of comparing board_id to user_id.");
      }
    }

    // Phase 4: Reject unfiltered collection queries for user-owned models
    if (!isTest) {
      for (let i = 0; i < lines.length; i++) {
        if (/\bdb\.query\s*\(\s*(?:Task|Board|Order|CartItem|Address|Wishlist|Project|Todo|Note|Goal)\s*\)\.all\(\)/.test(lines[i])) {
          const surrounding = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
          if (!surrounding.includes('.filter(') && !surrounding.includes('.filter_by(')) {
            add('UNSCOPED_COLLECTION_QUERY', f.path, `Unscoped collection query targets user-owned entity without user_id filter: ${lines[i].trim()}`, i + 1, "Filter user-owned models by authenticated user: .filter(Model.user_id == current_user.id)");
          }
        }
      }
    }

    if (f.content.includes('db.add(')) {
      const addMatches = [...f.content.matchAll(/db\.add\s*\(\s*([a-zA-Z0-9_]+)\s*\)/g)];
      for (const am of addMatches) {
        const varName = am[1];
        const afterAdd = f.content.substring(am.index + am[0].length);
        const nextFlush = afterAdd.search(/db\.(?:flush|commit)\s*\(/);
        const accessRegex = new RegExp(`\\b${varName}\\.id\\b`);
        const accessMatch = accessRegex.exec(afterAdd);
        if (accessMatch && (nextFlush === -1 || accessMatch.index < nextFlush)) {
          const line = f.content.substring(0, am.index + am[0].length + accessMatch.index).split('\n').length;
          add('UNFLUSHED_PARENT_ID', f.path, `Parent model instance '${varName}' must be flushed with db.flush() before accessing '${varName}.id'`, line);
        }
      }
    }

    if (currentUserReturnsDict) {
      const dictMethods = new Set(['get', 'keys', 'values', 'items', 'pop', 'clear', 'copy', 'update', 'setdefault']);
      const attrMatches = [...f.content.matchAll(/\bcurrent_user\.([a-zA-Z0-9_]+)/g)];
      for (const m of attrMatches) {
        if (!dictMethods.has(m[1])) {
          const line = f.content.substring(0, m.index).split('\n').length;
          add('USER_OBJECT_DICT_MISMATCH', f.path, `current_user is provided as a dictionary but accessed with object attribute notation 'current_user.${m[1]}'`, line);
          break;
        }
      }
    }
    if (currentUserReturnsObj) {
      const match = /\bcurrent_user\[['"]([a-zA-Z0-9_]+)['"]\]|\bcurrent_user\.get\s*\(/.exec(f.content);
      if (match) {
        const line = f.content.substring(0, match.index).split('\n').length;
        add('USER_OBJECT_DICT_MISMATCH', f.path, `current_user is provided as an object but accessed with dictionary notation`, line);
      }
    }

    if (f.path.includes('cart')) {
      if (/OrderItem\s*\([^)]*order_id\b/.test(f.content) || /OrderItem\.order_id\b/.test(f.content)) {
        const match = /(?:OrderItem\s*\([^)]*order_id\b|OrderItem\.order_id\b)/.exec(f.content);
        const line = match ? f.content.substring(0, match.index).split('\n').length : 1;
        add('CART_ORDER_MODEL_MISUSE', f.path, "Cart logic cannot reuse OrderItem with order_id set to user_id", line);
      }
    }

    if (f.path.includes('/tests/') || f.path.endsWith('_test.py') || f.path.startsWith('test_')) {
      const broadMatch = /assert\s+.*status_code\s+in\s*\(\s*([0-9,\s]+)\s*\)/.exec(f.content);
      if (broadMatch) {
        const codes = broadMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
        const hasSuccess = codes.some(c => c >= 200 && c < 300);
        const hasError = codes.some(c => c >= 400 && c < 600);
        if (codes.length >= 3 || (hasSuccess && hasError)) {
          const line = f.content.substring(0, broadMatch.index).split('\n').length;
          add('BROAD_STATUS_CODE_ASSERTION', f.path, `Test uses an overly permissive status code assertion: ${broadMatch[0]}`, line);
        }
      }

      const funcRegex = /def\s+(test_[a-zA-Z0-9_]+)\s*\([^)]*\):([\s\S]*?)(?=\ndef\s+test_|$)/g;
      let fnm;
      while ((fnm = funcRegex.exec(f.content)) !== null) {
        const testName = fnm[1];
        const body = fnm[2];
        const isReqTest = testName.startsWith('test_REQ_') || /req_|requirement|cart|checkout|order|auth|login|user|payment/i.test(testName);
        if (isReqTest && /\bassert\s+True\b/.test(body)) {
          const line = f.content.substring(0, fnm.index).split('\n').length;
          add('TRIVIAL_WORKFLOW_TEST', f.path, `Test ${testName} uses assert True and does not prove requirement behavior`, line);
        }
        if (isReqTest && !/product|catalog|browse|item|search/i.test(testName)) {
          const apiCalls = [...body.matchAll(/client\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
          if (apiCalls.length > 0 && apiCalls.every(ep => ep.startsWith('/api/products'))) {
            const line = f.content.substring(0, fnm.index).split('\n').length;
            add('GENERIC_REQUIREMENT_TEST', f.path, `Test ${testName} queries generic /api/products instead of testing requirement-specific behavior`, line);
          }
        }
      }
    }

    const importRegex = /from\s+([a-zA-Z0-9_.]+)\s+import\s+([^\r\n#]+)/g;
    const multilineImportRegex = /from\s+([a-zA-Z0-9_.]+)\s+import\s*\(([^)]*)\)/g;
    let im;
    const imports = [];
    while ((im = importRegex.exec(f.content)) !== null) imports.push(im);
    while ((im = multilineImportRegex.exec(f.content)) !== null) imports.push(im);
    for (const match of imports) {
      im = match;
      const mod = im[1];
      if (mod === 'alembic' || mod.startsWith('alembic.')) {
        continue;
      }
      const symbols = im[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      let modPath = mod.replace(/\./g, '/');
      if (mod.startsWith('.')) {
        const fileDir = f.path.replace(/\/[^/]+$/, '');
        modPath = (fileDir + '/' + mod.replace(/^\.+/, '')).replace(/^backend\//, '');
      }
      const candidateFiles = [modPath + '.py', 'backend/' + modPath + '.py', modPath + '/__init__.py', 'backend/' + modPath + '/__init__.py'];
      let target = files.find(file => candidateFiles.some(c => file.path.endsWith(c)));
      if (!target && /^app\.models(?:\.[a-zA-Z0-9_]+)?$/.test(mod) && (f.path.includes('/tests/') || f.path.startsWith('tests/') || f.path.startsWith('backend/tests/') || f.path.endsWith('_test.py'))) {
        const dbModels = files.find(file => file.path.endsWith('backend/app/db/models.py') || file.path.endsWith('app/db/models.py'));
        if (dbModels) target = dbModels;
      }
      if (!target && mod.startsWith('app.')) {
        add('MISSING_PYTHON_MODULE', f.path, `Missing module: ${mod}`, 1);
        continue;
      }
      if (symbols.includes('*') && /schemas/i.test(mod)) {
        add('WILDCARD_SCHEMA_MODEL', f.path, `Wildcard import '${im[0].trim()}' from schema module is forbidden; schemas must be imported explicitly by class name.`, 1, "Replace wildcard schema import with explicit named schema imports.");
      }
      if (target && typeof target.content === 'string') {
        for (const rawSym of symbols) {
          const sym = rawSym.replace(/[()]/g, '').trim();
          if (!sym || sym === '*' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sym)) continue;
          const submodulePath = `${modPath}/${sym}`;
          const submoduleExists = files.some(file => [
            `${submodulePath}.py`, `backend/${submodulePath}.py`,
            `${submodulePath}/__init__.py`, `backend/${submodulePath}/__init__.py`
          ].some(candidate => file.path.endsWith(candidate)));
          if (submoduleExists) continue;
          const safeSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let exportsSym = new RegExp(`\\b(?:class|def)\\s+${safeSym}\\b|\\b${safeSym}\\s*=|from\\s+.*\\s+import\\s+.*\\b${safeSym}\\b`).test(target.content);
          if (!exportsSym && target.path.endsWith('__init__.py')) {
            const packageDir = target.path.replace(/\/[^/]+$/, '');
            const sibling = files.find(file =>
              file.path.startsWith(packageDir) &&
              file.path.endsWith('.py') &&
              file.path !== target.path &&
              new RegExp(`\\b(?:class|def)\\s+${safeSym}\\b|\\b${safeSym}\\s*=`).test(file.content)
            );
            if (sibling) {
              exportsSym = true;
            }
          }
          if (!exportsSym && target.path.includes('main.py') && sym === 'get_db') {
            const dbProvider = files.find(file => file.content && (file.content.includes('def get_db(') || file.content.includes('get_db =')));
            if (dbProvider) {
              exportsSym = true;
            }
          }
          if (!exportsSym) {
            const isSchema = /schemas/i.test(mod) || /schemas/i.test(target.path);
            const hint = isSchema
              ? `Pydantic schema model '${sym}' must be defined and exported in '${target.path}' with exact class name.`
              : `Define and export '${sym}' in '${target.path}'.`;
            add(isSchema ? 'SCHEMA_MODEL_PARITY_MISMATCH' : 'MISSING_PYTHON_SYMBOL', f.path, `Symbol '${sym}' is not exported by ${target.path}`, 1, hint);
          }
        }
      }
    }

    const ignoredSchemaAttrs = new Set([
      'dict', 'model_dump', 'json', 'model_dump_json', 'copy', 'model_copy', 'model_validate',
      'from_orm', 'parse_obj', 'construct', 'schema', 'schema_json', 'first', 'all', 'one',
      'count', 'filter', 'filter_by', 'order_by', 'join', 'offset', 'limit', 'id',
      'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'index', 'sort', 'reverse',
      'get', 'items', 'keys', 'values', 'update', 'setdefault', 'popitem', 'add', 'discard', 'password',
      '__table__', '__tablename__', '__mapper__', 'metadata', 'columns', 'c'
    ]);
    const attrRegex = /([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g;
    const queryRegex = /\bdb\.query\s*\(\s*([a-zA-Z0-9_]+)\s*\)/g;
    let qm;
    while ((qm = queryRegex.exec(f.content)) !== null) {
      const queried = qm[1];
      // A domain name may legitimately exist in both the ORM registry and the
      // Pydantic schema registry (for example Product/ProductResponse). Only
      // flag a query when the queried symbol is schema-only.
      if (schemas.has(queried) && !models.has(queried)) {
        const line = f.content.substring(0, qm.index).split('\n').length;
        add('ORM_SCHEMA_QUERY', f.path, `Database query targets Pydantic schema ${queried}, not an ORM model`, line);
      }
    }

    const functionRegex = /(^[ \t]*)(?:async\s+)?def\s+[A-Za-z_]\w*/gm;
    const functionMatches = [...f.content.matchAll(functionRegex)];
    for (let i = 0; i < functionMatches.length; i += 1) {
      const match = functionMatches[i];
      const bodyStart = match.index + match[0].length;
      const next = functionMatches[i + 1];
      const bodyEnd = next ? next.index : f.content.length;
      const body = f.content.slice(bodyStart, bodyEnd);
      const decoratorContext = f.content.slice(Math.max(0, match.index - 600), match.index);
      const commitCount = (body.match(/\bdb\.commit\s*\(\s*\)/g) || []).length;
      if (/@(?:router|app)\.(?:get|post|put|patch|delete)\b/.test(decoratorContext) && commitCount > 1 && /\n\s*(?:for|while)\s+/.test(body)) {
        add('NON_ATOMIC_WORKFLOW', f.path, 'Workflow commits repeatedly inside a multi-record operation; use one atomic transaction', f.content.slice(0, match.index).split('\n').length);
      }
    }

    if (/Depends\(\s*get_current_user\s*\)/.test(f.content) &&
        !/\b(?:def\s+get_current_user|from\s+app\.(?:api\.auth|api\.deps|core\.security|core\.auth)\s+import[^\n]*\bget_current_user\b|import\s+get_current_user)/.test(f.content)) {
      const line = f.content.substring(0, f.content.indexOf('get_current_user')).split('\n').length;
      add('MISSING_PYTHON_SYMBOL', f.path, "Symbol 'get_current_user' is referenced but not imported or defined", line);
    }

    let am;
    while ((am = attrRegex.exec(f.content)) !== null) {
      const varName = am[1];
      const attrName = am[2];
      if (ignoredSchemaAttrs.has(attrName)) continue;
      const queryMatch = new RegExp(`\\b${varName}\\s*=\\s*db\\.query\\s*\\(\\s*([a-zA-Z0-9_]+)\\s*\\)`).exec(f.content);
      if (queryMatch) {
        const modelName = queryMatch[1];
        const mObj = models.get(modelName) || schemas.get(modelName);
        if (mObj && mObj.fields.size > 0 && !mObj.fields.has(attrName)) {
          const line = f.content.substring(0, am.index).split('\n').length;
          add('SCHEMA_FIELD_MISMATCH', f.path, `Class attribute is absent from declared model: ${varName}.${attrName}`, line);
        }
      }
      const directModel = models.get(varName);
      if (directModel && directModel.fields.size > 0 && !directModel.fields.has(attrName)) {
        const line = f.content.substring(0, am.index).split('\n').length;
        add('MODEL_FIELD_MISMATCH', f.path, `ORM model field is absent from declared model: ${varName}.${attrName}`, line);
      }
      const paramMatch = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z0-9_]+)`).exec(f.content);
      if (paramMatch) {
        const schemaName = paramMatch[1];
        const sObj = schemas.get(schemaName);
        if (sObj && !sObj.allowsExtra && sObj.fields.size > 0 && !sObj.fields.has(attrName)) {
          const line = f.content.substring(0, am.index).split('\n').length;
          add('SCHEMA_FIELD_MISMATCH', f.path, `${varName}.${attrName} is absent from its declared schema`, line);
        }
      }
    }
  }

  // Rule 5: Multiple real FastAPI app entry points
  const fastapiInstantiations = [];
  for (const f of pythonFiles) {
    const match = /app\s*=\s*FastAPI\s*\(/.exec(f.content);
    if (match) {
      const line = f.content.substring(0, match.index).split('\n').length;
      fastapiInstantiations.push({ file: f.path, line });
    }
  }
  if (fastapiInstantiations.length > 1) {
    for (const inst of fastapiInstantiations) {
      if (!inst.file.endsWith('app/main.py')) {
        add('MULTIPLE_FASTAPI_ENTRYPOINTS', inst.file, `Multiple FastAPI app instances found: '${inst.file}' instantiates FastAPI instead of importing canonical app from app.main.`, inst.line, "Only backend/app/main.py should define the FastAPI app instance, and entry point forwarders must not swallow ImportError.");
      }
    }
  }
}

export function routeShape(value) {
  return value.replace(/\{[^}]+\}/g, '{param}').replace(/\/$/, '') || '/';
}

export async function validateProjectContracts(files, options = {}) {
  const defects = [];
  const add = (code, file, message, line, hint) => {
    if (!defects.some(defect => defect.code === code && defect.file === file && defect.line === line && defect.message === message)) {
      defects.push({ code, file, message, line: line || 1, hint: hint || message, severity: 'HIGH' });
    }
  };
  const pythonFiles = files.filter(f => f.path.endsWith('.py') && typeof f.content === 'string');

  // Classification 1: Static route, schema & frontend checks (Run in JS without Python)
  const staticContracts = extractStaticPythonContracts(files);
  let routes = staticContracts.routes;
  let testNames = staticContracts.testNames || {};
  detectStaticPythonDefects(files, add, staticContracts.schemas, staticContracts.models);
  for (const route of routes) {
    const hasSyntaxFailure = defects.some(d => d.code === 'PYTHON_SYNTAX_ERROR' && d.file === route.file);
    if (route.stubEndpoint && !hasSyntaxFailure && !/\/(?:health|ping)$/.test(route.path)) {
      add('STUB_ENDPOINT', route.file, `Endpoint ${route.method} ${route.path} has a constant or empty stub response`, route.line);
    }
    const responseSchema = route.responseModelName && staticContracts.schemas.get(route.responseModelName);
    if (responseSchema) {
      const isTokenModel = /^(?:Token|TokenResponse|TokenData|LoginResponse|AuthResponse|RegisterResponse|UserResponse)$/i.test(route.responseModelName) || /\/auth|\/login|\/token|\/register/i.test(route.path);
      const sensitive = [...responseSchema.fields].filter(field => {
        if (/^(?:password|password_hash|hashed_password|secret_key)$/i.test(field)) return true;
        if (/^(?:access_token|refresh_token)$/i.test(field) && !isTokenModel) return true;
        return false;
      });
      if (sensitive.length) add('SENSITIVE_RESPONSE_FIELD', route.file, `Response schema ${route.responseModelName} exposes sensitive fields: ${sensitive.join(', ')}`, route.line);
      if (responseSchema.allowsExtra) add('BROAD_RESPONSE_SCHEMA', route.file, `Response schema ${route.responseModelName} allows arbitrary extra fields`, route.line);
      if (/(?:Create|Update)$/.test(route.responseModelName)) add('OPERATION_SCHEMA_MISMATCH', route.file, `Route response must use a dedicated response schema instead of ${route.responseModelName}`, route.line);
    }
  }

  // Classification 2: Python AST checks
  if (pythonFiles.length) {
    if (options.python) {
      // Explicit Python override was configured
      try {
        const parsed = await analyzePython(pythonFiles, options.python);
        if (Array.isArray(parsed?.defects)) {
          for (const d of parsed.defects) {
            if (!defects.some(existing => existing.code === d.code && existing.file === d.file && existing.line === d.line && existing.message === d.message)) {
              defects.push(d);
            }
          }
        }
        if (Array.isArray(parsed?.routes) && parsed.routes.length) {
          routes = parsed.routes;
        }
        if (parsed?.testNames) {
          testNames = { ...testNames, ...parsed.testNames };
        }
      } catch (error) {
        add('CONTRACT_VALIDATION_UNAVAILABLE', '', error.message);
      }
    } else {
      // Try shared Python if available
      const pythonExe = resolveSharedPython({ checkExecutable: true });
      if (pythonExe) {
        try {
          const parsed = await analyzePython(pythonFiles, pythonExe);
          if (Array.isArray(parsed?.defects)) {
            for (const d of parsed.defects) {
            if (!defects.some(existing => existing.code === d.code && existing.file === d.file && existing.line === d.line && existing.message === d.message)) {
                defects.push(d);
              }
            }
          }
          if (Array.isArray(parsed?.routes) && parsed.routes.length) {
            routes = parsed.routes;
          }
          if (parsed?.testNames) {
            testNames = { ...testNames, ...parsed.testNames };
          }
        } catch {
          // Shared python execution failed; static analysis already extracted routes and defects
        }
      }
    }
  }

  const names = new Set(files.map(f => f.path));
  if (!names.has('README.md')) add('MISSING_STARTUP_FILE', 'README.md', 'Project setup documentation is missing');
  if (pythonFiles.some(f => f.path.startsWith('backend/')) && !names.has('backend/requirements.txt') && !names.has('backend/pyproject.toml')) add('MISSING_STARTUP_FILE', 'backend/requirements.txt', 'Backend dependency manifest is missing');
  if (files.some(f => /^frontend\/.*\.[jt]sx?$/.test(f.path))) {
    for (const required of ['frontend/package.json', 'frontend/index.html']) if (!names.has(required)) add('MISSING_STARTUP_FILE', required, `Required startup file is missing: ${required}`);
  }
  detectFrontendStackDefects(files, add);
  const requests = extractFrontendRequests(files);
  for (const req of requests) {
    if (req.isHardcodedLocalhost) {
      add('HARDCODED_API_URL', req.file, `Frontend uses hardcoded localhost URL '${req.rawUrl}'; use configured API base URL`, req.line);
    }
  }
  if (pythonFiles.length) {
    for (const request of requests) {
      const route = routes.find(r => r && r.method === request.method && routeShape(r.path) === routeShape(request.path));
      if (!route) add('API_ROUTE_MISMATCH', request.file, `${request.method} ${request.path} has no matching registered backend endpoint`, request.line);
      else if (request.expectedShape && route.responseShape && request.expectedShape !== route.responseShape) {
        add('API_RESPONSE_SHAPE_MISMATCH', request.file, `${request.method} ${request.path}: frontend expects ${request.expectedShape}, backend returns ${route.responseShape}`, request.line);
      }
      else if (request.bodyFields !== undefined || (route.requiredFields && route.requiredFields.length > 0) || route.requestSchema) {
        const reqFields = Array.isArray(route.requiredFields) ? route.requiredFields : [];
        if ((reqFields.length > 0 || route.requestSchema) && request.bodyFields === null) {
          add('API_REQUEST_MISMATCH', request.file, `${request.method} ${request.path} requires a request body${route.requestSchema ? ` (${route.requestSchema})` : ` with fields: ${reqFields.join(', ')}`}`, request.line);
        } else if (request.bodyFields) {
          const missing = reqFields.filter(field => !request.bodyFields.includes(field));
          if (missing.length) add('API_REQUEST_MISMATCH', request.file, `${request.method} ${request.path} is missing required body fields: ${missing.join(', ')}`, request.line);
        }
      }
    }
  }
  for (const expected of options.integrationContract?.endpoints || []) {
    if (!pythonFiles.length) continue;
    const route = routes.find(r => r && r.method === expected.method && routeShape(r.path) === routeShape(expected.path));
    if (!route) add('PLANNED_ENDPOINT_MISSING', expected.backendFile || '', `Shared contract endpoint missing: ${expected.method} ${expected.path}`);
    else if (options.integrationContract?.schemaVersion === 2 && route.file !== expected.backendFile) add('API_OWNER_MISMATCH', route.file, `Contracted endpoint ${expected.path} must be implemented in ${expected.backendFile}`, route.line);
    else if (expected.responseFields?.length) {
      const respFields = Array.isArray(route.responseFields) ? route.responseFields : null;
      if (!respFields) add('API_RESPONSE_UNVERIFIED', route.file || '', `Declare a response schema for ${expected.method} ${expected.path}`, route.line);
      else {
        const missing = expected.responseFields.filter(field => !respFields.includes(field));
        if (missing.length) add('API_RESPONSE_MISMATCH', route.file || '', `Response schema is missing shared contract fields: ${missing.join(', ')}`, route.line);
      }
    }
  }
  // Check playwright.config.ts for port 3000
  for (const f of files) {
    if (f.path && f.path.includes('playwright.config') && typeof f.content === 'string') {
      if (/(?:localhost|127\.0\.0\.1):3000\b/.test(f.content) || /port:\s*3000\b/.test(f.content)) {
        add('PLAYWRIGHT_PORT_MISMATCH', f.path, "Playwright configuration targets port 3000 instead of Vite dev port 5173", 1);
      }
    }
  }

  // File size budget and modular decomposition enforcement (S5)
  for (const f of files) {
    if (f.path && typeof f.content === 'string') {
      const budgetCheck = validateFileSizeBudget(f.content, f.path);
      if (!budgetCheck.isValid) {
        budgetCheck.defects.forEach(d => add(d.code, d.file, d.message, d.line, d.hint));
      }
    }
  }

  const playwrightAsyncMatchers = new Set(['toBeVisible', 'toBeHidden', 'toHaveText', 'toContainText', 'toHaveValue', 'toBeChecked', 'toBeDisabled', 'toBeEnabled', 'toBeFocused', 'toHaveCount', 'toHaveAttribute', 'toHaveClass', 'toHaveTitle', 'toHaveURL']);
  const specFiles = files.filter(f => f.path && (f.path.includes('/tests/') || f.path.endsWith('.spec.ts') || f.path.endsWith('.test.ts')) && (f.path.endsWith('.ts') || f.path.endsWith('.js')));
  const discoveredTestNames = {};

  for (const file of specFiles) {
    if (!file.content || typeof file.content !== 'string') continue;
    discoveredTestNames[file.path] = discoveredTestNames[file.path] || [];
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isCallExpression(node) && /^test(?:\.(?:only|skip))?$/.test(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        discoveredTestNames[file.path].push(node.arguments[0].text);
      }
      // Check for expect(page).toBeDefined()
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;
        const callerText = node.expression.expression.getText(source);
        if (methodName === 'toBeDefined' && callerText === 'expect(page)') {
          add('VACUOUS_BROWSER_TEST', file.path, "Browser test contains vacuous assertion 'expect(page).toBeDefined()'; tests must assert real rendered UI elements", source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
        }
        if (playwrightAsyncMatchers.has(methodName) && callerText.startsWith('expect(')) {
          if (!ts.isAwaitExpression(node.parent)) {
            add('UNAWAITED_BROWSER_ASSERTION', file.path, `Playwright locator assertion '${methodName}' must be awaited (e.g. await expect(...).${methodName}(...))`, source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (options.integrationContract?.schemaVersion === 2) {
    const auth = new Set(['get_current_user', 'get_current_active_user', 'require_auth', 'require_admin', 'get_current_admin', 'require_admin_user']);
    const admin = new Set(['require_admin', 'get_current_admin', 'require_admin_user']);
    for (const expected of options.integrationContract.endpoints || []) {
      const route = routes.find(r => r.method === expected.method && routeShape(r.path) === routeShape(expected.path));
      const required = expected.auth === 'admin' ? admin : expected.auth === 'user' ? auth : null;
      if (route && required && !(route.authGuards || []).some(g => required.has(g))) add('API_AUTH_POLICY_MISMATCH', route.file, `Endpoint ${expected.method} ${expected.path} requires ${expected.auth} authorization`, route.line);
    }
    const idKey = value => String(value).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    for (const suite of options.integrationContract.workflows || []) {
      const names = [...(testNames[suite.testFile] || []), ...(discoveredTestNames[suite.testFile] || [])];
      for (const id of suite.requirementIds || []) if (!names.some(name => new RegExp(`(?:^|_)${idKey(id)}(?:_|$)`).test(idKey(name)))) add('WORKFLOW_REQUIREMENT_UNTESTED', suite.testFile, `Generate a real executable test case for ${id} with the requirement ID in its name`);
    }
  }
  return { isValid: defects.length === 0, defects, errors: defects.map(d => d.message), routes, requests };
}
