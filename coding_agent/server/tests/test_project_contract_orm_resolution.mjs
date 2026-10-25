import assert from 'node:assert/strict';
import { extractStaticPythonContracts, validateProjectContracts } from '../projectContractValidator.js';

const files = [
  {
    path: 'backend/app/db/models.py',
    content: `from sqlalchemy.orm import DeclarativeBase
class Base(DeclarativeBase):
    pass
class Product(Base):
    id: int
class Customer(Base):
    id: int
class CartItem(Base):
    id: int
class Order(Base):
    id: int
class OrderItem(Base):
    id: int
class Address(Base):
    id: int
`
  },
  {
    path: 'backend/app/schemas/customer.py',
    content: `from pydantic import BaseModel
class CustomerResponse(BaseModel):
    id: int
`
  },
  {
    path: 'backend/app/db/alternate.py',
    content: `from app.db.database import Base as OrmBase
class AuditRecord(OrmBase):
    id: int
`
  },
  {
    path: 'backend/app/db/database.py',
    content: `class Base:\n    pass\n`
  }
];

const contracts = extractStaticPythonContracts(files);
for (const model of ['Product', 'Customer', 'CartItem', 'Order', 'OrderItem', 'Address', 'AuditRecord']) {
  assert(contracts.models.has(model), `${model} should resolve as an ORM model`);
}
assert(!contracts.models.has('CustomerResponse'), 'Pydantic response schema must not be classified as an ORM model');
assert(contracts.schemas.has('CustomerResponse'), 'Pydantic response schema should remain available as a schema');
console.log('PASS: ORM and schema classification fixtures');

// Regression test: user.get and order_items.append must never trigger SCHEMA_FIELD_MISMATCH
const apiFiles = [
  ...files,
  {
    path: 'backend/app/api/auth.py',
    content: `
from app.db.models import Customer
user = db.query(Customer)
role = user.get("role", "customer")
`
  },
  {
    path: 'backend/app/api/orders.py',
    content: `
from app.db.models import OrderItem
order_items = db.query(OrderItem)
order_items.append(None)
`
  }
];

const contractRes = await validateProjectContracts(apiFiles);
const schemaMismatches = contractRes.defects.filter(d => d.code === 'SCHEMA_FIELD_MISMATCH');
assert.equal(schemaMismatches.length, 0, `Expected 0 SCHEMA_FIELD_MISMATCH, got: ${JSON.stringify(schemaMismatches)}`);
console.log('PASS: user.get and order_items.append ignored collection methods test');

// Regression test: from app.models.customers import Customer must resolve to app.db.models
const testFilesWithModelImport = [
  ...files,
  {
    path: 'backend/tests/test_orders.py',
    content: `
from app.models.customers import Customer
def test_order_creation():
    assert Customer is not None
`
  }
];

const modelImportRes = await validateProjectContracts(testFilesWithModelImport);
const missingModules = modelImportRes.defects.filter(d => d.code === 'MISSING_PYTHON_MODULE');
assert.equal(missingModules.length, 0, `Expected 0 MISSING_PYTHON_MODULE, got: ${JSON.stringify(missingModules)}`);
console.log('PASS: app.models.customers import redirected to app.db.models test');


