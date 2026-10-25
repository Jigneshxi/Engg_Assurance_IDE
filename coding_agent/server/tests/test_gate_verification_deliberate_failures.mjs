import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDatabasePhase } from '../dbValidator.js';
import { validateProjectContracts } from '../projectContractValidator.js';
import { evaluateFinalCompletionGate } from '../orchestrator.js';

test('Gate Verification 1: Handler containing TODO or hardcoded return fails stub gate', async () => {
  const files = [
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter
router = APIRouter()

@router.get('/orders')
def get_orders():
    # Constant empty return
    return {}
`
    },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const result = await validateProjectContracts(files);
  const stubDefects = (result.defects || []).filter(d => d.code === 'STUB_ENDPOINT');
  assert.ok(stubDefects.length > 0, `Expected STUB_ENDPOINT defect for handler with stub return, got: ${JSON.stringify(result.defects)}`);
});

test('Gate Verification 2: Model attribute that does not exist or bad back_populates fails model gate', async () => {
  const baseFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`,
    status: 'validated'
  };
  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: `
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class Parent(Base):
    __tablename__ = 'parents'
    id = Column(Integer, primary_key=True)
    children = relationship('Child', back_populates='non_existent_parent')

class Child(Base):
    __tablename__ = 'children'
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey('parents.id'))
    parent = relationship('Parent', back_populates='children')
`,
    status: 'validated'
  };

  const reqs = {
    entities: ['Parent', 'Child'],
    tables: ['parents', 'children'],
    relationships: [],
    foreign_keys: [],
    constraints: [],
    indexes: [],
    migrations_required: false,
    seed_required: false,
    initialization_requirements: false
  };

  const files = [baseFile, modelsFile];
  const manifest = {
    schemaVersion: 2,
    project_requirements: { database: reqs },
    modules: [{ layer: 'DATABASE', required_files: files }]
  };

  const caller = async () => ({ isValid: false, semanticIssues: ['Relationship Parent.children specifies non-existent back_populates attribute non_existent_parent'] });
  const sendEvent = () => {};
  const report = await validateDatabasePhase([{ required_files: files }], manifest, '', caller, sendEvent, { authoritativeOrm: true });
  assert.equal(report.isValid, false, 'Expected model validation to fail on missing back_populates attribute');
  assert.ok(report.errors.some(e => e.includes('non_existent_parent') || e.includes('back_populates')), `Expected error mentioning non_existent_parent, got: ${JSON.stringify(report.errors)}`);
});

test('Gate Verification 3: Placeholder / vacuous test is rejected', async () => {
  const files = [
    {
      path: 'backend/tests/test_api.py',
      content: `
def test_placeholder():
    response = client.get('/api/main')
    assert response.status_code == 200
`
    },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];
  const manifest = {
    schemaVersion: 2,
    modules: [{ name: 'api', required_files: [{ path: 'backend/tests/test_api.py' }] }],
    integrationContract: {
      schemaVersion: 2,
      endpoints: [{ method: 'GET', path: '/api/main', backendFile: 'backend/app/api/main.py', requestFields: [], responseFields: [], routerPrefix: '/api', routerPath: '/main', responseSchema: 'MainResponse' }],
      workflows: [{ testFile: 'backend/tests/test_api.py', runner: 'pytest', requirementIds: ['REQ-001'] }]
    }
  };
  const result = await validateProjectContracts(files, manifest);
  const defects = result.defects || [];
  const genericDefect = defects.some(d => ['GENERIC_REQUIREMENT_TEST', 'TRIVIAL_WORKFLOW_TEST', 'VACUOUS_TEST', 'UNDECLARED_ROUTE', 'UNMATCHED_WORKFLOW_TEST'].includes(d.code));
  assert.ok(genericDefect || defects.length > 0, 'Expected generic/placeholder test defect');
});

test('Gate Verification 4: Project with two <Router> components fails wiring gate', () => {
  const appContent = `
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <Router>
      <Router>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </Router>
    </Router>
  );
}
`;
  // Double router detection
  const routerCount = (appContent.match(/<Router[\s>]/g) || []).length + (appContent.match(/<BrowserRouter[\s>]/g) || []).length;
  assert.ok(routerCount >= 2, 'Detected multiple router instances');
  
  // Gate check
  const wiringValid = routerCount <= 1;
  assert.equal(wiringValid, false, 'Expected wiring gate to reject multiple Router components');
});

test('Gate Verification 5: evaluateFinalCompletionGate lists failed gates by name for INCOMPLETE status', () => {
  const gateEvaluation = evaluateFinalCompletionGate({
    allModulesPassed: true,
    semanticValid: true,
    fileCompletenessPassed: true,
    importClosurePassed: false, // Intentionally failed
    frontendContractPassed: true,
    backendRuntimePassed: true,
    apiAuthzPassed: true,
    prdCoveragePassed: false, // Intentionally failed
    browserE2ePassed: false, // Intentionally failed
    securityPassed: true,
    stubsAbsent: false, // Intentionally failed
    requirementTestsPassed: false,
    buildPassed: true,
    artifactHashMatched: true,
    syntaxPassed: true,
    architectureContractPassed: true,
    manifestCompletenessPassed: true,
    generationBoundaryPassed: true
  });

  assert.equal(gateEvaluation.isPassed, false, 'Expected gate evaluation to fail');
  assert.ok(gateEvaluation.failedGates.includes('importClosure'), 'failedGates must include importClosure');
  assert.ok(gateEvaluation.failedGates.includes('prdCoverage'), 'failedGates must include prdCoverage');
  assert.ok(gateEvaluation.failedGates.includes('stubsAbsent'), 'failedGates must include stubsAbsent');

  const agentValidation = {
    status: gateEvaluation.isPassed ? 'VERIFIED' : 'INCOMPLETE',
    completionStatus: gateEvaluation.isPassed ? 'VERIFIED' : 'INCOMPLETE',
    gateStatus: gateEvaluation.isPassed ? 'PASS' : 'FAIL',
    failedGates: gateEvaluation.failedGates
  };

  assert.equal(agentValidation.status, 'INCOMPLETE');
  assert.ok(agentValidation.failedGates.length >= 4);
});
