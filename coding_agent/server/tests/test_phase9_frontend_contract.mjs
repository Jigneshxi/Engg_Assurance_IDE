/**
 * Phase 9: Frontend Contract Gate Test Suite
 * 
 * Verifies:
 * 1. Every imported component exists.
 * 2. Every import path matches actual filename (case sensitivity).
 * 3. Every router target exists (routes map to real components).
 * 4. Every API endpoint used by frontend exists in backend routes/manifest.
 * 5. Every required dependency exists in package.json.
 * 6. TypeScript passes (static syntax/types check & tsc).
 * 7. Production build passes (entry point, config, npm run build readiness).
 * 8. Required environment configuration exists (.env / .env.example).
 * 9. Composite validateFrontendContract gate enforcement.
 * 10. Repair engine FrontendContractRepairStrategy mapping.
 */

import assert from 'assert';
import {
  FRONTEND_DEFECT_CODES,
  validateComponentImportsAndCasing,
  validateRouterTargets,
  validateFrontendApiEndpoints,
  validateFrontendDependencies,
  validateTypeScriptContract,
  validateProductionBuildContract,
  validateEnvironmentConfig,
  validateFrontendContract
} from '../frontendContractValidator.js';
import {
  DATABASE_DEFECT_CODES
} from '../dbValidator.js';
import {
  getRepairStrategy
} from '../repairEngine.js';

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(err);
    failedTests++;
  }
}

console.log('🧪 Starting Phase 9: Frontend Contract Gate Test Suite...\n');

// ── Test 1: Component Imports Contract ───────────────────────────────────────
await runTest('Test 1: Every imported component must exist; missing components caught', async () => {
  const validFiles = [
    {
      path: 'frontend/src/App.tsx',
      content: `import React from 'react';\nimport Header from './components/Header';\nexport default function App() { return <Header />; }`
    },
    {
      path: 'frontend/src/components/Header.tsx',
      content: `import React from 'react';\nexport default function Header() { return <header>App Header</header>; }`
    }
  ];

  const validRes = validateComponentImportsAndCasing(validFiles);
  assert.strictEqual(validRes.defects.length, 0, 'Valid component import should produce 0 defects');

  const invalidFiles = [
    {
      path: 'frontend/src/App.tsx',
      content: `import React from 'react';\nimport Sidebar from './components/Sidebar';\nexport default function App() { return <Sidebar />; }`
    }
  ];

  const invalidRes = validateComponentImportsAndCasing(invalidFiles);
  assert.strictEqual(invalidRes.defects.length, 1, 'Missing component import must produce 1 defect');
  assert.ok(invalidRes.defects[0].code === FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE || invalidRes.defects[0].code === 'MISSING_FRONTEND_IMPORT');
  assert.strictEqual(invalidRes.defects[0].subtype, 'COMPONENT_NOT_FOUND');
  assert.strictEqual(invalidRes.defects[0].specifier, './components/Sidebar');
});

// ── Test 2: Case-Sensitive Import Path Matching ──────────────────────────────
await runTest('Test 2: Import path casing must match actual filename exactly', async () => {
  const mismatchedCasingFiles = [
    {
      path: 'frontend/src/App.tsx',
      content: `import React from 'react';\nimport Nav from './components/nav';\nexport default function App() { return <Nav />; }`
    },
    {
      path: 'frontend/src/components/Nav.tsx',
      content: `import React from 'react';\nexport default function Nav() { return <nav>Navigation</nav>; }`
    }
  ];

  const res = validateComponentImportsAndCasing(mismatchedCasingFiles);
  assert.strictEqual(res.defects.length, 1, 'Casing mismatch must be flagged');
  assert.strictEqual(res.defects[0].code, FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE);
  assert.strictEqual(res.defects[0].subtype, 'IMPORT_CASING_MISMATCH');
  assert.strictEqual(res.defects[0].actualPath, 'frontend/src/components/Nav.tsx');
});

// ── Test 3: Router Targets Validation ────────────────────────────────────────
await runTest('Test 3: Every router target exists; un-imported route elements flagged', async () => {
  const validRouterFiles = [
    {
      path: 'frontend/src/App.tsx',
      content: `
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
`
    },
    {
      path: 'frontend/src/pages/HomePage.tsx',
      content: `export default function HomePage() { return <div>Home</div>; }`
    }
  ];

  const validRes = validateRouterTargets(validRouterFiles);
  assert.strictEqual(validRes.defects.length, 0, 'Valid router target should produce 0 defects');

  // Case with unimported component in route
  const missingTargetFiles = [
    {
      path: 'frontend/src/App.tsx',
      content: `
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/metrics" element={<MetricsDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
`
    }
  ];

  const missingRes = validateRouterTargets(missingTargetFiles);
  assert.strictEqual(missingRes.defects.length, 1, 'Route referencing undefined/unimported component must fail');
  assert.strictEqual(missingRes.defects[0].code, FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE);
  assert.strictEqual(missingRes.defects[0].subtype, 'ROUTER_TARGET_MISSING');
  assert.strictEqual(missingRes.defects[0].targetComponent, 'MetricsDashboard');
});

