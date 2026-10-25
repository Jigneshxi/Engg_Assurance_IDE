"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - API DATA MODELS (Pydantic)
================================================================================
This module defines the structured request/response schemas for the application.
Pydantic ensures that incoming JSON payloads from the React frontend are 
validated and typed before reaching the core logic.
"""

from pydantic import BaseModel, HttpUrl, AnyUrl, Field, model_validator
from typing import Optional, List, Dict, Any
from enum import Enum

class ExecutionMode(str, Enum):
    ANALYSIS = "analysis"
    PLANNING = "planning"
    VALIDATION = "validation"
    FULL_EXECUTION = "full_execution"

class EnvironmentType(str, Enum):
    DEV = "dev"
    QA = "qa"
    STAGE = "stage"
    PROD = "prod"

class AdapterExecutionMode(str, Enum):
    TOOL_ONLY = "TOOL_ONLY"
    TOOL_AUGMENTED = "TOOL_AUGMENTED"

class AdapterCapability(str, Enum):
    SAFE = "safe"
    EXECUTION = "execution"

class TargetType(str, Enum):
    WEB = "web"
    API = "api"
    MOBILE = "mobile"
    REPOSITORY = "repository"
    MICROSERVICE = "microservice"

class ExecutionContext(BaseModel):
    context_version: int = 1
    
    # Validated URLs
    application_url: Optional[HttpUrl] = None
    api_base_url: Optional[HttpUrl] = None
    openapi_url: Optional[HttpUrl] = None
    
    # Safe validation for repositories
    repository_url: Optional[AnyUrl] = None
    docker_image: Optional[str] = None
    
    # Strongly typed enums
    environment: Optional[EnvironmentType] = None
    target_type: TargetType = TargetType.WEB
    
    # Execution Permissions (Strict safeguards)
    allow_active_scanning: bool = False
    allow_load_testing: bool = False
    allow_container_execution: bool = False
    override_production_restrictions: bool = False
    
    # Future-proofing tool selection (Safe mutable default)
    tool_preferences: Dict[str, Dict[str, bool]] = Field(default_factory=dict)
    
    @model_validator(mode="before")
    @classmethod
    def empty_strings_to_none(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, str) and not v.strip() and k.endswith('_url'):
                    data[k] = None
        return data
    
    @model_validator(mode="after")
    def validate_execution_permissions(self):
        if self.environment == EnvironmentType.PROD and not self.override_production_restrictions:
            if self.allow_active_scanning:
                raise ValueError("Active scanning is blocked in PROD.")
            if self.allow_load_testing:
                raise ValueError("Load testing is blocked in PROD.")
        return self

class ConnectionConfig(BaseModel):
    """Encapsulates common credentials and endpoint information for ALM tools."""
    url: str
    email: str
    token: str

class TestConnectionRequest(BaseModel):
    """Payload for verifying connectivity to Jira, ADO, or local mocks."""
    platform: str
    config: ConnectionConfig
    consent: Optional[Dict[str, Any]] = None

class LLMConfig(BaseModel):
    """Configuration for AI providers including keys and model selection."""
    tier: Optional[str] = "primary" # 'primary', 'economy', 'local'
    provider: str # 'Groq' or 'Ollama'
    url: Optional[str] = None      # Base URL (for Ollama or custom endpoints)
    key: Optional[str] = None      # API Key
    model: str    # Model name (e.g., 'llama-3.3-70b-versatile')
    status: Optional[str] = "standby" # 'active', 'standby', 'rotated', 'revoked'

class FetchSource(BaseModel):
    """
    AGGREGATION ATOM
    Represents a single requirement ticket and its source platform. 
    Crucial for multi-source 'Unified Understanding' workflows.
    """
    platform: str
    ticket_id: str
    config: Optional[ConnectionConfig] = None

class FetchRequest(BaseModel):
    """Inbound request to ingest one or more requirement sources."""
    sources: List[FetchSource]
    context: Optional[str] = "" # User-provided manual requirements or instructions

class GenerateRequest(BaseModel):
    """
    KICKOFF PAYLOAD
    Contains all context, sources, and active LLM configuration needed 
    to trigger a full Agentic Test Planning cycle.
    """
    sources: List[FetchSource]
    llm: Optional[LLMConfig] = None # Deprecated: Handled by IdentityOrchestrator.
    context: Optional[str] = "" # User-provided additional instructions
    active_agents: Optional[dict] = None # Global Mesh Activation Map
    parent_task_id: Optional[str] = None # Reference to Phase 1 data
    min_log_level: Optional[int] = 3     # Intelligence Depth (3=INFO, 4=DEBUG, 5=TRACE)
    depth: Optional[str] = "standard"    # Mission depth profile: rapid, standard, full
    role: Optional[str] = "qa_engineer"  # User role for LLM context (qa_engineer, sdet, qa_lead, etc)
    use_node_cache: Optional[bool] = None # Per-task cache override. None falls back to the runtime default.
    module: Optional[str] = None # Project or mission name
    mission_name: Optional[str] = None # Optional mission alias
    execution_context: Optional[ExecutionContext] = None # V5 execution constraints
    execution_mode: Optional[ExecutionMode] = ExecutionMode.ANALYSIS # Defines how far the platform should go
    state_overrides: Optional[Dict[str, Any]] = None # Direct overrides for AgentState keys

    @model_validator(mode="after")
    def validate_mission_launch(self):
        if not self.execution_context:
            return self
            
        ctx = self.execution_context
        if self.execution_mode == ExecutionMode.VALIDATION:
            if not ctx.application_url and not ctx.api_base_url:
                raise ValueError("Validation mode requires application_url or api_base_url.")
        elif self.execution_mode == ExecutionMode.FULL_EXECUTION:
            if not any([ctx.application_url, ctx.api_base_url, ctx.repository_url, ctx.docker_image]):
                raise ValueError("Full Execution requires at least one target (URL, Repository, or Docker Image).")
        return self

class PublishRequest(BaseModel):
    """Request to export the finalized plan to an external wiki (Confluence)."""
    connection: ConnectionConfig
    confluence_url: str
    space_key: str
    title: str
    markdown_content: str

class AgentInvokeRequest(BaseModel):
    """Payload for invoking a standalone capability from one of the remaining 34-tier agents."""
    agent_key: str
    action: str
    context_override: Optional[str] = None

class ToolExecutionRequest(BaseModel):
    """Payload for executing a specific tool via the ToolOrchestrator."""
    mission_id: int
    correlation_id: str = ""
    agent_name: str
    tool_name: str

    execution_context: dict
    readiness_snapshot: dict
    payload: dict = {}

    approved: bool = False

class ToolArtifact(BaseModel):
    artifact_type: str
    artifact_name: str
    path: str
    size: int

class VulnerabilityResult(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    findings: list[dict] = []

class RuleResult(BaseModel):
    rule_id: str
    severity: str  # HIGH, MEDIUM, LOW, INFO
    message: str
    passed: bool

class ToolExecutionResult(BaseModel):
    """Standardized result shape for all tool adapter executions."""
    tool_name: str
    success: bool
    duration_ms: int
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    summary: dict = {}
    artifacts: list[ToolArtifact] = []

class AgentExecutionMetrics(BaseModel):
    agent_name: str
    missions_run: int = 0
    tools_executed: int = 0
    success_rate: float = 0.0
    avg_duration_ms: int = 0

class Phase1ApprovalBody(BaseModel):
    resolved_questions: List[Dict] = Field(default_factory=list)

class Phase2ApprovalBody(BaseModel):
    pass

