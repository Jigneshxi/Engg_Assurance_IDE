import os
import sys
import tempfile
import pytest

# Ensure isolated database
temp_db_fd, temp_db_path = tempfile.mkstemp(suffix='.db')
os.close(temp_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{temp_db_path}"
os.environ["SECRET_KEY"] = "production-secret-key-32bytes-minimum"
os.environ["JWT_SECRET"] = "production-secret-key-32bytes-minimum"

workspace_dir = os.environ.get("WORKSPACE_BACKEND") or os.path.abspath(os.path.join(os.path.dirname(__file__), "../../server/workspaces/quickcart-ecommerce-platform/backend"))
sys.path.insert(0, workspace_dir)

from fastapi.testclient import TestClient
from main import app
from app.db.database import engine, Base, SessionLocal
from app.db.models import Customer, Product, Category, Cart
from app.utils.jwt_utils import create_access_token

# Create fresh schema in temp db
Base.metadata.create_all(bind=engine)

client = TestClient(app)

print("--- STARTING ISOLATED BACKEND TEST SUITE ---")

# 1. Customer Registration
print("\n[TEST 1] Registration via /customers/register and /api/customers/register")
reg_payload = {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "password": "SecurePassword123!",
    "phone": "555-0100"
}
resp = client.post("/customers/register", json=reg_payload)
print(f"POST /customers/register: Status={resp.status_code}, Body={resp.json()}")
assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
registered_user = resp.json()
user_id = registered_user["id"]
assert registered_user["email"] == "alice@example.com"

# Duplicate registration rejection
dup_resp = client.post("/customers/register", json=reg_payload)
print(f"POST /customers/register (duplicate): Status={dup_resp.status_code}")
assert dup_resp.status_code == 400

# 2. Invalid Login
print("\n[TEST 2] Invalid Login Rejection")
bad_login_payload = {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "password": "WrongPassword999",
    "phone": "555-0100"
}
resp_bad = client.post("/customers/login", json=bad_login_payload)
print(f"POST /customers/login (wrong password): Status={resp_bad.status_code}, Body={resp_bad.json()}")
assert resp_bad.status_code == 401, f"Expected 401, got {resp_bad.status_code}"

# 3. Valid Login
print("\n[TEST 3] Valid Login")
good_login_payload = {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "password": "SecurePassword123!",
    "phone": "555-0100"
}
resp_good = client.post("/customers/login", json=good_login_payload)
print(f"POST /customers/login: Status={resp_good.status_code}, Body={resp_good.json()}")
assert resp_good.status_code == 200, f"Expected 200, got {resp_good.status_code}"

# Generate valid JWT token for authenticated flows
token = create_access_token(data={"sub": str(user_id), "id": user_id, "email": "alice@example.com"})
auth_headers = {"Authorization": f"Bearer {token}"}

# 4. Unauthenticated Access Rejection
print("\n[TEST 4] Unauthenticated Access Rejection")
resp_unauth = client.get("/cart/me")
print(f"GET /cart/me (no token): Status={resp_unauth.status_code}")
assert resp_unauth.status_code == 401, f"Expected 401, got {resp_unauth.status_code}"

# 5. Authorized Access
print("\n[TEST 5] Authorized Access")
resp_auth_cart = client.get("/cart/me", headers=auth_headers)
print(f"GET /cart/me (with valid token): Status={resp_auth_cart.status_code}, Body={resp_auth_cart.json()}")
assert resp_auth_cart.status_code == 200, f"Expected 200, got {resp_auth_cart.status_code}"

# 6. Seed Product and Test Cart Operations
print("\n[TEST 6] Cart Operations")
db = SessionLocal()
try:
    cat = Category(name="Electronics")
    db.add(cat)
    db.commit()
    db.refresh(cat)
    
    prod = Product(
        name="Wireless Headphones",
        sku="HEADPHONES-01",
        description="Noise cancelling",
        price=99.99,
        stock_quantity=50,
        category_id=cat.id
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    product_id = prod.id
finally:
    db.close()

cart_add_payload = {
    "product_id": product_id,
    "quantity": 2
}
resp_add = client.post("/cart/add", json=cart_add_payload, headers=auth_headers)
print(f"POST /cart/add: Status={resp_add.status_code}, Body={resp_add.json()}")
assert resp_add.status_code == 200, f"Expected 200, got {resp_add.status_code}"

# 7. Order Creation
print("\n[TEST 7] Order Creation")
order_payload = {
    "items": [
        {
            "product_id": product_id,
            "quantity": 1,
            "price": 99.99
        }
    ],
    "shipping_address": "123 Main St, New York, NY",
    "payment_method": "credit_card"
}
resp_order = client.post("/orders", json=order_payload, headers=auth_headers)
print(f"POST /orders: Status={resp_order.status_code}, Body={resp_order.json()}")
assert resp_order.status_code in [200, 201], f"Expected 200 or 201, got {resp_order.status_code}"

print("\n--- ALL 7 ISOLATED BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY! ---")

# Clean up temp db
try:
    os.remove(temp_db_path)
except Exception:
    pass
