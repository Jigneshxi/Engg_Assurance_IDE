import pytest
import datetime
import hashlib
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.core.mission_models import Mission, MissionArtifact
from backend.services.mission_service import MissionService
from backend.core.node_cache import NodeCache, NodeCacheEntry

# Use in-memory SQLite for tests
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def test_cache():
    # Instantiate a separate node cache bound to the test engine
    cache = NodeCache()
    cache._engine = engine
    cache._Session = TestingSessionLocal
    cache._ensure_table()
    yield cache

def test_stale_cache_detection(db, test_cache):
    """
    Scenario A: Prove that if an artifact changes, the node cache must be invalidated
    or the state hash must change, otherwise we serve a stale cache.
    """
    # 1. Setup a dummy mission
    mission = Mission(mission_name="Test Mission", mission_type="test", created_by=1, correlation_id="TEST-123")
    db.add(mission)
    db.commit()

    # 2. Save Artifact V1
    art_v1 = MissionService.save_artifact(
        db, mission.id, "Agent A", "UI_MOCKUP", 
        artifact_json={"color": "blue"}, artifact_hash="hash_v1"
    )

    # 3. Simulate LangGraph Node caching its output based on the state
    # (The state hasn't captured the artifact hash correctly in the old system)
    dummy_state = {"mission_id": mission.id, "depth": "standard", "combined_data": {"test": "data"}}
    state_hash = test_cache.hash_state(dummy_state, ["combined_data", "depth"])
    
    test_cache.set("visual_intel", state_hash, {"decision": "It is blue!"})
    
    # 4. Save Artifact V2 (User modified the artifact to be red)
    art_v2 = MissionService.save_artifact(
        db, mission.id, "Agent A", "UI_MOCKUP", 
        artifact_json={"color": "red"}, artifact_hash="hash_v2"
    )
    
    # 5. Resolve artifact to simulate the Graph running again
    # In a proper fix, resolving or saving an artifact should update the state hash OR clear the cache.
    # We assert that the cache SHOULD NOT return the stale "It is blue!" decision for this mission anymore.
    
    cached_result = test_cache.get("visual_intel", state_hash)
    
    # If the fix is not implemented, cached_result will incorrectly return {"decision": "It is blue!"}
    # We want to assert that the cache returns None (invalidated) or the hash was forced to change.
    assert cached_result is None, "Data Risk Alert: Stale cache hit! The node will hallucinate based on Artifact V1."

def test_granular_invalidation_prevents_data_loss(db, test_cache):
    """
    Scenario B & C: Prove that invalidation is strictly targeted and does NOT delete MissionArtifacts.
    """
    mission = Mission(mission_name="Test Mission", mission_type="test", created_by=1, correlation_id="TEST-124")
    db.add(mission)
    db.commit()

    art = MissionService.save_artifact(
        db, mission.id, "Agent B", "SECURITY_SPEC", 
        artifact_json={"secure": True}, artifact_hash="sec_hash"
    )
    
    test_cache.set("security", "dummy_hash_1", {"vulns": 0})
    test_cache.set("performance", "dummy_hash_2", {"latency": 50})

    # Trigger hypothetical cache invalidation for 'security'
    test_cache.invalidate("security")

    # The security cache should be gone
    assert test_cache.get("security", "dummy_hash_1") is None
    
    # The performance cache must remain (Granular)
    assert test_cache.get("performance", "dummy_hash_2") is not None

    # The actual MissionArtifact MUST still exist in the database (No Data Loss)
    persisted_art = db.query(MissionArtifact).filter(MissionArtifact.id == art.id).first()
    assert persisted_art is not None, "Data Loss Alert: Cache invalidation deleted the persistent artifact!"
