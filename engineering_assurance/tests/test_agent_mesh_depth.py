from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api.routes.converge import _build_active_agents
from backend.core.mission_policy import build_mission_profile, get_role_defaults


def test_role_defaults_keep_module_access_scoped():
    defaults = get_role_defaults("manager")
    assert defaults["modules"] == ["decide"]
    assert defaults["depth"] == "rapid"
    assert defaults["requires_parent_task"] is True


def test_standard_profile_expands_core_and_system_agents():
    profile = build_mission_profile("qa_engineer", ["ingest", "forge"], "standard")

    assert profile["role"] == "qa_engineer"
    assert profile["selected_modules"] == ["ingest", "forge"]
    assert profile["core_agents"]
    assert profile["supporting_agents"]
    assert profile["system_agents"] == ["writer", "synthesis_final"]
    assert "api_validation" in profile["final_agents"]
    assert "test_impact" in profile["final_agents"]
    assert profile["counts"]["final"] == len(profile["final_agents"])


def test_full_mesh_adds_dependency_agents_without_bypassing_role_access():
    profile = build_mission_profile("ciso", ["certify"], "full")

    assert profile["selected_modules"] == ["certify"]
    assert "monitor" in profile["final_agents"]
    assert "tracing" in profile["final_agents"]
    assert "reliability_eng" in profile["final_agents"]
    assert "security" in profile["final_agents"]
    assert profile["system_agents"] == ["writer", "synthesis_final"]


def test_legacy_helper_signature_still_builds_a_profile():
    resolved = _build_active_agents("all", "rapid")

    assert resolved["writer"] == "auto"
    assert resolved["synthesis_final"] == "auto"
    assert resolved["ingestor"] == "auto"
    assert "api_validation" in resolved
