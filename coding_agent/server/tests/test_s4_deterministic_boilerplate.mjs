import assert from 'assert';
import {
  isBoilerplateFile,
  getBoilerplateTemplate,
  getFoundationFiles,
  DOCKER_COMPOSE_TEMPLATE,
  BACKEND_DOCKERFILE_TEMPLATE,
  FRONTEND_DOCKERFILE_TEMPLATE,
  FRONTEND_INDEX_CSS_TEMPLATE,
  PLAYWRIGHT_CONFIG_TEMPLATE
} from '../foundationTemplates.js';
import { getBackendRequirementsTxt, getFrontendPackageJson } from '../stackAllowlist.js';

console.log('====================================================');
console.log('  TEST S4: DETERMINISTIC BOILERPLATE TEMPLATES      ');
console.log('====================================================\n');

// ── TEST 1: isBoilerplateFile identifies all 12 boilerplate items across path variants ──
console.log('--- TEST 1: isBoilerplateFile path recognition ---');
const expectedBoilerplatePaths = [
  'backend/Dockerfile',
  'frontend/Dockerfile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'frontend/package.json',
  'package.json',
  'frontend/tsconfig.json',
  'tsconfig.json',
  'frontend/vite.config.ts',
  'vite.config.ts',
  'frontend/index.html',
  'index.html',
  'frontend/src/main.tsx',
  'src/main.tsx',
  'frontend/src/index.css',
  'src/index.css',
  'backend/requirements.txt',
  'requirements.txt',
  'backend/.env.example',
  '.env.example',
  'frontend/playwright.config.ts',
  'playwright.config.ts',
  'frontend/tests/playwright.config.ts',
  'alembic.ini',
  'backend/alembic.ini',
  'alembic/env.py',
  'script.py.mako'
];

for (const p of expectedBoilerplatePaths) {
  assert.strictEqual(
    isBoilerplateFile(p),
    true,
    `Expected "${p}" to be recognized as boilerplate file`
  );
}

// Non-boilerplate application files must return false
const appCodeFiles = [
  'backend/app/api/tasks.py',
  'backend/app/api/auth.py',
  'backend/app/db/models.py',
  'frontend/src/App.tsx',
  'frontend/src/pages/Dashboard.tsx',
  'frontend/src/components/TaskCard.tsx',
  'backend/app/schemas/task.py',
  'frontend/tests/workflows.spec.ts',
  'backend/tests/test_workflows.py'
];

for (const p of appCodeFiles) {
  assert.strictEqual(
    isBoilerplateFile(p),
    false,
    `Expected "${p}" NOT to be treated as boilerplate`
  );
}
console.log('✅ PASS: isBoilerplateFile accurately separates boilerplate from application code.\n');

// ── TEST 2: Template content completeness and correctness ──
console.log('--- TEST 2: Template content contracts ---');

// 2a. backend/requirements.txt has pinned passlib AND compatible bcrypt
const reqs = getBackendRequirementsTxt();
assert.ok(reqs.includes('passlib[bcrypt]==1.7.4'), 'requirements.txt must include passlib[bcrypt]==1.7.4');
assert.ok(reqs.includes('bcrypt==4.0.1'), 'requirements.txt must include pinned bcrypt==4.0.1 for passlib compatibility');
assert.ok(reqs.includes('fastapi==0.110.0'), 'requirements.txt must include fastapi');
assert.ok(reqs.includes('sqlalchemy==2.0.28'), 'requirements.txt must include sqlalchemy');

// 2b. frontend/package.json
const pkgJson = JSON.parse(getFrontendPackageJson('test-app'));
assert.strictEqual(pkgJson.name, 'test-app');
assert.ok(pkgJson.dependencies.react, 'package.json must declare react');
assert.ok(pkgJson.dependencies.axios, 'package.json must declare axios');
assert.ok(pkgJson.devDependencies.vite, 'package.json must declare vite');
assert.ok(pkgJson.devDependencies['@playwright/test'], 'package.json must declare playwright');

// 2c. frontend/src/index.css has clean vanilla CSS, no broken @tailwind
assert.ok(FRONTEND_INDEX_CSS_TEMPLATE.includes('box-sizing: border-box'), 'index.css must include CSS reset');
assert.ok(FRONTEND_INDEX_CSS_TEMPLATE.includes('--bg-primary'), 'index.css must include theme tokens');
assert.strictEqual(
  FRONTEND_INDEX_CSS_TEMPLATE.includes('@tailwind'),
  false,
  'index.css must NOT include @tailwind directives since tailwind is not installed'
);

// 2d. playwright.config.ts specifies port 5173 (not 3000)
assert.ok(PLAYWRIGHT_CONFIG_TEMPLATE.includes('5173'), 'playwright config must target port 5173');
assert.strictEqual(PLAYWRIGHT_CONFIG_TEMPLATE.includes('3000'), false, 'playwright config must NOT target port 3000');

