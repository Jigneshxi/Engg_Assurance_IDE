from pathlib import Path
import sys
import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

state_stub = types.ModuleType("backend.agents.state")
state_stub.AgentState = dict
state_stub.log_step = lambda *args, **kwargs: None
sys.modules.setdefault("backend.agents.state", state_stub)

inference_stub = types.ModuleType("backend.core.inference")
inference_stub.InferenceCoordinator = type(
    "_InferenceCoordinatorStub",
    (),
    {"execute": staticmethod(lambda *args, **kwargs: "{}")},
)
sys.modules.setdefault("backend.core.inference", inference_stub)

vector_db_stub = types.ModuleType("backend.core.vector_db")
vector_db_stub.vector_store = type("_VectorStoreStub", (), {"search_similar": lambda *args, **kwargs: []})()
sys.modules.setdefault("backend.core.vector_db", vector_db_stub)

crew_stub = types.ModuleType("backend.core.crew_nodes")
crew_stub.LLMConfig = object
crew_stub.run_planning_crew = lambda *args, **kwargs: None
crew_stub.run_security_crew = lambda *args, **kwargs: None
crew_stub.run_performance_crew = lambda *args, **kwargs: None
crew_stub.run_reliability_crew = lambda *args, **kwargs: None
crew_stub.run_ux_crew = lambda *args, **kwargs: None
crew_stub.run_synthesis_crew = lambda *args, **kwargs: None
sys.modules.setdefault("backend.core.crew_nodes", crew_stub)

from backend.agents.nodes import (
    _apply_clarifier_insights,
    _build_deterministic_plan,
    _derive_compliance_profile,
    _derive_lifecycle_audit,
    _derive_traceability_audit,
    _expand_test_cases_deterministically,
    _extract_strategy_capabilities,
    _extract_context_topics,
    _is_complete_gherkin_scenario,
    _normalize_test_case_record,
    _parse_requirement_signals,
    compliance_node,
    logic_flaw_detector_node,
    lifecycle_tracker_node,
    synthesis_optimizer_node,
    traceability_node,
    validate_agent_output,
    _sanitize_reasoning_leakage,
)


def test_expand_test_cases_uses_applicable_variants_only():
    requirement = """
    Order management workflow
    The platform lets users place orders, track shipments, and cancel orders.
    Integration with the payment gateway and inventory service is required.
    Invalid coupon codes must be rejected.
    """
    signals = _parse_requirement_signals(requirement)

    cases = _expand_test_cases_deterministically([], signals, requirement, 12)
    test_types = {case["test_type"] for case in cases}

    assert "Functional" in test_types
    assert test_types.issubset({"Functional", "Negative", "Integration", "Edge"})
    assert len(test_types) < 8


def test_expand_test_cases_does_not_force_negative_or_edge_without_evidence():
    requirement = """
    Travel booking search experience
    Travelers can search flights and hotel packages.
    """
    signals = _parse_requirement_signals(requirement)

    cases = _expand_test_cases_deterministically([], signals, requirement, 8)
    test_types = {case["test_type"] for case in cases}

    assert test_types == {"Functional"}


def test_normalize_test_case_record_rewrites_template_like_output():
    signals = _parse_requirement_signals("purchase, track, review, and return fashion products seamlessly")

    normalized = _normalize_test_case_record(
        {
            "title": "purchase, track, review, and return fashion products seamlessly",
            "steps": [
                "Execute happy-path validation path",
                "Validate observable outcome",
            ],
            "expected_result": "The workflow behaves as expected",
        },
        1,
        signals,
        "purchase, track, review, and return fashion products seamlessly",
        "Functional",
    )

    assert "seamlessly" not in normalized["title"].lower()
    assert len(normalized["title"]) < 90
    assert any(step.lower().startswith("as ") for step in normalized["steps"])
    assert all("happy-path validation path" not in step.lower() for step in normalized["steps"])
    assert "workflow behaves as expected" not in normalized["expected_result"].lower()
    assert normalized["workflow_stage"] in {"Workflow", "Discovery", "Reservation", "Checkout", "Payment Processing", "Reconciliation", "Post-Booking", "Fulfillment Tracking", "Access Control", "Inventory Management", "Observability"}
    assert normalized["test_data"]["persona"] in {"customer", "user"}
    assert normalized["assertions"]
    assert normalized["requirement_id"].startswith("REQ-")
    assert normalized["traceability"]["workflow"]


def test_expand_test_cases_normalizes_travel_prd_and_uses_domain_data():
    requirement = """
    TravelEase is a multi-platform travel booking application that allows users to search flights and hotel packages.
    Ensure high system reliability under peak load and provide personalized travel recommendations.
    Traveler: search and book trips.
    Guest User: browse itineraries.
    Admin: manage approvals.
    Support Agent: assist with cancellations.
    Payment gateway, notification service, booking API, and Redis cache are integrated.
    OTP validation must protect payment authorization and booking confirmation.
    """
    signals = _parse_requirement_signals(requirement)

    cases = _expand_test_cases_deterministically([], signals, requirement, 12)
    titles = [case["title"].lower() for case in cases]
    test_types = {case["test_type"] for case in cases}
    stages = {case["workflow_stage"] for case in cases}

    assert cases
    assert all("travel ease is" not in title for title in titles)
    assert all("workflows)" not in title for title in titles)
    assert all("running shoes" not in str(case["test_data"]).lower() for case in cases)
    assert all("sku-1001" not in str(case["test_data"]).lower() for case in cases)
    assert any("departure_city" in str(case["test_data"]).lower() for case in cases)
    assert any("booking_id" in str(case["test_data"]).lower() or "flight_id" in str(case["test_data"]).lower() for case in cases)
    assert any("booking" in assertion.lower() or "ticket" in assertion.lower() or "notification" in assertion.lower() for case in cases for assertion in case["assertions"])
    assert "Functional" in test_types
    assert len(test_types) < 8
    assert stages.issubset({"Discovery", "Reservation", "Checkout", "Payment Processing", "Reconciliation", "Post-Booking", "Seller Operations", "Access Control", "Inventory Management", "Fulfillment Tracking", "Observability", "Workflow"})
    assert any(case.get("traceability", {}).get("requirement_id") for case in cases)
    assert any(case.get("traceability", {}).get("dependencies") for case in cases)


def test_requirement_signals_separate_objectives_from_workflows():
    text = """
    Reduce checkout abandonment rates by improving the payment and delivery workflow.
    Product Discovery, Search, Cart, Checkout, Payments, Order Tracking, Returns, Notifications
    """
    signals = _parse_requirement_signals(text)

    assert any("abandonment" in item.lower() for item in signals["business_objectives"])
    assert all("reduce checkout abandonment rates" not in item.lower() for item in signals["workflows"])
    assert any("checkout" in item.lower() for item in signals["workflows"])
    assert any("returns" in item.lower() for item in signals["workflows"])


