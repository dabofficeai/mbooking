import hashlib
import hmac
import json
from datetime import date, timedelta

from fastapi.testclient import TestClient


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_health_and_calendar_window(
    client: TestClient, fixed_today: date
) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    window = client.get("/api/calendar-window")
    assert window.status_code == 200
    data = window.json()
    assert data["start_date"] == fixed_today.isoformat()
    assert data["end_date"] == (fixed_today + timedelta(days=29)).isoformat()
    assert data["days"] == 30
    assert data["price_per_day_paise"] == 10000


def test_30_day_boundary_validation(
    client: TestClient, fixed_today: date
) -> None:
    yesterday = (fixed_today - timedelta(days=1)).isoformat()
    day_30_beyond = (fixed_today + timedelta(days=30)).isoformat()

    # Past date rejected
    res_past = client.post(
        "/api/bookings",
        json={
            "customer_name": "Kiran",
            "customer_phone": "9876543210",
            "items": [{"service_date": yesterday, "item_text": "Tea"}],
        },
    )
    assert res_past.status_code == 422

    # Beyond 30-day window (today + 30) rejected
    res_future = client.post(
        "/api/bookings",
        json={
            "customer_name": "Kiran",
            "customer_phone": "9876543210",
            "items": [{"service_date": day_30_beyond, "item_text": "Tea"}],
        },
    )
    assert res_future.status_code == 422

    # Boundary dates: today (day 0) and today + 29 (day 29) accepted
    res_valid = client.post(
        "/api/bookings",
        json={
            "customer_name": "Kiran",
            "customer_phone": "9876543210",
            "items": [
                {"service_date": fixed_today.isoformat(), "item_text": "Day 1 Item"},
                {
                    "service_date": (fixed_today + timedelta(days=29)).isoformat(),
                    "item_text": "Day 30 Item",
                },
            ],
        },
    )
    assert res_valid.status_code == 201
    assert res_valid.json()["total_days"] == 2
    assert res_valid.json()["total_amount_paise"] == 20000


def test_pricing_and_webhook_idempotency_and_admin_schedule(
    client: TestClient, fixed_today: date
) -> None:
    d1 = fixed_today.isoformat()
    d2 = (fixed_today + timedelta(days=1)).isoformat()
    d3 = (fixed_today + timedelta(days=5)).isoformat()

    # 3 days -> ₹300 -> 30000 paise
    create_res = client.post(
        "/api/bookings",
        json={
            "customer_name": "Ananya Rao",
            "customer_phone": "+919876543210",
            "items": [
                {"service_date": d1, "item_text": "Oats Bowl"},
                {"service_date": d2, "item_text": "Fruit Salad"},
                {"service_date": d3, "item_text": "Sprouts Box"},
            ],
        },
    )
    assert create_res.status_code == 201
    booking = create_res.json()
    assert booking["total_days"] == 3
    assert booking["total_amount_paise"] == 30000
    assert booking["status"] == "PENDING"
    order_id = booking["gateway_order_id"]

    webhook_payload = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_999",
                        "order_id": order_id,
                    }
                }
            },
        }
    ).encode("utf-8")

    # Invalid signature must return 400
    bad_wh = client.post(
        "/api/webhooks/razorpay",
        content=webhook_payload,
        headers={"X-Razorpay-Signature": "wrong_sig"},
    )
    assert bad_wh.status_code == 400

    # Valid signature marks booking PAID
    valid_sig = _sign("test_webhook_secret", webhook_payload)
    good_wh = client.post(
        "/api/webhooks/razorpay",
        content=webhook_payload,
        headers={"X-Razorpay-Signature": valid_sig},
    )
    assert good_wh.status_code == 200
    assert good_wh.json()["status"] == "paid"

    # Duplicate webhook call must be idempotent
    dup_wh = client.post(
        "/api/webhooks/razorpay",
        content=webhook_payload,
        headers={"X-Razorpay-Signature": valid_sig},
    )
    assert dup_wh.status_code == 200
    assert dup_wh.json()["status"] == "already_paid"

    # Booking status endpoint reflects PAID
    status_res = client.get(f"/api/bookings/{booking['booking_id']}")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "PAID"
    assert status_res.json()["gateway_payment_id"] == "pay_test_999"

    # Admin schedule groups chronologically by date
    admin_res = client.get("/api/admin/schedule-by-date")
    assert admin_res.status_code == 200
    schedule = admin_res.json()
    assert schedule["total_orders"] == 3
    assert schedule["total_amount_paise"] == 30000
    assert [g["service_date"] for g in schedule["groups"]] == [d1, d2, d3]

    # Admin CSV export
    csv_res = client.get("/api/admin/export-csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Ananya Rao" in csv_res.text
    assert "Oats Bowl" in csv_res.text
