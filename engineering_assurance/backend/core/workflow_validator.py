import re
from typing import Any


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", text).strip()


def _normalize_module_name(value: Any) -> str:
    text = _normalize_text(value).upper().replace("-", "_").replace(" ", "_")
    return re.sub(r"[^A-Z0-9_]+", "", text)


def _pretty_module_name(module_name: str) -> str:
    return " ".join(part.capitalize() for part in module_name.split("_") if part) or "Workflow"


MODULE_KEYWORDS = {
    "AUTHENTICATION": {
        "authentication", "auth", "login", "signin", "sign in", "sign-in",
        "mfa", "otp", "one time password", "one-time password", "jwt",
        "session", "password reset", "forgot password", "token", "sso",
        "single sign on", "device fingerprint", "credential",
    },
    "SEARCH": {
        "search", "browse", "filter", "sort", "autocomplete", "query",
        "catalog search", "result ranking", "facet", "discovery",
    },
    "CART": {"cart", "basket", "add to cart", "remove from cart", "wishlist"},
    "CHECKOUT": {
        "checkout", "address", "shipping address", "place order", "order review",
        "shipping method", "billing address", "payment handoff",
    },
    "PAYMENT": {
        "payment", "upi", "card", "wallet", "netbanking", "transaction",
        "refund", "charge", "gateway", "authorization", "capture",
    },
    "ORDERS": {
        "order", "orders", "order history", "order tracking", "cancel order",
        "invoice", "fulfillment", "shipment status",
    },
    "RETURNS": {
        "return", "returns", "refund policy", "replacement", "exchange",
        "rma", "reverse logistics", "pickup", "return initiation",
    },
    "SELLER_MANAGEMENT": {
        "seller", "merchant", "catalog upload", "listing", "inventory",
        "onboarding", "approval", "vendor", "storefront management",
    },
    "NOTIFICATIONS": {
        "notification", "notifications", "email", "sms", "push", "alert",
        "reminder", "broadcast",
    },
    "RECOMMENDATIONS": {
        "recommendation", "recommendations", "personalization", "recommend",
        "similar items", "trending", "suggestion", "discovery feed",
    },
    "ADMIN": {
        "admin", "dashboard", "moderation", "governance", "backoffice",
        "back office", "admin console", "ops console",
    },
    "PROFILE": {
        "profile", "account", "address book", "preferences", "saved addresses",
        "user settings", "my account",
    },
    "SHIPPING": {
        "shipping", "delivery", "shipment", "logistics", "courier",
        "tracking", "dispatch", "eta",
    },
    "INVENTORY": {
        "inventory", "stock", "sku", "warehouse", "availability", "stock sync",
    },
}


