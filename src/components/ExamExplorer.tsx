import { useMemo, useState } from 'react';
import type { Exam, ExamFolder, User } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { MoveDialog } from './FolderDialogs';
import { getFolderPath, getDescendantIds, countFolderContents, formatDateShort } from '@/lib/folderTree';
import { StatusBadge, formatDate } from './shared';
import {
  FolderOpen, FileText, MoreVertical, Pencil, Trash2, FolderInput,
  Archive, Search, LayoutGrid, List as ListIcon, ChevronRight, House, Copy, ExternalLink,
  ArrowUpDown, Plus, CalendarClock,
} from 'lucide-react';

export type ExplorerSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc';

interface ExplorerProps {
  user: User;
  exams: Exam[];
  folders: ExamFolder[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  onMoveFolder: (id: string, newParentId: string | null) => void;
  onArchiveFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveExam: (examId: string, folderId: string | null) => void;
  onUpdateExam: (id: string, updates: Partial<Exam>) => void;
  onDeleteExam: (id: string) => void;
  onEditExam: (exam: Exam) => void;
  onCopyLink: (exam: Exam) => void;
  onRequestCreateFolder: (parentId: string | null) => void;
  onRequestCreateExam: (parentId: string | null) => void;
  onRequestRenameFolder: (folder: ExamFolder) => void;
  onRequestDeleteFolder: (folder: ExamFolder, childFolderCount: number, examCount: number) => void;
  copiedId: string | null;
}

interface ActionMenuState {
  kind: 'folder' | 'exam';
  id: string;
  x: number;
  y: number;
}

const FOLDER_ICON_COLOR: Record<string, string> = {
  blue: 'text-blue-500',
  green: 'text-emerald-500',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
  rose: 'text-rose-500',
  slate: 'text-slate-400',
};

export function ExamExplorer(props: ExplorerProps) {
  const {
    user, exams, folders, currentFolderId, onNavigate,
    onMoveFolder, onArchiveFolder,
    onMoveExam, onUpdateExam, onDeleteExam, onEditExam, onCopyLink, copiedId,
    onRequestCreateFolder, onRequestCreateExam, onRequestRenameFolder, onRequestDeleteFolder,
  } = props;

  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('quizforms_explorer_mode') as 'grid' | 'list') ?? 'grid'
  );
  const [sort, setSort] = useState<ExplorerSort>('name_asc');
  const [search, setSearch] = useState('');
  const [statusFilter] = useState<'all' | Exam['status']>('all');
  const [showArchived] = useState(false);
  const [menu, setMenu] = useState<ActionMenuState | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: 'folder' | 'exam'; id: string } | null>(null);

  const canManage = user.role === 'admin' || user.role === 'teacher';
  void canManage; // menu actions are already gated by AdminView only being rendered for managers
  const searching = search.trim().length > 0;

  // ─── Derived data ─────────────────────────────────────────
  const visibleFolders = useMemo(
    () => (showArchived ? folders : folders.filter((f) => !f.archivedAt)),
    [folders, showArchived]
  );
  const path = useMemo(() => getFolderPath(visibleFolders, currentFolderId), [visibleFolders, currentFolderId]);

  const childFolders = useMemo(
    () => visibleFolders.filter((f) => f.parentId === currentFolderId),
    [visibleFolders, currentFolderId]
  );
  const childExams = useMemo(
    () => exams.filter((e) => (e.folderId ?? null) === currentFolderId),
    [exams, currentFolderId]
  );

  const searchResults = useMemo(() => {
    if (!searching) return null;
    const q = search.trim().toLowerCase();
    const folderHits = visibleFolders
      .filter((f) => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((f) => ({ type: 'folder' as const, folder: f, path: getFolderPath(visibleFolders, f.parentId) }));
    const examHits = exams
      .filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        (e.grade ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map((e) => ({ type: 'exam' as const, exam: e, path: getFolderPath(visibleFolders, e.folderId) }));
    return { folderHits, examHits };
  }, [searching, search, visibleFolders, exams]);

  const sortedFolders = useMemo(() => {
    const list = [...childFolders];
    list.sort((a, b) => {
      switch (sort) {
        case 'name_desc': return b.name.localeCompare(a.name, 'vi');
        case 'updated_desc': return b.updatedAt.localeCompare(a.updatedAt);
        case 'updated_asc': return a.updatedAt.localeCompare(b.updatedAt);
        default: return a.name.localeCompare(b.name, 'vi');
      }
    });
    return list;
  }, [childFolders, sort]);

  const sortedExams = useMemo(() => {
    const list = [...childExams].filter((e) => statusFilter === 'all' || e.status === statusFilter);
    list.sort((a, b) => {
      switch (sort) {
        case 'name_desc': return b.title.localeCompare(a.title, 'vi');
        case 'updated_desc': return b.createdAt.localeCompare(a.createdAt);
        case 'updated_asc': return a.createdAt.localeCompare(b.createdAt);
        default: return a.title.localeCompare(b.title, 'vi');
      }
    });
    return list;
  }, [childExams, sort, statusFilter]);

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('quizforms_explorer_mode', mode);
  };

  const getFolderCounts = (folderId: string) => {
    const descendantIds = getDescendantIds(visibleFolders, folderId);
    descendantIds.delete(folderId);
    return {
      subfolders: descendantIds.size,
      exams: exams.filter((e) => e.folderId && descendantIds.has(e.folderId)).length,
    };
  };

  // ─── Menu actions ─────────────────────────────────────────
  const closeMenu = () => setMenu(null);

  const menuFolder = menu?.kind === 'folder' ? visibleFolders.find((f) => f.id === menu.id) : null;
  const menuExam = menu?.kind === 'exam' ? exams.find((e) => e.id === menu.id) : null;

  const moveTargetFolder = moveTarget?.kind === 'folder' ? visibleFolders.find((f) => f.id === moveTarget.id) ?? null : null;
  const moveTargetExam = moveTarget?.kind === 'exam' ? exams.find((e) => e.id === moveTarget.id) ?? null : null;
  const moveTargetFolderId = moveTargetFolder?.id ?? null;

  const descendantIdsOfMenuFolder =
    moveTarget?.kind === 'folder' && moveTargetFolderId
      ? Array.from(getDescendantIds(visibleFolders, moveTargetFolderId))
      : [];

  const handleDeleteFolder = (folder: ExamFolder) => {
    const counts = countFolderContents(visibleFolders, exams, folder.id);
    setMenu(null);
    onRequestDeleteFolder(folder, counts.folderCount, counts.examCount);
  };

  return (
    <div>
      {/* ─── Toolbar row: search + view toggles ─── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('exam.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => toggleViewMode('grid')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title={t('exam.viewGrid')}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => toggleViewMode('list')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title={t('exam.viewList')}
          >
            <ListIcon size={18} />
          </button>
        </div>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ExplorerSort)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-8 text-sm shadow-sm outline-none focus:border-blue-400"
          >
            <option value="name_asc">{t('exam.sortNameAsc')}</option>
            <option value="name_desc">{t('exam.sortNameDesc')}</option>
            <option value="updated_desc">{t('exam.sortUpdatedDesc')}</option>
            <option value="updated_asc">{t('exam.sortUpdatedAsc')}</option>
          </select>
          <ArrowUpDown size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* ─── Breadcrumb ─── */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm">
        <button
          onClick={() => onNavigate(null)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-all ${
            currentFolderId === null ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <House size={15} />
          {t('common.home')}
          {showArchived && <Archive size={13} className="text-amber-500" />}
        </button>
        {path.map((f, i) => (
          <div key={f.id} className="flex shrink-0 items-center gap-1">
            <ChevronRight size={14} className="text-slate-300" />
            <button
              onClick={() => onNavigate(f.id)}
              className={`rounded-lg px-2 py-1 font-medium transition-all ${
                i === path.length - 1 && currentFolderId === f.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {f.name}
            </button>
          </div>
        ))}
      </div>

      {/* ─── Content ─── */}
      {searching && searchResults ? (
        /* ─── Search results ─── */
        <div className="space-y-4">
          {searchResults.folderHits.length === 0 && searchResults.examHits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={44} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{t('exam.noResults', { query: search })}</p>
            </div>
          )}
          {searchResults.folderHits.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('exam.foldersHeading')}</p>
              <div className="space-y-2">
                {searchResults.folderHits.map(({ folder, path: fPath }) => (
                  <button
                    key={folder.id}
                    onClick={() => { setSearch(''); onNavigate(folder.id); }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <span className={`text-xl ${FOLDER_ICON_COLOR[folder.color ?? 'slate']}`}>📁</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{folder.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {fPath.length > 0 ? fPath.map((p) => p.name).join(' / ') : t('common.home')}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {searchResults.examHits.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('exam.examsHeading')}</p>
              <div className="space-y-2">
                {searchResults.examHits.map(({ exam, path: ePath }) => (
                  <button
                    key={exam.id}
                    onClick={() => { setSearch(''); onNavigate(ePath.length > 0 ? ePath[ePath.length - 1].id : null); }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <span className="text-xl">📄</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{exam.title}</p>
                      <p className="truncate text-xs text-slate-400">
                        {ePath.length > 0 ? ePath.map((p) => p.name).join(' / ') : t('common.home')}
                      </p>
                    </div>
                    <StatusBadge status={exam.status} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {sortedFolders.length === 0 && sortedExams.length === 0 ? (
            <EmptyFolderState
              folderName={path.length > 0 ? path[path.length - 1].name : null}
              showArchived={showArchived}
              onCreateFolder={() => onRequestCreateFolder(currentFolderId)}
              onCreateExam={() => onRequestCreateExam(currentFolderId)}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedFolders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  counts={getFolderCounts(f.id)}
                  archived={!!f.archivedAt}
                  onOpen={() => onNavigate(f.id)}
                  onMenu={(x, y) => setMenu({ kind: 'folder', id: f.id, x, y })}
                />
              ))}
              {sortedExams.map((exam) => (
                <ExamExplorerCard
                  key={exam.id}
                  exam={exam}
                  copied={copiedId === exam.id}
                  onMenu={(x, y) => setMenu({ kind: 'exam', id: exam.id, x, y })}
                  onCopy={() => onCopyLink(exam)}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden grid-cols-[1fr_90px_120px_90px_44px] gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid">
                <span>{t('exam.colName')}</span><span>{t('exam.colType')}</span><span>{t('exam.colContent')}</span><span>{t('exam.colUpdated')}</span><span />
              </div>
              <div className="divide-y divide-slate-100">
                {sortedFolders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    counts={getFolderCounts(f.id)}
                    archived={!!f.archivedAt}
                    onOpen={() => onNavigate(f.id)}
                    onMenu={(x, y) => setMenu({ kind: 'folder', id: f.id, x, y })}
                  />
                ))}
                {sortedExams.map((exam) => (
                  <ExamRow
                    key={exam.id}
                    exam={exam}
                    copied={copiedId === exam.id}
                    onMenu={(x, y) => setMenu({ kind: 'exam', id: exam.id, x, y })}
                    onCopy={() => onCopyLink(exam)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Context menu (portal-less, fixed) ─── */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, window.innerWidth - 220),
              top: Math.min(menu.y, window.innerHeight - 300),
            }}
          >
            {menu.kind === 'folder' && menuFolder && (
              <>
                <MenuItem icon={<FolderOpen size={15} />} label={t('exam.menuOpen')} onClick={() => { onNavigate(menuFolder.id); closeMenu(); }} />
                <MenuItem icon={<Pencil size={15} />} label={t('exam.menuRename')} onClick={() => { setMenu(null); onRequestRenameFolder(menuFolder); }} />
                <MenuItem
                  icon={<FolderInput size={15} />}
                  label={t('exam.menuMove')}
                  onClick={() => { setMoveTarget({ kind: 'folder', id: menuFolder.id }); closeMenu(); }}
                />
                <MenuItem
                  icon={<Archive size={15} />}
                  label={menuFolder.archivedAt ? t('exam.menuUnarchive') : t('common.archive')}
                  onClick={() => { onArchiveFolder(menuFolder.id); closeMenu(); }}
                />
                <div className="my-1 h-px bg-slate-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label={t('common.delete')}
                  danger
                  onClick={() => handleDeleteFolder(menuFolder)}
                />
              </>
            )}
            {menu.kind === 'exam' && menuExam && (
              <>
                <MenuItem icon={<ExternalLink size={15} />} label={t('exam.menuOpenForms')} onClick={() => { window.open(menuExam.formsUrl, '_blank', 'noopener'); closeMenu(); }} />
                <MenuItem icon={<Pencil size={15} />} label={t('exam.menuEdit')} onClick={() => { setMenu(null); onEditExam(menuExam); }} />
                <MenuItem icon={<Copy size={15} />} label={copiedId === menuExam.id ? t('exam.menuCopiedLink') : t('exam.menuCopyLink')} onClick={() => { onCopyLink(menuExam); closeMenu(); }} />
                <MenuItem
                  icon={<FolderInput size={15} />}
                  label={t('exam.menuMove')}
                  onClick={() => { setMoveTarget({ kind: 'exam', id: menuExam.id }); closeMenu(); }}
                />
                <MenuItem
                  icon={<ArrowUpDown size={15} />}
                  label={menuExam.status === 'open' ? t('exam.menuDisable') : t('exam.menuEnable')}
                  onClick={() => { onUpdateExam(menuExam.id, { status: menuExam.status === 'open' ? 'closed' : 'open' }); closeMenu(); }}
                />
                <div className="my-1 h-px bg-slate-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label={t('common.delete')}
                  danger
                  onClick={() => {
                    if (confirm(t('exam.confirmDelete', { title: menuExam.title }))) onDeleteExam(menuExam.id);
                    closeMenu();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* ─── Move dialog ─── */}
      {moveTarget && (
        <MoveDialogWrapper
          moveTarget={moveTarget}
          folders={visibleFolders}
          descendantIdsOfMenuFolder={descendantIdsOfMenuFolder}
          moveTargetFolder={moveTargetFolder}
          moveTargetExam={moveTargetExam}
          onMoveFolder={onMoveFolder}
          onMoveExam={onMoveExam}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────

function MenuItem({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FolderCard({ folder, counts, archived, onOpen, onMenu }: {
  folder: ExamFolder;
  counts: { subfolders: number; exams: number };
  archived: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={`group relative rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${archived ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="mb-2 flex items-start justify-between">
        <button onClick={onOpen} className="text-left">
          <span className={`text-3xl leading-none ${FOLDER_ICON_COLOR[folder.color ?? 'slate']}`}>📁</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <MoreVertical size={16} />
        </button>
      </div>
      <button onClick={onOpen} className="block w-full text-left">
        <h3 className="truncate text-sm font-semibold text-slate-800">{folder.name}</h3>
        {folder.description && <p className="mt-0.5 truncate text-xs text-slate-400">{folder.description}</p>}
        <p className="mt-2 text-xs text-slate-400">
          {counts.subfolders > 0 && t('exam.folderCount', { count: counts.subfolders })}
          {counts.subfolders > 0 && counts.exams > 0 && ' • '}
          {counts.exams > 0 && t('exam.examCount', { count: counts.exams })}
          {counts.subfolders === 0 && counts.exams === 0 && t('exam.emptyFolder')}
        </p>
      </button>
      {archived && <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t('exam.archivedBadge')}</span>}
    </div>
  );
}

function FolderRow({ folder, counts, archived, onOpen, onMenu }: {
  folder: ExamFolder;
  counts: { subfolders: number; exams: number };
  archived: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={`flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50 ${archived ? 'bg-amber-50/40' : ''}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`text-xl ${FOLDER_ICON_COLOR[folder.color ?? 'slate']}`}>📁</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{folder.name}</p>
          {folder.description && <p className="truncate text-xs text-slate-400">{folder.description}</p>}
        </div>
      </button>
      <span className="hidden w-[90px] shrink-0 text-xs text-slate-400 md:block">{t('exam.typeFolder')}</span>
      <span className="hidden w-[120px] shrink-0 text-xs text-slate-400 md:block">
        {t('exam.itemsCount', { count: counts.subfolders + counts.exams })}
      </span>
      <span className="hidden w-[90px] shrink-0 text-xs text-slate-400 md:block">{formatDateShort(folder.updatedAt)}</span>
      <button
        onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}

function ExamExplorerCard({ exam, copied, onMenu, onCopy }: {
  exam: Exam;
  copied: boolean;
  onMenu: (x: number, y: number) => void;
  onCopy: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{exam.subject}</span>
          <StatusBadge status={exam.status} />
        </div>
        <button
          onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
        >
          <MoreVertical size={16} />
        </button>
      </div>
      <h3 className="mb-2 truncate text-sm font-semibold text-slate-800">{exam.title}</h3>
      <DeadlineSummary exam={exam} />
      <div className="flex items-center gap-1.5">
        <div className="flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{exam.formsUrl}</div>
        <button
          onClick={onCopy}
          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
            copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {copied ? t('exam.copied') : t('exam.copy')}
        </button>
      </div>
    </div>
  );
}

// ─── Deadline display ────────────────────────────────────────

function hasPerClassDeadlines(exam: Exam): boolean {
  const overrides = Object.keys(exam.classDeadlines ?? {});
  if (overrides.length === 0) return false;
  return overrides.some((cls) => {
    const override = exam.classDeadlines![cls];
    return override && override !== exam.deadline;
  });
}

function DeadlineSummary({ exam }: { exam: Exam }) {
  const { t } = useLanguage();
  const [showSchedule, setShowSchedule] = useState(false);
  if (!hasPerClassDeadlines(exam)) {
    return (
      <p className="mb-3 truncate text-xs text-slate-400">
        {exam.durationMinutes} {t('common.minutes')} • {t('exam.deadline', { date: formatDate(exam.deadline) })}
      </p>
    );
  }
  return (
    <div className="mb-3">
      <button
        onClick={() => setShowSchedule((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        {exam.durationMinutes} {t('common.minutes')} • {t('exam.perClassDeadline')}
        <CalendarClock size={13} />
      </button>
      {showSchedule && (
        <div className="mt-1.5 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          {Object.entries(exam.classDeadlines ?? {}).map(([cls, iso]) => (
            <div key={cls} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-600">{cls}</span>
              <span className="shrink-0 text-slate-500">{formatDate(iso)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRow({ exam, copied, onMenu, onCopy }: {
  exam: Exam;
  copied: boolean;
  onMenu: (x: number, y: number) => void;
  onCopy: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FileText size={20} className="shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{exam.title}</p>
          <p className="truncate text-xs text-slate-400">
            {exam.subject} • {exam.durationMinutes} {t('common.minutes')}
          </p>
        </div>
      </div>
      <span className="hidden w-[90px] shrink-0 md:block"><StatusBadge status={exam.status} /></span>
      <span className="hidden w-[120px] shrink-0 text-xs text-slate-400 md:block">{exam.folderId ? '📁 Thư mục' : 'Trang chủ'}</span>
      <span className="hidden w-[90px] shrink-0 text-xs text-slate-400 md:block">{formatDateShort(exam.createdAt)}</span>
      <button
        onClick={onCopy}
        className={`hidden shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium transition-all sm:block ${
          copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        {copied ? t('exam.copied') : t('exam.copy')}
      </button>
      <button
        onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}

function EmptyFolderState({ folderName, showArchived, onCreateFolder, onCreateExam }: {
  folderName: string | null;
  showArchived: boolean;
  onCreateFolder: () => void;
  onCreateExam: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
      <FolderOpen size={48} className="mb-3 text-slate-300" />
      {showArchived ? (
        <p className="text-sm font-medium text-slate-500">{t('exam.noArchived')}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">
            {folderName ? t('exam.folderEmpty', { name: folderName }) : t('exam.homeEmpty')}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={onCreateFolder}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700"
            >
              <Plus size={16} /> {t('exam.createFolder')}
            </button>
            <button
              onClick={onCreateExam}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileText size={16} /> {t('exam.createExam')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Move dialog wrapper ─────────────────────────────────────

function MoveDialogWrapper({ moveTarget, folders, descendantIdsOfMenuFolder, moveTargetFolder, moveTargetExam, onMoveFolder, onMoveExam, onClose }: {
  moveTarget: { kind: 'folder' | 'exam'; id: string };
  folders: ExamFolder[];
  descendantIdsOfMenuFolder: string[];
  moveTargetFolder: ExamFolder | null;
  moveTargetExam: Exam | null;
  onMoveFolder: (id: string, newParentId: string | null) => void;
  onMoveExam: (examId: string, folderId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  if (moveTarget.kind === 'folder' && moveTargetFolder) {
    return (
      <MoveDialog
        title={t('exam.moveFolderTitle')}
        itemLabel={moveTargetFolder.name}
        folders={folders}
        currentParentId={moveTargetFolder.parentId}
        disabledIds={descendantIdsOfMenuFolder}
        onMove={(target) => { onMoveFolder(moveTargetFolder.id, target); onClose(); }}
        onClose={onClose}
      />
    );
  }
  if (moveTarget.kind === 'exam' && moveTargetExam) {
    return (
      <MoveDialog
        title={t('exam.moveExamTitle')}
        itemLabel={moveTargetExam.title}
        folders={folders}
        currentParentId={moveTargetExam.folderId ?? null}
        disabledIds={[]}
        onMove={(target) => { onMoveExam(moveTargetExam.id, target); onClose(); }}
        onClose={onClose}
      />
    );
  }
  return null;
}
