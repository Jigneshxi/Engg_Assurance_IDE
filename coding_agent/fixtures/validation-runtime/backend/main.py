"""Executable regression fixture, not a production authentication template."""
import os
from typing import Annotated
from fastapi import FastAPI, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, select, update
from sqlalchemy.orm import declarative_base, Session

if os.environ.get('PAYMENT_PROVIDER') != 'mock':
    raise RuntimeError('This fixture requires the isolated mock environment')
engine = create_engine(os.environ['DATABASE_URL'], connect_args={'check_same_thread': False})
Base = declarative_base()


class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    price_cents = Column(Integer, nullable=False)
    stock = Column(Integer, nullable=False)


class CartItem(Base):
    __tablename__ = 'cart_items'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    quantity = Column(Integer, nullable=False)


class Coupon(Base):
    __tablename__ = 'coupons'
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True)
    active = Column(Boolean, nullable=False)
    remaining = Column(Integer, nullable=False)
    percent = Column(Integer, nullable=False)


class Order(Base):
    __tablename__ = 'orders'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    request_key = Column(String, unique=True, nullable=False)
    total_cents = Column(Integer, nullable=False)


class OrderItem(Base):
    __tablename__ = 'order_items'
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey('orders.id'))
    product_id = Column(Integer, ForeignKey('products.id'))
    quantity = Column(Integer, nullable=False)
    unit_price_cents = Column(Integer, nullable=False)


Base.metadata.create_all(engine)
with Session(engine) as seed:
    if seed.get(Product, 1) is None:
        seed.add_all([Product(id=1, name='Fixture product', price_cents=1000, stock=20), Coupon(code='SAVE10', active=True, remaining=2, percent=10), Coupon(code='EXPIRED', active=False, remaining=2, percent=10)])
        seed.commit()


def get_db():
    with Session(engine) as db:
        yield db


def get_current_user(x_fixture_user: Annotated[str | None, Header()] = None):
    # Deliberately mock-only identity. Production generators must implement JWT.
    if os.environ.get('PAYMENT_PROVIDER') != 'mock' or x_fixture_user not in ('1', '2'):
        raise HTTPException(401, 'Fixture identity required')
    return int(x_fixture_user)


class CartInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


class QuantityInput(BaseModel):
    quantity: int = Field(gt=0, le=100)


class CheckoutInput(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=100)
    coupon_code: str | None = None


app = FastAPI()


@app.get('/api/health')
def health():
    return {'status': 'ok'}


@app.get('/api/cart')
def cart(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CartItem).where(CartItem.user_id == user)).all()
    return [{'id': row.id, 'product_id': row.product_id, 'quantity': row.quantity} for row in rows]


@app.post('/api/cart')
def add_cart(payload: CartInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    with db.begin():
        product = db.get(Product, payload.product_id)
        existing = db.scalar(select(CartItem).where(CartItem.user_id == user, CartItem.product_id == payload.product_id))
        quantity = payload.quantity + (existing.quantity if existing else 0)
        if product is None or product.stock < quantity:
            raise HTTPException(409, 'Insufficient inventory')
        if existing:
            existing.quantity = quantity
            item = existing
        else:
            item = CartItem(user_id=user, product_id=product.id, quantity=quantity)
            db.add(item)
        db.flush()
        result = {'id': item.id, 'quantity': item.quantity}
    return result


@app.put('/api/cart/{item_id}')
def update_cart(item_id: int, payload: QuantityInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    with db.begin():
        row = db.get(CartItem, item_id)
        if row is None or row.user_id != user:
            raise HTTPException(404, 'Cart item not found')
        product = db.get(Product, row.product_id)
        if product.stock < payload.quantity:
            raise HTTPException(409, 'Insufficient inventory')
        row.quantity = payload.quantity
        result = {'id': row.id, 'quantity': row.quantity}
    return result


@app.delete('/api/cart/{item_id}')
def delete_cart(item_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    with db.begin():
        row = db.get(CartItem, item_id)
        if row is None or row.user_id != user:
            raise HTTPException(404, 'Cart item not found')
        db.delete(row)
    return {'deleted_id': item_id}


@app.post('/api/checkout')
def checkout(payload: CheckoutInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    with db.begin():
        key = str(user) + ':' + payload.idempotency_key
        previous = db.scalar(select(Order).where(Order.request_key == key))
        if previous:
            return {'id': previous.id, 'total_cents': previous.total_cents}
        rows = db.scalars(select(CartItem).where(CartItem.user_id == user)).all()
        if not rows:
            raise HTTPException(400, 'Cart is empty')
        percent = 0
        if payload.coupon_code:
            coupon = db.scalar(select(Coupon).where(Coupon.code == payload.coupon_code))
            if coupon is None or not coupon.active:
                raise HTTPException(400, 'Coupon is invalid or expired')
            changed = db.execute(update(Coupon).where(Coupon.id == coupon.id, Coupon.remaining > 0).values(remaining=Coupon.remaining - 1))
            if changed.rowcount != 1:
                raise HTTPException(400, 'Coupon exhausted')
            percent = coupon.percent
        order = Order(user_id=user, request_key=key, total_cents=0)
        db.add(order)
        db.flush()
        total = 0
        for row in rows:
            product = db.get(Product, row.product_id)
            changed = db.execute(update(Product).where(Product.id == row.product_id, Product.stock >= row.quantity).values(stock=Product.stock - row.quantity))
            if changed.rowcount != 1:
                raise HTTPException(409, 'Insufficient inventory')
            total += product.price_cents * row.quantity
            db.add(OrderItem(order_id=order.id, product_id=product.id, quantity=row.quantity, unit_price_cents=product.price_cents))
            db.delete(row)
        order.total_cents = total * (100 - percent) // 100
        result = {'id': order.id, 'total_cents': order.total_cents}
    return result
