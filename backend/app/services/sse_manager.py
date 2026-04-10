import asyncio
import json
import time
from typing import Dict, Set, Optional
from dataclasses import dataclass, field


@dataclass
class SSEEvent:
    event: str
    data: dict
    id: Optional[str] = None


class SSEManager:
    """Manages SSE connections for real-time progress pushing."""

    def __init__(self):
        self._connections: Dict[str, Set[asyncio.Queue]] = {}
        self._task_status: Dict[str, dict] = {}

    async def connect(self, task_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        if task_id not in self._connections:
            self._connections[task_id] = set()
        self._connections[task_id].add(queue)

        if task_id in self._task_status:
            await queue.put(SSEEvent(
                event="status_change",
                data=self._task_status[task_id],
            ))

        return queue

    def disconnect(self, task_id: str, queue: asyncio.Queue):
        if task_id in self._connections:
            self._connections[task_id].discard(queue)
            if not self._connections[task_id]:
                del self._connections[task_id]

    async def broadcast(self, task_id: str, event: str, data: dict):
        if task_id not in self._connections:
            return

        sse_event = SSEEvent(event=event, data=data)
        self._task_status[task_id] = data

        dead_queues = set()
        for queue in self._connections.get(task_id, set()):
            try:
                queue.put_nowait(sse_event)
            except Exception:
                dead_queues.add(queue)

        for q in dead_queues:
            self.disconnect(task_id, q)

    def update_status(self, task_id: str, data: dict):
        self._task_status[task_id] = data


sse_manager = SSEManager()


def format_sse(event: str, data: dict) -> str:
    """Format data as SSE event string."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
