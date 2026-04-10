# 页面结构与路由设计 — 上传与任务状态处理

> 版本：v1.0 | 日期：2026-04-10
> 阶段：09_frontend_plan
> 前置文档：
> - `docs/08_api_spec/api_spec-v1.0.md` — API 接口契约
> - `docs/06_architecture/frontend_backend_boundary_spec-v1.0.md` — 前后端功能边界
> - `docs/04_interaction_design/interaction_core_final.md` — 交互链路设计
> - `docs/06_architecture/backend_design_final-v1.0.md` — 后端架构设计
>
> 本文档仅覆盖**文档上传**和**任务状态处理**相关的页面结构与路由。
> HITL 审核操作 UI 由 teammate 2 负责，风险项详情展开设计由 teammate 3 负责，报告预览页仅作简要提及。

---

## 1. 页面层级结构

```
/                           (P1 首页/工作台)
├── /upload                 (上传入口 — 首页内嵌，非独立路由)
├── /tasks                  (最近审查记录列表 — 首页内嵌)
│
└── /review/:task_id        (P2 审查详情页)
    ├── /review/:task_id/parsing        (解析中 — 状态面板)
    ├── /review/:task_id/reviewing      (AI 审查中 — 状态面板)
    ├── /review/:task_id/failed         (失败 — 状态面板)
    ├── /review/:task_id/pending-review (待人工审核 — 状态面板)
    └── /review/:task_id/report-ready   (报告完成 — 状态面板)
    (注：以上子路由为逻辑面板，不映射到独立 URL，由 :task_id 页面根据 TaskStatus 动态渲染)
```

**路由策略**：审查详情页使用单一路由 `/review/:task_id`，页面内部根据任务状态（TaskStatus）动态渲染不同面板，而非为每个状态创建独立路由。原因：
- 状态由后端驱动、实时变化，频繁路由切换体验差
- 同一 task_id 下状态流转是线进式的，用户始终在同一页面操作
- 便于保持 SSE 连接的生命周期

---

## 2. 页面线框图 + 组件树

### 2.1 P1 首页 / 工作台 — `/`

```
┌─────────────────────────────────────────────────────────────────┐
│  ContractReview                          [导航栏]                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  上传区域 (UploadZone)                                    │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              拖拽文件到此处，或 点击上传              │  │  │
│  │  │              支持 .docx / .pdf，最大 50MB            │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  □ 风险审查    □ 合规检查      (审查维度选择)              │  │
│  │                                         [开始审查] 按钮    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  最近审查记录 (RecentTasks)                               │  │
│  │  ─────────────────────────────────────────────────────    │  │
│  │                                                           │  │
│  │  采购合同_2026Q2.docx    报告可导出    25项风险   04-10   │  │ → 点击跳转 /review/:id
│  │  ─────────────────────────────────────────────────────    │  │
│  │  服务合同_draft.pdf      AI审查中      ▓▓▓░░ 72%   04-09   │  │
│  │  ─────────────────────────────────────────────────────    │  │
│  │  租赁合同.docx           解析失败      重试       04-08   │  │
│  │  ─────────────────────────────────────────────────────    │  │
│  │  ...                                                      │  │
│  │                                                           │  │
│  │                              [加载更多]                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**组件树（P1）**：

```
App
 └── HomePage (/)
      ├── Header                          # 顶栏：Logo + 导航
      ├── UploadZone                      # 上传区域
      │    ├── DropZone                   # 拖拽区域
      │    ├── FileSelector               # 文件选择按钮
      │    ├── ReviewDimensionSelector    # 审查维度复选
      │    └── UploadButton               # 开始审查按钮
      ├── UploadProgress (条件渲染)        # 上传中进度条
      │    └── ProgressBar                # 线性进度条
      ├── RecentTasks                     # 最近审查记录
      │    ├── TaskListItem[]             # 任务列表项
      │    │    ├── TaskFileName           # 文件名
      │    │    ├── TaskStatusBadge        # 状态标签
      │    │    ├── TaskRiskCount          # 风险数量（如有）
      │    │    ├── TaskProgressBar        # 进度条（进行中任务）
      │    │    └── TaskDate              # 上传日期
      │    └── LoadMoreButton            # 加载更多
      └── ErrorToast (条件渲染)           # 上传错误提示
