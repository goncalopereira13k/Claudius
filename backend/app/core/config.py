from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ROOT_ENV), env_file_encoding="utf-8", extra="ignore")

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # Garmin
    GARMIN_EMAIL: str = ""
    GARMIN_PASSWORD: str = ""

    # Strava OAuth2
    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = "http://localhost:8000/api/auth/strava/callback"
    # Dev-only: personal tokens from strava.com/settings/api (not used in production)
    STRAVA_DEV_ACCESS_TOKEN: str = ""
    STRAVA_DEV_REFRESH_TOKEN: str = ""

    # TrainingPeaks
    TRAININGPEAKS_CLIENT_ID: str = ""
    TRAININGPEAKS_CLIENT_SECRET: str = ""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://claudius:claudius@localhost:5432/claudius"
    REDIS_URL: str = "redis://localhost:6379"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]


settings = Settings()
