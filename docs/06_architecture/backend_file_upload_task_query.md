# 后端架构设计：文件上传、任务状态管理与审核结果查询

> 版本：v1.0 | 日期：2026-04-09
> 阶段：06_architecture
> 前置文档：docs/04_interaction_design/（交互核心设计）、docs/06_architecture/frontend_backend_boundary_spec-v1.0.md

---

## 1. 整体架构概览

后端采用 **分层架构**，由以下核心组件构成：

```
┌─────────────────────────────────────────────────────┐
│                   API Gateway (FastAPI)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Upload   │  │ Task     │  │ Review Result    │   │
│  │ Endpoints│  │ Endpoints│  │ Query Endpoints  │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       └──────────────┼────────────────┘             │
└──────────────────────┼──────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────┐
│              Service Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ File     │  │ Task     │  │ SSE Progress     │   │
│  │ Service  │  │ Manager  │  │ Broadcaster      │   │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘   │
│       └──────────────┼────────────────┐             │
└──────────────────────┼────────────────┼─────────────┘
                       │                │
┌──────────────────────┼────────────┐ ┌─┼─────────────────────────────────┐
│   LangGraph Engine   │            │ │  Storage Layer                    │
│  ┌────────────────┐  │            │ │  ┌──────────┐ ┌───────────────┐  │
│  │ Review Graph   │  │            │ │  │ Local FS │ │ PostgreSQL /  │  │
│  │ (LangChain)    │  │            │ │  │ / Cloud  │ │ SQLite (MVP)  │  │
│  │ + Checkpointer │  │            │ │  │ Storage  │ │ (Checkpoints) │  │
│  └────────────────┘  │            │ │  └──────────┘ └───────────────┘  │
└──────────────────────┴────────────┘ └─────────────────────────────────┘
```

---

## 2. 文件上传架构

### 2.1 上传流程

```
客户端 → POST /api/v1/tasks/upload
  ├─ 1. 前端本地校验（文件格式、大小）
  ├─ 2. 后端接收 multipart/form-data
  ├─ 3. 文件校验（MIME type、扩展名、大小 ≤50MB、病毒扫描-可选）
  ├─ 4. 生成 task_id (UUID)，写入任务记录（状态: uploaded）
  ├─ 5. 文件持久化到 storage/{task_id}/original.{ext}
  ├─ 6. 异步触发解析流程（返回 task_id 给前端）
  └─ 7. 前端通过 SSE / 轮询 获取进度
```

### 2.2 文件存储策略

| 层级 | 存储位置 | 内容 |
|------|----------|------|
| 原始文件 | `storage/{task_id}/original.{ext}` | 用户上传的原始合同 |
| 解析后文本 | `storage/{task_id}/parsed.txt` | 解析后的纯文本 |
| 审查中间态 | `storage/{task_id}/checkpoints/` | LangGraph checkpoint 数据 |
| 审查结果 | `storage/{task_id}/review_result.json` | AI 审查结果（风险项列表） |
| 最终报告 | `storage/{task_id}/report.pdf` | 生成的 PDF 报告 |

**MVP 阶段**：使用本地文件系统存储。
**生产阶段**：迁移至对象存储（S3 / OSS / MinIO）。

### 2.3 文件校验规则

- **格式白名单**：`.docx`, `.pdf`（文本型，非扫描版）
- **大小限制**：≤ 50MB
- **编码检测**：PDF 需为文本层可选（非纯图片扫描件）
- **DOCX 解析**：使用 `python-docx` 提取文本段落
- **PDF 解析**：使用 `pypdf` 或 `pdfplumber` 提取文本

### 2.4 上传接口设计

```
POST /api/v1/tasks/upload
Content-Type: multipart/form-data
  file: <binary>

Response 202 Accepted:
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "uploaded",
  "file_name": "contract.docx",
  "file_size": 1024000,
  "created_at": "2026-04-09T10:00:00Z"
}
```

---

## 3. 任务状态管理

### 3.1 状态机定义

基于 docs/04_interaction_design/ 中定义的状态机：

