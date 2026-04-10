from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# --- Task Schemas ---

class TaskResponse(BaseModel):
    id: str
    file_name: str
    file_size: int
    status: str
    progress: int = 0
    current_stage: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    risk_count: Optional[int] = None

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    next_cursor: Optional[str] = None
    has_more: bool = False


class TaskCreateResponse(BaseModel):
    task_id: str
    file_name: str
    file_size: int
    status: str
    created_at: datetime


class CancelResponse(BaseModel):
    task_id: str
    status: str


# --- Upload Schemas ---

class UploadResponse(TaskCreateResponse):
    pass
