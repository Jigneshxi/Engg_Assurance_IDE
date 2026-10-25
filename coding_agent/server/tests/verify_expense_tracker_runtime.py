import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure backend path is in sys.path
workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'workspaces', 'expense_tracker'))
backend_dir = os.path.join(workspace_dir, 'backend')
sys.path.insert(0, backend_dir)
os.environ["SECRET_KEY"] = "test-secret-key-12345"

print("=== EXPENSE TRACKER RUNTIME VERIFICATION ===")
print("Workspace:", workspace_dir)
print("Backend Dir:", backend_dir)

# 1. Test database models & tables creation
print("\n--- STEP 1: Initializing Database & Tables ---")
from app.db.database import engine, Base, SessionLocal
from app.db.models import User, Category, Transaction

Base.metadata.create_all(bind=engine)
print("✓ SQLite tables created successfully (User, Category, Transaction).")

# 2. Test Seed script
print("\n--- STEP 2: Running Seed Data ---")
from app.db.seed import seed_database
seed_database()
print("✓ Seed execution completed.")

# 3. Verify Database Records
print("\n--- STEP 3: Verifying Database Records ---")
db = SessionLocal()
categories = db.query(Category).all()
users = db.query(User).all()
transactions = db.query(Transaction).all()

print(f"Categories in DB: {len(categories)} (e.g. {[c.name for c in categories[:3]]})")
print(f"Users in DB: {len(users)} (e.g. {[u.username for u in users]})")
print(f"Transactions in DB: {len(transactions)}")
assert len(categories) > 0, "Categories table is empty!"
assert len(users) > 0, "Users table is empty!"
db.close()

# 4. Test FastAPI Application Endpoints via TestClient
print("\n--- STEP 4: Verifying FastAPI REST Endpoints via TestClient ---")
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# Test 4.1: Register new user
print("Testing: POST /api/auth/register...")
reg_res = client.post("/api/auth/register", json={
    "username": "janedoe",
    "password": "securepassword123"
})
print("Register status:", reg_res.status_code)
assert reg_res.status_code in [200, 201], f"Register failed: {reg_res.text}"
print("✓ User registration passed.")

# Test 4.2: Login user
print("Testing: POST /api/auth/login...")
login_res = client.post("/api/auth/login", json={
    "username": "janedoe",
    "password": "securepassword123"
})
print("Login status:", login_res.status_code)
assert login_res.status_code == 200, f"Login failed: {login_res.text}"
token = login_res.json().get("access_token")
assert token, "No access_token returned"
print("✓ User login passed. Token received.")

# Test 4.3: List categories
print("Testing: GET /api/categories...")
cat_res = client.get("/api/categories")
print("Categories status:", cat_res.status_code)
assert cat_res.status_code == 200, f"Categories failed: {cat_res.text}"
cat_data = cat_res.json()
assert len(cat_data) > 0, "No categories returned"
cat_id = cat_data[0]["id"]
print(f"✓ Categories list passed. Found {len(cat_data)} categories.")

# Test 4.4: Create a new category
print("Testing: POST /api/categories...")
new_cat_res = client.post("/api/categories", json={"name": "Investment"})
print("New category status:", new_cat_res.status_code)
assert new_cat_res.status_code in [200, 201], f"Create category failed: {new_cat_res.text}"
print("✓ Category creation passed.")

print("\n========================================")
print("ALL RUNTIME VERIFICATION CHECKS PASSED ✓")
print("========================================")
