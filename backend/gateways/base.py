from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PaymentOrderResult:
    gateway_name: str
    order_id: str
    amount_paise: int
    currency: str
    receipt: str


@dataclass(frozen=True)
class WebhookEventResult:
    event_type: str
    order_id: str
    payment_id: Optional[str]
    is_payment_captured: bool
    is_payment_failed: bool


class PaymentProvider(ABC):
    """Abstract payment gateway interface for dependency inversion."""

    @abstractmethod
    def create_order(
        self,
        amount_paise: int,
        receipt: str,
        notes: Optional[dict[str, str]] = None,
    ) -> PaymentOrderResult:
        """Create a payment order with the underlying gateway."""

    @abstractmethod
    def verify_webhook(
        self, raw_body: bytes, signature: str
    ) -> WebhookEventResult:
        """Verify webhook HMAC signature and parse normalized event payload."""
