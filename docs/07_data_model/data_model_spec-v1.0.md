# 数据模型规范 v1.1

> 版本：v1.1 | 日期：2026-04-13（基于实际实现更新）
> 阶段：07_data_model
> 前置文档：docs/06_architecture/（后端架构设计全部分文档）
>
> 本文档是 07_data_model 阶段的最终输出，汇总实际实现的数据模型定义，作为前后端实现的依据。
> **v1.1 变更**：MVP 实现精简为 5 个核心模型（去除 ReviewRule、ReviewResult、StatusTransition、InterruptRecord、ReviewSession）。

---

## 文档索引

| 子文档 | 内容 | 文件 |
|--------|------|------|
| 文档上传与任务状态 | Task、FileRecord、StatusTransition | [data_model_upload_task.md](data_model_upload_task.md) |
| 审核规则与风险项 | ReviewRule、RiskItem、ReviewResult、TextPosition | [data_model_review.md](data_model_review.md) |
| 人机交互流程 | HumanDecision、ReviewSession、ReviewHistory、InterruptRecord | [data_model_human_interaction.md](data_model_human_interaction.md) |

---

## 模型总览

本系统 MVP 实现 **5 个核心数据模型**（SQLAlchemy async ORM，SQLite）：

| 模型 | 职责 | 数据库表 |
|------|------|----------|
| `Task` | 审查任务核心，贯穿全生命周期，含进度/阶段/状态 | `tasks` |
| `FileRecord` | 上传文件的元信息与存储位置 | `file_records` |
| `RiskItem` | AI 识别的具体风险项，含人工审核状态 | `risk_items` |
| `HumanDecision` | 人工对单个风险项的决策记录 | `human_decisions` |
| `ReviewHistory` | 审核历史与审计追踪 | `review_history` |

---

## 完整关系图

```
Task (1) ── 1:1 ── FileRecord
  │
  │ 1:N
  ├── RiskItem (N) ── clause_position (内嵌 JSON)
  │        │
  │        │ 1:N
  │        └── HumanDecision (N)
  │
  └── ReviewHistory (N)
```

---

## 枚举类型汇总

### TaskStatus（任务状态）

| 值 | 说明 | 触发场景 |
|----|------|----------|
| `uploaded` | 已上传 | 文件上传完成，等待工作流启动 |
| `parsing` | 解析/审查中 | 工作流启动，覆盖解析→条款提取→风险识别全流程 |
| `review_failed` | 审查失败 | AI 调用异常或解析失败 |
| `parse_failed` | 解析失败 | 文档无法解析（格式错误） |
| `pending_review` | 待人工审核 | AI 分析完成，等待人工 |
| `human_reviewing` | 人工审核中 | 已有审核操作提交 |
| `report_ready` | 报告可导出 | 高风险全部处理，报告已生成 |
| `cancelled` | 已取消 | 用户主动取消 |

> **前端标签（STATUS_LABELS）**：
> - `parsing` → "AI审查中"，`pending_review` → "待审核"，`human_reviewing` → "审核中"
> - `report_ready` → "报告可导出"，`parse_failed`/`review_failed` → "解析失败"/"审查失败"

### RiskLevel（风险等级）

| 值 | 说明 | 前端颜色 |
|----|------|----------|
| `high` | 高风险 | 红色 |
| `medium` | 中风险 | 橙色 |
| `low` | 低风险 | 黄色 |

### HumanReviewStatus（人工审核状态）

| 值 | 说明 |
|----|------|
| `pending` | 待审核 |
| `approved` | 已确认 |
| `modified` | 已修改 |
| `rejected` | 已驳回 |

### ReviewAction（决策动作）

| 值 | 说明 | 状态变化 |
|----|------|----------|
| `approve` | 确认 AI 判定 | pending → approved |
| `modify` | 修改内容/等级 | pending → modified |
| `reject` | 驳回非风险项 | pending → rejected |

### RiskCategory（风险分类）

| 值 | 说明 |
|----|------|
| `breach_of_contract` | 违约责任 |
| `intellectual_property` | 知识产权 |
| `confidentiality` | 保密条款 |
| `dispute_resolution` | 争议解决 |
| `contract_termination` | 合同解除 |
| `force_majeure` | 不可抗力 |
| `data_compliance` | 数据合规 |
| `payment_terms` | 付款条款 |
| `liability_limitation` | 责任限制 |
| `other` | 其他 |

