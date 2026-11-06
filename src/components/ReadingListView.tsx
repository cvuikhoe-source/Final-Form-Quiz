import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen, Pencil, Send, Archive, RotateCcw,
  Trash2, CheckCircle2,
} from 'lucide-react';
import type { ReadingLesson, ReadingStatus, User, LessonFolder } from '@/types';
import { ReadingAdminModal } from '@/components/ReadingAdminModal';
import { useLanguage } from '@/context/LanguageContext';
import {
  loadReadingLessons, updateReadingLesson, deleteReadingLesson,
} from '@/storage';
import { loadLessonFolders, moveLessonToFolder } from '@/lib/lessonFolderService';
import { LessonFolderExplorer } from '@/components/LessonFolderExplorer';

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
  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [editing, setEditing] = useState<ReadingLesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [createFolderId, setCreateFolderId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReadingLesson | null>(null);

  const refreshLessons = useCallback(async () => {
    try {
      const ls = await loadReadingLessons();
      setLessons(ls);
    } catch {
      // ignore
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      const f = await loadLessonFolders('cat-reading');
      setFolders(f);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshLessons();
    refreshFolders();
  }, [refreshLessons, refreshFolders]);

  const filtered = useMemo(() => {
    return lessons
      .filter((l) => (isManager ? true : l.status === 'published'))
      .filter((l) => {
        const done = completedIds.has(l.id);
        if (filter === 'done' && !done) return false;
        if (filter === 'todo' && done) return false;
        return true;
      })
      .sort((a, b) => a.displayOrder - b.displayOrder || a.lessonNo - b.lessonNo);
  }, [lessons, filter, completedIds, isManager]);

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
      <LessonFolderExplorer<ReadingLesson>
        categoryId="cat-reading"
        categoryTitle={t('reading.title')}
        currentUser={currentUser}
        canManage={isManager}
        folders={folders}
        items={filtered}
        itemFolderId={(l) => l.folderId ?? null}
        getItemId={(l) => l.id}
        getItemTitle={(l) => l.titleJa || l.titleVi}
        getItemSearchText={(l) => `${l.titleJa} ${l.titleVi} ${l.category} ${l.level}`}
        onRefreshFolders={refreshFolders}
        onRefreshItems={refreshLessons}
        onMoveItemToFolder={async (lesson, targetFolderId) => {
          await moveLessonToFolder('reading', lesson.id, targetFolderId);
          await updateReadingLesson(lesson.id, { folderId: targetFolderId });
        }}
        onCreateItem={(folderId) => {
          setCreateFolderId(folderId);
          setCreating(true);
        }}
        onImportItem={() => {
          setCreateFolderId(currentFolderId);
          setCreating(true);
        }}
        onBackToCategories={onBack}
        createItemLabel="Tạo / Nhập bài đọc"
        importItemLabel="Nhập Excel"
        emptyItemText="Chưa có bài đọc nào trong thư mục này"
        currentFolderId={currentFolderId}
        onFolderChange={setCurrentFolderId}
        extraHeaderActions={
          <div className="flex gap-1.5">
            {([
              { v: 'all', l: t('lesson.filter.all') },
              { v: 'todo', l: t('reading.filterTodo') },
              { v: 'done', l: t('reading.filterDone') },
            ] as { v: 'all' | 'done' | 'todo'; l: string }[]).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setFilter(opt.v)}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
                  filter === opt.v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        }
        renderItemCard={(lesson, isList) => {
          const isDone = completedIds.has(lesson.id);

          if (isList) {
            return (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 transition-all">
                <div
                  onClick={() => onOpen(lesson)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-800">{lesson.titleJa}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>
                        {lesson.level}
                      </span>
                      {isDone && (
                        <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700">
                          <CheckCircle2 size={10} /> Đã học
                        </span>
                      )}
                      {isManager && (
                        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                          lesson.status === 'published' ? 'bg-emerald-100 text-emerald-700' : lesson.status === 'archived' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {lesson.status === 'published' ? t('common.statusPublished') : lesson.status === 'archived' ? t('common.statusArchived') : t('common.statusDraft')}
                        </span>
                      )}
                    </div>
                    {lesson.titleVi && <p className="text-[10px] text-slate-400 truncate">{lesson.titleVi}</p>}
                  </div>
                </div>

                {isManager && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={() => setEditing(lesson)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50"
                      title={t('common.edit')}
                    >
                      <Pencil size={13} />
                    </button>
                    {lesson.status === 'draft' && (
                      <button
                        onClick={() => setStatus(lesson, 'published')}
                        className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                        title={t('common.publish')}
                      >
                        <Send size={13} />
                      </button>
                    )}
                    {lesson.status === 'published' && (
                      <button
                        onClick={() => setStatus(lesson, 'archived')}
                        className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                        title={t('common.archive')}
                      >
                        <Archive size={13} />
                      </button>
                    )}
                    {lesson.status === 'archived' && (
                      <button
                        onClick={() => setStatus(lesson, 'draft')}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
                        title={t('common.restore')}
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(lesson)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // Grid card
          return (
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md">
                  <BookOpen size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(lesson)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-400">#{lesson.lessonNo}</span>
                      <p className="truncate text-sm font-bold text-slate-800">{lesson.titleJa}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>{lesson.level}</span>
                      {isDone && (
                        <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <CheckCircle2 size={10} /> {t('reading.filterDone')}
                        </span>
                      )}
                      {isManager && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                          lesson.status === 'published' ? 'bg-emerald-100 text-emerald-700' : lesson.status === 'archived' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {lesson.status === 'published' ? t('common.statusPublished') : lesson.status === 'archived' ? t('common.statusArchived') : t('common.statusDraft')}
                        </span>
                      )}
                    </div>
                    {lesson.titleVi && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{lesson.titleVi}</p>}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{lesson.estimatedMinutes} {t('common.minutes')}</span>
                      {lesson.category && <span>{lesson.category}</span>}
                    </div>
                  </button>
                  {isManager && (
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setEditing(lesson)} className="flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-700">
                        <Pencil size={11} /> {t('common.edit')}
                      </button>
                      {lesson.status === 'draft' && (
                        <button onClick={() => setStatus(lesson, 'published')} className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-700">
                          <Send size={11} /> {t('common.publish')}
                        </button>
                      )}
                      {lesson.status === 'published' && (
                        <button onClick={() => setStatus(lesson, 'archived')} className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700">
                          <Archive size={11} /> {t('common.archive')}
                        </button>
                      )}
                      {lesson.status === 'archived' && (
                        <button onClick={() => setStatus(lesson, 'draft')} className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700">
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
        }}
      />

      {editing && (
        <ReadingAdminModal
          lesson={editing}
          targetFolderId={editing.folderId ?? null}
          onClose={() => setEditing(null)}
          onSaved={refreshLessons}
        />
      )}
      {creating && (
        <ReadingAdminModal
          lesson={null}
          targetFolderId={createFolderId}
          onClose={() => {
            setCreating(false);
            setCreateFolderId(null);
          }}
          onSaved={refreshLessons}
        />
      )}
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
