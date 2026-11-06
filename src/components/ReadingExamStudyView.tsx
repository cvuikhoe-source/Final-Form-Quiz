import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Lesson, ExamQuestion, ReadingExamPassage, User, ExamQuestionProgress } from '@/types';
import {
  loadExamQuestions,
  loadReadingPassages,
  loadExamQuestionProgress,
  saveExamQuestionProgress,
} from '@/storage';
import { toast } from '@/components/Toast';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpenText,
  FileText,
  Lock,
  Volume2,
  Trophy,
  Sparkles,
  Layers,
  X,
  Play,
  Pause,
  Moon,
  Sun,
  RefreshCw,
} from 'lucide-react';

interface ReadingExamStudyViewProps {
  lesson: Lesson;
  currentUser: User;
  canManage: boolean;
  completed?: boolean;
  onBack: () => void;
  onMarkDone?: (lessonId: string) => void;
}

export function ReadingExamStudyView({
  lesson,
  currentUser,
  completed,
  onBack,
  onMarkDone,
}: ReadingExamStudyViewProps) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [passages, setPassages] = useState<ReadingExamPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadCompleted, setLoadCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // User responses & progress per question: Record<questionId, ExamQuestionProgress>
  const [progressMap, setProgressMap] = useState<Record<string, ExamQuestionProgress>>({});

  // Current question interaction state
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Timer per question
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [timeSpentOnCurrentQ, setTimeSpentOnCurrentQ] = useState(0);

  // Orientation & mobile detection for vertical Split View
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isNarrow = window.innerWidth < 768;
    const isPortrait =
      window.innerHeight >= window.innerWidth ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches);
    return isNarrow && isPortrait;
  });

  useEffect(() => {
    const handleResize = () => {
      const isNarrow = window.innerWidth < 768;
      const isPortrait =
        window.innerHeight >= window.innerWidth ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches);
      setIsPortraitMobile(isNarrow && isPortrait);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Split View ratio (horizontal for desktop: default 42%, vertical for mobile portrait: default 40%)
  const [splitRatioX, setSplitRatioX] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('quizforms_reading_split_ratio');
      if (saved) return Math.min(75, Math.max(25, Number(saved)));
    } catch {
      // ignore
    }
    return 42;
  });

  const [splitRatioY, setSplitRatioY] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('quizforms_reading_split_ratio_y');
      if (saved) return Math.min(70, Math.max(25, Number(saved)));
    } catch {
      // ignore
    }
    return 40; // Default 40% height for passage, 60% for question on mobile portrait
  });

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplitRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Flip card state for passage (false: Japanese front, true: Vietnamese back)
  const [isFlipped, setIsFlipped] = useState(false);
  const lastPassageIdRef = useRef<string | null>(null);

  // UI preferences
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'explanation' | 'kanji' | 'grammar'>('explanation');
  const [showQuestionPalette, setShowQuestionPalette] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const questionTopRef = useRef<HTMLDivElement>(null);
  const passageFrontRef = useRef<HTMLDivElement>(null);
  const passageBackRef = useRef<HTMLDivElement>(null);

  // Load questions, passages, and progress
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadCompleted(false);
    setLoadError(null);
    try {
      const [loadedQ, loadedP, loadedProg] = await Promise.all([
        loadExamQuestions(lesson.id),
        loadReadingPassages(lesson.id),
        loadExamQuestionProgress(currentUser.id, lesson.id),
      ]);

      // Sort questions by sortOrder / questionNo
      loadedQ.sort((a, b) => a.questionNo - b.questionNo);
      setQuestions(loadedQ);
      setPassages(loadedP);
      setProgressMap(loadedProg);
      setLoadCompleted(true);
    } catch (err: unknown) {
      console.error('ReadingExamStudyView loadData error:', err);
      const msg = err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu bài đọc hiểu';
      setLoadError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [lesson.id, currentUser.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentQ = questions[currentIndex] || null;

  // Find passage corresponding to current question
  const currentPassage = useMemo(() => {
    if (!currentQ || passages.length === 0) return null;
    if (currentQ.passageId) {
      const match = passages.find((p) => p.id === currentQ.passageId || p.passageKey === currentQ.passageId);
      if (match) return match;
    }
    // Fallback: first passage
    return passages[0] || null;
  }, [currentQ, passages]);

  // Synchronize question state when currentIndex changes
  useEffect(() => {
    if (!currentQ) return;

    // Check if passage changed. If SAME passage, maintain flip state! Only reset if passage changed.
    const newPassageId = currentPassage?.id || null;
    if (lastPassageIdRef.current && lastPassageIdRef.current !== newPassageId) {
      setIsFlipped(false);
      if (passageFrontRef.current) passageFrontRef.current.scrollTop = 0;
      if (passageBackRef.current) passageBackRef.current.scrollTop = 0;
    }
    lastPassageIdRef.current = newPassageId;

    // Load progress for this question if previously answered
    const prog = progressMap[currentQ.id];
    if (prog && prog.submitted) {
      setSelectedOption(prog.selectedOption);
      setIsSubmitted(true);
    } else {
      setSelectedOption(null);
      setIsSubmitted(false);
    }

    // Reset timer for question
    setTimeLeft(currentQ.timeSeconds || 30);
    setTimeSpentOnCurrentQ(0);
    setIsTimerRunning(true);
    setActiveTab('explanation');

    // Scroll question container to top smoothly
    questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex, currentQ, currentPassage?.id, progressMap]);

  // Timer tick
  useEffect(() => {
    if (!isTimerRunning || isSubmitted || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
      setTimeSpentOnCurrentQ((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, isSubmitted, timeLeft]);

  // Handle option select
  const handleSelectOption = (opt: 'A' | 'B' | 'C' | 'D') => {
    if (isSubmitted) return;
    setSelectedOption(opt);
  };

  // Submit current answer
  const handleSubmitAnswer = async () => {
    if (!currentQ || !selectedOption || isSubmitted) return;

    setIsTimerRunning(false);
    setIsSubmitted(true);

    const hasOfficialAnswer = Boolean(currentQ.correctAnswer);
    const isCorrect = hasOfficialAnswer ? selectedOption === currentQ.correctAnswer : null;

    const prog: ExamQuestionProgress = {
      userId: currentUser.id,
      lessonId: lesson.id,
      questionId: currentQ.id,
      selectedOption,
      isCorrect,
      timeSpent: timeSpentOnCurrentQ,
      submitted: true,
      completedAt: new Date().toISOString(),
    };

    // Update state & save
    setProgressMap((prev) => ({ ...prev, [currentQ.id]: prog }));
    await saveExamQuestionProgress(prog);

    if (hasOfficialAnswer) {
      if (isCorrect) {
        toast('Chính xác! Xuất sắc.', 'success');
      } else {
        toast(`Chưa đúng. Đáp án đúng là ${currentQ.correctAnswer}`, 'error');
      }
    } else {
      toast('Đã ghi nhận câu trả lời (Câu này chưa có đáp án chính thức)', 'info');
    }

    // Check if all questions completed
    const updatedCount = Object.keys(progressMap).length + 1;
    if (updatedCount >= questions.length && onMarkDone) {
      onMarkDone(lesson.id);
    }
  };

  // Retry current question
  const handleRetryCurrent = async () => {
    if (!currentQ) return;
    setIsSubmitted(false);
    setSelectedOption(null);
    setTimeLeft(currentQ.timeSeconds || 30);
    setIsTimerRunning(true);
    setTimeSpentOnCurrentQ(0);

    const updatedMap = { ...progressMap };
    delete updatedMap[currentQ.id];
    setProgressMap(updatedMap);
  };

  // Web Speech API text-to-speech for Japanese
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

  // Split View drag handlers (supports horizontal resize on desktop, vertical resize on mobile portrait)
  const handleStartDrag = (direction: 'horizontal' | 'vertical') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingSplitRef.current = direction;

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();

      if (isDraggingSplitRef.current === 'vertical') {
        const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;
        const relativeY = clientY - rect.top;
        const pct = (relativeY / rect.height) * 100;
        const clamped = Math.min(70, Math.max(25, pct));
        setSplitRatioY(clamped);
        try {
          localStorage.setItem('quizforms_reading_split_ratio_y', String(Math.round(clamped)));
        } catch {
          // ignore
        }
      } else {
        const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
        const relativeX = clientX - rect.left;
        const pct = (relativeX / rect.width) * 100;
        const clamped = Math.min(75, Math.max(25, pct));
        setSplitRatioX(clamped);
        try {
          localStorage.setItem('quizforms_reading_split_ratio', String(Math.round(clamped)));
        } catch {
          // ignore
        }
      }
    };

    const onEnd = () => {
      isDraggingSplitRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  // Highlight blank markers like (48), (49), (50), (51) in Japanese passage
  const renderHighlightedPassageJa = (text: string) => {
    if (!text) return null;
    // Regex matching parentheses with numbers, e.g. (48), （48）, (49), [48]
    const regex = /(\(\d+\)|（\d+）|\[\d+\])/g;
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      const match = part.match(/\d+/);
      if (match) {
        const qNum = parseInt(match[0], 10);
        const isCurrentQuestionBlank = currentQ && currentQ.questionNo === qNum;

        return (
          <span
            key={idx}
            className={`inline-block font-bold rounded-md px-1.5 py-0.5 mx-0.5 transition-all text-sm ${
              isCurrentQuestionBlank
                ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 shadow-xs scale-105'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Font size classes
  const fontClass = {
    sm: 'text-xs md:text-sm',
    base: 'text-sm md:text-base',
    lg: 'text-base md:text-lg',
    xl: 'text-lg md:text-xl',
  }[fontSize];

  // Calculation for summary
  const summaryStats = useMemo(() => {
    let correctCount = 0;
    let incorrectCount = 0;
    let unscoredCount = 0;
    const answeredCount = Object.keys(progressMap).length;
    const incorrectQList: ExamQuestion[] = [];

    questions.forEach((q) => {
      const prog = progressMap[q.id];
      if (prog && prog.submitted) {
        if (!q.correctAnswer) {
          unscoredCount++;
        } else if (prog.isCorrect) {
          correctCount++;
        } else {
          incorrectCount++;
          incorrectQList.push(q);
        }
      }
    });

    const totalScorable = questions.filter((q) => Boolean(q.correctAnswer)).length;
    const scorePct = totalScorable > 0 ? Math.round((correctCount / totalScorable) * 100) : 0;

    return {
      correctCount,
      incorrectCount,
      unscoredCount,
      answeredCount,
      unansweredCount: questions.length - answeredCount,
      scorePct,
      incorrectQList,
    };
  }, [questions, progressMap]);

  // 1. Loading State
  if (loading || (!loadCompleted && !loadError)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-amber-600 border-t-transparent" />
          <p className="text-xs font-semibold text-slate-600">Đang chuẩn bị bài luyện thi đọc hiểu...</p>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
          <XCircle size={28} />
        </div>
        <h3 className="text-base font-bold text-slate-800">Không thể tải dữ liệu câu hỏi</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          {loadError}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-colors"
          >
            <RefreshCw size={14} /> Thử lại
          </button>
          <button
            onClick={onBack}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  // 3. Empty State (Only when load completed without error and questions is empty)
  if (loadCompleted && !loading && !loadError && questions.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <BookOpenText size={28} />
        </div>
        <h3 className="text-base font-bold text-slate-800">Bài học chưa có câu hỏi nào</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          Bài đọc hiểu này chưa có nội dung câu hỏi. Vui lòng nhập đề thi từ file Excel.
        </p>
        <button
          onClick={onBack}
          className="mt-5 rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  // Guard against unmounted/inconsistent state
  if (!loadCompleted || questions.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-amber-600 border-t-transparent" />
          <p className="text-xs font-semibold text-slate-600">Đang chuẩn bị bài luyện thi đọc hiểu...</p>
        </div>
      </div>
    );
  }

  // ─── SUMMARY SCREEN (TỔNG KẾT BÀI THI) ───
  if (showSummary) {
    return (
      <div className="min-h-screen bg-slate-50/80 p-4 md:p-8 animate-fade-in text-slate-800">
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-xs">
              <Trophy size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Kết Quả Luyện Thi Đọc Hiểu</h2>
            <p className="text-xs text-slate-500 font-jp">{lesson.title}</p>
          </div>

          {/* Score Badge */}
          <div className="flex flex-col items-center justify-center rounded-3xl bg-linear-to-b from-amber-50 to-orange-50/50 border border-amber-200 p-6 text-center">
            <span className="text-4xl md:text-5xl font-extrabold text-amber-800">
              {summaryStats.scorePct}%
            </span>
            <p className="mt-1 text-xs font-bold text-amber-900">
              Đúng {summaryStats.correctCount} / {questions.filter((q) => q.correctAnswer).length} câu có đáp án
            </p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
              <span>Đoạn văn: {passages.length}</span> • <span>Tổng số câu: {questions.length}</span>
            </div>
          </div>

          {/* Stats Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-lg font-bold text-emerald-700">{summaryStats.correctCount}</p>
              <p className="text-[10px] font-semibold uppercase text-emerald-800">Chính xác</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
              <p className="text-lg font-bold text-rose-700">{summaryStats.incorrectCount}</p>
              <p className="text-[10px] font-semibold uppercase text-rose-800">Chưa đúng</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-lg font-bold text-slate-700">{summaryStats.unansweredCount}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-600">Chưa làm</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-lg font-bold text-amber-700">{summaryStats.unscoredCount}</p>
              <p className="text-[10px] font-semibold uppercase text-amber-800">Không tính điểm</p>
            </div>
          </div>

          {/* List of Incorrect questions */}
          {summaryStats.incorrectQList.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                <XCircle size={15} /> Danh sách câu chưa đúng ({summaryStats.incorrectQList.length} câu)
              </p>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {summaryStats.incorrectQList.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => {
                      const idx = questions.findIndex((item) => item.id === q.id);
                      if (idx >= 0) {
                        setCurrentIndex(idx);
                        setShowSummary(false);
                      }
                    }}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5 hover:border-amber-400 cursor-pointer transition-all bg-white"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700 font-bold text-xs">
                        {q.questionNo}
                      </span>
                      <p className="truncate text-xs text-slate-800 font-jp">
                        {q.questionText}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-800 shrink-0 ml-2">
                      Xem lại →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={() => {
                setShowSummary(false);
                setCurrentIndex(0);
              }}
              className="flex w-full sm:flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <RotateCcw size={15} />
              <span>Xem lại bài làm</span>
            </button>

            <button
              onClick={onBack}
              className="flex w-full sm:flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-600 px-4 py-3 text-xs font-bold text-white shadow-md hover:bg-amber-700 transition-all"
            >
              <span>Quay về danh sách</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN STUDY SCREEN ───
  return (
    <div
      className={`fixed inset-0 z-30 flex h-[100dvh] w-full flex-col font-sans transition-colors duration-200 overflow-hidden ${
        isDarkMode ? 'bg-[#0f111a] text-[#EDEDF2]' : 'bg-slate-100 text-slate-800'
      }`}
    >
      {/* ─── 1. FIXED HEADER ─── */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 py-2.5 transition-colors ${
          isDarkMode
            ? 'border-slate-800 bg-[#14172B]/90 text-white'
            : 'border-slate-200 bg-white/95 text-slate-800 shadow-2xs'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          {/* Back & Title info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBack}
              className={`rounded-xl p-2 transition-colors ${
                isDarkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
              title="Quay lại danh sách"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.2 shrink-0">
                  {lesson.jlptLevel || 'N2'}
                </span>
                {completed && (
                  <span className="rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 shrink-0">
                    Đã hoàn thành
                  </span>
                )}
                <h1 className="truncate text-xs sm:text-sm font-bold font-jp">
                  {lesson.title}
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Đoạn {passages.findIndex((p) => p.id === currentPassage?.id) + 1}/{passages.length} • Câu {currentQ?.questionNo} ({currentIndex + 1}/{questions.length})
                {currentQ?.topic && ` • ${currentQ.topic}`}
              </p>
            </div>
          </div>

          {/* Right Action Tools: Timer, Controls, Font size */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Timer Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-mono font-bold transition-all ${
                timeLeft <= 5 && !isSubmitted
                  ? 'border-rose-400 bg-rose-50 text-rose-700 animate-pulse'
                  : isDarkMode
                  ? 'border-slate-700 bg-slate-800/80 text-amber-400'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <Clock size={13} />
              <span>{timeLeft}s</span>
              <button
                onClick={() => setIsTimerRunning((v) => !v)}
                className="ml-0.5 text-slate-400 hover:text-slate-600"
                title={isTimerRunning ? 'Tạm dừng đồng hồ' : 'Tiếp tục'}
              >
                {isTimerRunning ? <Pause size={10} /> : <Play size={10} />}
              </button>
            </div>

            {/* Audio pronunciation */}
            <button
              onClick={() => {
                if (currentQ) {
                  speakJapanese(`${currentQ.questionText}. A: ${currentQ.optionA}. B: ${currentQ.optionB}. C: ${currentQ.optionC}. D: ${currentQ.optionD}`);
                }
              }}
              className={`rounded-xl p-1.5 transition-colors ${
                isDarkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
              title="Phát âm câu hỏi bằng tiếng Nhật"
            >
              <Volume2 size={17} />
            </button>

            {/* Font scale buttons */}
            <div className="hidden sm:flex items-center gap-0.5 rounded-xl border border-slate-200 p-0.5 text-xs">
              <button
                onClick={() => {
                  if (fontSize === 'xl') setFontSize('lg');
                  else if (fontSize === 'lg') setFontSize('base');
                  else if (fontSize === 'base') setFontSize('sm');
                }}
                disabled={fontSize === 'sm'}
                className="px-1.5 py-0.5 font-bold disabled:opacity-30 hover:bg-slate-100 rounded"
                title="Giảm cỡ chữ"
              >
                A−
              </button>
              <button
                onClick={() => {
                  if (fontSize === 'sm') setFontSize('base');
                  else if (fontSize === 'base') setFontSize('lg');
                  else if (fontSize === 'lg') setFontSize('xl');
                }}
                disabled={fontSize === 'xl'}
                className="px-1.5 py-0.5 font-bold disabled:opacity-30 hover:bg-slate-100 rounded"
                title="Tăng cỡ chữ"
              >
                A+
              </button>
            </div>

            {/* Dark Mode toggle */}
            <button
              onClick={() => setIsDarkMode((v) => !v)}
              className={`rounded-xl p-1.5 transition-colors ${
                isDarkMode ? 'bg-slate-800 text-amber-400' : 'hover:bg-slate-100 text-slate-600'
              }`}
              title={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
            >
              {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Animations toggle */}
            <button
              onClick={() => setAnimationsEnabled((v) => !v)}
              className={`rounded-xl p-1.5 transition-colors ${
                !animationsEnabled ? 'bg-amber-100 text-amber-800' : isDarkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
              title={animationsEnabled ? 'Tắt hiệu ứng hoạt họa' : 'Bật hiệu ứng hoạt họa'}
            >
              <Sparkles size={17} />
            </button>

            {/* Question Palette toggle */}
            <button
              onClick={() => setShowQuestionPalette((v) => !v)}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold transition-all ${
                showQuestionPalette
                  ? 'bg-amber-600 text-white'
                  : isDarkMode
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers size={14} />
              <span className="hidden md:inline">Bảng câu</span>
            </button>
          </div>
        </div>

        {/* Linear progress bar */}
        <div className="mt-2 h-1 w-full bg-slate-200/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-amber-500 to-amber-600 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      {/* ─── 2. QUESTION PALETTE DRAWER (MODAL / OVERLAY) ─── */}
      {showQuestionPalette && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-2xs flex items-start justify-end p-4 animate-fade-in"
          onClick={() => setShowQuestionPalette(false)}
        >
          <div
            className={`w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-slide-left mt-14 ${
              isDarkMode ? 'bg-[#1a1d36] text-white border border-slate-700' : 'bg-white text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold">Danh sách câu hỏi ({questions.length} câu)</h3>
              <button
                onClick={() => setShowQuestionPalette(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const prog = progressMap[q.id];
                const isCur = idx === currentIndex;
                const isAns = prog && prog.submitted;
                const isCor = isAns && prog.isCorrect === true;
                const isInc = isAns && prog.isCorrect === false;

                let cls = isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700';
                if (isCur) cls = 'ring-2 ring-amber-500 font-bold ' + cls;
                if (isCor) cls = 'bg-emerald-600 text-white font-bold';
                else if (isInc) cls = 'bg-rose-600 text-white font-bold';
                else if (isAns && prog.isCorrect === null) cls = 'bg-amber-500 text-white font-bold';

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowQuestionPalette(false);
                    }}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center text-xs transition-all active:scale-95 ${cls}`}
                  >
                    <span>{q.questionNo}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-emerald-600 inline-block" /> Đúng
                <span className="h-3 w-3 rounded-sm bg-rose-600 inline-block ml-3" /> Sai
                <span className="h-3 w-3 rounded-sm bg-slate-300 inline-block ml-3" /> Chưa làm
              </div>
            </div>

            <button
              onClick={() => {
                setShowQuestionPalette(false);
                setShowSummary(true);
              }}
              className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700"
            >
              Xem tổng kết bài thi
            </button>
          </div>
        </div>
      )}

      {/* ─── 3. SPLIT VIEW CONTAINER (PASSAGE | QUESTION) ─── */}
      <div
        ref={splitContainerRef}
        className={`flex-1 min-h-0 flex overflow-hidden relative ${
          isPortraitMobile ? 'flex-col' : 'flex-col lg:flex-row'
        }`}
      >
        {/* PASSAGE FLIP CARD SECTION */}
        <div
          className={`flex flex-col border-slate-200 dark:border-slate-800 overflow-hidden relative ${
            isPortraitMobile ? 'w-full' : 'border-b lg:border-b-0 lg:border-r'
          }`}
          style={
            isPortraitMobile
              ? {
                  height: `${splitRatioY}%`,
                  minHeight: '25%',
                  maxHeight: '70%',
                  flexShrink: 0,
                }
              : {
                  flex: `0 0 ${splitRatioX}%`,
                  minWidth: '25%',
                  maxWidth: '75%',
                }
          }
        >
          {/* Passage Toolbar */}
          <div
            className={`flex items-center justify-between px-4 py-2 border-b text-xs transition-colors shrink-0 ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-slate-400'
                : 'bg-slate-50/90 border-slate-200 text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpenText size={15} className="text-amber-600" />
              <span className="font-bold">
                {currentPassage?.passageTitle || 'Đoạn văn đọc hiểu'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => speakJapanese(currentPassage?.passageJa || '')}
                className="hover:text-amber-600 p-1"
                title="Đọc toàn bộ đoạn văn tiếng Nhật"
              >
                <Volume2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIsFlipped((v) => !v)}
                className="flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 transition-all active:scale-95"
              >
                <RefreshCw size={12} className={isFlipped ? 'rotate-180 transition-transform' : ''} />
                <span>{isFlipped ? 'Xem tiếng Nhật' : 'Lật xem bản dịch'}</span>
              </button>
            </div>
          </div>

          {/* 3D FLIP CARD CONTAINER */}
          <div className="reading-flip-card-wrapper flex-1 min-h-0 p-2 sm:p-3 md:p-5 overflow-hidden">
            <div
              className={`reading-flip-card-inner rounded-2xl sm:rounded-3xl ${
                isFlipped ? 'flipped' : ''
              } ${!animationsEnabled ? 'no-anim' : ''}`}
            >
              {/* ── FRONT: JAPANESE PASSAGE ── */}
              <div
                ref={passageFrontRef}
                onClick={() => setIsFlipped(true)}
                className={`reading-flip-card-face reading-flip-card-front rounded-2xl md:rounded-3xl p-4 sm:p-5 md:p-6 overflow-y-auto cursor-pointer shadow-sm border transition-colors ${
                  isFlipped && animationsEnabled ? 'pointer-events-none' : ''
                } ${
                  isDarkMode
                    ? 'bg-[#1a1d36] text-slate-100 border-slate-700'
                    : 'bg-[#FFFDF7] text-slate-800 border-amber-200/80 shadow-amber-900/5'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-800/80 mb-3 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <BookOpenText size={14} /> Tiếng Nhật (Mặt trước)
                  </span>
                  <span className="text-[10px] bg-amber-100/80 px-2 py-0.5 rounded-full">
                    Chạm để lật bản dịch ↻
                  </span>
                </div>

                <div
                  className={`font-jp whitespace-pre-wrap leading-relaxed select-text ${fontClass}`}
                  style={{ lineHeight: 1.85 }}
                >
                  {renderHighlightedPassageJa(currentPassage?.passageJa || '')}
                </div>
              </div>

              {/* ── BACK: VIETNAMESE TRANSLATION ── */}
              <div
                ref={passageBackRef}
                onClick={() => setIsFlipped(false)}
                className={`reading-flip-card-face reading-flip-card-back rounded-2xl md:rounded-3xl p-4 sm:p-5 md:p-6 overflow-y-auto cursor-pointer shadow-sm border transition-colors ${
                  !isFlipped && animationsEnabled ? 'pointer-events-none' : ''
                } ${
                  isDarkMode
                    ? 'bg-[#1e2640] text-slate-100 border-sky-800'
                    : 'bg-[#EAF3FB] text-slate-800 border-sky-200/80 shadow-sky-900/5'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-sky-800 mb-3 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} /> Bản dịch Tiếng Việt (Mặt sau)
                  </span>
                  <span className="text-[10px] bg-sky-100 px-2 py-0.5 rounded-full">
                    Chạm để lật lại tiếng Nhật ↻
                  </span>
                </div>

                <div className={`whitespace-pre-wrap leading-relaxed select-text ${fontClass}`} style={{ lineHeight: 1.8 }}>
                  {currentPassage?.passageVi || '(Bài đọc này chưa có bản dịch tiếng Việt)'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HORIZONTAL DRAG HANDLE (MOBILE PORTRAIT) */}
        {isPortraitMobile && (
          <div
            onMouseDown={handleStartDrag('vertical')}
            onTouchStart={handleStartDrag('vertical')}
            className="flex h-5 w-full shrink-0 cursor-row-resize items-center justify-center bg-slate-200/80 hover:bg-amber-300 active:bg-amber-400 border-y border-slate-200 dark:border-slate-700 dark:bg-slate-800 transition-colors touch-none select-none z-10"
            title="Kéo lên hoặc xuống để thay đổi tỉ lệ xem đoạn văn / câu hỏi (25% - 70%)"
          >
            <div className="h-1.5 w-12 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors" />
          </div>
        )}

        {/* RESIZABLE DRAG HANDLE (DESKTOP / LANDSCAPE) */}
        {!isPortraitMobile && (
          <div
            onMouseDown={handleStartDrag('horizontal')}
            onTouchStart={handleStartDrag('horizontal')}
            className="hidden lg:flex w-2.5 bg-slate-200 hover:bg-amber-400 active:bg-amber-500 cursor-col-resize items-center justify-center transition-colors group shrink-0 touch-none select-none z-10"
            title="Kéo sang trái hoặc phải để thay đổi tỉ lệ xem đoạn văn / câu hỏi (25% - 75%)"
          >
            <div className="h-8 w-1 rounded-full bg-slate-400 group-hover:bg-amber-800 transition-colors" />
          </div>
        )}

        {/* RIGHT/BOTTOM COLUMN: QUESTION & EXPLANATION */}
        <div
          ref={questionTopRef}
          className={`flex-1 min-h-0 flex flex-col overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 ${
            isPortraitMobile ? 'w-full' : ''
          }`}
          style={
            isPortraitMobile
              ? {
                  height: `${100 - splitRatioY}%`,
                  minHeight: '30%',
                }
              : undefined
          }
        >
          {currentQ && (
            <div className="max-w-3xl mx-auto w-full space-y-5">
              {/* Question Header Card */}
              <div
                className={`rounded-2xl border p-4 md:p-5 shadow-xs transition-all ${
                  isDarkMode
                    ? 'border-slate-800 bg-[#1a1d36]'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-600 text-white font-bold text-xs shadow-2xs">
                      {currentQ.questionNo}
                    </span>
                    {currentQ.topic && (
                      <span className="rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold px-2 py-0.5 font-jp">
                        {currentQ.topic}
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock size={12} /> Thời gian đề xuất: {currentQ.timeSeconds}s
                  </span>
                </div>

                <p
                  className={`font-jp font-bold text-slate-900 dark:text-white leading-relaxed select-text mt-1 ${fontClass}`}
                >
                  {currentQ.questionText}
                </p>
              </div>

              {/* 4 Answer Choice Cards */}
              <div className="space-y-2.5">
                {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                  const optText = currentQ[`option${optKey}` as keyof ExamQuestion] as string;
                  const isSelected = selectedOption === optKey;
                  const hasOfficial = Boolean(currentQ.correctAnswer);
                  const isCorrect = hasOfficial && currentQ.correctAnswer === optKey;

                  let cardStyle = isDarkMode
                    ? 'border-slate-700 bg-[#1a1d36] text-slate-200 hover:border-amber-400'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-amber-400 hover:shadow-xs';

                  if (isSubmitted) {
                    if (isCorrect) {
                      cardStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-500';
                    } else if (isSelected && !isCorrect) {
                      cardStyle = 'border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-400';
                    } else {
                      cardStyle = isDarkMode ? 'border-slate-800 bg-slate-900/60 opacity-60' : 'border-slate-200 bg-slate-50 opacity-60';
                    }
                  } else if (isSelected) {
                    cardStyle = 'border-amber-500 bg-amber-50 text-amber-950 font-semibold ring-2 ring-amber-500 shadow-sm';
                  }

                  return (
                    <button
                      key={optKey}
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => handleSelectOption(optKey)}
                      className={`w-full text-left rounded-2xl border p-4 flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${cardStyle}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-colors ${
                            isSubmitted && isCorrect
                              ? 'bg-emerald-600 text-white'
                              : isSubmitted && isSelected && !isCorrect
                              ? 'bg-rose-600 text-white'
                              : isSelected
                              ? 'bg-amber-600 text-white'
                              : isDarkMode
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {optKey}
                        </span>
                        <span className={`font-jp leading-relaxed ${fontClass}`}>{optText}</span>
                      </div>

                      {isSubmitted && (
                        <div className="shrink-0">
                          {isCorrect ? (
                            <CheckCircle2 size={20} className="text-emerald-600" />
                          ) : isSelected ? (
                            <XCircle size={20} className="text-rose-600" />
                          ) : null}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Submit / Action Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                {!isSubmitted ? (
                  <button
                    type="button"
                    disabled={!selectedOption}
                    onClick={handleSubmitAnswer}
                    className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-amber-600 text-white font-bold text-xs sm:text-sm shadow-md hover:bg-amber-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Nộp bài (Kiểm tra đáp án)
                  </button>
                ) : (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleRetryCurrent}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-all"
                    >
                      <RotateCcw size={14} />
                      <span>Thử làm lại câu này</span>
                    </button>
                  </div>
                )}

                {/* Banner Status after submission */}
                {isSubmitted && (
                  <div className="flex items-center gap-2">
                    {currentQ.correctAnswer ? (
                      selectedOption === currentQ.correctAnswer ? (
                        <span className="flex items-center gap-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1.5 text-xs font-bold">
                          <CheckCircle2 size={16} className="text-emerald-600" /> CHÍNH XÁC!
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 px-3 py-1.5 text-xs font-bold">
                          <XCircle size={16} className="text-rose-600" /> CHƯA ĐÚNG (Đáp án: {currentQ.correctAnswer})
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1.5 text-xs font-bold">
                        <HelpCircle size={16} className="text-amber-700" /> Chưa có đáp án chính thức
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ─── EXPLANATION SHEET (LOCKED BEFORE SUBMIT, UNLOCKED AFTER SUBMIT) ─── */}
              <div
                className={`rounded-3xl border transition-all overflow-hidden ${
                  isSubmitted
                    ? isDarkMode
                      ? 'border-slate-800 bg-[#1a1d36]'
                      : 'border-slate-200 bg-white shadow-sm'
                    : isDarkMode
                    ? 'border-slate-800/60 bg-slate-900/40 opacity-70'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                {!isSubmitted ? (
                  /* Locked Panel */
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                      <Lock size={22} />
                    </div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Phần Giải thích, Hán tự và Ngữ pháp đang khóa
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      Hãy chọn một đáp án và bấm <strong>"Nộp bài"</strong> để xem chi tiết phân tích, minh chứng trong đoạn văn và từ vựng mở rộng.
                    </p>
                  </div>
                ) : (
                  /* Unlocked Explanation Tabs */
                  <div className="p-5 space-y-4 animate-fade-in">
                    {/* Tab Buttons */}
                    <div className="flex items-center gap-1 border-b border-slate-100 pb-3">
                      <button
                        type="button"
                        onClick={() => setActiveTab('explanation')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          activeTab === 'explanation'
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Sparkles size={13} />
                        <span>Phân tích & Minh chứng</span>
                      </button>

                      {currentQ.kanjiVocabulary && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('kanji')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'kanji'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>Hán tự</span>
                        </button>
                      )}

                      {currentQ.grammarStructures && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('grammar')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'grammar'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>Ngữ pháp</span>
                        </button>
                      )}
                    </div>

                    {/* Tab 1: Explanation with formatted line alerts */}
                    {activeTab === 'explanation' && (
                      <div className="space-y-2 text-xs leading-relaxed font-jp">
                        {currentQ.answerExplanation ? (
                          currentQ.answerExplanation.split(/\r?\n/).map((line, lIdx) => {
                            const trimmed = line.trim();
                            if (!trimmed) return <div key={lIdx} className="h-1.5" />;

                            if (trimmed.startsWith('✅') || trimmed.startsWith('[Đúng]')) {
                              return (
                                <div
                                  key={lIdx}
                                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-950 font-medium"
                                >
                                  {trimmed}
                                </div>
                              );
                            }
                            if (trimmed.startsWith('❌') || trimmed.startsWith('[Sai]')) {
                              return (
                                <div
                                  key={lIdx}
                                  className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-rose-950 font-medium"
                                >
                                  {trimmed}
                                </div>
                              );
                            }
                            if (trimmed.startsWith('🧠') || trimmed.startsWith('[Mẹo]')) {
                              return (
                                <div
                                  key={lIdx}
                                  className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 font-medium"
                                >
                                  {trimmed}
                                </div>
                              );
                            }

                            return (
                              <p key={lIdx} className="text-slate-700 dark:text-slate-300">
                                {trimmed}
                              </p>
                            );
                          })
                        ) : (
                          <p className="text-slate-400 italic">Chưa có giải thích chi tiết cho câu hỏi này.</p>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Kanji Vocabulary cards */}
                    {activeTab === 'kanji' && (
                      <div className="space-y-2 text-xs font-jp">
                        {currentQ.kanjiVocabulary ? (
                          currentQ.kanjiVocabulary.split(/\r?\n/).map((item, kIdx) => {
                            const line = item.trim();
                            if (!line) return null;
                            return (
                              <div
                                key={kIdx}
                                className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-indigo-950 space-y-0.5"
                              >
                                <p className="font-bold text-xs">{line}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-slate-400 italic">Không có từ vựng hán tự mở rộng.</p>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Grammar structures */}
                    {activeTab === 'grammar' && (
                      <div className="space-y-2 text-xs font-jp">
                        {currentQ.grammarStructures ? (
                          currentQ.grammarStructures.split(/\r?\n/).map((item, gIdx) => {
                            const line = item.trim();
                            if (!line) return null;
                            return (
                              <div
                                key={gIdx}
                                className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-950"
                              >
                                <p className="font-semibold text-xs leading-relaxed">{line}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-slate-400 italic">Không có cấu trúc ngữ pháp mở rộng.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ─── NAVIGATION FOOTER (CÂU TRƯỚC / CÂU TIẾP THEO) ─── */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={currentIndex <= 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={16} />
                  <span>Câu trước</span>
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                    className="flex items-center gap-1.5 rounded-2xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-all"
                  >
                    <span>Câu tiếp theo</span>
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSummary(true)}
                    className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition-all"
                  >
                    <Trophy size={16} />
                    <span>Xem tổng kết</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
