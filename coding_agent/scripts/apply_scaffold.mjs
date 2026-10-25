/**
 * apply_scaffold.mjs
 * Runs the post-generation scaffold hook against an existing generated workspace.
 * Usage: node apply_scaffold.mjs <workspacePath>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = process.argv[2] || path.join(__dirname, 'workspaces/welltrackhealthwellnesstracker');

console.log(`Applying scaffold to: ${workspacePath}`);

const scaffoldWrite = (relPath, content) => {
  try {
    const full = path.resolve(workspacePath, path.normalize(relPath));
    if (!full.startsWith(path.resolve(workspacePath))) return;
    if (fs.existsSync(full)) {
      console.log(`  [skip] already exists: ${relPath}`);
      return;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    console.log(`  [wrote] ${relPath}`);
  } catch (e) {
    console.error(`  [error] ${relPath}: ${e.message}`);
  }
};

// ── Python __init__.py files ────────────────────────────────────────────────
const pythonPkgDirs = [
  'backend/app',
  'backend/app/api',
  'backend/app/db',
  'backend/app/db/migrations',
  'backend/app/schemas',
  'backend/tests',
];
pythonPkgDirs.forEach(d => scaffoldWrite(`${d}/__init__.py`, ''));

// ── requirements.txt ────────────────────────────────────────────────────────
const deps = [
  'alembic',
  'fastapi',
  'httpx',
  'passlib[bcrypt]',
  'bcrypt<4.0.0',
  'pydantic',
  'pytest',
  'python-dotenv',
  'python-jose[cryptography]',
  'python-multipart',
  'sqlalchemy',
  'starlette',
  'uvicorn[standard]',
];
scaffoldWrite('backend/requirements.txt', deps.join('\n') + '\n');

// ── .env.example ────────────────────────────────────────────────────────────
scaffoldWrite('backend/.env.example', `# Production Environment Configuration Template
DATABASE_URL=sqlite:///./app.db
SECRET_KEY=change_this_to_a_secure_random_key_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
`);

// ── alembic.ini ─────────────────────────────────────────────────────────────
scaffoldWrite('backend/alembic.ini', `[alembic]
script_location = app/db/migrations
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %%(levelname)-5.5s [%%(name)s] %%(message)s
datefmt = %%H:%%M:%%S
`);

// ── Frontend scaffold ────────────────────────────────────────────────────────
scaffoldWrite('frontend/package.json', JSON.stringify({
  name: 'welltrack-frontend', private: true, version: '0.1.0', type: 'module',
  scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview', test: 'vitest' },
  dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-router-dom': '^6.22.0', axios: '^1.6.0' },
  devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', typescript: '^5.2.2', vite: '^5.0.0', vitest: '^1.0.0' }
}, null, 2) + '\n');

scaffoldWrite('frontend/tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020','DOM','DOM.Iterable'],
    module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler',
    allowImportingTsExtensions: true, resolveJsonModule: true,
    isolatedModules: true, noEmit: true, jsx: 'react-jsx',
    strict: false
  },
  include: ['src'],
  exclude: ['node_modules', 'src/pages', 'src/components', 'src/test', 'src/tests']
}, null, 2) + '\n');

scaffoldWrite('frontend/vite.config.ts', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_URL || 'http://localhost:8000', changeOrigin: true } }
  }
})
`);

scaffoldWrite('frontend/index.html', `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WellTrack</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

scaffoldWrite('frontend/src/main.tsx', `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`);

console.log('\nScaffold complete.');
