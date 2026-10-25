import assert from 'assert';
import { validateDatabasePhase, DATABASE_DEFECT_CODES } from '../dbValidator.js';
import { repairFile, detectRepairProgress, detectSemanticRepairProgress } from '../repairEngine.js';

async function runTests() {
  console.log('🧪 Starting Focused Regression Suite: ORM Generation & Relationship Repair...\n');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${total}. ${name}`);
    } catch (e) {
      console.error(`  ❌ [FAIL] ${total}. ${name}: ${e.message}`);
      throw e;
    }
  }

  const dummyCaller = async () => JSON.stringify({ isValid: true, semanticIssues: [] });
  const dummySendEvent = () => {};

  const baseDbFile = {
    path: 'backend/app/db/database.py',
    content: `import os\nfrom sqlalchemy import create_engine\nfrom sqlalchemy.orm import declarative_base, sessionmaker\n\nDATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)\nBase = declarative_base()\n\ndef get_db():\n    db = SessionLocal()\n    try:\n        yield db\n    finally:\n        db.close()\n`,
    status: 'validated'
  };

  // 1. duplicate ORM ownership
  await test('duplicate ORM ownership: entity defined in database.py and models.py fails with DB_DUPLICATE_MODEL', async () => {
    const badDatabaseFile = {
      path: 'backend/app/db/database.py',
      content: `import os\nfrom sqlalchemy import create_engine, Column, Integer, String\nfrom sqlalchemy.orm import declarative_base\n\nBase = declarative_base()\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n`,
      status: 'validated'
    };
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String\nfrom app.db.database import Base\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [badDatabaseFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product'], tables: ['products'] } }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, false, 'Duplicate ORM model must fail validation');
    const dupDefect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.DUPLICATE_MODEL);
    assert.ok(dupDefect, 'Must emit DB_DUPLICATE_MODEL');
    assert.strictEqual(dupDefect.file, 'backend/app/db/database.py', 'Defect must implicate unauthorized owner database.py');
    assert.strictEqual(dupDefect.model, 'Product');
  });

  // 2. valid Product ↔ Review relationship
  await test('valid Product ↔ Review bidirectional relationship passes cleanly', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n    reviews = relationship('Review', back_populates='product')\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review'], tables: ['products', 'reviews'] } }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, true, 'Valid reciprocal relationship must pass');
    assert.strictEqual(res.defects.length, 0);
  });

  // 3. missing reciprocal relationship
  await test('missing reciprocal relationship on target model fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review'], tables: ['products', 'reviews'] } }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, false);
    const relDefect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert.ok(relDefect, 'Must emit DB_REL001 defect');
    assert.strictEqual(relDefect.actualState, 'missing');
    assert.strictEqual(relDefect.targetModel, 'Product');
    assert.strictEqual(relDefect.relationship, 'reviews');
    assert.strictEqual(relDefect.sourceModel, 'Review');
    assert.strictEqual(relDefect.sourceRelationship, 'product');
  });

  // 4. wrong reciprocal model
  await test('wrong reciprocal model (unrelated entity mapped) fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Customer(Base):\n    __tablename__ = 'customers'\n    id = Column(Integer, primary_key=True)\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    reviews = relationship('Customer', back_populates='product')\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review', 'Customer'], tables: ['products', 'reviews', 'customers'] } }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP && d.actualState === 'wrong_target_model');
    assert.ok(defect, 'Must detect wrong_target_model on reciprocal relationship');
  });

  // 5. wrong back_populates value
  await test('wrong back_populates value fails with DB_REL001', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    reviews = relationship('Review', back_populates='wrong_item_name')\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review'], tables: ['products', 'reviews'] } }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, false);
    const defect = res.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP && d.actualState === 'wrong_back_populates');
    assert.ok(defect, 'Must detect wrong_back_populates on reciprocal relationship');
  });

  // 6. incorrect repair must be rejected
  await test('incorrect repair attempting to patch unrelated model must be rejected', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Customer(Base):\n    __tablename__ = 'customers'\n    id = Column(Integer, primary_key=True)\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'repairing',
      repairAttempts: 0
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'repairing', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review', 'Customer'], tables: ['products', 'reviews', 'customers'] } }
    };

    const initVal = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    const defect = initVal.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert.ok(defect);

    // Invalid patch: patches Customer instead of Product
    const badPatch = `<patch file="${modelsFile.path}">\n<search>\nclass Customer(Base):\n    __tablename__ = 'customers'\n    id = Column(Integer, primary_key=True)\n</search>\n<replace>\nclass Customer(Base):\n    __tablename__ = 'customers'\n    id = Column(Integer, primary_key=True)\n    reviews = relationship('Review', back_populates='product')\n</replace>\n</patch>`;

    const repairRes = await repairFile({
      fileDef: modelsFile,
      activeModule: { id: 'MOD-000', name: 'Database Architecture & Schema', layer: 'DATABASE' },
      manifest,
      defects: [defect],
      caller: async () => badPatch,
      sendEvent: () => {},
      generationId: 'test-bad-repair',
      validateFn: async () => {
        // Semantic validation rerun after patch
        const reval = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
        return { isValid: reval.isValid, errors: reval.errors, defects: reval.defects };
      }
    });

    assert.strictEqual(repairRes.success, false, 'Invalid repair must NOT report success');
    assert.strictEqual(modelsFile.status === 'validated', false, 'File must not be validated after invalid repair');
  });

  // 7. valid repair must pass
  await test('valid repair correctly adding reciprocal relationship passes and marks repaired', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'repairing',
      repairAttempts: 0
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'repairing', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['Product', 'Review'], tables: ['products', 'reviews'] } }
    };

    const initVal = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    const defect = initVal.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    assert.ok(defect);

    // Correct reciprocal patch on Product
    const validPatch = `<patch file="${modelsFile.path}">\n<search>\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n</search>\n<replace>\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    reviews = relationship('Review', back_populates='product')\n</replace>\n</patch>`;

    const repairRes = await repairFile({
      fileDef: modelsFile,
      activeModule: { id: 'MOD-000', name: 'Database Architecture & Schema', layer: 'DATABASE' },
      manifest,
      defects: [defect],
      caller: async () => validPatch,
      sendEvent: () => {},
      generationId: 'test-valid-repair',
      validateFn: async () => {
        const reval = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
        return { isValid: reval.isValid, errors: reval.errors, defects: reval.defects };
      }
    });

    assert.strictEqual(repairRes.success, true, 'Valid repair must succeed');
    assert.strictEqual(repairRes.status, 'repaired');
    assert.strictEqual(modelsFile.status, 'validated');
    const finalVal = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(finalVal.isValid, true, 'Final validation must pass');
  });

  // 8. repair oscillation
  await test('repair oscillation halts with OSCILLATION and terminates repair loop', async () => {
    const hashA = 'hash_state_a';
    const hashB = 'hash_state_b';
    const defect = { code: 'DB_REL001', message: 'Broken relationship' };

    const history = [
      { attempt: 1, hashBefore: hashA, hashAfter: hashB, defectsBefore: [defect], defectsAfter: [defect] }
    ];

    const progress = detectRepairProgress({
      hashBefore: hashB,
      hashAfter: hashA, // Oscillated back to hashA!
      defectsBefore: [defect],
      defectsAfter: [defect],
      attempt: 2,
      history
    });

    assert.strictEqual(progress.status, 'OSCILLATION', 'Oscillating to previously seen hash must yield OSCILLATION');

    // Also verify detectSemanticRepairProgress oscillation
    const semanticProg = detectSemanticRepairProgress({
      previous: {
        attempt: 1,
        fingerprint: 'fp_a',
        history: [{ attempt: 1, fingerprint: 'fp_a', fileHashesAfter: { 'models.py': 'h1' } }]
      },
      defects: [{ code: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP, model: 'Product', relationship: 'reviews' }],
      fileHashes: { 'models.py': 'h1' }
    });
    assert.strictEqual(semanticProg.status, 'SEMANTIC_REPAIR_OSCILLATION');
  });

  // 9. multiple related entities
  await test('multiple related entities (User, Order, OrderItem, Product, Review, Category) validate cleanly', async () => {
    const complexModelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, Float, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass User(Base):\n    __tablename__ = 'users'\n    id = Column(Integer, primary_key=True)\n    email = Column(String(100), unique=True)\n    orders = relationship('Order', back_populates='user')\n    reviews = relationship('Review', back_populates='user')\n\nclass Category(Base):\n    __tablename__ = 'categories'\n    id = Column(Integer, primary_key=True)\n    parent_id = Column(Integer, ForeignKey('categories.id'), nullable=True)\n    parent = relationship('Category', remote_side=[id], back_populates='children')\n    children = relationship('Category', back_populates='parent')\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n    price = Column(Float)\n    reviews = relationship('Review', back_populates='product')\n    order_items = relationship('OrderItem', back_populates='product')\n\nclass Order(Base):\n    __tablename__ = 'orders'\n    id = Column(Integer, primary_key=True)\n    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)\n    user = relationship('User', back_populates='orders')\n    items = relationship('OrderItem', back_populates='order')\n\nclass OrderItem(Base):\n    __tablename__ = 'order_items'\n    id = Column(Integer, primary_key=True)\n    order_id = Column(Integer, ForeignKey('orders.id'), nullable=False)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    order = relationship('Order', back_populates='items')\n    product = relationship('Product', back_populates='order_items')\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n    user = relationship('User', back_populates='reviews')\n`,
      status: 'validated'
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'validated', required_files: [baseDbFile, complexModelsFile] }],
      project_requirements: {
        database: {
          entities: ['User', 'Category', 'Product', 'Order', 'OrderItem', 'Review'],
          tables: ['users', 'categories', 'products', 'orders', 'order_items', 'reviews']
        }
      }
    };

    const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(res.isValid, true, 'Complex multi-entity relational graph must pass with 0 defects');
    assert.strictEqual(res.defects.length, 0);
  });

  // 10. existing valid relationships must remain unchanged
  await test('existing valid relationships remain unchanged during targeted repairs', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, String, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.db.database import Base\n\nclass User(Base):\n    __tablename__ = 'users'\n    id = Column(Integer, primary_key=True)\n    orders = relationship('Order', back_populates='user')\n\nclass Order(Base):\n    __tablename__ = 'orders'\n    id = Column(Integer, primary_key=True)\n    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)\n    user = relationship('User', back_populates='orders')\n\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n\nclass Review(Base):\n    __tablename__ = 'reviews'\n    id = Column(Integer, primary_key=True)\n    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)\n    product = relationship('Product', back_populates='reviews')\n`,
      status: 'repairing',
      repairAttempts: 0
    };

    const manifest = {
      modules: [{ id: 'MOD-000', layer: 'DATABASE', status: 'repairing', required_files: [baseDbFile, modelsFile] }],
      project_requirements: { database: { entities: ['User', 'Order', 'Product', 'Review'], tables: ['users', 'orders', 'products', 'reviews'] } }
    };

    // User <-> Order is valid. Product <-> Review is broken (Product missing reviews).
    const initVal = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
    assert.strictEqual(initVal.isValid, false);
    assert.strictEqual(initVal.defects.length, 1);
    assert.strictEqual(initVal.defects[0].model, 'Product');

    // Repair Product
    const validPatch = `<patch file="${modelsFile.path}">\n<search>\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n</search>\n<replace>\nclass Product(Base):\n    __tablename__ = 'products'\n    id = Column(Integer, primary_key=True)\n    reviews = relationship('Review', back_populates='product')\n</replace>\n</patch>`;

    const repairRes = await repairFile({
      fileDef: modelsFile,
      activeModule: { id: 'MOD-000', name: 'Database Architecture & Schema', layer: 'DATABASE' },
      manifest,
      defects: initVal.defects,
      caller: async () => validPatch,
      sendEvent: () => {},
      generationId: 'test-preserve-valid',
      validateFn: async () => {
        const reval = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
        return { isValid: reval.isValid, errors: reval.errors, defects: reval.defects };
      }
    });

    assert.strictEqual(repairRes.success, true);
    assert.ok(modelsFile.content.includes("orders = relationship('Order', back_populates='user')"), 'User.orders must be preserved');
    assert.ok(modelsFile.content.includes("user = relationship('User', back_populates='orders')"), 'Order.user must be preserved');
    assert.ok(modelsFile.content.includes("reviews = relationship('Review', back_populates='product')"), 'Product.reviews must be added');
    assert.ok(modelsFile.content.includes("product = relationship('Product', back_populates='reviews')"), 'Review.product must be preserved');
  });

  console.log(`\n======================================================================`);
  console.log(`Focused Regression Results: ${passed}/${total} tests passed (100%)`);
  console.log(`======================================================================\n`);
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
