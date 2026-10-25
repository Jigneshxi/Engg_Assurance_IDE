from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class Entity(BaseModel):
    entity: str
    entity_type: Optional[str] = None
    criticality: Optional[str] = None
    module: Optional[str] = None

class Module(BaseModel):
    module_id: str
    name: str
    features: List[str] = Field(default_factory=list)
    entities: List[Entity] = Field(default_factory=list)
    workflows: List[str] = Field(default_factory=list)
    acceptance_criteria: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    nfrs: List[str] = Field(default_factory=list)

class RequirementGraph(BaseModel):
    graph_version: int = 1
    source_hash: Optional[str] = None
    parent_version: Optional[int] = None
    project: str = "Unknown Project"
    modules: List[Module] = Field(default_factory=list)

class RequirementGraphAdapter:
    def __init__(self, graph_data: dict):
        # We accept a dict and try to parse it, or fallback to empty
        if "requirement_graph" in graph_data:
            graph_data = graph_data["requirement_graph"]
            
        try:
            self.graph = RequirementGraph(**graph_data)
        except Exception:
            self.graph = RequirementGraph()

    def get_modules(self) -> List[Module]:
        return self.graph.modules

    def get_workflows(self) -> List[str]:
        workflows = []
        for m in self.graph.modules:
            workflows.extend(m.workflows)
        return workflows

    def get_entities(self) -> List[Entity]:
        entities = []
        for m in self.graph.modules:
            entities.extend(m.entities)
        return entities

    def get_risks(self) -> List[str]:
        risks = []
        for m in self.graph.modules:
            risks.extend(m.risks)
        return risks
        return risks
