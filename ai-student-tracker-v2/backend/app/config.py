# config.py - Application Configuration

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres123@localhost:5432/ai_student_tracker"

    # JWT / auth
    SECRET_KEY: str = "ai-student-tracker-secret-key-2025-change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Rate limits (slowapi syntax e.g. "10/minute"). Defaults are dev-friendly;
    # tighten in production via backend/.env.
    RATE_LIMIT_LOGIN: str = "60/minute"
    RATE_LIMIT_REFRESH: str = "120/minute"

    OPENAI_API_KEY: str = ""

    APP_NAME: str = "AI Student Performance Tracker"
    SCHOOL_NAME: str = "Your School Name"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    APP_URL: str = "http://localhost:5173"
    DEBUG: bool = True

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