### ReviewEventType（审核历史事件类型）

| 值 | 说明 |
|----|------|
| `ai_complete` | AI 审查完成 |
| `review_submitted` | 单条/批量审核提交 |
| `report_generated` | 报告生成 |
| `task_cancelled` | 任务取消 |

---

## 前端必须展示字段汇总

### 任务列表页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| Task | `id` | 任务编号 |
| Task | `file_name` | 文件名 |
| Task | `status` | 状态标签（带颜色） |
| Task | `progress` | 进度条 |
| Task | `created_at` | 创建时间 |
| Task | `risk_count` | 风险数量徽章 |

### 任务详情页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| Task | `file_name` | 文件名 |
| Task | `file_size` | 文件大小（格式化） |
| Task | `status` | 当前状态 |
| Task | `current_stage` | 当前阶段 |
| Task | `error_message` | 错误提示 |
| Task | `created_at` | 创建时间 |
| Task | `completed_at` | 完成时间 |
| FileRecord | `original_name` | 原始文件名 |
| FileRecord | `file_size` | 文件大小 |
| FileRecord | `created_at` | 上传时间 |

### 审核结果页（GET /result 返回的 RiskItem 列表）

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| RiskItem | `id` | 风险编号 |
| RiskItem | `level` | 风险等级标签（高/中/低） |
| RiskItem | `category` | 分类标签 |
| RiskItem | `confidence` | 置信度条 |
| RiskItem | `clause_text` | 原文高亮 |
| RiskItem | `clause_position` | 位置面包屑（JSON: section/article/page） |
| RiskItem | `description` | 风险描述 |
| RiskItem | `suggestion` | 修改建议 |
| RiskItem | `legal_basis` | 法律依据 |
| RiskItem | `human_review_status` | 审核状态（pending/approved/modified/rejected） |
| HumanDecision | `action` | 决策动作标签 |
| HumanDecision | `comment` | 审核意见 |
| HumanDecision | `modified_description` | 修改后描述 |
| HumanDecision | `modified_suggestion` | 修改后建议 |

### 风险统计（前端本地计算）

```
high_count = RiskItem[level='high'].length
medium_count = RiskItem[level='medium'].length
low_count = RiskItem[level='low'].length
risk_score = min(100, high_count * 10 + medium_count * 5 + low_count * 2)
remaining_pending = RiskItem[level='high' AND human_review_status='pending'].length
```

### 审计日志页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| ReviewHistory | `event_type` | 事件类型 |
| ReviewHistory | `action` | 具体动作 |
| ReviewHistory | `operator` | 操作人 |
| ReviewHistory | `created_at` | 时间轴 |

---

## 后端存储字段汇总

### 存储策略（MVP 实际实现）

| 数据类型 | 存储方式 | 说明 |
|----------|----------|------|
| 任务元信息 | 数据库（SQLite，aiosqlite） | Task 表（含 progress/current_stage） |
| 文件元信息 | 数据库 | FileRecord 表 |
| 风险项 | 数据库 | RiskItem 表（含 clause_position JSON） |
| 人工决策 | 数据库 | HumanDecision 表 |
| 审核历史 | 数据库 | ReviewHistory 表 |
| 原始文件 | 文件系统（backend/storage/） | `{task_id}/original.{ext}` |
| 报告文件 | 文件系统（backend/storage/） | `{task_id}/report.pdf` |

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 工作流编排 | 纯 Python 异步 (workflow_service.py) | MVP 阶段避免 LangGraph 复杂性 |
| 进度字段 | Task.progress + Task.current_stage | 数字进度 + 阶段文字双字段，支持前端恢复显示 |
| 原文定位 | clause_position 内嵌 JSON | 随 RiskItem 一起序列化，查询简单 |
| 风险统计 | 前端本地聚合 | 避免后端维护冗余计数字段 |
| 审核历史 | ReviewHistory 统一事件模型 | 审计追踪，支持操作日志抽屉 |
| 每阶段 DB commit | 每步完成后立即 commit | 保证页面刷新后 progress 字段持久可读 |

---

## 下一步

1. **08_api_spec**：基于本数据模型定义每个 API 接口的请求/响应 Schema
2. **10_backend_plan**：制定后端实现计划，包括数据库建表、模型层开发、Service 层实现
3. **09_frontend_plan**：制定前端实现计划，基于前端必须展示字段设计页面和组件
