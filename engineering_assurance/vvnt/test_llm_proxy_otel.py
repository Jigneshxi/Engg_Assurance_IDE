import pytest
from unittest.mock import patch

def test_litellm_proxy_routing():
    """
    Scenario A: Prove that the LLM instantiation logic uses LiteLLM
    so that BYOM (e.g. ollama) can be used without OpenAI API keys.
    """
    try:
        from backend.core.llm import get_enterprise_llm
    except ImportError:
        pytest.fail("Architecture Risk: backend.core.llm.get_enterprise_llm is missing.")

    # Request a local model
    llm = get_enterprise_llm(model="ollama/llama3")
    
    # Assert that it returns a valid LangChain Chat model proxy
    assert hasattr(llm, "invoke"), "LiteLLM proxy must implement the LangChain BaseChatModel interface (invoke)."
    # Assert that it correctly registered the custom model string
    assert getattr(llm, "model", "") == "ollama/llama3" or getattr(llm, "model_name", "") == "ollama/llama3", "Model routing failed."

def test_opentelemetry_span_generation():
    """
    Scenario B: Prove that agent node executions are wrapped in OpenTelemetry spans
    for CISO observability requirements.
    """
    try:
        from backend.core.llm import telemetry_span
    except ImportError:
        pytest.fail("Architecture Risk: telemetry_span decorator is missing.")

    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    import opentelemetry.trace as trace

    # Setup in-memory exporter to capture spans during the test
    provider = TracerProvider()
    memory_exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(memory_exporter))
    trace.set_tracer_provider(provider)

    @telemetry_span(name="test_agent_node")
    def mock_agent_node():
        return "Agent Result"

    # Execute the mock node
    result = mock_agent_node()
    assert result == "Agent Result"

    # Verify that OTel captured the span
    spans = memory_exporter.get_finished_spans()
    assert len(spans) == 1, "Observability Risk: No OpenTelemetry span was generated."
    assert spans[0].name == "test_agent_node", "Span name mismatch."
