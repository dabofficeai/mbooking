import enum
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class BookingStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"


class MassDefaultRule(Base):
    """Configurable default Mass timings for WEEKDAY vs SUNDAY."""

    __tablename__ = "mass_default_rules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    day_type: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True
    )  # "WEEKDAY" or "SUNDAY"
    mass_time: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. "06:00 AM"
    language: Mapped[str] = mapped_column(String(40), nullable=False)  # e.g. "Telugu"
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    amount_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MassDateOverride(Base):
    """Date-specific Mass schedule overrides (e.g., Feast days, Holy days)."""

    __tablename__ = "mass_date_overrides"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    occasion_label: Mapped[str] = mapped_column(
        String(80), nullable=False, default="Feast Day"
    )
    mass_time: Mapped[str] = mapped_column(String(20), nullable=False)
    language: Mapped[str] = mapped_column(String(40), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    amount_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Booking(Base):
    """Order header representing a combined multi-Mass booking payment."""

    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    total_masses: Mapped[int] = mapped_column(Integer, nullable=False)
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
    payment_logs: Mapped[list["PaymentLog"]] = relationship(
        "PaymentLog",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="PaymentLog.created_at",
    )


class BookingItem(Base):
    """Per-Mass offering line item belonging to a parent Booking order."""

    __tablename__ = "booking_items"
    __table_args__ = (
        UniqueConstraint(
            "booking_id", "service_date", "mass_label",
            name="uq_booking_date_mass",
        ),
    )

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
    mass_time: Mapped[str] = mapped_column(String(20), nullable=False)
    mass_language: Mapped[str] = mapped_column(String(40), nullable=False)
    mass_label: Mapped[str] = mapped_column(
        String(80), nullable=False, index=True
    )  # e.g. "06:00 AM (Telugu)"
    intention_text: Mapped[str] = mapped_column(String(50), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)

    booking: Mapped["Booking"] = relationship("Booking", back_populates="items")


class PaymentLog(Base):
    """Lightweight audit log for tracing payment successes/failures at end of day."""

    __tablename__ = "payment_logs"

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
    gateway_name: Mapped[str] = mapped_column(String(32), nullable=False)
    gateway_order_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    event_type: Mapped[str] = mapped_column(
        String(40), nullable=False
    )  # ORDER_CREATED, PAYMENT_VERIFIED, WEBHOOK_PAID, WEBHOOK_FAILED, FAKE_CONFIRMED
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    booking: Mapped["Booking"] = relationship("Booking", back_populates="payment_logs")
