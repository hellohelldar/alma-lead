"""Console/log email backend used when no provider is configured.

Lets the whole app run locally with zero secrets — submitted leads still
"send" both emails, visible in the server log.
"""

import logging

from app.services.email.base import EmailBackend, EmailMessage

logger = logging.getLogger("alma.email")


class ConsoleEmailBackend(EmailBackend):
    async def send(self, message: EmailMessage) -> None:
        logger.info(
            "\n--- EMAIL (console backend) ---\n"
            "To: %s\nSubject: %s\n\n%s\n-------------------------------",
            message.to,
            message.subject,
            message.text,
        )
