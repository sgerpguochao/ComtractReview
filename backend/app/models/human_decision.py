from sqlalchemy import Column, String, ForeignKey, Text, DateTime
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base

def _utc_now():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc)


class HumanDecision(Base):
    __tablename__ = "human_decisions"

    id = Column(String, primary_key=True, default=lambda: str(__import__("uuid").uuid4()))
    risk_id = Column(String, ForeignKey("risk_items.id"), nullable=False)
    action = Column(String, nullable=False)  # approve, modify, reject
    comment = Column(Text, nullable=True)
    modified_content = Column(JSON, nullable=True)
    operator = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utc_now)
