import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { type RiskItem, type RiskLevel } from '../api';

interface EditDrawerProps {
  item: RiskItem;
  onClose: () => void;
  onSave: (updated: Partial<RiskItem>) => void;
}

export function EditDrawer({ item, onClose, onSave }: EditDrawerProps) {
  const [level, setLevel] = useState<RiskLevel>(item.level);
  const [description, setDescription] = useState(item.description);
  const [suggestion, setSuggestion] = useState(item.suggestion);
  const [legalBasis, setLegalBasis] = useState(item.legal_basis);

  const hasChanges = level !== item.level || description !== item.description || suggestion !== item.suggestion || legalBasis !== item.legal_basis;

  const handleSave = () => {
    if (!hasChanges) { toast.error('至少修改一个字段'); return; }
    onSave({ level, description, suggestion, legal_basis: legalBasis });
  };

  const levelOptions: { value: RiskLevel; label: string; color: string }[] = [
    { value: 'high', label: '高风险 HIGH', color: '#DC2626' },
    { value: 'medium', label: '中风险 MEDIUM', color: '#D97706' },
    { value: 'low', label: '低风险 LOW', color: '#2563EB' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-[480px] h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3>修正风险 #{item.id.split('-').pop()}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {/* Level adjustment */}
          <div>
            <label className="text-[0.875rem] text-gray-600 mb-2 block">风险等级调整</label>
            <div className="flex flex-col gap-2">
              {levelOptions.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-[0.875rem]">
                  <input type="radio" name="level" value={opt.value} checked={level === opt.value} onChange={() => setLevel(opt.value)} className="accent-blue-600" />
                  <span>{opt.value === item.level ? '保持原等级' : opt.value === 'medium' ? '降为中风险' : opt.value === 'low' ? '降为低风险' : '升为高风险'}</span>
                  <span className="text-[0.75rem] px-1.5 py-0.5 rounded" style={{ color: opt.color, backgroundColor: opt.color + '15' }}>[{opt.label}]</span>
                </label>
              ))}
            </div>
          </div>

          {/* Editable fields */}
          <div>
            <label className="text-[0.875rem] text-gray-600 mb-1 block">审查意见（最多500字）</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} className="w-full border border-border rounded-lg p-3 text-[0.875rem] h-24 resize-none" />
          </div>
          <div>
            <label className="text-[0.875rem] text-gray-600 mb-1 block">修改建议（最多500字）</label>
            <textarea value={suggestion} onChange={e => setSuggestion(e.target.value)} maxLength={500} className="w-full border border-border rounded-lg p-3 text-[0.875rem] h-24 resize-none" />
          </div>
          <div>
            <label className="text-[0.875rem] text-gray-600 mb-1 block">法律依据（最多500字）</label>
            <textarea value={legalBasis} onChange={e => setLegalBasis(e.target.value)} maxLength={500} className="w-full border border-border rounded-lg p-3 text-[0.875rem] h-24 resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[0.875rem] border border-border rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={!hasChanges} className="px-5 py-2 text-[0.875rem] bg-primary text-primary-foreground rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">保存修改</button>
        </div>
      </div>
    </div>
  );
}