MODULE_FALLBACK_STEPS = {
    "AUTHENTICATION": [
        "Given valid credentials are available, When the user signs in with email, Then the system creates a session and returns an authenticated state.",
        "Given MFA or OTP is enabled, When the user completes verification, Then access is granted only after the second factor succeeds.",
        "Given a session token is active, When the token expires or is revoked, Then the user is prompted to re-authenticate.",
        "Given the user requests a password reset, When the reset flow completes, Then the new credentials become active and the old session is invalidated.",
    ],
    "SEARCH": [
        "Given searchable catalog data is indexed, When the user submits a keyword query, Then relevant results are returned with ranking and facets.",
        "Given filters or sorting are applied, When the user refines the query, Then the result set updates without mixing unrelated records.",
        "Given no exact match exists, When the search completes, Then the system returns safe fallback suggestions or zero results with guidance.",
        "Given the query is malformed, When validation fails, Then the system rejects it with a clear recovery path.",
    ],
    "CART": [
        "Given a product is available, When the user adds it to the cart, Then the cart quantity and totals are updated consistently.",
        "Given an item is already in the cart, When the user updates quantity or removes it, Then the cart state remains synchronized.",
        "Given inventory changes during cart review, When availability drops, Then the cart reflects the stock constraint before checkout.",
        "Given the session persists, When the user returns later, Then the cart state is restored safely.",
    ],
    "CHECKOUT": [
        "Given a cart is ready, When the user enters shipping and billing details, Then the checkout state advances in order.",
        "Given validation fails on address or payment handoff, When the user retries, Then the system preserves the rest of the checkout context.",
        "Given the order review step is complete, When the user confirms the purchase, Then the order is created exactly once.",
        "Given checkout is interrupted, When the user resumes, Then the last valid step is restored without duplicate submission.",
    ],
    "PAYMENT": [
        "Given a payment method is selected, When the user authorizes the transaction, Then the gateway response is captured and stored.",
        "Given payment authorization fails, When the user retries, Then duplicate capture is prevented and the user sees the correct failure state.",
        "Given a refund is requested, When the refund flow completes, Then the transaction status updates consistently.",
        "Given the payment provider times out, When the system recovers, Then reconciliation preserves the final transaction outcome.",
    ],
    "ORDERS": [
        "Given an order is placed, When fulfillment starts, Then the order status transitions in sequence without skipping states.",
        "Given the user views order history, When the record loads, Then the timeline reflects the actual lifecycle and shipment handoff.",
        "Given cancellation is requested, When business rules permit it, Then the order transitions to the correct terminal state.",
        "Given invoice data is generated, When the order completes, Then the order artifacts remain traceable to the source purchase.",
    ],
    "RETURNS": [
        "Given an eligible order exists, When the user initiates a return, Then the return workflow opens with the correct policy checks.",
        "Given the return is approved, When pickup or label generation completes, Then the refund state is linked to the return record.",
        "Given return eligibility fails, When the user retries, Then the rejection reason is explicit and actionable.",
        "Given an exchange is selected, When the flow completes, Then the replacement and refund steps remain consistent.",
    ],
    "SELLER_MANAGEMENT": [
        "Given seller onboarding data is complete, When the seller submits the profile, Then approval and activation rules are applied.",
        "Given a catalog listing changes, When inventory or pricing updates arrive, Then the seller record stays synchronized.",
        "Given a seller request fails validation, When the workflow retries, Then the rejection reason is recorded clearly.",
        "Given the seller is approved, When publishing completes, Then the storefront reflects the new listing state.",
    ],
    "NOTIFICATIONS": [
        "Given an event occurs, When the notification rule matches, Then the user receives the correct message on the selected channel.",
        "Given delivery fails, When the system retries, Then the retry policy and fallback channel are preserved.",
        "Given the user changes preferences, When future events occur, Then only the allowed channels are used.",
        "Given a notification is scheduled, When the time arrives, Then the alert is emitted exactly once.",
    ],
    "RECOMMENDATIONS": [
        "Given user behavior signals are available, When personalization runs, Then recommendations are aligned to the active module context.",
        "Given the recommendation model returns low confidence, When the system falls back, Then safe defaults are shown instead of unrelated content.",
        "Given the user refreshes the feed, When the model recalculates, Then the returned items stay consistent with the domain signals.",
        "Given the engine is re-ranked, When the inputs change, Then the output reflects the new preference state.",
    ],
    "ADMIN": [
        "Given an admin action is authorized, When the workflow executes, Then the privileged operation is audited and traceable.",
        "Given moderation rules are applied, When content is reviewed, Then the decision outcome is recorded consistently.",
        "Given a dashboard widget refreshes, When the data changes, Then the admin state updates without cross-module contamination.",
        "Given access is denied, When the user lacks privileges, Then the workflow terminates with the correct guardrail response.",
    ],
    "PROFILE": [
        "Given a user profile exists, When the account is edited, Then the profile state persists accurately.",
        "Given preferences are updated, When the change is saved, Then future interactions honor the new settings.",
        "Given an address is added or removed, When the save completes, Then the account details stay normalized.",
        "Given the profile load fails, When the user retries, Then the original account context is preserved.",
    ],
    "SHIPPING": [
        "Given an order is ready for dispatch, When the shipping workflow starts, Then tracking information is created.",
        "Given a courier update arrives, When the shipment state changes, Then the delivery timeline is updated consistently.",
        "Given ETA recalculates, When the route changes, Then the user sees the revised shipping status.",
        "Given a shipment is delayed, When the exception is reported, Then the fallback communication path is triggered.",
    ],
    "INVENTORY": [
        "Given stock levels are available, When inventory sync runs, Then availability stays aligned with the source system.",
        "Given a SKU changes, When the update is applied, Then downstream workflows see the corrected stock state.",
        "Given inventory is exhausted, When the user attempts to purchase, Then the workflow blocks oversell behavior.",
        "Given a warehouse update arrives, When the sync completes, Then the catalog reflects the new quantity.",
    ],
}