def test_planner_capability_model_filters_objectives_and_personas():
    text = """
    Reduce checkout abandonment rates by improving the cart, checkout, payments, order tracking, returns,
    and notifications workflow.
    Seller/Vendor: manage product listings and inventory.
    Admin User: oversee access and moderation.
    Authentication, search, recommendation engine, and inventory are core capabilities.
    """
    model = _extract_strategy_capabilities(text)

    assert any("abandonment" in item.lower() for item in model["objectives"])
    assert any("checkout" in item.lower() for item in model["modules"])
    assert any("payments" in item.lower() for item in model["modules"])
    assert any("seller" in item.lower() or "vendor" in item.lower() for item in model["personas"])
    assert all("abandonment" not in item.lower() for item in model["modules"])
    assert all("seller/vendor" not in item.lower() for item in model["modules"])


def test_deterministic_plan_uses_decomposed_capabilities():
    text = """
    Reduce checkout abandonment rates by improving the cart, checkout, payments, order tracking, returns,
    and notifications workflow.
    Authentication, search, recommendation engine, and inventory are core capabilities.
    """
    plan = _build_deterministic_plan(text, text, "standard")

    inclusions = plan["scope"]["inclusions"]
    gherkin = plan["scope"]["gherkin_scenarios"]

    assert inclusions
    assert any("checkout" in item.lower() for item in inclusions)
    assert any("payments" in item.lower() for item in inclusions)
    assert all("reduce checkout abandonment rates" not in item.lower() for item in inclusions)
    assert gherkin
    assert all("trace workflow" not in scenario.lower() for scenario in gherkin)
    assert all("preserves behavior" not in scenario.lower() for scenario in gherkin)


def test_planner_normalizes_raw_phrases_and_separates_kpis():
    text = """
    return fashion products across Android
    purchase based on latest fashion trends
    Expand seller onboarding ecosystem
    Users who frequently browse trending products
    Order success rate
    recommendation intelligence
    """

    model = _extract_strategy_capabilities(text)

    assert any("returns" in item.lower() or "refund" in item.lower() for item in model["modules"])
    assert any("seller management" in item.lower() for item in model["modules"])
    assert any("recommendation engine" in item.lower() or "personalization workflow" in item.lower() for item in model["modules"])
    assert any("order success rate" in item.lower() or "recommendation intelligence" in item.lower() for item in model["kpis"])
    assert all("order success rate" not in item.lower() for item in model["modules"])
    assert all("recommendation intelligence" not in item.lower() for item in model["modules"])
    assert all("expand seller onboarding ecosystem" not in item.lower() for item in model["modules"])


def test_deterministic_plan_uses_canonical_modules_and_dynamic_audit():
    text = """
    return fashion products across Android
    Expand seller onboarding ecosystem
    Users who frequently browse trending products should receive personalized suggestions.
    Order success rate and recommendation intelligence are tracked in the analytics dashboard.
    Payment gateway retries, async inventory synchronization, and webhook validation are part of the architecture.
    """
    plan = _build_deterministic_plan(text, text, "standard")

    inclusions = plan["scope"]["inclusions"]
    gherkin = plan["scope"]["gherkin_scenarios"]
    audit = plan["reasoning_audit"]
    recommendations = plan["test_strategy_recommendations"]

    assert any("returns" in item.lower() or "refund" in item.lower() for item in inclusions)
    assert any("seller management" in item.lower() for item in inclusions)
    assert any("personalization workflow" in item.lower() or "recommendation engine" in item.lower() for item in inclusions)
    assert all("order success rate" not in item.lower() for item in inclusions)
    assert all("recommendation intelligence" not in item.lower() for item in inclusions)
    assert gherkin
    assert any("seller" in scenario.lower() or "catalog" in scenario.lower() for scenario in gherkin)
    assert any("payment" in scenario.lower() or "inventory" in scenario.lower() for scenario in gherkin)
    assert audit["confidence_score"] != 0.5
    assert audit["confidence_score"] > 0.55
    assert "payment gateway retries" in recommendations["risk_based"].lower()
    assert "seller" in recommendations["unit"].lower() or "rbac" in recommendations["unit"].lower()
    assert "monitoring" in recommendations["api"].lower() or "reporting" in recommendations["api"].lower()


def test_planner_prioritizes_real_workflows_and_rebuilds_complete_gherkin():
    text = """
    The System When Given Expected Result.
    Fast seamless secure workflow overview.
    Checkout, payments, search, fulfillment, and refunds are the primary business flows.
    Redis cache, Kafka event bus, payment gateway, and logistics API are integrated.
    And th
    And the ord
    """

    topics = _extract_context_topics(text, limit=10)
    plan = _build_deterministic_plan(text, text, "standard")
    objectives = plan["testing_objectives"]
    gherkin = plan["scope"]["gherkin_scenarios"]

    assert all(token not in " ".join(topics).lower() for token in ["the", "system", "given", "when", "then", "fast", "seamless", "secure"])
    assert any(topic.lower() in {"checkout & payments", "search & discovery", "order tracking & fulfillment", "returns & refunds"} for topic in topics)
    assert topics == sorted(set(topics), key=topics.index)
    assert gherkin
    assert all(_is_complete_gherkin_scenario(scenario) for scenario in gherkin)
    assert all(
        not any(line.strip().lower() in {"and th", "and the ord"} for line in scenario.splitlines())
        for scenario in gherkin
    )
    assert any(
        isinstance(item, dict)
        and item.get("goal", "").lower().startswith("validate measurable outcomes for")
        and any(keyword in item.get("goal", "").lower() for keyword in ("checkout", "payment", "search", "fulfillment", "refund", "order"))
        for item in objectives
    )
    assert any(
        isinstance(item, dict)
        and "expected" in item.get("success_criteria", "").lower()
        for item in objectives
    )


def test_expand_test_cases_avoids_duplicate_discovery_labels_and_placeholder_data():
    requirement = """
    Commerce discovery and recommendations
    Users explore personalized product discovery and recommendation experiences.
    Hero banners, user personas, and workflow stages are listed in the PRD.
    Search, recommendation, and personalization should reflect ecommerce catalog behavior.
    Payment gateway and inventory service are integrated.
    """

    signals = _parse_requirement_signals(requirement)
    cases = _expand_test_cases_deterministically([], signals, requirement, 10)

    titles = [case["title"].lower() for case in cases]
    modules = [case["module"].lower() for case in cases]
    test_data_blob = " ".join(str(case["test_data"]).lower() for case in cases)

    assert all("recommendation recommendation engine" not in title for title in titles)
    assert all("frequently personalization workflow" not in title for title in titles)
    assert all("experiences personalization workflow" not in title for title in titles)
    assert all("hero banners" not in title for title in titles)
    assert any("search" in module or "recommendation" in module or "personalization" in module for module in modules)
    assert "realistic test data" not in test_data_blob
    assert "relevant input" not in test_data_blob
    assert "generic" not in test_data_blob
    assert "primary" not in test_data_blob
    assert "recommended" not in test_data_blob


