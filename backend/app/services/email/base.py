"""Email service abstraction.

`EmailMessage` is provider-agnostic; concrete backends (Resend, console)
implement `send`. The factory in `__init__` picks a backend based on config.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str


class EmailBackend(ABC):
    @abstractmethod
    async def send(self, message: EmailMessage) -> None:
        ...
