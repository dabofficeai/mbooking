import csv
import hashlib
import hmac
import io
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, Optional
from zoneinfo import ZoneInfo

from gateways.base import PaymentProvider
from models.booking import (
    Booking,
    BookingItem,
    BookingStatus,
    MassDateOverride,
    MassDefaultRule,
    PaymentLog,
)
from repositories.booking_repo import BookingRepository
from schemas.booking_schema import (
    AdminMassGroup,
    AdminOfferingItem,
    AdminScheduleDateGroup,
    AdminScheduleResponse,
    BookingItemResponse,
    BookingStatusResponse,
    CalendarDaySchedule,
    CalendarWindowResponse,
    CreateBookingRequest,
    CreateBookingResponse,
    DefaultRuleItemResponse,
    MassSlotInfo,
    PaymentLogItem,
    PaymentTallyResponse,
    UpsertDateOverrideRequest,
    UpsertDefaultRulesRequest,
    VerifyPaymentRequest,
)

IST = ZoneInfo("Asia/Kolkata")
PRICE_PER_MASS_PAISE = 10000  # ₹100.00 per Mass offering
BOOKING_WINDOW_DAYS = 30


class BookingNotFoundError(Exception):
    """Raised when a booking record cannot be found."""


class BookingValidationError(Exception):
    """Raised when business rules (window, Mass slot, etc.) are violated."""


class WebhookVerificationError(Exception):
    """Raised when payment webhook signature or payload is invalid."""


def format_mass_label(mass_time: str, language: str) -> str:
    return f"{mass_time.strip()} ({language.strip()})"


