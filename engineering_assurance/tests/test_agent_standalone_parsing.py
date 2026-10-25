from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes.agents import _parse_agent_output, _standalone_topology_id


def test_standalone_topology_ids_are_specialized():
    assert _standalone_topology_id("clarifier") == "Clarifier"
    assert _standalone_topology_id("performance") == "PerformanceExpert"
    assert _standalone_topology_id("unknown_node") == "unknown_node"


def test_standalone_parser_recovers_messy_json():
    content = """
Here is the clarified output:

```json
{
  "clarified_requirements": [
    {
      "id": "REQ-01",
      "clarified_summary": "Myntra-inspired fashion commerce requirements",
      "clarified_description": "Support browse, search, purchase, track, review, and return workflows.",
      "identified_gaps": ["Missing detailed cart and return SLA criteria"],
      "refined_acceptance_criteria": [
        "Users can browse and search fashion products",
        "Users can purchase and track orders",
        "Users can return items through a defined workflow"
      ],
      "testability_score": 91
    }
  ],
  "ambiguity_report": {
    "total_gaps": 1,
    "critical_terms": ["browse", "search", "purchase", "returns"],
    "recommendations": ["Clarify return windows and payment confirmation flows"]
  }
}
```
"""

    parsed = _parse_agent_output(content)

    assert parsed["clarified_requirements"][0]["id"] == "REQ-01"
    assert "returns" in parsed["ambiguity_report"]["critical_terms"]
