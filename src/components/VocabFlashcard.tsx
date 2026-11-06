import { useState, useEffect, useCallback, useRef } from 'react';
import type { VocabularyItem, FlashcardSettings, MasteryStatus } from '@/types';
import { getMasteryStatusLabel } from '@/storage';
import { useViewportSize } from '@/hooks/useViewportSize';
import {
  getKanjiSizeStyle,
  getBackKanjiSizeStyle,
  FlashcardLayoutMode,
} from '@/lib/vocabFlashcardHelpers';
import type { VocabularyStudyGroup, SessionEvaluationRecord } from '@/lib/vocabStudyGroupService';
import {
  STUDY_GROUP_CONFIGS,
  STUDY_GROUP_KEYS,
  getStudyGroupLabel,
  shouldRemoveFromCurrentSession,
  summarizeCompletedSession,
  calculateNextReviewAt,
} from '@/lib/vocabStudyGroupService';
import {
  Volume2, ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff,
  Lightbulb, BookOpen, RotateCw, Sparkles, Tag, X, ChevronDown,
  Layers, HelpCircle,
} from 'lucide-react';

/**
 * Kiểm tra xem phần tử được chạm có phải là control tương tác hay không
 * (nút bấm, link, input, hoặc phần tử có cờ data-no-swipe="true")
 */
function isInteractiveChild(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('button, a, input, textarea, select, audio, video, [data-no-swipe="true"]')) {
    return true;
  }
  const roleButton = target.closest('[role="button"]');
  if (roleButton && !roleButton.classList.contains('flashcard-3d')) {
    return true;
  }
  return false;
}

interface VocabFlashcardProps {
  items: VocabularyItem[];
  settings: FlashcardSettings;
  onEvaluate: (item: VocabularyItem, status: MasteryStatus) => Promise<boolean | void> | boolean | void;
  onFlipBack: (itemId: string) => void;
  viewedBackIds: Set<string>;
  onClose?: () => void;
  lessonTitle?: string;
  studyGroup?: VocabularyStudyGroup;
  onChangeStudyGroup?: (newGroup: VocabularyStudyGroup) => void;
  groupCounts?: Record<VocabularyStudyGroup, number>;
  onBackToGroupPicker?: () => void;
}

/**
 * Component hiển thị nội dung của 1 thẻ Flashcard
 * Tự động chuyển đổi layout linh hoạt theo chế độ Portrait / Landscape
 */