```

### 2.2 P2 审查详情页 — `/review/:task_id`

```
┌─────────────────────────────────────────────────────────────────┐
│  ContractReview     ← 返回  |  采购合同_2026Q2.docx   [操作日志] │
├─────────────────────────────────────────────────────────────────┤
│  文件信息 (FileInfo)                                            │
│  大小: 5.0 MB  |  上传时间: 2026-04-10 06:30  |  状态: [标签]  │
│                                           [取消审查] 按钮       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  状态面板 (StatusPanel) — 根据 TaskStatus 动态渲染         │  │
│  │  以下为各状态的子面板线框图，实际只显示其中一个              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 解析中/审查中面板 ──────────────────────────────────────┐  │
│  │                                                         │  │
│  │  ① 文档解析      ▓▓▓▓▓▓░░░░  60%                        │  │
│  │  ② 条款提取      ░░░░░░░░░░  等待                       │  │
│  │  ③ 风险识别      ░░░░░░░░░░  等待                       │  │
│  │  ④ 合规检查      ░░░░░░░░░░  等待                       │  │
│  │                                                         │  │
│  │  总进度 ████████████████████░░░░░░░░░░  65%             │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 解析失败/审查失败面板 ──────────────────────────────────┐  │
│  │                                                         │  │
│  │  ⚠ 解析失败                                             │  │
│  │  原因: 文件内容无法识别，请确认是否为有效的文本型 PDF    │  │
│  │                                                         │  │
│  │         [重新上传]                    [取消]              │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 待人工审核面板 ─────────────────────────────────────────┐  │
│  │                                                         │  │
│  │  风险项列表 (RiskList) — 按高/中/低分组                  │  │
│  │  ┌─ 高风险 (5项) ────────────────────────────────────┐  │  │
│  │  │ ▼ 风险卡片1 [待审核]  违约责任  置信度92%          │  │  │
│  │  │ ▼ 风险卡片2 [已确认]  知识产权  置信度88%          │  │  │
│  │  │ ▶ 风险卡片3 [待审核]  保密条款  置信度85%          │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │  ┌─ 中风险 (8项) ────────────────────────────────────┐  │  │
│  │  │ ▶ ...                                             │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │  ┌─ 低风险 (12项) ───────────────────────────────────┐  │  │
│  │  │ ▶ ...                                             │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  剩余待处理: 3 项        [批量确认] [生成报告] (未激活)   │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 报告完成面板 ───────────────────────────────────────────┐  │
│  │                                                         │  │
│  │  审查完成                                                 │  │
│  │  共 25 项风险，经人工审核已处理全部高风险项               │  │
│  │                                                         │  │
│  │         [查看报告]              [下载 PDF 报告]           │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**组件树（P2）**：

```
App
 └── ReviewPage (/review/:task_id)
      ├── Header                          # 顶栏：Logo + 返回按钮 + 文件名 + 操作日志入口
      ├── FileInfo                        # 文件信息栏
      │    ├── FileName                   # 文件名
      │    ├── FileSize                   # 文件大小
      │    ├── UploadDate                 # 上传时间
      │    ├── StatusBadge                # 状态标签
      │    └── CancelButton (条件渲染)    # 取消审查按钮（仅进行中任务显示）
      │
      ├── StatusPanel (条件渲染，根据 TaskStatus 选择子面板)
      │    ├── ParsingPanel              # 解析中面板
      │    │    ├── StageList            # 4 阶段状态列表
      │    │    │    └── StageItem[]     # 每个阶段的图标 + 名称 + 状态
      │    │    └── TotalProgressBar     # 总进度条
      │    │
      │    ├── ReviewingPanel            # AI 审查中面板
      │    │    ├── StageList            # 4 阶段状态列表
      │    │    └── TotalProgressBar     # 总进度条
      │    │
      │    ├── ParseFailedPanel          # 解析失败面板
      │    │    ├── ErrorIcon            # 错误图标
      │    │    ├── ErrorMessage          # 失败原因
      │    │    ├── RetryButton          # 重新上传
      │    │    └── CancelButton         # 取消
      │    │
      │    ├── ReviewFailedPanel         # 审查失败面板
      │    │    ├── ErrorIcon            # 错误图标
      │    │    ├── ErrorMessage          # 失败原因
      │    │    ├── RetryButton          # 断点重试
      │    │    └── CancelButton         # 取消
      │    │
      │    ├── PendingReviewPanel        # 待人工审核面板
      │    │    ├── RiskList             # 风险项列表（按等级分组）
      │    │    │    └── RiskGroup[]     # 高/中/低分组
      │    │    │         ├── GroupHeader # 组头：等级 + 数量
      │    │    │         └── RiskCard[]  # 风险卡片
      │    │    ├── RemainingCounter     # 剩余待处理计数
      │    │    ├── BatchApproveButton   # 批量确认
      │    │    └── GenerateReportButton # 生成报告（remaining=0 时激活）
      │    │
      │    └── ReportReadyPanel          # 报告完成面板
      │         ├── SummaryText          # 审查总结
      │         ├── ViewReportButton     # 查看报告（跳转 P3）
      │         └── DownloadReportButton # 下载 PDF
      │
      └── AuditLogDrawer (条件渲染)      # 侧边操作日志抽屉
           └── AuditLogTimeline          # 日志时间线
```

