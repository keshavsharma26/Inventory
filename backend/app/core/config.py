import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Inventory Pro"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "secret")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    HISTORICAL_LOCK_DAYS: int = 30  # Configurable time for read-only legacy data

    class Config:
        env_file = ".env"

settings = Settings()