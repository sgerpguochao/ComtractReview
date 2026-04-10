// ============================================================
// API 契约层 — 所有接口路径严格来自 api_spec-v1.0.md
// 状态标注：已定义 = 后端 API 已定义；未开发 = 后端未实现
// 本文件使用 Mock 数据驱动 UI 原型，不伪造功能
// ============================================================

const API_BASE = '/api/v1';

// ---------- 类型定义 ----------

export type TaskStatus =
  | 'uploaded'
  | 'parsing'
  | 'parse_complete'
  | 'parse_failed'
  | 'reviewing'
  | 'review_failed'
  | 'pending_review'
  | 'human_reviewing'
  | 'report_ready'
  | 'cancelled';

export type RiskLevel = 'high' | 'medium' | 'low';

export type HumanReviewStatus = 'pending' | 'approved' | 'modified' | 'rejected';

export type RejectReason = 'false_positive' | 'not_applicable' | 'already_fixed' | 'other';

export interface Task {
  id: string;
  file_name: string;
  file_size: number;
  status: TaskStatus;
  progress: number;
  current_stage?: string;
  created_at: string;
  updated_at: string;
  risk_count?: number;
}

export interface RiskItem {
  id: string;
  task_id: string;
  level: RiskLevel;
  title: string;
  category: string;
  confidence: number;
  human_review_status: HumanReviewStatus;
  clause_text: string;
  clause_location: string;
  page: number;
  offset_start: number;
  offset_end: number;
  description: string;
  legal_basis: string;
  suggestion: string;
  reviewer?: string;
  reviewed_at?: string;
  reject_reason?: RejectReason;
  reject_comment?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  icon: 'doc' | 'check' | 'cross' | 'pencil' | 'save' | 'bolt' | 'start';
}

export interface ReviewResult {
  task_id: string;
  overall_score: number;
  risk_items: RiskItem[];
}

// ---------- API 端点定义 ----------

export const API_ENDPOINTS = {
  // P1 首页
  taskList:        { method: 'GET',  path: `${API_BASE}/tasks`,                          status: '已定义' },
  upload:          { method: 'POST', path: `${API_BASE}/tasks/upload`,                   status: '已定义' },
  // P2 审查详情页
  taskDetail:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}`,                status: '已定义' },
  taskStream:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/stream`,         status: '已定义' },
  cancelTask:      { method: 'POST', path: `${API_BASE}/tasks/{task_id}/cancel`,         status: '已定义' },
  reviewResult:    { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/result`,          status: '已定义' },
  riskDetail:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/risks/{risk_id}`, status: '已定义' },
  submitReview:    { method: 'PUT',  path: `${API_BASE}/tasks/{task_id}/risks/{risk_id}/review`, status: '已定义' },
  batchReview:     { method: 'POST', path: `${API_BASE}/tasks/{task_id}/reviews/batch`,  status: '已定义' },
  generateReport:  { method: 'POST', path: `${API_BASE}/tasks/{task_id}/report/generate`, status: '已定义' },
  downloadReport:  { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/report`,          status: '已定义' },
  auditLog:        { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/auditlog`,        status: '已定义' },
} as const;

// ---------- Mock 数据 ----------

export const MOCK_TASKS: Task[] = [
  { id: 'task-001', file_name: '采购合同_2026Q2.docx', file_size: 5242880, status: 'report_ready', progress: 100, created_at: '2026-04-10T06:30:00Z', updated_at: '2026-04-10T07:30:00Z', risk_count: 25 },
  { id: 'task-002', file_name: '服务合同_draft.pdf', file_size: 3145728, status: 'reviewing', progress: 72, current_stage: '风险识别', created_at: '2026-04-09T10:00:00Z', updated_at: '2026-04-09T10:30:00Z' },
  { id: 'task-003', file_name: '租赁合同.docx', file_size: 2097152, status: 'parse_failed', progress: 0, created_at: '2026-04-08T14:00:00Z', updated_at: '2026-04-08T14:05:00Z' },
  { id: 'task-004', file_name: 'NDA_保密协议_v3.pdf', file_size: 1048576, status: 'pending_review', progress: 100, created_at: '2026-04-07T09:00:00Z', updated_at: '2026-04-07T09:45:00Z', risk_count: 12 },
  { id: 'task-005', file_name: '技术开发合同.docx', file_size: 4194304, status: 'parsing', progress: 45, current_stage: '文档解析', created_at: '2026-04-10T08:00:00Z', updated_at: '2026-04-10T08:02:00Z' },
];

