/**
 * Deterministic Foundation Templates (Milestone 1)
 * These real, working implementations are written before any LLM feature generation
 * to ensure that all core modules, auth, and API client contracts always exist.
 */

import { getFrontendPackageJson, getBackendRequirementsTxt } from './stackAllowlist.js';

export const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite:///./app.db
      - SECRET_KEY=development-secret-key-change-in-production
      - ENVIRONMENT=development
    volumes:
      - ./backend:/app

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:80"
    depends_on:
      - backend
`;

export const BACKEND_DOCKERFILE_TEMPLATE = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

export const FRONTEND_DOCKERFILE_TEMPLATE = `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

export const FRONTEND_INDEX_CSS_TEMPLATE = `*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  --bg-primary: #0f172a;
  --bg-surface: #1e293b;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #334155;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
`;

export const PLAYWRIGHT_CONFIG_TEMPLATE = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://127.0.0.1:5173',
    headless: true,
    browserName: 'chromium'
  }
});
`;

export const TSCONFIG_JSON_TEMPLATE = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    useDefineForClassFields: true,
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    skipLibCheck: true,
    moduleResolution: 'bundler',
    allowImportingTsExtensions: false,
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: true,
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true
  },
  include: ['src']
}, null, 2) + '\n';

export const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
`;

export const ENV_EXAMPLE_TEMPLATE = `DATABASE_URL=sqlite:///./app.db\nSECRET_KEY=replace-with-a-secure-32-byte-random-string\nENVIRONMENT=development\nFRONTEND_URL=http://127.0.0.1:5173\n`;

export const DEFAULT_ALEMBIC_INI_CONTENT = `[alembic]
script_location = alembic
sqlalchemy.url = sqlite:///./app.db

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
`;

export const DEFAULT_ALEMBIC_ENV_CONTENT = `import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Ensure project and backend directories are on sys.path
_cur_dir = os.path.dirname(os.path.abspath(__file__))
_search_dirs = [
    os.path.abspath('.'),
    os.path.abspath('backend'),
    os.path.abspath('..'),
    os.path.abspath(os.path.join(_cur_dir, '..')),
    os.path.abspath(os.path.join(_cur_dir, '..', '..')),
    os.path.abspath(os.path.join(_cur_dir, '..', 'app')),
    os.path.abspath(os.path.join(_cur_dir, '..', '..', 'app')),
]
for _d in _search_dirs:
    if os.path.isdir(_d) and _d not in sys.path:
        sys.path.insert(0, _d)

try:
    from app.db.base import Base
except ImportError:
    try:
        from app.db.database import Base
    except ImportError:
        try:
            from backend.app.db.base import Base
        except ImportError:
            from sqlalchemy.orm import declarative_base
            Base = declarative_base()

target_metadata = Base.metadata

def get_url():
    return os.getenv("DATABASE_URL", "sqlite:///./app.db")

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = create_engine(get_url())
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
`;

export const DEFAULT_ALEMBIC_SCRIPT_MAKO = `"""\${message}

Revision ID: \${up_revision}
Revises: \${down_revision | comma,n}
Create Date: \${create_date}

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
\${imports if imports else ""}

revision: str = \${repr(up_revision)}
down_revision: Union[str, None] = \${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = \${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = \${repr(depends_on)}

def upgrade() -> None:
    \${upgrades if upgrades else "pass"}

def downgrade() -> None:
    \${downgrades if downgrades else "pass"}
`;

export const DEFAULT_ALEMBIC_INITIAL_SCRIPT = `"""Initial database migration placeholder.

Revision ID: 20231025_initial
Revises: None
Create Date: 2023-10-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20231025_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
`;

