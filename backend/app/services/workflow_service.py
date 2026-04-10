"""
Background workflow service: orchestrates the review pipeline.

Flow:
  upload -> [parse_doc -> extract_clauses -> analyze_risks] -> pending_review
  human reviews via REST API
  all reviewed -> report_ready
"""
import asyncio
import traceback
from typing import Any, Dict, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.task import Task
from app.models.risk_item import RiskItem
from app.models.review_history import ReviewHistory
from app.graph.nodes import parse_doc, extract_clauses, analyze_risks
from app.services.sse_manager import sse_manager
from app.config import settings

VALID_TRANSITIONS = {
    "uploaded": {"parsing"},
    "parsing": {"parse_complete", "parse_failed"},
    "parse_complete": {"reviewing"},
    "reviewing": {"pending_review", "review_failed"},
    "pending_review": {"human_reviewing", "report_ready"},
    "human_reviewing": {"report_ready"},
    "report_ready": set(),
}


async def _update_task(db: AsyncSession, task_id: str, **kwargs):
    """Safely update task fields without status transition check."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        await db.flush()
        await db.refresh(task)
    return task


async def _emit_event(task_id: str, event: str, data: Dict[str, Any]):
    """Broadcast SSE event if connected."""
    await sse_manager.broadcast(task_id, event, data)


async def run_review_workflow(task_id: str):
    """
    Execute: parse_doc -> extract_clauses -> analyze_risks -> save to DB -> update status.
    Runs in a background task (fire-and-forget).
    """
    import os
    LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "workflow.log")
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[workflow] >>> ENTER run_review_workflow for task {task_id}\n")
        f.flush()
    print(f"[workflow] Starting review for task {task_id}", flush=True)

    async with async_session() as db:
        # Step 1: uploaded -> parsing
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            print(f"[workflow] Task {task_id} not found")
            return
        if task.status != "uploaded":
            print(f"[workflow] Task {task_id} not in 'uploaded' state, skip")
            return

        task.status = "parsing"
        task.progress = 5
        task.current_stage = "文档解析"
        await db.flush()
        await db.refresh(task)
        print(f"[workflow] Task {task_id} -> parsing")

    await _emit_event(task_id, "status_change", {"status": "parsing", "progress": 5})

    try:
        # Step 2: parse_doc
        print(f"[workflow] {task_id}: parsing document...")
        state: Dict[str, Any] = {"task_id": task_id}
        result = await parse_doc(state)

        async with async_session() as db:
            await _update_task(db, task_id, progress=25, current_stage="解析完成")
        await _emit_event(task_id, "stage_complete", {"stage": "parse_doc", "progress": 25})

        if result.get("error_message"):
            raise RuntimeError(result["error_message"])

        state.update(result)
        print(f"[workflow] {task_id}: parsed {len(state['parsed_text'])} chars")

        # Step 3: extract_clauses
        print(f"[workflow] {task_id}: extracting clauses...")
        result = await extract_clauses(state)
        state.update(result)

        async with async_session() as db:
            await _update_task(db, task_id, progress=35, current_stage="条款提取")
        await _emit_event(task_id, "stage_complete", {"stage": "extract_clauses", "progress": 35})

        print(f"[workflow] {task_id}: extracted {len(state['clauses'])} clauses")

        # Step 4: analyze_risks (calls DeepSeek)
        print(f"[workflow] {task_id}: analyzing risks with LLM...")
        risk_state = {k: v for k, v in state.items() if k != "task_id"}
        risk_state["task_id"] = task_id
        result = await analyze_risks(risk_state)
        risks: List[Dict[str, Any]] = result.get("risk_items", [])

        print(f"[workflow] {task_id}: identified {len(risks)} risk items")

        # Step 5: Save risk items to DB + update task
        async with async_session() as db:
            for risk_data in risks:
                risk_item = RiskItem(
                    task_id=task_id,
                    level=risk_data["level"],
                    category=risk_data["category"],
                    confidence=risk_data["confidence"],
                    clause_text=risk_data["clause_text"],
                    clause_position=risk_data.get("clause_position", {}),
                    description=risk_data["description"],
                    suggestion=risk_data["suggestion"],
                    legal_basis=risk_data["legal_basis"],
                    human_review_status="pending",
                )
                db.add(risk_item)

            await _update_task(
                db, task_id,
                status="pending_review",
                progress=100,
                current_stage="待人工审核",
                risk_count=len(risks),
            )
            await db.commit()

        await _emit_event(task_id, "ai_complete", {
            "risk_count": len(risks),
            "progress": 100,
        })

        # Record review history
        async with async_session() as db:
            history = ReviewHistory(
                task_id=task_id,
                event_type="ai_complete",
                action="ai_review_complete",
                operator="system",
                details={"risk_count": len(risks)},
            )
            db.add(history)
            await db.commit()

        print(f"[workflow] {task_id} -> pending_review ({len(risks)} risks)")

    except Exception as e:
        print(f"[workflow] {task_id} ERROR: {e}")
        traceback.print_exc()
        async with async_session() as db:
            await _update_task(
                db, task_id,
                status="review_failed",
                progress=0,
                current_stage="审查失败",
                error_message=str(e),
            )
            await db.commit()
        await _emit_event(task_id, "error", {"message": str(e)})


async def check_and_finalize_review(task_id: str):
    """
    Called after a human review action.
    If all high-risk items are reviewed, transition to report_ready.
    """
    async with async_session() as db:
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return

        # Check if all high-risk items have been reviewed
        pending_count = await db.execute(
            select(func.count(RiskItem.id)).where(
                RiskItem.task_id == task_id,
                RiskItem.level == "high",
                RiskItem.human_review_status == "pending",
            )
        )
        pending_high = pending_count.scalar() or 0

        if pending_high == 0 and task.status in ("pending_review", "human_reviewing"):
            # All high risks reviewed -> report_ready
            task.status = "report_ready"
            task.progress = 100
            task.current_stage = "报告可导出"
            task.completed_at = __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            )
            await db.commit()
            await _emit_event(task_id, "status_change", {"status": "report_ready"})
            print(f"[workflow] {task_id} -> report_ready")
