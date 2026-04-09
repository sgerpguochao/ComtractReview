# 数据模型：审核规则与风险项

> 版本：v1.0 | 日期：2026-04-09
> 阶段：07_data_model
> 前置文档：docs/06_architecture/backend_review_workflow.md

---

## 概述

本文档定义合同审查系统中**审核规则、风险项、审核结果、原文定位**相关的数据模型。这些模型支撑 AI 风险识别和人工审核的全流程。

---

## 1. ReviewRule（审核规则模型）

定义系统中可配置的审核规则模板，是 AI 风险识别的知识依据。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `id` | UUID | 是 | 自动生成 | 规则唯一标识 | 否 | 是 |
| `name` | String(100) | 是 | - | 规则名称，如 "违约金上限检查" | 是 | 是 |
| `category` | Enum | 是 | - | 规则分类，见分类枚举 | 是 | 是 |
| `description` | Text | 是 | - | 规则描述，说明检查什么、为什么重要 | 是 | 是 |
| `severity_default` | Enum | 是 | `medium` | 默认严重等级（high/medium/low） | 是 | 是 |
| `legal_basis` | Text | 否 | null | 法律法规依据（如《民法典》第XX条） | 是 | 是 |
| `check_prompt` | Text | 是 | - | 用于 LLM 的审核提示词模板 | 否 | 是 |
| `is_active` | Boolean | 是 | true | 是否启用该规则 | 是 | 是 |
| `sort_order` | Integer | 是 | 0 | 排序权重，值越小越靠前 | 否 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | 创建时间 | 否 | 是 |
| `updated_at` | DateTime | 是 | 当前时间 | 最后更新时间 | 否 | 是 |

### 规则分类枚举

```python
class RuleCategory(str, Enum):
    BREACH_OF_CONTRACT = "breach_of_contract"    # 违约责任
    INTELLECTUAL_PROPERTY = "intellectual_property"  # 知识产权
    CONFIDENTIALITY = "confidentiality"          # 保密条款
    DISPUTE_RESOLUTION = "dispute_resolution"    # 争议解决
    CONTRACT_TERMINATION = "contract_termination"  # 合同解除
    FORCE_MAJEURE = "force_majeure"              # 不可抗力
    DATA_COMPLIANCE = "data_compliance"          # 数据合规
    PAYMENT_TERMS = "payment_terms"              # 付款条款
    LIABILITY_LIMITATION = "liability_limitation"  # 责任限制
    OTHER = "other"                              # 其他
```

---

## 2. TextPosition（原文定位模型）

风险项在合同原文中的位置信息，支持前端高亮标注。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `page` | Integer | 否 | null | 页码（PDF 文件，从 1 开始） | 是 | 是 |
| `section` | String(200) | 否 | null | 章节名称，如 "第5条 违约责任" | 是 | 是 |
| `paragraph_index` | Integer | 否 | null | 段落序号（从 0 开始） | 否 | 是 |
| `char_start` | Integer | 否 | null | 字符起始位置（全文中的偏移量） | 否 | 是 |
| `char_end` | Integer | 否 | null | 字符结束位置 | 否 | 是 |
| `clause_text` | Text | 是 | - | 命中条款的原始文本（截取片段） | 是 | 是 |

### 说明

- `page` + `section` 用于前端展示定位
- `char_start` + `char_end` 用于后端原文高亮标注
- `clause_text` 是前端必须展示的条款原文片段

---

## 3. RiskItem（风险项模型）

AI 识别出的具体风险项，是人工审核的核心对象。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `risk_id` | String(36) | 是 | 自动生成 | 风险项唯一标识（UUID 字符串） | 是 | 是 |
| `task_id` | UUID | 是 | - | 所属任务 ID | 否 | 是 |
| `rule_id` | UUID | 否 | null | 命中的审核规则 ID（外键 → ReviewRule.id） | 否 | 是 |
| `level` | Enum | 是 | - | 风险等级：high / medium / low | 是 | 是 |
| `category` | String(50) | 是 | - | 风险分类（对应 RuleCategory） | 是 | 是 |
| `confidence` | Float | 是 | - | AI 置信度（0.0 - 1.0） | 是 | 是 |
| `clause_text` | Text | 是 | - | 命中条款的原始文本 | 是 | 是 |
| `clause_position` | JSON | 是 | - | 原文位置信息（TextPosition 结构的 JSON 序列化） | 是 | 是 |
| `description` | Text | 是 | - | 风险描述：为什么这是风险 | 是 | 是 |
| `suggestion` | Text | 是 | - | 修改建议：建议如何修改 | 是 | 是 |
| `legal_basis` | Text | 否 | null | 法律依据 | 是 | 是 |
| `human_review_status` | Enum | 是 | `pending` | 人工审核状态：pending / approved / modified / rejected | 是 | 是 |
| `human_comment` | Text | 否 | null | 人工备注（审核意见） | 是 | 是 |
| `modified_content` | Text | 否 | null | 人工修改后的条款内容（action=modify 时填写） | 是 | 是 |
| `created_at` | DateTime | 是 | 当前时间 | AI 识别时间 | 否 | 是 |
| `reviewed_at` | DateTime | 否 | null | 人工审核时间 | 否 | 是 |

