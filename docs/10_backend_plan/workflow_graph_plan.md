# Workflow Graph Plan v1.1

> 版本：v1.1 | 日期：2026-04-13（基于实际实现更新）

## Overview

MVP 实现采用纯 Python 异步工作流（`workflow_service.py`），未使用 LangGraph StateGraph。
工作流节点（parse_doc/extract_clauses/analyze_risks）仍保留在 `app/graph/nodes.py`，但由 `run_review_workflow()` 顺序调用。

## 实际工作流

```python
# workflow_service.py: run_review_workflow(task_id)
async def run_review_workflow(task_id: str):
    # Step 1: uploaded → parsing
    task.status = "parsing"; task.progress = 5; task.current_stage = "文档上传"
    emit_event(status_change, progress=5)

    # Step 2: parse_doc (app/graph/nodes.py)
    result = await parse_doc(state)
    update_task(progress=20, current_stage="文档解析")
    emit_event(stage_complete, stage="parse_doc", progress=20)

    # Step 3: extract_clauses (app/graph/nodes.py)
    result = await extract_clauses(state)
    update_task(progress=40, current_stage="条款提取")
    emit_event(stage_complete, stage="extract_clauses", progress=40)

    # Step 4: analyze_risks (app/graph/nodes.py, calls DeepSeek LLM)
    result = await analyze_risks(state)
    update_task(progress=60, current_stage="风险识别")
    emit_event(stage_complete, stage="analyze_risks", progress=60)

    # Step 5: 保存风险项 + pending_review
    save_risk_items_to_db()
    update_task(status="pending_review", progress=80, current_stage="待人工审核")
    emit_event(ai_complete, risk_count=N, progress=80)
```

## 6 阶段进度设计

| 阶段 | progress | current_stage | SSE 事件 |
|------|----------|---------------|---------|
| ① 文档上传 | 5% | 文档上传 | status_change |
| ② 文档解析 | 20% | 文档解析 | stage_complete |
| ③ 条款提取 | 40% | 条款提取 | stage_complete |
| ④ 风险识别 | 60% | 风险识别 | stage_complete |
| ⑤ 人工审核 | 80% | 待人工审核 | ai_complete |
| ⑥ 报告生成 | 100% | 报告生成 | status_change |

## Graph Nodes（app/graph/nodes.py）

1. **parse_doc**: 使用 python-docx (.docx) 或 PyPDF2 (.pdf) 提取文本
2. **extract_clauses**: 正则分句 + fallback 段落分割
3. **analyze_risks**: 调用 DeepSeek LLM (ChatDeepSeek)，逐条分析，收集风险项

## LLM Integration

- Package: `langchain-deepseek`
- Class: `ChatDeepSeek(model="deepseek-chat", api_key=..., temperature=0)`
- 每个条款独立分析，返回结构化 JSON 风险项

## 人工审核完成检查

```python
# check_and_finalize_review(task_id) — 每次人工审核提交后调用
if pending_high_risks == 0:
    emit_event(stage_complete, stage="human_review", progress=95)
    task.status = "report_ready"; task.progress = 100; task.current_stage = "报告生成"
    emit_event(status_change, status="report_ready", progress=100)
```