export function isBoilerplateFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const p = filePath.replace(/\\/g, '/').toLowerCase();

  // Docker & compose
  if (p === 'docker-compose.yml' || p === 'docker-compose.yaml') return true;
  if (p === 'backend/dockerfile' || p === 'dockerfile') return true;
  if (p === 'frontend/dockerfile') return true;

  // Frontend configs & entrypoints
  if (p === 'frontend/package.json' || p === 'package.json') return true;
  if (p === 'frontend/tsconfig.json' || p === 'tsconfig.json') return true;
  if (p === 'frontend/vite.config.ts' || p === 'vite.config.ts') return true;
  if (p === 'frontend/index.html' || p === 'index.html') return true;
  if (p === 'frontend/src/main.tsx' || p === 'src/main.tsx') return true;
  if (p === 'frontend/src/index.css' || p === 'src/index.css') return true;
  if (p === 'frontend/playwright.config.ts' || p === 'playwright.config.ts' || p === 'frontend/tests/playwright.config.ts') return true;

  // Backend configs
  if (p === 'backend/requirements.txt' || p === 'requirements.txt') return true;
  if (p === 'backend/.env.example' || p === '.env.example') return true;
  if (p === 'backend/main.py' || p === 'main.py') return true;
  if (p === 'backend/app/db/base.py' || p.endsWith('/app/db/base.py') || p === 'app/db/base.py') return true;

  // Alembic / migrations
  if (p === 'alembic.ini' || p.endsWith('/alembic.ini')) return true;
  if (p === 'alembic/env.py' || p.endsWith('/alembic/env.py') || p === 'migrations/env.py' || p.endsWith('/migrations/env.py') || p.endsWith('app/db/migrations/env.py')) return true;
  if (p.endsWith('script.py.mako') || p.endsWith('/migrations/script.py') || p.endsWith('app/db/migrations/script.py') || p === 'migrations/script.py') return true;

  return false;
}

export function generateDeterministicBasePy(modelsContent = '', declaredEntities = []) {
  const modelNames = new Set(declaredEntities || []);
  if (modelsContent && typeof modelsContent === 'string') {
    const classMatches = modelsContent.matchAll(/class\s+([A-Za-z0-9_]+)\s*\(\s*Base\s*\)\s*:/g);
    for (const match of classMatches) {
      if (match[1]) modelNames.add(match[1]);
    }
  }

  const modelList = Array.from(modelNames).sort();
  const imports = modelList.length > 0
    ? `\n# Import all models so that Base.metadata has them registered before migrations\ntry:\n    from app.db.models import ${modelList.join(', ')}  # noqa: F401\nexcept ImportError:\n    pass\n`
    : `\ntry:\n    from app.db import models  # noqa: F401\nexcept ImportError:\n    pass\n`;

  const allList = ['"Base"', ...modelList.map(m => `"${m}"`)].join(', ');

  return `"""Authoritative Base model export for SQLAlchemy and Alembic."""\nfrom app.db.database import Base  # noqa: F401\n${imports}\n__all__ = [${allList}]\n`;
}

export const DEFAULT_SEED_PY_CONTENT = `"""Authoritative database seed script for initial user and platform data."""
import os
from sqlalchemy.orm import Session
from app.db.database import engine, SessionLocal, Base
from app.core.security import get_password_hash

try:
    from app.db import models
except ImportError:
    models = None

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        if models and hasattr(models, 'User'):
            User = getattr(models, 'User')
            users_to_seed = [
                {"username": "admin", "email": "admin@example.com", "role": "Admin", "is_active": True},
                {"username": "distributor", "email": "distributor@example.com", "role": "Distributor", "is_active": True},
                {"username": "retailer", "email": "retailer@example.com", "role": "Retailer", "is_active": True},
            ]
            for u_data in users_to_seed:
                exists = db.query(User).filter((User.username == u_data["username"]) | (User.email == u_data["email"])).first()
                if not exists:
                    u_kwargs = {k: v for k, v in u_data.items() if hasattr(User, k)}
                    if hasattr(User, "hashed_password"):
                        u_kwargs["hashed_password"] = get_password_hash("Password123!")
                    elif hasattr(User, "password"):
                        u_kwargs["password"] = get_password_hash("Password123!")
                    user = User(**u_kwargs)
                    db.add(user)
            db.commit()
            print("Successfully seeded initial users with Admin, Distributor, and Retailer roles.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
`;

