import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectContracts } from '../projectContractValidator.js';
import { autoHealProjectContracts } from '../integrationContract.js';

test('AGENT 4 CHECKLIST 1: Strict Response Models (BROAD_RESPONSE_SCHEMA) rejection and auto-heal', async () => {
  const files = [
    {
      path: 'backend/app/schemas/user.py',
      content: `from pydantic import BaseModel, ConfigDict\n\nclass UserResponse(BaseModel):\n    id: int\n    email: str\n    model_config = ConfigDict(from_attributes=True, extra='allow')\n`
    },
    {
      path: 'backend/app/api/users.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.schemas.user import UserResponse\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import User\nrouter = APIRouter()\n\n@router.get("/{user_id}", response_model=UserResponse)\ndef get_user(user_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    user = db.query(User).filter(User.id == user_id).first()\n    return user\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const broadDefect = initialCheck.defects.find(d => d.code === 'BROAD_RESPONSE_SCHEMA');
  assert.ok(broadDefect, 'Permissive response schema must be flagged as BROAD_RESPONSE_SCHEMA');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair BROAD_RESPONSE_SCHEMA');

  const schemaFile = files.find(f => f.path === 'backend/app/schemas/user.py');
  assert.ok(!schemaFile.content.includes("extra='allow'"), "extra='allow' must be stripped");

  const recheck = await validateProjectContracts(files);
  const remainingBroad = recheck.defects.filter(d => d.code === 'BROAD_RESPONSE_SCHEMA');
  assert.equal(remainingBroad.length, 0, 'Zero BROAD_RESPONSE_SCHEMA defects after auto-heal');
});

test('AGENT 4 CHECKLIST 2: Sensitive Field Elimination (SENSITIVE_RESPONSE_FIELD) rejection and auto-heal', async () => {
  const files = [
    {
      path: 'backend/app/schemas/customer.py',
      content: `from pydantic import BaseModel, ConfigDict\nfrom typing import Optional\n\nclass CustomerResponse(BaseModel):\n    id: int\n    name: str\n    email: str\n    password_hash: str\n    hashed_password: Optional[str] = None\n    model_config = ConfigDict(from_attributes=True)\n\nclass TokenResponse(BaseModel):\n    access_token: str\n    token_type: str\n`
    },
    {
      path: 'backend/app/api/customers.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.schemas.customer import CustomerResponse\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import Customer\nrouter = APIRouter()\n\n@router.get("/{id}", response_model=CustomerResponse)\ndef get_customer(id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    cust = db.query(Customer).filter(Customer.id == id).first()\n    return cust\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const sensitiveDefect = initialCheck.defects.find(d => d.code === 'SENSITIVE_RESPONSE_FIELD');
  assert.ok(sensitiveDefect, 'Sensitive fields in response models must trigger SENSITIVE_RESPONSE_FIELD');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair SENSITIVE_RESPONSE_FIELD');

  const schemaFile = files.find(f => f.path === 'backend/app/schemas/customer.py');
  assert.ok(!schemaFile.content.includes('password_hash'), 'password_hash must be eliminated');
  assert.ok(!schemaFile.content.includes('hashed_password'), 'hashed_password must be eliminated');
  assert.ok(schemaFile.content.includes('access_token: str'), 'TokenResponse exchange model must retain access_token');

  const recheck = await validateProjectContracts(files);
  const remainingSensitive = recheck.defects.filter(d => d.code === 'SENSITIVE_RESPONSE_FIELD');
  assert.equal(remainingSensitive.length, 0, 'Zero SENSITIVE_RESPONSE_FIELD defects after auto-heal');
});

test('AGENT 4 CHECKLIST 3: Operation Schema Separation (OPERATION_SCHEMA_MISMATCH) repair', async () => {
  const files = [
    {
      path: 'backend/app/schemas/product.py',
      content: `from pydantic import BaseModel, ConfigDict\n\nclass ProductCreate(BaseModel):\n    name: str\n    price: float\n`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.schemas.product import ProductCreate\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import Product\nrouter = APIRouter()\n\n@router.post("", response_model=ProductCreate)\ndef create_product(payload: ProductCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    prod = Product(name=payload.name, price=payload.price)\n    db.add(prod)\n    db.commit()\n    return prod\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const opDefect = initialCheck.defects.find(d => d.code === 'OPERATION_SCHEMA_MISMATCH');
  assert.ok(opDefect, 'Using ProductCreate as response_model must trigger OPERATION_SCHEMA_MISMATCH');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair OPERATION_SCHEMA_MISMATCH');

  const apiFile = files.find(f => f.path === 'backend/app/api/products.py');
  assert.ok(apiFile.content.includes('response_model=ProductResponse'), 'Must transition response_model to ProductResponse');
  assert.ok(apiFile.content.includes('ProductResponse'), 'Must import or reference ProductResponse');

  const schemaFile = files.find(f => f.path === 'backend/app/schemas/product.py');
  assert.ok(schemaFile.content.includes('class ProductResponse'), 'Must declare ProductResponse in schemas');

  const recheck = await validateProjectContracts(files);
  const remainingOp = recheck.defects.filter(d => d.code === 'OPERATION_SCHEMA_MISMATCH');
  assert.equal(remainingOp.length, 0, 'Zero OPERATION_SCHEMA_MISMATCH defects after auto-heal');
});

test('AGENT 4 CHECKLIST 4: Atomic Transactions (NON_ATOMIC_WORKFLOW) auto-healing', async () => {
  const files = [
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import Order, OrderItem\nrouter = APIRouter()\n\n@router.post("/checkout")\ndef checkout(items: list, db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    order = Order(user_id=current_user["id"])\n    db.add(order)\n    for item in items:\n        order_item = OrderItem(order_id=order.id, product_id=item["product_id"])\n        db.add(order_item)\n        db.commit()\n    db.commit()\n    return {"status": "success", "order_id": order.id}\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const nonAtomicDefect = initialCheck.defects.find(d => d.code === 'NON_ATOMIC_WORKFLOW');
  assert.ok(nonAtomicDefect, 'Loop commits must trigger NON_ATOMIC_WORKFLOW');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair NON_ATOMIC_WORKFLOW');

  const apiFile = files.find(f => f.path === 'backend/app/api/orders.py');
  assert.ok(apiFile.content.includes('db.flush()'), 'Intermediate commit must be converted to db.flush()');

  const recheck = await validateProjectContracts(files);
  const remainingNonAtomic = recheck.defects.filter(d => d.code === 'NON_ATOMIC_WORKFLOW');
  assert.equal(remainingNonAtomic.length, 0, 'Zero NON_ATOMIC_WORKFLOW defects after auto-heal');
});

test('AGENT 4 CHECKLIST 5: Parent Model Flush (UNFLUSHED_PARENT_ID) and Cart Separation (CART_ORDER_MODEL_MISUSE)', async () => {
  const files = [
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import Order\nrouter = APIRouter()\n\n@router.post("")\ndef create_order(db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    order = Order(user_id=current_user["id"])\n    db.add(order)\n    order_id = order.id\n    db.commit()\n    return {"order_id": order_id}\n`
    },
    {
      path: 'backend/app/api/cart.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import OrderItem\nrouter = APIRouter()\n\n@router.post("")\ndef add_to_cart(db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    item = OrderItem(order_id=current_user["id"], product_id=1)\n    db.add(item)\n    db.commit()\n    return {"status": "added"}\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const initialCheck = await validateProjectContracts(files);
  const unflushed = initialCheck.defects.find(d => d.code === 'UNFLUSHED_PARENT_ID');
  assert.ok(unflushed, 'Reading parent.id without flush must trigger UNFLUSHED_PARENT_ID');
  const cartMisuse = initialCheck.defects.find(d => d.code === 'CART_ORDER_MODEL_MISUSE');
  assert.ok(cartMisuse, 'Using OrderItem in cart logic must trigger CART_ORDER_MODEL_MISUSE');

  const healed = autoHealProjectContracts(files, initialCheck.defects);
  assert.equal(healed, true, 'autoHeal must repair UNFLUSHED_PARENT_ID and CART_ORDER_MODEL_MISUSE');

  const ordersFile = files.find(f => f.path === 'backend/app/api/orders.py');
  assert.ok(ordersFile.content.includes('db.flush()'), 'db.flush() must be injected before accessing order.id');

  const cartFile = files.find(f => f.path === 'backend/app/api/cart.py');
  assert.ok(!cartFile.content.includes('OrderItem'), 'OrderItem must be replaced with CartItem');
  assert.ok(cartFile.content.includes('CartItem'), 'CartItem must be used in cart logic');

  const recheck = await validateProjectContracts(files);
  assert.equal(recheck.defects.filter(d => d.code === 'UNFLUSHED_PARENT_ID').length, 0, 'Zero UNFLUSHED_PARENT_ID defects');
  assert.equal(recheck.defects.filter(d => d.code === 'CART_ORDER_MODEL_MISUSE').length, 0, 'Zero CART_ORDER_MODEL_MISUSE defects');
});

test('AGENT 4 CHECKLIST 6: Concrete Logic vs Stub Endpoint Detection (STUB_ENDPOINT)', async () => {
  const files = [
    {
      path: 'backend/app/api/cart.py',
      content: `from fastapi import APIRouter, Depends\nfrom sqlalchemy.orm import Session\nfrom app.api.auth import get_current_user\nfrom app.db.database import get_db\nfrom app.db.models import CartItem\nrouter = APIRouter()\n\n@router.delete("/{item_id}")\ndef delete_cart_item(item_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    item = db.query(CartItem).filter(CartItem.id == item_id).first()\n    if item:\n        db.delete(item)\n        db.commit()\n    return {"message": "item deleted"}\n\n@router.post("/empty-mock")\ndef empty_mock(db: Session = Depends(get_db), current_user = Depends(get_current_user)):\n    return {}\n`
    },
    { path: 'README.md', content: '# Docs' },
    { path: 'backend/requirements.txt', content: 'fastapi\npydantic\nsqlalchemy\n' }
  ];

  const check = await validateProjectContracts(files);
  const stubs = check.defects.filter(d => d.code === 'STUB_ENDPOINT');

  // delete_cart_item performs real db.query and db.delete so it must NOT be flagged
  const deleteStub = stubs.find(d => d.message.includes('DELETE'));
  assert.equal(deleteStub, undefined, 'Real DB delete endpoint returning dict message must NOT be flagged as STUB_ENDPOINT');

  // empty_mock returns {} without any DB or business logic and must be flagged
  const mockStub = stubs.find(d => d.message.includes('POST') && d.message.includes('/empty-mock'));
  assert.ok(mockStub, 'Empty stub returning {} without logic must be flagged as STUB_ENDPOINT');
});
