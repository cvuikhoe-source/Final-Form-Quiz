import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Lesson, ExamQuestion, ExamQuestionProgress, User } from '@/types';
import {
  loadExamQuestions,
  loadExamQuestionProgress,
  saveExamQuestionProgress,
  resetExamQuestionProgress,
} from '@/storage';
import { toast } from '@/components/Toast';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Volume2,
  Grid,
  Check,
  X,
  Play,
  Pause,
  AlertCircle,
  Lock,
  Columns2,
  Rows2,
  PanelsTopLeft,
} from 'lucide-react';

interface VocabExamStudyViewProps {
  lesson: Lesson;
  currentUser: User;
  canManage: boolean;
  completed?: boolean;
  onBack: () => void;
  onMarkDone?: (lessonId: string) => void;
}

export type VocabExamLayoutMode = 'auto' | 'vertical' | 'horizontal';

const STORAGE_LAYOUT_MODE_KEY = 'vocabExamLayoutMode';
const STORAGE_VERTICAL_SPLIT_KEY = 'vocabExamVerticalSplitPercent';
const STORAGE_HORIZONTAL_SPLIT_KEY = 'vocabExamHorizontalSplitPercent';

const DEFAULT_VERTICAL_SPLIT = 55;
const MIN_VERTICAL_SPLIT = 30;
const MAX_VERTICAL_SPLIT = 75;

const DEFAULT_HORIZONTAL_SPLIT = 50;
const MIN_HORIZONTAL_SPLIT = 35;
const MAX_HORIZONTAL_SPLIT = 70;

const OPTION_SHAPES: Record<'A' | 'B' | 'C' | 'D', { shape: string; label: string }> = {
  A: { shape: '▲', label: 'Tam giác' },
  B: { shape: '◆', label: 'Thoi' },
  C: { shape: '●', label: 'Tròn' },
  D: { shape: '■', label: 'Vuông' },
};

function getStoredLayoutMode(): VocabExamLayoutMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(STORAGE_LAYOUT_MODE_KEY);
    if (raw === 'vertical' || raw === 'horizontal' || raw === 'auto') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'auto';
}

