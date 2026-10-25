"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - CONFIGURATION MANAGEMENT
================================================================================
This module defines the global settings for the application using Pydantic Settings.
It handles environment variable parsing, default values, and dynamic path 
resolution across backend components.
"""

import os
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """
    APPLICATION SETTINGS SCHEMA
    Logic: Validates and stores system-wide constants. Pydantic ensures type-safety
    and automatic loading from environment variables or the .env file.
    """
    
    # --- BASIC APP METADATA ---
    # Used in OpenAPI schema generation (http://localhost:8000/docs)
    APP_NAME: str = "ENGINEERING ASSURANCE PLATFORM (AEIAP)"
    VERSION: str = "1.0.0"
    
    # --- RUNTIME ENVIRONMENT ---
    ENV: str = os.getenv("ENV", "development")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = True
    
    # --- ENDPOINT HARDENING ---
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:4173,http://192.168.0.13:5173,http://192.168.0.13:5174,http://192.168.0.49:5173,http://192.168.0.49:5174")
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")
    
    @property
    def parsed_allowed_origins(self) -> list:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
    
    # --- DATABASE PERSISTENCE ---
    # Logic: We force absolute paths for the SQLite DB to prevent connectivity errors 
    # when the backend is launched from different directories (e.g., cron jobs vs terminal).
    _DB_FILENAME: str = "test_planning_stable.db"
    POSTGRES_URL: str = os.getenv("POSTGRES_URL", f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), _DB_FILENAME)}")

    # --- MYSQL MIGRATION SETTINGS ---
    # DB_ENGINE: "sqlite" is the active default for local development.
    # Set DB_ENGINE=mysql in .env to switch to MySQL for production.
    DB_ENGINE: str = os.getenv("DB_ENGINE", "sqlite")
    MYSQL_URL: Optional[str] = None
    
    # --- SECURITY ---
    JWT_SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    @model_validator(mode="after")
    def validate_secrets(self) -> 'Settings':
        if not self.JWT_SECRET_KEY:
            raise RuntimeError("JWT_SECRET_KEY is required in the environment or .env file")
        if self.DB_ENGINE == "mysql" and not self.MYSQL_URL:
            raise RuntimeError("MYSQL_URL is required when DB_ENGINE=mysql")
        return self
    
    # --- AI ENGINE & LLM STRATEGY ---
    # Logic: Defines the default behavior for the Agentic reasoning cluster.
    # USE_NODE_CACHE: Disabled — cache caused stale results and broken end-to-end flows.
    # All nodes now always execute fresh LLM calls.
    USE_NODE_CACHE: bool = False
    
    DEFAULT_LLM_PROVIDER: str = os.getenv("DEFAULT_LLM_PROVIDER", "Groq")
    DEFAULT_GROQ_MODEL: str = os.getenv("DEFAULT_GROQ_MODEL", "llama-3.3-70b-versatile")
    GROQ_LIGHT_MODEL: str = os.getenv("GROQ_LIGHT_MODEL", "llama-3.1-8b-instant")
    DEFAULT_OLLAMA_MODEL: str = os.getenv("DEFAULT_OLLAMA_MODEL", "llama3")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    # Temporary operator switch: default to local-only so cloud keys are ignored
    # unless explicitly re-enabled via env var.
    LOCAL_ONLY_MESH: bool = os.getenv("LOCAL_ONLY_MESH", "true").strip().lower() in {"1", "true", "yes", "on"}
    LOCAL_ONLY_PRIMARY_MODEL: str = os.getenv("LOCAL_ONLY_PRIMARY_MODEL", "deepseek-r1:32b")
    LOCAL_ONLY_FALLBACK_MODEL: str = os.getenv("LOCAL_ONLY_FALLBACK_MODEL", "gemma3:27b")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    VECTOR_MIN_CONFIDENCE_PCT: float = float(os.getenv("VECTOR_MIN_CONFIDENCE_PCT", "25.0"))
    
    # --- MESH ORCHESTRATION PARAMETERS ---
    # Logic: These control the logic in InferenceCoordinator.py
    MESH_MAX_RETRIES: int = int(os.getenv("MESH_MAX_RETRIES", "2"))
    # MESH_ROTATION_ATTEMPTS: max identities tried per tier before tilting.
    # Must be >= the largest tier size (currently 28 strategic identities).
    MESH_ROTATION_ATTEMPTS: int = int(os.getenv("MESH_ROTATION_ATTEMPTS", "30"))
    
    # --- PROVIDER TIMEOUTS (Seconds) ---
    # Logic: Set to 900s (15 mins) to prevent library-specific connections fails for large JSON generations.
    GROQ_TIMEOUT: int = int(os.getenv("GROQ_TIMEOUT", "900"))
    OLLAMA_TIMEOUT: int = int(os.getenv("OLLAMA_TIMEOUT", "900"))
    OPENAI_TIMEOUT: int = int(os.getenv("OPENAI_TIMEOUT", "900"))
    MESH_EXECUTION_CEILING: int = int(os.getenv("MESH_EXECUTION_CEILING", "900"))
    RUNTIME_SESSION_ID: str = os.getenv("RUNTIME_SESSION_ID", "")
    
    # --- RESILIENCY: KEY ROTATION & V2 FALLBACKS ---
    # Logic: Supports both the Identity Vault (DB) and traditional .env fallbacks.
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    GROQ_API_KEYS_RAW: str = os.getenv("GROQ_API_KEYS", "")
    
    @property
    def ALL_GROQ_KEYS(self) -> list:
        # Priority: Keys list -> Single primary key
        keys = [k.strip() for k in self.GROQ_API_KEYS_RAW.split(",") if k.strip()]
        if not keys and self.GROQ_API_KEY:
            keys = [self.GROQ_API_KEY]
        return keys
    # Action: Absolute path resolution.
    # Logic: BASE_DIR identifies the root of the project (parent of /backend) 
    # regardless of where `python -m backend.main` was typed.
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # OUTPUTS_DIR: Location where generated .docx test plans are stored for frontend retrieval.
    OUTPUTS_DIR: str = os.path.join(BASE_DIR, "outputs")
    
    # CHROMA_PERSIST_DIR: Local SQLite storage directory for the Vector Knowledge Base (RAG).
    CHROMA_PERSIST_DIR: str = os.path.join(BASE_DIR, ".chroma_db")

    # --- SETTINGS CONFIGURATION ---
    # This block controls pydantic_settings behavior.
    model_config = {
        "env_file": ".env",    # Tells Pydantic to look for a .env file in the root
        "extra": "ignore"      # Ignores unknown environment variables without throwing errors
    }

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        """
        Accept common deployment-style DEBUG values such as 'release' or 'prod'
        without crashing settings initialization.
        """
        if isinstance(value, bool):
            return value
        if value is None:
            return True

        normalized = str(value).strip().lower()
        truthy = {"1", "true", "yes", "on", "debug", "development", "dev"}
        falsy = {"0", "false", "no", "off", "release", "prod", "production"}

        if normalized in truthy:
            return True
        if normalized in falsy:
            return False
        return False

# Singleton: Instantiate the global settings object used across the codebase.
settings = Settings()