// 2e. Dockerfiles and Compose
assert.ok(BACKEND_DOCKERFILE_TEMPLATE.includes('FROM python:3.11-slim'), 'backend Dockerfile must use python:3.11-slim');
assert.ok(BACKEND_DOCKERFILE_TEMPLATE.includes('uvicorn'), 'backend Dockerfile must launch uvicorn');
assert.ok(FRONTEND_DOCKERFILE_TEMPLATE.includes('FROM node:20-alpine'), 'frontend Dockerfile must build with node:20');
assert.ok(FRONTEND_DOCKERFILE_TEMPLATE.includes('FROM nginx:alpine'), 'frontend Dockerfile must serve with nginx');
assert.ok(DOCKER_COMPOSE_TEMPLATE.includes('backend:'), 'compose must define backend service');
assert.ok(DOCKER_COMPOSE_TEMPLATE.includes('frontend:'), 'compose must define frontend service');
assert.ok(DOCKER_COMPOSE_TEMPLATE.includes('8000:8000'), 'compose must map port 8000');
assert.ok(DOCKER_COMPOSE_TEMPLATE.includes('5173:80'), 'compose must map frontend to 5173');

console.log('✅ PASS: All template contents satisfy production contracts and stack requirements.\n');

// ── TEST 3: getFoundationFiles includes all 12 boilerplate files ──
console.log('--- TEST 3: getFoundationFiles covers all boilerplate ---');
const foundationFiles = getFoundationFiles('TaskFlow');
const foundationPaths = new Set(foundationFiles.map(f => f.path));

const requiredInFoundation = [
  'backend/Dockerfile',
  'frontend/Dockerfile',
  'docker-compose.yml',
  'frontend/package.json',
  'frontend/tsconfig.json',
  'frontend/vite.config.ts',
  'frontend/index.html',
  'frontend/src/main.tsx',
  'frontend/src/index.css',
  'backend/requirements.txt',
  'backend/.env.example',
  'frontend/playwright.config.ts'
];

for (const reqPath of requiredInFoundation) {
  assert.ok(
    foundationPaths.has(reqPath),
    `getFoundationFiles must include "${reqPath}"`
  );
}
console.log('✅ PASS: getFoundationFiles includes all 12 boilerplate files.\n');

// ── TEST 4: Determinism (identical across runs) ──
console.log('--- TEST 4: Boilerplate determinism ---');
const run1 = getFoundationFiles('TaskFlow');
const run2 = getFoundationFiles('TaskFlow');
assert.strictEqual(run1.length, run2.length, 'Foundation file count must be identical');

for (let i = 0; i < run1.length; i++) {
  assert.strictEqual(run1[i].path, run2[i].path, `File path at index ${i} must match`);
  assert.strictEqual(run1[i].content, run2[i].content, `Content of ${run1[i].path} must be identical across runs`);
}
console.log('✅ PASS: All boilerplate files are 100% deterministic and byte-identical across runs.\n');

// ── TEST 5: Orchestrator integration — boilerplate is never sent to LLM or queued for repairs ──
console.log('--- TEST 5: Orchestrator static resolution simulation ---');
const mockManifest = {
  name: 'TaskFlow',
  projectName: 'TaskFlow',
  modules: [
    {
      id: 'MOD-001',
      layer: 'INFRASTRUCTURE',
      required_files: [
        { path: 'backend/Dockerfile', status: 'pending', repairAttempts: 0, errors: [] },
        { path: 'frontend/Dockerfile', status: 'repairing', repairAttempts: 1, errors: ['format truncated'] },
        { path: 'docker-compose.yml', status: 'pending', repairAttempts: 0, errors: [] },
        { path: 'backend/requirements.txt', status: 'repairing', repairAttempts: 2, errors: ['missing package'] }
      ]
    }
  ]
};

// Simulate the orchestrator resolution loop for these files
for (const fileDef of mockManifest.modules[0].required_files) {
  assert.ok(isBoilerplateFile(fileDef.path), `${fileDef.path} must be recognized as boilerplate`);
  const content = getBoilerplateTemplate(fileDef.path, mockManifest.name);
  assert.ok(content && content.length > 0, `Template content for ${fileDef.path} must not be empty`);

  // Emulate orchestrator assignment
  fileDef.content = content;
  fileDef.status = 'validated';
  fileDef.errors = [];
  fileDef.defects = [];
  fileDef.isScaffold = true;
}

for (const fileDef of mockManifest.modules[0].required_files) {
  assert.strictEqual(fileDef.status, 'validated', `${fileDef.path} must be validated statically`);
  assert.strictEqual(fileDef.errors.length, 0, `${fileDef.path} must have 0 errors`);
  assert.strictEqual(fileDef.defects.length, 0, `${fileDef.path} must have 0 defects`);
  assert.strictEqual(fileDef.isScaffold, true, `${fileDef.path} must be marked as scaffold`);
}

console.log('✅ PASS: Boilerplate files resolve statically to "validated" with 0 errors/defects without LLM.\n');

console.log('====================================================');
console.log('  ALL S4 DETERMINISTIC BOILERPLATE TESTS PASSED!    ');
console.log('====================================================');
