from functools import lru_cache
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized application settings loaded from environment variables."""

    APP_NAME: str = "Mass Booking API"
    DATABASE_URL: str = "sqlite:///./local_dev.db"
    PAYMENT_PROVIDER: Literal["razorpay", "fake"] = "razorpay"

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    FRONTEND_URL: str = "http://localhost:5500"
    PRICE_PER_MASS_PAISE: int = 10000  # Configurable ₹100.00 per Mass offering
    BOOKING_WINDOW_DAYS: int = 30
    MAX_INTENTION_LENGTH: int = 50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
