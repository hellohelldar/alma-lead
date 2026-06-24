"""Local-filesystem storage backend."""

from pathlib import Path

from app.services.storage.base import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, root: str) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Keys are server-generated (uuid-based), but guard against traversal.
        safe = key.replace("..", "").lstrip("/")
        path = self._root / safe
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    async def save(self, key: str, data: bytes, content_type: str) -> str:
        self._path(key).write_bytes(data)
        return key

    async def load(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def exists(self, key: str) -> bool:
        return self._path(key).is_file()
