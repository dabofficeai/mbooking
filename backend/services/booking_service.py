import csv
import io
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Callable, Optional
from zoneinfo import ZoneInfo

from gateways.base import PaymentProvider
from models.booking import Booking, BookingItem, BookingStatus
from repositories.booking_repo import BookingRepository
from schemas.booking_schema import (
    AdminScheduleDateGroup,
    AdminScheduleItem,
    AdminScheduleResponse,
    BookingItemResponse,
    BookingStatusResponse,
    CalendarWindowResponse,
    CreateBookingRequest,
    CreateBookingResponse,
)

IST = ZoneInfo("Asia/Kolkata")
PRICE_PER_DAY_PAISE = 10000  # ₹100.00 per day
BOOKING_WINDOW_DAYS = 30


class BookingNotFoundError(Exception):
    """Raised when a booking record cannot be found."""


class BookingValidationError(Exception):
    """Raised when business rules (e.g. 30-day window) are violated."""


class WebhookVerificationError(Exception):
    """Raised when payment webhook signature or payload is invalid."""


class BookingService:
    """Pure Business Logic Layer coordinating repository and payment gateway."""

    def __init__(
        self,
        repo: BookingRepository,
        payment_provider: PaymentProvider,
        today_provider: Optional[Callable[[], date]] = None,
        price_per_day_paise: int = PRICE_PER_DAY_PAISE,
        window_days: int = BOOKING_WINDOW_DAYS,
    ) -> None:
        self.repo = repo
        self.payment_provider = payment_provider
        self._today_provider = today_provider or (lambda: datetime.now(IST).date())
        self.price_per_day_paise = price_per_day_paise
        self.window_days = window_days

    def get_calendar_window(self) -> CalendarWindowResponse:
        today = self._today_provider()
        end_date = today + timedelta(days=self.window_days - 1)
        return CalendarWindowResponse(
            start_date=today,
            end_date=end_date,
            days=self.window_days,
            price_per_day_paise=self.price_per_day_paise,
            timezone="Asia/Kolkata",
        )

    def _validate_dates_in_window(self, dates: list[date]) -> None:
        today = self._today_provider()
        max_date = today + timedelta(days=self.window_days - 1)
        for d in dates:
            if d < today:
                raise BookingValidationError(
                    f"Date {d.isoformat()} is in the past. Booking starts today ({today.isoformat()})."
                )
            if d > max_date:
                raise BookingValidationError(
                    f"Date {d.isoformat()} exceeds the {self.window_days}-day booking window ending {max_date.isoformat()}."
                )

    def create_booking(
        self, payload: CreateBookingRequest
    ) -> CreateBookingResponse:
        sorted_items = sorted(payload.items, key=lambda item: item.service_date)
        self._validate_dates_in_window([item.service_date for item in sorted_items])

        total_days = len(sorted_items)
        total_amount_paise = total_days * self.price_per_day_paise

        booking_id = str(uuid.uuid4())
        receipt = f"rcpt_{booking_id[:16]}"
        order_result = self.payment_provider.create_order(
            amount_paise=total_amount_paise,
            receipt=receipt,
            notes={
                "booking_id": booking_id,
                "customer_name": payload.customer_name,
                "total_days": str(total_days),
            },
        )

        booking = Booking(
            id=booking_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            total_days=total_days,
            total_amount_paise=total_amount_paise,
            gateway_name=order_result.gateway_name,
            gateway_order_id=order_result.order_id,
            status=BookingStatus.PENDING.value,
        )
        booking_items = [
            BookingItem(
                booking_id=booking_id,
                service_date=item.service_date,
                item_text=item.item_text,
                amount_paise=self.price_per_day_paise,
            )
            for item in sorted_items
        ]

        saved = self.repo.create_booking(booking, booking_items)
        return CreateBookingResponse(
            booking_id=saved.id,
            gateway_name=saved.gateway_name,
            gateway_order_id=saved.gateway_order_id,
            total_days=saved.total_days,
            total_amount_paise=saved.total_amount_paise,
            currency="INR",
            status=saved.status,
            items=[BookingItemResponse.model_validate(i) for i in saved.items],
        )

    def get_booking_status(self, booking_id: str) -> BookingStatusResponse:
        booking = self.repo.get_by_id(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found.")
        return BookingStatusResponse(
            booking_id=booking.id,
            customer_name=booking.customer_name,
            customer_phone=booking.customer_phone,
            total_days=booking.total_days,
            total_amount_paise=booking.total_amount_paise,
            gateway_name=booking.gateway_name,
            gateway_order_id=booking.gateway_order_id,
            gateway_payment_id=booking.gateway_payment_id,
            status=booking.status,
            created_at=booking.created_at,
            items=[BookingItemResponse.model_validate(i) for i in booking.items],
        )

    def confirm_fake_payment(self, booking_id: str) -> BookingStatusResponse:
        booking = self.repo.get_by_id(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found.")
        if booking.gateway_name != "fake":
            raise BookingValidationError(
                "Fake payment confirmation is only allowed for fake gateway bookings."
            )
        if booking.status != BookingStatus.PAID.value:
            booking = self.repo.mark_paid(
                booking, f"pay_fake_{booking.id[:12]}"
            )
        return self.get_booking_status(booking.id)

    def handle_razorpay_webhook(
        self, raw_body: bytes, signature: str
    ) -> dict[str, str]:
        try:
            event = self.payment_provider.verify_webhook(raw_body, signature)
        except ValueError as exc:
            raise WebhookVerificationError(str(exc)) from exc

        booking = self.repo.get_by_gateway_order_id(event.order_id)
        if not booking:
            raise BookingNotFoundError(
                f"No booking found for gateway order {event.order_id}."
            )

        # Idempotency guard: never duplicate or revert an already PAID booking
        if booking.status == BookingStatus.PAID.value:
            return {
                "status": "already_paid",
                "booking_id": booking.id,
                "gateway_order_id": booking.gateway_order_id,
            }

        if event.is_payment_captured:
            updated = self.repo.mark_paid(booking, event.payment_id)
            return {
                "status": "paid",
                "booking_id": updated.id,
                "gateway_order_id": updated.gateway_order_id,
            }

        if event.is_payment_failed and booking.status == BookingStatus.PENDING.value:
            updated = self.repo.mark_failed(booking)
            return {
                "status": "failed",
                "booking_id": updated.id,
                "gateway_order_id": updated.gateway_order_id,
            }

        return {
            "status": "ignored",
            "booking_id": booking.id,
            "gateway_order_id": booking.gateway_order_id,
        }

    def get_admin_schedule_by_date(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> AdminScheduleResponse:
        rows = self.repo.get_paid_items_chronological(
            start_date=start_date, end_date=end_date
        )

        grouped: dict[date, list[AdminScheduleItem]] = defaultdict(list)
        for item, booking in rows:
            grouped[item.service_date].append(
                AdminScheduleItem(
                    booking_id=booking.id,
                    customer_name=booking.customer_name,
                    customer_phone=booking.customer_phone,
                    item_text=item.item_text,
                    amount_paise=item.amount_paise,
                    gateway_payment_id=booking.gateway_payment_id,
                )
            )

        groups: list[AdminScheduleDateGroup] = []
        total_orders = 0
        total_amount_paise = 0

        for svc_date in sorted(grouped.keys()):
            orders = grouped[svc_date]
            day_total = sum(o.amount_paise for o in orders)
            total_orders += len(orders)
            total_amount_paise += day_total
            groups.append(
                AdminScheduleDateGroup(
                    service_date=svc_date,
                    formatted_date=svc_date.strftime("%a, %d %b %Y"),
                    order_count=len(orders),
                    total_amount_paise=day_total,
                    orders=orders,
                )
            )

        return AdminScheduleResponse(
            total_orders=total_orders,
            total_amount_paise=total_amount_paise,
            groups=groups,
        )

    def export_admin_schedule_csv(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> str:
        schedule = self.get_admin_schedule_by_date(
            start_date=start_date, end_date=end_date
        )
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "service_date",
                "formatted_date",
                "booking_id",
                "customer_name",
                "customer_phone",
                "item_text",
                "amount_inr",
                "gateway_payment_id",
            ]
        )
        for group in schedule.groups:
            for order in group.orders:
                writer.writerow(
                    [
                        group.service_date.isoformat(),
                        group.formatted_date,
                        order.booking_id,
                        order.customer_name,
                        order.customer_phone,
                        order.item_text,
                        f"{order.amount_paise / 100:.2f}",
                        order.gateway_payment_id or "",
                    ]
                )
        return output.getvalue()