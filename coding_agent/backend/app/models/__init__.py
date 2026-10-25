"""Compatibility package forwarding app.models to app.db.models."""
try:
    from app.db.models import *
except ImportError:
    pass