def test_expand_test_cases_generates_distinct_performance_cases():
    requirement = """
    Commerce checkout and order management
    Search, cart, checkout, payment, and inventory workflows are in scope.
    The system must remain responsive under peak load and support concurrent checkout traffic.
    Payment gateway, inventory service, and notification provider are integrated.
    """

    signals = _parse_requirement_signals(requirement)
    cases = _expand_test_cases_deterministically([], signals, requirement, 12)

    performance_cases = [case for case in cases if case["test_type"] == "Performance"]
    functional_cases = [case for case in cases if case["test_type"] == "Functional"]

    assert performance_cases
    assert functional_cases
    assert any(
        "concurrent users" in " ".join(case["steps"]).lower() or "throughput" in " ".join(case["steps"]).lower()
        for case in performance_cases
    )
    assert all(
        "concurrent users" not in " ".join(case["steps"]).lower() and "throughput" not in " ".join(case["steps"]).lower()
        for case in functional_cases[:3]
    )
    assert any("load" in str(case["assertions"]).lower() for case in performance_cases)


def test_expand_test_cases_uses_domain_and_dependency_signals():
    requirement = """
    Commerce checkout and fulfillment workflow
    Search, cart, checkout, payment, inventory, and delivery are in scope.
    Kafka event publishing, Redis cache invalidation, external payment API retries, and rollback handling are required.
    The system must survive concurrency spikes, stale cache, and race conditions during order confirmation.
    """

    signals = _parse_requirement_signals(requirement)
    cases = _expand_test_cases_deterministically([], signals, requirement, 14)

    titles = [case["title"].lower() for case in cases]
    steps_blob = " ".join(" ".join(case["steps"]).lower() for case in cases)
    assertions_blob = " ".join(" ".join(case["assertions"]).lower() for case in cases)
    modules = [case["module"].lower() for case in cases]

    assert any("payment authorization" in title or "order confirmation" in title or "inventory" in title for title in titles)
    assert any(word in " ".join(titles + modules) or word in steps_blob or word in assertions_blob for word in ["redis", "kafka", "retry", "cache"])
    assert "stale cache" in steps_blob or "event ordering" in steps_blob or "retry policy" in steps_blob
    assert "concurrent" in steps_blob or "race" in steps_blob or "rollback" in steps_blob
    assert "inventory" in assertions_blob or "payment" in assertions_blob or "fulfillment" in assertions_blob
    assert all("generic" not in module for module in modules)
    assert all("authentication" not in title or "checkout" in title or "payment" in title or "inventory" in title for title in titles)


def test_expand_test_cases_filters_wrapper_labels_and_requirement_ids():
    requirement = """
    User Login with Valid Credentials
    The user can log in with valid credentials and see the authenticated landing state.
    🟢 PRIMARY PRD SOURCE OF TRUTH (Original Description & Workflows)
    [Requirement ID: MANUAL-001] myntra
    """

    signals = _parse_requirement_signals(requirement)
    topics = _extract_context_topics(requirement, limit=12)
    cases = _expand_test_cases_deterministically([], signals, requirement, 8)

    assert topics
    assert all("primary prd source of truth" not in topic.lower() for topic in topics)
    assert all("[requirement id:" not in topic.lower() for topic in topics)
    assert cases
    assert all("primary prd source of truth" not in case["title"].lower() for case in cases)
    assert all("[requirement id:" not in case["title"].lower() for case in cases)
    assert all("primary prd source of truth" not in case["ac_reference"].lower() for case in cases)
    assert all("[requirement id:" not in case["ac_reference"].lower() for case in cases)
    assert all("primary prd source of truth" not in case["module"].lower() for case in cases)
    assert all("[requirement id:" not in case["module"].lower() for case in cases)
    assert any("login" in case["title"].lower() or "authentication" in case["title"].lower() for case in cases)


def test_reasoning_leakage_is_removed_from_payloads():
    payload = {
        "summary": "<think>internal reasoning</think>Release approved after review",
        "notes": ["keep", "<think>discard</think>"],
        "reasoning": {"chain_of_thought": "secret", "decision": "go"},
    }

    cleaned = _sanitize_reasoning_leakage(payload)

    assert "<think>" not in cleaned["summary"].lower()
    assert cleaned["notes"] == ["keep", ""]
    assert "reasoning" not in cleaned


def test_compliance_profile_is_dynamic_and_requirement_aware():
    requirement = """
    Checkout and payment workflow for EU and California customers.
    The platform uses microservices, Kafka, Redis, API gateway enforcement, audit logs, and SIEM alerts.
    Payment gateway processes cardholder data, user email, phone, password reset tokens, and coupon redemptions.
    Incident response and disaster recovery procedures must exist for the production release.
    """

    profile = _derive_compliance_profile(requirement)

    standards = profile["applicable_standards"]
    workflow_controls = profile["workflow_controls"]
    data_classification = profile["data_classification"]
    architecture_controls = profile["architecture_controls"]
    operational_controls = profile["operational_controls"]
    threats = profile["threat_model"]
    risk = profile["reasoning_audit"]["risk_rating"]

    assert "PCI-DSS" in standards
    assert "GDPR" in standards
    assert "CCPA" in standards
    assert any(entry["workflow"].lower().startswith("checkout") for entry in workflow_controls)
    assert any("PCI-DSS" in ctrl_id for entry in workflow_controls for ctrl_id in entry["applicable_controls"])
    assert any(item["data_type"] == "Cardholder Data" for item in data_classification)
    assert any(item["data_type"] == "PII" for item in data_classification)
    assert any("Kafka" in entry["component"] or "Redis" in entry["component"] or "API Gateway" in entry["component"] for entry in architecture_controls)
    assert any(
        "siem" in ctrl["description"].lower() or "incident response" in ctrl["description"].lower()
        for ctrl in profile["compliance_controls"]
    )
    assert any("coupon" in item["abuse_vector"].lower() for item in threats)
    assert risk["payment_security"] == "Critical"
    assert risk["data_privacy"] in {"High", "Critical"}
    assert profile["reasoning_audit"]["confidence_score"] >= 0.7


def test_compliance_node_emits_dynamic_controls_instead_of_static_templates():
    requirement = """
    Checkout and payment workflow for EU and California customers.
    The platform uses microservices, Kafka, Redis, API gateway enforcement, audit logs, and SIEM alerts.
    Payment gateway processes cardholder data, user email, phone, password reset tokens, and coupon redemptions.
    Incident response and disaster recovery procedures must exist for the production release.
    """

    result = compliance_node({
        "task_id": "T-001",
        "combined_data": {"description": requirement},
    })
    report = result["compliance_report"]

    assert report["applicable_standards"]
    assert report["workflow_controls"]
    assert report["data_classification"]
    assert report["architecture_controls"]
    assert report["operational_controls"]
    assert report["threat_model"]
    assert isinstance(report["reasoning_audit"]["risk_rating"], dict)
    assert any(entry["workflow"].lower().startswith("checkout") for entry in report["workflow_controls"])
    assert any("Cardholder Data" == entry["data_type"] for entry in report["data_classification"])
    assert any("Kafka" in entry["component"] or "Redis" in entry["component"] for entry in report["architecture_controls"])
    assert any(
        "siem" in ctrl["description"].lower() or "incident response" in ctrl["description"].lower()
        for ctrl in report["compliance_controls"]
    )
    assert all("mfa" not in ctrl["description"].lower() for ctrl in report["compliance_controls"])
    assert all("aes-256" not in ctrl["description"].lower() for ctrl in report["compliance_controls"])


