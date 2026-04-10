from sqlalchemy import Column, String, Integer, Float, ForeignKey, Text
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base


class RiskItem(Base):
    __tablename__ = "risk_items"

    id = Column(String, primary_key=True, default=lambda: str(__import__("uuid").uuid4()))
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    level = Column(String, nullable=False)  # high, medium, low
    category = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    clause_text = Column(Text, nullable=False)
    clause_position = Column(JSON, nullable=False)
    description = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=False)
    legal_basis = Column(Text, nullable=False)
    human_review_status = Column(String, nullable=False, default="pending")
