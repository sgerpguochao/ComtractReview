import os
import asyncio
import json
from typing import Dict, Any, List

from app.config import settings
from app.graph.state import GraphState


async def parse_doc(state: GraphState) -> Dict[str, Any]:
    """Parse uploaded document to text."""
    task_id = state["task_id"]
    storage_dir = os.path.join(settings.storage_path, task_id)

    parsed_text = ""

    # Find the original file
    original_file = None
    if os.path.exists(storage_dir):
        for f in os.listdir(storage_dir):
            if f.startswith("original"):
                original_file = os.path.join(storage_dir, f)
                break

    if not original_file or not os.path.exists(original_file):
        return {
            "parsed_text": None,
            "error_message": "Original file not found",
            "current_stage": "parse_failed",
            "progress": 0,
        }

    try:
        if original_file.endswith(".docx"):
            from docx import Document
            doc = Document(original_file)
            parsed_text = "\n".join([p.text for p in doc.paragraphs])
        elif original_file.endswith(".pdf"):
            from PyPDF2 import PdfReader
            reader = PdfReader(original_file)
            parsed_text = ""
            for page in reader.pages:
                parsed_text += page.extract_text() or ""
        else:
            return {
                "parsed_text": None,
                "error_message": f"Unsupported file type: {original_file}",
                "current_stage": "parse_failed",
                "progress": 0,
            }

        # Save parsed text
        with open(os.path.join(storage_dir, "parsed.txt"), "w", encoding="utf-8") as f:
            f.write(parsed_text)

    except Exception as e:
        return {
            "parsed_text": None,
            "error_message": f"Parse error: {str(e)}",
            "current_stage": "parse_failed",
            "progress": 0,
        }

    return {
        "parsed_text": parsed_text,
        "current_stage": "parse_complete",
        "progress": 25,
    }


async def extract_clauses(state: GraphState) -> Dict[str, Any]:
    """Extract clauses from parsed text."""
    parsed_text = state.get("parsed_text") or ""
    if not parsed_text.strip():
        return {
            "clauses": [],
            "error_message": "No text to extract clauses from",
        }

    # Simple clause extraction: split by common clause markers
    import re
    markers = r"(第[一二三四五六七八九十百千万\d]+[条条款款][^\n]*?[:：\s]*\n)"
    parts = re.split(markers, parsed_text, flags=re.MULTILINE)

    clauses = []
    for i in range(1, len(parts), 2):
        if i + 1 < len(parts):
            marker = parts[i].strip()
            content = parts[i + 1].strip()
            clauses.append({
                "title": marker,
                "content": content,
                "full_text": f"{marker}\n{content}",
            })

    # If no markers found, split by paragraphs
    if not clauses:
        paragraphs = [p.strip() for p in parsed_text.split("\n\n") if p.strip()]
        for i, para in enumerate(paragraphs):
            clauses.append({
                "title": f"段落 {i + 1}",
                "content": para,
                "full_text": para,
            })

    return {
        "clauses": clauses,
        "current_stage": "reviewing",
        "progress": 35,
    }


def _build_risk_prompt(clause: Dict[str, Any]) -> str:
    return f"""你是一个专业的合同审查专家。请分析以下合同条款，识别其中的法律风险。

合同条款：
{clause['full_text']}

请按照以下JSON格式返回分析结果（只返回JSON，不要其他内容）：
{{
  "level": "high/medium/low",
  "category": "breach_of_contract/intellectual_property/confidentiality/dispute_resolution/contract_termination/force_majeure/data_compliance/payment_terms/liability_limitation/other",
  "confidence": 0-100,
  "description": "风险说明",
  "suggestion": "修改建议",
  "legal_basis": "法律依据"
}}

如果没有风险，返回：
{{"has_risk": false}}
"""


async def analyze_risks(state: GraphState) -> Dict[str, Any]:
    """Use DeepSeek LLM to analyze risks in each clause."""
    from langchain_deepseek import ChatDeepSeek

    clauses = state.get("clauses", [])
    if not clauses:
        return {"risk_items": [], "progress": 100}

    llm = ChatDeepSeek(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key,
        temperature=0,
        max_retries=2,
    )

    risk_items = []
    total = len(clauses)

    for idx, clause in enumerate(clauses):
        try:
            response = await llm.ainvoke([
                ("system", "你是一个专业的合同审查专家。请用中文回答。只返回JSON格式的结果。"),
                ("human", _build_risk_prompt(clause)),
            ])

            content = response.content.strip()
            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            result = json.loads(content)

            if result.get("has_risk") is False:
                continue

            risk_items.append({
                "level": result.get("level", "medium"),
                "category": result.get("category", "other"),
                "confidence": float(result.get("confidence", 50)),
                "clause_text": clause["full_text"][:500],
                "clause_position": {
                    "section": clause.get("title", ""),
                    "offset_start": 0,
                    "offset_end": len(clause["full_text"]),
                },
                "description": result.get("description", ""),
                "suggestion": result.get("suggestion", ""),
                "legal_basis": result.get("legal_basis", ""),
            })
        except Exception as e:
            # If LLM fails, create a fallback risk item
            risk_items.append({
                "level": "medium",
                "category": "other",
                "confidence": 30.0,
                "clause_text": clause["full_text"][:500],
                "clause_position": {
                    "section": clause.get("title", ""),
                    "offset_start": 0,
                    "offset_end": len(clause["full_text"]),
                },
                "description": f"AI 分析异常: {str(e)}",
                "suggestion": "建议人工审查此条款",
                "legal_basis": "待补充",
            })

        # Update progress
        progress = 35 + int((idx + 1) / total * 55)
        state["progress"] = progress

    summary = f"审查完成，共识别 {len(risk_items)} 项风险。"

    return {
        "risk_items": risk_items,
        "current_stage": "pending_review",
        "progress": 100,
    }
