# Agent Teams 与 LangChain MCP 配置指南

## 1. Agent Teams 环境检查

### 配置状态：已启用

Agent Teams 通过项目级配置文件 `.claude/settings.json` 中的环境变量启用：

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Agent 定义**（位于 `.claude/agents/` 目录）：

| Agent | 文件 | 用途 | 可用工具 |
|-------|------|------|----------|
| planner | `planner.md` | 任务拆解、架构规划、实施策略 | read, glob, grep |
| researcher | `researcher.md` | 文档研究、代码搜索、方案对比 | read, glob, grep, web_search, web_fetch |
| reviewer | `reviewer.md` | 代码审查、安全漏洞检查、质量评估 | read, glob, grep |

每个 Agent 通过 Markdown 文件的 YAML frontmatter 定义，包含 `name`、`description`（触发机制）、`model`、`tools`、`disallowedTools`、`color` 等字段。

### 验证结果

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 已设置
- `.claude/agents/` 目录下已定义 3 个专业 Agent
- Agent Teams 功能处于**正常可用**状态

---

## 2. LangChain MCP 环境检查

### 配置状态：已接入

项目级 MCP 配置文件 `G:\ComtractReview\.mcp.json`：

```json
{
  "mcpServers": {
    "docs-langchain": {
      "type": "http",
      "url": "https://docs.langchain.com/mcp"
    }
  }
}
```

### 连通性测试结果

通过 MCP 命令行工具验证：

```
docs-langchain: https://docs.langchain.com/mcp (HTTP) - Connected
```

通过 MCP 工具查询 LangChain 文档成功返回结果，包括 LangChain Python/JavaScript 集成、MCP 协议文档、Human-in-the-loop 等主题。连通性**正常**。

---

## 3. 核心概念梳理

### 3.1 LangChain MCP 的作用

**结论：LangChain 的 MCP 主要负责获取官方最新的文档规范。**

