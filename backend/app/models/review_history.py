from sqlalchemy import Column, String, ForeignKey, Text, DateTime
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base

def _utc_now():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc)


class ReviewHistory(Base):
    __tablename__ = "review_history"

    id = Column(String, primary_key=True, default=lambda: str(__import__("uuid").uuid4()))
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    event_type = Column(String, nullable=False)
    action = Column(String, nullable=False)
    operator = Column(String, nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utc_now)
