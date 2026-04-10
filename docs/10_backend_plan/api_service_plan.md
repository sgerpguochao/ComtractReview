# API Service Plan

## 12 Endpoints Implemented
All 12 endpoints from api_spec-v1.0.md are implemented in FastAPI:

| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | POST | /api/v1/tasks/upload | tasks.py:upload_task |
| 2 | GET | /api/v1/tasks/{task_id} | tasks.py:get_task |
| 3 | GET | /api/v1/tasks | tasks.py:list_tasks |
| 4 | POST | /api/v1/tasks/{task_id}/cancel | tasks.py:cancel_task |
| 5 | GET | /api/v1/tasks/{task_id}/stream | tasks.py:stream_task (SSE) |
| 6 | GET | /api/v1/tasks/{task_id}/result | tasks.py:get_result |
| 7 | GET | /api/v1/tasks/{task_id}/risks/{risk_id} | tasks.py:get_risk_detail |
| 8 | PUT | /api/v1/tasks/{task_id}/risks/{risk_id}/review | review.py:submit_single_review |
| 9 | POST | /api/v1/tasks/{task_id}/reviews/batch | review.py:batch_review |
| 10 | POST | /api/v1/tasks/{task_id}/report/generate | report.py:generate_report_endpoint |
| 11 | GET | /api/v1/tasks/{task_id}/report | report.py:download_report |
| 12 | GET | /api/v1/tasks/{task_id}/auditlog | report.py:get_audit_log |

## Database
- SQLite via SQLAlchemy async (aiosqlite)
- 5 models: Task, FileRecord, RiskItem, HumanDecision, ReviewHistory

## Services
- file_service.py: Upload validation, storage, duplicate check
- task_service.py: Task CRUD, state machine, pagination
- review_service.py: Review submission, risk item queries
- report_service.py: PDF generation with reportlab
- sse_manager.py: SSE connection management, broadcast