根据 [LangChain 官方文档](https://docs.langchain.com/use-these-docs#connect-with-claude-code)，`https://docs.langchain.com/mcp` 是一个 MCP 服务器，让 AI 应用可以**实时查询 LangChain 官方文档的最新内容**。

具体而言，LangChain MCP 提供以下能力：

- **搜索文档**（`search_docs_by_lang_chain`）：通过自然语言查询 LangChain、LangGraph、LangSmith 的最新文档，返回匹配的页面标题、链接和内容摘要
- **获取页面全文**（`get_page_docs_by_lang_chain`）：获取指定文档页面的完整内容

**适用场景**：在开发过程中需要了解 LangChain 生态（如 LangChain 框架、LangGraph 状态图、LangSmith 追踪、MCP 集成模式等）的最新 API 用法、最佳实践和迁移指南时，通过 MCP 实时获取官方文档，确保使用的 API 和方法是当前最新的。

**注意**：此处的 LangChain MCP 指的是 LangChain 官方提供的**文档查询服务**（Mintlify 托管），而非 LangChain 框架中用于连接外部 MCP 工具服务器的 `langchain-mcp-adapters` 库。两者定位不同：
- `https://docs.langchain.com/mcp` — 文档查询服务器（本文使用的）
- `langchain-mcp-adapters` — LangChain Python 库，用于让 LangChain Agent 消费任意 MCP 服务器暴露的工具

---

### 3.2 LangChain Interpreter 的作用

LangChain 生态中的 **Code Interpreter（代码解释器）** 是让 Agent 能够**动态执行代码**的能力。根据官方文档，Code Interpreter 的核心作用：

1. **动态代码执行**：Agent 可以根据用户需求编写并执行代码（通常是 Python），用于数据处理、数学计算、可视化生成等
2. **沙箱环境**：代码在隔离的沙箱环境中执行，确保安全性
3. **多轮交互**：执行结果会返回给 Agent，Agent 根据结果决定下一步操作（继续执行、修正代码、或输出最终答案）
4. **提供商支持**：多个平台提供 Code Interpreter 能力，如 Amazon Bedrock AgentCore Code Interpreter、Google Gemini 的代码执行能力等

**典型工作流**：
```
用户提问 -> Agent 决定需要执行代码 -> 编写代码 -> 提交到解释器执行 -> 获取执行结果 -> 根据结果决定下一步
```

**与 MCP 的关系**：Code Interpreter 是 Agent 的执行能力，而 MCP 是工具/文档的接入协议。两者可以配合使用 —— Agent 通过 MCP 获取文档规范后，利用 Code Interpreter 执行代码来实现功能。

---

### 3.3 Human-in-the-Loop (HITL) 流程

**Human-in-the-Loop（人在回路）** 是 LangChain/LangGraph 提供的人类监督机制，允许在 Agent 执行过程中暂停并等待人类决策。

#### 核心机制

当模型提出需要审查的操作（如写文件、执行 SQL、发送邮件）时，HITL 中间件会：

1. **检查策略配置**（`interrupt_on`）：判断当前工具调用是否需要人类审核
2. **触发中断**（`interrupt`）：暂停 Agent 执行，保存当前图状态（通过 LangGraph 的持久化层）
3. **等待人类决策**
4. **根据决策恢复执行**

#### 三种决策类型

| 决策 | 描述 | 示例场景 |
|------|------|----------|
| `approve` | 按原样批准执行 | 确认邮件草稿原样发送 |
| `edit` | 修改参数后执行 | 修改邮件收件人后再发送 |
| `reject` | 拒绝并给出反馈 | 拒绝 SQL 删除操作并说明原因 |

#### 完整流程图

```
┌─────────────────────────────────────────────────────┐
│  1. 用户输入: "删除 30 天前的旧记录"                  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  2. Agent 生成回复，提出调用 execute_sql 工具         │
│     SQL: DELETE FROM records WHERE created_at < ...  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  3. HITL 中间件检查 interrupt_on 配置                 │
│     execute_sql 在审核列表中 -> 触发中断              │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  4. Agent 暂停执行，状态持久化到 checkpointer         │
│     返回中断信息给人类审核者                          │
│     Interrupt: {                                     │
│       action_requests: [execute_sql with args...]    │
│       review_configs: [allowed: approve, reject]     │
│     }                                                │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  5. 人类审核者审查并做出决策                          │
│     - approve: 按原样执行                            │
│     - edit: 修改参数后执行                           │
│     - reject: 拒绝并给出反馈                         │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  6. 通过 Command(resume={...}) 恢复执行               │
│     - 如果 approve -> 执行原 SQL                     │
│     - 如果 edit -> 用修改后的参数执行                 │
│     - 如果 reject -> 返回反馈消息，Agent 重新规划     │
└─────────────────────────────────────────────────────┘
```

#### 关键代码示例

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

agent = create_agent(
    model="gpt-4.1",
    tools=[write_file_tool, execute_sql_tool],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "write_file": True,   # 所有决策类型都允许
                "execute_sql": {"allowed_decisions": ["approve", "reject"]},
                "read_data": False,   # 安全操作，无需审批
            },
        ),
    ],
    checkpointer=InMemorySaver(),
)

# 运行到中断点
config = {"configurable": {"thread_id": "some_id"}}
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除旧记录"}]},
    config=config,
    version="v2",
)

# 查看中断信息
print(result.interrupts)

# 恢复执行（批准后）
agent.invoke(
    Command(resume={"decisions": [{"type": "approve"}]}),
    config=config,
    version="v2",
)
```

#### 为什么 HITL 需要 checkpointer

- 中断时需要**持久化当前图状态**，确保 Agent 可以安全暂停
- 恢复时通过 `thread_id` 从 checkpointer 中加载之前的状态
- 生产环境中应使用持久化 checkpointer（如 `AsyncPostgresSaver`），而非 `InMemorySaver`

---

## 4. 结论

| 组件 | 主要作用 | 定位 |
|------|----------|------|
| **LangChain MCP** (`https://docs.langchain.com/mcp`) | **获取官方最新的文档规范** | 文档查询服务 |
| **LangChain Interpreter** | Agent 动态执行代码（Python 等） | 代码执行引擎 |
| **Human-in-the-Loop** | Agent 执行过程中的人类审批流程 | 安全监督机制 |

**核心结论**：LangChain 的 MCP（即 `https://docs.langchain.com/mcp`）主要负责获取 LangChain 官方最新文档规范，为 AI 助手提供实时、准确的 API 参考和最佳实践。它与 Code Interpreter（代码执行）和 HITL（人类审批）是三个独立但可配合使用的组件。