function saveStoredLayoutMode(mode: VocabExamLayoutMode) {
  try {
    localStorage.setItem(STORAGE_LAYOUT_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

function getStoredVerticalSplit(): number {
  if (typeof window === 'undefined') return DEFAULT_VERTICAL_SPLIT;
  try {
    const raw = localStorage.getItem(STORAGE_VERTICAL_SPLIT_KEY);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        return Math.min(MAX_VERTICAL_SPLIT, Math.max(MIN_VERTICAL_SPLIT, Math.round(val)));
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_VERTICAL_SPLIT;
}

function saveStoredVerticalSplit(val: number) {
  try {
    localStorage.setItem(STORAGE_VERTICAL_SPLIT_KEY, String(Math.round(val)));
  } catch {
    // ignore
  }
}

function getStoredHorizontalSplit(): number {
  if (typeof window === 'undefined') return DEFAULT_HORIZONTAL_SPLIT;
  try {
    const raw = localStorage.getItem(STORAGE_HORIZONTAL_SPLIT_KEY);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        return Math.min(MAX_HORIZONTAL_SPLIT, Math.max(MIN_HORIZONTAL_SPLIT, Math.round(val)));
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_HORIZONTAL_SPLIT;
}

function saveStoredHorizontalSplit(val: number) {
  try {
    localStorage.setItem(STORAGE_HORIZONTAL_SPLIT_KEY, String(Math.round(val)));
  } catch {
    // ignore
  }
}

function getAutoOrientationLayout(): 'vertical' | 'horizontal' {
  if (typeof window === 'undefined') return 'vertical';
  if (window.innerWidth >= 1024) return 'horizontal';
  const isLandscape =
    window.matchMedia('(orientation: landscape)').matches || window.innerWidth > window.innerHeight;
  return isLandscape ? 'horizontal' : 'vertical';
}

export function VocabExamStudyView({
  lesson,
  currentUser,
  completed = false,
  onBack,
  onMarkDone,
}: VocabExamStudyViewProps) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ExamQuestionProgress>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [filterWrongOnly, setFilterWrongOnly] = useState(false);

  // Layout preference and split percentages
  const [layoutMode, setLayoutMode] = useState<VocabExamLayoutMode>(getStoredLayoutMode);
  const [autoDetectedLayout, setAutoDetectedLayout] = useState<'vertical' | 'horizontal'>(getAutoOrientationLayout);
  const [verticalSplit, setVerticalSplit] = useState<number>(getStoredVerticalSplit);
  const [horizontalSplit, setHorizontalSplit] = useState<number>(getStoredHorizontalSplit);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState<boolean>(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });

  // Effective layout mode
  const effectiveLayout: 'vertical' | 'horizontal' = layoutMode === 'auto' ? autoDetectedLayout : layoutMode;

  // Refs
  const studyAreaRef = useRef<HTMLDivElement>(null);
  const questionPaneRef = useRef<HTMLDivElement>(null);
  const analysisPaneRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastTapRef = useRef<number>(0);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-detection orientation listener (only switches when orientation actually changes)
  useEffect(() => {
    const mqlOrientation = window.matchMedia('(orientation: landscape)');
    const mqlDesktop = window.matchMedia('(min-width: 1024px)');

    const updateAuto = () => {
      setAutoDetectedLayout(getAutoOrientationLayout());
      setIsNarrowScreen(window.innerWidth < 640);
    };

    if (mqlOrientation.addEventListener) {
      mqlOrientation.addEventListener('change', updateAuto);
      mqlDesktop.addEventListener('change', updateAuto);
    } else {
      mqlOrientation.addListener(updateAuto);
      mqlDesktop.addListener(updateAuto);
    }

    window.addEventListener('resize', updateAuto);

    return () => {
      if (mqlOrientation.removeEventListener) {
        mqlOrientation.removeEventListener('change', updateAuto);
        mqlDesktop.removeEventListener('change', updateAuto);
      } else {
        mqlOrientation.removeListener(updateAuto);
        mqlDesktop.removeListener(updateAuto);
      }
      window.removeEventListener('resize', updateAuto);
    };
  }, []);

  // Close layout menu on click outside or Escape
  useEffect(() => {
    if (!showLayoutMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setShowLayoutMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLayoutMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLayoutMenu]);

  // Load questions and saved progress
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [loadedQuestions, loadedProgress] = await Promise.all([
          loadExamQuestions(lesson.id),
          loadExamQuestionProgress(currentUser.id, lesson.id),
        ]);

        if (!isMounted) return;

        setQuestions(loadedQuestions);
        setProgressMap(loadedProgress);

        // Tìm câu đầu tiên chưa làm
        const firstUnanswered = loadedQuestions.findIndex(
          (q) => !loadedProgress[q.id]?.selectedOption
        );
        if (firstUnanswered >= 0) {
          setCurrentIndex(firstUnanswered);
        } else if (loadedQuestions.length > 0 && Object.keys(loadedProgress).length > 0) {
          setShowSummary(true);
        }
      } catch (err) {
        console.error(err);
        toast('Không thể tải dữ liệu câu hỏi luyện thi', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [lesson.id, currentUser.id]);

  // Bộ lọc câu hỏi (nếu bật chế độ xem lại câu sai)
  const displayQuestions = useMemo(() => {
    if (!filterWrongOnly) return questions;
    return questions.filter((q) => {
      const p = progressMap[q.id];
      return p && !p.isCorrect;
    });
  }, [questions, progressMap, filterWrongOnly]);

  const currentQuestion: ExamQuestion | undefined = displayQuestions[currentIndex];
  const currentProgress: ExamQuestionProgress | undefined = currentQuestion
    ? progressMap[currentQuestion.id]
    : undefined;
  const isAnswered = Boolean(currentProgress?.selectedOption);

  // Reset scroll to top on both panes when changing question
  useEffect(() => {
    questionPaneRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    analysisPaneRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentIndex]);

  // Reset timer mỗi khi đổi câu
  useEffect(() => {
    if (!currentQuestion) return;
    if (isAnswered) {
      setIsTimerRunning(false);
    } else {
      setTimeRemaining(currentQuestion.timeSeconds || 30);
      setIsTimerRunning(true);
    }
  }, [currentQuestion, isAnswered]);

  // Bộ đếm thời gian
  useEffect(() => {
    if (!isTimerRunning || isAnswered || timeRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, isAnswered, timeRemaining]);

  // Phát âm tiếng Nhật Web Speech API
  const speakJapanese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'ja-JP';
      utt.rate = 0.9;
      window.speechSynthesis.speak(utt);
    } catch {
      // ignore
    }
  }, []);

  // Xử lý chọn đáp án
  const handleSelectOption = useCallback(
    async (option: 'A' | 'B' | 'C' | 'D') => {
      if (!currentQuestion || isAnswered) return;

      const isCorrect = option === currentQuestion.correctAnswer;
      const spent = (currentQuestion.timeSeconds || 30) - timeRemaining;

      const newProgress: ExamQuestionProgress = {
        userId: currentUser.id,
        lessonId: lesson.id,
        questionId: currentQuestion.id,
        selectedOption: option,
        isCorrect,
        timeSpent: Math.max(1, spent),
        completedAt: new Date().toISOString(),
      };

      const nextMap = {
        ...progressMap,
        [currentQuestion.id]: newProgress,
      };

      setProgressMap(nextMap);
      setIsTimerRunning(false);

      // Check threshold for completion
      const answeredCount = Object.values(nextMap).filter((p) => p.selectedOption).length;
      if (answeredCount === questions.length) {
        const correctCount = Object.values(nextMap).filter((p) => p.isCorrect).length;
        if (onMarkDone && correctCount / questions.length >= 0.8) {
          onMarkDone(lesson.id);
        }
      }

      try {
        await saveExamQuestionProgress(newProgress);
      } catch (err) {
        console.error(err);
      }
    },
    [currentQuestion, isAnswered, timeRemaining, currentUser.id, lesson.id, progressMap, questions.length, onMarkDone]
  );

  // Làm lại câu hiện tại
  const handleRetryCurrent = useCallback(async () => {
    if (!currentQuestion) return;

    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[currentQuestion.id];
      return next;
    });

    setTimeRemaining(currentQuestion.timeSeconds || 30);
    setIsTimerRunning(true);

    try {
      await saveExamQuestionProgress({
        userId: currentUser.id,
        lessonId: lesson.id,
        questionId: currentQuestion.id,
        selectedOption: null,
        isCorrect: false,
        timeSpent: 0,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    }
  }, [currentQuestion, currentUser.id, lesson.id]);

  // Làm lại toàn bộ đề thi
  const handleResetAll = useCallback(async () => {
    if (!confirm('Bạn có chắc chắn muốn làm lại toàn bộ đề thi từ đầu? Dữ liệu câu trả lời sẽ được đặt lại.')) return;
    try {
      await resetExamQuestionProgress(currentUser.id, lesson.id);
      setProgressMap({});
      setCurrentIndex(0);
      setShowSummary(false);
      setFilterWrongOnly(false);
      toast('Đã làm mới toàn bộ tiến độ làm bài', 'info');
    } catch (err) {
      console.error(err);
      toast('Lỗi khi làm mới tiến độ', 'error');
    }
  }, [currentUser.id, lesson.id]);

  // Thống kê kết quả
  const stats = useMemo(() => {
    const total = questions.length;
    let answered = 0;
    let correct = 0;
    for (const q of questions) {
      const p = progressMap[q.id];
      if (p?.selectedOption) {
        answered++;
        if (p.isCorrect) correct++;
      }
    }
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, answered, correct, percent, wrong: answered - correct };
  }, [questions, progressMap]);

  // Chọn bố cục
  const handleSelectLayoutMode = (mode: VocabExamLayoutMode) => {
    setLayoutMode(mode);
    saveStoredLayoutMode(mode);
    setShowLayoutMenu(false);
  };

  // ─── POINTER RESIZING LOGIC ────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    isDraggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !studyAreaRef.current) return;
    e.preventDefault();
    const rect = studyAreaRef.current.getBoundingClientRect();

    if (effectiveLayout === 'vertical') {
      if (rect.height <= 0) return;
      const relativeY = e.clientY - rect.top;
      const newPercent = (relativeY / rect.height) * 100;
      const clamped = Math.min(MAX_VERTICAL_SPLIT, Math.max(MIN_VERTICAL_SPLIT, newPercent));
      setVerticalSplit(clamped);
      saveStoredVerticalSplit(clamped);
    } else {
      if (rect.width <= 0) return;
      const relativeX = e.clientX - rect.left;
      const newPercent = (relativeX / rect.width) * 100;
      const clamped = Math.min(MAX_HORIZONTAL_SPLIT, Math.max(MIN_HORIZONTAL_SPLIT, newPercent));
      setHorizontalSplit(clamped);
      saveStoredHorizontalSplit(clamped);
    }

    if (isCollapsed) setIsCollapsed(false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleResetSplit = () => {
    if (effectiveLayout === 'vertical') {
      setVerticalSplit(DEFAULT_VERTICAL_SPLIT);
      saveStoredVerticalSplit(DEFAULT_VERTICAL_SPLIT);
    } else {
      setHorizontalSplit(DEFAULT_HORIZONTAL_SPLIT);
      saveStoredHorizontalSplit(DEFAULT_HORIZONTAL_SPLIT);
    }
    setIsCollapsed(false);
  };

  const handleTouchEndHandle = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleResetSplit();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (effectiveLayout === 'vertical') {
      let newPercent = verticalSplit;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        newPercent = Math.max(MIN_VERTICAL_SPLIT, verticalSplit - 2);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        newPercent = Math.min(MAX_VERTICAL_SPLIT, verticalSplit + 2);
      } else if (e.key === 'Home') {
        e.preventDefault();
        newPercent = MIN_VERTICAL_SPLIT;
      } else if (e.key === 'End') {
        e.preventDefault();
        newPercent = MAX_VERTICAL_SPLIT;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        newPercent = DEFAULT_VERTICAL_SPLIT;
      } else {
        return;
      }
      setVerticalSplit(newPercent);
      saveStoredVerticalSplit(newPercent);
      setIsCollapsed(false);
    } else {
      let newPercent = horizontalSplit;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newPercent = Math.max(MIN_HORIZONTAL_SPLIT, horizontalSplit - 2);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        newPercent = Math.min(MAX_HORIZONTAL_SPLIT, horizontalSplit + 2);
      } else if (e.key === 'Home') {
        e.preventDefault();
        newPercent = MIN_HORIZONTAL_SPLIT;
      } else if (e.key === 'End') {
        e.preventDefault();
        newPercent = MAX_HORIZONTAL_SPLIT;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        newPercent = DEFAULT_HORIZONTAL_SPLIT;
      } else {
        return;
      }
      setHorizontalSplit(newPercent);
      saveStoredHorizontalSplit(newPercent);
      setIsCollapsed(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-30 bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600 text-sm font-medium animate-pulse">
          Đang chuẩn bị đề luyện thi Từ vựng...
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-30 bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Chưa có câu hỏi luyện thi</h2>
        <p className="text-slate-500 text-sm max-w-md mb-6">
          Bài học này hiện chưa có câu hỏi nào. Vui lòng nhập đề từ file Excel bằng chức năng &quot;Nhập đề luyện thi&quot;.
        </p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          Quay lại danh sách bài học
        </button>
      </div>
    );
  }

  // ─── MÀN HÌNH TỔNG KẾT ───
  if (showSummary) {
    return (
      <div className="fixed inset-0 z-30 bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col overflow-y-auto">
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Danh sách bài học
            </button>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tổng kết kết quả luyện thi Từ vựng
            </span>
          </div>
        </div>

        <div className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-6">
            <div className="relative inline-block">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-lg bg-emerald-100 text-emerald-600 shadow-emerald-200">
                <Trophy className="w-12 h-12" />
              </div>
              <span className="absolute -bottom-2 -right-2 px-3 py-1 rounded-full text-xs font-black uppercase text-white shadow bg-emerald-600">
                {lesson.jlptLevel || 'N2'}
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900">{lesson.title}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {stats.percent >= 80
                  ? 'Chúc mừng! Bạn đã hoàn thành xuất sắc bài luyện thi Từ vựng.'
                  : 'Bạn đã hoàn thành bài thi! Hãy tiếp tục rà soát lại các câu sai để ghi nhớ vững hơn.'}
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-2">
              <div className="text-4xl sm:text-5xl font-black text-slate-900">
                {stats.correct}{' '}
                <span className="text-2xl sm:text-3xl text-slate-400 font-semibold">
                  / {stats.total}
                </span>
              </div>
              <div className="text-sm font-semibold text-emerald-600">
                Độ chính xác: {stats.percent}% ({stats.percent >= 80 ? 'Đạt' : 'Chưa đạt'})
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-emerald-700">{stats.correct}</div>
                <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider mt-0.5">
                  Câu đúng
                </div>
              </div>
              <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-rose-700">{stats.wrong}</div>
                <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider mt-0.5">
                  Câu sai
                </div>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-slate-700">{stats.total - stats.answered}</div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mt-0.5">
                  Chưa làm
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowSummary(false);
                    setCurrentIndex(0);
                    setFilterWrongOnly(false);
                  }}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Xem lại chi tiết từng câu
                </button>

                {stats.wrong > 0 && (
                  <button
                    onClick={() => {
                      setFilterWrongOnly(true);
                      setCurrentIndex(0);
                      setShowSummary(false);
                    }}
                    className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" /> Ôn lại {stats.wrong} câu sai
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleResetAll}
                  className="flex-1 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Làm lại từ đầu
                </button>
                <button
                  onClick={() => {
                    if (onMarkDone && stats.percent >= 80) onMarkDone(lesson.id);
                    onBack();
                  }}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Hoàn tất bài học
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── KHU VỰC CÂU HỎI (QUESTION PANE CARD) ───
  const renderQuestionCard = () => {
    if (!currentQuestion) return null;
    return (
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Header câu hỏi */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-slate-900 text-white text-xs font-black font-mono rounded-lg">
              Câu {currentQuestion.questionNo}
            </span>
            <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200">
              Trắc nghiệm Từ vựng
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => speakJapanese(currentQuestion.questionText)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
              title="Phát âm câu hỏi"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>

            {isAnswered && (
              <div
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  currentProgress?.isCorrect
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {currentProgress?.isCorrect ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Chính xác
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5" /> Chưa chính xác
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Nội dung câu hỏi */}
        <div className="p-4 sm:p-6 md:p-7">
          <div className="text-[11px] uppercase font-bold tracking-wider text-slate-400 mb-2.5">
            Chọn từ ngữ thích hợp nhất để hoàn thành câu
          </div>
          <div className="font-japanese text-lg sm:text-xl md:text-2xl font-medium text-slate-900 leading-relaxed sm:leading-loose">
            {currentQuestion.questionText}
          </div>
        </div>

        {/* Bốn lựa chọn A/B/C/D */}
        <div className="p-4 sm:p-6 md:p-7 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
            const optText = currentQuestion[`option${opt}`];
            const isSelected = currentProgress?.selectedOption === opt;
            const isCorrectOpt = currentQuestion.correctAnswer === opt;

            let buttonStyle = 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300 hover:bg-slate-50/50';
            let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';

            if (isAnswered) {
              if (isCorrectOpt) {
                buttonStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs shadow-emerald-100';
                badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
              } else if (isSelected) {
                buttonStyle = 'bg-rose-50 border-rose-500 text-rose-950 font-bold shadow-xs shadow-rose-100';
                badgeStyle = 'bg-rose-600 text-white border-rose-600';
              } else {
                buttonStyle = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                badgeStyle = 'bg-slate-100 text-slate-400 border-slate-200';
              }
            }

            return (
              <button
                key={opt}
                type="button"
                disabled={isAnswered}
                onClick={() => handleSelectOption(opt)}
                className={`w-full text-left p-3.5 sm:p-4 min-h-[52px] rounded-2xl border-2 transition-all flex items-center justify-between gap-3.5 ${buttonStyle} ${
                  !isAnswered ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center font-black font-mono text-xs sm:text-sm flex-shrink-0 transition-colors ${badgeStyle}`}
                  >
                    {opt}
                  </span>
                  <div className="min-w-0">
                    <p className="font-japanese text-sm sm:text-base font-medium break-words leading-snug">
                      {optText}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {OPTION_SHAPES[opt].shape} {OPTION_SHAPES[opt].label}
                    </span>
                  </div>
                </div>

                {isAnswered && (
                  <div className="flex-shrink-0">
                    {isCorrectOpt ? (
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : isSelected ? (
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs">
                        <XCircle className="w-4 h-4" />
                      </div>
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── KHU VỰC PHÂN TÍCH (ANALYSIS PANE CONTENT) ───
  const renderAnalysisContent = () => {
    if (!isAnswered) {
      return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-6 sm:p-8 text-center flex flex-col items-center justify-center space-y-2 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-1">
            <Lock className="w-5 h-5 text-slate-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-700">
            Chọn đáp án để mở phần phân tích chi tiết 4 lựa chọn.
          </h3>
          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
            Sau khi chọn một trong các đáp án A/B/C/D ở trên, hệ thống sẽ mở phân tích chi tiết từng lựa chọn kèm Hán Việt, nghĩa, ví dụ tiếng Nhật và bản dịch tiếng Việt.
          </p>
        </div>
      );
    }

    if (!currentQuestion) return null;

    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* Banner phản hồi đúng / sai */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 border ${
            currentProgress?.isCorrect
              ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
              : 'border-rose-300 bg-rose-50/80 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {currentProgress?.isCorrect ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                <XCircle className="w-5 h-5" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold">
                {currentProgress?.isCorrect ? 'CHÍNH XÁC! 🎉' : 'CHƯA CHÍNH XÁC! 💡'}
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                Đáp án đúng là: <span className="font-extrabold uppercase">[{currentQuestion.correctAnswer}]</span> {currentQuestion[`option${currentQuestion.correctAnswer as 'A' | 'B' | 'C' | 'D'}`]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRetryCurrent}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại câu này</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="text-xs font-medium px-2 py-1.5 rounded-lg border bg-white/70 hover:bg-white text-slate-700 transition-colors cursor-pointer"
              title="Thu gọn phần phân tích"
            >
              Thu gọn
            </button>
          </div>
        </div>

        {/* Tiêu đề phần giải thích */}
        <div className="flex items-center gap-2 pt-1 border-b border-slate-100 pb-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Phân tích chi tiết 4 lựa chọn (A / B / C / D)
          </h3>
        </div>

        {/* Bốn khối phân tích A/B/C/D */}
        <div className="space-y-3">
          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
            const optText = currentQuestion[`option${opt}`];
            const isCorrectOpt = currentQuestion.correctAnswer === opt;
            const isUserWrongChoice = currentProgress?.selectedOption === opt && !isCorrectOpt;
            const details = currentQuestion.optionDetails?.[opt];

            return (
              <div
                key={opt}
                className={`rounded-2xl border-2 p-4 transition-all ${
                  isCorrectOpt
                    ? 'border-emerald-300 bg-emerald-50/50 shadow-2xs'
                    : isUserWrongChoice
                    ? 'border-rose-300 bg-rose-50/50 shadow-2xs'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black shadow-2xs ${
                        isCorrectOpt
                          ? 'bg-emerald-600 text-white'
                          : isUserWrongChoice
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {opt}
                    </span>
                    <span className="text-sm font-bold font-japanese text-slate-800">{optText}</span>
                  </div>

                  {isCorrectOpt && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-2xs">
                      <CheckCircle2 className="w-3 h-3" /> ĐÁP ÁN ĐÚNG
                    </span>
                  )}

                  {isUserWrongChoice && (
                    <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-2xs">
                      <XCircle className="w-3 h-3" /> BẠN ĐÃ CHỌN
                    </span>
                  )}
                </div>

                {details ? (
                  <div className="space-y-2 text-xs">
                    {details.han_viet && (
                      <div className="rounded-xl bg-white p-2.5 border border-slate-100">
                        <p className="text-slate-700 leading-relaxed font-japanese">
                          <span className="font-bold text-slate-500">Hán Việt & Giải thích: </span>
                          {details.han_viet}
                        </p>
                      </div>
                    )}

                    {details.meaning && (
                      <div className="rounded-xl bg-white p-2.5 border border-slate-100">
                        <p className="text-slate-700 leading-relaxed">
                          <span className="font-bold text-slate-500">Nghĩa: </span>
                          {details.meaning}
                        </p>
                      </div>
                    )}

                    {(details.example_jp || details.example_vi) && (
                      <div className="rounded-xl bg-white p-2.5 border border-slate-100 space-y-1">
                        <p className="font-bold text-slate-500">Ví dụ minh họa:</p>
                        {details.example_jp && (
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-japanese text-slate-800 leading-relaxed">{details.example_jp}</p>
                            <button
                              type="button"
                              onClick={() => speakJapanese(details.example_jp!)}
                              className="text-slate-400 hover:text-emerald-600 p-1 shrink-0 cursor-pointer"
                              title="Phát âm ví dụ"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {details.example_vi && (
                          <p className="text-slate-600 text-[11px] leading-relaxed">
                            → {details.example_vi}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có thông tin phân tích cho lựa chọn này.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── GIAO DIỆN LÀM BÀI CHÍNH (SPLIT VIEW VIEWPORT) ───
  return (
    <div className="fixed inset-0 z-30 flex h-[100dvh] w-full flex-col font-sans overflow-hidden bg-slate-50 text-slate-800 select-none">
      {/* ─── 1. TOP HEADER BAR ─── */}
      <header className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3">
          {/* Back button & Lesson Title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0 cursor-pointer"
              title="Quay lại danh sách bài học"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate font-japanese">{lesson.title}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 flex-shrink-0">
                  {lesson.jlptLevel || 'N2'}
                </span>
                {completed && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                    Đã hoàn thành
                  </span>
                )}
                {filterWrongOnly && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex-shrink-0">
                    Ôn câu sai
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Câu {currentQuestion?.questionNo || currentIndex + 1} / {displayQuestions.length} • Đúng:{' '}
                {stats.correct}/{stats.answered} ({stats.percent}%)
              </p>
            </div>
          </div>

          {/* Right Header: Timer, Score, Layout Menu & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Timer pill */}
            <div
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-all ${
                timeRemaining <= 5 && !isAnswered
                  ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="Thời gian làm bài câu này"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{timeRemaining}s</span>
              {!isAnswered && (
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="ml-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={isTimerRunning ? 'Tạm dừng đồng hồ' : 'Tiếp tục'}
                >
                  {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}
            </div>

            {/* Score pill */}
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{stats.correct}</span>
            </div>

            {/* Layout Mode Selector (Bố cục) */}
            <div className="relative" ref={layoutMenuRef}>
              <button
                type="button"
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                aria-label="Chọn kiểu bố cục hiển thị"
                aria-expanded={showLayoutMenu}
                className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showLayoutMenu
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title={`Kiểu hiển thị: ${
                  layoutMode === 'auto'
                    ? `Tự động (${effectiveLayout === 'horizontal' ? 'Trái / Phải' : 'Trên / Dưới'})`
                    : layoutMode === 'vertical'
                    ? 'Trên / Dưới'
                    : 'Trái / Phải'
                }`}
              >
                {effectiveLayout === 'horizontal' ? (
                  <Columns2 className="w-3.5 h-3.5" />
                ) : (
                  <Rows2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Bố cục</span>
              </button>

              {/* Layout Dropdown Menu */}
              {showLayoutMenu && (
                <div
                  className="absolute right-0 mt-1.5 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Kiểu hiển thị
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectLayoutMode('auto')}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                      layoutMode === 'auto' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <PanelsTopLeft className="w-4 h-4 text-slate-500" />
                      <div>
                        <span>Tự động</span>
                        <div className="text-[10px] font-normal text-slate-400">
                          {autoDetectedLayout === 'horizontal' ? 'Ngang (Trái/Phải)' : 'Dọc (Trên/Dưới)'}
                        </div>
                      </div>
                    </div>
                    {layoutMode === 'auto' && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectLayoutMode('vertical')}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                      layoutMode === 'vertical' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Rows2 className="w-4 h-4 text-slate-500" />
                      <span>Trên / Dưới</span>
                    </div>
                    {layoutMode === 'vertical' && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectLayoutMode('horizontal')}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                      layoutMode === 'horizontal' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Columns2 className="w-4 h-4 text-slate-500" />
                      <span>Trái / Phải</span>
                    </div>
                    {layoutMode === 'horizontal' && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                </div>
              )}
            </div>

            {/* Question Palette Toggle */}
            <button
              onClick={() => setShowPalette(!showPalette)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showPalette
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Danh sách câu hỏi"
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline font-mono">
                {currentIndex + 1}/{displayQuestions.length}
              </span>
            </button>

            {/* Summary / Finish Button */}
            <button
              onClick={() => setShowSummary(true)}
              className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              Tổng kết
            </button>
          </div>
        </div>

        {/* Progress Bar Line */}
        <div className="w-full bg-slate-100 h-1">
          <div
            className="bg-emerald-600 h-1 transition-all duration-300"
            style={{
              width: `${(stats.answered / Math.max(1, stats.total)) * 100}%`,
            }}
          />
        </div>
      </header>

      {/* ─── 2. QUESTION PALETTE OVERLAY / DRAWER ─── */}
      {showPalette && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-2xs flex items-start justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowPalette(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 p-5 shadow-2xl space-y-4 animate-in slide-in-from-top-4 duration-200 mt-12 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Grid className="w-4 h-4 text-emerald-600" /> Bảng câu hỏi ({displayQuestions.length} câu)
              </h3>
              <div className="flex items-center gap-2.5 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Đúng ({stats.correct})
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Sai ({stats.wrong})
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-300" /> Chưa làm ({stats.total - stats.answered})
                </span>
                <button
                  type="button"
                  onClick={() => setShowPalette(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 ml-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 overflow-y-auto p-1 flex-1">
              {displayQuestions.map((q, idx) => {
                const prog = progressMap[q.id];
                const isCurrent = idx === currentIndex;
                const isSelected = Boolean(prog?.selectedOption);
                const isCorrect = Boolean(prog?.isCorrect);

                let btnBg = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                if (isSelected) {
                  btnBg = isCorrect
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-rose-500 text-white font-bold';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowPalette(false);
                    }}
                    className={`h-10 rounded-xl text-xs font-mono font-bold transition-all flex flex-col items-center justify-center relative ${btnBg} ${
                      isCurrent
                        ? 'ring-4 ring-emerald-300 ring-offset-1 scale-105 shadow-md z-10'
                        : 'opacity-90 hover:opacity-100'
                    }`}
                  >
                    <span>{q.questionNo}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. SPLIT VIEW STUDY AREA (ADAPTIVE VERTICAL / HORIZONTAL) ─── */}
      <div
        ref={studyAreaRef}
        className={`flex-1 min-h-0 overflow-hidden relative ${
          isCollapsed
            ? 'flex flex-col'
            : effectiveLayout === 'vertical'
            ? 'flex flex-col'
            : 'flex flex-row'
        }`}
      >
        {/* ─── PANE 1: QUESTION & 4 OPTIONS ─── */}
        <div
          ref={questionPaneRef}
          className={`overflow-y-auto select-text bg-white ${
            effectiveLayout === 'horizontal' && !isCollapsed
              ? 'h-full border-r border-slate-200/80 min-w-0'
              : 'w-full'
          }`}
          style={{
            height:
              isCollapsed
                ? 'calc(100% - 36px)'
                : effectiveLayout === 'vertical'
                ? `${verticalSplit}%`
                : '100%',
            width:
              effectiveLayout === 'horizontal' && !isCollapsed
                ? `${horizontalSplit}%`
                : '100%',
          }}
        >
          <div
            className={`mx-auto p-3.5 sm:p-5 md:p-6 space-y-4 ${
              effectiveLayout === 'horizontal' ? 'max-w-3xl' : 'max-w-4xl'
            }`}
          >
            {/* Narrow Screen Gentle Recommendation in Horizontal Mode */}
            {effectiveLayout === 'horizontal' && isNarrowScreen && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-amber-900 mb-2 animate-in fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="truncate">Màn hình này phù hợp hơn với bố cục Trên / Dưới.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectLayoutMode('vertical')}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] whitespace-nowrap transition-colors cursor-pointer flex-shrink-0"
                >
                  Chuyển sang Trên / Dưới
                </button>
              </div>
            )}

            {renderQuestionCard()}
          </div>
        </div>

        {/* ─── SPLIT HANDLE (VERTICAL OR HORIZONTAL) ─── */}
        {!isCollapsed ? (
          effectiveLayout === 'vertical' ? (
            /* Vertical Layout: Horizontal Handle (drags up/down) */
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-valuemin={MIN_VERTICAL_SPLIT}
              aria-valuemax={MAX_VERTICAL_SPLIT}
              aria-valuenow={Math.round(verticalSplit)}
              aria-label="Thanh điều chỉnh tỷ lệ trên dưới giữa câu hỏi và phân tích chi tiết"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onDoubleClick={handleResetSplit}
              onTouchEnd={handleTouchEndHandle}
              onKeyDown={handleKeyDown}
              className="flex h-5 w-full shrink-0 cursor-row-resize items-center justify-between px-3 sm:px-4 bg-slate-100 hover:bg-emerald-50 active:bg-emerald-100 border-y border-slate-200/90 transition-colors touch-none select-none z-10 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-inset group"
              title="Kéo lên/xuống để đổi tỷ lệ (30% - 75%). Nhấp đúp để đặt lại 55/45."
            >
              {/* Quick collapse button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(true);
                }}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 py-0.5 px-1.5 rounded-sm hover:bg-slate-200/60 transition-colors flex items-center gap-1 cursor-pointer"
                title="Ẩn phân tích để tập trung làm bài"
              >
                <span>Ẩn phân tích</span>
              </button>

              {/* Pill Grip Handle */}
              <div className="flex items-center gap-1.5 pointer-events-none">
                <div className="h-1.5 w-12 rounded-full bg-slate-400 group-hover:bg-emerald-600 transition-colors" />
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-emerald-700 hidden sm:inline">
                  {Math.round(verticalSplit)}% / {100 - Math.round(verticalSplit)}%
                </span>
              </div>

              {/* Reset 55/45 button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetSplit();
                }}
                className="text-[10px] text-slate-400 hover:text-slate-700 py-0.5 px-1.5 rounded-sm hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Đặt lại tỷ lệ mặc định 55% / 45%"
              >
                <span>55 / 45</span>
              </button>
            </div>
          ) : (
            /* Horizontal Layout: Vertical Handle (drags left/right) */
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuemin={MIN_HORIZONTAL_SPLIT}
              aria-valuemax={MAX_HORIZONTAL_SPLIT}
              aria-valuenow={Math.round(horizontalSplit)}
              aria-label="Thanh điều chỉnh tỷ lệ trái phải giữa câu hỏi và phân tích chi tiết"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onDoubleClick={handleResetSplit}
              onTouchEnd={handleTouchEndHandle}
              onKeyDown={handleKeyDown}
              className="flex w-4 sm:w-5 h-full shrink-0 cursor-col-resize flex-col items-center justify-between py-3 bg-slate-100 hover:bg-emerald-50 active:bg-emerald-100 border-x border-slate-200/90 transition-colors touch-none select-none z-10 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-inset group"
              title="Kéo trái/phải để đổi tỷ lệ (35% - 70%). Nhấp đúp để đặt lại 50/50."
            >
              {/* Quick collapse button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(true);
                }}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 p-1 rounded-sm hover:bg-slate-200/60 transition-colors flex items-center justify-center cursor-pointer"
                title="Ẩn phân tích"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Pill Grip Handle */}
              <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                <div className="w-1.5 h-12 rounded-full bg-slate-400 group-hover:bg-emerald-600 transition-colors" />
                <span className="text-[9px] font-mono text-slate-400 group-hover:text-emerald-700 hidden sm:inline [writing-mode:vertical-lr] rotate-180">
                  {Math.round(horizontalSplit)}%
                </span>
              </div>

              {/* Reset 50/50 button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetSplit();
                }}
                className="text-[10px] text-slate-400 hover:text-slate-700 py-1 px-0.5 rounded-sm hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Đặt lại tỷ lệ mặc định 50% / 50%"
              >
                <span className="font-mono text-[9px]">50</span>
              </button>
            </div>
          )
        ) : (
          /* Collapsed Mini-Bar (Universal) */
          <div className="flex h-9 w-full shrink-0 items-center justify-between px-4 bg-slate-100 border-t border-slate-200 text-xs font-semibold text-slate-700 z-10 shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Phân tích chi tiết</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Hiện</span>
              <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
            </button>
          </div>
        )}

        {/* ─── PANE 2: ANALYSIS & 4 OPTIONS EXPLANATION ─── */}
        {!isCollapsed && (
          <div
            ref={analysisPaneRef}
            className={`overflow-y-auto select-text bg-slate-50/70 min-w-0 ${
              effectiveLayout === 'horizontal'
                ? 'h-full flex-1'
                : 'w-full border-t border-slate-200/50'
            }`}
            style={{
              height: effectiveLayout === 'vertical' ? `${100 - verticalSplit}%` : '100%',
              width: effectiveLayout === 'horizontal' ? `${100 - horizontalSplit}%` : '100%',
            }}
          >
            <div
              className={`mx-auto p-3.5 sm:p-5 md:p-6 space-y-4 ${
                effectiveLayout === 'horizontal' ? 'max-w-3xl' : 'max-w-4xl'
              }`}
            >
              {renderAnalysisContent()}
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. FIXED BOTTOM NAVIGATION BAR ─── */}
      <footer className="flex-shrink-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-2.5 sm:p-3 shadow-lg z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Previous Button */}
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              currentIndex <= 0
                ? 'text-slate-300 bg-slate-100 cursor-not-allowed'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 cursor-pointer'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Câu trước</span>
          </button>

          {/* Center Info */}
          <div className="text-center">
            <span className="text-xs font-black font-mono text-slate-700">
              Câu {currentIndex + 1} / {displayQuestions.length}
            </span>
            <div className="text-[10px] text-slate-400">
              {isAnswered ? 'Đã làm' : 'Đang chờ chọn đáp án'}
            </div>
          </div>

          {/* Next or Finish Button */}
          {currentIndex < displayQuestions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(displayQuestions.length - 1, prev + 1))}
              className="px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs shadow-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Câu tiếp</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="px-4 sm:px-5 py-2 bg-slate-900 hover:bg-black active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Xem kết quả</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
