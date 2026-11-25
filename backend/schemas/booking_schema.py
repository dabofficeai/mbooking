import re
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _clean_text(value: str) -> str:
    cleaned = _CONTROL_CHARS_RE.sub("", value).strip()
    return re.sub(r"\s+", " ", cleaned)


class MassSlotInfo(BaseModel):
    mass_time: str
    language: str
    mass_label: str
    amount_paise: int
    sort_order: int = 1


class CalendarDaySchedule(BaseModel):
    service_date: date
    is_sunday: bool
    is_override: bool
    occasion_label: Optional[str] = None
    masses: list[MassSlotInfo]


class CalendarWindowResponse(BaseModel):
    start_date: date
    end_date: date
    days: int
    default_price_per_mass_paise: int
    max_intention_length: int = 50
    timezone: str = "Asia/Kolkata"
    schedule: list[CalendarDaySchedule]


class MassOfferingInput(BaseModel):
    service_date: date
    mass_label: str = Field(..., min_length=1, max_length=80)
    intention_text: str = Field(..., min_length=1, max_length=50)

    @field_validator("mass_label")
    @classmethod
    def validate_mass_label(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("Mass timing selection is required.")
        return cleaned

    @field_validator("intention_text")
    @classmethod
    def validate_intention_text(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("Mass intention cannot be empty.")
        if len(cleaned) > 50:
            raise ValueError("Mass intention must be 50 characters or fewer.")
        return cleaned


class CreateBookingRequest(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=120)
    items: list[MassOfferingInput] = Field(..., min_length=1, max_length=100)

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = _clean_text(v)
        return cleaned or None

    @field_validator("items")
    @classmethod
    def validate_unique_mass_offerings(
        cls, v: list[MassOfferingInput]
    ) -> list[MassOfferingInput]:
        seen: set[tuple[date, str]] = set()
        for item in v:
            key = (item.service_date, item.mass_label)
            if key in seen:
                raise ValueError(
                    f"Duplicate offering for {item.service_date.isoformat()} ({item.mass_label})."
                )
            seen.add(key)
        return v


class VerifyPaymentRequest(BaseModel):
    booking_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class BookingItemResponse(BaseModel):
    id: str
    service_date: date
    mass_time: str
    mass_language: str
    mass_label: str
    intention_text: str
    amount_paise: int

    model_config = ConfigDict(from_attributes=True)


class CreateBookingResponse(BaseModel):
    booking_id: str
    customer_name: Optional[str] = None
    gateway_name: str
    gateway_order_id: str
    total_masses: int
    total_amount_paise: int
    currency: str = "INR"
    status: str
    items: list[BookingItemResponse]


class BookingStatusResponse(BaseModel):
    booking_id: str
    customer_name: Optional[str] = None
    total_masses: int
    total_amount_paise: int
    gateway_name: str
    gateway_order_id: str
    gateway_payment_id: Optional[str] = None
    status: str
    created_at: datetime
    items: list[BookingItemResponse]


class AdminOfferingItem(BaseModel):
    booking_id: str
    customer_name: Optional[str] = None
    intention_text: str
    amount_paise: int
    gateway_payment_id: Optional[str] = None


class AdminMassGroup(BaseModel):
    mass_label: str
    mass_time: str
    mass_language: str
    offering_count: int
    total_amount_paise: int
    offerings: list[AdminOfferingItem]


class AdminScheduleDateGroup(BaseModel):
    service_date: date
    formatted_date: str
    is_sunday: bool
    offering_count: int
    total_amount_paise: int
    masses: list[AdminMassGroup]


class AdminScheduleResponse(BaseModel):
    total_offerings: int
    total_amount_paise: int
    groups: list[AdminScheduleDateGroup]


class PaymentLogItem(BaseModel):
    id: str
    booking_id: str
    gateway_name: str
    gateway_order_id: str
    gateway_payment_id: Optional[str] = None
    event_type: str
    status: str
    amount_paise: int
    note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentTallyResponse(BaseModel):
    paid_count: int
    paid_amount_paise: int
    pending_count: int
    pending_amount_paise: int
    failed_count: int
    failed_amount_paise: int
    recent_logs: list[PaymentLogItem]


class MassRuleInput(BaseModel):
    mass_time: str = Field(..., min_length=1, max_length=20)
    language: str = Field(..., min_length=1, max_length=40)
    sort_order: int = Field(default=1, ge=1, le=50)
    amount_paise: Optional[int] = Field(default=None, ge=100)


class UpsertDateOverrideRequest(BaseModel):
    service_date: date
    occasion_label: str = Field(default="Feast Day", min_length=1, max_length=80)
    masses: list[MassRuleInput] = Field(..., min_length=1, max_length=20)


class DefaultRuleItemResponse(BaseModel):
    id: str
    day_type: str
    mass_time: str
    language: str
    sort_order: int
    amount_paise: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class UpsertDefaultRulesRequest(BaseModel):
    day_type: Literal["WEEKDAY", "SUNDAY"]
    masses: list[MassRuleInput] = Field(..., min_length=1, max_length=20)
