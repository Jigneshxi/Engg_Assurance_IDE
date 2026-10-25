import { validateDatabasePhase, DATABASE_DEFECT_CODES, scanForCredentials } from '../dbValidator.js';
import { getDatabaseRepairTargets, completeValidatedModule } from '../orchestrator.js';
import { detectSemanticRepairProgress } from '../repairEngine.js';

const mockCaller = async () => JSON.stringify({ isValid: true, semanticIssues: [] });
const sendEvent = () => {};

async function runTests() {
  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
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

  const createManifest = (files, reqs) => ({
    project_requirements: { database: reqs },
    modules: [{ layer: 'DATABASE', required_files: files }]
  });

  const baseFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`,
    status: 'validated'
  };

  // 1. Valid SQLAlchemy relationships
  await test('valid SQLAlchemy relationships', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    order_items = relationship('OrderItem', back_populates='product')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem', 'Product'],
      tables: ['order_items', 'products'],
      relationships: [],
      foreign_keys: [],
      constraints: [],
      indexes: [],
      migrations_required: false,
      seed_required: false,
      initialization_requirements: false
    };
    const files = [baseFile, modelsFile];
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true }
    );
    if (!result.isValid) {
      throw new Error(`Expected valid, got errors: ${result.errors.join('; ')}`);
    }
  });

  // 2. Missing back_populates reciprocal relationship
  await test('missing back_populates reciprocal relationship', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem', 'Product'],
      tables: ['order_items', 'products']
    };
    const files = [baseFile, modelsFile];
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true }
    );
    if (result.isValid) throw new Error('Expected failure for missing reciprocal relationship');
    const relDefect = result.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!relDefect) throw new Error('Expected DB_REL001 defect');
    if (relDefect.file !== 'backend/app/db/models.py') {
      throw new Error(`Expected file backend/app/db/models.py, got ${relDefect.file}`);
    }
    if (relDefect.model !== 'Product' || relDefect.relationship !== 'order_items') {
      throw new Error(`Expected Product.order_items defect, got ${relDefect.model}.${relDefect.relationship}`);
    }
  });

  // 3. Mismatched back_populates
  await test('mismatched back_populates', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    order_items = relationship('OrderItem', back_populates='wrong_name')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem', 'Product'],
      tables: ['order_items', 'products']
    };
    const files = [baseFile, modelsFile];
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true }
    );
    if (result.isValid) throw new Error('Expected failure for mismatched back_populates');
    const relDefect = result.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!relDefect) throw new Error('Expected DB_REL001 defect');
    if (relDefect.file !== 'backend/app/db/models.py') {
      throw new Error(`Expected target file models.py, got ${relDefect.file}`);
    }
  });

  // 4. Missing referenced table
  await test('missing referenced table', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('nonexistent_table.id'))
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem'],
      tables: ['order_items']
    };
    const files = [baseFile, modelsFile];
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true }
    );
    if (result.isValid) throw new Error('Expected failure for missing referenced table');
    const relDefect = result.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!relDefect) throw new Error('Expected DB_REL001 defect');
    if (relDefect.file !== 'backend/app/db/models.py') {
      throw new Error(`Expected file models.py, got ${relDefect.file}`);
    }
    if (relDefect.targetTable !== 'nonexistent_table') {
      throw new Error(`Expected targetTable nonexistent_table, got ${relDefect.targetTable}`);
    }
  });

  // 5. Malformed relationship (unknown target class)
  await test('malformed relationship', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product = relationship('GhostEntity')
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem'],
      tables: ['order_items']
    };
    const files = [baseFile, modelsFile];
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true }
    );
    if (result.isValid) throw new Error('Expected failure for unknown target class');
    const relDefect = result.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!relDefect) throw new Error('Expected DB_REL001 defect');
    if (relDefect.file !== 'backend/app/db/models.py') {
      throw new Error(`Expected file models.py, got ${relDefect.file}`);
    }
    if (relDefect.targetModel !== 'GhostEntity') {
      throw new Error(`Expected targetModel GhostEntity, got ${relDefect.targetModel}`);
    }
  });

  // 6. Python/SQLAlchemy unavailable fallback
  await test('Python/SQLAlchemy unavailable fallback', async () => {
    const modelsFile = {
      path: 'backend/app/db/models.py',
      content: `from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
`,
      status: 'validated'
    };
    const reqs = {
      entities: ['OrderItem', 'Product'],
      tables: ['order_items', 'products']
    };
    const files = [baseFile, modelsFile];
    // Force skipSqlalchemy: true
    const result = await validateDatabasePhase(
      [{ required_files: files }],
      createManifest(files, reqs),
      '',
      mockCaller,
      sendEvent,
      { authoritativeOrm: true, skipSqlalchemy: true }
    );
    // Deterministic regex check catches it gracefully
    if (result.isValid) throw new Error('Deterministic fallback check should catch reciprocal error');
    const relDefect = result.defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP);
    if (!relDefect) throw new Error('Expected DB_REL001 from fallback');
    if (relDefect.file !== 'backend/app/db/models.py') {
      throw new Error(`Expected fallback to report models.py, got ${relDefect.file}`);
    }
  });

  // 7. Exact repair target routing
  await test('exact repair target routing', async () => {
    const dbModules = [
      {
        required_files: [
          { path: 'backend/app/db/database.py' },
          { path: 'backend/app/db/models.py' }
        ]
      }
    ];
    const defects = [
      {
        code: 'DB_REL001',
        validator: 'sqlalchemy_orm_mapper',
        file: 'backend/app/db/models.py',
        model: 'Product',
        relationship: 'order_items'
      }
    ];
    const targets = getDatabaseRepairTargets(dbModules, defects);
    if (!targets.implicatedFiles.has('backend/app/db/models.py')) {
      throw new Error('models.py should be an implicated file');
    }
    if (targets.implicatedFiles.has('backend/app/db/database.py')) {
      throw new Error('database.py should NOT be an implicated file for DB_REL001');
    }
    if (targets.unroutableSemanticDefects.length !== 0) {
      throw new Error(`Expected 0 unroutable defects, got ${targets.unroutableSemanticDefects.length}`);
    }
  });

  // 8. DB001 remains unchanged
  await test('DB001 remains unchanged', async () => {
    const credFile = {
      path: 'backend/app/db/database.py',
      content: `DATABASE_URL = "postgresql://myuser:secretpassword123@localhost:5432/mydb"\n`
    };
    const credDefects = scanForCredentials(credFile);
    if (credDefects.length !== 1) throw new Error(`Expected 1 credential defect, got ${credDefects.length}`);
    if (credDefects[0].code !== 'DB001') throw new Error(`Expected DB001 code, got ${credDefects[0].code}`);
    if (credDefects[0].evidence.includes('secretpassword123')) {
      throw new Error('Credential evidence must be redacted');
    }
    if (!credDefects[0].evidence.includes('***')) {
      throw new Error('Credential evidence must include redacted asterisks');
    }
  });

  // 9. Semantic no-progress remains unchanged
  await test('semantic no-progress remains unchanged', async () => {
    const semanticDefects = [
      {
        code: 'DB_REL001',
        validator: 'sqlalchemy_orm_mapper',
        file: 'backend/app/db/models.py',
        model: 'Product',
        relationship: 'order_items',
        actualState: 'missing',
        message: 'Product.order_items is missing'
      }
    ];
    const firstCheck = detectSemanticRepairProgress({
      previous: null,
      defects: semanticDefects,
      fileHashes: { 'backend/app/db/models.py': 'abc123hash' }
    });
    if (firstCheck.status !== 'PROGRESS') throw new Error(`Expected PROGRESS, got ${firstCheck.status}`);

    const secondCheck = detectSemanticRepairProgress({
      previous: firstCheck.state,
      defects: semanticDefects,
      fileHashes: { 'backend/app/db/models.py': 'abc123hash' }
    });
    if (secondCheck.status !== 'SEMANTIC_REPAIR_NO_PROGRESS') {
      throw new Error(`Expected SEMANTIC_REPAIR_NO_PROGRESS, got ${secondCheck.status}`);
    }
    if (secondCheck.fingerprint !== firstCheck.fingerprint) {
      throw new Error('Fingerprints must match across unchanged defect cycles');
    }
  });

  // 10. DATABASE completion remains deferred until semantic validation passes
  await test('DATABASE completion remains deferred until semantic validation passes', async () => {
    const databaseModule = { id: 'MOD-000', layer: 'DATABASE' };
    const emittedEvents = [];
    const emit = (event, data) => emittedEvents.push({ event, data });

    // Step 1: files validated, but semantic validation has not passed yet
    const beforeValidationStatus = completeValidatedModule(databaseModule, false, emit);
    if (beforeValidationStatus !== 'VALIDATED') {
      throw new Error(`Expected status VALIDATED before semantic validation, got ${beforeValidationStatus}`);
    }
    if (emittedEvents.some(e => e.event === 'module_completed')) {
      throw new Error('module_completed must NOT be emitted before semantic validation passes');
    }

    // Step 2: semantic validation passes
    const afterValidationStatus = completeValidatedModule(databaseModule, true, emit);
    if (afterValidationStatus !== 'PASSED') {
      throw new Error(`Expected status PASSED after semantic validation, got ${afterValidationStatus}`);
    }
    if (!emittedEvents.some(e => e.event === 'module_completed' && e.data?.moduleId === 'MOD-000')) {
      throw new Error('module_completed must be emitted once semantic validation passes');
    }
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed}/${total} semantic validation regression tests passed.`);
  console.log(`========================================`);
  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
