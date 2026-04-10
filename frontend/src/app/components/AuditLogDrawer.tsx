import { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, XCircle, Pencil, Save, Zap, Play } from 'lucide-react';
import { fetchAuditLog, API_ENDPOINTS, type AuditLogEntry } from '../api';

const ICONS: Record<string, React.ReactNode> = {
  doc: <FileText className="w-4 h-4 text-blue-500" />,
  check: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  cross: <XCircle className="w-4 h-4 text-red-500" />,
  pencil: <Pencil className="w-4 h-4 text-amber-500" />,
  save: <Save className="w-4 h-4 text-blue-500" />,
  bolt: <Zap className="w-4 h-4 text-purple-500" />,
  start: <Play className="w-4 h-4 text-green-500" />,
};

export function AuditLogDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog(taskId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  const grouped: Record<string, AuditLogEntry[]> = {};
  logs.forEach(entry => {
    const date = new Date(entry.timestamp).toLocaleDateString('zh-CN');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-[400px] h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3>操作日志</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-center text-[0.875rem] text-gray-400 py-8">加载中...</p>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="text-center text-[0.875rem] text-gray-400 py-8">暂无操作记录</p>
          ) : Object.entries(grouped).map(([date, entries]) => (
            <div key={date} className="mb-6">
              <p className="text-[0.8125rem] text-gray-400 mb-3" style={{ fontWeight: 500 }}>{date}</p>
              <div className="flex flex-col gap-0">
                {entries.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3 relative">
                    {i < entries.length - 1 && <div className="absolute left-[11px] top-7 w-px h-[calc(100%-4px)] bg-gray-200" />}
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 z-10">
                      {ICONS[entry.icon]}
                    </div>
                    <div className="pb-4">
                      <span className="text-[0.75rem] text-gray-400">{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                      <p className="text-[0.875rem] text-gray-700">{entry.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2 border-t border-border text-[0.75rem] text-gray-400">
          API: GET {API_ENDPOINTS.auditLog.path} ({API_ENDPOINTS.auditLog.status})
        </div>
      </div>
    </div>
  );
}
