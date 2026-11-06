import { useState } from 'react';
import type { VocabularyItem } from '@/types';
import type { VocabularyMergePlan } from '@/lib/vocabDuplicateMergeService';
import { X, AlertCircle, CheckCircle2, MinusCircle, RefreshCw } from 'lucide-react';

interface VocabConflictResolveModalProps {
  plan: VocabularyMergePlan;
  lessonTitle: string;
  onResolve: (resolvedItem: VocabularyItem) => void;
  onCancel: () => void;
}

export function VocabConflictResolveModal({
  plan,
  lessonTitle,
  onResolve,
  onCancel,
}: VocabConflictResolveModalProps) {
  // Trạng thái chọn cho các trường conflict: 'existing' | 'incoming'
  const [conflictSelections, setConflictSelections] = useState<Record<string, 'existing' | 'incoming'>>(() => {
    const init: Record<string, 'existing' | 'incoming'> = {};
    plan.conflictFields.forEach((cf) => {
      // Mặc định giữ giá trị an toàn là 'existing'
      init[cf.field] = 'existing';
    });
    return init;
  });

  const handleSelect = (field: string, choice: 'existing' | 'incoming') => {
    setConflictSelections((prev) => ({ ...prev, [field]: choice }));
  };

  const handleConfirm = () => {
    // Tạo đối tượng resolvedItem từ mergedItem và các lựa chọn conflict
    const finalItem: VocabularyItem = { ...plan.mergedItem };

    plan.conflictFields.forEach((cf) => {
      const choice = conflictSelections[cf.field];
      if (choice === 'incoming') {
        (finalItem as unknown as Record<string, unknown>)[cf.field] = cf.incomingValue;
      } else {
        (finalItem as unknown as Record<string, unknown>)[cf.field] = cf.existingValue;
      }
    });

    onResolve(finalItem);
  };

  const formatValueDisplay = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return '(trống)';
    if (Array.isArray(val)) {
      if (val.length === 0) return '(danh sách trống)';
      if (typeof val[0] === 'object' && val[0] !== null && 'kanji' in val[0]) {
        return val.map((k: { kanji: string; hanViet?: string }) => `${k.kanji} (${k.hanViet || ''})`).join(', ');
      }
      return val.join(', ');
    }
    return String(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Từ vựng đã tồn tại
              </span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                Bài học: {lessonTitle}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <h3 className="font-jp text-lg font-bold text-slate-900 dark:text-white">
                {plan.existingItem?.vocabulary}
              </h3>
              {plan.existingItem?.readingHiragana && (
                <span className="font-jp text-sm font-medium text-blue-600 dark:text-blue-400">
                  ({plan.existingItem.readingHiragana})
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Hệ thống phát hiện từ vựng này đã có sẵn trong bài học. Để bảo vệ dữ liệu, các trường mới sẽ được bổ sung vào bản ghi cũ theo các quy tắc bên dưới.
          </p>

          {/* 1. Nhóm trường xung đột (Conflict Fields) */}
          {plan.conflictFields.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 dark:border-red-900/50 dark:bg-red-950/20">
              <div className="mb-3 flex items-center gap-1.5 font-bold text-red-800 dark:text-red-300">
                <AlertCircle size={16} className="shrink-0" />
                <span>Xung đột dữ liệu ({plan.conflictFields.length} trường) - Vui lòng chọn giá trị giữ lại:</span>
              </div>
              <div className="space-y-3">
                {plan.conflictFields.map((cf) => {
                  const currentChoice = conflictSelections[cf.field];
                  return (
                    <div
                      key={cf.field}
                      className="rounded-lg border border-red-200 bg-white p-3 dark:border-red-900/40 dark:bg-slate-800/90 shadow-2xs"
                    >
                      <p className="mb-2 font-bold text-slate-800 dark:text-slate-200">
                        {cf.label} <code className="font-mono text-[10px] text-slate-400">({cf.field})</code>
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Lựa chọn 1: Giữ hiện tại */}
                        <label
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-all ${
                            currentChoice === 'existing'
                              ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500/80 dark:bg-blue-950/30'
                              : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`conflict-${cf.field}`}
                            checked={currentChoice === 'existing'}
                            onChange={() => handleSelect(cf.field, 'existing')}
                            className="mt-0.5 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block font-semibold text-[11px] text-slate-500 dark:text-slate-400">
                              (Giữ giá trị hiện tại)
                            </span>
                            <span className="mt-0.5 block break-words text-slate-800 dark:text-slate-100 font-medium">
                              {formatValueDisplay(cf.existingValue)}
                            </span>
                          </div>
                        </label>

                        {/* Lựa chọn 2: Dùng dữ liệu mới */}
                        <label
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-all ${
                            currentChoice === 'incoming'
                              ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-500/80 dark:bg-indigo-950/30'
                              : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`conflict-${cf.field}`}
                            checked={currentChoice === 'incoming'}
                            onChange={() => handleSelect(cf.field, 'incoming')}
                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block font-semibold text-[11px] text-indigo-600 dark:text-indigo-400">
                              (Dùng dữ liệu mới)
                            </span>
                            <span className="mt-0.5 block break-words text-slate-800 dark:text-slate-100 font-medium">
                              {formatValueDisplay(cf.incomingValue)}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Nhóm trường có thể tự động bổ sung (Fillable Fields) */}
          {plan.fillableFields.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>Sẽ tự động bổ sung vào trường còn thiếu ({plan.fillableFields.length} trường):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {plan.fillableFields.map((ff) => (
                  <div
                    key={ff.field}
                    className="flex flex-col rounded-lg border border-emerald-200 bg-white p-2.5 dark:border-emerald-900/40 dark:bg-slate-800/90 shadow-2xs"
                  >
                    <span className="font-semibold text-slate-500 dark:text-slate-400 text-xs">
                      {ff.label}:
                    </span>
                    <span className="mt-0.5 font-medium text-emerald-700 dark:text-emerald-300 break-words">
                      {formatValueDisplay(ff.chosenValue ?? ff.incomingValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Nhóm trường không thay đổi (Unchanged Fields) */}
          {plan.unchangedFields.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                <MinusCircle size={15} className="shrink-0" />
                <span>
                  {plan.unchangedFields.length} trường không thay đổi hoặc dữ liệu mới để trống (được giữ nguyên).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-blue-700 active:scale-95 transition-all"
          >
            <RefreshCw size={15} />
            <span>Xác nhận cập nhật</span>
          </button>
        </div>
      </div>
    </div>
  );
}

