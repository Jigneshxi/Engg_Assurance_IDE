import re
import hashlib
import json
import os

def classify_section(name: str) -> str:
    name_lower = name.lower()
    if name_lower.startswith("fr-") or "functional" in name_lower:
        return "functional_requirement"
    if name_lower.startswith("us-") or "user story" in name_lower:
        return "user_story"
    if any(k in name_lower for k in ["nfr", "non-functional", "performance", "security", "compliance", "appendix"]):
        return "nfr"
    if any(k in name_lower for k in ["architecture", "database", "system design", "infrastructure", "topology"]):
        return "architecture"
    if any(k in name_lower for k in ["goal", "objective", "kpi", "metric", "vision", "purpose"]):
        return "business_goal"
    if any(k in name_lower for k in ["test", "qa", "validation"]):
        return "testing"
    if any(k in name_lower for k in ["persona", "user role", "actor"]):
        return "persona"
    
    return "functional_requirement"

def discover_prd_sections(raw_text: str) -> list[dict]:
    import logging
    logger = logging.getLogger(__name__)
    
    # Pre-process raw_text to merge hard line breaks inside sentences (e.g. from PDF to DOCX conversions)
    lines = raw_text.split('\n')
    merged_lines = []
    current_line = ""
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            if current_line:
                merged_lines.append(current_line)
                current_line = ""
            merged_lines.append("")
        elif re.search(r'[-*•]$', line_stripped) or re.match(r'^[-*•]', line_stripped) or re.search(r'[:.!?]$', line_stripped):
            if current_line:
                merged_lines.append(current_line + " " + line_stripped)
                current_line = ""
            else:
                merged_lines.append(line_stripped)
        else:
            if current_line:
                current_line += " " + line_stripped
            else:
                current_line = line_stripped
    if current_line:
        merged_lines.append(current_line)
    
    raw_text = "\n".join(merged_lines)
    raw_text = re.sub(r"([a-zA-Z])\s*\n\s*([a-z])", r"\1 \2", raw_text)

    # Use robust regex boundaries
    SECTION_PATTERNS = [
        r"^\d+\.\d+\s+.+$",      # 6.1 Customer Module
        r"^\d+\.\d+\.\d+\s+.+$", # nested sections
        r"^FR-[A-Z0-9]+-\d+.*$", # FR-C-001
        r"^US-[A-Z0-9]+-\d+.*$", # US-C-001
        r"^\d+\.\s+(.+)$",       # 1. Executive Summary
        r"^#+\s+(.+)$",          # # Header
    ]
    
    combined_pattern = "|".join([f"({p})" for p in SECTION_PATTERNS])
    pattern = re.compile(combined_pattern, re.IGNORECASE | re.MULTILINE)
    
    matches = list(pattern.finditer(raw_text))
    
    sections = []
    if not matches:
        return [{"id": "SEC-001", "name": "Global PRD", "type": "functional_requirement", "start": 0, "end": len(raw_text), "text": raw_text}]
        
    for i, match in enumerate(matches):
        start_idx = match.end()
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(raw_text)
        
        name = match.group(0).strip()
        section_text = raw_text[start_idx:end_idx].strip()
        
        if len(section_text) < 5: continue # Skip empty or negligible sections
        
        sections.append({
            "id": f"SEC-{i+1:03d}",
            "name": name,
            "type": classify_section(name),
            "start": match.start(),
            "end": end_idx,
            "text": section_text
        })
        
    logger.error("=== DISCOVERED SECTIONS ===")
    for idx, sec in enumerate(sections):
        logger.error(f"[{idx}] {sec['name']} LEN={len(sec['text'])}")
        
    return sections

def extract_capability_fields(section_text: str) -> dict:
    """Deterministically extract features, workflows, and entities using regex before LLM gap-fill."""
    features = []
    workflows = []
    entities = []
    
    # Simple list extraction heuristic under specific subheadings
    lines = section_text.split("\n")
    current_mode = None
    
    for line in lines:
        line_lower = line.lower().strip()
        if not line_lower: continue
        
        if "feature" in line_lower and ":" in line_lower: current_mode = "feature"; continue
        if "workflow" in line_lower or "steps" in line_lower: current_mode = "workflow"; continue
        if "entity" in line_lower or "data" in line_lower: current_mode = "entity"; continue
        
        # If line is a bullet point or numbered item
        is_item = re.match(r"^[-*•]\s+(.+)$", line.strip()) or re.match(r"^\d+\.\s+(.+)$", line.strip())
        if is_item and current_mode:
            content = is_item.group(1).strip()
            if current_mode == "feature": features.append(content)
            elif current_mode == "workflow": workflows.append(content)
            elif current_mode == "entity": entities.append(content)
            
    return {"features": features, "workflows": workflows, "entities": entities}

def extract_global_metadata(raw_text: str) -> dict:
    """Extract project, business goals deterministically."""
    lines = raw_text.split("\n")
    project = "Untitled Project"
    for line in lines[:20]:
        if re.match(r"^(?:#\s+)?([A-Za-z0-9\s]+(?:PRD|Platform|System|Application|App|Platform|Engine)).*", line, re.IGNORECASE):
            project = line.replace("#", "").strip()
            break
            
    # Simple extraction for goals
    goals = []
    in_goals = False
    for line in lines:
        line_lower = line.lower().strip()
        if "business goal" in line_lower or "objective" in line_lower:
            in_goals = True
            continue
        if in_goals and not line_lower:
            in_goals = False
        if in_goals and (line.strip().startswith("-") or line.strip().startswith("*")):
            goals.append(line.replace("-", "").replace("*", "").strip())
            
    return {
        "project": project,
        "business_goals": goals,
        "personas": [] # Usually requires LLM to extract cleanly if not bulleted
    }

def extract_compliance_flags(raw_text: str) -> list[str]:
    """Extract compliance flags like HIPAA, GDPR, etc."""
    flags = []
    text_lower = raw_text.lower()
    if "hipaa" in text_lower: flags.append("HIPAA")
    if "gdpr" in text_lower: flags.append("GDPR")
    if "pci" in text_lower or "pci-dss" in text_lower: flags.append("PCI-DSS")
    if "soc2" in text_lower or "soc 2" in text_lower: flags.append("SOC2")
    if "iso27001" in text_lower or "iso 27001" in text_lower: flags.append("ISO27001")
    if "ferpa" in text_lower: flags.append("FERPA")
    return flags

def get_cache_dir(cache_type: str) -> str:
    path = os.path.join(".cache", cache_type)
    os.makedirs(path, exist_ok=True)
    return path

def check_cache(cache_type: str, cache_key: str) -> dict | None:
    path = os.path.join(get_cache_dir(cache_type), f"{cache_key}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

def write_cache(cache_type: str, cache_key: str, data: dict):
    path = os.path.join(get_cache_dir(cache_type), f"{cache_key}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def hash_content(content: str) -> str:
    return hashlib.sha256(content.encode('utf-8')).hexdigest()
