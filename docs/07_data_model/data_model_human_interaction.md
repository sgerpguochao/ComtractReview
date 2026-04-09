# 数据模型：人机交互流程

> 版本：v1.0 | 日期：2026-04-09
> 阶段：07_data_model
> 前置文档：docs/06_architecture/backend_review_workflow.md

---

## 概述

本文档定义合同审查系统中**人机交互流程**相关的数据模型，包括人工决策记录、审核会话、审核历史、中断记录等。这些模型支撑 LangGraph HITL（Human-in-the-Loop）机制的完整生命周期。

---

## 1. HumanDecision（人工决策模型）

记录法务人员对单个风险项的审核决策。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 决策记录唯一标识 | 否 | 是 |
| `task_id` | UUID | 是 | - | 所属任务 ID | 否 | 是 |
| `risk_id` | String(36) | 是 | - | 关联的风险项 ID | 否 | 是 |
| `action` | Enum | 是 | - | 决策动作：approve / modify / reject | 是 | 是 |
| `comment` | Text | 否 | null | 审核意见/备注 | 是 | 是 |
| `modified_content` | Text | 否 | null | 修改后的条款内容（action=modify 时必填） | 是 | 是 |
| `original_level` | String(10) | 否 | null | AI 判定的原始风险等级（用于对比） | 否 | 是 |
| `modified_level` | String(10) | 否 | null | 人工调整后的风险等级（可选） | 否 | 是 |
| `reviewer_id` | String(100) | 否 | null | 审核人标识（当前 MVP 阶段可为空） | 是 | 是 |
| `reviewed_at` | DateTime | 是 | 当前时间 | 决策时间 | 否 | 是 |

### 决策动作枚举

```python
class ReviewAction(str, Enum):
    APPROVE = "approve"    # 确认：同意 AI 的风险判定
    MODIFY = "modify"      # 修改：认可风险存在但需调整内容/等级
    REJECT = "reject"      # 驳回：认为不是风险项
```

### 决策与 RiskItem 状态映射

| action | RiskItem.human_review_status 变化 |
|--------|-----------------------------------|
| approve | pending → approved |
| modify | pending → modified |
| reject | pending → rejected |

---

## 2. ReviewSession（审核会话模型）

记录一次完整的人工审核过程。一个任务可能对应多次审核会话（如 Time Travel 场景下重新审核）。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 审核会话唯一标识 | 否 | 是 |
| `task_id` | UUID | 是 | - | 关联的任务 ID | 否 | 是 |
| `session_number` | Integer | 是 | 1 | 会话序号（同一任务可能有多个会话） | 否 | 是 |
| `status` | Enum | 是 | `active` | 会话状态：active / completed / timeout | 否 | 是 |
| `total_risks` | Integer | 是 | 0 | 本次需审核的风险项总数 | 是 | 是 |
| `decisions_count` | Integer | 是 | 0 | 已提交的决策数 | 是 | 是 |
| `interrupt_id` | String(100) | 否 | null | 关联的 LangGraph 中断 ID | 否 | 是 |
| `started_at` | DateTime | 是 | 当前时间 | 审核开始时间 | 否 | 是 |
| `completed_at` | DateTime | 否 | null | 审核完成时间 | 否 | 是 |
| `timeout_at` | DateTime | 否 | null | 超时时间（started_at + 24h） | 否 | 是 |

### 审核会话状态枚举

```python
class ReviewSessionStatus(str, Enum):
    ACTIVE = "active"       # 审核中
    COMPLETED = "completed"  # 已完成
    TIMEOUT = "timeout"      # 已超时
```

### 说明

- 默认 24 小时超时机制
- `session_number` 支持同一任务多次审核的场景（Time Travel）
- 前端展示当前有多少风险项待审核（`total_risks - decisions_count`）

---

## 3. ReviewHistory（审核历史模型）

记录每一次状态变更和决策，用于审计追踪和时间旅行。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 历史记录唯一标识 | 否 | 是 |
| `task_id` | UUID | 是 | - | 关联的任务 ID | 否 | 是 |
| `session_id` | UUID | 否 | null | 关联的审核会话 ID | 否 | 是 |
| `event_type` | Enum | 是 | - | 事件类型，见枚举 | 否 | 是 |
| `risk_id` | String(36) | 否 | null | 涉及的风险项 ID（部分事件关联） | 否 | 是 |
| `action` | String(50) | 否 | null | 具体动作（如 approve、modify） | 否 | 是 |
| `details` | JSON | 否 | null | 事件详情（可变结构） | 否 | 是 |
| `operator` | String(100) | 否 | null | 操作人标识 | 否 | 是 |
| `checkpoint_id` | String(100) | 否 | null | 关联的 LangGraph checkpoint ID | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 事件发生时间 | 否 | 是 |

### 事件类型枚举

```python
class ReviewEventType(str, Enum):
    SESSION_STARTED = "session_started"          # 审核会话开始
    DECISION_MADE = "decision_made"              # 对某个风险项做了决策
    SESSION_COMPLETED = "session_completed"       # 审核会话完成
    SESSION_TIMEOUT = "session_timeout"           # 审核会话超时
    CHECKPOINT_CREATED = "checkpoint_created"     # 创建了 checkpoint
    CHECKPOINT_RESTORED = "checkpoint_restored"   # 从 checkpoint 恢复
    STATE_CHANGED = "state_changed"               # 任务状态变更
    INTERRUPT_TRIGGERED = "interrupt_triggered"   # 触发中断
    RESUME_REQUESTED = "resume_requested"         # 请求恢复执行
```