function FlashcardItemView({
  item,
  flipped = false,
  isCurrent = false,
  settings,
  speakText,
  speakCurrent,
  layoutMode,
  isCompactLandscape,
}: {
  item: VocabularyItem;
  flipped?: boolean;
  isCurrent?: boolean;
  settings: FlashcardSettings;
  speakText: (text: string, e?: React.MouseEvent) => void;
  speakCurrent: (e: React.MouseEvent) => void;
  layoutMode: FlashcardLayoutMode;
  isCompactLandscape: boolean;
}) {
  const isLandscape = layoutMode === 'landscape-compact' || layoutMode === 'landscape-wide';
  const kanjiStyle = getKanjiSizeStyle(item.vocabulary, layoutMode);
  const backKanjiStyle = getBackKanjiSizeStyle(item.vocabulary.length, isCompactLandscape);

  return (
    <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
      {/* ─── MẶT TRƯỚC ───────────────────────────────────────── */}
      <div className={`flashcard-face flashcard-front flex flex-col justify-between rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-850 to-slate-900 shadow-2xl transition-shadow text-slate-100 ${
        isCompactLandscape ? 'p-3.5 sm:p-4' : 'p-5 sm:p-7'
      }`}>
        {isLandscape ? (
          /* ── BỐ CỤC 2 CỘT CHO MÀN HÌNH XOAY NGANG (LANDSCAPE) ── */
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 sm:gap-4 items-center w-full">
            {/* Cột trái: Kanji cực lớn, cách đọc & loa */}
            <div className="flex flex-col items-center justify-center text-center px-1">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={isCurrent ? speakCurrent : undefined}
                  aria-label="Phát âm từ vựng"
                  title="Phát âm tiếng Nhật"
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 active:scale-95 transition-all shadow-sm"
                >
                  <Volume2 size={18} />
                </button>
                {item.jlptLevel && (
                  <span className="rounded-lg bg-indigo-500/20 border border-indigo-400/40 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                    {item.jlptLevel}
                  </span>
                )}
              </div>

              {/* Kanji cực lớn */}
              <h2
                className="font-jp font-bold text-white tracking-wide transition-all select-none drop-shadow-sm my-0.5"
                style={kanjiStyle}
              >
                {item.vocabulary}
              </h2>

              {settings.showHiragana && item.readingHiragana && (
                <p className="font-jp mt-1 font-semibold text-blue-400 text-sm sm:text-base leading-snug">
                  {item.readingHiragana}
                </p>
              )}

              {item.readingRomaji && (
                <p className="font-mono text-[11px] tracking-wider text-slate-400">
                  {item.readingRomaji}
                </p>
              )}
            </div>

            {/* Cột phải: Nghĩa tiếng Việt, Âm Hán Việt, On/Kun */}
            <div className="flex flex-col justify-center gap-2 text-left pl-2 sm:pl-3 border-l border-slate-700/60 h-full">
              {item.hanViet && (
                <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-purple-500/15 border border-purple-400/40 px-3 py-0.5 text-xs font-bold text-purple-300 shadow-xs">
                  <span className="text-purple-400 font-normal">Hán Việt:</span>
                  <span className="tracking-wider uppercase">{item.hanViet}</span>
                </div>
              )}

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-2xs">
                <p className="text-sm sm:text-base font-semibold text-emerald-300 leading-snug">
                  {item.meaningVi}
                </p>
              </div>

              {(item.onyomi || item.kunyomi) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                  {item.onyomi && (
                    <span className="font-jp">
                      <span className="text-slate-500">音:</span> {item.onyomi}
                    </span>
                  )}
                  {item.kunyomi && (
                    <span className="font-jp">
                      <span className="text-slate-500">訓:</span> {item.kunyomi}
                    </span>
                  )}
                </div>
              )}

              {item.relatedWords && item.relatedWords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.relatedWords.slice(0, 3).map((rw, i) => (
                    <span
                      key={i}
                      className="font-jp rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-300"
                    >
                      {rw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── BỐ CỤC DỌC CHO MÀN HÌNH ĐỨNG (PORTRAIT) ── */
          <>
            {/* Header */}
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                data-no-swipe="true"
                onClick={isCurrent ? speakCurrent : undefined}
                aria-label="Phát âm từ vựng"
                title="Phát âm tiếng Nhật"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 active:scale-95 transition-all shadow-sm"
              >
                <Volume2 size={21} />
              </button>

              <div className="flex items-center gap-1.5">
                {item.jlptLevel && (
                  <span className="rounded-lg bg-indigo-500/20 border border-indigo-400/40 px-2.5 py-1 text-xs font-bold text-indigo-300">
                    {item.jlptLevel}
                  </span>
                )}
                {item.wordType && (
                  <span className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {item.wordType}
                  </span>
                )}
              </div>
            </div>

            {/* Central Content */}
            <div className="my-auto flex flex-col items-center text-center px-2 py-2">
              {/* Kanji cực lớn gấp ~2 lần hiện tại */}
              <h2
                className="font-jp font-bold text-white tracking-wide transition-all select-none drop-shadow-md"
                style={kanjiStyle}
              >
                {item.vocabulary}
              </h2>

              {settings.showHiragana && item.readingHiragana && (
                <p className="font-jp mt-3 font-semibold text-blue-400 text-lg sm:text-xl">
                  {item.readingHiragana}
                </p>
              )}

              {item.readingRomaji && (
                <p className="mt-1 font-mono text-xs tracking-wider text-slate-400">
                  {item.readingRomaji}
                </p>
              )}

              {item.hanViet && (
                <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 border border-purple-400/40 px-3.5 py-1 text-xs font-bold text-purple-300 shadow-xs">
                  <span className="text-purple-400 font-normal">Hán Việt:</span>
                  <span className="tracking-wider uppercase">{item.hanViet}</span>
                </div>
              )}

              <div className="mt-4 max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 shadow-2xs">
                <p className="text-base sm:text-lg font-semibold text-emerald-300 leading-snug">
                  {item.meaningVi}
                </p>
              </div>

              {(item.onyomi || item.kunyomi) && (
                <div className="mt-3 flex flex-wrap justify-center items-center gap-3 text-xs text-slate-400">
                  {item.onyomi && (
                    <span className="font-jp">
                      <span className="text-slate-500">音:</span> {item.onyomi}
                    </span>
                  )}
                  {item.kunyomi && (
                    <span className="font-jp">
                      <span className="text-slate-500">訓:</span> {item.kunyomi}
                    </span>
                  )}
                </div>
              )}

              {item.relatedWords && item.relatedWords.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {item.relatedWords.slice(0, 3).map((rw, i) => (
                    <span
                      key={i}
                      className="font-jp rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-300"
                    >
                      {rw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer Hint */}
        <div className={`flex items-center justify-center gap-1.5 text-xs text-slate-400 border-t border-slate-800 ${
          isCompactLandscape ? 'pt-1.5 text-[11px]' : 'pt-2.5'
        }`}>
          <RotateCw size={isCompactLandscape ? 12 : 13} className="text-slate-400" />
          <span>Chạm hoặc vuốt lên để xem mặt sau</span>
        </div>
      </div>

      {/* ─── MẶT SAU (Chi tiết) ─────────────────────────────────── */}
      <div className={`flashcard-face flashcard-back flex flex-col justify-between rounded-3xl border border-slate-700/80 bg-slate-850 shadow-2xl text-slate-100 ${
        isCompactLandscape ? 'p-3 sm:p-4' : 'p-4 sm:p-6'
      }`}>
        {/* Header mặt sau */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-no-swipe="true"
              onClick={isCurrent ? speakCurrent : undefined}
              aria-label="Phát âm từ vựng"
              title="Phát âm tiếng Nhật"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 active:scale-95 transition-all"
            >
              <Volume2 size={18} />
            </button>
            <div className="flex items-baseline gap-2">
              <span
                className="font-jp font-bold text-white tracking-wide"
                style={backKanjiStyle}
              >
                {item.vocabulary}
              </span>
              {item.readingHiragana && (
                <span className="font-jp text-xs text-blue-400">({item.readingHiragana})</span>
              )}
              {item.hanViet && (
                <span className="text-xs font-bold text-purple-300 uppercase">[{item.hanViet}]</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {item.jlptLevel && (
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-400/30">
                {item.jlptLevel}
              </span>
            )}
            <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Chi tiết
            </span>
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          data-scroll-container="true"
          className="flex-1 overflow-y-auto pr-1 my-2 text-left nice-scroll"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {isLandscape ? (
            /* ── CHIA 2 CỘT MẶT SAU KHI XOAY NGANG ── */
            <div className="grid grid-cols-2 gap-3 items-start">
              {/* Cột 1: Phân tích Kanji */}
              <div className="space-y-2">
                {item.kanjiBreakdown && item.kanjiBreakdown.length > 0 ? (
                  <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                      <BookOpen size={14} className="text-indigo-400" />
                      <span>Phân tích từng chữ Kanji</span>
                    </div>
                    <div className="space-y-1.5">
                      {item.kanjiBreakdown.map((k, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 rounded-xl border border-indigo-400/20 bg-slate-800/80 p-1.5 shadow-xs"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-400/30 font-jp text-lg font-bold text-indigo-200">
                            {k.kanji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs text-purple-300 uppercase tracking-wide">
                              {k.hanViet}
                            </span>
                            <p className="text-[11px] font-medium text-slate-300 line-clamp-2">
                              {k.meaningVi}
                            </p>
                            {(k.onyomi || k.kunyomi) && (
                              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-jp">
                                {k.onyomi && <span>音: {k.onyomi}</span>}
                                {k.kunyomi && <span>訓: {k.kunyomi}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700 p-2.5 text-center text-xs text-slate-500">
                    Không có phân tích Kanji riêng
                  </div>
                )}
              </div>

              {/* Cột 2: Gợi ý nhớ & Ví dụ */}
              <div className="space-y-2">
                {/* Memory Hint */}
                {item.kanjiMemoryHint && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Lightbulb size={14} className="text-amber-400" />
                      <span>Gợi ý ghi nhớ</span>
                    </div>
                    <p className="text-xs text-amber-100 font-normal leading-relaxed pl-5">
                      {item.kanjiMemoryHint}
                    </p>
                  </div>
                )}

                {/* Examples */}
                {(item.exampleJp1 || item.exampleJp2) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                      <Sparkles size={13} className="text-blue-400" />
                      <span>Câu ví dụ</span>
                    </div>

                    {item.exampleJp1 && (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-jp text-xs font-semibold text-slate-150 leading-relaxed">
                            {item.exampleJp1}
                          </p>
                          <button
                            type="button"
                            data-no-swipe="true"
                            onClick={(e) => speakText(item.exampleReading1 || item.exampleJp1, e)}
                            title="Phát âm ví dụ 1"
                            aria-label="Phát âm ví dụ 1"
                            className="shrink-0 p-1 text-slate-400 hover:text-blue-400 transition-colors"
                          >
                            <Volume2 size={15} />
                          </button>
                        </div>
                        {item.exampleReading1 && (
                          <p className="font-jp text-[11px] text-blue-400">
                            {item.exampleReading1}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-emerald-400 font-medium">
                          {item.exampleVi1}
                        </p>
                      </div>
                    )}

                    {item.exampleJp2 && (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-jp text-xs font-semibold text-slate-150 leading-relaxed">
                            {item.exampleJp2}
                          </p>
                          <button
                            type="button"
                            data-no-swipe="true"
                            onClick={(e) => speakText(item.exampleReading2 || item.exampleJp2, e)}
                            title="Phát âm ví dụ 2"
                            aria-label="Phát âm ví dụ 2"
                            className="shrink-0 p-1 text-slate-400 hover:text-blue-400 transition-colors"
                          >
                            <Volume2 size={15} />
                          </button>
                        </div>
                        {item.exampleReading2 && (
                          <p className="font-jp text-[11px] text-blue-400">
                            {item.exampleReading2}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-emerald-400 font-medium">
                          {item.exampleVi2}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── BỐ CỤC DỌC MẶT SAU CHO MÀN HÌNH ĐỨNG (PORTRAIT) ── */
            <div className="space-y-3">
              {/* Kanji Breakdown */}
              {item.kanjiBreakdown && item.kanjiBreakdown.length > 0 && (
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                    <BookOpen size={14} className="text-indigo-400" />
                    <span>Phân tích từng chữ Kanji</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {item.kanjiBreakdown.map((k, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-indigo-400/20 bg-slate-800/80 p-2 shadow-xs"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 font-jp text-xl font-bold text-indigo-200">
                          {k.kanji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-purple-300 uppercase tracking-wide">
                            {k.hanViet}
                          </span>
                          <p className="mt-0.5 text-xs font-medium text-slate-300 line-clamp-2">
                            {k.meaningVi}
                          </p>
                          {(k.onyomi || k.kunyomi) && (
                            <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-jp">
                              {k.onyomi && <span>音: {k.onyomi}</span>}
                              {k.kunyomi && <span>訓: {k.kunyomi}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memory Hint */}
              {item.kanjiMemoryHint && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Lightbulb size={14} className="text-amber-400" />
                    <span>Gợi ý liên tưởng & ghi nhớ</span>
                  </div>
                  <p className="text-xs text-amber-100 font-normal leading-relaxed pl-5">
                    {item.kanjiMemoryHint}
                  </p>
                </div>
              )}

              {/* Examples */}
              {(item.exampleJp1 || item.exampleJp2) ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Sparkles size={13} className="text-blue-400" />
                    <span>Câu ví dụ thực tế</span>
                  </div>

                  {item.exampleJp1 && (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-jp text-xs sm:text-sm font-semibold text-slate-150 leading-relaxed">
                          {item.exampleJp1}
                        </p>
                        <button
                          type="button"
                          data-no-swipe="true"
                          onClick={(e) => speakText(item.exampleReading1 || item.exampleJp1, e)}
                          title="Phát âm ví dụ 1"
                          aria-label="Phát âm ví dụ 1"
                          className="shrink-0 p-1 text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                      {item.exampleReading1 && (
                        <p className="font-jp mt-0.5 text-xs text-blue-400">
                          {item.exampleReading1}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-emerald-400 font-medium">
                        {item.exampleVi1}
                      </p>
                    </div>
                  )}

                  {item.exampleJp2 && (
                    <div className="rounded-xl border border-slate-700 bg-slate-805/80 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-jp text-xs sm:text-sm font-semibold text-slate-150 leading-relaxed">
                          {item.exampleJp2}
                        </p>
                        <button
                          type="button"
                          data-no-swipe="true"
                          onClick={(e) => speakText(item.exampleReading2 || item.exampleJp2, e)}
                          title="Phát âm ví dụ 2"
                          aria-label="Phát âm ví dụ 2"
                          className="shrink-0 p-1 text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                      {item.exampleReading2 && (
                        <p className="font-jp mt-0.5 text-xs text-blue-400">
                          {item.exampleReading2}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-emerald-400 font-medium">
                        {item.exampleVi2}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 p-3 text-center text-xs text-slate-500">
                  Chưa có câu ví dụ cho từ này
                </div>
              )}

              {/* Tags */}
              {(item.tags || (item.relatedWords && item.relatedWords.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-slate-400">
                  {item.tags && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                      <Tag size={11} /> {item.tags}
                    </span>
                  )}
                  {item.relatedWords && item.relatedWords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-500">Từ liên quan:</span>
                      {item.relatedWords.map((rw, i) => (
                        <span key={i} className="font-jp rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[10px] text-purple-300 font-medium">
                          {rw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-center gap-1 text-xs text-slate-400 border-t border-slate-700/80 ${
          isCompactLandscape ? 'pt-1.5 text-[11px]' : 'pt-2'
        }`}>
          <RotateCw size={isCompactLandscape ? 11 : 12} className="text-slate-400" />
          <span>Chạm hoặc vuốt xuống để lật về mặt trước</span>
        </div>
      </div>
    </div>
  );
}

export function VocabFlashcard({
  items,
  settings,
  onEvaluate,
  onFlipBack,
  viewedBackIds,
  onClose,
  lessonTitle,
  studyGroup = 'all',
  onChangeStudyGroup,
  groupCounts,
  onBackToGroupPicker,
}: VocabFlashcardProps) {
  const [sessionQueue, setSessionQueue] = useState<VocabularyItem[]>(items);
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeHint, setSwipeHint] = useState<'flip-front' | 'flip-back' | 'prev' | 'next' | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<SessionEvaluationRecord[]>([]);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const [showGroupSwitcher, setShowGroupSwitcher] = useState<boolean>(false);

  // Hook theo dõi kích thước viewport & orientation
  const { orientation, isCompactLandscape, layoutMode } = useViewportSize();

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentCardRef = useRef<HTMLDivElement | null>(null);

  // Gesture tracking refs (Không dùng state trong touchmove để đạt 60fps mượt tuyệt đối)
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const currentDeltaXRef = useRef<number>(0);
  const currentDeltaYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const inScrollAreaRef = useRef<boolean>(false);
  const startedOnInteractiveRef = useRef<boolean>(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isTransitioningRef = useRef<boolean>(false);

  // Tách riêng quản lý chống gọi kép (Double Call Prevention) và Ghost Click
  const suppressNextClickRef = useRef<boolean>(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSuppressNextClick = useCallback(() => {
    suppressNextClickRef.current = true;
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    // Timeout an toàn 180ms phục hồi cờ nếu browser trên thiết bị không phát sinh click
    suppressClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    setSessionQueue(items);
    setOrder(items.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    setEvaluationHistory([]);
    setIsCompleted(false);
    if (trackRef.current) {
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      trackRef.current.style.transition = 'none';
    }
  }, [items, studyGroup]);

  // Khóa cuộn trang nền (body lock)
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    const originalPosition = document.body.style.position;
    const originalWidth = document.body.style.width;
    const originalHeight = document.body.style.height;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.body.style.position = originalPosition;
      document.body.style.width = originalWidth;
      document.body.style.height = originalHeight;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Xử lý khi xoay màn hình (orientation change): reset carousel transform an toàn
  useEffect(() => {
    if (trackRef.current && !isDraggingRef.current && !isTransitioningRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [orientation, isCompactLandscape]);

  const currentIdx = order[pos];
  const current = sessionQueue[currentIdx];

  // Chỉ số thẻ trước và sau cho Carousel 3 thẻ
  const prevIdx = order[(pos - 1 + sessionQueue.length) % sessionQueue.length];
  const nextIdx = order[(pos + 1) % sessionQueue.length];
  const prevItem = sessionQueue[prevIdx];
  const nextItem = sessionQueue[nextIdx];

  const speakText = useCallback((text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!settings.audioEnabled) return;
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt này không hỗ trợ phát âm.');
      return;
    }
    window.speechSynthesis.cancel();
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ja-JP';
    utt.rate = 0.9;
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [settings.audioEnabled]);

  const speakCurrent = useCallback((e: React.MouseEvent) => {
    const text = current?.audioText || current?.readingHiragana || current?.vocabulary || '';
    speakText(text, e);
  }, [current, speakText]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && current) onFlipBack(current.id);
      return !f;
    });
  }, [current, onFlipBack]);

  // ─── Chuyển Thẻ Tiếp Theo (Next Card) với Animation Carousel ───────
  const next = useCallback(() => {
    if (sessionQueue.length <= 1 || isTransitioningRef.current || !trackRef.current) return;
    isTransitioningRef.current = true;
    const width = trackRef.current.offsetWidth || 360;

    trackRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
    trackRef.current.style.transform = `translate3d(-${width + 16}px, 0, 0)`;

    setTimeout(() => {
      if (!trackRef.current) return;
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      setFlipped(false);
      setPos((p) => (p + 1) % sessionQueue.length);
      isTransitioningRef.current = false;
    }, 250);
  }, [sessionQueue.length]);

  // ─── Quay Lại Thẻ Trước (Prev Card) với Animation Carousel ─────────
  const prev = useCallback(() => {
    if (sessionQueue.length <= 1 || isTransitioningRef.current || !trackRef.current) return;
    isTransitioningRef.current = true;
    const width = trackRef.current.offsetWidth || 360;

    trackRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
    trackRef.current.style.transform = `translate3d(${width + 16}px, 0, 0)`;

    setTimeout(() => {
      if (!trackRef.current) return;
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      setFlipped(false);
      setPos((p) => (p - 1 + sessionQueue.length) % sessionQueue.length);
      isTransitioningRef.current = false;
    }, 250);
  }, [sessionQueue.length]);

  const shuffle = useCallback(() => {
    setFlipped(false);
    setOrder((prevOrder) => {
      const arr = [...prevOrder];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
    setPos(0);
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, []);

  // ─── 60 FPS DIRECT DOM TOUCH GESTURES ──────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isTransitioningRef.current || e.touches.length !== 1) return;

    const target = e.target as HTMLElement | null;
    if (isInteractiveChild(target)) {
      startedOnInteractiveRef.current = true;
      return;
    }

    startedOnInteractiveRef.current = false;
    const touch = e.touches[0];
    activeTouchIdRef.current = touch.identifier;
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    currentDeltaXRef.current = 0;
    currentDeltaYRef.current = 0;
    isDraggingRef.current = true;
    directionLockedRef.current = null;
    inScrollAreaRef.current = Boolean(target && target.closest('[data-scroll-container="true"]'));

    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
    }
    if (currentCardRef.current) {
      currentCardRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startedOnInteractiveRef.current || !isDraggingRef.current || activeTouchIdRef.current === null) return;

    const touch = Array.from(e.touches).find((t) => t.identifier === activeTouchIdRef.current);
    if (!touch) return;

    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;
    currentDeltaXRef.current = deltaX;
    currentDeltaYRef.current = deltaY;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Khóa hướng sau khi di chuyển rõ ràng (> 12px) để không bị khóa nhầm do rung ngón tay vi mô khi tap
    if (directionLockedRef.current === null && (absX > 12 || absY > 12)) {
      if (absX > absY * 1.25) {
        directionLockedRef.current = 'horizontal';
      } else if (absY > absX * 1.25) {
        directionLockedRef.current = 'vertical';
      }
    }

    // Nếu đang cuộn trong vùng scroll chi tiết mặt sau, không can thiệp
    if (inScrollAreaRef.current && directionLockedRef.current === 'vertical') {
      return;
    }

    // 60fps RequestAnimationFrame: Cập nhật DOM trực tiếp không qua React render
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isDraggingRef.current) return;

        if (directionLockedRef.current === 'horizontal' && trackRef.current && items.length > 1) {
          // Kéo ngang: Carousel Track di chuyển mượt mà theo ngón tay
          const clampedX = Math.max(-200, Math.min(200, currentDeltaXRef.current * 0.85));
          trackRef.current.style.transform = `translate3d(${clampedX}px, 0, 0)`;

          if (currentDeltaXRef.current < -50) setSwipeHint('next');
          else if (currentDeltaXRef.current > 50) setSwipeHint('prev');
          else setSwipeHint(null);
        } else if (directionLockedRef.current === 'vertical' && currentCardRef.current && !inScrollAreaRef.current) {
          // Vuốt lên ở mặt trước: nhấc nhẹ thẻ lên
          if (!flipped && currentDeltaYRef.current < 0) {
            const clampedY = Math.max(-40, currentDeltaYRef.current * 0.35);
            currentCardRef.current.style.transform = `translate3d(0, ${clampedY}px, 0)`;
            if (currentDeltaYRef.current < -50) setSwipeHint('flip-back');
            else setSwipeHint(null);
          }
          // Vuốt xuống ở mặt sau: kéo nhẹ thẻ xuống
          else if (flipped && currentDeltaYRef.current > 0) {
            const clampedY = Math.min(40, currentDeltaYRef.current * 0.35);
            currentCardRef.current.style.transform = `translate3d(0, ${clampedY}px, 0)`;
            if (currentDeltaYRef.current > 50) setSwipeHint('flip-front');
            else setSwipeHint(null);
          }
        }
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startedOnInteractiveRef.current) {
      startedOnInteractiveRef.current = false;
      return;
    }
    if (!isDraggingRef.current || activeTouchIdRef.current === null) return;

    const touch = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchIdRef.current);
    const deltaX = touch ? touch.clientX - startXRef.current : currentDeltaXRef.current;
    const deltaY = touch ? touch.clientY - startYRef.current : currentDeltaYRef.current;
    const absX = Math.abs(deltaX);
    const distance = Math.hypot(deltaX, deltaY);
    const duration = Date.now() - startTimeRef.current;

    isDraggingRef.current = false;
    activeTouchIdRef.current = null;
    setSwipeHint(null);

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    let gestureHandled = false;

    // 1. Thao tác vuốt ngang (Next / Prev)
    if (directionLockedRef.current === 'horizontal' && items.length > 1) {
      const threshold = 55;
      const velocityX = absX / Math.max(duration, 1);

      if (deltaX < -threshold || (deltaX < -25 && velocityX > 0.45)) {
        // Vuốt từ phải sang trái -> Next
        next();
        gestureHandled = true;
      } else if (deltaX > threshold || (deltaX > 25 && velocityX > 0.45)) {
        // Vuốt từ trái sang phải -> Prev
        prev();
        gestureHandled = true;
      } else if (trackRef.current) {
        // Huỷ kéo: đàn hồi về vị trí cũ
        trackRef.current.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
        trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    }

    // 2. Thao tác vuốt dọc (Lật thẻ)
    if (!gestureHandled && directionLockedRef.current === 'vertical' && !inScrollAreaRef.current) {
      const threshold = 50;
      if (!flipped && deltaY < -threshold) {
        // Vuốt dưới lên ở mặt trước: lật sang mặt sau
        flip();
        gestureHandled = true;
      } else if (flipped && deltaY > threshold) {
        // Vuốt trên xuống ở mặt sau: lật về mặt trước
        flip();
        gestureHandled = true;
      }

      if (currentCardRef.current) {
        currentCardRef.current.style.transition = 'transform 0.2s ease-out';
        currentCardRef.current.style.transform = '';
      }
    }

    // 3. Chạm nhanh vào vùng trống (Tap-to-flip) trên thiết bị cảm ứng
    // Định nghĩa tap chuẩn:
    // - Không có gesture vuốt nào đã được xử lý
    // - Không trong lúc chuyển trang animation
    // - Khoảng cách ngón tay di chuyển <= 12px
    // - Thời gian chạm <= 350ms
    const isValidTap =
      !gestureHandled &&
      !isTransitioningRef.current &&
      distance <= 12 &&
      duration <= 350;

    if (isValidTap) {
      flip();
      gestureHandled = true;
    }

    // 4. Quản lý triệt tiêu Ghost-Click:
    // Dù là Tap hay Swipe thành công, lập tức kích hoạt chặn click tiếp theo do trình duyệt sinh ra
    // Điều này NGĂN CHẶN TRIỆT ĐỂ LỖI LẬT KÉP (Double Flip) trên mobile!
    if (gestureHandled) {
      setSuppressNextClick();
    } else {
      // Nếu không phải tap và không đủ ngưỡng swipe: phục hồi vị trí thẻ an toàn
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 0.2s ease-out';
        trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (currentCardRef.current) {
        currentCardRef.current.style.transition = 'transform 0.2s ease-out';
        currentCardRef.current.style.transform = '';
      }
    }
  };

  const handleTouchCancel = () => {
    isDraggingRef.current = false;
    activeTouchIdRef.current = null;
    startedOnInteractiveRef.current = false;
    setSwipeHint(null);
    if (suppressClickTimerRef.current) {
      clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
    suppressNextClickRef.current = false;
    if (trackRef.current) {
      trackRef.current.style.transition = 'transform 0.2s ease-out';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
    if (currentCardRef.current) {
      currentCardRef.current.style.transition = 'transform 0.2s ease-out';
      currentCardRef.current.style.transform = '';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // 1. Chặn click giả phát sinh ngay sau touchend cảm ứng
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = null;
      }
      return;
    }

    // 2. Chặn nếu bấm vào nút phát âm hoặc control tương tác con
    const target = e.target as HTMLElement | null;
    if (isInteractiveChild(target)) {
      return;
    }

    // 3. Click chuột trên Desktop hoặc tap không qua touch
    flip();
  };

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    };
  }, []);

  // Keyboard navigation
  const handleKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  }, [flip, next, prev, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Khi hoàn thành tất cả thẻ trong phiên học (Completion State)
  if (isCompleted) {
    const summary = summarizeCompletedSession(items, evaluationHistory);
    const activeLabel = getStudyGroupLabel(studyGroup || 'all');

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4 select-none"
        style={{ height: '100dvh' }}
      >
        <div className="w-full max-w-md bg-slate-850 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-scale-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mb-4 shadow-inner">
            <Sparkles size={36} />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
            Hoàn thành nhóm {activeLabel}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-6">
            Bạn đã hoàn thành phiên học nhóm này.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-6 text-left">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[11px] text-slate-400 block">Số từ đã học</span>
              <span className="text-lg font-bold text-white">{summary.totalLearned}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
              <span className="text-[11px] text-emerald-400 block">Chuyển sang Đã nhớ</span>
              <span className="text-lg font-bold text-emerald-300">{summary.toMastered}</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/50">
              <span className="text-[11px] text-blue-400 block">Chuyển sang Gần nhớ</span>
              <span className="text-lg font-bold text-blue-300">{summary.toAlmost}</span>
            </div>
            <div className="p-3 rounded-xl bg-orange-950/40 border border-orange-800/50">
              <span className="text-[11px] text-orange-400 block">Chuyển sang Khó</span>
              <span className="text-lg font-bold text-orange-300">{summary.toHard}</span>
            </div>
            {summary.toForgot > 0 && (
              <div className="col-span-2 p-3 rounded-xl bg-red-950/40 border border-red-800/50">
                <span className="text-[11px] text-red-400 block">Chuyển sang Quên</span>
                <span className="text-lg font-bold text-red-300">{summary.toForgot}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsCompleted(false);
                if (onBackToGroupPicker) onBackToGroupPicker();
                else if (onClose) onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Layers size={16} />
              <span>Chọn nhóm khác</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 text-xs font-semibold active:scale-95 transition-all"
            >
              Quay về danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Khi nhóm không có từ nào (Empty State)
  if (sessionQueue.length === 0) {
    const activeLabel = getStudyGroupLabel(studyGroup || 'all');
    const unlearnedCount = groupCounts?.unlearned ?? 0;

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4 select-none"
        style={{ height: '100dvh' }}
      >
        <div className="w-full max-w-md bg-slate-850 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-scale-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400 border border-blue-500/30 mb-4 shadow-inner">
            <BookOpen size={32} />
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
            Bạn chưa có từ nào trong nhóm {activeLabel}.
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-6">
            Hãy chọn một nhóm từ khác hoặc bắt đầu học các từ chưa học.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (onBackToGroupPicker) onBackToGroupPicker();
                else if (onClose) onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Layers size={16} />
              <span>Chọn nhóm khác</span>
            </button>

            {unlearnedCount > 0 && studyGroup !== 'unlearned' && onChangeStudyGroup && (
              <button
                type="button"
                onClick={() => onChangeStudyGroup('unlearned')}
                className="w-full py-2.5 px-4 rounded-xl border border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 text-xs font-semibold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <HelpCircle size={15} />
                <span>Học từ chưa học ({unlearnedCount} từ)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 text-xs font-semibold active:scale-95 transition-all"
            >
              Quay về danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const hasViewedBack = viewedBackIds.has(current.id);
  const totalReviewed = viewedBackIds.size;
  const progressPercent = sessionQueue.length > 0 ? Math.round(((pos + 1) / sessionQueue.length) * 100) : 0;

  const evaluate = async (status: MasteryStatus) => {
    if (isSavingRef.current || !current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    const evaluatedItem = current;
    try {
      const result = await onEvaluate(evaluatedItem, status);
      if (result === false) {
        alert('Lưu tiến độ không thành công. Vui lòng thử lại.');
        isSavingRef.current = false;
        setIsSaving(false);
        return;
      }

      setEvaluationHistory((prevHist) => [
        ...prevHist,
        {
          itemId: evaluatedItem.id,
          previousStatus: 'new',
          newStatus: status,
        },
      ]);

      const nextReviewAt = calculateNextReviewAt(status);
      const activeGroup = studyGroup || 'all';
      const shouldRemove = shouldRemoveFromCurrentSession(activeGroup, status, nextReviewAt);

      if (shouldRemove) {
        const newQueue = sessionQueue.filter((item) => item.id !== evaluatedItem.id);
        setSessionQueue(newQueue);

        if (newQueue.length === 0) {
          setIsCompleted(true);
          isSavingRef.current = false;
          setIsSaving(false);
          return;
        }

        setOrder(newQueue.map((_, i) => i));
        setPos((prevPos) => (prevPos >= newQueue.length ? 0 : prevPos));
        setFlipped(false);
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
      } else {
        next();
      }
    } catch (err) {
      console.error('Lỗi khi đánh giá từ vựng:', err);
      alert('Lưu tiến độ không thành công. Vui lòng thử lại.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const evalButtons: { status: MasteryStatus; color: string }[] = [
    { status: 'forgot', color: 'bg-red-500 hover:bg-red-600 text-white' },
    { status: 'hard', color: 'bg-orange-500 hover:bg-orange-600 text-white' },
    { status: 'almost', color: 'bg-blue-500 hover:bg-blue-600 text-white' },
    { status: 'mastered', color: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900 w-full overflow-hidden select-none overscroll-none touch-none text-slate-100"
      style={{
        height: '100dvh',
        maxHeight: 'var(--flashcard-vh, 100dvh)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
      {/* ─── Top Bar Toàn Màn Hình (Thu gọn thông minh khi Landscape) ─── */}
      <header className={`shrink-0 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur flex items-center justify-between z-20 ${
        isCompactLandscape ? 'h-10 sm:h-11' : 'h-14 sm:px-6'
      }`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-no-swipe="true"
            onClick={onClose}
            aria-label="Đóng chế độ toàn màn hình"
            title="Đóng (Esc)"
            className={`flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all ${
              isCompactLandscape ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-11 w-11'
            }`}
          >
            <X size={isCompactLandscape ? 18 : 20} />
          </button>

          {/* Group Switcher Button */}
          <div className="relative">
            <button
              type="button"
              data-no-swipe="true"
              disabled={isSaving}
              onClick={() => setShowGroupSwitcher((prev) => !prev)}
              aria-label={`Nhóm: ${getStudyGroupLabel(studyGroup || 'all')}. Bấm để chuyển nhóm`}
              className={`flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-750 active:scale-95 transition-all disabled:opacity-50 ${
                isCompactLandscape ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
              }`}
            >
              <span className="text-slate-400 hidden sm:inline">Nhóm:</span>
              <span className="font-bold text-blue-400">{getStudyGroupLabel(studyGroup || 'all')}</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${showGroupSwitcher ? 'rotate-180' : ''}`} />
            </button>

            {showGroupSwitcher && (
              <div
                className="absolute left-0 top-full mt-2 z-50 w-56 sm:w-64 rounded-2xl border border-slate-700 bg-slate-850 p-2 shadow-2xl backdrop-blur-md animate-scale-in"
                data-no-swipe="true"
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Chuyển nhóm học
                  </span>
                  {onBackToGroupPicker && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowGroupSwitcher(false);
                        onBackToGroupPicker();
                      }}
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      Màn hình chọn nhóm
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar">
                  {STUDY_GROUP_KEYS.map((gKey) => {
                    const cfg = STUDY_GROUP_CONFIGS[gKey];
                    const count = groupCounts ? groupCounts[gKey] : 0;
                    const isCurrent = gKey === (studyGroup || 'all');
                    return (
                      <button
                        key={gKey}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setShowGroupSwitcher(false);
                          if (onChangeStudyGroup) onChangeStudyGroup(gKey);
                        }}
                        className={`flex items-center justify-between w-full px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                          isCurrent
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{cfg.label}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCurrent ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center text-center px-2 min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200 max-w-[180px] sm:max-w-md">
            {lessonTitle || 'Flashcard Từ vựng'}
          </p>
          <p className="text-[11px] font-medium text-slate-400">
            Thẻ {pos + 1} / {sessionQueue.length} <span className="text-slate-600">•</span> Đã lật: {totalReviewed}
          </p>
        </div>

        <button
          type="button"
          data-no-swipe="true"
          onClick={shuffle}
          aria-label="Xáo trộn thứ tự từ"
          title="Xáo trộn"
          className={`flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all ${
            isCompactLandscape ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-11 w-11'
          }`}
        >
          <Shuffle size={isCompactLandscape ? 16 : 18} />
        </button>
      </header>

      {/* Thanh tiến độ */}
      <div className="h-1 w-full bg-slate-800/80 shrink-0">
        <div
          className="h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ─── Vùng trung tâm: Flashcard Carousel Track 60 FPS ─────── */}
      <main className={`flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden relative mx-auto ${
        isCompactLandscape ? 'max-w-5xl' : 'max-w-xl'
      }`}>
        {/* Swipe Feedback Badge */}
        {swipeHint && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none animate-scale-in">
            {swipeHint === 'flip-back' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-blue-500/40">
                <RotateCw size={15} className="text-blue-400" />
                <span>Lật xem mặt sau</span>
              </div>
            )}
            {swipeHint === 'flip-front' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-blue-500/40">
                <RotateCw size={15} className="text-blue-400" />
                <span>Lật về mặt trước</span>
              </div>
            )}
            {swipeHint === 'prev' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-blue-500/40">
                <ChevronLeft size={16} className="text-blue-400" />
                <span>Thẻ trước</span>
              </div>
            )}
            {swipeHint === 'next' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-blue-500/40">
                <span>Thẻ tiếp theo</span>
                <ChevronRight size={16} className="text-blue-400" />
              </div>
            )}
          </div>
        )}

        {/* 3-Card Carousel Track Container */}
        <div
          ref={trackRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onClick={handleCardClick}
          className={`relative w-full touch-none select-none cursor-pointer flex items-center justify-center ${
            isCompactLandscape
              ? 'h-full max-h-full'
              : 'h-[520px] max-h-[calc(100dvh-200px)]'
          }`}
          style={{ transform: 'translate3d(0, 0, 0)', willChange: 'transform' }}
        >
          {/* 1. Thẻ trước (Bên trái: position -100%) */}
          {sessionQueue.length > 1 && prevItem && (
            <div
              className="flashcard-3d absolute top-0 w-full h-full pointer-events-none select-none"
              style={{ left: 'calc(-100% - 16px)' }}
              aria-hidden="true"
            >
              <FlashcardItemView
                item={prevItem}
                flipped={false}
                isCurrent={false}
                settings={settings}
                speakText={speakText}
                speakCurrent={speakCurrent}
                layoutMode={layoutMode}
                isCompactLandscape={isCompactLandscape}
              />
            </div>
          )}

          {/* 2. Thẻ hiện tại (Ở giữa: position 0) */}
          <div
            ref={currentCardRef}
            className="flashcard-3d absolute top-0 left-0 w-full h-full"
            role="button"
            tabIndex={0}
            aria-label={`Thẻ từ vựng: ${current.vocabulary}. Vuốt lên để lật thẻ.`}
          >
            <FlashcardItemView
              item={current}
              flipped={flipped}
              isCurrent={true}
              settings={settings}
              speakText={speakText}
              speakCurrent={speakCurrent}
              layoutMode={layoutMode}
              isCompactLandscape={isCompactLandscape}
            />
          </div>

          {/* 3. Thẻ tiếp theo (Bên phải: position +100%) */}
          {sessionQueue.length > 1 && nextItem && (
            <div
              className="flashcard-3d absolute top-0 w-full h-full pointer-events-none select-none"
              style={{ left: 'calc(100% + 16px)' }}
              aria-hidden="true"
            >
              <FlashcardItemView
                item={nextItem}
                flipped={false}
                isCurrent={false}
                settings={settings}
                speakText={speakText}
                speakCurrent={speakCurrent}
                layoutMode={layoutMode}
                isCompactLandscape={isCompactLandscape}
              />
            </div>
          )}
        </div>
      </main>

      {/* ─── Footer Điều Khiển & Đánh Giá ───────────────────────── */}
      <footer className={`shrink-0 border-t border-slate-800 bg-slate-900/95 px-3 z-20 flex flex-col items-center ${
        isCompactLandscape ? 'py-1.5' : 'py-2.5 sm:px-6'
      }`}>
        {isCompactLandscape ? (
          /* ── THANH ĐIỀU KHIỂN COMPACT 1 HÀNG CHO LANDSCAPE ── */
          <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto w-full">
            <button
              type="button"
              data-no-swipe="true"
              onClick={prev}
              title="Từ trước (←)"
              aria-label="Từ trước"
              className="flex h-9 px-3 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium shrink-0"
            >
              <ChevronLeft size={16} /> <span className="hidden sm:inline">Trước</span>
            </button>

            <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
              {hasViewedBack ? (
                evalButtons.map(({ status, color }) => (
                  <button
                    key={status}
                    type="button"
                    data-no-swipe="true"
                    onClick={() => evaluate(status)}
                    className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2.5 text-[11px] sm:text-xs font-semibold active:scale-95 transition-all truncate shadow-xs ${color}`}
                  >
                    <Eye size={12} className="shrink-0" />
                    <span className="truncate">{getMasteryStatusLabel(status)}</span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={flip}
                  title="Lật thẻ (Space)"
                  className="flex h-9 px-4 items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 active:scale-95 transition-all text-xs font-semibold"
                >
                  <RotateCw size={13} /> <span>Lật xem mặt sau</span>
                </button>
              )}
            </div>

            <button
              type="button"
              data-no-swipe="true"
              onClick={next}
              title="Từ tiếp theo (→)"
              aria-label="Từ tiếp theo"
              className="flex h-9 px-3 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium shrink-0"
            >
              <span className="hidden sm:inline">Tiếp</span> <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          /* ── THANH ĐIỀU KHIỂN ĐẦY ĐỦ CHO PORTRAIT ── */
          <>
            {/* Hướng dẫn cử chỉ trên Mobile */}
            <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-800/80 border border-slate-700/60 rounded-full px-3.5 py-0.5 sm:hidden">
              <span>👆 Vuốt lên/xuống để lật</span>
              <span className="text-slate-600">•</span>
              <span>👈 👉 Vuốt để chuyển từ</span>
            </div>

            {/* Nút Đánh giá (khi đã lật thẻ) */}
            <div className="w-full max-w-xl">
              {hasViewedBack ? (
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {evalButtons.map(({ status, color }) => (
                    <button
                      key={status}
                      type="button"
                      data-no-swipe="true"
                      onClick={() => evaluate(status)}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl py-2 px-1 text-[11px] sm:text-xs font-semibold shadow-xs active:scale-95 transition-all ${color}`}
                    >
                      <Eye size={13} className="shrink-0" />
                      <span className="truncate">{getMasteryStatusLabel(status)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-800/70 border border-slate-700/60 py-2 px-3 text-xs text-slate-400">
                  <EyeOff size={15} className="text-slate-500 shrink-0" />
                  <span>Vuốt lên hoặc chạm thẻ để xem mặt sau trước khi đánh giá</span>
                </div>
              )}

              {/* Navigation Controls */}
              <div className="mt-2 flex items-center justify-between w-full pt-1">
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={prev}
                  title="Từ trước (←)"
                  aria-label="Từ trước"
                  className="flex h-10 px-3 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium"
                >
                  <ChevronLeft size={16} /> <span>Trước</span>
                </button>

                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={flip}
                  title="Lật thẻ (Space)"
                  className="flex h-10 px-4 items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 active:scale-95 transition-all text-xs font-semibold"
                >
                  <RotateCw size={14} /> <span>Lật thẻ</span>
                </button>

                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={next}
                  title="Từ tiếp theo (→)"
                  aria-label="Từ tiếp theo"
                  className="flex h-10 px-3 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium"
                >
                  <span>Tiếp</span> <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
