# 数据模型规范 v1.0

> 版本：v1.0 | 日期：2026-04-09
> 阶段：07_data_model
> 前置文档：docs/06_architecture/（后端架构设计全部分文档）
>
> 本文档是 07_data_model 阶段的最终输出，汇总所有数据模型定义，作为后续前后端实现的唯一依据。

---

## 文档索引

| 子文档 | 内容 | 文件 |
|--------|------|------|
| 文档上传与任务状态 | Task、FileRecord、StatusTransition | [data_model_upload_task.md](data_model_upload_task.md) |
| 审核规则与风险项 | ReviewRule、RiskItem、ReviewResult、TextPosition | [data_model_review.md](data_model_review.md) |
| 人机交互流程 | HumanDecision、ReviewSession、ReviewHistory、InterruptRecord | [data_model_human_interaction.md](data_model_human_interaction.md) |

---

## 模型总览

本系统共定义 **10 个核心数据模型**：

| 模型 | 职责 | 关联文档 |
|------|------|----------|
| `Task` | 审查任务核心，贯穿全生命周期 | 上传与任务状态 |
| `FileRecord` | 上传文件的元信息与存储位置 | 上传与任务状态 |
| `StatusTransition` | 任务状态变更历史 | 上传与任务状态 |
| `ReviewRule` | 可配置的审核规则模板 | 审核规则与风险项 |
| `RiskItem` | AI 识别的具体风险项 | 审核规则与风险项 |
| `ReviewResult` | 审查结果汇总 | 审核规则与风险项 |
| `TextPosition` | 风险项原文定位（内嵌于 RiskItem） | 审核规则与风险项 |
| `HumanDecision` | 人工对单个风险项的决策 | 人机交互流程 |
| `ReviewSession` | 一次完整的人工审核过程 | 人机交互流程 |
| `ReviewHistory` | 审核历史与审计追踪 | 人机交互流程 |
| `InterruptRecord` | LangGraph 中断事件记录 | 人机交互流程 |

---

## 完整关系图

```
                         ReviewRule (1)
                              │
                              │ 1:N
                              ▼
Task (1) ── 1:1 ── FileRecord          RiskItem (N) ←── TextPosition (内嵌 JSON)
  │                      │                  │
  │                      │                  │ 包含于
  │ 1:N                  │                  ▼
  ▼                      │           ReviewResult (1) ── 1:1 ── Task
StatusTransition (N)     │
                         │
                         │ 1:N
                         ▼
                  ReviewSession (N) ──── 1:N ──── HumanDecision (N)
                         │
                         │ 1:N
                         ▼
                  ReviewHistory (N)

Task (1) ── 1:N ── InterruptRecord (N)
```

---

## 枚举类型汇总

### TaskStatus（任务状态）

| 值 | 说明 | 触发场景 |
|----|------|----------|
| `uploaded` | 已上传 | 文件上传完成 |
| `parsing` | 解析中 | 触发文档解析 |
| `parse_complete` | 解析完成 | 文本提取成功 |
| `parse_failed` | 解析失败 | 文本提取失败 |
| `reviewing` | AI 审查中 | 触发 LangGraph 审查图 |
| `pending_review` | 待人工审核 | LangGraph interrupt 触发 |
| `human_reviewing` | 人工审核中 | 提交人工决策后恢复 |
| `review_failed` | 审查失败 | AI 调用异常 |
| `report_ready` | 报告可导出 | 审查流程完成 |
| `cancelled` | 已取消 | 用户主动取消 |

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

### RuleCategory（规则分类）

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

### InterruptType（中断类型）

| 值 | 说明 | 前端渲染 |
|----|------|----------|
| `human_review` | 风险审核 | 风险项审核列表 |
| `report_confirmation` | 报告确认 | 报告确认弹窗 |
| `tool_approval` | 工具审批 | 工具调用确认弹窗 |

### ReviewSessionStatus（审核会话状态）

| 值 | 说明 |
|----|------|
| `active` | 审核中 |
| `completed` | 已完成 |
| `timeout` | 已超时 |

### InterruptStatus（中断状态）

| 值 | 说明 |
|----|------|
| `pending` | 等待处理 |
| `resumed` | 已恢复执行 |
| `expired` | 已超时 |

### ReviewEventType（审核历史事件类型）

| 值 | 说明 |
|----|------|
| `session_started` | 审核会话开始 |
| `decision_made` | 对某个风险项做了决策 |
| `session_completed` | 审核会话完成 |
| `session_timeout` | 审核会话超时 |
| `checkpoint_created` | 创建了 checkpoint |
| `checkpoint_restored` | 从 checkpoint 恢复 |
| `state_changed` | 任务状态变更 |
| `interrupt_triggered` | 触发中断 |
| `resume_requested` | 请求恢复执行 |

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

