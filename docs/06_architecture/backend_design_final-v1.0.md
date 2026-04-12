# 后端架构设计总览 v1.1

> 版本：v1.1 | 日期：2026-04-13（基于实际实现更新）
> 阶段：06_architecture
> 作者：Backend Architecture Team (Agent Teams)
> 前置文档：docs/04_interaction_design/、docs/05_prototype_spec/、docs/06_architecture/frontend_backend_boundary_spec-v1.0.md

---

## 文档索引

本文档是后端架构设计的汇总，详细设计见以下分文档：

| 分文档 | 内容 | 文件 |
|--------|------|------|
| 文件上传与任务管理 | 上传流程、存储策略、状态机、API 设计、SSE 推送 | [backend_file_upload_task_query.md](backend_file_upload_task_query.md) |
| 审核流程与 HITL | LangGraph 审查图、中断点设计、恢复流程、Checkpoint 策略 | [backend_review_workflow.md](backend_review_workflow.md) |

---

## 架构总览

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| Web 框架 | FastAPI | 异步支持，原生 OpenAPI |
| AI 引擎 | LangChain + LangGraph | Agent 编排，HITL 支持 |
| 状态持久化 | SQLite (MVP) → PostgreSQL (生产) | Checkpointer + 任务元信息 |
| 文件存储 | 本地文件系统 (MVP) → 对象存储 (生产) | 原始文件、解析结果、报告 |
| 实时推送 | SSE (Server-Sent Events) | 进度推送、中断通知 |

### 核心组件关系

```
                    ┌─────────────────────────────────────┐
                    │            FastAPI Gateway           │
                    │  Upload │ Tasks │ Results │ Stream   │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
    │  File Service    │ │  Task Manager   │ │  Review Service │
    │  (上传/校验/存储) │ │  (状态/进度)    │ │  (LangGraph)    │
    └────────┬─────────┘ └────────┬────────┘ └────────┬────────┘
             │                    │                    │
    ┌────────▼────────────────────▼────────────────────▼────────┐
    │                    Storage Layer                          │
    │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
    │  │ File Storage │  │   Database   │  │  Checkpointer  │  │
    │  │ (local/S3)   │  │ (SQLite/PG)  │  │  (SQLite/PG)   │  │
    │  └──────────────┘  └──────────────┘  └────────────────┘  │
    └──────────────────────────────────────────────────────────┘
```

---

## 核心设计决策汇总

### 1. 文件上传

| 决策 | 选择 | 理由 |
|------|------|------|
| 上传协议 | multipart/form-data | 浏览器原生支持，简单可靠 |
| 文件格式 | .docx + 文本型 PDF | MVP 覆盖主要场景 |
| 大小限制 | 50MB | 平衡体验与处理成本 |
| 存储策略 | 本地 FS → 对象存储 | 快速启动，按需迁移 |

### 2. 任务状态管理

| 决策 | 选择 | 理由 |
|------|------|------|
| 状态机 | 10 种状态 | 覆盖正常流程 + 异常分支 |
| 状态存储 | DB(元信息) + Checkpointer(Graph状态) | 职责分离 |
| 进度推送 | SSE | 单向场景，实现简单 |
| task ↔ thread | 1:1 UUID 映射 | 简化追踪 |

### 3. 审核流程 (HITL)

| 决策 | 选择 | 理由 |
|------|------|------|
| 流程编排 | 纯 Python 异步工作流 (workflow_service.py) | MVP 阶段无需 LangGraph HITL，简化实现 |
| HITL 方式 | REST API（人工提交审核结果） | 前端通过 PUT/POST 接口提交单条/批量审核 |
| 状态驱动 | 高风险全部处理后自动推进至 report_ready | check_and_finalize_review() 检查后触发 |
| 进度推送 | SSE + 前端 1.5s 轮询降级 | 混合方案，保证进度可见 |

### 4. 审查结果查询

| 决策 | 选择 | 理由 |
|------|------|------|
| 查询方式 | RESTful API | 标准、可缓存 |
| 风险项结构 | 标准化 RiskItem | 包含 AI + 人工审核全字段 |
| 报告导出 | PDF 下载 | 前端触发，后端生成 |