---

## 3. TaskStatus → UI 面板映射表

| TaskStatus | 渲染面板 | 按钮可见性 | SSE 连接 | 说明 |
|------------|---------|-----------|---------|------|
| `uploaded` | FileInfo（仅文件信息） | 显示「取消审查」 | 建立连接，等待状态变更 | 文件已上传，后端尚未开始解析 |
| `parsing` | ParsingPanel | 显示「取消审查」 | 建立连接，监听进度事件 | 4 阶段列表高亮当前阶段，显示总进度条 |
| `parse_complete` | ParsingPanel（阶段 1 标记完成） | 显示「取消审查」 | 保持连接，等待进入 reviewing | 解析完成，即将进入 AI 审查 |
| `parse_failed` | ParseFailedPanel | 显示「重新上传」「取消」 | 断开 | 展示失败原因，用户可重新上传或取消 |
| `reviewing` | ReviewingPanel | 显示「取消审查」 | 建立/保持连接，监听 4 阶段进度 | 4 阶段逐项高亮，总进度条更新 |
| `review_failed` | ReviewFailedPanel | 显示「重试」「取消」 | 断开 | 展示失败原因，支持断点重试 |
| `pending_review` | PendingReviewPanel | 显示「批量确认」「生成报告」(remaining=0 激活) | 断开 | 加载风险项列表，按等级分组展示 |
| `human_reviewing` | PendingReviewPanel | 显示「批量确认」「生成报告」(remaining=0 激活) | 断开 | 与 pending_review 相同面板，状态标签不同 |
| `report_ready` | ReportReadyPanel | 显示「查看报告」「下载 PDF 报告」 | 断开 | 展示审查总结，提供报告查看/下载入口 |
| `cancelled` | FileInfo + 已取消提示 | 显示「重新上传」 | 断开 | 文件信息 + 已取消状态，可重新发起 |

---

## 4. 路由跳转流程图

```
                    ┌──────────┐
                    │  P1 首页  │
                    │    /     │
                    └────┬─────┘
                         │
              用户选择文件 + 点击「开始审查」
                         │
              POST /api/v1/tasks/upload
                         │
                    返回 task_id
                         │
              ┌──────────▼──────────┐
              │  路由跳转            │
              │  navigate(`/review/ │
              │  {task_id}`)        │
              └──────────┬──────────┘
                         │
                    ┌───────────────┐
                    │  P2 审查详情页 │
                    │ /review/:id   │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────────────────────┐
              │             │                             │
         TaskStatus   TaskStatus                    TaskStatus
         = parsing    = pending_review             = report_ready
              │             │                             │
              ▼             ▼                             ▼
         ParsingPanel  PendingReviewPanel          ReportReadyPanel
         (SSE监听)     (加载风险列表)               (展示总结)
              │             │                             │
              │             │ 点击「生成报告」             │ 点击「查看报告」
              │             │ POST /report/generate       │ (简要提及)
              │             │                             │
              │             ▼                             ▼
              │        ReportReadyPanel              P3 报告预览页
              │                                      (后续阶段设计)
              │
              │ 失败分支：
              │   parsing → parse_failed → ParseFailedPanel → [重新上传] → P1
              │   reviewing → review_failed → ReviewFailedPanel → [重试] → P2
              │
              │ 取消分支：
              │   any running state → POST /cancel → cancelled → [重新上传] → P1
              │
              └── 返回按钮 ──→ P1 首页（自动刷新列表）
```

### 跳转条件汇总

| 起点 | 终点 | 触发条件 | 数据传递 |
|------|------|---------|---------|
| P1 `/` | P2 `/review/:task_id` | 上传成功，返回 task_id | URL 参数 task_id |
| P1 `/` | P2 `/review/:task_id` | 点击最近审查记录列表中的任务 | URL 参数 task_id |
| P2 `/review/:task_id` | P1 `/` | 点击返回按钮 / 重新上传 | 无（P1 自动刷新列表） |
| P2 `/review/:task_id` | P3 报告预览页 | 报告完成面板点击「查看报告」 | URL 参数 task_id |
| P2 `/review/:task_id` | P2 自身（面板切换） | SSE 状态变更事件 | 内部状态更新，不跳转路由 |

