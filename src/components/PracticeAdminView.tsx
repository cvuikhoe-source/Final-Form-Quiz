import { useState, useEffect, useMemo, useCallback } from 'react';
import type { User, Practice, PracticeCategory, Lesson, PracticeStatus, PracticeQuestionType, PracticeDifficulty, PracticeFolder, FolderColor } from '@/types';
import {
  loadPractices, upsertPractices, updatePractice, deletePractice,
  getPracticeQuestionsAdmin, upsertPracticeQuestions, deletePracticeQuestionsByIds,
  loadLessons, uploadListeningAudio, generateId,
  loadPracticeFolders, createPracticeFolder, updatePracticeFolder, deletePracticeFolder,
  movePracticeToFolder, getPracticeQuestionCounts,
} from '@/storage';
import { CreateFolderDialog, RenameFolderDialog, DeleteFolderDialog } from '@/components/FolderDialogs';
import { useLanguage } from '@/context/LanguageContext';
import { buildFolderTree } from '@/lib/folderTree';
import { AIPanel } from '@/components/AIPanel';
import { AutoTextarea } from '@/components/AutoTextarea';
import type { AIQuestionProposal, AIFieldProposal } from '@/lib/aiService';
import { PracticeExplorer } from '@/components/PracticeExplorer';
import { PracticeImportModal } from '@/components/PracticeImportModal';
import { PracticeRunner } from '@/components/PracticeView';
import { toast } from '@/components/Toast';
import {
  Plus, Search, X, Check, Languages, BookOpen, FileText,
  Headphones, Upload, ChevronDown, FileSpreadsheet,
  FolderPlus, Archive,
} from 'lucide-react';

