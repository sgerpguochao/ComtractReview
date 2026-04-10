import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, Download, Eye,
  ChevronDown, ChevronRight, Copy, X, RefreshCw, Ban
} from 'lucide-react';
import { Header } from './Header';
import { AuditLogDrawer } from './AuditLogDrawer';
import { EditDrawer } from './EditDrawer';
import {
  MOCK_TASKS, MOCK_RISK_ITEMS, API_ENDPOINTS,
  CATEGORY_LABELS, STATUS_LABELS, REVIEW_STATUS_CONFIG, REJECT_REASONS,
  type Task, type TaskStatus, type RiskItem, type RiskLevel, type HumanReviewStatus, type RejectReason,
} from '../api';

// ===== FileInfo =====
function FileInfo({ task, onCancel }: { task: Task; onCancel: () => void }) {
  const formatSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
  const sc = statusColor(task.status);
  const canCancel = ['uploaded', 'parsing', 'parse_complete', 'reviewing'].includes(task.status);

  return (
    <div className="bg-white border border-border rounded-xl px-6 py-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap">
        <span className="text-[0.9375rem]" style={{ fontWeight: 500 }}>{task.file_name}</span>
        <span className="text-[0.8125rem] text-gray-500">大小: {formatSize(task.file_size)}</span>
        <span className="text-[0.8125rem] text-gray-500">上传时间: {new Date(task.created_at).toLocaleString('zh-CN')}</span>
        <span className="text-[0.75rem] px-2.5 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
      {canCancel && (
        <button onClick={onCancel} className="text-[0.8125rem] text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors flex items-center gap-1">
          <Ban className="w-3.5 h-3.5" /> 取消审查
        </button>
      )}
    </div>
  );
}

// ===== Progress Panels =====
const STAGES = ['文档解析', '条款提取', '风险识别', '合规检查'];