def _module_from_text(text: str) -> str:
    normalized = _normalize_text(text).lower()
    if not normalized:
        return "UNKNOWN"

    best_module = "UNKNOWN"
    best_score = 0
    for module_name, keywords in MODULE_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in normalized)
        if score > best_score:
            best_module = module_name
            best_score = score
    return best_module


def _steps_from_value(workflow_steps: Any) -> list[str]:
    if workflow_steps is None:
        return []
    if isinstance(workflow_steps, str):
        text = _normalize_text(workflow_steps)
        return [text] if text else []
    if not isinstance(workflow_steps, list):
        text = _normalize_text(workflow_steps)
        return [text] if text else []
    normalized = []
    for item in workflow_steps:
        text = _normalize_text(item)
        if text:
            normalized.append(text)
    return normalized


def _fallback_steps_for_module(module_name: str) -> list[str]:
    module = _normalize_module_name(module_name)
    if module in MODULE_FALLBACK_STEPS:
        return list(MODULE_FALLBACK_STEPS[module])
    pretty = _pretty_module_name(module)
    return [
        f"Given {pretty} prerequisites are satisfied, When the user executes the workflow, Then the module-specific state transition is recorded.",
        f"Given validation succeeds for {pretty}, When processing completes, Then the expected outcome is persisted.",
        f"Given an error occurs in {pretty}, When the workflow retries, Then the recovery path is explicit and deterministic.",
    ]


