"""Email backend factory + high-level send helper."""

import asyncio
import logging
from functools import lru_cache

from app.core.config import settings
from app.services.email import templates
from app.services.email.base import EmailBackend
from app.services.email.console import ConsoleEmailBackend
from app.services.email.resend import ResendEmailBackend

logger = logging.getLogger("alma.email")


@lru_cache
def get_email_backend() -> EmailBackend:
    if settings.resend_api_key:
        logger.info("Email: using Resend backend")
        return ResendEmailBackend(settings.resend_api_key, settings.email_from)
    logger.info("Email: no RESEND_API_KEY set — using console backend")
    return ConsoleEmailBackend()


async def send_lead_notifications(
    *, first_name: str, last_name: str, email: str
) -> None:
    """Send both the prospect confirmation and the attorney alert.

    Designed to run in a background task; failures are logged, never raised,
    so a flaky email provider can't break lead intake.
    """
    backend = get_email_backend()
    prospect = templates.prospect_confirmation(first_name=first_name, to=email)
    attorney = templates.attorney_notification(
        attorney_email=settings.attorney_notify_email,
        first_name=first_name,
        last_name=last_name,
        prospect_email=email,
    )
    results = await asyncio.gather(
        backend.send(prospect), backend.send(attorney), return_exceptions=True
    )
    for r in results:
        if isinstance(r, Exception):
            logger.error("Lead notification failed: %s", r)
