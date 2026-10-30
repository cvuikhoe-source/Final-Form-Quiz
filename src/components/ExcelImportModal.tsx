import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Exam, ExamStatus } from '@/types';
import { toast } from './Toast';
import { getSubjectMeta } from '@/storage';
import { X, FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, FileDown } from 'lucide-react';

interface ExcelImportModalProps {
  onClose: () => void;
  onImport: (exams: Omit<Exam, 'id' | 'createdAt'>[]) => void;
  targetFolderId?: string | null;
}

interface ParsedRow {
  rowNumber: number;
  title: string;
  subject: string;
  classes: string;
  formsUrl: string;
  duration: string;
  deadline: string;
  valid: boolean;
  error?: string;
}

export function ExcelImportModal({ onClose, onImport, targetFolderId = null }: ExcelImportModalProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const templateData = [
      ['Tên bài thi', 'Môn học', 'Lớp áp dụng (cách nhau dấu phẩy)', 'Link Microsoft Forms', 'Thời gian (phút)', 'Hạn nộp (YYYY-MM-DD HH:mm)'],
      ['Kiểm tra Toán 15 phút - Đạo hàm', 'Toán', '12A1, 12B2', 'https://forms.office.com/Pages/ResponsePage.aspx?id=xxx', '15', '2026-10-10 23:59'],
      ['Kiểm tra Anh Văn', 'Anh', 'Tất cả', 'https://forms.office.com/Pages/ResponsePage.aspx?id=yyy', '45', '2026-10-15 23:59'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 25 }, { wch: 50 }, { wch: 15 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bài thi');
    XLSX.writeFile(wb, 'mau_nhap_bai_thi.xlsx');
    toast('Đã tải file Excel mẫu', 'success');
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

        if (json.length === 0) {
          toast('File Excel không có dữ liệu', 'error');
          return;
        }

        const rows: ParsedRow[] = json.map((row, idx) => {
          const title = String(row['Tên bài thi'] ?? '').trim();
          const subject = String(row['Môn học'] ?? '').trim();
          const classes = String(row['Lớp áp dụng (cách nhau dấu phẩy)'] ?? '').trim();
          const formsUrl = String(row['Link Microsoft Forms'] ?? '').trim();
          const duration = String(row['Thời gian (phút)'] ?? '').trim();
          const deadline = String(row['Hạn nộp (YYYY-MM-DD HH:mm)'] ?? '').trim();

          let error: string | undefined;
          if (!title) error = 'Thiếu tên bài thi';
          else if (!subject) error = 'Thiếu môn học';
          else if (!classes) error = 'Thiếu lớp áp dụng';
          else if (!formsUrl) error = 'Thiếu link Forms';
          else if (!duration || isNaN(Number(duration)) || Number(duration) <= 0) error = 'Thời gian không hợp lệ';
          else if (!deadline) error = 'Thiếu hạn nộp';

          return {
            rowNumber: idx + 2,
            title, subject, classes, formsUrl, duration, deadline,
            valid: !error,
            error,
          };
        });

        setParsedRows(rows);
      } catch {
        toast('Không thể đọc file Excel', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const validRows = parsedRows.filter((r) => r.valid);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  const handleImport = () => {
    const exams: Omit<Exam, 'id' | 'createdAt'>[] = validRows.map((row) => {
      const classes = row.classes.split(',').map((c) => c.trim()).filter(Boolean);
      let deadlineISO: string;
      // Parse "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
      if (row.deadline.includes(' ')) {
        deadlineISO = new Date(row.deadline.replace(' ', 'T')).toISOString();
      } else {
        deadlineISO = new Date(row.deadline + 'T23:59').toISOString();
      }
      return {
        title: row.title,
        subject: row.subject,
        grade: '',
        durationMinutes: parseInt(row.duration),
        deadline: deadlineISO,
        status: 'open' as ExamStatus,
        formsUrl: row.formsUrl,
        targetClasses: classes,
        classDeadlines: {},
        folderId: targetFolderId,
      };
    });
    onImport(exams);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileSpreadsheet size={22} className="text-emerald-600" />
            Nhập từ Excel
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {/* Download template */}
        <button
          onClick={downloadTemplate}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100"
        >
          <Download size={18} />
          Tải file Excel mẫu
        </button>

        {/* Upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition-all ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
          }`}
        >
          <Upload size={32} className={`mb-2 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-sm font-medium text-slate-600">
            {fileName ? fileName : 'Kéo thả hoặc chọn file Excel'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Hỗ trợ định dạng .xlsx, .xls</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Parsed results */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-emerald-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">{validRows.length}</p>
                <p className="text-xs text-emerald-600">Hợp lệ</p>
              </div>
              <div className="flex-1 rounded-xl bg-red-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-red-600">{invalidRows.length}</p>
                <p className="text-xs text-red-500">Lỗi</p>
              </div>
            </div>

            {/* Row list */}
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {parsedRows.map((row) => (
                <div
                  key={row.rowNumber}
                  className={`rounded-lg p-2.5 text-xs ${
                    row.valid ? 'bg-emerald-50/50' : 'bg-red-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-700">
                        {row.title || '(Không có tiêu đề)'}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${getSubjectMeta(row.subject).bg} ${getSubjectMeta(row.subject).text}`}
                        >
                          {row.subject || '?'}
                        </span>
                        <span className="text-slate-400">Dòng {row.rowNumber}</span>
                      </div>
                    </div>
                    {row.valid ? (
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                    ) : (
                      <AlertCircle size={16} className="shrink-0 text-red-500" />
                    )}
                  </div>
                  {row.error && (
                    <p className="mt-1 font-medium text-red-500">{row.error}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Import button */}
            {validRows.length > 0 && (
              <button
                onClick={handleImport}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-emerald-700"
              >
                <FileDown size={18} />
                Nhập {validRows.length} bài thi
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
