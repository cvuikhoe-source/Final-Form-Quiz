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
  Languages,
  Sparkles,
  Volume2,
  Grid,
  Check,
  X,
  Play,
  Pause,
} from 'lucide-react';

interface VocabExamStudyViewProps {
  lesson: Lesson;
  currentUser: User;
  canManage: boolean;
  completed?: boolean;
  onBack: () => void;
  onMarkDone?: (lessonId: string) => void;
}

const OPTION_SHAPES: Record<'A' | 'B' | 'C' | 'D', { shape: string; label: string }> = {
  A: { shape: '▲', label: 'Tam giác' },
  B: { shape: '◆', label: 'Thoi' },
  C: { shape: '●', label: 'Tròn' },
  D: { shape: '■', label: 'Vuông' },
};

export function VocabExamStudyView({
  lesson,
  currentUser,
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

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Reset timer mỗi khi đổi câu
  useEffect(() => {
    if (!currentQuestion) return;
    setTimeRemaining(currentQuestion.timeSeconds || 30);
    setIsTimerRunning(!isAnswered);
  }, [currentIndex, currentQuestion, isAnswered]);

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

      setProgressMap((prev) => ({
        ...prev,
        [currentQuestion.id]: newProgress,
      }));
      setIsTimerRunning(false);

      try {
        await saveExamQuestionProgress(newProgress);
      } catch (err) {
        console.error(err);
      }
    },
    [currentQuestion, isAnswered, timeRemaining, currentUser.id, lesson.id]
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
    if (!confirm('Bạn có chắc chắn muốn làm lại toàn bộ đề thi từ đầu?')) return;
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

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="text-xs font-semibold text-slate-500">Đang chuẩn bị đề luyện thi Từ vựng...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center">
        <Languages size={48} className="mx-auto text-slate-300 mb-3" />
        <h3 className="text-base font-bold text-slate-800">Bài luyện thi chưa có câu hỏi</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">Vui lòng nhập câu hỏi từ file Excel để bắt đầu luyện tập.</p>
        <button
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  // ─── MÀN HÌNH TỔNG KẾT ───
  if (showSummary) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 mb-4 shadow-inner">
            <Trophy size={40} />
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-1">Kết quả Luyện thi Từ vựng</h2>
          <p className="text-xs text-slate-500 mb-6">{lesson.title}</p>

          {/* Vòng tròn điểm số */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-2xl font-black text-slate-800">{stats.answered}/{stats.total}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Đã hoàn thành</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5">
              <p className="text-2xl font-black text-emerald-600">{stats.correct}</p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">Trả lời đúng</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3.5">
              <p className="text-2xl font-black text-rose-600">{stats.wrong}</p>
              <p className="text-[11px] font-semibold text-rose-700 mt-0.5">Trả lời sai</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <p className="text-xs font-bold text-slate-700 mt-2">
              Tỷ lệ chính xác: <span className="text-emerald-600 font-extrabold">{stats.percent}%</span>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                setShowSummary(false);
                setCurrentIndex(0);
              }}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Xem lại các câu đã làm
            </button>

            {stats.wrong > 0 && (
              <button
                onClick={() => {
                  setFilterWrongOnly(true);
                  setCurrentIndex(0);
                  setShowSummary(false);
                }}
                className="w-full sm:w-auto rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-600 shadow-sm transition-all"
              >
                Luyện lại {stats.wrong} câu sai
              </button>
            )}

            <button
              onClick={handleResetAll}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <RotateCcw size={14} />
              <span>Làm lại toàn bộ</span>
            </button>

            <button
              onClick={() => {
                if (onMarkDone) onMarkDone(lesson.id);
                onBack();
              }}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
            >
              Hoàn thành bài học
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── GIAO DIỆN LÀM BÀI CHÍNH ───
  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-4 py-4 space-y-4">
      {/* ─── Top Bar: Tiêu đề & Thông số ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0"
            title="Quay lại"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700">
                Luyện thi Từ vựng {lesson.jlptLevel || 'N2'}
              </span>
              <h1 className="text-xs sm:text-sm font-bold text-slate-800 truncate">{lesson.title}</h1>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Câu {currentIndex + 1} / {displayQuestions.length}
              {filterWrongOnly && <span className="ml-1 text-amber-600 font-semibold">(Đang lọc câu sai)</span>}
            </p>
          </div>
        </div>

        {/* Đồng hồ đếm ngược & Điểm số */}
        <div className="flex items-center gap-2">
          {/* Timer */}
          <div
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold border transition-colors ${
              timeRemaining <= 5 && !isAnswered
                ? 'border-red-300 bg-red-50 text-red-600 animate-pulse'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            <Clock size={13} className={timeRemaining <= 5 && !isAnswered ? 'text-red-500' : 'text-slate-400'} />
            <span>{timeRemaining}s</span>
            {!isAnswered && (
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="ml-1 text-slate-400 hover:text-slate-600"
              >
                {isTimerRunning ? <Pause size={11} /> : <Play size={11} />}
              </button>
            )}
          </div>

          {/* Điểm đúng */}
          <div className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={13} />
            <span>{stats.correct}</span>
          </div>

          {/* Palette nút bấm */}
          <button
            type="button"
            onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Danh sách câu hỏi"
          >
            <Grid size={13} />
            <span className="hidden sm:inline">Danh sách</span>
          </button>
        </div>
      </div>

      {/* ─── Question Palette Dropdown ─── */}
      {showPalette && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Danh sách {displayQuestions.length} câu hỏi
            </span>
            <button onClick={() => setShowPalette(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 max-h-48 overflow-y-auto pr-1">
            {displayQuestions.map((q, idx) => {
              const p = progressMap[q.id];
              const isCurr = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setShowPalette(false);
                  }}
                  className={`flex h-9 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                    isCurr
                      ? 'ring-2 ring-emerald-500 ring-offset-1'
                      : ''
                  } ${
                    p?.selectedOption
                      ? p.isCorrect
                        ? 'bg-emerald-500 text-white shadow-2xs'
                        : 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {q.questionNo}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── KHU VỰC CÂU HỎI PHÍA TRÊN (STICKY / CỐ ĐỊNH TRONG BÀI) ─── */}
      {currentQuestion && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
          {/* Hàng câu hỏi tiếng Nhật */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-2xs">
                {currentQuestion.questionNo}
              </span>
              <div className="flex-1">
                <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed font-jp">
                  {currentQuestion.questionText}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakJapanese(currentQuestion.questionText)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors shrink-0"
              title="Phát âm câu hỏi"
            >
              <Volume2 size={16} />
            </button>
          </div>

          {/* Bốn lựa chọn A/B/C/D dạng thẻ lớn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {(['A', 'B', 'C', 'D'] as const).map((opt) => {
              const optText =
                opt === 'A'
                  ? currentQuestion.optionA
                  : opt === 'B'
                  ? currentQuestion.optionB
                  : opt === 'C'
                  ? currentQuestion.optionC
                  : currentQuestion.optionD;

              const isSelected = currentProgress?.selectedOption === opt;
              const isCorrectOpt = currentQuestion.correctAnswer === opt;

              let cardStyle = 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/20 text-slate-800';
              let badgeStyle = 'bg-slate-100 text-slate-700';

              if (isAnswered) {
                if (isCorrectOpt) {
                  // Đáp án đúng luôn xanh
                  cardStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-400/40 shadow-xs';
                  badgeStyle = 'bg-emerald-600 text-white';
                } else if (isSelected) {
                  // Nếu người dùng chọn sai -> chuyển đỏ
                  cardStyle = 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-2 ring-rose-400/40 shadow-xs';
                  badgeStyle = 'bg-rose-600 text-white';
                } else {
                  // Các đáp án khác bị mờ đi
                  cardStyle = 'border-slate-100 bg-slate-50/60 text-slate-400 opacity-60';
                  badgeStyle = 'bg-slate-200 text-slate-400';
                }
              }

              return (
                <button
                  key={opt}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(opt)}
                  className={`flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all ${cardStyle} ${
                    !isAnswered ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-2xs transition-colors ${badgeStyle}`}>
                    {opt}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-jp truncate leading-tight">{optText}</p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {OPTION_SHAPES[opt].shape} {OPTION_SHAPES[opt].label}
                    </span>
                  </div>
                  {isAnswered && isCorrectOpt && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0 shadow-2xs">
                      <Check size={14} />
                    </span>
                  )}
                  {isAnswered && isSelected && !isCorrectOpt && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shrink-0 shadow-2xs">
                      <X size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── KHU VỰC GIẢI THÍCH PHÍA DƯỚI (CUỘN ĐỘC LẬP, ẨN TRƯỚC KHI TRẢ LỜI) ─── */}
      {isAnswered && currentQuestion && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4 animate-slide-up">
          {/* Banner phản hồi đúng / sai */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 border ${
              currentProgress?.isCorrect
                ? 'border-emerald-300 bg-emerald-50/80 text-emerald-900'
                : 'border-rose-300 bg-rose-50/80 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {currentProgress?.isCorrect ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs">
                  <CheckCircle2 size={20} />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-2xs">
                  <XCircle size={20} />
                </div>
              )}
              <div>
                <p className="text-sm font-bold">
                  {currentProgress?.isCorrect ? 'CHÍNH XÁC! 🎉' : 'CHƯA CHÍNH XÁC! 💡'}
                </p>
                <p className="text-xs opacity-90">
                  Đáp án đúng là: <span className="font-extrabold uppercase">{currentQuestion.correctAnswer}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRetryCurrent}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <RotateCcw size={13} />
              <span>Làm lại câu này</span>
            </button>
          </div>

          {/* Tiêu đề phần giải thích */}
          <div className="flex items-center gap-2 pt-1 border-b border-slate-100 pb-2">
            <Sparkles size={16} className="text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Phân tích chi tiết 4 lựa chọn (A / B / C / D)
            </h3>
          </div>

          {/* Bốn khối phân tích A/B/C/D */}
          <div className="space-y-3">
            {(['A', 'B', 'C', 'D'] as const).map((opt) => {
              const optText =
                opt === 'A'
                  ? currentQuestion.optionA
                  : opt === 'B'
                  ? currentQuestion.optionB
                  : opt === 'C'
                  ? currentQuestion.optionC
                  : currentQuestion.optionD;

              const isCorrectOpt = currentQuestion.correctAnswer === opt;
              const details = currentQuestion.optionDetails?.[opt];

              return (
                <div
                  key={opt}
                  className={`rounded-2xl border-2 p-4 transition-all ${
                    isCorrectOpt
                      ? 'border-emerald-300 bg-emerald-50/50 shadow-2xs'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black shadow-2xs ${
                          isCorrectOpt ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {opt}
                      </span>
                      <span className="text-sm font-bold font-jp text-slate-800">{optText}</span>
                    </div>

                    {isCorrectOpt && (
                      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        ĐÁP ÁN ĐÚNG
                      </span>
                    )}
                  </div>

                  {details ? (
                    <div className="space-y-2 text-xs">
                      {details.han_viet && (
                        <div className="rounded-xl bg-white p-2.5 border border-slate-100">
                          <p className="text-slate-700 leading-relaxed">
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
                              <p className="font-jp text-slate-800 leading-relaxed">{details.example_jp}</p>
                              <button
                                type="button"
                                onClick={() => speakJapanese(details.example_jp)}
                                className="text-slate-400 hover:text-emerald-600 p-1 shrink-0"
                                title="Phát âm ví dụ"
                              >
                                <Volume2 size={13} />
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
      )}

      {/* ─── THANH ĐIỀU HƯỚNG CUỐI TRANG (NAVIGATION BAR) ─── */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          disabled={currentIndex <= 0}
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={16} />
          <span>Câu trước</span>
        </button>

        <div className="flex items-center gap-2">
          {currentIndex < displayQuestions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(displayQuestions.length - 1, prev + 1))}
              className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
            >
              <span>Câu tiếp</span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
            >
              <Trophy size={15} />
              <span>Xem kết quả</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
