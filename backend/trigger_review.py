"""
手动触发审查工作流脚本
用法: python trigger_review.py <task_id>

运行 parse_doc -> extract_clauses -> analyze_risks 三步，
将风险项写入数据库，并更新任务状态为 pending_review。
"""
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import async_session, init_db
from app.models.task import Task
from app.models.risk_item import RiskItem
from app.graph.nodes import parse_doc, extract_clauses, analyze_risks


async def run_review(task_id: str):
    print(f"[1/4] 加载任务 {task_id}...")
    async with async_session() as db:
        from sqlalchemy import select
        stmt = select(Task).where(Task.id == task_id)
        result = await db.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            print(f"错误: 任务 {task_id} 不存在")
            sys.exit(1)
        print(f"  文件: {task.file_name}, 状态: {task.status}")

    print("[2/4] 解析文档...")
    state = {"task_id": task_id}
    result = await parse_doc(state)
    if result.get("error_message"):
        print(f"  解析失败: {result['error_message']}")
        sys.exit(1)
    state.update(result)
    text_preview = state["parsed_text"][:100] if state.get("parsed_text") else ""
    print(f"  解析成功，文本长度: {len(state['parsed_text'])} 字符")
    print(f"  预览: {text_preview}...")

    print("[3/4] 提取条款...")
    result = await extract_clauses(state)
    state.update(result)
    print(f"  提取到 {len(state['clauses'])} 个条款")
    for c in state["clauses"]:
        print(f"    - {c['title'][:40]}")

    print("[4/4] AI 风险分析（调用 DeepSeek）...")
    # Temporarily remove task_id from state for analyze_risks
    risk_state = {k: v for k, v in state.items() if k != "task_id"}
    risk_state["task_id"] = task_id
    result = await analyze_risks(risk_state)
    risks = result.get("risk_items", [])
    print(f"  识别到 {len(risks)} 项风险")

    for risk in risks:
        print(f"    [{risk['level'].upper()}] {risk['description'][:50]}... (置信度: {risk['confidence']})")

    # Save risk items to database
    print(f"\n保存 {len(risks)} 项风险到数据库...")
    async with async_session() as db:
        from sqlalchemy import select, update
        for risk in risks:
            risk_item = RiskItem(
                task_id=task_id,
                level=risk["level"],
                category=risk["category"],
                confidence=risk["confidence"],
                clause_text=risk["clause_text"],
                clause_position=risk["clause_position"],
                description=risk["description"],
                suggestion=risk["suggestion"],
                legal_basis=risk["legal_basis"],
                human_review_status="pending",
            )
            db.add(risk_item)

        # Update task status and risk_count
        stmt = update(Task).where(Task.id == task_id).values(
            status="pending_review",
            progress=100,
            current_stage="pending_review",
            risk_count=len(risks),
        )
        await db.execute(stmt)
        await db.commit()

    print(f"\n完成! 任务 {task_id} 状态已更新为 pending_review")
    print(f"前端可访问 /review/{task_id} 查看审查结果")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python trigger_review.py <task_id>")
        print("可用任务:")
        asyncio.run(list_tasks())
        sys.exit(1)

    task_id = sys.argv[1]
    asyncio.run(init_db())
    asyncio.run(run_review(task_id))


async def list_tasks():
    from sqlalchemy import select
    async with async_session() as db:
        stmt = select(Task).order_by(Task.created_at.desc()).limit(5)
        result = await db.execute(stmt)
        tasks = result.scalars().all()
        for t in tasks:
            print(f"  {t.id[:12]}... | {t.file_name} | {t.status}")