def test_clarifier_insights_separate_goals_workflows_and_dependencies():
    req = {
        "summary": "Improve checkout experience",
        "description": """
        Reduce checkout abandonment rates by improving the cart, checkout, payments, order tracking,
        returns, and notifications workflow. Increase GMV and customer satisfaction.
        Seller/Vendor: manage catalog and inventory approvals.
        Admin User: oversee access and moderation.
        Payment gateway, inventory service, logistics provider, and notification provider are integrated.
        """,
        "acceptance_criteria": [
            "Coupon validation within 2 seconds",
            "Given inventory becomes unavailable during checkout when payment is completed then order placement fails gracefully and payment is refunded",
        ],
    }

    clarified = _apply_clarifier_insights(
        {
            "clarified_description": "Original mixed narrative",
            "refined_acceptance_criteria": req["acceptance_criteria"],
        },
        req,
    )

    assert any("gmv" in item.lower() or "satisfaction" in item.lower() for item in clarified["business_goals"])
    assert any("checkout" in item.lower() for item in clarified["workflow_modules"])
    assert any("payment" in item.lower() for item in clarified["dependency_touchpoints"])
    assert any("seller" in item.lower() or "vendor" in item.lower() for item in clarified["personas"])
    assert any("inventory becomes unavailable" in ac.lower() or "order placement fails gracefully" in ac.lower() for ac in clarified["refined_acceptance_criteria"])
    assert clarified["traceability_map"]
    assert "Business Goals:" in clarified["clarified_description"]
    assert "Executable Workflows:" in clarified["clarified_description"]
    assert "Architecture / Integrations:" in clarified["clarified_description"]
    assert "Non Functional Requirements:" in clarified["clarified_description"]


def test_clarifier_normalizes_narrative_modules_personas_and_nfrs():
    req = {
        "summary": "Improve travel booking experience",
        "description": """
        TravelEase is a multi-platform travel booking application that allows users to search flights and hotel packages.
        Ensure high system reliability under peak load and provide personalized travel recommendations.
        Traveler: search and book trips.
        Guest User: browse itineraries.
        Admin: manage approvals.
        Support Agent: assist with cancellations.
        Screen reader support and enter guest details should be available.
        o Search API
        o Booking API
        Payment gateway, notification service, and Redis cache are integrated.
        """,
        "acceptance_criteria": [
            "Search results return within 2 seconds under normal load",
            "Payment authorization completes before booking confirmation",
        ],
    }

    clarified = _apply_clarifier_insights(
        {
            "clarified_description": "Original mixed narrative",
            "refined_acceptance_criteria": req["acceptance_criteria"],
        },
        req,
    )

    workflow_modules = [item.lower() for item in clarified["workflow_modules"]]
    business_goals = [item.lower() for item in clarified["business_goals"]]
    personas = [item.lower() for item in clarified["personas"]]
    nfrs = [item.lower() for item in clarified["nfrs"]]
    architecture = [item.lower() for item in clarified["architecture_signals"]]
    chains = [item.lower() for item in clarified["workflow_chains"]]
    traceability = clarified["traceability_map"]

    assert any("search" in item or "discovery" in item for item in workflow_modules)
    assert any("recommendation" in item or "personalization" in item for item in workflow_modules)
    assert any("performance" in item or "reliability" in item for item in nfrs)
    assert any("search service api" in item for item in architecture)
    assert any("booking service api" in item for item in architecture)
    assert any("payment gateway api" in item for item in architecture)
    assert any("notification service" in item for item in architecture)
    assert all("screen reader support" not in item for item in personas)
    assert all("enter guest details" not in item for item in personas)
    assert any("traveler" in item or "guest user" in item or "admin" in item or "support agent" in item for item in personas)
    assert not any(goal in workflow_modules for goal in business_goals)
    assert any("payment authorization" in item or "booking confirmation" in item for item in chains)
    assert any(
        any("search" in ac.lower() for ac in entry["acceptance_criteria"])
        for entry in traceability
        if "search" in entry["workflow"].lower()
    )
    assert any(
        any("payment" in ac.lower() or "booking" in ac.lower() for ac in entry["acceptance_criteria"])
        for entry in traceability
        if "payment" in entry["workflow"].lower() or "booking" in entry["workflow"].lower()
    )


def test_clarifier_filters_template_contamination_and_synthetic_modules():
    req = {
        "summary": "Travel booking requirements",
        "description": """
        Module Description
        Core Modules
        Executable Workflows
        Product Overview
        To provide a fast, reliable, and user-friendly platform for planning and booking.
        Traveler: search flights and hotel packages.
        Admin: manage approvals.
        """,
        "acceptance_criteria": [
            "Search results return within 2 seconds under normal load",
            "Booking confirmation is recorded after payment authorization",
        ],
    }

    clarified = _apply_clarifier_insights(
        {
            "clarified_description": "Original mixed narrative",
            "refined_acceptance_criteria": req["acceptance_criteria"],
        },
        req,
    )

    workflow_modules = [item.lower() for item in clarified["workflow_modules"]]
    personas = [item.lower() for item in clarified["personas"]]

    assert all("module description" not in item for item in workflow_modules)
    assert all("core modules" not in item for item in workflow_modules)
    assert all("executable workflows" not in item for item in workflow_modules)
    assert all("product overview" not in item for item in workflow_modules)
    assert workflow_modules
    assert any("traveler" in item for item in personas)
    assert all("provide a fast" not in item for item in personas)


def test_clarifier_rejects_action_personas_and_synthetic_chains():
    req = {
        "summary": "Mobile commerce requirement",
        "description": """
        User opens application.
        User enters mobile number/email.
        User creates password/profile.
        purchase based on latest fashion trends.
        The authentication module provides secure account management.
        detailed Product Requirements Document for mobile applications. The PRD includes business objectives.
        Payment success -> Booking confirmed
        Logout -> Session cleared
        """,
        "acceptance_criteria": [
            "capability behaves exactly as the clarified requirement states",
            "Login completes with valid credentials",
        ],
    }

    clarified = _apply_clarifier_insights(
        {
            "clarified_description": "Original mixed narrative",
            "refined_acceptance_criteria": req["acceptance_criteria"],
        },
        req,
    )

    personas = [item.lower() for item in clarified["personas"]]
    modules = [item.lower() for item in clarified["workflow_modules"]]
    architecture = [item.lower() for item in clarified["architecture_signals"]]
    chains = [item.lower() for item in clarified["workflow_chains"]]
    acs = [item.lower() for item in clarified["refined_acceptance_criteria"]]

    assert all("user opens application" not in item for item in personas)
    assert all("user enters mobile number" not in item for item in personas)
    assert all("user creates password" not in item for item in personas)
    assert all("purchase based on latest fashion trends" not in item for item in modules)
    assert any("authentication" in item or "account" in item for item in modules)
    assert all("detailed product requirements document" not in item for item in architecture)
    assert all("mobile applications" not in item for item in architecture)
    assert all("capability behaves exactly as the clarified requirement states" not in item for item in acs)
    assert all("nfr gating" not in item for item in chains)
    assert all("non-functional requirement" not in item for item in chains)
    assert any("payment success" in item or "booking confirmed" in item or "session cleared" in item for item in chains)


