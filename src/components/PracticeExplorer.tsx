import { useMemo, useState } from 'react';
import type { Practice, PracticeFolder, User } from '@/types';
import { MoveDialog } from './FolderDialogs';
import {
  buildFolderTree, getFolderPath, getDescendantIds, countFolderContents,
  formatDateShort,
} from '@/lib/folderTree';
import {
  FolderOpen, ClipboardList, MoreVertical, Pencil, Trash2, FolderInput,
  Archive, Search, LayoutGrid, List as ListIcon, ChevronRight, House, Copy, Play,
  ArrowUpDown, Inbox, Plus, BookOpen, Send, Undo2,
} from 'lucide-react';

export type PracticeExplorerSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc';

interface PracticeExplorerProps {
  user: User;
  practices: Practice[];
  folders: PracticeFolder[];
  questionCounts: Map<string, number>;
  currentFolderId: string | null;
  showArchived: boolean;
  onToggleShowArchived: () => void;
  onNavigate: (folderId: string | null) => void;
  onMoveFolder: (id: string, newParentId: string | null) => void;
  onArchiveFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMovePractice: (practiceId: string, folderId: string | null) => void;
  onEditPractice: (practice: Practice) => void;
  onOpenPractice: (practice: Practice) => void;
  onPublishPractice: (practice: Practice, publish: boolean) => void;
  onDuplicatePractice: (practice: Practice) => void;
  onArchivePractice: (practice: Practice) => void;
  onDeletePractice: (practice: Practice) => void;
  onRequestCreateFolder: (parentId: string | null) => void;
  onRequestCreatePractice: (parentId: string | null) => void;
  onRequestRenameFolder: (folder: PracticeFolder) => void;
  onRequestDeleteFolder: (folder: PracticeFolder, childFolderCount: number, practiceCount: number) => void;
}

