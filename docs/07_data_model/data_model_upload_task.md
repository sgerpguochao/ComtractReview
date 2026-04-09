# 数据模型：文档上传与任务状态

> 版本：v1.0 | 日期：2026-04-09
> 阶段：07_data_model
> 前置文档：docs/06_architecture/backend_file_upload_task_query.md

---

## 概述

本文档定义合同审查系统中**文档上传**与**任务状态管理**相关的数据模型，包括 Task（核心任务）、FileRecord（文件记录）、StatusTransition（状态转换历史）。

---

## 1. Task（任务模型）

核心模型，贯穿整个审查生命周期。每个 Task 对应一个 LangGraph thread（1:1 映射）。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 任务唯一标识，同时作为 LangGraph thread_id | 是 | 是 |
| `status` | Enum | 是 | `uploaded` | 任务当前状态，见状态枚举 | 是 | 是 |
| `file_name` | String(255) | 是 | - | 用户上传的原始文件名 | 是 | 是 |
| `file_size` | Integer | 是 | - | 文件大小（字节） | 是 | 是 |
| `file_extension` | String(10) | 是 | - | 文件扩展名，如 `.docx`、`.pdf` | 否 | 是 |
| `file_mime_type` | String(100) | 是 | - | 文件 MIME 类型 | 否 | 是 |
| `parsed_text_path` | String(500) | 否 | null | 解析后纯文本的存储路径 | 否 | 是 |
| `original_file_path` | String(500) | 是 | - | 原始文件的存储路径 | 否 | 是 |
| `report_file_path` | String(500) | 否 | null | 生成的 PDF 报告路径 | 是 | 是 |
| `current_stage` | String(50) | 否 | null | 当前执行阶段名（如 `parsing`、`risk_analysis`），用于 SSE 推送 | 是 | 否 |
| `progress` | Integer | 否 | 0 | 进度百分比（0-100），用于前端展示 | 是 | 否 |
| `error_message` | Text | 否 | null | 失败时的错误信息 | 是 | 是 |
| `risk_count` | Integer | 否 | 0 | AI 识别的风险项总数 | 是 | 是 |
| `high_risk_count` | Integer | 否 | 0 | 高风险项数量 | 是 | 是 |
| `review_result_path` | String(500) | 否 | null | 审查结果 JSON 文件路径 | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 任务创建时间 | 是 | 是 |
| `updated_at` | DateTime | 是 | 当前时间 | 任务最后更新时间 | 是 | 是 |
| `completed_at` | DateTime | 否 | null | 任务完成时间（状态变为 report_ready 时设置） | 是 | 是 |

### 状态枚举

```python
class TaskStatus(str, Enum):
    UPLOADED = "uploaded"              # 已上传，等待解析
    PARSING = "parsing"                # 文档解析中
    PARSE_COMPLETE = "parse_complete"   # 解析完成
    PARSE_FAILED = "parse_failed"       # 解析失败
    REVIEWING = "reviewing"            # AI 审查中
    PENDING_REVIEW = "pending_review"  # 待人工审核（HITL 中断点）
    HUMAN_REVIEWING = "human_reviewing" # 人工审核中
    REVIEW_FAILED = "review_failed"     # 审查失败
    REPORT_READY = "report_ready"       # 报告可导出
    CANCELLED = "cancelled"             # 已取消
```

### 存储路径规则

```
storage/
  {task_id}/
    original.{ext}          ← original_file_path
    parsed.txt              ← parsed_text_path
    review_result.json      ← review_result_path
    report.pdf              ← report_file_path
```

---

## 2. FileRecord（文件记录模型）

记录上传文件的元信息与存储位置，与 Task 1:1 关联。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 文件记录唯一标识 | 否 | 是 |
| `task_id` | UUID | 是 | - | 关联的任务 ID（外键 → Task.id） | 否 | 是 |
| `original_name` | String(255) | 是 | - | 用户上传时的原始文件名 | 是 | 是 |
| `storage_path` | String(500) | 是 | - | 文件在存储系统中的实际路径 | 否 | 是 |
| `file_size` | Integer | 是 | - | 文件大小（字节） | 是 | 是 |
| `mime_type` | String(100) | 是 | - | MIME 类型 | 否 | 是 |
| `checksum` | String(64) | 是 | - | 文件 SHA-256 校验值（用于去重/完整性校验） | 否 | 是 |
| `is_parsed` | Boolean | 是 | false | 是否已成功解析 | 否 | 是 |
| `parsed_at` | DateTime | 否 | null | 解析完成时间 | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 上传时间 | 是 | 是 |

---

## 3. StatusTransition（状态转换记录）

记录任务状态的每一次变更，用于审计和故障排查。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 转换记录唯一标识 | 否 | 是 |
| `task_id` | UUID | 是 | - | 关联的任务 ID（外键 → Task.id） | 否 | 是 |
| `from_status` | String(50) | 否 | null | 转换前的状态（首次创建时为 null） | 否 | 是 |
| `to_status` | String(50) | 是 | - | 转换后的状态 | 否 | 是 |
| `trigger` | String(100) | 否 | null | 触发转换的原因/操作名 | 否 | 是 |
| `metadata` | JSON | 否 | null | 附加上下文信息（如节点名、错误详情） | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 转换发生时间 | 否 | 是 |

### 状态转换关系图

```
uploaded → parsing → parse_complete → reviewing → pending_review
                                                    ↓
                                              human_reviewing
                                                    ↓
                                               report_ready

异常分支：
  parsing → parse_failed
  reviewing → review_failed
  any → cancelled
```

---

## 模型关系图

```
Task (1) ──── (1) FileRecord
  │
  └─── (N) StatusTransition
```

- **Task ↔ FileRecord**：1:1 关系，一个任务对应一个上传文件记录
- **Task ↔ StatusTransition**：1:N 关系，一个任务有多次状态转换记录

---

## 前端必须展示字段汇总

| 模型 | 字段 | 展示位置 |
|------|------|----------|
| Task | `id` | 任务列表、任务详情 |
| Task | `status` | 任务列表状态标签、详情页 |
| Task | `file_name` | 任务列表、详情页 |
| Task | `file_size` | 任务列表、详情页（格式化后） |
| Task | `current_stage` | SSE 进度条、状态提示 |
| Task | `progress` | 进度条 |
| Task | `error_message` | 错误提示弹窗 |
| Task | `risk_count` | 审查结果页 |
| Task | `high_risk_count` | 审查结果页高亮 |
| Task | `report_file_path` | 报告下载按钮 |
| Task | `created_at` | 任务列表时间列 |
| Task | `completed_at` | 任务详情完成时间 |
| FileRecord | `original_name` | 文件上传确认页 |
| FileRecord | `file_size` | 文件信息卡片 |
| FileRecord | `created_at` | 上传时间 |
