import { useState, useMemo, useCallback } from 'react';
import type { LessonFolder, FolderColor, User, LessonFolderCategoryId } from '@/types';
import {
  createLessonFolder,
  renameLessonFolder,
  moveLessonFolder,
  archiveLessonFolder,
  restoreLessonFolder,
  deleteLessonFolder,
  buildLessonFolderTree,
  buildLessonFolderBreadcrumb,
  collectDescendantFolderIds,
} from '@/lib/lessonFolderService';
import { toast } from '@/components/Toast';
import { getFolderVisualMeta } from '@/components/LessonListView';
import {
  Folder, FolderPlus, FolderOpen, FolderInput, Pencil, Trash2, Archive, RotateCcw,
  Search, LayoutGrid, List as ListIcon, ChevronRight, ChevronDown, House, ArrowUpDown,
  Inbox, Plus, MoreVertical, AlertTriangle, X, ChevronLeft,
} from 'lucide-react';

export type LessonExplorerSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc';

export interface LessonFolderExplorerProps<T> {
  categoryId: LessonFolderCategoryId;
  categoryTitle: string;
  currentUser: User;
  canManage: boolean;
  folders: LessonFolder[];
  items: T[];
  itemFolderId: (item: T) => string | null | undefined;
  filterItem?: (item: T, search: string) => boolean;
  getItemSearchText?: (item: T) => string;
  getItemId: (item: T) => string;
  getItemTitle: (item: T) => string;
  onRefreshFolders: () => Promise<void>;
  onRefreshItems: () => Promise<void>;
  onMoveItemToFolder: (item: T, targetFolderId: string | null) => Promise<void>;
  renderItemCard: (item: T, isListView: boolean) => React.ReactNode;
  onCreateItem?: (folderId: string | null) => void;
  onImportItem?: () => void;
  extraHeaderActions?: React.ReactNode;
  onBackToCategories?: () => void;
  emptyItemText?: string;
  createItemLabel?: string;
  importItemLabel?: string;
  currentFolderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

const FOLDER_COLOR_CLASSES: Record<FolderColor, { text: string; bg: string; border: string }> = {
  blue: { text: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  green: { text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  orange: { text: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  purple: { text: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  rose: { text: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
  slate: { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200' },
};

const COLOR_OPTIONS: { key: FolderColor; label: string; dot: string }[] = [
  { key: 'blue', label: 'Xanh dương', dot: 'bg-blue-500' },
  { key: 'green', label: 'Xanh lá', dot: 'bg-emerald-500' },
  { key: 'orange', label: 'Cam', dot: 'bg-orange-500' },
  { key: 'purple', label: 'Tím', dot: 'bg-purple-500' },
  { key: 'rose', label: 'Hồng', dot: 'bg-rose-500' },
  { key: 'slate', label: 'Xám', dot: 'bg-slate-400' },
];

export function LessonFolderExplorer<T>({
  categoryId,
  categoryTitle,
  currentUser,
  canManage,
  folders,
  items,
  itemFolderId,
  filterItem,
  getItemSearchText,
  getItemId,
  getItemTitle,
  onRefreshFolders,
  onRefreshItems,
  onMoveItemToFolder,
  renderItemCard,
  onCreateItem,
  onImportItem,
  extraHeaderActions,
  onBackToCategories,
  emptyItemText = 'Chưa có bài học nào trong thư mục này',
  createItemLabel = 'Tạo bài học',
  importItemLabel = 'Nhập Excel',
  currentFolderId: controlledFolderId,
  onFolderChange,
}: LessonFolderExplorerProps<T>) {
  // Navigation state
  const [internalFolderId, setInternalFolderId] = useState<string | null>(null);
  const currentFolderId = controlledFolderId !== undefined ? controlledFolderId : internalFolderId;
  const setCurrentFolderId = useCallback((id: string | null) => {
    if (onFolderChange) onFolderChange(id);
    else setInternalFolderId(id);
  }, [onFolderChange]);

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [treeSearch, setTreeSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('quizforms_lesson_explorer_mode') as 'grid' | 'list') ?? 'grid'
  );
  const [sort, setSort] = useState<LessonExplorerSort>('name_asc');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Action / dialog states
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [folderToRename, setFolderToRename] = useState<LessonFolder | null>(null);
  const [folderToMove, setFolderToMove] = useState<LessonFolder | null>(null);
  const [itemToMove, setItemToMove] = useState<T | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<LessonFolder | null>(null);

  // Form states for modals
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState<FolderColor>('blue');

  const [renameName, setRenameName] = useState('');
  const [renameColor, setRenameColor] = useState<FolderColor>('blue');
  const [renameDescription, setRenameDescription] = useState('');

  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [targetItemFolderId, setTargetItemFolderId] = useState<string | null>(null);

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('quizforms_lesson_explorer_mode', mode);
  };

  const toggleExpanded = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canUserManageFolder = useCallback((_folder?: LessonFolder | null): boolean => {
    void _folder;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role !== 'teacher') return false;
    return true;
  }, [currentUser]);

  // Filter folders based on category & archived state
  const categoryFolders = useMemo(() => {
    return folders.filter((f) => f.categoryId === categoryId);
  }, [folders, categoryId]);

  const activeCategoryFolders = useMemo(() => {
    return categoryFolders.filter((f) => !f.archivedAt);
  }, [categoryFolders]);

  const archivedCategoryFolders = useMemo(() => {
    return categoryFolders.filter((f) => Boolean(f.archivedAt));
  }, [categoryFolders]);

  // Current folder object
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return categoryFolders.find((f) => f.id === currentFolderId) ?? null;
  }, [categoryFolders, currentFolderId]);

  // Breadcrumbs
  const breadcrumb = useMemo(() => {
    return buildLessonFolderBreadcrumb(categoryFolders, currentFolderId);
  }, [categoryFolders, currentFolderId]);

  // Tree representation
  const treeNodes = useMemo(() => {
    return buildLessonFolderTree(activeCategoryFolders);
  }, [activeCategoryFolders]);

  // Child folders in current view
  const currentLevelFolders = useMemo(() => {
    if (showArchived) {
      return archivedCategoryFolders;
    }
    return activeCategoryFolders.filter((f) => f.parentId === currentFolderId);
  }, [showArchived, archivedCategoryFolders, activeCategoryFolders, currentFolderId]);

  // Items in current folder
  const currentLevelItems = useMemo(() => {
    return items.filter((item) => {
      const fid = itemFolderId(item);
      if (!currentFolderId) {
        return !fid;
      }
      return fid === currentFolderId;
    });
  }, [items, itemFolderId, currentFolderId]);

  // Count items inside any folder (direct)
  const getItemCountInFolder = useCallback((folderId: string | null) => {
    return items.filter((item) => {
      const fid = itemFolderId(item);
      if (!folderId) return !fid;
      return fid === folderId;
    }).length;
  }, [items, itemFolderId]);

  // Count descendant subfolders
  const getSubfolderCount = useCallback((folderId: string) => {
    return activeCategoryFolders.filter((f) => f.parentId === folderId).length;
  }, [activeCategoryFolders]);

  // Sort folders
  const sortedFolders = useMemo(() => {
    const list = [...currentLevelFolders];
    list.sort((a, b) => {
      switch (sort) {
        case 'name_desc': return b.name.localeCompare(a.name, 'vi');
        case 'updated_desc': return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        case 'updated_asc': return (a.updatedAt || '').localeCompare(b.updatedAt || '');
        default: return a.name.localeCompare(b.name, 'vi');
      }
    });
    return list;
  }, [currentLevelFolders, sort]);

  // Sort items
  const sortedItems = useMemo(() => {
    const list = [...currentLevelItems];
    list.sort((a, b) => {
      const tA = getItemTitle(a);
      const tB = getItemTitle(b);
      switch (sort) {
        case 'name_desc': return tB.localeCompare(tA, 'vi');
        default: return tA.localeCompare(tB, 'vi');
      }
    });
    return list;
  }, [currentLevelItems, sort, getItemTitle]);

  // Search results
  const isSearching = search.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    const q = search.trim().toLowerCase();
    const matchedFolders = categoryFolders.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q))
    );
    const matchedItems = items.filter((item) => {
      if (filterItem) return filterItem(item, q);
      if (getItemSearchText) return getItemSearchText(item).toLowerCase().includes(q);
      return getItemTitle(item).toLowerCase().includes(q);
    });
    return { matchedFolders, matchedItems };
  }, [isSearching, search, categoryFolders, items, filterItem, getItemSearchText, getItemTitle]);

  // ─── HANDLERS ────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    if (currentFolder && !canUserManageFolder(currentFolder)) {
      toast('Bạn không thể tạo thư mục con bên trong thư mục không có quyền quản lý.', 'error');
      return;
    }
    setCreateName('');
    setCreateDescription('');
    setCreateColor('blue');
    setShowCreateFolder(true);
  };

  const handleCreateSubmit = async () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      toast('Vui lòng nhập tên thư mục', 'error');
      return;
    }
    try {
      await createLessonFolder({
        categoryId,
        parentId: currentFolderId,
        name: trimmed,
        description: createDescription.trim() || null,
        color: createColor,
        createdBy: currentUser.id,
      });
      await onRefreshFolders();
      setShowCreateFolder(false);
      toast('Đã tạo thư mục mới thành công', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể tạo thư mục', 'error');
    }
  };

  const handleOpenRenameModal = (folder: LessonFolder) => {
    setFolderToRename(folder);
    setRenameName(folder.name);
    setRenameColor(folder.color || 'blue');
    setRenameDescription(folder.description || '');
    setMenuFolderId(null);
  };

  const handleRenameSubmit = async () => {
    if (!folderToRename) return;
    const trimmed = renameName.trim();
    if (!trimmed) {
      toast('Vui lòng nhập tên thư mục', 'error');
      return;
    }
    try {
      await renameLessonFolder(folderToRename.id, trimmed, renameColor, renameDescription.trim() || null);
      await onRefreshFolders();
      setFolderToRename(null);
      toast('Đã cập nhật thư mục thành công', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể đổi tên thư mục', 'error');
    }
  };

  const handleOpenMoveFolderModal = (folder: LessonFolder) => {
    setFolderToMove(folder);
    setTargetParentId(folder.parentId);
    setMenuFolderId(null);
  };

  const handleMoveFolderSubmit = async () => {
    if (!folderToMove) return;
    try {
      await moveLessonFolder(folderToMove.id, targetParentId);
      await onRefreshFolders();
      setFolderToMove(null);
      toast('Đã di chuyển thư mục thành công', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể di chuyển thư mục', 'error');
    }
  };

  const handleArchive = async (folder: LessonFolder) => {
    setMenuFolderId(null);
    try {
      await archiveLessonFolder(folder.id);
      await onRefreshFolders();
      toast('Đã lưu trữ thư mục', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể lưu trữ thư mục', 'error');
    }
  };

  const handleRestore = async (folder: LessonFolder) => {
    setMenuFolderId(null);
    try {
      await restoreLessonFolder(folder.id);
      await onRefreshFolders();
      toast('Đã khôi phục thư mục', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể khôi phục thư mục', 'error');
    }
  };

  const handleOpenDeleteModal = (folder: LessonFolder) => {
    setFolderToDelete(folder);
    setMenuFolderId(null);
  };

  const handleDeleteSubmit = async () => {
    if (!folderToDelete) return;
    try {
      await deleteLessonFolder(folderToDelete.id);
      await onRefreshFolders();
      setFolderToDelete(null);
      toast('Đã xóa thư mục thành công', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể xóa thư mục', 'error');
    }
  };

  const handleOpenMoveItemModal = (item: T) => {
    setItemToMove(item);
    setTargetItemFolderId(itemFolderId(item) ?? null);
  };

  const handleMoveItemSubmit = async () => {
    if (!itemToMove) return;
    try {
      await onMoveItemToFolder(itemToMove, targetItemFolderId);
      await onRefreshItems();
      setItemToMove(null);
      toast('Đã chuyển bài học sang thư mục mới', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Không thể chuyển bài học', 'error');
    }
  };

  // Disabled destination IDs when moving a folder (cannot move into self or descendants)
  const disabledFolderIds = useMemo(() => {
    if (!folderToMove) return new Set<string>();
    const descendants = collectDescendantFolderIds(categoryFolders, folderToMove.id);
    descendants.add(folderToMove.id);
    return descendants;
  }, [folderToMove, categoryFolders]);

  // Helper for folder tree sidebar rendering
  const renderSidebarTreeNodes = (nodes: typeof treeNodes) => {
    return nodes.map((node) => {
      const { children, ...folder } = node;
      const isOpen = expandedFolders.has(folder.id);
      const isSelected = currentFolderId === folder.id;
      const matches = !treeSearch.trim() || folder.name.toLowerCase().includes(treeSearch.trim().toLowerCase());
      if (!matches) return null;

      const itemCount = getItemCountInFolder(folder.id);

      return (
        <div key={folder.id} className="text-xs">
          <div
            className={`group flex items-center rounded-lg transition-colors ${
              isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleExpanded(folder.id)}
              className="p-1.5 text-slate-400 hover:text-slate-600 shrink-0"
            >
              {children.length > 0 ? (
                <ChevronDown size={14} className={`transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              ) : (
                <span className="inline-block w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowArchived(false);
                setCurrentFolderId(folder.id);
              }}
              className="flex-1 flex items-center gap-2 py-1.5 pr-2 text-left truncate min-w-0"
            >
              {(() => {
                const meta = getFolderVisualMeta(folder);
                return <meta.Icon size={14} className={`shrink-0 ${meta.iconColor}`} />;
              })()}
              <span className="truncate">{folder.name}</span>
              {itemCount > 0 && (
                <span className="ml-auto text-[10px] text-slate-400 font-normal">{itemCount}</span>
              )}
            </button>
            {canManage && canUserManageFolder(folder) && (
              <div className="relative shrink-0 pr-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuFolderId(menuFolderId === folder.id ? null : folder.id)}
                  className="rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200/60 hover:text-slate-700 transition-opacity"
                  title="Tùy chọn thư mục"
                >
                  <MoreVertical size={13} />
                </button>
                {menuFolderId === folder.id && (
                  <FolderActionMenu
                    folder={folder}
                    onRename={() => handleOpenRenameModal(folder)}
                    onMove={() => handleOpenMoveFolderModal(folder)}
                    onArchive={() => handleArchive(folder)}
                    onRestore={() => handleRestore(folder)}
                    onDelete={() => handleOpenDeleteModal(folder)}
                    onClose={() => setMenuFolderId(null)}
                  />
                )}
              </div>
            )}
          </div>
          {isOpen && children.length > 0 && (
            <div className="ml-3 pl-2 border-l border-slate-100">
              {renderSidebarTreeNodes(children as typeof treeNodes)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* ─── Top Category Header & Back Button ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          {onBackToCategories && (
            <button
              onClick={onBackToCategories}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft size={16} /> Danh mục
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-800">{categoryTitle}</h2>
          {currentFolder && (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
              📁 {currentFolder.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {extraHeaderActions}
          {canManage && onCreateItem && (
            <button
              onClick={() => onCreateItem(currentFolderId)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
            >
              <Plus size={15} /> {createItemLabel}
            </button>
          )}
          {canManage && onImportItem && (
            <button
              onClick={onImportItem}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
            >
              {importItemLabel}
            </button>
          )}
        </div>
      </div>

      {/* ─── Main Content Layout with Sidebar ─── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ─── Sidebar Tree (Desktop) ─── */}
        <aside className="hidden lg:block w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Thư mục</span>
            {canManage && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                title="Tạo thư mục mới"
              >
                <Plus size={14} /> Thư mục
              </button>
            )}
          </div>

          <div className="relative mb-2.5">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="Lọc cây thư mục..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>

          <button
            onClick={() => {
              setShowArchived(false);
              setCurrentFolderId(null);
            }}
            className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
              currentFolderId === null && !showArchived
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <House size={14} className="text-blue-600 shrink-0" />
            <span>Trang chủ</span>
            <span className="ml-auto text-[10px] text-slate-400">{getItemCountInFolder(null)}</span>
          </button>

          <div className="mt-1.5 max-h-[55vh] space-y-0.5 overflow-y-auto pr-1">
            {renderSidebarTreeNodes(treeNodes)}
          </div>

          {archivedCategoryFolders.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowArchived(true);
                  setCurrentFolderId(null);
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  showArchived
                    ? 'bg-amber-50 text-amber-800 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Archive size={13} className="text-amber-600 shrink-0" />
                <span>Thư mục lưu trữ</span>
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] text-amber-700">
                  {archivedCategoryFolders.length}
                </span>
              </button>
            </div>
          )}
        </aside>

        {/* ─── Main Explorer Panel ─── */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* ─── Toolbar: Search + View + Sort + Archive ─── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm bài học hoặc thư mục..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-xs shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Grid / List Mode */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => toggleViewMode('grid')}
                className={`rounded-lg p-1.5 transition-all ${
                  viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Xem dạng lưới"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => toggleViewMode('list')}
                className={`rounded-lg p-1.5 transition-all ${
                  viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Xem dạng danh sách"
              >
                <ListIcon size={16} />
              </button>
            </div>

            {/* Sort Selector */}
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as LessonExplorerSort)}
                className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-7 text-xs shadow-sm outline-none focus:border-blue-400"
              >
                <option value="name_asc">Tên A-Z</option>
                <option value="name_desc">Tên Z-A</option>
                <option value="updated_desc">Mới cập nhật</option>
                <option value="updated_asc">Cũ cập nhật</option>
              </select>
              <ArrowUpDown size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Archive Toggle Button */}
            <button
              onClick={() => {
                setShowArchived(!showArchived);
                setCurrentFolderId(null);
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium shadow-sm transition-all ${
                showArchived
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Inbox size={14} />
              <span>Lưu trữ</span>
              {archivedCategoryFolders.length > 0 && (
                <span className="rounded-full bg-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                  {archivedCategoryFolders.length}
                </span>
              )}
            </button>

            {/* Create Folder button (mobile or top toolbar) */}
            {canManage && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100 transition-all"
              >
                <FolderPlus size={14} />
                <span>+ Thư mục</span>
              </button>
            )}
          </div>

          {/* ─── Breadcrumb Navigation ─── */}
          {!isSearching && (
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
              <button
                onClick={() => {
                  setShowArchived(false);
                  setCurrentFolderId(null);
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors ${
                  currentFolderId === null && !showArchived
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <House size={13} />
                Trang chủ
              </button>

              {showArchived && (
                <>
                  <ChevronRight size={13} className="text-slate-300 shrink-0" />
                  <span className="rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-700 shrink-0">
                    Lưu trữ ({archivedCategoryFolders.length})
                  </span>
                </>
              )}

              {!showArchived &&
                breadcrumb.map((crumb, idx) => {
                  const isLast = idx === breadcrumb.length - 1;
                  return (
                    <div key={crumb.id} className="flex items-center gap-1 shrink-0">
                      <ChevronRight size={13} className="text-slate-300" />
                      <button
                        onClick={() => setCurrentFolderId(crumb.id)}
                        className={`rounded-lg px-2 py-1 transition-colors ${
                          isLast
                            ? 'bg-blue-50 font-bold text-blue-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </div>
                  );
                })}
            </div>
          )}

          {/* ─── SEARCH RESULTS VIEW ─── */}
          {isSearching && searchResults && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-medium">
                Kết quả tìm kiếm cho "{search}":
              </p>

              {searchResults.matchedFolders.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Thư mục</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {searchResults.matchedFolders.map((f) => {
                      const colorMeta = FOLDER_COLOR_CLASSES[f.color || 'blue'] ?? FOLDER_COLOR_CLASSES.blue;
                      return (
                        <div
                          key={f.id}
                          onClick={() => {
                            setSearch('');
                            setCurrentFolderId(f.id);
                          }}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                        >
                          <Folder size={18} className={colorMeta.text} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">{f.name}</p>
                            {f.description && <p className="text-[10px] text-slate-400 truncate">{f.description}</p>}
                          </div>
                          <ChevronRight size={15} className="text-slate-300" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {searchResults.matchedItems.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Bài học</h4>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-2'}>
                    {searchResults.matchedItems.map((item) => (
                      <div key={getItemId(item)} className="relative group">
                        {renderItemCard(item, viewMode === 'list')}
                        {canManage && (
                          <div className="mt-1 flex justify-end">
                            <button
                              onClick={() => handleOpenMoveItemModal(item)}
                              className="text-[10px] font-medium text-blue-600 hover:text-blue-800"
                            >
                              📁 Đổi thư mục
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.matchedFolders.length === 0 && searchResults.matchedItems.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Không tìm thấy thư mục hoặc bài học nào khớp với từ khóa.
                </div>
              )}
            </div>
          )}

          {/* ─── NORMAL FOLDER & ITEMS VIEW ─── */}
          {!isSearching && (
            <div className="space-y-5">
              {/* SUBFOLDERS SECTION */}
              {sortedFolders.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {showArchived ? 'Thư mục đã lưu trữ' : 'Thư mục con'} ({sortedFolders.length})
                    </span>
                  </div>

                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
                        : 'space-y-2'
                    }
                  >
                    {sortedFolders.map((folder) => {
                      const visualMeta = getFolderVisualMeta(folder);
                      const subCount = getSubfolderCount(folder.id);
                      const lessonCount = getItemCountInFolder(folder.id);
                      const isMenuOpen = menuFolderId === folder.id;

                      if (viewMode === 'list') {
                        return (
                          <div
                            key={folder.id}
                            className={`flex items-center justify-between rounded-xl border ${visualMeta.cardBorder} bg-white p-3 ${visualMeta.cardHoverBorder} transition-all cursor-pointer ${
                              folder.archivedAt ? 'bg-amber-50/40 border-amber-200' : ''
                            }`}
                          >
                            <div
                              onClick={() => setCurrentFolderId(folder.id)}
                              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                            >
                              {/* 1. Functional icon */}
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visualMeta.iconBg} ${visualMeta.iconColor}`}>
                                <visualMeta.Icon size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* 2. Folder name */}
                                  <p className="text-xs font-bold text-slate-800 truncate">{folder.name}</p>
                                  {/* 5. Content type badge */}
                                  <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${visualMeta.badgeClass}`}>
                                    {visualMeta.badgeLabel}
                                  </span>
                                  {folder.archivedAt && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-semibold text-amber-700">
                                      Đã lưu trữ
                                    </span>
                                  )}
                                </div>
                                {/* 3. Description */}
                                {folder.description && (
                                  <p className="line-clamp-1 text-[10px] text-slate-500 mt-0.5" title={folder.description}>
                                    {folder.description}
                                  </p>
                                )}
                                {/* 4. Lesson count */}
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                  {lessonCount} bài học{subCount > 0 ? ` • ${subCount} thư mục con` : ''}
                                </p>
                              </div>
                            </div>

                            {canManage && canUserManageFolder(folder) && (
                              <div className="relative shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuFolderId(isMenuOpen ? null : folder.id);
                                  }}
                                  className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                  title="Tùy chọn thư mục"
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {isMenuOpen && (
                                  <FolderActionMenu
                                    folder={folder}
                                    onRename={() => handleOpenRenameModal(folder)}
                                    onMove={() => handleOpenMoveFolderModal(folder)}
                                    onArchive={() => handleArchive(folder)}
                                    onRestore={() => handleRestore(folder)}
                                    onDelete={() => handleOpenDeleteModal(folder)}
                                    onClose={() => setMenuFolderId(null)}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Grid view card
                      return (
                        <div
                          key={folder.id}
                          className={`relative group rounded-2xl border ${visualMeta.cardBorder} bg-white p-3.5 shadow-sm ${visualMeta.cardHoverBorder} transition-all cursor-pointer min-h-[140px] flex flex-col justify-between ${
                            folder.archivedAt ? 'bg-amber-50/40 border-amber-200' : ''
                          }`}
                          onClick={() => setCurrentFolderId(folder.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            {/* 1. Functional icon */}
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visualMeta.iconBg} ${visualMeta.iconColor}`}>
                              <visualMeta.Icon size={20} />
                            </div>

                            {canManage && canUserManageFolder(folder) && (
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setMenuFolderId(isMenuOpen ? null : folder.id)}
                                  className="flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 -mt-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                  title="Tùy chọn thư mục"
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {isMenuOpen && (
                                  <FolderActionMenu
                                    folder={folder}
                                    onRename={() => handleOpenRenameModal(folder)}
                                    onMove={() => handleOpenMoveFolderModal(folder)}
                                    onArchive={() => handleArchive(folder)}
                                    onRestore={() => handleRestore(folder)}
                                    onDelete={() => handleOpenDeleteModal(folder)}
                                    onClose={() => setMenuFolderId(null)}
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="mt-2.5 flex-1 flex flex-col justify-between">
                            <div>
                              {/* 2. Folder name */}
                              <h4 className="text-xs font-bold text-slate-800 truncate" title={folder.name}>
                                {folder.name}
                              </h4>
                              {/* 3. Description (line-clamp-2) */}
                              {folder.description ? (
                                <p className="mt-1 text-[10px] text-slate-500 line-clamp-2 min-h-[28px]" title={folder.description}>
                                  {folder.description}
                                </p>
                              ) : (
                                <div className="min-h-[28px]" />
                              )}
                            </div>
                            <div>
                              {/* 4. Lesson count */}
                              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                                <span>{lessonCount} bài học</span>
                                {subCount > 0 && <span>{subCount} thư mục</span>}
                              </div>
                              {/* 5. Content type badge */}
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${visualMeta.badgeClass}`}>
                                  {visualMeta.badgeLabel}
                                </span>
                                {folder.archivedAt && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                                    Đã lưu trữ
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ITEMS SECTION */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Bài học ({sortedItems.length})
                  </span>
                </div>

                {sortedItems.length > 0 ? (
                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                        : 'space-y-2'
                    }
                  >
                    {sortedItems.map((item) => (
                      <div key={getItemId(item)} className="relative group">
                        {renderItemCard(item, viewMode === 'list')}
                        {canManage && (
                          <div className="mt-1.5 flex items-center justify-end px-1">
                            <button
                              type="button"
                              onClick={() => handleOpenMoveItemModal(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-blue-600 transition-colors"
                              title="Chuyển sang thư mục khác"
                            >
                              <FolderInput size={12} /> Chuyển thư mục
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-6 text-center">
                    <FolderOpen size={40} className="mb-2 text-slate-300" />
                    <p className="text-xs font-medium text-slate-500">{emptyItemText}</p>
                    {canManage && (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {onCreateItem && (
                          <button
                            onClick={() => onCreateItem(currentFolderId)}
                            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                          >
                            <Plus size={14} /> {createItemLabel}
                          </button>
                        )}
                        {onImportItem && (
                          <button
                            onClick={onImportItem}
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            {importItemLabel}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL: CREATE FOLDER ─── */}
      {showCreateFolder && (
        <ModalBackdrop onClose={() => setShowCreateFolder(false)}>
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              title={currentFolder ? `Tạo thư mục con trong "${currentFolder.name}"` : 'Tạo thư mục mới'}
              onClose={() => setShowCreateFolder(false)}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Tên thư mục *</label>
              <input
                type="text"
                autoFocus
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="VD: Bài 1 - 5, Ngữ pháp cơ bản..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mô tả (tùy chọn)</label>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Mô tả ngắn gọn nội dung thư mục..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Màu sắc</label>
              <ColorPicker selected={createColor} onChange={setCreateColor} />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateFolder(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateSubmit}
                disabled={!createName.trim()}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-700"
              >
                Tạo thư mục
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ─── MODAL: RENAME & COLOR FOLDER ─── */}
      {folderToRename && (
        <ModalBackdrop onClose={() => setFolderToRename(null)}>
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="Đổi tên & màu thư mục" onClose={() => setFolderToRename(null)} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Tên thư mục *</label>
              <input
                type="text"
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Mô tả (tùy chọn)</label>
                <span className="text-[10px] text-slate-400">{renameDescription.length}/500</span>
              </div>
              <textarea
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Nhập mô tả thư mục..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Màu sắc</label>
              <ColorPicker selected={renameColor} onChange={setRenameColor} />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToRename(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                disabled={!renameName.trim()}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-700"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ─── MODAL: MOVE FOLDER ─── */}
      {folderToMove && (
        <ModalBackdrop onClose={() => setFolderToMove(null)}>
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              title={`Di chuyển thư mục "${folderToMove.name}"`}
              onClose={() => setFolderToMove(null)}
            />
            <p className="text-xs text-slate-500">
              Chọn thư mục đích bạn muốn chuyển "{folderToMove.name}" vào:
            </p>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
              <button
                type="button"
                onClick={() => setTargetParentId(null)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  targetParentId === null
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <House size={14} /> Trang chủ (Cấp gốc)
              </button>
              {renderDestinationFolders(
                activeCategoryFolders,
                null,
                0,
                targetParentId,
                disabledFolderIds,
                setTargetParentId
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToMove(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleMoveFolderSubmit}
                disabled={targetParentId === folderToMove.parentId}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-700"
              >
                Di chuyển
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ─── MODAL: MOVE ITEM (LESSON) ─── */}
      {itemToMove && (
        <ModalBackdrop onClose={() => setItemToMove(null)}>
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              title={`Chuyển bài học "${getItemTitle(itemToMove)}"`}
              onClose={() => setItemToMove(null)}
            />
            <p className="text-xs text-slate-500">
              Chọn thư mục đích để chứa bài học này:
            </p>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
              <button
                type="button"
                onClick={() => setTargetItemFolderId(null)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  targetItemFolderId === null
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <House size={14} /> Trang chủ (Không thuộc thư mục nào)
              </button>
              {renderDestinationFolders(
                activeCategoryFolders,
                null,
                0,
                targetItemFolderId,
                new Set(),
                setTargetItemFolderId
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToMove(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleMoveItemSubmit}
                disabled={targetItemFolderId === (itemFolderId(itemToMove) ?? null)}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-700"
              >
                Xác nhận chuyển
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ─── MODAL: DELETE / ARCHIVE FOLDER ─── */}
      {folderToDelete && (
        <ModalBackdrop onClose={() => setFolderToDelete(null)}>
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              title={`Xóa thư mục "${folderToDelete.name}"`}
              onClose={() => setFolderToDelete(null)}
            />

            {(() => {
              const childSubCount = getSubfolderCount(folderToDelete.id);
              const childItemCount = getItemCountInFolder(folderToDelete.id);
              const isEmpty = childSubCount === 0 && childItemCount === 0;

              if (isEmpty) {
                return (
                  <>
                    <p className="text-xs text-slate-600">
                      Bạn có chắc chắn muốn xóa thư mục "{folderToDelete.name}"? Thao tác này không thể hoàn tác.
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setFolderToDelete(null)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSubmit}
                        className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Xác nhận xóa
                      </button>
                    </div>
                  </>
                );
              }

              return (
                <>
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="text-xs text-amber-800">
                      <p className="font-semibold">Thư mục đang chứa nội dung!</p>
                      <p className="mt-1">
                        Hiện có {childSubCount} thư mục con và {childItemCount} bài học bên trong.
                        Hệ thống không cho phép xóa trực tiếp thư mục đang có dữ liệu.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Bạn có thể chọn <strong>Lưu trữ thư mục</strong> để ẩn thư mục khỏi danh sách hoạt động, hoặc di chuyển các bài học ra ngoài trước khi xóa.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleArchive(folderToDelete);
                        setFolderToDelete(null);
                      }}
                      className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Lưu trữ thư mục này
                    </button>
                    <button
                      type="button"
                      onClick={() => setFolderToDelete(null)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Đóng
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-scale-up" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
        <X size={16} />
      </button>
    </div>
  );
}

function ColorPicker({
  selected,
  onChange,
}: {
  selected: FolderColor;
  onChange: (c: FolderColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
            selected === opt.key
              ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-300'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${opt.dot}`} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function FolderActionMenu({
  folder,
  onRename,
  onMove,
  onArchive,
  onRestore,
  onDelete,
  onClose,
}: {
  folder: LessonFolder;
  onRename: () => void;
  onMove: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg animate-fade-in text-xs font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onClose();
            onRename();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 text-left"
        >
          <Pencil size={13} className="text-slate-400" />
          <span>Đổi tên / màu</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onMove();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 text-left"
        >
          <FolderInput size={13} className="text-slate-400" />
          <span>Di chuyển</span>
        </button>

        <div className="my-1 border-t border-slate-100" />

        {folder.archivedAt ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onRestore();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 hover:bg-emerald-50 text-left"
          >
            <RotateCcw size={13} />
            <span>Khôi phục</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onClose();
              onArchive();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-amber-700 hover:bg-amber-50 text-left"
          >
            <Archive size={13} />
            <span>Lưu trữ</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 text-left"
        >
          <Trash2 size={13} />
          <span>Xóa thư mục</span>
        </button>
      </div>
    </>
  );
}

function renderDestinationFolders(
  allFolders: LessonFolder[],
  parentId: string | null,
  depth: number,
  selectedId: string | null,
  disabledIds: Set<string>,
  onSelect: (id: string | null) => void
): React.ReactNode {
  const children = allFolders.filter((f) => f.parentId === parentId && !f.archivedAt);
  if (children.length === 0) return null;

  return children.map((folder) => {
    const isDisabled = disabledIds.has(folder.id);
    const isSelected = selectedId === folder.id;
    return (
      <div key={folder.id}>
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onSelect(folder.id)}
          className={`w-full flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs transition-colors ${
            isSelected
              ? 'bg-blue-50 font-semibold text-blue-700'
              : isDisabled
              ? 'cursor-not-allowed opacity-40 text-slate-300'
              : 'text-slate-700 hover:bg-slate-50'
          }`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          <Folder size={13} className="shrink-0 text-slate-400" />
          <span className="truncate">{folder.name}</span>
          {isDisabled && <span className="text-[10px] text-slate-400 ml-auto">(không chọn được)</span>}
        </button>
        {renderDestinationFolders(allFolders, folder.id, depth + 1, selectedId, disabledIds, onSelect)}
      </div>
    );
  });
}
