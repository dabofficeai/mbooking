from functools import lru_cache
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized application settings loaded from environment variables."""

    APP_NAME: str = "Daily Item Booking API"
    DATABASE_URL: str = "sqlite:///./local_dev.db"
    PAYMENT_PROVIDER: Literal["razorpay", "fake"] = "razorpay"

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    FRONTEND_URL: str = "http://localhost:5500"
    PRICE_PER_DAY_PAISE: int = 10000  # ₹100.00 in paise
    BOOKING_WINDOW_DAYS: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