def test_clarifier_uses_dependency_graphs_and_state_transitions():
    req = {
        "summary": "Travel booking requirements",
        "description": """
        Select flight
        Enter passenger details
        Seat selection
        Review booking
        Proceed to payment
        Payment success -> Booking confirmed
        Logout -> Session cleared
        Payment gateway, airline API, notification provider, and Redis cache are integrated.
        """,
        "acceptance_criteria": [
            "Search results return within 2 seconds under normal load",
            "Payment authorization completes before booking confirmation",
        ],
    }

    clarified = _apply_clarifier_insights(
        {
            "clarified_description": "Original mixed narrative",
            "refined_acceptance_criteria": req["acceptance_criteria"],
        },
        req,
    )

    traceability = clarified["traceability_map"]
    dependency_graph = clarified["dependency_graph"]
    state_transitions = clarified["state_transitions"]

    assert dependency_graph
    assert any("payment gateway" in str(item).lower() for item in dependency_graph)
    assert any("airline api" in str(item).lower() for item in dependency_graph)
    assert any("booking confirmed" in str(item).lower() for item in state_transitions)
    assert any(entry.get("dependencies") for entry in traceability)
    assert all("architecture touchpoints -> detailed product requirements document" not in chain.lower() for chain in clarified["workflow_chains"])


def test_deterministic_plan_avoids_template_language_and_generic_headings():
    text = """
    Module Description
    Core Modules
    Executable Workflows
    Travel booking search experience
    Travelers can search flights and hotel packages.
    """
    plan = _build_deterministic_plan(text, text, "standard")

    inclusions = plan["scope"]["inclusions"]
    gherkin = plan["scope"]["gherkin_scenarios"]
    testing_points = plan["testing_points"]

    assert all("module description" not in item.lower() for item in inclusions)
    assert all("core modules" not in item.lower() for item in inclusions)
    assert all("executable workflows" not in item.lower() for item in inclusions)
    assert all("validate capability through interactions and state changes" not in point["verification_point"].lower() for point in testing_points)
    assert all("trace workflow" not in scenario.lower() for scenario in gherkin)
    assert all("preserves behavior" not in scenario.lower() for scenario in gherkin)


def test_planner_rejects_narrative_fragments_as_personas_modules_and_architecture():
    text = """
    purchase based on latest fashion trends.
    User opens application.
    User enters mobile number/email.
    User creates password/profile.
    Architecture touchpoints -> detailed Product Requirements Document...
    Payment success -> Booking confirmed
    Logout -> Session cleared
    """

    model = _extract_strategy_capabilities(text)

    assert all("purchase based on latest fashion trends" not in item.lower() for item in model["modules"])
    assert all("user opens application" not in item.lower() for item in model["personas"])
    assert all("user enters mobile number" not in item.lower() for item in model["personas"])
    assert all("user creates password" not in item.lower() for item in model["personas"])
    assert all("product requirements document" not in item.lower() for item in model["architecture"])
    assert all("architecture touchpoints" not in item.lower() for item in model["architecture"])


def test_deterministic_plan_uses_state_and_dependency_intelligence():
    text = """
    Travel booking requirements
    Select flight
    Enter passenger details
    Seat selection
    Review booking
    Proceed to payment
    Payment success -> Booking confirmed
    Logout -> Session cleared
    Payment gateway and Redis cache are integrated.
    """

    plan = _build_deterministic_plan(text, text, "standard")

    inclusions = plan["scope"]["inclusions"]
    objectives = plan["testing_objectives"]
    testing_points = plan["testing_points"]
    risk_matrix = plan["risk_matrix"]
    scenarios = plan["scope"]["gherkin_scenarios"]

    assert any("flight booking" in item.lower() or "product search" in item.lower() for item in inclusions)
    assert any("booking confirmed" in str(point).lower() or "session cleared" in str(point).lower() for point in testing_points)
    assert any("state transition" in obj["goal"].lower() or "workflow chain" in obj["goal"].lower() for obj in objectives)
    assert any("payment gateway" in str(item).lower() for item in risk_matrix)
    assert all("validate dependency handoffs, failure recovery, and data consistency" not in str(item).lower() for item in risk_matrix)
    assert any("payment gateway" in scenario.lower() or "booking" in scenario.lower() for scenario in scenarios)
    assert all("trace workflow" not in scenario.lower() for scenario in scenarios)


def test_planner_filters_meta_personas_workflows_and_fake_states():
    text = """
    Myntra
    MFA support
    User demographics
    User interactions
    Customer: browse products
    Seller/Vendor: manage catalog
    Admin User: oversee access
    Guest User: browse anonymously
    Loyalty Member: redeem rewards
    The search module enables fast and intelligent product discovery.
    Pending -> Search preferences -> Search Module
    """

    signals = _parse_requirement_signals(text)
    model = _extract_strategy_capabilities(text)

    assert "Myntra" not in signals["workflows"]
    assert all("mfa support" not in item.lower() for item in model["personas"])
    assert all("user demographics" not in item.lower() for item in model["personas"])
    assert all("user interactions" not in item.lower() for item in model["personas"])
    assert any(item == "Customer" for item in model["personas"])
    assert any(item == "Seller/Vendor" for item in model["personas"])
    assert any(item == "Admin User" for item in model["personas"])
    assert any(item == "Guest User" for item in model["personas"])
    assert any(item == "Loyalty Member" for item in model["personas"])
    assert all("the search module enables fast and intelligent product discovery" not in item.lower() for item in model["modules"])
    assert all("myntra" not in item.lower() for item in model["modules"])
    assert all("admin user" not in item.lower() for item in model["modules"])


def test_planner_validation_rejects_narrative_leakage_and_fake_state_transitions():
    payload = {
        "scope": {
            "inclusions": ["Recommendation Engine", "Myntra", "Admin User"],
            "gherkin_scenarios": ["Scenario: happy path"],
        },
        "testing_points": [
            {
                "feature": "The search module enables fast and intelligent product discovery",
                "verification_point": "Validate the search module enables fast and intelligent product discovery",
                "expected_behavior": "The workflow completes",
                "persona_link": "User demographics",
            }
        ],
        "testing_objectives": [
            {"goal": "The search module enables fast and intelligent product discovery"},
        ],
        "state_transitions": [
            {"event": "Pending -> Search preferences -> Search Module", "from": "Pending", "to": "Search Module"},
        ],
    }

    result = validate_agent_output("Planner", payload, "Myntra search discovery requirement")

    assert not result["is_valid"]
    assert any("invalid workflow inclusions" in error.lower() for error in result["errors"])
    assert any("narrative leakage" in error.lower() for error in result["errors"])
    assert any("invalid state transition" in error.lower() for error in result["errors"])


