from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import Base, engine
from models import booking as _booking_models  # noqa: F401 - register ORM models
from routers import admin_routes, public_routes, webhook_routes


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        lifespan=lifespan,
    )

    allowed_origins = [
        origin.strip()
        for origin in settings.FRONTEND_URL.split(",")
        if origin.strip()
    ]
    if not allowed_origins:
        allowed_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(public_routes.router)
    app.include_router(webhook_routes.router)
    app.include_router(admin_routes.router)
    return app


app = create_app()
