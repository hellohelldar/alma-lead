"""Resend email backend (https://resend.com).

Uses the plain HTTP API via httpx so we avoid an extra SDK dependency.
"""

import logging

import httpx

from app.services.email.base import EmailBackend, EmailMessage

logger = logging.getLogger("alma.email")

_RESEND_ENDPOINT = "https://api.resend.com/emails"


class ResendEmailBackend(EmailBackend):
    def __init__(self, api_key: str, sender: str) -> None:
        self._api_key = api_key
        self._sender = sender

    async def send(self, message: EmailMessage) -> None:
        payload = {
            "from": self._sender,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    _RESEND_ENDPOINT, json=payload, headers=headers
                )
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            # Email delivery is best-effort and must never fail the request that
            # triggered it; log and move on.
            logger.error("Resend delivery failed for %s: %s", message.to, exc)