def test_lifecycle_tracker_emits_dependency_aware_audit():
    state = {
        "task_id": "TASK-100",
        "combined_data": {
            "description": "Checkout workflow with payment authorization, retry handling, and order state transitions."
        },
        "analysis_payload": {
            "state_transitions": [
                {"workflow": "Checkout", "from_state": "Cart", "to_state": "Payment Authorized", "trigger": "submit_payment"},
                {"workflow": "Checkout", "from_state": "Payment Authorized", "to_state": "Order Confirmed", "trigger": "capture_success"},
            ]
        },
        "clarified_requirements": [
            {"id": "REQ-1", "clarified_description": "Checkout flow with retry and rollback handling."}
        ],
        "test_cases": [
            {"requirement_id": "REQ-1", "title": "Checkout completes successfully"},
        ],
        "traceability_matrix": [
            {"requirement_id": "REQ-1", "test_case_references": ["TC-001"], "coverage_status": "Full"}
        ],
        "mesh_topology": {
            "nodes": [{"id": "Creator", "status": "Completed"}],
            "active_cycle": 1,
        },
    }

    result = lifecycle_tracker_node(state)
    audit = result["lifecycle_audit"]

    assert result["mesh_topology"]["nodes"]
    assert audit["workflow_lifecycle_states"]
    assert audit["state_transitions"]
    assert audit["lifecycle_coverage"]
    assert audit["rollback_retry_states"]
    assert audit["entity_progression_flows"]
    assert audit["dependency_aware_lifecycle_chains"]


def test_lifecycle_audit_uses_execution_state_and_dependency_signals():
    state = {
        "mesh_topology": {"nodes": [{"id": "Creator", "status": "Completed"}, {"id": "Auditor", "status": "Pending"}]},
        "combined_data": {"description": "Checkout workflow with payment authorization, retry handling, and order confirmation."},
        "analysis_payload": {
            "state_transitions": []
        },
        "clarified_requirements": [
            {"id": "REQ-1", "clarified_description": "Checkout flow with retry and rollback handling."}
        ],
        "traceability_matrix": [{"requirement_id": "REQ-1", "test_case_references": ["TC-001"], "coverage_status": "Full"}],
        "test_cases": [{"requirement_id": "REQ-1", "title": "Checkout completes successfully"}],
        "execution_plan": {
            "critical_paths": ["checkout.confirm"],
            "retry_policy": {"max_retries": 3, "retry_on": ["gateway timeout"], "backpressure_cooldown_seconds": 10},
        },
    }

    audit = _derive_lifecycle_audit(state)

    assert audit["lifecycle_coverage"]["coverage_ratio"] > 0
    assert audit["state_transitions"]
    assert any("cart" in item["event"].lower() or "checkout" in item["event"].lower() for item in audit["state_transitions"])
    assert audit["rollback_retry_states"]
    assert any("retry" in item.get("state", "").lower() or "compensation" in item.get("state", "").lower() for item in audit["rollback_retry_states"])
    assert audit["entity_progression_flows"]
    assert all("generic" not in str(item).lower() for item in audit["entity_progression_flows"])
    assert audit["dependency_aware_lifecycle_chains"]
    assert any("payment" in str(item).lower() or "checkout" in str(item).lower() for item in audit["dependency_aware_lifecycle_chains"])


def test_logician_emits_state_machine_and_dependency_specific_mitigations(monkeypatch):
    monkeypatch.setattr(
        "backend.agents.nodes.InferenceCoordinator.execute",
        lambda *args, **kwargs: '{"logic_score": "95/100", "identified_flaws": [{"flaw": "Generic race condition", "severity": "Major", "mitigation": "Implement validation and enhance logging"}], "formal_recommendations": ["Implement validation", "Enhance logging"]}',
    )

    state = {
        "task_id": "TASK-400",
        "combined_data": {
            "description": "Checkout flow with payment gateway, Redis cache, Kafka events, and inventory service synchronization.",
        },
        "analysis_payload": {
            "executive_summary": "Checkout strategy with payment authorization, inventory locking, retry handling, and rollback recovery.",
            "scope": {
                "gherkin_scenarios": [
                    "Scenario: checkout and payment settle before order confirmation"
                ]
            },
        },
    }

    result = logic_flaw_detector_node(state)
    audit = result["logic_audit_report"]

    assert audit["state_machine_model"]
    assert audit["invalid_state_transitions"]
    assert audit["rollback_paths"]
    assert any("payment gateway" in str(item).lower() or "inventory service" in str(item).lower() for item in audit["dependency_map"])
    assert any("rollback" in str(item).lower() for item in audit["formal_recommendations"])
    assert all("implement validation" not in item.get("mitigation", "").lower() for item in audit["identified_flaws"])
    assert all("enhance logging" not in item.lower() for item in audit["formal_recommendations"])
    assert any("checkout" in item.get("workflow", "").lower() for item in audit["state_machine_model"])


def test_logician_sanitizes_placeholder_state_machine_output(monkeypatch):
    monkeypatch.setattr(
        "backend.agents.nodes.InferenceCoordinator.execute",
        lambda *args, **kwargs: '{"logic_score": "95/100", "identified_flaws": [{"flaw": "Generic collision", "severity": "Major", "mitigation": "Implement validation"}], "formal_recommendations": ["Implement validation"], "state_machine_model": [{"workflow": "Checkout", "states": ["Pending", "Completed"], "valid_transitions": [{"from": "Pending", "to": "Completed"}], "invalid_transitions": [{"from": "Pending", "to": "Completed"}], "rollback_paths": [{"from": "Approved", "to": "Pending"}]}], "invalid_state_transitions": [{"workflow": "Checkout", "transition": "Pending -> Completed", "reason": "placeholder"}], "rollback_paths": [{"workflow": "Checkout", "path": "Approved -> Pending"}]}',
    )

    state = {
        "task_id": "TASK-401",
        "combined_data": {
            "description": "Checkout flow with payment gateway, Redis cache, Kafka events, and inventory service synchronization.",
        },
        "analysis_payload": {
            "executive_summary": "Checkout strategy with payment authorization, inventory locking, retry handling, and rollback recovery.",
            "scope": {"gherkin_scenarios": ["Scenario: checkout and payment settle before order confirmation"]},
        },
    }

    result = logic_flaw_detector_node(state)
    audit = result["logic_audit_report"]

    assert audit["state_machine_model"]
    assert all(
        state.strip().lower() not in {"pending", "completed", "approved"}
        for model in audit["state_machine_model"]
        for state in model.get("states", [])
    )
    assert all("pending -> completed" not in str(item).lower() for item in audit["state_machine_model"])
    assert all("approved -> pending" not in str(item).lower() for item in audit["state_machine_model"])
    assert all("implement validation" not in str(item).lower() for item in audit["formal_recommendations"])
    assert any("cart" in str(item).lower() or "payment" in str(item).lower() for item in audit["state_machine_model"])


