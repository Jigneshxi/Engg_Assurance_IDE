import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyApiRegistration } from '../backendRuntimeValidator.js';
const file = (path, content) => ({ path, content, status: 'validated' });

test('router validation: correct mount passes', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
app.include_router(products_router, prefix="/api/products")
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
@router.get("")
def list_products():
    return []
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert.equal(res.defects.length, 0, 'Expected no defects for valid router mount');
});

test('router validation: missing include_router fails', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_NOT_MOUNTED'), 'Expected ROUTER_NOT_MOUNTED defect');
});

test('router validation: empty or wrong prefix (/api instead of /api/products) fails', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
app.include_router(products_router, prefix="/api")
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
@router.get("/products")
def list_products():
    return []
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_PREFIX_MISMATCH'), 'Expected ROUTER_PREFIX_MISMATCH defect');
});

test('router validation: mounted under another resource prefix fails', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
app.include_router(products_router, prefix="/api/orders")
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_PREFIX_MISMATCH'), 'Expected ROUTER_PREFIX_MISMATCH defect');
});

test('router validation: unimported router fails', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
app = FastAPI()
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_NOT_IMPORTED'), 'Expected ROUTER_NOT_IMPORTED defect');
});

test('router validation: router-level prefix plus app prefix composes correctly', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.orders import router as orders_router

app = FastAPI()
app.include_router(orders_router, prefix="/api")
`
    },
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter
router = APIRouter(prefix="/orders")
@router.post("")
def create_order():
    return {}
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert.equal(res.defects.length, 0, 'Expected /api + /orders = /api/orders to pass without defects');
});

test('router validation: duplicate mount fails', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.products import router as products_router

app = FastAPI()
app.include_router(products_router, prefix="/api/products")
app.include_router(products_router, prefix="/api/products")
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.subtype === 'ROUTER_DUPLICATE_MOUNT'), 'Expected ROUTER_DUPLICATE_MOUNT defect');
});

test('router validation: different router cannot satisfy the check for another', () => {
  const files = [
    {
      path: 'backend/main.py',
      content: `from fastapi import FastAPI
from app.api.orders import router as orders_router

app = FastAPI()
app.include_router(orders_router, prefix="/api/orders")
`
    },
    {
      path: 'backend/app/api/products.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    },
    {
      path: 'backend/app/api/orders.py',
      content: `from fastapi import APIRouter
router = APIRouter()
`
    }
  ];
  const res = verifyApiRegistration(files);
  assert(res.defects.some(d => d.routerFile && d.routerFile.includes('products.py')), 'Expected defect for unmounted products router despite mounted orders router');
});

test('router validation: Express app.use mounts are parsed and checked', () => {
  const files = [
    file('backend/main.py', "const express = require('express');\nconst app = express();\nconst ordersRouter = require('./routes/orders');\napp.use('/api/orders', ordersRouter);"),
    file('backend/routes/orders.js', "const express = require('express');\nconst router = express.Router();\nrouter.get('/', handler);"),
  ];
  const result = verifyApiRegistration(files);
  assert.equal(result.defects.length, 0);
});
