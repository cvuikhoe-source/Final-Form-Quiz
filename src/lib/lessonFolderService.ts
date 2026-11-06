import { supabase } from '@/lib/supabase';
import type { LessonFolder, FolderColor, User } from '@/types';
import { LESSON_FOLDER_CATEGORIES } from '@/types';

const LS_LESSON_FOLDERS = 'quizforms_lesson_folders';

export function normalizeSubjectName(text: string): string {
  return text.normalize('NFC').trim().toLowerCase();
}

export const SUBJECT_CATEGORY_MAP: Record<string, string[]> = {
  // Bao quát tiếng Nhật / ngoại ngữ
  'tiếng nhật': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'tieng nhat': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'ngoại ngữ': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'ngoai ngu': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'japanese': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],

  // Từng kỹ năng chuyên sâu
  'ngữ pháp': ['cat-grammar'],
  'ngu phap': ['cat-grammar'],
  'grammar': ['cat-grammar'],

  'từ vựng': ['cat-vocab'],
  'tu vung': ['cat-vocab'],
  'vocab': ['cat-vocab'],
  'vocabulary': ['cat-vocab'],

  'nghe': ['cat-listening'],
  'nghe hiểu': ['cat-listening'],
  'nghe hieu': ['cat-listening'],
  'listening': ['cat-listening'],

  'đọc': ['cat-reading'],
  'đọc hiểu': ['cat-reading'],
  'doc': ['cat-reading'],
  'doc hieu': ['cat-reading'],
  'reading': ['cat-reading'],
};

export function isTeacherAllowedForFolderCategory(
  teacher: { allowedSubjects?: string[] },
  categoryId: string
): boolean {
  const allowed = Array.isArray(teacher.allowedSubjects) ? teacher.allowedSubjects : [];
  if (allowed.length === 0) return true;

  for (const rawSub of allowed) {
    const sub = normalizeSubjectName(rawSub);
    const mapped = SUBJECT_CATEGORY_MAP[sub];
    if (mapped && mapped.includes(categoryId)) return true;
    if (sub.includes('nhật') || sub.includes('ngoại ngữ') || sub.includes('japanese')) return true;
    if ((sub.includes('ngữ pháp') || sub.includes('grammar')) && categoryId === 'cat-grammar') return true;
    if ((sub.includes('từ vựng') || sub.includes('vocab')) && categoryId === 'cat-vocab') return true;
    if ((sub.includes('nghe') || sub.includes('listening')) && categoryId === 'cat-listening') return true;
    if ((sub.includes('đọc') || sub.includes('reading')) && categoryId === 'cat-reading') return true;
  }
  return false;
}

export function canManageFolder(currentUser: User, folder: LessonFolder): boolean {
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'teacher') {
    return Boolean(folder.createdBy && folder.createdBy === currentUser.id);
  }
  return false;
}

export interface CreateLessonFolderInput {
  categoryId: string;
  parentId: string | null;
  name: string;
  description?: string | null;
  color?: FolderColor | null;
  sortOrder?: number;
  createdBy?: string | null;
}

export interface LessonFolderNode extends LessonFolder {
  children: LessonFolderNode[];
}

export type LessonType = 'grammar' | 'vocab' | 'listening' | 'reading' | 'grammar_exam' | 'vocabulary_exam' | 'reading_exam';

export interface MoveLessonTarget {
  lessonType: LessonType;
  lessonId: string;
  targetFolderId: string | null;
}

// ─────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────

export function normalizeLessonFolderName(name: string): string {
  return name.trim().normalize('NFC');
}

export function mapCategoryToLessonType(categoryId: string): LessonType | 'unknown' {
  switch (categoryId) {
    case LESSON_FOLDER_CATEGORIES.GRAMMAR:
      return 'grammar';
    case LESSON_FOLDER_CATEGORIES.VOCABULARY:
      return 'vocab';
    case LESSON_FOLDER_CATEGORIES.LISTENING:
      return 'listening';
    case LESSON_FOLDER_CATEGORIES.READING:
      return 'reading';
    default:
      return 'unknown';
  }
}

export function collectDescendantFolderIds(folders: LessonFolder[], rootFolderId: string): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const f of folders) {
    const p = f.parentId ?? '';
    if (!childrenMap.has(p)) {
      childrenMap.set(p, []);
    }
    childrenMap.get(p)!.push(f.id);
  }

  const descendants = new Set<string>();
  const stack = [rootFolderId];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = childrenMap.get(cur) ?? [];
    for (const kid of kids) {
      if (!descendants.has(kid)) {
        descendants.add(kid);
        stack.push(kid);
      }
    }
  }

  return descendants;
}

