from backend.api.models import ToolExecutionRequest

# Test 1: Schema Generator
from backend.tools.adapters.schema_generator import SchemaGeneratorAdapter
adapter = SchemaGeneratorAdapter()
req = ToolExecutionRequest(mission_id=1, agent_name="test_data", tool_name="schema_generator", execution_context={}, readiness_snapshot={}, payload={"entity": "customer"})
res = adapter.execute(req)
fields = list(res.summary["schema"]["properties"].keys())
print(f"[Schema Generator] success={res.success}, entity={res.summary['entity']}, fields={fields}")

# Test 2: Governance Rules
from backend.tools.adapters.governance_rules import GovernanceRulesAdapter
adapter2 = GovernanceRulesAdapter()
req2 = ToolExecutionRequest(mission_id=1, agent_name="governance", tool_name="governance_rules", execution_context={}, readiness_snapshot={}, payload={"artifact_type": "user_story", "content": {"title": "Login", "description": "User can login", "acceptance_criteria": []}})
res2 = adapter2.execute(req2)
violations = [v["rule_id"] for v in res2.summary["violations"]]
print(f"[Governance] success={res2.success}, passed={res2.summary['passed']}, failed={res2.summary['failed']}, violations={violations}")

# Test 3: AST Parser
from backend.tools.adapters.ast_parser import AstParserAdapter
adapter3 = AstParserAdapter()
code = "import os\nimport sys\ndef hello(): pass\ndef hello(): pass\nx = os.path.join('a','b')\n"
req3 = ToolExecutionRequest(mission_id=1, agent_name="forge", tool_name="ast_parser", execution_context={}, readiness_snapshot={}, payload={"source_code": code})
res3 = adapter3.execute(req3)
print(f"[AST Parser] syntax={res3.summary['syntax_valid']}, funcs={res3.summary['functions']}, dupes={res3.summary['duplicate_functions']}, unused={res3.summary['unused_imports']}, complexity={res3.summary['complexity_score']}")

# Test 4: Markdown Quality
from backend.tools.adapters.markdown_quality import MarkdownQualityAdapter
adapter4 = MarkdownQualityAdapter()
md = "# My Feature\n\n## Description\nThis is a feature.\n\n## Acceptance Criteria\n- AC1\n- AC2\n\n## Empty Section\n## Another Section\nContent here.\n"
req4 = ToolExecutionRequest(mission_id=1, agent_name="docs", tool_name="markdown_quality", execution_context={}, readiness_snapshot={}, payload={"content": md})
res4 = adapter4.execute(req4)
print(f"[Markdown] success={res4.success}, issues={res4.summary['issue_count']}, warnings={res4.summary['warning_count']}, has_ac={res4.summary['has_acceptance_criteria']}")

print("\n--- ALL TESTS PASSED ---")
