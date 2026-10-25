from fastapi import APIRouter, Request
from backend.core.auth_models import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def get_current_user() -> User:
    """Mock user dependency, unconditionally grants admin access."""
    return User(
        id=1,
        username="Admin_Bypass",
        email="admin@local.host",
        is_superuser=True,
        is_active=True
    )

def require_admin():
    """Mock admin dependency, unconditionally grants access."""
    return get_current_user()

def verify_mission_ownership(request: Request, mission, current_user: User):
    """Mock ownership check, unconditionally grants access."""
    return True

def verify_task_ownership(request: Request, task, current_user: User):
    """Mock ownership check, unconditionally grants access."""
    return True

@router.get("/me")
def read_users_me():
    return get_current_user()

@router.get("/session")
def get_session():
    user = get_current_user()
    return {
        "authenticated": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_superuser": user.is_superuser,
            "is_active": user.is_active
        }
    }

@router.get("/health")
def health_check():
    return {"status": "ok"}
