import { useState, useMemo, useEffect, useCallback } from 'react';
import type {
  Lesson, User, LessonCategory, LessonFolder,
  LessonFolderCategoryId, FolderColor, ListeningLesson, ReadingLesson,
} from '@/types';
import {
  loadClasses, loadAllVocabItems, loadAllGrammarItems,
  getEffectiveLessonSchedule, getLessonTimeStatus,
  loadListeningLessons, updateListeningLesson,
  loadReadingLessons, updateReadingLesson,
  loadSubjectItems, type SubjectItem,
} from '@/storage';
import {
  loadLessonFolders, createLessonFolder, renameLessonFolder, moveLessonFolder,
  archiveLessonFolder, restoreLessonFolder, deleteLessonFolder, moveLessonToFolder,
  bulkMoveLessonsToFolder,
  buildLessonFolderTree, buildLessonFolderBreadcrumb,
  collectDescendantFolderIds, canManageFolder,
  type LessonFolderNode,
} from '@/lib/lessonFolderService';
import { ListeningAdminModal } from '@/components/ListeningAdminModal';
import { ReadingAdminModal } from '@/components/ReadingAdminModal';
import { LessonAccessModal } from '@/components/LessonAccessModal';
import { loadAllLessonGrants, getLocalLessonGrants } from '@/lib/lessonAccessApi';
import { resolveAllLessonsAccess } from '@/lib/lessonAccessService';
import type { LessonAccessGrant } from '@/types';
import { toast } from './Toast';
import {
  BookOpen, Languages, Headphones, FileText, CheckCircle2, ChevronRight,
  Plus, Users, Pencil, Trash2, Shield,
  Clock, Zap, Layers, ChevronDown, Folder, FolderPlus,
  FolderInput, Archive, RotateCcw, Search, LayoutGrid, List as ListIcon,
  House, ArrowUpDown, Inbox, MoreVertical, AlertTriangle, X, FileSpreadsheet,
  CheckSquare, Square, Award, BookOpenCheck, BookOpenText,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';

// ─── Schedule helpers (lesson learning-time) ───────────────────

const LESSON_STATUS_META: Record<ReturnType<typeof getLessonTimeStatus>, { label: TranslationKey; cls: string }> = {
  no_limit: { label: 'lesson.status.noLimit', cls: 'bg-slate-100 text-slate-500' },
  upcoming: { label: 'lesson.status.upcoming', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'lesson.status.active', cls: 'bg-emerald-100 text-emerald-700' },
  ending_soon: { label: 'lesson.status.endingSoon', cls: 'bg-orange-100 text-orange-700' },
  expired: { label: 'lesson.status.expired', cls: 'bg-red-100 text-red-700' },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function splitDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function composeDateTimeISO(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '23:59';
  const d = new Date(`${date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function hasSchedule(s: { startAt: string | null; deadline: string | null }): boolean {
  return Boolean(s.startAt || s.deadline);
}

interface LessonScheduleEntry {
  startAt: string;
  deadline: string;
  startTime: string;
  deadlineTime: string;
}

function emptyScheduleEntry(): LessonScheduleEntry {
  return { startAt: '', deadline: '', startTime: '', deadlineTime: '' };
}

function entryFromISO(startAt: string | null, deadline: string | null): LessonScheduleEntry {
  const s = splitDateTime(startAt);
  const d = splitDateTime(deadline);
  return { startAt: s.date, startTime: s.time, deadline: d.date, deadlineTime: d.time };
}

function entryHasValue(e: LessonScheduleEntry): boolean {
  return Boolean(e.startAt || e.deadline);
}

function entryToOverride(e: LessonScheduleEntry): { startAt: string | null; deadline: string | null } | null {
  if (!entryHasValue(e)) return null;
  return { startAt: composeDateTimeISO(e.startAt, e.startTime), deadline: composeDateTimeISO(e.deadline, e.deadlineTime) };
}

function buildScheduleMap(
  entries: Record<string, LessonScheduleEntry>
): Record<string, { startAt: string | null; deadline: string | null }> {
  const out: Record<string, { startAt: string | null; deadline: string | null }> = {};
  for (const [cls, e] of Object.entries(entries)) {
    const ov = entryToOverride(e);
    if (ov) out[cls] = ov;
  }
  return out;
}

function ScheduleFields({ entry, onChange }: {
  entry: LessonScheduleEntry;
  onChange: (patch: Partial<LessonScheduleEntry>) => void;
}) {
  const { t } = useLanguage();
  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400';
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.openDate')}</label>
        <input type="date" value={entry.startAt} onChange={(e) => onChange({ startAt: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.openTime')}</label>
        <input type="time" value={entry.startTime} onChange={(e) => onChange({ startTime: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.deadlineDate')}</label>
        <input type="date" value={entry.deadline} onChange={(e) => onChange({ deadline: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('schedule.deadlineTime')}</label>
        <input type="time" value={entry.deadlineTime} onChange={(e) => onChange({ deadlineTime: e.target.value })} className={inputCls} />
      </div>
    </div>
  );
}

// ─── Constants & Meta ──────────────────────────────────────────

export type CategoryTab = 'all' | LessonFolderCategoryId;

export type LessonExplorerSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc';

interface CategoryTabConfig {
  key: CategoryTab;
  label: string;
  icon: typeof BookOpen;
  colorClass: string;
  badgeClass: string;
}

const CATEGORY_TABS: CategoryTabConfig[] = [
  { key: 'all', label: 'Tất cả', icon: Layers, colorClass: 'text-slate-700', badgeClass: 'bg-slate-100 text-slate-700' },
  { key: 'cat-grammar', label: 'Ngữ pháp', icon: BookOpen, colorClass: 'text-indigo-600', badgeClass: 'bg-indigo-50 text-indigo-700' },
  { key: 'cat-vocab', label: 'Từ vựng', icon: Languages, colorClass: 'text-emerald-600', badgeClass: 'bg-emerald-50 text-emerald-700' },
  { key: 'cat-listening', label: 'Nghe hiểu', icon: Headphones, colorClass: 'text-sky-600', badgeClass: 'bg-sky-50 text-sky-700' },
  { key: 'cat-reading', label: 'Đọc hiểu', icon: FileText, colorClass: 'text-amber-600', badgeClass: 'bg-amber-50 text-amber-700' },
];

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

export interface FolderVisualMeta {
  Icon: React.ElementType;
  badgeLabel: string;
  badgeClass: string;
  iconBg: string;
  iconColor: string;
  cardBorder: string;
  cardHoverBorder: string;
}

export function getFolderVisualMeta(folder: LessonFolder): FolderVisualMeta {
  let type: 'vocab' | 'grammar' | 'reading' | 'listening' | 'exam' | 'custom' = 'custom';
  const cat = (folder.categoryId || '').toLowerCase();

  if (cat === 'cat-vocab' || cat === 'vocab' || cat === 'vocabulary') {
    type = 'vocab';
  } else if (cat === 'cat-grammar' || cat === 'grammar') {
    type = 'grammar';
  } else if (cat === 'cat-reading' || cat === 'reading') {
    type = 'reading';
  } else if (cat === 'cat-listening' || cat === 'listening') {
    type = 'listening';
  } else if (cat === 'cat-exam' || cat === 'exam') {
    type = 'exam';
  } else {
    const norm = (folder.name || '').normalize('NFC').trim().toLowerCase();
    if (norm.includes('từ vựng') || norm.includes('tu vung') || norm.includes('vocab')) type = 'vocab';
    else if (norm.includes('ngữ pháp') || norm.includes('ngu phap') || norm.includes('grammar')) type = 'grammar';
    else if (norm.includes('đọc hiểu') || norm.includes('doc hieu') || norm.includes('reading')) type = 'reading';
    else if (norm.includes('nghe hiểu') || norm.includes('nghe hieu') || norm.includes('listening')) type = 'listening';
    else if (norm.includes('luyện thi') || norm.includes('luyen thi') || norm.includes('đề thi') || norm.includes('exam')) type = 'exam';
  }

  switch (type) {
    case 'vocab':
      return {
        Icon: Languages,
        badgeLabel: 'Từ vựng',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        iconBg: 'bg-emerald-100/80',
        iconColor: 'text-emerald-700',
        cardBorder: 'border-emerald-200/80',
        cardHoverBorder: 'hover:border-emerald-400 hover:shadow-emerald-500/10',
      };
    case 'grammar':
      return {
        Icon: BookOpenCheck,
        badgeLabel: 'Ngữ pháp',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        iconBg: 'bg-indigo-100/80',
        iconColor: 'text-indigo-700',
        cardBorder: 'border-indigo-200/80',
        cardHoverBorder: 'hover:border-indigo-400 hover:shadow-indigo-500/10',
      };
    case 'reading':
      return {
        Icon: BookOpenText,
        badgeLabel: 'Đọc hiểu',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        iconBg: 'bg-amber-100/80',
        iconColor: 'text-amber-700',
        cardBorder: 'border-amber-200/80',
        cardHoverBorder: 'hover:border-amber-400 hover:shadow-amber-500/10',
      };
    case 'listening':
      return {
        Icon: Headphones,
        badgeLabel: 'Nghe hiểu',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
        iconBg: 'bg-sky-100/80',
        iconColor: 'text-sky-700',
        cardBorder: 'border-sky-200/80',
        cardHoverBorder: 'hover:border-sky-400 hover:shadow-sky-500/10',
      };
    case 'exam':
      return {
        Icon: Award,
        badgeLabel: 'Luyện thi',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        iconBg: 'bg-rose-100/80',
        iconColor: 'text-rose-700',
        cardBorder: 'border-rose-200/80',
        cardHoverBorder: 'hover:border-rose-400 hover:shadow-rose-500/10',
      };
    default: {
      const color = folder.color || 'blue';
      const colorMeta = FOLDER_COLOR_CLASSES[color] || FOLDER_COLOR_CLASSES.blue;
      return {
        Icon: Folder,
        badgeLabel: 'Thư mục',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        iconBg: colorMeta.bg,
        iconColor: colorMeta.text,
        cardBorder: colorMeta.border,
        cardHoverBorder: 'hover:border-blue-400 hover:shadow-blue-500/10',
      };
    }
  }
}

// Unified lesson model across all 4 lesson kinds
export interface UnifiedLesson {
  id: string;
  type: 'grammar' | 'vocab' | 'listening' | 'reading';
  categoryId: LessonFolderCategoryId;
  title: string;
  subtitle: string;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  targetClasses?: string[];
  rawGrammarVocab?: Lesson;
  rawListening?: ListeningLesson;
  rawReading?: ReadingLesson;
}

interface LessonListViewProps {
  lessons: Lesson[];
  categories: LessonCategory[];
  completedIds: Set<string>;
  currentUser: User;
  canManage: boolean;
  onOpen: (lesson: Lesson) => void;
  onImport: (folderId?: string | null) => void;
  onVocabImport?: (categoryId: string, folderId?: string | null) => void;
  onGrammarExamImport?: (folderId?: string | null) => void;
  onVocabExamImport?: (folderId?: string | null) => void;
  onReadingExamImport?: (folderId?: string | null) => void;
  onOpenListening?: () => void;
  onOpenReading?: () => void;
  onOpenListeningLesson?: (lesson: ListeningLesson) => void;
  onOpenReadingLesson?: (lesson: ReadingLesson) => void;
  onUpdateLesson?: (id: string, updates: Partial<Lesson>) => void;
  onDeleteLesson?: (id: string) => Promise<void> | void;
  onCreateCategory?: (data: Omit<LessonCategory, 'id' | 'createdAt'>) => void;
  onUpdateCategory?: (id: string, updates: Partial<LessonCategory>) => void;
  onDeleteCategory?: (id: string) => void;
}

function listeningVisibleForStudent(
  lesson: ListeningLesson,
  user: User
): boolean {
  if (lesson.status !== 'PUBLISHED') return false;
  if (!lesson.classScope || lesson.classScope.length === 0 || lesson.classScope.includes('Tất cả')) return true;
  return lesson.classScope.some((c) => user.assignedClasses.includes(c));
}

export function LessonListView({
  lessons,
  categories,
  completedIds,
  currentUser,
  canManage,
  onOpen,
  onImport,
  onVocabImport,
  onGrammarExamImport,
  onVocabExamImport,
  onReadingExamImport,
  onOpenListening,
  onOpenReading,
  onOpenListeningLesson,
  onOpenReadingLesson,
  onUpdateLesson,
  onDeleteLesson,
}: LessonListViewProps) {
  const { t } = useLanguage();

  // ─── Bulk Selection state (Grammar & Vocab) ──────────────────
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);

  // ─── Filter & Navigation state ───────────────────────────────
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [treeSearch, setTreeSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('quizforms_lesson_explorer_mode') as 'grid' | 'list') ?? 'grid'
  );
  const [sort, setSort] = useState<LessonExplorerSort>('name_asc');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // ─── Data state ──────────────────────────────────────────────
  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [listeningLessons, setListeningLessons] = useState<ListeningLesson[]>([]);
  const [readingLessons, setReadingLessons] = useState<ReadingLesson[]>([]);
  const [vocabCounts, setVocabCounts] = useState<Record<string, number>>({});
  const [grammarCounts, setGrammarCounts] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<string[]>([]);

  // ─── Dialog & Menu states ────────────────────────────────────
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [folderToRename, setFolderToRename] = useState<LessonFolder | null>(null);
  const [folderToMove, setFolderToMove] = useState<LessonFolder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<LessonFolder | null>(null);
  const [accessLessonTarget, setAccessLessonTarget] = useState<Lesson | null>(null);
  const [lessonGrants, setLessonGrants] = useState<LessonAccessGrant[]>(() => getLocalLessonGrants());
  const [lessonToMove, setLessonToMove] = useState<UnifiedLesson | null>(null);
  const [lessonToEdit, setLessonToEdit] = useState<UnifiedLesson | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<UnifiedLesson | null>(null);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editLessonMeaning, setEditLessonMeaning] = useState('');
  const [editLessonSubjectId, setEditLessonSubjectId] = useState<string>('');
  const [editLessonJlptLevel, setEditLessonJlptLevel] = useState<string>('N2');
  const [editLessonFolderId, setEditLessonFolderId] = useState<string | null>(null);
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  useEffect(() => {
    loadSubjectItems().then(setSubjects).catch(() => {});
  }, []);

  const subjectMap = useMemo(() => {
    return new Map<string, string>(subjects.map((s) => [s.id, s.name]));
  }, [subjects]);

  const [showNewChoice, setShowNewChoice] = useState(false);
  const [showImportChoice, setShowImportChoice] = useState(false);

  const [editingListening, setEditingListening] = useState<ListeningLesson | null>(null);
  const [creatingListening, setCreatingListening] = useState(false);

  const [editingReading, setEditingReading] = useState<ReadingLesson | null>(null);
  const [creatingReading, setCreatingReading] = useState(false);

  // Form states for modals
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState<FolderColor>('blue');
  const [createCategory, setCreateCategory] = useState<LessonFolderCategoryId>('cat-grammar');

  const [renameName, setRenameName] = useState('');
  const [renameColor, setRenameColor] = useState<FolderColor>('blue');
  const [renameDescription, setRenameDescription] = useState('');

  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [targetItemFolderId, setTargetItemFolderId] = useState<string | null>(null);

  // Bulk move lessons states
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveTargetFolderId, setBulkMoveTargetFolderId] = useState<string | null>(null);
  const [isBulkMoving, setIsBulkMoving] = useState(false);

  // Bulk schedule & class assignment states for grammar/vocab
  const [showBulkSchedule, setShowBulkSchedule] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkEntries, setBulkEntries] = useState<Record<string, LessonScheduleEntry>>({});
  const [bulkClassEntries, setBulkClassEntries] = useState<Record<string, Record<string, LessonScheduleEntry>>>({});
  const [bulkClassOpen, setBulkClassOpen] = useState<Record<string, boolean>>({});
  const [bulkClassRowOpen, setBulkClassRowOpen] = useState<Set<string>>(new Set());
  const [bulkClassTouched, setBulkClassTouched] = useState<Set<string>>(new Set());
  const [autoStart, setAutoStart] = useState('');
  const [autoDaysPerLesson, setAutoDaysPerLesson] = useState('3');
  const [autoGapDays, setAutoGapDays] = useState('1');
  const [autoUseTime, setAutoUseTime] = useState('23:59');

  // ─── Data loading ────────────────────────────────────────────
  const refreshFolders = useCallback(async () => {
    try {
      const f = await loadLessonFolders('all', true);
      setFolders(f);
    } catch {
      // ignore
    }
  }, []);

  const refreshListening = useCallback(async () => {
    try {
      const ll = await loadListeningLessons();
      setListeningLessons(ll);
    } catch {
      // ignore
    }
  }, []);

  const refreshReading = useCallback(async () => {
    try {
      const rl = await loadReadingLessons();
      setReadingLessons(rl);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshFolders();
    refreshListening();
    refreshReading();
    loadAllLessonGrants().then(setLessonGrants);
  }, [refreshFolders, refreshListening, refreshReading]);

  useEffect(() => {
    if (canManage) loadClasses().then(setClasses);
    loadAllVocabItems().then((items) => {
      const counts: Record<string, number> = {};
      items.forEach((v) => { counts[v.lessonId] = (counts[v.lessonId] ?? 0) + 1; });
      setVocabCounts(counts);
    });
    loadAllGrammarItems().then((items) => {
      const counts: Record<string, number> = {};
      items.forEach((g) => { counts[g.lessonId] = (counts[g.lessonId] ?? 0) + 1; });
      setGrammarCounts(counts);
    });
  }, [canManage]);

  // ─── Effective ACL permissions per lesson ─────────────────────
  const effectiveLessonAccessMap = useMemo(() => {
    return resolveAllLessonsAccess(currentUser, lessons, lessonGrants);
  }, [currentUser, lessons, lessonGrants]);

  // ─── Unified Lesson Mapping ──────────────────────────────────
  const allUnifiedLessons = useMemo<UnifiedLesson[]>(() => {
    const list: UnifiedLesson[] = [];

    // 1. Grammar & Vocab from lessons prop
    for (const l of lessons) {
      if (currentUser.role !== 'admin') {
        const access = effectiveLessonAccessMap.get(l.id);
        if (!access?.canView) continue;
      }
      let itemType: 'grammar' | 'vocab' | 'reading' | 'listening' = 'grammar';
      if (l.categoryId === 'cat-vocab') itemType = 'vocab';
      else if (l.categoryId === 'cat-reading' || l.lessonType === 'reading_exam') itemType = 'reading';
      else if (l.categoryId === 'cat-listening') itemType = 'listening';

      list.push({
        id: l.id,
        type: itemType,
        categoryId: (l.categoryId as LessonFolderCategoryId) || (itemType === 'vocab' ? 'cat-vocab' : itemType === 'reading' ? 'cat-reading' : 'cat-grammar'),
        title: l.title,
        subtitle: l.meaning || '',
        folderId: l.folderId ?? null,
        sortOrder: l.sortOrder ?? 0,
        createdAt: l.createdAt ?? '',
        targetClasses: l.targetClasses,
        rawGrammarVocab: l,
      });
    }

    // 2. Listening lessons
    for (const ll of listeningLessons) {
      if (currentUser.role === 'student' && !listeningVisibleForStudent(ll, currentUser)) continue;
      list.push({
        id: ll.id,
        type: 'listening',
        categoryId: 'cat-listening',
        title: ll.title,
        subtitle: `${ll.level} • ${ll.teacherName ? `${ll.teacherName} • ` : ''}${ll.durationSeconds ? `${Math.ceil(ll.durationSeconds / 60)} phút` : ''}`,
        folderId: ll.folderId ?? null,
        sortOrder: ll.sortOrder ?? 0,
        createdAt: ll.createdAt ?? '',
        targetClasses: ll.classScope,
        rawListening: ll,
      });
    }

    // 3. Reading lessons
    for (const rl of readingLessons) {
      if (currentUser.role === 'student' && rl.status !== 'published') continue;
      list.push({
        id: rl.id,
        type: 'reading',
        categoryId: 'cat-reading',
        title: rl.titleJa ? `${rl.titleJa}${rl.titleVi ? ` (${rl.titleVi})` : ''}` : rl.titleVi,
        subtitle: `${rl.level} • ${rl.estimatedMinutes || 10} phút`,
        folderId: rl.folderId ?? null,
        sortOrder: rl.displayOrder ?? 0,
        createdAt: rl.createdAt ?? '',
        rawReading: rl,
      });
    }

    return list;
  }, [lessons, listeningLessons, readingLessons, currentUser, effectiveLessonAccessMap]);

  // Tab count badges
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryTab, number> = {
      all: allUnifiedLessons.length,
      'cat-grammar': 0,
      'cat-vocab': 0,
      'cat-listening': 0,
      'cat-reading': 0,
    };
    for (const item of allUnifiedLessons) {
      if (item.categoryId in counts) {
        counts[item.categoryId]++;
      }
    }
    return counts;
  }, [allUnifiedLessons]);

  // Lessons filtered by active category tab
  const tabFilteredLessons = useMemo(() => {
    if (activeTab === 'all') return allUnifiedLessons;
    return allUnifiedLessons.filter((l) => l.categoryId === activeTab);
  }, [allUnifiedLessons, activeTab]);

  // Folders filtered by active category tab
  const tabFilteredFolders = useMemo(() => {
    if (activeTab === 'all') return folders;
    return folders.filter((f) => f.categoryId === activeTab);
  }, [folders, activeTab]);

  const activeCategoryFolders = useMemo(() => {
    return tabFilteredFolders.filter((f) => !f.archivedAt);
  }, [tabFilteredFolders]);

  const archivedCategoryFolders = useMemo(() => {
    return tabFilteredFolders.filter((f) => Boolean(f.archivedAt));
  }, [tabFilteredFolders]);

  // Current folder
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return folders.find((f) => f.id === currentFolderId) ?? null;
  }, [folders, currentFolderId]);

  // Breadcrumbs
  const breadcrumb = useMemo(() => {
    return buildLessonFolderBreadcrumb(folders, currentFolderId);
  }, [folders, currentFolderId]);

  // Tree nodes for sidebar
  const treeNodes = useMemo(() => {
    return buildLessonFolderTree(activeCategoryFolders);
  }, [activeCategoryFolders]);

  // Current level folders (in explorer view)
  const currentLevelFolders = useMemo(() => {
    if (showArchived) {
      return archivedCategoryFolders;
    }
    return activeCategoryFolders.filter((f) => f.parentId === currentFolderId);
  }, [showArchived, archivedCategoryFolders, activeCategoryFolders, currentFolderId]);

  // Current level items (in explorer view)
  const currentLevelItems = useMemo(() => {
    return tabFilteredLessons.filter((item) => {
      const folderMatches = !currentFolderId ? item.folderId === null : item.folderId === currentFolderId;
      return folderMatches;
    });
  }, [tabFilteredLessons, currentFolderId]);

  const canUserManageFolder = useCallback((_folder?: unknown): boolean => {
    void _folder;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role !== 'teacher') return false;
    return true; // Folders are strictly for organization; teachers can organize content
  }, [currentUser]);

  const teacherDisabledFolderIds = useMemo(() => {
    if (currentUser.role !== 'teacher') return new Set<string>();
    const set = new Set<string>();
    for (const f of folders) {
      if (!canUserManageFolder()) {
        set.add(f.id);
      }
    }
    return set;
  }, [folders, currentUser, canUserManageFolder]);

  // Items count at home (folderId === null) matching activeTab
  const homeItemsCount = useMemo(() => {
    return tabFilteredLessons.filter((item) => item.folderId === null).length;
  }, [tabFilteredLessons]);

  // Direct item count inside any folder
  const getItemCountInFolder = useCallback((folderId: string | null) => {
    return allUnifiedLessons.filter((item) => {
      if (!folderId) return item.folderId === null;
      return item.folderId === folderId;
    }).length;
  }, [allUnifiedLessons]);

  const currentTabSelectableLessons = useMemo(() => {
    if (activeTab === 'cat-grammar') return tabFilteredLessons.filter((l) => l.type === 'grammar');
    if (activeTab === 'cat-vocab') return tabFilteredLessons.filter((l) => l.type === 'vocab');
    return tabFilteredLessons.filter((l) => l.type === 'grammar' || l.type === 'vocab');
  }, [activeTab, tabFilteredLessons]);

  const getSubfolderCount = useCallback((folderId: string) => {
    return activeCategoryFolders.filter((f) => f.parentId === folderId).length;
  }, [activeCategoryFolders]);

  // Sorted folders
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

  // Sorted items
  const sortedItems = useMemo(() => {
    const list = [...currentLevelItems];
    list.sort((a, b) => {
      switch (sort) {
        case 'name_desc': return b.title.localeCompare(a.title, 'vi');
        case 'updated_desc': return b.createdAt.localeCompare(a.createdAt);
        case 'updated_asc': return a.createdAt.localeCompare(b.createdAt);
        default: return a.title.localeCompare(b.title, 'vi');
      }
    });
    return list;
  }, [currentLevelItems, sort]);

  // Search results
  const isSearching = search.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    const q = search.trim().toLowerCase();
    const matchedFolders = tabFilteredFolders.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q))
    );
    const matchedItems = tabFilteredLessons.filter(
      (l) => l.title.toLowerCase().includes(q) || l.subtitle.toLowerCase().includes(q)
    );
    return { matchedFolders, matchedItems };
  }, [isSearching, search, tabFilteredFolders, tabFilteredLessons]);

  // ─── Handlers ────────────────────────────────────────────────

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

  const handleOpenCreateFolder = () => {
    if (currentFolder && !canManageFolder(currentUser, currentFolder)) {
      toast('Bạn không thể tạo thư mục con bên trong thư mục của giáo viên khác.', 'error');
      return;
    }
    setCreateName('');
    setCreateDescription('');
    setCreateColor('blue');
    if (currentFolder) {
      setCreateCategory(currentFolder.categoryId as LessonFolderCategoryId);
    } else if (activeTab !== 'all') {
      setCreateCategory(activeTab);
    } else {
      setCreateCategory('cat-grammar');
    }
    setShowCreateFolder(true);
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      toast('Tên thư mục không được để trống', 'error');
      return;
    }
    try {
      const parentCat = currentFolder ? (currentFolder.categoryId as LessonFolderCategoryId) : createCategory;
      const created = await createLessonFolder({
        categoryId: parentCat,
        parentId: currentFolderId,
        name: createName,
        description: createDescription,
        color: createColor,
        createdBy: currentUser.id,
      });
      setShowCreateFolder(false);
      await refreshFolders();
      if (currentFolderId) {
        setExpandedFolders((prev) => new Set(prev).add(currentFolderId));
      }
      toast(`Đã tạo thư mục "${created.name}"`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tạo thư mục thất bại';
      toast(msg, 'error');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToRename || !renameName.trim()) return;
    try {
      const trimmedDesc = renameDescription.trim() || null;
      await renameLessonFolder(folderToRename.id, renameName.trim(), renameColor, trimmedDesc);
      const newName = renameName.trim();
      setFolderToRename(null);
      await refreshFolders();
      toast(`Đã cập nhật thư mục "${newName}"`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đổi tên thư mục thất bại';
      toast(msg, 'error');
    }
  };

  const handleMoveFolderSubmit = async () => {
    if (!folderToMove) return;
    try {
      await moveLessonFolder(folderToMove.id, targetParentId);
      setFolderToMove(null);
      await refreshFolders();
      toast('Đã di chuyển thư mục thành công', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Di chuyển thư mục thất bại';
      toast(msg, 'error');
    }
  };

  const handleArchiveFolder = async (folder: LessonFolder) => {
    try {
      await archiveLessonFolder(folder.id);
      await refreshFolders();
      toast(`Đã lưu trữ thư mục "${folder.name}"`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lưu trữ thất bại';
      toast(msg, 'error');
    }
  };

  const handleRestoreFolder = async (folder: LessonFolder) => {
    try {
      await restoreLessonFolder(folder.id);
      await refreshFolders();
      toast(`Đã khôi phục thư mục "${folder.name}"`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Khôi phục thất bại';
      toast(msg, 'error');
    }
  };

  const handleDeleteFolderConfirm = async () => {
    if (!folderToDelete) return;
    try {
      await deleteLessonFolder(folderToDelete.id);
      setFolderToDelete(null);
      await refreshFolders();
      toast(`Đã xóa thư mục vĩnh viễn`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xóa thư mục';
      toast(msg, 'error');
    }
  };

  const handleMoveLessonSubmit = async () => {
    if (!lessonToMove) return;
    try {
      if (lessonToMove.rawGrammarVocab) {
        const moveType = lessonToMove.rawGrammarVocab.lessonType === 'reading_exam'
          ? 'reading_exam'
          : lessonToMove.type === 'vocab' ? 'vocab' : 'grammar';
        await moveLessonToFolder(moveType, lessonToMove.id, targetItemFolderId);
        if (onUpdateLesson) {
          await onUpdateLesson(lessonToMove.id, { folderId: targetItemFolderId });
        }
      } else if (lessonToMove.type === 'listening') {
        await moveLessonToFolder('listening', lessonToMove.id, targetItemFolderId);
        await updateListeningLesson(lessonToMove.id, { folderId: targetItemFolderId });
        await refreshListening();
      } else if (lessonToMove.type === 'reading') {
        await moveLessonToFolder('reading', lessonToMove.id, targetItemFolderId);
        await updateReadingLesson(lessonToMove.id, { folderId: targetItemFolderId });
        await refreshReading();
      }
      setLessonToMove(null);
      toast('Đã di chuyển bài học thành công', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Di chuyển bài học thất bại';
      toast(msg, 'error');
    }
  };

  const handleBulkMoveSubmit = async () => {
    if (selectedLessonIds.length === 0) return;
    setIsBulkMoving(true);
    try {
      // Tách các bài học theo loại (grammar vs vocab)
      const selectedLessons = tabFilteredLessons.filter((l) => selectedLessonIds.includes(l.id));
      const grammarIds = selectedLessons.filter((l) => l.type === 'grammar').map((l) => l.id);
      const vocabIds = selectedLessons.filter((l) => l.type === 'vocab').map((l) => l.id);

      const allUpdatedIds: string[] = [];

      if (grammarIds.length > 0) {
        const resG = await bulkMoveLessonsToFolder('grammar', grammarIds, bulkMoveTargetFolderId);
        if (resG.updatedIds) allUpdatedIds.push(...resG.updatedIds);
      }
      if (vocabIds.length > 0) {
        const resV = await bulkMoveLessonsToFolder('vocab', vocabIds, bulkMoveTargetFolderId);
        if (resV.updatedIds) allUpdatedIds.push(...resV.updatedIds);
      }

      // Cập nhật state bài học cục bộ
      if (onUpdateLesson && allUpdatedIds.length > 0) {
        for (const id of allUpdatedIds) {
          onUpdateLesson(id, { folderId: bulkMoveTargetFolderId });
        }
      }
      await refreshFolders();

      const destName = bulkMoveTargetFolderId
        ? folders.find((f) => f.id === bulkMoveTargetFolderId)?.name || 'thư mục'
        : 'Trang chủ';

      toast(`Đã di chuyển thành công ${allUpdatedIds.length} bài học vào "${destName}"!`, 'success');

      const updatedSet = new Set(allUpdatedIds);
      setSelectedLessonIds((prev) => prev.filter((id) => !updatedSet.has(id)));
      setShowBulkMoveModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Di chuyển hàng loạt bài học thất bại';
      toast(msg, 'error');
    } finally {
      setIsBulkMoving(false);
    }
  };

  // Dispatch "Tạo bài học mới"
  const handleTriggerNewLesson = () => {
    const targetCat = currentFolder ? currentFolder.categoryId : activeTab;
    if (targetCat === 'cat-listening') {
      setCreatingListening(true);
    } else if (targetCat === 'cat-reading') {
      setCreatingReading(true);
    } else if (targetCat === 'cat-vocab') {
      if (onVocabImport) onVocabImport('cat-vocab', currentFolderId);
    } else if (targetCat === 'cat-grammar') {
      if (onImport) onImport(currentFolderId);
    } else {
      setShowNewChoice(true);
    }
  };

  // Dispatch "Nhập Excel"
  const handleTriggerImport = () => {
    const targetCat = currentFolder ? currentFolder.categoryId : activeTab;
    if (targetCat === 'cat-listening') {
      setCreatingListening(true);
    } else if (targetCat === 'cat-reading') {
      setCreatingReading(true);
    } else if (targetCat === 'cat-vocab') {
      if (onVocabImport) onVocabImport('cat-vocab', currentFolderId);
    } else if (targetCat === 'cat-grammar') {
      if (onImport) onImport(currentFolderId);
    } else {
      setShowImportChoice(true);
    }
  };

  // Click on a lesson item
  const handleOpenItem = (item: UnifiedLesson) => {
    if (item.rawGrammarVocab) {
      onOpen(item.rawGrammarVocab);
      return;
    }
    if (item.type === 'listening') {
      if (onOpenListeningLesson && item.rawListening) {
        onOpenListeningLesson(item.rawListening);
      } else if (onOpenListening) {
        onOpenListening();
      }
      return;
    }
    if (item.type === 'reading') {
      if (item.rawReading && onOpenReadingLesson) {
        onOpenReadingLesson(item.rawReading);
      } else if (onOpenReading) {
        onOpenReading();
      }
      return;
    }
  };

  // Bulk schedule
  const schedulableLessons = useMemo(() => {
    if (activeTab === 'all') return lessons;
    return lessons.filter((l) => l.categoryId === activeTab);
  }, [lessons, activeTab]);

  const openBulkSchedule = () => {
    const baseEntries: Record<string, LessonScheduleEntry> = {};
    const baseClassEntries: Record<string, Record<string, LessonScheduleEntry>> = {};
    for (const l of schedulableLessons) {
      baseEntries[l.id] = entryFromISO(l.startAt, l.deadline);
      const cMap: Record<string, LessonScheduleEntry> = {};
      Object.entries(l.classSchedules ?? {}).forEach(([cls, ov]) => {
        cMap[cls] = entryFromISO(ov.startAt, ov.deadline);
      });
      baseClassEntries[l.id] = cMap;
    }
    setBulkEntries(baseEntries);
    setBulkClassEntries(baseClassEntries);
    setBulkClassOpen({});
    setBulkClassRowOpen(new Set());
    setBulkClassTouched(new Set());
    // Pre-select user selected lessons if any, otherwise all schedulable lessons
    const preselected = selectedLessonIds.length > 0
      ? new Set(selectedLessonIds.filter((id) => schedulableLessons.some((l) => l.id === id)))
      : new Set(schedulableLessons.map((l) => l.id));
    setBulkSelected(preselected.size > 0 ? preselected : new Set(schedulableLessons.map((l) => l.id)));
    setShowBulkSchedule(true);
  };

  const setBulkEntry = (id: string, patch: Partial<LessonScheduleEntry>) => {
    setBulkEntries((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyScheduleEntry()), ...patch },
    }));
  };

  const setBulkClassEntry = (lessonId: string, cls: string, patch: Partial<LessonScheduleEntry>) => {
    setBulkClassTouched((prev) => new Set(prev).add(lessonId));
    setBulkClassEntries((prev) => {
      const curMap = prev[lessonId] ?? {};
      return {
        ...prev,
        [lessonId]: {
          ...curMap,
          [cls]: { ...(curMap[cls] ?? emptyScheduleEntry()), ...patch },
        },
      };
    });
  };

  const applyBulk = () => {
    if (!onUpdateLesson) return;
    let count = 0;
    for (const id of bulkSelected) {
      const e = bulkEntries[id];
      if (!e) continue;
      const updates: Partial<Lesson> = {
        startAt: composeDateTimeISO(e.startAt, e.startTime),
        deadline: composeDateTimeISO(e.deadline, e.deadlineTime),
      };
      if (bulkClassTouched.has(id)) updates.classSchedules = buildScheduleMap(bulkClassEntries[id] ?? {});
      onUpdateLesson(id, updates);
      count++;
    }
    if (count > 0) toast(t('lesson.toast.bulkUpdated', { count }), 'success');
    setSelectedLessonIds([]);
    setShowBulkSchedule(false);
  };

  const applyAutoSchedule = () => {
    if (!onUpdateLesson) return;
    const days = parseInt(autoDaysPerLesson, 10);
    const gap = parseInt(autoGapDays, 10);
    if (!autoStart || Number.isNaN(days) || days < 1) {
      toast(t('lesson.toast.autoNeedInput'), 'error');
      return;
    }
    const targets = schedulableLessons.filter((l) => bulkSelected.has(l.id));
    if (targets.length === 0) {
      toast(t('lesson.toast.selectOneLesson'), 'error');
      return;
    }
    const base = new Date(`${autoStart}T00:00:00`);
    if (Number.isNaN(base.getTime())) { toast(t('lesson.toast.invalidDate'), 'error'); return; }
    const gapN = Number.isNaN(gap) || gap < 0 ? 0 : gap;
    let cursor = new Date(base);
    for (const lesson of targets) {
      const s = new Date(cursor);
      const dl = new Date(cursor.getTime() + days * 86400000);
      if (autoUseTime) {
        const [hh, mm] = autoUseTime.split(':').map((v) => parseInt(v, 10));
        dl.setHours(hh || 0, mm || 0, 0, 0);
      } else {
        dl.setHours(23, 59, 0, 0);
      }
      onUpdateLesson(lesson.id, {
        startAt: s.toISOString(),
        deadline: dl.toISOString(),
      });
      cursor = new Date(cursor.getTime() + (days + gapN) * 86400000);
    }
    toast(t('lesson.toast.autoScheduled', { count: targets.length }), 'success');
    setSelectedLessonIds([]);
    setShowBulkSchedule(false);
  };

  // ─── Tree rendering helper ───────────────────────────────────
  const renderSidebarTree = (nodes: LessonFolderNode[], depth = 0): React.ReactNode => {
    const q = treeSearch.trim().toLowerCase();
    return nodes
      .filter((n) => {
        if (!q) return true;
        const matchesSelf = n.name.toLowerCase().includes(q);
        const matchesChild = (function hasMatchingChild(node: LessonFolderNode): boolean {
          return node.children.some((c) => c.name.toLowerCase().includes(q) || hasMatchingChild(c));
        })(n);
        return matchesSelf || matchesChild;
      })
      .map((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedFolders.has(node.id) || Boolean(q);
        const isSelected = currentFolderId === node.id;
        const count = getItemCountInFolder(node.id);

        return (
          <div key={node.id} className="select-none">
            <div
              className={`group flex items-center gap-1.5 rounded-xl py-1.5 pr-2 text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(node.id);
                  }}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                  />
                </button>
              ) : (
                <span className="w-4" />
              )}
              <div
                onClick={() => {
                  setCurrentFolderId(node.id);
                  setShowArchived(false);
                }}
                className="flex flex-1 items-center gap-2 min-w-0 cursor-pointer"
              >
                {(() => {
                  const nodeMeta = getFolderVisualMeta(node);
                  return <nodeMeta.Icon size={16} className={`shrink-0 ${nodeMeta.iconColor}`} />;
                })()}
                <span className="truncate">{node.name}</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {count}
                </span>
              </div>
              {canManage && canUserManageFolder(node) && (
                <div className="relative shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setMenuFolderId(menuFolderId === node.id ? null : node.id)}
                    className="rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200/60 hover:text-slate-700 transition-opacity"
                    title="Tùy chọn thư mục"
                  >
                    <MoreVertical size={13} />
                  </button>
                  {menuFolderId === node.id && (
                    <FolderActionMenu
                      folder={node}
                      onRename={() => {
                        setFolderToRename(node);
                        setRenameName(node.name);
                        setRenameColor(node.color ?? 'blue');
                        setRenameDescription(node.description ?? '');
                      }}
                      onMove={() => {
                        setFolderToMove(node);
                        setTargetParentId(node.parentId ?? null);
                      }}
                      onArchive={() => handleArchiveFolder(node)}
                      onRestore={() => handleRestoreFolder(node)}
                      onDelete={() => setFolderToDelete(node)}
                      onClose={() => setMenuFolderId(null)}
                    />
                  )}
                </div>
              )}
            </div>
            {hasChildren && isExpanded && (
              <div className="mt-0.5 space-y-0.5">
                {renderSidebarTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      {/* ─── Header & Total Count ─── */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">
          {canManage ? 'Quản lý bài học' : t('lesson.title')}
        </h2>
        <p className="text-sm text-slate-500">
          {allUnifiedLessons.length} bài học tổng cộng
        </p>
      </div>

      {/* ─── Category Filter Pills ─── */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const count = categoryCounts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                // If current folder has a different category, reset to root
                if (currentFolder && tab.key !== 'all' && currentFolder.categoryId !== tab.key) {
                  setCurrentFolderId(null);
                }
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-white' : tab.colorClass} />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Toolbar (Admin & Teacher) ─── */}
      {canManage && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreateFolder}
            className="flex items-center gap-1.5 rounded-xl border-2 border-blue-300 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 active:scale-[0.98]"
          >
            <FolderPlus size={16} /> Thư mục mới
          </button>
          <button
            onClick={handleTriggerNewLesson}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus size={16} /> Bài học mới
          </button>
          <button
            onClick={handleTriggerImport}
            className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 active:scale-[0.98]"
          >
            <FileSpreadsheet size={16} /> Nhập Excel
          </button>
          {canManage && (activeTab === 'cat-grammar' || activeTab === 'all') && onGrammarExamImport && (
            <button
              onClick={() => onGrammarExamImport(currentFolderId)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-teal-300 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-700 transition-all hover:bg-teal-100 active:scale-[0.98]"
              title="Nhập đề thi ngữ pháp JLPT (câu 31-50: trắc nghiệm & sắp xếp câu sao)"
            >
              <Award size={16} /> Nhập đề luyện thi
            </button>
          )}
          {canManage && (activeTab === 'cat-vocab' || activeTab === 'all') && onVocabExamImport && (
            <button
              onClick={() => onVocabExamImport(currentFolderId)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-[0.98]"
              title="Nhập đề luyện thi từ vựng JLPT"
            >
              <Award size={16} /> Nhập đề luyện thi
            </button>
          )}
          {canManage && (activeTab === 'cat-reading' || activeTab === 'all') && onReadingExamImport && (
            <button
              onClick={() => onReadingExamImport(currentFolderId)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-orange-300 bg-orange-50 px-3.5 py-2.5 text-xs font-semibold text-orange-800 transition-all hover:bg-orange-100 active:scale-[0.98]"
              title="Nhập đề luyện thi đọc hiểu JLPT"
            >
              <Award size={16} /> Nhập đề luyện thi
            </button>
          )}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
              showArchived
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Archive size={15} /> Lưu trữ
            {archivedCategoryFolders.length > 0 && ` (${archivedCategoryFolders.length})`}
          </button>
          {canManage && schedulableLessons.length > 0 && (
            <button
              onClick={openBulkSchedule}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-700 shadow-sm transition-all hover:bg-indigo-100"
            >
              <Layers size={15} /> Lịch học hàng loạt
            </button>
          )}

          {/* Nút Chọn tất cả bài học (Ngữ pháp hoặc Từ vựng) */}
          {(activeTab === 'cat-grammar' || activeTab === 'cat-vocab' || activeTab === 'all') && canManage && currentTabSelectableLessons.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (selectedLessonIds.length === currentTabSelectableLessons.length) {
                  setSelectedLessonIds([]);
                } else {
                  setSelectedLessonIds(currentTabSelectableLessons.map((l) => l.id));
                }
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
            >
              {selectedLessonIds.length === currentTabSelectableLessons.length ? (
                <>
                  <CheckSquare size={15} className="text-indigo-600" /> Bỏ chọn ({currentTabSelectableLessons.length})
                </>
              ) : (
                <>
                  <Square size={15} className="text-slate-400" /> Chọn tất cả ({currentTabSelectableLessons.length})
                </>
              )}
            </button>
          )}

          {canManage && selectedLessonIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setBulkMoveTargetFolderId(currentFolderId);
                setShowBulkMoveModal(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all animate-in fade-in"
            >
              <FolderInput size={15} />
              <span>Di chuyển {selectedLessonIds.length} bài</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Thanh thao tác hàng loạt (Bulk Action Bar) ─── */}
      {canManage && selectedLessonIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/95 p-3.5 shadow-sm backdrop-blur-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-xs">
              {selectedLessonIds.length}
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950">
                Đã chọn {selectedLessonIds.length} bài học
              </p>
              <p className="text-[11px] text-indigo-700">
                Di chuyển hàng loạt vào thư mục đích
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkMoveTargetFolderId(currentFolderId);
                setShowBulkMoveModal(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              <FolderInput size={15} /> Di chuyển {selectedLessonIds.length} bài
            </button>
          </div>
        </div>
      )}

      {/* ─── Two-Column Explorer Layout (Sidebar + Main Area) ─── */}
      <div className="flex gap-4">
        {/* ─── Tree Sidebar (Desktop) ─── */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">
              THƯ MỤC
            </p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="Lọc cây thư mục..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={() => {
                setCurrentFolderId(null);
                setShowArchived(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl py-2 px-2.5 text-left text-xs font-semibold transition-all ${
                currentFolderId === null && !showArchived
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <House size={16} className="text-blue-500" />
              <span>Trang chủ</span>
              <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                {homeItemsCount}
              </span>
            </button>
            <div className="mt-1 max-h-[60vh] space-y-0.5 overflow-y-auto">
              {renderSidebarTree(treeNodes)}
            </div>
            {archivedCategoryFolders.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <button
                  onClick={() => setShowArchived(true)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                    showArchived ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Archive size={14} /> Thư mục lưu trữ ({archivedCategoryFolders.length})
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ─── Main Explorer Area ─── */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb row */}
          <div className="mb-3 flex items-center gap-1.5 overflow-x-auto text-xs text-slate-600">
            <button
              onClick={() => {
                setCurrentFolderId(null);
                setShowArchived(false);
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-slate-100 hover:text-blue-600 transition-colors"
            >
              <House size={13} /> Trang chủ
            </button>
            {breadcrumb.map((crumb, idx) => (
              <div key={crumb.id} className="flex items-center gap-1.5 shrink-0">
                <ChevronRight size={13} className="text-slate-300" />
                <button
                  onClick={() => {
                    setCurrentFolderId(crumb.id);
                    setShowArchived(false);
                  }}
                  className={`rounded-lg px-2 py-1 font-medium transition-colors ${
                    idx === breadcrumb.length - 1
                      ? 'font-bold text-slate-900 bg-slate-100'
                      : 'hover:bg-slate-100 hover:text-blue-600'
                  }`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Controls: Search, Sort, Grid/List view */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm bài học, thư mục..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <ArrowUpDown size={13} />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as LessonExplorerSort)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400"
                >
                  <option value="name_asc">Tên (A-Z)</option>
                  <option value="name_desc">Tên (Z-A)</option>
                  <option value="updated_desc">Mới nhất</option>
                  <option value="updated_asc">Cũ nhất</option>
                </select>
              </div>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => toggleViewMode('grid')}
                  className={`rounded p-1 text-slate-500 transition-colors ${
                    viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-800'
                  }`}
                  title="Chế độ lưới"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleViewMode('list')}
                  className={`rounded p-1 text-slate-500 transition-colors ${
                    viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-800'
                  }`}
                  title="Chế độ danh sách"
                >
                  <ListIcon size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Search results mode */}
          {isSearching && searchResults && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-500">
                Kết quả tìm kiếm ({searchResults.matchedFolders.length} thư mục, {searchResults.matchedItems.length} bài học)
              </p>
              {searchResults.matchedFolders.length === 0 && searchResults.matchedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
                  <Inbox size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs text-slate-500">Không tìm thấy kết quả phù hợp</p>
                </div>
              ) : (
                <>
                  {searchResults.matchedFolders.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Thư mục</p>
                      <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 md:grid-cols-3' : 'space-y-2'}>
                        {searchResults.matchedFolders.map((f) => renderFolderCard(f))}
                      </div>
                    </div>
                  )}
                  {searchResults.matchedItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bài học</p>
                      <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'space-y-2'}>
                        {searchResults.matchedItems.map((item) => renderLessonCard(item))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Normal Explorer View */}
          {!isSearching && (
            <div className="space-y-6">
              {/* Subfolders section */}
              {sortedFolders.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {showArchived ? 'Thư mục đã lưu trữ' : 'Thư mục'} ({sortedFolders.length})
                    </p>
                  </div>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 md:grid-cols-3' : 'space-y-2'}>
                    {sortedFolders.map((f) => renderFolderCard(f))}
                  </div>
                </div>
              )}

              {/* Lessons section */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Bài học ({sortedItems.length})
                  </p>
                </div>
                {sortedItems.length > 0 ? (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'space-y-2'}>
                    {sortedItems.map((item) => renderLessonCard(item))}
                  </div>
                ) : (
                  sortedFolders.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
                      <Inbox size={36} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-medium text-slate-500">
                        {currentFolderId === null
                          ? 'Trang chủ chưa có nội dung'
                          : 'Thư mục này chưa có nội dung'}
                      </p>
                      {canManage && (
                        <div className="mt-3 flex items-center justify-center gap-2">
                          <button
                            onClick={handleOpenCreateFolder}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            + Thư mục mới
                          </button>
                          <button
                            onClick={handleTriggerNewLesson}
                            className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            + Bài học mới
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODALS & DIALOGS ─── */}

      {/* 1. Create Folder Modal */}
      {showCreateFolder && (
        <ModalBackdrop onClose={() => setShowCreateFolder(false)}>
          <ModalHeader
            title={currentFolder ? `Tạo thư mục trong "${currentFolder.name}"` : 'Tạo thư mục mới'}
            onClose={() => setShowCreateFolder(false)}
          />
          <form onSubmit={handleCreateFolderSubmit} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tên thư mục *</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="VD: Tuần 1, JLPT N3, Luyện tập..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả (tùy chọn)</label>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Mô tả ngắn gọn..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            {/* If at root and in 'all' tab, allow choosing category */}
            {currentFolderId === null && activeTab === 'all' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Danh mục bài học *</label>
                <select
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value as LessonFolderCategoryId)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                >
                  <option value="cat-grammar">Ngữ pháp</option>
                  <option value="cat-vocab">Từ vựng</option>
                  <option value="cat-listening">Nghe hiểu</option>
                  <option value="cat-reading">Đọc hiểu</option>
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Màu sắc</label>
              <ColorPicker selected={createColor} onChange={setCreateColor} />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateFolder(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
              >
                Tạo thư mục
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* 2. Rename Folder Modal */}
      {folderToRename && (
        <ModalBackdrop onClose={() => setFolderToRename(null)}>
          <ModalHeader title="Đổi tên / màu thư mục" onClose={() => setFolderToRename(null)} />
          <form onSubmit={handleRenameSubmit} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tên thư mục *</label>
              <input
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-600">Mô tả (tùy chọn)</label>
                <span className="text-[10px] text-slate-400">{renameDescription.length}/500</span>
              </div>
              <textarea
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Nhập mô tả thư mục..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Màu sắc</label>
              <ColorPicker selected={renameColor} onChange={setRenameColor} />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToRename(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
              >
                Lưu thay đổi
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* 3. Move Folder Modal */}
      {folderToMove && (
        <ModalBackdrop onClose={() => setFolderToMove(null)}>
          <ModalHeader title={`Di chuyển thư mục "${folderToMove.name}"`} onClose={() => setFolderToMove(null)} />
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">Chọn thư mục cha đích (cùng loại danh mục):</p>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-0.5">
              <button
                type="button"
                onClick={() => setTargetParentId(null)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  targetParentId === null ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <House size={14} className="text-blue-500" />
                <span>Trang chủ (cấp gốc)</span>
              </button>
              {renderDestinationFolders(
                folders.filter((f) => f.categoryId === folderToMove.categoryId && !f.archivedAt),
                null,
                0,
                targetParentId,
                new Set([folderToMove.id, ...collectDescendantFolderIds(folders, folderToMove.id)]),
                setTargetParentId
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToMove(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleMoveFolderSubmit}
                disabled={targetParentId === folderToMove.parentId}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm"
              >
                Xác nhận di chuyển
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* 4. Delete Folder Modal */}
      {folderToDelete && (() => {
        const childCount = getSubfolderCount(folderToDelete.id);
        const itemCount = getItemCountInFolder(folderToDelete.id);
        const isEmpty = childCount === 0 && itemCount === 0;

        return (
          <ModalBackdrop onClose={() => setFolderToDelete(null)}>
            <ModalHeader title={isEmpty ? 'Xóa thư mục' : 'Thư mục đang chứa nội dung'} onClose={() => setFolderToDelete(null)} />
            <div className="mt-3 space-y-3">
              {isEmpty ? (
                <p className="text-xs text-slate-600">
                  Bạn có chắc muốn xóa thư mục <strong>"{folderToDelete.name}"</strong>? Thao tác này không thể hoàn tác.
                </p>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">
                        Thư mục đang chứa {childCount} thư mục con và {itemCount} bài học.
                      </p>
                      <p className="mt-1 text-[11px] text-amber-700">
                        Do ràng buộc bảo vệ dữ liệu, bạn phải di chuyển hoặc xóa các nội dung bên trong trước, hoặc chọn <strong>Lưu trữ</strong> thư mục.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleArchiveFolder(folderToDelete);
                    setFolderToDelete(null);
                  }}
                  className="rounded-xl border border-amber-300 bg-amber-50 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Lưu trữ thư mục thay vì xóa
                </button>
                {isEmpty && (
                  <button
                    type="button"
                    onClick={handleDeleteFolderConfirm}
                    className="rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    Xác nhận xóa vĩnh viễn
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFolderToDelete(null)}
                  className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
              </div>
            </div>
          </ModalBackdrop>
        );
      })()}

      {/* 5. Move Lesson Modal */}
      {lessonToMove && (
        <ModalBackdrop onClose={() => setLessonToMove(null)}>
          <ModalHeader title={`Di chuyển "${lessonToMove.title}"`} onClose={() => setLessonToMove(null)} />
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">
              Chọn thư mục đích cho bài học ({lessonToMove.type === 'grammar' ? 'Ngữ pháp' : lessonToMove.type === 'vocab' ? 'Từ vựng' : lessonToMove.type === 'listening' ? 'Nghe hiểu' : 'Đọc hiểu'}):
            </p>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-0.5">
              <button
                type="button"
                onClick={() => setTargetItemFolderId(null)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  targetItemFolderId === null ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <House size={14} className="text-blue-500" />
                <span>🏠 Trang chủ (Không có thư mục)</span>
              </button>
              {renderDestinationFolders(
                folders.filter((f) => f.categoryId === lessonToMove.categoryId && !f.archivedAt),
                null,
                0,
                targetItemFolderId,
                teacherDisabledFolderIds,
                setTargetItemFolderId
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLessonToMove(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleMoveLessonSubmit}
                disabled={targetItemFolderId === lessonToMove.folderId}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm"
              >
                Di chuyển
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* 5b. Bulk Move Lessons Modal */}
      {showBulkMoveModal && selectedLessonIds.length > 0 && (() => {
        const selectedLessonsList = lessons.filter((l) => selectedLessonIds.includes(l.id));
        const targetCategory = activeTab === 'cat-vocab' ? 'cat-vocab' : activeTab === 'cat-grammar' ? 'cat-grammar' : null;
        const availableFoldersList = folders.filter((f) => {
          if (f.archivedAt) return false;
          if (targetCategory) return f.categoryId === targetCategory;
          return f.categoryId === 'cat-grammar' || f.categoryId === 'cat-vocab';
        });

        return (
          <ModalBackdrop onClose={() => !isBulkMoving && setShowBulkMoveModal(false)}>
            <ModalHeader
              title={`Di chuyển hàng loạt ${selectedLessonIds.length} bài học`}
              onClose={() => !isBulkMoving && setShowBulkMoveModal(false)}
            />
            <div className="mt-3 space-y-4">
              {/* Preview danh sách bài học đã chọn */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">
                    Danh sách bài học được chọn ({selectedLessonsList.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Cuộn để xem toàn bộ</span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 space-y-1.5 text-xs">
                  {selectedLessonsList.map((item) => {
                    const currentFolder = folders.find((f) => f.id === item.folderId);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 border border-slate-200 shadow-2xs"
                      >
                        <span className="font-semibold text-slate-800 truncate flex-1">{item.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-500 rounded bg-slate-100 px-1.5 py-0.5">
                          {currentFolder ? `📁 ${currentFolder.name}` : '🏠 Trang chủ'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bộ chọn thư mục đích */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-1.5">
                  Chọn thư mục đích:
                </p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-0.5 bg-white">
                  <button
                    type="button"
                    onClick={() => setBulkMoveTargetFolderId(null)}
                    className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      bulkMoveTargetFolderId === null
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <House size={14} className="text-blue-500" />
                    <span>🏠 Trang chủ (Không có thư mục)</span>
                  </button>
                  {renderDestinationFolders(
                    availableFoldersList,
                    null,
                    0,
                    bulkMoveTargetFolderId,
                    teacherDisabledFolderIds,
                    setBulkMoveTargetFolderId
                  )}
                </div>
              </div>

              {/* Nút thao tác */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isBulkMoving}
                  onClick={() => setShowBulkMoveModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isBulkMoving}
                  onClick={handleBulkMoveSubmit}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
                >
                  <FolderInput size={14} />
                  <span>
                    {isBulkMoving
                      ? `Đang di chuyển ${selectedLessonIds.length} bài...`
                      : `Xác nhận di chuyển (${selectedLessonIds.length} bài)`}
                  </span>
                </button>
              </div>
            </div>
          </ModalBackdrop>
        );
      })()}

      {/* 5c. Edit Lesson Modal */}
      {lessonToEdit && (
        <ModalBackdrop onClose={() => setLessonToEdit(null)}>
          <ModalHeader
            title={lessonToEdit.rawGrammarVocab?.lessonType === 'reading_exam'
              ? `Chỉnh sửa đề đọc hiểu: ${lessonToEdit.title}`
              : `Chỉnh sửa bài học: ${lessonToEdit.title}`}
            onClose={() => setLessonToEdit(null)}
          />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editLessonTitle.trim()) return;
              try {
                if (onUpdateLesson) {
                  await onUpdateLesson(lessonToEdit.id, {
                    title: editLessonTitle.trim(),
                    meaning: editLessonMeaning.trim(),
                    subjectId: editLessonSubjectId || undefined,
                    folderId: editLessonFolderId,
                    jlptLevel: editLessonJlptLevel,
                  });
                }
                toast('Đã cập nhật bài học thành công', 'success');
                setLessonToEdit(null);
              } catch (err: unknown) {
                toast(err instanceof Error ? err.message : 'Cập nhật thất bại', 'error');
              }
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tiêu đề bài học *</label>
              <input
                type="text"
                value={editLessonTitle}
                onChange={(e) => setEditLessonTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả / Phụ đề</label>
              <textarea
                value={editLessonMeaning}
                onChange={(e) => setEditLessonMeaning(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Môn học</label>
                <select
                  value={editLessonSubjectId}
                  onChange={(e) => setEditLessonSubjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                >
                  <option value="">-- Không chọn môn học --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Trình độ JLPT</label>
                <select
                  value={editLessonJlptLevel}
                  onChange={(e) => setEditLessonJlptLevel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                >
                  {['N1', 'N2', 'N3', 'N4', 'N5'].map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Thư mục</label>
              <select
                value={editLessonFolderId ?? ''}
                onChange={(e) => setEditLessonFolderId(e.target.value ? e.target.value : null)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
              >
                <option value="">Trang chủ (Không phân thư mục)</option>
                {folders
                  .filter((f) => f.categoryId === lessonToEdit.categoryId && !f.archivedAt)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
              </select>
            </div>

            {lessonToEdit.rawGrammarVocab?.lessonType === 'reading_exam' && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const l = lessonToEdit;
                    setLessonToEdit(null);
                    handleOpenItem(l);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors"
                >
                  <BookOpenText size={14} className="text-amber-700" />
                  <span>Quản lý nội dung đề ({lessonToEdit.rawGrammarVocab.passageCount || 1} đoạn, {lessonToEdit.rawGrammarVocab.examQuestionsCount || 0} câu)</span>
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLessonToEdit(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
              >
                Lưu bài học
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* 5d. Delete Lesson Confirmation Modal */}
      {lessonToDelete && (
        <ModalBackdrop onClose={() => setLessonToDelete(null)}>
          <ModalHeader
            title={lessonToDelete.rawGrammarVocab?.lessonType === 'reading_exam'
              ? 'Xác nhận xóa bài luyện thi Đọc hiểu'
              : 'Xác nhận xóa bài học'}
            onClose={() => setLessonToDelete(null)}
          />
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa {lessonToDelete.rawGrammarVocab?.lessonType === 'reading_exam' ? 'bài luyện thi Đọc hiểu' : 'bài học'}{' '}
              <span className="font-bold text-slate-800">"{lessonToDelete.title}"</span> không?
            </p>

            {lessonToDelete.rawGrammarVocab?.lessonType === 'reading_exam' && (
              <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Số đoạn văn:</span>
                  <span className="font-bold text-orange-800">{lessonToDelete.rawGrammarVocab?.passageCount || 1}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Số câu hỏi:</span>
                  <span className="font-bold text-orange-800">{lessonToDelete.rawGrammarVocab?.examQuestionsCount || 0}</span>
                </div>
                {lessonToDelete.rawGrammarVocab?.subjectName && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Môn học:</span>
                    <span className="font-bold text-slate-800">{lessonToDelete.rawGrammarVocab.subjectName}</span>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
              {lessonToDelete.rawGrammarVocab?.lessonType === 'reading_exam'
                ? 'Bạn có chắc chắn muốn xóa bài luyện thi Đọc hiểu này không? Toàn bộ đoạn văn, câu hỏi, tiến độ và liên kết liên quan của bài học sẽ bị xóa.'
                : 'Thao tác này sẽ xóa bài học và các dữ liệu liên quan. Không thể hoàn tác!'}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingLesson}
                onClick={() => setLessonToDelete(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingLesson}
                onClick={async () => {
                  if (onDeleteLesson) {
                    setIsDeletingLesson(true);
                    try {
                      await onDeleteLesson(lessonToDelete.id);
                      toast(`Đã xóa bài học "${lessonToDelete.title}"`, 'success');
                      setLessonToDelete(null);
                    } catch (err: unknown) {
                      toast(err instanceof Error ? err.message : 'Xóa thất bại', 'error');
                    } finally {
                      setIsDeletingLesson(false);
                    }
                  }
                }}
                className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {isDeletingLesson ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* 6. Choice Dialog: New Lesson */}
      {showNewChoice && (
        <ModalBackdrop onClose={() => setShowNewChoice(false)}>
          <ModalHeader title="Chọn loại bài học cần tạo" onClose={() => setShowNewChoice(false)} />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                setShowNewChoice(false);
                if (onImport) onImport(currentFolderId);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <BookOpen size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Ngữ pháp</span>
            </button>
            <button
              onClick={() => {
                setShowNewChoice(false);
                if (onVocabImport) onVocabImport('cat-vocab', currentFolderId);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-emerald-300 hover:bg-emerald-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Languages size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Từ vựng</span>
            </button>
            <button
              onClick={() => {
                setShowNewChoice(false);
                setCreatingListening(true);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-sky-300 hover:bg-sky-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Headphones size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Nghe hiểu</span>
            </button>
            <button
              onClick={() => {
                setShowNewChoice(false);
                setCreatingReading(true);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-amber-300 hover:bg-amber-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <FileText size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Đọc hiểu</span>
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* 7. Choice Dialog: Import Excel */}
      {showImportChoice && (
        <ModalBackdrop onClose={() => setShowImportChoice(false)}>
          <ModalHeader title="Chọn loại bài học cần nhập Excel" onClose={() => setShowImportChoice(false)} />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                setShowImportChoice(false);
                if (onImport) onImport(currentFolderId);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <BookOpen size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Excel Ngữ pháp</span>
            </button>
            {onGrammarExamImport && (
              <button
                onClick={() => {
                  setShowImportChoice(false);
                  onGrammarExamImport(currentFolderId);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-teal-300 hover:bg-teal-50/50 transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                  <Award size={20} />
                </div>
                <span className="text-xs font-bold text-slate-800">Đề Luyện Thi Ngữ Pháp (31-50)</span>
              </button>
            )}
            {onVocabExamImport && (
              <button
                onClick={() => {
                  setShowImportChoice(false);
                  onVocabExamImport(currentFolderId);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-amber-300 hover:bg-amber-50/50 transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Award size={20} />
                </div>
                <span className="text-xs font-bold text-slate-800">Đề Luyện Thi Từ Vựng</span>
              </button>
            )}
            {onReadingExamImport && (
              <button
                onClick={() => {
                  setShowImportChoice(false);
                  onReadingExamImport(currentFolderId);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-orange-300 hover:bg-orange-50/50 transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
                  <Award size={20} />
                </div>
                <span className="text-xs font-bold text-slate-800">Đề Luyện Thi Đọc Hiểu</span>
              </button>
            )}
            <button
              onClick={() => {
                setShowImportChoice(false);
                if (onVocabImport) onVocabImport('cat-vocab', currentFolderId);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-emerald-300 hover:bg-emerald-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Languages size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Excel Từ vựng</span>
            </button>
            <button
              onClick={() => {
                setShowImportChoice(false);
                setCreatingListening(true);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-sky-300 hover:bg-sky-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Headphones size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Excel Nghe hiểu</span>
            </button>
            <button
              onClick={() => {
                setShowImportChoice(false);
                setCreatingReading(true);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center hover:border-amber-300 hover:bg-amber-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <FileText size={20} />
              </div>
              <span className="text-xs font-bold text-slate-800">Excel Đọc hiểu</span>
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* 8. Listening Admin Modal */}
      {(creatingListening || editingListening) && (
        <ListeningAdminModal
          lesson={editingListening}
          targetFolderId={currentFolderId}
          onClose={() => {
            setCreatingListening(false);
            setEditingListening(null);
          }}
          onSaved={() => {
            setCreatingListening(false);
            setEditingListening(null);
            refreshListening();
          }}
        />
      )}

      {/* 9. Reading Admin Modal */}
      {(creatingReading || editingReading) && (
        <ReadingAdminModal
          lesson={editingReading}
          targetFolderId={currentFolderId}
          onClose={() => {
            setCreatingReading(false);
            setEditingReading(null);
          }}
          onSaved={() => {
            setCreatingReading(false);
            setEditingReading(null);
            refreshReading();
          }}
        />
      )}

      {/* ─── MODAL: LESSON ACCESS (ACL) ─── */}
      {accessLessonTarget && (
        <LessonAccessModal
          lesson={accessLessonTarget}
          currentUser={currentUser}
          onClose={() => setAccessLessonTarget(null)}
          onSuccess={async () => {
            const updated = await loadAllLessonGrants();
            setLessonGrants(updated);
            const subs = await loadSubjectItems();
            setSubjects(subs);
          }}
        />
      )}

      {/* 10. Bulk schedule editor modal */}
      {showBulkSchedule && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={() => setShowBulkSchedule(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{t('lesson.bulkSchedule')}</h3>
              <button onClick={() => setShowBulkSchedule(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <p className="mb-3 text-xs text-slate-400">{t('lesson.bulk.hint')}</p>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setBulkSelected(new Set(schedulableLessons.map((l) => l.id)))} className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-200">{t('lesson.bulk.selectAll')}</button>
              <button onClick={() => setBulkSelected(new Set())} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">{t('lesson.bulk.clearSelection')}</button>
              <span className="text-xs text-slate-400">{t('lesson.bulk.selectedCount', { sel: bulkSelected.size, total: schedulableLessons.length })}</span>
            </div>

            {/* Auto-schedule generator */}
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-700"><Zap size={13} /> {t('lesson.bulk.autoTitle')}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('lesson.bulk.startDate')}</label>
                  <input type="date" value={autoStart} onChange={(e) => setAutoStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('lesson.bulk.dailyDeadline')}</label>
                  <input type="time" value={autoUseTime} onChange={(e) => setAutoUseTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('lesson.bulk.daysPerLesson')}</label>
                  <input type="number" min={1} value={autoDaysPerLesson} onChange={(e) => setAutoDaysPerLesson(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{t('lesson.bulk.gapDays')}</label>
                  <input type="number" min={0} value={autoGapDays} onChange={(e) => setAutoGapDays(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
              </div>
              <button onClick={applyAutoSchedule} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-700">
                <Zap size={13} /> Áp dụng lịch tự động
              </button>
            </div>

            {/* Manual per-lesson schedule list */}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {schedulableLessons.map((lesson) => {
                const checked = bulkSelected.has(lesson.id);
                const entry = bulkEntries[lesson.id] ?? emptyScheduleEntry();
                const clsEntries = bulkClassEntries[lesson.id] ?? {};
                const clsOpen = bulkClassOpen[lesson.id] ?? false;
                const relevantClasses = lesson.targetClasses && !lesson.targetClasses.includes('Tất cả') && lesson.targetClasses.length > 0 ? lesson.targetClasses : classes;

                return (
                  <div key={lesson.id} className={`rounded-xl border p-2.5 transition-all ${checked ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white opacity-60'}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <input type="checkbox" checked={checked} onChange={() => {
                        setBulkSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(lesson.id)) next.delete(lesson.id);
                          else next.add(lesson.id);
                          return next;
                        });
                      }} className="rounded text-blue-600" />
                      <span className="text-xs font-bold text-slate-800 truncate">{lesson.title}</span>
                    </div>
                    {checked && (
                      <div className="space-y-2">
                        <ScheduleFields entry={entry} onChange={(patch) => setBulkEntry(lesson.id, patch)} />
                        {relevantClasses.length > 0 && (
                          <div className="border-t border-slate-100 pt-1.5">
                            <button
                              type="button"
                              onClick={() => setBulkClassOpen((prev) => ({ ...prev, [lesson.id]: !clsOpen }))}
                              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                            >
                              <Users size={11} /> {t('lesson.schedulePerClass')} {clsOpen ? '▲' : '▼'}
                            </button>
                            {clsOpen && (
                              <div className="mt-1 space-y-1.5 pl-2">
                                {relevantClasses.map((cls) => {
                                  const cEntry = clsEntries[cls] ?? emptyScheduleEntry();
                                  const rowKey = `${lesson.id}:${cls}`;
                                  const rowOpen = bulkClassRowOpen.has(rowKey);
                                  const hasVal = entryHasValue(cEntry);

                                  return (
                                    <div key={cls} className="rounded-lg border border-slate-100 bg-white p-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-slate-700">{cls}</span>
                                        <button
                                          type="button"
                                          onClick={() => setBulkClassRowOpen((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(rowKey)) next.delete(rowKey);
                                            else next.add(rowKey);
                                            return next;
                                          })}
                                          className={`text-[10px] font-medium ${hasVal ? 'text-emerald-600' : 'text-slate-400'}`}
                                        >
                                          {hasVal ? 'Lịch riêng' : 'Mặc định'} {rowOpen ? '▲' : '▼'}
                                        </button>
                                      </div>
                                      {rowOpen && (
                                        <div className="mt-1">
                                          <ScheduleFields entry={cEntry} onChange={(patch) => setBulkClassEntry(lesson.id, cls, patch)} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowBulkSchedule(false)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                {t('common.close')}
              </button>
              <button onClick={applyBulk} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm">
                {t('lesson.bulk.applySelected')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render Helper: Folder Card ──────────────────────────────
  function renderFolderCard(folder: LessonFolder) {
    const isList = viewMode === 'list';
    const visualMeta = getFolderVisualMeta(folder);
    const directCount = getItemCountInFolder(folder.id);
    const subCount = getSubfolderCount(folder.id);
    const isMenuOpen = menuFolderId === folder.id;

    if (isList) {
      return (
        <div
          key={folder.id}
          onClick={() => setCurrentFolderId(folder.id)}
          className={`group relative flex items-center justify-between rounded-xl border ${visualMeta.cardBorder} bg-white p-3 hover:shadow-xs ${visualMeta.cardHoverBorder} transition-all cursor-pointer`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* 1. Functional icon */}
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visualMeta.iconBg} ${visualMeta.iconColor}`}>
              <visualMeta.Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 2. Folder name */}
                <p className="truncate text-xs font-bold text-slate-800">{folder.name}</p>
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
              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                {directCount} bài học{subCount > 0 ? ` • ${subCount} thư mục con` : ''}
              </p>
            </div>
          </div>
          {canManage && canUserManageFolder(folder) && (
            <div className="relative shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuFolderId(isMenuOpen ? null : folder.id)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Tùy chọn thư mục"
              >
                <MoreVertical size={16} />
              </button>
              {isMenuOpen && (
                <FolderActionMenu
                  folder={folder}
                  onRename={() => {
                    setFolderToRename(folder);
                    setRenameName(folder.name);
                    setRenameColor(folder.color ?? 'blue');
                    setRenameDescription(folder.description ?? '');
                  }}
                  onMove={() => {
                    setFolderToMove(folder);
                    setTargetParentId(folder.parentId ?? null);
                  }}
                  onArchive={() => handleArchiveFolder(folder)}
                  onRestore={() => handleRestoreFolder(folder)}
                  onDelete={() => setFolderToDelete(folder)}
                  onClose={() => setMenuFolderId(null)}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={folder.id}
        onClick={() => setCurrentFolderId(folder.id)}
        className={`group relative flex flex-col justify-between rounded-2xl border ${visualMeta.cardBorder} bg-white p-3.5 shadow-xs transition-all ${visualMeta.cardHoverBorder} cursor-pointer min-h-[140px]`}
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
                  onRename={() => {
                    setFolderToRename(folder);
                    setRenameName(folder.name);
                    setRenameColor(folder.color ?? 'blue');
                    setRenameDescription(folder.description ?? '');
                  }}
                  onMove={() => {
                    setFolderToMove(folder);
                    setTargetParentId(folder.parentId ?? null);
                  }}
                  onArchive={() => handleArchiveFolder(folder)}
                  onRestore={() => handleRestoreFolder(folder)}
                  onDelete={() => setFolderToDelete(folder)}
                  onClose={() => setMenuFolderId(null)}
                />
              )}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex-1 flex flex-col justify-between">
          <div>
            {/* 2. Folder name */}
            <p className="truncate text-xs font-bold text-slate-800" title={folder.name}>{folder.name}</p>
            {/* 3. Description (line-clamp-2) */}
            {folder.description ? (
              <p className="line-clamp-2 text-[10px] text-slate-500 mt-1 min-h-[28px]" title={folder.description}>
                {folder.description}
              </p>
            ) : (
              <div className="min-h-[28px]" />
            )}
          </div>
          <div>
            {/* 4. Lesson count */}
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>{directCount} bài học</span>
              {subCount > 0 && <span>{subCount} thư mục con</span>}
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
  }

  // ─── Render Helper: Lesson Card ──────────────────────────────
  function renderLessonCard(item: UnifiedLesson) {
    const isList = viewMode === 'list';
    const isDone = completedIds.has(item.id);

    const isExamPractice = item.type === 'grammar' && (item.rawGrammarVocab?.lessonType === 'grammar_exam' || (item.rawGrammarVocab?.examQuestionsCount ?? 0) > 0);
    const isVocabExam = item.rawGrammarVocab?.lessonType === 'vocabulary_exam';
    const isReadingExam = item.rawGrammarVocab?.lessonType === 'reading_exam';

    const typeMeta = isReadingExam
      ? { label: `Luyện thi Đọc hiểu ${item.rawGrammarVocab?.jlptLevel || 'N2'}`, badge: 'bg-orange-50 text-orange-800 border-orange-200' }
      : isVocabExam
      ? { label: `Luyện thi Từ vựng ${item.rawGrammarVocab?.jlptLevel || 'N2'}`, badge: 'bg-amber-50 text-amber-800 border-amber-200' }
      : isExamPractice
      ? { label: `Luyện thi ${item.rawGrammarVocab?.jlptLevel || 'N2'}`, badge: 'bg-teal-50 text-teal-700 border-teal-200' }
      : {
          grammar: { label: 'Ngữ pháp', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
          vocab: { label: 'Từ vựng', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          listening: { label: 'Nghe hiểu', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
          reading: { label: 'Đọc hiểu', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
        }[item.type];

    // Schedule status for grammar/vocab
    const schedule = item.rawGrammarVocab
      ? getEffectiveLessonSchedule(item.rawGrammarVocab, categories.find((c) => c.id === item.categoryId) ?? null, currentUser)
      : { startAt: null, deadline: null };
    const schedStatus = getLessonTimeStatus(schedule);
    const hasSched = hasSchedule(schedule);

    if (isList) {
      return (
        <div
          key={item.id}
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 hover:shadow-xs transition-all"
        >
          <div
            onClick={() => handleOpenItem(item)}
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
          >
            {canManage && (item.type === 'grammar' || item.type === 'vocab' || item.type === 'reading') && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedLessonIds((prev) =>
                    prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                  );
                }}
                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                title={selectedLessonIds.includes(item.id) ? 'Bỏ chọn' : 'Chọn bài học'}
              >
                {selectedLessonIds.includes(item.id) ? (
                  <CheckSquare size={17} className="text-indigo-600" />
                ) : (
                  <Square size={17} />
                )}
              </button>
            )}
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isDone ? <CheckCircle2 size={16} /> : <span>{item.sortOrder || '•'}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${typeMeta.badge}`}>
                  {typeMeta.label}
                </span>
                {item.rawGrammarVocab && (
                  item.rawGrammarVocab.subjectId ? (
                    <span className="rounded bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.2 text-[9px] font-bold truncate max-w-[120px]">
                      📚 {subjectMap.get(item.rawGrammarVocab.subjectId) || item.rawGrammarVocab.subjectName || item.rawGrammarVocab.subjectId}
                    </span>
                  ) : (
                    <span className="rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 text-[9px] font-bold flex items-center gap-1">
                      ⚠️ Chưa có môn học
                    </span>
                  )
                )}
                <p className="truncate text-xs font-bold text-slate-800">{item.title}</p>
                {item.folderId && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-500 truncate max-w-[120px]">
                    📁 Thư mục
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-400 truncate">{item.subtitle}</p>
                {isVocabExam && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 bg-amber-50 px-1 rounded border border-amber-200">
                    <Award size={9} /> {item.rawGrammarVocab?.examQuestionsCount ?? 0} câu hỏi
                  </span>
                )}
                {isReadingExam && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-orange-800 bg-orange-50 px-1 rounded border border-orange-200">
                    <BookOpenText size={9} /> {item.rawGrammarVocab?.passageCount || 1} đoạn • {item.rawGrammarVocab?.examQuestionsCount ?? 0} câu
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLessonToMove(item);
                    setTargetItemFolderId(item.folderId);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                  title="Di chuyển bài học vào thư mục"
                >
                  <FolderInput size={12} /> Di chuyển
                </button>
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.canManage) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAccessLessonTarget(item.rawGrammarVocab!);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs"
                    title="Cấp quyền bài học"
                  >
                    <Shield size={12} className="text-indigo-600" /> Cấp quyền
                  </button>
                )}
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.canEdit) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLessonToEdit(item);
                      setEditLessonTitle(item.title);
                      setEditLessonMeaning(item.subtitle);
                      setEditLessonSubjectId(item.rawGrammarVocab?.subjectId || '');
                      setEditLessonJlptLevel(item.rawGrammarVocab?.jlptLevel || 'N2');
                      setEditLessonFolderId(item.folderId || null);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                    title="Chỉnh sửa bài học"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.isOwner) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLessonToDelete(item);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Xóa bài học"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </>
            )}
            {canManage && item.rawListening && (
              <button
                type="button"
                onClick={() => setEditingListening(item.rawListening!)}
                className="rounded-lg p-1 text-slate-400 hover:text-blue-600"
                title="Sửa bài nghe"
              >
                <Pencil size={13} />
              </button>
            )}
            {canManage && item.rawReading && (
              <button
                type="button"
                onClick={() => setEditingReading(item.rawReading!)}
                className="rounded-lg p-1 text-slate-400 hover:text-blue-600"
                title="Sửa bài đọc"
              >
                <Pencil size={13} />
              </button>
            )}
            <button
              onClick={() => handleOpenItem(item)}
              className="rounded-lg p-1 text-slate-300 hover:text-blue-500"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-blue-200 hover:shadow-md"
      >
        <div className="flex items-start gap-3">
          {canManage && (item.type === 'grammar' || item.type === 'vocab' || item.type === 'reading') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLessonIds((prev) =>
                  prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                );
              }}
              className="mt-1 p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title={selectedLessonIds.includes(item.id) ? 'Bỏ chọn' : 'Chọn bài học'}
            >
              {selectedLessonIds.includes(item.id) ? (
                <CheckSquare size={17} className="text-indigo-600" />
              ) : (
                <Square size={17} />
              )}
            </button>
          )}
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
              isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isDone ? <CheckCircle2 size={18} /> : <span>{item.sortOrder || '•'}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${typeMeta.badge}`}>
                {typeMeta.label}
              </span>
              {item.rawGrammarVocab && (
                item.rawGrammarVocab.subjectId ? (
                  <span className="rounded bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.2 text-[9px] font-bold truncate max-w-[120px]">
                    📚 {subjectMap.get(item.rawGrammarVocab.subjectId) || item.rawGrammarVocab.subjectName || item.rawGrammarVocab.subjectId}
                  </span>
                ) : (
                  <span className="rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 text-[9px] font-bold flex items-center gap-1">
                    ⚠️ Chưa có môn học
                  </span>
                )
              )}
              {item.folderId && (
                <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-500">
                  📁 Thư mục
                </span>
              )}
            </div>
            <button onClick={() => handleOpenItem(item)} className="text-left w-full">
              <p className="text-sm font-bold text-slate-800 leading-tight">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{item.subtitle}</p>

              {/* Extra stats */}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                {item.type === 'vocab' && (
                  isVocabExam ? (
                    <span className="flex items-center gap-1 font-semibold text-amber-700">
                      <Award size={10} /> {item.rawGrammarVocab?.examQuestionsCount ?? 0} câu hỏi luyện thi
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <BookOpen size={10} /> {vocabCounts[item.id] ?? 0} từ vựng
                    </span>
                  )
                )}
                {item.type === 'grammar' && item.rawGrammarVocab && (
                  isExamPractice ? (
                    <span className="flex items-center gap-1 font-semibold text-teal-700">
                      <Award size={10} /> {item.rawGrammarVocab.examQuestionsCount ?? 20} câu hỏi luyện thi
                    </span>
                  ) : grammarCounts[item.id] ? (
                    <span className="flex items-center gap-1 font-semibold text-indigo-700">
                      <BookOpen size={10} /> {grammarCounts[item.id]} mục ngữ pháp
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1">
                        <BookOpen size={10} /> {item.rawGrammarVocab.examples?.length ?? 0} ví dụ
                      </span>
                      <span>{item.rawGrammarVocab.exercises?.length ?? 0} bài tập</span>
                    </>
                  )
                )}
                {item.type === 'listening' && item.rawListening && (
                  <span>{item.rawListening.level}</span>
                )}
                {item.type === 'reading' && (
                  isReadingExam ? (
                    <span className="flex items-center gap-1 font-semibold text-orange-800">
                      <BookOpenText size={10} /> {item.rawGrammarVocab?.passageCount || 1} đoạn văn • {item.rawGrammarVocab?.examQuestionsCount || 0} câu hỏi luyện thi
                    </span>
                  ) : item.rawReading ? (
                    <span>{item.rawReading.level}</span>
                  ) : (
                    <span>Đọc hiểu</span>
                  )
                )}
              </div>

              {/* Schedule status (grammar/vocab) */}
              {hasSched && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LESSON_STATUS_META[schedStatus].cls}`}>
                    <Clock size={9} /> {t(LESSON_STATUS_META[schedStatus].label)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {schedule.startAt ? t('lesson.from', { date: fmtDate(schedule.startAt) }) : t('lesson.status.noLimit')}
                    {schedule.startAt && schedule.deadline ? ' → ' : ''}
                    {schedule.deadline ? t('lesson.until', { date: fmtDate(schedule.deadline) }) : ''}
                  </span>
                </div>
              )}
            </button>

            {/* Actions row */}
            {canManage && (
              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLessonToMove(item);
                    setTargetItemFolderId(item.folderId);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                >
                  <FolderInput size={11} /> Di chuyển
                </button>
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.canManage) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAccessLessonTarget(item.rawGrammarVocab!);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs"
                    title="Cấp quyền bài học"
                  >
                    <Shield size={11} className="text-indigo-600" /> Cấp quyền
                  </button>
                )}
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.canEdit) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLessonToEdit(item);
                      setEditLessonTitle(item.title);
                      setEditLessonMeaning(item.subtitle);
                      setEditLessonSubjectId(item.rawGrammarVocab?.subjectId || '');
                      setEditLessonJlptLevel(item.rawGrammarVocab?.jlptLevel || 'N2');
                      setEditLessonFolderId(item.folderId || null);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                  >
                    <Pencil size={11} /> Sửa
                  </button>
                )}
                {item.rawGrammarVocab && (currentUser.role === 'admin' || item.rawGrammarVocab.createdBy === currentUser.id || effectiveLessonAccessMap.get(item.id)?.isOwner) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLessonToDelete(item);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 size={11} /> Xóa
                  </button>
                )}
                {item.rawListening && (
                  <button
                    type="button"
                    onClick={() => setEditingListening(item.rawListening!)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <Pencil size={11} /> Sửa
                  </button>
                )}
                {item.rawReading && (
                  <button
                    type="button"
                    onClick={() => setEditingReading(item.rawReading!)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <Pencil size={11} /> Sửa
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => handleOpenItem(item)} className="shrink-0 self-center">
            <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
          </button>
        </div>
      </div>
    );
  }
}

// ─── Sub-components: Modals & Pickers ──────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
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
