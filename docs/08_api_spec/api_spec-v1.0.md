# API 接口规范 v1.0

> 版本：v1.0 | 日期：2026-04-10
> 阶段：08_api_spec
> 前置文档：
> - `docs/03_problem_modeling/problem_core.md`
> - `docs/04_interaction_design/interaction_core_final.md`
> - `docs/06_architecture/backend_design_final-v1.0.md`
> - `docs/06_architecture/frontend_backend_boundary_spec-v1.0.md`
> - `docs/07_data_model/data_model_spec-v1.0.md`
>
> 本文档是前后端通信的唯一接口契约，所有接口定义均来源于前置文档，不做自主发散。

---

## 目录

- [1. 全局约定](#1-全局约定)
- [2. 通用 Schema](#2-通用-schema)
- [3. API 清单](#3-api-清单)
  - [3.1 文档上传](#31-post-apiv1tasksupload)
  - [3.2 任务状态查询](#32-get-apiv1taskstask_id)
  - [3.3 任务列表查询](#33-get-apiv1tasks)
  - [3.4 取消任务](#34-post-apiv1taskstask_idcancel)
  - [3.5 SSE 进度推送](#35-get-apiv1taskstask_idstream)
  - [3.6 审查结果查询](#36-get-apiv1taskstask_idresult)
  - [3.7 风险项详情](#37-get-apiv1taskstask_idrisksrisk_id)
  - [3.8 提交人工审核（单条）](#38-put-apiv1taskstask_idrisksrisk_idreview)
  - [3.9 批量人工审核](#39-post-apiv1taskstask_idreviewsbatch)
  - [3.10 生成审查报告](#310-post-apiv1taskstask_idreportgenerate)
  - [3.11 下载报告](#311-get-apiv1taskstask_idreport)
  - [3.12 查询操作日志](#312-get-apiv1taskstask_idauditlog)
- [4. 错误响应规范](#4-错误响应规范)
- [5. 前后端联调接入顺序](#5-前后端联调接入顺序)

---

## 1. 全局约定

### 1.1 基础协议

| 项目 | 约定 |
|------|------|
| Base URL | `/api/v1` |
| 数据格式 | JSON（`application/json`），文件上传为 `multipart/form-data`，SSE 为 `text/event-stream`，报告下载为 `application/pdf` |
| 时区 | UTC，ISO 8601 格式（`2026-04-10T06:30:00Z`） |
| 分页 | 游标分页，使用 `cursor` + `limit` |
| 幂等性 | 上传接口通过客户端生成的 `client_request_id` 保证幂等 |

### 1.2 统一错误响应

所有错误响应遵循统一格式（详见[第 4 节](#4-错误响应规范)）：

```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的错误描述",
  "details": {}
}
```

### 1.3 认证

MVP 阶段暂不实现复杂认证，预留 `X-User-Id` 请求头用于标识操作人，后续接入统一认证后替换。

---

## 2. 通用 Schema

以下 Schema 在多个接口中复用，定义为公共类型。

### 2.1 Task（任务）

| 字段 | 类型 | 必填 | 来源模型 | 说明 |
|------|------|------|----------|------|
| `id` | `string` | 是 | Task | 任务 UUID，等同于 LangGraph thread_id |
| `file_name` | `string` | 是 | Task | 原始文件名 |
| `file_size` | `integer` | 是 | Task | 文件大小（字节） |
| `status` | `string` | 是 | Task | 枚举值，见[任务状态表](#23-任务状态-taskstatus) |
| `progress` | `integer` | 是 | Task | 进度百分比（0-100） |
| `current_stage` | `string` | 否 | Task | 当前阶段名称，如 `parsing`、`analyzing_risks` |
| `error_message` | `string` | 否 | Task | 失败原因（仅失败时有值） |
| `created_at` | `string` | 是 | Task | ISO 8601 创建时间 |
| `completed_at` | `string` | 否 | Task | ISO 8601 完成时间 |
| `risk_count` | `integer` | 否 | Task | 风险项总数（审查完成后有值） |

### 2.2 RiskItem（风险项）

| 字段 | 类型 | 必填 | 来源模型 | 说明 |
|------|------|------|----------|------|
| `risk_id` | `string` | 是 | RiskItem | 风险项唯一 ID |
| `level` | `string` | 是 | RiskItem | 枚举：`high` / `medium` / `low` |
| `category` | `string` | 是 | RiskItem | 枚举值，见[规则分类表](#25-规则分类-rulecategory) |
| `confidence` | `number` | 是 | RiskItem | 置信度（0-100） |
| `clause_text` | `string` | 是 | RiskItem | 风险条款原文 |
| `clause_position` | `object` | 是 | TextPosition | 原文定位，见[2.6](#26-textposition原文定位) |
| `description` | `string` | 是 | RiskItem | 风险说明 |
| `suggestion` | `string` | 是 | RiskItem | 修改建议 |
| `legal_basis` | `string` | 是 | RiskItem | 法律依据 |
| `human_review_status` | `string` | 是 | RiskItem | 枚举：`pending` / `approved` / `modified` / `rejected` |
| `human_decision` | `object` | 否 | HumanDecision | 人工决策详情，见[2.7](#27-humandecision人工决策) |

### 2.3 任务状态（TaskStatus）

枚举值，来源于 `07_data_model/data_model_spec-v1.0.md`：

| 值 | 说明 | 前端对应 UI |
|----|------|------------|
| `uploaded` | 已上传 | 文件信息栏 |
| `parsing` | 解析中 | 阶段进度面板 |
| `parse_complete` | 解析完成 | 阶段进度面板 |
| `parse_failed` | 解析失败 | 失败面板 |
| `reviewing` | AI 审查中 | 阶段进度面板 + 总进度条 |
| `pending_review` | 待人工审核 | 风险项列表 + 审核操作区 |
| `human_reviewing` | 人工审核中 | 风险项列表（状态更新中） |
| `review_failed` | 审查失败 | 失败面板 |
| `report_ready` | 报告可导出 | 完成面板 + 下载报告按钮 |
| `cancelled` | 已取消 | 文件信息栏显示已取消 |

### 2.4 人工审核状态（HumanReviewStatus）

| 值 | 说明 |
|----|------|
| `pending` | 待审核 |
| `approved` | 已确认 |
| `modified` | 已修改 |
| `rejected` | 已驳回 |

### 2.5 规则分类（RuleCategory）

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

### 2.6 TextPosition（原文定位）

内嵌于 RiskItem 的 `clause_position` 字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `section` | `string` | 否 | 章节名称，如 `第八条` |
| `clause` | `string` | 否 | 条款编号，如 `第2款` |
| `page` | `integer` | 否 | 页码（PDF 文件） |
| `offset_start` | `integer` | 是 | 文本起始偏移量 |
| `offset_end` | `integer` | 是 | 文本结束偏移量 |

### 2.7 HumanDecision（人工决策）

| 字段 | 类型 | 必填 | 来源模型 | 说明 |
|------|------|------|----------|------|
| `action` | `string` | 是 | HumanDecision | 枚举：`approve` / `modify` / `reject` |
| `comment` | `string` | 否 | HumanDecision | 审核意见 |
| `modified_content` | `object` | 否 | HumanDecision | 修改后的内容（仅 action=modify 时有值） |
| `operator` | `string` | 是 | HumanDecision | 操作人（`X-User-Id`） |
| `created_at` | `string` | 是 | HumanDecision | ISO 8601 时间 |

### 2.8 ReviewResult（审查结果汇总）

| 字段 | 类型 | 必填 | 来源模型 | 说明 |
|------|------|------|----------|------|
| `total_risks` | `integer` | 是 | ReviewResult | 风险项总数 |
| `high_count` | `integer` | 是 | ReviewResult | 高风险数量 |
| `medium_count` | `integer` | 是 | ReviewResult | 中风险数量 |
| `low_count` | `integer` | 是 | ReviewResult | 低风险数量 |
| `summary` | `string` | 是 | ReviewResult | 审查总结段落 |
| `risk_items` | `RiskItem[]` | 是 | RiskItem | 风险项列表 |

### 2.9 AuditLog（审计日志）

| 字段 | 类型 | 必填 | 来源模型 | 说明 |
|------|------|------|----------|------|
| `event_type` | `string` | 是 | ReviewHistory | 枚举值，见[2.10](#210-审核事件类型-revieweventtype) |
| `action` | `string` | 是 | ReviewHistory | 具体动作描述 |
| `operator` | `string` | 是 | ReviewHistory | 操作人 |
| `created_at` | `string` | 是 | ReviewHistory | ISO 8601 时间 |
| `details` | `object` | 否 | ReviewHistory | 事件详情 |

### 2.10 审核事件类型（ReviewEventType）

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

### 2.11 SSE 事件类型

| 事件类型（`event`） | 说明 | `data` 结构 |
|---------------------|------|-------------|
| `status_change` | 任务状态变更 | `{ "task_id", "status", "progress", "current_stage" }` |
| `stage_complete` | 阶段完成 | `{ "task_id", "stage", "progress", "current_stage" }` |
| `ai_complete` | AI 审查完成 | `{ "task_id", "risk_count", "progress", "current_stage" }` |
| `error` | 错误通知 | `{ "task_id", "error_code", "error_message" }` |

### 2.12 工作流阶段（WorkflowStage）

后端 `current_stage` 字段值，对应前端 6 阶段进度条：

| 阶段名称 | progress 值 | 说明 |
|---------|------------|------|
| `文档上传` | 5% | 文件上传完成，开始解析 |
| `文档解析` | 20% | parse_doc 阶段完成 |
| `条款提取` | 40% | extract_clauses 阶段完成 |
| `风险识别` | 60% | analyze_risks 阶段完成 |
| `待人工审核` | 80% | AI 审查完成，等待人工处理 |
| `人工审核` | 95% | 人工审核完成，生成报告 |
| `报告生成` | 100% | 报告生成完成 |

---

## 3. API 清单

### 3.1 POST `/api/v1/tasks/upload`

**职责**：上传合同文件，创建审查任务。来源于 `backend_design_final-v1.0.md` API 列表和 `frontend_backend_boundary_spec` 前端职责清单。

**请求**：

- Content-Type：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | `File` | 是 | 合同文件（.docx / .pdf），≤ 50MB |
| `review_dimensions` | `string[]` | 否 | 审查维度，可选值：`risk_review`（风险审查）、`compliance_check`（合规检查），默认两者都选 |
| `client_request_id` | `string` | 否 | 客户端生成的幂等标识（UUID），用于防止重复上传 |

**响应**：`200 OK`

```json
{
  "task_id": "a1b2c3d4-...",
  "file_name": "采购合同_2026Q2.docx",
  "file_size": 5242880,
  "status": "uploaded",
  "created_at": "2026-04-10T06:30:00Z"
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 400 | `INVALID_FILE_TYPE` | 文件不是 .docx 或 PDF |
| 400 | `FILE_TOO_LARGE` | 文件大小超过 50MB |
| 400 | `EMPTY_FILE` | 文件为空 |
| 409 | `DUPLICATE_UPLOAD` | 7 天内已上传同名同大小文件（重复检测） |
| 500 | `UPLOAD_FAILED` | 文件存储失败 |

**SSE 推送**：上传成功后，前端应立即连接 SSE 端 `/api/v1/tasks/{task_id}/stream` 接收后续进度推送。

---

### 3.2 GET `/api/v1/tasks/{task_id}`

**职责**：查询单个任务的状态和基本信息。来源于 `backend_design_final-v1.0.md` API 列表。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**响应**：`200 OK`

```json
{
  "id": "a1b2c3d4-...",
  "file_name": "采购合同_2026Q2.docx",
  "file_size": 5242880,
  "status": "reviewing",
  "progress": 72,
  "current_stage": "analyzing_risks",
  "created_at": "2026-04-10T06:30:00Z",
  "completed_at": null
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |

---

### 3.3 GET `/api/v1/tasks`

**职责**：查询任务列表，用于首页最近审查记录展示。来源于 `frontend_backend_boundary_spec` 前端职责清单。

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `cursor` | `string` | 否 | - | 游标（上一页最后一条的 `created_at`） |
| `limit` | `integer` | 否 | 20 | 每页数量，最大 100 |
| `status` | `string` | 否 | - | 按状态过滤（TaskStatus 枚举值） |

**响应**：`200 OK`

```json
{
  "tasks": [
    {
      "id": "a1b2c3d4-...",
      "file_name": "采购合同_2026Q2.docx",
      "file_size": 5242880,
      "status": "report_ready",
      "progress": 100,
      "created_at": "2026-04-10T06:30:00Z",
      "risk_count": 25
    }
  ],
  "next_cursor": "2026-04-09T10:00:00Z",
  "has_more": true
}
```

---

### 3.4 POST `/api/v1/tasks/{task_id}/cancel`

**职责**：取消正在进行的审查任务。来源于 `frontend_backend_boundary_spec` 前端职责清单。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**请求体**：无

**响应**：`200 OK`

```json
{
  "task_id": "a1b2c3d4-...",
  "status": "cancelled"
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 409 | `TASK_NOT_CANCELLABLE` | 任务已处于终态（`report_ready` / `cancelled` / `*_failed`） |

---

### 3.5 GET `/api/v1/tasks/{task_id}/stream`

**职责**：SSE 实时推送审查进度。来源于 `backend_design_final-v1.0.md` SSE 推送设计和 `frontend_backend_boundary_spec` 状态同步策略。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**请求头**：

| 头 | 值 | 说明 |
|----|----|------|
| `Accept` | `text/event-stream` | 必须 |
| `Cache-Control` | `no-cache` | 必须 |

**响应**：`200 OK`（`text/event-stream`）

SSE 事件流格式：

```
event: status_change
data: {"task_id":"a1b2c3d4","status":"parsing","progress":5,"current_stage":"文档上传"}

event: stage_complete
data: {"task_id":"a1b2c3d4","stage":"parse_doc","progress":20,"current_stage":"文档解析"}

event: stage_complete
data: {"task_id":"a1b2c3d4","stage":"extract_clauses","progress":40,"current_stage":"条款提取"}

event: stage_complete
data: {"task_id":"a1b2c3d4","stage":"analyze_risks","progress":60,"current_stage":"风险识别"}

event: ai_complete
data: {"task_id":"a1b2c3d4","risk_count":25,"progress":80,"current_stage":"待人工审核"}

event: stage_complete
data: {"task_id":"a1b2c3d4","stage":"human_review","progress":95,"current_stage":"人工审核"}

event: status_change
data: {"task_id":"a1b2c3d4","status":"report_ready","progress":100,"current_stage":"报告生成"}
```

**说明**：
- 前端应在上传成功后立即建立 SSE 连接，直至收到 `status_change` (report_ready) 或 `error` 事件
- 后端在连接建立时推送当前最新状态作为首个事件
- 连接超时时间：30 分钟，超时后前端可重连
- SSE 降级方案：HTTP 轮询（GET `/api/v1/tasks/{task_id}`），每 1.5 秒一次

---

### 3.6 GET `/api/v1/tasks/{task_id}/result`

**职责**：获取完整的审查结果（风险项列表 + 汇总统计）。来源于 `backend_design_final-v1.0.md` 和 `frontend_backend_boundary_spec` 风险项列表接口。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `level` | `string` | 否 | - | 按风险等级过滤：`high` / `medium` / `low` |
| `review_status` | `string` | 否 | - | 按人工审核状态过滤：`pending` / `approved` / `modified` / `rejected` |

**响应**：`200 OK`

```json
{
  "summary": {
    "total_risks": 25,
    "high_count": 5,
    "medium_count": 8,
    "low_count": 12,
    "summary": "本合同共发现 25 项风险，其中高风险 5 项需重点处理..."
  },
  "risk_items": [
    {
      "risk_id": "risk-001",
      "level": "high",
      "category": "contract_termination",
      "confidence": 92,
      "clause_text": "甲方有权单方面解除本合同...",
      "clause_position": {
        "section": "第八条",
        "clause": "第2款",
        "offset_start": 1024,
        "offset_end": 1156
      },
      "description": "单方无限制解除权，违反公平原则",
      "suggestion": "建议增加双方协商解除条款，或限定解除条件",
      "legal_basis": "《民法典》第五百六十三条",
      "human_review_status": "pending"
    }
  ]
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 409 | `RESULT_NOT_READY` | 审查尚未完成，风险项数据不可用 |

---

### 3.7 GET `/api/v1/tasks/{task_id}/risks/{risk_id}`

**职责**：获取单个风险项的完整详情。来源于 `backend_design_final-v1.0.md` 和 `frontend_backend_boundary_spec` 风险项详情接口。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |
| `risk_id` | `string` | 风险项 ID |

**响应**：`200 OK`

```json
{
  "risk_id": "risk-001",
  "level": "high",
  "category": "contract_termination",
  "confidence": 92,
  "clause_text": "甲方有权单方面解除本合同，无需承担任何违约责任。",
  "clause_position": {
    "section": "第八条",
    "clause": "第2款",
    "page": 5,
    "offset_start": 1024,
    "offset_end": 1156
  },
  "description": "单方无限制解除权，违反公平原则，可能导致乙方权益受损",
  "suggestion": "建议增加双方协商解除条款，或限定解除条件为严重违约情形",
  "legal_basis": "《中华人民共和国民法典》第五百六十三条：有下列情形之一的，当事人可以解除合同...",
  "human_review_status": "pending"
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 404 | `RISK_NOT_FOUND` | 风险项不存在 |
| 409 | `RESULT_NOT_READY` | 审查尚未完成 |

---

### 3.8 PUT `/api/v1/tasks/{task_id}/risks/{risk_id}/review`

**职责**：提交单条风险项的人工审核决策。对应 LangGraph HITL 的 `Command(resume={decisions:...})` 机制。来源于 `backend_design_final-v1.0.md` 和 `problem_core.md` HITL 场景。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |
| `risk_id` | `string` | 风险项 ID |

**请求头**：

| 头 | 说明 |
|----|------|
| `X-User-Id` | 操作人标识（必填） |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | `string` | 是 | 枚举：`approve`（确认）/ `modify`（修改）/ `reject`（驳回） |
| `comment` | `string` | 条件必填 | 审核意见，`action=reject` 时必填 |
| `modified_content` | `object` | 条件必填 | 修改后的内容，`action=modify` 时必填 |

`modified_content` 结构：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | `string` | 否 | 修改后的风险等级 |
| `description` | `string` | 否 | 修改后的风险说明 |
| `suggestion` | `string` | 否 | 修改后的修改建议 |
| `legal_basis` | `string` | 否 | 修改后的法律依据 |

**响应**：`200 OK`

```json
{
  "risk_id": "risk-001",
  "human_review_status": "approved",
  "decision": {
    "action": "approve",
    "operator": "user-001",
    "created_at": "2026-04-10T07:00:00Z"
  },
  "remaining_pending": 4
}
```

`remaining_pending` 表示剩余待处理的高风险项数量，前端据此判断是否激活"生成报告"按钮。

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 400 | `INVALID_ACTION` | action 值不在枚举范围内 |
| 400 | `MISSING_COMMENT` | action=reject 但未提供 comment |
| 400 | `MISSING_MODIFIED_CONTENT` | action=modify 但未提供 modified_content |
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 404 | `RISK_NOT_FOUND` | 风险项不存在 |
| 409 | `INVALID_TASK_STATE` | 任务不在 `pending_review` 或 `human_reviewing` 状态 |
| 409 | `ALREADY_REVIEWED` | 该风险项已处理，不可重复操作 |

---

### 3.9 POST `/api/v1/tasks/{task_id}/reviews/batch`

**职责**：批量提交多条风险项的审核决策。来源于 `interaction_core_final.md` 批量操作设计和 `frontend_backend_boundary_spec`。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**请求头**：

| 头 | 说明 |
|----|------|
| `X-User-Id` | 操作人标识（必填） |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reviews` | `object[]` | 是 | 审核决策列表 |

单个 review 对象：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `risk_id` | `string` | 是 | 风险项 ID |
| `action` | `string` | 是 | `approve` / `modify` / `reject` |
| `comment` | `string` | 条件必填 | action=reject 时必填 |
| `modified_content` | `object` | 条件必填 | action=modify 时必填 |

请求示例：

```json
{
  "reviews": [
    { "risk_id": "risk-003", "action": "approve" },
    { "risk_id": "risk-004", "action": "approve" },
    { "risk_id": "risk-005", "action": "reject", "comment": "误报，该条款为标准模板" }
  ]
}
```

**响应**：`200 OK`

```json
{
  "updated_count": 3,
  "remaining_pending": 2,
  "results": [
    { "risk_id": "risk-003", "human_review_status": "approved" },
    { "risk_id": "risk-004", "human_review_status": "approved" },
    { "risk_id": "risk-005", "human_review_status": "rejected" }
  ]
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 400 | `EMPTY_BATCH` | reviews 列表为空 |
| 400 | `INVALID_REVIEW_ENTRY` | 某个 review 对象格式不合法 |
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 409 | `INVALID_TASK_STATE` | 任务不在 `pending_review` 或 `human_reviewing` 状态 |

---

### 3.10 POST `/api/v1/tasks/{task_id}/report/generate`

**职责**：触发审查报告生成。来源于 `backend_design_final-v1.0.md` 和 `frontend_backend_boundary_spec`。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**请求头**：

| 头 | 说明 |
|----|------|
| `X-User-Id` | 操作人标识（必填） |

**请求体**：无

**响应**：`200 OK`

```json
{
  "report_id": "rpt-a1b2c3d4",
  "generated_at": "2026-04-10T07:30:00Z",
  "summary": {
    "total_risks": 25,
    "high_count": 5,
    "medium_count": 8,
    "low_count": 12,
    "summary": "本合同共发现 25 项风险，经人工审核后确认高风险项 5 项已全部处理..."
  }
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 409 | `HIGH_RISKS_PENDING` | 仍有高风险项未处理，不可生成报告 |
| 409 | `REPORT_ALREADY_GENERATED` | 报告已生成过 |

---

### 3.11 GET `/api/v1/tasks/{task_id}/report`

**职责**：下载 PDF 审查报告。来源于 `backend_design_final-v1.0.md` 和 `frontend_backend_boundary_spec`。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**响应**：`200 OK`

- Content-Type：`application/pdf`
- Content-Disposition：`attachment; filename="{file_name}_审查报告.pdf"`
- Body：PDF 文件二进制流

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 409 | `REPORT_NOT_READY` | 报告尚未生成 |

---

### 3.12 GET `/api/v1/tasks/{task_id}/auditlog`

**职责**：查询操作日志（时间线）。来源于 `backend_design_final-v1.0.md` 和 `frontend_backend_boundary_spec`。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**响应**：`200 OK`

```json
{
  "logs": [
    {
      "event_type": "session_started",
      "action": "开始人工审核（第1轮）",
      "operator": "user-001",
      "created_at": "2026-04-10T06:45:00Z"
    },
    {
      "event_type": "decision_made",
      "action": "确认风险项 risk-001",
      "operator": "user-001",
      "created_at": "2026-04-10T06:46:00Z",
      "details": {
        "risk_id": "risk-001",
        "decision": "approve"
      }
    },
    {
      "event_type": "state_changed",
      "action": "任务状态变更为 report_ready",
      "operator": "system",
      "created_at": "2026-04-10T07:30:00Z",
      "details": {
        "from": "human_reviewing",
        "to": "report_ready"
      }
    }
  ]
}
```

**错误响应**：

| HTTP 状态码 | `code` | 触发条件 |
|-------------|--------|----------|
| 404 | `TASK_NOT_FOUND` | 任务不存在 |

---

## 4. 错误响应规范

所有错误响应统一使用以下格式：

```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的错误描述",
  "details": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `string` | 机器可读的错误码，全大写 + 下划线 |
| `message` | `string` | 人类可读的描述，可直接展示给用户 |
| `details` | `object` | 额外上下文信息，结构化字段 |

### 全局错误码汇总

| HTTP 状态码 | `code` | 说明 |
|-------------|--------|------|
| 400 | `INVALID_REQUEST` | 请求参数不合法 |
| 400 | `INVALID_FILE_TYPE` | 不支持的文件格式 |
| 400 | `FILE_TOO_LARGE` | 文件超过大小限制 |
| 400 | `EMPTY_FILE` | 文件为空 |
| 400 | `MISSING_COMMENT` | 驳回操作必须提供原因 |
| 400 | `MISSING_MODIFIED_CONTENT` | 修改操作必须提供修改内容 |
| 400 | `INVALID_ACTION` | 审核动作不在允许范围内 |
| 400 | `EMPTY_BATCH` | 批量操作列表为空 |
| 400 | `INVALID_REVIEW_ENTRY` | 批量操作中某条数据格式不合法 |
| 404 | `TASK_NOT_FOUND` | 任务不存在 |
| 404 | `RISK_NOT_FOUND` | 风险项不存在 |
| 409 | `DUPLICATE_UPLOAD` | 重复上传 |
| 409 | `TASK_NOT_CANCELLABLE` | 任务已处于终态，不可取消 |
| 409 | `INVALID_TASK_STATE` | 任务状态不允许当前操作 |
| 409 | `ALREADY_REVIEWED` | 风险项已处理 |
| 409 | `RESULT_NOT_READY` | 审查结果尚未就绪 |
| 409 | `HIGH_RISKS_PENDING` | 仍有高风险项未处理 |
| 409 | `REPORT_ALREADY_GENERATED` | 报告已生成 |
| 409 | `REPORT_NOT_READY` | 报告尚未生成 |
| 500 | `UPLOAD_FAILED` | 文件上传失败 |
| 500 | `PARSE_FAILED` | 文档解析失败 |
| 500 | `REVIEW_FAILED` | AI 审查失败 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |

---

## 5. 前后端联调接入顺序

以下顺序基于 `interaction_core_final.md` 完整交互链路和 `frontend_backend_boundary_spec` 数据流向图，定义了前端 P1（首页）→ P2（审查详情页）→ P3（报告预览页）三个页面与后端 API 的联调步骤。

### Phase 1：上传 + 任务创建

**目标**：跑通从首页上传文件到获得 task_id 的完整链路。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 1 | 用户选择/拖拽文件，客户端校验格式和大小 | — | 非 .docx/.pdf 或 > 50MB 直接拦截 |
| 2 | 发起 `POST /api/v1/tasks/upload`（multipart） | 3.1 文档上传 | 返回 `task_id` + `status: uploaded` |
| 3 | 校验通过后，路由跳转至 P2 审查详情页，URL 携带 `task_id` | — | 页面路由正确 |

### Phase 2：SSE 进度推送 + 状态展示

**目标**：前端实时展示解析和 AI 审查进度。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 4 | 进入 P2 后立即建立 SSE 连接 `GET /api/v1/tasks/{task_id}/stream` | 3.5 SSE 推送 | 收到首个事件为当前状态快照 |
| 5 | 后端异步执行：文档上传 → 文档解析 → 条款提取 → 风险识别 → 人工审核 → 报告生成 | — | SSE 依次推送 `status_change` + `stage_complete` |
| 6 | 前端根据 SSE 事件更新 UI 阶段进度面板和总进度条 | — | UI 正确显示 6 阶段进度 |
| 7 | **降级验证**：关闭 SSE 连接，前端切换为每 1.5 秒轮询 `GET /api/v1/tasks/{task_id}` | 3.2 任务状态查询 | 轮询能正确获取状态 |

**异常场景验证**：

| 场景 | 预期行为 |
|------|---------|
| 解析失败 | SSE 推送 `error` 事件，前端展示失败面板 + 重试按钮 |
| 用户点击取消 | 前端调用 `POST /api/v1/tasks/{task_id}/cancel`（3.4），状态变为 `cancelled` |
| SSE 超时断开 | 前端自动重连 |

### Phase 3：审查结果查询 + 风险项展示

**目标**：AI 审查完成后，前端展示风险项列表。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 8 | 收到 SSE `review_pending` 事件 | 3.5 SSE 推送 | 事件中包含 `risk_count` 和 `high_count` |
| 9 | 调用 `GET /api/v1/tasks/{task_id}/result` 获取风险项列表 | 3.6 审查结果查询 | 返回 summary + risk_items 数组 |
| 10 | 前端按 `level` 分组渲染风险项卡片（高 → 中 → 低） | — | 分组正确，默认收起 |
| 11 | 用户展开某个风险项，调用 `GET /api/v1/tasks/{task_id}/risks/{risk_id}` 获取详情 | 3.7 风险项详情 | 返回完整详情含原文定位、法律依据等 |

### Phase 4：人工审核（HITL）

**目标**：跑通单条审批 + 批量审批 + 状态流转。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 12 | 用户对单条高风险项点击"确认" | 3.8 提交人工审核（`action: approve`） | 返回 `human_review_status: approved` + `remaining_pending` |
| 13 | 前端更新该风险项状态标签为"已确认"，更新剩余待处理数 | — | UI 即时反馈 |
| 14 | 用户点击"驳回"，填写原因 | 3.8 提交人工审核（`action: reject` + `comment`） | 返回 `human_review_status: rejected` |
| 15 | 用户点击"修改"，编辑风险等级和审查意见 | 3.8 提交人工审核（`action: modify` + `modified_content`） | 返回 `human_review_status: modified` |
| 16 | 用户勾选多条中低风险项，点击"批量确认" | 3.9 批量人工审核 | 返回 `updated_count` + `remaining_pending` |
| 17 | 全部高风险项处理完毕后，前端激活"生成报告"按钮 | — | `remaining_pending` 为 0 时激活 |

### Phase 5：报告生成 + 下载

**目标**：跑通报告生成和下载链路。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 18 | 用户点击"生成报告" | 3.10 生成审查报告 | 返回 `report_id` + `summary` |
| 19 | 路由跳转至 P3 报告预览页 | — | 展示执行摘要 + 风险详情清单 |
| 20 | 用户点击"下载报告" | 3.11 下载报告 | 浏览器下载 PDF 文件 |

### Phase 6：操作日志 + 审计

**目标**：验证操作日志记录的完整性。

| 步骤 | 前端动作 | 后端接口 | 验证点 |
|------|---------|----------|--------|
| 21 | 用户点击审查详情页的"操作日志"入口 | 3.12 查询操作日志 | 返回完整时间线 |
| 22 | 前端以时间线形式展示日志 | — | 包含：上传 → 解析 → 审查 → 审核决策 → 报告生成的全链路记录 |

---

### 联调 CheckList

| 编号 | 检查项 | 涉及接口 | 状态 |
|------|--------|----------|------|
| C1 | 上传 .docx 文件成功，返回 task_id | 3.1 | □ |
| C2 | 上传 .pdf 文件成功，返回 task_id | 3.1 | □ |
| C3 | 上传非支持格式，返回 `INVALID_FILE_TYPE` | 3.1 | □ |
| C4 | 上传超大文件（> 50MB），返回 `FILE_TOO_LARGE` | 3.1 | □ |
| C5 | SSE 连接成功，收到状态快照 | 3.5 | □ |
| C6 | SSE 收到 `status_change` 事件，UI 状态更新 | 3.5 | □ |
| C7 | SSE 收到 `stage_complete` 事件，进度条和阶段更新 | 3.5 | □ |
| C8 | SSE 收到 `ai_complete` 事件，显示待人工审核状态 | 3.5 + 3.6 | □ |
| C9 | SSE 降级轮询，1.5 秒一次，状态正确 | 3.2 | □ |
| C10 | 风险项列表按高/中/低分组正确 | 3.6 | □ |
| C11 | 单条风险项详情字段完整 | 3.7 | □ |
| C12 | approve 操作，状态变更为 approved | 3.8 | □ |
| C13 | reject 操作（带 comment），状态变更为 rejected | 3.8 | □ |
| C14 | modify 操作（带 modified_content），状态变更为 modified | 3.8 | □ |
| C15 | 批量 approve 操作成功，返回 updated_count | 3.9 | □ |
| C16 | 批量 reject 操作成功 | 3.9 | □ |
| C17 | 全部高风险处理后，remaining_pending = 0 | 3.8 / 3.9 | □ |
| C18 | 生成报告成功，返回 report_id | 3.10 | □ |
| C19 | 下载 PDF 报告，文件可打开 | 3.11 | □ |
| C20 | 操作日志包含全链路记录 | 3.12 | □ |
| C21 | 取消任务后，状态变为 cancelled | 3.4 | □ |
| C22 | 首页任务列表点击"进度"按钮进入详情页 | P1 → P2 | □ |
| C23 | 6 阶段进度条正确显示（文档上传→文档解析→条款提取→风险识别→人工审核→报告生成） | UI | □ |