export const MOCK_RISK_ITEMS: RiskItem[] = [
  { id: 'risk-001', task_id: 'task-004', level: 'high', title: '单方无限制解除权，违反公平原则', category: 'contract_termination', confidence: 92, human_review_status: 'pending', clause_text: '甲方有权单方面解除本合同，无需承担任何违约责任。乙方不得对此提出任何异议或索赔。', clause_location: '第八条·第2款', page: 5, offset_start: 1024, offset_end: 1156, description: '该条款赋予甲方无限制的单方解除权，且免除了甲方的违约责任，严重违反了合同公平原则。', legal_basis: '《中华人民共和国民法典》第五百六十三条：有下列情形之一的，当事人可以解除合同：（一）因不可抗力致使不能实现合同目的；（二）在履行期限届满前，当事人一方明确表示或者以自己的行为表明不履行主要债务...', suggestion: '建议修改为"经双方协商一致，任何一方可提前30日书面通知对方解除本合同。因一方违约导致合同解除的，违约方应承担相应违约责任。"' },
  { id: 'risk-002', task_id: 'task-004', level: 'high', title: '知识产权归属条款缺失', category: 'intellectual_property', confidence: 88, human_review_status: 'pending', clause_text: '合同履行过程中产生的所有成果归甲方所有。', clause_location: '第十二条·第1款', page: 8, offset_start: 2048, offset_end: 2130, description: '知识产权归属条款过于笼统，未明确区分背景知识产权和前景知识产权。', legal_basis: '《中华人民共和国民法典》第八百四十七条', suggestion: '建议明确区分合同前已有知识产权和合同履行过程中新产生的知识产权，对新产生的知识产权约定共有或按贡献比例分配。' },
  { id: 'risk-003', task_id: 'task-004', level: 'high', title: '违约金比例过高', category: 'breach_of_contract', confidence: 85, human_review_status: 'approved', clause_text: '乙方违约的，应向甲方支付合同总金额50%的违约金。', clause_location: '第十五条·第3款', page: 12, offset_start: 3200, offset_end: 3280, description: '违约金比例设定为合同总金额的50%，可能被认定为过高。', legal_basis: '《最高人民法院关于适用〈中华人民共和国合同法〉若干问题的解释（二）》第二十九条', suggestion: '建议将违约金比例调整为合同总金额的10%-20%，或约定以实际损失为基础确定违约金。', reviewer: 'user-001', reviewed_at: '2026-04-07T10:00:00Z' },
  { id: 'risk-004', task_id: 'task-004', level: 'medium', title: '保密期限约定不明确', category: 'confidentiality', confidence: 78, human_review_status: 'pending', clause_text: '双方应对合同内容及履行过程中获知的对方商业秘密保密。', clause_location: '第九条·第1款', page: 6, offset_start: 1500, offset_end: 1580, description: '保密条款未约定保密期限和保密范围。', legal_basis: '《中华人民共和国反不正当竞争法》第九条', suggestion: '建议明确保密期限（如合同终止后3年内）、保密信息的具体范围、以及违反保密义务的违约责任。' },
  { id: 'risk-005', task_id: 'task-004', level: 'medium', title: '争议解决条款仲裁机构未指定', category: 'dispute_resolution', confidence: 75, human_review_status: 'rejected', clause_text: '因本合同引起的争议，双方应友好协商解决；协商不成的，提交仲裁解决。', clause_location: '第十八条', page: 14, offset_start: 4000, offset_end: 4100, description: '仲裁条款未指定具体仲裁机构，可能导致仲裁条款无效。', legal_basis: '《中华人民共和国仲裁法》第十六条', suggestion: '建议明确约定仲裁机构，如"提交中国国际经济贸易仲裁委员会仲裁"。', reviewer: 'user-001', reviewed_at: '2026-04-07T10:05:00Z', reject_reason: 'false_positive', reject_comment: '已在补充协议中约定了仲裁机构' },
  { id: 'risk-006', task_id: 'task-004', level: 'medium', title: '付款条件过于宽松', category: 'payment_terms', confidence: 72, human_review_status: 'pending', clause_text: '甲方应在收到乙方发票后90个工作日内支付合同款项。', clause_location: '第六条·第2款', page: 4, offset_start: 900, offset_end: 970, description: '90个工作日的付款周期过长，对乙方现金流构成压力。', legal_basis: '《中华人民共和国民法典》第五百一十一条', suggestion: '建议缩短付款周期至30-45个工作日，或约定逾期付款的利息。' },
  { id: 'risk-007', task_id: 'task-004', level: 'medium', title: '不可抗力条款定义过窄', category: 'force_majeure', confidence: 68, human_review_status: 'pending', clause_text: '不可抗力仅指地震、洪水等自然灾害。', clause_location: '第十六条·第1款', page: 13, offset_start: 3500, offset_end: 3560, description: '不可抗力条款定义过于狭窄，未包含疫情、政策变更等常见不可抗力情形。', legal_basis: '《中华人民共和国民法典》第一百八十条', suggestion: '建议扩展不可抗力定义，增加"流行病、政府行为、战争、罢工"等常见情形。' },
  { id: 'risk-008', task_id: 'task-004', level: 'low', title: '合同生效条件表述不清', category: 'other', confidence: 65, human_review_status: 'pending', clause_text: '本合同自双方签字之日起生效。', clause_location: '第二十条', page: 15, offset_start: 4500, offset_end: 4540, description: '未明确是否需要盖章生效，对于法人主体合同，通常需要签字并盖章。', legal_basis: '《中华人民共和国民法典》第四百九十条', suggestion: '建议修改为"本合同自双方法定代表人或授权代表签字并加盖公章之日起生效"。' },
  { id: 'risk-009', task_id: 'task-004', level: 'low', title: '数据处理条款缺失', category: 'data_compliance', confidence: 60, human_review_status: 'pending', clause_text: '', clause_location: '（缺失）', page: 0, offset_start: 0, offset_end: 0, description: '合同未包含个人信息处理相关条款，若合同履行涉及个人信息处理，可能违反数据保护法规。', legal_basis: '《中华人民共和国个人信息保护法》第二十一条', suggestion: '建议增加数据处理条款，明确个人信息的处理目的、范围、安全保障措施等。' },
  { id: 'risk-010', task_id: 'task-004', level: 'low', title: '责任限制条款单方倾斜', category: 'liability_limitation', confidence: 55, human_review_status: 'pending', clause_text: '甲方对本合同项下的责任以已收取的服务费为限。', clause_location: '第十四条·第2款', page: 11, offset_start: 3000, offset_end: 3060, description: '责任限制仅针对甲方设定上限，未对乙方做相同限制，条款不对等。', legal_basis: '《中华人民共和国民法典》第四百九十七条', suggestion: '建议双方均适用相同的责任限制条款，或根据各方在合同中的角色合理设定责任上限。' },
  { id: 'risk-011', task_id: 'task-004', level: 'medium', title: '验收标准未明确', category: 'other', confidence: 70, human_review_status: 'modified', clause_text: '乙方交付的成果应符合甲方要求。', clause_location: '第七条·第1款', page: 5, offset_start: 1200, offset_end: 1250, description: '验收标准过于模糊，容易引发争议。', legal_basis: '《中华人民共和国民法典》第六百一十六条', suggestion: '建议在合同附件中明确验收标准、验收流程和验收期限。', reviewer: 'user-001', reviewed_at: '2026-04-07T10:10:00Z' },
  { id: 'risk-012', task_id: 'task-004', level: 'low', title: '通知送达方式不完善', category: 'other', confidence: 50, human_review_status: 'pending', clause_text: '双方的通知以书面形式送达。', clause_location: '第十九条', page: 15, offset_start: 4300, offset_end: 4350, description: '未明确电子邮件等电子通知方式的效力。', legal_basis: '《中华人民共和国民法典》第一百三十七条', suggestion: '建议增加电子邮件、传真等通知方式，并约定送达的生效时间。' },
];