const CATEGORIES: { key: PracticeCategory; labelKey: 'practice.cat.vocab.label' | 'practice.cat.grammar.label' | 'practice.cat.reading.label' | 'practice.cat.listening.label'; icon: typeof Languages }[] = [
  { key: 'vocabulary', labelKey: 'practice.cat.vocab.label', icon: Languages },
  { key: 'grammar', labelKey: 'practice.cat.grammar.label', icon: BookOpen },
  { key: 'reading', labelKey: 'practice.cat.reading.label', icon: FileText },
  { key: 'listening', labelKey: 'practice.cat.listening.label', icon: Headphones },
];

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const STATUSES: { key: PracticeStatus; labelKey: 'padmin.status.DRAFT' | 'padmin.status.PUBLISHED' | 'padmin.status.ARCHIVED' }[] = [
  { key: 'DRAFT', labelKey: 'padmin.status.DRAFT' },
  { key: 'PUBLISHED', labelKey: 'padmin.status.PUBLISHED' },
  { key: 'ARCHIVED', labelKey: 'padmin.status.ARCHIVED' },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const QUESTION_TYPES: { key: PracticeQuestionType; labelKey: 'padmin.qType.single' | 'padmin.qType.multiple' | 'padmin.qType.trueFalse' | 'padmin.qType.short' }[] = [
  { key: 'single_choice', labelKey: 'padmin.qType.single' },
  { key: 'multiple_choice', labelKey: 'padmin.qType.multiple' },
  { key: 'true_false', labelKey: 'padmin.qType.trueFalse' },
  { key: 'short_answer', labelKey: 'padmin.qType.short' },
];

const DIFFICULTIES: { key: PracticeDifficulty; labelKey: 'padmin.level.easy' | 'padmin.level.medium' | 'padmin.level.hard' }[] = [
  { key: 'easy', labelKey: 'padmin.level.easy' },
  { key: 'medium', labelKey: 'padmin.level.medium' },
  { key: 'hard', labelKey: 'padmin.level.hard' },
];

interface EditorQuestion {
  id: string;
  questionType: PracticeQuestionType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  difficulty: PracticeDifficulty;
  questionCategory: string;
  tags: string;
  imageUrl: string;
  points: number;
}

function emptyQuestion(): EditorQuestion {
  return {
    id: generateId('pq'), questionType: 'single_choice', questionText: '',
    optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A',
    explanation: '', hint: '', difficulty: 'medium', questionCategory: '',
    tags: '', imageUrl: '', points: 1,
  };
}

export function PracticeAdminView({ user }: { user: User }) {
  const { t } = useLanguage();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [folders, setFolders] = useState<PracticeFolder[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Practice | null>(null);
  const [previewing, setPreviewing] = useState<Practice | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTargetFolderId, setCreateTargetFolderId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showArchivedFolders, setShowArchivedFolders] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState('');
  const [dialog, setDialog] = useState<
    | { kind: 'createFolder'; parentId: string | null }
    | { kind: 'renameFolder'; folder: PracticeFolder }
    | { kind: 'deleteFolder'; folder: PracticeFolder; childFolderCount: number; practiceCount: number }
    | null
  >(null);

  const reload = useCallback(async () => {
    const [ps, ls, fs, qc] = await Promise.all([
      loadPractices(), loadLessons(), loadPracticeFolders(true), getPracticeQuestionCounts(),
    ]);
    setPractices(ps);
    setLessons(ls);
    setFolders(fs);
    setQuestionCounts(qc);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const reloadPractices = useCallback(async () => {
    const [ps, qc] = await Promise.all([loadPractices(), getPracticeQuestionCounts()]);
    setPractices(ps);
    setQuestionCounts(qc);
  }, []);

  // ─── Folder operations ──────────────────────────────────
  const handleCreateFolder = async (parentId: string | null, name: string, description: string, color: FolderColor) => {
    const folder = await createPracticeFolder({
      parentId, name, description, color,
      sortOrder: Date.now() % 100000, createdBy: user.id,
    });
    setFolders((prev) => [...prev, folder]);
    setExpanded((prev) => (parentId ? new Set(prev).add(parentId) : prev));
    setDialog(null);
    toast(t('padmin.toast.folderCreated', { name }), 'success');
  };

  const handleRenameFolder = async (id: string, name: string, color: FolderColor | null) => {
    await updatePracticeFolder(id, { name, color });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name, color } : f)));
    setDialog(null);
    toast(t('padmin.toast.folderRenamed'), 'success');
  };

  const handleMoveFolder = async (id: string, newParentId: string | null) => {
    const moving = folders.find((f) => f.id === id);
    if (moving?.parentId === newParentId) return;
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
        toast(t('padmin.toast.folderMoveInvalid'), 'error');
        return;
      }
    }
    await updatePracticeFolder(id, { parentId: newParentId });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, parentId: newParentId } : f)));
    if (newParentId) setExpanded((prev) => new Set(prev).add(newParentId));
    toast(t('padmin.toast.folderMoved'), 'success');
  };

  const handleArchiveFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    const archiving = folder && !folder.archivedAt;
    const ts = archiving ? new Date().toISOString() : null;
    await updatePracticeFolder(id, { archivedAt: ts });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, archivedAt: ts } : f)));
    if (archiving && currentFolderId && isDescendant(folders, id, currentFolderId)) setCurrentFolderId(null);
    toast(archiving ? t('padmin.toast.folderArchived') : t('padmin.toast.folderUnarchived'), 'info');
  };

  const handleDeleteFolder = async (id: string) => {
    await deletePracticeFolder(id);
    // Practices inside fall back to Trang chủ (DB sets folder_id = NULL via ON DELETE SET NULL)
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
    setPractices((prev) => prev.map((p) => (p.folderId && removed.has(p.folderId) ? { ...p, folderId: null } : p)));
    if (currentFolderId && removed.has(currentFolderId)) setCurrentFolderId(null);
    setDialog(null);
    toast(t('padmin.toast.folderDeleted'), 'info');
  };

  const handleMovePractice = async (practiceId: string, folderId: string | null) => {
    await movePracticeToFolder(practiceId, folderId);
    setPractices((prev) => prev.map((p) => (p.id === practiceId ? { ...p, folderId } : p)));
    toast(t('padmin.toast.moved'), 'success');
  };

  const handleArchivePractice = async (practice: Practice) => {
    const archiving = !practice.archivedAt;
    const ts = archiving ? new Date().toISOString() : null;
    await updatePractice(practice.id, { archivedAt: ts });
    setPractices((prev) => prev.map((p) => (p.id === practice.id ? { ...p, archivedAt: ts } : p)));
    toast(archiving ? t('padmin.toast.archived') : t('padmin.toast.unarchived'), 'info');
  };

  const handleDeletePractice = async (practice: Practice) => {
    if (!window.confirm(t('padmin.confirm.delete', { title: practice.title }))) return;
    await deletePractice(practice.id);
    setPractices((prev) => prev.filter((p) => p.id !== practice.id));
    toast(t('padmin.toast.deleted'), 'success');
  };

  const handleDuplicatePractice = async (practice: Practice) => {
    const id = generateId('practice');
    const copy: Practice = {
      ...practice,
      id,
      title: `${practice.title} ${t('padmin.copySuffix')}`,
      status: 'DRAFT',
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };
    await upsertPractices([copy]);
    const qs = await getPracticeQuestionsAdmin(practice.id);
    if (qs.length > 0) {
      await upsertPracticeQuestions(qs.map((q) => ({ ...q, id: generateId('pq'), practiceId: id })));
    }
    setPractices((prev) => [...prev, copy]);
    toast(t('padmin.toast.duplicated'), 'success');
  };

  const handlePublishPractice = async (practice: Practice, publish: boolean) => {
    if (publish && (questionCounts.get(practice.id) ?? 0) === 0) {
      toast(t('padmin.toast.publishNoQuestions'), 'error');
      return;
    }
    const nextStatus = publish ? 'PUBLISHED' : 'DRAFT';
    try {
      await updatePractice(practice.id, { status: nextStatus });
      setPractices((prev) => prev.map((p) => (p.id === practice.id ? { ...p, status: nextStatus } : p)));
      toast(publish
        ? t('padmin.toast.published')
        : t('padmin.toast.unpublished'),
      'success');
    } catch {
      toast(t('padmin.toast.statusFailed'), 'error');
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Tree helpers ──────────────────────────────────────
  const tree = useMemo(() => buildFolderTree(folders.filter((f) => !f.archivedAt)), [folders]);

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;
  const totalPracticeCount = practices.length;
  const archivedCount = folders.filter((f) => f.archivedAt).length + practices.filter((p) => p.archivedAt).length;

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">{t('common.loading')}</div>;
  }

  if (previewing) {
    return (
      <PracticeRunner
        user={user}
        practice={previewing}
        loadQuestions={getPracticeQuestionsAdmin}
        onBack={() => { setPreviewing(null); reload(); }}
        onFinished={() => {}}
      />
    );
  }

  if (editing || creating) {
    return (
      <PracticeEditor
        user={user}
        practice={editing}
        lessons={lessons}
        defaultFolderId={creating ? createTargetFolderId : (editing?.folderId ?? null)}
        onDone={() => { setEditing(null); setCreating(false); reload(); }}
      />
    );
  }

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">{t('padmin.title')}</h2>
        <p className="text-sm text-slate-500">{t('padmin.countTotal', { count: totalPracticeCount })}</p>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setDialog({ kind: 'createFolder', parentId: currentFolderId })}
          className="flex items-center gap-1.5 rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-all active:scale-[0.98] hover:bg-blue-100"
        >
          <FolderPlus size={18} />
          {t('padmin.newFolder')}
        </button>
        <button
          onClick={() => { setCreateTargetFolderId(currentFolderId); setCreating(true); }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-blue-700"
        >
          <Plus size={18} />
          {t('padmin.practiceBtn')}
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100"
        >
          <FileSpreadsheet size={18} />
          {t('padmin.importExcel')}
        </button>
        <button
          onClick={() => setShowArchivedFolders((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all ${
            showArchivedFolders ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
          title={t('padmin.viewArchived')}
        >
          <Archive size={16} />
          {t('padmin.archive', { count: archivedCount > 0 ? ` (${archivedCount})` : '' })}
        </button>
      </div>

      <div className="flex gap-4">
        {/* ─── Tree sidebar (desktop) ─── */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('padmin.foldersLabel')}</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder={t('padmin.filterTreePlaceholder')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={() => setCurrentFolderId(null)}
              className={`flex w-full items-center gap-2 rounded-lg py-2 px-2 text-left text-sm font-medium transition-all ${
                currentFolderId === null ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>🏠</span> {t('common.home')}
              <span className="ml-auto text-xs text-slate-400">
                {practices.filter((p) => !p.folderId).length}
              </span>
            </button>
            <div className="mt-1 max-h-[60vh] space-y-0.5 overflow-y-auto">
              {renderTreeNodes(tree)}
            </div>
          </div>
        </aside>

        {/* ─── Explorer main area ─── */}
        <div className="min-w-0 flex-1">
          <PracticeExplorer
            user={user}
            practices={practices}
            folders={folders}
            questionCounts={questionCounts}
            currentFolderId={currentFolderId}
            showArchived={showArchivedFolders}
            onToggleShowArchived={() => setShowArchivedFolders((v) => !v)}
            onNavigate={setCurrentFolderId}
            onMoveFolder={handleMoveFolder}
            onArchiveFolder={handleArchiveFolder}
            onDeleteFolder={handleDeleteFolder}
            onMovePractice={handleMovePractice}
            onEditPractice={(p) => setEditing(p)}
            onOpenPractice={(p) => setPreviewing(p)}
            onPublishPractice={handlePublishPractice}
            onDuplicatePractice={handleDuplicatePractice}
            onArchivePractice={handleArchivePractice}
            onDeletePractice={handleDeletePractice}
            onRequestCreateFolder={(parentId) => setDialog({ kind: 'createFolder', parentId })}
            onRequestCreatePractice={(parentId) => { setCreateTargetFolderId(parentId); setCreating(true); }}
            onRequestRenameFolder={(folder) => setDialog({ kind: 'renameFolder', folder })}
            onRequestDeleteFolder={(folder, childFolderCount, practiceCount) =>
              setDialog({ kind: 'deleteFolder', folder, childFolderCount, practiceCount })
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
          examCount={dialog.practiceCount}
          onArchive={() => handleArchiveFolder(dialog.folder.id)}
          onDelete={() => handleDeleteFolder(dialog.folder.id)}
          onClose={() => setDialog(null)}
        />
      )}

      {showImport && (
        <PracticeImportModal
          mode="create"
          targetFolderId={currentFolderId}
          targetFolderName={currentFolder?.name ?? null}
          onClose={() => setShowImport(false)}
          onImport={() => { reloadPractices(); }}
        />
      )}
    </div>
  );

  function renderTreeNodes(nodes: ReturnType<typeof buildFolderTree>): React.ReactNode {
    return nodes.map((node) => {
      const { folder, children } = node;
      const isOpen = expanded.has(folder.id);
      const matchesSearch = treeSearch.trim() === '' || folder.name.toLowerCase().includes(treeSearch.trim().toLowerCase());
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
              {children.length > 0 ? (isOpen ? <ChevronDown size={14} /> : <Plus size={14} className="rotate-45" />) : <span className="inline-block w-[14px]" />}
            </button>
            <button
              onClick={() => setCurrentFolderId(folder.id)}
              className={`flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-left text-sm transition-all ${
                currentFolderId === folder.id ? 'font-semibold text-blue-700' : 'text-slate-600'
              }`}
            >
              <span className="text-base leading-none">📁</span>
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-xs text-slate-400">
                {practices.filter((p) => p.folderId === folder.id).length}
              </span>
            </button>
          </div>
          {isOpen && children.length > 0 && <div className="ml-4 border-l border-slate-100 pl-1">{renderTreeNodes(children)}</div>}
        </div>
      );
    });
  }
}

function isDescendant(folders: PracticeFolder[], ancestorId: string, candidateId: string): boolean {
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

// ─── Editor: create / edit a practice ──────────────────────────

function PracticeEditor({ user, practice, lessons, defaultFolderId, onDone }: {
  user: User;
  practice: Practice | null;
  lessons: Lesson[];
  defaultFolderId: string | null;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(practice?.title ?? '');
  const [category, setCategory] = useState<PracticeCategory>(practice?.category ?? 'vocabulary');
  const [level, setLevel] = useState(practice?.level ?? 'N5');
  const [linkedLessonId, setLinkedLessonId] = useState(practice?.linkedLessonId ?? '');
  const [passage, setPassage] = useState(practice?.passage ?? '');
  const [audioSourceType, setAudioSourceType] = useState<'UPLOAD' | 'URL'>(practice?.audioSourceType ?? 'URL');
  const [audioUrlInput, setAudioUrlInput] = useState(practice?.audioSourceType === 'URL' ? practice?.audioSource ?? '' : '');
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioFileName, setAudioFileName] = useState(practice?.audioFileName ?? '');
  const [audioSource, setAudioSource] = useState(practice?.audioSource ?? '');
  const [targetClasses] = useState<string[]>(practice?.targetClasses ?? []);
  const [startAt, setStartAt] = useState(practice?.startAt?.slice(0, 10) ?? '');
  const [startTime, setStartTime] = useState(practice?.startAt ? practice.startAt.slice(11, 16) : '');
  const [deadline, setDeadline] = useState(practice?.deadline?.slice(0, 10) ?? '');
  const [deadlineTime, setDeadlineTime] = useState(practice?.deadline ? practice.deadline.slice(11, 16) : '');
  const [classSchedules, setClassSchedules] = useState<Record<string, { date: string; time: string; dDate: string; dTime: string }>>(() => {
    const out: Record<string, { date: string; time: string; dDate: string; dTime: string }> = {};
    Object.entries(practice?.classSchedules ?? {}).forEach(([cls, ov]) => {
      out[cls] = {
        date: ov.startAt?.slice(0, 10) ?? '', time: ov.startAt ? ov.startAt.slice(11, 16) : '',
        dDate: ov.deadline?.slice(0, 10) ?? '', dTime: ov.deadline ? ov.deadline.slice(11, 16) : '',
      };
    });
    return out;
  });
  const [showClassSchedules, setShowClassSchedules] = useState(Object.keys(practice?.classSchedules ?? {}).length > 0);
  const [allowAiTutor, setAllowAiTutor] = useState(practice?.allowAiTutor ?? true);
  const [status, setStatus] = useState<PracticeStatus>(practice?.status ?? 'DRAFT');
  const [questions, setQuestions] = useState<EditorQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ stage: string; operation: string; status: number | string; code: string; message: string; details: string; hint: string; entity: string; payloadKeys: string[]; traceId: string } | null>(null);
  const [classesList, setClassesList] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiFocusQuestion, setAiFocusQuestion] = useState<number | null>(null);

  useEffect(() => {
    import('@/storage').then((m) => m.loadClasses().then(setClassesList));
  }, []);

  useEffect(() => {
    if (practice) {
      getPracticeQuestionsAdmin(practice.id).then((qs) => {
        if (qs.length > 0) {
          setQuestions(qs.map((q) => ({
            id: q.id, questionType: q.questionType, questionText: q.questionText,
            optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
            correctAnswer: q.correctAnswer, explanation: q.explanation, hint: q.hint,
            difficulty: q.difficulty, questionCategory: q.questionCategory, tags: q.tags,
            imageUrl: q.imageUrl, points: q.points,
          })));
        }
      });
    }
  }, [practice]);

  const allClasses = useMemo(() => {
    const set = new Set(classesList);
    targetClasses.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [classesList, targetClasses]);

  const composeISO = (date: string, time: string): string | null => {
    if (!date) return null;
    return new Date(`${date}T${time || '00:00'}:00`).toISOString();
  };

  const handleUploadAudio = async (file: File) => {
    setAudioUploading(true);
    try {
      const res = await uploadListeningAudio(file);
      setAudioSource(res.publicUrl);
      setAudioFileName(file.name);
      toast(t('padmin.toast.audioUploaded'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('padmin.toast.uploadFailed'), 'error');
    } finally {
      setAudioUploading(false);
    }
  };

  const isLetterType = (q: EditorQuestion) => q.questionType !== 'short_answer';

  const handleApplyAIProposals = (proposals: AIQuestionProposal[]) => {
    setQuestions((prev) => {
      const blank = prev.filter((q) => !q.questionText.trim() && !q.explanation.trim());
      const keep = prev.filter((q) => !blank.some((b) => b.id === q.id));
      const added = proposals.map((p) => ({
        ...emptyQuestion(),
        questionType: p.questionType,
        questionText: p.questionText,
        optionA: p.optionA,
        optionB: p.optionB,
        optionC: p.optionC,
        optionD: p.optionD,
        correctAnswer: p.correctAnswer,
        explanation: p.explanation,
        hint: p.hint,
        difficulty: p.difficulty,
        questionCategory: p.questionCategory,
        tags: p.tags,
        imageUrl: p.imageUrl,
        points: p.points,
      }));
      return [...keep, ...added];
    });
    toast(t('padmin.toast.aiAdded', { count: proposals.length }), 'success');
  };

  const handleApplyAIFields = (proposals: AIFieldProposal[]) => {
    setQuestions((prev) => prev.map((q) => {
      const match = proposals.find((p) => p.questionNo === prev.indexOf(q) + 1);
      if (!match) return q;
      return {
        ...q,
        explanation: match.explanation !== null ? match.explanation : q.explanation,
        hint: match.hint !== null ? match.hint : q.hint,
      };
    }));
    toast(t('padmin.toast.aiApplied'), 'success');
  };

  const handleSave = async () => {
    const traceId = `practice-save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isDev = import.meta.env.DEV;
    const log = (stage: string) => { console.log(`[PracticeSave] ${traceId} ${stage}`); };
    setSaveError(null);
    setSaving(true);
    const fail = (stage: string, e: unknown) => {
      const anyErr = e as { code?: string; details?: string; hint?: string; message?: string; status?: number };
      const info = {
        stage,
        operation: 'practice.save',
        status: typeof anyErr?.status === 'number' ? anyErr.status : '',
        code: typeof anyErr?.code === 'string' ? anyErr.code : '',
        message: typeof anyErr?.message === 'string' ? anyErr.message : String(e),
        details: typeof anyErr?.details === 'string' ? anyErr.details : '',
        hint: typeof anyErr?.hint === 'string' ? anyErr.hint : '',
        entity: 'practices / practice_questions',
        payloadKeys: ['id', 'title', 'category', 'level', 'status', 'targetClasses', 'classSchedules', 'startAt', 'deadline'],
        traceId,
      };
      if (isDev) console.error(`[PracticeSave] ${traceId} FAILED at ${stage}`, { code: info.code, message: info.message, details: info.details, hint: info.hint });
      setSaveError(info);
      const detail = info.message ? ` (${stage}: ${info.message})` : ` (${stage})`;
      toast(t('padmin.toast.saveFailed', { detail }), 'error');
    };
    try {
      log('button clicked');
      if (!title.trim()) { toast(t('padmin.toast.needTitle'), 'error'); return; }
      if (questions.some((q) => !q.questionText.trim())) {
        toast(t('padmin.toast.needQuestionContent'), 'error'); return;
      }
      if (questions.some((q) => isLetterType(q) && (!q.optionA.trim() || !q.optionB.trim()))) {
        toast(t('padmin.toast.needAB'), 'error'); return;
      }
      if (questions.some((q) => isLetterType(q) && !q.correctAnswer.trim())) {
        toast(t('padmin.toast.needCorrect'), 'error'); return;
      }
      if (questions.some((q) => q.questionType === 'short_answer' && !q.correctAnswer.trim())) {
        toast(t('padmin.toast.needShortAnswer'), 'error'); return;
      }
      log('validation passed');
      const id = practice?.id ?? generateId('practice');
      const p: Practice = {
        id,
        title: title.trim(),
        category,
        level,
        linkedLessonId: linkedLessonId || null,
        passage: category === 'reading' ? passage : '',
        audioSourceType,
        audioSource: category === 'listening' ? (audioSourceType === 'URL' ? audioUrlInput.trim() : audioSource) : '',
        audioFileName: category === 'listening' ? audioFileName : '',
        teacherName: practice?.teacherName ?? user.fullName,
        targetClasses,
        startAt: composeISO(startAt, startTime),
        deadline: composeISO(deadline, deadlineTime),
        classSchedules: Object.fromEntries(
          Object.entries(classSchedules)
            .map(([cls, e]): [string, { startAt: string | null; deadline: string | null }] => [cls, { startAt: composeISO(e.date, e.time), deadline: composeISO(e.dDate, e.dTime) }])
            .filter(([, ov]) => ov.startAt || ov.deadline)
        ),
        allowAiTutor,
        status,
        sortOrder: practice?.sortOrder ?? Date.now() % 100000,
        folderId: practice?.folderId ?? defaultFolderId,
        archivedAt: practice?.archivedAt ?? null,
        createdAt: practice?.createdAt ?? new Date().toISOString(),
      };
      const mappedQuestions = questions.map((q, i) => ({
        id: q.id, practiceId: id, questionNo: i + 1, questionType: q.questionType,
        questionText: q.questionText.trim(),
        optionA: q.optionA.trim(), optionB: q.optionB.trim(), optionC: q.optionC.trim(),
        optionD: q.optionD.trim(), correctAnswer: q.correctAnswer.trim().toUpperCase(),
        explanation: q.explanation.trim(), hint: q.hint.trim(), difficulty: q.difficulty,
        questionCategory: q.questionCategory.trim(), tags: q.tags.trim(),
        imageUrl: q.imageUrl.trim(), points: q.points,
      }));
      log('practice payload built');

      // Order matters: the DB refuses a PUBLISHED practice with 0 questions, so
      // questions must exist BEFORE the practice row carries status = 'PUBLISHED'.
      // New practices are created as DRAFT first, then flipped to the chosen status.
      if (!practice) {
        log('practice insert started (CREATE_PRACTICE)');
        await upsertPractices([{ ...p, status: 'DRAFT' }]);
        log('practice insert completed');
      }
      log('questions insert started (SAVE_QUESTIONS)');
      await upsertPracticeQuestions(mappedQuestions);
      log('questions insert completed');
      if (!practice && status !== 'DRAFT') {
        await updatePractice(id, { status });
      }

      // Questions removed in the editor must also be removed from the DB
      const existingIds = new Set((await getPracticeQuestionsAdmin(id)).map((q) => q.id));
      const keptIds = new Set(mappedQuestions.map((q) => q.id));
      const removedIds = [...existingIds].filter((qid) => !keptIds.has(qid));
      if (removedIds.length > 0) {
        await deletePracticeQuestionsByIds(removedIds);
      }

      // Verify against the database before declaring success
      log('verification started (VERIFY_DATABASE)');
      const savedCount = (await getPracticeQuestionsAdmin(id)).length;
      if (savedCount !== mappedQuestions.length) {
        throw new Error(t('padmin.toast.verifyFailed', { expected: mappedQuestions.length, actual: savedCount }));
      }
      log('verification completed');
      log('refetch UI (REFETCH_UI)');

      toast(practice ? t('padmin.toast.saved') : t('padmin.toast.created'), 'success');
      onDone();
    } catch (err) {
      fail('SAVE_FLOW', err);
    } finally {
      setSaving(false);
    }
  };

  const setQuestion = (qid: string, patch: Partial<EditorQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const labelCls = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onDone} disabled={saving}
        className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:hover:text-slate-500">
        <X size={16} /> {t('common.cancel')}
      </button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-800">{practice ? t('padmin.editTitle') : t('padmin.createTitle')}</h2>
        <button onClick={() => {
          if (!user.password) {
            toast('Chức năng Trợ lý AI đang được nâng cấp xác thực Supabase Auth và sẽ sớm khả dụng cho tài khoản của bạn.', 'info');
            return;
          }
          setAiFocusQuestion(null);
          setShowAI(true);
        }}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md transition-all hover:opacity-90 active:scale-[0.98]">
          {t('padmin.askAi')}
        </button>
      </div>

      {!practice && (
        <button onClick={() => setShowImport(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100 active:scale-[0.98]">
          <FileSpreadsheet size={18} /> {t('padmin.importQuestions')}
        </button>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelCls}>{t('padmin.form.name')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('padmin.form.namePlaceholder')} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>{t('padmin.form.type')}</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${category === c.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  <Icon size={14} /> {t(c.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('padmin.form.level')}</label>
            <select value={level} onChange={(e) => setLevel(e.target.value as Practice['level'])} className={inputCls}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('padmin.form.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PracticeStatus)} className={inputCls}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('padmin.form.linkedLesson')}</label>
          <select value={linkedLessonId} onChange={(e) => setLinkedLessonId(e.target.value)} className={inputCls}>
            <option value="">{t('padmin.form.noLink')}</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>

        {/* Reading passage */}
        {category === 'reading' && (
          <div>
            <label className={labelCls}>{t('padmin.form.passage')}</label>
            <AutoTextarea value={passage} onChange={setPassage} placeholder={t('padmin.form.passagePlaceholder')} relaxed />
          </div>
        )}

        {/* Audio */}
        {category === 'listening' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className={labelCls}>{t('practice.audioLabel')}</label>
            <div className="mb-2 flex gap-2">
              <button onClick={() => setAudioSourceType('URL')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${audioSourceType === 'URL' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{t('padmin.form.urlAudio')}</button>
              <button onClick={() => setAudioSourceType('UPLOAD')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${audioSourceType === 'UPLOAD' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{t('padmin.form.uploadMp3')}</button>
            </div>
            {audioSourceType === 'URL' ? (
              <input value={audioUrlInput} onChange={(e) => setAudioUrlInput(e.target.value)} placeholder="https://..." className={inputCls} />
            ) : (
              <div>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-3 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50">
                  <Upload size={14} /> {audioUploading ? t('common.uploading') : audioFileName || t('padmin.form.chooseMp3')}
                  <input type="file" accept="audio/mpeg,.mp3" className="hidden" disabled={audioUploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAudio(f); }} />
                </label>
                {audioSource && audioFileName && <p className="mt-1 text-[10px] text-emerald-600">✓ {audioFileName}</p>}
              </div>
            )}
          </div>
        )}

        {/* Schedule */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">

          {/* AI Tutor permission */}
          <label className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-700">{t('padmin.form.aiToggle')}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{t('padmin.form.aiHint')}</span>
            </span>
            <button
              type="button"
              onClick={() => setAllowAiTutor((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${allowAiTutor ? 'bg-blue-600' : 'bg-slate-300'}`}
              aria-pressed={allowAiTutor}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${allowAiTutor ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>

          <p className="mb-2 text-xs font-semibold text-slate-700">{t('padmin.form.defaultTime')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.openDate')}</label>
              <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.openTime')}</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.deadlineDate')}</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.deadlineTime')}</label>
              <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button onClick={() => setShowClassSchedules((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
            <span>{t('schedule.perClassToggle', { count: Object.keys(classSchedules).length })}</span>
            <ChevronDown size={14} className={showClassSchedules ? 'rotate-180' : ''} />
          </button>
          {showClassSchedules && (
            <div className="mt-2 space-y-2">
              {allClasses.length === 0 && <p className="text-[10px] text-slate-400">{t('padmin.form.noClasses')}</p>}
              {allClasses.map((cls) => {
                const entry = classSchedules[cls] ?? { date: '', time: '', dDate: '', dTime: '' };
                const active = Boolean(entry.date || entry.dDate);
                return (
                  <div key={cls} className={`rounded-lg border p-2.5 ${active ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{cls}</span>
                      {active && (
                        <button onClick={() => setClassSchedules((prev) => { const n = { ...prev }; delete n[cls]; return n; })}
                          className="text-[10px] font-medium text-rose-500 hover:text-rose-600">{t('schedule.removePerClass')}</button>
                      )}
                    </div>
                    {!active ? (
                      <button onClick={() => setClassSchedules((prev) => ({ ...prev, [cls]: { date: '', time: '', dDate: '', dTime: '' } }))}
                        className="text-[10px] font-medium text-blue-500 hover:text-blue-700">{t('schedule.addPerClass')}</button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={entry.date} onChange={(e) => setClassSchedules((prev) => ({ ...prev, [cls]: { ...prev[cls], date: e.target.value } }))} className={inputCls} />
                        <input type="time" value={entry.time} onChange={(e) => setClassSchedules((prev) => ({ ...prev, [cls]: { ...prev[cls], time: e.target.value } }))} className={inputCls} />
                        <input type="date" value={entry.dDate} onChange={(e) => setClassSchedules((prev) => ({ ...prev, [cls]: { ...prev[cls], dDate: e.target.value } }))} className={inputCls} />
                        <input type="time" value={entry.dTime} onChange={(e) => setClassSchedules((prev) => ({ ...prev, [cls]: { ...prev[cls], dTime: e.target.value } }))} className={inputCls} />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400">{t('schedule.perClassHintPlain')}</p>
            </div>
          )}
        </div>

        {/* Questions */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className={labelCls}>{t('padmin.form.questions', { count: questions.length })}</label>
            <button onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
              className="flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-2.5 py-1.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50">
              <Plus size={12} /> {t('padmin.form.addQuestion')}
            </button>
          </div>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const letterType = isLetterType(q);
              const correctSet = q.correctAnswer.split(',').map((s) => s.trim()).filter(Boolean);
              return (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">{t('padmin.form.questionNo', { no: i + 1 })}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      if (!user.password) {
                        toast('Chức năng Trợ lý AI đang được nâng cấp xác thực Supabase Auth và sẽ sớm khả dụng cho tài khoản của bạn.', 'info');
                        return;
                      }
                      setAiFocusQuestion(i + 1);
                      setShowAI(true);
                    }}
                      className="text-[11px] font-medium text-blue-500 hover:text-blue-700" title={t('padmin.askAiQuestionTitle')}>
                      {t('padmin.askAiQuestion')}
                    </button>
                    {questions.length > 1 && (
                      <button onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                        className="text-[11px] font-medium text-rose-500 hover:text-rose-600">{t('padmin.form.deleteQuestion')}</button>
                    )}
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <select value={q.questionType} onChange={(e) => setQuestion(q.id, {
                    questionType: e.target.value as PracticeQuestionType,
                    correctAnswer: e.target.value === 'short_answer' ? '' : e.target.value === 'multiple_choice' ? 'A' : 'A',
                  })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400">
                    {QUESTION_TYPES.map((qt) => <option key={qt.key} value={qt.key}>{t(qt.labelKey)}</option>)}
                  </select>
                  <select value={q.difficulty} onChange={(e) => setQuestion(q.id, { difficulty: e.target.value as PracticeDifficulty })}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400">
                    {DIFFICULTIES.map((d) => <option key={d.key} value={d.key}>{t(d.labelKey)}</option>)}
                  </select>
                </div>
                <AutoTextarea value={q.questionText} onChange={(v) => setQuestion(q.id, { questionText: v })}
                  placeholder={t('padmin.form.questionPlaceholder')} minHeight={64} className={inputCls} />
                <div className="mt-2" />
                {q.questionType === 'true_false' ? (
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-500">{t('padmin.form.correctAnswer')}</span>
                    {(['A', 'B'] as const).map((letter) => (
                      <button key={letter} onClick={() => setQuestion(q.id, { correctAnswer: letter })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${q.correctAnswer === letter ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {letter === 'A' ? t('padmin.form.true') : t('padmin.form.false')}
                      </button>
                    ))}
                  </div>
                ) : q.questionType === 'short_answer' ? (
                  <input value={q.correctAnswer} onChange={(e) => setQuestion(q.id, { correctAnswer: e.target.value })}
                    placeholder={t('padmin.form.shortAnswerCorrect')} className={`${inputCls} mb-2`} />
                ) : (
                  <div className="space-y-1.5">
                    {OPTION_LETTERS.map((letter) => {
                      const isCorrect = letterType && correctSet.includes(letter);
                      return (
                        <div key={letter} className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (!letterType) return;
                              if (q.questionType === 'multiple_choice') {
                                const next = isCorrect ? correctSet.filter((l) => l !== letter) : [...correctSet, letter].sort();
                                if (next.length === 0) return;
                                setQuestion(q.id, { correctAnswer: next.join(',') });
                              } else {
                                setQuestion(q.id, { correctAnswer: letter });
                              }
                            }}
                            title={q.questionType === 'multiple_choice' ? t('padmin.form.toggleCorrect') : t('padmin.form.markCorrect')}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                              isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {isCorrect ? <Check size={13} /> : letter}
                          </button>
                          <input value={q[`option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD']}
                            onChange={(e) => setQuestion(q.id, { [`option${letter}`]: e.target.value } as Partial<EditorQuestion>)}
                            placeholder={t('padmin.form.optionPlaceholder', { letter, optional: letter === 'C' || letter === 'D' ? t('padmin.form.optionOptional') : '' })}
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-400" />
                        </div>
                      );
                    })}
                  </div>
                )}
                <AutoTextarea value={q.explanation} onChange={(v) => setQuestion(q.id, { explanation: v })}
                  placeholder={t('padmin.form.explanationPlaceholder')} minHeight={60} className={inputCls} />
                <AutoTextarea value={q.hint} onChange={(v) => setQuestion(q.id, { hint: v })}
                  placeholder={t('padmin.form.hintPlaceholder')} minHeight={60} className={inputCls} />
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[10px] font-medium text-slate-500">{t('padmin.form.points')}</label>
                  <input type="number" min={0} max={100} value={q.points}
                    onChange={(e) => setQuestion(q.id, { points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {import.meta.env.DEV && saveError && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 font-mono text-[11px] text-rose-800">
            <p className="mb-1 font-bold">DEVELOPMENT ERROR PANEL</p>
            <p>TRACE ID: {saveError.traceId}</p>
            <p>SAVE STAGE: {saveError.stage}</p>
            <p>OPERATION: {saveError.operation}</p>
            <p>STATUS: {saveError.status || '—'}</p>
            <p>CODE: {saveError.code || '—'}</p>
            <p>MESSAGE: {saveError.message || '—'}</p>
            <p>DETAILS: {saveError.details || '—'}</p>
            <p>HINT: {saveError.hint || '—'}</p>
            <p>ENTITY: {saveError.entity}</p>
            <p>PAYLOAD KEYS: {saveError.payloadKeys.join(', ')}</p>
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50">
          {saving ? t('common.saving') : practice ? t('padmin.saveChanges') : t('padmin.createBtn')}
        </button>
      </div>

      {showImport && (
        <PracticeImportModal
          mode="append"
          onClose={() => setShowImport(false)}
          onImport={(imported) => setQuestions((prev) => {
            const blank = prev.filter((q) => !q.questionText.trim() && !q.explanation.trim());
            const keep = prev.filter((q) => !blank.some((b) => b.id === q.id));
            return [...keep, ...imported];
          })}
        />
      )}

      {showAI && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setShowAI(false)}>
          <div onClick={(e) => e.stopPropagation()} className="contents md:contents">
            <AIPanel
              practice={{
                id: practice?.id ?? 'draft',
                title: title.trim() || t('padmin.defaultTitle'),
                category,
                level: level as Practice['level'],
                linkedLessonId: linkedLessonId || null,
                passage,
                audioSourceType,
                audioSource,
                audioFileName,
                teacherName: practice?.teacherName ?? user.fullName,
                targetClasses,
                startAt: composeISO(startAt, startTime),
                deadline: composeISO(deadline, deadlineTime),
                classSchedules: Object.fromEntries(
                  Object.entries(classSchedules)
                    .map(([cls, e]): [string, { startAt: string | null; deadline: string | null }] => [cls, { startAt: composeISO(e.date, e.time), deadline: composeISO(e.dDate, e.dTime) }])
                    .filter(([, ov]) => ov.startAt || ov.deadline)
                ),
                allowAiTutor,
                status,
                sortOrder: practice?.sortOrder ?? 0,
                folderId: practice?.folderId ?? defaultFolderId,
                archivedAt: practice?.archivedAt ?? null,
                createdAt: practice?.createdAt ?? new Date().toISOString(),
              }}
              questions={questions.map((q, i) => ({
                id: q.id,
                practiceId: practice?.id ?? 'draft',
                questionNo: i + 1,
                questionType: q.questionType,
                questionText: q.questionText,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                hint: q.hint,
                difficulty: q.difficulty,
                questionCategory: q.questionCategory,
                tags: q.tags,
                imageUrl: q.imageUrl,
                points: q.points,
              }))}
              folderPath=""
              canManage={user.role === 'admin' || user.role === 'teacher'}
              credentials={{ username: user.username, password: user.password ?? '' }}
              initialSelectedQuestionNo={aiFocusQuestion}
              onClose={() => setShowAI(false)}
              onApplyProposals={handleApplyAIProposals}
              onApplyFields={handleApplyAIFields}
            />
          </div>
        </div>
      )}
    </div>
  );
}