// ── Test 4: Frontend API Endpoints Alignment ─────────────────────────────────
await runTest('Test 4: Frontend API calls must match backend endpoints; mismatches flagged', async () => {
  const backendFile = {
    path: 'backend/app/api/metrics.py',
    content: `
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/v1/metrics")
def get_metrics():
    return {"status": "ok"}

@router.post("/api/v1/entries")
def create_entry():
    return {"created": True}

@router.get("/api/v1/entries/{entry_id}")
def get_entry(entry_id: str):
    return {"entry_id": entry_id}
`
  };

  const validFrontendFile = {
    path: 'frontend/src/api.ts',
    content: `
import axios from 'axios';
export const fetchMetrics = () => axios.get('/api/v1/metrics');
export const addEntry = (data: any) => axios.post('/api/v1/entries', data);
export const getEntry = (id: string) => axios.get(\`/api/v1/entries/\${id}\`);
`
  };

  const validRes = validateFrontendApiEndpoints([backendFile, validFrontendFile]);
  assert.strictEqual(validRes.defects.length, 0, 'Valid aligned API calls must produce 0 defects');

  // Frontend calling non-existent endpoint or wrong method
  const invalidFrontendFile = {
    path: 'frontend/src/api.ts',
    content: `
import axios from 'axios';
export const deleteEntry = (id: string) => axios.delete(\`/api/v1/entries/\${id}\`);
export const getGhost = () => axios.get('/api/v1/ghost_resource');
`
  };

  const invalidRes = validateFrontendApiEndpoints([backendFile, invalidFrontendFile]);
  assert.strictEqual(invalidRes.defects.length, 2, 'Unmatched API calls must produce 2 defects');
  assert.strictEqual(invalidRes.defects[0].code, FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE);
  assert.strictEqual(invalidRes.defects[0].subtype, 'API_ENDPOINT_MISMATCH');
  assert.strictEqual(invalidRes.defects[0].method, 'DELETE');
  assert.strictEqual(invalidRes.defects[1].subtype, 'API_ENDPOINT_MISMATCH');
  assert.strictEqual(invalidRes.defects[1].endpoint, '/api/v1/ghost_resource');
});

// ── Test 5: Frontend Required Dependencies ───────────────────────────────────
await runTest('Test 5: Imported 3rd party packages must exist in package.json', async () => {
  const packageJson = {
    path: 'frontend/package.json',
    content: JSON.stringify({
      name: 'frontend-app',
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
        'react-router-dom': '^6.10.0'
      }
    })
  };

  const frontendCode = {
    path: 'frontend/src/components/Chart.tsx',
    content: `
import React from 'react';
import { BarChart } from 'recharts';
import { Sparkles } from 'lucide-react';
export default function Chart() { return <div />; }
`
  };

  const res = validateFrontendDependencies([packageJson, frontendCode]);
  assert.strictEqual(res.defects.length, 2, 'Missing recharts and lucide-react must produce 2 defects');
  assert.ok(res.defects[0].code === FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE || res.defects[0].code === 'UNDECLARED_PACKAGE_IMPORT');
  assert.strictEqual(res.defects[0].subtype, 'DEPENDENCY_MISSING');
  const missingPkgs = res.defects.map(d => d.package);
  assert.ok(missingPkgs.includes('recharts'));
  assert.ok(missingPkgs.includes('lucide-react'));
});

// ── Test 6: TypeScript Contract ──────────────────────────────────────────────
await runTest('Test 6: TypeScript balanced syntax validation flags broken TS/TSX', async () => {
  const validTs = {
    path: 'frontend/src/types.ts',
    content: `export interface Config { timeout: number; debug: boolean; }`
  };

  const validRes = await validateTypeScriptContract([validTs]);
  assert.strictEqual(validRes.defects.length, 0, 'Clean TypeScript file should pass');

  const brokenTs = {
    path: 'frontend/src/Broken.tsx',
    content: `export function Broken() { return <div><span>Unclosed; }`
  };

  const brokenRes = await validateTypeScriptContract([brokenTs]);
  assert.strictEqual(brokenRes.defects.length, 1, 'Unbalanced TSX syntax must produce defect');
  assert.strictEqual(brokenRes.defects[0].code, FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE);
  assert.strictEqual(brokenRes.defects[0].subtype, 'TYPESCRIPT_CHECK_FAILED');
});

// ── Test 7: Production Build Readiness ───────────────────────────────────────
await runTest('Test 7: Missing index.html or root entry point fails build contract', async () => {
  const filesWithoutIndex = [
    {
      path: 'frontend/src/main.tsx',
      content: `import React from 'react';`
    }
  ];

  const res1 = await validateProductionBuildContract(filesWithoutIndex);
  assert.strictEqual(res1.defects.length, 1, 'Missing index.html must be caught');
  assert.strictEqual(res1.defects[0].subtype, 'PRODUCTION_BUILD_FAILED');

  const filesComplete = [
    { path: 'frontend/index.html', content: `<!DOCTYPE html><html><body><div id="root"></div></body></html>` },
    { path: 'frontend/src/main.tsx', content: `import React from 'react';` }
  ];

  const res2 = await validateProductionBuildContract(filesComplete);
  assert.strictEqual(res2.defects.length, 0, 'Complete entry files must pass build readiness');
});