export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: 'log-01', timestamp: '2026-04-10T07:30:00Z', action: 'status_change', detail: '任务状态变更 → report_ready', icon: 'doc' },
  { id: 'log-02', timestamp: '2026-04-10T07:28:00Z', action: 'generate_report', detail: '生成审查报告', icon: 'save' },
  { id: 'log-03', timestamp: '2026-04-10T07:15:00Z', action: 'batch_approve', detail: '批量确认 3 项风险', icon: 'check' },
  { id: 'log-04', timestamp: '2026-04-10T07:10:00Z', action: 'reject', detail: '驳回风险项 risk-002（误报）', icon: 'cross' },
  { id: 'log-05', timestamp: '2026-04-10T07:05:00Z', action: 'modify', detail: '修正风险项 risk-001（HIGH→MEDIUM）', icon: 'pencil' },
  { id: 'log-06', timestamp: '2026-04-10T07:00:00Z', action: 'approve', detail: '确认风险项 risk-006', icon: 'check' },
  { id: 'log-07', timestamp: '2026-04-10T06:50:00Z', action: 'ai_complete', detail: 'AI 审查完成，待人工审核', icon: 'bolt' },
  { id: 'log-08', timestamp: '2026-04-10T06:45:00Z', action: 'session_start', detail: '开始人工审核（第1轮）', icon: 'start' },
];

