import os
import logging
from typing import Any, Callable
from functools import wraps

logger = logging.getLogger(__name__)

# --- OPENTELEMETRY SETUP ---
try:
    from opentelemetry import trace
    tracer = trace.get_tracer(__name__)
    OTEL_AVAILABLE = True
except ImportError:
    OTEL_AVAILABLE = False
    logger.warning("OpenTelemetry SDK not installed. Tracing disabled.")

def telemetry_span(name: str):
    """
    ARCHITECTURE: DISTRIBUTED TRACING
    Wraps an agent node execution in an OpenTelemetry span for CISO observability.
    Fails silently if OTel is not installed.
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if OTEL_AVAILABLE:
                with tracer.start_as_current_span(name) as span:
                    span.set_attribute("agent.node_name", name)
                    return func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator

# --- LITELLM PROXY ROUTER ---
def get_enterprise_llm(model: str = "gpt-4o", temperature: float = 0.1, **kwargs) -> Any:
    """
    ARCHITECTURE: LITELLM PROXY ROUTING
    Replaces direct OpenAI calls. Supports BYOM (Bring Your Own Model) like
    vLLM, Ollama, and Claude via LiteLLM transparent routing.
    """
    try:
        from langchain_community.chat_models import ChatLiteLLM
        
        # In a real environment, we would inject cost-tracking callbacks here
        llm = ChatLiteLLM(
            model=model,
            temperature=temperature,
            **kwargs
        )
        return llm
    except ImportError:
        logger.error("LiteLLM or LangChain not installed. Falling back to Mock.")
        # Provide a safe mock for testing if LiteLLM is absent
        class MockLLM:
            model = model
            def invoke(self, *args, **kwargs):
                return "Mock LLM Response"
        return MockLLM()
