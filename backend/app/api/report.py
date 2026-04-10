import os
from typing import Optional
from fastapi import APIRouter, Header, Depends
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import task_service
from app.services.report_service import generate_report
from app.config import settings

router = APIRouter(prefix="/api/v1", tags=["report"])


@router.post("/tasks/{task_id}/report/generate")
async def generate_report_endpoint(
    task_id: str,
    x_user_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})

    if task.status not in ("pending_review", "human_reviewing", "report_ready"):
        return JSONResponse(status_code=409, content={"code": "INVALID_TASK_STATE", "message": "Task not in review state", "details": {}})

    pending = await task_service.count_pending_high_risks(db, task_id)
    if pending > 0:
        return JSONResponse(status_code=409, content={"code": "HIGH_RISKS_PENDING", "message": f"{pending} high risk items still pending", "details": {"remaining": pending}})

    # Update task
    if task.status != "report_ready":
        await task_service.update_task_status(db, task_id, "report_ready")
        await db.commit()

    result = await generate_report(db, task_id)
    if not result:
        return JSONResponse(status_code=500, content={"code": "INTERNAL_ERROR", "message": "Failed to generate report", "details": {}})

    return result


@router.get("/tasks/{task_id}/report")
async def download_report(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})

    report_path = os.path.join(settings.storage_path, task_id, "report.pdf")
    if not os.path.exists(report_path):
        return JSONResponse(status_code=409, content={"code": "REPORT_NOT_READY", "message": "Report not generated yet", "details": {}})

    base_name = os.path.splitext(task.file_name)[0]
    return FileResponse(
        report_path,
        media_type="application/pdf",
        filename=f"{base_name}_审查报告.pdf",
    )


@router.get("/tasks/{task_id}/auditlog")
async def get_audit_log(task_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.review_history import ReviewHistory
    from sqlalchemy import select
    from app.schemas.review import AuditLogResponse, AuditLogListResponse

    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})

    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(ReviewHistory)
        .where(ReviewHistory.task_id == task_id)
        .order_by(ReviewHistory.created_at)
    )
    logs = list(result.scalars().all())

    return {
        "logs": [
            {
                "event_type": log.event_type,
                "action": log.action,
                "operator": log.operator,
                "created_at": log.created_at.isoformat(),
                "details": log.details,
            }
            for log in logs
        ],
    }
