from fastapi import APIRouter, Depends, HTTPException, status

from config import Settings, get_settings
from routers.dependencies import get_booking_service
from schemas.booking_schema import (
    BookingStatusResponse,
    CalendarWindowResponse,
    CreateBookingRequest,
    CreateBookingResponse,
    VerifyPaymentRequest,
)
from services.booking_service import (
    BookingNotFoundError,
    BookingService,
    BookingValidationError,
    WebhookVerificationError,
)

router = APIRouter(prefix="/api", tags=["Public"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/calendar-window", response_model=CalendarWindowResponse)
def get_calendar_window(
    service: BookingService = Depends(get_booking_service),
) -> CalendarWindowResponse:
    return service.get_calendar_window()


@router.post(
    "/bookings",
    response_model=CreateBookingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    payload: CreateBookingRequest,
    service: BookingService = Depends(get_booking_service),
) -> CreateBookingResponse:
    try:
        return service.create_booking(payload)
    except BookingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/bookings/verify-payment", response_model=BookingStatusResponse)
def verify_razorpay_payment(
    payload: VerifyPaymentRequest,
    service: BookingService = Depends(get_booking_service),
    settings: Settings = Depends(get_settings),
) -> BookingStatusResponse:
    try:
        return service.verify_razorpay_payment(
            payload=payload, key_secret=settings.RAZORPAY_KEY_SECRET
        )
    except WebhookVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BookingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post("/bookings/{booking_id}/confirm-fake", response_model=BookingStatusResponse)
def confirm_fake_booking(
    booking_id: str,
    service: BookingService = Depends(get_booking_service),
    settings: Settings = Depends(get_settings),
) -> BookingStatusResponse:
    if settings.PAYMENT_PROVIDER != "fake":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fake payment confirmation is disabled when PAYMENT_PROVIDER is not 'fake'.",
        )
    try:
        return service.confirm_fake_payment(booking_id)
    except BookingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except BookingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/bookings/{booking_id}", response_model=BookingStatusResponse)
def get_booking_status(
    booking_id: str,
    service: BookingService = Depends(get_booking_service),
) -> BookingStatusResponse:
    try:
        return service.get_booking_status(booking_id)
    except BookingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
