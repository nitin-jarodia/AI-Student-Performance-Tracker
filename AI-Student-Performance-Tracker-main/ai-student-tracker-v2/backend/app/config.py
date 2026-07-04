# config.py - Application Configuration

from pydantic import field_validator
from pydantic_settings import BaseSettings


def _normalize_database_url(url: str) -> str:
    """Render may supply postgres:// — SQLAlchemy + psycopg2 expect postgresql://."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Settings(BaseSettings):
    DATABASE_URL: str

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _fix_postgres_scheme(cls, value: str) -> str:
        if isinstance(value, str):
            return _normalize_database_url(value)
        return value

    # JWT / auth
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SEED_DEFAULT_ADMIN: bool = False

    # Rate limits (slowapi syntax e.g. "10/minute"). Defaults are dev-friendly;
    # tighten in production via backend/.env.
    RATE_LIMIT_LOGIN: str = "60/minute"
    RATE_LIMIT_REFRESH: str = "120/minute"

    OPENAI_API_KEY: str = ""

    APP_NAME: str = "AI Student Performance Tracker"
    SCHOOL_NAME: str = "Your School Name"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    APP_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = ""  # comma-separated extra origins for production
    PUBLIC_SCAN_BASE_URL: str = ""  # e.g. https://your-app.vercel.app/scan
    DEBUG: bool = False

    # HttpOnly cookie auth (tokens also accepted via Authorization header for tests/API clients)
    COOKIE_SECURE: bool = False
    COOKIE_SAME_SITE: str = "lax"  # use "none" when frontend/API are on different domains (Vercel + Render)

    # Optional Redis cache (analytics); empty = in-process only
    REDIS_URL: str = ""
    CACHE_TTL_ANALYTICS: int = 300

    # Email (SMTP) - optional; alerts degrade to log-only when missing
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""

    # SMS (Twilio) - optional
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Alerts: skip re-sending the same (student, alert_type) within this window
    ALERT_COOLDOWN_HOURS: int = 24

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
