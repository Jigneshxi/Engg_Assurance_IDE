from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.core.vector_db import LocalHashEmbeddingFunction, VectorDBAgent


class _FakeCollection:
    def __init__(self, fail_once: bool = False):
        self.fail_once = fail_once
        self.upsert_calls = []
        self.add_calls = []
        self.query_calls = []
        self.get_calls = []

    def upsert(self, **kwargs):
        self.upsert_calls.append(kwargs)
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("ollama connection refused")

    def add(self, **kwargs):
        self.add_calls.append(kwargs)

    def get(self, **kwargs):
        self.get_calls.append(kwargs)
        return {"ids": [], "metadatas": []}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        return {"documents": [[]], "metadatas": [[]], "distances": [[]], "ids": [[]]}


class _FakeClient:
    def __init__(self, recovery_collection):
        self.recovery_collection = recovery_collection
        self.requested_names = []

    def get_or_create_collection(self, name, embedding_function):
        self.requested_names.append((name, type(embedding_function).__name__))
        return self.recovery_collection


class _HarnessVectorDBAgent(VectorDBAgent):
    def __init__(self, primary_collection, fake_client):
        super().__init__()
        self._collection = primary_collection
        self._fake_client = fake_client

    @property
    def client(self):
        return self._fake_client


def test_ingest_document_recovers_from_embedding_backend_failure(tmp_path, monkeypatch):
    primary_collection = _FakeCollection(fail_once=True)
    recovery_collection = _FakeCollection()
    fake_client = _FakeClient(recovery_collection)
    agent = _HarnessVectorDBAgent(primary_collection, fake_client)

    monkeypatch.setattr(agent, "extract_text", lambda file_path: "Alpha beta gamma delta")

    result = agent.ingest_document(str(tmp_path / "sample.docx"), metadata={"type": "historical_sample", "source": "sample.docx"})

    assert result is True
    assert agent.collection_name == agent.recovery_collection_name
    assert isinstance(agent.embedding_function, LocalHashEmbeddingFunction)
    assert primary_collection.upsert_calls
    assert recovery_collection.upsert_calls
    assert fake_client.requested_names == [(agent.recovery_collection_name, "LocalHashEmbeddingFunction")]
