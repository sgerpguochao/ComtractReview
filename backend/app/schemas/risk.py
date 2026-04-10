from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


# --- RiskItem Schemas ---

class TextPosition(BaseModel):
    section: Optional[str] = None
    clause: Optional[str] = None
    page: Optional[int] = None
    offset_start: int
    offset_end: int


class RiskItemResponse(BaseModel):
    risk_id: str
    level: str  # high, medium, low
    category: str
    confidence: float
    clause_text: str
    clause_position: TextPosition
    description: str
    suggestion: str
    legal_basis: str
    human_review_status: str  # pending, approved, modified, rejected


class ReviewSummary(BaseModel):
    total_risks: int
    high_count: int
    medium_count: int
    low_count: int
    summary: str


class ReviewResultResponse(BaseModel):
    summary: ReviewSummary
    risk_items: List[RiskItemResponse]


# --- Human Review Schemas ---

class ModifiedContent(BaseModel):
    level: Optional[str] = None
    description: Optional[str] = None
    suggestion: Optional[str] = None
    legal_basis: Optional[str] = None


class ReviewRequest(BaseModel):
    action: str  # approve, modify, reject
    comment: Optional[str] = None
    modified_content: Optional[ModifiedContent] = None


class ReviewEntry(BaseModel):
    risk_id: str
    action: str
    comment: Optional[str] = None
    modified_content: Optional[ModifiedContent] = None


class BatchReviewRequest(BaseModel):
    reviews: List[ReviewEntry]


class ReviewResponse(BaseModel):
    risk_id: str
    human_review_status: str
    decision: Optional[Dict[str, Any]] = None
    remaining_pending: int


class BatchReviewResponse(BaseModel):
    updated_count: int
    remaining_pending: int
    results: List[Dict[str, str]]


# --- Report Schemas ---

class ReportGenerateResponse(BaseModel):
    report_id: str
    generated_at: str
    summary: ReviewSummary