def test_logician_rejects_generic_catch_all_workflow_labels(monkeypatch):
    monkeypatch.setattr(
        "backend.agents.nodes.InferenceCoordinator.execute",
        lambda *args, **kwargs: '{"logic_score": "95/100", "identified_flaws": [{"flaw": "Generic workflow issue", "severity": "Major", "mitigation": "Implement validation and enhance logging"}], "formal_recommendations": ["Implement validation", "Enhance logging"], "state_machine_model": [{"workflow": "Intelligence Recommendation Engine", "states": ["Query Drafted", "Results Returned"], "valid_transitions": [{"from": "Query Drafted", "to": "Results Returned"}], "invalid_transitions": [{"from": "Query Drafted", "to": "Results Returned"}], "rollback_paths": [{"from": "Results Returned", "to": "Query Drafted"}], "dependencies": ["Payment Gateway"]}]}',
    )

    state = {
        "task_id": "TASK-402",
        "combined_data": {
            "description": "Browse personalization workflow with payment gateway, inventory service, Kafka, and Redis integration.",
        },
        "analysis_payload": {
            "executive_summary": "Browse personalization must block stale result publication and enforce dependency acknowledgements.",
            "scope": {"gherkin_scenarios": ["Scenario: search results must not publish stale recommendations"]},
        },
    }

    result = logic_flaw_detector_node(state)
    audit = result["logic_audit_report"]

    assert audit["state_machine_model"]
    assert all("intelligence recommendation engine" not in str(model).lower() for model in audit["state_machine_model"])
    assert any("browse personalization" in str(model).lower() or "search" in str(model).lower() for model in audit["state_machine_model"])
    assert all("implement validation" not in item.get("mitigation", "").lower() for item in audit["identified_flaws"])


def test_traceability_auditor_emits_full_audit_lineage():
    state = {
        "task_id": "TASK-200",
        "combined_data": {
            "description": "Checkout and returns workflow with payment gateway and refund validation."
        },
        "clarified_requirements": [
            {
                "id": "REQ-2",
                "clarified_description": "Checkout must map to test coverage and validation checks.",
                "refined_acceptance_criteria": ["Order confirmation is produced", "Refund rollback is handled"],
            }
        ],
        "analysis_payload": {
            "scope": {
                "gherkin_scenarios": [
                    "Given checkout is valid, when payment succeeds, then the order is confirmed."
                ]
            },
            "api_contracts": [
                {"endpoint": "/checkout/confirm", "method": "POST"}
            ],
        },
        "test_cases": [
            {
                "requirement_id": "REQ-2",
                "title": "Checkout confirmation",
                "assertions": ["Order confirmation is produced"],
            }
        ],
        "traceability_matrix": [
            {
                "requirement_id": "REQ-2",
                "test_case_references": ["TC-010"],
                "coverage_status": "Full",
            }
        ],
        "mesh_topology": {
            "nodes": [{"id": "Auditor", "status": "Completed"}],
        },
        "execution_plan": {"critical_paths": ["checkout.confirm"]},
        "api_validation_config": {"api_contracts": [{"endpoint": "/checkout/confirm", "method": "POST"}]},
        "security_signals": [{"risk": "payment replay", "severity": "High"}],
        "compliance_report": {"compliance_controls": [{"control_id": "PCI-DSS-PAY-01"}]},
    }

    result = traceability_node(state)
    audit = result["traceability_audit"]

    assert result["traceability_matrix"]
    assert audit["requirement_to_test_mappings"]
    assert audit["ac_to_scenario_traceability"]
    assert audit["workflow_to_risk_coverage"]
    assert audit["api_to_validation_coverage"]
    assert audit["dependency_to_test_relationships"]
    assert audit["full_audit_lineage"]


def test_traceability_audit_populates_references_from_assets_and_dependencies():
    state = {
        "combined_data": {
            "description": "Checkout and returns workflow with payment gateway, Redis cache, Kafka events, and inventory service sync."
        },
        "clarified_requirements": [
            {
                "id": "REQ-3",
                "clarified_description": "Checkout must map to test coverage, validation checks, and scenario coverage.",
                "refined_acceptance_criteria": [
                    "Cache invalidation occurs when payment state changes",
                    "Event ordering remains consistent after checkout confirmation",
                ],
            }
        ],
        "analysis_payload": {
            "scope": {
                "gherkin_scenarios": [
                    "Given checkout is valid, when payment succeeds, then the order is confirmed.",
                    "Given the cache is refreshed, when the user repeats checkout, then stale data is not used.",
                ]
            },
            "api_contracts": [{"endpoint": "/checkout/confirm", "method": "POST"}],
        },
        "test_cases": [
            {"requirement_id": "REQ-3", "case_id": "TC-011", "title": "Checkout confirmation"},
            {"requirement_id": "REQ-3", "case_id": "TC-012", "title": "Cache validation after payment"},
        ],
        "traceability_matrix": [],
        "execution_plan": {"critical_paths": ["checkout.confirm"]},
        "api_validation_config": {"api_contracts": [{"endpoint": "/checkout/confirm", "method": "POST"}]},
    }

    audit = _derive_traceability_audit(state)

    assert audit["requirement_to_test_mappings"]
    assert all(row["test_case_references"] for row in audit["requirement_to_test_mappings"])
    assert any(row["coverage_status"] == "Full" for row in audit["requirement_to_test_mappings"])
    assert audit["ac_to_scenario_traceability"]
    assert all(row["scenario_references"] for row in audit["ac_to_scenario_traceability"])
    assert audit["dependency_to_test_relationships"]
    assert any("cache" in str(row).lower() or "event" in str(row).lower() for row in audit["dependency_to_test_relationships"])
    assert any("scenario" in str(row).lower() or "workflow" in str(row).lower() for row in audit["ac_to_scenario_traceability"])


