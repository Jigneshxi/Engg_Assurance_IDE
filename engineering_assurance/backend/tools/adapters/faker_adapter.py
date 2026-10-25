import time
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult, ToolArtifact
import tempfile
import json
import os
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

try:
    from faker import Faker
except ImportError:
    Faker = None

@ToolRegistry.register
class FakerAdapter(BaseToolAdapter):
    name = "faker"
    category = "general"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return Faker is not None

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload
        count = payload.get("count", 10)
        entity = payload.get("entity", "customer").lower()
        
        faker = Faker()
        records = []
        
        try:
            for _ in range(count):
                if entity == "customer":
                    records.append({
                        "id": faker.uuid4(),
                        "name": faker.name(),
                        "email": faker.email(),
                        "address": faker.address()
                    })
                elif entity == "product":
                    records.append({
                        "id": faker.uuid4(),
                        "sku": faker.ean13(),
                        "name": faker.catch_phrase(),
                        "price": round(faker.pyfloat(positive=True, max_value=1000), 2)
                    })
                else:
                    # Generic
                    records.append({
                        "id": faker.uuid4(),
                        "data": faker.text(max_nb_chars=50)
                    })
            
            tmp_path = os.path.join(tempfile.gettempdir(), f"faker_{int(time.time())}.json")
            with open(tmp_path, "w") as f:
                json.dump(records, f)

            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=True,
                duration_ms=duration_ms,
                summary={"records_generated": len(records), "entity": entity},
                artifacts=[ToolArtifact(
                    artifact_type="test_data",
                    artifact_name="faker_records.json",
                    path=tmp_path,
                    size=os.path.getsize(tmp_path)
                )]
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                summary={"records_generated": 0},
                error=str(e)
            )
