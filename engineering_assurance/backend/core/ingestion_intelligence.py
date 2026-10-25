"""
Deterministic requirement ingestion intelligence.

This module turns raw requirement text into structured entities that downstream
agents can use without relying on brittle template expansion.
"""

from __future__ import annotations

import re
from collections import defaultdict


def _normalize_text(value: str, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip().strip('"\'`')
    return text[:limit].strip()


def _dedupe(items):
    seen = set()
    output = []
    for item in items or []:
        text = _normalize_text(item)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(text)
    return output


def _contains_any(text: str, terms) -> bool:
    candidate = str(text or "").lower()
    for term in terms:
        needle = str(term or "").lower().strip()
        if not needle:
            continue
        if " " in needle:
            if needle in candidate:
                return True
        elif re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", candidate):
            return True
    return False


def _is_generic(text: str) -> bool:
    candidate = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not candidate or len(candidate) < 4:
        return True
    generic = {
        "the",
        "system",
        "given",
        "when",
        "then",
        "and",
        "or",
        "manual validation required",
        "manual review required",
        "acceptance criteria not specified",
        "verify requirements as described",
        "expected result",
        "actual result",
        "tbd",
        "pending",
        "...",
        "module description",
        "core modules",
        "executable workflows",
        "product overview",
        "workflow overview",
    }
    if candidate in generic:
        return True
    return candidate.startswith((
        "manual validation required",
        "manual review required",
        "verify requirements as described",
        "the system should",
        "the platform",
        "the application",
    ))


def _clean_candidate(text: str, limit: int = 180) -> str:
    candidate = _normalize_text(text, limit)
    candidate = re.sub(r"^\s*[-*•]\s*", "", candidate)
    if not candidate or _is_generic(candidate):
        return ""
    return candidate


_AMBIGUITY_TERMS = (
    "fast",
    "seamless",
    "secure",
    "scalable",
    "reliable",
    "robust",
    "optimized",
    "intelligent",
    "frictionless",
    "simple",
    "easy",
)


def _is_ambiguity_phrase(text: str) -> bool:
    candidate = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not candidate:
        return False
    if not _contains_any(candidate, _AMBIGUITY_TERMS):
        return False
    return not _contains_any(candidate, (
        "search",
        "checkout",
        "payment",
        "return",
        "refund",
        "tracking",
        "login",
        "logout",
        "session",
        "cart",
        "order",
        "booking",
        "shipment",
        "fulfillment",
        "recommend",
        "catalog",
        "product",
    ))


def _extract_ambiguity_terms(text: str) -> list[str]:
    lower = (text or "").lower()
    return _dedupe([term for term in _AMBIGUITY_TERMS if _contains_any(lower, (term,))])


def _workflow_semantic_key(label: str) -> str:
    candidate = re.sub(r"\s+", " ", str(label or "")).strip().lower()
    if not candidate:
        return ""
    if _contains_any(candidate, ("checkout", "payment", "cart", "order")):
        return "checkout_payment"
    if _contains_any(candidate, ("return", "refund", "exchange", "rma")):
        return "returns_refunds"
    if _contains_any(candidate, ("search", "discover", "browse", "filter", "sort", "recommend")):
        return "search_discovery"
    if _contains_any(candidate, ("tracking", "shipment", "fulfillment", "delivery", "logistics")):
        return "tracking_fulfillment"
    if _contains_any(candidate, ("login", "logout", "session", "auth", "access", "permission", "role")):
        return "access_control"
    if _contains_any(candidate, ("notification", "webhook", "event", "queue", "message")):
        return "notifications_events"
    if _contains_any(candidate, ("inventory", "stock", "availability", "reservation")):
        return "inventory_management"
    return re.sub(r"[^a-z0-9]+", "_", candidate).strip("_")


def _workflow_label_score(label: str) -> int:
    candidate = re.sub(r"\s+", " ", str(label or "")).strip().lower()
    if not candidate:
        return 0
    score = 0
    if candidate.startswith("product search") or candidate.startswith("flight search"):
        score += 7
    if candidate.startswith("product discovery") or candidate.startswith("travel discovery"):
        score += 6
    if candidate.startswith("search & discovery"):
        score += 6
    if candidate.startswith("checkout") or candidate.startswith("reservation details"):
        score += 7
    if candidate.startswith("order tracking") or candidate.startswith("trip management"):
        score += 7
    if candidate.startswith("returns & refunds") or candidate.startswith("cancellations"):
        score += 7
    if candidate.startswith("authentication"):
        score += 6
    if candidate.startswith("access control"):
        score += 6
    score += min(3, len(candidate.split()) // 2)
    if _contains_any(candidate, ("product", "order", "checkout", "payment", "returns", "tracking", "search", "discovery")):
        score += 2
    return score


def _select_workflow_labels(labels: list[str], domain: str) -> list[str]:
    semantic = {}
    for label in _dedupe([
        item for item in labels
        if item and not _is_generic(item) and not _is_feature_meta_phrase(item)
    ]):
        candidate = _canonical_entity_label(label, domain=domain)
        if not candidate or _is_generic(candidate) or _is_feature_meta_phrase(candidate):
            continue
        key = _workflow_semantic_key(candidate)
        if not key:
            continue
        current = semantic.get(key)
        if current is None or _workflow_label_score(candidate) > _workflow_label_score(current):
            semantic[key] = candidate
    return list(semantic.values())


def _is_feature_meta_phrase(text: str) -> bool:
    candidate = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not candidate:
        return True
    return _contains_any(candidate, (
        "the",
        "system",
        "given",
        "when",
        "then",
        "fast",
        "seamless",
        "secure",
        "scalable",
        "reliable",
        "robust",
        "optimized",
        "intelligent",
        "frictionless",
        "simple",
        "easy",
        "mfa support",
        "user demographics",
        "user interactions",
        "user insights",
        "user capabilities",
        "feature support",
        "features",
        "capabilities",
        "overview",
        "summary",
        "platform",
        "application",
        "module",
        "modules",
        "banner",
        "banners",
        "expected result",
        "actual result",
    )) and not _contains_any(candidate, (
        "search", "checkout", "payment", "return", "refund", "tracking", "login", "logout", "session",
    ))


def _is_executable_step(text: str) -> bool:
    candidate = _normalize_text(text, 180)
    if not candidate or _is_generic(candidate) or _is_feature_meta_phrase(candidate):
        return False
    lower = candidate.lower()
    if "->" in candidate or "→" in candidate:
        return False
    if _contains_any(lower, ("enables", "supports", "provides", "delivers", "improves", "optimizes", "is designed", "high", "fast", "seamless", "secure", "scalable", "reliable", "robust", "optimized", "intelligent")):
        return False
    return bool(re.match(
        r"^(given|when|then|select|enter|choose|review|apply|confirm|proceed|submit|authorize|capture|open|refresh|add|remove|log in|login|logout|check|track|return|refund|validate|verify|pack|dispatch|compare|flag|receive|post)\b",
        lower,
    ))


def _state_label_set(domain: str) -> set[str]:
    profile = _domain_profile(domain)
    states = {re.sub(r"\s+", " ", state).strip().lower() for state in profile.get("states", []) if state}
    states.update({
        "pending",
        "confirmed",
        "failed",
        "cancelled",
        "canceled",
        "active",
        "inactive",
        "logged out",
        "authenticated",
        "anonymous",
    })
    return states


def _is_valid_state_label(text: str, domain: str) -> bool:
    candidate = _normalize_text(text, 120).lower()
    if not candidate:
        return False
    states = _state_label_set(domain)
    if candidate in states:
        return True
    if _contains_any(candidate, ("confirmed", "cancelled", "canceled", "failed", "returned", "refunded", "authorized", "delivered", "shipped", "packed", "in transit", "logged out", "authenticated", "anonymous")):
        return True
    return False


def _is_acceptance_generic(text: str) -> bool:
    candidate = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not candidate:
        return True
    return candidate in {
        "manual validation required",
        "manual validation required (audit failed)",
        "manual review required",
        "verify requirements as described",
        "acceptance criteria not specified",
        "the system shall satisfy the requirement described in the requirement.",
        "the system shall satisfy the requirement described in the requirement",
        "tbd",
        "pending",
        "...",
    } or candidate.startswith((
        "manual validation required",
        "manual review required",
        "verify requirements as described",
        "the system shall satisfy the requirement described",
    ))


def _acceptance_strength(criteria: list[str]) -> int:
    score = 0
    for item in criteria or []:
        text = _normalize_text(item, 260)
        if not text:
            continue
        score += 1
        lower = text.lower()
        if _is_acceptance_generic(text):
            score -= 2
        if _contains_any(lower, ("must", "shall", "should", "when", "then", "error", "valid", "invalid", "confirm", "reject")):
            score += 1
        if _contains_any(lower, ("state", "status", "session", "booking", "order", "payment", "search", "cart", "tracking", "refund", "checkout")):
            score += 1
    return score


def _derive_acceptance_templates(domain: str, workflows: list[str], transitions: list[dict], dependencies: list[dict]) -> list[str]:
    profile = _domain_profile(domain)
    template_map = {
        "Authentication": [
            "Valid credentials create an authenticated session and invalid credentials fail without creating one.",
            "Logout clears the session and returns the user to the anonymous state.",
        ],
        "Product Search": [
            "Valid search criteria return relevant results with the expected filters and ranking.",
            "Invalid or unsupported search criteria produce a clear validation message without mutating state.",
        ],
        "Flight Search": [
            "Valid search criteria return relevant flight and itinerary results with the expected filters.",
            "Invalid search criteria produce a clear validation message.",
        ],
        "Product Discovery": [
            "Recommendations reflect the current user or catalog context and change when that context changes.",
        ],
        "Travel Discovery": [
            "Recommendations reflect the current user or destination context and change appropriately.",
        ],
        "Cart Management": [
            "Cart updates preserve quantity, price, and item state across navigation.",
            "Removing or replacing items updates the cart without affecting unrelated entries.",
        ],
        "Checkout": [
            "Checkout validates shipping, pricing, and coupon data before payment is allowed.",
            "Order confirmation is created only after all checkout validations pass.",
        ],
        "Payment Processing": [
            "Successful payment advances the workflow to a confirmed state.",
            "Failed authorization does not create duplicate charges or duplicate bookings.",
        ],
        "Order Tracking": [
            "Tracking reflects the latest downstream order or shipment state.",
            "Status updates become visible after the corresponding downstream event is processed.",
        ],
        "Returns & Refunds": [
            "Eligible return requests create a return or refund record.",
            "Rejected returns preserve the original order or booking state and show the correct reason.",
        ],
        "Recommendation Personalization": [
            "Personalization reflects the user intent, history, or affinity context.",
            "Personalization updates when the profile or catalog changes.",
        ],
        "Shipment Tracking": [
            "Shipment status reflects the latest carrier event.",
            "Delayed or missing tracking updates are surfaced without corrupting order state.",
        ],
        "Ledger Reconciliation": [
            "Ledger entries reconcile to the corresponding transaction state.",
            "Mismatched entries are flagged without posting duplicate financial records.",
        ],
        "Primary Workflow": [
            "The primary workflow completes only when the expected business state transitions are satisfied.",
        ],
    }

    derived = []
    for workflow in workflows or []:
        derived.extend(template_map.get(workflow, []))

    # Fall back to domain-specific workflow templates when labels are sparse.
    if not derived:
        for item in profile["workflows"]:
            if item["label"] in workflows:
                derived.extend(template_map.get(item["label"], []))

    # Translate explicit state transitions into concrete assertions.
    for transition in transitions or []:
        event = _normalize_text(transition.get("event") or "", 80)
        from_state = _normalize_text(transition.get("from") or "", 80)
        to_state = _normalize_text(transition.get("to") or "", 80)
        if event and to_state:
            derived.append(f"{event} moves the workflow from {from_state or 'the prior'} state to {to_state} without leaving orphaned state.")

    # Dependency-driven criteria keep the ACs tied to actual integration risk.
    for dep in dependencies or []:
        dependency = _normalize_text(dep.get("dependency") or "", 80)
        if not dependency:
            continue
        criticality = _normalize_text(dep.get("criticality") or "", 20).lower()
        if "high" in criticality:
            derived.append(f"{dependency} failures are handled without breaking the primary workflow state.")
        else:
            derived.append(f"{dependency} responses are consumed without corrupting the workflow output.")

    return _dedupe([item for item in derived if item and not _is_acceptance_generic(item)])


def _infer_domain(text: str) -> str:
    lower = (text or "").lower()
    domain_rules = (
        ("travel", ("flight", "airline", "hotel", "passenger", "itinerary", "seat", "departure")),
        ("commerce", ("cart", "checkout", "order", "product", "catalog", "basket", "purchase", "seller")),
        ("finance", ("payment", "billing", "invoice", "refund", "charge", "transaction")),
        ("identity", ("login", "logout", "session", "authorization", "authentication", "otp", "role")),
        ("logistics", ("shipment", "delivery", "tracking", "fulfillment", "carrier")),
        ("healthcare", ("patient", "clinical", "appointment", "prescription", "medical", "doctor", "health", "hospital")),
    )
    
    best_domain = "general"
    domain_scores = {}
    
    for domain, cues in domain_rules:
        score = sum(lower.count(cue) for cue in cues)
        domain_scores[domain] = score
        
    highest_score = max(domain_scores.values()) if domain_scores else 0
    if highest_score < 3:
        return "general"
        
    sorted_scores = sorted(domain_scores.values(), reverse=True)
    if len(sorted_scores) > 1 and (sorted_scores[0] - sorted_scores[1] <= 1):
        return "ambiguous"
        
    for d, s in domain_scores.items():
        if s == highest_score:
            return d
            
    return "general"


def _infer_architecture(text: str, dependencies: list[dict]) -> str:
    lower = (text or "").lower()
    if _contains_any(lower, ("graphql",)):
        return "graphql"
    if _contains_any(lower, ("rest", "api", "endpoint", "http")):
        if len(dependencies) >= 2 or _contains_any(lower, ("service", "gateway", "provider", "queue")):
            return "microservices"
        return "service-oriented"
    if len(dependencies) >= 2:
        return "microservices"
    return "monolith"


def _infer_api_styles(text: str) -> list[str]:
    lower = (text or "").lower()
    styles = []
    if _contains_any(lower, ("rest", "api", "endpoint", "http", "json")):
        styles.append("REST")
    if "graphql" in lower:
        styles.append("GraphQL")
    if _contains_any(lower, ("soap",)):
        styles.append("SOAP")
    return styles or ["REST"]


def _extract_workflow_labels(text: str, domain: str) -> list[str]:
    profile = _domain_profile(domain)
    lower = (text or "").lower()
    labels = []

    for item in profile["workflows"]:
        label = item["label"]
        if _contains_any(lower, item["cues"]):
            labels.append(label)

    for line in _extract_lines(text):
        clean = _clean_candidate(line, 120)
        if not clean or _is_ambiguity_phrase(clean):
            continue
        if re.match(r"^[A-Z][A-Za-z0-9 &/-]{2,80}$", clean) and len(clean.split()) <= 5:
            labels.append(clean)
            
        for workflow in profile["workflows"]:
            if _contains_any(clean.lower(), workflow["cues"]):
                labels.append(workflow["label"])
                
    return _select_workflow_labels(labels, domain)


def _workflow_cues_for_label(label: str, domain: str) -> tuple[str, ...]:
    profile = _domain_profile(domain)
    label_lower = (label or "").lower()
    for item in profile["workflows"]:
        if item["label"].lower() == label_lower:
            return item["cues"]
    if "search" in label_lower:
        return ("search", "filter", "sort", "results", "availability")
    if "checkout" in label_lower:
        return ("checkout", "coupon", "promo", "payment", "review")
    if "payment" in label_lower:
        return ("payment", "authorize", "charge", "refund", "pay")
    if "tracking" in label_lower or "order" in label_lower or "shipment" in label_lower:
        return ("tracking", "status", "shipment", "delivery", "confirmation")
    if "return" in label_lower or "refund" in label_lower:
        return ("return", "refund", "cancel", "exchange")
    if "login" in label_lower or "auth" in label_lower or "session" in label_lower:
        return ("login", "logout", "session", "otp", "role")
    return ()


def _primary_workflow_label(domain: str, text: str, workflow_labels: list[str]) -> str:
    lower = (text or "").lower()
    if domain == "travel" and _contains_any(lower, ("booking", "flight", "passenger", "seat", "payment")):
        return "Flight Booking"
    if domain == "commerce" and _contains_any(lower, ("order", "checkout", "cart", "payment")):
        return "Order Fulfillment"
    if domain == "identity" and _contains_any(lower, ("login", "logout", "session", "authentication")):
        return "Session Management"
    if domain == "logistics" and _contains_any(lower, ("shipment", "delivery", "tracking", "fulfillment")):
        return "Shipment Tracking"
    if domain == "finance" and _contains_any(lower, ("payment", "ledger", "transaction", "reconcile")):
        return "Payment Lifecycle"
    if workflow_labels:
        return workflow_labels[0]
    return _domain_profile(domain)["workflows"][0]["label"]


def _workflow_step_templates(domain: str, label: str) -> list[str]:
    lower = (label or "").lower()
    templates = {
        "travel": {
            "Flight Booking": ["Select flight", "Enter passenger details", "Seat selection", "Review booking", "Proceed to payment"],
            "Flight Search": ["Enter search criteria", "Review available flights", "Refine filters", "Select itinerary"],
            "Reservation Details": ["Review booking", "Apply coupon", "Confirm traveler details", "Proceed to payment"],
            "Payment Processing": ["Authorize payment", "Capture payment", "Create booking confirmation"],
            "Trip Management": ["Open booking confirmation", "Refresh itinerary or ticket status", "Verify latest travel status"],
            "Cancellations & Refunds": ["Submit cancellation or refund request", "Validate eligibility", "Confirm refund or reversal"],
        },
        "commerce": {
            "Order Fulfillment": ["Select product", "Add to cart", "Review cart", "Checkout", "Authorize payment"],
            "Product Search": ["Enter search criteria", "Review results", "Filter or sort results", "Select product"],
            "Checkout": ["Review cart", "Apply coupon", "Confirm shipping", "Proceed to payment"],
            "Payment Processing": ["Authorize payment", "Capture payment", "Create order confirmation"],
            "Order Tracking": ["Open order details", "Refresh shipment status", "Verify delivery state"],
            "Returns & Refunds": ["Submit return request", "Approve return eligibility", "Confirm refund or exchange"],
        },
        "identity": {
            "Session Management": ["Enter credentials", "Authenticate user", "Establish session", "Logout", "Clear session"],
            "Authentication": ["Enter credentials", "Validate identity", "Create authenticated session"],
        },
        "logistics": {
            "Shipment Tracking": ["Open shipment", "Fetch carrier status", "Refresh latest tracking event", "Confirm visible status"],
            "Fulfillment": ["Pack order", "Dispatch shipment", "Update carrier handoff", "Confirm fulfillment state"],
        },
        "finance": {
            "Payment Lifecycle": ["Initiate transaction", "Authorize payment", "Capture funds", "Reconcile ledger"],
            "Ledger Reconciliation": ["Receive transaction event", "Post ledger entry", "Compare balances", "Flag mismatch"],
        },
    }
    domain_templates = templates.get(domain, {})
    for key, steps in domain_templates.items():
        if key.lower() == lower:
            return steps
    for key, steps in domain_templates.items():
        if _contains_any(lower, tuple(key.lower().split())):
            return steps
    return []


_DOMAIN_CATALOG = {
    "travel": {
        "workflows": [
            {"label": "Authentication", "cues": ("login", "logout", "session", "otp", "role")},
            {"label": "Flight Search", "cues": ("search", "filter", "sort", "availability", "flight")},
            {"label": "Travel Discovery", "cues": ("recommend", "personalized", "suggest", "discover")},
            {"label": "Itinerary Management", "cues": ("cart", "basket", "save trip", "saved itinerary")},
            {"label": "Reservation Details", "cues": ("checkout", "apply coupon", "coupon", "promo", "review booking")},
            {"label": "Payment Processing", "cues": ("payment", "pay", "charge", "refund", "authorization")},
            {"label": "Trip Management", "cues": ("tracking", "confirmation", "ticket", "booking confirmed", "itinerary")},
            {"label": "Cancellations & Refunds", "cues": ("return", "refund", "cancel", "reschedule")},
            {"label": "Recommendation Personalization", "cues": ("recommend", "personal", "preference", "behavior")},
        ],
        "states": ["Initiated", "Searching", "Selected", "Passenger Details", "Seat Selected", "Payment Pending", "Booking Confirmed", "Ticketed", "Cancelled", "Refunded"],
        "dependencies": [
            ("Payment Gateway", ("payment gateway", "payment provider", "gateway"), ["timeout", "authorization failure", "duplicate transaction"]),
            ("External Airline API", ("airline api", "airline service", "availability api", "flight api"), ["timeout", "stale availability", "rate limit"]),
            ("Notification Provider", ("notification", "email", "sms", "push", "webhook"), ["delivery failure", "retry exhaustion"]),
            ("Redis Cache", ("redis", "cache"), ["stale availability", "cache eviction", "cache miss storm"]),
            ("Kafka Event Bus", ("kafka", "event bus", "queue", "event stream"), ["event lag", "duplicate event", "message loss"]),
            ("Logistics API", ("logistics", "carrier", "shipping", "fulfillment"), ["status lag", "provider outage"]),
        ],
        "risks": [
            ("Payment", "Duplicate Transaction", "Critical", ("duplicate transaction", "double charge", "payment")),
            ("Search", "High Latency During Sales", "High", ("latency", "search", "peak", "sales", "availability")),
            ("Availability", "Stale Availability", "High", ("stale availability", "inventory", "seat", "availability")),
            ("Booking", "Overbooking", "Critical", ("overbooking", "double booking", "concurrency")),
            ("Session", "Session Drift", "Medium", ("logout", "session", "timeout")),
        ],
        "states_label": "booking_states",
    },
    "commerce": {
        "workflows": [
            {"label": "Authentication", "cues": ("login", "logout", "session", "otp", "role")},
            {"label": "Product Search", "cues": ("search", "filter", "sort", "browse", "product")},
            {"label": "Product Discovery", "cues": ("recommend", "personalized", "suggest", "discover")},
            {"label": "Cart Management", "cues": ("cart", "basket", "save for later")},
            {"label": "Checkout", "cues": ("checkout", "coupon", "promo", "apply discount")},
            {"label": "Payment Processing", "cues": ("payment", "pay", "charge", "refund", "authorization")},
            {"label": "Order Tracking", "cues": ("tracking", "order status", "shipment", "delivery")},
            {"label": "Returns & Refunds", "cues": ("return", "refund", "rma", "exchange", "cancel")},
            {"label": "Recommendation Personalization", "cues": ("recommend", "personal", "behavior")},
        ],
        "states": ["Created", "Browsing", "Cart Updated", "Checkout Pending", "Payment Authorized", "Order Confirmed", "Packed", "Shipped", "Delivered", "Returned", "Refunded"],
        "dependencies": [
            ("Payment Gateway", ("payment gateway", "payment provider", "gateway"), ["timeout", "authorization failure", "duplicate transaction"]),
            ("Redis Cache", ("redis", "cache"), ["stale data", "cache eviction", "cache miss storm"]),
            ("Elasticsearch", ("elasticsearch", "search index", "search"), ["stale index", "partial results", "lagging updates"]),
            ("Kafka Event Bus", ("kafka", "event bus", "queue", "event stream"), ["duplicate event", "event lag", "message loss"]),
            ("Notification Provider", ("notification", "email", "sms", "push", "webhook"), ["delivery failure", "retry exhaustion"]),
            ("Logistics API", ("logistics", "carrier", "shipping", "fulfillment"), ["status lag", "provider outage"]),
        ],
        "risks": [
            ("Payment", "Duplicate Transaction", "Critical", ("duplicate transaction", "double charge", "payment")),
            ("Search", "Stale Search Index", "High", ("stale index", "search", "catalog", "latency")),
            ("Cart", "State Loss", "High", ("cart", "basket", "session")),
            ("Order", "Incorrect Order State", "High", ("order", "checkout", "payment", "shipment")),
        ],
        "states_label": "order_states",
    },
    "identity": {
        "workflows": [
            {"label": "Authentication", "cues": ("login", "logout", "session", "otp", "role")},
            {"label": "Access Management", "cues": ("permission", "role", "authorization", "access")},
        ],
        "states": ["Anonymous", "Authenticated", "Authorized", "Expired", "Locked", "Logged Out"],
        "dependencies": [
            ("Identity Provider", ("identity provider", "oauth", "sso"), ["timeout", "token failure", "auth failure"]),
            ("Notification Provider", ("notification", "email", "sms", "push"), ["delivery failure", "retry exhaustion"]),
        ],
        "risks": [
            ("Authentication", "Brute Force Attempt", "High", ("login", "otp", "locked", "failed")),
            ("Session", "Session Drift", "Medium", ("logout", "session", "token")),
        ],
        "states_label": "session_states",
    },
    "logistics": {
        "workflows": [
            {"label": "Shipment Tracking", "cues": ("tracking", "shipment", "delivery", "carrier")},
            {"label": "Fulfillment", "cues": ("fulfillment", "dispatch", "warehouse")},
            {"label": "Returns & Refunds", "cues": ("return", "refund", "rma", "exchange")},
        ],
        "states": ["Created", "Packed", "Shipped", "In Transit", "Delivered", "Returned", "Refunded"],
        "dependencies": [
            ("Logistics API", ("logistics", "carrier", "shipping", "fulfillment"), ["status lag", "provider outage"]),
            ("Notification Provider", ("notification", "email", "sms", "push", "webhook"), ["delivery failure", "retry exhaustion"]),
        ],
        "risks": [
            ("Shipment", "Stale Tracking State", "High", ("tracking", "shipment", "delivery")),
        ],
        "states_label": "shipment_states",
    },
    "finance": {
        "workflows": [
            {"label": "Authentication", "cues": ("login", "logout", "session", "otp", "role")},
            {"label": "Payment Processing", "cues": ("payment", "billing", "transaction", "charge", "refund")},
            {"label": "Ledger Reconciliation", "cues": ("ledger", "reconcile", "reconciliation", "journal")},
        ],
        "states": ["Pending", "Authorized", "Captured", "Settled", "Failed", "Reversed", "Refunded"],
        "dependencies": [
            ("Payment Gateway", ("payment gateway", "payment provider", "gateway"), ["timeout", "authorization failure", "duplicate transaction"]),
            ("Ledger Service", ("ledger", "reconcile", "journal"), ["posting failure", "mismatch", "duplicate entry"]),
        ],
        "risks": [
            ("Payment", "Duplicate Transaction", "Critical", ("duplicate transaction", "double charge", "payment")),
            ("Ledger", "Reconciliation Mismatch", "High", ("ledger", "mismatch", "reconcile")),
        ],
        "states_label": "transaction_states",
    },
    "healthcare": {
        "workflows": [
            {"label": "Authentication", "cues": ("login", "logout", "session", "otp", "role")},
            {"label": "Patient Intake", "cues": ("patient", "intake", "appointment", "registration")},
            {"label": "Record Management", "cues": ("record", "medical", "clinical", "chart")},
        ],
        "states": ["Requested", "Scheduled", "Checked In", "In Progress", "Completed", "Cancelled"],
        "dependencies": [
            ("Patient Record API", ("patient record", "ehr", "emr", "clinical"), ["timeout", "stale record", "availability"]),
        ],
        "risks": [
            ("Records", "Stale Patient Record", "High", ("record", "stale", "patient")),
        ],
        "states_label": "care_flow_states",
    },
}


def _domain_profile(domain: str) -> dict:
    return _DOMAIN_CATALOG.get(domain, {
        "workflows": [
            {"label": "Primary Workflow", "cues": ("workflow", "flow", "process")},
        ],
        "states": ["Initiated", "In Progress", "Completed"],
        "dependencies": [],
        "risks": [],
        "states_label": "state_sequence",
    })


def _extract_lines(text: str) -> list[str]:
    lines = []
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    
    # Heal hard line breaks from PDF/terminal copy-pasting
    # Join lines where the previous line does NOT end with a period, exclamation, question mark, or colon
    text = re.sub(r"([^.!?:\n])\s*\n\s*([a-zA-Z0-9.,])", r"\1 \2", text)
    
    for raw in text.split("\n"):
        line = re.sub(r"^\s*(?:[-*•]|\d+[.)-])\s*", "", raw).strip()
        if line:
            lines.append(line)
    return lines


def _extract_acceptance_criteria(text: str, provided: list[str] | None = None) -> list[str]:
    domain = _infer_domain(text)
    profile = _domain_profile(domain)
    provided = provided or []
    lines = _extract_lines(text)
    raw_sentences = []
    for chunk in re.split(r"(?<=[.!?])\s+|\n+", text or ""):
        chunk = _normalize_text(chunk, 260)
        if chunk:
            raw_sentences.append(chunk)

    ac_pattern = re.compile(
        r"\b(should|must|shall|need to|has to|required|will|accept|verify|validate|ensure|confirm|can|cannot|may not|must not)\b",
        re.IGNORECASE,
    )
    candidates = []
    candidates.extend(provided)

    # Directly capture explicit AC statements from the text.
    for source_line in [*lines, *raw_sentences]:
        clean = _clean_candidate(source_line, 260)
        if not clean:
            continue
        if (ac_pattern.search(clean) and len(clean.split()) > 3) or re.match(r"^(given|when|then|if)\b", clean, flags=re.IGNORECASE):
            candidates.append(clean)
        elif _contains_any(clean, ("valid", "invalid", "error", "success", "confirm")) and ("->" in clean or "→" in clean or len(clean.split()) > 4):
            candidates.append(clean)

    # Derive workflow-specific ACs from the detected domain.
    workflows = _extract_workflow_labels(text, domain)
    if not workflows:
        workflows = [item["label"] for item in profile["workflows"] if _contains_any(text.lower(), item["cues"])]

    workflow_criteria_templates = {
        "Authentication": [
            "The user can log in with valid credentials and see the authenticated landing state.",
            "Invalid or expired credentials display a clear error without creating a session.",
            "Logout clears the current session and returns the user to the anonymous state.",
        ],
        "Product Search": [
            "Valid search criteria return relevant results.",
            "Invalid or unsupported search criteria display a clear validation message.",
            "Search results update when filters or sort order change.",
        ],
        "Flight Search": [
            "Valid flight criteria return relevant availability results.",
            "Search results update when filters or dates change.",
        ],
        "Product Discovery": [
            "Personalized recommendations reflect the available user or catalog context.",
            "Recommendation results change when the underlying preferences or catalog data changes.",
        ],
        "Travel Discovery": [
            "Destination recommendations reflect the user's travel history and preferences.",
        ],
        "Cart Management": [
            "Items can be added to and removed from the cart without losing quantity or price state.",
            "The cart preserves valid items across navigation until checkout or explicit removal.",
        ],
        "Checkout": [
            "Valid checkout data allows the user to proceed to payment successfully.",
            "Invalid coupon or promo data displays an error without corrupting the cart state.",
            "Order confirmation is created only after checkout validations pass.",
        ],
        "Payment Processing": [
            "Successful payment transitions the order to the confirmed state.",
            "Payment failures do not create duplicate charges or duplicate bookings.",
            "Authorization errors are surfaced clearly and keep the prior state intact.",
        ],
        "Order Tracking": [
            "Tracking information reflects the latest confirmed order or shipment status.",
            "Status updates are visible after downstream events are processed.",
        ],
        "Returns & Refunds": [
            "Eligible return requests create a return or refund record.",
            "Rejected returns display the correct business reason without mutating the order state.",
        ],
        "Recommendation Personalization": [
            "Recommendations reflect the user's intent, history, or catalog affinity.",
            "Personalization updates when the user profile or catalog data changes.",
        ],
        "Shipment Tracking": [
            "Shipment status reflects the latest carrier event.",
            "Delayed or missing tracking events are surfaced without corrupting the order state.",
        ],
        "Ledger Reconciliation": [
            "Ledger entries reconcile to the corresponding transaction state.",
            "Mismatched entries are flagged without posting duplicate financial records.",
        ],
    }
    for workflow in workflows:
        for item in workflow_criteria_templates.get(workflow, []):
            candidates.append(item)

    if not candidates:
        summary_line = _clean_candidate(lines[0] if lines else text, 180)
        if summary_line:
            candidates.append(f"The system shall satisfy the requirement described in {summary_line}.")

    cleaned = []
    for item in _dedupe(candidates):
        if _is_generic(item) or _is_acceptance_generic(item):
            continue
        text_item = item
        text_item = item
        text_item = _normalize_text(text_item, 260)
        if text_item and text_item not in cleaned:
            cleaned.append(text_item)

    # If the available ACs are weak, supplement or replace them with
    # workflow-linked criteria derived from transitions, dependencies, and
    # domain templates. This prevents narrative text from collapsing into
    # the downstream planner/creator pipeline.
    derived = _derive_acceptance_templates(domain, workflows, _extract_state_transitions(text), _extract_dependencies(text))
    if len(cleaned) < 4 or _acceptance_strength(cleaned) < 4:
        for item in derived:
            if item not in cleaned:
                cleaned.append(item)

    # Keep the result bounded but ensure we have enough structure for downstream nodes.
    if len(cleaned) < 4:
        for item in derived:
            if item not in cleaned:
                cleaned.append(item)
            if len(cleaned) >= 4:
                break

    return cleaned


def _group_acceptance_criteria_by_workflow(text: str, workflows: list[str], criteria: list[str]) -> dict:
    domain = _infer_domain(text)
    buckets = {workflow: [] for workflow in workflows}
    if not buckets:
        buckets = {"Primary Workflow": []}
        workflows = ["Primary Workflow"]

    for ac in criteria:
        ac_lower = ac.lower()
        matched = None
        for workflow in workflows:
            cues = _workflow_cues_for_label(workflow, domain)
            if workflow.lower() in ac_lower or _contains_any(ac_lower, cues):
                matched = workflow
                break
        if matched is None:
            if _contains_any(ac_lower, ("search", "flight", "booking", "passenger", "seat")) and "Flight Search" in buckets:
                matched = "Flight Search"
            elif _contains_any(ac_lower, ("search", "product", "catalog")) and "Product Search" in buckets:
                matched = "Product Search"
            elif _contains_any(ac_lower, ("checkout", "coupon", "payment", "confirmation")) and "Checkout" in buckets:
                matched = "Checkout"
            elif _contains_any(ac_lower, ("checkout", "coupon", "payment", "confirmation")) and "Reservation Details" in buckets:
                matched = "Reservation Details"
            elif _contains_any(ac_lower, ("refund", "return", "cancel")) and "Returns & Refunds" in buckets:
                matched = "Returns & Refunds"
            elif _contains_any(ac_lower, ("refund", "return", "cancel")) and "Cancellations & Refunds" in buckets:
                matched = "Cancellations & Refunds"
            elif _contains_any(ac_lower, ("logout", "login", "session", "otp")) and "Authentication" in buckets:
                matched = "Authentication"
        if matched is None:
            matched = workflows[0]
        buckets.setdefault(matched, [])
        if ac not in buckets[matched]:
            buckets[matched].append(ac)
    return {key: _dedupe(value) for key, value in buckets.items()}


def _canonical_entity_label(text: str, domain: str = "general") -> str:
    candidate = _clean_candidate(text, 80)
    if not candidate:
        return ""
    lower = candidate.lower()
    profile = _domain_profile(domain)
    for item in profile["workflows"]:
        if _contains_any(lower, item["cues"]):
            return item["label"]
    if _contains_any(lower, ("payment gateway", "payment provider", "gateway")):
        return "Payment Gateway"
    if _contains_any(lower, ("airline api", "flight api", "availability api")):
        return "Airline API"
    if domain == "commerce":
        if _contains_any(lower, ("checkout", "cart", "payment", "order")):
            return "Checkout & Payments"
        if _contains_any(lower, ("tracking", "shipment", "fulfillment", "delivery")):
            return "Order Tracking & Fulfillment"
        if _contains_any(lower, ("return", "refund", "exchange", "rma")):
            return "Returns & Refunds"
        if _contains_any(lower, ("search", "filter", "sort", "browse", "discover", "product", "catalog")):
            if _contains_any(lower, ("discover", "recommend", "suggest", "personal")):
                return "Product Discovery"
            return "Product Search"
    if _contains_any(lower, ("search api", "search flights", "flight search", "search")):
        return "Flight Search" if domain == "travel" else "Search"
    if _contains_any(lower, ("booking", "reserve", "reservation")) and domain == "travel":
        return "Flight Booking"
    if _contains_any(lower, ("passenger details", "passenger")):
        return "Passenger Details"
    if _contains_any(lower, ("seat selection", "seat")):
        return "Seat Selection"
    if _contains_any(lower, ("logout", "session")):
        return "Session Management"
    if _contains_any(lower, ("payment success", "booking confirmed", "confirmed")):
        return "Booking State"

    tokens = re.findall(r"[A-Za-z][A-Za-z0-9'-]*", candidate)
    if not tokens:
        return ""
    significant = [tok for tok in tokens if tok.lower() not in {
        "the", "and", "or", "for", "with", "from", "to", "of", "a", "an", "in", "on", "by"
    }]
    if not significant:
        significant = tokens
    label = " ".join(tok.capitalize() for tok in significant[:3])
    return label


def _entity_type_for_label(label: str, source_text: str = "") -> str:
    lower = (label or "").lower()
    if _contains_any(lower, ("gateway", "api", "service", "provider")):
        return "External Service"
    if _contains_any(lower, ("state", "session", "payment", "booking")):
        return "Workflow State"
    if _contains_any(lower, ("risk",)):
        return "Risk Entity"
    if _contains_any(lower, ("search", "booking", "selection", "details", "checkout", "payment", "logout")):
        return "Workflow Module"
    if _contains_any(source_text.lower(), ("api", "endpoint", "service")):
        return "Workflow Module"
    return "Business Entity"


def _extract_workflow_steps(text: str) -> list[str]:
    ordered = []
    for line in _extract_lines(text):
        clean = _clean_candidate(line, 160)
        if not clean or len(clean.split()) > 12:
            continue
        if _is_feature_meta_phrase(clean) or _is_ambiguity_phrase(clean) or clean.lower() in {"given", "when", "then", "the", "system"}:
            continue
        if _contains_any(clean, ("select", "enter", "choose", "review", "proceed", "confirm", "logout", "book", "search", "pay", "submit", "seat")):
            ordered.append(clean)
    return _dedupe(ordered)


def _build_workflow_graphs(text: str, workflow_labels: list[str]) -> list[dict]:
    domain = _infer_domain(text)
    graphs = []
    if not workflow_labels:
        workflow_labels = [_primary_workflow_label(domain, text, [])]

    line_steps = _extract_workflow_steps(text)
    for label in workflow_labels[:8]:
        template_steps = _workflow_step_templates(domain, label)
        if not template_steps:
            cues = _workflow_cues_for_label(label, domain)
            template_steps = [
                line for line in line_steps
                if _contains_any(line, cues) or _contains_any(line, tuple(label.lower().split()))
            ]
        if not template_steps:
            template_steps = line_steps[:5]
        if not template_steps:
            continue
        graph_steps = []
        for idx, step in enumerate(_dedupe(template_steps)):
            next_step = _dedupe(template_steps)[idx + 1] if idx + 1 < len(_dedupe(template_steps)) else ""
            graph_steps.append({"step": step, "next": next_step})
        graphs.append({"workflow": label, "steps": graph_steps})
    return graphs


def _extract_state_transitions(text: str) -> list[dict]:
    transitions = []
    patterns = [
        re.compile(r"(?P<event>[^→\n]{3,80})\s*→\s*(?P<to>[^.\n]{3,80})"),
        re.compile(r"(?P<event>[^-\n]{3,80})\s*->\s*(?P<to>[^.\n]{3,80})"),
        re.compile(r"(?i)(?P<event>payment success|payment approved|logout|session cleared|booking confirmed)\s*(?:-|:|→|->)\s*(?P<to>[^.\n]{3,80})"),
    ]
    for line in _extract_lines(text):
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            event = _normalize_text(match.group("event"), 80)
            to_state = _normalize_text(match.group("to"), 80)
            if not event or not to_state:
                continue
            event_lower = event.lower()
            from_state = "Pending"
            if "logout" in event_lower:
                from_state = "Authenticated"
                to_state = "Session Cleared"
            elif "payment" in event_lower:
                from_state = "Pending"
                if "success" in event_lower or "approved" in event_lower:
                    to_state = "Booking Confirmed"
            elif "booking" in event_lower and "confirmed" in to_state.lower():
                from_state = "Pending"
            transitions.append({
                "event": event,
                "from": from_state,
                "to": to_state,
            })
            break
    return transitions


def _dedupe_dependencies(dependencies: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for item in dependencies or []:
        if not isinstance(item, dict):
            continue
        dependency = _normalize_text(item.get("dependency") or "", 120)
        if not dependency:
            continue
        key = dependency.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _extract_dependencies(text: str) -> list[dict]:
    domain = _infer_domain(text)
    profile = _domain_profile(domain)
    lower = (text or "").lower()
    dependencies = []
    seen = set()
    
    for dependency, cues, failure_modes in profile["dependencies"]:
        if _contains_any(lower, cues):
            record = {
                "dependency": dependency,
                "type": "External Service" if _contains_any(dependency.lower(), ("gateway", "api", "provider")) else "Internal Service",
                "criticality": "High" if dependency in {"Payment Gateway", "Kafka Event Bus", "Elasticsearch", "Logistics API", "Ledger Service", "Patient Record API", "External Airline API"} else "Medium",
                "failure_modes": failure_modes,
            }
            key = dependency.lower()
            if key not in seen:
                seen.add(key)
                dependencies.append(record)
                
    return _dedupe_dependencies(dependencies)


def _build_dependency_graph(workflow_labels: list[str], dependencies: list[dict], domain: str) -> list[dict]:
    dependency_names = [_normalize_text(dep.get("dependency") or "", 120) for dep in dependencies if isinstance(dep, dict) and dep.get("dependency")]
    if not workflow_labels:
        return []

    family_map = {
        "search_discovery": ["Search Service", "Redis Cache", "Elasticsearch", "Kafka Event Bus"],
        "checkout_payment": ["Payment Gateway", "Redis Cache", "Kafka Event Bus", "Notification Provider", "Inventory Service"],
        "returns_refunds": ["Payment Gateway", "Notification Provider", "Inventory Service", "Kafka Event Bus"],
        "tracking_fulfillment": ["Logistics API", "Notification Provider", "Kafka Event Bus"],
        "access_control": ["Identity Provider", "Audit Log", "Session Store", "Notification Provider"],
        "notifications_events": ["Notification Provider", "Kafka Event Bus"],
        "inventory_management": ["Inventory Service", "Redis Cache", "Kafka Event Bus"],
    }

    graph = []
    for label in workflow_labels[:12]:
        key = _workflow_semantic_key(label)
        matched = list(family_map.get(key, []))
        lower = label.lower()
        for dep in dependency_names:
            dep_lower = dep.lower()
            dep_tokens = [tok for tok in re.findall(r"[A-Za-z][A-Za-z0-9'-]*", dep_lower) if len(tok) > 3]
            if any(tok in lower for tok in dep_tokens):
                matched.append(dep)
        if not matched and dependency_names:
            matched.extend(dependency_names[:3])
        graph.append({
            "workflow": label,
            "dependencies": _dedupe(matched)[:5],
            "relationship": "depends_on",
        })
    return graph


def _build_integration_map(workflow_labels: list[str], dependencies: list[dict], domain: str) -> list[dict]:
    dependency_index = {}
    for dep in dependencies or []:
        if not isinstance(dep, dict):
            continue
        name = _normalize_text(dep.get("dependency") or "", 120)
        if name:
            dependency_index[name.lower()] = dep

    graph = _build_dependency_graph(workflow_labels, dependencies, domain)
    integrations = []
    seen = set()
    for edge in graph:
        workflow = _normalize_text(edge.get("workflow") or "", 120)
        for dependency in edge.get("dependencies") or []:
            dependency_name = _normalize_text(dependency, 120)
            if not workflow or not dependency_name:
                continue
            key = f"{workflow.lower()}::{dependency_name.lower()}"
            if key in seen:
                continue
            seen.add(key)
            dep_meta = dependency_index.get(dependency_name.lower(), {})
            integrations.append({
                "workflow": workflow,
                "dependency": dependency_name,
                "relationship": "depends_on",
                "criticality": dep_meta.get("criticality", "Medium"),
                "failure_modes": dep_meta.get("failure_modes", []),
            })
    return integrations


def _extract_risks(text: str, dependencies: list[dict]) -> list[dict]:
    domain = _infer_domain(text)
    profile = _domain_profile(domain)
    lower = (text or "").lower()
    risks = []
    seen = set()

    for area, risk_type, severity, cues in profile["risks"]:
        if _contains_any(lower, cues):
            record = {"risk_area": area, "risk_type": risk_type, "severity": severity}
            key = f"{area}:{risk_type}".lower()
            if key not in seen:
                seen.add(key)
                risks.append(record)

    if _contains_any(lower, ("payment", "duplicate transaction", "double charge", "authorization failure")):
        record = {"risk_area": "Payment Processing", "risk_type": "Duplicate Transaction", "severity": "Critical"}
        key = f"{record['risk_area']}:{record['risk_type']}".lower()
        if key not in seen:
            seen.add(key)
            risks.append(record)
    if _contains_any(lower, ("availability", "stale availability", "inventory", "seat", "capacity", "search latency")):
        record = {"risk_area": "Availability Management", "risk_type": "Stale Availability", "severity": "High"}
        key = f"{record['risk_area']}:{record['risk_type']}".lower()
        if key not in seen:
            seen.add(key)
            risks.append(record)
    if _contains_any(lower, ("concurrency", "parallel", "race", "overbooking", "double booking")):
        record = {"risk_area": "Concurrency Control", "risk_type": "Race Condition", "severity": "Critical"}
        key = f"{record['risk_area']}:{record['risk_type']}".lower()
        if key not in seen:
            seen.add(key)
            risks.append(record)
    if _contains_any(lower, ("logout", "session", "auth")):
        record = {"risk_area": "Session Management", "risk_type": "Session Drift", "severity": "Medium"}
        key = f"{record['risk_area']}:{record['risk_type']}".lower()
        if key not in seen:
            seen.add(key)
            risks.append(record)
    for dep in dependencies:
        dependency = dep.get("dependency")
        if dependency == "External Airline API":
            record = {"risk_area": "Integration Reliability", "risk_type": "Airline API Outage", "severity": "High"}
        elif dependency == "Payment Gateway":
            record = {"risk_area": "Integration Reliability", "risk_type": "Payment Gateway Timeout", "severity": "Critical"}
        elif dependency == "Kafka Event Bus":
            record = {"risk_area": "Event Processing", "risk_type": "Event Lag or Duplication", "severity": "High"}
        elif dependency == "Elasticsearch":
            record = {"risk_area": "Search Accuracy", "risk_type": "Stale Search Index", "severity": "High"}
        elif dependency == "Redis Cache":
            record = {"risk_area": "Caching", "risk_type": "Stale Cache Data", "severity": "Medium"}
        elif dependency == "Logistics API":
            record = {"risk_area": "Delivery Tracking", "risk_type": "Carrier Status Lag", "severity": "High"}
        else:
            continue
        key = f"{record['risk_area']}:{record['risk_type']}".lower()
        if key not in seen:
            seen.add(key)
            risks.append(record)
    return risks


def _build_entity_registry(text: str, workflow_labels: list[str], dependencies: list[dict], transitions: list[dict], risks: list[dict]) -> list[dict]:
    domain = _infer_domain(text)
    buckets = defaultdict(lambda: {"aliases": set(), "type": "Business Entity"})

    candidates = []
    candidates.extend(workflow_labels)
    candidates.extend([dep.get("dependency") for dep in dependencies if dep.get("dependency")])
    candidates.extend([item.get("risk_area") for item in risks if item.get("risk_area")])
    candidates.extend([item.get("event") for item in transitions if item.get("event")])
    candidates.extend(_extract_workflow_steps(text))

    for candidate in candidates:
        canonical = _canonical_entity_label(candidate, domain=domain)
        if not canonical:
            continue
        bucket = buckets[canonical]
        bucket["aliases"].add(_normalize_text(candidate, 120))
        bucket["type"] = _entity_type_for_label(canonical, text)

    registry = []
    for canonical, payload in buckets.items():
        aliases = [alias for alias in _dedupe(payload["aliases"]) if alias.lower() != canonical.lower()]
        registry.append({
            "entity": canonical,
            "aliases": aliases,
            "type": payload["type"],
        })
    return registry


def _infer_nfr_categories(text: str) -> list[str]:
    lower = (text or "").lower()
    categories = []
    if _contains_any(lower, ("performance", "latency", "throughput", "load", "stress", "peak")):
        categories.append("Performance")
    if _contains_any(lower, ("security", "privacy", "auth", "authorization", "authentication", "otp", "pii")):
        categories.append("Security")
    if _contains_any(lower, ("availability", "reliability", "resilience", "uptime", "failover")):
        categories.append("Reliability")
    if _contains_any(lower, ("scalability", "concurrency", "parallel", "capacity")):
        categories.append("Scalability")
    if _contains_any(lower, ("observability", "monitoring", "logging", "tracing")):
        categories.append("Observability")
    if _contains_any(lower, ("accessibility", "wcag", "keyboard", "screen reader")):
        categories.append("Accessibility")
    return _dedupe(categories)


def _extract_workflow_labels(text: str, domain: str) -> list[str]:
    profile = _domain_profile(domain)
    lower = (text or "").lower()
    labels = []

    for item in profile["workflows"]:
        label = item["label"]
        if _contains_any(lower, item["cues"]):
            labels.append(label)

    for line in _extract_lines(text):
        clean = _clean_candidate(line, 120)
        if not clean or _is_feature_meta_phrase(clean) or _is_ambiguity_phrase(clean):
            continue
        if _contains_any(clean, ("search", "booking", "checkout", "payment", "cart", "tracking", "refund", "login", "logout", "recommend", "personal")):
            labels.append(_canonical_entity_label(clean, domain=domain))
    return _select_workflow_labels(labels, domain)


def _extract_workflow_steps(text: str) -> list[str]:
    ordered = []
    for line in _extract_lines(text):
        clean = _clean_candidate(line, 160)
        if not clean or len(clean.split()) > 12:
            continue
        if _is_feature_meta_phrase(clean) or _is_ambiguity_phrase(clean) or clean.lower() in {"given", "when", "then", "the", "system"}:
            continue
        if not _is_executable_step(clean):
            continue
        ordered.append(clean)
    return _dedupe(ordered)


def _extract_state_transitions(text: str) -> list[dict]:
    domain = _infer_domain(text)
    transitions = []
    patterns = [
        re.compile(r"(?P<event>[^-\n]{3,80})\s*->\s*(?P<to>[^.\n]{3,80})"),
        re.compile(r"(?i)(?P<event>payment success|payment approved|logout|session cleared|booking confirmed)\s*(?:-|:|->)\s*(?P<to>[^.\n]{3,80})"),
    ]
    for line in _extract_lines(text):
        if line.count("->") > 1:
            continue
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            event = _normalize_text(match.group("event"), 80)
            to_state = _normalize_text(match.group("to"), 80)
            if not event or not to_state or "->" in to_state or not _is_valid_state_label(to_state, domain):
                continue
            event_lower = event.lower()
            from_state = "Pending"
            if "logout" in event_lower:
                from_state = "Authenticated"
                to_state = "Session Cleared"
            elif "payment" in event_lower:
                from_state = "Pending"
                if "success" in event_lower or "approved" in event_lower:
                    to_state = "Booking Confirmed"
            elif "booking" in event_lower and "confirmed" in to_state.lower():
                from_state = "Pending"
            transitions.append({"event": event, "from": from_state, "to": to_state})
            break
    return transitions


def build_requirement_intelligence(
    raw_text: str,
    summary: str = "",
    description: str = "",
    acceptance_criteria: list[str] | None = None,
    modules: list[str] | None = None,
    platform: str = "",
) -> dict:
    source_text = "\n".join(part for part in [summary, description, raw_text] if part)
    domain = _infer_domain(source_text)
    acs = _extract_acceptance_criteria(source_text, provided=acceptance_criteria)
    lines = _extract_lines(source_text)
    workflow_labels = _dedupe([_canonical_entity_label(item, domain=domain) for item in (modules or []) if _clean_candidate(item)])
    if not workflow_labels:
        workflow_labels.extend(_extract_workflow_labels(source_text, domain))
    workflow_labels = _dedupe(workflow_labels)
    if not workflow_labels:
        workflow_labels = [_domain_profile(domain)["workflows"][0]["label"]]

    dependencies = _extract_dependencies(source_text)
    dependency_graph = _build_dependency_graph(workflow_labels, dependencies, domain)
    integration_map = _build_integration_map(workflow_labels, dependencies, domain)
    risks = _extract_risks(source_text, dependencies)
    transitions = _extract_state_transitions(source_text)
    workflow_graphs = _build_workflow_graphs(source_text, workflow_labels)
    entity_registry = _build_entity_registry(source_text, workflow_labels, dependencies, transitions, risks)
    nfr_categories = _infer_nfr_categories(source_text)
    architecture = _infer_architecture(source_text, dependencies)
    api_styles = _infer_api_styles(source_text)
    module_acceptance_criteria = _group_acceptance_criteria_by_workflow(source_text, workflow_labels, acs)
    ambiguity_terms = _extract_ambiguity_terms(source_text)
    state_label = _domain_profile(domain).get("states_label", "state_sequence")
    state_sequence = _domain_profile(domain).get("states", [])
    if not state_sequence:
        state_sequence = ["Initiated", "In Progress", "Completed"]
    risk_level = "Low"
    if any(r.get("severity") == "Critical" for r in risks):
        risk_level = "Critical"
    elif any(r.get("severity") == "High" for r in risks):
        risk_level = "High"
    elif dependencies:
        risk_level = "Medium"

    return {
        "acceptance_criteria": acs,
        "acceptance_criteria_by_module": module_acceptance_criteria,
        "workflows_detected": workflow_labels,
        "workflow_graphs": workflow_graphs,
        "state_transitions": transitions,
        "state_model": state_sequence,
        state_label: state_sequence,
        "dependencies": dependencies,
        "dependency_intelligence": dependencies,
        "dependency_graph": dependency_graph,
        "integration_map": integration_map,
        "risks": risks,
        "risk_intelligence": risks,
        "ambiguity_terms": ambiguity_terms,
        "ambiguity_analysis": [
            {"term": term, "classification": "Ambiguity Descriptor"}
            for term in ambiguity_terms
        ],
        "entity_registry": entity_registry,
        "metadata": {
            "domain": domain,
            "architecture": architecture,
            "api_style": api_styles,
            "workflows_detected": len(workflow_graphs) if workflow_graphs else len(workflow_labels),
            "dependency_count": len(dependencies),
            "dependency_graph_count": len(dependency_graph),
            "integration_map_count": len(integration_map),
            "risk_level": risk_level,
            "nfr_categories": nfr_categories,
            "extracted_entities": len(entity_registry),
            "platform": platform or "unknown",
            "ambiguity_terms": ambiguity_terms,
        },
        "workflow_count": len(workflow_graphs) if workflow_graphs else len(workflow_labels),
        "dependency_count": len(dependencies),
        "risk_level": risk_level,
    }
