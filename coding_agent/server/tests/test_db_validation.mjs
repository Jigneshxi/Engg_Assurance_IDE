import { validateDatabasePhase } from '../dbValidator.js';

const mockCaller = async (_system, _user) => {
  return JSON.stringify({ isValid: true, semanticIssues: [] });
};

const sendEvent = (_event, _data) => {};

async function runTests() {
  let passed = 0;
  let total = 0;

  const test = async (name, setup, expectedIsValid, expectedErrorCode = null, customCaller = null, assertResult = null) => {
    total++;
    console.log(`\n--- Test ${total}: ${name} ---`);
    const { activeModule, manifest, prd } = setup();
    const result = await validateDatabasePhase([activeModule], manifest, prd, customCaller || mockCaller, sendEvent);
    if (result.isValid === expectedIsValid && (!expectedErrorCode || result.errorCode === expectedErrorCode) && (!assertResult || assertResult(result))) {
      console.log(`✅ PASS`);
      passed++;
    } else {
      console.error(`❌ FAIL`);
      console.error(`Expected Valid: ${expectedIsValid}, Got: ${result.isValid}`);
      if (expectedErrorCode) console.error(`Expected Code: ${expectedErrorCode}, Got: ${result.errorCode}`);
      console.error('Result:', JSON.stringify(result, null, 2));
    }
  };

  const createManifest = (files, reqs) => ({
    project_requirements: { database: reqs },
    modules: [{ layer: 'DATABASE', required_files: files }]
  });

  // Test 1: QuickCart Valid Project
  await test('QuickCart Valid Project', () => {
    const reqs = {
      entities: ['User', 'Product'], tables: ['users', 'products'],
      relationships: [{ from: 'Product', to: 'User' }],
      foreign_keys: [{ table: 'products', column: 'user_id', references: 'users.id' }],
      constraints: [{ table: 'users', column: 'email', type: 'unique' }],
      indexes: [{ table: 'products', column: 'sku' }],
      migrations_required: true, seed_required: true, initialization_requirements: true
    };
    const files = [
      { path: 'backend/app/models/all.py', content: `
class User(Base):
  __tablename__ = 'users'
  email = Column(String, unique=True)
class Product(Base):
  __tablename__ = 'products'
  user_id = Column(Integer, ForeignKey('users.id'))
  user = relationship('User')
  sku = Column(String, index=True)
from backend.app.db.base import Base`, status: 'validated' },
      { path: 'backend/app/db/base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'backend/alembic/env.py', content: 'migrations', status: 'validated' },
      { path: 'backend/seed/data.py', content: 'def seed(): pass', status: 'validated' },
      { path: 'backend/app/db/init_db.py', content: 'from backend.app.db.base import Base\ncreate_engine()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 2: Library System Valid Project
  await test('Library System Valid Project', () => {
    const reqs = {
      entities: ['Book', 'Author'], tables: ['books', 'authors'],
      relationships: [], foreign_keys: [], constraints: [], indexes: [],
      migrations_required: false, seed_required: false, initialization_requirements: false
    };
    const files = [
      { path: 'src/models.py', content: `
class Book(Base): __tablename__ = 'books'
class Author(Base): __tablename__ = 'authors'
from src.base import Base`, status: 'validated' },
      { path: 'src/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 3: Hospital System Valid Project
  await test('Hospital System Valid Project', () => {
    const reqs = {
      entities: ['Patient', 'Doctor'], tables: ['patients', 'doctors'],
      relationships: [], foreign_keys: [], constraints: [], indexes: [],
      migrations_required: false, seed_required: false, initialization_requirements: false
    };
    const files = [
      { path: 'hospital/models.py', content: `
class Patient(Base): __tablename__ = 'patients'
class Doctor(Base): __tablename__ = 'doctors'
from hospital.base import Base`, status: 'validated' },
      { path: 'hospital/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 4: Missing required entity
  await test('Missing required entity', () => {
    const reqs = { entities: ['Patient', 'MissingEntity'], tables: ['patients'] };
    const files = [{ path: 'models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom base import Base`, status: 'validated' }, { path: 'base.py', content: 'Base = declarative_base()', status: 'validated' }];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 5: Missing required table
  await test('Missing required table', () => {
    const reqs = { entities: ['Patient'], tables: ['patients', 'missing_table'] };
    const files = [{ path: 'models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom base import Base`, status: 'validated' }, { path: 'base.py', content: 'Base = declarative_base()', status: 'validated' }];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 6: Broken absolute import
  await test('Broken absolute import', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.missing import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 7: Broken relative import
  await test('Broken relative import', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom .missing import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 8: External dependency false-positive prevention
  await test('External dependency false-positive prevention', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom sqlalchemy import Column\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 9: Missing Base
  await test('Missing Base', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [{ path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'`, status: 'validated' }];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 10: Multiple Base definitions (Not explicitly failing right now unless paths differ, but let's test)
  await test('Multiple Base definitions (Valid if same path used)', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'app/base2.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 11: Inconsistent Base imports
  await test('Inconsistent Base imports', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/models2.py', content: `from base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 12: Broken FK target
  await test('Broken FK target', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nForeignKey('missing.id')\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 13: Broken relationship target
  await test('Broken relationship target', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nrelationship('Missing')\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 14: Missing required unique constraint
  await test('Missing required unique constraint', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], constraints: [{ table: 'patients', column: 'email', type: 'unique' }] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 15: Missing required index
  await test('Missing required index', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], indexes: [{ table: 'patients', column: 'email' }] };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 16: Missing migration
  await test('Missing migration', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], migrations_required: true };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 17: Incomplete migration coverage (This specific edge case is handled by QA since parsing migration contents deterministically is complex. We test QA failure).
  await test('Incomplete migration coverage via QA', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], migrations_required: true };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'alembic/env.py', content: 'migrations', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false, null, async () => JSON.stringify({ isValid: false, semanticIssues: ['Missing migration coverage for Patients'] }));

  // Test 18: Missing seed infrastructure
  await test('Missing seed infrastructure', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], seed_required: true };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 19: Broken seed imports (Not explicitly implemented in determinism, but lack of seed logic fails)
  await test('Missing actual seed logic', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], seed_required: true };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'seed.py', content: 'just a comment', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 20: Broken initialization
  await test('Broken initialization', () => {
    const reqs = { entities: ['Patient'], tables: ['patients'], initialization_requirements: true };
    const files = [
      { path: 'app/models.py', content: `class Patient(Base): __tablename__ = 'patients'\nfrom app.base import Base`, status: 'validated' },
      { path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'init_db.py', content: 'pass', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 21: Missing Requirements Payload
  await test('Missing Requirements Payload', () => {
    const files = [{ path: 'app/base.py', content: 'Base = declarative_base()', status: 'validated' }];
    return { activeModule: { required_files: files }, manifest: { modules: [{ required_files: files }] }, prd: '' };
  }, false, 'REQUIREMENTS_NOT_AVAILABLE');

  // Test 22: Missing back_populates target
  await test('Missing back_populates target', () => {
    const reqs = { entities: ['User', 'Post'], tables: ['users', 'posts'] };
    const files = [
      { path: 'models.py', content: `
class User(Base):
    __tablename__ = 'users'
    posts = relationship('Post', back_populates='author')
class Post(Base):
    __tablename__ = 'posts'
    # Missing author relationship
from base import Base`, status: 'validated' },
      { path: 'base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 23: Wrong back_populates name
  await test('Wrong back_populates name', () => {
    const reqs = { entities: ['User', 'Post'], tables: ['users', 'posts'] };
    const files = [
      { path: 'models.py', content: `
class User(Base):
    __tablename__ = 'users'
    posts = relationship('Post', back_populates='author')
class Post(Base):
    __tablename__ = 'posts'
    creator = relationship('User', back_populates='posts')
from base import Base`, status: 'validated' },
      { path: 'base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 24: Missing Product.order_items reciprocal targets Product's model file
  await test('Missing Product.order_items reciprocal reports ORM metadata and target file', () => {
    const reqs = { entities: ['OrderItem', 'Product'], tables: ['order_items', 'products'] };
    const files = [
      { path: 'backend/app/db/order_item.py', content: `
class Base: pass
class OrderItem(Base):
    __tablename__ = 'order_items'
    product_id = Column(Integer, ForeignKey('products.id'))
    product = relationship('Product', back_populates='order_items')
`, status: 'validated' },
      { path: 'backend/app/db/product.py', content: `
class Product(Base):
    __tablename__ = 'products'
`, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false, 'DB_REL001', null, result => result.defects.some(defect =>
    defect.file === 'backend/app/db/product.py' &&
    defect.model === 'Product' &&
    defect.relationship === 'order_items' &&
    defect.sourceModel === 'OrderItem' &&
    defect.sourceRelationship === 'product' &&
    defect.targetModel === 'Product' &&
    defect.expectedReciprocal === 'Product.order_items' &&
    defect.actualState === 'missing'
  ));

  // Test 25: Missing Order.payment reciprocal
  await test('Missing Order.payment reciprocal is a structured DB_REL001', () => {
    const reqs = { entities: ['Payment', 'Order'], tables: ['payments', 'orders'] };
    const files = [
      { path: 'backend/app/db/models.py', content: `
class Base: pass
class Payment(Base):
    __tablename__ = 'payments'
    order_id = Column(Integer, ForeignKey('orders.id'))
    order = relationship('Order', back_populates='payment')
class Order(Base):
    __tablename__ = 'orders'
`, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false, 'DB_REL001', null, result => result.defects.some(defect =>
    defect.file === 'backend/app/db/models.py' &&
    defect.model === 'Order' &&
    defect.relationship === 'payment' &&
    defect.sourceModel === 'Payment' &&
    defect.sourceRelationship === 'order' &&
    defect.targetModel === 'Order' &&
    defect.expectedReciprocal === 'Order.payment' &&
    defect.actualState === 'missing'
  ));

  // Test 26: Reciprocal relationship points to the wrong model attribute
  await test('Incorrect reciprocal back_populates target is detected', () => {
    const reqs = { entities: ['OrderItem', 'Product'], tables: ['order_items', 'products'] };
    const files = [
      { path: 'backend/app/db/models.py', content: `
class Base: pass
class OrderItem(Base):
    __tablename__ = 'order_items'
    product = relationship('Product', back_populates='order_items')
class Product(Base):
    __tablename__ = 'products'
    order_items = relationship('OrderItem', back_populates='wrong_name')
`, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false, 'DB_REL001', null, result => result.defects.some(defect =>
    defect.file === 'backend/app/db/models.py' &&
    defect.model === 'Product' &&
    defect.relationship === 'order_items' &&
    defect.actualState === 'wrong_back_populates'
  ));

  // Test 27: Both reciprocal model pairs pass validation
  await test('OrderItem/Product and Payment/Order reciprocals are valid', () => {
    const reqs = {
      entities: ['OrderItem', 'Product', 'Payment', 'Order'],
      tables: ['order_items', 'products', 'payments', 'orders']
    };
    const files = [
      { path: 'backend/app/db/models.py', content: `
class Base: pass
class OrderItem(Base):
    __tablename__ = 'order_items'
    product = relationship('Product', back_populates='order_items')
class Product(Base):
    __tablename__ = 'products'
    order_items = relationship('OrderItem', back_populates='product')
class Payment(Base):
    __tablename__ = 'payments'
    order = relationship('Order', back_populates='payment')
class Order(Base):
    __tablename__ = 'orders'
    payment = relationship('Payment', back_populates='order')
`, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 28: Hardcoded database credentials
  await test('Hardcoded database credentials', () => {
    const reqs = { entities: ['User'], tables: ['users'], initialization_requirements: true };
    const files = [
      { path: 'models.py', content: `class User(Base): __tablename__ = 'users'\nfrom base import Base`, status: 'validated' },
      { path: 'base.py', content: 'Base = declarative_base()', status: 'validated' },
      { path: 'init.py', content: `
create_engine('postgresql://admin:password123@localhost:5432/mydb')
      `, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, false);

  // Test 29: Generic task-management-style schema
  await test('Task Management System Valid Project', () => {
    const reqs = {
      entities: ['Project', 'Task'], tables: ['projects', 'tasks'],
      relationships: [], foreign_keys: [], constraints: [], indexes: [],
      migrations_required: false, seed_required: false, initialization_requirements: false
    };
    const files = [
      { path: 'taskmgr/models.py', content: `
class Project(Base): __tablename__ = 'projects'
class Task(Base): __tablename__ = 'tasks'
from taskmgr.base import Base`, status: 'validated' },
      { path: 'taskmgr/base.py', content: 'Base = declarative_base()', status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  // Test 30: Node.js Mongoose Stack (Dynamic bypass test)
  await test('Node.js Mongoose Stack (Dynamic bypass test)', () => {
    const reqs = {
      entities: ['User'], tables: ['users'],
      relationships: [], foreign_keys: [], constraints: [], indexes: [],
      migrations_required: false, seed_required: false, initialization_requirements: true
    };
    const files = [
      { path: 'backend/models/User.js', content: `
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({ name: String });
module.exports = mongoose.model('User', userSchema);
      `, status: 'validated' },
      { path: 'backend/db.js', content: `
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/db');
      `, status: 'validated' }
    ];
    return { activeModule: { required_files: files }, manifest: createManifest(files, reqs), prd: '' };
  }, true);

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(console.error);
