from pydantic import BaseModel, Field
from typing import List, Literal, Union, Dict, Any

class ArchitectContract(BaseModel):
    visual_architecture: str = Field(..., description="C4 system context diagram in Mermaid.js syntax")
    bounded_contexts: List[str] = Field(default_factory=list, description="List of bounded contexts identified")

class ServiceMeshContract(BaseModel):
    type: Literal["openapi", "graphql"] = Field(..., description="The type of the API specification")
    spec: Union[Dict[str, Any], str] = Field(..., description="The raw OpenAPI/GraphQL specification")
    event_driven_boundaries: List[str] = Field(default_factory=list, description="Identified event-driven integration points")

class DBArchitectContract(BaseModel):
    type: Literal["mermaid_erd", "sql_ddl"] = Field(..., description="The type of the database schema design")
    content: str = Field(..., description="The raw Mermaid ERD or SQL DDL script")

class EngineeringContract(BaseModel):
    acceptance_criteria: List[str] = Field(..., description="Strict V&V acceptance criteria")
    v_and_v_process: str = Field(default="", description="Verification and validation process description")
    production_readiness_checklist: List[str] = Field(default_factory=list, description="Production readiness checklist")

class ForgeFile(BaseModel):
    path: str = Field(..., description="The absolute path to the file within the repository")
    content: str = Field(..., description="The content of the file")
