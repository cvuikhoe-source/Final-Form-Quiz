import { useState, useRef, useEffect } from 'react';
import type { Lesson, LessonExercise } from '@/types';
import { ArrowLeft, BookOpen, MessageSquare, PenLine, CheckCircle2, ChevronDown, ChevronUp, Copy, Check, Eye, EyeOff, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface LessonDetailViewProps {
  lesson: Lesson;
  completed: boolean;
  siblingLessons: Lesson[];
  onBack: () => void;
  onMarkDone: (id: string) => void;
  onNavigate: (lesson: Lesson) => void;
}

export function LessonDetailView({ lesson, completed, siblingLessons, onBack, onMarkDone, onNavigate }: LessonDetailViewProps) {
  const { t } = useLanguage();
  const [showAnswers, setShowAnswers] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState<number>(1);
  const topRef = useRef<HTMLDivElement>(null);

  const currentIndex = siblingLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < siblingLessons.length - 1 ? siblingLessons[currentIndex + 1] : null;

  // Reset state and scroll to top when lesson changes
  useEffect(() => {
    setShowAnswers(false);
    setAnswers({});
    setOpenSection(1);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lesson.id]);

  const copyText = async (text: string, idx: number) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const setAnswer = (stt: number, val: string) => {
    setAnswers((prev) => ({ ...prev, [stt]: val }));
  };

  const exerciseTypeLabel = (ex: LessonExercise) => {
    switch (ex.type) {
      case 'multiple_choice': return t('lessonDetail.exType.multiple_choice');
      case 'conjugation': return t('lessonDetail.exType.conjugation');
      case 'arrange': return t('lessonDetail.exType.arrange');
      case 'translate': return t('lessonDetail.exType.translate');
      default: return ex.type;
    }
  };

  const sectionToggle = (n: number) => setOpenSection(openSection === n ? 0 : n);

  return (
    <div className="pb-28 md:px-0 md:pb-8" ref={topRef}>
      {/* Sticky top bar */}
      <div className="sticky top-[57px] z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{lesson.title}</p>
          <p className="truncate text-xs text-slate-400">{lesson.meaning}</p>
        </div>
        {!completed ? (
          <button onClick={() => onMarkDone(lesson.id)}
            className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
            {t('lessonDetail.markDone')}
          </button>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={14} /> {t('lessonDetail.done')}
          </span>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4 md:px-0 md:pt-6 md:max-w-4xl md:mx-auto">

        {/* ── SECTION 1: Cấu trúc & Ý nghĩa ── */}
        <SectionCard
          n={1}
          title={t('lessonDetail.section.structure')}
          icon={<BookOpen size={17} />}
          color="from-indigo-600 to-blue-600"
          open={openSection === 1}
          onToggle={() => sectionToggle(1)}
        >
          <div className="space-y-3 p-4">
            <div className="rounded-xl bg-indigo-50 p-4 text-center">
              <p className="text-xl font-bold text-indigo-800 leading-snug">{lesson.title}</p>
              <p className="mt-1.5 text-sm text-indigo-600">{lesson.meaning}</p>
            </div>

            {lesson.connectionRule && (
              <FieldRow label={t('lessonDetail.label.connection')} value={lesson.connectionRule} mono />
            )}
            {lesson.notes && (
              <FieldRow label={t('lessonDetail.label.notes')} value={lesson.notes} />
            )}
            {lesson.distinction && (
              <FieldRow label={t('lessonDetail.label.distinction')} value={lesson.distinction} />
            )}
            {lesson.source && (
              <p className="text-right text-[10px] text-slate-400">{t('lessonDetail.label.source', { source: lesson.source })}</p>
            )}
          </div>
        </SectionCard>

        {/* ── SECTION 2: Ví dụ thực tế ── */}
        <SectionCard
          n={2}
          title={t('lessonDetail.section.examples', { count: lesson.examples.length })}
          icon={<MessageSquare size={17} />}
          color="from-emerald-600 to-teal-600"
          open={openSection === 2}
          onToggle={() => sectionToggle(2)}
        >
          <div className="divide-y divide-slate-100">
            {lesson.examples.map((ex, i) => (
              <div key={i} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{ex.stt}</span>
                  <button onClick={() => copyText(ex.japanese, i)} className={`rounded-lg p-1.5 text-xs transition-colors ${copiedIdx === i ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}>
                    {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <p className="mb-1 text-base font-semibold text-slate-800 leading-relaxed">{ex.japanese}</p>
                <p className="mb-2 text-sm text-emerald-700 font-medium">{ex.vietnamese}</p>
                {ex.analysis && <p className="mb-1 text-xs text-slate-500">{ex.analysis}</p>}
                {ex.vocabulary && (
                  <div className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">{ex.vocabulary}</div>
                )}
                {ex.note && (
                  <p className="mt-1 text-[10px] text-amber-600 font-medium">{ex.note}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── SECTION 3: Bài tập luyện tập ── */}
        <SectionCard
          n={3}
          title={t('lessonDetail.section.exercises', { count: lesson.exercises.length })}
          icon={<PenLine size={17} />}
          color="from-orange-500 to-amber-500"
          open={openSection === 3}
          onToggle={() => sectionToggle(3)}
        >
          <div className="divide-y divide-orange-50">
            {lesson.exercises.map((ex) => (
              <div key={ex.stt} className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">{ex.stt}</span>
                  <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">{exerciseTypeLabel(ex)}</span>
                </div>
                <p className="mb-3 text-sm font-medium text-slate-800 leading-relaxed">{ex.question}</p>

                {ex.type === 'multiple_choice' && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'A', val: ex.optionA },
                      { key: 'B', val: ex.optionB },
                      { key: 'C', val: ex.optionC },
                      { key: 'D', val: ex.optionD },
                    ].filter((o) => o.val).map((opt) => {
                      const selected = answers[ex.stt] === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setAnswer(ex.stt, opt.key)}
                          className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-all ${
                            selected ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-bold">{opt.key}.</span> {opt.val}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(ex.type === 'conjugation' || ex.type === 'translate' || ex.type === 'arrange') && (
                  <textarea
                    value={answers[ex.stt] ?? ''}
                    onChange={(e) => setAnswer(ex.stt, e.target.value)}
                    placeholder={t('lessonDetail.answerPlaceholder')}
                    rows={ex.type === 'translate' ? 3 : 2}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
                  />
                )}

                {ex.hint && (
                  <p className="mt-2 text-[10px] text-slate-400">{t('lessonDetail.hint', { hint: ex.hint })}</p>
                )}
              </div>
            ))}

            {lesson.exercises.length > 0 && (
              <div className="p-4">
                <button
                  onClick={() => setShowAnswers(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
                >
                  <Eye size={16} /> {t('lessonDetail.showAnswers')}
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── SECTION 4: Đáp án & Giải thích ── */}
        <SectionCard
          n={4}
          title={t('lessonDetail.section.answers')}
          icon={<Award size={17} />}
          color="from-rose-500 to-pink-600"
          open={showAnswers && openSection === 4}
          onToggle={() => {
            setShowAnswers(true);
            sectionToggle(4);
          }}
          lockedMessage={!showAnswers ? t('lessonDetail.lockedMessage') : undefined}
        >
          <div className="divide-y divide-rose-50">
            {lesson.answers.map((ans) => {
              const userAns = answers[ans.stt];
              return (
                <div key={ans.stt} className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-700">{ans.stt}</span>
                    <span className="rounded-lg bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">{ans.answer}</span>
                    {userAns && <span className="text-xs text-slate-400">{t('lessonDetail.yourAnswer', { answer: userAns })}</span>}
                  </div>
                  {ans.fullSentence && (
                    <p className="mb-2 text-sm font-semibold text-slate-800 leading-relaxed">{ans.fullSentence}</p>
                  )}
                  {ans.explanation && (
                    <div className="mb-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 leading-relaxed">{ans.explanation}</div>
                  )}
                  {ans.commonErrors && (
                    <div className="mb-1 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                      <span className="font-semibold">{t('lessonDetail.commonErrors')} </span>{ans.commonErrors}
                    </div>
                  )}
                  {ans.selfAssess && (
                    <p className="text-right text-xs text-slate-400">{t('lessonDetail.selfAssess', { text: ans.selfAssess })}</p>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Navigation: Previous / Next lesson ── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => prevLesson && onNavigate(prevLesson)}
            disabled={!prevLesson}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
          >
            <ChevronLeft size={18} /> {t('lessonDetail.prev')}
          </button>
          <button
            onClick={() => nextLesson && onNavigate(nextLesson)}
            disabled={!nextLesson}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {nextLesson ? t('lessonDetail.next') : t('lessonDetail.noMore')} <ChevronRight size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Helper sub-components ─────────────────────────────────────

function SectionCard({ n, title, icon, color, open, onToggle, children, lockedMessage }: {
  n: number;
  title: string;
  icon: React.ReactNode;
  color: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  lockedMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button onClick={onToggle} className={`flex w-full items-center justify-between gap-3 bg-gradient-to-r ${color} px-4 py-3 text-white`}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">{n}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {title}</span>
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 opacity-80" /> : <ChevronDown size={18} className="shrink-0 opacity-80" />}
      </button>
      {open && (
        lockedMessage ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <EyeOff size={32} className="mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">{lockedMessage}</p>
          </div>
        ) : children
      )}
    </div>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm text-slate-700 whitespace-pre-wrap leading-relaxed ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
