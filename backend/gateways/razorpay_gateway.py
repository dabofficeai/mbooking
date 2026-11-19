import hashlib
import hmac
import json
from typing import Optional

import razorpay

from gateways.base import PaymentOrderResult, PaymentProvider, WebhookEventResult


class RazorpayProvider(PaymentProvider):
    """Concrete PaymentProvider using Razorpay Orders API & HMAC-SHA256 webhooks."""

    gateway_name = "razorpay"

    def __init__(
        self,
        key_id: str,
        key_secret: str,
        webhook_secret: str,
        client: Optional[razorpay.Client] = None,
    ) -> None:
        self.key_id = key_id
        self.key_secret = key_secret
        self.webhook_secret = webhook_secret
        self.client = client or razorpay.Client(auth=(key_id, key_secret))

    def create_order(
        self,
        amount_paise: int,
        receipt: str,
        notes: Optional[dict[str, str]] = None,
    ) -> PaymentOrderResult:
        payload = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt[:40],
            "payment_capture": 1,
        }
        if notes:
            payload["notes"] = notes

        order = self.client.order.create(data=payload)
        return PaymentOrderResult(
            gateway_name=self.gateway_name,
            order_id=order["id"],
            amount_paise=int(order["amount"]),
            currency=order.get("currency", "INR"),
            receipt=order.get("receipt", receipt),
        )

    def verify_webhook(
        self, raw_body: bytes, signature: str
    ) -> WebhookEventResult:
        if not self.webhook_secret:
            raise ValueError("Razorpay webhook secret is not configured.")
        if not signature:
            raise ValueError("Missing X-Razorpay-Signature header.")

        expected_signature = hmac.new(
            self.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            raise ValueError("Invalid Razorpay webhook signature.")

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
