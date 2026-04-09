# CLAUDE.md — ContractReview 项目规则

## 项目概述

ContractReview 是一个基于 AI 的合同审查系统，利用 LangChain + LLM 能力实现合同条款分析、风险识别、合规检查等功能。

---

## 目录职责边界

### `frontend/` — 前端项目

- 负责用户界面、交互逻辑、数据展示
- 与后端通过 RESTful API 通信
- 不直接访问数据库或后端服务
- 所有 API 调用统一通过前端封装的 API 客户端

### `backend/` — 后端项目

- 负责业务逻辑、数据处理、AI Agent 编排
- 统一使用 `.env` 文件管理环境变量配置（API Key、数据库连接等）
- 使用 conda 管理 Python 虚拟环境
- 所有配置项必须在 `.env.example` 中声明（不含真实密钥值）
- 不将 `.env` 提交到版本控制

### `docs/` — 项目文档

- 所有项目设计、调研、规范文档
- 采用分层编号目录（00_setup → 11_deployment）
- 每个文档有明确的输入（前置文档）和输出（后续文档依赖）
- 文档是项目推进的唯一依据，代码实现必须对齐文档

---

## 开发规范

### Agent Teams 工作流

每个开发阶段必须由 Agent Team 协作完成，**每个阶段有明确的输出文件**：

| 阶段 | 输出文件 |
|------|----------|
| 00_setup | 基础设施配置与规范 |
| 01_business_research | 业务调研报告 |
| 02_competitor_analysis | 竞品分析报告 |
| 03_problem_modeling | 业务问题建模文档 |
| 04_interaction_design | 核心交互链路设计图 |
| 05_prototype_spec | 产品原型规范 |
| 06_architecture | 系统架构设计文档 |
| 07_data_model | 数据模型定义 |
| 08_api_spec | API 接口规范 |
| 09_frontend_plan | 前端实现计划 |
| 10_backend_plan | 后端实现计划 |
| 11_deployment | 联调、发布与部署指南 |

### 工作原则

1. **复杂任务优先 Plan 再实施** — 涉及多文件修改或架构决策时，先制定计划，确认后再编码
2. **文档先行** — 每个阶段的文档是后续阶段的前提，不可跳过
3. **Agent 各司其职** — 研究用 researcher，规划用 planner，审查用 reviewer
4. **不生成多余文件** — 除非明确要求或必要，不创建测试文件、示例代码等额外内容
5. **保持简洁** — 避免过度设计，只做当前阶段需要的事

### 技术栈约束

- 后端：Python 3.11 + conda 虚拟环境（`contractreview`）+ `.env` 配置管理
- 前端：待 09_frontend_plan 阶段确定
- AI 框架：LangChain / LangGraph
- 文档：Markdown

### 后端环境

- **Conda 环境名**：`contractreview`
- **Python 版本**：3.11
- **激活方式**：`conda activate contractreview`（或 `CALL conda.bat activate contractreview` 在 Windows cmd 下）
- **环境路径**：`D:\sorfware_install\python3.8_install\envs\contractreview`
- **.env 配置**：后端所有配置通过 `backend/.env` 管理，参考 `backend/.env.example` 模板
- **依赖安装**：`pip install` 在激活环境后执行，依赖列表由 `backend/requirements.txt` 管理
