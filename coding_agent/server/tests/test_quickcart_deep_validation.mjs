/**
 * QuickCart Generated-Code Deep Validation Regression Tests
 *
 * Verifies generic platform fixes proven by the QuickCart deep validation:
 * 1. writeWorkspaceAndScaffolds never synthesizes dummy stub components for missing imports.
 * 2. writeWorkspaceAndScaffolds never produces cascading schema alias loops (e.g. addre.py from address.py).
 * 3. writeWorkspaceAndScaffolds never generates redundant nested src/src/App.tsx.
 * 4. frontendContractValidator rejects router targets and imported components that are placeholder stubs.
 * 5. prdCoverageValidator rejects placeholder stubs as valid implementation evidence.
 * 6. prdCoverageValidator strictly fails requirements specifying API endpoints when no route handler is implemented in backend files.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  writeWorkspaceAndScaffolds,
  findLastStableSyntacticBoundary,
  reconcileFileCompleteness,
  evaluateFinalCompletionGate
} from '../orchestrator.js';

import {
  validateManifestRequirementCoverage,
  MANIFEST_ERROR_CODES
} from '../manifestValidator.js';

import {
  validateRouterTargets,
  validateComponentImportsAndCasing,
  isPlaceholderStubComponent
} from '../frontendContractValidator.js';

import {
  validatePrdCoverage,
  isPlaceholderStub,
  inspectFileForRequirementSignals,
  PRD_COVERAGE_DEFECT_CODES,
  REQUIREMENT_STATUS
} from '../prdCoverageValidator.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('🧪 Starting QuickCart Deep Validation Regression Suite...\n');

// ── Test 1: writeWorkspaceAndScaffolds never synthesizes dummy stub components ──
await test('Test 1: writeWorkspaceAndScaffolds never synthesizes dummy stub components for missing imports', async () => {
  const tempDir = path.join(os.tmpdir(), 'qc_test_stub_gen_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const allFiles = [
      {
        path: 'frontend/src/App.tsx',
        content: `
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AddressesPage from './AddressesPage';
import CartPage from './CartPage';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/addresses" element={<AddressesPage />} />
        <Route path="/cart" element={<CartPage />} />
      </Routes>
    </BrowserRouter>
  );
}
`,
        status: 'validated'
      }
    ];

    writeWorkspaceAndScaffolds(tempDir, allFiles, { project_id: 'TestApp' }, () => {});

    // Must NOT synthesize AddressesPage.tsx or CartPage.tsx as fake validated files
    const addressesDisk = path.join(tempDir, 'frontend/src/AddressesPage.tsx');
    const cartDisk = path.join(tempDir, 'frontend/src/CartPage.tsx');
    assert.strictEqual(fs.existsSync(addressesDisk), false, 'Must not synthesize AddressesPage.tsx placeholder');
    assert.strictEqual(fs.existsSync(cartDisk), false, 'Must not synthesize CartPage.tsx placeholder');

    const createdInAllFiles = allFiles.filter(f => f.path.includes('AddressesPage') || f.path.includes('CartPage'));
    assert.strictEqual(createdInAllFiles.length, 0, 'Must not register synthesized stub files in allFiles');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── Test 2: Schema alias loop prevention ──
await test('Test 2: Schema alias loop prevented (no addre.py or addres.py from address.py)', async () => {
  const tempDir = path.join(os.tmpdir(), 'qc_test_schema_loop_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const allFiles = [
      {
        path: 'backend/app/schemas/address.py',
        content: `from pydantic import BaseModel\nclass Address(BaseModel): id: int\n`,
        status: 'validated'
      },
      {
        path: 'backend/main.py',
        content: `from app.schemas.address import Address\n`,
        status: 'validated'
      }
    ];

    writeWorkspaceAndScaffolds(tempDir, allFiles, { architectureContract: { language: 'python' } }, () => {});

    // Must NOT synthesize addre.py or addres.py
    const addreDisk = path.join(tempDir, 'backend/app/schemas/addre.py');
    const addresDisk = path.join(tempDir, 'backend/app/schemas/addres.py');
    assert.strictEqual(fs.existsSync(addreDisk), false, 'addre.py must not exist');
    assert.strictEqual(fs.existsSync(addresDisk), false, 'addres.py must not exist');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── Test 3: No redundant src/src/App.tsx scaffold ──
await test('Test 3: writeWorkspaceAndScaffolds never emits nested frontend/src/src/App.tsx', async () => {
  const tempDir = path.join(os.tmpdir(), 'qc_test_nested_app_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const allFiles = [
      { path: 'frontend/src/App.tsx', content: 'export default function App() { return null; }', status: 'validated' }
    ];

    writeWorkspaceAndScaffolds(tempDir, allFiles, { project_id: 'TestApp' }, () => {});

    const nestedAppDisk = path.join(tempDir, 'frontend/src/src/App.tsx');
    assert.strictEqual(fs.existsSync(nestedAppDisk), false, 'frontend/src/src/App.tsx must not exist');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── Test 4: Frontend Contract Validator detects placeholder stub components in routes ──
await test('Test 4: frontendContractValidator rejects router targets that are placeholder stubs', async () => {
  const stubContent = `
import React from 'react';
const WishlistPage: React.FC = () => (
  <div className="wishlistpage-page">
    <h2>WishlistPage</h2>
  </div>
);
export default WishlistPage;
`;

  assert.strictEqual(isPlaceholderStubComponent(stubContent, 'WishlistPage'), true, 'Must classify stub as placeholder');

  const files = [
    {
      path: 'frontend/src/App.tsx',
      content: `
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WishlistPage from './WishlistPage';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/wishlist" element={<WishlistPage />} />
      </Routes>
    </BrowserRouter>
  );
}
`
    },
    {
      path: 'frontend/src/WishlistPage.tsx',
      content: stubContent
    }
  ];

  const routerRes = validateRouterTargets(files);
  assert.strictEqual(routerRes.defects.length, 1, 'Stub router target must be flagged');
  assert.strictEqual(routerRes.defects[0].subtype, 'PLACEHOLDER_STUB_COMPONENT');

  const compRes = validateComponentImportsAndCasing(files);
  assert.strictEqual(compRes.defects.length, 1, 'Imported stub component must be flagged');
  assert.strictEqual(compRes.defects[0].subtype, 'PLACEHOLDER_STUB_COMPONENT');
});

// ── Test 5: PRD Coverage Validator rejects placeholder stubs as implementation evidence ──
await test('Test 5: prdCoverageValidator rejects placeholder stubs from satisfying requirements', async () => {
  const stubFile = {
    path: 'frontend/src/AddressesPage.tsx',
    content: `
import React from 'react';
const AddressesPage: React.FC = () => (
  <div className="addressespage-page">
    <h2>AddressesPage</h2>
  </div>
);
export default AddressesPage;
`
  };

  assert.strictEqual(isPlaceholderStub(stubFile), true, 'Stub file must be identified as placeholder');

  const req = { id: 'REQ-ADDR-01', description: 'Address management for shipping and billing' };
  const sig = inspectFileForRequirementSignals(stubFile, req);
  assert.strictEqual(sig.matches, false, 'Placeholder stub must produce 0 requirement signals');

  const context = {
    requirementContract: { requirements: [req] },
    manifest: {
      requirement_mappings: [
        { id: 'REQ-ADDR-01', status: 'SUPPORTED', files: ['frontend/src/AddressesPage.tsx'] }
      ]
    },
    generatedFiles: [stubFile]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Coverage gate must fail when mapped files are only stubs');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.classifications[0].status, REQUIREMENT_STATUS.MISSING);
});

// ── Test 6: PRD Coverage Validator enforces backend route definition for API requirements ──
await test('Test 6: prdCoverageValidator fails requirements specifying API endpoints when route handlers are missing', async () => {
  const reviewReq = {
    id: 'REQ-REV-01',
    description: 'Product Reviews & Ratings: POST /api/reviews and GET /api/reviews/{product_id}',
    type: 'backend'
  };

  // Backend has database models for Review, but ZERO route handlers in API routers
  const context = {
    requirementContract: { requirements: [reviewReq] },
    manifest: {
      requirement_mappings: [
        { id: 'REQ-REV-01', status: 'SUPPORTED', files: ['backend/app/db/models.py'] }
      ]
    },
    generatedFiles: [
      {
        path: 'backend/app/db/models.py',
        content: `
class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True)
    rating = Column(Integer)
`
      },
      {
        path: 'backend/app/api/products.py',
        content: `
from fastapi import APIRouter
router = APIRouter()
@router.get("/api/products")
def list_products():
    return []
`
      }
    ]
  };

  const res = await validatePrdCoverage(context);
  assert.strictEqual(res.isValid, false, 'Missing API endpoint route handler must fail PRD coverage');
  assert.strictEqual(res.defects.length, 1);
  assert.strictEqual(res.defects[0].subtype, PRD_COVERAGE_DEFECT_CODES.PRD_REQUIREMENT_MISSING);
  assert.ok(res.defects[0].message.includes('POST /api/reviews'), 'Defect message must specify missing endpoint');
});

// ── Test 7: Missing secondary feature decomposition fails manifest gate ──
await test('Test 7: Missing secondary feature decomposition fails manifest gate with MANIFEST_INCOMPLETE', async () => {
  const reqContract = {
    requirements: [
      { id: 'REQ-REV-01', description: 'Product reviews and customer rating workflows', type: 'feature' }
    ]
  };

  const manifest = {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Core',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/main.py' }, { path: 'backend/app/api/auth.py' }]
      }
    ],
    requirement_mappings: [
      {
        id: 'REQ-REV-01',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/main.py'],
        implementation_responsibility: 'Handles product reviews',
        validation_responsibility: 'Tested via api'
      }
    ]
  };

  const res = validateManifestRequirementCoverage(manifest, reqContract);
  assert.strictEqual(res.isValid, false, 'Manifest gate must fail when secondary domain is omitted from modules');
  assert.strictEqual(res.code, MANIFEST_ERROR_CODES.MANIFEST_INCOMPLETE);
  assert.ok(res.errors.some(e => e.includes('review') && e.includes('omitted from module decomposition')));
});

// ── Test 8: Model/database-only mapping fails API requirement in manifest validation ──
await test('Test 8: Model/database-only mapping fails API requirement in manifest validation', async () => {
  const reqContract = {
    requirements: [
      { id: 'REQ-ORD-01', description: 'Order checkout and creation API endpoint', type: 'backend' }
    ]
  };

  const manifest = {
    modules: [
      {
        id: 'MOD-000',
        name: 'Database Layer',
        layer: 'DATABASE',
        required_files: [{ path: 'backend/app/db/models.py' }, { path: 'backend/app/db/database.py' }]
      }
    ],
    requirement_mappings: [
      {
        id: 'REQ-ORD-01',
        status: 'SUPPORTED',
        module: 'MOD-000',
        files: ['backend/app/db/models.py', 'backend/app/db/database.py'],
        implementation_responsibility: 'Declares order models',
        validation_responsibility: 'Verified by models test'
      }
    ]
  };

  const res = validateManifestRequirementCoverage(manifest, reqContract);
  assert.strictEqual(res.isValid, false, 'API requirement mapped only to DB/model files must fail');
  assert.ok(res.errors.some(e => e.includes('API/backend obligation') && e.includes('Model/database-only mapping cannot satisfy an API requirement')));
});

// ── Test 9: Backend-only mapping fails UI requirement in manifest validation ──
await test('Test 9: Backend-only mapping fails UI requirement in manifest validation', async () => {
  const reqContract = {
    requirements: [
      { id: 'REQ-UI-01', description: 'Customer checkout and cart summary page', type: 'frontend' }
    ]
  };

  const manifest = {
    modules: [
      {
        id: 'MOD-001',
        name: 'Backend Core',
        layer: 'BACKEND',
        required_files: [{ path: 'backend/main.py' }]
      }
    ],
    requirement_mappings: [
      {
        id: 'REQ-UI-01',
        status: 'SUPPORTED',
        module: 'MOD-001',
        files: ['backend/main.py'],
        implementation_responsibility: 'Provides checkout UI endpoints',
        validation_responsibility: 'Verified by test'
      }
    ]
  };

  const res = validateManifestRequirementCoverage(manifest, reqContract);
  assert.strictEqual(res.isValid, false, 'UI requirement mapped without frontend file must fail');
  assert.ok(res.errors.some(e => e.includes('UI/frontend obligation') && e.includes('Model/database-only mapping cannot satisfy a UI requirement')));
});

// ── Test 10: Tiny rollback rejection in findLastStableSyntacticBoundary ──
await test('Test 10: findLastStableSyntacticBoundary rejects tiny fragments and interface-only preambles', async () => {
  const tinyInterfacePreamble = `
import React, { useState } from 'react';
import axios from 'axios';

interface AdminProductManagementProps {
  productId: string;
}
`;

  const { rolledBack } = findLastStableSyntacticBoundary(tinyInterfacePreamble, 'frontend/src/AdminProductManagement.tsx');
  // It must NOT accept rolling back to this tiny preamble fragment
  assert.strictEqual(rolledBack, false, 'Must not accept boundary rollback for tiny interface-only fragment without component body');
});

// ── Test 11: Generated-file ledger reconciles planned required files without scaffold inflation ──
await test('Test 11: reconcileFileCompleteness audits against planned required files without scaffold inflation', async () => {
  const allFiles = [
    { path: 'backend/main.py', status: 'validated', content: 'app = FastAPI()' },
    { path: 'backend/app/db/models.py', status: 'validated', content: 'class Item(Base): pass' },
    { path: 'frontend/src/App.tsx', status: 'validated', content: 'export default function App() { return <div/>; }' },
    // Auxiliary scaffolds
    { path: 'backend/requirements.txt', status: 'validated', isScaffold: true, content: 'fastapi\nuvicorn\n' },
    { path: 'frontend/package.json', status: 'validated', isScaffold: true, content: '{"name":"app"}' },
    { path: 'frontend/tsconfig.json', status: 'validated', isScaffold: true, content: '{"compilerOptions":{}}' },
    { path: 'frontend/vite.config.ts', status: 'validated', isScaffold: true, content: 'export default {}' }
  ];

  const rec = reconcileFileCompleteness(allFiles);
  assert.strictEqual(rec.requiredFiles, 3, 'Authoritative required count must equal planned files (3), not 7');
  assert.strictEqual(rec.generatedFiles, 3, 'Authoritative generated count must equal planned files (3), not 7');
  assert.strictEqual(rec.validatedFiles, 3, 'Authoritative validated count must equal planned files (3), not 7');
  assert.strictEqual(rec.isPassed, true, 'File completeness reconciliation must pass cleanly');
});

// ── Test 12: Final Gate enforces fail-closed chaining ──
await test('Test 12: evaluateFinalCompletionGate fails closed when any technical gate fails', async () => {
  const gateResult = evaluateFinalCompletionGate({
    allModulesPassed: true,
    semanticValid: true,
    fileCompletenessPassed: true,
    importClosurePassed: false, // Technical gate failed
    frontendContractPassed: true,
    backendRuntimePassed: true,
    apiAuthzPassed: true,
    prdCoveragePassed: true
  });

  assert.strictEqual(gateResult.isPassed, false, 'Final completion gate must fail when import closure fails');
  assert.ok(gateResult.failedGates.includes('importClosure'), 'Failed gates must identify import closure');
});

console.log(`\n==================================================`);
console.log(`QuickCart Deep Validation Test Results: ${passed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
}