function ProgressPanel({ task, isParsing }: { task: Task; isParsing?: boolean }) {
  const currentIdx = isParsing ? 0 : Math.min(3, Math.floor(task.progress / 25));
  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h3 className="mb-4">{isParsing ? '文档解析中...' : 'AI 审查中...'}</h3>
      <div className="flex flex-col gap-3 mb-5">
        {STAGES.map((s, i) => {
          const done = i < currentIdx || task.progress === 100;
          const active = i === currentIdx && task.progress < 100;
          return (
            <div key={s} className="flex items-center gap-3">
              <span className="text-[0.8125rem] w-6 text-center text-gray-400">{'①②③④'[i]}</span>
              <span className={`text-[0.875rem] flex-1 ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`} style={{ fontWeight: active ? 500 : 400 }}>
                {s}
              </span>
              <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500 w-full' : active ? 'bg-blue-500' : 'bg-gray-200'}`} style={{ width: done ? '100%' : active ? `${(task.progress % 25) * 4}%` : '0%' }} />
              </div>
              <span className="text-[0.75rem] w-10 text-right text-gray-400">
                {done ? '完成' : active ? '进行中' : '等待'}
              </span>
            </div>
          );
        })}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[0.8125rem] text-gray-500">总进度</span>
          <span className="text-[0.8125rem] text-gray-600">{task.progress}%</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${task.progress}%` }} />
        </div>
      </div>
      <p className="text-[0.75rem] text-gray-400 mt-3">
        SSE 连接: GET {API_ENDPOINTS.taskStream.path.replace('{task_id}', task.id)} ({API_ENDPOINTS.taskStream.status})
      </p>
    </div>
  );
}

function FailedPanel({ task, type }: { task: Task; type: 'parse' | 'review' }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white border border-red-200 rounded-xl p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <h3 className="text-red-600 mb-2">{type === 'parse' ? '文档解析失败' : '审查失败'}</h3>
      <p className="text-[0.875rem] text-gray-500 mb-5">
        {type === 'parse' ? '文档格式可能不受支持或文件已损坏，请重新上传。' : 'AI 审查过程中发生错误，可尝试重试。'}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => navigate('/')} className="px-4 py-2 text-[0.875rem] border border-border rounded-lg hover:bg-gray-50">
          {type === 'parse' ? '重新上传' : '取消'}
        </button>
        <button onClick={() => toast.info(`将调用: POST ${API_ENDPOINTS.cancelTask.path}`)} className="px-4 py-2 text-[0.875rem] bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          {type === 'parse' ? '返回首页' : '重试'}
        </button>
      </div>
    </div>
  );
}

// ===== ReviewSummaryCard =====
function ReviewSummaryCard({ risks, remainingPending, onGenerateReport }: { risks: RiskItem[]; remainingPending: number; onGenerateReport: () => void }) {
  const high = risks.filter(r => r.level === 'high').length;
  const medium = risks.filter(r => r.level === 'medium').length;
  const low = risks.filter(r => r.level === 'low').length;
  const score = Math.min(100, high * 10 + medium * 5 + low * 2);

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h3 className="mb-4">审查结果总览</h3>
      <div className="flex items-start gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border-4 border-amber-400 flex items-center justify-center">
            <div className="text-center">
              <span className="text-[1.25rem]" style={{ fontWeight: 600 }}>{score}</span>
              <span className="text-[0.625rem] text-gray-400 block">/100</span>
            </div>
          </div>
          <span className="text-[0.875rem] text-amber-600">中等风险</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8125rem]" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {high} 高风险
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8125rem]" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> {medium} 中风险
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8125rem]" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {low} 低风险
          </span>
        </div>
        <div className="flex-1" />
        <div className="text-right flex flex-col gap-2 items-end">
          <span className="text-[0.8125rem] text-gray-500">待处理高风险项: {risks.filter(r => r.level === 'high' && r.human_review_status === 'pending').length}</span>
          <button
            onClick={onGenerateReport}
            disabled={remainingPending > 0}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-[0.875rem] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            生成审查报告
          </button>
          {remainingPending > 0 && <span className="text-[0.75rem] text-gray-400">需处理全部高风险项后激活</span>}
        </div>
      </div>
    </div>
  );
}

// ===== FilterBar =====
function FilterBar({ levelFilter, setLevelFilter, statusFilter, setStatusFilter, sortBy, setSortBy, total, onBatchApprove, onBatchReject, selectedCount }: {
  levelFilter: string; setLevelFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  sortBy: string; setSortBy: (v: string) => void;
  total: number; onBatchApprove: () => void; onBatchReject: () => void; selectedCount: number;
}) {
  const FilterBtn = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button onClick={onClick} className={`px-3 py-1 rounded-full text-[0.8125rem] transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </button>
  );

  return (
    <div className="bg-white border border-border rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-[0.8125rem] text-gray-500 mr-1">风险等级:</span>
      {[['all', '全部'], ['high', '高'], ['medium', '中'], ['low', '低']].map(([v, l]) => (
        <FilterBtn key={v} active={levelFilter === v} label={l} onClick={() => setLevelFilter(v)} />
      ))}
      <span className="w-px h-5 bg-gray-200 mx-2" />
      <span className="text-[0.8125rem] text-gray-500 mr-1">审核状态:</span>
      {[['all', '全部'], ['pending', '待处理'], ['processed', '已处理']].map(([v, l]) => (
        <FilterBtn key={v} active={statusFilter === v} label={l} onClick={() => setStatusFilter(v)} />
      ))}
      <span className="w-px h-5 bg-gray-200 mx-2" />
      <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-[0.8125rem] border border-border rounded-lg px-2 py-1 bg-white">
        <option value="confidence_desc">置信度 降序</option>
        <option value="confidence_asc">置信度 升序</option>
      </select>
      <span className="text-[0.8125rem] text-gray-400 ml-auto">共 {total} 项</span>
      {selectedCount > 0 && (
        <>
          <button onClick={onBatchApprove} className="text-[0.8125rem] text-green-600 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-50">批量确认</button>
          <button onClick={onBatchReject} className="text-[0.8125rem] text-red-600 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-50">批量驳回</button>
        </>
      )}
    </div>
  );
}

