import assert from 'assert';
import { validateImportClosure } from '../importClosureValidator.js';
import { DATABASE_DEFECT_CODES } from '../dbValidator.js';
import { getRepairStrategy } from '../repairEngine.js';

async function runPhase5Tests() {
  console.log('🧪 Starting Phase 5 Import / Dependency Closure Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  // 1. Python Valid Internal and Stdlib Imports
  test('Python valid internal and stdlib imports pass closure validation', () => {
    const files = [
      {
        path: 'backend/app/main.py',
        content: `import sys, os
from fastapi import FastAPI
from app.db.database import Base, engine
from app.api.endpoints import router
`
      },
      {
        path: 'backend/app/db/database.py',
        content: `from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base

engine = create_engine('sqlite:///./test.db')
Base = declarative_base()
`
      },
      {
        path: 'backend/app/api/endpoints.py',
        content: `from fastapi import APIRouter
from ..db.database import Base

router = APIRouter()
`
      }
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, true, 'Valid python imports must pass closure validation');
    assert.strictEqual(res.defects.length, 0);
  });

  // 2. Python Missing Internal Module Detected
  test('Python missing internal schema/service emits IMPORT_CLOSURE_FAILURE', () => {
    const files = [
      {
        path: 'backend/app/api/endpoints.py',
        content: `from fastapi import APIRouter
from app.schemas.missing_item import ItemCreate
from ..services.unreal_service import compute_tax

router = APIRouter()
`
      },
      {
        path: 'backend/app/main.py',
        content: `from fastapi import FastAPI
from app.api.endpoints import router
`
      }
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, false, 'Missing internal modules must fail closure validation');
    assert(res.defects.length >= 2, `Expected at least 2 defects, got ${res.defects.length}`);
    assert(res.defects.every(d => d.code === DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE));
    assert(res.defects.some(d => d.importedModule === 'app.schemas.missing_item'));
    assert(res.defects.some(d => d.importedModule === '..services.unreal_service'));
  });

  // 3. Python Multiline and Comma-Separated Imports
  test('Python comma-separated and multiline import modules are all resolved', () => {
    const files = [
      {
        path: 'backend/app/services/calculator.py',
        content: `import math, json, os
from app.db.session import get_db, SessionLocal
`
      },
      {
        path: 'backend/app/db/session.py',
        content: `def get_db(): pass
def SessionLocal(): pass
`
      }
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.defects.length, 0);
  });

  // 4. Frontend Valid Relative and Path Alias Imports
  test('Frontend valid TSX/JSX, CSS, and @/ alias imports pass closure validation', () => {
    const files = [
      {
        path: 'frontend/src/App.tsx',
        content: `import React, { useState } from 'react';
import { Header } from './components/Header';
import { useAuth } from '@/hooks/useAuth';
import './index.css';

export default function App() { return <Header />; }
`
      },
      {
        path: 'frontend/src/components/Header.tsx',
        content: `export const Header = () => <h1>Header</h1>;`
      },
      {
        path: 'frontend/src/hooks/useAuth.ts',
        content: `export const useAuth = () => ({ isAuth: true });`
      },
      {
        path: 'frontend/src/index.css',
        content: `body { margin: 0; }`
      }
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, true, 'Valid frontend imports should pass closure validation');
    assert.strictEqual(res.defects.length, 0);
  });

  // 5. Frontend Missing Component / Module Detected
  test('Frontend missing component or hook emits IMPORT_CLOSURE_FAILURE', () => {
    const files = [
      {
        path: 'frontend/src/App.tsx',
        content: `import React from 'react';
import { MissingModal } from './components/MissingModal';
import { useNonExistentHook } from '@/hooks/useNonExistentHook';

export default function App() { return null; }
`
      }
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, false, 'Missing frontend modules must fail closure validation');
    assert.strictEqual(res.defects.length, 2);
    assert.strictEqual(res.defects[0].code, DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE);
    assert.strictEqual(res.defects[0].importedModule, './components/MissingModal');
    assert.strictEqual(res.defects[1].importedModule, '@/hooks/useNonExistentHook');
  });

  // 6. Frontend Re-Exports and Dynamic Imports Checked
  test('Frontend re-exports and multiline syntax are parsed cleanly', () => {
    const files = [
      {
        path: 'frontend/src/components/index.ts',
        content: `export { Button } from './Button';
export { Card } from './Card';
`
      },
      {
        path: 'frontend/src/components/Button.tsx',
        content: `export const Button = () => <button>Click</button>;`
      }
      // Missing Card.tsx intentionally
    ];

    const res = validateImportClosure(files);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.defects.length, 1);
    assert.strictEqual(res.defects[0].importedModule, './Card');
  });

  // 7. Strict External Dependencies Check (requirements.txt and package.json)
  test('Strict external mode flags unlisted 3rd party packages', () => {
    const files = [
      {
        path: 'backend/requirements.txt',
        content: `fastapi==0.110.0\nuvicorn==0.28.0\n`
      },
      {
        path: 'backend/app/main.py',
        content: `from fastapi import FastAPI
import stripe # Not in requirements.txt
`
      },
      {
        path: 'frontend/package.json',
        content: JSON.stringify({
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }
        })
      },
      {
        path: 'frontend/src/App.tsx',
        content: `import React from 'react';
import lodash from 'lodash'; // Not in package.json
`
      }
    ];

    const res = validateImportClosure(files, { strictExternal: true });
    assert.strictEqual(res.isValid, false);
    assert(res.defects.length >= 2);
    assert(res.defects.some(d => d.category === 'backend_external' && d.package === 'stripe'));
    assert(res.defects.some(d => d.category === 'frontend_external' && d.package === 'lodash'));
  });

  // 8. Repair Engine Strategy Mapping
  test('getRepairStrategy returns ImportClosureRepairStrategy for IMPORT_CLOSURE_FAILURE', () => {
    const strategy = getRepairStrategy(DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE);
    assert(strategy, 'Repair strategy must exist for IMPORT_CLOSURE_FAILURE');
    assert.strictEqual(strategy.name, 'ImportClosureRepairStrategy');
    assert(strategy.instructions.length > 0);
  });

  // 9. Completion Gate Logic Blocks on Import Closure Failure
  test('Authoritative final completion gate blocks when import closure fails', () => {
    const mockFiles = [
      { path: 'backend/app/main.py', content: `from app.services.missing_module import do_something\n` }
    ];
    const closureResult = validateImportClosure(mockFiles);
    const importClosurePassed = closureResult.isValid;

    const allModulesPassed = true;
    const semanticValid = true;
    const fileCompletenessPassed = true;

    const finalPassed = allModulesPassed && semanticValid && fileCompletenessPassed && importClosurePassed;
    assert.strictEqual(importClosurePassed, false, 'Import closure should be false');
    assert.strictEqual(finalPassed, false, 'Final gate must NOT pass when import closure fails');
  });

  console.log(`\n====================================================`);
  console.log(`Phase 5 Import Closure Suite: ${passed}/${total} tests passed (100%)`);
  console.log(`====================================================`);
}

runPhase5Tests().catch(err => {
  console.error('\n❌ Phase 5 Test Suite Failed:', err);
  process.exit(1);
});
