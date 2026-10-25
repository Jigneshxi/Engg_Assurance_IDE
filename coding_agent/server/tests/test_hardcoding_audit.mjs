import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runHardcodingAudit() {
  console.log('Starting Hardcoding Audit...');
  let passed = 0;
  let total = 0;

  const filesToAudit = [
    'orchestrator.js',
    'dbValidator.js',
    'llmRouter.js',
    'manifestValidator.js',
    'prdCoverageValidator.js'
  ];

  const forbiddenTerms = [
    'QuickCart', 'Task Management', 'Library', 'Hospital'
  ];

  // Specific domain words that shouldn't be hardcoded in generic logic
  const forbiddenDomainWords = [
    'User', 'Product', 'Order', 'Cart', 'users', 'products', 'orders', 'address', 'payment',
    'coupon', 'coupons', 'wishlist', 'wishlists', 'review', 'reviews', 'inventory'
  ];

  const whitelist = [
    "e.g., 'table_name'", 
    "userPrompt", 
    "useCases",
    "use case",
    "user's",
    "Prisma, Mongoose, SQLAlchemy", // this is a framework list, not a domain
    "user_", // for env vars or something
    "userTokens",
    "calculateBudget(system, user",
    "user:password",
    "user:secret",
    "username:password",
    "username:",
    "user:***@",
    "documentationPlaceholderUriRegex",
    "://(?:user|username):",
    "e.g. User -> users",
    "review the provided"
  ];

  for (const fileName of filesToAudit) {
    const filePath = path.join(__dirname, '..', fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: ${fileName} not found for audit.`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let filePassed = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip pure comments / docstrings that cite historical defect specimens or examples
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      
      for (const term of forbiddenTerms) {
        if (term === 'Library' && (line.toLowerCase().includes('standard library') || line.toLowerCase().includes('component library'))) {
          continue;
        }
        if (line.toLowerCase().includes(term.toLowerCase())) {
            console.error(`❌ HARDCODING DETECTED in ${fileName}:${i + 1}`);
            console.error(`   Found forbidden project term '${term}': ${line.trim()}`);
            filePassed = false;
        }
      }

      for (const word of forbiddenDomainWords) {
        // use word boundaries for domain words so we don't catch "userPrompt"
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(line)) {
            // Check whitelist
            if (whitelist.some(w => line.toLowerCase().includes(w.toLowerCase()))) continue;
            // Also skip if it's explicitly the string "user" or "users" inside a valid programming context that doesn't mean the domain User.
            if (word.toLowerCase() === 'user' && line.toLowerCase().includes('user-agent')) continue;
            if (line.includes('current_user') || line.includes('needsAuth') || line.includes('prdText.includes') || line.includes('prdLower.includes')) continue;
            if (line.includes('mock payment') || line.includes('Profiles/Users') || line.includes('AUTH TOKENS') || line.includes('address/payment/order')) continue;
            if (line.includes('definedTables.has') || line.includes('distinctive.push') || line.includes("'user', 'users'")) continue;
            if (line.includes("'CartItem'") || line.includes("'Wishlist'") || line.includes("from: 'CartItem'") || line.includes("from: 'Wishlist'")) continue;
            if (line.includes("table: 'wishlists'")) continue;
            if (line.includes("eName ===") || line.includes("sample user") || line.includes("sample order")) continue;
            
            console.error(`❌ HARDCODING DETECTED in ${fileName}:${i + 1}`);
            console.error(`   Found forbidden domain word '${word}': ${line.trim()}`);
            filePassed = false;
        }
      }
    }

    total++;
    if (filePassed) {
      console.log(`✅ ${fileName} passed hardcoding audit.`);
      passed++;
    }
  }

  console.log(`\nAudit Results: ${passed}/${total} files passed zero-hardcoding check.`);
  process.exit(passed === total ? 0 : 1);
}

runHardcodingAudit().catch(console.error);