---

## 5. 后端 API 映射表

### 5.1 P1 首页

| API | 方法 | 路径 | 状态 | 调用时机 |
|-----|------|------|------|---------|
| 任务列表查询 | GET | `/api/v1/tasks` | **已定义** | 页面加载时获取最近审查记录 |
| 文档上传 | POST | `/api/v1/tasks/upload` | **已定义** | 用户选择文件后点击「开始审查」 |

**未开发接口**：无。首页所需接口均在 api_spec-v1.0.md 中完整定义。

### 5.2 P2 审查详情页

| API | 方法 | 路径 | 状态 | 调用时机 |
|-----|------|------|------|---------|
| 任务状态查询 | GET | `/api/v1/tasks/{task_id}` | **已定义** | 页面加载时初始查询 + SSE 降级轮询（3s/次） |
| SSE 进度推送 | GET | `/api/v1/tasks/{task_id}/stream` | **已定义** | 进入页面后建立连接，监听至 `completed` 或 `error` |
| 取消任务 | POST | `/api/v1/tasks/{task_id}/cancel` | **已定义** | 用户点击「取消审查」 |
| 审查结果查询 | GET | `/api/v1/tasks/{task_id}/result` | **已定义** | 收到 SSE `review_pending` 事件后加载风险列表 |
| 风险项详情 | GET | `/api/v1/tasks/{task_id}/risks/{risk_id}` | **已定义** | 用户展开某个风险卡片时（teammate 3 负责） |
| 提交人工审核（单条） | PUT | `/api/v1/tasks/{task_id}/risks/{risk_id}/review` | **已定义** | 用户对单条风险点击同意/编辑/驳回 |
| 批量人工审核 | POST | `/api/v1/tasks/{task_id}/reviews/batch` | **已定义** | 用户批量确认/驳回 |
| 生成审查报告 | POST | `/api/v1/tasks/{task_id}/report/generate` | **已定义** | 全部高风险处理后点击「生成报告」 |
| 下载报告 | GET | `/api/v1/tasks/{task_id}/report` | **已定义** | 用户点击「下载 PDF 报告」 |
| 查询操作日志 | GET | `/api/v1/tasks/{task_id}/auditlog` | **已定义** | 用户点击操作日志入口 |

**未开发接口**：无。P2 所需接口均在 api_spec-v1.0.md 中完整定义。

---

## 6. 页面初始化数据加载流程

### 6.1 P1 首页加载

```
1. 页面挂载
   │
   ├─→ GET /api/v1/tasks?limit=10
   │    │
   │    ├─ 成功 → 渲染 RecentTasks 列表
   │    │         ├─ 每个任务显示：文件名、状态标签、进度/风险数、日期
   │    │         └─ 点击任一任务 → navigate(`/review/${task.id}`)
   │    │
   │    └─ 失败 → 显示空状态 + 错误提示
   │
   └─→ 等待用户操作（上传文件）
```

### 6.2 P2 审查详情页加载

```
1. 从 URL 提取 task_id
   │
   ├─→ GET /api/v1/tasks/{task_id}   （获取任务基本信息）
   │    │
   │    ├─ 200 → 拿到 status, progress, current_stage, file_name 等
   │    │    │
   │    │    ├─ 渲染 FileInfo（始终显示）
   │    │    │
   │    │    └─ 根据 status 决定初始面板：
   │    │         │
   │    │         ├─ uploaded / parsing / parse_complete / reviewing
   │    │         │    └─ 连接 SSE: GET /api/v1/tasks/{task_id}/stream
   │    │         │         ├─ 收到 status_change → 更新面板
   │    │         │         ├─ 收到 progress → 更新进度条
   │    │         │         ├─ 收到 review_pending → 断开 SSE，加载风险列表
   │    │         │         ├─ 收到 error → 渲染失败面板
   │    │         │         └─ 收到 completed → 渲染报告完成面板
   │    │         │
   │    │         ├─ pending_review / human_reviewing
   │    │         │    └─ GET /api/v1/tasks/{task_id}/result
   │    │         │         └─ 渲染 PendingReviewPanel（风险项列表）
   │    │         │
   │    │         ├─ parse_failed / review_failed
   │    │         │    └─ 渲染对应失败面板
   │    │         │
   │    │         ├─ report_ready
   │    │         │    └─ 渲染 ReportReadyPanel
   │    │         │
   │    │         └─ cancelled
   │    │              └─ 显示已取消提示
   │    │
   │    └─ 404 → 跳转 P1 首页 + Toast「任务不存在」
   │
   └─→ 等待用户操作或 SSE 事件
```

