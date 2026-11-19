import re
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_PHONE_DIGITS_RE = re.compile(r"^\+?[0-9]{10,15}$")


def _clean_text(value: str) -> str:
    cleaned = _CONTROL_CHARS_RE.sub("", value).strip()
    return re.sub(r"\s+", " ", cleaned)


class BookingItemInput(BaseModel):
    service_date: date
    item_text: str = Field(..., min_length=1, max_length=120)

    @field_validator("item_text")
    @classmethod
    def validate_item_text(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("Item text cannot be empty.")
        if len(cleaned) > 100:
            raise ValueError("Item text must be 100 characters or fewer.")
        return cleaned


class CreateBookingRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_phone: str = Field(..., min_length=10, max_length=20)
    items: list[BookingItemInput] = Field(..., min_length=1, max_length=30)

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("Customer name is required.")
        return cleaned

    @field_validator("customer_phone")
    @classmethod
    def validate_customer_phone(cls, v: str) -> str:
        compact = re.sub(r"[\s\-()]", "", v.strip())
        if not _PHONE_DIGITS_RE.match(compact):
            raise ValueError(
                "Phone number must contain 10 to 15 digits (optional leading +)."
            )
        return compact

    @field_validator("items")
    @classmethod
    def validate_unique_dates(
        cls, v: list[BookingItemInput]
    ) -> list[BookingItemInput]:
        seen: set[date] = set()
        for item in v:
            if item.service_date in seen:
                raise ValueError(
                    f"Duplicate date {item.service_date.isoformat()} in booking."
                )
            seen.add(item.service_date)
        return v


class BookingItemResponse(BaseModel):
    id: str
    service_date: date
    item_text: str
    amount_paise: int

    model_config = ConfigDict(from_attributes=True)


class CreateBookingResponse(BaseModel):
    booking_id: str
    gateway_name: str
    gateway_order_id: str
    total_days: int
    total_amount_paise: int
    currency: str = "INR"
    status: str
    items: list[BookingItemResponse]


class BookingStatusResponse(BaseModel):
    booking_id: str
    customer_name: str
    customer_phone: str
    total_days: int
    total_amount_paise: int
    gateway_name: str
    gateway_order_id: str
    gateway_payment_id: Optional[str] = None
    status: str
    created_at: datetime
    items: list[BookingItemResponse]


class CalendarWindowResponse(BaseModel):
    start_date: date
    end_date: date
    days: int
    price_per_day_paise: int
    timezone: str = "Asia/Kolkata"


class AdminScheduleItem(BaseModel):
    booking_id: str
    customer_name: str
    customer_phone: str
    item_text: str
    amount_paise: int
    gateway_payment_id: Optional[str] = None


class AdminScheduleDateGroup(BaseModel):
    service_date: date
    formatted_date: str
    order_count: int
    total_amount_paise: int
    orders: list[AdminScheduleItem]


class AdminScheduleResponse(BaseModel):
    total_orders: int
    total_amount_paise: int
    groups: list[AdminScheduleDateGroup]
