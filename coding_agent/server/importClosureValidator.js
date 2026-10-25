import path from 'path';
import fs from 'fs';
import { DATABASE_DEFECT_CODES } from './dbValidator.js';

// Python standard library module whitelist (never treated as missing local/3rd-party modules)
const PYTHON_STDLIB = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'binascii', 'bisect',
  'builtins', 'calendar', 'cmath', 'collections', 'concurrent', 'contextlib',
  'contextvars', 'copy', 'csv', 'ctypes', 'dataclasses', 'datetime', 'decimal',
  'difflib', 'dis', 'doctest', 'email', 'enum', 'errno', 'faulthandler', 'fcntl',
  'filecmp', 'fileinput', 'fnmatch', 'fractions', 'functools', 'gc', 'getopt',
  'getpass', 'gettext', 'glob', 'graphlib', 'gzip', 'hashlib', 'heapq', 'hmac',
  'html', 'http', 'idlelib', 'imaplib', 'imghdr', 'importlib', 'inspect', 'io',
  'ip_network', 'itertools', 'json', 'keyword', 'linecache', 'locale', 'logging',
  'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder',
  'multiprocessing', 'netrc', 'nntplib', 'numbers', 'operator', 'optparse', 'os',
  'pathlib', 'pdb', 'pickle', 'pickletools', 'pkgutil', 'platform', 'plistlib',
  'poplib', 'posix', 'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile',
  'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib',
  'resource', 'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors',
  'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr',
  'socket', 'socketserver', 'sqlite3', 'ssl', 'stat', 'statistics', 'string',
  'stringprep', 'struct', 'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig',
  'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios', 'test',
  'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize',
  'tomllib', 'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo',
  'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv',
  'warnings', 'wave', 'weakref', 'webbrowser', 'winreg', 'winsound', 'wsgiref',
  'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo'
]);

// Map of common Python import top-level names to package names in requirements.txt
const PYTHON_PACKAGE_ALIASES = {
  'jose': ['python-jose', 'jose'],
  'multipart': ['python-multipart', 'multipart'],
  'dotenv': ['python-dotenv', 'dotenv'],
  'passlib': ['passlib', 'passlib[bcrypt]'],
  'email_validator': ['email-validator', 'email_validator'],
  'bcrypt': ['bcrypt'],
  'yaml': ['pyyaml', 'yaml'],
  'PIL': ['pillow', 'pil'],
  'cv2': ['opencv-python'],
  'bs4': ['beautifulsoup4', 'bs4'],
  'sklearn': ['scikit-learn'],
  'starlette': ['starlette', 'fastapi'],
  'pydantic_settings': ['pydantic-settings', 'pydantic'],
  'sqlalchemy': ['sqlalchemy'],
  'fastapi': ['fastapi'],
  'uvicorn': ['uvicorn', 'uvicorn[standard]'],
  'pydantic': ['pydantic'],
  'alembic': ['alembic'],
  'httpx': ['httpx'],
  'pytest': ['pytest']
};

/**
 * Normalizes file path to forward slashes.
 */
function normPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Validates import and dependency closure across all generated files in a project.
 * 
 * @param {Array<{path: string, content: string}>} files - Project files
 * @param {Object} options - Optional config (workspacePath, strictExternal)
 * @returns {{isValid: boolean, defects: Array, errors: string[], summary: Object}}
 */
