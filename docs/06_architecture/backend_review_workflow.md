# 后端架构设计：审核流程与 Human-in-the-Loop 工作流

> 版本：v1.0 | 日期：2026-04-09
> 阶段：06_architecture
> 前置文档：docs/04_interaction_design/（交互核心设计）、docs/06_architecture/backend_file_upload_task_query.md
> 参考：LangChain 官方 Interrupts 文档（https://docs.langchain.com/oss/python/langgraph/interrupts）

---

## 1. LangGraph HITL 核心机制概述

LangGraph 提供了三种 Human-in-the-Loop 机制：

| 机制 | 方式 | 适用场景 |
|------|------|----------|
| **`interrupt()` 函数** | 动态中断，在节点内任意位置调用 | 人工审批、内容审核、编辑修改 |
| **`interrupt_before` / `interrupt_after`** | 静态断点，编译时或运行时指定 | 调试、逐步执行 |
| **State Update** | 在 checkpoint 处修改图状态 | 人工修正 AI 输出结果 |

**本项目核心采用 `interrupt()` + `Command(resume=...)` 模式**，因为：
- 中断点由业务逻辑动态决定（高风险项数量不固定）
- 需要携带详细的审核上下文给前端展示
- 支持人工修改后继续执行后续流程

### 核心 API 模式

```python
from langgraph.types import interrupt, Command

# 1. 中断：暂停图执行，保存状态到 Checkpointer
decision = interrupt({
    "question": "是否批准此风险判定？",
    "risk_details": state["current_risk"],
})

# 2. 恢复：通过 Command(resume=...) 传回人工决策
# 前端调用：graph.invoke(Command(resume={"action": "approve"}), config=config)
# decision 的值就是 resume 传入的值
```

### 关键规则（来自官方文档）

1. **不要用 try/except 包裹 interrupt** — interrupt 通过异常实现，捕获会中断机制失效
2. **节点内 interrupt 调用顺序必须一致** — resume 是索引匹配的
3. **interrupt 前的副作用必须幂等** — 节点恢复时会从头重新执行
4. **interrupt 值必须 JSON 可序列化** — Checkpointer 需要持久化
5. **恢复时节点从头执行** — interrupt 之前的代码会再跑一遍

---

## 2. 审查图（Review Graph）架构

### 2.1 图状态定义

```python
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph

class ReviewState(TypedDict):
    # 输入
    file_path: str                    # 解析后的文件路径
    parsed_text: str                  # 解析后的完整文本

    # 中间结果
    clauses: list[dict]               # 提取的条款列表
    risks: list[dict]                 # 风险项列表
    current_risk_index: int           # 当前审核到第几个风险项
    pending_reviews: list[dict]       # 待人工审核的风险项

    # 人工审核结果
    human_decisions: list[dict]       # 人工决策列表

    # 输出
    report_data: dict                 # 报告数据
    final_status: str                 # 最终状态

    # 元数据
    task_id: str                      # 任务 ID（= thread_id）
    error_message: Optional[str]      # 错误信息
```

### 2.2 图节点设计

```
┌─────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐     ┌────────┐
│START│ ──► │  parse_doc   │ ──► │  extract_clauses│ ──► │ analyze_risks│ ──► │ hitl_review│
└─────┘     └──────────────┘     └─────────────────┘     └──────────────┘     └────┬─────┘
                                                                                    │
                                                    ┌───────────────────────────────┤
                                                    │                               │
                                             (有高风险)                        (无高风险)
                                                    │                               │
                                           ┌────────▼────────┐              ┌──────▼──────┐
                                           │  pending_review  │              │gen_report   │
                                           │  (interrupt)     │              └──────┬──────┘
                                           └────────┬────────┘                     │
                                                    │ Command(resume=...)    ┌─────▼─────┐
                                                    ▼                        │  END      │
                                           ┌────────────────┐                └───────────┘
                                           │ apply_decisions│
                                           └────────┬───────┘
                                                    │
                                           ┌────────▼──────┐
                                           │ gen_report     │
                                           └────────┬───────┘
                                                    │
                                           ┌────────▼──────┐
                                           │    END         │
                                           └───────────────┘
```

### 2.3 节点详细说明