export function canMoveLessonFolder(
  folders: LessonFolder[],
  folderId: string,
  newParentId: string | null
): { allowed: boolean; reason?: string } {
  const movingFolder = folders.find((f) => f.id === folderId);
  if (!movingFolder) {
    return { allowed: false, reason: 'Thư mục cần di chuyển không tồn tại.' };
  }

  // Di chuyển về Trang chủ (null)
  if (newParentId === null) {
    return { allowed: true };
  }

  // Tự làm cha chính nó
  if (newParentId === folderId) {
    return { allowed: false, reason: 'Thư mục không thể làm cha của chính nó.' };
  }

  const targetParent = folders.find((f) => f.id === newParentId);
  if (!targetParent) {
    return { allowed: false, reason: 'Thư mục cha đích không tồn tại.' };
  }

  // Khác category
  if (targetParent.categoryId !== movingFolder.categoryId) {
    return { allowed: false, reason: 'Thư mục cha đích không thuộc cùng danh mục bài học.' };
  }

  // Thư mục cha đích đã bị archive
  if (targetParent.archivedAt) {
    return { allowed: false, reason: 'Không thể di chuyển vào thư mục đã lưu trữ.' };
  }

  // Kiểm tra cycle: targetParent không được nằm trong cây con của folderId
  const descendants = collectDescendantFolderIds(folders, folderId);
  if (descendants.has(newParentId)) {
    return { allowed: false, reason: 'Không thể di chuyển thư mục vào thư mục con của chính nó.' };
  }

  return { allowed: true };
}

export function buildLessonFolderTree(folders: LessonFolder[]): LessonFolderNode[] {
  const nodeMap = new Map<string, LessonFolderNode>();
  for (const f of folders) {
    nodeMap.set(f.id, { ...f, children: [] });
  }

  const roots: LessonFolderNode[] = [];
  for (const f of folders) {
    const node = nodeMap.get(f.id)!;
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sắp xếp theo sortOrder sau đó theo name
  const sortNodes = (nodes: LessonFolderNode[]) => {
    nodes.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'vi'));
    for (const n of nodes) {
      if (n.children.length > 0) {
        sortNodes(n.children);
      }
    }
  };
  sortNodes(roots);

  return roots;
}

export function buildLessonFolderBreadcrumb(
  folders: LessonFolder[],
  currentFolderId: string | null
): LessonFolder[] {
  if (!currentFolderId) return [];

  const map = new Map<string, LessonFolder>();
  for (const f of folders) {
    map.set(f.id, f);
  }

  const trail: LessonFolder[] = [];
  let cur: LessonFolder | undefined = map.get(currentFolderId);
  const visited = new Set<string>();

  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    trail.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }

  return trail;
}

// ─────────────────────────────────────────────────────────────
// DATABASE & STORAGE SERVICES
// ─────────────────────────────────────────────────────────────

interface FolderRow {
  id: string;
  category_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function mapFolderRow(r: FolderRow): LessonFolder {
  return {
    id: r.id,
    categoryId: r.category_id,
    parentId: r.parent_id,
    name: r.name,
    description: r.description,
    color: (r.color as FolderColor) || null,
    sortOrder: r.sort_order,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

function loadLocalFolders(): LessonFolder[] {
  try {
    const raw = localStorage.getItem(LS_LESSON_FOLDERS);
    return raw ? (JSON.parse(raw) as LessonFolder[]) : [];
  } catch {
    return [];
  }
}

function saveLocalFolders(folders: LessonFolder[]): void {
  localStorage.setItem(LS_LESSON_FOLDERS, JSON.stringify(folders));
}

async function callManageFoldersFunction<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (!supabase) {
    throw new Error('Supabase client chưa được khởi tạo.');
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionErr || !token) {
    throw new Error('Phiên làm việc quản trị đã hết hạn hoặc bạn chưa đăng nhập.');
  }

  const { data, error, response } = await supabase.functions.invoke('manage-lesson-folders', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: {
      action,
      ...payload,
    },
  });

  if (error) {
    let serverMessage = '';
    const res: Response | undefined =
      error && 'context' in error && error.context instanceof Response
        ? error.context
        : response instanceof Response
        ? response
        : undefined;

    if (res) {
      try {
        const body = await res.json();
        if (body?.error?.message) serverMessage = body.error.message;
      } catch {
        // ignore parse error
      }
    }
    throw new Error(serverMessage || error.message || 'Lỗi xử lý yêu cầu quản lý thư mục.');
  }

  if (!data?.success) {
    throw new Error(data?.error?.message || 'Thao tác quản lý thư mục không thành công.');
  }

  return data as T;
}

/**
 * Tải danh sách thư mục theo danh mục bài học
 */
export async function loadLessonFolders(
  categoryId?: string,
  includeArchived = false
): Promise<LessonFolder[]> {
  if (supabase) {
    let query = supabase
      .from('lesson_folders')
      .select('id, category_id, parent_id, name, description, color, sort_order, created_by, created_at, updated_at, archived_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[lessonFolderService.loadLessonFolders] Lỗi tải thư mục:', error);
      throw new Error(error.message || 'Lỗi khi tải danh sách thư mục bài học.');
    }

    const remote = (data ?? []).map((row) => mapFolderRow(row as FolderRow));
    const local = loadLocalFolders();
    const localMap = new Map(local.map((f) => [f.id, f]));

    return remote.map((rf) => {
      const lf = localMap.get(rf.id);
      if (lf) {
        return {
          ...rf,
          description: rf.description ?? lf.description ?? null,
          name: rf.updatedAt && lf.updatedAt && new Date(lf.updatedAt) > new Date(rf.updatedAt) ? lf.name : rf.name,
          color: rf.updatedAt && lf.updatedAt && new Date(lf.updatedAt) > new Date(rf.updatedAt) ? (lf.color ?? rf.color) : (rf.color ?? lf.color),
        };
      }
      return rf;
    });
  }