### 风险等级枚举

```python
class RiskLevel(str, Enum):
    HIGH = "high"       # 高风险：必须处理
    MEDIUM = "medium"   # 中风险：建议处理
    LOW = "low"         # 低风险：可选关注
```

### 人工审核状态枚举

```python
class HumanReviewStatus(str, Enum):
    PENDING = "pending"       # 待审核
    APPROVED = "approved"     # 已确认
    MODIFIED = "modified"     # 已修改
    REJECTED = "rejected"     # 已驳回（非风险项）
```

---

## 4. ReviewResult（审核结果模型）

整个审查任务的结果汇总，包含所有风险项和统计信息。

### 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 说明 | 前端展示 | 后端存储 |
|--------|------|------|--------|------|----------|----------|
| `task_id` | UUID | 是 | - | 关联的任务 ID（外键 → Task.id） | 否 | 是 |
| `total_risks` | Integer | 是 | 0 | 风险项总数 | 是 | 是 |
| `high_count` | Integer | 是 | 0 | 高风险数量 | 是 | 是 |
| `medium_count` | Integer | 是 | 0 | 中风险数量 | 是 | 是 |
| `low_count` | Integer | 是 | 0 | 低风险数量 | 是 | 是 |
| `approved_count` | Integer | 是 | 0 | 人工确认的数量 | 是 | 是 |
| `rejected_count` | Integer | 是 | 0 | 人工驳回的数量 | 是 | 是 |
| `modified_count` | Integer | 是 | 0 | 人工修改的数量 | 是 | 是 |
| `pending_count` | Integer | 是 | 0 | 待审核数量 | 是 | 是 |
| `summary` | Text | 否 | null | AI 生成的审查总结 | 是 | 是 |
| `risks` | JSON | 是 | `[]` | 风险项列表（RiskItem 数组的 JSON 序列化） | 是 | 是 |
| `generated_at` | DateTime | 是 | 当前时间 | 结果生成时间 | 是 | 是 |

### 说明

- `risks` 字段存储完整的风险项 JSON 数组，便于一次性查询所有风险
- 统计字段冗余存储，避免前端每次聚合计算
- 该模型既存储在数据库中，也通过 `review_result_path` 以 JSON 文件形式存储在文件系统中（供 LangGraph checkpoint 使用）

---

## 模型关系图

```
ReviewRule (1) ──── (N) RiskItem
                        │
Task (1) ──── (1) ReviewResult
                        │
                     (包含 N RiskItem)

RiskItem (N) ──── (1) TextPosition（通过 clause_position JSON 嵌入）
```

- **ReviewRule ↔ RiskItem**：1:N 关系，一个规则可命中多个风险项
- **Task ↔ ReviewResult**：1:1 关系，一个任务对应一个审查结果
- **ReviewResult ↔ RiskItem**：1:N 关系（通过 JSON 数组包含）
- **RiskItem ↔ TextPosition**：风险项通过 `clause_position` JSON 字段内嵌位置信息

---

## 前端必须展示字段汇总

| 模型 | 字段 | 展示位置 |
|------|------|----------|
| ReviewRule | `name` | 审核规则配置页 |
| ReviewRule | `category` | 规则分类标签 |
| ReviewRule | `description` | 规则详情弹窗 |
| ReviewRule | `severity_default` | 默认严重等级展示 |
| ReviewRule | `legal_basis` | 法律依据提示 |
| ReviewRule | `is_active` | 规则启用/禁用开关 |
| RiskItem | `risk_id` | 风险项标识 |
| RiskItem | `level` | 风险等级标签（颜色区分） |
| RiskItem | `category` | 风险分类标签 |
| RiskItem | `confidence` | 置信度进度条 |
| RiskItem | `clause_text` | 合同原文高亮区域 |
| RiskItem | `clause_position` | 原文定位面包屑 |
| RiskItem | `description` | 风险描述卡片 |
| RiskItem | `suggestion` | 修改建议卡片 |
| RiskItem | `legal_basis` | 法律依据提示 |
| RiskItem | `human_review_status` | 审核状态标签 |
| RiskItem | `human_comment` | 人工审核意见区 |
| RiskItem | `modified_content` | 修改后内容对比 |
| ReviewResult | `total_risks` | 审查结果概览 |
| ReviewResult | `high_count` | 高风险数量（红色高亮） |
| ReviewResult | `medium_count` | 中风险数量 |
| ReviewResult | `low_count` | 低风险数量 |
| ReviewResult | `summary` | 审查总结段落 |
| ReviewResult | `generated_at` | 审查完成时间 |