| 节点 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `parse_doc` | 解析文档文本 | file_path | parsed_text |
| `extract_clauses` | 提取合同条款 | parsed_text | clauses |
| `analyze_risks` | AI 风险识别 | clauses | risks, pending_reviews |
| `hitl_review` | 人工审核中断点 | pending_reviews | human_decisions |
| `apply_decisions` | 应用人工决策 | risks + human_decisions | 更新后的 risks |
| `gen_report` | 生成报告数据 | 完整状态 | report_data |

---

## 3. 中断点（Interrupt）详细设计

### 3.1 中断点 1：风险审核（核心 HITL）

这是合同审查流程中最关键的人工介入点。AI 完成风险识别后，暂停流程，等待法务人员审核每个风险项。

```python
def hitl_review_node(state: ReviewState) -> Command[Literal["apply_decisions", "gen_report"]]:
    """
    人工审核中断节点。
    展示 AI 识别的所有风险项，等待法务人员逐一审核。
    """
    # 构建审核上下文
    review_context = {
        "task_id": state["task_id"],
        "total_risks": len(state["pending_reviews"]),
        "high_risks": [r for r in state["pending_reviews"] if r["level"] == "high"],
        "medium_risks": [r for r in state["pending_reviews"] if r["level"] == "medium"],
        "low_risks": [r for r in state["pending_reviews"] if r["level"] == "low"],
    }

    # 中断：等待人工审核
    decisions = interrupt({
        "type": "human_review",
        "context": review_context,
        "instruction": "请审核 AI 识别的风险项，对每一项选择：确认 / 修改 / 驳回",
    })

    # resume 后：保存人工决策
    return {
        "human_decisions": decisions,
        "current_risk_index": len(state["pending_reviews"]),
    }
```

### 3.2 中断点 2：报告生成前确认（可选）

在生成最终报告前，可以让用户确认报告内容。

```python
def pre_report_review_node(state: ReviewState):
    """报告生成前的最终确认。"""
    confirmation = interrupt({
        "type": "report_confirmation",
        "report_summary": state["report_data"]["summary"],
        "question": "报告已生成，是否确认导出？",
    })

    if confirmation:
        return Command(goto="finalize_report")
    else:
        return Command(goto="hitl_review")  # 回退重新审核
```

### 3.3 中断点 3：工具级别审批（高级场景）

当审查过程中需要调用外部工具（如法律法规数据库查询），可以在工具执行前中断：

```python
@tool
def query_legal_database(query: str, jurisdiction: str):
    """查询法律法规数据库。"""
    response = interrupt({
        "action": "query_legal_database",
        "query": query,
        "jurisdiction": jurisdiction,
        "message": "是否允许查询此法律数据库？",
    })

    if response.get("approved"):
        # 执行查询
        return legal_db.search(query, jurisdiction)
    return {"error": "查询被用户拒绝"}
```

---

## 4. 恢复流程（Resume Flow）

### 4.1 前端触发恢复

前端通过 API 提交人工审核意见，后端调用 `Command(resume=...)` 恢复图执行：

```
前端 ──► PUT /api/v1/tasks/{task_id}/review/submit
            Body: {
              "decisions": [
                {"risk_id": "r1", "action": "approve", "comment": "确认"},
                {"risk_id": "r2", "action": "modify", "modified_text": "...", "comment": "调整风险等级"},
                {"risk_id": "r3", "action": "reject", "comment": "非风险项"}
              ]
            }

后端 ──► graph.invoke(
            Command(resume=decisions),
            config={"configurable": {"thread_id": task_id}},
            version="v2"
         )
```

### 4.2 恢复决策路由

`hitl_review_node` 根据人工决策结果路由到不同后续节点：

```python
def hitl_review_node(state: ReviewState) -> Command[Literal["apply_decisions", "gen_report"]]:
    decisions = interrupt({...})

    has_modifications = any(d["action"] == "modify" for d in decisions)

    if has_modifications:
        return Command(goto="apply_decisions")  # 需要先应用修改
    else:
        return Command(goto="gen_report")        # 直接生成报告
```

### 4.3 多线程并发审核

当多个风险项需要并行审核时（不同法务人员分工），可以使用多个中断：

```python
def parallel_review_node(state: ReviewState):
    """并行审核多个风险项。"""
    # 为每个高风险项创建独立中断
    for risk in state["high_risks"]:
        interrupt({
            "type": "risk_review",
            "risk_id": risk["id"],
            "risk_details": risk,
        })

    # 恢复时需要提供每个中断的响应（通过 interrupt ID 映射）
    # Command(resume={
    #     "interrupt_id_1": {"action": "approve"},
    #     "interrupt_id_2": {"action": "modify", ...},
    # })
```

