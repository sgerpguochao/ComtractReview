from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from app.database import Base

def _utc_now():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc)


class FileRecord(Base):
    __tablename__ = "file_records"

    id = Column(String, primary_key=True, default=lambda: str(__import__("uuid").uuid4()))
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    original_name = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utc_now)
