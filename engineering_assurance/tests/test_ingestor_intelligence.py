from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.core.base_fetcher import BaseFetcher
from backend.core.ingestion_intelligence import build_requirement_intelligence


class DummyFetcher(BaseFetcher):
    def fetch(self, resource_id):
        return {}


def test_base_fetcher_replaces_generic_acceptance_criteria_fallback():
    raw = {
        "id": "MANUAL-001",
        "summary": "Travel Flight Booking",
        "description": """
        Travel Flight Booking
        1. Select flight
        2. Enter passenger details
        3. Seat selection
        4. Review booking
        5. Proceed to payment
        Payment success -> Booking confirmed
        Logout -> Session cleared
        Payment gateway dependency
        External airline API dependency
        The system shall let travelers search flights.
        The user must enter passenger details before seat selection.
        The system shall confirm the booking after payment success.
        Logout shall clear the current session.
        """,
        "acceptance_criteria": ["Manual validation required"],
        "platform": "local",
    }

    normalized = DummyFetcher().normalize(raw)

    assert len(normalized["acceptance_criteria"]) >= 4
    assert all("manual validation required" not in item.lower() for item in normalized["acceptance_criteria"])
    assert normalized["metadata"]["ingestion_intelligence"]["domain"] == "travel"
    assert normalized["metadata"]["ingestion_intelligence"]["risk_level"] in {"High", "Critical"}


def test_requirement_intelligence_builds_structured_ingestion_graph():
    text = """
    Travel Flight Booking
    1. Select flight
    2. Enter passenger details
    3. Seat selection
    4. Review booking
    5. Proceed to payment
    Payment success -> Booking confirmed
    Logout -> Session cleared
    Payment gateway dependency
    External airline API dependency
    Concurrent traffic and stale availability are known risks.
    REST API integration is required.
    """

    profile = build_requirement_intelligence(
        raw_text=text,
        summary="Travel Flight Booking",
        description=text,
        acceptance_criteria=[
            "The system shall let travelers search flights.",
            "The user must enter passenger details before seat selection.",
            "The system shall confirm the booking after payment success.",
            "Logout shall clear the current session.",
        ],
        modules=["Flight Search", "Booking", "Payment"],
        platform="local",
    )

    assert len(profile["acceptance_criteria"]) >= 4
    assert profile["workflow_graphs"]
    assert profile["workflow_graphs"][0]["steps"]
    assert profile["state_transitions"]
    assert any(item["event"].lower().startswith("payment success") for item in profile["state_transitions"])
    assert any(item["to"].lower() == "booking confirmed" for item in profile["state_transitions"])
    assert any(dep["dependency"] == "Payment Gateway" for dep in profile["dependencies"])
    assert any(dep["dependency"] == "External Airline API" for dep in profile["dependencies"])
    assert any(risk["risk_area"] == "Payment Processing" for risk in profile["risks"])
    assert profile["metadata"]["domain"] == "travel"
    assert profile["metadata"]["architecture"] in {"microservices", "service-oriented"}
    assert "REST" in profile["metadata"]["api_style"]
    assert profile["metadata"]["workflows_detected"] >= 1
    assert profile["metadata"]["dependency_count"] >= 2
    assert profile["metadata"]["risk_level"] in {"High", "Critical"}
    assert profile["entity_registry"]
    assert any(
        entity["entity"] == "Flight Search" or "search" in entity["entity"].lower()
        for entity in profile["entity_registry"]
    )
    assert any(entity["aliases"] for entity in profile["entity_registry"] if entity["type"] == "Workflow Module")


def test_requirement_intelligence_is_domain_dynamic_for_commerce():
    text = """
    Commerce experience for browsing products, adding items to cart, applying coupons, and completing checkout.
    Payment gateway, Redis cache, Elasticsearch, Kafka event bus, notification provider, and logistics API are integrated.
    Payment success should confirm the order and order tracking should reflect shipment status.
    Invalid coupon shows an error.
    High latency, stale search index, and duplicate transaction are risk areas.
    """

    profile = build_requirement_intelligence(
        raw_text=text,
        summary="Commerce Checkout Flow",
        description=text,
        acceptance_criteria=[],
        modules=[],
        platform="local",
    )

    assert profile["metadata"]["domain"] == "commerce"
    assert any(workflow in profile["workflows_detected"] for workflow in ["Product Search", "Cart Management", "Checkout", "Payment Processing", "Order Tracking"])
    assert profile["acceptance_criteria_by_module"]
    assert any("coupon" in item.lower() for item in profile["acceptance_criteria"])
    assert any(dep["dependency"] == "Elasticsearch" for dep in profile["dependencies"])
    assert any(dep["dependency"] == "Kafka Event Bus" for dep in profile["dependencies"])
    assert any(risk["risk_area"] == "Search" or risk["risk_area"] == "Search Accuracy" for risk in profile["risks"])
    assert profile["metadata"]["risk_level"] in {"High", "Critical"}
    assert profile["order_states"]