interface ActionMenuState {
  kind: 'folder' | 'practice';
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

const CATEGORY_LABEL: Record<string, string> = {
  vocabulary: 'Từ vựng',
  grammar: 'Ngữ pháp',
  reading: 'Đọc hiểu',
  listening: 'Nghe hiểu',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Đang mở',
  ARCHIVED: 'Đã đóng',
};

export function PracticeExplorer(props: PracticeExplorerProps) {
  const {
    user, practices, folders, questionCounts, currentFolderId, showArchived, onToggleShowArchived, onNavigate,
    onMoveFolder, onArchiveFolder,
    onMovePractice, onEditPractice, onOpenPractice, onPublishPractice, onDuplicatePractice,
    onArchivePractice, onDeletePractice,
    onRequestCreateFolder, onRequestCreatePractice, onRequestRenameFolder, onRequestDeleteFolder,
  } = props;

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('quizforms_explorer_mode') as 'grid' | 'list') ?? 'grid'
  );
  const [sort, setSort] = useState<PracticeExplorerSort>('name_asc');
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<ActionMenuState | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: 'folder' | 'practice'; id: string } | null>(null);

  const canManage = user.role === 'admin' || user.role === 'teacher';
  void canManage;
  const searching = search.trim().length > 0;

  const visibleFolders = useMemo(
    () => (showArchived ? folders : folders.filter((f) => !f.archivedAt)),
    [folders, showArchived]
  );
  const visiblePractices = useMemo(
    () => (showArchived ? practices : practices.filter((p) => !p.archivedAt)),
    [practices, showArchived]
  );
  const path = useMemo(() => getFolderPath(visibleFolders, currentFolderId), [visibleFolders, currentFolderId]);
  const tree = useMemo(() => buildFolderTree(visibleFolders), [visibleFolders]);
  void tree;

  const childFolders = useMemo(
    () => visibleFolders.filter((f) => f.parentId === currentFolderId),
    [visibleFolders, currentFolderId]
  );
  const childPractices = useMemo(
    () => visiblePractices.filter((p) => (p.folderId ?? null) === currentFolderId),
    [visiblePractices, currentFolderId]
  );

  const searchResults = useMemo(() => {
    if (!searching) return null;
    const q = search.trim().toLowerCase();
    const folderHits = visibleFolders
      .filter((f) => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((f) => ({ type: 'folder' as const, folder: f, path: getFolderPath(visibleFolders, f.parentId) }));
    const practiceHits = visiblePractices
      .filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (CATEGORY_LABEL[p.category] ?? '').toLowerCase().includes(q) ||
        p.level.toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map((p) => ({ type: 'practice' as const, practice: p, path: getFolderPath(visibleFolders, p.folderId) }));
    return { folderHits, practiceHits };
  }, [searching, search, visibleFolders, visiblePractices]);

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

  const sortedPractices = useMemo(() => {
    const list = [...childPractices];
    list.sort((a, b) => {
      switch (sort) {
        case 'name_desc': return b.title.localeCompare(a.title, 'vi');
        case 'updated_desc': return b.createdAt.localeCompare(a.createdAt);
        case 'updated_asc': return a.createdAt.localeCompare(b.createdAt);
        default: return a.title.localeCompare(b.title, 'vi');
      }
    });
    return list;
  }, [childPractices, sort]);

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('quizforms_explorer_mode', mode);
  };

  const getFolderCounts = (folderId: string) => {
    const descendantIds = getDescendantIds(visibleFolders, folderId);
    descendantIds.delete(folderId);
    return {
      subfolders: descendantIds.size,
      practices: visiblePractices.filter((p) => p.folderId && descendantIds.has(p.folderId)).length,
    };
  };

  const closeMenu = () => setMenu(null);

  const menuFolder = menu?.kind === 'folder' ? visibleFolders.find((f) => f.id === menu.id) : null;
  const menuPractice = menu?.kind === 'practice' ? visiblePractices.find((p) => p.id === menu.id) : null;

  const moveTargetFolder = moveTarget?.kind === 'folder' ? visibleFolders.find((f) => f.id === moveTarget.id) ?? null : null;
  const moveTargetPractice = moveTarget?.kind === 'practice' ? visiblePractices.find((p) => p.id === moveTarget.id) ?? null : null;
  const moveTargetFolderId = moveTargetFolder?.id ?? null;

  const descendantIdsOfMoveFolder =
    moveTarget?.kind === 'folder' && moveTargetFolderId
      ? Array.from(getDescendantIds(visibleFolders, moveTargetFolderId))
      : [];

  const handleDeleteFolder = (folder: PracticeFolder) => {
    const counts = countFolderContents(visibleFolders, visiblePractices, folder.id);
    setMenu(null);
    onRequestDeleteFolder(folder, counts.folderCount, counts.examCount);
  };

  return (
    <div>
      {/* ─── Toolbar: search + view toggle + sort + archive toggle ─── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm bài luyện tập hoặc thư mục..."
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => toggleViewMode('grid')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Xem dạng lưới"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => toggleViewMode('list')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Xem dạng danh sách"
          >
            <ListIcon size={18} />
          </button>
        </div>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PracticeExplorerSort)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-8 text-sm shadow-sm outline-none focus:border-blue-400"
          >
            <option value="name_asc">Tên A-Z</option>
            <option value="name_desc">Tên Z-A</option>
            <option value="updated_desc">Mới cập nhật</option>
            <option value="updated_asc">Cũ cập nhật</option>
          </select>
          <ArrowUpDown size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <button
          onClick={onToggleShowArchived}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium shadow-sm transition-all ${
            showArchived ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
          title="Xem mục đã lưu trữ"
        >
          <Inbox size={16} />
          Lưu trữ
        </button>
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
          Trang chủ
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
        <div className="space-y-4">
          {searchResults.folderHits.length === 0 && searchResults.practiceHits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={44} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Không tìm thấy kết quả cho "{search}"</p>
            </div>
          )}
          {searchResults.folderHits.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Thư mục</p>
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
                        {fPath.length > 0 ? fPath.map((p) => p.name).join(' / ') : 'Trang chủ'}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {searchResults.practiceHits.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Bài luyện tập</p>
              <div className="space-y-2">
                {searchResults.practiceHits.map(({ practice, path: pPath }) => (
                  <button
                    key={practice.id}
                    onClick={() => { setSearch(''); onNavigate(pPath.length > 0 ? pPath[pPath.length - 1].id : null); }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <span className="text-xl">📝</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{practice.title}</p>
                      <p className="truncate text-xs text-slate-400">
                        {pPath.length > 0 ? pPath.map((p) => p.name).join(' / ') : 'Trang chủ'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[practice.status]}`}>
                      {STATUS_LABEL[practice.status]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {sortedFolders.length === 0 && sortedPractices.length === 0 ? (
            <EmptyFolderState
              folderName={path.length > 0 ? path[path.length - 1].name : null}
              showArchived={showArchived}
              onCreateFolder={() => onRequestCreateFolder(currentFolderId)}
              onCreatePractice={() => onRequestCreatePractice(currentFolderId)}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedFolders.map((f) => (
                <PracticeFolderCard
                  key={f.id}
                  folder={f}
                  counts={getFolderCounts(f.id)}
                  archived={!!f.archivedAt}
                  onOpen={() => onNavigate(f.id)}
                  onMenu={(x, y) => setMenu({ kind: 'folder', id: f.id, x, y })}
                />
              ))}
              {sortedPractices.map((p) => (
                <PracticeCard
                  key={p.id}
                  practice={p}
                  questionCount={questionCounts.get(p.id) ?? 0}
                  statusLabel={STATUS_LABEL[p.status] ?? p.status}
                  statusBadge={STATUS_BADGE[p.status] ?? 'bg-slate-100 text-slate-600'}
                  onOpen={() => onOpenPractice(p)}
                  onMenu={(x, y) => setMenu({ kind: 'practice', id: p.id, x, y })}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden grid-cols-[1fr_110px_90px_100px_44px] gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid">
                <span>Tên</span><span>Loại</span><span>Số câu</span><span>Cập nhật</span><span />
              </div>
              <div className="divide-y divide-slate-100">
                {sortedFolders.map((f) => (
                  <PracticeFolderRow
                    key={f.id}
                    folder={f}
                    counts={getFolderCounts(f.id)}
                    archived={!!f.archivedAt}
                    onOpen={() => onNavigate(f.id)}
                    onMenu={(x, y) => setMenu({ kind: 'folder', id: f.id, x, y })}
                  />
                ))}
                {sortedPractices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    practice={p}
                    questionCount={questionCounts.get(p.id) ?? 0}
                    statusLabel={STATUS_LABEL[p.status] ?? p.status}
                    statusBadge={STATUS_BADGE[p.status] ?? 'bg-slate-100 text-slate-600'}
                    onOpen={() => onOpenPractice(p)}
                    onMenu={(x, y) => setMenu({ kind: 'practice', id: p.id, x, y })}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Context menu ─── */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, window.innerWidth - 220),
              top: Math.min(menu.y, window.innerHeight - 320),
            }}
          >
            {menu.kind === 'folder' && menuFolder && (
              <>
                <MenuItem icon={<FolderOpen size={15} />} label="Mở" onClick={() => { onNavigate(menuFolder.id); closeMenu(); }} />
                <MenuItem icon={<Pencil size={15} />} label="Đổi tên / màu" onClick={() => { setMenu(null); onRequestRenameFolder(menuFolder); }} />
                <MenuItem
                  icon={<FolderInput size={15} />}
                  label="Di chuyển"
                  onClick={() => { setMoveTarget({ kind: 'folder', id: menuFolder.id }); closeMenu(); }}
                />
                <MenuItem
                  icon={<Archive size={15} />}
                  label={menuFolder.archivedAt ? 'Bỏ lưu trữ' : 'Lưu trữ'}
                  onClick={() => { onArchiveFolder(menuFolder.id); closeMenu(); }}
                />
                <div className="my-1 h-px bg-slate-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Xóa"
                  danger
                  onClick={() => handleDeleteFolder(menuFolder)}
                />
              </>
            )}
            {menu.kind === 'practice' && menuPractice && (
              <>
                <MenuItem icon={<Play size={15} />} label="Làm bài thử" onClick={() => { setMenu(null); onOpenPractice(menuPractice); }} />
                <MenuItem icon={<Pencil size={15} />} label="Chỉnh sửa" onClick={() => { setMenu(null); onEditPractice(menuPractice); }} />
                <MenuItem
                  icon={menuPractice.status === 'PUBLISHED' ? <Undo2 size={15} /> : <Send size={15} />}
                  label={menuPractice.status === 'PUBLISHED' ? 'Gỡ xuất bản (về Nháp)' : 'Xuất bản'}
                  onClick={() => { onPublishPractice(menuPractice, menuPractice.status !== 'PUBLISHED'); closeMenu(); }}
                />
                <MenuItem icon={<Copy size={15} />} label="Nhân bản" onClick={() => { onDuplicatePractice(menuPractice); closeMenu(); }} />
                <MenuItem
                  icon={<FolderInput size={15} />}
                  label="Di chuyển"
                  onClick={() => { setMoveTarget({ kind: 'practice', id: menuPractice.id }); closeMenu(); }}
                />
                <MenuItem
                  icon={<Archive size={15} />}
                  label={menuPractice.archivedAt ? 'Bỏ lưu trữ' : 'Lưu trữ'}
                  onClick={() => { onArchivePractice(menuPractice); closeMenu(); }}
                />
                <div className="my-1 h-px bg-slate-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Xóa"
                  danger
                  onClick={() => { onDeletePractice(menuPractice); closeMenu(); }}
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
          descendantIdsOfMoveFolder={descendantIdsOfMoveFolder}
          moveTargetFolder={moveTargetFolder}
          moveTargetPractice={moveTargetPractice}
          onMoveFolder={onMoveFolder}
          onMovePractice={onMovePractice}
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

function PracticeFolderCard({ folder, counts, archived, onOpen, onMenu }: {
  folder: PracticeFolder;
  counts: { subfolders: number; practices: number };
  archived: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
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
          {counts.subfolders > 0 && `${counts.subfolders} thư mục`}
          {counts.subfolders > 0 && counts.practices > 0 && ' • '}
          {counts.practices > 0 && `${counts.practices} bài luyện tập`}
          {counts.subfolders === 0 && counts.practices === 0 && 'Thư mục trống'}
        </p>
      </button>
      {archived && <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Đã lưu trữ</span>}
    </div>
  );
}

function PracticeFolderRow({ folder, counts, archived, onOpen, onMenu }: {
  folder: PracticeFolder;
  counts: { subfolders: number; practices: number };
  archived: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50 ${archived ? 'bg-amber-50/40' : ''}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`text-xl ${FOLDER_ICON_COLOR[folder.color ?? 'slate']}`}>📁</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{folder.name}</p>
          {folder.description && <p className="truncate text-xs text-slate-400">{folder.description}</p>}
        </div>
      </button>
      <span className="hidden w-[110px] shrink-0 text-xs text-slate-400 md:block">Thư mục</span>
      <span className="hidden w-[90px] shrink-0 text-xs text-slate-400 md:block">
        {counts.subfolders + counts.practices} mục
      </span>
      <span className="hidden w-[100px] shrink-0 text-xs text-slate-400 md:block">{formatDateShort(folder.updatedAt)}</span>
      <button
        onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}

function PracticeCard({
  practice,
  questionCount,
  onOpen,
  onMenu,
  statusLabel,
  statusBadge,
}: {
  practice: Practice;
  questionCount: number;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  statusLabel: string;
  statusBadge: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300 ${practice.archivedAt ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            {CATEGORY_LABEL[practice.category] ?? practice.category}
          </span>
          <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">{practice.level}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge}`}>{statusLabel}</span>
        </div>
        <button
          onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
        >
          <MoreVertical size={16} />
        </button>
      </div>
      <button onClick={onOpen} className="block w-full text-left">
        <h3 className="mb-2 truncate text-sm font-semibold text-slate-800">{practice.title}</h3>
        <p className="text-xs text-slate-400">
          {questionCount} câu hỏi • {practice.targetClasses.length === 0 || practice.targetClasses.includes('Tất cả') ? 'Tất cả các lớp' : `${practice.targetClasses.length} lớp`}
          {practice.archivedAt ? ' • Đã lưu trữ' : ''}
        </p>
      </button>
    </div>
  );
}

function PracticeRow({ practice, questionCount, onOpen, onMenu, statusLabel, statusBadge }: {
  practice: Practice;
  questionCount: number;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  statusLabel: string;
  statusBadge: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50 ${practice.archivedAt ? 'bg-amber-50/40' : ''}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ClipboardList size={20} className="shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{practice.title}</p>
          <p className="truncate text-xs text-slate-400">
            {CATEGORY_LABEL[practice.category] ?? practice.category} • {practice.level}
          </p>
        </div>
      </button>
      <span className="hidden w-[110px] shrink-0 md:block">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge}`}>
          {statusLabel}
        </span>
      </span>
      <span className="hidden w-[90px] shrink-0 text-xs text-slate-400 md:block">{questionCount} câu</span>
      <span className="hidden w-[100px] shrink-0 text-xs text-slate-400 md:block">{formatDateShort(practice.createdAt)}</span>
      <button
        onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}

function EmptyFolderState({ folderName, showArchived, onCreateFolder, onCreatePractice }: {
  folderName: string | null;
  showArchived: boolean;
  onCreateFolder: () => void;
  onCreatePractice: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
      <FolderOpen size={48} className="mb-3 text-slate-300" />
      {showArchived ? (
        <p className="text-sm font-medium text-slate-500">Không có mục đã lưu trữ</p>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">
            {folderName ? `"${folderName}" chưa có nội dung` : 'Trang chủ chưa có nội dung'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={onCreateFolder}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700"
            >
              <Plus size={16} /> Tạo thư mục
            </button>
            <button
              onClick={onCreatePractice}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <BookOpen size={16} /> Tạo bài luyện tập
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Move dialog wrapper ─────────────────────────────────────

function MoveDialogWrapper({ moveTarget, folders, descendantIdsOfMoveFolder, moveTargetFolder, moveTargetPractice, onMoveFolder, onMovePractice, onClose }: {
  moveTarget: { kind: 'folder' | 'practice'; id: string };
  folders: PracticeFolder[];
  descendantIdsOfMoveFolder: string[];
  moveTargetFolder: PracticeFolder | null;
  moveTargetPractice: Practice | null;
  onMoveFolder: (id: string, newParentId: string | null) => void;
  onMovePractice: (practiceId: string, folderId: string | null) => void;
  onClose: () => void;
}) {
  if (moveTarget.kind === 'folder' && moveTargetFolder) {
    return (
      <MoveDialog
        title="Di chuyển thư mục"
        itemLabel={moveTargetFolder.name}
        folders={folders}
        currentParentId={moveTargetFolder.parentId}
        disabledIds={descendantIdsOfMoveFolder}
        onMove={(target) => { onMoveFolder(moveTargetFolder.id, target); onClose(); }}
        onClose={onClose}
      />
    );
  }
  if (moveTarget.kind === 'practice' && moveTargetPractice) {
    return (
      <MoveDialog
        title="Di chuyển bài luyện tập"
        itemLabel={moveTargetPractice.title}
        folders={folders}
        currentParentId={moveTargetPractice.folderId ?? null}
        disabledIds={[]}
        onMove={(target) => { onMovePractice(moveTargetPractice.id, target); onClose(); }}
        onClose={onClose}
      />
    );
  }
  return null;
}
