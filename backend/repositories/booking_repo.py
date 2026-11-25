from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from models.booking import (
    Booking,
    BookingItem,
    BookingStatus,
    MassDateOverride,
    MassDefaultRule,
    PaymentLog,
)


class BookingRepository:
    """Pure Data Access Layer for Mass Booking, Schedules, and Payment Logs."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def ensure_default_mass_rules_seeded(self) -> None:
        """Seed sensible weekday & Sunday default Mass rules if table is empty."""
        count = self.db.execute(
            select(func.count()).select_from(MassDefaultRule)
        ).scalar_one()
        if count > 0:
            return

        defaults = [
            MassDefaultRule(
                day_type="WEEKDAY", mass_time="06:00 AM", language="Telugu", sort_order=1
            ),
            MassDefaultRule(
                day_type="WEEKDAY", mass_time="06:00 PM", language="English", sort_order=2
            ),
            MassDefaultRule(
                day_type="SUNDAY", mass_time="06:00 AM", language="Telugu", sort_order=1
            ),
            MassDefaultRule(
                day_type="SUNDAY", mass_time="07:00 AM", language="English", sort_order=2
            ),
            MassDefaultRule(
                day_type="SUNDAY", mass_time="06:00 PM", language="English", sort_order=3
            ),
        ]
        self.db.add_all(defaults)
        self.db.commit()

    def get_active_default_rules(self) -> list[MassDefaultRule]:
        stmt = (
            select(MassDefaultRule)
            .where(MassDefaultRule.is_active.is_(True))
            .order_by(MassDefaultRule.day_type.asc(), MassDefaultRule.sort_order.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def replace_default_rules(
        self, day_type: str, rules: list[MassDefaultRule]
    ) -> list[MassDefaultRule]:
        self.db.execute(
            delete(MassDefaultRule).where(MassDefaultRule.day_type == day_type)
        )
        self.db.add_all(rules)
        self.db.commit()
        return self.get_active_default_rules()

    def get_overrides_in_range(
        self, start_date: date, end_date: date
    ) -> list[MassDateOverride]:
        stmt = (
            select(MassDateOverride)
            .where(
                MassDateOverride.is_active.is_(True),
                MassDateOverride.service_date >= start_date,
                MassDateOverride.service_date <= end_date,
            )
            .order_by(
                MassDateOverride.service_date.asc(),
                MassDateOverride.sort_order.asc(),
            )
        )
        return list(self.db.execute(stmt).scalars().all())

    def replace_date_override(
        self,
        service_date: date,
        overrides: list[MassDateOverride],
    ) -> list[MassDateOverride]:
        self.db.execute(
            delete(MassDateOverride).where(
                MassDateOverride.service_date == service_date
            )
        )
        self.db.add_all(overrides)
        self.db.commit()
        return overrides

    def delete_date_override(self, service_date: date) -> int:
        res = self.db.execute(
            delete(MassDateOverride).where(
                MassDateOverride.service_date == service_date
            )
        )
        self.db.commit()
        return res.rowcount or 0

    def create_booking(
        self,
        booking: Booking,
        items: list[BookingItem],
        initial_log: Optional[PaymentLog] = None,
    ) -> Booking:
        booking.items = items
        self.db.add(booking)
        if initial_log is not None:
            self.db.add(initial_log)
        self.db.commit()
        self.db.refresh(booking)
        return booking

    def add_payment_log(self, log: PaymentLog) -> PaymentLog:
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_by_id(self, booking_id: str) -> Optional[Booking]:
        stmt = (
            select(Booking)
            .options(joinedload(Booking.items))
            .where(Booking.id == booking_id)
        )
        return self.db.execute(stmt).unique().scalar_one_or_none()

    def get_by_gateway_order_id(self, gateway_order_id: str) -> Optional[Booking]:
        stmt = (
            select(Booking)
            .options(joinedload(Booking.items))
            .where(Booking.gateway_order_id == gateway_order_id)
        )
        return self.db.execute(stmt).unique().scalar_one_or_none()

    def mark_paid(
        self,
        booking: Booking,
        gateway_payment_id: Optional[str],
        event_type: str = "WEBHOOK_PAID",
        note: Optional[str] = None,
    ) -> Booking:
        booking.status = BookingStatus.PAID.value
        if gateway_payment_id:
            booking.gateway_payment_id = gateway_payment_id
        self.db.add(booking)
        self.db.add(
            PaymentLog(
                booking_id=booking.id,
                gateway_name=booking.gateway_name,
                gateway_order_id=booking.gateway_order_id,
                gateway_payment_id=gateway_payment_id,
                event_type=event_type,
                status=BookingStatus.PAID.value,
                amount_paise=booking.total_amount_paise,
                note=note,
            )
        )
        self.db.commit()
        self.db.refresh(booking)
        return booking

    def mark_failed(
        self,
        booking: Booking,
        gateway_payment_id: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Booking:
        booking.status = BookingStatus.FAILED.value
        if gateway_payment_id:
            booking.gateway_payment_id = gateway_payment_id
        self.db.add(booking)
        self.db.add(
            PaymentLog(
                booking_id=booking.id,
                gateway_name=booking.gateway_name,
                gateway_order_id=booking.gateway_order_id,
                gateway_payment_id=gateway_payment_id,
                event_type="WEBHOOK_FAILED",
                status=BookingStatus.FAILED.value,
                amount_paise=booking.total_amount_paise,
                note=note,
            )
        )
        self.db.commit()
        self.db.refresh(booking)
        return booking

    def get_paid_items_chronological(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[tuple[BookingItem, Booking]]:
        stmt = (
            select(BookingItem, Booking)
            .join(Booking, BookingItem.booking_id == Booking.id)
            .where(Booking.status == BookingStatus.PAID.value)
        )
        if start_date is not None:
            stmt = stmt.where(BookingItem.service_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(BookingItem.service_date <= end_date)
        stmt = stmt.order_by(
            BookingItem.service_date.asc(),
            BookingItem.mass_time.asc(),
            Booking.created_at.asc(),
            BookingItem.id.asc(),
        )
        return list(self.db.execute(stmt).all())

    def get_bookings_for_tally(
        self,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
    ) -> list[Booking]:
        stmt = select(Booking)
        if start_dt is not None:
            stmt = stmt.where(Booking.created_at >= start_dt)
        if end_dt is not None:
            stmt = stmt.where(Booking.created_at <= end_dt)
        stmt = stmt.order_by(Booking.created_at.desc())
        return list(self.db.execute(stmt).scalars().all())

    def get_recent_payment_logs(self, limit: int = 50) -> list[PaymentLog]:
        stmt = (
            select(PaymentLog)
            .order_by(PaymentLog.created_at.desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())
