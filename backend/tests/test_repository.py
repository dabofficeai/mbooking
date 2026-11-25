from datetime import date, timedelta

from sqlalchemy.orm import Session

from models.booking import (
    Booking,
    BookingItem,
    BookingStatus,
    MassDateOverride,
)
from repositories.booking_repo import BookingRepository


def test_multi_user_same_mass_inserts_and_chronological_query(
    db_session: Session,
) -> None:
    repo = BookingRepository(db_session)
    d1 = date(2026, 11, 20)
    d2 = d1 + timedelta(days=2)

    b1 = Booking(
        id="booking-a",
        customer_name="Aarav",
        total_masses=2,
        total_amount_paise=20000,
        gateway_name="fake",
        gateway_order_id="order_a",
        status=BookingStatus.PAID.value,
    )
    repo.create_booking(
        b1,
        [
            BookingItem(
                booking_id="booking-a",
                service_date=d2,
                mass_time="06:00 AM",
                mass_language="Telugu",
                mass_label="06:00 AM (Telugu)",
                intention_text="Thanksgiving mass",
                amount_paise=10000,
            ),
            BookingItem(
                booking_id="booking-a",
                service_date=d1,
                mass_time="06:00 AM",
                mass_language="Telugu",
                mass_label="06:00 AM (Telugu)",
                intention_text="Departed soul of Joseph",
                amount_paise=10000,
            ),
        ],
    )

    # Second devotee books the exact same Mass on d1 (open unlimited capacity)
    b2 = Booking(
        id="booking-b",
        customer_name=None,
        total_masses=1,
        total_amount_paise=10000,
        gateway_name="fake",
        gateway_order_id="order_b",
        status=BookingStatus.PAID.value,
    )
    repo.create_booking(
        b2,
        [
            BookingItem(
                booking_id="booking-b",
                service_date=d1,
                mass_time="06:00 AM",
                mass_language="Telugu",
                mass_label="06:00 AM (Telugu)",
                intention_text="Special intention of Mary",
                amount_paise=10000,
            )
        ],
    )

    # Pending booking must NOT appear in paid schedule
    b3 = Booking(
        id="booking-c",
        customer_name="Pending User",
        total_masses=1,
        total_amount_paise=10000,
        gateway_name="fake",
        gateway_order_id="order_c",
        status=BookingStatus.PENDING.value,
    )
    repo.create_booking(
        b3,
        [
            BookingItem(
                booking_id="booking-c",
                service_date=d1,
                mass_time="06:00 PM",
                mass_language="English",
                mass_label="06:00 PM (English)",
                intention_text="Unpaid intention",
                amount_paise=10000,
            )
        ],
    )

    rows = repo.get_paid_items_chronological()
    assert len(rows) == 3
    assert [item.service_date for item, _ in rows] == [d1, d1, d2]


def test_mark_paid_creates_payment_log_and_updates_status(
    db_session: Session,
) -> None:
    repo = BookingRepository(db_session)
    booking = Booking(
        id="booking-mark",
        customer_name="Riya",
        total_masses=1,
        total_amount_paise=10000,
        gateway_name="fake",
        gateway_order_id="order_mark",
        status=BookingStatus.PENDING.value,
    )
    repo.create_booking(
        booking,
        [
            BookingItem(
                booking_id="booking-mark",
                service_date=date(2026, 11, 21),
                mass_time="06:00 AM",
                mass_language="Telugu",
                mass_label="06:00 AM (Telugu)",
                intention_text="Thanksgiving mass",
                amount_paise=10000,
            )
        ],
    )

    fetched = repo.get_by_gateway_order_id("order_mark")
    assert fetched is not None
    updated = repo.mark_paid(fetched, "pay_12345", event_type="WEBHOOK_PAID")
    assert updated.status == BookingStatus.PAID.value
    assert updated.gateway_payment_id == "pay_12345"

    logs = repo.get_recent_payment_logs(limit=5)
    assert len(logs) == 1
    assert logs[0].event_type == "WEBHOOK_PAID"
    assert logs[0].status == BookingStatus.PAID.value


def test_date_override_replaces_schedule_for_feast_day(
    db_session: Session,
) -> None:
    repo = BookingRepository(db_session)
    feast_date = date(2026, 11, 24)
    repo.replace_date_override(
        feast_date,
        [
            MassDateOverride(
                service_date=feast_date,
                occasion_label="Feast Day",
                mass_time="06:00 AM",
                language="Tamil",
                sort_order=1,
            ),
            MassDateOverride(
                service_date=feast_date,
                occasion_label="Feast Day",
                mass_time="07:00 AM",
                language="Telugu",
                sort_order=2,
            ),
            MassDateOverride(
                service_date=feast_date,
                occasion_label="Feast Day",
                mass_time="08:00 AM",
                language="English",
                sort_order=3,
            ),
        ],
    )
    found = repo.get_overrides_in_range(feast_date, feast_date)
    assert len(found) == 3
    assert [m.language for m in found] == ["Tamil", "Telugu", "English"]
