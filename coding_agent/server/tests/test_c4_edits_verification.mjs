import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImportClosure } from '../importClosureValidator.js';
import { verifyApiRegistration } from '../backendRuntimeValidator.js';
import { verifyCoreFrontendFiles } from '../frontendContractValidator.js';
import { DEFAULT_SEED_PY_CONTENT } from '../foundationTemplates.js';

test('1. Import Closure Validator: # noqa comments are stripped and not read as symbols', () => {
  const dbPy = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base
Base = declarative_base()
`
  };

  const modelsPy = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String
from app.db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String)
`
  };

  const fileWithNoqa = {
    path: 'backend/app/api/users.py',
    content: `from fastapi import APIRouter
from app.db.models import *  # noqa: F403
from app.db.models import User  # noqa: F401

router = APIRouter()
`
  };

  const files = [dbPy, modelsPy, fileWithNoqa];
  const result = validateImportClosure(files);

  assert.ok(result.isValid, `Import closure should pass, errors: ${result.errors.join('; ')}`);
  assert.equal(result.defects.length, 0, 'No defects should be raised');

  const noqaDefects = result.defects.filter(d =>
    JSON.stringify(d).includes('noqa') || JSON.stringify(d).includes('F403') || JSON.stringify(d).includes('F401')
  );
  assert.equal(noqaDefects.length, 0, '# noqa: F403 must never be parsed as an import or symbol');

  // Verify that an actual missing symbol without noqa is still detected as a defect
  const fileWithMissingSymbol = {
    path: 'backend/app/api/orders.py',
    content: `from app.db.models import MissingModel`
  };
  const resultMissing = validateImportClosure([modelsPy, fileWithMissingSymbol]);
  assert.ok(!resultMissing.isValid, 'Missing real symbol must be caught');
  assert.ok(
    resultMissing.defects.some(d => d.message.includes('MissingModel')),
    'Must report MissingModel as missing'
  );
});

test('2. Backend Runtime Validator: Accepts PRD route prefixes (/api/<resource> and /<resource>)', () => {
  const routerFile = {
    path: 'backend/app/api/distributors.py',
    content: `from fastapi import APIRouter
router = APIRouter()
@router.get("/")
def list_distributors():
    return []
`
  };

  // Case A: Composed prefix is /api/distributors
  const mainWithApiPrefix = {
    path: 'backend/app/main.py',
    content: `from fastapi import FastAPI
from app.api.distributors import router as distributors_router

app = FastAPI()
app.include_router(distributors_router, prefix="/api/distributors")
`
  };
  const resApi = verifyApiRegistration([mainWithApiPrefix, routerFile]);
  assert.equal(resApi.defects.length, 0, 'Mounting with /api/distributors must be accepted');

  // Case B: Composed prefix is /distributors (direct resource prefix)
  const mainWithDirectPrefix = {
    path: 'backend/app/main.py',
    content: `from fastapi import FastAPI
from app.api.distributors import router as distributors_router

app = FastAPI()
app.include_router(distributors_router, prefix="/distributors")
`
  };
  const resDirect = verifyApiRegistration([mainWithDirectPrefix, routerFile]);
  assert.equal(resDirect.defects.length, 0, 'Mounting with /distributors must be accepted');

  // Case C: Unrelated composed prefix e.g. /random/unrelated
  const mainWithInvalidPrefix = {
    path: 'backend/app/main.py',
    content: `from fastapi import FastAPI
from app.api.distributors import router as distributors_router

app = FastAPI()
app.include_router(distributors_router, prefix="/random/unrelated")
`
  };
  const resInvalid = verifyApiRegistration([mainWithInvalidPrefix, routerFile]);
  assert.ok(resInvalid.defects.length > 0, 'Mounting with invalid arbitrary prefix must fail');
  assert.ok(resInvalid.defects.some(d => d.message.includes('mounted with composed prefix')), 'Must report prefix mismatch');
});

