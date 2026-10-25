import json

realistic_cap = {
    "id": "CAP-019",
    "name": "FR-C-002: Product Catalogue • Customer can browse an Amerey product catalogue filtered by the chemist's assigned product categories AND the chemist's state",
    "description": "• Product categories: Wheelchairs, Walkers, Walking Sticks, Crutches, Commode Chairs — displayed as filter tabs\n• Product card must show: image, name, brand, key specifications, price (MRP), and availability\n• Customers can filter by: Category, Price Range, Usage Type, User Weight Capacity\n• Search by product name, model number, or use case"
}

# Simulate 20 capabilities at this size
caps = [realistic_cap] * 20

state = {
    "capabilities": caps,
    "unified_context_contract": {"project": "AmereyConnect Healthcare platform"},
    "target_tech_stack": {"backend": "Python"},
    "risk_advisory_report": {"advisories": [{"constraint": "Must use HTTPS", "binding": True}]}
}

# 1. architect_node
ucc = state.get('unified_context_contract', {})
risk_report = state.get("risk_advisory_report", {})
scoped_input = {
    "project": ucc.get("project", ""),
    "core_roles": state.get("capabilities", [])[:3],
    "tech_stack": state.get("target_tech_stack", {}),
    "binding_constraints": [a.get("constraint") for a in risk_report.get("advisories", []) if isinstance(a, dict) and a.get("binding")][:5]
}
prompt1 = f"UNIFIED CONTEXT CONTRACT:\n{json.dumps(scoped_input, indent=2)}"
print(f"[TOKEN-BUDGET] architect_node prompt length: ~{len(prompt1)//4} tokens")

# 2. service_architecture_mesh_node
API_KEYWORDS = ["api","endpoint","request","response","auth","login","search","booking","payment","qr","order","checkout"]
api_caps = [c for c in caps if isinstance(c, dict) and any(kw in (str(c.get("name","")) + " " + str(c.get("description",""))).lower() for kw in API_KEYWORDS)][:8]
if not api_caps: api_caps = caps[:8]
prompt2 = f"CAPABILITIES:\n{json.dumps(api_caps, indent=2)}"
print(f"[TOKEN-BUDGET] service_mesh_node prompt length: ~{len(prompt2)//4} tokens (Filtered to {len(api_caps)} caps)")

# 3. db_architect_node
DB_KEYWORDS = ["user","order","product","payment","profile","commission","qr","chemist","store","session"]
db_caps = [c for c in caps if isinstance(c, dict) and any(kw in (str(c.get("name","")) + " " + str(c.get("description",""))).lower() for kw in DB_KEYWORDS)][:6]
if not db_caps: db_caps = caps[:6]
prompt3 = f"CAPABILITIES:\n{json.dumps(db_caps, indent=2)}"
print(f"[TOKEN-BUDGET] db_architect_node prompt length: ~{len(prompt3)//4} tokens (Filtered to {len(db_caps)} caps)")
