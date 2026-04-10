// ============================================================
// API 客户端层 — 真实后端 API 调用
// 所有接口路径来自 api_spec-v1.0.md
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

export interface BackendRiskItem {
  risk_id: string;
  level: RiskLevel;
  category: string;
  confidence: number;
  clause_text: string;
  clause_position: { section?: string; clause?: string; page?: number; offset_start: number; offset_end: number };
  description: string;
  suggestion: string;
  legal_basis: string;
  human_review_status: HumanReviewStatus;
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

export interface BackendAuditLog {
  event_type: string;
  action: string;
  operator: string;
  created_at: string;
  details?: Record<string, any>;
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

// ---------- 字段映射工具函数 ----------

function mapTask(raw: {
  id: string; file_name: string; file_size: number; status: string;
  progress: number; current_stage?: string; error_message?: string;
  created_at: string; completed_at?: string; risk_count?: number;
}): Task {
  return {
    id: raw.id,
    file_name: raw.file_name,
    file_size: raw.file_size,
    status: raw.status as TaskStatus,
    progress: raw.progress,
    current_stage: raw.current_stage,
    created_at: raw.created_at,
    updated_at: raw.completed_at || raw.created_at,
    risk_count: raw.risk_count,
  };
}

function mapRiskItem(raw: BackendRiskItem, taskId: string): RiskItem {
  const pos = raw.clause_position;
  const section = pos.section || '';
  const clause = pos.clause || '';
  const locationStr = [section, clause].filter(Boolean).join('\u00b7') || '\u672a\u77e5\u4f4d\u7f6e';
  const title = raw.description.length > 50 ? raw.description.slice(0, 50) + '...' : raw.description;
  return {
    id: raw.risk_id,
    task_id: taskId,
    level: raw.level,
    title,
    category: raw.category,
    confidence: raw.confidence,
    human_review_status: raw.human_review_status,
    clause_text: raw.clause_text,
    clause_location: locationStr,
    page: pos.page || 0,
    offset_start: pos.offset_start,
    offset_end: pos.offset_end,
    description: raw.description,
    legal_basis: raw.legal_basis,
    suggestion: raw.suggestion,
  };
}

function mapAuditLog(raw: BackendAuditLog, index: number): AuditLogEntry {
  const iconMap: Record<string, AuditLogEntry['icon']> = {
    upload: 'doc', approve: 'check', reject: 'cross',
    modify: 'pencil', report: 'save', ai_complete: 'bolt',
    session_start: 'start', status_change: 'doc',
  };
  return {
    id: `log-${index}`,
    timestamp: raw.created_at,
    action: raw.action,
    detail: raw.details ? `${raw.action}: ${JSON.stringify(raw.details)}` : raw.action,
    icon: iconMap[raw.event_type] || 'bolt',
  };
}

// ---------- 真实 API 调用函数 ----------

export async function fetchTaskList(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  const data = await res.json();
  const rawTasks = data.tasks || [];
  return rawTasks.map(mapTask);
}

export async function uploadFile(file: File, dimensions: string[]): Promise<{ task_id: string; file_name: string; file_size: number; status: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (dimensions.length > 0) {
    formData.append('review_dimensions', dimensions.join(','));
  }
  const res = await fetch(`${API_BASE}/tasks/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTaskDetail(taskId: string): Promise<Task | null> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch task: ${res.status}`);
  const raw = await res.json();
  return mapTask(raw);
}

export async function cancelTask(taskId: string): Promise<{ task_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
  return res.json();
}

export async function fetchReviewResult(taskId: string): Promise<RiskItem[]> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/result`);
  if (!res.ok) throw new Error(`Failed to fetch review result: ${res.status}`);
  const data = await res.json();
  const rawItems: BackendRiskItem[] = data.risk_items || [];
  return rawItems.map(item => mapRiskItem(item, taskId));
}

export async function submitReview(
  taskId: string,
  riskId: string,
  action: 'approve' | 'modify' | 'reject',
  options?: { comment?: string; modified_content?: { level?: string; description?: string; suggestion?: string; legal_basis?: string }; reject_reason?: string }
): Promise<{ risk_id: string; human_review_status: string; remaining_pending: number }> {
  const body: any = { action, comment: options?.comment };
  if (options?.modified_content) body.modified_content = options.modified_content;
  const res = await fetch(`${API_BASE}/tasks/${taskId}/risks/${riskId}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'frontend_user' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Review failed: ${res.status}`);
  return res.json();
}

export async function batchReview(
  taskId: string,
  reviews: { risk_id: string; action: string; comment?: string }[]
): Promise<{ updated_count: number; remaining_pending: number }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/reviews/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'frontend_user' },
    body: JSON.stringify({ reviews }),
  });
  if (!res.ok) throw new Error(`Batch review failed: ${res.status}`);
  return res.json();
}

export async function generateReport(taskId: string): Promise<{ report_id: string; generated_at: string }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/report/generate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Generate report failed: ${res.status}`);
  return res.json();
}

export async function downloadReportBlob(taskId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/report`);
  if (!res.ok) throw new Error(`Download report failed: ${res.status}`);
  return res.blob();
}

export async function fetchAuditLog(taskId: string): Promise<AuditLogEntry[]> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/auditlog`);
  if (!res.ok) throw new Error(`Failed to fetch audit log: ${res.status}`);
  const data = await res.json();
  const rawLogs: BackendAuditLog[] = data.logs || [];
  return rawLogs.map((log, i) => mapAuditLog(log, i));
}

// ---------- API 端点元数据 ----------

export const API_ENDPOINTS = {
  taskList:        { method: 'GET',  path: `${API_BASE}/tasks`,                          status: '已连接' },
  upload:          { method: 'POST', path: `${API_BASE}/tasks/upload`,                   status: '已连接' },
  taskDetail:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}`,                status: '已连接' },
  taskStream:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/stream`,         status: '已连接' },
  cancelTask:      { method: 'POST', path: `${API_BASE}/tasks/{task_id}/cancel`,         status: '已连接' },
  reviewResult:    { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/result`,         status: '已连接' },
  riskDetail:      { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/risks/{risk_id}`, status: '已连接' },
  submitReview:    { method: 'PUT',  path: `${API_BASE}/tasks/{task_id}/risks/{risk_id}/review`, status: '已连接' },
  batchReview:     { method: 'POST', path: `${API_BASE}/tasks/{task_id}/reviews/batch`,  status: '已连接' },
  generateReport:  { method: 'POST', path: `${API_BASE}/tasks/{task_id}/report/generate`, status: '已连接' },
  downloadReport:  { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/report`,          status: '已连接' },
  auditLog:        { method: 'GET',  path: `${API_BASE}/tasks/{task_id}/auditlog`,        status: '已连接' },
} as const;

// ---------- 分类/状态映射 ----------

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
