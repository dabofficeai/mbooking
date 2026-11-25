from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from routers.dependencies import get_booking_service
from schemas.booking_schema import (
    AdminScheduleResponse,
    CalendarDaySchedule,
    DefaultRuleItemResponse,
    PaymentTallyResponse,
    UpsertDateOverrideRequest,
    UpsertDefaultRulesRequest,
)
from services.booking_service import BookingService

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/schedule-by-date", response_model=AdminScheduleResponse)
def get_schedule_by_date(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    service: BookingService = Depends(get_booking_service),
) -> AdminScheduleResponse:
    return service.get_admin_schedule_by_date(
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/export-csv")
def export_schedule_csv(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    service: BookingService = Depends(get_booking_service),
) -> Response:
    csv_content = service.export_admin_schedule_csv(
        start_date=start_date,
        end_date=end_date,
    )
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="mass-booking-schedule.csv"'
        },
    )


@router.get("/payment-tally", response_model=PaymentTallyResponse)
def get_payment_tally(
    tally_date: Optional[date] = Query(default=None),
    service: BookingService = Depends(get_booking_service),
) -> PaymentTallyResponse:
    return service.get_payment_tally(tally_date=tally_date)


@router.get("/default-rules", response_model=list[DefaultRuleItemResponse])
def get_default_rules(
    service: BookingService = Depends(get_booking_service),
) -> list[DefaultRuleItemResponse]:
    return service.get_default_rules()


@router.put("/default-rules", response_model=list[DefaultRuleItemResponse])
def upsert_default_rules(
    payload: UpsertDefaultRulesRequest,
    service: BookingService = Depends(get_booking_service),
) -> list[DefaultRuleItemResponse]:
    return service.upsert_default_rules(payload)


@router.put("/overrides", response_model=CalendarDaySchedule)
def upsert_date_override(
    payload: UpsertDateOverrideRequest,
    service: BookingService = Depends(get_booking_service),
) -> CalendarDaySchedule:
    return service.upsert_date_override(payload)


@router.delete("/overrides/{service_date}")
def delete_date_override(
    service_date: date,
    service: BookingService = Depends(get_booking_service),
) -> dict[str, str]:
    return service.delete_date_override(service_date)