test('3. Frontend Contract Validator: A bare placeholder skeleton fails the completion gate', () => {
  const manifest = {
    modules: [
      {
        id: 'MOD-004',
        name: 'Distributor Portal',
        layer: 'FRONTEND',
        required_files: [
          { path: 'frontend/src/pages/DistributorsPage.tsx' }
        ]
      }
    ]
  };

  const coreFiles = [
    { path: 'frontend/package.json', content: '{"dependencies":{"react":"^18.0.0"}}' },
    { path: 'frontend/src/App.tsx', content: 'export default function App() { return <div>App</div>; }' },
    { path: 'frontend/src/main.tsx', content: 'import React from "react";' },
    { path: 'frontend/index.html', content: '<html></html>' }
  ];

  // Case A: Page is a bare placeholder stub -> FAILS
  const bareStub = {
    path: 'frontend/src/pages/DistributorsPage.tsx',
    content: `import React from 'react';

export default function DistributorsPage() {
  return (
    <div className="distributors-page">
      <h2>Distributors</h2>
    </div>
  );
}
`
  };

  const resStub = verifyCoreFrontendFiles([...coreFiles, bareStub], { manifest });
  assert.ok(resStub.defects.length > 0, 'Bare placeholder skeleton must fail the gate');
  const defect = resStub.defects.find(d => d.file === 'frontend/src/pages/DistributorsPage.tsx');
  assert.ok(defect, 'Must report missing/stub page defect for DistributorsPage.tsx');
  assert.equal(defect.code, 'MISSING_CORE_PROJECT_FILE');
  assert.ok(defect.message.includes('bare placeholder stub') || defect.message.includes('missing'));

  // Case B: Page is a real implemented page view -> PASSES
  const realPage = {
    path: 'frontend/src/pages/DistributorsPage.tsx',
    content: `import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Distributor {
  id: number;
  name: string;
  email: string;
  performance_score: number;
}

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/distributors').then(res => {
      setDistributors(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading Distributors...</div>;

  return (
    <div className="container">
      <h1>Distributor Management</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {distributors.map(d => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td>{d.name}</td>
              <td>{d.email}</td>
              <td>{d.performance_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`
  };

  const resReal = verifyCoreFrontendFiles([...coreFiles, realPage], { manifest });
  const realDefect = resReal.defects.find(d => d.file === 'frontend/src/pages/DistributorsPage.tsx');
  assert.equal(realDefect, undefined, 'Real implemented page must pass');
});

test('4. Seed and Models Agreement: seed.py imports Base & models and seeds Admin, Distributor, and Retailer', () => {
  assert.ok(DEFAULT_SEED_PY_CONTENT, 'DEFAULT_SEED_PY_CONTENT must exist');

  // Verify Base and session infrastructure import
  assert.ok(
    DEFAULT_SEED_PY_CONTENT.includes('from app.db.database import engine, SessionLocal, Base') ||
    DEFAULT_SEED_PY_CONTENT.includes('from app.db.database import Base'),
    'seed.py must import canonical Base and engine from app.db.database'
  );

  // Verify models import
  assert.ok(
    DEFAULT_SEED_PY_CONTENT.includes('from app.db import models') ||
    DEFAULT_SEED_PY_CONTENT.includes('import models'),
    'seed.py must import models dynamically'
  );

  // Verify required user roles: Admin, Distributor, Retailer
  assert.ok(DEFAULT_SEED_PY_CONTENT.includes('"role": "Admin"'), 'seed.py must seed Admin role');
  assert.ok(DEFAULT_SEED_PY_CONTENT.includes('"role": "Distributor"'), 'seed.py must seed Distributor role');
  assert.ok(DEFAULT_SEED_PY_CONTENT.includes('"role": "Retailer"'), 'seed.py must seed Retailer role');

  // Verify safe model attribute inspection (prevents column name mismatches)
  assert.ok(DEFAULT_SEED_PY_CONTENT.includes('hasattr(User, k)'), 'seed.py must verify model attributes before assigning');
  assert.ok(DEFAULT_SEED_PY_CONTENT.includes('hashed_password'), 'seed.py must handle hashed_password field');
});