### 审核结果页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| ReviewResult | `total_risks` | 风险总数 |
| ReviewResult | `high_count` | 高风险数（红色） |
| ReviewResult | `medium_count` | 中风险数（橙色） |
| ReviewResult | `low_count` | 低风险数（黄色） |
| ReviewResult | `summary` | 审查总结段落 |
| RiskItem | `risk_id` | 风险编号 |
| RiskItem | `level` | 风险等级标签 |
| RiskItem | `category` | 分类标签 |
| RiskItem | `confidence` | 置信度条 |
| RiskItem | `clause_text` | 原文高亮 |
| RiskItem | `clause_position` | 位置面包屑 |
| RiskItem | `description` | 风险描述 |
| RiskItem | `suggestion` | 修改建议 |
| RiskItem | `legal_basis` | 法律依据 |
| RiskItem | `human_review_status` | 审核状态 |
| HumanDecision | `action` | 决策标签 |
| HumanDecision | `comment` | 审核意见 |
| HumanDecision | `modified_content` | 修改后内容对比 |

### 审核操作页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| ReviewSession | `session_number` | 当前轮次 |
| ReviewSession | `total_risks` | 审核总量 |
| ReviewSession | `decisions_count` | 已完成量 |
| ReviewSession | `timeout_at` | 超时倒计时 |
| InterruptRecord | `context` | 审核数据源 |
| HumanDecision | `action` | 审核动作选择器 |
| HumanDecision | `comment` | 意见输入框 |
| HumanDecision | `modified_content` | 修改内容编辑器 |

### 审计日志页

| 模型 | 字段 | 展示形式 |
|------|------|----------|
| ReviewHistory | `event_type` | 事件类型 |
| ReviewHistory | `action` | 具体动作 |
| ReviewHistory | `operator` | 操作人 |
| ReviewHistory | `created_at` | 时间轴 |

---

## 后端必须存储字段汇总

所有模型的所有字段均为 `backend_required: true`，需要在数据库或文件系统中持久化。

### 存储策略

| 数据类型 | 存储方式 | 说明 |
|----------|----------|------|
| 任务元信息 | 数据库（SQLite MVP → PostgreSQL 生产） | Task 表 |
| 文件元信息 | 数据库 | FileRecord 表 |
| 状态转换记录 | 数据库 | StatusTransition 表 |
| 审核规则 | 数据库 | ReviewRule 表 |
| 风险项 | 数据库 + JSON 文件 | RiskItem 表 + review_result.json |
| 审核结果汇总 | 数据库 + JSON 文件 | ReviewResult 表 |
| 人工决策 | 数据库 | HumanDecision 表 |
| 审核会话 | 数据库 | ReviewSession 表 |
| 审核历史 | 数据库 | ReviewHistory 表 |
| 中断记录 | 数据库 | InterruptRecord 表 |
| LangGraph 状态 | Checkpointer（SQLite/PostgreSQL） | 图内部状态，不直接操作 |
| 原始文件 | 文件系统（storage/） | `{task_id}/original.{ext}` |
| 解析文本 | 文件系统（storage/） | `{task_id}/parsed.txt` |
| 审查结果 | 文件系统（storage/） | `{task_id}/review_result.json` |
| 报告文件 | 文件系统（storage/） | `{task_id}/report.pdf` |

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| task_id ↔ thread_id | 1:1 同一 UUID | 简化追踪，一个任务一个审查线程 |
| 风险项存储 | DB 表 + JSON 文件双写 | DB 用于查询，JSON 供 LangGraph 使用 |
| 原文定位 | 内嵌 JSON 而非独立表 | 位置信息随风险项一起序列化，简化 LangGraph 集成 |
| 审核会话 | 独立模型而非 Task 字段 | 支持 Time Travel，同一任务多次审核 |
| 审核历史 | 统一事件模型 | 灵活记录各类事件，便于审计和回溯 |
| 中断记录 | 独立模型 | 追踪 LangGraph 中断生命周期 |
| 统计字段冗余 | ReviewResult 中冗余计数 | 避免前端每次聚合，提升查询性能 |
| 超时机制 | 24 小时默认超时 | 防止审核会话永久挂起 |

---

## 下一步

1. **08_api_spec**：基于本数据模型定义每个 API 接口的请求/响应 Schema
2. **10_backend_plan**：制定后端实现计划，包括数据库建表、模型层开发、Service 层实现
3. **09_frontend_plan**：制定前端实现计划，基于前端必须展示字段设计页面和组件
