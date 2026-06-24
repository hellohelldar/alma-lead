"""Lead routes: public intake + internal management."""

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUserDep
from app.core.config import settings
from app.db.session import get_db
from app.models.lead import Lead, LeadState
from app.schemas.lead import LeadList, LeadRead, LeadStateUpdate
from app.services.email import send_lead_notifications
from app.services.storage import get_storage

router = APIRouter(prefix="/leads", tags=["leads"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
_email_validator = TypeAdapter(EmailStr)


@router.post("", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    db: DbDep,
    background: BackgroundTasks,
    first_name: Annotated[str, Form(min_length=1, max_length=255)],
    last_name: Annotated[str, Form(min_length=1, max_length=255)],
    email: Annotated[str, Form()],
    resume: Annotated[UploadFile, File()],
) -> Lead:
    """Public endpoint: a prospect submits their details and resume.

    On success both the prospect and the attorney are notified by email
    (in the background, so delivery latency doesn't slow the response).
    """
    # Validate email with the same rules as the rest of the API.
    try:
        email = _email_validator.validate_python(email)
    except (ValidationError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid email address",
        ) from None

    content_type = resume.content_type or "application/octet-stream"
    if content_type not in settings.allowed_resume_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported resume type '{content_type}'. Allowed: PDF, DOC, DOCX.",
        )

    data = await resume.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resume file is empty",
        )
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Resume exceeds maximum allowed size",
        )

    lead_id = str(uuid.uuid4())
    safe_name = (resume.filename or "resume").replace("/", "_")
    resume_key = f"{lead_id}/{safe_name}"
    await get_storage().save(resume_key, data, content_type)

    lead = Lead(
        id=lead_id,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=email,
        resume_key=resume_key,
        resume_filename=safe_name,
        resume_content_type=content_type,
        state=LeadState.PENDING,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)

    background.add_task(
        send_lead_notifications,
        first_name=lead.first_name,
        last_name=lead.last_name,
        email=lead.email,
    )
    return lead


@router.get("", response_model=LeadList)
async def list_leads(
    db: DbDep,
    _user: CurrentUserDep,
    state: LeadState | None = None,
    search: str | None = Query(None, description="Match against name or email"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> LeadList:
    """Internal endpoint: paginated, filterable list of leads."""
    filters = []
    if state is not None:
        filters.append(Lead.state == state)
    if search:
        like = f"%{search.lower()}%"
        filters.append(
            func.lower(Lead.first_name).like(like)
            | func.lower(Lead.last_name).like(like)
            | func.lower(Lead.email).like(like)
        )

    count_stmt = select(func.count()).select_from(Lead)
    list_stmt = select(Lead).order_by(Lead.created_at.desc())
    for f in filters:
        count_stmt = count_stmt.where(f)
        list_stmt = list_stmt.where(f)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(list_stmt.limit(limit).offset(offset))).scalars().all()
    return LeadList(
        items=[LeadRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


async def _get_lead_or_404(db: AsyncSession, lead_id: str) -> Lead:
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.get("/{lead_id}", response_model=LeadRead)
async def get_lead(db: DbDep, _user: CurrentUserDep, lead_id: str) -> Lead:
    return await _get_lead_or_404(db, lead_id)


@router.patch("/{lead_id}/state", response_model=LeadRead)
async def update_lead_state(
    db: DbDep, _user: CurrentUserDep, lead_id: str, body: LeadStateUpdate
) -> Lead:
    """Transition a lead's state (e.g. PENDING -> REACHED_OUT)."""
    lead = await _get_lead_or_404(db, lead_id)
    lead.state = body.state
    await db.commit()
    await db.refresh(lead)
    return lead


@router.get("/{lead_id}/resume")
async def download_resume(db: DbDep, _user: CurrentUserDep, lead_id: str) -> Response:
    lead = await _get_lead_or_404(db, lead_id)
    storage = get_storage()
    if not await storage.exists(lead.resume_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume file missing"
        )
    data = await storage.load(lead.resume_key)
    return Response(
        content=data,
        media_type=lead.resume_content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{lead.resume_filename}"'
        },
    )
