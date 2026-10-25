import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from main import app, engine, Base, Product, CartItem, Coupon, Order, OrderItem

client = TestClient(app)
USER1 = {'X-Fixture-User': '1'}
USER2 = {'X-Fixture-User': '2'}


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([Product(id=1, name='First', price_cents=1000, stock=20), Product(id=2, name='Second', price_cents=2000, stock=1), Coupon(code='SAVE10', active=True, remaining=2, percent=10), Coupon(code='EXPIRED', active=False, remaining=2, percent=10)])
        db.commit()


def add(headers=USER1, product=1, quantity=1):
    return client.post('/api/cart', json={'product_id': product, 'quantity': quantity}, headers=headers)


def test_REQ_001_unauthenticated_access_is_denied():
    assert client.get('/api/cart').status_code == 401
    assert client.post('/api/cart', json={'product_id': 1, 'quantity': 1}).status_code == 401


def test_REQ_002_required_fields_and_quantities_are_validated():
    assert client.post('/api/cart', json={}, headers=USER1).status_code == 422
    assert add(quantity=0).status_code == 422
    assert add(quantity=30).status_code == 409


def test_REQ_003_cart_changes_persist_and_return_an_array():
    item = add(quantity=2).json()
    assert client.put('/api/cart/' + str(item['id']), json={'quantity': 3}, headers=USER1).status_code == 200
    assert client.get('/api/cart', headers=USER1).json()[0]['quantity'] == 3
    assert client.delete('/api/cart/' + str(item['id']), headers=USER1).status_code == 200
    assert client.get('/api/cart', headers=USER1).json() == []


def test_REQ_004_cart_ownership_is_enforced():
    item = add().json()
    assert client.get('/api/cart', headers=USER2).json() == []
    assert client.delete('/api/cart/' + str(item['id']), headers=USER2).status_code == 404


def test_REQ_005_invalid_and_expired_coupons_are_rejected():
    add()
    for code in ['UNKNOWN', 'EXPIRED']:
        assert client.post('/api/checkout', headers=USER1, json={'idempotency_key': code, 'coupon_code': code}).status_code == 400
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Order)) == 0
        assert db.get(Product, 1).stock == 20


def test_REQ_006_checkout_failure_rolls_back_order_stock_and_coupon_usage():
    add()
    with Session(engine) as db:
        db.add(CartItem(user_id=1, product_id=2, quantity=2))
        db.commit()
    response = client.post('/api/checkout', headers=USER1, json={'idempotency_key': 'rollback', 'coupon_code': 'SAVE10'})
    assert response.status_code == 409
    with Session(engine) as db:
        assert db.get(Product, 1).stock == 20
        assert db.scalar(select(Coupon).where(Coupon.code == 'SAVE10')).remaining == 2
        assert db.scalar(select(func.count()).select_from(Order)) == 0
        assert db.scalar(select(func.count()).select_from(CartItem)) == 2


def test_REQ_007_checkout_total_history_and_retry_are_consistent():
    add(quantity=2)
    body = {'idempotency_key': 'same-order', 'coupon_code': 'SAVE10'}
    first = client.post('/api/checkout', headers=USER1, json=body)
    assert first.status_code == 200 and first.json()['total_cents'] == 1800
    assert client.post('/api/checkout', headers=USER1, json=body).json() == first.json()
    with Session(engine) as db:
        assert db.get(Product, 1).stock == 18
        assert db.scalar(select(func.count()).select_from(Order)) == 1
        db.get(Product, 1).price_cents = 9999
        db.commit()
        assert db.scalar(select(OrderItem)).unit_price_cents == 1000
