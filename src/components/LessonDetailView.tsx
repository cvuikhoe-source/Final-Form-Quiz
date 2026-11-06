import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Lesson, LessonExample, LessonExercise, LessonAnswer, User, MasteryStatus, GrammarProgress, GrammarItem, ExerciseType } from '@/types';
import {
  loadGrammarProgress,
  saveGrammarProgress,
  getMasteryStatusLabel,
  getMasteryStatusColor,
  loadGrammarItems,
} from '@/storage';
import { calculateGrammarNextReviewAt } from '@/lib/grammarStudyGroupService';
import {
  ArrowLeft, BookOpen, MessageSquare, PenLine, CheckCircle2,
  ChevronDown, ChevronUp, Copy, Check, Eye, EyeOff, Award,
  ChevronLeft, ChevronRight, Volume2, Link2, AlertTriangle,
  GitCompare, Sparkles, AlertCircle, Flame, CheckCircle,
  HelpCircle, CheckCheck, XCircle, RotateCcw, Layers,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface LessonDetailViewProps {
  lesson: Lesson;
  completed: boolean;
  siblingLessons: Lesson[];
  currentUser?: User;
  onBack: () => void;
  onMarkDone: (id: string) => void;
  onNavigate: (lesson: Lesson) => void;
}

const STATUS_CONFIGS: {
  id: MasteryStatus;
  label: string;
  icon: typeof CheckCircle;
  activeClass: string;
  pillClass: string;
}[] = [
  { id: 'forgot', label: 'Quên', icon: AlertCircle, activeClass: 'bg-rose-600 text-white border-rose-600', pillClass: 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100' },
  { id: 'hard', label: 'Khó', icon: Flame, activeClass: 'bg-amber-500 text-white border-amber-500', pillClass: 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100' },
  { id: 'almost', label: 'Gần nhớ', icon: Sparkles, activeClass: 'bg-blue-600 text-white border-blue-600', pillClass: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' },
  { id: 'mastered', label: 'Đã nhớ', icon: CheckCircle, activeClass: 'bg-emerald-600 text-white border-emerald-600', pillClass: 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
];

function extractJlpt(source?: string, title?: string): string | null {
  const combined = `${source ?? ''} ${title ?? ''}`;
  const match = combined.match(/\b(N[1-5])\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function LessonDetailView({
  lesson,
  completed,
  siblingLessons,
  currentUser,
  onBack,
  onMarkDone,
  onNavigate,
}: LessonDetailViewProps) {
  const { t } = useLanguage();
  const [showAnswers, setShowAnswers] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<number, { isCorrect: boolean; feedback: string }>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [openSection, setOpenSection] = useState<number>(1);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Multi-item grammar support (e.g. 140 items in 1 lesson)
  const [grammarItems, setGrammarItems] = useState<GrammarItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  useEffect(() => {
    loadGrammarItems(lesson.id).then((items) => {
      setGrammarItems(items);
      setActiveItemIndex(0);
    });
  }, [lesson.id]);

  const activeGrammarItem = grammarItems.length > 0 ? grammarItems[activeItemIndex] : null;

  // Tiến độ học riêng của currentUser (cách ly hoàn toàn)
  const [userProgress, setUserProgress] = useState<GrammarProgress | null>(() => {
    if (!currentUser) return null;
    const progressMap = loadGrammarProgress(currentUser.id);
    return progressMap[lesson.id] ?? null;
  });

  // Tự động load lại tiến độ khi bài học hoặc user thay đổi
  useEffect(() => {
    if (!currentUser) {
      setUserProgress(null);
      return;
    }
    const progressMap = loadGrammarProgress(currentUser.id);
    setUserProgress(progressMap[lesson.id] ?? null);
  }, [lesson.id, currentUser]);

  const currentIndex = siblingLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < siblingLessons.length - 1 ? siblingLessons[currentIndex + 1] : null;

  const hasNextItem = grammarItems.length > 1 && activeItemIndex < grammarItems.length - 1;
  const canGoNext = hasNextItem || Boolean(nextLesson);
  const nextTitle = hasNextItem
    ? (grammarItems[activeItemIndex + 1]?.grammarPattern || `Mục ${activeItemIndex + 2}`)
    : nextLesson?.title;

  const hasPrevItem = grammarItems.length > 1 && activeItemIndex > 0;
  const canGoPrev = hasPrevItem || Boolean(prevLesson);
  const prevTitle = hasPrevItem
    ? (grammarItems[activeItemIndex - 1]?.grammarPattern || `Mục ${activeItemIndex}`)
    : prevLesson?.title;

  const handleNext = () => {
    if (hasNextItem) {
      setActiveItemIndex((prev) => prev + 1);
      setShowAnswers(false);
      setAnswers({});
      setExerciseFeedback({});
      setOpenSection(1);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (nextLesson) {
      onNavigate(nextLesson);
    }
  };

  const handlePrev = () => {
    if (hasPrevItem) {
      setActiveItemIndex((prev) => prev - 1);
      setShowAnswers(false);
      setAnswers({});
      setExerciseFeedback({});
      setOpenSection(1);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (prevLesson) {
      onNavigate(prevLesson);
    }
  };

  // Reset state and scroll to top when lesson changes
  useEffect(() => {
    setShowAnswers(false);
    setAnswers({});
    setExerciseFeedback({});
    setOpenSection(1);
    setShowStatusMenu(false);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lesson.id]);

  // Phát âm tiếng Nhật bằng Web Speech API
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

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const copyTitleText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 1800);
  };

  const setAnswer = (stt: number, val: string) => {
    setAnswers((prev) => ({ ...prev, [stt]: val }));
    // Xóa feedback cũ khi người dùng thay đổi lựa chọn
    setExerciseFeedback((prev) => {
      const next = { ...prev };
      delete next[stt];
      return next;
    });
  };

  const displayedTitle = activeGrammarItem ? activeGrammarItem.grammarPattern : lesson.title;
  const displayedMeaning = activeGrammarItem ? activeGrammarItem.meaning : lesson.meaning;
  const displayedStructure = activeGrammarItem ? (activeGrammarItem.connectionRule || activeGrammarItem.structure || lesson.connectionRule) : lesson.connectionRule;
  const displayedNotes = activeGrammarItem ? (activeGrammarItem.caution || activeGrammarItem.explanation || lesson.notes) : lesson.notes;
  const displayedDistinction = activeGrammarItem ? (activeGrammarItem.distinction || lesson.distinction) : lesson.distinction;
  const displayedSource = activeGrammarItem ? (activeGrammarItem.source || lesson.source) : lesson.source;
  const displayedItemCode = activeGrammarItem?.itemCode || activeGrammarItem?.itemId;

  const effectiveExamples: LessonExample[] = useMemo(() => {
    if (activeGrammarItem) {
      if (activeGrammarItem.examples && activeGrammarItem.examples.length > 0) {
        return activeGrammarItem.examples.map((ex, idx) => ({
          stt: ex.stt ?? idx + 1,
          japanese: ex.japanese,
          vietnamese: ex.vietnamese,
          analysis: ex.analysis || '',
          vocabulary: ex.vocabulary_furigana || ex.vocabulary || '',
          note: ex.note || '',
        }));
      }
      if (activeGrammarItem.exampleJp) {
        return [{
          stt: 1,
          japanese: activeGrammarItem.exampleJp,
          vietnamese: activeGrammarItem.exampleVi || '',
          analysis: activeGrammarItem.exampleAnalysis || '',
          vocabulary: '',
          note: activeGrammarItem.notes || '',
        }];
      }
    }
    return lesson.examples || [];
  }, [activeGrammarItem, lesson.examples]);

  const effectiveExercises: LessonExercise[] = useMemo(() => {
    if (activeGrammarItem && activeGrammarItem.exercises && activeGrammarItem.exercises.length > 0) {
      return activeGrammarItem.exercises.map((e, idx) => ({
        stt: e.stt ?? idx + 1,
        type: (e.type as ExerciseType) || 'multiple_choice',
        question: e.question,
        optionA: e.option_a || e.optionA || '',
        optionB: e.option_b || e.optionB || '',
        optionC: e.option_c || e.optionC || '',
        optionD: e.option_d || e.optionD || '',
        hint: e.hint || '',
      }));
    }
    return lesson.exercises || [];
  }, [activeGrammarItem, lesson.exercises]);

  const effectiveAnswers: LessonAnswer[] = useMemo(() => {
    if (activeGrammarItem && activeGrammarItem.answers && activeGrammarItem.answers.length > 0) {
      return activeGrammarItem.answers.map((a, idx) => ({
        stt: a.stt ?? idx + 1,
        answer: a.answer,
        fullSentence: a.complete_sentence || a.fullSentence || '',
        explanation: a.detailed_explanation || a.explanation || '',
        commonErrors: a.distractor_errors || a.commonErrors || '',
        selfAssess: a.self_assessment || a.selfAssess || '',
      }));
    }
    return lesson.answers || [];
  }, [activeGrammarItem, lesson.answers]);

  // Kiểm tra đáp án cho từng câu bài tập
  const handleCheckExercise = (stt: number) => {
    const userVal = (answers[stt] ?? '').trim().toLowerCase();
    if (!userVal) return;

    const correctAnsObj = effectiveAnswers.find((a) => a.stt === stt);
    if (!correctAnsObj) {
      setExerciseFeedback((prev) => ({
        ...prev,
        [stt]: { isCorrect: true, feedback: 'Đã hoàn thành.' },
      }));
      return;
    }

    const correctVal = correctAnsObj.answer.trim().toLowerCase();
    const isCorrect = userVal === correctVal || (correctAnsObj.answer.length > 2 && correctVal.includes(userVal));

    setExerciseFeedback((prev) => ({
      ...prev,
      [stt]: {
        isCorrect,
        feedback: isCorrect
          ? '✓ Chính xác! Rất xuất sắc.'
          : `Chưa chính xác (Đáp án: ${correctAnsObj.answer})`,
      },
    }));
  };

  // Cập nhật trạng thái tự đánh giá của học viên
  const handleSetStatus = (status: MasteryStatus) => {
    if (!currentUser) return;
    const nextReviewCount = (userProgress?.reviewCount ?? 0) + 1;
    const nextReviewAt = calculateGrammarNextReviewAt(status, nextReviewCount);
    const updated: GrammarProgress = {
      masteryStatus: status,
      reviewCount: nextReviewCount,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt,
      viewedBack: true,
    };
    saveGrammarProgress(currentUser.id, lesson.id, updated);
    setUserProgress(updated);
    setShowStatusMenu(false);

    if (status === 'mastered') {
      onMarkDone(lesson.id);
    }
  };

  const exerciseTypeLabel = (ex: LessonExercise) => {
    switch (ex.type) {
      case 'multiple_choice':
        return t('lessonDetail.exType.multiple_choice');
      case 'conjugation':
        return t('lessonDetail.exType.conjugation');
      case 'arrange':
        return t('lessonDetail.exType.arrange');
      case 'translate':
        return t('lessonDetail.exType.translate');
      default:
        return ex.type;
    }
  };

  const sectionToggle = (n: number) => setOpenSection(openSection === n ? 0 : n);

  const jlptLevel = useMemo(() => (
    activeGrammarItem?.jlptLevel || extractJlpt(lesson.source, displayedTitle)
  ), [activeGrammarItem, lesson.source, displayedTitle]);
  const currentStatus = userProgress?.masteryStatus ?? (completed ? 'mastered' : 'new');

  return (
    <div className="min-h-screen bg-slate-50/70 pb-28 md:px-0 md:pb-12 text-slate-800" ref={topRef}>
      {/* ─── HEADER CỐ ĐỊNH VỪA PHẢI (STICKY TOP BAR) ─── */}
      <header className="sticky top-[57px] z-20 border-b border-slate-200/90 bg-white/95 px-3 py-2.5 backdrop-blur-md transition-all sm:px-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2.5 sm:gap-4">
          {/* Nút quay lại */}
          <button
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 hover:text-slate-900 active:scale-95"
            title="Quay lại danh sách"
          >
            <ArrowLeft size={18} />
          </button>

          {/* Tiêu đề & Ý nghĩa rút gọn */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-jp text-sm sm:text-base font-bold text-slate-900">
                {displayedTitle}
              </h1>
              {jlptLevel && (
                <span className="shrink-0 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 text-[10px] font-extrabold text-indigo-700">
                  {jlptLevel}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-slate-500">
              {displayedMeaning}
            </p>
          </div>

          {/* Khu vực trạng thái & đánh dấu đã học */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Badge trạng thái học hiện tại (Click để mở menu chọn 4 trạng thái) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold border transition-all active:scale-95 ${getMasteryStatusColor(currentStatus)}`}
                title="Bấm để cập nhật trạng thái học"
              >
                <span>{getMasteryStatusLabel(currentStatus)}</span>
                <ChevronDown size={13} className="opacity-70" />
              </button>

              {/* Dropdown 4 trạng thái */}
              {showStatusMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowStatusMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Đánh giá trạng thái
                    </p>
                    <div className="space-y-1">
                      {STATUS_CONFIGS.map((s) => {
                        const Icon = s.icon;
                        const isSelected = currentStatus === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSetStatus(s.id)}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                              isSelected ? s.activeClass : s.pillClass
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <Icon size={14} />
                              {s.label}
                            </span>
                            {isSelected && <Check size={13} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Nút Đánh dấu đã học (nếu chưa hoàn thành) */}
            {!completed && currentStatus !== 'mastered' ? (
              <button
                onClick={() => {
                  onMarkDone(lesson.id);
                  handleSetStatus('mastered');
                }}
                className="hidden sm:inline-flex items-center gap-1 shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all"
                title="Đánh dấu đã nắm vững mẫu này"
              >
                <CheckCircle2 size={14} />
                <span>{t('lessonDetail.markDone')}</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 size={14} />
                <span>{t('lessonDetail.done')}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ─── NỘI DUNG CHÍNH (MAIN BODY) ─── */}
      <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-4 sm:pt-6 space-y-4 sm:space-y-5">

        {/* ── THANH CHUYỂN MỤC NGỮ PHÁP (KHI CÓ NHIỀU MỤC) ── */}
        {grammarItems.length > 1 && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-indigo-200/90 bg-indigo-50/60 p-2.5 sm:p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={activeItemIndex <= 0}
                onClick={() => setActiveItemIndex((prev) => Math.max(0, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs disabled:opacity-40 hover:bg-slate-50 transition-colors"
                title="Mục trước"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                disabled={activeItemIndex >= grammarItems.length - 1}
                onClick={() => setActiveItemIndex((prev) => Math.min(grammarItems.length - 1, prev + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs disabled:opacity-40 hover:bg-slate-50 transition-colors"
                title="Mục tiếp theo"
              >
                <ChevronRight size={16} />
              </button>
              <span className="text-xs font-bold text-indigo-900 ml-1">
                Mục {activeItemIndex + 1} / {grammarItems.length}
              </span>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowItemPicker(!showItemPicker)}
                className="flex items-center gap-1.5 rounded-xl bg-white border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50"
              >
                <Layers size={14} />
                <span>Danh sách ({grammarItems.length})</span>
                <ChevronDown size={13} />
              </button>

              {showItemPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowItemPicker(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="mb-2">
                      <input
                        type="text"
                        value={itemSearchQuery}
                        onChange={(e) => setItemSearchQuery(e.target.value)}
                        placeholder="Tìm mẫu ngữ pháp..."
                        className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {grammarItems
                        .filter((g) => !itemSearchQuery || g.grammarPattern.toLowerCase().includes(itemSearchQuery.toLowerCase()) || g.meaning.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                        .map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              setActiveItemIndex(grammarItems.findIndex((it) => it.id === g.id));
                              setShowItemPicker(false);
                            }}
                            className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                              grammarItems[activeItemIndex]?.id === g.id ? 'bg-indigo-50 font-bold text-indigo-700' : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{g.sortOrder}. {g.grammarPattern}</span>
                            {g.jlptLevel && <span className="text-[10px] text-slate-400 shrink-0 ml-1">{g.jlptLevel}</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── KHỐI THÔNG TIN NỔI BẬT (HERO CARD) ── */}
        <div className="relative overflow-hidden rounded-3xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40 p-5 sm:p-7 shadow-xs">
          {/* Top badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              {jlptLevel && (
                <span className="rounded-lg bg-indigo-600 text-white font-extrabold px-2.5 py-0.5 text-xs shadow-2xs tracking-wider">
                  JLPT {jlptLevel}
                </span>
              )}
              {lesson.source && (
                <span className="rounded-lg bg-slate-100 text-slate-600 font-mono text-[11px] px-2 py-0.5 border border-slate-200/80">
                  {lesson.source}
                </span>
              )}
            </div>

            {/* Copy & Audio controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => speakJapanese(displayedTitle)}
                className="flex items-center gap-1 rounded-xl bg-white/90 border border-indigo-200/80 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-50 active:scale-95 transition-all"
                title="Phát âm mẫu ngữ pháp"
              >
                <Volume2 size={15} />
                <span className="hidden sm:inline">Phát âm</span>
              </button>
              <button
                type="button"
                onClick={() => copyTitleText(displayedTitle)}
                className="flex items-center gap-1 rounded-xl bg-white/90 border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 active:scale-95 transition-all"
                title="Sao chép tên mẫu"
              >
                {copiedTitle ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span className="hidden sm:inline">{copiedTitle ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>
          </div>

          {/* Mẫu Ngữ pháp tiếng Nhật (Font lớn, rõ ràng, không dính nét) */}
          <div className="my-2">
            <h2 className="font-jp text-2xl sm:text-3xl md:text-4xl font-extrabold text-indigo-950 tracking-normal leading-[1.35]">
              {displayedTitle}
            </h2>
          </div>

          {/* Ý nghĩa tiếng Việt (Font 17-20px, màu rõ, dễ đọc) */}
          <div className="mt-2.5 pt-2.5 border-t border-indigo-100/60">
            <p className="text-base sm:text-lg font-semibold text-indigo-900 leading-relaxed">
              {displayedMeaning}
            </p>
          </div>
        </div>

        {/* ── SECTION 1: CẤU TRÚC, LƯU Ý & PHÂN BIỆT ── */}
        <SectionCard
          n={1}
          title={t('lessonDetail.section.structure')}
          subtitle="Cách nối, lưu ý ngữ pháp & phân biệt sắc thái"
          icon={<BookOpen size={18} />}
          color="from-indigo-600 to-blue-600"
          open={openSection === 1}
          onToggle={() => sectionToggle(1)}
        >
          <div className="space-y-3.5 p-4 sm:p-5">

            {/* Mã mục & Nguồn tài liệu nếu có */}
            {(displayedItemCode || displayedSource) && (
              <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
                {displayedItemCode && (
                  <span className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 font-mono font-bold text-slate-700">
                    Mã: {displayedItemCode}
                  </span>
                )}
                {displayedSource && (
                  <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 font-semibold text-indigo-700">
                    Nguồn: {displayedSource}
                  </span>
                )}
              </div>
            )}

            {/* 1. CÁCH NỐI (Connection Rule) - Xanh dương nhạt */}
            {displayedStructure && (
              <div className="rounded-2xl border border-blue-200/90 bg-blue-50/60 p-4 sm:p-4.5 shadow-2xs">
                <div className="flex items-center gap-2 mb-2 text-blue-900">
                  <div className="p-1 rounded-lg bg-blue-100/80 text-blue-700">
                    <Link2 size={16} />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wide">
                    {t('lessonDetail.label.connection')} / Công thức ngữ pháp
                  </h3>
                </div>

                {/* Parser công thức ngữ pháp thông minh, hỗ trợ flex-wrap trên mobile */}
                <FormulaRenderer formula={displayedStructure} />
              </div>
            )}

            {/* 2. LƯU Ý QUAN TRỌNG (Notes) - Vàng/Cam nhạt */}
            {displayedNotes && (
              <div className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-4 sm:p-4.5 shadow-2xs">
                <div className="flex items-center gap-2 mb-2 text-amber-950">
                  <div className="p-1 rounded-lg bg-amber-100/80 text-amber-700">
                    <AlertTriangle size={16} />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wide">
                    {t('lessonDetail.label.notes')} khi sử dụng
                  </h3>
                </div>
                <p className="text-xs sm:text-sm font-medium text-amber-950/90 whitespace-pre-wrap leading-relaxed">
                  {displayedNotes}
                </p>
              </div>
            )}

            {/* 3. PHÂN BIỆT SẮC THÁI (Distinction) - Tím nhạt */}
            {displayedDistinction && (
              <div className="rounded-2xl border border-purple-200/90 bg-purple-50/60 p-4 sm:p-4.5 shadow-2xs">
                <div className="flex items-center gap-2 mb-2 text-purple-950">
                  <div className="p-1 rounded-lg bg-purple-100/80 text-purple-700">
                    <GitCompare size={16} />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wide">
                    {t('lessonDetail.label.distinction')}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm font-medium text-purple-950/90 whitespace-pre-wrap leading-relaxed">
                  {displayedDistinction}
                </p>
              </div>
            )}

          </div>
        </SectionCard>

        {/* ── SECTION 2: CÂU VÍ DỤ THỰC TẾ ── */}
        <SectionCard
          n={2}
          title={t('lessonDetail.section.examples', { count: effectiveExamples.length })}
          subtitle="Các câu ví dụ thực tế kèm cách đọc, nghĩa Việt và phát âm"
          icon={<MessageSquare size={18} />}
          color="from-emerald-600 to-teal-600"
          open={openSection === 2}
          onToggle={() => sectionToggle(2)}
        >
          <div className="p-3 sm:p-4 space-y-3 sm:space-y-3.5 bg-slate-50/40">
            {effectiveExamples.map((ex, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs transition-all hover:border-emerald-200 hover:shadow-xs"
              >
                {/* Top card: STT, Audio & Copy */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                    #{ex.stt || i + 1}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => speakJapanese(ex.japanese)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200/70 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all"
                      title="Nghe phát âm câu ví dụ"
                    >
                      <Volume2 size={13} />
                      <span className="text-[11px] hidden sm:inline">Phát âm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(ex.japanese, i)}
                      className={`rounded-lg p-1.5 text-xs transition-colors ${
                        copiedIdx === i
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                      }`}
                      title="Sao chép câu tiếng Nhật"
                    >
                      {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Câu tiếng Nhật (Font 18-22px, line-height 1.6-1.8, màu đậm rõ ràng) */}
                <p className="font-jp text-lg sm:text-xl font-bold text-slate-900 leading-[1.7] tracking-normal mb-2">
                  {ex.japanese}
                </p>

                {/* Cách đọc / Furigana / Phân tích (nếu có) */}
                {ex.analysis && (
                  <div className="mb-2.5 inline-block rounded-lg bg-sky-50 border border-sky-100 px-3 py-1 font-jp text-xs sm:text-sm font-medium text-sky-800">
                    <span className="text-sky-500 font-bold mr-1.5">Đọc:</span>
                    {ex.analysis}
                  </div>
                )}

                {/* Nghĩa tiếng Việt (Font 15-17px, màu đậm rõ ràng, không dính với câu Nhật) */}
                <div className="rounded-xl bg-emerald-50/50 border border-emerald-100/80 px-3.5 py-2.5">
                  <p className="text-sm sm:text-base font-semibold text-emerald-900 leading-relaxed">
                    {ex.vietnamese}
                  </p>
                </div>

                {/* Từ vựng quan trọng (nếu có) */}
                {ex.vocabulary && (
                  <div className="mt-2.5 rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 text-xs text-slate-600 flex items-start gap-1.5">
                    <span className="font-bold text-slate-500 shrink-0">Từ vựng:</span>
                    <span className="font-jp">{ex.vocabulary}</span>
                  </div>
                )}

                {/* Ghi chú ngữ cảnh (nếu có) */}
                {ex.note && (
                  <div className="mt-2 text-xs font-medium text-amber-700 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{ex.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── SECTION 3: BÀI TẬP LUYỆN TẬP ── */}
        <SectionCard
          n={3}
          title={t('lessonDetail.section.exercises', { count: effectiveExercises.length })}
          subtitle="Luyện tập vận dụng công thức với các dạng bài tập phong phú"
          icon={<PenLine size={18} />}
          color="from-orange-500 to-amber-500"
          open={openSection === 3}
          onToggle={() => sectionToggle(3)}
        >
          <div className="p-3 sm:p-4 space-y-4 bg-orange-50/20">
            {effectiveExercises.map((ex) => {
              const feedback = exerciseFeedback[ex.stt];
              const isChecked = feedback !== undefined;

              return (
                <div
                  key={ex.stt}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-3"
                >
                  {/* Exercise header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-800">
                        #{ex.stt}
                      </span>
                      <span className="rounded-md bg-orange-100/80 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                        {exerciseTypeLabel(ex)}
                      </span>
                    </div>

                    {/* Reset answer button */}
                    {answers[ex.stt] && (
                      <button
                        type="button"
                        onClick={() => setAnswer(ex.stt, '')}
                        className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                        title="Xóa câu trả lời"
                      >
                        <RotateCcw size={12} />
                        <span>Làm lại</span>
                      </button>
                    )}
                  </div>

                  {/* Question text */}
                  <p className="font-jp text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
                    {ex.question}
                  </p>

                  {/* Multiple Choice Options */}
                  {ex.type === 'multiple_choice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {[
                        { key: 'A', val: ex.optionA },
                        { key: 'B', val: ex.optionB },
                        { key: 'C', val: ex.optionC },
                        { key: 'D', val: ex.optionD },
                      ]
                        .filter((o) => o.val)
                        .map((opt) => {
                          const selected = answers[ex.stt] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setAnswer(ex.stt, opt.key)}
                              className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-xs sm:text-sm font-medium transition-all active:scale-[0.99] ${
                                selected
                                  ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold shadow-2xs ring-1 ring-orange-400'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                  selected
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {opt.key}
                              </span>
                              <span className="font-jp flex-1">{opt.val}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {/* Textarea for conjugation / translate / arrange */}
                  {(ex.type === 'conjugation' || ex.type === 'translate' || ex.type === 'arrange') && (
                    <textarea
                      value={answers[ex.stt] ?? ''}
                      onChange={(e) => setAnswer(ex.stt, e.target.value)}
                      placeholder={t('lessonDetail.answerPlaceholder')}
                      rows={ex.type === 'translate' ? 3 : 2}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-jp text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none transition-all"
                    />
                  )}

                  {/* Hint (Gợi ý) nếu có */}
                  {ex.hint && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 italic">
                      <HelpCircle size={13} className="text-slate-400 shrink-0" />
                      <span>{t('lessonDetail.hint', { hint: ex.hint })}</span>
                    </p>
                  )}

                  {/* Action row: Nút Kiểm tra & Feedback tức thì */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleCheckExercise(ex.stt)}
                      disabled={!answers[ex.stt]}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-orange-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <CheckCheck size={14} />
                      <span>Kiểm tra câu này</span>
                    </button>

                    {/* Feedback badge */}
                    {isChecked && (
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                          feedback.isCorrect
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {feedback.isCorrect ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        <span>{feedback.feedback}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Button Xem toàn bộ đáp án */}
            {effectiveExercises.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAnswers(true);
                    setOpenSection(4);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 py-3.5 text-sm font-bold text-white shadow-md hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] transition-all"
                >
                  <Eye size={17} />
                  <span>{t('lessonDetail.showAnswers')} & Giải thích chi tiết</span>
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── SECTION 4: ĐÁP ÁN & GIẢI THÍCH CHI TIẾT ── */}
        <SectionCard
          n={4}
          title={t('lessonDetail.section.answers')}
          subtitle="Đáp án chuẩn, câu hoàn chỉnh và phân tích lỗi thường gặp"
          icon={<Award size={18} />}
          color="from-rose-500 to-pink-600"
          open={showAnswers && openSection === 4}
          onToggle={() => {
            setShowAnswers(true);
            sectionToggle(4);
          }}
          lockedMessage={!showAnswers ? t('lessonDetail.lockedMessage') : undefined}
        >
          <div className="p-3 sm:p-4 space-y-3.5 bg-rose-50/20">
            {effectiveAnswers.map((ans) => {
              const userAns = answers[ans.stt];
              return (
                <div
                  key={ans.stt}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-2.5"
                >
                  {/* Top: STT & Correct answer */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-800">
                      #{ans.stt}
                    </span>
                    <span className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-2xs font-jp">
                      Đáp án: {ans.answer}
                    </span>
                    {userAns && (
                      <span className="text-xs text-slate-500 font-mono">
                        (Bạn chọn: {userAns})
                      </span>
                    )}
                  </div>

                  {/* Câu hoàn chỉnh */}
                  {ans.fullSentence && (
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Câu hoàn chỉnh:
                      </p>
                      <p className="font-jp text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                        {ans.fullSentence}
                      </p>
                    </div>
                  )}

                  {/* Giải thích chi tiết */}
                  {ans.explanation && (
                    <div className="rounded-xl bg-rose-50/70 border border-rose-100 p-3 text-xs sm:text-sm text-rose-950 leading-relaxed">
                      <p className="font-bold text-rose-900 mb-0.5">Giải thích:</p>
                      {ans.explanation}
                    </div>
                  )}

                  {/* Lỗi thường gặp */}
                  {ans.commonErrors && (
                    <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3 text-xs sm:text-sm text-amber-950">
                      <span className="font-bold text-amber-900 mr-1.5">
                        ⚠️ {t('lessonDetail.commonErrors')}:
                      </span>
                      {ans.commonErrors}
                    </div>
                  )}

                  {/* Tự đánh giá */}
                  {ans.selfAssess && (
                    <p className="text-right text-xs text-slate-400 italic">
                      {t('lessonDetail.selfAssess', { text: ans.selfAssess })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── ĐIỀU HƯỚNG BÀI TRƯỚC / TIẾP THEO (NAVIGATION FOOTER) ── */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
          <button
            onClick={handlePrev}
            disabled={!canGoPrev}
            className="flex w-full sm:flex-1 items-center justify-between sm:justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <ChevronLeft size={18} className="shrink-0" />
              <span className="shrink-0">
                {hasPrevItem ? 'Mục trước' : t('lessonDetail.prev')}
              </span>
            </div>
            {prevTitle && (
              <span className="truncate text-xs font-normal text-slate-400 max-w-[160px] font-jp">
                {prevTitle}
              </span>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={!canGoNext}
            className="flex w-full sm:flex-1 items-center justify-between sm:justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {nextTitle && (
              <span className="truncate text-xs font-normal text-indigo-200 max-w-[160px] font-jp">
                {nextTitle}
              </span>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0">
                {hasNextItem ? 'Mục tiếp theo' : (nextLesson ? t('lessonDetail.next') : t('lessonDetail.noMore'))}
              </span>
              <ChevronRight size={18} className="shrink-0" />
            </div>
          </button>
        </div>

      </main>
    </div>
  );
}

// ─── HELPER SUB-COMPONENTS ─────────────────────────────────────

/**
 * SectionCard: Accordion với tiêu đề gradient, subtitle rõ ràng, hỗ trợ đóng/mở mượt mà.
 */
function SectionCard({
  n,
  title,
  subtitle,
  icon,
  color,
  open,
  onToggle,
  children,
  lockedMessage,
}: {
  n: number;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  lockedMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs transition-all">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-3 bg-gradient-to-r ${color} px-4 sm:px-5 py-3.5 text-white text-left transition-all active:brightness-95`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-extrabold shadow-2xs">
            {n}
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold truncate">
              {icon}
              <span>{title}</span>
            </h3>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-white/80 font-normal truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp size={20} className="shrink-0 opacity-90" />
        ) : (
          <ChevronDown size={20} className="shrink-0 opacity-90" />
        )}
      </button>

      {open && (
        <div>
          {lockedMessage ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <EyeOff size={36} className="mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">{lockedMessage}</p>
              <p className="text-xs text-slate-400 mt-1">
                Làm bài tập ở mục 3 rồi bấm &quot;Xem toàn bộ đáp án&quot; để đối chiếu.
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FormulaRenderer: Hiển thị công thức ngữ pháp trực quan.
 * Phân tích các thành phần qua dấu ＋ hoặc +, hiển thị dạng chip tinh tế, flex-wrap trên mobile không tràn viền.
 */
function FormulaRenderer({ formula }: { formula: string }) {
  const lines = useMemo(() => formula.split('\n'), [formula]);

  return (
    <div className="space-y-2 mt-2">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Nếu dòng có dấu ＋ hoặc +
        const hasPlus = /[＋+]/.test(trimmed);

        if (hasPlus) {
          const parts = trimmed.split(/\s*[＋+]\s*/);
          return (
            <div
              key={lIdx}
              className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2.5 rounded-xl bg-white/80 border border-blue-200/60 shadow-2xs"
            >
              {parts.map((part, pIdx) => (
                <div key={pIdx} className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-lg bg-blue-100/90 text-blue-950 font-jp font-bold px-2.5 py-1 text-xs sm:text-sm border border-blue-200 shadow-2xs tracking-tight">
                    {part}
                  </span>
                  {pIdx < parts.length - 1 && (
                    <span className="text-blue-500 font-extrabold text-sm sm:text-base px-0.5 select-none">
                      ＋
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        }

        // Dòng văn bản giải thích thông thường
        return (
          <p
            key={lIdx}
            className="text-xs sm:text-sm font-jp font-medium text-blue-950/90 leading-relaxed pl-1"
          >
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