export function validateImportClosure(files = [], options = {}) {
  const defects = [];
  const errors = [];
  const fileMap = new Map();
  const filePathsSet = new Set();

  files.forEach(f => {
    if (f && f.path) {
      const np = normPath(f.path);
      fileMap.set(np, f.content || '');
      filePathsSet.add(np);
    }
  });

  // Extract declared requirements.txt entries
  const declaredPyPackages = new Set();
  const reqFile = files.find(f => f.path && normPath(f.path).endsWith('requirements.txt'));
  if (reqFile && reqFile.content) {
    reqFile.content.split('\n').forEach(line => {
      const clean = line.split('#')[0].trim();
      if (!clean) return;
      const pkgName = clean.split(/[=<>!~;@\s[]/)[0].toLowerCase().trim();
      if (pkgName) declaredPyPackages.add(pkgName);
    });
  }

  // Extract declared frontend dependencies from package.json
  const declaredFrontendPackages = new Set();
  const pkgJsonFile = files.find(f => f.path && normPath(f.path).endsWith('package.json'));
  if (pkgJsonFile && pkgJsonFile.content) {
    try {
      const parsed = JSON.parse(pkgJsonFile.content);
      const allDeps = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
        ...(parsed.peerDependencies || {})
      };
      Object.keys(allDeps).forEach(p => declaredFrontendPackages.add(p.toLowerCase()));
    } catch (_) {}
  }

  // Helpers to test if a target relative/internal path resolves to any known file
  function fileExists(targetRel) {
    const clean = normPath(targetRel);
    if (filePathsSet.has(clean)) return true;
    if (options.workspacePath) {
      try {
        const diskPath = path.resolve(options.workspacePath, clean);
        if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) return true;
      } catch (_) {}
    }
    return false;
  }

  function resolvePyTarget(sourceFilePath, importMod) {
    // Relative imports starting with . or ..
    if (importMod.startsWith('.')) {
      const sourceDir = normPath(path.dirname(sourceFilePath));
      const dotMatch = importMod.match(/^\.+/);
      const dotCount = dotMatch ? dotMatch[0].length : 1;
      const afterDots = importMod.substring(dotCount);
      const modSubPath = afterDots ? afterDots.replace(/\./g, '/') : '';

      let dirTokens = (sourceDir === '.' || !sourceDir) ? [] : sourceDir.split('/');
      // dotCount 1 = current dir, dotCount 2 = parent dir, etc.
      for (let i = 1; i < dotCount; i++) {
        if (dirTokens.length > 0) dirTokens.pop();
      }
      const baseDir = dirTokens.join('/');
      const candidatePaths = [];

      if (modSubPath) {
        candidatePaths.push(
          baseDir ? `${baseDir}/${modSubPath}.py` : `${modSubPath}.py`,
          baseDir ? `${baseDir}/${modSubPath}/__init__.py` : `${modSubPath}/__init__.py`
        );
      } else {
        candidatePaths.push(baseDir ? `${baseDir}/__init__.py` : `__init__.py`);
      }

      for (const cp of candidatePaths) {
        if (fileExists(cp)) return { found: true, path: cp };
      }
      return { found: false, candidatePaths };
    }

    // Absolute-style project imports (e.g. app.db.database or backend.app.db.database)
    let cleanMod = importMod;
    if (cleanMod.startsWith('backend.')) {
      cleanMod = cleanMod.substring('backend.'.length);
    }
    const modRel = cleanMod.replace(/\./g, '/');

    // Possible prefixes based on common workspace structures
    const searchPrefixes = ['', 'backend/', 'src/', 'app/', 'backend/app/', 'server/'];
    const candidates = [];

    const variants = [modRel];
    const lastPart = modRel.split('/').pop();
    if (lastPart.endsWith('ies')) {
      variants.push(modRel.slice(0, -3) + 'y');
    } else if (lastPart.endsWith('s') && !lastPart.endsWith('ss')) {
      variants.push(modRel.slice(0, -1));
    } else if (lastPart.endsWith('y')) {
      variants.push(modRel.slice(0, -1) + 'ies');
    } else {
      variants.push(modRel + 's');
    }

    for (const v of variants) {
      for (const pfx of searchPrefixes) {
        candidates.push(
          normPath(`${pfx}${v}.py`),
          normPath(`${pfx}${v}/__init__.py`)
        );
      }
    }

    for (const cp of candidates) {
      if (fileExists(cp)) return { found: true, path: cp };
    }

    // Subdirectory fallback: search for target module inside nested folders (e.g. admin/user_role.py)
    for (const p of filePathsSet) {
      if (p.endsWith(`/${lastPart}.py`) || p.endsWith(`/${lastPart}/__init__.py`)) {
        return { found: true, path: p };
      }
    }

    return { found: false, candidatePaths: candidates };
  }

  function resolveFrontendTarget(sourceFilePath, specifier) {
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

    for (const base of candidateBases) {
      for (const ext of allowedExtensions) {
        const candidate = normPath(base + ext);
        if (fileExists(candidate)) {
          return { found: true, path: candidate, isExternal: false };
        }
      }
    }

    return { found: false, targetBase, isExternal: false };
  }

  // 1. BACKEND CLOSURE VALIDATION
  const pyFiles = files.filter(f => f && f.path && normPath(f.path).endsWith('.py'));

  pyFiles.forEach(f => {
    const filePath = normPath(f.path);
    const content = f.content || '';
    const lines = content.split('\n');

    lines.forEach((lineText, lineIdx) => {
      // Strip comments (# ...) so trailing comments like '# noqa: F403' or '# noqa' are never parsed as imports or symbols
      const line = lineText.split('#')[0].trim();
      if (!line) return;

      // Scan: from <module> import ...
      const fromMatch = line.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\b/);
      // Scan: import <module>
      const importMatch = line.match(/^import\s+([a-zA-Z0-9_.,\s]+)/);

      const importMods = [];
      if (fromMatch) {
        importMods.push(fromMatch[1]);
      } else if (importMatch) {
        const rawMods = importMatch[1].split(',');
        for (const rm of rawMods) {
          const mod = rm.trim().split(/\s+as\s+/)[0].trim();
          if (mod) importMods.push(mod);
        }
      }

      if (importMods.length === 0) return;

      for (const importMod of importMods) {
        const topLevelToken = importMod.split('.')[0];

        // Standard library check
        if (PYTHON_STDLIB.has(topLevelToken) && !importMod.startsWith('.')) {
          continue;
        }

        // Determine if this looks like an internal project module
        const isRelative = importMod.startsWith('.');
        const isInternalRoot = ['app', 'backend', 'src', 'server'].includes(topLevelToken);
        const isKnownProjectFile = Array.from(filePathsSet).some(p =>
          p.startsWith(topLevelToken + '/') ||
          p.includes('/' + topLevelToken + '/') ||
          p.endsWith('/' + topLevelToken + '.py') ||
          p === topLevelToken + '.py'
        );

        if (isRelative || isInternalRoot || isKnownProjectFile) {
          const resolved = resolvePyTarget(filePath, importMod);
          if (!resolved.found) {
            const expected = resolved.candidatePaths ? resolved.candidatePaths[0] : importMod;
            const msg = `Import closure failure in '${filePath}' line ${lineIdx + 1}: internal module '${importMod}' not found (expected '${expected}').`;
            errors.push(msg);
            defects.push({
              code: DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE,
              file: filePath,
              line: lineIdx + 1,
              importedModule: importMod,
              missingTarget: expected,
              expectedFile: expected,
              candidatePaths: resolved.candidatePaths || [expected],
              category: 'backend_internal',
              severity: 'HIGH',
              message: msg
            });
          } else if (fromMatch && resolved.path) {
            // Verify that imported named symbols actually exist in the target module
            const rawImportTail = line.substring(line.indexOf(' import ') + 8).trim();
            const importedSymbols = rawImportTail
              .replace(/[()]/g, '')
              .split(',')
              .map(s => s.trim().split(/\s+as\s+/)[0].trim())
              .filter(s => s && s !== '*' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

            let targetContent = fileMap.get(resolved.path) || '';
            if (!targetContent && options.workspacePath) {
              try {
                const diskP = path.resolve(options.workspacePath, resolved.path);
                if (fs.existsSync(diskP)) targetContent = fs.readFileSync(diskP, 'utf8');
              } catch (_) {}
            }

            if (targetContent) {
              for (const sym of importedSymbols) {
                const symRegex = new RegExp(`\\b${sym}\\b`);
                if (!symRegex.test(targetContent)) {
                  const msg = `Import closure failure in '${filePath}' line ${lineIdx + 1}: symbol '${sym}' is imported from '${importMod}', but is not defined in '${resolved.path}'.`;
                  errors.push(msg);
                  defects.push({
                    code: DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE,
                    file: filePath,
                    line: lineIdx + 1,
                    importedModule: importMod,
                    missingSymbol: sym,
                    targetFile: resolved.path,
                    expectedFile: resolved.path,
                    candidatePaths: [resolved.path],
                    category: 'backend_internal_symbol',
                    severity: 'HIGH',
                    message: msg
                  });
                }
              }
            }
          }
        } else {
          // External 3rd party package check (if requirements.txt is provided in files)
          if (declaredPyPackages.size > 0) {
            const aliases = PYTHON_PACKAGE_ALIASES[topLevelToken] || [topLevelToken.toLowerCase()];
            const hasMatch = aliases.some(alias => declaredPyPackages.has(alias.toLowerCase()));
            if (!hasMatch && !PYTHON_STDLIB.has(topLevelToken)) {
              const msg = `Import closure warning in '${filePath}' line ${lineIdx + 1}: external package '${topLevelToken}' is imported but not declared in requirements.txt.`;
              if (options.strictExternal) {
                errors.push(msg);
                defects.push({
                  code: DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE,
                  file: filePath,
                  line: lineIdx + 1,
                  package: topLevelToken,
                  category: 'backend_external',
                  severity: 'MEDIUM',
                  message: msg
                });
              }
            }
          }
        }
      }
    });
  });

  // 2. FRONTEND CLOSURE VALIDATION
  const frontendFiles = files.filter(f => {
    if (!f || !f.path) return false;
    const np = normPath(f.path);
    return np.endsWith('.tsx') || np.endsWith('.ts') || np.endsWith('.jsx') || (np.endsWith('.js') && np.includes('frontend'));
  });

  frontendFiles.forEach(f => {
    const filePath = normPath(f.path);
    const content = f.content || '';

    // Regex matching imports, exports, and requires
    const importRegex = /(?:(?:import|export)\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*|import\s*\()\s*['"]([^'"]+)['"]/g;

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
      const resolved = resolveFrontendTarget(filePath, specifier);

      if (!resolved.isExternal) {
        if (!resolved.found) {
          const msg = `Import closure failure in '${filePath}' line ${lineIdx}: local component/module '${specifier}' not found (expected relative to '${normPath(path.dirname(filePath))}').`;
          errors.push(msg);
          defects.push({
            code: DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE,
            file: filePath,
            line: lineIdx,
            importedModule: specifier,
            expectedFile: specifier,
            candidatePaths: resolved.candidatePaths || [specifier],
            category: 'frontend_internal',
            severity: 'HIGH',
            message: msg
          });
        }
      } else {
        if (declaredFrontendPackages.size > 0 && options.strictExternal) {
          const pkgName = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0];

          if (!declaredFrontendPackages.has(pkgName.toLowerCase()) && !pkgName.startsWith('node:')) {
            const msg = `Import closure failure in '${filePath}' line ${lineIdx}: frontend package '${pkgName}' is imported but not listed in package.json.`;
            errors.push(msg);
            defects.push({
              code: DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE,
              file: filePath,
              line: lineIdx,
              package: pkgName,
              category: 'frontend_external',
              severity: 'MEDIUM',
              message: msg
            });
          }
        }
      }
    }
  });

  return {
    isValid: defects.length === 0,
    errors,
    defects,
    summary: {
      backendFilesChecked: pyFiles.length,
      frontendFilesChecked: frontendFiles.length,
      totalDefects: defects.length
    }
  };
}
