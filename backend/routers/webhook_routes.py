from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from routers.dependencies import get_booking_service
from services.booking_service import (
    BookingNotFoundError,
    BookingService,
    WebhookVerificationError,
)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default="", alias="X-Razorpay-Signature"),
    service: BookingService = Depends(get_booking_service),
) -> dict[str, str]:
    raw_body = await request.body()
    try:
        return service.handle_razorpay_webhook(
            raw_body=raw_body,
            signature=x_razorpay_signature,
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