// ---------- 分类映射 ----------

export const CATEGORY_LABELS: Record<string, string> = {
  breach_of_contract: '违约责任',
  intellectual_property: '知识产权',
  confidentiality: '保密条款',
  dispute_resolution: '争议解决',
  contract_termination: '合同解除',
  force_majeure: '不可抗力',
  data_compliance: '数据合规',
  payment_terms: '付款条款',
  liability_limitation: '责任限制',
  other: '其他',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  uploaded: '已上传',
  parsing: '解析中',
  parse_complete: '解析完成',
  parse_failed: '解析失败',
  reviewing: 'AI审查中',
  review_failed: '审查失败',
  pending_review: '待人工审核',
  human_reviewing: '人工审核中',
  report_ready: '报告可导出',
  cancelled: '已取消',
};

export const REVIEW_STATUS_CONFIG: Record<HumanReviewStatus, { label: string; bg: string; color: string }> = {
  pending:  { label: '待处理', bg: '#F3F4F6', color: '#6B7280' },
  approved: { label: '已确认', bg: '#F0FDF4', color: '#16A34A' },
  modified: { label: '已修改', bg: '#FFFBEB', color: '#D97706' },
  rejected: { label: '已驳回', bg: '#FEF2F2', color: '#DC2626' },
};

export const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: 'false_positive', label: '误报 - AI 识别错误，该条款无风险' },
  { value: 'not_applicable', label: '不适用 - 该条款对本合同类型不适用' },
  { value: 'already_fixed', label: '已修正 - 合同已更新，该风险已消除' },
  { value: 'other', label: '其他 - 其他原因' },
];
