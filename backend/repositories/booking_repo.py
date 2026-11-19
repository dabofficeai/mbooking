from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from models.booking import Booking, BookingItem, BookingStatus


class BookingRepository:
    """Pure Data Access Layer for Booking and BookingItem entities."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_booking(
        self, booking: Booking, items: list[BookingItem]
    ) -> Booking:
        booking.items = items
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)
        return booking

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
        self, booking: Booking, gateway_payment_id: Optional[str]
    ) -> Booking:
        booking.status = BookingStatus.PAID.value
        if gateway_payment_id:
            booking.gateway_payment_id = gateway_payment_id
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)
        return booking

    def mark_failed(self, booking: Booking) -> Booking:
        booking.status = BookingStatus.FAILED.value
        self.db.add(booking)
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
            Booking.created_at.asc(),
            BookingItem.id.asc(),
        )
        return list(self.db.execute(stmt).all())
