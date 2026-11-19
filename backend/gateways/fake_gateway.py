import hashlib
import hmac
import json
import uuid
from typing import Optional

from gateways.base import PaymentOrderResult, PaymentProvider, WebhookEventResult


class FakePaymentProvider(PaymentProvider):
    """Offline PaymentProvider for deterministic unit/API testing without network calls."""

    gateway_name = "fake"

    def __init__(self, webhook_secret: str = "test_webhook_secret") -> None:
        self.webhook_secret = webhook_secret
        self.created_orders: list[PaymentOrderResult] = []

    def create_order(
        self,
        amount_paise: int,
        receipt: str,
        notes: Optional[dict[str, str]] = None,
    ) -> PaymentOrderResult:
        order = PaymentOrderResult(
            gateway_name=self.gateway_name,
            order_id=f"order_fake_{uuid.uuid4().hex[:14]}",
            amount_paise=amount_paise,
            currency="INR",
            receipt=receipt,
        )
        self.created_orders.append(order)
        return order

    def verify_webhook(
        self, raw_body: bytes, signature: str
    ) -> WebhookEventResult:
        if not signature:
            raise ValueError("Missing X-Razorpay-Signature header.")

        expected_signature = hmac.new(
            self.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            raise ValueError("Invalid webhook signature.")

        data = json.loads(raw_body.decode("utf-8"))
        event_type = data.get("event", "")
        payment_entity = (
            data.get("payload", {}).get("payment", {}).get("entity", {})
        )
        order_entity = (
            data.get("payload", {}).get("order", {}).get("entity", {})
        )

        order_id = payment_entity.get("order_id") or order_entity.get("id") or ""
        payment_id = payment_entity.get("id")

        if not order_id:
            raise ValueError("Webhook payload missing order_id.")

        return WebhookEventResult(
            event_type=event_type,
            order_id=order_id,
            payment_id=payment_id,
            is_payment_captured=event_type in ("payment.captured", "order.paid"),
            is_payment_failed=event_type == "payment.failed",
        )
