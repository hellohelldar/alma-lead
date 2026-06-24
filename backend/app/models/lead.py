"""Lead ORM model."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeadState(enum.StrEnum):
    PENDING = "PENDING"
    REACHED_OUT = "REACHED_OUT"


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)

    # Resume is stored via the Storage backend; we persist a logical key plus
    # the original filename and content type for downloads.
    resume_key: Mapped[str] = mapped_column(String(512), nullable=False)
    resume_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    resume_content_type: Mapped[str] = mapped_column(String(128), nullable=False)

    state: Mapped[LeadState] = mapped_column(
        Enum(LeadState, native_enum=False, length=32),
        default=LeadState.PENDING,
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
