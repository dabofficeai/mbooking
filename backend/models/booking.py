import enum
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class BookingStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"


class Booking(Base):
    """Order header representing a single combined multi-date booking payment."""

    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    customer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    total_days: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    gateway_name: Mapped[str] = mapped_column(
        String(32), nullable=False, default="razorpay"
    )
    gateway_order_id: Mapped[str] = mapped_column(
        String(120), unique=True, index=True, nullable=False
    )
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BookingStatus.PENDING.value, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    items: Mapped[list["BookingItem"]] = relationship(
        "BookingItem",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingItem.service_date",
    )


class BookingItem(Base):
    """Per-date line item belonging to a parent Booking order."""

    __tablename__ = "booking_items"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    booking_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    item_text: Mapped[str] = mapped_column(String(120), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)

    booking: Mapped["Booking"] = relationship("Booking", back_populates="items")