class WorkflowStructuralValidator:
    @staticmethod
    def infer_module(text: str) -> str:
        return _module_from_text(text)

    @staticmethod
    def build_fallback_workflow_entry(
        module_name: str,
        workflow_name: str | None = None,
        source_section: str | None = None,
    ) -> dict:
        module = _normalize_module_name(module_name or workflow_name or "WORKFLOW")
        fallback_steps = _fallback_steps_for_module(module)
        return {
            "workflow": _normalize_text(workflow_name) or _pretty_module_name(module),
            "module": module,
            "source_section": _normalize_text(source_section or "")[:240],
            "steps": list(fallback_steps),
            "acceptance_criteria": list(fallback_steps),
            "validation": {
                "decision": "REPLACED_WITH_FALLBACK",
                "workflow_name": _normalize_text(workflow_name or module),
                "module_name": module,
                "inferred_module": module,
                "reason": f"Fallback generated for module '{module}'.",
            },
        }

    @staticmethod
    def validate_workflow_structure(
        workflow_name: str,
        module_name: str,
        workflow_steps: Any,
        source_section: str = "",
    ) -> dict:
        normalized_workflow = _normalize_text(workflow_name)
        normalized_module = _normalize_module_name(module_name or workflow_name)
        normalized_source = _normalize_text(source_section)
        steps = _steps_from_value(workflow_steps)

        workflow_context = " ".join(part for part in [normalized_workflow, normalized_source] if part)
        inferred_module = _module_from_text(workflow_context)

        accepted_steps: list[str] = []
        rejected_steps: list[str] = []
        matched_keywords: list[str] = []
        mismatch_keywords: list[str] = []

        for step in steps:
            step_module = _module_from_text(step)
            if step_module == "UNKNOWN" or step_module == normalized_module or step_module == inferred_module:
                accepted_steps.append(step)
                for keyword in MODULE_KEYWORDS.get(normalized_module, set()):
                    if keyword in step.lower() and keyword not in matched_keywords:
                        matched_keywords.append(keyword)
            else:
                rejected_steps.append(step)
                for keyword in MODULE_KEYWORDS.get(step_module, set()):
                    if keyword in step.lower() and keyword not in mismatch_keywords:
                        mismatch_keywords.append(keyword)

        workflow_module_mismatch = (
            inferred_module not in {"UNKNOWN", normalized_module}
            and bool(steps)
            and bool(rejected_steps)
        )

        if workflow_module_mismatch or (steps and rejected_steps):
            decision = "REJECTED_MODULE_MISMATCH"
            rejected_module = _module_from_text(rejected_steps[0]) if rejected_steps else inferred_module
            target_module = normalized_module if normalized_module != "UNKNOWN" else inferred_module
            reason = (
                f"Workflow '{normalized_workflow or normalized_module}' contains steps aligned to "
                f"{_pretty_module_name(rejected_module)} rather than {_pretty_module_name(target_module)}."
            )
        else:
            decision = "ACCEPTED"
            reason = f"Workflow '{normalized_workflow or normalized_module}' is structurally aligned with {_pretty_module_name(normalized_module)}."

        normalized_steps = accepted_steps if accepted_steps else _fallback_steps_for_module(normalized_module)
        if not accepted_steps and not rejected_steps and steps:
            accepted_steps = list(steps)

        return {
            "decision": decision,
            "workflow_name": normalized_workflow or _pretty_module_name(normalized_module),
            "module_name": normalized_module,
            "source_section": normalized_source[:500],
            "workflow_steps": steps,
            "normalized_steps": normalized_steps,
            "accepted_steps": accepted_steps if decision == "ACCEPTED" else [],
            "rejected_steps": rejected_steps,
            "matched_keywords": matched_keywords,
            "mismatch_keywords": mismatch_keywords,
            "inferred_module": inferred_module,
            "reason": reason,
        }

    @staticmethod
    def audit_workflow_entries(workflow_entries: Any, source_section: str = "") -> tuple[list[dict], dict]:
        entries = workflow_entries if isinstance(workflow_entries, list) else []
        validated_entries: list[dict] = []
        audit = {
            "decision": "ACCEPTED",
            "total_workflows": 0,
            "accepted_workflows": 0,
            "rejected_workflows": 0,
            "rejected_modules": [],
            "details": [],
        }

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            workflow_name = _normalize_text(entry.get("workflow") or entry.get("title") or entry.get("module"))
            module_name = _normalize_module_name(entry.get("module") or workflow_name)
            steps = entry.get("steps") or entry.get("acceptance_criteria") or entry.get("workflow_steps") or []
            validation = WorkflowStructuralValidator.validate_workflow_structure(
                workflow_name=workflow_name,
                module_name=module_name,
                workflow_steps=steps,
                source_section=source_section,
            )
            audit["total_workflows"] += 1
            audit["details"].append(validation)

            if validation["decision"] == "ACCEPTED":
                normalized_entry = dict(entry)
                normalized_entry["workflow"] = normalized_entry.get("workflow") or workflow_name or _pretty_module_name(module_name)
                normalized_entry["module"] = module_name
                normalized_entry["steps"] = validation["normalized_steps"]
                normalized_entry["acceptance_criteria"] = validation["normalized_steps"]
                normalized_entry["validation"] = validation
                validated_entries.append(normalized_entry)
                audit["accepted_workflows"] += 1
            else:
                fallback_entry = WorkflowStructuralValidator.build_fallback_workflow_entry(
                    module_name=module_name,
                    workflow_name=workflow_name,
                    source_section=source_section,
                )
                merged_entry = dict(entry)
                merged_entry.update({
                    "workflow": fallback_entry["workflow"],
                    "module": fallback_entry["module"],
                    "steps": fallback_entry["steps"],
                    "acceptance_criteria": fallback_entry["acceptance_criteria"],
                    "validation": validation,
                })
                validated_entries.append(merged_entry)
                audit["rejected_workflows"] += 1
                audit["rejected_modules"].append(module_name)
                audit["decision"] = "REJECTED_MODULE_MISMATCH"

        audit["rejected_modules"] = list(dict.fromkeys(audit["rejected_modules"]))
        return validated_entries, audit
