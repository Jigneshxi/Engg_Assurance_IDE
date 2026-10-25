import asyncio
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class TestBroadcaster:
    def __init__(self):
        # mission_id -> list of queues
        self.listeners: Dict[str, List[asyncio.Queue]] = {}

    async def subscribe(self, mission_id: str) -> asyncio.Queue:
        if mission_id not in self.listeners:
            self.listeners[mission_id] = []
        q = asyncio.Queue()
        self.listeners[mission_id].append(q)
        return q

    def unsubscribe(self, mission_id: str, q: asyncio.Queue):
        if mission_id in self.listeners:
            if q in self.listeners[mission_id]:
                self.listeners[mission_id].remove(q)
            if not self.listeners[mission_id]:
                del self.listeners[mission_id]

    async def broadcast(self, mission_id: str, message: str):
        if mission_id in self.listeners:
            for q in self.listeners[mission_id]:
                await q.put(message)

# Global singleton
broadcaster = TestBroadcaster()
