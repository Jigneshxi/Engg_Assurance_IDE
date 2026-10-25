import uuid
from datetime import datetime
from fastapi import Request
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal
from backend.core.auth_models import SecurityAuditLog
import logging

logger = logging.getLogger(__name__)

def generate_correlation_id() -> str:
    return str(uuid.uuid4())

def log_security_event(
    request: Request,
    event_type: str,
    status_code: int,
    reason: str = None,
    user_id: int = None,
    resource_id: str = None,
    db: Session = None
):
    """
    Explicitly logs a security event to the SecurityAuditLog table.
    Captures correlation ID from request state if available.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        correlation_id = getattr(request.state, "correlation_id", None)
        
        # Get IP address safely
        ip_address = None
        if request.client:
            ip_address = request.client.host
        
        user_agent = request.headers.get("user-agent")
        method = request.method
        endpoint = str(request.url.path)
        
        audit_log = SecurityAuditLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            event_type=event_type,
            ip_address=ip_address,
            endpoint=endpoint,
            method=method,
            resource_id=resource_id,
            status_code=status_code,
            reason=reason,
            user_agent=user_agent,
            correlation_id=correlation_id
        )
        
        db.add(audit_log)
        db.commit()
    except Exception as e:
        logger.error(f"[AUDIT LOG FAILURE] Failed to write security audit log: {e}")
    finally:
        if close_db:
            db.close()