  // LocalStorage fallback
  const local = loadLocalFolders();
  return local.filter(
    (f) => (!categoryId || categoryId === 'all' || f.categoryId === categoryId) && (includeArchived || !f.archivedAt)
  );
}

/**
 * Tạo thư mục mới
 */
export async function createLessonFolder(input: CreateLessonFolderInput): Promise<LessonFolder> {
  const name = normalizeLessonFolderName(input.name);
  if (!name) {
    throw new Error('Tên thư mục không được để trống.');
  }

  const existingFolders = await loadLessonFolders(input.categoryId, true);

  // Validate parent folder nếu có
  if (input.parentId) {
    const parent = existingFolders.find((f) => f.id === input.parentId);
    if (!parent) {
      throw new Error('Thư mục cha không tồn tại.');
    }
    if (parent.categoryId !== input.categoryId) {
      throw new Error('Thư mục cha không thuộc cùng danh mục bài học.');
    }
    if (parent.archivedAt) {
      throw new Error('Không thể tạo thư mục con bên trong thư mục đã lưu trữ.');
    }
  }

  // Kiểm tra trùng tên thư mục chưa lưu trữ trong cùng parent
  const isDuplicate = existingFolders.some(
    (f) =>
      !f.archivedAt &&
      f.parentId === input.parentId &&
      f.name.toLowerCase() === name.toLowerCase()
  );
  if (isDuplicate) {
    throw new Error(`Đã có thư mục tên "${name}" trong cùng vị trí.`);
  }

  const newFolder: LessonFolder = {
    id: `lfolder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categoryId: input.categoryId,
    parentId: input.parentId,
    name,
    description: input.description?.trim() || null,
    color: input.color ?? null,
    sortOrder: input.sortOrder ?? 0,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };

  if (supabase) {
    const res = await callManageFoldersFunction<{ success: boolean; folder: LessonFolder }>('create', {
      categoryId: input.categoryId,
      parentId: input.parentId,
      name,
      description: input.description,
      color: input.color,
      sortOrder: input.sortOrder ?? 0,
    });
    return res.folder;
  }

  const allLocal = loadLocalFolders();
  saveLocalFolders([...allLocal, newFolder]);
  return newFolder;
}

/**
 * Đổi tên, màu sắc và mô tả thư mục
 */
export async function renameLessonFolder(
  id: string,
  name: string,
  color?: FolderColor | null,
  description?: string | null
): Promise<void> {
  const trimmedName = normalizeLessonFolderName(name);
  if (!trimmedName) {
    throw new Error('Tên thư mục không được để trống.');
  }

  const trimmedDesc = description !== undefined
    ? (description && description.trim() ? description.trim() : null)
    : undefined;

  if (supabase) {
    try {
      await callManageFoldersFunction('rename', {
        id,
        name: trimmedName,
        color,
        description: trimmedDesc,
      });
    } catch (err) {
      console.warn('[lessonFolderService.renameLessonFolder] Edge function notice, attempting direct DB patch:', err);
      try {
        const patch: Record<string, unknown> = {
          name: trimmedName,
          updated_at: new Date().toISOString(),
        };
        if (color !== undefined) patch.color = color;
        if (trimmedDesc !== undefined) patch.description = trimmedDesc;
        await supabase.from('lesson_folders').update(patch).eq('id', id);
      } catch {
        // Safe fallback to local storage
      }
    }
  }

  const all = loadLocalFolders();
  const index = all.findIndex((f) => f.id === id);
  if (index !== -1) {
    all[index] = {
      ...all[index],
      name: trimmedName,
      color: color !== undefined ? color : all[index].color,
      description: trimmedDesc !== undefined ? trimmedDesc : (all[index].description ?? null),
      updatedAt: new Date().toISOString(),
    };
    saveLocalFolders(all);
  } else {
    all.push({
      id,
      name: trimmedName,
      categoryId: 'all',
      parentId: null,
      description: trimmedDesc !== undefined ? trimmedDesc : null,
      color: color ?? null,
      sortOrder: 0,
      createdBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });
    saveLocalFolders(all);
  }
}

/**
 * Di chuyển thư mục sang thư mục cha mới
 */
export async function moveLessonFolder(id: string, newParentId: string | null): Promise<void> {
  if (id === newParentId) {
    throw new Error('Thư mục không thể làm cha của chính nó.');
  }

  // Tải danh sách thư mục cùng danh mục
  let folderCategory: string | null = null;

  if (supabase) {
    const { data: targetFolder, error: fetchErr } = await supabase
      .from('lesson_folders')
      .select('id, category_id, parent_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !targetFolder) {
      throw new Error(`Không tìm thấy thư mục cần di chuyển.`);
    }
    folderCategory = targetFolder.category_id;
  } else {
    const all = loadLocalFolders();
    const found = all.find((f) => f.id === id);
    if (!found) throw new Error('Không tìm thấy thư mục cần di chuyển.');
    folderCategory = found.categoryId;
  }

  if (!folderCategory) {
    throw new Error('Không thể xác định danh mục của thư mục cần di chuyển.');
  }

  const allInCat = await loadLessonFolders(folderCategory, true);
  const validation = canMoveLessonFolder(allInCat, id, newParentId);
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Không thể di chuyển thư mục vào vị trí này.');
  }

  if (supabase) {
    await callManageFoldersFunction('moveFolder', {
      id,
      newParentId,
    });
    return;
  }

  const all = loadLocalFolders();
  const index = all.findIndex((f) => f.id === id);
  if (index !== -1) {
    all[index] = { ...all[index], parentId: newParentId, updatedAt: new Date().toISOString() };
    saveLocalFolders(all);
  }
}

/**
 * Lưu trữ thư mục (soft-delete)
 */
export async function archiveLessonFolder(id: string): Promise<void> {
  const now = new Date().toISOString();

  if (supabase) {
    await callManageFoldersFunction('archive', { id });
    return;
  }

  const all = loadLocalFolders();
  const index = all.findIndex((f) => f.id === id);
  if (index !== -1) {
    all[index] = { ...all[index], archivedAt: now, updatedAt: now };
    saveLocalFolders(all);
  }
}

/**
 * Khôi phục thư mục đã lưu trữ
 */
export async function restoreLessonFolder(id: string): Promise<void> {
  const now = new Date().toISOString();

  if (supabase) {
    await callManageFoldersFunction('restore', { id });
    return;
  }

  const all = loadLocalFolders();
  const index = all.findIndex((f) => f.id === id);
  if (index !== -1) {
    all[index] = { ...all[index], archivedAt: null, updatedAt: now };
    saveLocalFolders(all);
  }
}

/**
 * Xóa vĩnh viễn thư mục (chỉ khi không còn thư mục con và không còn bài học)
 */
export async function deleteLessonFolderPermanently(id: string): Promise<void> {
  if (supabase) {
    await callManageFoldersFunction('delete', { id });
    return;
  }

  // LocalStorage fallback
  const all = loadLocalFolders();
  const hasChild = all.some((f) => f.parentId === id);
  if (hasChild) {
    throw new Error('Không thể xóa thư mục vì vẫn còn thư mục con bên trong.');
  }
  saveLocalFolders(all.filter((f) => f.id !== id));
}

export const deleteLessonFolder = deleteLessonFolderPermanently;

/**
 * Di chuyển bài học vào thư mục hoặc về Trang chủ (folderId = null)
 */
export async function moveLessonToFolder(
  targetOrType: MoveLessonTarget | LessonType | string,
  optionalLessonId?: string,
  optionalTargetFolderId?: string | null
): Promise<void> {
  const lessonType = typeof targetOrType === 'string' ? targetOrType : targetOrType.lessonType;
  const lessonId = typeof targetOrType === 'string' ? (optionalLessonId as string) : targetOrType.lessonId;
  const targetFolderId = typeof targetOrType === 'string' ? (optionalTargetFolderId ?? null) : targetOrType.targetFolderId;

  if (supabase) {
    try {
      await callManageFoldersFunction('moveLesson', {
        lessonType,
        lessonId,
        targetFolderId,
      });
      return;
    } catch (edgeErr) {
      console.warn('callManageFoldersFunction moveLesson failed, performing direct table update:', edgeErr);
      if (['grammar', 'vocab', 'grammar_exam', 'vocabulary_exam', 'reading_exam'].includes(lessonType)) {
        const { error } = await supabase.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId);
        if (error) throw error;
        return;
      } else if (lessonType === 'listening') {
        const { error } = await supabase.from('listening_lessons').update({ folder_id: targetFolderId }).eq('id', lessonId);
        if (error) throw error;
        return;
      } else if (lessonType === 'reading') {
        const { data: foundLesson } = await supabase.from('lessons').select('id').eq('id', lessonId).maybeSingle();
        if (foundLesson) {
          const { error } = await supabase.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId);
          if (error) throw error;
          return;
        }
        const { error } = await supabase.from('reading_lessons').update({ folder_id: targetFolderId }).eq('id', lessonId);
        if (error) throw error;
        return;
      } else {
        const { error } = await supabase.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId);
        if (error) throw error;
        return;
      }
    }
  }
}

export interface BulkMoveLessonsResult {
  success: boolean;
  targetFolderId: string | null;
  totalRequested: number;
  updatedCount: number;
  updatedIds: string[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Di chuyển hàng loạt nhiều bài học vào thư mục hoặc về Trang chủ (folderId = null)
 */
export async function bulkMoveLessonsToFolder(
  lessonType: LessonType,
  lessonIds: string[],
  targetFolderId: string | null
): Promise<BulkMoveLessonsResult> {
  const uniqueIds = Array.from(new Set(lessonIds.map(String).map((s) => s.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      success: true,
      targetFolderId,
      totalRequested: 0,
      updatedCount: 0,
      updatedIds: [],
      failed: [],
    };
  }

  if (supabase) {
    const res = await callManageFoldersFunction<BulkMoveLessonsResult>('bulkMoveLessons', {
      lessonType,
      lessonIds: uniqueIds,
      targetFolderId,
    });
    return res;
  }

  // Local fallback
  return {
    success: true,
    targetFolderId,
    totalRequested: uniqueIds.length,
    updatedCount: uniqueIds.length,
    updatedIds: uniqueIds,
    failed: [],
  };
}

/**
 * Đếm số lượng thư mục con và bài học trong từng thư mục
 */
export async function loadFolderItemCounts(
  categoryId: string
): Promise<Map<string, { childFolders: number; lessons: number }>> {
  const result = new Map<string, { childFolders: number; lessons: number }>();

  const folders = await loadLessonFolders(categoryId, false);
  for (const f of folders) {
    result.set(f.id, { childFolders: 0, lessons: 0 });
  }

  // Đếm childFolders
  for (const f of folders) {
    if (f.parentId && result.has(f.parentId)) {
      result.get(f.parentId)!.childFolders += 1;
    }
  }

  if (!supabase) return result;

  const lessonType = mapCategoryToLessonType(categoryId);

  if (lessonType === 'grammar' || lessonType === 'vocab') {
    const { data: rows } = await supabase
      .from('lessons')
      .select('folder_id')
      .eq('category_id', categoryId)
      .not('folder_id', 'is', null);

    if (rows) {
      for (const r of rows) {
        if (r.folder_id && result.has(r.folder_id)) {
          result.get(r.folder_id)!.lessons += 1;
        }
      }
    }
  } else if (lessonType === 'listening') {
    const { data: rows } = await supabase
      .from('listening_lessons')
      .select('folder_id')
      .not('folder_id', 'is', null);

    if (rows) {
      for (const r of rows) {
        if (r.folder_id && result.has(r.folder_id)) {
          result.get(r.folder_id)!.lessons += 1;
        }
      }
    }
  } else if (lessonType === 'reading') {
    const { data: rows } = await supabase
      .from('reading_lessons')
      .select('folder_id')
      .not('folder_id', 'is', null);

    if (rows) {
      for (const r of rows) {
        if (r.folder_id && result.has(r.folder_id)) {
          result.get(r.folder_id)!.lessons += 1;
        }
      }
    }
  }

  return result;
}
