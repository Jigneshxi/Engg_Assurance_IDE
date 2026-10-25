import time
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

# Deterministic entity schema templates — no LLM needed
_ENTITY_SCHEMAS = {
    "customer": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "name": {"type": "string", "minLength": 1},
            "email": {"type": "string", "format": "email"},
            "phone": {"type": "string"},
            "address": {"type": "string"},
        },
        "required": ["id", "name", "email"],
    },
    "product": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "sku": {"type": "string"},
            "name": {"type": "string", "minLength": 1},
            "price": {"type": "number", "minimum": 0},
            "category": {"type": "string"},
            "description": {"type": "string"},
        },
        "required": ["id", "sku", "name", "price"],
    },
    "order": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "customer_id": {"type": "string", "format": "uuid"},
            "items": {"type": "array", "items": {"type": "object"}},
            "total": {"type": "number", "minimum": 0},
            "status": {"type": "string", "enum": ["pending", "confirmed", "shipped", "delivered", "cancelled"]},
            "created_at": {"type": "string", "format": "date-time"},
        },
        "required": ["id", "customer_id", "items", "total", "status"],
    },
    "user": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "username": {"type": "string", "minLength": 3},
            "email": {"type": "string", "format": "email"},
            "role": {"type": "string", "enum": ["admin", "editor", "viewer", "guest"]},
            "active": {"type": "boolean"},
            "created_at": {"type": "string", "format": "date-time"},
        },
        "required": ["id", "username", "email", "role"],
    },
    "payment": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "order_id": {"type": "string", "format": "uuid"},
            "amount": {"type": "number", "minimum": 0},
            "currency": {"type": "string", "minLength": 3, "maxLength": 3},
            "method": {"type": "string", "enum": ["credit_card", "debit_card", "paypal", "bank_transfer"]},
            "status": {"type": "string", "enum": ["pending", "completed", "failed", "refunded"]},
            "processed_at": {"type": "string", "format": "date-time"},
        },
        "required": ["id", "order_id", "amount", "currency", "method", "status"],
    },
    "transaction": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "type": {"type": "string", "enum": ["credit", "debit", "transfer"]},
            "amount": {"type": "number"},
            "from_account": {"type": "string"},
            "to_account": {"type": "string"},
            "timestamp": {"type": "string", "format": "date-time"},
        },
        "required": ["id", "type", "amount", "timestamp"],
    },
}

_GENERIC_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "data": {"type": "string"},
    },
    "required": ["id"],
}


@ToolRegistry.register
class SchemaGeneratorAdapter(BaseToolAdapter):
    name = "schema_generator"
    category = "general"

    @classmethod
    def get_version(cls) -> str:
        return "1.0.0"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return True

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload
        entity = payload.get("entity", "generic").lower().strip()

        schema = _ENTITY_SCHEMAS.get(entity, _GENERIC_SCHEMA)

        duration_ms = int((time.time() - start_time) * 1000)
        return ToolExecutionResult(
            tool_name=self.name,
            success=True,
            duration_ms=duration_ms,
            summary={"entity": entity, "schema": schema},
        )
