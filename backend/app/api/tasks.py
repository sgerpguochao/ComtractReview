import os
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, init_db
from app.models.task import Task
from app.models.risk_item import RiskItem
from app.models.review_history import ReviewHistory
from app.schemas.task import (
    TaskResponse, TaskListResponse, TaskCreateResponse, CancelResponse
)
from app.services import file_service, task_service
from app.services.sse_manager import sse_manager, format_sse
from app.services.review_service import get_all_risk_items, risk_item_to_response
from app.services.workflow_service import run_review_workflow

from app.config import settings

router = APIRouter(prefix="/api/v1", tags=["tasks"])


@router.post("/tasks/upload")
async def upload_task(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    review_dimensions: Optional[str] = Form(None),
    client_request_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "workflow.log")
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[upload] endpoint reached, file={file.filename}\n")
        f.flush()
    # Validate file
    valid, error_code = file_service.validate_file(file)
    if not valid:
        return JSONResponse(
            status_code=400,
            content={"code": error_code, "message": f"Invalid file type. Allowed: {', '.join(file_service.ALLOWED_EXTENSIONS)}", "details": {}},
        )

    # Read file to get size
    content = await file.read()
    file_size = len(content)
    await file.seek(0)  # Reset for save

    if file_size == 0:
        return JSONResponse(
            status_code=400,
            content={"code": "EMPTY_FILE", "message": "File is empty", "details": {}},
        )

    if file_size > settings.max_upload_size:
        return JSONResponse(
            status_code=400,
            content={"code": "FILE_TOO_LARGE", "message": f"File exceeds {settings.max_upload_size} bytes", "details": {}},
        )

    # Check duplicate
    if file.filename:
        dup = await file_service.check_duplicate(db, file.filename, file_size, settings.upload_duplicate_window_days)
        if dup:
            return JSONResponse(
                status_code=409,
                content={"code": "DUPLICATE_UPLOAD", "message": "File uploaded recently", "details": {"existing_task_id": dup.id}},
            )

    # Create task
    task = await task_service.create_task(db, file_name=file.filename or "unknown", file_size=file_size)
    await db.commit()

    # Save file
    storage_path = await file_service.save_file(file, task.id)

    # Trigger review workflow in background
    import sys
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[upload] adding background task for {task.id}\n")
        f.flush()
    background_tasks.add_task(run_review_workflow, task.id)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[upload] background task added, returning response\n")
        f.flush()

    return {
        "task_id": task.id,
        "file_name": task.file_name,
        "file_size": task.file_size,
        "status": task.status,
        "created_at": task.created_at.isoformat(),
    }


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(
            status_code=404,
            content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}},
        )
    return TaskResponse(
        id=task.id,
        file_name=task.file_name,
        file_size=task.file_size,
        status=task.status,
        progress=task.progress,
        current_stage=task.current_stage,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
        risk_count=task.risk_count,
    )


@router.get("/tasks")
async def list_tasks(
    cursor: Optional[str] = None,
    limit: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    if limit > 100:
        limit = 100
    tasks, next_cursor = await task_service.list_tasks(db, cursor=cursor, limit=limit, status=status)
    return TaskListResponse(
        tasks=[TaskResponse(
            id=t.id, file_name=t.file_name, file_size=t.file_size,
            status=t.status, progress=t.progress, current_stage=t.current_stage,
            error_message=t.error_message, created_at=t.created_at,
            completed_at=t.completed_at, risk_count=t.risk_count,
        ) for t in tasks],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(
            status_code=404,
            content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}},
        )
    if task.status in ("report_ready", "cancelled", "parse_failed", "review_failed"):
        return JSONResponse(
            status_code=409,
            content={"code": "TASK_NOT_CANCELLABLE", "message": "Task is in terminal state", "details": {"current_status": task.status}},
        )
    updated = await task_service.update_task_status(db, task_id, "cancelled")
    await db.commit()
    await sse_manager.broadcast(task_id, "status_change", {"task_id": task_id, "status": "cancelled", "progress": 0})
    return {"task_id": task_id, "status": "cancelled"}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    import asyncio
    from fastapi.responses import StreamingResponse

    queue = await sse_manager.connect(task_id)

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                yield format_sse(event.event, event.data)
                if event.event in ("completed", "error"):
                    break
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.disconnect(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/tasks/{task_id}/result")
async def get_result(task_id: str, level: Optional[str] = None, review_status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(
            status_code=404,
            content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}},
        )
    if task.status not in ("pending_review", "human_reviewing", "report_ready"):
        return JSONResponse(
            status_code=409,
            content={"code": "RESULT_NOT_READY", "message": "Review results not ready", "details": {"current_status": task.status}},
        )

    items = await get_all_risk_items(db, task_id)

    # Filter
    if level:
        items = [i for i in items if i.level == level]
    if review_status:
        items = [i for i in items if i.human_review_status == review_status]

    high_count = sum(1 for i in items if i.level == "high")
    medium_count = sum(1 for i in items if i.level == "medium")
    low_count = sum(1 for i in items if i.level == "low")

    return {
        "summary": {
            "total_risks": len(items),
            "high_count": high_count,
            "medium_count": medium_count,
            "low_count": low_count,
            "summary": f"Total {len(items)} risks found.",
        },
        "risk_items": [risk_item_to_response(i) for i in items],
    }


@router.get("/tasks/{task_id}/risks/{risk_id}")
async def get_risk_detail(task_id: str, risk_id: str, db: AsyncSession = Depends(get_db)):
    from app.services.review_service import get_risk_item_by_id
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})
    item = await get_risk_item_by_id(db, task_id, risk_id)
    if not item:
        return JSONResponse(status_code=404, content={"code": "RISK_NOT_FOUND", "message": "Risk item not found", "details": {}})
    return risk_item_to_response(item)
