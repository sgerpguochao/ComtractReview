import os
import uuid
import shutil
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from fastapi import UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.task import Task
from app.models.file_record import FileRecord


ALLOWED_EXTENSIONS = {".docx", ".pdf"}
MAX_SIZE = 52428800  # 50MB


def validate_file(file: UploadFile) -> Tuple[bool, Optional[str]]:
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, "INVALID_FILE_TYPE"
    return True, None


async def check_duplicate(db: AsyncSession, file_name: str, file_size: int, window_days: int) -> Optional[Task]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    stmt = select(Task).where(
        Task.file_name == file_name,
        Task.file_size == file_size,
        Task.created_at >= cutoff,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def get_storage_dir(task_id: str) -> str:
    path = os.path.join(settings.storage_path, task_id)
    os.makedirs(path, exist_ok=True)
    return path


async def save_file(file: UploadFile, task_id: str) -> str:
    storage_dir = get_storage_dir(task_id)
    _, ext = os.path.splitext(file.filename or "")
    filename = f"original{ext}"
    filepath = os.path.join(storage_dir, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


def get_file_path(task_id: str, filename: str) -> str:
    return os.path.join(settings.storage_path, task_id, filename)


def file_exists(task_id: str, filename: str) -> bool:
    return os.path.exists(get_file_path(task_id, filename))
