import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, Search, BookOpen, Plus, Pencil, Send, Archive, RotateCcw,
  Clock, Trash2, CheckCircle2, Circle,
} from 'lucide-react';
import type { ReadingLesson, ReadingStatus, User } from '@/types';
import { ReadingAdminModal } from '@/components/ReadingAdminModal';
import { useLanguage } from '@/context/LanguageContext';
import {
  loadReadingLessons, updateReadingLesson, deleteReadingLesson,
} from '@/storage';

interface ReadingListViewProps {
  currentUser: User;
  completedIds: Set<string>;
  onOpen: (lesson: ReadingLesson) => void;
  onBack: () => void;
}

const LEVEL_BADGE: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-700',
  N4: 'bg-sky-100 text-sky-700',
  N3: 'bg-blue-100 text-blue-700',
  N2: 'bg-orange-100 text-orange-700',
  N1: 'bg-red-100 text-red-700',
};

export function ReadingListView({ currentUser, completedIds, onOpen, onBack }: ReadingListViewProps) {
  const { t } = useLanguage();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'teacher';
  const [lessons, setLessons] = useState<ReadingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [editing, setEditing] = useState<ReadingLesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReadingLesson | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ls = await loadReadingLessons();
      setLessons(ls);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return lessons
      .filter((l) => (isManager ? true : l.status === 'published'))
      .filter((l) => {
        const done = completedIds.has(l.id);
        if (filter === 'done' && !done) return false;
        if (filter === 'todo' && done) return false;
        return true;
      })
      .filter((l) => {
        const q = search.toLowerCase();
        return !q
          || l.titleJa.toLowerCase().includes(q)
          || l.titleVi.toLowerCase().includes(q)
          || l.category.toLowerCase().includes(q);
      })
      .sort((a, b) => a.displayOrder - b.displayOrder || a.lessonNo - b.lessonNo);
  }, [lessons, search, filter, completedIds, isManager]);

  const setStatus = async (lesson: ReadingLesson, status: ReadingStatus) => {
    await updateReadingLesson(lesson.id, { status });
    setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, status } : l)));
  };

  const handleDelete = async (lesson: ReadingLesson) => {
    await deleteReadingLesson(lesson.id);
    setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    setConfirmDelete(null);
  };

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ChevronLeft size={18} /> {t('reading.backToLessons')}
      </button>

      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md">
          <BookOpen size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800">{t('reading.title')}</h2>
          <p className="text-xs text-slate-400">{t('reading.progressSummary', { done: filtered.length, total: lessons.filter((l) => isManager || l.status === 'published').length, count: filtered.length })}</p>
        </div>
        {isManager && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700"
          >
            <Plus size={15} /> {t('reading.importExcel')}
          </button>
        )}
      </div>

      <div className="relative mb-3">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('reading.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {([
          { v: 'all', l: t('lesson.filter.all') },
          { v: 'todo', l: t('reading.filterTodo') },
          { v: 'done', l: t('reading.filterDone') },
        ] as { v: 'all' | 'done' | 'todo'; l: string }[]).map((opt) => (
          <button key={opt.v} onClick={() => setFilter(opt.v)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${filter === opt.v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {opt.l}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-red-500">{t('reading.loadError')}</p>
          <button onClick={() => { setLoading(true); refresh(); }} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen size={48} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('reading.empty')}</p>
          {isManager && (
            <button onClick={() => setCreating(true)} className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
              <Plus size={16} /> {t('reading.importExcel')}
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {filtered.map((lesson) => {
            const done = completedIds.has(lesson.id);
            return (
              <div key={lesson.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-teal-100 text-teal-700'}`}>
                    {done ? <CheckCircle2 size={18} /> : <span>{lesson.lessonNo || '01'}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onOpen(lesson)} className="w-full text-left">
                      <p className="text-[10px] font-semibold text-slate-400">{t('reading.lessonNo', { no: String(lesson.lessonNo).padStart(2, '0') })}</p>
                      <p className="font-jp text-sm font-bold text-slate-800 leading-tight">{lesson.titleJa}</p>
                      {lesson.titleVi && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{lesson.titleVi}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span className={`rounded px-1.5 py-0.5 font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>{lesson.level}</span>
                        <span className="flex items-center gap-1"><Clock size={10} /> {t('common.minutesCount', { count: lesson.estimatedMinutes })}</span>
                        {lesson.category && <span>{lesson.category}</span>}
                        {isManager && (
                          <span className={`rounded px-1.5 py-0.5 font-semibold ${lesson.status === 'published' ? 'bg-emerald-100 text-emerald-700' : lesson.status === 'draft' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                            {lesson.status === 'published' ? t('common.statusPublished') : lesson.status === 'draft' ? t('common.statusDraft') : t('common.statusArchived')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium">
                        {done ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Circle size={12} className="text-slate-300" />}
                        <span className={done ? 'text-emerald-600' : 'text-slate-400'}>{done ? t('reading.filterDone') : t('reading.filterTodo')}</span>
                      </div>
                    </button>
                    {isManager && (
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => setEditing(lesson)} className="flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-700">
                          <Pencil size={11} /> {t('common.edit')}
                        </button>
                        {lesson.status === 'draft' && (
                          <button onClick={() => setStatus(lesson, 'published')} className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                            <Send size={11} /> {t('common.publish')}
                          </button>
                        )}
                        {lesson.status === 'published' && (
                          <button onClick={() => setStatus(lesson, 'archived')} className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                            <Archive size={11} /> {t('common.archive')}
                          </button>
                        )}
                        {lesson.status === 'archived' && (
                          <button onClick={() => setStatus(lesson, 'draft')} className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            <RotateCcw size={11} /> {t('common.restore')}
                          </button>
                        )}
                        <button onClick={() => setConfirmDelete(lesson)} className="flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-700">
                          <Trash2 size={11} /> {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ReadingAdminModal lesson={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {creating && <ReadingAdminModal lesson={null} onClose={() => setCreating(false)} onSaved={refresh} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800">{t('reading.deleteTitle')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('reading.deleteBody', { title: confirmDelete.titleJa })}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700">{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
