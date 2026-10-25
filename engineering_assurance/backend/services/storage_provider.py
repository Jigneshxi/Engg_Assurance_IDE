from abc import ABC, abstractmethod
import json
from sqlalchemy.orm import Session
from backend.core.mission_models import MissionArtifact

class StorageProvider(ABC):
    @abstractmethod
    def save_artifact(self, db: Session, mission_id: int, agent_name: str, artifact_type: str, artifact_content: str, artifact_size: int, artifact_hash: str, producer_version: str = None, artifact_json: dict | list | None = None) -> MissionArtifact:
        pass

    @abstractmethod
    def load_artifact(self, db: Session, artifact_id: int) -> str:
        pass

class DatabaseStorageProvider(StorageProvider):
    def save_artifact(self, db: Session, mission_id: int, agent_name: str, artifact_type: str, artifact_content: str, artifact_size: int, artifact_hash: str, producer_version: str = None, artifact_json: dict | list | None = None) -> MissionArtifact:
        artifact = MissionArtifact(
            mission_id=mission_id,
            agent_name=agent_name,
            artifact_type=artifact_type,
            artifact_json=artifact_json,
            artifact_content=artifact_content,
            artifact_size=artifact_size,
            artifact_hash=artifact_hash,
            producer_version=producer_version
        )
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact

    def load_artifact(self, db: Session, artifact_id: int) -> str:
        artifact = db.query(MissionArtifact).filter(MissionArtifact.id == artifact_id).first()
        return artifact.artifact_content if artifact else None
