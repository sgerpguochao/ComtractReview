from typing import Optional, List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.risk_item import RiskItem
from app.models.human_decision import HumanDecision
from app.models.review_history import ReviewHistory
from app.schemas.risk import TextPosition, RiskItemResponse
from app.database import utc_now as _utc_now


async def get_all_risk_items(db: AsyncSession, task_id: str) -> List[RiskItem]:
    result = await db.execute(
        select(RiskItem)
        .where(RiskItem.task_id == task_id)
        .order_by(
            RiskItem.level,
        )
    )
    return list(result.scalars().all())


async def get_risk_item_by_id(db: AsyncSession, task_id: str, risk_id: str) -> Optional[RiskItem]:
    result = await db.execute(
        select(RiskItem).where(
            RiskItem.id == risk_id,
            RiskItem.task_id == task_id,
        )
    )
    return result.scalar_one_or_none()


async def save_risk_items(
    db: AsyncSession,
    task_id: str,
    items: List[Dict[str, Any]],
) -> List[RiskItem]:
    saved = []
    for item_data in items:
        risk_item = RiskItem(
            task_id=task_id,
            level=item_data["level"],
            category=item_data["category"],
            confidence=item_data["confidence"],
            clause_text=item_data["clause_text"],
            clause_position=item_data.get("clause_position", {"offset_start": 0, "offset_end": len(item_data["clause_text"])}),
            description=item_data["description"],
            suggestion=item_data["suggestion"],
            legal_basis=item_data["legal_basis"],
        )
        db.add(risk_item)
        saved.append(risk_item)
    await db.flush()
    return saved


def risk_item_to_response(item: RiskItem) -> RiskItemResponse:
    return RiskItemResponse(
        risk_id=item.id,
        level=item.level,
        category=item.category,
        confidence=item.confidence,
        clause_text=item.clause_text,
        clause_position=TextPosition(**item.clause_position) if isinstance(item.clause_position, dict) else TextPosition(**item.clause_position),
        description=item.description,
        suggestion=item.suggestion,
        legal_basis=item.legal_basis,
        human_review_status=item.human_review_status,
    )


async def submit_review(
    db: AsyncSession,
    task_id: str,
    risk_id: str,
    action: str,
    operator: str,
    comment: Optional[str] = None,
    modified_content: Optional[Dict[str, Any]] = None,
) -> Optional[dict]:
    risk_item = await get_risk_item_by_id(db, task_id, risk_id)
    if not risk_item or risk_item.human_review_status != "pending":
        return None

    status_map = {"approve": "approved", "modify": "modified", "reject": "rejected"}
    risk_item.human_review_status = status_map.get(action, "pending")

    decision = HumanDecision(
        risk_id=risk_id,
        action=action,
        comment=comment,
        modified_content=modified_content,
        operator=operator,
    )
    db.add(decision)

    if modified_content:
        for key, value in modified_content.items():
            if value is not None and hasattr(risk_item, key):
                setattr(risk_item, key, value)

    await db.flush()
    await db.refresh(risk_item)

    return {
        "risk_id": risk_id,
        "human_review_status": risk_item.human_review_status,
    }