```
                    ┌─────────────┐
                    │   uploaded   │
                    └──────┬──────┘
                           │ trigger_parse()
                    ┌──────▼──────┐
                    │   parsing    │
                    └──┬───────┬──┘
                  fail │       │ success
               ┌───────▼─┐ ┌──▼──────────┐
               │parse_fail│ │parse_complete│
               └─────────┘ └──────┬───────┘
                                  │ trigger_review()
                           ┌──────▼───────┐
                           │  reviewing   │◄──────┐
                           │              │       │ resume
                           │ (LangGraph)  │       │ (HITL)
                           └──┬───────┬───┘       │
                        fail  │       │ interrupt  │
                     ┌────────▼─┐ ┌──▼──────────┐ │
                     │review_   │ │pending_review│─┘
                     │fail      │ │(HITL等待)    │
                     └──────────┘ └──────┬───────┘
                                         │ human_submit()
                                  ┌──────▼───────┐
                                  │reviewing_    │
                                  │human         │
                                  └──────┬───────┘
                                         │
                                  ┌──────▼───────┐
                                  │ report_ready │
                                  └──────────────┘
```

### 3.2 状态枚举

```python
class TaskStatus(str, Enum):
    UPLOADED = "uploaded"              # 已上传
    PARSING = "parsing"                # 解析中
    PARSE_COMPLETE = "parse_complete"   # 解析完成
    PARSE_FAILED = "parse_failed"       # 解析失败
    REVIEWING = "reviewing"            # AI 审查中
    PENDING_REVIEW = "pending_review"  # 待人工审核（HITL 中断点）
    HUMAN_REVIEWING = "human_reviewing" # 人工审核中
    REVIEW_FAILED = "review_failed"     # 审查失败
    REPORT_READY = "report_ready"       # 报告可导出
    CANCELLED = "cancelled"             # 已取消
```

### 3.3 状态持久化方案

| 数据 | 存储方式 | 说明 |
|------|----------|------|
| 任务元信息 | 数据库 (SQLite→PostgreSQL) | task_id, status, file_name, timestamps |
| LangGraph 状态 | Checkpointer (SQLite/PostgreSQL) | graph 内部状态、中间结果 |
| 进度事件 | 内存 + SSE Broadcast | 实时推送，不持久化 |
| 审查结果 | JSON 文件 + 数据库索引 | 风险项列表、置信度、位置信息 |

### 3.4 LangGraph Thread 与 Task 映射

每个审查任务对应一个 LangGraph `thread_id`：

```
task_id (UUID)  ←→  thread_id (same UUID)
```

- `thread_id` 作为持久化游标，复用时恢复同一 checkpoint
- 检查点通过 `SqliteSaver`（MVP）或 `PostgresSaver`（生产）持久化
- 前端通过 `task_id` 查询进度，后端用同一 ID 作为 LangGraph thread 标识

### 3.5 任务管理 API

```
# 获取任务状态
GET /api/v1/tasks/{task_id}
Response:
{
  "task_id": "...",
  "status": "reviewing",
  "progress": 65,
  "current_stage": "risk_analysis",
  "file_name": "contract.docx",
  "created_at": "...",
  "updated_at": "..."
}

# 获取任务列表
GET /api/v1/tasks?page=1&page_size=20&status=reviewing
Response: { "tasks": [...], "total": 42, "page": 1 }

# 取消任务
POST /api/v1/tasks/{task_id}/cancel
Response: { "task_id": "...", "status": "cancelled" }
```

---

## 4. 实时进度推送

### 4.1 方案选择：SSE（Server-Sent Events）

| 对比维度 | SSE | WebSocket |
|----------|-----|-----------|
| 方向 | 单向（服务端→客户端） | 双向 |
| 复杂度 | 低 | 中 |
| 重连 | 浏览器自动处理 | 需手动实现 |
| 适用场景 | 进度推送、状态更新 | 实时聊天、协同编辑 |

**决策**：MVP 使用 SSE。审查进度是单向推送场景，SSE 足够且实现简单。

### 4.2 SSE 事件流设计

```
GET /api/v1/tasks/{task_id}/stream
Accept: text/event-stream

Event Stream:
event: status
data: {"task_id": "...", "status": "parsing", "progress": 10}

event: stage_update
data: {"stage": "clause_extraction", "message": "正在提取合同条款..."}

event: risk_found
data: {"risk_id": "r1", "level": "high", "clause": "违约责任条款", "confidence": 0.92}

event: interrupt
data: {"interrupt_id": "...", "type": "human_approval", "details": {...}}

event: complete
data: {"status": "pending_review", "risk_count": 5}
```