---

## 5. Checkpoint 策略

### 5.1 Checkpointer 选择

| 阶段 | Checkpointer | 说明 |
|------|-------------|------|
| MVP | `SqliteSaver` | 轻量，零配置，单文件数据库 |
| 生产 | `PostgresSaver` | 持久化、高可用、支持并发 |

### 5.2 Thread ID 映射

```
task_id (UUID)  ─────────►  thread_id
550e8400-...    ─────────►  550e8400-...  （同一 UUID）
```

- 每个审查任务有唯一的 `task_id`
- `task_id` 直接作为 LangGraph 的 `thread_id`
- 复相同 `thread_id` 调用 `invoke` 会恢复对应的 checkpoint

### 5.3 Checkpoint 数据流

```
Graph State Change
       │
       ▼
┌──────────────┐
│ Checkpointer │
│ (SQLite/PG)  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Checkpoint 表                        │
│ ┌──────┬──────────┬──────────────┐  │
│ │thread│checkpoint│    state     │  │
│ │_id   │_id       │    (JSON)    │  │
│ ├──────┼──────────┼──────────────┤  │
│ │task-1│ cp-001   │ {parsing...} │  │
│ │task-1│ cp-002   │ {reviewing..}│  │
│ │task-1│ cp-003   │ {interrupt..}│  │
│ └──────┴──────────┴──────────────┘  │
└─────────────────────────────────────┘
```

### 5.4 Time Travel 能力

LangGraph 的 Checkpointer 支持回溯到任意 checkpoint：

```python
# 获取所有 checkpoint
checkpoints = checkpointer.list({"configurable": {"thread_id": task_id}})

# 获取特定 checkpoint 的状态
state = graph.get_state({"configurable": {"thread_id": task_id,
    "checkpoint_id": "cp-002"})

# 从特定 checkpoint 分支（创建新的审查版本）
fork_config = {"configurable": {"thread_id": f"{task_id}-fork-1"}}
graph.update_state(
    {"configurable": {"thread_id": task_id, "checkpoint_id": "cp-002"}},
    {"risks": modified_risks},
    as_node="analyze_risks"
)
```

**应用场景**：
- 用户想回到某个审核节点重新做决定
- 对比不同审核决策对最终报告的影响
- 审计追踪：记录每一次状态变更

---

## 6. 错误处理与恢复

### 6.1 审查超时

```python
import asyncio
from datetime import datetime, timedelta

class ReviewTimeout(Exception):
    pass

async def check_timeout(task_id: str):
    """检查任务是否超时。"""
    task = await get_task(task_id)
    if task.status == "pending_review":
        idle_time = datetime.now() - task.updated_at
        if idle_time > timedelta(hours=24):
            # 超时：发送提醒或自动取消
            await notify_user(task_id, "审核超时，请继续完成")
```

### 6.2 节点执行失败

```python
def analyze_risks_node(state: ReviewState):
    try:
        risks = llm_analyze(state["clauses"])
        return {"risks": risks}
    except Exception as e:
        return {
            "error_message": f"风险识别失败: {str(e)}",
            "risks": [],
        }
```

**错误恢复策略**：
- AI 调用失败 → 记录错误，状态变为 `review_failed`，支持重试
- 网络超时 → 指数退避重试（最多 3 次）
- LLM 限流 → 等待后重试
- Checkpointer 写入失败 → 回滚任务状态，通知管理员

### 6.3 中断恢复的幂等性

由于恢复时节点会从头执行，需要确保 interrupt 前的操作幂等：

```python
def analyze_risks_node(state: ReviewState):
    # ✅ 好：使用 upsert（幂等操作）
    db.upsert_task(state["task_id"], status="analyzing")

    # 中断
    result = interrupt({"status": "分析中"})

    # 使用结果
    risks = result if isinstance(result, list) else llm_analyze(state["clauses"])
    return {"risks": risks}

# ❌ 坏：非幂等操作
def bad_node(state):
    db.insert_audit_log(task_id, "started")  # 恢复时会重复插入
    interrupt("...")
```

---

## 7. 审核流程状态机（LangGraph 视角）

### 7.1 完整状态流转

