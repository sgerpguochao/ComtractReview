# 项目规则 — ContractReview

## 1. 项目概述

ContractReview 是基于 AI 的合同审查系统，利用大语言模型（LLM）和 LangChain 框架实现合同条款的自动化分析、风险识别、合规性检查等功能。

### 核心能力
- 合同文本解析与结构化提取
- 风险条款识别与评级
- 合规性自动审查
- 审查报告自动生成
- Human-in-the-loop 人工复核流程

---

## 2. 目录结构

```
ComtractReview/
├── .claude/                    # Claude Code 配置
│   ├── settings.json           # Agent Teams 实验性开关
│   ├── settings.local.json     # 项目权限配置
│   └── agents/                 # Agent 定义
│       ├── planner.md          # 规划专家
│       ├── researcher.md       # 研究专家
│       └── reviewer.md         # 审查专家
├── .mcp.json                   # MCP 服务器配置（LangChain 文档等）
├── .gitignore
├── CLAUDE.md                   # 项目级规则（职责边界、工作原则）
├── docs/                       # 项目文档（分层编号）
│   ├── 00_setup/               # 基础设施配置
│   ├── 01_business_research/   # 业务调研
│   ├── 02_competitor_analysis/ # 竞品分析
│   ├── 03_problem_modeling/    # 业务问题建模
│   ├── 04_interaction_design/  # 核心交互链路设计
│   ├── 05_prototype_spec/      # 产品原型规范
│   ├── 06_architecture/        # 系统架构设计
│   ├── 07_data_model/          # 数据模型
│   ├── 08_api_spec/            # API 规范
│   ├── 09_frontend_plan/       # 前端实现计划
│   ├── 10_backend_plan/        # 后端实现计划
│   └── 11_deployment/          # 联调、发布与部署
├── frontend/                   # 前端项目
└── backend/                    # 后端项目
    └── .env.example            # 环境变量模板
```

---

## 3. 文档分层规范

文档目录采用编号前缀，按顺序推进。每个阶段的输出是下一阶段的前置条件：

```
00_setup (基础设施)
  └─> 01_business_research (业务调研：行业现状、用户需求、市场规模)
        └─> 02_competitor_analysis (竞品分析：主流产品对比、差异化定位)
              └─> 03_problem_modeling (业务问题建模：核心问题定义、用户故事)
                    └─> 04_interaction_design (交互链路设计：核心流程、状态流转)
                          └─> 05_prototype_spec (产品原型规范：页面结构、组件定义)
                                └─> 06_architecture (系统架构：技术选型、模块划分、部署架构)
                                      └─> 07_data_model (数据模型：实体定义、关系图、字段说明)
                                            └─> 08_api_spec (API 规范：接口定义、请求/响应格式)
                                                  └─> 09_frontend_plan (前端实现：组件拆分、状态管理、路由)
                                                  └─> 10_backend_plan (后端实现：服务分层、Agent 编排、数据库迁移)
                                                        └─> 11_deployment (联调、测试、发布、部署)
```

### 文档命名规范
- 文件名使用英文小写，单词间用下划线分隔
- 每个目录下可以有 `README.md` 作为目录索引
- 其他文档按内容命名，如 `market_analysis.md`、`user_stories.md`

---

## 4. Agent Teams 工作流

### 各阶段 Agent 协作模式

```
Phase 1: Research (researcher agent)
  → 行业调研、竞品分析、技术选型调研
  → 输出：调研报告.md

Phase 2: Plan (planner agent)
  → 基于调研结果制定实施方案
  → 输出：实施计划.md

Phase 3: Implement (主 Agent + specialist agents)
  → 按照计划执行代码/文档编写
  → 输出：代码 + 文档

Phase 4: Review (reviewer agent)
  → 代码审查、文档审查
  → 输出：审查报告 + 修改建议
```

### 每个阶段的明确输出

| 阶段编号 | 阶段名称 | 负责 Agent | 输出文件 |
|---------|---------|-----------|---------|
| 00 | 基础设施 | 主 Agent | settings.json, .mcp.json, CLAUDE.md |
| 01 | 业务调研 | researcher | 市场调研、用户需求分析 |
| 02 | 竞品分析 | researcher | 竞品对比表、差异化分析 |
| 03 | 问题建模 | planner | 问题定义、用户故事地图 |
| 04 | 交互设计 | planner | 流程图文档、状态机定义 |
| 05 | 原型规范 | planner | 页面结构、组件规范 |
| 06 | 架构设计 | planner | 技术架构图、模块设计 |
| 07 | 数据模型 | planner | ER 图、字段定义 |
| 08 | API 规范 | planner | 接口文档、Schema 定义 |
| 09 | 前端计划 | planner | 组件树、路由表、状态管理方案 |
| 10 | 后端计划 | planner | 服务分层、Agent 编排方案 |
| 11 | 部署上线 | 主 Agent | 部署脚本、测试计划、发布流程 |

---

## 5. 开发流程约束

### Plan-First 原则

以下情况**必须**先使用 planner agent 制定计划，再实施：
- 涉及 3 个以上文件的修改
- 架构设计或技术选型决策
- 新增核心功能模块
- 数据库 Schema 变更
- API 接口设计

可以直接实施的情况：
- 文档编写（格式调整、内容补充）
- 配置文件修改（单一文件）
- Bug 修复（影响范围明确）

### 环境管理

- **后端虚拟环境**：使用 conda 管理，环境名 `contract-review`
- **后端配置**：统一使用 `.env` 文件，敏感信息不提交
- **前端配置**：待前端技术栈确定后补充

### 版本控制

- 主分支：`main`
- 功能分支：`feat/{模块名}`
- 文档分支：`docs/{阶段名}`
- 修复分支：`fix/{问题描述}`

### 提交规范

提交信息格式：
```
type: 简短描述

type 取值：feat, docs, chore, fix, refactor, config
```

---

## 6. 技术栈约束

### 后端
- 语言：Python
- 虚拟环境：conda
- 配置管理：`.env` 文件
- AI 框架：LangChain / LangGraph
- MCP 集成：docs-langchain（文档查询）

### 前端
- 待 09_frontend_plan 阶段确定

### 文档
- 格式：Markdown
- 语言：中文（技术术语保留英文）
- 图表：支持 Markdown 内嵌 Mermaid 流程图
