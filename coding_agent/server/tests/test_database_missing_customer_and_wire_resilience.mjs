import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDatabasePhase, normalizeDatabaseLayerFiles } from '../dbValidator.js';
import { wireApplicationFromContract, repairProjectContracts } from '../integrationContract.js';

test('normalizeDatabaseLayerFiles auto-synthesizes missing Customer and prunes base.py duplicate models', async () => {
  const baseDbFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy import create_engine\nfrom sqlalchemy.orm import declarative_base\nBase = declarative_base()\n`,
    status: 'validated'
  };

  const baseFile = {
    path: 'backend/app/db/base.py',
    content: `from app.db.database import Base\nclass Product(Base):\n    __tablename__ = "products"\n`,
    status: 'validated'
  };

  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.database import Base

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String)

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey('customers.id'), nullable=False)
    order_items = relationship("OrderItem", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    order = relationship("Order", back_populates="order_items")
`,
    status: 'validated'
  };

  const manifest = {
    modules: [{
      id: 'MOD-000',
      layer: 'DATABASE',
      status: 'validated',
      required_files: [baseDbFile, baseFile, modelsFile]
    }],
    project_requirements: {
      database: {
        entities: ['Product', 'Order', 'OrderItem', 'Customer'],
        tables: ['products', 'orders', 'order_items', 'customers'],
        foreign_keys: [{ table: 'orders', references: 'customers.id' }],
        relationships: [{ from: 'Order', to: 'Customer' }]
      }
    }
  };

  const dummyCaller = async () => '';
  const dummySendEvent = () => {};

  // Normalization must prune base.py duplicates and synthesize Customer
  normalizeDatabaseLayerFiles([baseDbFile, baseFile, modelsFile], manifest, {}, dummySendEvent);

  assert(!baseFile.content.includes('class Product'), 'base.py duplicate models pruned');
  assert(modelsFile.content.includes('class Customer'), 'Customer model auto-synthesized in models.py');
  assert(modelsFile.content.includes('__tablename__ = "customers"'), 'customers table declared');

  // Semantic validation should now pass cleanly without DB_DUPLICATE_MODEL or unknown customer table errors
  const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.strictEqual(res.isValid, true, 'Database phase validates cleanly after auto-synthesis');
  assert.strictEqual(res.defects.length, 0, 'Zero database defects');
});

test('wireApplicationFromContract gracefully handles missing or empty main.content without crashing', async () => {
  const files = [
    { path: 'backend/main.py', status: 'pending' } // content is undefined
  ];
  const contract = { schemaVersion: 2, endpoints: [] };
  let loggedError = null;
  const sendEvent = (type, data) => {
    if (type === 'log' && typeof data === 'string' && data.includes('router_wiring_failed')) {
      loggedError = data;
    }
  };

  // Must not throw or log 'source' error
  await wireApplicationFromContract(files, contract, sendEvent);
  assert.strictEqual(loggedError, null, 'Must not crash with router_wiring_failed on undefined main.content');
});

test('repairProjectContracts handles validate returning undefined defects without throwing length error', async () => {
  const files = [{ path: 'backend/main.py', content: '# app', status: 'pending' }];
  let threw = false;
  try {
    await repairProjectContracts(files, {
      validate: async () => ({ isValid: false, errors: ['Setup failed'] }), // defects omitted
      caller: async () => '',
      sendEvent: () => {},
      maxRounds: 1
    });
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, false, 'Must not throw length property error on undefined defects');
});