def test_requirement_intelligence_replaces_generic_acceptance_criteria_with_structured_workflow_rules():
    text = """
    Commerce checkout flow for browsing products, adding items to cart, applying coupons, and completing checkout.
    Payment gateway and logistics API are integrated.
    Payment success should confirm the order and tracking should reflect shipment status.
    """

    profile = build_requirement_intelligence(
        raw_text=text,
        summary="Commerce Checkout Flow",
        description=text,
        acceptance_criteria=[
            "Manual validation required",
            "Verify requirements as described",
        ],
        modules=[],
        platform="local",
    )

    acs = [item.lower() for item in profile["acceptance_criteria"]]

    assert len(acs) >= 4
    assert all("manual validation required" not in item for item in acs)
    assert any("cart" in item or "checkout" in item or "payment" in item for item in acs)
    assert any("order" in item or "shipment" in item or "tracking" in item for item in acs)
    assert profile["acceptance_criteria_by_module"]
    assert any(
        bucket and any("checkout" in item.lower() or "payment" in item.lower() for item in bucket)
        for bucket in profile["acceptance_criteria_by_module"].values()
    )


def test_requirement_intelligence_rejects_meta_personas_narrative_workflows_and_fake_transitions():
    text = """
    Myntra
    MFA support
    User demographics
    User interactions
    The search module enables fast and intelligent product discovery.
    Pending -> Search preferences -> Search Module
    Customer: browse products
    Seller/Vendor: manage catalog
    Admin User: oversee access
    Guest User: browse anonymously
    Loyalty Member: redeem rewards
    """

    profile = build_requirement_intelligence(
        raw_text=text,
        summary="Myntra",
        description=text,
        acceptance_criteria=["Manual validation required"],
        modules=[],
        platform="local",
    )

    workflows = [item.lower() for item in profile["workflows_detected"]]
    entities = [item["entity"].lower() for item in profile["entity_registry"]]

    assert all("mfa support" not in item for item in workflows)
    assert all("user demographics" not in item for item in workflows)
    assert all("user interactions" not in item for item in workflows)
    assert all("the search module enables fast and intelligent product discovery" not in item for item in workflows)
    assert all("myntra" not in item for item in workflows)
    assert all("pending -> search preferences -> search module" not in item for item in workflows)
    assert any(item in {"customer", "seller management", "admin operations", "guest user", "loyalty member"} or "search" in item for item in workflows)
    assert all("myntra" not in item for item in entities)
    assert all("user demographics" not in item for item in entities)
    assert all("user interactions" not in item for item in entities)


def test_requirement_intelligence_filters_noise_and_builds_dependency_graph():
    text = """
    Commerce checkout and product search experience.
    Given fast and seamless checkout for secure payments.
    When the system processes the order, then the product discovery flow should remain stable.
    Checkout & Payments
    Product Search
    Product Discovery
    Returns & Refunds
    Discovery
    Search
    Redis cache, Kafka event bus, Elasticsearch, and Payment Gateway are integrated.
    Payment success should confirm the order and tracking should reflect shipment status.
    """

    profile = build_requirement_intelligence(
        raw_text=text,
        summary="Commerce Checkout Flow",
        description=text,
        acceptance_criteria=["Manual validation required"],
        modules=[],
        platform="local",
    )

    workflows = [item.lower() for item in profile["workflows_detected"]]
    ambiguity_terms = [item.lower() for item in profile.get("ambiguity_terms", [])]
    dependency_names = [item["dependency"] for item in profile["dependencies"]]
    dependency_graph = profile.get("dependency_graph", [])
    integration_map = profile.get("integration_map", [])

    assert "given" not in workflows
    assert "when" not in workflows
    assert "then" not in workflows
    assert "the" not in workflows
    assert "system" not in workflows
    assert "fast" not in workflows
    assert "seamless" not in workflows
    assert "secure" not in workflows
    assert "fast" in ambiguity_terms
    assert "seamless" in ambiguity_terms
    assert "secure" in ambiguity_terms
    assert "Payment Gateway" in dependency_names
    assert "Redis Cache" in dependency_names
    assert "Kafka Event Bus" in dependency_names
    assert "Elasticsearch" in dependency_names
    assert dependency_graph
    assert integration_map
    assert any(edge["workflow"] in {"Checkout & Payments", "Product Search", "Product Discovery"} for edge in dependency_graph)
    assert any(edge["dependency"] in {"Payment Gateway", "Redis Cache", "Kafka Event Bus", "Elasticsearch"} for edge in integration_map)
    assert len(workflows) == len(set(workflows))
    assert any(workflow in {"checkout & payments", "product search", "product discovery", "returns & refunds"} for workflow in workflows)
