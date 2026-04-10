import uuid
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.file_record import FileRecord
from app.models.risk_item import RiskItem
from app.models.review_history import ReviewHistory


VALID_TRANSITIONS = {
    "uploaded": {"parsing", "cancelled"},
    "parsing": {"parse_complete", "parse_failed"},
    "parse_complete": {"reviewing"},
    "parse_failed": {"uploaded"},
    "reviewing": {"pending_review", "review_failed", "cancelled"},
    "pending_review": {"human_reviewing", "cancelled"},
    "human_reviewing": {"report_ready", "pending_review", "cancelled"},
    "review_failed": {"reviewing"},
    "report_ready": set(),
    "cancelled": set(),
}


async def create_task(
    db: AsyncSession,
    file_name: str,
    file_size: int,
) -> Task:
    task = Task(
        id=str(uuid.uuid4()),
        file_name=file_name,
        file_size=file_size,
        status="uploaded",
        progress=0,
    )
    db.add(task)

    file_record = FileRecord(
        task_id=task.id,
        original_name=file_name,
        storage_path="",
        file_size=file_size,
        file_type=file_name.split(".")[-1].lower(),
    )
    db.add(file_record)
    await db.flush()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
    result = await db.execute(select(Task).where(Task.id == task_id))
    return result.scalar_one_or_none()


async def update_task_status(
    db: AsyncSession,
    task_id: str,
    status: str,
    progress: Optional[int] = None,
    current_stage: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Optional[Task]:
    task = await get_task(db, task_id)
    if not task:
        return None

    if status not in VALID_TRANSITIONS.get(task.status, set()):
        return None

    task.status = status
    if progress is not None:
        task.progress = progress
    if current_stage is not None:
        task.current_stage = current_stage
    if error_message is not None:
        task.error_message = error_message
    if status in ("report_ready", "cancelled", "parse_failed", "review_failed"):
        task.completed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(task)
    return task


async def list_tasks(
    db: AsyncSession,
    cursor: Optional[str] = None,
    limit: int = 20,
    status: Optional[str] = None,
) -> tuple[List[Task], Optional[str]]:
    query = select(Task).order_by(Task.created_at.desc())
    if status:
        query = query.where(Task.status == status)
    if cursor:
        query = query.where(Task.created_at < cursor)
    query = query.limit(limit + 1)

    result = await db.execute(query)
    tasks = list(result.scalars().all())

    has_more = len(tasks) > limit
    if has_more:
        tasks = tasks[:-1]
    next_cursor = str(tasks[-1].created_at) if tasks and has_more else None
    return tasks, next_cursor


async def count_pending_high_risks(db: AsyncSession, task_id: str) -> int:
    result = await db.execute(
        select(func.count(RiskItem.id)).where(
            RiskItem.task_id == task_id,
            RiskItem.level == "high",
            RiskItem.human_review_status == "pending",
        )
    )
    return result.scalar() or 0


async def get_risk_count(db: AsyncSession, task_id: str) -> int:
    result = await db.execute(
        select(func.count(RiskItem.id)).where(RiskItem.task_id == task_id)
    )
    return result.scalar() or 0
