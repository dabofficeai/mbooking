from fastapi import APIRouter, Depends, HTTPException, status

from routers.dependencies import get_booking_service
from schemas.booking_schema import (
    BookingStatusResponse,
    CalendarWindowResponse,
    CreateBookingRequest,
    CreateBookingResponse,
)
from services.booking_service import (
    BookingNotFoundError,
    BookingService,
    BookingValidationError,
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
