import hashlib
import hmac
import json
from unittest.mock import MagicMock

import pytest

from gateways.fake_gateway import FakePaymentProvider
from gateways.razorpay_gateway import RazorpayProvider


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_razorpay_verify_webhook_valid_signature() -> None:
    secret = "whsec_test_123"
    provider = RazorpayProvider(
        key_id="rzp_test_id",
        key_secret="rzp_test_secret",
        webhook_secret=secret,
        client=MagicMock(),
    )
    payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_abc123",
                    "order_id": "order_xyz789",
                }
            }
        },
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = _sign(secret, raw_body)

    result = provider.verify_webhook(raw_body, sig)
    assert result.order_id == "order_xyz789"
    assert result.payment_id == "pay_abc123"
    assert result.is_payment_captured is True
    assert result.is_payment_failed is False


def test_razorpay_verify_webhook_invalid_signature_raises() -> None:
    provider = RazorpayProvider(
        key_id="rzp_test_id",
        key_secret="rzp_test_secret",
        webhook_secret="whsec_test_123",
        client=MagicMock(),
    )
    raw_body = b'{"event":"payment.captured"}'
    with pytest.raises(ValueError, match="Invalid Razorpay webhook signature"):
        provider.verify_webhook(raw_body, "deadbeef")


def test_razorpay_create_order_uses_client() -> None:
    mock_client = MagicMock()
    mock_client.order.create.return_value = {
        "id": "order_rzp_001",
        "amount": 30000,
        "currency": "INR",
        "receipt": "rcpt_123",
    }
    provider = RazorpayProvider(
        key_id="rzp_test_id",
        key_secret="rzp_test_secret",
        webhook_secret="whsec_test_123",
        client=mock_client,
    )

    order = provider.create_order(amount_paise=30000, receipt="rcpt_123")
    assert order.order_id == "order_rzp_001"
    assert order.amount_paise == 30000
    assert order.currency == "INR"
    mock_client.order.create.assert_called_once()


def test_fake_gateway_hmac_verification() -> None:
    provider = FakePaymentProvider(webhook_secret="fake_secret")
    order = provider.create_order(amount_paise=20000, receipt="rcpt_fake")
    assert order.order_id.startswith("order_fake_")

    body = json.dumps(
        {
            "event": "order.paid",
            "payload": {"order": {"entity": {"id": order.order_id}}},
        }
    ).encode("utf-8")
    sig = _sign("fake_secret", body)
    verified = provider.verify_webhook(body, sig)
    assert verified.is_payment_captured is True
    assert verified.order_id == order.order_id
