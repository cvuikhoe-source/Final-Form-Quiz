import { useEffect, useMemo, useState } from 'react';
import type { Exam, ExamStatus, ExamFolder, FolderColor } from '@/types';
import { loadSubjects, addSubject, removeSubject, loadClasses, addClass, removeClass } from '@/storage';
import {
  loadExamFolders, createExamFolder, updateExamFolder, deleteExamFolder, moveExamToFolder,
} from '@/storage';
import { buildFolderTree, flattenTree, type FolderNode } from '@/lib/folderTree';
import { toast } from './Toast';
import { useLanguage } from '@/context/LanguageContext';
import { ExcelImportModal } from './ExcelImportModal';
import { ExamExplorer } from './ExamExplorer';
import {
  CreateFolderDialog, RenameFolderDialog, DeleteFolderDialog,
} from './FolderDialogs';
import {
  Plus, Check, X, Search, FileSpreadsheet,
  PlusCircle, XCircle, FolderPlus, ChevronDown, ChevronRight, House, Archive,
} from 'lucide-react';

interface AdminViewProps {
  exams: Exam[];
  onCreate: (exam: Omit<Exam, 'id' | 'createdAt'>) => void;
  onBatchCreate: (exams: Omit<Exam, 'id' | 'createdAt'>[]) => void;
  onUpdate: (id: string, updates: Partial<Exam>) => void;
  onDelete: (id: string) => void;
  currentUserId: string;
}

