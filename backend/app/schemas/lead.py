"""Pydantic schemas for the Lead resource."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.lead import LeadState


class LeadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    email: EmailStr
    resume_filename: str
    resume_content_type: str
    state: LeadState
    created_at: datetime
    updated_at: datetime


class LeadList(BaseModel):
    items: list[LeadRead]
    total: int
    limit: int
    offset: int


class LeadStateUpdate(BaseModel):
    state: LeadState
