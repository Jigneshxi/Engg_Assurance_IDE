from pathlib import Path
import sys
import types
import shutil

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

vector_db_stub = types.ModuleType("backend.core.vector_db")
vector_db_stub.vector_store = type(
    "_VectorStoreStub",
    (),
    {"ingest_document": lambda *args, **kwargs: True},
)()
sys.modules.setdefault("backend.core.vector_db", vector_db_stub)

from backend.api.routes.knowledge import router  # noqa: E402


def _build_client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_docx_upload_succeeds_with_vectorization_stub(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.api.routes.knowledge.settings.BASE_DIR", str(tmp_path))

    client = _build_client()
    sample = tmp_path / "sample.docx"
    shutil.copyfile(Path(__file__).resolve().parents[1] / "TravelEase_PRD.docx", sample)

    with sample.open("rb") as handle:
        response = client.post(
            "/api/knowledge/upload",
            files={"file": ("sample.docx", handle, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_upload_rejects_unsupported_extensions(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.api.routes.knowledge.settings.BASE_DIR", str(tmp_path))

    client = _build_client()
    sample = tmp_path / "sample.exe"
    sample.write_bytes(b"noop")

    with sample.open("rb") as handle:
        response = client.post(
            "/api/knowledge/upload",
            files={"file": ("sample.exe", handle, "application/octet-stream")},
        )

    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]
