import pytest
from httpx import ASGITransport, AsyncClient

@pytest.fixture
async def client():
    try:
        from main import app
    except ImportError:
        from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
def db():
    from app.db.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(autouse=True)
def setup_and_seed_db():
    from app.db.database import Base, engine
    Base.metadata.create_all(bind=engine)
    try:
        from app.db.models import Product
    except ImportError:
        Product = None
    if Product is not None:
        from app.db.database import SessionLocal
        session = SessionLocal()
        try:
            values = {}
            if hasattr(Product, 'name'):
                values['name'] = 'Test Product'
            elif hasattr(Product, 'title'):
                values['title'] = 'Test Product'
            if values:
                existing = session.query(Product).filter_by(**values).first()
                if existing is None:
                    session.add(Product(**values))
                    session.commit()
        finally:
            session.close()
    yield

@pytest.fixture
def auth_headers(client):
    from app.core.security import create_access_token
    token = create_access_token(data={"sub": "test@example.com", "role": "customer"})
    return {"Authorization": f"Bearer {token}"}