export function getBoilerplateTemplate(filePath, projectName = 'QuickCart', context = {}) {
  if (!filePath || typeof filePath !== 'string') return null;
  const p = filePath.replace(/\\/g, '/').toLowerCase();
  const isEcommerce = /cart|shop|store|product|order|checkout|ecommerce/i.test(projectName);

  if (p === 'backend/app/db/base.py' || p.endsWith('/app/db/base.py') || p === 'app/db/base.py') {
    const entities = context?.declaredEntities || [];
    const modelsContent = context?.modelsContent || '';
    return generateDeterministicBasePy(modelsContent, entities);
  }
  if (p === 'docker-compose.yml' || p === 'docker-compose.yaml') return DOCKER_COMPOSE_TEMPLATE;
  if (p === 'backend/dockerfile' || p === 'dockerfile') return BACKEND_DOCKERFILE_TEMPLATE;
  if (p === 'frontend/dockerfile') return FRONTEND_DOCKERFILE_TEMPLATE;
  if (p === 'frontend/package.json' || p === 'package.json') return getFrontendPackageJson(projectName);
  if (p === 'frontend/tsconfig.json' || p === 'tsconfig.json') return TSCONFIG_JSON_TEMPLATE;
  if (p === 'frontend/vite.config.ts' || p === 'vite.config.ts') return VITE_CONFIG_TEMPLATE;
  if (p === 'frontend/index.html' || p === 'index.html') return `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`;
  if (p === 'frontend/src/main.tsx' || p === 'src/main.tsx') {
    return `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport App from './App';\nimport './index.css';\nimport { AuthProvider } from './context/AuthContext';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <BrowserRouter>\n      <AuthProvider>\n        <App />\n      </AuthProvider>\n    </BrowserRouter>\n  </React.StrictMode>\n);\n`;
  }
  if (p === 'frontend/src/index.css' || p === 'src/index.css') return FRONTEND_INDEX_CSS_TEMPLATE;
  if (p === 'frontend/playwright.config.ts' || p === 'playwright.config.ts' || p === 'frontend/tests/playwright.config.ts') return PLAYWRIGHT_CONFIG_TEMPLATE;
  if (p === 'backend/requirements.txt' || p === 'requirements.txt') return getBackendRequirementsTxt();
  if (p === 'backend/.env.example' || p === '.env.example') return ENV_EXAMPLE_TEMPLATE;
  if (p === 'backend/main.py') return `"""Root forwarder for Uvicorn and test runners."""\nfrom app.main import app\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)\n`;
  if (p === 'alembic.ini' || p.endsWith('/alembic.ini')) return DEFAULT_ALEMBIC_INI_CONTENT;
  if (p === 'alembic/env.py' || p.endsWith('/alembic/env.py') || p === 'migrations/env.py' || p.endsWith('/migrations/env.py') || p.endsWith('app/db/migrations/env.py')) return DEFAULT_ALEMBIC_ENV_CONTENT;
  if (p.endsWith('script.py.mako')) return DEFAULT_ALEMBIC_SCRIPT_MAKO;
  if (p.endsWith('seed.py') || p.endsWith('seeds.py')) return DEFAULT_SEED_PY_CONTENT;

  return null;
}

export function getFoundationFiles(projectName = 'App') {
  const mainTsxContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
`;

  const files = [
    // 1. Backend Core Config
    {
      path: 'backend/app/core/config.py',
      purpose: 'Core application settings and environment parsing',
      content: `import os
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
    PROJECT_NAME: str = "${projectName}"
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
`
    },

    // 2. Backend DB Database
    {
      path: 'backend/app/db/database.py',
      purpose: 'SQLAlchemy database engine, session, Base and get_db dependency',
      content: `from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`
    },

    // 3. Backend Core Security
    {
      path: 'backend/app/core/security.py',
      purpose: 'Cryptographic password hashing and verified JWT generation',
      content: `from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise ValueError("Invalid or expired token")
`
    },

    // 4. Backend API Dependencies (AuthZ & Scoping)
    {
      path: 'backend/app/api/deps.py',
      purpose: 'Authentication and role-based authorization dependencies',
      content: `from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.security import decode_access_token, create_access_token, verify_password, get_password_hash

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user_id = payload.get("sub") or payload.get("id") or payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing subject identifier"
        )
    
    # Return structured user dict including verified role
    role = payload.get("role", "")
    return {
        "id": int(user_id) if str(user_id).isdigit() else user_id,
        "email": payload.get("email", ""),
        "role": role,
        "is_active": True
    }

def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = str(current_user.get("role", "")).lower()
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user
`
    },

    // 5. Backend Core Errors
    {
      path: 'backend/app/core/errors.py',
      purpose: 'Standardized error format handling without stack trace leaks',
      content: `from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

def setup_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.status_code, "message": str(exc.detail), "details": None}}
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": {"code": 400, "message": "Validation Error", "details": exc.errors()}}
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": {"code": 500, "message": "Internal Server Error", "details": None}}
        )
