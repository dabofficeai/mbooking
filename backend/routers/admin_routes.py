from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from routers.dependencies import get_booking_service
from schemas.booking_schema import AdminScheduleResponse
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
            "Content-Disposition": 'attachment; filename="daily-booking-schedule.csv"'
        },
    )
