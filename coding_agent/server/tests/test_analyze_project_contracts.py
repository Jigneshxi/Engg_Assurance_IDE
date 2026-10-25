import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analyzeProjectContracts import analyze


class ProjectContractAstTests(unittest.TestCase):
    def setUp(self):
        self.files = {
            "backend/app/__init__.py": "",
            "backend/app/db/__init__.py": "",
            "backend/app/db/database.py": "from sqlalchemy.orm import declarative_base\nBase = declarative_base()\n",
            "backend/app/db/models.py": "from app.db.database import Base\nclass Product(Base):\n    id = 1\nclass Product(Base):\n    sku = 1\n",
            "backend/app/schemas/product.py": "from pydantic import BaseModel, ConfigDict\nclass ProductResponse(BaseModel):\n    model_config = ConfigDict(extra='allow')\n    id: int\n    password_hash: str\n",
            "backend/app/api/cart.py": "from app.db import database\nfrom app.db.models import Product as Item\nfrom app.schemas.product import ProductResponse\ndef cart(db):\n    db.query(Item).all()\n    db.query(ProductResponse).all()\n    db.query(Unknown).all()\n",
            "backend/app/api/products.py": "from fastapi import APIRouter\nfrom app.schemas.product import ProductResponse\nrouter = APIRouter()\n@router.get('/products', response_model=ProductResponse)\ndef products():\n    return {'id': 1}\n",
        }

    def test_import_aware_orm_and_submodule_resolution(self):
        result = analyze(self.files)
        self.assertIn("backend/app/db/models.py:Product", result["ormModels"])
        self.assertNotIn("backend/app/api/cart.py", [d["file"] for d in result["defects"] if d["code"] == "MISSING_PYTHON_MODULE" and "app.db" in d["message"]])
        codes = [d["code"] for d in result["defects"] if d["file"] == "backend/app/api/cart.py"]
        self.assertIn("ORM_SCHEMA_QUERY", codes)
        self.assertIn("ORM_MODEL_UNRESOLVED", codes)

    def test_duplicate_definitions_and_unsafe_responses_are_reported(self):
        result = analyze(self.files)
        model_defects = [d for d in result["defects"] if d["file"] == "backend/app/db/models.py"]
        self.assertTrue(any(d["code"] == "DUPLICATE_DEFINITION" for d in model_defects))
        response_defects = [d["code"] for d in result["defects"] if d["file"] == "backend/app/api/products.py"]
        self.assertIn("SENSITIVE_RESPONSE_FIELD", response_defects)
        self.assertIn("BROAD_RESPONSE_SCHEMA", response_defects)


if __name__ == "__main__":
    unittest.main()
