import sys
from collections.abc import Generator
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, get_db  # noqa: E402
from gateways.fake_gateway import FakePaymentProvider  # noqa: E402
from main import app  # noqa: E402
from repositories.booking_repo import BookingRepository  # noqa: E402
from routers.dependencies import (  # noqa: E402
    get_booking_service,
    get_payment_provider,
)
from services.booking_service import BookingService  # noqa: E402

IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=engine
    )
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def fake_gateway() -> FakePaymentProvider:
    return FakePaymentProvider(webhook_secret="test_webhook_secret")


@pytest.fixture()
def fixed_today() -> date:
    return datetime.now(IST).date()


@pytest.fixture()
def client(
    db_session: Session,
    fake_gateway: FakePaymentProvider,
    fixed_today: date,
) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    def override_get_payment_provider() -> FakePaymentProvider:
        return fake_gateway

    def override_get_booking_service() -> BookingService:
        return BookingService(
            repo=BookingRepository(db_session),
            payment_provider=fake_gateway,
            today_provider=lambda: fixed_today,
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_payment_provider] = override_get_payment_provider
    app.dependency_overrides[get_booking_service] = override_get_booking_service

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
