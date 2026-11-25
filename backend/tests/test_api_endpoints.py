import hashlib
import hmac
import json
from datetime import date, timedelta

from fastapi.testclient import TestClient


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_calendar_window_returns_30_days_with_default_mass_schedules(
    client: TestClient, fixed_today: date
) -> None:
    window = client.get("/api/calendar-window")
    assert window.status_code == 200
    data = window.json()
    assert data["start_date"] == fixed_today.isoformat()
    assert data["end_date"] == (fixed_today + timedelta(days=29)).isoformat()
    assert data["days"] == 30
    assert data["default_price_per_mass_paise"] == 10000
    assert data["max_intention_length"] == 50
    assert len(data["schedule"]) == 30

    for day in data["schedule"]:
        if day["is_sunday"]:
            assert len(day["masses"]) == 3
        else:
            assert len(day["masses"]) == 2


def test_feast_day_override_updates_calendar_and_accepts_booking(
    client: TestClient, fixed_today: date
) -> None:
    feast_date = (fixed_today + timedelta(days=3)).isoformat()
    ov_res = client.put(
        "/api/admin/overrides",
        json={
            "service_date": feast_date,
            "occasion_label": "St. Cecilia Feast",
            "masses": [
                {"mass_time": "06:00 AM", "language": "Tamil", "sort_order": 1},
                {"mass_time": "07:00 AM", "language": "Telugu", "sort_order": 2},
                {"mass_time": "08:00 AM", "language": "English", "sort_order": 3},
            ],
        },
    )
    assert ov_res.status_code == 200
    assert ov_res.json()["is_override"] is True
    assert len(ov_res.json()["masses"]) == 3

    # Booking a feast mass works without phone number and with optional name
    book_res = client.post(
        "/api/bookings",
        json={
            "customer_name": None,
            "items": [
                {
                    "service_date": feast_date,
                    "mass_label": "06:00 AM (Tamil)",
                    "intention_text": "Departed soul of Anthony",
                },
                {
                    "service_date": feast_date,
                    "mass_label": "08:00 AM (English)",
                    "intention_text": "Thanksgiving mass for family",
                },
            ],
        },
    )
    assert book_res.status_code == 201
    assert book_res.json()["total_masses"] == 2
    assert book_res.json()["total_amount_paise"] == 20000


def test_invalid_mass_slot_and_50_char_limit_rejected(
    client: TestClient, fixed_today: date
) -> None:
    d1 = fixed_today.isoformat()
    # Non-existent Mass timing rejected
    bad_slot = client.post(
        "/api/bookings",
        json={
            "items": [
                {
                    "service_date": d1,
                    "mass_label": "11:00 PM (Latin)",
                    "intention_text": "Special intention",
                }
            ]
        },
    )
    assert bad_slot.status_code == 422

    # > 50 character intention rejected
    too_long = client.post(
        "/api/bookings",
        json={
            "items": [
                {
                    "service_date": d1,
                    "mass_label": "06:00 AM (Telugu)",
                    "intention_text": "A" * 51,
                }
            ]
        },
    )
    assert too_long.status_code == 422


def test_webhook_idempotency_day_mass_admin_grouping_and_tally(
    client: TestClient, fixed_today: date
) -> None:
    d1 = fixed_today.isoformat()
    create_res = client.post(
        "/api/bookings",
        json={
            "customer_name": "Ananya",
            "items": [
                {
                    "service_date": d1,
                    "mass_label": "06:00 AM (Telugu)",
                    "intention_text": "Thanksgiving mass",
                }
            ],
        },
    )
    assert create_res.status_code == 201
    booking = create_res.json()
    order_id = booking["gateway_order_id"]

    webhook_payload = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {"entity": {"id": "pay_mass_1", "order_id": order_id}}
            },
        }
    ).encode("utf-8")

    sig = _sign("test_webhook_secret", webhook_payload)
    good_wh = client.post(
        "/api/webhooks/razorpay",
        content=webhook_payload,
        headers={"X-Razorpay-Signature": sig},
    )
    assert good_wh.status_code == 200
    assert good_wh.json()["status"] == "paid"

    # Admin schedule groups day-wise -> mass-wise
    admin_res = client.get("/api/admin/schedule-by-date")
    assert admin_res.status_code == 200
    schedule = admin_res.json()
    assert schedule["total_offerings"] == 1
    assert schedule["groups"][0]["masses"][0]["mass_label"] == "06:00 AM (Telugu)"

    # Payment tally reflects 1 PAID order
    tally_res = client.get("/api/admin/payment-tally")
    assert tally_res.status_code == 200
    tally = tally_res.json()
    assert tally["paid_count"] == 1
    assert tally["paid_amount_paise"] == 10000
    assert len(tally["recent_logs"]) >= 2
