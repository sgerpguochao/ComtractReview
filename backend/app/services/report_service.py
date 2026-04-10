import os
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.risk_item import RiskItem
from app.models.human_decision import HumanDecision
from app.models.review_history import ReviewHistory
from app.config import settings


def _get_chinese_font():
    """Find a Chinese-supporting font on the system."""
    import platform
    system = platform.system()
    if system == "Windows":
        font_paths = [
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\simsun.ttc",
            r"C:\Windows\Fonts\msyh.ttc",
        ]
        for p in font_paths:
            if os.path.exists(p):
                basename = os.path.basename(p)
                name = basename.replace(".ttf", "").replace(".ttc", "")
                return name
    return "Helvetica"


async def generate_report(
    db: AsyncSession,
    task_id: str,
) -> Optional[Dict[str, Any]]:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        return None

    risk_items_result = await db.execute(
        select(RiskItem).where(RiskItem.task_id == task_id).order_by(RiskItem.level)
    )
    risk_items = list(risk_items_result.scalars().all())

    high_count = sum(1 for r in risk_items if r.level == "high")
    medium_count = sum(1 for r in risk_items if r.level == "medium")
    low_count = sum(1 for r in risk_items if r.level == "low")

    storage_dir = os.path.join(settings.storage_path, task_id)
    os.makedirs(storage_dir, exist_ok=True)
    pdf_path = os.path.join(storage_dir, "report.pdf")

    try:
        font_name = _get_chinese_font()
        doc = SimpleDocTemplate(pdf_path, pagesize=A4)
        styles = getSampleStyleSheet()

        try:
            font_path = None
            import platform
            if platform.system() == "Windows":
                candidates = [
                    r"C:\Windows\Fonts\simhei.ttf",
                    r"C:\Windows\Fonts\simsun.ttc",
                    r"C:\Windows\Fonts\msyh.ttc",
                ]
                for p in candidates:
                    if os.path.exists(p):
                        font_path = p
                        break
            if font_path:
                pdfmetrics.registerFont(TTFont("ChineseFont", font_path))
                font_name = "ChineseFont"
            else:
                font_name = "Helvetica"
        except Exception:
            font_name = "Helvetica"

        title_style = ParagraphStyle(
            "ChineseTitle",
            parent=styles["Title"],
            fontName=font_name,
            fontSize=18,
            spaceAfter=20,
        )
        normal_style = ParagraphStyle(
            "ChineseNormal",
            parent=styles["Normal"],
            fontName=font_name,
            fontSize=10,
            spaceAfter=6,
        )

        story = []
        story.append(Paragraph(f"{task.file_name} - Contract Review Report", title_style))
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"File: {task.file_name}", normal_style))
        story.append(Paragraph(f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}", normal_style))
        story.append(Spacer(1, 10))

        summary_text = f"Total risks: {len(risk_items)} (High: {high_count}, Medium: {medium_count}, Low: {low_count})"
        story.append(Paragraph(summary_text, normal_style))
        story.append(Spacer(1, 10))

        for item in risk_items:
            level_color = {"high": "red", "medium": "orange", "low": "blue"}.get(item.level, "black")
            story.append(Paragraph(
                f"<b>[{item.level.upper()}]</b> {item.description}",
                ParagraphStyle(f"risk_{item.id}", parent=normal_style, textColor=colors.HexColor(level_color) if level_color != "red" else colors.red),
            ))
            story.append(Paragraph(f"Clause: {item.clause_text[:100]}...", normal_style))
            story.append(Paragraph(f"Suggestion: {item.suggestion[:100]}...", normal_style))
            status_tag = {"pending": "Pending", "approved": "Approved", "modified": "Modified", "rejected": "Rejected"}.get(item.human_review_status, item.human_review_status)
            story.append(Paragraph(f"Review Status: {status_tag}", normal_style))
            story.append(Spacer(1, 5))

        doc.build(story)
    except Exception as e:
        with open(pdf_path, "w") as f:
            f.write(f"Report generation note: {str(e)}\nTask: {task_id}\nFile: {task.file_name}")

    report_id = f"rpt-{task_id[:8]}"
    return {
        "report_id": report_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_risks": len(risk_items),
            "high_count": high_count,
            "medium_count": medium_count,
            "low_count": low_count,
            "summary": f"Total {len(risk_items)} risks found in {task.file_name}.",
        },
    }
