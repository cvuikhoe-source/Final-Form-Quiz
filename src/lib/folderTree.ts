import type { ExamFolder, FolderColor } from '@/types';

export interface FolderNode {
  folder: ExamFolder;
  children: FolderNode[];
}

export const FOLDER_COLOR_OPTIONS: { key: FolderColor; label: string; dot: string; soft: string }[] = [
  { key: 'blue', label: 'Xanh dương', dot: 'bg-blue-500', soft: 'bg-blue-50 text-blue-600' },
  { key: 'green', label: 'Xanh lá', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-600' },
  { key: 'orange', label: 'Cam', dot: 'bg-orange-500', soft: 'bg-orange-50 text-orange-600' },
  { key: 'purple', label: 'Tím', dot: 'bg-purple-500', soft: 'bg-purple-50 text-purple-600' },
  { key: 'rose', label: 'Hồng', dot: 'bg-rose-500', soft: 'bg-rose-50 text-rose-600' },
  { key: 'slate', label: 'Xám', dot: 'bg-slate-400', soft: 'bg-slate-100 text-slate-600' },
];

export function getFolderColorMeta(color: FolderColor | null) {
  return FOLDER_COLOR_OPTIONS.find((c) => c.key === color) ?? FOLDER_COLOR_OPTIONS[FOLDER_COLOR_OPTIONS.length - 1];
}

export function buildFolderTree(folders: ExamFolder[] | null | undefined): FolderNode[] {
  const list = Array.isArray(folders) ? folders.filter((f) => f && typeof f.id === 'string') : [];
  const byId = new Map(list.map((f) => [f.id, f] as const));

  // A folder is a tree root when it has no valid parent, or when its parent
  // chain is cyclic or broken (corrupt/legacy data must still render, and the
  // resulting tree must stay acyclic so traversal never loops forever).
  const isRoot = new Map<string, boolean>();
  const classify = (id: string): boolean => {
    const cached = isRoot.get(id);
    if (cached !== undefined) return cached;
    const f = byId.get(id)!;
    let result: boolean;
    if (!f.parentId || !byId.has(f.parentId) || f.parentId === id) {
      result = true;
    } else {
      result = false;
      const seen = new Set<string>([id]);
      let cur = byId.get(f.parentId);
      let guard = 0;
      while (cur && guard <= list.length) {
        if (cur.id === id) { result = true; break; }
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        guard += 1;
      }
    }
    isRoot.set(id, result);
    return result;
  };
  list.forEach((f) => classify(f.id));

  const nodeMap = new Map<string, FolderNode>();
  list.forEach((f) => nodeMap.set(f.id, { folder: f, children: [] }));
  const roots: FolderNode[] = [];
  list.forEach((f) => {
    const node = nodeMap.get(f.id)!;
    const parent = f.parentId ? nodeMap.get(f.parentId) : undefined;
    if (parent && parent !== node && !isRoot.get(f.id)) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.folder.sortOrder - b.folder.sortOrder || a.folder.name.localeCompare(b.folder.name, 'vi'));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export function flattenTree(nodes: FolderNode[], depth = 0): { folder: ExamFolder; depth: number }[] {
  return nodes.flatMap((n) => [{ folder: n.folder, depth }, ...flattenTree(n.children, depth + 1)]);
}

export function getFolderPath(folders: ExamFolder[] | null | undefined, id: string | null): ExamFolder[] {
  if (!id) return [];
  const list = Array.isArray(folders) ? folders : [];
  const byId = new Map(list.map((f) => [f.id, f]));
  const path: ExamFolder[] = [];
  let cur = byId.get(id);
  let guard = 0;
  const seen = new Set<string>();
  while (cur && guard < 100 && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    guard += 1;
  }
  return path;
}

export function getDescendantIds(folders: ExamFolder[] | null | undefined, id: string): Set<string> {
  const list = Array.isArray(folders) ? folders : [];
  const childMap = new Map<string, string[]>();
  list.forEach((f) => {
    const key = f.parentId ?? '';
    const child = f.id;
    if (child === id) return;
    const l = childMap.get(key) ?? [];
    l.push(child);
    childMap.set(key, l);
  });
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childMap.get(cur) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        stack.push(child);
      }
    }
  }
  return result;
}

export function countFolderContents(
  folders: ExamFolder[] | null | undefined,
  exams: { folderId: string | null | undefined }[],
  folderId: string
): { folderCount: number; examCount: number } {
  const folderList = Array.isArray(folders) ? folders : [];
  const examList = Array.isArray(exams) ? exams : [];
  const descendantIds = getDescendantIds(folderList, folderId);
  descendantIds.delete(folderId);
  return {
    folderCount: descendantIds.size,
    examCount: examList.filter((e) => e.folderId && descendantIds.has(e.folderId)).length,
  };
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Hôm nay';
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