`
    },

    // 6. Backend App Main (Single authoritative entry point)
    {
      path: 'backend/app/main.py',
      purpose: 'Authoritative FastAPI entrypoint mounting CORS and router catalog',
      content: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.errors import setup_exception_handlers

app = FastAPI(title=settings.PROJECT_NAME)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_exception_handlers(app)

@app.get("/health")
def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

# Routers will be registered here by the generator / wireApplication hook
`
    },

    // 7. Backend Root Entrypoint Forwarder
    {
      path: 'backend/main.py',
      purpose: 'Root execution forwarder pointing directly to app.main',
      content: `"""Root forwarder for Uvicorn and test runners."""
from app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
`
    },

    // 8. Backend Requirements & Env
    {
      path: 'backend/requirements.txt',
      purpose: 'Pinned dependencies',
      content: getBackendRequirementsTxt()
    },
    {
      path: 'backend/.env.example',
      purpose: 'Safe environment variables template',
      content: `DATABASE_URL=sqlite:///./app.db\nSECRET_KEY=replace-with-a-secure-32-byte-random-string\nENVIRONMENT=development\n`
    },

    // 9. Frontend Package.json
    {
      path: 'frontend/package.json',
      purpose: 'Frontend npm dependencies and build scripts',
      content: getFrontendPackageJson()
    },

    // 10. Frontend Vite Config
    {
      path: 'frontend/vite.config.ts',
      purpose: 'Vite build and dev-server configuration with /api proxy',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
`
    },

    // 11. Frontend TSConfig
    {
      path: 'frontend/tsconfig.json',
      purpose: 'TypeScript compiler configuration',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: false,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src']
      }, null, 2) + '\n'
    },

    // 12. Frontend Index HTML
    {
      path: 'frontend/index.html',
      purpose: 'Main web document',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    },

    // 13. Frontend Main TSX
    {
      path: 'frontend/src/main.tsx',
      purpose: 'React bootstrap mounting App within Context Providers',
      content: mainTsxContent
    },

    // 14. Frontend Root App Component
    {
      path: 'frontend/src/App.tsx',
      purpose: 'Main application router and root layout shell',
      content: `import React from 'react';

export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1>${projectName}</h1>
      <p>Workspace initialized and ready.</p>
    </div>
  );
}
`
    },

    // 14. Frontend API Client
    {
      path: 'frontend/src/api/client.ts',
      purpose: 'Unified Axios client attaching auth tokens and standardizing error handling',
      content: `import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export const apiClient: AxiosInstance = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json'
  }
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = \`Bearer \${token}\`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const errorPayload = error.response?.data?.error || {
      code: error.response?.status || 500,
      message: error.response?.data?.detail || error.message || 'Network Error',
      details: null
    };
    return Promise.reject(errorPayload);
  }
);

export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) => apiClient.get<T>(url, config).then(res => res.data),
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.post<T>(url, data, config).then(res => res.data),
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.put<T>(url, data, config).then(res => res.data),
  delete: <T = any>(url: string, config?: AxiosRequestConfig) => apiClient.delete<T>(url, config).then(res => res.data),
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.patch<T>(url, data, config).then(res => res.data)
};

export default api;
`
    },

    // 15. Frontend AuthContext
    {
      path: 'frontend/src/context/AuthContext.tsx',
      purpose: 'Authentication state management and JWT token lifecycle',
      content: `import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: number | string;
  email: string;
  role: 'customer' | 'admin' | string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  login: () => {},
  logout: () => {}
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
`
    },


    // 17. Frontend ProtectedRoute Component
    {
      path: 'frontend/src/components/ProtectedRoute.tsx',
      purpose: 'Role-based and authenticated route boundary',
      content: `import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#b91c1c' }}>
        <h2>403 - Forbidden</h2>
        <p>You do not have administrative privileges to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
`
    },
    // 18. Backend Dockerfile
    {
      path: 'backend/Dockerfile',
      purpose: 'Production backend container definition',
      content: BACKEND_DOCKERFILE_TEMPLATE
    },
    // 19. Frontend Dockerfile
    {
      path: 'frontend/Dockerfile',
      purpose: 'Production frontend container multi-stage build',
      content: FRONTEND_DOCKERFILE_TEMPLATE
    },
    // 20. Docker Compose
    {
      path: 'docker-compose.yml',
      purpose: 'Multi-service orchestration compose file',
      content: DOCKER_COMPOSE_TEMPLATE
    },
    // 21. Frontend Global Styles
    {
      path: 'frontend/src/index.css',
      purpose: 'Base styles and design tokens',
      content: FRONTEND_INDEX_CSS_TEMPLATE
    },
    // 22. Frontend Playwright Config
    {
      path: 'frontend/playwright.config.ts',
      purpose: 'End-to-end browser test configuration',
      content: PLAYWRIGHT_CONFIG_TEMPLATE
    }
  ];

  return files;
}
