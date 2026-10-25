/**
 * Single source of truth for all permitted external dependencies.
 * Violations trigger UNDECLARED_PACKAGE_IMPORT defect routed to repair.
 */

export const ALLOWED_FRONTEND_DEPENDENCIES = new Set([
  'react',
  'react-dom',
  'react-router-dom',
  'axios'
]);

export const ALLOWED_FRONTEND_DEV_DEPENDENCIES = new Set([
  'vite',
  '@vitejs/plugin-react',
  'typescript',
  '@types/react',
  '@types/react-dom',
  '@types/node',
  '@playwright/test'
]);

export const ALLOWED_BACKEND_DEPENDENCIES = [
  'fastapi==0.110.0',
  'uvicorn[standard]==0.29.0',
  'sqlalchemy==2.0.28',
  'alembic==1.13.1',
  'pydantic==2.6.4',
  'email-validator==2.1.1',
  'python-jose[cryptography]==3.3.0',
  'passlib[bcrypt]==1.7.4',
  'bcrypt==4.0.1',
  'python-multipart==0.0.9',
  'python-dotenv==1.0.1',
  'httpx==0.27.0',
  'pytest==8.1.1'
];

export function getFrontendPackageJson(projectName = 'frontend') {
  return JSON.stringify({
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      test: 'playwright test'
    },
    dependencies: {
      'axios': '^1.6.8',
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.22.3'
    },
    devDependencies: {
      '@playwright/test': '^1.42.1',
      '@types/node': '^20.11.24',
      '@types/react': '^18.2.61',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
      'typescript': '^5.3.3',
      'vite': '^5.1.4'
    }
  }, null, 2) + '\n';
}

export function getBackendRequirementsTxt() {
  return ALLOWED_BACKEND_DEPENDENCIES.join('\n') + '\n';
}

/**
 * Validate imported packages in a TypeScript / JavaScript source file.
 */
export function validatePackageImports(filePath, content) {
  const defects = [];
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) {
    return defects;
  }
  if (typeof content !== 'string') return defects;

  const lines = content.split('\n');
  const importRegex = /import\s+(?:(?:(?:\{[^}]*\}|\*\s+as\s+[^,]+|[a-zA-Z0-9_$]+)\s*,?\s*)*(?:\{[^}]*\})?\s*from\s*)?['"]([^'"]+)['"]/g;

  lines.forEach((lineText, idx) => {
    let match;
    while ((match = importRegex.exec(lineText)) !== null) {
      const specifier = match[1].trim();
      // Relative or absolute internal workspace imports are handled by importClosure
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) {
        continue;
      }

      // Extract root package name (e.g. '@mui/material' -> '@mui/material' or '@mui')
      let pkgName = specifier;
      if (specifier.startsWith('@')) {
        const parts = specifier.split('/');
        pkgName = parts.slice(0, 2).join('/');
      } else {
        pkgName = specifier.split('/')[0];
      }

      if (!ALLOWED_FRONTEND_DEPENDENCIES.has(pkgName) && !ALLOWED_FRONTEND_DEV_DEPENDENCIES.has(pkgName)) {
        defects.push({
          code: 'UNDECLARED_PACKAGE_IMPORT',
          file: filePath,
          line: idx + 1,
          package: pkgName,
          specifier,
          message: `Package "${pkgName}" is not in the stack allowlist.`,
          hint: `replace with plain React/CSS and inline SVG icons. Prohibited library: ${pkgName}`
        });
      }
    }
  });

  return defects;
}