---

## 完整 API 列表（实际已实现 12 个）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | POST | `/api/v1/tasks/upload` | 上传合同文件 |
| 2 | GET | `/api/v1/tasks/{task_id}` | 查询任务状态 |
| 3 | GET | `/api/v1/tasks` | 查询任务列表 |
| 4 | POST | `/api/v1/tasks/{task_id}/cancel` | 取消任务 |
| 5 | GET | `/api/v1/tasks/{task_id}/stream` | SSE 进度推送 |
| 6 | GET | `/api/v1/tasks/{task_id}/result` | 获取审查结果（风险项列表） |
| 7 | GET | `/api/v1/tasks/{task_id}/risks/{risk_id}` | 获取风险项详情 |
| 8 | PUT | `/api/v1/tasks/{task_id}/risks/{risk_id}/review` | 提交单条人工审核 |
| 9 | POST | `/api/v1/tasks/{task_id}/reviews/batch` | 批量审核（批量确认/驳回） |
| 10 | POST | `/api/v1/tasks/{task_id}/report/generate` | 生成 PDF 报告 |
| 11 | GET | `/api/v1/tasks/{task_id}/report` | 下载 PDF 报告 |
| 12 | GET | `/api/v1/tasks/{task_id}/auditlog` | 查询操作审计日志 |

---

## LangGraph 审查图概要

> **注意（v1.1 更新）**：MVP 实现中未使用 LangGraph HITL，而是采用纯 Python 异步工作流。工作流由 `workflow_service.py` 中的 `run_review_workflow()` 顺序执行各阶段节点。

### 实际工作流 (workflow_service.py)

```
run_review_workflow(task_id)
   ├── uploaded → parsing  (progress=5, current_stage="文档上传")
   │    ├── parse_doc()         (progress=20, current_stage="文档解析")
   │    ├── extract_clauses()   (progress=40, current_stage="条款提取")
   │    └── analyze_risks()     (progress=60, current_stage="风险识别")
   │         └── 保存 RiskItem → pending_review (progress=80, current_stage="待人工审核")
   │
   └── 异常: review_failed
```

### 人工审核完成检查 (check_and_finalize_review)

```
高风险全部处理完毕
   └── stage_complete(human_review, progress=95)
        └── report_ready (progress=100, current_stage="报告生成")
```

### SSE 事件类型

| 事件 | 触发时机 | 关键字段 |
|------|---------|---------|
| `status_change` | 状态切换 | `status`, `progress`, `current_stage` |
| `stage_complete` | 每个阶段完成 | `stage`, `progress`, `current_stage` |
| `ai_complete` | AI 审查完成进入待审核 | `risk_count`, `progress`, `current_stage` |
| `error` | 工作流报错 | `message`, `current_stage` |

---

## 状态机完整流转

```
uploaded → parsing → pending_review → human_reviewing → report_ready
                  ↘ (AI 各阶段进度通过 current_stage 字段区分)
                                                    ↗
异常分支：
  parsing → review_failed（parse/analyze 任一失败）
  any → cancelled（用户取消）
```

### 6 阶段进度设计

| 阶段 | status | progress | current_stage |
|------|--------|----------|---------------|
| ① 文档上传 | `parsing` | 5% | 文档上传 |
| ② 文档解析 | `parsing` | 20% | 文档解析 |
| ③ 条款提取 | `parsing` | 40% | 条款提取 |
| ④ 风险识别 | `parsing` | 60% | 风险识别 |
| ⑤ 人工审核 | `pending_review` / `human_reviewing` | 80% | 待人工审核 |
| ⑥ 报告生成 | `report_ready` | 100% | 报告生成 |

---

## 下一步

1. **07_data_model**：基于本架构文档，定义详细的数据模型（Task、RiskItem、Checkpoint 等）
2. **08_api_spec**：基于 API 列表，定义每个接口的请求/响应 schema
3. **10_backend_plan**：制定后端实现计划，包括依赖安装、模块开发顺序、测试策略
