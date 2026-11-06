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
  BookOpen,
  Award,
  ListOrdered,
  Sparkles,
  Play,
  Pause,
  AlertCircle,
  Grid,
  Check,
  X,
  Volume2,
} from 'lucide-react';

interface GrammarExamStudyViewProps {
  lesson: Lesson;
  currentUser: User;
  canManage: boolean;
  completed?: boolean;
  onBack: () => void;
  onMarkDone?: (lessonId: string) => void;
}

export function GrammarExamStudyView({
  lesson,
  currentUser,
  completed = false,
  onBack,
  onMarkDone,
}: GrammarExamStudyViewProps) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ExamQuestionProgress>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [filterWrongOnly, setFilterWrongOnly] = useState(false);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(45);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const [totalTimeSpent, setTotalTimeSpent] = useState<number>(0);
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

        // Find first unanswered question if any
        const firstUnanswered = loadedQuestions.findIndex(
          (q) => !loadedProgress[q.id]?.selectedOption
        );
        if (firstUnanswered >= 0) {
          setCurrentIndex(firstUnanswered);
        } else if (loadedQuestions.length > 0 && Object.keys(loadedProgress).length > 0) {
          // If all already answered, show summary
          setShowSummary(true);
        }
      } catch (err) {
        console.error(err);
        toast('Không thể tải câu hỏi bài học', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [lesson.id, currentUser.id]);

  // Questions filtered if review mode
  const activeQuestions = useMemo(() => {
    if (!filterWrongOnly) return questions;
    return questions.filter((q) => {
      const prog = progressMap[q.id];
      return prog && prog.selectedOption && !prog.isCorrect;
    });
  }, [questions, progressMap, filterWrongOnly]);

  const currentQuestion = activeQuestions[currentIndex] || null;
  const currentProgress = currentQuestion ? progressMap[currentQuestion.id] : null;
  const isCurrentAnswered = Boolean(currentProgress?.selectedOption);

  // Reset timer on question change
  useEffect(() => {
    if (!currentQuestion) return;
    if (isCurrentAnswered) {
      setIsTimerRunning(false);
    } else {
      setTimeRemaining(currentQuestion.timeSeconds || 45);
      setIsTimerRunning(true);
    }
  }, [currentQuestion, isCurrentAnswered]);

  // Countdown timer effect
  useEffect(() => {
    if (!isTimerRunning || isCurrentAnswered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
      setTotalTimeSpent((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, isCurrentAnswered]);

  // Calculate statistics
  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    questions.forEach((q) => {
      const prog = progressMap[q.id];
      if (!prog || !prog.selectedOption) {
        unanswered++;
      } else if (prog.isCorrect) {
        correct++;
      } else {
        incorrect++;
      }
    });

    const totalAnswered = correct + incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((correct / totalAnswered) * 100) : 0;
    const scoreRate = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

    return {
      total: questions.length,
      correct,
      incorrect,
      unanswered,
      totalAnswered,
      accuracy,
      scoreRate,
    };
  }, [questions, progressMap]);

  // Sound effects (Web Audio API synthesizers - zero external dependencies)
  const playSound = useCallback((isCorrect: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isCorrect) {
        // High upbeat chord: C5 to G5
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else {
        // Low double buzz
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(146.83, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // AudioContext disabled or not supported
    }
  }, []);

  // Handle option selection
  const handleSelectOption = async (option: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQuestion || isCurrentAnswered) return;

    const isCorrect = option === currentQuestion.correctAnswer;
    const timeSpent = (currentQuestion.timeSeconds || 45) - timeRemaining;

    const progress: ExamQuestionProgress = {
      userId: currentUser.id,
      lessonId: lesson.id,
      questionId: currentQuestion.id,
      selectedOption: option,
      isCorrect,
      timeSpent: Math.max(1, timeSpent),
      completedAt: new Date().toISOString(),
    };

    // Update state
    const nextMap = { ...progressMap, [currentQuestion.id]: progress };
    setProgressMap(nextMap);
    setIsTimerRunning(false);

    // Audio feedback
    playSound(isCorrect);

    // Persist
    try {
      await saveExamQuestionProgress(progress);
    } catch (err) {
      console.error(err);
    }

    // Check completion threshold
    const answeredCount = Object.values(nextMap).filter((p) => p.selectedOption).length;
    if (answeredCount === questions.length) {
      const correctCount = Object.values(nextMap).filter((p) => p.isCorrect).length;
      if (onMarkDone && correctCount / questions.length >= 0.8) {
        onMarkDone(lesson.id);
      }
    }
  };

  // Reset practice progress
  const handleResetAll = async () => {
    if (!window.confirm('Bạn có chắc muốn làm lại toàn bộ đề luyện thi này? Dữ liệu câu trả lời sẽ được đặt lại.')) {
      return;
    }
    try {
      await resetExamQuestionProgress(currentUser.id, lesson.id);
      setProgressMap({});
      setCurrentIndex(0);
      setShowSummary(false);
      setFilterWrongOnly(false);
      toast('Đã đặt lại đề thi. Chúc bạn làm bài tốt!', 'success');
    } catch (err) {
      console.error(err);
      toast('Không thể đặt lại tiến độ', 'error');
    }
  };

  // Review mistakes only mode
  const handleReviewMistakes = () => {
    setFilterWrongOnly(true);
    setCurrentIndex(0);
    setShowSummary(false);
  };

  // Format timer seconds into mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Parse sentence ordering question to render blanks and ★ distinctly
  const renderQuestionText = (text: string, type: string) => {
    if (type !== 'sentence_ordering') {
      return <span className="break-words select-text">{text}</span>;
    }

    // Pattern for matching blanks with star: e.g. ___ ___ * ___
    const parts = text.split(/(＿＿|___|\*{1,2}|★)/g);
    return (
      <span className="break-words leading-loose select-text">
        {parts.map((part, idx) => {
          if (part === '★' || part === '*' || part === '**') {
            return (
              <span
                key={idx}
                className="inline-flex items-center justify-center mx-1 px-2 py-0.5 rounded-md bg-amber-400 text-amber-950 font-bold text-base shadow-sm ring-2 ring-amber-300 animate-pulse"
                title="Vị trí dấu sao ★ cần tìm đáp án"
              >
                ★
              </span>
            );
          }
          if (part === '＿＿' || part === '___') {
            return (
              <span
                key={idx}
                className="inline-block mx-1 px-3 py-0.5 border-b-2 border-slate-700 text-slate-400 font-bold"
              >
                ＿＿
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600 text-sm font-medium animate-pulse">
          Đang tải đề luyện thi ngữ pháp...
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Chưa có câu hỏi luyện thi</h2>
        <p className="text-slate-500 text-sm max-w-md mb-6">
          Bài học này hiện chưa có câu hỏi nào. Vui lòng nhập đề từ file Excel bằng chức năng &quot;Nhập đề luyện thi&quot;.
        </p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition-all"
        >
          Quay lại danh sách bài học
        </button>
      </div>
    );
  }

  // ─── SUMMARY VIEW ──────────────────────────────────────────────
  if (showSummary) {
    const isPass = stats.scoreRate >= 80;
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Danh sách bài học
            </button>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tổng kết kết quả luyện thi
            </span>
          </div>
        </div>

        {/* Summary Card */}
        <div className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-6">
            <div className="relative inline-block">
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-lg ${
                  isPass
                    ? 'bg-emerald-100 text-emerald-600 shadow-emerald-200'
                    : 'bg-amber-100 text-amber-600 shadow-amber-200'
                }`}
              >
                {isPass ? <Trophy className="w-12 h-12" /> : <Award className="w-12 h-12" />}
              </div>
              <span
                className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-full text-xs font-black uppercase text-white shadow ${
                  isPass ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              >
                {lesson.jlptLevel || 'N2'}
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900">{lesson.title}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {isPass
                  ? 'Chúc mừng! Bạn đã hoàn thành xuất sắc bài luyện thi ngữ pháp.'
                  : 'Bạn đã hoàn thành bài thi! Hãy tiếp tục rà soát lại các câu sai để ghi nhớ vững hơn.'}
              </p>
            </div>

            {/* Score circle / box */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-2">
              <div className="text-4xl sm:text-5xl font-black text-slate-900">
                {stats.correct}{' '}
                <span className="text-2xl sm:text-3xl text-slate-400 font-semibold">
                  / {stats.total}
                </span>
              </div>
              <div className="text-sm font-semibold text-emerald-600">
                Độ chính xác: {stats.accuracy}% ({stats.scoreRate >= 80 ? 'Đạt' : 'Chưa đạt'})
              </div>
              {totalTimeSpent > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-1 border-t border-slate-200/60 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Thời gian làm bài: {formatTime(totalTimeSpent)}</span>
                </div>
              )}
            </div>

            {/* Breakdown grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-emerald-700">{stats.correct}</div>
                <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider mt-0.5">
                  Câu đúng
                </div>
              </div>
              <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-rose-700">{stats.incorrect}</div>
                <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider mt-0.5">
                  Câu sai
                </div>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-slate-700">{stats.unanswered}</div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mt-0.5">
                  Chưa làm
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowSummary(false);
                    setCurrentIndex(0);
                    setFilterWrongOnly(false);
                  }}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-4 h-4" /> Xem lại chi tiết từng câu
                </button>

                {stats.incorrect > 0 && (
                  <button
                    onClick={handleReviewMistakes}
                    className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Ôn lại {stats.incorrect} câu sai
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleResetAll}
                  className="flex-1 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Làm lại từ đầu
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Quay về danh sách
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN STUDY / EXAM VIEW ────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Back button & Lesson Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0"
              title="Quay lại danh sách bài học"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 truncate">{lesson.title}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {lesson.jlptLevel || 'N2'}
                </span>
                {completed && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Đã hoàn thành
                  </span>
                )}
                {filterWrongOnly && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    Chế độ ôn câu sai
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Câu {currentQuestion?.questionNo || currentIndex + 1} / {questions.length} • Đúng:{' '}
                {stats.correct}/{stats.totalAnswered} ({stats.accuracy}%)
              </p>
            </div>
          </div>

          {/* Right Header: Timer & Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Timer pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-all ${
                timeRemaining <= 10 && !isCurrentAnswered
                  ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="Thời gian làm bài câu này"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTime(timeRemaining)}</span>
              {!isCurrentAnswered && (
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="ml-1 text-slate-400 hover:text-slate-700"
                  title={isTimerRunning ? 'Tạm dừng đồng hồ' : 'Tiếp tục'}
                >
                  {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}
            </div>

            {/* Question Palette Toggle */}
            <button
              onClick={() => setShowPalette(!showPalette)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showPalette
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Mở bảng câu hỏi"
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline font-mono">
                {currentIndex + 1}/{activeQuestions.length}
              </span>
            </button>

            {/* Summary / Finish Button */}
            <button
              onClick={() => setShowSummary(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
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
              width: `${(stats.totalAnswered / Math.max(1, stats.total)) * 100}%`,
            }}
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-6">
        {/* Palette Drawer (if open) */}
        {showPalette && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4 text-emerald-600" /> Bảng câu hỏi ({activeQuestions.length} câu)
              </h3>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Đúng ({stats.correct})
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Sai ({stats.incorrect})
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Chưa làm ({stats.unanswered})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {activeQuestions.map((q, idx) => {
                const prog = progressMap[q.id];
                const isCurrent = idx === currentIndex;
                const isAnswered = Boolean(prog?.selectedOption);
                const isCorrect = Boolean(prog?.isCorrect);

                let btnBg = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                if (isAnswered) {
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
                    className={`h-11 rounded-xl text-xs font-mono font-bold transition-all flex flex-col items-center justify-center relative ${btnBg} ${
                      isCurrent
                        ? 'ring-4 ring-emerald-300 ring-offset-1 scale-105 shadow-md z-10'
                        : 'opacity-90 hover:opacity-100'
                    }`}
                  >
                    <span>{q.questionNo}</span>
                    {q.questionType === 'sentence_ordering' && (
                      <span className="text-[9px] -mt-1 leading-none text-amber-300">★</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Question Card */}
        {currentQuestion && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden transition-all">
            {/* Question Card Header */}
            <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1 bg-slate-900 text-white text-xs font-black font-mono rounded-lg">
                  Câu {currentQuestion.questionNo}
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                    currentQuestion.questionType === 'sentence_ordering'
                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                      : 'bg-blue-100 text-blue-900 border border-blue-200'
                  }`}
                >
                  {currentQuestion.questionType === 'sentence_ordering'
                    ? '★ Sắp xếp câu sao'
                    : 'Trắc nghiệm ngữ pháp'}
                </span>
              </div>

              {isCurrentAnswered && (
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

            {/* Question Text Body */}
            <div className="p-6 sm:p-8">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3">
                {currentQuestion.questionType === 'sentence_ordering'
                  ? 'Chọn từ thích hợp điền vào vị trí ngôi sao ★'
                  : 'Chọn đáp án thích hợp nhất để hoàn thành câu'}
              </div>

              <div className="font-japanese text-xl sm:text-2xl font-medium text-slate-900 leading-relaxed sm:leading-loose">
                {renderQuestionText(currentQuestion.questionText, currentQuestion.questionType)}
              </div>
            </div>

            {/* Options List (4 options A, B, C, D) */}
            <div className="p-6 sm:p-8 pt-0 space-y-3">
              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const optText = currentQuestion[`option${letter}`];
                const isSelected = currentProgress?.selectedOption === letter;
                const isCorrectOption = currentQuestion.correctAnswer === letter;

                // Styling logic based on answer concealment rule
                let buttonStyle = 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300 hover:bg-slate-50/50';
                let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';

                if (isCurrentAnswered) {
                  if (isSelected && isCorrectOption) {
                    // Chosen and correct: Emerald
                    buttonStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-sm shadow-emerald-100';
                    badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
                  } else if (isSelected && !isCorrectOption) {
                    // Chosen and wrong: Rose
                    buttonStyle = 'bg-rose-50 border-rose-500 text-rose-950 font-bold shadow-sm shadow-rose-100';
                    badgeStyle = 'bg-rose-600 text-white border-rose-600';
                  } else if (isCorrectOption) {
                    // Correct answer revealed: Emerald outline
                    buttonStyle = 'bg-emerald-50/60 border-emerald-400 text-emerald-900 font-bold';
                    badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
                  } else {
                    // Other unchosen options: Dimmed
                    buttonStyle = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                    badgeStyle = 'bg-slate-100 text-slate-400 border-slate-200';
                  }
                }

                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => handleSelectOption(letter)}
                    disabled={isCurrentAnswered}
                    className={`w-full text-left p-4 min-h-[56px] rounded-2xl border-2 transition-all flex items-center justify-between gap-4 ${buttonStyle} ${
                      !isCurrentAnswered ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center font-black font-mono text-sm flex-shrink-0 transition-colors ${badgeStyle}`}
                      >
                        {letter}
                      </span>
                      <span className="font-japanese text-base sm:text-lg font-medium break-words">
                        {optText}
                      </span>
                    </div>

                    {isCurrentAnswered && (
                      <div className="flex-shrink-0">
                        {isCorrectOption ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : isSelected ? (
                          <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow">
                            <XCircle className="w-4 h-4" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Answer Concealment Enforcement: Only render explanation & Han-Viet when question is answered */}
            {isCurrentAnswered && (
              <div className="p-6 sm:p-8 bg-slate-50/70 border-t border-slate-200 space-y-5 animate-in fade-in duration-300">
                {/* Explanation Card */}
                {currentQuestion.answerExplanation && (
                  <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Phân tích đáp án chi tiết</span>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line font-japanese">
                      {currentQuestion.answerExplanation}
                    </div>
                  </div>
                )}

                {/* Vocabulary & Han-Viet Card */}
                {currentQuestion.vocabularyHanViet && (
                  <div className="bg-white rounded-2xl p-5 border border-amber-200/80 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                      <Volume2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Từ vựng – Âm Hán Việt</span>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line font-japanese">
                      {currentQuestion.vocabularyHanViet}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation Bar */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 z-20 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Previous Button */}
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              currentIndex === 0
                ? 'text-slate-300 bg-slate-100 cursor-not-allowed'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Câu trước</span>
          </button>

          {/* Center Info */}
          <div className="text-center">
            <span className="text-xs font-black font-mono text-slate-700">
              Câu {currentIndex + 1} / {activeQuestions.length}
            </span>
            <div className="text-[10px] text-slate-400">
              {isCurrentAnswered ? 'Đã làm' : 'Đang chờ chọn đáp án'}
            </div>
          </div>

          {/* Next or Finish Button */}
          {currentIndex < activeQuestions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex((prev) => prev + 1)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all"
            >
              <span>Câu tiếp theo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowSummary(true)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-black active:scale-95 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Nộp bài & Tổng kết</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
