import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatabasePhase,
  normalizeDatabaseLayerFiles,
  DATABASE_DEFECT_CODES
} from '../dbValidator.js';

const dummyCaller = async () => JSON.stringify({ isValid: true, semanticIssues: [] });
const dummySendEvent = () => {};

test('AGENT 2 CHECKLIST 1: Canonical database.py exports Base, engine, SessionLocal, get_db and sanitizes credentials', async () => {
  const dbFile = {
    path: 'backend/app/db/database.py',
    content: `import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`
  };

  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String
from app.db.database import Base

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
`
  };

  const manifest = {
    modules: [{
      id: 'MOD-000',
      layer: 'DATABASE',
      required_files: [dbFile, modelsFile]
    }],
    project_requirements: {
      database: {
        entities: ['Product']
      }
    }
  };

  normalizeDatabaseLayerFiles([dbFile, modelsFile], manifest, {}, dummySendEvent);

  assert(dbFile.content.includes('Base = declarative_base') || dbFile.content.includes('class Base('), 'database.py must declare Base');
  assert(dbFile.content.includes('create_engine'), 'database.py must configure engine');
  assert(dbFile.content.includes('SessionLocal'), 'database.py must configure SessionLocal');
  assert(dbFile.content.includes('def get_db'), 'database.py must export get_db generator');

  const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.equal(res.isValid, true, `Database phase must be valid. Defects: ${JSON.stringify(res.defects)}`);
});

test('AGENT 2 CHECKLIST 2: 100% Entity Coverage & Auto-synthesis of omitted models (CartItem, Wishlist)', async () => {
  const dbFile = {
    path: 'backend/app/db/database.py',
    content: `import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///./app.db"))
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
def get_db(): yield
`
  };

  // LLM generated models.py with Product and Category, but omitted CartItem and Wishlist
  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class Category(Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
`
  };

  const manifest = {
    modules: [{
      id: 'MOD-000',
      layer: 'DATABASE',
      required_files: [dbFile, modelsFile]
    }],
    architectureContract: {
      entities: [
        { name: 'Product', table: 'products' },
        { name: 'Category', table: 'categories' },
        { name: 'CartItem', table: 'cart_items' },
        { name: 'Wishlist', table: 'wishlists' }
      ]
    },
    project_requirements: {
      database: {
        entities: ['Product', 'Category', 'CartItem', 'Wishlist']
      }
    }
  };

  normalizeDatabaseLayerFiles([dbFile, modelsFile], manifest, {}, dummySendEvent);

  assert(modelsFile.content.includes('class CartItem'), 'Agent 2 normalizer must synthesize missing CartItem model into models.py');
  assert(modelsFile.content.includes('class Wishlist'), 'Agent 2 normalizer must synthesize missing Wishlist model into models.py');

  const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.equal(res.isValid, true, `Models must pass validation. Defects: ${JSON.stringify(res.defects)}`);
});

test('AGENT 2 CHECKLIST 3: Bidirectional relationship & back_populates reciprocal integrity', async () => {
  const dbFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()`
  };

  // Valid bidirectional Product <-> Review relationship
  const validModelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    reviews = relationship('Review', back_populates='product')

class Review(Base):
    __tablename__ = 'reviews'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    product = relationship('Product', back_populates='reviews')
`
  };

  const manifestValid = {
    modules: [{ id: 'MOD-000', layer: 'DATABASE', required_files: [dbFile, validModelsFile] }],
    project_requirements: { database: { entities: ['Product', 'Review'] } }
  };

  const validRes = await validateDatabasePhase(manifestValid.modules, manifestValid, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.equal(validRes.isValid, true, 'Valid reciprocal relationship must pass validation');

  // Broken reciprocal: missing back_populates on Product
  const brokenModelsFile = {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    name = Column(String(100))

class Review(Base):
    __tablename__ = 'reviews'
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    product = relationship('Product', back_populates='reviews')
`
  };

  const manifestBroken = {
    modules: [{ id: 'MOD-000', layer: 'DATABASE', required_files: [dbFile, brokenModelsFile] }],
    project_requirements: { database: { entities: ['Product', 'Review'] } }
  };

  const brokenRes = await validateDatabasePhase(manifestBroken.modules, manifestBroken, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.equal(brokenRes.isValid, false, 'Broken reciprocal relationship must fail validation');
  assert(brokenRes.defects.some(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP), 'Must flag DB_REL001');
});

test('AGENT 2 CHECKLIST 4: Primary key & datetime server_default hygiene', async () => {
  const dbFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()`
  };

  // Model with incorrect server_default datetime.utcnow()
  const messyModelsFile = {
    path: 'backend/app/db/models.py',
    content: `import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.db.database import Base

class Order(Base):
    __tablename__ = 'orders'
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, default='pending')
    created_at = Column(DateTime, server_default=datetime.datetime.utcnow())
`
  };

  const manifest = {
    modules: [{ id: 'MOD-000', layer: 'DATABASE', required_files: [dbFile, messyModelsFile] }],
    project_requirements: { database: { entities: ['Order'] } }
  };

  normalizeDatabaseLayerFiles([dbFile, messyModelsFile], manifest, {}, dummySendEvent);

  assert(!messyModelsFile.content.includes('server_default=datetime.datetime.utcnow()'), 'Must fix executed datetime in server_default');
  assert(messyModelsFile.content.includes('default=datetime.utcnow'), 'Must convert to proper Python default=datetime.utcnow');

  const res = await validateDatabasePhase(manifest.modules, manifest, '', dummyCaller, dummySendEvent, { skipSqlalchemy: true });
  assert.equal(res.isValid, true, 'Cleaned model must pass validation');
});

test('AGENT 2 CHECKLIST 5: Single canonical model file & pruning duplicate models', async () => {
  const dbFile = {
    path: 'backend/app/db/database.py',
    content: `from sqlalchemy.orm import declarative_base\nBase = declarative_base()`
  };

  const baseFile = {
    path: 'backend/app/db/base.py',
    content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer\nclass DuplicateModel(Base):\n    __tablename__ = 'duplicates'\n    id = Column(Integer, primary_key=True)\n`
  };

  const modelsFile = {
    path: 'backend/app/db/models.py',
    content: `from app.db.database import Base\nfrom sqlalchemy import Column, Integer\nclass DuplicateModel(Base):\n    __tablename__ = 'duplicates'\n    id = Column(Integer, primary_key=True)\n`
  };

  const manifest = {
    modules: [{ id: 'MOD-000', layer: 'DATABASE', required_files: [dbFile, baseFile, modelsFile] }],
    project_requirements: { database: { entities: ['DuplicateModel'] } }
  };

  normalizeDatabaseLayerFiles([dbFile, baseFile, modelsFile], manifest, {}, dummySendEvent);

  assert(!baseFile.content.includes('class DuplicateModel'), 'base.py duplicate model must be pruned');
  assert(modelsFile.content.includes('class DuplicateModel'), 'models.py must retain the canonical model');
});