### 时间旅行场景支持

| 场景 | 实现方式 |
|------|----------|
| 回到某审核节点重新决策 | 通过 `checkpoint_id` 恢复到指定 checkpoint，创建新 session |
| 对比不同决策的影响 | 创建 fork session（`session_number + 1`），从同一 checkpoint 分支 |
| 审计追踪 | 查询 `ReviewHistory` 按 `created_at` 排序获取完整操作链 |

---

## 4. InterruptRecord（中断记录模型）

记录 LangGraph 中断事件的详细信息，用于前端渲染审核 UI 和后端追踪中断状态。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | String(100) | 是 | LangGraph 自动生成 | 中断 ID（LangGraph interrupt 返回的 ID） | 否 | 是 |
| `task_id` | UUID | 是 | - | 关联的任务 ID | 否 | 是 |
| `interrupt_type` | Enum | 是 | - | 中断类型，见枚举 | 是 | 是 |
| `context` | JSON | 是 | - | 中断上下文（即 interrupt() 传入的值） | 是 | 是 |
| `status` | Enum | 是 | `pending` | 中断状态：pending / resumed / expired | 否 | 是 |
| `resume_value` | JSON | 否 | null | 恢复时传入的值（Command.resume 的值） | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 中断触发时间 | 否 | 是 |
| `resumed_at` | DateTime | 否 | null | 中断恢复时间 | 否 | 是 |

### 中断类型枚举

```python
class InterruptType(str, Enum):
    HUMAN_REVIEW = "human_review"           # 风险审核中断（核心 HITL）
    REPORT_CONFIRMATION = "report_confirmation"  # 报告确认中断（可选）
    TOOL_APPROVAL = "tool_approval"          # 工具审批中断（高级场景）
```

### 中断状态枚举

```python
class InterruptStatus(str, Enum):
    PENDING = "pending"     # 等待处理
    RESUMED = "resumed"     # 已恢复执行
    EXPIRED = "expired"     # 已超时
```

### 中断上下文示例（human_review 类型）

```json
{
  "type": "human_review",
  "context": {
    "task_id": "550e8400-...",
    "total_risks": 5,
    "high_risks": [...],
    "medium_risks": [...],
    "low_risks": [...]
  },
  "instruction": "请审核 AI 识别的风险项，对每一项选择：确认 / 修改 / 驳回"
}
```

### LangGraph 中断规则对齐

| 规则 | 模型体现 |
|------|----------|
| interrupt 值必须 JSON 可序列化 | `context` 和 `resume_value` 均为 JSON 类型 |
| 节点内 interrupt 调用顺序一致 | `id` 由 LangGraph 按顺序生成 |
| interrupt 前副作用必须幂等 | 通过 ReviewHistory 记录每次状态变更 |
| 恢复时节点从头执行 | `status` 追踪 pending → resumed 的完整生命周期 |

---

## 模型关系图

```
Task (1) ──── (N) ReviewSession ──── (N) HumanDecision
                    │                        │
                    │                   risk_id → RiskItem
                    │
                    ├─── (N) ReviewHistory
                    │
                    └─── (N) InterruptRecord

ReviewSession (1) ──── (N) ReviewHistory（通过 session_id 关联）
InterruptRecord (1) ──── (0..1) ReviewSession（通过 interrupt_id 关联）
```

- **Task ↔ ReviewSession**：1:N 关系，支持同一任务多次审核（Time Travel）
- **ReviewSession ↔ HumanDecision**：1:N 关系，一个会话包含多个决策
- **Task ↔ ReviewHistory**：1:N 关系，完整审计链
- **Task ↔ InterruptRecord**：1:N 关系，记录所有中断事件
- **ReviewSession ↔ ReviewHistory**：1:N 关系，会话内的事件记录
- **InterruptRecord ↔ ReviewSession**：可选关联，通过 `interrupt_id` 匹配

---

## 前端必须展示字段汇总

| 模型 | 字段 | 展示位置 |
|------|------|----------|
| HumanDecision | `action` | 决策结果标签（颜色区分） |
| HumanDecision | `comment` | 审核意见展示区 |
| HumanDecision | `modified_content` | 修改后内容对比视图 |
| HumanDecision | `original_level` | 原始风险等级（对比用） |
| HumanDecision | `modified_level` | 调整后风险等级（对比用） |
| HumanDecision | `reviewer_id` | 审核人信息 |
| HumanDecision | `reviewed_at` | 审核时间 |
| ReviewSession | `session_number` | 当前审核轮次 |
| ReviewSession | `status` | 审核会话状态标签 |
| ReviewSession | `total_risks` | 审核进度总量 |
| ReviewSession | `decisions_count` | 审核进度已完量 |
| ReviewSession | `timeout_at` | 超时倒计时提示 |
| ReviewHistory | `event_type` | 审计日志事件类型 |
| ReviewHistory | `action` | 审计日志具体动作 |
| ReviewHistory | `operator` | 操作人 |
| ReviewHistory | `created_at` | 事件时间轴 |
| InterruptRecord | `interrupt_type` | 中断类型（决定前端渲染哪种审核 UI） |
| InterruptRecord | `context` | 中断上下文（审核数据源） |
| InterruptRecord | `status` | 中断处理状态 |
| InterruptRecord | `created_at` | 中断触发时间 |
