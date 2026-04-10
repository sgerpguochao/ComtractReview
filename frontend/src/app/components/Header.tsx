import { FileText, ArrowLeft, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router';

interface HeaderProps {
  showBack?: boolean;
  fileName?: string;
  onAuditLog?: () => void;
}

export function Header({ showBack, fileName, onAuditLog }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b border-border flex items-center px-6 gap-3 shrink-0 bg-white">
      {showBack && (
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-2">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[0.875rem]">返回</span>
        </button>
      )}
      <FileText className="w-5 h-5 text-primary" />
      <span className="text-[1rem]" style={{ fontWeight: 500 }}>ContractReview</span>
      {fileName && (
        <>
          <span className="text-muted-foreground mx-1">|</span>
          <span className="text-[0.875rem] text-muted-foreground truncate max-w-[300px]">{fileName}</span>
        </>
      )}
      <div className="flex-1" />
      {onAuditLog && (
        <button onClick={onAuditLog} className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground hover:text-foreground transition-colors">
          <ScrollText className="w-4 h-4" />
          操作日志
        </button>
      )}
    </header>
  );
}
