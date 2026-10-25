from typing import Dict, List, Type, Optional
from backend.tools.base import BaseToolAdapter

class ToolRegistry:
    _adapters: Dict[str, Type[BaseToolAdapter]] = {}

    @classmethod
    def register(cls, adapter_class: Type[BaseToolAdapter]):
        """Registers a tool adapter class."""
        cls._adapters[adapter_class.name] = adapter_class
        return adapter_class

    @classmethod
    def get_adapter(cls, name: str) -> Optional[BaseToolAdapter]:
        adapter_cls = cls._adapters.get(name)
        return adapter_cls() if adapter_cls else None

    @classmethod
    def get_adapters_by_category(cls, category: str) -> List[BaseToolAdapter]:
        return [
            adapter_cls() for adapter_cls in cls._adapters.values() 
            if adapter_cls.category == category
        ]
