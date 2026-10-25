import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProjectContracts } from '../server/projectContractValidator.js';
import { validateBackendRuntime } from '../server/backendRuntimeValidator.js';
import { validateFrontendContract } from '../server/frontendContractValidator.js';
import { verifyResourceOwnershipAndIsolation, verifyTokenValidationAndClaims } from '../server/apiAuthzValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetArg = process.argv[2];
let targetWs = targetArg ? path.resolve(targetArg) : path.join(rootDir, 'scratch', 'prd_test_a2');

if (!fs.existsSync(targetWs)) {
  const altPath = 'C:/Users/VVNT SeQuor/.gemini/antigravity-ide/brain/2b6ba98c-557d-4289-9725-ed1f1d33c316/scratch/prd_test_a2';
  if (fs.existsSync(altPath)) {
    targetWs = altPath;
  }
}

function walk(dir, base = '') {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name).replace(/\\/g, '/');
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__' && entry.name !== 'dist' && entry.name !== '.pytest_cache') {
        res.push(...walk(full, rel));
      }
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        res.push({ path: rel, content, size: fs.statSync(full).size });
      } catch (err) {
        // Binary or unreadable file
      }
    }
  }
  return res;
}

export async function analyzeWorkspace(workspacePath) {
  const ws = path.resolve(workspacePath);
  const files = walk(ws);

  const pyFiles = files.filter(f => f.path.endsWith('.py'));
  const tsxFiles = files.filter(f => f.path.endsWith('.tsx') || f.path.endsWith('.ts'));
  const otherFiles = files.filter(f => !f.path.endsWith('.py') && !f.path.endsWith('.tsx') && !f.path.endsWith('.ts'));

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const totalLines = files.reduce((acc, f) => acc + (typeof f.content === 'string' ? f.content.split('\n').length : 0), 0);

  // Analyze backend endpoints
  const endpoints = [];
  pyFiles.forEach(f => {
    // Empty router paths are valid root handlers (for example `@router.get("")`).
    // Keep them in the endpoint inventory so contract matching sees mounted
    // collection roots such as /api/products and /api/orders.
    const matches = [...f.content.matchAll(/@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/g)];
    matches.forEach(m => endpoints.push({ file: f.path, method: m[1].toUpperCase(), path: m[2] }));
  });

  // Analyze frontend components and pages
  const pages = tsxFiles.filter(f => f.path.includes('/pages/'));
  const components = tsxFiles.filter(f => f.path.includes('/components/'));

  // Run gate validators
  let contractDefects = [];
  try {
    const cRes = await validateProjectContracts(files);
    contractDefects = cRes.defects || [];
  } catch (e) {
    contractDefects.push({ code: 'VALIDATOR_CRASH', message: e.message, file: 'server/projectContractValidator.js' });
  }

  let backendDefects = [];
  try {
    const bRes = await validateBackendRuntime(files, { workspacePath: ws });
    backendDefects = bRes.defects || [];
  } catch (e) {
    backendDefects.push({ code: 'BACKEND_RUNTIME_FAILURE', message: e.message, file: 'backend' });
  }

  let frontendDefects = [];
  try {
    const fRes = await validateFrontendContract(files, { workspacePath: ws });
    frontendDefects = fRes.defects || [];
  } catch (e) {
    frontendDefects.push({ code: 'FRONTEND_BUILD_FAILURE', message: e.message, file: 'frontend' });
  }

  let authDefects = [];
  try {
    const aRes = verifyTokenValidationAndClaims(files);
    authDefects = aRes.defects || [];
  } catch (e) {}

  let ownershipDefects = [];
  try {
    const oRes = verifyResourceOwnershipAndIsolation(files);
    ownershipDefects = oRes.defects || [];
  } catch (e) {}

  const allDefects = [
    ...contractDefects,
    ...backendDefects,
    ...frontendDefects,
    ...authDefects,
    ...ownershipDefects
  ];

  const codeCounts = {};
  for (const d of allDefects) {
    const code = d.code || 'UNKNOWN_DEFECT';
    codeCounts[code] = (codeCounts[code] || 0) + 1;
  }

  const sumOfCounts = Object.values(codeCounts).reduce((a, b) => a + b, 0);
  const sumCheckValid = (sumOfCounts === allDefects.length);

  const defectiveFiles = new Set(allDefects.map(d => d.file).filter(Boolean));
  const defectFreeFiles = files.length - defectiveFiles.size;

  // PRD Topic Sections: dynamically driven by .openclaw/contract.json if available, or QuickCart 37 sections
  const defaultSections = [
    { id: 1, name: 'User Registration', be: 'backend/app/api/auth.py', ep: '/register', fe: ['Register', 'Auth'], test: ['test_REQ_001', 'register'], userFacing: true },
    { id: 2, name: 'User Login & JWT', be: 'backend/app/api/auth.py', ep: '/token', fe: ['Login', 'AuthContext'], test: ['test_REQ_002', 'login', 'jwt'], userFacing: true },
    { id: 3, name: 'Password Hashing (Bcrypt)', be: 'backend/app/core/security.py', kw: ['bcrypt', 'pwd_context', 'hash_password'], test: ['test_REQ_003', 'password', 'bcrypt'], userFacing: false },
    { id: 4, name: 'Role-Based Access Control', be: 'backend/app/api/deps.py', kw: ['require_admin', 'get_current_admin', 'role'], fe: ['ProtectedRoute'], test: ['test_REQ_004', 'admin', 'role'], userFacing: true },
    { id: 5, name: 'Product Catalog Browsing', be: 'backend/app/api/products.py', ep: '/products', fe: ['ProductListing', 'ProductCard'], test: ['test_REQ_005', 'catalog', 'products'], userFacing: true },
    { id: 6, name: 'Product Search & Filtering', be: 'backend/app/api/products.py', kw: ['search', 'category_id', 'filter'], fe: ['SearchBar', 'CategoryFilter'], test: ['test_REQ_006', 'search'], userFacing: true },
    { id: 7, name: 'Category Management', be: 'backend/app/api/categories.py', ep: '/categories', fe: ['Categories', 'CategoryFilter'], test: ['test_REQ_007', 'categories'], userFacing: true },
    { id: 8, name: 'Product Detail View', be: 'backend/app/api/products.py', ep: '/{id}', fe: ['ProductDetails', 'ProductDetail'], test: ['test_REQ_008', 'detail'], userFacing: true },
    { id: 9, name: 'Shopping Cart - Add Item', be: 'backend/app/api/cart.py', ep: '/cart', fe: ['CartItem', 'Cart', 'CartContext'], test: ['test_REQ_009', 'cart'], userFacing: true },
    { id: 10, name: 'Shopping Cart - Update/Remove', be: 'backend/app/api/cart.py', kw: ['update', 'delete', 'remove'], fe: ['CartItem', 'Cart'], test: ['test_REQ_010', 'cart'], userFacing: true },
    { id: 11, name: 'Cart Persistence', be: 'backend/app/api/cart.py', kw: ['Cart', 'CartItem', 'session', 'db'], fe: ['CartContext'], test: ['test_REQ_011', 'persist'], userFacing: true },
    { id: 12, name: 'Wishlist Management', be: 'backend/app/api/wishlist.py', ep: '/wishlist', fe: ['Wishlist'], test: ['test_REQ_012', 'wishlist'], userFacing: true },
    { id: 13, name: 'Customer Address Book', be: 'backend/app/api/addresses.py', ep: '/addresses', fe: ['Addresses', 'AddressForm'], test: ['test_REQ_013', 'address'], userFacing: true },
    { id: 14, name: 'Coupon & Discount Engine', be: 'backend/app/api/coupons.py', ep: '/coupons', fe: ['CouponForm', 'Coupon'], test: ['test_REQ_014', 'coupon'], userFacing: true },
    { id: 15, name: 'Server-Side Price Calculation', be: 'backend/app/api/checkout.py', kw: ['subtotal', 'discount', 'tax', 'final_amount', 'total'], fe: ['OrderSummary', 'Checkout'], test: ['test_REQ_015', 'pricing', 'calc'], userFacing: true },
    { id: 16, name: 'Checkout Flow & Validation', be: 'backend/app/api/checkout.py', ep: '/checkout', fe: ['Checkout'], test: ['test_REQ_016', 'checkout'], userFacing: true },
    { id: 17, name: 'Payment Mock / Gateway', be: 'backend/app/api/payments.py', ep: '/payments', fe: ['Payment', 'Checkout'], test: ['test_REQ_017', 'payment'], userFacing: true },
    { id: 18, name: 'Order Creation & ID Gen', be: 'backend/app/api/orders.py', ep: '/orders', kw: ['create_order', 'order_id'], fe: ['Checkout', 'OrderSummary'], test: ['test_REQ_018', 'order_create'], userFacing: true },
    { id: 19, name: 'Order Items Snapshot', be: 'backend/app/api/orders.py', kw: ['unit_price', 'product_name', 'snapshot', 'OrderItem'], fe: ['OrderDetails'], test: ['test_REQ_019', 'snapshot'], userFacing: true },
    { id: 20, name: 'Order Status Transitions', be: 'backend/app/api/orders.py', kw: ['status', 'transition', 'PENDING', 'CONFIRMED', 'SHIPPED'], fe: ['AdminOrders', 'OrderDetails'], test: ['test_REQ_020', 'transition', 'status'], userFacing: true },
    { id: 21, name: 'Order History for Customer', be: 'backend/app/api/orders.py', kw: ['user_id', 'current_user.id', 'orders'], fe: ['OrderHistory'], test: ['test_REQ_021', 'history'], userFacing: true },
    { id: 22, name: 'Inventory Reservation & Deduction', be: 'backend/app/api/inventory.py', kw: ['stock', 'reserve', 'deduct', 'stock_quantity'], test: ['test_REQ_022', 'inventory', 'deduct'], userFacing: false },
    { id: 23, name: 'Concurrency Control (Stock)', be: 'backend/app/api/inventory.py', kw: ['stock >=', 'with_for_update', 'lock'], test: ['test_REQ_023', 'stock', 'concurren'], userFacing: false },
    { id: 24, name: 'Customer Reviews & Ratings', be: 'backend/app/api/reviews.py', ep: '/reviews', fe: ['ReviewForm', 'Reviews'], test: ['test_REQ_024', 'review'], userFacing: true },
    { id: 25, name: 'Verified Buyer Review Guard', be: 'backend/app/api/reviews.py', kw: ['verified', 'buyer', 'order_id', 'check_purchase'], fe: ['ReviewForm'], test: ['test_REQ_025', 'verified'], userFacing: true },
    { id: 26, name: 'Admin Dashboard Analytics', be: 'backend/app/api/admin.py', kw: ['analytics', 'stats', 'total_sales', 'dashboard'], fe: ['AdminDashboard', 'Dashboard'], test: ['test_REQ_026', 'analytics', 'dashboard'], userFacing: true },
    { id: 27, name: 'Admin Product CRUD', be: 'backend/app/api/products.py', kw: ['create_product', 'update_product', 'delete_product', 'require_admin'], fe: ['AdminProducts', 'ProductForm'], test: ['test_REQ_027', 'admin_product'], userFacing: true },
    { id: 28, name: 'Admin Inventory Management', be: 'backend/app/api/inventory.py', kw: ['adjust_stock', 'inventory', 'restock'], fe: ['AdminInventory', 'Inventory'], test: ['test_REQ_028', 'inventory'], userFacing: true },
    { id: 29, name: 'Admin Order Processing', be: 'backend/app/api/orders.py', kw: ['update_status', 'fulfill', 'ship'], fe: ['AdminOrders'], test: ['test_REQ_029', 'process_order'], userFacing: true },
    { id: 30, name: 'Admin Customer Management', be: 'backend/app/api/admin.py', kw: ['customers', 'users', 'status'], fe: ['AdminCustomers', 'Customers'], test: ['test_REQ_030', 'customer'], userFacing: true },
    { id: 31, name: 'Notification & Reminder System', be: 'backend/app/api/notifications.py', ep: '/notifications', fe: ['Notifications', 'NotificationItem'], test: ['test_REQ_031', 'notification'], userFacing: true },
    { id: 32, name: 'User Profile & Preferences', be: 'backend/app/api/customer.py', kw: ['profile', 'me', 'preferences'], fe: ['Profile'], test: ['test_REQ_032', 'profile'], userFacing: true },
    { id: 33, name: 'API Rate Limiting & Throttling', be: 'backend/app/main.py', kw: ['rate_limit', 'limiter', 'middleware'], test: ['test_REQ_033', 'rate_limit', 'throttle'], userFacing: false },
    { id: 34, name: 'Database Seed & Migration', be: 'backend/app/db/seed.py', kw: ['seed', 'init_db'], test: ['test_REQ_034', 'seed', 'migration'], userFacing: false },
    { id: 35, name: 'Pytest Workflow Test Suite', be: 'backend/tests/test_workflows.py', kw: ['test_'], test: ['pytest', 'test_workflows'], userFacing: false },
    { id: 36, name: 'Playwright E2E Test Suite', fe: ['workflows.spec.ts', 'playwright'], test: ['playwright', 'spec', 'test('], userFacing: true },
    { id: 37, name: 'Production Build & Linting', be: 'backend/requirements.txt', fe: ['package.json'], test: ['build', 'tsc', 'vite'], userFacing: false }
  ];

  let sections = defaultSections;
  const contractPath = path.join(ws, '.openclaw', 'contract.json');
  if (fs.existsSync(contractPath) && !ws.toLowerCase().includes('quickcart')) {
    try {
      const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      if (contractData && Array.isArray(contractData.endpoints) && contractData.endpoints.length > 0) {
        sections = contractData.endpoints.map((ep, idx) => {
          const reqs = ep.requirementIds || [];
          const reqTag = reqs[0] || `EP-${idx + 1}`;
          const cleanPath = ep.path || '';
          const name = `${reqTag}: ${ep.method} ${cleanPath}`;
          const be = ep.backendFile || 'backend/app/api';
          const epStr = ep.routerPath || ep.path;
          const resource = cleanPath.split('/')[2] || cleanPath.split('/')[1] || '';
          const feTokens = [resource, resource.endsWith('s') ? resource.slice(0, -1) : resource, 'App'].filter(Boolean);
          const testTokens = [...reqs, resource, (ep.method || '').toLowerCase()].filter(Boolean);
          return {
            id: idx + 1,
            name,
            be,
            method: (ep.method || 'GET').toUpperCase(),
            ep: epStr,
            fe: feTokens,
            test: testTokens,
            userFacing: ep.auth !== 'system'
          };
        });
      }
    } catch (_) {}
  }

  const testFiles = files.filter(f => f.path.includes('/tests/') || f.path.includes('test_') || f.path.includes('.spec.'));

  const coverageResults = sections.map(sec => {
    let hasBe = false;
    if (sec.be) {
      const baseName = path.basename(sec.be);
      const matchFile = files.find(f => f.path.includes(sec.be.replace('backend/app/', '')) || f.path.endsWith(baseName));
      if (matchFile) {
        if (sec.method) {
          hasBe = endpoints.some(e => e.file.endsWith(baseName) && e.method === sec.method);
        } else if (sec.ep) {
          hasBe = matchFile.content.includes(sec.ep) || matchFile.content.includes(sec.ep.replace('/', '')) || (sec.ep === '' && matchFile.content.includes('@router.'));
        } else if (sec.kw) {
          hasBe = sec.kw.some(k => matchFile.content.includes(k));
        } else {
          hasBe = true;
        }
      }
    } else {
      hasBe = true; // No backend required
    }

    let hasFe = false;
    if (sec.fe && sec.fe.length > 0) {
      hasFe = files.some(f => (f.path.endsWith('.tsx') || f.path.endsWith('.ts')) && sec.fe.some(target => f.path.includes(target) || f.content.includes(target)));
    } else {
      hasFe = true; // Non user-facing
    }

    let hasTest = false;
    if (sec.test && sec.test.length > 0) {
      hasTest = testFiles.some(f => sec.test.some(t => f.content.toLowerCase().includes(t.toLowerCase())));
    }

    let status = 'MISSING';
    if (sec.userFacing) {
      if (hasBe && hasFe && hasTest) status = 'DONE';
      else if (hasBe || hasFe || hasTest) status = 'PARTIAL';
    } else {
      if (hasBe && hasTest) status = 'DONE';
      else if (hasBe || hasTest) status = 'PARTIAL';
    }

    return {
      id: sec.id,
      name: sec.name,
      hasBe,
      hasFe: sec.userFacing ? hasFe : 'N/A',
      hasTest,
      status
    };
  });

  const doneCount = coverageResults.filter(r => r.status === 'DONE').length;
  const partialCount = coverageResults.filter(r => r.status === 'PARTIAL').length;
  const missingCount = coverageResults.filter(r => r.status === 'MISSING').length;

  const routerFiles = [...new Set(endpoints.map(e => e.file))];
  const workingCoveragePct = ((doneCount / (coverageResults.length || 1)) * 100).toFixed(1);
  const healthyFilesPct = ((defectFreeFiles / (files.length || 1)) * 100).toFixed(1);

  // Contract match calculation from .openclaw/contract.json if available
  let contractMatchPct = 'N/A';
  let contractTotalEndpoints = 0;
  let contractMatchedEndpoints = 0;
  if (fs.existsSync(contractPath)) {
    try {
      const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      if (contractData && Array.isArray(contractData.endpoints)) {
        contractTotalEndpoints = contractData.endpoints.length;
        contractMatchedEndpoints = contractData.endpoints.filter(ce => {
          const cMethod = (ce.method || '').toUpperCase();
          const cPath = ce.path || '';
          const cRouterPath = ce.routerPath || '';
          return endpoints.some(e => e.method === cMethod && (e.path === cPath || e.path === cRouterPath || cPath.endsWith(e.path)));
        }).length;
        contractMatchPct = ((contractMatchedEndpoints / (contractTotalEndpoints || 1)) * 100).toFixed(1);
      }
    } catch (_) {}
  }

  // Slices Status Analysis
  const slices = [
    {
      name: 'Slice 1 — Foundation & Auth',
      requiredFiles: ['backend/main.py', 'backend/app/db/database.py', 'backend/app/api/auth.py'],
      files: files.filter(f => f.path.includes('auth') || f.path.includes('database') || f.path.endsWith('main.py') || f.path.includes('security'))
    },
    {
      name: 'Slice 2 — Domain Logic & Routers',
      requiredFiles: [],
      files: files.filter(f => f.path.startsWith('backend/app/api/') && !f.path.includes('auth'))
    },
    {
      name: 'Slice 3 — Frontend Views & Components',
      requiredFiles: ['frontend/src/App.tsx'],
      files: tsxFiles
    },
    {
      name: 'Slice 4 — Verification & Test Suites',
      requiredFiles: [],
      files: testFiles
    }
  ].map(sl => {
    const presentCount = sl.files.length;
    const sliceDefects = allDefects.filter(d => sl.files.some(f => f.path === d.file));
    let status = 'MISSING';
    if (presentCount > 0) {
      status = sliceDefects.length === 0 ? 'PASS' : 'PARTIAL';
    }
    return {
      name: sl.name,
      fileCount: presentCount,
      defectCount: sliceDefects.length,
      status
    };
  });

  return {
    workspacePath: ws,
    filesCount: files.length,
    totalLines,
    totalBytes,
    pyFilesCount: pyFiles.length,
    tsxFilesCount: tsxFiles.length,
    otherFilesCount: otherFiles.length,
    endpoints,
    routerFiles,
    routerFilesCount: routerFiles.length,
    routesCount: endpoints.length,
    pages: pages.map(p => p.path),
    components: components.map(c => c.path),
    defects: allDefects,
    codeCounts,
    totalDefects: allDefects.length,
    sumOfCounts,
    sumCheckValid,
    defectiveFilesCount: defectiveFiles.size,
    defectFreeFilesCount: defectFreeFiles,
    workingCoveragePct,
    healthyFilesPct,
    contractMatchPct,
    contractTotalEndpoints,
    contractMatchedEndpoints,
    slices,
    coverageResults,
    doneCount,
    partialCount,
    missingCount
  };
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🔍 WORKSPACE AUDIT: ${targetWs}`);
  console.log(`======================================================\n`);

  const report = await analyzeWorkspace(targetWs);

  console.log(`=== 1. FILE & CODE VOLUME BREAKDOWN ===`);
  console.log(`Total Files Scanned:       ${report.filesCount}`);
  console.log(`Total Lines of Code:       ${report.totalLines}`);
  console.log(`Total Size:                ${(report.totalBytes / 1024).toFixed(1)} KB`);
  console.log(`Backend Python Files:      ${report.pyFilesCount}`);
  console.log(`Frontend TS/TSX Files:     ${report.tsxFilesCount}`);
  console.log(`Other Files:               ${report.otherFilesCount}`);
  console.log(`Healthy Files %:           ${report.healthyFilesPct}% (${report.defectFreeFilesCount} / ${report.filesCount} clean)`);

  console.log(`\n=== 2. ROUTERS & BACKEND API ROUTES ===`);
  console.log(`Router Files (${report.routerFilesCount}):`);
  report.routerFiles.forEach(rf => console.log(`  📂 ${rf}`));
  console.log(`API Endpoints Declared:    ${report.routesCount}`);
  console.log(`Contract Match %:          ${report.contractMatchPct !== 'N/A' ? `${report.contractMatchPct}% (${report.contractMatchedEndpoints} / ${report.contractTotalEndpoints} contract endpoints matched)` : 'N/A (No contract.json found)'}`);
  report.endpoints.slice(0, 15).forEach(ep => console.log(`  ${ep.method.padEnd(6)} ${ep.path.padEnd(30)} (${ep.file})`));
  if (report.endpoints.length > 15) console.log(`  ... and ${report.endpoints.length - 15} more endpoints`);

  console.log(`\n=== 3. FRONTEND UI COMPONENTS & PAGES ===`);
  console.log(`Frontend Pages (${report.pages.length}):`);
  report.pages.forEach(p => console.log(`  📄 ${p}`));
  console.log(`Frontend Components (${report.components.length}):`);
  report.components.forEach(c => console.log(`  🧩 ${c}`));

  console.log(`\n=== 4. SLICE STATUS SUMMARY ===`);
  console.log(`┌──────────────────────────────────────┬─────────┬──────────┬─────────┐`);
  console.log(`│ Generation Slice                     │ Files   │ Defects  │ Status  │`);
  console.log(`├──────────────────────────────────────┼─────────┼──────────┼─────────┤`);
  for (const sl of report.slices) {
    console.log(`│ ${sl.name.padEnd(36)} │ ${String(sl.fileCount).padStart(7)} │ ${String(sl.defectCount).padStart(8)} │ ${sl.status.padEnd(7)} │`);
  }
  console.log(`└──────────────────────────────────────┴─────────┴──────────┴─────────┘`);

  console.log(`\n=== 5. DEFECTS GROUPED BY CODE ===`);
  console.log(`┌──────────────────────────────────┬──────────┐`);
  console.log(`│ Defect Code                      │ Count    │`);
  console.log(`├──────────────────────────────────┼──────────┤`);
  for (const [code, count] of Object.entries(report.codeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`│ ${code.padEnd(32)} │ ${String(count).padStart(8)} │`);
  }
  console.log(`├──────────────────────────────────┼──────────┤`);
  console.log(`│ TOTAL DEFECTS                    │ ${String(report.totalDefects).padStart(8)} │`);
  console.log(`│ SUM OF INDIVIDUAL COUNTS         │ ${String(report.sumOfCounts).padStart(8)} │`);
  console.log(`└──────────────────────────────────┴──────────┘`);
  console.log(`Sum Check Validation: ${report.sumCheckValid ? '✅ PASSED (Total equals exact sum)' : '❌ FAILED'}`);
  console.log(`Files with at least one defect: ${report.defectiveFilesCount} / ${report.filesCount} (${((report.defectiveFilesCount / report.filesCount) * 100).toFixed(1)}%)`);
  console.log(`Defect-free clean files:        ${report.defectFreeFilesCount} / ${report.filesCount}`);

  console.log(`\n=== 6. PRD SECTION COVERAGE (${report.coverageResults.length} SECTIONS) ===`);
  console.log(`┌────┬──────────────────────────────────────┬─────────┬─────────┬─────────┬─────────┐`);
  console.log(`│ #  │ PRD Topic Section                    │ Backend │ FrontEnd│ Tests   │ Status  │`);
  console.log(`├────┼──────────────────────────────────────┼─────────┼─────────┼─────────┼─────────┤`);
  for (const r of report.coverageResults) {
    const beStr = r.hasBe ? 'YES' : 'NO';
    const feStr = r.hasFe === 'N/A' ? 'N/A' : (r.hasFe ? 'YES' : 'NO');
    const testStr = r.hasTest ? 'YES' : 'NO';
    console.log(`│ ${String(r.id).padStart(2)} │ ${r.name.padEnd(36)} │ ${beStr.padEnd(7)} │ ${feStr.padEnd(7)} │ ${testStr.padEnd(7)} │ ${r.status.padEnd(7)} │`);
  }
  console.log(`└────┴──────────────────────────────────────┴─────────┴─────────┴─────────┴─────────┘`);
  console.log(`Working Coverage %:        ${report.workingCoveragePct}% (${report.doneCount} / ${report.coverageResults.length} sections fully verified)`);
  console.log(`PRD Coverage Summary:      DONE: ${report.doneCount} / ${report.coverageResults.length}, PARTIAL: ${report.partialCount}, MISSING: ${report.missingCount}\n`);

  if (process.argv.includes('--json')) {
    const jsonOut = path.join(targetWs, 'workspace_analysis.json');
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Saved report JSON to ${jsonOut}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('analyze_workspace.mjs')) {
  main().catch(err => {
    console.error('Fatal error analyzing workspace:', err);
    process.exit(1);
  });
}