### 4.3 进度广播架构

```
LangGraph Graph Node ──► TaskManager.update_progress()
                              │
                              ▼
                       ┌──────────────┐
                       │  Progress    │
                       │  Broadcaster │
                       │  (内存队列)   │
                       └──────┬───────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                 SSE_1     SSE_2     SSE_3
                (Tab 1)   (Tab 2)   (Mobile)
```

---

## 5. 审核结果查询

### 5.1 查询接口

```
# 获取完整审查结果
GET /api/v1/tasks/{task_id}/result
Response:
{
  "task_id": "...",
  "status": "pending_review",
  "summary": {
    "total_risks": 5,
    "high": 2,
    "medium": 2,
    "low": 1
  },
  "risks": [
    {
      "risk_id": "r1",
      "level": "high",
      "category": "违约责任",
      "confidence": 0.92,
      "clause_text": "...",
      "clause_position": {"page": 3, "section": "第5条"},
      "description": "违约金比例过高，超过法定上限",
      "suggestion": "建议将违约金调整为合同总额的20%以内",
      "human_review_status": "pending"  // pending | approved | modified | rejected
    }
  ],
  "report_available": false
}

# 获取单个风险项详情
GET /api/v1/tasks/{task_id}/risks/{risk_id}

# 提交人工审核意见
PUT /api/v1/tasks/{task_id}/risks/{risk_id}/review
Body:
{
  "action": "approve" | "modify" | "reject",
  "modified_text": "...",  // 仅 action=modify 时需要
  "comment": "..."
}

# 导出报告
GET /api/v1/tasks/{task_id}/report
Accept: application/pdf
```

### 5.2 风险项数据结构

```python
@dataclass
class RiskItem:
    risk_id: str           # 唯一标识
    level: RiskLevel       # high / medium / low
    category: str          # 风险分类
    confidence: float      # 0.0 - 1.0
    clause_text: str       # 原始条款文本
    clause_position: dict  # 位置信息（页码、章节）
    description: str       # 风险描述
    suggestion: str        # 修改建议
    legal_basis: str       # 法律依据
    human_review_status: str  # pending / approved / modified / rejected
    human_comment: str     # 人工备注
    modified_content: str  # 人工修改后的内容
```

---

## 6. 目录结构

```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── upload.py        # 文件上传接口
│   │   │   ├── tasks.py         # 任务管理接口
│   │   │   ├── results.py       # 审查结果查询
│   │   │   └── stream.py        # SSE 进度推送
│   ├── services/
│   │   ├── file_service.py      # 文件处理（上传、校验、存储）
│   │   ├── task_manager.py      # 任务状态管理
│   │   ├── review_service.py    # 审查引擎（LangGraph）
│   │   └── progress_broadcaster.py  # SSE 广播
│   ├── graph/
│   │   ├── review_graph.py      # LangGraph 审查图定义
│   │   ├── nodes.py             # 图节点实现
│   │   ├── state.py             # Graph State 定义
│   │   └── interrupt_handler.py # HITL 中断处理
│   ├── models/
│   │   ├── task.py              # 任务数据模型
│   │   └── risk.py              # 风险项模型
│   ├── storage/
│   │   └── local_storage.py     # 本地文件存储（MVP）
│   └── db/
│       ├── connection.py        # 数据库连接
│       └── repositories.py      # 数据访问层
├── storage/                     # 文件存储目录（.gitignore）
├── checkpointer.db              # SQLite checkpoint（MVP）
└── requirements.txt
```

---

## 7. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 上传方式 | multipart/form-data | 简单、浏览器原生支持 |
| 文件存储 | 本地 FS → 对象存储 | MVP 快速验证，生产可迁移 |
| 进度推送 | SSE | 单向场景，实现简单，浏览器自动重连 |
| 状态持久化 | DB(元信息) + Checkpointer(Graph状态) | 职责分离，LangGraph 原生支持 |
| task_id ↔ thread_id | 1:1 映射 | 简化追踪，一个任务一个审查线程 |
| 数据库 | SQLite → PostgreSQL | MVP 用 SQLite，生产迁移 |
