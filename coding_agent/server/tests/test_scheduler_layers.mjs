import { determineActiveLayer, selectReadyModules } from '../orchestrator.js';

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
};

const modules = [
  { id: 'MOD-000', layer: 'DATABASE', status: 'PASSED', dependencies: [] },
  { id: 'MOD-001', layer: 'BACKEND_FOUNDATION', status: 'PASSED', dependencies: ['MOD-000'] },
  { id: 'MOD-002', layer: 'BACKEND', status: 'PASSED', dependencies: ['MOD-001'] },
  { id: 'MOD-003', layer: 'BACKEND', status: 'PASSED', dependencies: ['MOD-001'] },
  { id: 'MOD-005', layer: 'FRONTEND', status: 'PASSED', dependencies: ['MOD-001'] },
  { id: 'MOD-006', layer: 'TESTS', status: 'PENDING', dependencies: ['MOD-002', 'MOD-003'] },
  { id: 'MOD-007', layer: 'DOCUMENTATION', status: 'PENDING', dependencies: [] },
  { id: 'MOD-999', layer: 'GENERIC', status: 'PENDING', dependencies: ['MOD-000', 'MOD-001', 'MOD-002', 'MOD-003', 'MOD-005', 'MOD-006', 'MOD-007'] }
];

const pendingModules = () => modules.filter(module => module.status === 'PENDING' || module.status === 'REPAIRING');
const selectedIds = (layer) => selectReadyModules(pendingModules(), modules, layer).map(module => module.id).join(',');

try {
  assertEqual(determineActiveLayer(modules), 'TESTS', 'TESTS must follow FRONTEND');
  console.log('PASS: TESTS layer is scheduled after FRONTEND.');

  assertEqual(selectedIds('TESTS'), 'MOD-006', 'MOD-006 must run after MOD-002 and MOD-003 pass');
  console.log('PASS: MOD-006 is eligible when both backend dependencies are PASSED.');

  modules.find(module => module.id === 'MOD-006').status = 'PASSED';
  assertEqual(determineActiveLayer(modules), 'DOCUMENTATION', 'DOCUMENTATION must follow TESTS');
  console.log('PASS: DOCUMENTATION layer is scheduled after TESTS.');

  assertEqual(selectedIds('DOCUMENTATION'), 'MOD-007', 'MOD-007 has no dependencies and must be eligible');
  console.log('PASS: MOD-007 is eligible without dependencies.');

  assertEqual(selectedIds('GENERIC'), '', 'MOD-999 must wait while required modules are pending');
  modules.find(module => module.id === 'MOD-007').status = 'PASSED';
  assertEqual(selectedIds('GENERIC'), 'MOD-999', 'MOD-999 must run after MOD-006 and MOD-007 pass');
  console.log('PASS: MOD-999 remains blocked until MOD-006 and MOD-007 are PASSED.');
  console.log('Results: 5/5 scheduler layer tests passed.');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}