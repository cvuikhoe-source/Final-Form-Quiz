import { useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Exam, User, CompletionRecord, ExamResult } from '@/types';
import { getSubjectMeta, isExamCompletedByUser, importResults } from '@/storage';
import { toast } from './Toast';
import { formatDateTime } from './shared';
import { Users, ClipboardList, CheckCircle2, TrendingUp, BookOpen, Inbox, FileSpreadsheet, Award, BarChart3, Upload, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';

interface StatsViewProps {
  exams: Exam[];
  users: User[];
  completions: CompletionRecord[];
  results: ExamResult[];
  onResultsChanged: () => void;
}

export function StatsView({ exams, users, completions, results, onResultsChanged }: StatsViewProps) {
  const { t } = useLanguage();
  const [showImport, setShowImport] = useState(false);
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const totalCompletions = completions.length;
  const completionRate = exams.length > 0 ? Math.round((totalCompletions / (exams.length * Math.max(students.length, 1))) * 100) : 0;

  const examStats = useMemo(() => {
    return exams.map((exam) => {
      const completedCount = students.filter((s) => isExamCompletedByUser(exam.id, s.id, completions)).length;
      return { exam, completedCount };
    });
  }, [exams, students, completions]);

  // Score distribution
  const scoreDistribution = useMemo(() => {
    const graded = results.filter((r) => r.status === 'graded');
    const gioi = graded.filter((r) => r.score >= 8).length;
    const kha = graded.filter((r) => r.score >= 6.5 && r.score < 8).length;
    const tb = graded.filter((r) => r.score >= 5 && r.score < 6.5).length;
    const duoi = graded.filter((r) => r.score < 5).length;
    const total = graded.length;
    return { gioi, kha, tb, duoi, total };
  }, [results]);

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <h2 className="mb-1 text-lg font-bold text-slate-800">{t('stats.title')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('stats.subtitle')}</p>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-md">
          <ClipboardList size={24} className="mb-2 text-blue-100" />
          <p className="text-2xl font-bold">{exams.length}</p>
          <p className="text-xs text-blue-100">{t('stats.totalExams')}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-md">
          <Users size={24} className="mb-2 text-emerald-100" />
          <p className="text-2xl font-bold">{students.length}</p>
          <p className="text-xs text-emerald-100">{t('stats.students')}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <CheckCircle2 size={24} className="mb-2 text-emerald-500" />
          <p className="text-2xl font-bold text-emerald-600">{totalCompletions}</p>
          <p className="text-xs text-slate-500">{t('stats.submitted')}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <TrendingUp size={24} className="mb-2 text-blue-500" />
          <p className="text-2xl font-bold text-blue-600">{completionRate}%</p>
          <p className="text-xs text-slate-500">{t('stats.completionRate')}</p>
        </div>
      </div>

      {/* Score import button */}
      <button onClick={() => setShowImport(true)}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100">
        <FileSpreadsheet size={18} /> {t('stats.importScores')}
      </button>

      {/* Score distribution chart */}
      {scoreDistribution.total > 0 && (
        <div className="mb-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <BarChart3 size={16} className="text-slate-400" /> {t('stats.scoreDist', { count: scoreDistribution.total })}
          </h3>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {[
              { key: 'stats.dist.gioi', count: scoreDistribution.gioi, color: 'bg-emerald-500', text: 'text-emerald-600' },
              { key: 'stats.dist.kha', count: scoreDistribution.kha, color: 'bg-blue-500', text: 'text-blue-600' },
              { key: 'stats.dist.tb', count: scoreDistribution.tb, color: 'bg-amber-500', text: 'text-amber-600' },
              { key: 'stats.dist.duoi', count: scoreDistribution.duoi, color: 'bg-red-500', text: 'text-red-600' },
            ].map((item) => {
              const label = t(item.key as TranslationKey);
              const pct = scoreDistribution.total > 0 ? Math.round((item.count / scoreDistribution.total) * 100) : 0;
              return (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600">{label}</span>
                    <span className={`font-bold ${item.text}`}>{item.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grade table */}
      {results.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Award size={16} className="text-slate-400" /> {t('stats.scoreTable')}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-3 py-2 font-semibold text-slate-600">{t('stats.col.name')}</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">{t('stats.col.class')}</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">{t('stats.col.exam')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('common.score')}</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">{t('stats.col.status')}</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">{t('stats.col.submittedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-700">{r.studentName}</td>
                    <td className="px-3 py-2 text-slate-500">{r.className || '-'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.examTitle || '-'}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.score >= 5 ? 'text-emerald-600' : 'text-red-500'}`}>{r.score}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.status === 'graded' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'graded' ? t('stats.graded') : t('stats.submittedLabel')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.submittedAt ? formatDateTime(r.submittedAt) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.length > 50 && <p className="mt-1.5 text-center text-xs text-slate-400">{t('stats.showingRows', { total: results.length })}</p>}
        </div>
      )}

      {/* Per-exam completion */}
      <div className="mb-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700"><BookOpen size={16} className="text-slate-400" /> {t('stats.submissionsByExam')}</h3>
        {examStats.length > 0 ? (
          <div className="space-y-2.5">
            {examStats.map(({ exam, completedCount }) => {
              const meta = getSubjectMeta(exam.subject);
              const pct = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 0;
              return (
                <div key={exam.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.text}`}>{exam.subject}</span>
                      <span className="truncate text-xs font-medium text-slate-700">{exam.title}</span>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-slate-500">{completedCount}/{students.length}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center"><Inbox size={36} className="mb-2 text-slate-300" /><p className="text-xs text-slate-400">{t('stats.empty')}</p></div>
        )}
      </div>

      {showImport && (
        <ScoreImportModal
 exams={exams}
          onClose={() => setShowImport(false)}
          onImport={async (items) => {
            await importResults(items);
            onResultsChanged();
            toast(t('stats.toast.imported', { count: items.length }), 'success');
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Score Import Modal ────────────────────────────────────────

function ScoreImportModal({ exams, onClose, onImport }: {
  exams: Exam[];
  onClose: () => void;
  onImport: (items: Omit<ExamResult, 'id' | 'createdAt'>[]) => void;
}) {
  const { t } = useLanguage();
  const [parsedRows, setParsedRows] = useState<Array<Record<string, unknown>>>([]);
  const [fileName, setFileName] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const data = [
      ['Họ tên học sinh', 'Mã học sinh', 'Lớp', 'Điểm số', 'Trạng thái', 'Thời gian nộp (YYYY-MM-DD HH:mm)'],
      ['Nguyễn Văn An', 'hs_10a1', '10A1', '8.5', 'graded', '2026-10-05 14:30'],
      ['Trần Thị Bình', 'hs_12b2', '12B2', '7.0', 'graded', '2026-10-05 14:35'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Điểm');
    XLSX.writeFile(wb, 'mau_nhap_diem.xlsx');
    toast(t('stats.toast.templateDownloaded'), 'success');
  };

  const parseFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        setParsedRows(json);
      } catch { toast(t('stats.toast.fileReadFailed'), 'error'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = () => {
    if (!selectedExamId) { toast(t('stats.toast.selectExam'), 'error'); return; }
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam) return;
    const items: Omit<ExamResult, 'id' | 'createdAt'>[] = parsedRows.map((row) => ({
      examId: selectedExamId,
      studentName: String(row['Họ tên học sinh'] ?? '').trim(),
      studentUsername: String(row['Mã học sinh'] ?? '').trim(),
      className: String(row['Lớp'] ?? '').trim(),
      examTitle: exam.title,
      score: Number(row['Điểm số'] ?? 0),
      status: (String(row['Trạng thái'] ?? 'graded').trim() === 'submitted' ? 'submitted' : 'graded') as 'submitted' | 'graded',
      submittedAt: String(row['Thời gian nộp (YYYY-MM-DD HH:mm)'] ?? '').trim() || null,
    })).filter((r) => r.studentName);
    if (items.length === 0) { toast(t('stats.toast.noValidData'), 'error'); return; }
    onImport(items);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><FileSpreadsheet size={22} className="text-emerald-600" /> {t('stats.importTitle')}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        {/* Select exam */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('stats.chooseExam')}</label>
          <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
            <option value="">{t('stats.chooseExamOption')}</option>
            {exams.map((e) => (<option key={e.id} value={e.id}>{e.title}</option>))}
          </select>
        </div>

        <button onClick={downloadTemplate} className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
          <Upload size={18} /> {t('stats.downloadTemplate')}
        </button>

        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition-all ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
          <Upload size={32} className={`mb-2 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-sm font-medium text-slate-600">{fileName || t('stats.filePlaceholder')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('stats.fileFormats')}</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
        </div>

        {parsedRows.length > 0 && (
          <>
            <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm">
              <span className="font-bold text-emerald-700">{parsedRows.length}</span> {t('stats.rowsReady', { count: parsedRows.length })}
            </div>
            <button onClick={handleImport}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700">
              <FileSpreadsheet size={18} /> {t('stats.importN', { count: parsedRows.length })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
