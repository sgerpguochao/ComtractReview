# HITL Flow Plan v1.1

> 版本：v1.1 | 日期：2026-04-13（基于实际实现更新）

## 实际实现：REST API 驱动的人工审核

MVP 不使用 LangGraph `interrupt()`，改为 REST API 驱动：

### 人工审核流程

```
AI 分析完成 (pending_review)
   │
   ├── 前端加载风险项列表: GET /api/v1/tasks/{task_id}/result
   │
   ├── 单条审核: PUT /api/v1/tasks/{task_id}/risks/{risk_id}/review
   │    body: { action: "approve" | "modify" | "reject", comment, ... }
   │    └── 调用 check_and_finalize_review(task_id)
   │
   ├── 批量审核: POST /api/v1/tasks/{task_id}/reviews/batch
   │    body: { action: "approve" | "reject", risk_ids: [...], reason }
   │    └── 调用 check_and_finalize_review(task_id)
   │
   └── 高风险全部处理完毕
        └── status → report_ready, progress=100
```

### check_and_finalize_review 逻辑

```python
pending_high = COUNT(RiskItem WHERE level='high' AND human_review_status='pending')
if pending_high == 0 AND task.status in ('pending_review', 'human_reviewing'):
    emit SSE: stage_complete(human_review, progress=95)
    task.status = "report_ready"; task.progress = 100; task.current_stage = "报告生成"
    emit SSE: status_change(report_ready, progress=100)
```

## SSE 事件类型（实际实现）

| 事件名 | 触发时机 | 关键数据 |
|--------|---------|---------|
| `status_change` | 任务状态切换 | `status`, `progress`, `current_stage` |
| `stage_complete` | 每个工作流阶段完成 | `stage`, `progress`, `current_stage` |
| `ai_complete` | AI 审查完成，进入待人工审核 | `risk_count`, `progress`, `current_stage` |
| `error` | 工作流异常 | `message`, `current_stage` |

## ReviewAction 枚举（审核动作值）

| 值 | 含义 | RiskItem.human_review_status 变更 |
|----|------|----------------------------------|
| `approve` | 确认 AI 判定 | pending → approved |
| `modify` | 修改内容/等级 | pending → modified |
| `reject` | 驳回非风险项 | pending → rejected |

> **注意**：前端发送的 action 值为 `approve`/`reject`（非 `approved`/`rejected`）。

## 报告生成

```
POST /api/v1/tasks/{task_id}/report/generate
   └── report_service.py 使用 reportlab 生成 PDF → storage/{task_id}/report.pdf

GET /api/v1/tasks/{task_id}/report
   └── 返回 FileResponse(report.pdf, media_type="application/pdf")
```