export function AdminView({ exams, onCreate, onBatchCreate, onUpdate, onDelete, currentUserId }: AdminViewProps) {
  const { t } = useLanguage();
  // ─── Explorer state ───────────────────────────────────────
  const [folders, setFolders] = useState<ExamFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: 'createFolder'; parentId: string | null }
    | { kind: 'renameFolder'; folder: ExamFolder }
    | { kind: 'deleteFolder'; folder: ExamFolder; childFolderCount: number; examCount: number }
    | null
  >(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [createTargetFolderId, setCreateTargetFolderId] = useState<string | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState('');
  const [showArchivedFolders, setShowArchivedFolders] = useState(false);

  useEffect(() => {
    loadExamFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  // ─── Folder operations ────────────────────────────────────
  const handleCreateFolder = async (parentId: string | null, name: string, description: string, color: FolderColor) => {
    const folder = await createExamFolder({
      parentId, name, description, color,
      sortOrder: Date.now() % 100000, createdBy: currentUserId,
    });
    setFolders((prev) => [...prev, folder]);
    setExpanded((prev) => (parentId ? new Set(prev).add(parentId) : prev));
    setDialog(null);
    toast(t('admin.toast.folderCreated', { name }), 'success');
  };

  const handleRenameFolder = async (id: string, name: string, color: FolderColor | null) => {
    await updateExamFolder(id, { name, color });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name, color } : f)));
    setDialog(null);
    toast(t('admin.toast.folderRenamed'), 'success');
  };

  const handleMoveFolder = async (id: string, newParentId: string | null) => {
    const moving = folders.find((f) => f.id === id);
    if (moving?.parentId === newParentId) return;
    // Block moving a folder into its own descendant (cycle prevention)
    if (newParentId) {
      const byParent = new Map<string, string[]>();
      folders.forEach((f) => {
        const key = f.parentId ?? '';
        byParent.set(key, [...(byParent.get(key) ?? []), f.id]);
      });
      const bad = new Set<string>([id]);
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of byParent.get(cur) ?? []) {
          if (!bad.has(child)) { bad.add(child); stack.push(child); }
        }
      }
      if (bad.has(newParentId)) {
        toast(t('admin.toast.folderMoveInvalid'), 'error');
        return;
      }
    }
    await updateExamFolder(id, { parentId: newParentId });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, parentId: newParentId } : f)));
    if (newParentId) setExpanded((prev) => new Set(prev).add(newParentId));
    toast(t('admin.toast.folderMoved'), 'success');
  };

  const handleArchiveFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    const archiving = folder && !folder.archivedAt;
    await updateExamFolder(id, { archivedAt: archiving ? new Date().toISOString() : null });
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, archivedAt: archiving ? new Date().toISOString() : null } : f))
    );
    if (archiving && currentFolderId && isDescendant(folders, id, currentFolderId)) setCurrentFolderId(null);
    toast(archiving ? t('admin.toast.folderArchived') : t('admin.toast.folderUnarchived'), 'info');
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteExamFolder(id);
    // Exams inside fall back to Trang chủ (DB sets folder_id = NULL via ON DELETE SET NULL)
    const removed = new Set<string>([id]);
    const stack = [id];
    const byParent = new Map<string, string[]>();
    folders.forEach((f) => {
      const key = f.parentId ?? '';
      byParent.set(key, [...(byParent.get(key) ?? []), f.id]);
    });
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of byParent.get(cur) ?? []) {
        if (!removed.has(child)) { removed.add(child); stack.push(child); }
      }
    }
    setFolders((prev) => prev.filter((f) => !removed.has(f.id)));
    setExamsFolderIds((prev) =>
      prev.map((e) => (e.folderId && removed.has(e.folderId) ? { ...e, folderId: null } : e))
    );
    if (currentFolderId && removed.has(currentFolderId)) setCurrentFolderId(null);
    setDialog(null);
    toast(t('admin.toast.folderDeleted'), 'info');
  };

  const handleMoveExam = async (examId: string, folderId: string | null) => {
    await moveExamToFolder(examId, folderId);
    setExamsFolderIds((prev) => prev.map((e) => (e.id === examId ? { ...e, folderId } : e)));
    toast(t('admin.toast.examMoved'), 'success');
  };

  // Local helper so exam folder moves reflect without waiting for App-level refresh
  const [examsLocal, setExamsFolderIds] = useState<Exam[]>(exams);
  useEffect(() => { setExamsFolderIds(exams); }, [exams]);

  const handleCopy = async (exam: Exam) => {
    try {
      await navigator.clipboard.writeText(exam.formsUrl);
    } catch {
      const input = document.createElement('input');
      input.value = exam.formsUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedId(exam.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast(t('admin.toast.linkCopied'), 'success');
  };

  // ─── Tree helpers ─────────────────────────────────────────
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const filteredFlat = useMemo(
    () => (treeSearch.trim() ? flat.filter(({ folder }) => folder.name.toLowerCase().includes(treeSearch.trim().toLowerCase())) : flat),
    [flat, treeSearch]
  );

  const totalExamCount = exams.length;
  const archivedCount = folders.filter((f) => f.archivedAt).length;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">{t('admin.title')}</h2>
        <p className="text-sm text-slate-500">{t('admin.countTotal', { count: totalExamCount })}</p>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setDialog({ kind: 'createFolder', parentId: currentFolderId })}
          className="flex items-center gap-1.5 rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-all active:scale-[0.98] hover:bg-blue-100"
        >
          <FolderPlus size={18} />
          {t('admin.newFolder')}
        </button>
        <button
          onClick={() => { setCreateTargetFolderId(currentFolderId); setShowCreate(true); }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-blue-700"
        >
          <Plus size={18} />
          {t('admin.examBtn')}
        </button>
        <button
          onClick={() => setShowExcelImport(true)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100"
        >
          <FileSpreadsheet size={18} />
          {t('admin.importExcel')}
        </button>
        <button
          onClick={() => setShowArchivedFolders((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all ${
            showArchivedFolders ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
          title={t('admin.viewArchived')}
        >
          <Archive size={16} />
          {t('admin.archive', { count: archivedCount > 0 ? ` (${archivedCount})` : '' })}
        </button>
      </div>

      <div className="flex gap-4">
        {/* ─── Tree sidebar (desktop) ─── */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('admin.foldersLabel')}</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder={t('admin.filterTreePlaceholder')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={() => setCurrentFolderId(null)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-all ${
                currentFolderId === null ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <House size={15} />
              {t('common.home')}
              <span className="ml-auto text-xs text-slate-400">{exams.filter((e) => !e.folderId).length}</span>
            </button>
            <div className="mt-1 max-h-[60vh] space-y-0.5 overflow-y-auto">
              {renderTreeNodes(tree)}
            </div>
          </div>
        </aside>

        {/* ─── Explorer main area ─── */}
        <div className="min-w-0 flex-1">
          <ExamExplorer
            user={{ id: currentUserId, role: 'admin', username: '', password: '', fullName: '', assignedClasses: [], allowedSubjects: [] }}
            exams={examsLocal}
            folders={folders}
            currentFolderId={currentFolderId}
            onNavigate={setCurrentFolderId}
            onMoveFolder={handleMoveFolder}
            onArchiveFolder={handleArchiveFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveExam={handleMoveExam}
            onUpdateExam={onUpdate}
            onDeleteExam={onDelete}
            onEditExam={(exam) => setEditingExam(exam)}
            onCopyLink={handleCopy}
            copiedId={copiedId}
            onRequestCreateFolder={(parentId) => setDialog({ kind: 'createFolder', parentId })}
            onRequestCreateExam={(parentId) => { setCreateTargetFolderId(parentId); setShowCreate(true); }}
            onRequestRenameFolder={(folder) => setDialog({ kind: 'renameFolder', folder })}
            onRequestDeleteFolder={(folder, childFolderCount, examCount) =>
              setDialog({ kind: 'deleteFolder', folder, childFolderCount, examCount })
            }
          />
        </div>
      </div>

      {/* ─── Dialogs ─── */}
      {dialog?.kind === 'createFolder' && (
        <CreateFolderDialog
          parentName={folders.find((f) => f.id === dialog.parentId)?.name ?? null}
          onClose={() => setDialog(null)}
          onCreate={(name, description, color) => handleCreateFolder(dialog.parentId, name, description, color)}
        />
      )}
      {dialog?.kind === 'renameFolder' && (
        <RenameFolderDialog
          folder={dialog.folder}
          onClose={() => setDialog(null)}
          onRename={(name) => handleRenameFolder(dialog.folder.id, name, dialog.folder.color)}
          onRecolor={(color) => handleRenameFolder(dialog.folder.id, dialog.folder.name, color)}
        />
      )}
      {dialog?.kind === 'deleteFolder' && (
        <DeleteFolderDialog
          folder={dialog.folder}
          childFolderCount={dialog.childFolderCount}
          examCount={dialog.examCount}
          onArchive={() => handleArchiveFolder(dialog.folder.id)}
          onDelete={() => handleDeleteFolder(dialog.folder.id)}
          onClose={() => setDialog(null)}
        />
      )}

      {showCreate && (
        <ExamFormModal
          onClose={() => setShowCreate(false)}
          onSave={(data) => { onCreate({ ...data, folderId: createTargetFolderId }); setShowCreate(false); toast(t('admin.toast.created'), 'success'); }}
        />
      )}
      {editingExam && (
        <ExamFormModal
          exam={editingExam}
          onClose={() => setEditingExam(null)}
          onSave={(data) => { onUpdate(editingExam.id, data); setEditingExam(null); toast(t('admin.toast.updated'), 'success'); }}
        />
      )}
      {showExcelImport && (
        <ExcelImportModal
          targetFolderId={currentFolderId}
          onClose={() => setShowExcelImport(false)}
          onImport={(imported) => { onBatchCreate(imported); toast(t('admin.toast.imported', { count: imported.length }), 'success'); }}
        />
      )}
    </div>
  );

  function renderTreeNodes(nodes: FolderNode[]): React.ReactNode {
    return nodes.map((node) => {
      const { folder, children } = node;
      const isOpen = expanded.has(folder.id);
      const matchesSearch = treeSearch.trim() === '' || filteredFlat.some(({ folder: f }) => f.id === folder.id);
      if (!matchesSearch) return null;
      return (
        <div key={folder.id}>
          <div
            className={`group flex items-center rounded-lg transition-all ${
              currentFolderId === folder.id ? 'bg-blue-50' : 'hover:bg-slate-50'
            }`}
          >
            <button
              onClick={() => toggleExpanded(folder.id)}
              className="shrink-0 p-1 text-slate-400 hover:text-slate-600"
            >
              {children.length > 0 ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="inline-block w-[14px]" />}
            </button>
            <button
              onClick={() => setCurrentFolderId(folder.id)}
              className={`flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-left text-sm transition-all ${
                currentFolderId === folder.id ? 'font-semibold text-blue-700' : 'text-slate-600'
              }`}
            >
              <span className="text-base leading-none">📁</span>
              <span className="truncate">{folder.name}</span>
            </button>
          </div>
          {isOpen && children.length > 0 && <div className="ml-4 border-l border-slate-100 pl-1">{renderTreeNodes(children)}</div>}
        </div>
      );
    });
  }
}

function isDescendant(folders: ExamFolder[], ancestorId: string, candidateId: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur = byId.get(candidateId);
  let guard = 0;
  while (cur && guard < 100) {
    if (cur.parentId === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    guard += 1;
  }
  return false;
}

// ─── Exam form modal (unchanged logic, + folderId passthrough) ──

interface ExamFormModalProps {
  exam?: Exam;
  onClose: () => void;
  onSave: (data: Omit<Exam, 'id' | 'createdAt'>) => void;
}

function ExamFormModal({ exam, onClose, onSave }: ExamFormModalProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(exam?.title ?? '');
  const [subject, setSubject] = useState(exam?.subject ?? 'Toán');
  const [grade, setGrade] = useState(exam?.grade ?? '');
  const [duration, setDuration] = useState(exam?.durationMinutes?.toString() ?? '15');
  const [deadline, setDeadline] = useState(exam?.deadline ? new Date(exam.deadline).toISOString().slice(0, 10) : '');
  const [deadlineTime, setDeadlineTime] = useState(
    exam?.deadline ? new Date(exam.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5) : '23:59'
  );
  const [useClassDeadlines, setUseClassDeadlines] = useState(
    !!exam && Object.keys(exam.classDeadlines ?? {}).length > 0
  );
  const [classDeadlines, setClassDeadlines] = useState<Record<string, { date: string; time: string }>>(
    () => {
      const init: Record<string, { date: string; time: string }> = {};
      Object.entries(exam?.classDeadlines ?? {}).forEach(([cls, iso]) => {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          init[cls] = {
            date: d.toISOString().slice(0, 10),
            time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5),
          };
        }
      });
      return init;
    }
  );
  const [formsUrl, setFormsUrl] = useState(exam?.formsUrl ?? '');
  const [status, setStatus] = useState<ExamStatus>(exam?.status ?? 'open');
  const [targetClasses, setTargetClasses] = useState<string[]>(exam?.targetClasses ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [subjectMode, setSubjectMode] = useState<'select' | 'input'>('select');
  const [newSubject, setNewSubject] = useState('');
  const [newClass, setNewClass] = useState('');
  const [showClassInput, setShowClassInput] = useState(false);

  useEffect(() => {
    loadSubjects().then(setSubjects);
    loadClasses().then(setClasses);
  }, []);

  const toggleClass = (cls: string) => {
    setTargetClasses((prev) => {
      if (cls === 'Tất cả') return ['Tất cả'];
      const withoutAll = prev.filter((c) => c !== 'Tất cả');
      if (withoutAll.includes(cls)) {
        // Removing a class also removes its per-class deadline override (no stale data)
        setClassDeadlines((cd) => {
          const next = { ...cd };
          delete next[cls];
          return next;
        });
        const next = withoutAll.filter((c) => c !== cls);
        return next;
      }
      // Adding a class pre-fills the default deadline so new classes inherit it
      setClassDeadlines((cd) => {
        if (cd[cls]) return cd;
        return { ...cd, [cls]: { date: deadline || '', time: deadlineTime || '23:59' } };
      });
      return [...withoutAll, cls];
    });
  };

  const handleAddSubject = async () => {
    const trimmed = newSubject.trim();
    if (!trimmed) return;
    const updated = await addSubject(trimmed);
    setSubjects(updated);
    setSubject(trimmed);
    setNewSubject('');
    setSubjectMode('select');
    toast(t('admin.toast.subjectAdded', { name: trimmed }), 'success');
  };

  const handleRemoveSubject = async (s: string) => {
    const updated = await removeSubject(s);
    setSubjects(updated);
    if (subject === s && updated.length > 0) setSubject(updated[0]);
    toast(t('admin.toast.subjectRemoved', { name: s }), 'info');
  };

  const handleAddClass = async () => {
    const trimmed = newClass.trim();
    if (!trimmed) return;
    const updated = await addClass(trimmed);
    setClasses(updated);
    setTargetClasses((prev) => prev.includes('Tất cả') ? [trimmed] : [...prev, trimmed]);
    setNewClass('');
    setShowClassInput(false);
    toast(t('admin.toast.classAdded', { name: trimmed }), 'success');
  };

  const handleRemoveClass = async (cls: string) => {
    const updated = await removeClass(cls);
    setClasses(updated);
    setTargetClasses((prev) => prev.filter((c) => c !== cls));
    setClassDeadlines((cd) => {
      const next = { ...cd };
      delete next[cls];
      return next;
    });
    toast(t('admin.toast.classRemoved', { name: cls }), 'info');
  };

  const composeDeadlineISO = (date: string, time: string): string | null => {
    if (!date) return null;
    const timePart = /^\d{2}:\d{2}$/.test(time) ? time : '23:59';
    const d = new Date(`${date}T${timePart}:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = t('admin.validation.title');
    if (!subject.trim()) newErrors.subject = t('admin.validation.subject');
    if (!formsUrl.trim()) newErrors.formsUrl = t('admin.validation.formsUrl');
    if (!deadline) {
      newErrors.deadline = t('admin.validation.deadline');
    } else if (!composeDeadlineISO(deadline, deadlineTime)) {
      newErrors.deadline = t('admin.validation.invalidDate');
    }
    if (!duration || parseInt(duration) <= 0) newErrors.duration = t('admin.validation.duration');

    const finalClassDeadlines: Record<string, string> = {};
    if (useClassDeadlines) {
      for (const cls of targetClasses) {
        if (cls === 'Tất cả') continue;
        const entry = classDeadlines[cls];
        if (!entry) continue;
        if (!entry.date) { newErrors[`classDeadline_${cls}`] = t('admin.validation.classDateMissing'); continue; }
        const iso = composeDeadlineISO(entry.date, entry.time);
        if (!iso) { newErrors[`classDeadline_${cls}`] = t('admin.validation.invalidDate'); continue; }
        finalClassDeadlines[cls] = iso;
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    onSave({
      title: title.trim(), subject: subject.trim(), grade: grade.trim(),
      durationMinutes: parseInt(duration), deadline: new Date(`${deadline}T${/^\d{2}:\d{2}$/.test(deadlineTime) ? deadlineTime : '23:59'}:00`).toISOString(),
      formsUrl: formsUrl.trim(), status, targetClasses,
      classDeadlines: finalClassDeadlines,
      folderId: exam?.folderId ?? null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{exam ? t('admin.formTitle.edit') : t('admin.formTitle.create')}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.examTitle')}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('admin.form.titlePlaceholder')}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.title ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.subject')}</label>
              {subjectMode === 'select' ? (
                <div className="relative">
                  <select value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-9 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                    {subjects.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <button onClick={() => setSubjectMode('input')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-blue-500 hover:bg-blue-50" title={t('admin.form.addSubject')}>
                    <PlusCircle size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input type="text" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddSubject()}
                    placeholder={t('admin.form.subjectPlaceholder')} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" autoFocus />
                  <button onClick={handleAddSubject} className="rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700"><Check size={18} /></button>
                  <button onClick={() => { setSubjectMode('select'); setNewSubject(''); }} className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
                </div>
              )}
              {errors.subject && <p className="mt-1 text-xs text-red-500">{errors.subject}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.gradeLevel')}</label>
              <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="VD: 12"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {subjects.length > 0 && subjectMode === 'select' && (
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((s) => (
                <span key={s} className="group inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {s}
                  <button onClick={() => handleRemoveSubject(s)} className="text-slate-300 hover:text-red-500"><XCircle size={11} /></button>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.duration')}</label>
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="15" min={1}
                className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.duration ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
              {errors.duration && <p className="mt-1 text-xs text-red-500">{errors.duration}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.defaultDeadline')}</label>
              <div className="flex gap-2">
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                  className={`w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.deadline ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
                <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)}
                  className={`w-28 shrink-0 rounded-xl border bg-white px-2 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.deadline ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
              </div>
              {errors.deadline && <p className="mt-1 text-xs text-red-500">{errors.deadline}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.classes')}</label>
            <p className="mb-2 text-xs text-slate-400">{t('schedule.classesHintExam')}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => toggleClass('Tất cả')}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${targetClasses.includes('Tất cả') ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {t('common.allClasses')}
              </button>
              {classes.map((cls) => (
                <div key={cls} className="relative group">
                  <button onClick={() => toggleClass(cls)}
                    className={`rounded-lg px-3 py-2 pr-7 text-xs font-medium transition-all ${targetClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {cls}
                  </button>
                  <button onClick={() => handleRemoveClass(cls)} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500" title={t('admin.form.removeClass')}>
                    <XCircle size={12} />
                  </button>
                </div>
              ))}
            </div>
            {showClassInput ? (
              <div className="mt-2 flex gap-1.5">
                <input type="text" value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                  placeholder={t('admin.form.classPlaceholder')} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" autoFocus />
                <button onClick={handleAddClass} className="rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700"><Check size={18} /></button>
                <button onClick={() => { setShowClassInput(false); setNewClass(''); }} className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
              </div>
            ) : (
              <button onClick={() => setShowClassInput(true)} className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50">
                <PlusCircle size={14} /> {t('admin.form.addClass')}
              </button>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useClassDeadlines}
                onChange={(e) => setUseClassDeadlines(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">{t('admin.form.perClassDeadlines')}</span>
            </label>
            {useClassDeadlines && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-2 text-xs text-slate-400">{t('admin.form.perClassHint')}</p>
                {targetClasses.filter((c) => c !== 'Tất cả').length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">{t('schedule.perClassEmpty')}</p>
                ) : (
                  <div className="space-y-2">
                    {targetClasses.filter((c) => c !== 'Tất cả').map((cls) => (
                      <div key={cls}>
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-600" title={cls}>{cls}</span>
                          <input
                            type="date"
                            value={classDeadlines[cls]?.date ?? ''}
                            onChange={(e) => setClassDeadlines((cd) => ({ ...cd, [cls]: { date: e.target.value, time: cd[cls]?.time ?? (deadlineTime || '23:59') } }))}
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-blue-400"
                          />
                          <input
                            type="time"
                            value={classDeadlines[cls]?.time ?? (deadlineTime || '23:59')}
                            onChange={(e) => setClassDeadlines((cd) => ({ ...cd, [cls]: { date: (cd[cls]?.date ?? deadline) || '', time: e.target.value } }))}
                            className="w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-blue-400"
                          />
                        </div>
                        {errors[`classDeadline_${cls}`] && <p className="mt-1 text-xs text-red-500">{errors[`classDeadline_${cls}`]}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.status')}</label>
            <div className="flex gap-2">
              {([{ v: 'open', l: t('status.open') }, { v: 'upcoming', l: t('status.upcoming') }, { v: 'closed', l: t('status.closed') }] as { v: ExamStatus; l: string }[]).map((opt) => (
                <button key={opt.v} onClick={() => setStatus(opt.v)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${status === opt.v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.form.formsUrl')}</label>
            <input type="url" value={formsUrl} onChange={(e) => setFormsUrl(e.target.value)} placeholder="https://forms.office.com/..."
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.formsUrl ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.formsUrl && <p className="mt-1 text-xs text-red-500">{errors.formsUrl}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700">{exam ? t('common.saveChanges') : t('admin.createBtn')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
