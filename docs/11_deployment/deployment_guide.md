# 部署指南 — ContractReview v1.0

> 版本：v1.0 | 日期：2026-04-13
> 阶段：11_deployment
> 适用环境：Windows 10/11，本地开发部署

---

## 目录

1. [环境依赖](#1-环境依赖)
2. [首次安装](#2-首次安装)
3. [环境变量配置](#3-环境变量配置)
4. [启动项目](#4-启动项目)
5. [停止项目](#5-停止项目)
6. [手动启动（调试模式）](#6-手动启动调试模式)
7. [访问地址](#7-访问地址)
8. [目录结构说明](#8-目录结构说明)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 环境依赖

### 必需软件

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| Windows | 10 / 11 | start.bat / stop.bat 依赖 Windows 命令行 |
| Conda | 任意 | Python 虚拟环境管理，需安装 Miniconda 或 Anaconda |
| Python | 3.11 | 在 conda 环境 `contractreview` 中运行 |
| Node.js | v24+ | 前端 Vite 开发服务器 |
| npm | v11+ | 前端依赖管理 |

### 确认安装路径

`start.bat` 中硬编码了以下路径，如本机安装位置不同需修改：

```bat
set CONDA_ROOT=D:\sorfware_install\python3.8_install
set CONDA_ENV=%CONDA_ROOT%\envs\contractreview
```

检查 conda 是否在此路径：

```bash
dir D:\sorfware_install\python3.8_install\envs\contractreview\python.exe
```

---

## 2. 首次安装

### 2.1 克隆/获取代码

确认代码目录为：`G:\ComtractReview`

### 2.2 创建 conda 虚拟环境

```bash
conda create -n contractreview python=3.11 -y
conda activate contractreview
```

### 2.3 安装后端依赖

```bash
cd G:\ComtractReview\backend
pip install -r requirements.txt
```

`requirements.txt` 包含：

| 包 | 用途 |
|----|------|
| `fastapi` + `uvicorn` | Web 框架与 ASGI 服务器 |
| `sqlalchemy` + `aiosqlite` | 异步 ORM + SQLite |
| `langchain` + `langchain-deepseek` | LLM 调用（DeepSeek） |
| `langgraph` | 工作流编排节点 |
| `python-docx` + `PyPDF2` | 文档解析 |
| `reportlab` | PDF 报告生成 |
| `pydantic-settings` | .env 配置读取 |

### 2.4 配置后端环境变量

```bash
cd G:\ComtractReview\backend
copy .env.example .env
```

**必须**编辑 `.env`，填入以下内容（见第 3 节）。

### 2.5 安装前端依赖

```bash
cd G:\ComtractReview\frontend
npm install
```

---

## 3. 环境变量配置

后端所有配置通过 `G:\ComtractReview\backend\.env` 管理。

### 最小必填配置

```dotenv
# DeepSeek LLM API Key（必填，AI 审查核心依赖）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# DeepSeek 模型（可选，默认 deepseek-chat）
DEEPSEEK_MODEL=deepseek-chat
```

### 完整配置参考（.env.example）

```dotenv
# LLM 配置
DEEPSEEK_API_KEY=              # 必填：DeepSeek API 密钥
DEEPSEEK_MODEL=deepseek-chat   # 可选：模型名称

# 数据库（默认 SQLite，无需修改）
DATABASE_URL=sqlite+aiosqlite:///./contractreview.db

# 文件存储路径（相对于 backend/ 目录）
STORAGE_PATH=./storage

# 上传限制
MAX_UPLOAD_SIZE=52428800       # 50MB（字节）
ALLOWED_EXTENSIONS=.docx,.pdf

# 服务器
HOST=0.0.0.0
PORT=8000
DEBUG=true

# 重复上传检测窗口（天）
UPLOAD_DUPLICATE_WINDOW_DAYS=7
```

> **注意**：`.env` 文件不得提交到 git。`.env.example` 已列出所有配置项（不含真实密钥）。

### 如何获取 DeepSeek API Key

前往 [platform.deepseek.com](https://platform.deepseek.com) 注册账户，在 API Keys 页面创建密钥。

---

## 4. 启动项目

### 一键启动（推荐）

在项目根目录双击 `start.bat`，或在命令行执行：

```cmd
cd G:\ComtractReview
start.bat
```

启动后会弹出两个独立命令行窗口：
- `ContractReview - Backend (Port 8000)`：后端 FastAPI 服务
- `ContractReview - Frontend (Port 3000)`：前端 Vite 开发服务器

**start.bat 执行流程**：

```
[1/3] 启动后端
   └── 新建 cmd 窗口，切换到 backend/，用 conda 环境的 python 执行 main.py
       python.exe = D:\sorfware_install\python3.8_install\envs\contractreview\python.exe

[等待 3 秒，让后端先完成数据库初始化]

[2/3] 启动前端
   └── 新建 cmd 窗口，切换到 frontend/，执行 node vite.js --port 3000
```

后端启动时会自动完成：
1. 创建 SQLite 数据库文件 `backend/contractreview.db`
2. 创建文件存储目录 `backend/storage/`
3. 建立所有数据库表

---

## 5. 停止项目

### 一键停止

```cmd
cd G:\ComtractReview
stop.bat
```

**stop.bat 执行流程**：

```
[1/2] 停止后端
   ├── 查找占用 :8000 端口的进程 → taskkill /F /PID
   └── 按窗口标题查找 Python 进程 → taskkill

[2/2] 停止前端
   ├── 按窗口标题查找 Node 进程 → taskkill
   └── 查找占用 :3000 端口的进程 → taskkill /F /PID
```

---

## 6. 手动启动（调试模式）

如果 start.bat 无法运行，可手动启动：

### 后端

```bash
# 在 Git Bash 或命令行中
source "D:/sorfware_install/python3.8_install/etc/profile.d/conda.sh"
conda activate contractreview
cd G:\ComtractReview\backend
python main.py
```

或在 Windows CMD 中：

```cmd
CALL D:\sorfware_install\python3.8_install\Scripts\activate.bat contractreview
cd /d G:\ComtractReview\backend
python main.py
```

后端启动成功标志：

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 前端

```bash
cd G:\ComtractReview\frontend
node node_modules/vite/bin/vite.js --port 3000
```

前端启动成功标志：

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

---

## 7. 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | http://localhost:3000 | 用户操作入口 |
| 后端 API | http://localhost:8000 | FastAPI REST 接口 |
| API 文档（Swagger） | http://localhost:8000/docs | 交互式接口文档 |
| API 文档（ReDoc） | http://localhost:8000/redoc | 备用接口文档 |
| 健康检查 | http://localhost:8000/health | 返回 `{"status": "ok"}` |

---

## 8. 目录结构说明

```
G:\ComtractReview\
├── start.bat                  # 一键启动脚本
├── stop.bat                   # 一键停止脚本
├── CLAUDE.md                  # 项目规则与开发规范
│
├── backend/
│   ├── main.py                # FastAPI 应用入口，启动 uvicorn
│   ├── .env                   # 环境变量（不提交 git）
│   ├── .env.example           # 环境变量模板
│   ├── requirements.txt       # Python 依赖列表
│   ├── contractreview.db      # SQLite 数据库（首次启动自动创建）
│   ├── storage/               # 上传文件与报告存储目录（自动创建）
│   │   └── {task_id}/
│   │       ├── original.docx  # 原始上传文件
│   │       └── report.pdf     # 生成的 PDF 报告
│   └── app/
│       ├── config.py          # 配置读取（读取 .env）
│       ├── database.py        # 数据库连接与初始化
│       ├── api/               # FastAPI 路由（tasks/review/report）
│       ├── models/            # SQLAlchemy ORM 模型
│       ├── services/          # 业务逻辑（workflow/review/report/sse）
│       └── graph/             # LangGraph 节点（parse/extract/analyze）
│
├── frontend/
│   ├── package.json           # 前端依赖配置
│   ├── node_modules/          # 依赖包（npm install 后生成）
│   └── src/
│       └── app/
│           ├── api.ts         # 后端 API 客户端封装
│           └── components/    # React 页面组件
│
└── docs/                      # 项目文档
    └── 11_deployment/
        └── deployment_guide.md  # 本文档
```

### 数据库说明

- **类型**：SQLite（文件型数据库，无需独立安装）
- **位置**：`backend/contractreview.db`（首次启动自动创建）
- **5 张表**：`tasks` / `file_records` / `risk_items` / `human_decisions` / `review_history`

---

## 9. 常见问题排查

### Q1：后端启动报错 `ValidationError: deepseek_api_key`

**原因**：`.env` 文件未配置 `DEEPSEEK_API_KEY`。

**解决**：
```bash
cd G:\ComtractReview\backend
# 编辑 .env，确保以下行存在且有值：
DEEPSEEK_API_KEY=sk-你的密钥
```

---

### Q2：前端启动报 `Cannot find module 'vite'`

**原因**：前端依赖未安装。

**解决**：
```bash
cd G:\ComtractReview\frontend
npm install
```

---

### Q3：start.bat 后端窗口一闪而过

**原因**：conda 环境路径不存在，或 .env 未配置导致启动报错。

**排查步骤**：
```cmd
# 1. 检查 python 路径是否存在
dir D:\sorfware_install\python3.8_install\envs\contractreview\python.exe

# 2. 手动进入 backend 目录启动，观察完整报错
cd /d G:\ComtractReview\backend
D:\sorfware_install\python3.8_install\envs\contractreview\python.exe main.py
```

---

### Q4：上传文件后页面卡在"已上传"不动

**原因**：后端工作流未自动触发，或 SSE 连接失败。

**排查**：
1. 查看后端命令行窗口是否有 `[workflow] Starting review for task ...` 日志
2. 检查 `backend/workflow.log` 文件是否有报错
3. 确认 DeepSeek API Key 有效且有余额

---

### Q5：AI 审查失败 / 风险识别返回空

**原因**：DeepSeek API 调用失败（Key 无效、余额不足、网络问题）。

**查看详细错误**：
```bash
# 查看工作流日志
cat G:\ComtractReview\backend\workflow.log
```

---

### Q6：stop.bat 停止后端无效，端口仍被占用

**手动释放端口**：
```cmd
# 查找占用 8000 端口的进程
netstat -aon | find ":8000" | find "LISTENING"

# 强制终止（替换 <PID> 为实际进程 ID）
taskkill /F /PID <PID>
```

---

### Q7：重新部署（清空数据重来）

删除以下文件/目录即可清空所有数据：

```bash
# 清空数据库
del G:\ComtractReview\backend\contractreview.db

# 清空上传文件与报告
rmdir /s /q G:\ComtractReview\backend\storage
```

重启后端，数据库和存储目录会自动重新创建。

---

## 附录：CORS 配置

`main.py` 当前允许所有来源（`allow_origins=["*"]`），适合本地开发。生产环境应限制为具体域名：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-domain.com"],
    ...
)
```

## 附录：生产环境注意事项

> 当前版本为 MVP 本地开发部署，以下是生产化时需要考虑的事项：

| 项目 | MVP 现状 | 生产建议 |
|------|---------|---------|
| 数据库 | SQLite 文件 | PostgreSQL |
| 文件存储 | 本地 `storage/` | 对象存储（OSS/S3） |
| CORS | 允许全部 | 限制具体域名 |
| HTTPS | 无 | Nginx 反向代理 + SSL |
| 进程守护 | 手动 bat | systemd / PM2 / Docker |
| 日志 | 控制台输出 | 结构化日志 + 日志收集 |