// ── Test 8: Required Environment Configuration ───────────────────────────────
await runTest('Test 8: Frontend accessing env vars without .env definition fails contract', async () => {
  const filesWithoutEnv = [
    {
      path: 'frontend/src/api.ts',
      content: `const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';`
    }
  ];

  const res1 = validateEnvironmentConfig(filesWithoutEnv);
  assert.strictEqual(res1.defects.length, 1, 'Missing .env/.env.example must be caught');
  assert.strictEqual(res1.defects[0].subtype, 'ENV_CONFIG_MISSING');

  const filesWithEnv = [
    {
      path: 'frontend/src/api.ts',
      content: `const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';`
    },
    {
      path: 'frontend/.env.example',
      content: `VITE_API_URL=http://localhost:8000\n`
    }
  ];

  const res2 = validateEnvironmentConfig(filesWithEnv);
  assert.strictEqual(res2.defects.length, 0, 'Configured env vars must pass');
});

// ── Test 9: Composite validateFrontendContract Gate ──────────────────────────
await runTest('Test 9: Composite gate passes valid project and blocks invalid project', async () => {
  const completeProject = [
    {
      path: 'frontend/package.json',
      content: JSON.stringify({
        name: 'app',
        dependencies: { 'react': '^18.0.0', 'react-dom': '^18.0.0', 'react-router-dom': '^6.0.0', 'axios': '^1.0.0' }
      })
    },
    {
      path: 'frontend/index.html',
      content: `<!DOCTYPE html><html><body><div id="root"></div></body></html>`
    },
    {
      path: 'frontend/src/main.tsx',
      content: `import React from 'react';\nimport App from './App';\nexport function run() {}`
    },
    {
      path: 'frontend/src/App.tsx',
      content: `
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
`
    },
    {
      path: 'frontend/src/pages/Home.tsx',
      content: `
import React from 'react';
import axios from 'axios';
export default function Home() {
  const load = () => axios.get('/api/health');
  return <div>Home</div>;
}
`
    },
    {
      path: 'frontend/.env.example',
      content: `VITE_API_URL=http://localhost:8000`
    },
    {
      path: 'backend/main.py',
      content: `
from fastapi import FastAPI
app = FastAPI()
@app.get("/api/health")
def health():
    return {"status": "ok"}
`
    },
    {
      path: 'frontend/vite.config.ts',
      content: 'export default {}'
    },
    {
      path: 'frontend/tsconfig.json',
      content: '{}'
    },
    {
      path: 'frontend/src/pages/LoginPage.tsx',
      content: 'import React from "react";\nexport function LoginPage() { return <form><input /><button>Login</button></form>; }'
    },
    {
      path: 'frontend/src/pages/RegisterPage.tsx',
      content: 'import React from "react";\nexport function RegisterPage() { return <form><input /><button>Register</button></form>; }'
    }
  ];

  const result = await validateFrontendContract(completeProject);
  assert.strictEqual(result.isValid, true, 'Coherent project must pass frontend contract gate');
  assert.strictEqual(result.defects.length, 0);

  // Now introduce a defect: add missing component reference
  const failingProject = [
    ...completeProject,
    {
      path: 'frontend/src/components/Broken.tsx',
      content: `import NonExistent from './NonExistent';`
    }
  ];

  const failingResult = await validateFrontendContract(failingProject);
  assert.strictEqual(failingResult.isValid, false, 'Project with missing component must fail gate');
  assert.ok(failingResult.defects[0].code === FRONTEND_DEFECT_CODES.FRONTEND_BUILD_FAILURE || failingResult.defects[0].code === 'MISSING_FRONTEND_IMPORT');
});

// ── Test 10: Repair Strategy & Defect Code Invariant ──────────────────────────
await runTest('Test 10: Repair Engine maps FrontendContractRepairStrategy and defect codes', async () => {
  assert.strictEqual(DATABASE_DEFECT_CODES.FRONTEND_BUILD_FAILURE, 'FRONTEND_BUILD_FAILURE');
  
  const strategy = getRepairStrategy(DATABASE_DEFECT_CODES.FRONTEND_BUILD_FAILURE);
  assert.ok(strategy, 'Repair strategy must exist for FRONTEND_BUILD_FAILURE');
  assert.strictEqual(strategy.name, 'FrontendContractRepairStrategy');
  assert.ok(Array.isArray(strategy.instructions));
  assert.ok(strategy.instructions.length >= 5);
  assert.ok(Array.isArray(strategy.forbidden));
  assert.ok(strategy.forbidden.length >= 2);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n==================================================`);
console.log(`Phase 9 Frontend Contract Test Suite Completed`);
console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`==================================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
