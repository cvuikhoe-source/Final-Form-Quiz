import { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Pencil, Archive, Send, ChevronLeft, Headphones, Trash2, Clock, RotateCcw,
} from 'lucide-react';
import type { ListeningLesson, ListeningStatus, User } from '@/types';
import { ListeningAdminModal } from '@/components/ListeningAdminModal';
import { useLanguage } from '@/context/LanguageContext';
import { loadListeningLessons, updateListeningLesson, deleteListeningLesson } from '@/storage';

interface ListeningListViewProps {
  currentUser: User;
  onOpen: (lesson: ListeningLesson) => void;
  onBack: () => void;
}

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

const LEVEL_BADGE: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-700',
  N4: 'bg-sky-100 text-sky-700',
  N3: 'bg-blue-100 text-blue-700',
  N2: 'bg-orange-100 text-orange-700',
  N1: 'bg-red-100 text-red-700',
};

const STATUS_BADGE: Record<ListeningStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
};

function visibleForStudent(lesson: ListeningLesson, user: User): boolean {
  if (lesson.status !== 'PUBLISHED') return false;
  if (lesson.classScope.length === 0 || lesson.classScope.includes('Tất cả')) return true;
  return lesson.classScope.some((c) => user.assignedClasses.includes(c));
}

export function ListeningListView({ currentUser, onOpen, onBack }: ListeningListViewProps) {
  const { t } = useLanguage();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'teacher';
  const [lessons, setLessons] = useState<ListeningLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<ListeningLesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ListeningLesson | null>(null);

  useEffect(() => {
    loadListeningLessons().then((ls) => { setLessons(ls); setLoading(false); });
  }, []);

  const refresh = async () => { setLessons(await loadListeningLessons()); };

  const filtered = useMemo(() => {
    return lessons
      .filter((l) => (isManager ? true : visibleForStudent(l, currentUser)))
      .filter((l) => levelFilter === 'all' || l.level === levelFilter)
      .filter((l) => statusFilter === 'all' || l.status === statusFilter)
      .filter((l) => {
        const q = search.toLowerCase();
        return !q || l.title.toLowerCase().includes(q) || l.subtitle.toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [lessons, search, levelFilter, statusFilter, currentUser, isManager]);

  const setStatus = async (lesson: ListeningLesson, status: ListeningStatus) => {
    await updateListeningLesson(lesson.id, { status });
    setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, status } : l)));
  };

  const handleDelete = async (lesson: ListeningLesson) => {
    await deleteListeningLesson(lesson.id);
    setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    setConfirmDelete(null);
  };

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ChevronLeft size={18} /> {t('listening.backToLessons')}
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('listening.title')}</h2>
          <p className="text-sm text-slate-500">{t('listening.count', { count: filtered.length })}</p>
        </div>
        {isManager && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-700"
          >
            <Plus size={15} /> {t('listening.create')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('listening.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setLevelFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${levelFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          {t('common.all')}
        </button>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${levelFilter === lv ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {lv}
          </button>
        ))}
        {isManager && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
          >
            <option value="all">{t('listening.filterAllStatuses')}</option>
            <option value="DRAFT">{t('common.statusDraft')}</option>
            <option value="PUBLISHED">{t('common.statusPublished')}</option>
            <option value="ARCHIVED">{t('common.statusArchived')}</option>
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Headphones size={48} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('listening.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {filtered.map((lesson) => (
            <div key={lesson.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                  <Headphones size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(lesson)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-slate-800">{lesson.title}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>{lesson.level}</span>
                      {isManager && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${STATUS_BADGE[lesson.status]}`}>{lesson.status === 'DRAFT' ? t('common.statusDraft') : lesson.status === 'PUBLISHED' ? t('common.statusPublished') : t('common.statusArchived')}</span>
                      )}
                    </div>
                    {lesson.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{lesson.subtitle}</p>}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                      {lesson.durationSeconds > 0 && (
                        <span className="flex items-center gap-1"><Clock size={10} /> {t('common.minutesCount', { count: Math.round(lesson.durationSeconds / 60) })}</span>
                      )}
                      {lesson.category && <span>{lesson.category}</span>}
                    </div>
                  </button>
                  {isManager && (
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setEditing(lesson)} className="flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-700">
                        <Pencil size={11} /> {t('common.edit')}
                      </button>
                      {lesson.status === 'DRAFT' && (
                        <button onClick={() => setStatus(lesson, 'PUBLISHED')} className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-700">
                          <Send size={11} /> {t('common.publish')}
                        </button>
                      )}
                      {lesson.status === 'PUBLISHED' && (
                        <button onClick={() => setStatus(lesson, 'ARCHIVED')} className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700">
                          <Archive size={11} /> {t('common.archive')}
                        </button>
                      )}
                      {lesson.status === 'ARCHIVED' && (
                        <button onClick={() => setStatus(lesson, 'DRAFT')} className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700">
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
          ))}
        </div>
      )}

      {editing && (
        <ListeningAdminModal
          lesson={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {creating && (
        <ListeningAdminModal
          lesson={null}
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800">{t('listening.deleteTitle')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('listening.deleteBody', { title: confirmDelete.title })}</p>
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
