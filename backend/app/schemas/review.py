from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime


class AuditLogResponse(BaseModel):
    event_type: str
    action: str
    operator: str
    created_at: datetime
    details: Optional[Dict[str, Any]] = None


class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
