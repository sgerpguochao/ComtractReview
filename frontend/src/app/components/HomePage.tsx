import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Upload, FileUp, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from './Header';
import {
  MOCK_TASKS,
  STATUS_LABELS,
  API_ENDPOINTS,
  type Task,
  type TaskStatus,
} from '../api';

const STATUS_COLORS: Partial<Record<TaskStatus, { bg: string; color: string }>> = {
  report_ready:    { bg: '#F0FDF4', color: '#16A34A' },
  reviewing:       { bg: '#EFF6FF', color: '#2563EB' },
  parsing:         { bg: '#EFF6FF', color: '#2563EB' },
  pending_review:  { bg: '#FFFBEB', color: '#D97706' },
  human_reviewing: { bg: '#FFFBEB', color: '#D97706' },
  parse_failed:    { bg: '#FEF2F2', color: '#DC2626' },
  review_failed:   { bg: '#FEF2F2', color: '#DC2626' },
  cancelled:       { bg: '#F3F4F6', color: '#6B7280' },
};

export function HomePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dimensions, setDimensions] = useState<string[]>(['risk_review']);
  const [tasks] = useState<Task[]>(MOCK_TASKS);
  const [visibleCount, setVisibleCount] = useState(5);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['docx', 'pdf'].includes(ext)) return '仅支持 .docx / .pdf 格式';
    if (file.size > 50 * 1024 * 1024) return '文件大小不能超过 50MB';
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) { toast.error(error); return; }
    setSelectedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);
    // 模拟上传 — 实际调用 POST /api/v1/tasks/upload (已定义)
    console.log(`[API] ${API_ENDPOINTS.upload.method} ${API_ENDPOINTS.upload.path}`, { file: selectedFile.name, dimensions });
    const interval = setInterval(() => {
      setUploadProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 10;
      });
    }, 200);
    setTimeout(() => {
      clearInterval(interval);
      setUploadProgress(100);
      setUploading(false);
      setSelectedFile(null);
      toast.success('上传成功，正在跳转...');
      // 模拟返回 task_id
      navigate('/review/task-004');
    }, 2200);
  };

  const toggleDimension = (dim: string) => {
    setDimensions(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <Header />
      <main className="flex-1 max-w-[800px] w-full mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Upload Zone */}
        <section className="bg-white rounded-xl border border-border p-6">
          <h2 className="mb-4">上传合同文件</h2>
          <div
            className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-10 h-10 text-gray-400" />
            <p className="text-[0.9375rem] text-gray-600">拖拽文件到此处，或 <span className="text-blue-600 underline">点击上传</span></p>
            <p className="text-[0.8125rem] text-gray-400">支持 .docx / .pdf，最大 50MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
            />
          </div>

          {selectedFile && (
            <div className="mt-3 flex items-center gap-2 text-[0.875rem] text-gray-700 bg-gray-50 rounded-lg px-4 py-2">
              <FileUp className="w-4 h-4 text-blue-500" />
              <span className="truncate flex-1">{selectedFile.name}</span>
              <span className="text-gray-400">{formatSize(selectedFile.size)}</span>
              <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
            </div>
          )}

          {uploading && (
            <div className="mt-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-[0.8125rem] text-gray-500 mt-1">上传中... {uploadProgress}%</p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[0.875rem] cursor-pointer">
                <input type="checkbox" checked={dimensions.includes('risk_review')} onChange={() => toggleDimension('risk_review')} className="accent-blue-600 w-4 h-4" />
                风险审查
              </label>
              <label className="flex items-center gap-2 text-[0.875rem] cursor-pointer">
                <input type="checkbox" checked={dimensions.includes('compliance')} onChange={() => toggleDimension('compliance')} className="accent-blue-600 w-4 h-4" />
                合规检查
              </label>
            </div>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading || dimensions.length === 0}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-[0.875rem] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              开始审查
            </button>
          </div>
        </section>

        {/* Recent Tasks */}
        <section className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2>最近审查记录</h2>
            <span className="text-[0.8125rem] text-muted-foreground">
              API: GET {API_ENDPOINTS.taskList.path} ({API_ENDPOINTS.taskList.status})
            </span>
          </div>

          <div className="divide-y divide-border">
            {tasks.slice(0, visibleCount).map(task => {
              const sc = STATUS_COLORS[task.status] || { bg: '#F3F4F6', color: '#6B7280' };
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 py-3.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                  onClick={() => navigate(`/review/${task.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.9375rem] truncate">{task.file_name}</p>
                  </div>
                  <span
                    className="text-[0.75rem] px-2.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: sc.bg, color: sc.color }}
                  >
                    {STATUS_LABELS[task.status]}
                  </span>
                  {task.status === 'reviewing' || task.status === 'parsing' ? (
                    <div className="w-20 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-[0.75rem] text-gray-500">{task.progress}%</span>
                    </div>
                  ) : task.risk_count ? (
                    <span className="text-[0.8125rem] text-gray-500 w-20 text-right">{task.risk_count}项风险</span>
                  ) : task.status === 'parse_failed' || task.status === 'review_failed' ? (
                    <button className="text-[0.8125rem] text-blue-600 flex items-center gap-1" onClick={e => { e.stopPropagation(); toast.info('重试功能将调用后端接口'); }}>
                      <RefreshCw className="w-3.5 h-3.5" /> 重试
                    </button>
                  ) : null}
                  <span className="text-[0.8125rem] text-gray-400 w-14 text-right">{formatDate(task.created_at)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              );
            })}
          </div>

          {visibleCount < tasks.length && (
            <button
              onClick={() => setVisibleCount(c => c + 5)}
              className="mt-4 w-full text-center text-[0.875rem] text-blue-600 hover:text-blue-700 py-2"
            >
              加载更多
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
