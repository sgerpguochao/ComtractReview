import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.dialects.sqlite import JSON

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_name = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="uploaded")
    progress = Column(Integer, nullable=False, default=0)
    current_stage = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    completed_at = Column(DateTime, nullable=True)
    risk_count = Column(Integer, nullable=True, default=0)
