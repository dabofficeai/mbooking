from fastapi import Depends
from sqlalchemy.orm import Session

from config import Settings, get_settings
from database import get_db
from gateways.base import PaymentProvider
from gateways.fake_gateway import FakePaymentProvider
from gateways.razorpay_gateway import RazorpayProvider
from repositories.booking_repo import BookingRepository
from services.booking_service import BookingService


def get_payment_provider(
    settings: Settings = Depends(get_settings),
) -> PaymentProvider:
    """Provide configured PaymentProvider (easily overridden in tests)."""
    if settings.PAYMENT_PROVIDER == "fake":
        return FakePaymentProvider(
            webhook_secret=settings.RAZORPAY_WEBHOOK_SECRET or "test_webhook_secret"
        )
    return RazorpayProvider(
        key_id=settings.RAZORPAY_KEY_ID,
        key_secret=settings.RAZORPAY_KEY_SECRET,
        webhook_secret=settings.RAZORPAY_WEBHOOK_SECRET,
    )


def get_booking_repository(
    db: Session = Depends(get_db),
) -> BookingRepository:
    return BookingRepository(db=db)


def get_booking_service(
    repo: BookingRepository = Depends(get_booking_repository),
    payment_provider: PaymentProvider = Depends(get_payment_provider),
    settings: Settings = Depends(get_settings),
) -> BookingService:
    """Provide BookingService with injected repository and payment gateway."""
    return BookingService(
        repo=repo,
        payment_provider=payment_provider,
        price_per_mass_paise=settings.PRICE_PER_MASS_PAISE,
        window_days=settings.BOOKING_WINDOW_DAYS,
    )
