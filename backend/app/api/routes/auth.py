"""Authentication routes for the internal attorney console."""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.auth import CurrentUser, LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Hash the configured attorney password once at import so we never compare
# plaintext on the hot path.
_attorney_password_hash = hash_password(settings.attorney_password)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    valid = body.email == settings.attorney_email and verify_password(
        body.password, _attorney_password_hash
    )
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(subject=settings.attorney_email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUser)
async def me(user: CurrentUserDep) -> CurrentUser:
    return user