// ===== RiskItemCard =====
function RiskItemCard({ item, selected, onSelect, onAction }: {
  item: RiskItem;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onAction: (action: 'approve' | 'edit' | 'reject', item: RiskItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectReason | ''>('');
  const [rejectComment, setRejectComment] = useState('');
  const [legalExpanded, setLegalExpanded] = useState(false);

  const isPending = item.human_review_status === 'pending';
  const isProcessed = !isPending;
  const sc = REVIEW_STATUS_CONFIG[item.human_review_status];
  const levelColors: Record<RiskLevel, { border: string; bg: string; color: string; label: string }> = {
    high: { border: '#DC2626', bg: '#FEF2F2', color: '#DC2626', label: '高' },
    medium: { border: '#D97706', bg: '#FFFBEB', color: '#D97706', label: '中' },
    low: { border: '#2563EB', bg: '#EFF6FF', color: '#2563EB', label: '低' },
  };
  const lc = levelColors[item.level];

  const handleRejectSubmit = () => {
    if (!rejectReason) { toast.error('请选择驳回原因'); return; }
    console.log(`[API] PUT ${API_ENDPOINTS.submitReview.path.replace('{task_id}', item.task_id).replace('{risk_id}', item.id)}`, { action: 'rejected', reason: rejectReason, comment: rejectComment });
    onAction('reject', item);
    setShowReject(false);
    setRejectReason('');
    setRejectComment('');
  };

  return (
    <div
      className={`border rounded-xl transition-all ${isProcessed ? 'opacity-60' : ''}`}
      style={{ borderColor: expanded ? lc.border : '#E5E7EB', borderLeftWidth: selected ? '3px' : '1px', borderLeftColor: selected ? '#2563EB' : undefined }}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {isPending && (
          <input type="checkbox" checked={selected} onChange={e => { e.stopPropagation(); onSelect(e.target.checked); }} onClick={e => e.stopPropagation()} className="accent-blue-600 w-4 h-4" />
        )}
        <span className="text-[0.75rem] px-2 py-0.5 rounded" style={{ backgroundColor: lc.bg, color: lc.color, fontWeight: 500 }}>{lc.label}</span>
        <span className="text-[0.875rem] flex-1 truncate">{item.title}</span>
        <span className="text-[0.75rem] text-gray-400">{item.clause_location} · 第{item.page}页</span>
        <span className="text-[0.75rem] text-gray-400 ml-2">置信度</span>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.confidence}%` }} />
        </div>
        <span className="text-[0.75rem] text-gray-500 w-8">{item.confidence}%</span>
        <span className="text-[0.75rem] px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            {/* ClauseLocator */}
            <div className="p-4">
              <h4 className="text-[0.8125rem] text-gray-500 mb-2">原文定位</h4>
              <p className="text-[0.75rem] text-gray-400 mb-2">{item.clause_location} · 第{item.page}页</p>
              {item.clause_text ? (
                <div className="rounded-lg p-3 text-[0.875rem]" style={{ backgroundColor: '#FEF9C3' }}>
                  {item.clause_text}
                </div>
              ) : (
                <p className="text-[0.8125rem] text-gray-400 italic">（原文缺失）</p>
              )}
              <p className="text-[0.75rem] text-gray-400 mt-2">
                位置: 第{item.page}页 | 偏移: {item.offset_start}-{item.offset_end}
              </p>
            </div>

            {/* ReviewOpinionPanel */}
            <div className="p-4">
              <h4 className="text-[0.8125rem] text-gray-500 mb-2">审查意见</h4>
              <div className="flex flex-col gap-3 text-[0.875rem]">
                <div>
                  <p className="text-[0.75rem] text-gray-400 mb-0.5">风险描述</p>
                  <p>{item.description}</p>
                </div>
                <hr className="border-gray-200" />
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[0.75rem] text-gray-400 mb-0.5">法律依据</p>
                    <button onClick={() => setLegalExpanded(!legalExpanded)} className="text-[0.75rem] text-blue-500">{legalExpanded ? '收起' : '展开'}</button>
                  </div>
                  <p className={legalExpanded ? '' : 'line-clamp-2'}>{item.legal_basis}</p>
                </div>
                <hr className="border-gray-200" />
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[0.75rem] text-gray-400 mb-0.5">修改建议</p>
                    <button onClick={() => { navigator.clipboard.writeText(item.suggestion); toast.success('已复制'); }} className="text-[0.75rem] text-blue-500 flex items-center gap-0.5"><Copy className="w-3 h-3" /> 复制</button>
                  </div>
                  <p>{item.suggestion}</p>
                </div>
                <hr className="border-gray-200" />
                <div>
                  <p className="text-[0.75rem] text-gray-400 mb-0.5">AI 置信度</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.confidence}%` }} />
                    </div>
                    <span>{item.confidence}%（{item.confidence >= 80 ? '高' : item.confidence >= 60 ? '中' : '低'}）</span>
                  </div>
                </div>
                <p className="text-[0.75rem] text-gray-400">分类: {CATEGORY_LABELS[item.category] || item.category}</p>
              </div>
            </div>
          </div>

          {/* ReviewActionBar */}
          {isPending && !showReject && (
            <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => {
                  console.log(`[API] PUT ${API_ENDPOINTS.submitReview.path.replace('{task_id}', item.task_id).replace('{risk_id}', item.id)}`, { action: 'approved' });
                  if (item.confidence >= 70) {
                    onAction('approve', item);
                  } else {
                    if (confirm(`置信度较低(${item.confidence}%)，确定要确认此风险项吗？`)) {
                      onAction('approve', item);
                    }
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[0.875rem] bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200"
              >
                <CheckCircle2 className="w-4 h-4" /> 同意
              </button>
              <button onClick={() => onAction('edit', item)} className="flex items-center gap-1.5 px-4 py-1.5 text-[0.875rem] bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200">
                修改
              </button>
              <button onClick={() => setShowReject(true)} className="flex items-center gap-1.5 px-4 py-1.5 text-[0.875rem] bg-red-50 text-red-700 rounded-lg hover:bg-red-100 border border-red-200">
                <XCircle className="w-4 h-4" /> 驳回
              </button>
            </div>
          )}

          {/* Inline Reject Panel */}
          {showReject && (
            <div className="border-t border-gray-200 px-4 py-4 bg-gray-50">
              <p className="text-[0.875rem] mb-3" style={{ fontWeight: 500 }}>驳回原因（必选）</p>
              <div className="flex flex-col gap-2 mb-3">
                {REJECT_REASONS.map(r => (
                  <label key={r.value} className="flex items-center gap-2 text-[0.875rem] cursor-pointer">
                    <input type="radio" name={`reject-${item.id}`} value={r.value} checked={rejectReason === r.value} onChange={() => setRejectReason(r.value)} className="accent-red-600" />
                    {r.label}
                  </label>
                ))}
              </div>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="补充说明（选填，最多200字）"
                maxLength={200}
                className="w-full border border-border rounded-lg p-2 text-[0.875rem] h-20 resize-none mb-3"
              />
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => { setShowReject(false); setRejectReason(''); setRejectComment(''); }} className="px-4 py-1.5 text-[0.875rem] border border-border rounded-lg hover:bg-gray-100">取消</button>
                <button onClick={handleRejectSubmit} className="px-4 py-1.5 text-[0.875rem] bg-red-600 text-white rounded-lg hover:bg-red-700">确认驳回</button>
              </div>
            </div>
          )}

          {/* Processed info */}
          {isProcessed && item.reviewer && (
            <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 flex items-center gap-3 text-[0.75rem] text-gray-400">
              <span>操作人: {item.reviewer}</span>
              <span>时间: {item.reviewed_at ? new Date(item.reviewed_at).toLocaleString('zh-CN') : '-'}</span>
              {item.reject_reason && <span>原因: {REJECT_REASONS.find(r => r.value === item.reject_reason)?.label}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== GroupHeader =====
function GroupHeader({ level, count, expanded, onClick }: { level: RiskLevel; count: number; expanded: boolean; onClick: () => void }) {
  const cfg: Record<RiskLevel, { label: string; color: string; bg: string }> = {
    high: { label: '高风险', color: '#DC2626', bg: '#FEF2F2' },
    medium: { label: '中风险', color: '#D97706', bg: '#FFFBEB' },
    low: { label: '低风险', color: '#2563EB', bg: '#EFF6FF' },
  };
  const c = cfg[level];
  return (
    <button onClick={onClick} className="flex items-center gap-2 py-2 w-full text-left">
      {expanded ? <ChevronDown className="w-4 h-4" style={{ color: c.color }} /> : <ChevronRight className="w-4 h-4" style={{ color: c.color }} />}
      <span className="text-[0.875rem] px-2 py-0.5 rounded" style={{ backgroundColor: c.bg, color: c.color, fontWeight: 500 }}>{c.label} ({count}项)</span>
    </button>
  );
}

// ===== PendingReviewPanel =====
function PendingReviewPanel({ taskId }: { taskId: string }) {
  const [risks, setRisks] = useState<RiskItem[]>(MOCK_RISK_ITEMS.filter(r => r.task_id === taskId));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('confidence_desc');
  const [expandedGroups, setExpandedGroups] = useState<Record<RiskLevel, boolean>>({ high: true, medium: false, low: false });
  const [editingItem, setEditingItem] = useState<RiskItem | null>(null);
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState<RejectReason | ''>('');

  const filtered = useMemo(() => {
    let list = [...risks];
    if (levelFilter !== 'all') list = list.filter(r => r.level === levelFilter);
    if (statusFilter === 'pending') list = list.filter(r => r.human_review_status === 'pending');
    if (statusFilter === 'processed') list = list.filter(r => r.human_review_status !== 'pending');
    list.sort((a, b) => sortBy === 'confidence_desc' ? b.confidence - a.confidence : a.confidence - b.confidence);
    return list;
  }, [risks, levelFilter, statusFilter, sortBy]);

  const grouped = useMemo(() => {
    const g: Record<RiskLevel, RiskItem[]> = { high: [], medium: [], low: [] };
    filtered.forEach(r => g[r.level].push(r));
    return g;
  }, [filtered]);

  const remainingPending = risks.filter(r => r.level === 'high' && r.human_review_status === 'pending').length;

  const handleAction = useCallback((action: 'approve' | 'edit' | 'reject', item: RiskItem) => {
    if (action === 'edit') { setEditingItem(item); return; }
    const newStatus: HumanReviewStatus = action === 'approve' ? 'approved' : 'rejected';
    setRisks(prev => prev.map(r => r.id === item.id ? { ...r, human_review_status: newStatus, reviewer: 'user-001', reviewed_at: new Date().toISOString() } : r));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    toast.success(action === 'approve' ? '已确认' : '已驳回', { style: { backgroundColor: action === 'approve' ? '#E8F5E9' : '#FFEBEE' } });
  }, []);

  const handleBatchApprove = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    console.log(`[API] POST ${API_ENDPOINTS.batchReview.path.replace('{task_id}', taskId)}`, { risk_ids: ids, action: 'approved' });
    setRisks(prev => prev.map(r => ids.includes(r.id) ? { ...r, human_review_status: 'approved', reviewer: 'user-001', reviewed_at: new Date().toISOString() } : r));
    setSelectedIds(new Set());
    toast.success(`已确认 ${ids.length} 项`, { style: { backgroundColor: '#E8F5E9' } });
  };

  const handleBatchReject = () => {
    if (!batchRejectReason) { toast.error('请选择驳回原因'); return; }
    const ids = Array.from(selectedIds);
    console.log(`[API] POST ${API_ENDPOINTS.batchReview.path.replace('{task_id}', taskId)}`, { risk_ids: ids, action: 'rejected', reason: batchRejectReason });
    setRisks(prev => prev.map(r => ids.includes(r.id) ? { ...r, human_review_status: 'rejected', reject_reason: batchRejectReason as RejectReason, reviewer: 'user-001', reviewed_at: new Date().toISOString() } : r));
    setSelectedIds(new Set());
    setShowBatchReject(false);
    setBatchRejectReason('');
    toast.success(`已驳回 ${ids.length} 项`, { style: { backgroundColor: '#FFEBEE' } });
  };

  const handleEditSave = (updated: Partial<RiskItem>) => {
    if (!editingItem) return;
    console.log(`[API] PUT ${API_ENDPOINTS.submitReview.path.replace('{task_id}', taskId).replace('{risk_id}', editingItem.id)}`, { action: 'modified', ...updated });
    setRisks(prev => prev.map(r => r.id === editingItem.id ? { ...r, ...updated, human_review_status: 'modified' as HumanReviewStatus, reviewer: 'user-001', reviewed_at: new Date().toISOString() } : r));
    setEditingItem(null);
    toast.success('已修正', { style: { backgroundColor: '#FFF3E0' }, duration: 3000 });
  };

  const handleGenerateReport = () => {
    console.log(`[API] POST ${API_ENDPOINTS.generateReport.path.replace('{task_id}', taskId)}`);
    toast.success('报告生成请求已提交');
  };

  return (
    <>
      {/* Session header */}
      <div className="bg-white border border-border rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap text-[0.8125rem]">
        <span style={{ fontWeight: 500 }}>审核会话 #1（第1轮）</span>
        <span className="text-gray-500">剩余: {risks.filter(r => r.level === 'high' && r.human_review_status === 'pending').length} 高 | {risks.filter(r => r.level === 'medium' && r.human_review_status === 'pending').length} 中 | {risks.filter(r => r.level === 'low' && r.human_review_status === 'pending').length} 低</span>
        <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-[0.75rem]">审核中</span>
        <span className="text-gray-400 ml-auto">超时: 23:45:12</span>
        <div className="w-full mt-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${((risks.length - risks.filter(r => r.human_review_status === 'pending').length) / risks.length) * 100}%` }} />
          </div>
          <span className="text-[0.75rem] text-gray-400">{risks.length - risks.filter(r => r.human_review_status === 'pending').length}/{risks.length} 已完成</span>
        </div>
      </div>

      <ReviewSummaryCard risks={risks} remainingPending={remainingPending} onGenerateReport={handleGenerateReport} />

      <FilterBar
        levelFilter={levelFilter} setLevelFilter={setLevelFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        total={filtered.length}
        onBatchApprove={handleBatchApprove}
        onBatchReject={() => setShowBatchReject(true)}
        selectedCount={selectedIds.size}
      />

      {/* Risk item groups */}
      <div className="flex flex-col gap-2">
        {(['high', 'medium', 'low'] as RiskLevel[]).map(level => {
          const items = grouped[level];
          if (!items.length) return null;
          return (
            <div key={level}>
              <GroupHeader level={level} count={items.length} expanded={expandedGroups[level]} onClick={() => setExpandedGroups(p => ({ ...p, [level]: !p[level] }))} />
              {expandedGroups[level] && (
                <div className="flex flex-col gap-2 ml-2">
                  {items.map(item => (
                    <RiskItemCard
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onSelect={checked => setSelectedIds(prev => { const s = new Set(prev); checked ? s.add(item.id) : s.delete(item.id); return s; })}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Remaining counter */}
      <div className="flex items-center justify-between text-[0.875rem] text-gray-500 bg-white border border-border rounded-xl px-5 py-3">
        <span>剩余待处理: {risks.filter(r => r.human_review_status === 'pending').length} 项</span>
      </div>

      {/* Batch floating toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg px-6 py-3 flex items-center gap-4 z-50">
          <label className="flex items-center gap-2 text-[0.875rem] cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === risks.filter(r => r.human_review_status === 'pending').length}
              onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(risks.filter(r => r.human_review_status === 'pending').map(r => r.id)));
                else setSelectedIds(new Set());
              }}
              className="accent-blue-600 w-4 h-4"
            />
            全选
          </label>
          <span className="text-[0.875rem] text-gray-500">已选择 {selectedIds.size} 项</span>
          <div className="flex-1" />
          <button onClick={handleBatchApprove} className="px-4 py-2 text-[0.875rem] bg-green-600 text-white rounded-lg hover:bg-green-700">批量确认</button>
          <button onClick={() => setShowBatchReject(true)} className="px-4 py-2 text-[0.875rem] bg-red-600 text-white rounded-lg hover:bg-red-700">批量驳回</button>
        </div>
      )}

      {/* Batch reject dialog */}
      {showBatchReject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowBatchReject(false)}>
          <div className="bg-white rounded-xl w-[420px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4">批量驳回 ({selectedIds.size} 项)</h3>
            <p className="text-[0.875rem] mb-3" style={{ fontWeight: 500 }}>驳回原因（必选）</p>
            {REJECT_REASONS.map(r => (
              <label key={r.value} className="flex items-center gap-2 text-[0.875rem] cursor-pointer mb-2">
                <input type="radio" name="batch-reject" value={r.value} checked={batchRejectReason === r.value} onChange={() => setBatchRejectReason(r.value)} className="accent-red-600" />
                {r.label}
              </label>
            ))}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowBatchReject(false)} className="px-4 py-2 text-[0.875rem] border border-border rounded-lg">取消</button>
              <button onClick={handleBatchReject} className="px-4 py-2 text-[0.875rem] bg-red-600 text-white rounded-lg hover:bg-red-700">确认驳回</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit drawer */}
      {editingItem && <EditDrawer item={editingItem} onClose={() => setEditingItem(null)} onSave={handleEditSave} />}
    </>
  );
}

// ===== ReportReadyPanel =====
function ReportReadyPanel({ task }: { task: Task }) {
  return (
    <div className="bg-white border border-green-200 rounded-xl p-8 text-center">
      <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
      <h3 className="text-green-700 mb-2">审查完成</h3>
      <p className="text-[0.875rem] text-gray-500 mb-6">
        共 {task.risk_count || 25} 项风险，经人工审核已处理全部高风险项
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => {
            console.log(`[API] GET ${API_ENDPOINTS.downloadReport.path.replace('{task_id}', task.id)}`);
            toast.info('查看报告 — 将跳转至报告预览页（后续阶段设计）');
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-[0.875rem] bg-primary text-primary-foreground rounded-lg"
        >
          <Eye className="w-4 h-4" /> 查看报告
        </button>
        <button
          onClick={() => {
            console.log(`[API] GET ${API_ENDPOINTS.downloadReport.path.replace('{task_id}', task.id)}`);
            toast.info('下载 PDF 报告');
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-[0.875rem] border border-border rounded-lg hover:bg-gray-50"
        >
          <Download className="w-4 h-4" /> 下载 PDF 报告
        </button>
      </div>
    </div>
  );
}

// ===== Main ReviewPage =====
function statusColor(s: TaskStatus) {
  const map: Partial<Record<TaskStatus, { bg: string; color: string }>> = {
    report_ready: { bg: '#F0FDF4', color: '#16A34A' },
    reviewing: { bg: '#EFF6FF', color: '#2563EB' },
    parsing: { bg: '#EFF6FF', color: '#2563EB' },
    pending_review: { bg: '#FFFBEB', color: '#D97706' },
    human_reviewing: { bg: '#FFFBEB', color: '#D97706' },
    parse_failed: { bg: '#FEF2F2', color: '#DC2626' },
    review_failed: { bg: '#FEF2F2', color: '#DC2626' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280' },
  };
  return map[s] || { bg: '#F3F4F6', color: '#6B7280' };
}

export function ReviewPage() {
  const { task_id } = useParams<{ task_id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 模拟 GET /api/v1/tasks/{task_id}
    console.log(`[API] GET ${API_ENDPOINTS.taskDetail.path.replace('{task_id}', task_id || '')}`);
    setTimeout(() => {
      const found = MOCK_TASKS.find(t => t.id === task_id);
      if (!found) { toast.error('任务不存在'); navigate('/'); return; }
      setTask(found);
      setLoading(false);
    }, 400);
  }, [task_id]);

  const handleCancel = () => {
    if (!task) return;
    console.log(`[API] POST ${API_ENDPOINTS.cancelTask.path.replace('{task_id}', task.id)}`);
    setTask({ ...task, status: 'cancelled' });
    toast.info('已取消审查');
  };

  if (loading || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="flex items-center gap-2 text-gray-500">
          <Clock className="w-5 h-5 animate-spin" /> 加载中...
        </div>
      </div>
    );
  }

  const renderPanel = () => {
    switch (task.status) {
      case 'uploaded':
        return <div className="bg-white border border-border rounded-xl p-6 text-center text-gray-500">文件已上传，等待后端开始解析...</div>;
      case 'parsing':
      case 'parse_complete':
        return <ProgressPanel task={task} isParsing />;
      case 'reviewing':
        return <ProgressPanel task={task} />;
      case 'parse_failed':
        return <FailedPanel task={task} type="parse" />;
      case 'review_failed':
        return <FailedPanel task={task} type="review" />;
      case 'pending_review':
      case 'human_reviewing':
        return <PendingReviewPanel taskId={task.id} />;
      case 'report_ready':
        return <ReportReadyPanel task={task} />;
      case 'cancelled':
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-gray-600 mb-2">审查已取消</h3>
            <button onClick={() => navigate('/')} className="mt-3 px-4 py-2 text-[0.875rem] bg-primary text-primary-foreground rounded-lg">重新上传</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <Header showBack fileName={task.file_name} onAuditLog={() => setShowLog(true)} />
      <main className="flex-1 max-w-[960px] w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <FileInfo task={task} onCancel={handleCancel} />
        {renderPanel()}
      </main>
      {showLog && <AuditLogDrawer taskId={task.id} onClose={() => setShowLog(false)} />}
    </div>
  );
}