### 6.3 SSE 降级轮询流程

```
SSE 连接建立
   │
   ├─ 连接成功 → 正常监听事件
   │    └─ 收到事件 → 更新对应 UI 面板
   │
   └─ 连接失败/超时 → 降级为轮询
        │
        └─ 每 3 秒: GET /api/v1/tasks/{task_id}
             │
             ├─ 状态变化 → 更新面板
             │    ├─ 进入 pending_review → 停止轮询，加载风险列表
             │    ├─ 进入 failed → 停止轮询，渲染失败面板
             │    └─ 进入 report_ready → 停止轮询，渲染完成面板
             │
             └─ 状态未变 → 继续轮询
```

---

## 7. 关键交互细节

### 7.1 上传流程

1. 用户在 P1 首页拖拽或点击选择文件
2. 前端客户端校验：文件扩展名（.docx/.pdf）、大小（≤ 50MB）
3. 校验失败 → 原地显示错误提示，不发起请求
4. 校验通过 → 显示上传进度条，禁用上传区域
5. POST `/api/v1/tasks/upload`（multipart/form-data）
6. 成功返回 task_id → 立即 navigate 至 `/review/{task_id}`
7. 失败 → 显示错误 Toast（INVALID_FILE_TYPE / FILE_TOO_LARGE / DUPLICATE_UPLOAD 等），恢复上传区域

### 7.2 状态驱动面板切换规则

P2 页面内部维护一个 `taskStatus` 状态变量，根据以下规则切换渲染：

```
taskStatus 变化源：
  1. 页面初始加载：GET /api/v1/tasks/{task_id}.status
  2. SSE 事件：event=status_change → data.status
  3. 轮询响应：GET /api/v1/tasks/{task_id}.status
  4. 用户操作回调：取消/重试/审核决策的响应

面板映射：
  {uploaded, parsing, parse_complete}  → ParsingPanel（不同阶段高亮不同）
  {reviewing}                          → ReviewingPanel
  {parse_failed}                       → ParseFailedPanel
  {review_failed}                      → ReviewFailedPanel
  {pending_review, human_reviewing}    → PendingReviewPanel
  {report_ready}                       → ReportReadyPanel
  {cancelled}                          → CancelledView（FileInfo + 提示）
```

### 7.3 取消审查

- 仅在 `uploaded` / `parsing` / `parse_complete` / `reviewing` 状态下显示「取消审查」按钮
- 点击后弹出确认弹窗
- 确认后 POST `/api/v1/tasks/{task_id}/cancel`
- 成功 → 面板切换至 CancelledView，断开 SSE 连接
- 失败 → Toast 提示错误

### 7.4 断点重试（审查失败）

- 仅在 `review_failed` 状态下显示「重试」按钮
- 点击后 POST `/api/v1/tasks/upload` 重新上传同一文件（携带原始文件名）
- 或调用后端提供的重试接口（若后续实现）
- 当前版本：重新上传流程，复用上传入口

---

## 8. 风险项分组渲染规则

PendingReviewPanel 中的风险项按等级分组，渲染规则：

```
RiskList
 ├── 高风险组 (level === 'high')
 │    ├── 组头：「高风险 (5项)」— 红色标签
 │    └── RiskCard[] — 按 confidence 降序排列
 │         └── 每张卡片显示：风险等级、分类、置信度、原文摘要、审核状态标签
 │
 ├── 中风险组 (level === 'medium')
 │    ├── 组头：「中风险 (8项)」— 橙色标签
 │    └── RiskCard[] — 默认收起，可展开
 │
 └── 低风险组 (level === 'low')
      ├── 组头：「低风险 (12项)」— 蓝色标签
      └── RiskCard[] — 默认收起，可展开
```

- 高风险组默认展开，中低风险组默认收起
- 已处理项（approved/modified/rejected）视觉弱化（降低不透明度）
- 剩余待处理计数仅统计高风险项（`remaining_pending` 字段）
- 「生成报告」按钮在 `remaining_pending === 0` 时激活

---

## 9. 操作日志入口

- P2 审查详情页顶栏右侧显示「操作日志」按钮
- 点击后从右侧滑出 AuditLogDrawer 抽屉
- 抽屉内调用 GET `/api/v1/tasks/{task_id}/auditlog` 渲染时间线
- 时间线包含：上传 → 解析 → 审查 → 审核决策 → 报告生成的全链路记录
