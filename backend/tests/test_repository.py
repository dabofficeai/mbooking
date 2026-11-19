from datetime import date, timedelta

from sqlalchemy.orm import Session

from models.booking import Booking, BookingItem, BookingStatus
from repositories.booking_repo import BookingRepository


def test_multi_user_same_date_inserts_and_chronological_query(
    db_session: Session,
) -> None:
    repo = BookingRepository(db_session)
    d1 = date(2026, 11, 20)
    d2 = d1 + timedelta(days=2)

    # User A books d1 and d2 (PAID)
    b1 = Booking(
        id="booking-a",
        customer_name="Aarav Sharma",
        customer_phone="9876543210",
        total_days=2,
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
                item_text="Filter Coffee Pack",
                amount_paise=10000,
            ),
            BookingItem(
                booking_id="booking-a",
                service_date=d1,
                item_text="Masala Chai",
                amount_paise=10000,
            ),
        ],
    )

    # User B also books d1 (PAID) - open multi-user capacity
    b2 = Booking(
        id="booking-b",
        customer_name="Priya Nair",
        customer_phone="9123456789",
        total_days=1,
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
                item_text="Cold Brew Bottle",
                amount_paise=10000,
            )
        ],
    )

    # User C books d1 (PENDING) - must NOT appear in paid schedule
    b3 = Booking(
        id="booking-c",
        customer_name="Pending User",
        customer_phone="9000000000",
        total_days=1,
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
                item_text="Unpaid Item",
                amount_paise=10000,
            )
        ],
    )

    rows = repo.get_paid_items_chronological()
    assert len(rows) == 3

    dates = [item.service_date for item, _ in rows]
    assert dates == [d1, d1, d2]

    d1_customers = {booking.customer_name for item, booking in rows if item.service_date == d1}
    assert d1_customers == {"Aarav Sharma", "Priya Nair"}


def test_mark_paid_updates_status_and_payment_id(db_session: Session) -> None:
    repo = BookingRepository(db_session)
    booking = Booking(
        id="booking-mark",
        customer_name="Rohan",
        customer_phone="9988776655",
        total_days=1,
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
                item_text="Green Tea",
                amount_paise=10000,
            )
        ],
    )

    fetched = repo.get_by_gateway_order_id("order_mark")
    assert fetched is not None
    assert fetched.status == BookingStatus.PENDING.value

    updated = repo.mark_paid(fetched, "pay_12345")
    assert updated.status == BookingStatus.PAID.value
    assert updated.gateway_payment_id == "pay_12345"
