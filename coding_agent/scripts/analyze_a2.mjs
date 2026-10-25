import fs from 'fs';
import path from 'path';
import { validateProjectContracts } from '../server/projectContractValidator.js';
import { validateBackendRuntime } from '../server/backendRuntimeValidator.js';
import { validateFrontendContract } from '../server/frontendContractValidator.js';
import { verifyResourceOwnershipAndIsolation, verifyTokenValidationAndClaims } from '../server/apiAuthzValidator.js';

const ws = 'C:/Users/VVNT SeQuor/.gemini/antigravity-ide/brain/2b6ba98c-557d-4289-9725-ed1f1d33c316/scratch/prd_test_a2';

function walk(dir, base = '') {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name).replace(/\\/g, '/');
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__' && entry.name !== 'dist') {
        res.push(...walk(full, rel));
      }
    } else if (entry.isFile()) {
      res.push({ path: rel, content: fs.readFileSync(full, 'utf8'), size: fs.statSync(full).size });
    }
  }
  return res;
}

const files = walk(ws);

const pyFiles = files.filter(f => f.path.endsWith('.py'));
const tsxFiles = files.filter(f => f.path.endsWith('.tsx') || f.path.endsWith('.ts'));
const otherFiles = files.filter(f => !f.path.endsWith('.py') && !f.path.endsWith('.tsx') && !f.path.endsWith('.ts'));

const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
const totalLines = files.reduce((acc, f) => acc + f.content.split('\n').length, 0);

console.log('=== 1. FILE & CODE VOLUME BREAKDOWN ===');
console.log('Total Files:', files.length);
console.log('Total Lines of Code:', totalLines);
console.log('Total Raw Size (KB):', (totalBytes / 1024).toFixed(1));
console.log('Backend Python Files:', pyFiles.length);
console.log('Frontend TS/TSX Files:', tsxFiles.length);
console.log('Other Files (docs, configs, batches):', otherFiles.length);

// Analyze backend endpoints
const endpoints = [];
pyFiles.forEach(f => {
  const matches = [...f.content.matchAll(/@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g)];
  matches.forEach(m => endpoints.push({ file: f.path, method: m[1].toUpperCase(), path: m[2] }));
});
console.log('\n=== 2. BACKEND API ENDPOINTS ===');
console.log('Total Backend Endpoints Defined:', endpoints.length);

// Analyze frontend components and pages
const pages = tsxFiles.filter(f => f.path.includes('/pages/'));
const components = tsxFiles.filter(f => f.path.includes('/components/'));
console.log('\n=== 3. FRONTEND UI COMPONENTS ===');
console.log('Frontend Pages:', pages.length);
console.log('Frontend Components:', components.length);

// Check stub/mock ratios in frontend
let stubComponents = 0;
components.forEach(c => {
  const isStub = c.content.length < 350 || /return\s*\(?\s*<div[^>]*>\s*<h2>[^<]+<\/h2>\s*<\/div>\s*\)?/i.test(c.content);
  if (isStub) stubComponents++;
});
console.log('Stub / Placeholder Components:', stubComponents, 'out of', components.length);

// QuickCart PRD Requirements Check (Coverage of Core Requirements)
const prdRequirements = [
  { name: 'User Authentication & JWT', check: files.some(f => f.path.includes('auth.py') && f.content.includes('jwt')) },
  { name: 'Product Catalog & Category Filter', check: files.some(f => f.path.includes('products.py')) && files.some(f => f.path.includes('categories.py')) },
  { name: 'Shopping Cart Persistence', check: files.some(f => f.path.includes('cart.py')) },
  { name: 'Wishlist Management', check: files.some(f => f.path.includes('wishlist.py')) },
  { name: 'Customer Address Book', check: files.some(f => f.path.includes('addresses.py')) },
  { name: 'Coupon & Discount Engine', check: files.some(f => f.path.includes('coupons.py')) },
  { name: 'Product Reviews & Ratings', check: files.some(f => f.path.includes('reviews.py')) },
  { name: 'Order Placement & History', check: files.some(f => f.path.includes('orders.py')) },
  { name: 'Payment Mock / Gateway', check: files.some(f => f.path.includes('payments.py')) },
  { name: 'Admin Backoffice Management', check: files.some(f => /admin/i.test(f.path) || /admin/i.test(f.content)) },
  { name: 'Database Migrations (Alembic)', check: files.some(f => f.path.includes('migrations')) },
  { name: 'Database Seed Script', check: files.some(f => f.path.includes('seed.py')) },
  { name: 'E2E Playwright Browser Tests', check: files.some(f => f.path.includes('workflows.spec.ts')) },
  { name: 'Backend Pytest Workflow Tests', check: files.some(f => f.path.includes('test_workflows.py')) }
];

console.log('\n=== 4. PRD CORE REQUIREMENT STRUCTURAL COVERAGE ===');
let reqsMet = 0;
prdRequirements.forEach(r => {
  if (r.check) reqsMet++;
  console.log(` - [${r.check ? 'COVERED' : 'MISSING'}] ${r.name}`);
});
console.log(`Structural Feature Coverage: ${reqsMet} / ${prdRequirements.length} (${((reqsMet / prdRequirements.length) * 100).toFixed(1)}%)`);

// Run Gate Validation Suite
async function runValidators() {
  console.log('\n=== 5. GATE VALIDATION AUDIT (CORRECTNESS & DEFECTS) ===');
  const contractRes = await validateProjectContracts(files);
  console.log('Project Contract Defects:', contractRes.defects.length);
  
  const backendRes = await validateBackendRuntime(files, { workspacePath: ws });
  console.log('Backend Runtime Defects:', backendRes.defects.length);
  
  const feRes = await validateFrontendContract(files, { workspacePath: ws });
  console.log('Frontend Contract Defects:', feRes.defects.length);
  
  const authRes = verifyTokenValidationAndClaims(files);
  console.log('Auth Token Defects:', authRes.defects.length);

  const ownRes = verifyResourceOwnershipAndIsolation(files);
  console.log('Resource Ownership Defects:', ownRes.defects.length);

  const allDefects = [...contractRes.defects, ...backendRes.defects, ...feRes.defects, ...authRes.defects, ...ownRes.defects];
  console.log('\nTotal Detected Defects across all validators:', allDefects.length);

  const codeCounts = {};
  allDefects.forEach(d => { codeCounts[d.code] = (codeCounts[d.code] || 0) + 1; });
  console.log('Defects Breakdown by Code:', codeCounts);

  // Calculate Relevant vs Defective Ratio
  console.log('\n=== 6. CODE RELEVANCE RATIO ANALYSIS ===');
  console.log('Total files generated:', files.length);
  const defectiveFiles = new Set(allDefects.map(d => d.file).filter(Boolean));
  console.log('Files with detected gate/contract defects:', defectiveFiles.size);
  console.log('Defect-free clean files:', files.length - defectiveFiles.size);
  console.log('Clean / Working File Ratio:', (((files.length - defectiveFiles.size) / files.length) * 100).toFixed(1) + '%');
}

runValidators().catch(err => console.error(err));
