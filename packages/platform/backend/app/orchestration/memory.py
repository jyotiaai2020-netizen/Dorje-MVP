from collections import defaultdict
from threading import Lock


class MemoryManager:
    """Small in-process preference memory; replaceable by tenant-scoped persistence."""

    def __init__(self) -> None:
        self._memory: dict[str, dict[str, str]] = defaultdict(dict)
        self._lock = Lock()

    def remember(self, workspace_id: str, key: str, value: str) -> None:
        with self._lock:
            self._memory[workspace_id][key] = value[:1000]

    def recall(self, workspace_id: str) -> dict[str, str]:
        with self._lock:
            return dict(self._memory.get(workspace_id, {}))
