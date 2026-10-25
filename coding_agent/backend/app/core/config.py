import os
import secrets
from typing import List

try:
    from pydantic_settings import BaseSettings
except ImportError:
    try:
        from pydantic import BaseSettings
    except ImportError:
        class BaseSettings:
            def __init__(self, **values):
                for k, v in values.items():
                    setattr(self, k, v)

class Settings(BaseSettings):
    PROJECT_NAME: str = "App"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    if os.getenv("ENVIRONMENT") == "production" and not os.getenv("SECRET_KEY"):
        raise ValueError("FATAL: SECRET_KEY must be configured in production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    CORS_ORIGINS: List[str] = ["*"]
    
    class Config:
        case_sensitive = True
        extra = "allow"

settings = Settings()
