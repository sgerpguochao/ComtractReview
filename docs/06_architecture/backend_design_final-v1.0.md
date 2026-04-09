# 后端架构设计总览 v1.0

> 版本：v1.0 | 日期：2026-04-09
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
| HITL 机制 | `interrupt()` 函数 | 动态中断，适配可变风险项数 |
| 恢复方式 | `Command(resume=...)` | 官方推荐，支持 JSON 值 |
| 路由控制 | `Command(goto=...)` | 根据审核结果动态路由 |
| 中断值格式 | `{"type": "...", "context": {...}}` | 前端按 type 渲染 UI |
| 副作用处理 | interrupt 前幂等 | 恢复时节点重头执行 |

### 4. 审查结果查询

| 决策 | 选择 | 理由 |
|------|------|------|
| 查询方式 | RESTful API | 标准、可缓存 |
| 风险项结构 | 标准化 RiskItem | 包含 AI + 人工审核全字段 |
| 报告导出 | PDF 下载 | 前端触发，后端生成 |

---

## 完整 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/tasks/upload` | 上传合同文件 |
| GET | `/api/v1/tasks/{task_id}` | 查询任务状态 |
| GET | `/api/v1/tasks` | 查询任务列表 |
| POST | `/api/v1/tasks/{task_id}/cancel` | 取消任务 |
| GET | `/api/v1/tasks/{task_id}/stream` | SSE 进度推送 |
| GET | `/api/v1/tasks/{task_id}/result` | 获取审查结果 |
| GET | `/api/v1/tasks/{task_id}/risks/{risk_id}` | 获取风险项详情 |
| PUT | `/api/v1/tasks/{task_id}/risks/{risk_id}/review` | 提交人工审核 |
| GET | `/api/v1/tasks/{task_id}/report` | 导出 PDF 报告 |

---

## LangGraph 审查图概要

```
START → parse_doc → extract_clauses → analyze_risks → hitl_review
                                                              │
                                                       (interrupt)
                                                              │
                                                    Command(resume=decisions)
                                                              │
                                         ┌────────────────────┤
                                  (有修改)│              (无修改)│
                                         ▼                    ▼
                                  apply_decisions        gen_report
                                         │
                                  gen_report
                                         │
                                        END
```

**关键中断点**：
1. **风险审核**（必需）：AI 识别风险后，暂停等待人工审核
2. **报告确认**（可选）：报告生成前最终确认
3. **工具审批**（高级）：外部数据库查询前审批

---

## 状态机完整流转

```
uploaded → parsing → parse_complete → reviewing → pending_review
                                                    │
                                         ┌──────────┤
                                    (人工审核)      │
                                         ▼          │
                                   human_reviewing  │
                                         │          │
                                  report_ready ◄────┘

异常分支：
  parsing → parse_failed
  reviewing → review_failed
  any → cancelled
```

---

## 下一步

1. **07_data_model**：基于本架构文档，定义详细的数据模型（Task、RiskItem、Checkpoint 等）
2. **08_api_spec**：基于 API 列表，定义每个接口的请求/响应 schema
3. **10_backend_plan**：制定后端实现计划，包括依赖安装、模块开发顺序、测试策略
