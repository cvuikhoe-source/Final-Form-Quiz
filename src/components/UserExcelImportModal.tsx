import React, { useState, useRef, useEffect } from 'react';
import type { User } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { loadClasses, loadSubjects } from '@/storage';
import { adminImportUsersBatch, type BatchImportUserResult } from '@/lib/adminUserService';
import {
  downloadUserExcelTemplate,
  exportUserImportResults,
  parseAndValidateUserExcel,
  type ParsedUserRow,
  type ImportResultRow,
} from '@/lib/userExcelParser';
import { toast } from './Toast';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';

interface UserExcelImportModalProps {
  currentUser: User;
  existingUsers: User[];
  onClose: () => void;
  onSuccess: (newUsers: User[]) => void;
}

export function UserExcelImportModal({
  currentUser,
  existingUsers,
  onClose,
  onSuccess,
}: UserExcelImportModalProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classes, setClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedUserRow[]>([]);
  const [globalError, setGlobalError] = useState<string>('');
  const [parsing, setParsing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    created: number;
    failed: number;
  } | null>(null);
  const [resultRows, setResultRows] = useState<BatchImportUserResult[]>([]);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadSubjects().then(setSubjects);
  }, []);

  const handleClose = () => {
    if (submitting || parsing) return;
    // Xóa sạch state nhạy cảm trước khi đóng
    setParsedRows([]);
    setResultRows([]);
    onClose();
  };

  /**
   * Hàm dùng chung để xử lý file từ cả input chọn file lẫn drag-and-drop
   */
  const handleSelectedFile = async (file: File) => {
    // 1. Reset state trước đó
    setGlobalError('');
    setImportSummary(null);
    setResultRows([]);

    // 2. Validate extension an toàn (không phụ thuộc MIME type vì Windows có thể trả rỗng)
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setGlobalError('Chỉ chấp nhận file định dạng Excel (.xlsx).');
      toast('Vui lòng chọn file .xlsx', 'error');
      return;
    }

    // 3. Giới hạn dung lượng tối đa 5 MB
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setGlobalError('Dung lượng file vượt quá giới hạn cho phép (tối đa 5 MB).');
      toast('File quá lớn (tối đa 5 MB)', 'error');
      return;
    }

    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const existingUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));

      // Trích xuất tên chuỗi an toàn nếu classes/subjects chứa object hoặc string
      const validClassNames = (classes ?? [])
        .map((item: unknown) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'name' in item
            ? String((item as { name: unknown }).name)
            : ''
        )
        .filter(Boolean);

      const validSubjectNames = (subjects ?? [])
        .map((item: unknown) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'name' in item
            ? String((item as { name: unknown }).name)
            : ''
        )
        .filter(Boolean);

      const { rows, globalError: err } = parseAndValidateUserExcel(buffer, {
        callerRole: currentUser.role === 'admin' ? 'admin' : 'teacher',
        callerAssignedClasses: currentUser.assignedClasses ?? [],
        validClasses: validClassNames.length > 0 ? validClassNames : classes,
        validSubjects: validSubjectNames.length > 0 ? validSubjectNames : subjects,
        existingUsernames,
      });

      if (err) {
        setGlobalError(err);
        setParsedRows([]);
        return;
      }

      if (rows.length === 0) {
        setGlobalError('File không chứa dòng dữ liệu nào.');
        setParsedRows([]);
        return;
      }

      setParsedRows(rows);

      const validCount = rows.filter((r) => r.status === 'valid').length;
      if (validCount === 0) {
        setGlobalError('Không có dòng hợp lệ để nhập. Vui lòng xem lỗi chi tiết của từng dòng trong bảng bên dưới.');
      }
    } catch {
      setGlobalError('Đã xảy ra lỗi khi đọc nội dung file Excel.');
      setParsedRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleSelectedFile(file);
    }
    // Cho phép người dùng chọn lại cùng một file
    e.currentTarget.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleSelectedFile(file);
    }
  };

  const validRows = parsedRows.filter((r) => r.status === 'valid');
  const invalidRows = parsedRows.filter((r) => r.status === 'invalid');

  const handleSubmitImport = async () => {
    if (validRows.length === 0 || submitting) return;

    setSubmitting(true);
    setGlobalError('');

    try {
      // Gửi các dòng hợp lệ tới Edge Function
      const res = await adminImportUsersBatch(
        validRows.map((r) => ({
          rowNumber: r.rowNumber,
          fullName: r.fullName,
          username: r.username,
          password: r.password,
          role: r.role,
          assignedClasses: r.assignedClasses,
          allowedSubjects: r.allowedSubjects,
        }))
      );

      // Xóa ngay password khỏi parsedRows sau khi gửi đi
      setParsedRows((prev) => prev.map((r) => ({ ...r, password: '' })));

      if (!res.success && res.results.length === 0) {
        const errorMsg = res.error?.message ?? 'Quá trình nhập dữ liệu thất bại.';
        setGlobalError(errorMsg);
        toast(errorMsg, 'error');
        setSubmitting(false);
        return;
      }

      setImportSummary(res.summary);
      setResultRows(res.results);

      // Thu thập các tài khoản tạo thành công
      const newlyCreated: User[] = [];
      res.results.forEach((r) => {
        if (r.status === 'created' && r.user) {
          newlyCreated.push(r.user);
        }
      });

      if (newlyCreated.length > 0) {
        onSuccess(newlyCreated);
        toast(`Đã tạo thành công ${newlyCreated.length} tài khoản!`, 'success');
      }

      if (res.summary.failed > 0) {
        toast(`Có ${res.summary.failed} tài khoản không thể tạo. Xem chi tiết bảng kết quả.`, 'error');
      }
    } catch {
      const errorMsg = 'Lỗi hệ thống khi gửi dữ liệu nhập tài khoản.';
      setGlobalError(errorMsg);
      toast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportResults = () => {
    if (resultRows.length === 0) return;

    const exportData: ImportResultRow[] = resultRows.map((r) => {
      const parsed = parsedRows.find((p) => p.rowNumber === r.rowNumber);
      return {
        rowNumber: r.rowNumber,
        username: r.username,
        fullName: parsed?.fullName ?? r.user?.fullName ?? '',
        role: (parsed?.role ?? r.user?.role ?? 'student') as 'teacher' | 'student',
        status: r.status,
        message: r.status === 'created' ? 'Thành công' : r.error?.message ?? 'Thất bại',
      };
    });

    exportUserImportResults(exportData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in p-4" onClick={handleClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Nhập danh sách tài khoản từ Excel</h3>
              <p className="text-xs text-slate-400">
                {currentUser.role === 'admin'
                  ? 'Nhập hàng loạt tài khoản Giáo viên và Học sinh qua file .xlsx'
                  : 'Nhập hàng loạt tài khoản Học sinh thuộc lớp phụ trách qua file .xlsx'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top Actions: Template Download & File Picker */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">Tải file mẫu chuẩn</p>
              <p className="text-xs text-slate-500">Sử dụng file mẫu có cấu trúc định dạng chuẩn của QuizForms để tránh lỗi dữ liệu.</p>
            </div>
            <button
              type="button"
              onClick={downloadUserExcelTemplate}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            >
              <Download size={16} /> Tải file mẫu (.xlsx)
            </button>
          </div>

          {/* Drag & Drop Area */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !submitting && !parsing && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!submitting && !parsing) fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
              dragActive
                ? 'border-blue-500 bg-blue-50 scale-[1.01] ring-4 ring-blue-100'
                : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/30'
            } ${submitting || parsing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={submitting || parsing}
              className="hidden"
            />
            <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full transition-transform ${
              dragActive ? 'bg-blue-600 text-white scale-110' : 'bg-blue-50 text-blue-600 group-hover:scale-110'
            }`}>
              {parsing ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {parsing
                ? 'Đang đọc và phân tích file Excel...'
                : dragActive
                ? 'Thả file .xlsx vào đây ngay'
                : fileName
                ? `Đã chọn: ${fileName}`
                : 'Bấm để chọn file hoặc kéo thả file Excel vào đây'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {fileSize
                ? `Kích thước: ${fileSize}`
                : 'Hỗ trợ định dạng .xlsx duy nhất, tối đa 5 MB, tối đa 500 dòng'}
            </p>
          </div>

          {/* Global error banner */}
          {globalError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-600">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Post-import Summary View */}
          {importSummary && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileCheck size={18} className="text-blue-600" /> Kết quả nhập dữ liệu
                </h4>
                <button
                  type="button"
                  onClick={handleExportResults}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download size={14} /> Xuất file báo cáo
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Tổng số dòng</p>
                  <p className="text-lg font-bold text-slate-700">{importSummary.total}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium">Tạo thành công</p>
                  <p className="text-lg font-bold text-emerald-700">{importSummary.created}</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3 text-center border border-red-100">
                  <p className="text-xs text-red-600 font-medium">Thất bại</p>
                  <p className="text-lg font-bold text-red-700">{importSummary.failed}</p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">Xem trước dữ liệu</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {parsedRows.length} dòng
                  </span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                    <CheckCircle2 size={13} /> {validRows.length} hợp lệ
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                      <AlertTriangle size={13} /> {invalidRows.length} lỗi
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">Dòng</th>
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">Tên đăng nhập</th>
                      <th className="py-2.5 px-3">Mật khẩu</th>
                      <th className="py-2.5 px-3">Vai trò</th>
                      <th className="py-2.5 px-3">Lớp</th>
                      <th className="py-2.5 px-3">Môn học</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r) => {
                      const result = resultRows.find((res) => res.rowNumber === r.rowNumber);

                      return (
                        <tr key={r.rowNumber} className={r.status === 'invalid' ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{r.rowNumber}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{r.fullName || '—'}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">@{r.username}</td>
                          <td className="py-2 px-3 font-mono text-slate-400">••••••••</td>
                          <td className="py-2 px-3">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${r.role === 'teacher' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {r.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{r.assignedClasses.join(', ') || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{r.allowedSubjects.join(', ') || '—'}</td>
                          <td className="py-2 px-3">
                            {result ? (
                              result.status === 'created' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                  <CheckCircle2 size={13} /> Thành công
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600 font-semibold" title={result.error?.message}>
                                  <AlertCircle size={13} /> {result.error?.message || 'Lỗi'}
                                </span>
                              )
                            ) : r.status === 'valid' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                <CheckCircle2 size={13} /> Sẵn sàng
                              </span>
                            ) : (
                              <div className="space-y-0.5 text-[11px] text-red-600 font-medium">
                                {r.errors.map((err, idx) => (
                                  <div key={idx} className="flex items-center gap-1">
                                    <AlertCircle size={12} className="shrink-0" />
                                    <span>{err}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50">
          <p className="text-xs text-slate-400">
            {validRows.length > 0 && !importSummary
              ? `Sẵn sàng tạo ${validRows.length} tài khoản hợp lệ.`
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {importSummary ? 'Đóng' : t('common.cancel')}
            </button>
            {!importSummary && (
              <button
                type="button"
                onClick={handleSubmitImport}
                disabled={validRows.length === 0 || submitting}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang tạo tài khoản...</span>
                  </>
                ) : (
                  <span>Tạo {validRows.length} tài khoản</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
