import {
  parsePatch,
  validatePatch,
  applyPatch,
  detectRepairProgress,
  detectSemanticRepairProgress,
  generateFileHash,
  buildRepairContext,
  getRepairStrategy,
  repairFile,
  stripLineNumberPrefixes
} from '../repairEngine.js';
import { DATABASE_DEFECT_CODES, scanForCredentials, validateDatabasePhase } from '../dbValidator.js';

async function runTests() {
  let passed = 0;
  let total = 0;

  const test = (name, fn) => {
    total++;
    try {
      fn();
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ Test ${total} FAIL: ${name}`);
      console.error('   ', e.message);
    }
  };

  const testAsync = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`✅ Test ${total} PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ Test ${total} FAIL: ${name}`);
      console.error('   ', e.message);
    }
  };

  // 1. Strategy mapping
  test('Strategy Mapping: DB001 maps to DatabaseCredentialRepairStrategy', () => {
    const s = getRepairStrategy(DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED);
    if (s.name !== 'DatabaseCredentialRepairStrategy') throw new Error(`Wrong strategy: ${s.name}`);
    if (!s.instructions.some(i => i.includes('environment variable'))) throw new Error('Missing instructions');
  });

  // 2. Parse XML patch
  test('Parse XML patch format', () => {
    const raw = `<patch file="backend/app/db/database.py">
<search>
DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
</search>
<replace>
DATABASE_URL = os.getenv("DATABASE_URL")
</replace>
</patch>`;
    const res = parsePatch(raw, 'backend/app/db/database.py');
    if (!res.valid) throw new Error(`Failed to parse: ${res.error}`);
    if (res.patch.search.trim() !== 'DATABASE_URL = "postgresql://user:pass@localhost:5432/db"') {
      throw new Error(`Search mismatch: ${res.patch.search}`);
    }
    if (res.patch.replace.trim() !== 'DATABASE_URL = os.getenv("DATABASE_URL")') {
      throw new Error(`Replace mismatch: ${res.patch.replace}`);
    }
  });

  // 3. Parse JSON patch
  test('Parse JSON patch format', () => {
    const raw = JSON.stringify({
      action: 'replace',
      file: 'backend/app/db/database.py',
      search: 'DATABASE_URL = "postgresql://user:pass@localhost:5432/db"',
      replace: 'DATABASE_URL = os.getenv("DATABASE_URL")'
    });
    const res = parsePatch(raw, 'backend/app/db/database.py');
    if (!res.valid) throw new Error(`Failed to parse JSON: ${res.error}`);
    if (!res.patch.search.includes('postgresql')) throw new Error('Search mismatch');
  });

  // 4. Validate patch: Path mismatch
  test('Validate patch rejects mismatched file path', () => {
    const patch = {
      file: 'backend/app/db/wrong.py',
      search: 'DATABASE_URL = 1',
      replace: 'DATABASE_URL = 2'
    };
    const res = validatePatch({
      patch,
      existingContent: 'DATABASE_URL = 1',
      filePath: 'backend/app/db/database.py'
    });
    if (res.valid) throw new Error('Should have rejected path mismatch');
  });

  // 5. Validate patch: Search target not in existing file
  test('Validate patch rejects search target not found in file', () => {
    const patch = {
      file: 'backend/app/db/database.py',
      search: 'NON_EXISTENT_CODE_LINE_123',
      replace: 'NEW_CODE'
    };
    const res = validatePatch({
      patch,
      existingContent: 'const a = 1;\nconst b = 2;',
      filePath: 'backend/app/db/database.py'
    });
    if (res.valid) throw new Error('Should have rejected missing search target');
  });

  // 6. Validate patch: Rejects patch introducing new hardcoded credentials
  test('Validate patch rejects replacement containing hardcoded credentials', () => {
    const patch = {
      file: 'backend/app/db/database.py',
      search: 'DATABASE_URL = "old"',
      replace: 'DATABASE_URL = "postgresql://admin:newsecret123@localhost:5432/db"'
    };
    const res = validatePatch({
      patch,
      existingContent: 'DATABASE_URL = "old"',
      filePath: 'backend/app/db/database.py'
    });
    if (res.valid) throw new Error('Should have rejected replacement with hardcoded credentials');
    if (!res.error.includes('credentials')) throw new Error(`Expected credential error, got: ${res.error}`);
  });

  // 7. Apply patch cleanly preserving other lines
  test('Apply patch preserves all surrounding lines', () => {
    const original = `import os
from sqlalchemy import create_engine
DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
engine = create_engine(DATABASE_URL)
def get_db():
    pass`;

    const patch = {
      file: 'database.py',
      search: 'DATABASE_URL = "postgresql://user:pass@localhost:5432/db"',
      replace: 'DATABASE_URL = os.getenv("DATABASE_URL")'
    };

    const res = applyPatch({ patch, existingContent: original });
    if (!res.applied) throw new Error('Failed to apply');
    if (!res.newContent.includes('import os')) throw new Error('Lost import os');
    if (!res.newContent.includes('def get_db():')) throw new Error('Lost function get_db');
    if (res.newContent.includes('user:pass@')) throw new Error('Old credential still present');
    if (!res.newContent.includes('os.getenv("DATABASE_URL")')) throw new Error('New code missing');
  });

  // 8. Progress Detection: NO_CHANGE
  test('Progress Detection: Detects NO_CHANGE when hash unchanged', () => {
    const res = detectRepairProgress({
      hashBefore: 'abc123',
      hashAfter: 'abc123',
      attempt: 1
    });
    if (res.status !== 'NO_CHANGE') throw new Error(`Expected NO_CHANGE, got ${res.status}`);
  });

  // 9. Progress Detection: NO_IMPROVEMENT
  test('Progress Detection: Detects NO_IMPROVEMENT on identical defect repeat', () => {
    const defect = {
      code: 'DB001',
      locations: [{ line: 10, column: 5 }]
    };
    const res = detectRepairProgress({
      hashBefore: 'hash1',
      hashAfter: 'hash2',
      defectsBefore: [defect],
      defectsAfter: [defect],
      attempt: 2
    });
    if (res.status !== 'NO_IMPROVEMENT') throw new Error(`Expected NO_IMPROVEMENT, got ${res.status}`);
  });

  // 10. Progress Detection: RESOLVED
  test('Progress Detection: Detects RESOLVED when remaining defects is 0', () => {
    const res = detectRepairProgress({
      hashBefore: 'hash1',
      hashAfter: 'hash2',
      defectsBefore: [{ code: 'DB001' }],
      defectsAfter: [],
      attempt: 1
    });
    if (res.status !== 'RESOLVED') throw new Error(`Expected RESOLVED, got ${res.status}`);
  });

  // 11. Build Repair Context redacts secrets
  test('Build Repair Context never exposes secrets in prompt', () => {
    const ctx = buildRepairContext({
      fileDef: {
        path: 'backend/app/db/database.py',
        content: 'DATABASE_URL = "postgresql://user:secret999@localhost/db"'
      },
      activeModule: { id: 'MOD-000', name: 'Database' },
      manifest: {},
      defects: [{
        code: 'DB001',
        validator: 'database_credentials',
        severity: 'HIGH',
        message: 'Hardcoded database credentials detected',
        locations: [{ line: 1, column: 1 }],
        evidence: 'DATABASE_URL = "postgresql://user:secret999@localhost/db"',
        remediation: 'Load from env'
      }]
    });
    if (ctx.userPrompt.includes('secret999')) {
      throw new Error('SECURITY VIOLATION: Unredacted secret in repair prompt!');
    }
    if (!ctx.userPrompt.includes('***')) {
      throw new Error('Expected redacted secret in evidence');
    }
  });

  // 12. Redacted credential lines can be repaired against the original file
  test('Apply redacted credential patch without exposing or retaining the secret', () => {
    const secret = 'postgresql://user:secret999@localhost/db';
    const original = `import os\nDATABASE_URL = os.getenv("DATABASE_URL", "${secret}")\nengine = create_engine(DATABASE_URL)`;
    const ctx = buildRepairContext({
      fileDef: { path: 'backend/app/db/database.py', content: original },
      activeModule: { id: 'MOD-000', name: 'Database' },
      manifest: {},
      defects: [{
        code: DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED,
        validator: 'database_credentials',
        severity: 'HIGH',
        message: 'Hardcoded database credentials detected',
        locations: [{ line: 2, column: 1 }],
        evidence: `DATABASE_URL = os.getenv("DATABASE_URL", "${secret}")`,
        remediation: 'Load credentials from environment variables'
      }]
    });
    const patch = {
      file: 'backend/app/db/database.py',
      search: 'DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:***@localhost/db")',
      replace: 'DATABASE_URL = os.getenv("DATABASE_URL")'
    };

    if (ctx.userPrompt.includes(secret)) throw new Error('Repair prompt exposed the secret');
    const validation = validatePatch({ patch, existingContent: original, filePath: patch.file });
    if (!validation.valid) throw new Error(`Redacted patch was rejected: ${validation.error}`);

    const result = applyPatch({ patch, existingContent: original });
    if (!result.applied) throw new Error(`Redacted patch was not applied: ${result.error}`);
    if (result.newContent.includes(secret)) throw new Error('Original secret remains after repair');
    if (scanForCredentials({ path: patch.file, content: result.newContent }).length > 0) {
      throw new Error('Credential validator still detects a secret after repair');
    }
    if (!result.newContent.includes('engine = create_engine(DATABASE_URL)')) {
      throw new Error('Repair did not preserve surrounding code');
    }
  });

  // 13. Ambiguous redacted matches are rejected rather than patching the wrong line
  test('Reject ambiguous redacted credential matches', () => {
    const original = [
      'DATABASE_URL = "postgresql://user:firstsecret@localhost/db"',
      'DATABASE_URL = "postgresql://user:secondsecret@localhost/db"'
    ].join('\n');
    const patch = {
      file: 'backend/app/db/database.py',
      search: 'DATABASE_URL = "postgresql://user:***@localhost/db"',
      replace: 'DATABASE_URL = os.getenv("DATABASE_URL")'
    };

    const validation = validatePatch({ patch, existingContent: original, filePath: patch.file });
    if (validation.valid || !validation.error.includes('ambiguous')) {
      throw new Error(`Expected ambiguous patch rejection, got: ${validation.error || 'valid'}`);
    }
    const result = applyPatch({ patch, existingContent: original });
    if (result.applied) throw new Error('Ambiguous patch must not be applied');
    if (!result.newContent.includes('firstsecret') || !result.newContent.includes('secondsecret')) {
      throw new Error('Ambiguous patch changed the original content');
    }
  });

  // 14. DB_REL001 uses a dedicated relationship repair strategy
  test('DB_REL001 selects RelationshipRepairStrategy', () => {
    const strategy = getRepairStrategy(DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (strategy.name !== 'RelationshipRepairStrategy') throw new Error(`Wrong strategy: ${strategy.name}`);
    if (!strategy.instructions.some(instruction => instruction.includes('back_populates'))) {
      throw new Error('Relationship strategy must repair reciprocal back_populates attributes');
    }
  });

  // 15. Structured ORM defect context carries the source/target contract
  test('Repair context includes precise ORM relationship metadata', () => {
    const context = buildRepairContext({
      fileDef: { path: 'backend/app/db/models.py', content: 'class Product(Base):\n    pass' },
      activeModule: { id: 'MOD-000', name: 'Database Architecture & Schema' },
      manifest: {},
      defects: [{
        code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
        validator: 'back_populates',
        file: 'backend/app/db/models.py',
        model: 'Product',
        relationship: 'order_items',
        sourceModel: 'OrderItem',
        sourceRelationship: 'product',
        targetModel: 'Product',
        expectedReciprocal: 'Product.order_items',
        expectedBackPopulates: 'product',
        foreignKeys: ['products.id'],
        actualState: 'missing',
        message: 'OrderItem.product expects Product.order_items'
      }]
    });
    for (const value of ['Product.order_items', 'OrderItem', 'product', 'products.id', 'actualState']) {
      if (!context.userPrompt.includes(value)) throw new Error(`Repair context omitted ${value}`);
    }
    if (!context.userPrompt.includes('targeted')) throw new Error('Repair context must require a targeted patch');
  });

  // 16. Repeated identical semantic defects stop even if unrelated text changed
  test('Semantic repair progress detects unchanged DB_REL001 fingerprints', () => {
    const defect = {
      code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
      validator: 'back_populates',
      file: 'backend/app/db/models.py',
      model: 'Product',
      relationship: 'order_items',
      sourceModel: 'OrderItem',
      sourceRelationship: 'product',
      targetModel: 'Product',
      expectedReciprocal: 'Product.order_items',
      actualState: 'missing'
    };
    const first = detectSemanticRepairProgress({ defects: [defect], fileHashes: { 'backend/app/db/models.py': 'hash-before' } });
    if (first.status !== 'PROGRESS' || first.attempt !== 1) throw new Error('First semantic attempt should be recorded');

    const repeated = detectSemanticRepairProgress({
      previous: first.state,
      defects: [defect],
      fileHashes: { 'backend/app/db/models.py': 'hash-after-unrelated-edit' }
    });
    if (repeated.status !== 'SEMANTIC_REPAIR_NO_PROGRESS') {
      throw new Error(`Expected SEMANTIC_REPAIR_NO_PROGRESS, got ${repeated.status}`);
    }

    const defectChanged = detectSemanticRepairProgress({
      previous: first.state,
      defects: [{ ...defect, actualState: 'wrong_back_populates' }],
      fileHashes: { 'backend/app/db/models.py': 'hash-after' }
    });
    if (defectChanged.status !== 'PROGRESS' || defectChanged.attempt !== 2) {
      throw new Error('A changed semantic defect should permit a specific retry');
    }
  });

  // 17. Targeted ORM patch is applied and the semantic validator passes
  await testAsync('Targeted ORM repair preserves the model file and resolves DB_REL001', async () => {
    const fileDef = {
      path: 'backend/app/db/models.py',
      status: 'repairing',
      content: `class Base: pass\nclass OrderItem(Base):\n    __tablename__ = 'order_items'\n    product = relationship('Product', back_populates='order_items')\nclass Product(Base):\n    __tablename__ = 'products'`
    };
    const requirements = { entities: ['OrderItem', 'Product'], tables: ['order_items', 'products'] };
    const manifest = {
      project_requirements: { database: requirements },
      modules: [{ layer: 'DATABASE', required_files: [fileDef] }]
    };
    const semanticCaller = async () => JSON.stringify({ isValid: true, semanticIssues: [] });
    const initialValidation = await validateDatabasePhase(manifest.modules, manifest, '', semanticCaller, () => {});
    const defect = initialValidation.defects.find(item => item.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!defect) throw new Error('Expected a DB_REL001 defect before repair');

    const patch = `<patch file="${fileDef.path}">\n<search>\nclass Product(Base):\n    __tablename__ = 'products'\n</search>\n<replace>\nclass Product(Base):\n    __tablename__ = 'products'\n    order_items = relationship('OrderItem', back_populates='product')\n</replace>\n</patch>`;
    const repairCaller = async (_systemPrompt, userPrompt) => {
      if (!userPrompt.includes('Product.order_items')) throw new Error('Specific reciprocal missing from repair prompt');
      return patch;
    };
    const repair = await repairFile({
      fileDef,
      activeModule: { id: 'MOD-000', name: 'Database Architecture & Schema' },
      manifest,
      defects: [defect],
      caller: repairCaller,
      sendEvent: () => {},
      generationId: 'orm-targeted-repair-test',
      validateFn: async repairedFile => {
        const result = await validateDatabasePhase(manifest.modules, manifest, '', semanticCaller, () => {});
        if (!repairedFile.content.includes('class OrderItem(Base):')) throw new Error('Unrelated model was removed');
        return { isValid: result.isValid, errors: result.errors };
      }
    });

    if (!repair.success || (repair.status !== 'repaired' && repair.status !== 'validated')) throw new Error(`Repair failed: ${repair.status}`);
    const finalValidation = await validateDatabasePhase(manifest.modules, manifest, '', semanticCaller, () => {});
    if (!finalValidation.isValid) throw new Error(`ORM semantic validation still fails: ${finalValidation.errors.join('; ')}`);
  });

  const readmeFile = () => ({
    path: 'README.md',
    status: 'repairing',
    repairAttempts: 0,
    content: '# Shop\n\nDATABASE_URL=postgresql://shop_admin:secret123@db.example.com:5432/shop\n'
  });
  const readmeDefect = file => scanForCredentials(file)[0];
  const readmePatch = file => `<patch file="${file.path}">\n<search>\nDATABASE_URL=postgresql://shop_admin:***@db.example.com:5432/shop\n</search>\n<replace>\nDATABASE_URL=\u0024{DATABASE_URL}\n</replace>\n</patch>`;

  // 18. A matching README patch repairs only the unsafe documentation line
  await testAsync('README targeted patch succeeds when the search block matches', async () => {
    const fileDef = readmeFile();
    const original = fileDef.content;
    const repair = await repairFile({
      fileDef,
      activeModule: { id: 'MOD-007', name: 'Documentation' },
      manifest: {},
      defects: [readmeDefect(fileDef)],
      caller: async () => readmePatch(fileDef),
      sendEvent: () => {},
      generationId: 'readme-matching-patch-test',
      validateFn: async () => ({ isValid: true, errors: [] })
    });
    if (!repair.success || (repair.status !== 'repaired' && repair.status !== 'validated')) throw new Error(`Expected README repair success, got ${repair.status}`);
    if (fileDef.content === original || fileDef.content.includes('secret123')) throw new Error('README repair did not safely replace the credential URL');
    if (!fileDef.content.includes('# Shop')) throw new Error('README repair removed unrelated content');
  });

  // 19. A stale README search block gets one fresh, content-hash-bound retry
  await testAsync('README targeted patch retries once against current content', async () => {
    const fileDef = readmeFile();
    const original = fileDef.content;
    const currentHash = generateFileHash(original);
    let calls = 0;
    const repair = await repairFile({
      fileDef,
      activeModule: { id: 'MOD-007', name: 'Documentation' },
      manifest: {},
      defects: [readmeDefect(fileDef)],
      caller: async (_systemPrompt, userPrompt) => {
        calls++;
        if (calls === 1) {
          return `<patch file="${fileDef.path}"><search>DATABASE_URL=postgresql://shop_admin:***@db.example.com:5432/old_shop</search><replace>DATABASE_URL=\u0024{DATABASE_URL}</replace></patch>`;
        }
        const retryContext = {
          retryMarker: userPrompt.includes('PATCH SEARCH RETRY'),
          contentHash: userPrompt.includes(currentHash),
          redactedCurrentLine: userPrompt.includes('DATABASE_URL=postgresql://shop_admin:***@db.example.com:5432/shop'),
          secretRedacted: !userPrompt.includes('secret123')
        };
        if (Object.values(retryContext).some(present => !present)) {
          throw new Error(`Retry context was incomplete: ${JSON.stringify(retryContext)}`);
        }
        return readmePatch(fileDef);
      },
      sendEvent: () => {},
      generationId: 'readme-stale-patch-test',
      validateFn: async () => ({ isValid: true, errors: [] })
    });
    if (!repair.success || calls !== 2) throw new Error(`Expected one targeted retry and success, got status=${repair.status}, calls=${calls}, error=${repair.error}`);
    if (fileDef.content.includes('secret123')) throw new Error('Retried README repair retained the credential');
  });

  // 20. A patch that still cannot match returns structured failure without mutation
  await testAsync('README failed patch returns structured details and preserves content', async () => {
    const fileDef = readmeFile();
    fileDef.repairAttempts = 2;
    fileDef.fallbackAttempted = true;
    const original = fileDef.content;
    let calls = 0;
    const stalePatch = `<patch file="${fileDef.path}"><search>STALE README BLOCK</search><replace>DATABASE_URL=\u0024{DATABASE_URL}</replace></patch>`;
    const repair = await repairFile({
      fileDef,
      activeModule: { id: 'MOD-007', name: 'Documentation' },
      manifest: {},
      defects: [readmeDefect(fileDef)],
      caller: async () => { calls++; return stalePatch; },
      sendEvent: () => {},
      generationId: 'readme-failed-patch-test',
      validateFn: async () => ({ isValid: true, errors: [] })
    });
    const failure = repair.failure;
    if (repair.success || repair.status !== 'failed' || calls !== 2) throw new Error('Expected both targeted patch attempts to fail');
    if (fileDef.content !== original) throw new Error('Failed patch changed README content');
    if (failure?.file !== fileDef.path || failure?.defectCode !== 'DB001' || !failure.patchReason || failure.currentContentHash !== generateFileHash(original) || !failure.attemptedRepair || !failure.remainingDefect) {
      throw new Error('Structured repair failure omitted required diagnostic fields');
    }
  });

  // 21. stripLineNumberPrefixes helper test
  test('stripLineNumberPrefixes strips line numbers while preserving blank lines and indent', () => {
    const numbered = '79: </xml>\n80: ```\n81:     @router.post("/checkout")';
    const stripped = stripLineNumberPrefixes(numbered);
    const expected = '</xml>\n```\n    @router.post("/checkout")';
    if (stripped !== expected) throw new Error(`Expected:\n${expected}\nGot:\n${stripped}`);
  });

  // 22. Validate and apply patch succeeds when search block contains prompt line numbers
  test('Validate and apply patch succeeds when search block contains prompt line numbers', () => {
    const existingContent = 'def checkout():\n    pass\n</xml>\n```\n@router.post("/checkout")\ndef place_order():\n    return True\n';
    const patch = {
      file: 'backend/app/api/checkout.py',
      search: '3: </xml>\n4: ```\n5: @router.post("/checkout")',
      replace: '@router.post("/checkout")'
    };
    const validation = validatePatch({ patch, existingContent, filePath: 'backend/app/api/checkout.py' });
    if (!validation.valid) throw new Error(`Validation failed: ${validation.error}`);
    const applied = applyPatch({ patch, existingContent });
    if (!applied.applied) throw new Error('Patch was not applied');
    if (applied.newContent.includes('</xml>') || applied.newContent.includes('```')) {
      throw new Error('Unwanted markup remained after applying patch');
    }
    if (!applied.newContent.includes('@router.post("/checkout")')) {
      throw new Error('Desired function header was removed');
    }
  });

  console.log(`\nResults: ${passed}/${total} repair engine unit tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