class BookingService:
    """Pure Business Logic Layer coordinating Mass schedules, bookings, and payment logs."""

    def __init__(
        self,
        repo: BookingRepository,
        payment_provider: PaymentProvider,
        today_provider: Optional[Callable[[], date]] = None,
        price_per_mass_paise: int = PRICE_PER_MASS_PAISE,
        window_days: int = BOOKING_WINDOW_DAYS,
    ) -> None:
        self.repo = repo
        self.payment_provider = payment_provider
        self._today_provider = today_provider or (lambda: datetime.now(IST).date())
        self.price_per_mass_paise = price_per_mass_paise
        self.window_days = window_days

    def _build_schedule_map(
        self, start_date: date, end_date: date
    ) -> dict[date, CalendarDaySchedule]:
        self.repo.ensure_default_mass_rules_seeded()
        default_rules = self.repo.get_active_default_rules()
        overrides = self.repo.get_overrides_in_range(start_date, end_date)

        defaults_by_type: dict[str, list[MassSlotInfo]] = defaultdict(list)
        for rule in default_rules:
            defaults_by_type[rule.day_type].append(
                MassSlotInfo(
                    mass_time=rule.mass_time,
                    language=rule.language,
                    mass_label=format_mass_label(rule.mass_time, rule.language),
                    amount_paise=rule.amount_paise or self.price_per_mass_paise,
                    sort_order=rule.sort_order,
                )
            )

        overrides_by_date: dict[date, list[MassDateOverride]] = defaultdict(list)
        for ov in overrides:
            overrides_by_date[ov.service_date].append(ov)

        schedule_map: dict[date, CalendarDaySchedule] = {}
        total_days = (end_date - start_date).days + 1
        for offset in range(total_days):
            current = start_date + timedelta(days=offset)
            is_sunday = current.weekday() == 6

            if current in overrides_by_date:
                day_overrides = overrides_by_date[current]
                masses = [
                    MassSlotInfo(
                        mass_time=ov.mass_time,
                        language=ov.language,
                        mass_label=format_mass_label(ov.mass_time, ov.language),
                        amount_paise=ov.amount_paise or self.price_per_mass_paise,
                        sort_order=ov.sort_order,
                    )
                    for ov in day_overrides
                ]
                schedule_map[current] = CalendarDaySchedule(
                    service_date=current,
                    is_sunday=is_sunday,
                    is_override=True,
                    occasion_label=day_overrides[0].occasion_label,
                    masses=masses,
                )
            else:
                day_type = "SUNDAY" if is_sunday else "WEEKDAY"
                masses = list(defaults_by_type.get(day_type, []))
                schedule_map[current] = CalendarDaySchedule(
                    service_date=current,
                    is_sunday=is_sunday,
                    is_override=False,
                    occasion_label="Sunday" if is_sunday else None,
                    masses=masses,
                )

        return schedule_map

    def get_calendar_window(self) -> CalendarWindowResponse:
        today = self._today_provider()
        end_date = today + timedelta(days=self.window_days - 1)
        schedule_map = self._build_schedule_map(today, end_date)
        return CalendarWindowResponse(
            start_date=today,
            end_date=end_date,
            days=self.window_days,
            default_price_per_mass_paise=self.price_per_mass_paise,
            max_intention_length=50,
            timezone="Asia/Kolkata",
            schedule=[schedule_map[today + timedelta(days=i)] for i in range(self.window_days)],
        )

    def create_booking(
        self, payload: CreateBookingRequest
    ) -> CreateBookingResponse:
        today = self._today_provider()
        max_date = today + timedelta(days=self.window_days - 1)

        sorted_items = sorted(
            payload.items, key=lambda item: (item.service_date, item.mass_label)
        )
        for item in sorted_items:
            if item.service_date < today:
                raise BookingValidationError(
                    f"Date {item.service_date.isoformat()} is in the past. Booking starts today ({today.isoformat()})."
                )
            if item.service_date > max_date:
                raise BookingValidationError(
                    f"Date {item.service_date.isoformat()} exceeds the {self.window_days}-day booking window ending {max_date.isoformat()}."
                )

        schedule_map = self._build_schedule_map(today, max_date)

        resolved_items: list[tuple[date, MassSlotInfo, str]] = []
        for item in sorted_items:
            day_sched = schedule_map.get(item.service_date)
            slot_lookup = {
                m.mass_label: m for m in (day_sched.masses if day_sched else [])
            }
            matched_slot = slot_lookup.get(item.mass_label)
            if not matched_slot:
                raise BookingValidationError(
                    f"Mass timing '{item.mass_label}' is not scheduled on {item.service_date.isoformat()}."
                )
            resolved_items.append((item.service_date, matched_slot, item.intention_text))

        total_masses = len(resolved_items)
        total_amount_paise = sum(slot.amount_paise for _, slot, _ in resolved_items)

        booking_id = str(uuid.uuid4())
        receipt = f"rcpt_{booking_id[:16]}"
        order_result = self.payment_provider.create_order(
            amount_paise=total_amount_paise,
            receipt=receipt,
            notes={
                "booking_id": booking_id,
                "customer_name": payload.customer_name or "Devotee",
                "total_masses": str(total_masses),
            },
        )

        booking = Booking(
            id=booking_id,
            customer_name=payload.customer_name,
            total_masses=total_masses,
            total_amount_paise=total_amount_paise,
            gateway_name=order_result.gateway_name,
            gateway_order_id=order_result.order_id,
            status=BookingStatus.PENDING.value,
        )
        booking_items = [
            BookingItem(
                booking_id=booking_id,
                service_date=svc_date,
                mass_time=slot.mass_time,
                mass_language=slot.language,
                mass_label=slot.mass_label,
                intention_text=intention_text,
                amount_paise=slot.amount_paise,
            )
            for svc_date, slot, intention_text in resolved_items
        ]
        initial_log = PaymentLog(
            booking_id=booking_id,
            gateway_name=order_result.gateway_name,
            gateway_order_id=order_result.order_id,
            event_type="ORDER_CREATED",
            status=BookingStatus.PENDING.value,
            amount_paise=total_amount_paise,
            note=f"{total_masses} Mass offering(s)",
        )

        saved = self.repo.create_booking(booking, booking_items, initial_log)
        return CreateBookingResponse(
            booking_id=saved.id,
            customer_name=saved.customer_name,
            gateway_name=saved.gateway_name,
            gateway_order_id=saved.gateway_order_id,
            total_masses=saved.total_masses,
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
            total_masses=booking.total_masses,
            total_amount_paise=booking.total_amount_paise,
            gateway_name=booking.gateway_name,
            gateway_order_id=booking.gateway_order_id,
            gateway_payment_id=booking.gateway_payment_id,
            status=booking.status,
            created_at=booking.created_at,
            items=[BookingItemResponse.model_validate(i) for i in booking.items],
        )

    def verify_razorpay_payment(
        self, payload: VerifyPaymentRequest, key_secret: str
    ) -> BookingStatusResponse:
        if not key_secret:
            raise WebhookVerificationError("RAZORPAY_KEY_SECRET is not configured.")

        message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
        expected_sig = hmac.new(
            key_secret.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, payload.razorpay_signature):
            raise WebhookVerificationError("Invalid Razorpay payment signature.")

        booking = self.repo.get_by_id(payload.booking_id)
        if not booking or booking.gateway_order_id != payload.razorpay_order_id:
            raise BookingNotFoundError("Booking or order ID mismatch.")

        if booking.status != BookingStatus.PAID.value:
            self.repo.mark_paid(
                booking,
                payload.razorpay_payment_id,
                event_type="PAYMENT_VERIFIED",
                note="Verified via Razorpay Checkout callback",
            )
        return self.get_booking_status(booking.id)

    def confirm_fake_payment(self, booking_id: str) -> BookingStatusResponse:
        booking = self.repo.get_by_id(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found.")
        if booking.gateway_name != "fake":
            raise BookingValidationError(
                "Fake payment confirmation is only allowed for fake gateway bookings."
            )
        if booking.status != BookingStatus.PAID.value:
            self.repo.mark_paid(
                booking,
                f"pay_fake_{booking.id[:12]}",
                event_type="FAKE_CONFIRMED",
                note="Confirmed via fake gateway",
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

        if booking.status == BookingStatus.PAID.value:
            return {
                "status": "already_paid",
                "booking_id": booking.id,
                "gateway_order_id": booking.gateway_order_id,
            }

        if event.is_payment_captured:
            updated = self.repo.mark_paid(
                booking,
                event.payment_id,
                event_type="WEBHOOK_PAID",
                note=f"Webhook event: {event.event_type}",
            )
            return {
                "status": "paid",
                "booking_id": updated.id,
                "gateway_order_id": updated.gateway_order_id,
            }

        if event.is_payment_failed and booking.status == BookingStatus.PENDING.value:
            updated = self.repo.mark_failed(
                booking,
                gateway_payment_id=event.payment_id,
                note=f"Webhook event: {event.event_type}",
            )
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

        by_date: dict[date, dict[str, list[tuple[BookingItem, Booking]]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for item, booking in rows:
            by_date[item.service_date][item.mass_label].append((item, booking))

        groups: list[AdminScheduleDateGroup] = []
        total_offerings = 0
        total_amount_paise = 0

        for svc_date in sorted(by_date.keys()):
            mass_map = by_date[svc_date]
            mass_groups: list[AdminMassGroup] = []
            day_offerings = 0
            day_amount = 0

            for mass_label in sorted(mass_map.keys()):
                entries = mass_map[mass_label]
                first_item = entries[0][0]
                offerings = [
                    AdminOfferingItem(
                        booking_id=b.id,
                        customer_name=b.customer_name,
                        intention_text=i.intention_text,
                        amount_paise=i.amount_paise,
                        gateway_payment_id=b.gateway_payment_id,
                    )
                    for i, b in entries
                ]
                mass_amount = sum(o.amount_paise for o in offerings)
                day_offerings += len(offerings)
                day_amount += mass_amount
                mass_groups.append(
                    AdminMassGroup(
                        mass_label=mass_label,
                        mass_time=first_item.mass_time,
                        mass_language=first_item.mass_language,
                        offering_count=len(offerings),
                        total_amount_paise=mass_amount,
                        offerings=offerings,
                    )
                )

            total_offerings += day_offerings
            total_amount_paise += day_amount
            groups.append(
                AdminScheduleDateGroup(
                    service_date=svc_date,
                    formatted_date=svc_date.strftime("%a, %d %b %Y"),
                    is_sunday=svc_date.weekday() == 6,
                    offering_count=day_offerings,
                    total_amount_paise=day_amount,
                    masses=mass_groups,
                )
            )

        return AdminScheduleResponse(
            total_offerings=total_offerings,
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
                "mass_time",
                "mass_language",
                "mass_label",
                "booking_id",
                "customer_name",
                "intention_text",
                "amount_inr",
                "gateway_payment_id",
            ]
        )
        for group in schedule.groups:
            for mass in group.masses:
                for offering in mass.offerings:
                    writer.writerow(
                        [
                            group.service_date.isoformat(),
                            group.formatted_date,
                            mass.mass_time,
                            mass.mass_language,
                            mass.mass_label,
                            offering.booking_id,
                            offering.customer_name or "",
                            offering.intention_text,
                            f"{offering.amount_paise / 100:.2f}",
                            offering.gateway_payment_id or "",
                        ]
                    )
        return output.getvalue()

    def get_payment_tally(
        self, tally_date: Optional[date] = None
    ) -> PaymentTallyResponse:
        start_dt: Optional[datetime] = None
        end_dt: Optional[datetime] = None
        if tally_date is not None:
            start_ist = datetime.combine(tally_date, time.min, tzinfo=IST)
            end_ist = datetime.combine(tally_date, time.max, tzinfo=IST)
            start_dt = start_ist.astimezone(timezone.utc)
            end_dt = end_ist.astimezone(timezone.utc)

        bookings = self.repo.get_bookings_for_tally(start_dt=start_dt, end_dt=end_dt)
        paid = [b for b in bookings if b.status == BookingStatus.PAID.value]
        pending = [b for b in bookings if b.status == BookingStatus.PENDING.value]
        failed = [b for b in bookings if b.status == BookingStatus.FAILED.value]

        recent_logs = self.repo.get_recent_payment_logs(limit=40)
        return PaymentTallyResponse(
            paid_count=len(paid),
            paid_amount_paise=sum(b.total_amount_paise for b in paid),
            pending_count=len(pending),
            pending_amount_paise=sum(b.total_amount_paise for b in pending),
            failed_count=len(failed),
            failed_amount_paise=sum(b.total_amount_paise for b in failed),
            recent_logs=[PaymentLogItem.model_validate(l) for l in recent_logs],
        )

    def get_default_rules(self) -> list[DefaultRuleItemResponse]:
        self.repo.ensure_default_mass_rules_seeded()
        rules = self.repo.get_active_default_rules()
        return [DefaultRuleItemResponse.model_validate(r) for r in rules]

    def upsert_default_rules(
        self, payload: UpsertDefaultRulesRequest
    ) -> list[DefaultRuleItemResponse]:
        new_rules = [
            MassDefaultRule(
                day_type=payload.day_type,
                mass_time=m.mass_time.strip(),
                language=m.language.strip(),
                sort_order=m.sort_order,
                amount_paise=m.amount_paise,
                is_active=True,
            )
            for m in payload.masses
        ]
        updated = self.repo.replace_default_rules(payload.day_type, new_rules)
        return [DefaultRuleItemResponse.model_validate(r) for r in updated]

    def upsert_date_override(
        self, payload: UpsertDateOverrideRequest
    ) -> CalendarDaySchedule:
        overrides = [
            MassDateOverride(
                service_date=payload.service_date,
                occasion_label=payload.occasion_label.strip(),
                mass_time=m.mass_time.strip(),
                language=m.language.strip(),
                sort_order=m.sort_order,
                amount_paise=m.amount_paise,
                is_active=True,
            )
            for m in payload.masses
        ]
        self.repo.replace_date_override(payload.service_date, overrides)
        schedule_map = self._build_schedule_map(
            payload.service_date, payload.service_date
        )
        return schedule_map[payload.service_date]

    def delete_date_override(self, service_date: date) -> dict[str, str]:
        deleted = self.repo.delete_date_override(service_date)
        return {
            "status": "deleted" if deleted > 0 else "not_found",
            "service_date": service_date.isoformat(),
        }