def test_synthesis_optimizer_preserves_lifecycle_and_traceability_audits(monkeypatch):
    monkeypatch.setattr(
        "backend.agents.nodes.run_synthesis_crew",
        lambda *args, **kwargs: '{"summary": {"objective": "Test", "description": "Synthesis"}, "mesh_analytics": {}}',
    )

    state = {
        "task_id": "TASK-300",
        "analysis_payload": {"scope": {"gherkin_scenarios": ["Scenario: checkout"]}},
        "logic_audit_report": {},
        "test_cases": [{"title": "Checkout confirmation"}],
        "test_data_samples": [],
        "mock_specs": [],
        "api_test_code": [],
        "visual_checkpoints": [],
        "self_healing_config": {},
        "performance_config": {},
        "security_signals": [],
        "microservices_config": {},
        "traceability_matrix": [{"requirement_id": "REQ-1", "test_case_references": ["TC-001"]}],
        "traceability_audit": {"full_audit_lineage": [{"requirement_id": "REQ-1", "test_case": "TC-001"}]},
        "compliance_report": {},
        "strategy_blueprint": {},
        "regression_priority": {},
        "execution_plan": {},
        "environment_config": {},
        "progressive_delivery": {},
        "chaos_scenarios": [],
        "mobile_test_config": {},
        "graphql_validation": {},
        "feature_flag_tests": [],
        "production_monitors": {},
        "sla_slo_audit": {},
        "distributed_traces": {},
        "lifecycle_audit": {
            "workflow_lifecycle_states": [{"workflow": "Checkout", "states": ["Cart", "Payment Authorized", "Order Confirmed"]}],
            "state_transitions": [{"workflow": "Checkout", "from_state": "Cart", "to_state": "Order Confirmed"}],
            "lifecycle_coverage": [{"workflow": "Checkout", "coverage": "Full"}],
            "rollback_retry_states": [{"workflow": "Checkout", "state": "Payment Authorized"}],
            "entity_progression_flows": [{"entity": "Order", "flow": ["Cart", "Payment Authorized", "Order Confirmed"]}],
            "dependency_aware_lifecycle_chains": [{"workflow": "Checkout", "dependencies": ["payment gateway"]}],
        },
        "mesh_topology": {"nodes": [{"id": "Monitor", "status": "Completed"}]},
        "reliability_eng": {},
        "perf_intelligence_config": {},
        "observability_intelligence": {},
        "rca_intelligence": {},
        "incident_remediation": {},
        "system_resilience": {},
        "release_risk_decision": {},
        "business_impact_intelligence": {},
        "eng_economics_roi": {},
        "eng_knowledge_graph": {},
        "platform_meta_intelligence": {},
        "exploratory_test_assistant": {},
        "locator_intelligence": {},
        "auto_migration_assistant": {},
        "mutation_test_assistant": {},
        "i18n_test_assistant": {},
        "release_commander": {},
        "trend_analyst": {},
        "mesh_confidence": 0.9,
        "logic_audit_feedback": "No overrides.",
    }

    result = synthesis_optimizer_node(state)
    final = result["final_synthesis"]

    assert final["mesh_topology"]
    assert final["lifecycle_audit"]["workflow_lifecycle_states"]
    assert final["traceability_audit"]["full_audit_lineage"]
    assert final["raw_mesh_data"]["lifecycle_audit"]["workflow_lifecycle_states"]
    assert final["raw_mesh_data"]["traceability_audit"]["full_audit_lineage"]


def test_synthesis_optimizer_uses_evidence_based_mesh_metrics(monkeypatch):
    monkeypatch.setattr(
        "backend.agents.nodes.run_synthesis_crew",
        lambda *args, **kwargs: '{"summary": {"objective": "Test", "description": "Synthesis"}, "mesh_analytics": {"security_posture": "Strong", "performance_readiness": "Optimal", "traceability_index": 19, "sla_confidence": "High", "requirement_coverage": "94%", "execution_readiness": "Stable"}}',
    )

    state = {
        "task_id": "TASK-301",
        "analysis_payload": {"scope": {"gherkin_scenarios": ["Scenario: checkout"]}},
        "test_cases": [{"title": "Checkout confirmation"}],
        "test_data_samples": [{"persona": "shopper"}],
        "mock_specs": [{"endpoint": "/checkout/confirm"}],
        "api_test_code": [{"file": "checkout.spec.ts"}],
        "performance_config": {"coverage_ratio": 0.9},
        "security_signals": [{"risk": "payment replay", "severity": "High"}],
        "microservices_config": {},
        "traceability_matrix": [{"requirement_id": "REQ-1", "test_case_references": ["TC-001"]}],
        "traceability_audit": {
            "requirement_to_test_mappings": [{"requirement_id": "REQ-1", "test_case_references": ["TC-001"]}],
            "ac_to_scenario_traceability": [{"requirement_id": "REQ-1", "scenario_references": ["Scenario: checkout"]}],
            "workflow_to_risk_coverage": [{"workflow": "Checkout", "risk_focus": ["payment replay"], "dependencies": ["payment gateway"]}],
            "dependency_to_test_relationships": [{"dependency": "Redis", "test_relationship": ["Cache Validation Tests"]}],
            "full_audit_lineage": {"lineage_steps": ["Requirement ingestion", "Traceability mapping"]},
        },
        "compliance_report": {"compliance_controls": [{"control_id": "PCI-DSS-PAY-01"}], "threat_model": [{"attack_surface": "Checkout"}]},
        "strategy_blueprint": {},
        "regression_priority": {},
        "execution_plan": {},
        "environment_config": {},
        "progressive_delivery": {},
        "chaos_scenarios": [],
        "mobile_test_config": {},
        "graphql_validation": {},
        "feature_flag_tests": [],
        "production_monitors": {},
        "sla_slo_audit": {},
        "distributed_traces": {},
        "lifecycle_audit": {
            "workflow_lifecycle_states": [{"workflow": "Checkout", "states": ["Cart", "Payment Authorized", "Order Confirmed"]}],
            "state_transitions": [{"workflow": "Checkout", "from_state": "Cart", "to_state": "Order Confirmed"}],
            "lifecycle_coverage": {"coverage_ratio": 0.83},
            "rollback_retry_states": [{"workflow": "Checkout", "state": "Payment Authorized"}],
            "dependency_aware_lifecycle_chains": [{"workflow": "Checkout", "dependencies": ["payment gateway"]}],
        },
        "mesh_topology": {"nodes": [{"id": "Creator", "status": "Completed"}, {"id": "Auditor", "status": "Completed"}, {"id": "Monitor", "status": "Pending"}]},
        "reliability_eng": {},
        "perf_intelligence_config": {},
        "observability_intelligence": {},
        "rca_intelligence": {},
        "incident_remediation": {},
        "system_resilience": {},
        "release_risk_decision": {},
        "business_impact_intelligence": {},
        "eng_economics_roi": {},
        "eng_knowledge_graph": {},
        "platform_meta_intelligence": {},
        "exploratory_test_assistant": {},
        "locator_intelligence": {},
        "auto_migration_assistant": {},
        "mutation_test_assistant": {},
        "i18n_test_assistant": {},
        "release_commander": {},
        "trend_analyst": {},
        "mesh_confidence": 0.9,
        "logic_audit_feedback": "No overrides.",
    }

    result = synthesis_optimizer_node(state)
    final = result["final_synthesis"]
    analytics = final["mesh_analytics"]

    assert isinstance(analytics["security_posture"], int)
    assert isinstance(analytics["performance_readiness"], int)
    assert isinstance(analytics["traceability_index"], int)
    assert isinstance(analytics["sla_confidence"], int)
    assert analytics["requirement_coverage"].endswith("%")
    assert analytics["execution_readiness"] in {"Stable", "De-risked", "Action Required"}
    assert analytics["security_posture"] != "Strong"
    assert analytics["performance_readiness"] != "Optimal"
    assert analytics["traceability_index"] != 19
    assert analytics["risk_hotspots"] >= 1
