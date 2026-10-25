import re

def main():
    path = "backend/agents/nodes/intelligence.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 1. Update Governance Node
    gov_prompt_target = """OUTPUT: JSON with keys: "data_classification", "risk_tier", "compliance_flags", "threat_model" (object with "vector" and "mitigation"), "reasoning\""""
    gov_prompt_replacement = """OUTPUT: JSON with exactly these keys: "data_classification", "compliance_flags", "threat_model" (object with "vector" and "mitigation")\""""
    content = content.replace(gov_prompt_target, gov_prompt_replacement)
    
    # 2. Update Security Intel Node
    sec_prompt_target = """OUTPUT: JSON with these EXACT keys:
- "data_classification": "RESTRICTED / PII" or "Internal" or "Public"
- "risk_tier": "CRITICAL", "HIGH", "MEDIUM", or "LOW"  
- "compliance_flags": array of specific compliance requirement strings
- "threat_model": object with "vector" (string: the primary threat) and "mitigation" (string: specific countermeasure)
- "threats": array of objects with "name", "severity" ("Critical"/"High"/"Medium"/"Low"), "mitigation"
- "overall_security_score": integer 0-100
- "executive_summary": string"""
    sec_prompt_replacement = """OUTPUT: JSON with these EXACT keys:
- "data_classification": "RESTRICTED / PII" or "Internal" or "Public"
- "compliance_flags": array of specific compliance requirement strings
- "threat_model": object with "vector" (string: the primary threat) and "mitigation" (string: specific countermeasure)"""
    content = content.replace(sec_prompt_target, sec_prompt_replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
if __name__ == "__main__":
    main()
