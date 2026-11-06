import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Pencil, Archive, Send, Headphones, Trash2, Clock, RotateCcw,
} from 'lucide-react';
import type { ListeningLesson, ListeningStatus, User, LessonFolder } from '@/types';
import { ListeningAdminModal } from '@/components/ListeningAdminModal';
import { useLanguage } from '@/context/LanguageContext';
import { loadListeningLessons, updateListeningLesson, deleteListeningLesson } from '@/storage';
import { loadLessonFolders, moveLessonToFolder } from '@/lib/lessonFolderService';
import { LessonFolderExplorer } from '@/components/LessonFolderExplorer';

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
  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<ListeningLesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [createFolderId, setCreateFolderId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ListeningLesson | null>(null);

  const refreshLessons = useCallback(async () => {
    const ls = await loadListeningLessons();
    setLessons(ls);
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      const f = await loadLessonFolders('cat-listening');
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
      .filter((l) => (isManager ? true : visibleForStudent(l, currentUser)))
      .filter((l) => levelFilter === 'all' || l.level === levelFilter)
      .filter((l) => statusFilter === 'all' || l.status === statusFilter)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [lessons, levelFilter, statusFilter, currentUser, isManager]);

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
      <LessonFolderExplorer<ListeningLesson>
        categoryId="cat-listening"
        categoryTitle={t('listening.title')}
        currentUser={currentUser}
        canManage={isManager}
        folders={folders}
        items={filtered}
        itemFolderId={(l) => l.folderId ?? null}
        getItemId={(l) => l.id}
        getItemTitle={(l) => l.title}
        getItemSearchText={(l) => `${l.title} ${l.subtitle} ${l.category} ${l.level}`}
        onRefreshFolders={refreshFolders}
        onRefreshItems={refreshLessons}
        onMoveItemToFolder={async (lesson, targetFolderId) => {
          await moveLessonToFolder('listening', lesson.id, targetFolderId);
          await updateListeningLesson(lesson.id, { folderId: targetFolderId });
        }}
        onCreateItem={(folderId) => {
          setCreateFolderId(folderId);
          setCreating(true);
        }}
        onBackToCategories={onBack}
        createItemLabel={t('listening.create')}
        emptyItemText={t('listening.empty')}
        currentFolderId={currentFolderId}
        onFolderChange={setCurrentFolderId}
        extraHeaderActions={
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none"
            >
              <option value="all">Tất cả trình độ</option>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>{lv}</option>
              ))}
            </select>
            {isManager && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">{t('listening.filterAllStatuses')}</option>
                <option value="DRAFT">{t('common.statusDraft')}</option>
                <option value="PUBLISHED">{t('common.statusPublished')}</option>
                <option value="ARCHIVED">{t('common.statusArchived')}</option>
              </select>
            )}
          </div>
        }
        renderItemCard={(lesson, isList) => {
          if (isList) {
            return (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 transition-all">
                <div
                  onClick={() => onOpen(lesson)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                    <Headphones size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-800">{lesson.title}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>
                        {lesson.level}
                      </span>
                      {isManager && (
                        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${STATUS_BADGE[lesson.status]}`}>
                          {lesson.status === 'DRAFT' ? t('common.statusDraft') : lesson.status === 'PUBLISHED' ? t('common.statusPublished') : t('common.statusArchived')}
                        </span>
                      )}
                    </div>
                    {lesson.subtitle && <p className="text-[10px] text-slate-400 truncate">{lesson.subtitle}</p>}
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
                    {lesson.status === 'DRAFT' && (
                      <button
                        onClick={() => setStatus(lesson, 'PUBLISHED')}
                        className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                        title={t('common.publish')}
                      >
                        <Send size={13} />
                      </button>
                    )}
                    {lesson.status === 'PUBLISHED' && (
                      <button
                        onClick={() => setStatus(lesson, 'ARCHIVED')}
                        className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                        title={t('common.archive')}
                      >
                        <Archive size={13} />
                      </button>
                    )}
                    {lesson.status === 'ARCHIVED' && (
                      <button
                        onClick={() => setStatus(lesson, 'DRAFT')}
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
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                  <Headphones size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(lesson)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-slate-800">{lesson.title}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>{lesson.level}</span>
                      {isManager && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${STATUS_BADGE[lesson.status]}`}>
                          {lesson.status === 'DRAFT' ? t('common.statusDraft') : lesson.status === 'PUBLISHED' ? t('common.statusPublished') : t('common.statusArchived')}
                        </span>
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
          );
        }}
      />

      {editing && (
        <ListeningAdminModal
          lesson={editing}
          targetFolderId={editing.folderId ?? null}
          onClose={() => setEditing(null)}
          onSaved={refreshLessons}
        />
      )}
      {creating && (
        <ListeningAdminModal
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
