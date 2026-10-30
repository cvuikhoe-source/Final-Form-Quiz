import type { ExamStatus } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';

const STATUS_META: Record<ExamStatus, { label: TranslationKey; bg: string; text: string; dot: string }> = {
  open:     { label: 'status.open',     bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  upcoming: { label: 'status.upcoming', bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500' },
  closed:   { label: 'status.closed',   bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400' },
};

export function StatusBadge({ status }: { status: ExamStatus }) {
  const { t } = useLanguage();
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === 'open' ? 'animate-pulse' : ''}`} />
      {t(meta.label)}
    </span>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export function ClassBadge({ classes, maxShow = 3 }: { classes: string[]; maxShow?: number }) {
  if (!classes || classes.length === 0) return null;
  const shown = classes.slice(0, maxShow);
  const remaining = classes.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((cls) => (
        <span
          key={cls}
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            cls === 'Tất cả' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
          }`}
        >
          {cls}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          +{remaining}
        </span>
      )}
    </div>
  );
}
