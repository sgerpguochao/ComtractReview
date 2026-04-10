from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    deepseek_api_key: str
    deepseek_model: str = "deepseek-chat"
    database_url: str = "sqlite+aiosqlite:///./contractreview.db"
    storage_path: str = "./storage"
    max_upload_size: int = 52428800  # 50MB
    allowed_extensions: str = ".docx,.pdf"
    upload_duplicate_window_days: int = 7
    review_session_timeout_hours: int = 24

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip() for ext in self.allowed_extensions.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