```
LangGraph Invoke 1（初始执行）:
  START → parse_doc → extract_clauses → analyze_risks → hitl_review(interrupt)
                                                         │
                                              状态: pending_review
                                              等待: Command(resume=...)

LangGraph Invoke 2（人工审核后恢复）:
  hitl_review(resume) → apply_decisions → gen_report → END
                        │
              状态: human_reviewing → report_ready
```

### 7.2 状态与 API 的对应关系

| 图状态 | 任务状态 | API 状态 | 前端展示 |
|--------|----------|----------|----------|
| 执行中 (parse_doc) | parsing | parsing | 解析中... |
| 执行中 (extract_clauses) | parsing | parsing | 提取条款... |
| 执行中 (analyze_risks) | reviewing | reviewing | AI 审查中... |
| interrupt 触发 | pending_review | pending_review | 待人工审核 |
| resume 后 (apply_decisions) | human_reviewing | human_reviewing | 应用审核意见... |
| resume 后 (gen_report) | report_ready | report_ready | 报告已生成 |

---

## 8. SSE 流式推送与 HITL 集成

### 8.1 流式检测中断

使用 `stream_mode=["messages", "updates"]` 实时检测 interrupt：

```python
async def stream_review_progress(task_id: str, initial_input: dict):
    config = {"configurable": {"thread_id": task_id}}

    async for chunk in graph.astream(
        initial_input,
        stream_mode=["messages", "updates"],
        subgraphs=True,
        config=config,
        version="v2",
    ):
        if chunk["type"] == "updates":
            if "__interrupt__" in chunk["data"]:
                # 检测到中断
                interrupt_info = chunk["data"]["__interrupt__"][0]
                yield {
                    "event": "interrupt",
                    "data": {
                        "interrupt_id": interrupt_info.id,
                        "type": interrupt_info.value["type"],
                        "context": interrupt_info.value["context"],
                    },
                }
                break  # 等待前端提交审核意见
            else:
                # 正常节点更新
                node_name = list(chunk["data"].keys())[0]
                yield {"event": "stage_update", "data": {"stage": node_name}}

        elif chunk["type"] == "messages":
            # LLM 流式输出
            msg, _ = chunk["data"]
            if msg.content:
                yield {"event": "llm_stream", "data": {"content": msg.content}}
```

### 8.2 恢复后的流式推送

```python
async def resume_review(task_id: str, decisions: list):
    config = {"configurable": {"thread_id": task_id}}

    async for chunk in graph.astream(
        Command(resume=decisions),
        stream_mode=["messages", "updates"],
        subgraphs=True,
        config=config,
        version="v2",
    ):
        if chunk["type"] == "updates":
            node_name = list(chunk["data"].keys())[0]
            yield {"event": "stage_update", "data": {"stage": node_name}}

            if node_name == "gen_report":
                yield {"event": "complete", "data": {"status": "report_ready"}}
```

---

## 9. 目录结构补充

```
backend/
├── app/
│   ├── graph/
│   │   ├── review_graph.py      # LangGraph 图定义（StateGraph 构建）
│   │   ├── state.py             # ReviewState TypedDict
│   │   ├── nodes/
│   │   │   ├── parse.py         # parse_doc 节点
│   │   │   ├── extract.py       # extract_clauses 节点
│   │   │   ├── analyze.py       # analyze_risks 节点
│   │   │   ├── hitl_review.py   # 人工审核节点（含 interrupt）
│   │   │   ├── apply.py         # apply_decisions 节点
│   │   │   └── report.py        # gen_report 节点
│   │   ├── interrupt_handler.py # 中断处理与恢复逻辑
│   │   └── checkpoint_config.py # Checkpointer 配置
│   └── ...
```

---

## 10. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| HITL 机制 | `interrupt()` 函数 | 动态中断，适配不固定的风险项数量 |
| 恢复方式 | `Command(resume=...)` | 官方推荐，支持 JSON 任意序列化值 |
| Checkpointer | SQLite → PostgreSQL | MVP 轻量，生产可扩展 |
| 中断值格式 | `{"type": "...", "context": {...}}` | 前端可根据 type 渲染不同审核 UI |
| 路由决策 | `Command(goto=...)` | 根据审核结果动态路由后续节点 |
| 流式检测 | `stream_mode=["updates"]` + 检查 `__interrupt__` | 官方 v2 推荐方式 |
| 节点副作用 | interrupt 前用 upsert/幂等操作 | 恢复时节点从头执行，避免重复副作用 |
| 工具审批 | 工具内嵌 `interrupt()` | 审核关键外部调用的安全性 |
