"""Storage abstraction.

The API stores resume files behind this interface so the local-filesystem
backend used in development can be swapped for S3/GCS in production without
touching call sites.
"""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, key: str, data: bytes, content_type: str) -> str:
        """Persist `data` under `key`. Returns the stored key."""

    @abstractmethod
    async def load(self, key: str) -> bytes:
        """Read the bytes stored under `key`."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        ...
