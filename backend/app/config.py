from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py → ../../ is the project root, where .env lives.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    ODDS_API_KEY: str = ""
    OPENWEATHER_API_KEY: str = ""
    DATABASE_URL: str = "postgresql://sharpline:sharpline_dev@localhost:5432/sharpline"
    REDIS_URL: str = "redis://localhost:6379/0"
    ADMIN_PASSWORD: str = "changeme"
    ODDS_POLL_MODE: str = "auto"  # auto | rich | lean
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
