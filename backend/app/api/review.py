from typing import Optional
from fastapi import APIRouter, Header, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import task_service
from app.services.review_service import (
    submit_review, get_risk_item_by_id, get_all_risk_items, risk_item_to_response
)
from app.schemas.risk import ReviewRequest, BatchReviewRequest, ReviewResponse, BatchReviewResponse

router = APIRouter(prefix="/api/v1", tags=["review"])


@router.put("/tasks/{task_id}/risks/{risk_id}/review")
async def submit_single_review(
    task_id: str,
    risk_id: str,
    body: ReviewRequest,
    x_user_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        return JSONResponse(
            status_code=400,
            content={"code": "INVALID_REQUEST", "message": "X-User-Id header is required", "details": {}},
        )

    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})

    if task.status not in ("pending_review", "human_reviewing"):
        return JSONResponse(status_code=409, content={"code": "INVALID_TASK_STATE", "message": "Task not in review state", "details": {"current_status": task.status}})

    # Validate action
    if body.action not in ("approve", "modify", "reject"):
        return JSONResponse(status_code=400, content={"code": "INVALID_ACTION", "message": "Action must be approve, modify, or reject", "details": {}})
    if body.action == "reject" and not body.comment:
        return JSONResponse(status_code=400, content={"code": "MISSING_COMMENT", "message": "Comment required for reject", "details": {}})
    if body.action == "modify" and not body.modified_content:
        return JSONResponse(status_code=400, content={"code": "MISSING_MODIFIED_CONTENT", "message": "Modified content required", "details": {}})

    # Check if already reviewed
    item = await get_risk_item_by_id(db, task_id, risk_id)
    if not item:
        return JSONResponse(status_code=404, content={"code": "RISK_NOT_FOUND", "message": "Risk item not found", "details": {}})
    if item.human_review_status != "pending":
        return JSONResponse(status_code=409, content={"code": "ALREADY_REVIEWED", "message": "Risk item already reviewed", "details": {}})

    # Update task to human_reviewing if pending_review
    if task.status == "pending_review":
        await task_service.update_task_status(db, task_id, "human_reviewing")

    result = await submit_review(
        db, task_id, risk_id, body.action, x_user_id,
        comment=body.comment,
        modified_content=body.modified_content.model_dump() if body.modified_content else None,
    )

    if not result:
        return JSONResponse(status_code=404, content={"code": "RISK_NOT_FOUND", "message": "Risk item not found", "details": {}})

    remaining = await task_service.count_pending_high_risks(db, task_id)
    await db.commit()

    return {
        "risk_id": risk_id,
        "human_review_status": result["human_review_status"],
        "decision": {"action": body.action, "operator": x_user_id},
        "remaining_pending": remaining,
    }


@router.post("/tasks/{task_id}/reviews/batch")
async def batch_review(
    task_id: str,
    body: BatchReviewRequest,
    x_user_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        return JSONResponse(status_code=400, content={"code": "INVALID_REQUEST", "message": "X-User-Id header is required", "details": {}})

    task = await task_service.get_task(db, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"code": "TASK_NOT_FOUND", "message": "Task not found", "details": {}})

    if task.status not in ("pending_review", "human_reviewing"):
        return JSONResponse(status_code=409, content={"code": "INVALID_TASK_STATE", "message": "Task not in review state", "details": {}})

    if not body.reviews:
        return JSONResponse(status_code=400, content={"code": "EMPTY_BATCH", "message": "Review list is empty", "details": {}})

    if task.status == "pending_review":
        await task_service.update_task_status(db, task_id, "human_reviewing")

    results = []
    updated = 0
    for entry in body.reviews:
        if entry.action not in ("approve", "modify", "reject"):
            return JSONResponse(status_code=400, content={"code": "INVALID_REVIEW_ENTRY", "message": f"Invalid action: {entry.action}", "details": {}})

        result = await submit_review(
            db, task_id, entry.risk_id, entry.action, x_user_id,
            comment=entry.comment,
            modified_content=entry.modified_content.model_dump() if entry.modified_content else None,
        )
        if result:
            results.append({"risk_id": entry.risk_id, "human_review_status": result["human_review_status"]})
            updated += 1

    remaining = await task_service.count_pending_high_risks(db, task_id)
    await db.commit()

    return {
        "updated_count": updated,
        "remaining_pending": remaining,
        "results": results,
    }
