import { useState, useEffect, useCallback, useRef } from 'react';
import type { Lesson, FlashcardSettings, MasteryStatus } from '@/types';
import { getMasteryStatusLabel } from '@/storage';
import { useViewportSize } from '@/hooks/useViewportSize';
import type { GrammarStudyGroup, GrammarSessionEvaluationRecord } from '@/lib/grammarStudyGroupService';
import {
  GRAMMAR_STUDY_GROUP_CONFIGS,
  GRAMMAR_STUDY_GROUP_KEYS,
  getGrammarStudyGroupLabel,
  shouldRemoveGrammarFromSession,
  summarizeCompletedGrammarSession,
  calculateGrammarNextReviewAt,
} from '@/lib/grammarStudyGroupService';
import {
  Volume2, ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff,
  BookOpen, RotateCw, Sparkles, X, ChevronDown,
  HelpCircle, Layers, PenLine
} from 'lucide-react';

/**
 * Kiểm tra xem phần tử được chạm có phải là control tương tác hay không
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

interface GrammarFlashcardProps {
  lessons: Lesson[];
  settings: FlashcardSettings;
  onEvaluate: (lesson: Lesson, status: MasteryStatus) => Promise<boolean | void> | boolean | void;
  onFlipBack?: (lessonId: string) => void;
  viewedBackIds: Set<string>;
  onClose?: () => void;
  studyGroup?: GrammarStudyGroup;
  onChangeStudyGroup?: (newGroup: GrammarStudyGroup) => void;
  groupCounts?: Record<GrammarStudyGroup, number>;
  onBackToGroupPicker?: () => void;
}

/**
 * Hiển thị 1 thẻ Ngữ pháp (Mặt trước & Mặt sau)
 */
