import requests
import json

payload = {
  "sources": [],
  "context": "Testing OpenAPI Context Flow",
  "modules": ["forge"],
  "depth": "standard",
  "role": "qa_engineer",
  "execution_mode": "planning",
  "execution_context": {
    "openapi_url": "http://api.staging.app.com/docs",
    "api_base_url": "http://api.staging.app.com",
    "environment": "dev",
    "target_type": "web"
  }
}

try:
    res = requests.post("http://localhost:8000/api/converge/mission", json=payload)
    print("STATUS:", res.status_code)
    print("RESPONSE:", res.text)
except Exception as e:
    print("Error:", e)
