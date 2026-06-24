"""Storage backend factory."""

from functools import lru_cache

from app.core.config import settings
from app.services.storage.base import StorageBackend
from app.services.storage.local import LocalStorage


@lru_cache
def get_storage() -> StorageBackend:
    # Swap on a `STORAGE_BACKEND` setting here to add S3/GCS in production.
    return LocalStorage(settings.storage_dir)