function GrammarCardItemView({
  lesson,
  flipped = false,
  isCurrent = false,
  speakText,
  speakCurrent,
  isCompactLandscape,
}: {
  lesson: Lesson;
  flipped?: boolean;
  isCurrent?: boolean;
  speakText: (text: string, e?: React.MouseEvent) => void;
  speakCurrent: (e: React.MouseEvent) => void;
  isCompactLandscape: boolean;
}) {
  return (
    <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
      {/* ─── MẶT TRƯỚC ───────────────────────────────────────── */}
      <div className={`flashcard-face flashcard-front flex flex-col justify-between rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-850 to-slate-900 shadow-2xl transition-shadow text-slate-100 ${
        isCompactLandscape ? 'p-3.5 sm:p-4' : 'p-5 sm:p-7'
      }`}>
        {/* Top Front */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-no-swipe="true"
              onClick={isCurrent ? speakCurrent : undefined}
              aria-label="Phát âm mẫu ngữ pháp"
              title="Phát âm tiếng Nhật"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 active:scale-95 transition-all shadow-sm"
            >
              <Volume2 size={18} />
            </button>
            <span className="rounded-lg bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 text-xs font-bold text-indigo-300">
              Ngữ pháp
            </span>
          </div>

          {lesson.source && (
            <span className="text-[11px] text-slate-400 font-mono">
              {lesson.source}
            </span>
          )}
        </div>

        {/* Center: Mẫu ngữ pháp & Ý nghĩa rút gọn */}
        <div className="my-auto py-4 text-center">
          <h2 className="font-jp text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-wide leading-snug drop-shadow-sm px-2">
            {lesson.title}
          </h2>

          <div className="mt-4 inline-block max-w-lg rounded-2xl bg-indigo-950/40 border border-indigo-500/30 px-4 py-2 text-indigo-200 text-sm sm:text-base font-medium">
            {lesson.meaning || 'Chưa có ý nghĩa tiếng Việt'}
          </div>

          {lesson.connectionRule && (
            <div className="mt-3 text-xs sm:text-sm text-slate-300 font-mono bg-slate-800/80 rounded-xl px-3 py-1.5 border border-slate-700 inline-block max-w-md">
              <span className="text-slate-400 mr-1.5">Kết hợp:</span>
              <span className="text-amber-300 font-semibold">{lesson.connectionRule}</span>
            </div>
          )}
        </div>

        {/* Bottom Front Hint */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 border-t border-slate-700/60 pt-3">
          <RotateCw size={13} className="text-indigo-400" />
          <span>Chạm hoặc vuốt lên để xem giải thích chi tiết & ví dụ</span>
        </div>
      </div>

      {/* ─── MẶT SAU ────────────────────────────────────────── */}
      <div className={`flashcard-face flashcard-back flex flex-col justify-between rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-850 via-slate-900 to-slate-950 shadow-2xl transition-shadow text-slate-100 ${
        isCompactLandscape ? 'p-3' : 'p-4 sm:p-6'
      }`}>
        {/* Top Back Header */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-jp font-bold text-white text-base sm:text-lg truncate">
              {lesson.title}
            </span>
            <span className="text-xs text-indigo-300 shrink-0">
              — {lesson.meaning}
            </span>
          </div>

          <button
            type="button"
            data-no-swipe="true"
            onClick={isCurrent ? speakCurrent : undefined}
            title="Phát âm"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 active:scale-95 transition-all"
          >
            <Volume2 size={16} />
          </button>
        </div>

        {/* Center: Scroll Area chứa chi tiết bài học */}
        <div
          data-scroll-container="true"
          className="flex-1 min-h-0 overflow-y-auto space-y-3.5 my-2 pr-1 text-left custom-scrollbar"
        >
          {/* Cấu trúc kết hợp */}
          {lesson.connectionRule && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
              <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                Quy tắc kết hợp
              </span>
              <p className="font-mono text-xs sm:text-sm text-amber-300 font-medium">
                {lesson.connectionRule}
              </p>
            </div>
          )}

          {/* Lưu ý & Giải thích */}
          {lesson.notes && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Giải thích & Lưu ý
              </span>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {lesson.notes}
              </p>
            </div>
          )}

          {/* Phân biệt */}
          {lesson.distinction && (
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                Điểm phân biệt / Dễ nhầm
              </span>
              <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed whitespace-pre-line">
                {lesson.distinction}
              </p>
            </div>
          )}

          {/* Danh sách câu ví dụ thực tế */}
          {lesson.examples && lesson.examples.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Sparkles size={14} className="text-indigo-400" />
                <span>Ví dụ minh họa ({lesson.examples.length})</span>
              </div>

              {lesson.examples.map((ex, idx) => (
                <div key={idx} className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-jp text-xs sm:text-sm font-semibold text-slate-150 leading-relaxed">
                      {ex.japanese}
                    </p>
                    <button
                      type="button"
                      data-no-swipe="true"
                      onClick={(e) => speakText(ex.japanese, e)}
                      title="Phát âm ví dụ"
                      className="shrink-0 p-1 text-slate-400 hover:text-indigo-400 transition-colors"
                    >
                      <Volume2 size={15} />
                    </button>
                  </div>
                  {ex.analysis && (
                    <p className="font-jp mt-0.5 text-xs text-indigo-400">
                      {ex.analysis}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-emerald-400 font-medium">
                    {ex.vietnamese}
                  </p>
                  {ex.note && (
                    <p className="mt-0.5 text-[11px] text-slate-400 italic">
                      Lưu ý: {ex.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bài tập ngắn nếu có */}
          {lesson.exercises && lesson.exercises.length > 0 && (
            <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 mb-2">
                <PenLine size={14} />
                <span>Bài tập vận dụng nhanh ({lesson.exercises.length} câu)</span>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                {lesson.exercises.slice(0, 3).map((ex, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                    <p className="font-medium text-slate-200">Câu {ex.stt}: {ex.question}</p>
                    {ex.hint && (
                      <p className="mt-1 text-[11px] text-amber-400 italic">Gợi ý: {ex.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Back */}
        <div className="flex items-center justify-center gap-1 text-xs text-slate-400 border-t border-slate-700/80 pt-2 shrink-0">
          <RotateCw size={12} className="text-slate-400" />
          <span>Chạm hoặc vuốt xuống để lật về mặt trước</span>
        </div>
      </div>
    </div>
  );
}

export function GrammarFlashcard({
  lessons,
  settings,
  onEvaluate,
  onFlipBack,
  viewedBackIds,
  onClose,
  studyGroup = 'all',
  onChangeStudyGroup,
  groupCounts,
  onBackToGroupPicker,
}: GrammarFlashcardProps) {
  const [sessionQueue, setSessionQueue] = useState<Lesson[]>(lessons);
  const [order, setOrder] = useState<number[]>(() => lessons.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeHint, setSwipeHint] = useState<'flip-front' | 'flip-back' | 'prev' | 'next' | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<GrammarSessionEvaluationRecord[]>([]);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const [showGroupSwitcher, setShowGroupSwitcher] = useState<boolean>(false);

  const { orientation, isCompactLandscape } = useViewportSize();

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentCardRef = useRef<HTMLDivElement | null>(null);

  // Gesture tracking refs
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
  const isTransitioningRef = useRef<boolean>(false);

  // Khử ghost click / double flip
  const suppressNextClickRef = useRef<boolean>(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSuppressNextClick = useCallback(() => {
    suppressNextClickRef.current = true;
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    setSessionQueue(lessons);
    setOrder(lessons.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    setEvaluationHistory([]);
    setIsCompleted(false);
    if (trackRef.current) {
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      trackRef.current.style.transition = 'none';
    }
  }, [lessons, studyGroup]);

  // Khóa cuộn trang nền
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
    };
  }, []);

  useEffect(() => {
    if (trackRef.current && !isDraggingRef.current && !isTransitioningRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [orientation, isCompactLandscape]);

  const currentIdx = order[pos];
  const current = sessionQueue[currentIdx];

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
    const text = current?.title || '';
    speakText(text, e);
  }, [current, speakText]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && current && onFlipBack) onFlipBack(current.id);
      return !f;
    });
  }, [current, onFlipBack]);

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

  // ─── Touch Gestures ──────────────────────────────────────────────
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

    if (trackRef.current) trackRef.current.style.transition = 'none';
    if (currentCardRef.current) currentCardRef.current.style.transition = 'none';
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

    if (directionLockedRef.current === null && (absX > 12 || absY > 12)) {
      if (absX > absY * 1.25) {
        directionLockedRef.current = 'horizontal';
      } else if (absY > absX * 1.25) {
        directionLockedRef.current = 'vertical';
      }
    }

    if (inScrollAreaRef.current && directionLockedRef.current === 'vertical') {
      return;
    }

    if (directionLockedRef.current === 'horizontal' && sessionQueue.length > 1 && trackRef.current) {
      trackRef.current.style.transform = `translate3d(${deltaX}px, 0, 0)`;
      if (deltaX < -30) setSwipeHint('next');
      else if (deltaX > 30) setSwipeHint('prev');
      else setSwipeHint(null);
    } else if (directionLockedRef.current === 'vertical' && currentCardRef.current) {
      if (!flipped && deltaY < 0) {
        currentCardRef.current.style.transform = `translate3d(0, ${deltaY * 0.3}px, 0)`;
        setSwipeHint('flip-back');
      } else if (flipped && deltaY > 0) {
        currentCardRef.current.style.transform = `translate3d(0, ${deltaY * 0.3}px, 0)`;
        setSwipeHint('flip-front');
      }
    }
  };

  const handleTouchEnd = () => {
    if (startedOnInteractiveRef.current || !isDraggingRef.current) {
      isDraggingRef.current = false;
      activeTouchIdRef.current = null;
      return;
    }

    isDraggingRef.current = false;
    activeTouchIdRef.current = null;
    setSwipeHint(null);

    const deltaX = currentDeltaXRef.current;
    const deltaY = currentDeltaYRef.current;
    const duration = Date.now() - startTimeRef.current;
    const distance = Math.hypot(deltaX, deltaY);
    let gestureHandled = false;

    if (trackRef.current) {
      trackRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
    }
    if (currentCardRef.current) {
      currentCardRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
      currentCardRef.current.style.transform = 'translate3d(0, 0, 0)';
    }

    if (directionLockedRef.current === 'horizontal' && sessionQueue.length > 1) {
      const isQuickSwipe = Math.abs(deltaX) > 40 && duration < 320;
      const isLongSwipe = Math.abs(deltaX) > 90;
      if (isQuickSwipe || isLongSwipe) {
        if (deltaX < 0) {
          next();
          gestureHandled = true;
        } else {
          prev();
          gestureHandled = true;
        }
      } else if (trackRef.current) {
        trackRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    } else if (directionLockedRef.current === 'vertical') {
      const isQuickY = Math.abs(deltaY) > 35 && duration < 320;
      const isLongY = Math.abs(deltaY) > 80;
      if (isQuickY || isLongY) {
        if (!flipped && deltaY < 0) {
          flip();
          gestureHandled = true;
        } else if (flipped && deltaY > 0) {
          flip();
          gestureHandled = true;
        }
      }
    }

    // Tap to flip
    if (!gestureHandled && !isTransitioningRef.current && distance <= 12 && duration <= 350) {
      flip();
      gestureHandled = true;
    }

    if (gestureHandled) {
      setSuppressNextClick();
    }
  };

  const handleTouchCancel = () => {
    isDraggingRef.current = false;
    activeTouchIdRef.current = null;
    setSwipeHint(null);
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
    if (currentCardRef.current) {
      currentCardRef.current.style.transition = 'none';
      currentCardRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
      return;
    }
    if (isInteractiveChild(e.target)) return;
    flip();
  };

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

  // Completion State
  if (isCompleted) {
    const summary = summarizeCompletedGrammarSession(lessons, evaluationHistory);
    const activeLabel = getGrammarStudyGroupLabel(studyGroup || 'all');

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4 select-none"
        style={{ height: '100dvh' }}
      >
        <div className="w-full max-w-md bg-slate-850 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-scale-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 mb-4 shadow-inner">
            <Sparkles size={36} />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
            Hoàn thành nhóm {activeLabel}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-6">
            Bạn đã ôn tập xong tất cả các mẫu ngữ pháp trong phiên học này.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-6 text-left">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[11px] text-slate-400 block">Số bài đã học</span>
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
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
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

  // Empty State
  if (sessionQueue.length === 0) {
    const activeLabel = getGrammarStudyGroupLabel(studyGroup || 'all');
    const unlearnedCount = groupCounts?.unlearned ?? 0;

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4 select-none"
        style={{ height: '100dvh' }}
      >
        <div className="w-full max-w-md bg-slate-850 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-scale-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 mb-4 shadow-inner">
            <BookOpen size={32} />
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
            Bạn chưa có mẫu ngữ pháp nào trong nhóm {activeLabel}.
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-6">
            Hãy chọn một nhóm khác hoặc bắt đầu học các mẫu ngữ pháp chưa học.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (onBackToGroupPicker) onBackToGroupPicker();
                else if (onClose) onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Layers size={16} />
              <span>Chọn nhóm khác</span>
            </button>

            {unlearnedCount > 0 && studyGroup !== 'unlearned' && onChangeStudyGroup && (
              <button
                type="button"
                onClick={() => onChangeStudyGroup('unlearned')}
                className="w-full py-2.5 px-4 rounded-xl border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 text-xs font-semibold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <HelpCircle size={15} />
                <span>Học mẫu chưa học ({unlearnedCount} bài)</span>
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

    const evaluatedLesson = current;
    try {
      const result = await onEvaluate(evaluatedLesson, status);
      if (result === false) {
        alert('Lưu tiến độ không thành công. Vui lòng thử lại.');
        isSavingRef.current = false;
        setIsSaving(false);
        return;
      }

      setEvaluationHistory((prevHist) => [
        ...prevHist,
        {
          lessonId: evaluatedLesson.id,
          previousStatus: 'new',
          newStatus: status,
        },
      ]);

      const nextReviewAt = calculateGrammarNextReviewAt(status);
      const activeGroup = studyGroup || 'all';
      const shouldRemove = shouldRemoveGrammarFromSession(activeGroup, status, nextReviewAt);

      if (shouldRemove) {
        const newQueue = sessionQueue.filter((l) => l.id !== evaluatedLesson.id);
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
      console.error('Lỗi khi đánh giá bài ngữ pháp:', err);
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
      {/* ─── Top Bar Toàn Màn Hình ─── */}
      <header className={`shrink-0 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur flex items-center justify-between z-20 ${
        isCompactLandscape ? 'h-10 sm:h-11' : 'h-14 sm:px-6'
      }`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-no-swipe="true"
            onClick={onClose}
            aria-label="Đóng chế độ học"
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
              aria-label={`Nhóm: ${getGrammarStudyGroupLabel(studyGroup || 'all')}. Bấm để chuyển nhóm`}
              className={`flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-750 active:scale-95 transition-all disabled:opacity-50 ${
                isCompactLandscape ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
              }`}
            >
              <span className="text-slate-400 hidden sm:inline">Nhóm:</span>
              <span className="font-bold text-indigo-400">{getGrammarStudyGroupLabel(studyGroup || 'all')}</span>
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
                      className="text-[11px] text-indigo-400 hover:underline"
                    >
                      Màn hình chọn nhóm
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar">
                  {GRAMMAR_STUDY_GROUP_KEYS.map((gKey) => {
                    const cfg = GRAMMAR_STUDY_GROUP_CONFIGS[gKey];
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
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{cfg.label}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCurrent ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
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
            Học Ngữ pháp
          </p>
          <p className="text-[11px] font-medium text-slate-400">
            Mẫu {pos + 1} / {sessionQueue.length} <span className="text-slate-600">•</span> Đã xem: {totalReviewed}
          </p>
        </div>

        <button
          type="button"
          data-no-swipe="true"
          onClick={shuffle}
          aria-label="Xáo trộn thứ tự"
          title="Xáo trộn"
          className={`flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all ${
            isCompactLandscape ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-11 w-11'
          }`}
        >
          <Shuffle size={isCompactLandscape ? 16 : 18} />
        </button>
      </header>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-slate-800/80 shrink-0">
        <div
          className="h-full bg-indigo-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Track Container */}
      <main className={`flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden relative mx-auto ${
        isCompactLandscape ? 'max-w-5xl' : 'max-w-xl'
      }`}>
        {swipeHint && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none animate-scale-in">
            {swipeHint === 'flip-back' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-indigo-500/40">
                <RotateCw size={15} className="text-indigo-400" />
                <span>Xem giải thích & ví dụ</span>
              </div>
            )}
            {swipeHint === 'flip-front' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-indigo-500/40">
                <RotateCw size={15} className="text-indigo-400" />
                <span>Lật về mặt trước</span>
              </div>
            )}
            {swipeHint === 'prev' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-indigo-500/40">
                <ChevronLeft size={16} className="text-indigo-400" />
                <span>Mẫu trước</span>
              </div>
            )}
            {swipeHint === 'next' && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-sm border border-indigo-500/40">
                <span>Mẫu tiếp theo</span>
                <ChevronRight size={16} className="text-indigo-400" />
              </div>
            )}
          </div>
        )}

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
              : 'h-[540px] max-h-[calc(100dvh-200px)]'
          }`}
          style={{ transform: 'translate3d(0, 0, 0)', willChange: 'transform' }}
        >
          {sessionQueue.length > 1 && prevItem && (
            <div
              className="flashcard-3d absolute top-0 w-full h-full pointer-events-none select-none"
              style={{ left: 'calc(-100% - 16px)' }}
              aria-hidden="true"
            >
              <GrammarCardItemView
                lesson={prevItem}
                flipped={false}
                isCurrent={false}
                speakText={speakText}
                speakCurrent={speakCurrent}
                isCompactLandscape={isCompactLandscape}
              />
            </div>
          )}

          <div
            ref={currentCardRef}
            className="flashcard-3d absolute top-0 left-0 w-full h-full"
            role="button"
            tabIndex={0}
            aria-label={`Mẫu ngữ pháp: ${current.title}. Vuốt lên để xem giải thích.`}
          >
            <GrammarCardItemView
              lesson={current}
              flipped={flipped}
              isCurrent={true}
              speakText={speakText}
              speakCurrent={speakCurrent}
              isCompactLandscape={isCompactLandscape}
            />
          </div>

          {sessionQueue.length > 1 && nextItem && (
            <div
              className="flashcard-3d absolute top-0 w-full h-full pointer-events-none select-none"
              style={{ left: 'calc(100% + 16px)' }}
              aria-hidden="true"
            >
              <GrammarCardItemView
                lesson={nextItem}
                flipped={false}
                isCurrent={false}
                speakText={speakText}
                speakCurrent={speakCurrent}
                isCompactLandscape={isCompactLandscape}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer Controls & Evaluation Buttons */}
      <footer className={`shrink-0 border-t border-slate-800 bg-slate-900/95 px-3 z-20 flex flex-col items-center ${
        isCompactLandscape ? 'py-1.5' : 'py-2.5 sm:px-6'
      }`}>
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
              <span>Vuốt lên hoặc chạm thẻ để xem giải thích & ví dụ trước khi đánh giá</span>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-2 flex items-center justify-between w-full pt-1">
            <button
              type="button"
              data-no-swipe="true"
              onClick={prev}
              title="Mẫu trước (←)"
              aria-label="Mẫu trước"
              className="flex h-10 px-3 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium"
            >
              <ChevronLeft size={16} /> <span>Trước</span>
            </button>

            <button
              type="button"
              data-no-swipe="true"
              onClick={flip}
              title="Lật thẻ (Space)"
              className="flex h-10 px-4 items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 active:scale-95 transition-all text-xs font-semibold"
            >
              <RotateCw size={14} /> <span>{flipped ? 'Mặt trước' : 'Giải thích & Ví dụ'}</span>
            </button>

            <button
              type="button"
              data-no-swipe="true"
              onClick={next}
              title="Mẫu tiếp theo (→)"
              aria-label="Mẫu tiếp theo"
              className="flex h-10 px-3 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 active:scale-95 transition-all text-xs font-medium"
            >
              <span>Tiếp</span> <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
