import type { Exam, User, CompletionRecord, ExamResult, Lesson, LessonCategory, VocabularyItem, GrammarItem, GrammarItemExample, GrammarItemExercise, GrammarItemAnswer, KanjiBreakdownItem, VocabProgress, GrammarProgress, FlashcardSettings, MasteryStatus, ListeningLesson, ListeningQuestion, ListeningQuestionFull, ListeningAnswerKey, ListeningAttempt, ListeningAttemptResult, ListeningAttemptReviewDetail, ListeningSourceType, ReadingLesson, ReadingQuestionFull, ReadingQuestionSafe, ReadingGrammar, ReadingResult, ReadingAnswerDetail, ReadingProgressRecord, ReadingUiState, ExamFolder, PracticeFolder, Practice, PracticeQuestion, PracticeQuestionFull, PracticeAnswerDetail, PracticeAttempt, PracticeAttemptResult, PracticeProgress, ExamQuestion, ExamQuestionType, ExamQuestionProgress, VocabExamOptionDetails, ReadingExamPassage } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ─── LocalStorage keys (fallback) ──────────────────────────────

const LS_EXAMS = 'quizforms_exams';
const LS_USERS = 'quizforms_users';
const LS_SESSION = 'quizforms_session';
const LS_COMPLETIONS = 'quizforms_completions';
const LS_SUBJECTS = 'quizforms_subjects';
const LS_CLASSES = 'quizforms_classes';
const LS_RESULTS = 'quizforms_exam_results';
const LS_CATEGORIES = 'quizforms_lesson_categories';

// ─── Subject metadata (color mapping) ──────────────────────────

const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  'Toán': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Lý':   { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  'Hóa':  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'Văn':  { bg: 'bg-rose-100', text: 'text-rose-700' },
  'Anh':  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'Sử':   { bg: 'bg-amber-100', text: 'text-amber-700' },
  'Địa':  { bg: 'bg-teal-100', text: 'text-teal-700' },
  'Sinh': { bg: 'bg-lime-100', text: 'text-lime-700' },
  'Tin':  { bg: 'bg-violet-100', text: 'text-violet-700' },
};

const FALLBACK_COLORS = [
  { bg: 'bg-slate-100', text: 'text-slate-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
];

export function getSubjectMeta(subject: string) {
  const meta = SUBJECT_COLORS[subject];
  if (meta) return meta;
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = ((hash << 5) - hash) + subject.charCodeAt(i);
    hash |= 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// ─── Default subjects (start empty by default) ────────────────


// ─── Seed data ─────────────────────────────────────────────────

const now = new Date();
const inDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

const SEED_USERS: User[] = [
  { id: 'user-admin', username: 'admin', password: 'admin123', fullName: 'Quản Trị Viên', role: 'admin', assignedClasses: [], allowedSubjects: [] },
  { id: 'user-teacher', username: 'teacher', password: 'teacher123', fullName: 'Thầy Nguyễn Văn Khoa', role: 'teacher', assignedClasses: [], allowedSubjects: [] },
  { id: 'user-hs-10a1', username: 'hs_10a1', password: '123456', fullName: 'Nguyễn Văn An', role: 'student', assignedClasses: [], allowedSubjects: [] },
];

const SEED_EXAMS: Exam[] = [
  {
    id: 'exam-001',
    title: 'Kiểm tra Toán 15 phút - Đạo hàm',
    subject: 'Toán',
    grade: '12',
    durationMinutes: 15,
    deadline: inDays(3),
    status: 'open',
    formsUrl: 'https://forms.office.com/Pages/ResponsePage.aspx?id=test123',
    targetClasses: [],
    classDeadlines: {},
    folderId: null,
    createdAt: inDays(-7),
  },
  {
    id: 'exam-002',
    title: 'Kiểm tra 15 phút English Vocabulary',
    subject: 'Anh',
    grade: '10',
    durationMinutes: 15,
    deadline: inDays(1),
    status: 'open',
    formsUrl: 'https://forms.office.com/Pages/ResponsePage.aspx?id=test456',
    targetClasses: [],
    classDeadlines: {},
    folderId: null,
    createdAt: inDays(-5),
  },
];

const SEED_COMPLETIONS: CompletionRecord[] = [];

const SEED_CATEGORIES: LessonCategory[] = [
  { id: 'cat-grammar', title: 'Bài học Ngữ pháp', icon: 'BookOpen', teacherName: 'Thầy Nguyễn Văn Khoa', targetClasses: [], sortOrder: 1, defaultStartAt: null, defaultDeadline: null, classSchedules: {}, createdAt: new Date().toISOString() },
  { id: 'cat-vocab', title: 'Bài học Từ vựng', icon: 'Languages', teacherName: 'Thầy Nguyễn Văn Khoa', targetClasses: [], sortOrder: 2, defaultStartAt: null, defaultDeadline: null, classSchedules: {}, createdAt: new Date().toISOString() },
  { id: 'cat-listening', title: 'Bài học Nghe', icon: 'Headphones', teacherName: 'Thầy Nguyễn Văn Khoa', targetClasses: [], sortOrder: 3, defaultStartAt: null, defaultDeadline: null, classSchedules: {}, createdAt: new Date().toISOString() },
  { id: 'cat-reading', title: 'Bài học Đọc', icon: 'BookOpen', teacherName: 'Thầy Nguyễn Văn Khoa', targetClasses: [], sortOrder: 4, defaultStartAt: null, defaultDeadline: null, classSchedules: {}, createdAt: new Date().toISOString() },
];

// ─── Real-time event bus (for LocalStorage mode) ───────────────

export const DATA_CHANGE_EVENT = 'quizforms-data-change';

function dispatchDataChange(type: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail: { type } }));
}

export function onDataChange(callback: (type: string) => void) {
  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    callback(ce.detail?.type ?? 'unknown');
  };
  window.addEventListener(DATA_CHANGE_EVENT, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === LS_EXAMS) callback('exams');
    if (e.key === LS_RESULTS) callback('results');
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(DATA_CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// ─── Supabase realtime subscriptions ───────────────────────────

export function subscribeToExams(callback: () => void) {
  if (!supabase) return () => {};
  const sb = supabase;
  const channel = sb
    .channel('exams-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, callback)
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

export function subscribeToResults(callback: () => void) {
  if (!supabase) return () => {};
  const sb = supabase;
  const channel = sb
    .channel('results-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, callback)
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

// ─── Helpers ───────────────────────────────────────────────────

export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function examVisibleForUser(
  exam: Exam,
  user: User,
  effectiveFolderAccessMap?: Map<string, { canView: boolean; canManage: boolean; canEdit: boolean }>
): boolean {
  if (user.role === 'admin' || user.role === 'teacher') return true;
  if (user.allowedSubjects.length > 0 && !user.allowedSubjects.includes(exam.subject)) return false;

  // 1. Folder ACL check
  if (effectiveFolderAccessMap && exam.folderId) {
    const access = effectiveFolderAccessMap.get(exam.folderId);
    if (access !== undefined) {
      return access.canView;
    }
  }

  // 2. Legacy fallback
  if (exam.targetClasses.includes('Tất cả')) return true;
  if (exam.targetClasses.length === 0) return true;
  const classMatch = exam.targetClasses.some((cls) => user.assignedClasses.includes(cls));
  if (!classMatch) return false;
  return true;
}

// ─── Per-class deadlines ───────────────────────────────────────

/** Effective deadline for a user: their class's override, else the exam default. */
export function getEffectiveDeadline(exam: Exam, user: Pick<User, 'role' | 'assignedClasses'>): string {
  if (user.role === 'admin' || user.role === 'teacher') return exam.deadline;
  const overrides = exam.classDeadlines ?? {};
  for (const cls of user.assignedClasses) {
    const override = overrides[cls];
    if (override) return override;
  }
  return exam.deadline;
}

/** True when the user's class-specific deadline has passed (exam status is per-exam, not per-class). */
export function isExpiredForUser(exam: Exam, user: Pick<User, 'role' | 'assignedClasses'>): boolean {
  return new Date(getEffectiveDeadline(exam, user)).getTime() < Date.now();
}

// ─── Lesson learning-time schedule (inheritance chain) ────────

export interface LessonSchedule {
  startAt: string | null;
  deadline: string | null;
}

type ScheduleOverride = { startAt: string | null; deadline: string | null } | undefined;

/**
 * Effective learning window for a lesson, resolved for a user's class:
 *   lesson+class override → lesson override → category+class override → category default
 * Any level missing means fall through; final null = no time limit for that field.
 */
export function getEffectiveLessonSchedule(
  lesson: Lesson,
  category: LessonCategory | null,
  user: Pick<User, 'role' | 'assignedClasses'>
): LessonSchedule {
  if (user.role !== 'student' || user.assignedClasses.length === 0) {
    return {
      startAt: lesson.startAt ?? category?.defaultStartAt ?? null,
      deadline: lesson.deadline ?? category?.defaultDeadline ?? null,
    };
  }
  let startAt: string | null = null;
  let deadline: string | null = null;
  for (const cls of user.assignedClasses) {
    const lessonOverride = (lesson.classSchedules ?? {})[cls] as ScheduleOverride;
    if (lessonOverride && (lessonOverride.startAt || lessonOverride.deadline)) {
      return {
        startAt: lessonOverride.startAt ?? lesson.startAt ?? category?.defaultStartAt ?? null,
        deadline: lessonOverride.deadline ?? lesson.deadline ?? category?.defaultDeadline ?? null,
      };
    }
  }
  startAt = lesson.startAt;
  deadline = lesson.deadline;
  if (startAt === null && deadline === null) {
    for (const cls of user.assignedClasses) {
      const catOverride = (category?.classSchedules ?? {})[cls] as ScheduleOverride;
      if (catOverride && (catOverride.startAt || catOverride.deadline)) {
        return {
          startAt: catOverride.startAt ?? category?.defaultStartAt ?? null,
          deadline: catOverride.deadline ?? category?.defaultDeadline ?? null,
        };
      }
    }
    return {
      startAt: category?.defaultStartAt ?? null,
      deadline: category?.defaultDeadline ?? null,
    };
  }
  return {
    startAt: startAt ?? category?.defaultStartAt ?? null,
    deadline: deadline ?? category?.defaultDeadline ?? null,
  };
}

export type LessonTimeStatus = 'no_limit' | 'upcoming' | 'active' | 'ending_soon' | 'expired';

const ENDING_SOON_MS = 3 * 86400000;

/** Time-window status of a lesson for a specific user's class. */
export function getLessonTimeStatus(schedule: LessonSchedule): LessonTimeStatus {
  const { startAt, deadline } = schedule;
  if (!startAt && !deadline) return 'no_limit';
  const now = Date.now();
  const startMs = startAt ? new Date(startAt).getTime() : null;
  const deadlineMs = deadline ? new Date(deadline).getTime() : null;
  if (startMs !== null && now < startMs) return 'upcoming';
  if (deadlineMs !== null && now >= deadlineMs) return 'expired';
  if (deadlineMs !== null && deadlineMs - now <= ENDING_SOON_MS) return 'ending_soon';
  return 'active';
}

export function isExamCompletedByUser(examId: string, userId: string, completions: CompletionRecord[]): boolean {
  return completions.some((c) => c.examId === examId && c.userId === userId);
}

// ─── Subjects ──────────────────────────────────────────────────

export function normalizeSubjectName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').normalize('NFC').toLowerCase();
}

export interface SubjectUsageInfo {
  inUse: boolean;
  userCount: number;
  users: Array<{ id: string; username: string; fullName: string; role: string }>;
}

export async function checkSubjectUsage(name: string): Promise<SubjectUsageInfo> {
  const cleanName = name.trim();
  const normalized = normalizeSubjectName(cleanName);
  let userCount = 0;
  const usersWithSubject: Array<{ id: string; username: string; fullName: string; role: string }> = [];

  if (supabase) {
    const { data: users } = await supabase
      .from('app_users')
      .select('id, username, full_name, role, allowed_subjects');
    if (users) {
      for (const u of users) {
        const allowed = Array.isArray(u.allowed_subjects) ? (u.allowed_subjects as string[]) : [];
        if (allowed.some((s) => normalizeSubjectName(s) === normalized)) {
          userCount++;
          usersWithSubject.push({
            id: u.id,
            username: u.username,
            fullName: u.full_name,
            role: u.role,
          });
        }
      }
    }
  }

  return {
    inUse: userCount > 0,
    userCount,
    users: usersWithSubject,
  };
}

export interface SubjectItem {
  id: string;
  name: string;
}

export async function loadSubjectItems(): Promise<SubjectItem[]> {
  if (supabase) {
    const { data, error } = await supabase.from('subjects').select('id, name').order('name');
    if (data && !error && data.length > 0) {
      return data.map((r) => ({ id: r.id as string, name: r.name as string }));
    }
  }
  const raw = localStorage.getItem(LS_SUBJECTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s, idx) => (typeof s === 'string' ? { id: `sub-local-${idx}`, name: s } : s));
  } catch {
    return [];
  }
}

export async function loadSubjects(): Promise<string[]> {
  if (supabase) {
    const { data, error } = await supabase.from('subjects').select('name').order('name');
    if (data && !error) return data.map((r) => r.name);
    return [];
  }
  const raw = localStorage.getItem(LS_SUBJECTS);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addSubject(name: string): Promise<string[]> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName) {
    throw new Error('Tên môn học không được để trống.');
  }

  const current = await loadSubjects();
  const normalized = normalizeSubjectName(cleanName);
  const exists = current.some((s) => normalizeSubjectName(s) === normalized);
  if (exists) {
    throw new Error('Môn học này đã tồn tại.');
  }

  if (supabase) {
    const id = generateId('sub');
    const { error: insErr } = await supabase.from('subjects').insert({
      id,
      name: cleanName,
      normalized_name: normalized,
    });

    if (insErr) {
      // Fallback if normalized_name column is not in remote schema
      if (insErr.message?.includes('normalized_name') || insErr.code === '42703') {
        const { error: fallbackErr } = await supabase.from('subjects').insert({
          id,
          name: cleanName,
        });
        if (fallbackErr) throw fallbackErr;
      } else {
        throw insErr;
      }
    }
    return loadSubjects();
  }

  const next = [...current, cleanName];
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(next));
  dispatchDataChange('subjects');
  return next;
}

export async function createSubject(name: string): Promise<SubjectItem> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName) {
    throw new Error('Tên môn học không được để trống.');
  }
  const id = generateId('sub');
  if (supabase) {
    const normalized = normalizeSubjectName(cleanName);
    const { error: insErr } = await supabase.from('subjects').insert({
      id,
      name: cleanName,
      normalized_name: normalized,
    });
    if (insErr) {
      if (insErr.message?.includes('normalized_name') || insErr.code === '42703') {
        const { error: fallbackErr } = await supabase.from('subjects').insert({
          id,
          name: cleanName,
        });
        if (fallbackErr) throw fallbackErr;
      } else {
        throw insErr;
      }
    }
    dispatchDataChange('subjects');
    return { id, name: cleanName };
  }
  const raw = localStorage.getItem(LS_SUBJECTS);
  const list = raw ? JSON.parse(raw) : [];
  list.push({ id, name: cleanName });
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(list));
  dispatchDataChange('subjects');
  return { id, name: cleanName };
}

export async function updateSubject(oldName: string, newName: string): Promise<string[]> {
  const cleanNew = newName.trim().replace(/\s+/g, ' ');
  if (!cleanNew) {
    throw new Error('Tên môn học không được để trống.');
  }
  const current = await loadSubjects();
  const normalizedNew = normalizeSubjectName(cleanNew);
  const normalizedOld = normalizeSubjectName(oldName);

  if (normalizedNew !== normalizedOld) {
    const exists = current.some((s) => normalizeSubjectName(s) === normalizedNew);
    if (exists) {
      throw new Error('Môn học này đã tồn tại.');
    }
  }

  if (supabase) {
    const { error: updErr } = await supabase
      .from('subjects')
      .update({ name: cleanNew, normalized_name: normalizedNew })
      .eq('name', oldName);

    if (updErr && (updErr.message?.includes('normalized_name') || updErr.code === '42703')) {
      await supabase.from('subjects').update({ name: cleanNew }).eq('name', oldName);
    }

    // Cascade rename to app_users.allowed_subjects
    const { data: users } = await supabase.from('app_users').select('id, allowed_subjects');
    if (users) {
      for (const u of users) {
        if (Array.isArray(u.allowed_subjects) && u.allowed_subjects.includes(oldName)) {
          const updated = u.allowed_subjects.map((s: string) => (s === oldName ? cleanNew : s));
          await supabase.from('app_users').update({ allowed_subjects: updated }).eq('id', u.id);
        }
      }
    }

    return loadSubjects();
  }

  const next = current.map((s) => (s === oldName ? cleanNew : s));
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(next));
  dispatchDataChange('subjects');
  return next;
}

export async function removeSubject(name: string, force = false): Promise<string[]> {
  if (!force) {
    const usage = await checkSubjectUsage(name);
    if (usage.inUse) {
      throw new Error(
        `Không thể xóa môn "${name}": Hiện có ${usage.userCount} tài khoản đang được gán môn này. Vui lòng gỡ liên kết trước khi xóa.`
      );
    }
  }

  if (supabase) {
    await supabase.from('subjects').delete().eq('name', name);
    return loadSubjects();
  }
  const current = await loadSubjects();
  const next = current.filter((s) => s !== name);
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(next));
  dispatchDataChange('subjects');
  return next;
}

// ─── Classes (empty by default) ────────────────────────────────

export async function loadClasses(): Promise<string[]> {
  if (supabase) {
    const { data } = await supabase.from('classes').select('name').order('name');
    if (data) return data.map((r) => r.name);
    return [];
  }
  const raw = localStorage.getItem(LS_CLASSES);
  if (!raw) {
    localStorage.setItem(LS_CLASSES, JSON.stringify([]));
    return [];
  }
  return JSON.parse(raw);
}

export async function addClass(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (supabase) {
    await supabase.from('classes').insert({ id: generateId('cls'), name: trimmed });
    return loadClasses();
  }
  const current = await loadClasses();
  if (!current.includes(trimmed)) {
    const next = [...current, trimmed];
    localStorage.setItem(LS_CLASSES, JSON.stringify(next));
    dispatchDataChange('classes');
    return next;
  }
  return current;
}

export async function removeClass(name: string): Promise<string[]> {
  if (supabase) {
    await supabase.from('classes').delete().eq('name', name);
    return loadClasses();
  }
  const current = await loadClasses();
  const next = current.filter((c) => c !== name);
  localStorage.setItem(LS_CLASSES, JSON.stringify(next));
  dispatchDataChange('classes');
  return next;
}

// ─── Exams ─────────────────────────────────────────────────────

function mapExamRow(r: Record<string, unknown>): Exam {
  return {
    id: r.id as string,
    title: r.title as string,
    subject: r.subject as string,
    grade: (r.grade as string) ?? '',
    durationMinutes: (r.duration_minutes as number) ?? 15,
    deadline: r.deadline as string,
    status: r.status as Exam['status'],
    formsUrl: r.forms_url as string,
    targetClasses: (r.target_classes as string[]) ?? [],
    classDeadlines: (r.class_deadlines as Record<string, string>) ?? {},
    folderId: (r.folder_id as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function examToRow(e: Omit<Exam, 'id' | 'createdAt'>) {
  return {
    title: e.title,
    subject: e.subject,
    grade: e.grade,
    duration_minutes: e.durationMinutes,
    deadline: e.deadline,
    status: e.status,
    forms_url: e.formsUrl,
    target_classes: e.targetClasses,
    class_deadlines: e.classDeadlines ?? {},
    folder_id: e.folderId ?? null,
  };
}

export async function loadExams(): Promise<Exam[]> {
  if (supabase) {
    const { data } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
    if (data) return data.map(mapExamRow);
    return [];
  }
  const raw = localStorage.getItem(LS_EXAMS);
  if (!raw) {
    localStorage.setItem(LS_EXAMS, JSON.stringify(SEED_EXAMS));
    return SEED_EXAMS;
  }
  const parsed = JSON.parse(raw) as Exam[];
  return parsed.map((e) => ({ ...e, targetClasses: e.targetClasses ?? [], folderId: e.folderId ?? null, classDeadlines: e.classDeadlines ?? {} }));
}

export async function saveExams(exams: Exam[]): Promise<void> {
  if (supabase) {
    // Full sync: delete all and re-insert
    await supabase.from('exams').delete().neq('id', '___none___');
    if (exams.length > 0) {
      const rows = exams.map((e) => ({ id: e.id, ...examToRow(e), created_at: e.createdAt }));
      await supabase.from('exams').insert(rows);
    }
    return;
  }
  localStorage.setItem(LS_EXAMS, JSON.stringify(exams));
  dispatchDataChange('exams');
}

export async function createExam(data: Omit<Exam, 'id' | 'createdAt'>): Promise<Exam> {
  const exam: Exam = { ...data, id: generateId('exam'), createdAt: new Date().toISOString() };
  if (supabase) {
    await supabase.from('exams').insert({ id: exam.id, ...examToRow(data), created_at: exam.createdAt });
  } else {
    const current = await loadExams();
    await saveExamsLocal([exam, ...current]);
  }
  return exam;
}

export async function batchCreateExams(items: Omit<Exam, 'id' | 'createdAt'>[]): Promise<Exam[]> {
  const newExams: Exam[] = items.map((data) => ({
    ...data, id: generateId('exam'), createdAt: new Date().toISOString(),
  }));
  if (supabase) {
    const rows = newExams.map((e) => ({ id: e.id, ...examToRow(e), created_at: e.createdAt }));
    await supabase.from('exams').insert(rows);
  } else {
    const current = await loadExams();
    await saveExamsLocal([...newExams, ...current]);
  }
  return newExams;
}

export async function updateExam(id: string, updates: Partial<Exam>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.subject !== undefined) row.subject = updates.subject;
    if (updates.grade !== undefined) row.grade = updates.grade;
    if (updates.durationMinutes !== undefined) row.duration_minutes = updates.durationMinutes;
    if (updates.deadline !== undefined) row.deadline = updates.deadline;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.formsUrl !== undefined) row.forms_url = updates.formsUrl;
    if (updates.targetClasses !== undefined) row.target_classes = updates.targetClasses;
    if (updates.classDeadlines !== undefined) row.class_deadlines = updates.classDeadlines;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    await supabase.from('exams').update(row).eq('id', id);
    return;
  }
  const current = await loadExams();
  const next = current.map((e) => (e.id === id ? { ...e, ...updates } : e));
  await saveExamsLocal(next);
}

export async function deleteExam(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('exams').delete().eq('id', id);
    await supabase.from('exam_results').delete().eq('exam_id', id);
    return;
  }
  const current = await loadExams();
  await saveExamsLocal(current.filter((e) => e.id !== id));
}

async function saveExamsLocal(exams: Exam[]): Promise<void> {
  localStorage.setItem(LS_EXAMS, JSON.stringify(exams));
  dispatchDataChange('exams');
}

// ─── Users ─────────────────────────────────────────────────────

function mapUserRow(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    username: r.username as string,
    password: (r.password as string) || undefined,
    fullName: r.full_name as string,
    role: r.role as User['role'],
    assignedClasses: (r.assigned_classes as string[]) ?? [],
    allowedSubjects: (r.allowed_subjects as string[]) ?? [],
    authUserId: (r.auth_user_id as string) ?? undefined,
  };
}

function userToRow(u: Omit<User, 'id'>) {
  return {
    username: u.username,
    password: u.password ?? null,
    full_name: u.fullName,
    role: u.role,
    assigned_classes: u.assignedClasses,
    allowed_subjects: u.allowedSubjects,
  };
}

export async function loadUsers(): Promise<User[]> {
  if (supabase) {
    const { data } = await supabase.from('app_users').select('*').order('created_at', { ascending: true });
    if (data && data.length > 0) return data.map(mapUserRow);
    // Seed default users
    const rows = SEED_USERS.map((u) => ({ id: u.id, ...userToRow(u) }));
    await supabase.from('app_users').insert(rows);
    return SEED_USERS;
  }
  const raw = localStorage.getItem(LS_USERS);
  if (!raw) {
    localStorage.setItem(LS_USERS, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }
  const parsed = JSON.parse(raw) as User[];
  return parsed.map((u) => ({ ...u, allowedSubjects: u.allowedSubjects ?? [] }));
}

export async function saveUsers(users: User[]): Promise<void> {
  if (supabase) {
    await supabase.from('app_users').delete().neq('id', '___none___');
    if (users.length > 0) {
      const rows = users.map((u) => ({ id: u.id, ...userToRow(u), created_at: new Date().toISOString() }));
      await supabase.from('app_users').insert(rows);
    }
    return;
  }
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

export async function createUser(data: Omit<User, 'id'>): Promise<User> {
  const user: User = { ...data, id: generateId('user') };
  if (supabase) {
    await supabase.from('app_users').insert({ id: user.id, ...userToRow(data) });
  } else {
    const current = await loadUsers();
    await saveUsersLocal([...current, user]);
  }
  return user;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.username !== undefined) row.username = updates.username;
    if (updates.password !== undefined) row.password = updates.password;
    if (updates.fullName !== undefined) row.full_name = updates.fullName;
    if (updates.role !== undefined) row.role = updates.role;
    if (updates.assignedClasses !== undefined) row.assigned_classes = updates.assignedClasses;
    if (updates.allowedSubjects !== undefined) row.allowed_subjects = updates.allowedSubjects;

    const { data, error } = await supabase
      .from('app_users')
      .update(row)
      .eq('id', id)
      .select();

    if (error) {
      console.error('[storage.updateUser] Lỗi cập nhật app_users:', error);
      throw new Error(error.message || 'Lỗi cập nhật người dùng trên Supabase');
    }

    if (!data || data.length === 0) {
      console.warn('[storage.updateUser] Không có dòng nào được cập nhật với ID:', id);
      throw new Error(`Không thể cập nhật người dùng (ID: ${id}). Bản ghi không tồn tại hoặc không đủ quyền.`);
    }

    return;
  }
  const current = await loadUsers();
  await saveUsersLocal(current.map((u) => (u.id === id ? { ...u, ...updates } : u)));
}

export async function deleteUser(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('app_users').delete().eq('id', id);
    return;
  }
  const current = await loadUsers();
  await saveUsersLocal(current.filter((u) => u.id !== id));
}

async function saveUsersLocal(users: User[]): Promise<void> {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

// ─── Session ───────────────────────────────────────────────────

export function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

export function saveSession(user: User | null): void {
  if (user) localStorage.setItem(LS_SESSION, JSON.stringify(user));
  else localStorage.removeItem(LS_SESSION);
}

// ─── Completions (LocalStorage only — ephemeral) ───────────────

export async function loadCompletions(): Promise<CompletionRecord[]> {
  const raw = localStorage.getItem(LS_COMPLETIONS);
  if (!raw) {
    localStorage.setItem(LS_COMPLETIONS, JSON.stringify(SEED_COMPLETIONS));
    return SEED_COMPLETIONS;
  }
  return JSON.parse(raw);
}

export async function saveCompletions(records: CompletionRecord[]): Promise<void> {
  localStorage.setItem(LS_COMPLETIONS, JSON.stringify(records));
}

// ─── Exam Results (scores) ─────────────────────────────────────

function mapResultRow(r: Record<string, unknown>): ExamResult {
  return {
    id: r.id as string,
    examId: r.exam_id as string,
    studentName: r.student_name as string,
    studentUsername: (r.student_username as string) ?? '',
    className: (r.class_name as string) ?? '',
    examTitle: (r.exam_title as string) ?? '',
    score: Number(r.score) || 0,
    status: (r.status as ExamResult['status']) ?? 'submitted',
    submittedAt: (r.submitted_at as string) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

export async function loadResults(): Promise<ExamResult[]> {
  if (supabase) {
    const { data } = await supabase.from('exam_results').select('*').order('created_at', { ascending: false });
    if (data) return data.map(mapResultRow);
    return [];
  }
  const raw = localStorage.getItem(LS_RESULTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveResults(results: ExamResult[]): Promise<void> {
  if (supabase) {
    await supabase.from('exam_results').delete().neq('id', '___none___');
    if (results.length > 0) {
      const rows = results.map((r) => ({
        id: r.id,
        exam_id: r.examId,
        student_name: r.studentName,
        student_username: r.studentUsername,
        class_name: r.className,
        exam_title: r.examTitle,
        score: r.score,
        status: r.status,
        submitted_at: r.submittedAt,
      }));
      await supabase.from('exam_results').insert(rows);
    }
    return;
  }
  localStorage.setItem(LS_RESULTS, JSON.stringify(results));
  dispatchDataChange('results');
}

export async function importResults(items: Omit<ExamResult, 'id' | 'createdAt'>[]): Promise<void> {
  if (supabase) {
    const rows = items.map((r) => ({
      id: generateId('result'),
      exam_id: r.examId,
      student_name: r.studentName,
      student_username: r.studentUsername,
      class_name: r.className,
      exam_title: r.examTitle,
      score: r.score,
      status: r.status,
      submitted_at: r.submittedAt,
    }));
    await supabase.from('exam_results').insert(rows);
    return;
  }
  const current = await loadResults();
  const newRecords: ExamResult[] = items.map((r) => ({
    ...r, id: generateId('result'), createdAt: new Date().toISOString(),
  }));
  await saveResults([...newRecords, ...current]);
}

export { isSupabaseConfigured };

// ─── Lessons ───────────────────────────────────────────────────

const LS_LESSONS = 'quizforms_lessons';

const SEED_LESSONS: Lesson[] = [
  {
    id: 'lesson-001',
    title: '～に際して・～にあたって',
    source: 'Mau_bai_hoc_ngu_phap_JLPT_N2.xlsx',
    sheetId: 'Bai_01',
    meaning: 'Vào lúc / Nhân dịp (khi thực hiện một sự việc quan trọng)',
    connectionRule: 'V-る/N + に際して　／　V-る/N + にあたって',
    notes: '「に際して」mang sắc thái trang trọng, dùng trong văn viết. 「にあたって」dùng được cả văn nói và văn viết, nhấn mạnh vào thời điểm chuẩn bị trước khi làm việc quan trọng.',
    distinction: '・に際して ≒ にあたって（trang trọng hơn）\n・のとき: thông dụng hơn, không nhất thiết trang trọng\n・にあたり: biến thể viết tắt của にあたって',
    examples: [
      { stt: 1, japanese: '渡航に際して、パスポートの有効期限を確認してください。', vietnamese: 'Nhân dịp xuất ngoại, hãy kiểm tra thời hạn hộ chiếu.', analysis: 'N + に際して → nhấn mạnh vào thời điểm trước/trong khi thực hiện', vocabulary: '渡航(とこう): xuất ngoại; 有効期限(ゆうこうきげん): thời hạn hiệu lực', note: 'Văn phong trang trọng' },
      { stt: 2, japanese: '新年度にあたって、目標を立てた。', vietnamese: 'Nhân đầu năm học mới, tôi đã đặt ra mục tiêu.', analysis: 'N + にあたって → nhân dịp sự kiện mang tính dấu mốc', vocabulary: '新年度(しんねんど): năm học/năm tài chính mới; 目標(もくひょう): mục tiêu', note: '' },
      { stt: 3, japanese: '契約を結ぶに際して、内容を十分に確認すること。', vietnamese: 'Khi ký kết hợp đồng, cần kiểm tra kỹ nội dung.', analysis: 'V-る + に際して → hành động quan trọng cần chuẩn bị trước', vocabulary: '契約(けいやく): hợp đồng; 結ぶ(むすぶ): ký kết', note: '' },
      { stt: 4, japanese: '入学にあたり、必要書類を揃えてください。', vietnamese: 'Nhân dịp nhập học, hãy chuẩn bị đầy đủ giấy tờ cần thiết.', analysis: 'にあたり = にあたって (văn viết)', vocabulary: '入学(にゅうがく): nhập học; 書類(しょるい): giấy tờ; 揃える(そろえる): chuẩn bị đầy đủ', note: 'にあたり là dạng viết tắt' },
      { stt: 5, japanese: '開会に際しまして、一言ご挨拶申し上げます。', vietnamese: 'Nhân dịp khai mạc, cho phép tôi xin gửi vài lời chào.', analysis: 'に際しまして: dạng kính ngữ cao nhất của に際して', vocabulary: '開会(かいかい): khai mạc; ご挨拶(あいさつ): lời chào', note: 'Kính ngữ - dùng trong diễn văn' },
    ],
    exercises: [
      { stt: 1, type: 'multiple_choice', question: '卒業（　　）、先生方への感謝の気持ちを伝えたい。', optionA: 'に際して', optionB: 'にもかかわらず', optionC: 'にとって', optionD: 'によって', hint: 'Nhân dịp tốt nghiệp' },
      { stt: 2, type: 'multiple_choice', question: '新しいプロジェクトを始める（　　）、チームで話し合いをした。', optionA: 'にあたって', optionB: 'にしたがって', optionC: 'に反して', optionD: 'に対して', hint: 'Khi bắt đầu dự án mới' },
      { stt: 3, type: 'conjugation', question: '（出発する）___に際して、荷物の確認をしてください。', optionA: '出発する', optionB: '出発した', optionC: '出発して', optionD: '', hint: 'V-る + に際して' },
      { stt: 4, type: 'translate', question: 'Dịch sang tiếng Nhật: "Nhân dịp kỷ niệm 10 năm thành lập công ty, chúng tôi sẽ tổ chức tiệc lớn."', optionA: '', optionB: '', optionC: '', optionD: '', hint: '創立10周年 / 記念パーティー' },
      { stt: 5, type: 'arrange', question: 'Sắp xếp: [試験 ／ に際して ／ 受ける ／ を ／ 、注意事項をよく読め]', optionA: '', optionB: '', optionC: '', optionD: '', hint: 'N/V-る + に際して' },
    ],
    answers: [
      { stt: 1, answer: 'A: に際して', fullSentence: '卒業に際して、先生方への感謝の気持ちを伝えたい。', explanation: '「に際して」dùng với danh từ/động từ thể る, mang nghĩa "nhân dịp/vào lúc" sự kiện quan trọng.', commonErrors: '「にもかかわらず」= dù cho; 「にとって」= đối với → sai ngữ cảnh.', selfAssess: '★★★★☆' },
      { stt: 2, answer: 'A: にあたって', fullSentence: '新しいプロジェクトを始めるにあたって、チームで話し合いをした。', explanation: 'V-る + にあたって nhấn mạnh vào giai đoạn chuẩn bị trước khi thực hiện việc quan trọng.', commonErrors: '「にしたがって」= theo/tuỳ theo sự thay đổi; hoàn toàn khác nghĩa.', selfAssess: '★★★☆☆' },
      { stt: 3, answer: '出発する', fullSentence: '出発するに際して、荷物の確認をしてください。', explanation: 'に際して nối với V thể る (thể từ điển), không dùng thể た hay て.', commonErrors: 'Sai khi dùng thể た (quá khứ) vì に際して đề cập đến thời điểm hiện tại/tương lai của sự kiện.', selfAssess: '★★★★☆' },
      { stt: 4, answer: '会社設立10周年にあたって（／に際して）、大きなパーティーを開催します。', fullSentence: '会社設立10周年にあたって、大きなパーティーを開催します。', explanation: 'にあたって / に際して đều đúng. 周年(しゅうねん)=kỷ niệm năm; 開催(かいさい)=tổ chức.', commonErrors: 'Không dùng 「のとき」vì câu này có sắc thái trang trọng.', selfAssess: '★★☆☆☆' },
      { stt: 5, answer: '試験を受けるに際して、注意事項をよく読め。', fullSentence: '試験を受けるに際して、注意事項をよく読め。', explanation: 'V-る + に際して. 注意事項(ちゅういじこう)=điều chú ý; よく読め=đọc kỹ (mệnh lệnh).', commonErrors: 'Nhớ thứ tự: [đối tượng + を + V-る] + に際して.', selfAssess: '★★★☆☆' },
    ],
    sortOrder: 1,
    targetClasses: [],
    categoryId: 'cat-grammar',
    startAt: null,
    deadline: null,
    classSchedules: {},
    createdAt: new Date().toISOString(),
  },
];

function mapLessonRow(r: Record<string, unknown>): Lesson {
  let packedMeta: Record<string, unknown> = {};
  let userNotes = (r.notes as string) ?? '';
  if (typeof userNotes === 'string' && userNotes.startsWith('{') && userNotes.endsWith('}')) {
    try {
      packedMeta = JSON.parse(userNotes);
      userNotes = (packedMeta.userNotes as string) ?? '';
    } catch {
      // not json
    }
  }

  const createdBy = (r.created_by as string | null) ?? (packedMeta.createdBy as string | null) ?? (r.createdBy as string | null) ?? null;
  const subjectId = (r.subject_id as string | null) ?? (packedMeta.subjectId as string | null) ?? (r.subjectId as string | null) ?? null;
  const itemCount = (r.item_count as number) ?? (packedMeta.itemCount as number) ?? (r.itemCount as number) ?? undefined;
  const examQuestionsCount = (r.exam_questions_count as number) ?? (packedMeta.examQuestionsCount as number) ?? (r.examQuestionsCount as number) ?? undefined;
  const passageCount = (r.passage_count as number) ?? (packedMeta.passageCount as number) ?? (r.passageCount as number) ?? undefined;
  const lessonType = (r.lesson_type as Lesson['lessonType']) ?? (packedMeta.lessonType as Lesson['lessonType']) ?? (r.lessonType as Lesson['lessonType']) ?? undefined;
  const jlptLevel = (r.jlpt_level as string) ?? (packedMeta.jlptLevel as string) ?? (r.jlptLevel as string) ?? undefined;
  const description = (r.description as string) ?? (packedMeta.description as string) ?? (r.description as string) ?? undefined;

  return {
    id: r.id as string,
    title: r.title as string,
    source: (r.source as string) ?? '',
    sheetId: (r.sheet_id as string) ?? '',
    meaning: (r.meaning as string) ?? '',
    connectionRule: (r.connection_rule as string) ?? '',
    notes: userNotes,
    distinction: (r.distinction as string) ?? '',
    examples: (r.examples as Lesson['examples']) ?? [],
    exercises: (r.exercises as Lesson['exercises']) ?? [],
    answers: (r.answers as Lesson['answers']) ?? [],
    sortOrder: (r.sort_order as number) ?? 0,
    targetClasses: (r.target_classes as string[]) ?? [],
    categoryId: (r.category_id as string) ?? null,
    folderId: (r.folder_id as string | null) ?? null,
    startAt: (r.start_at as string | null) ?? null,
    deadline: (r.deadline as string | null) ?? null,
    classSchedules: (r.class_schedules as Lesson['classSchedules']) ?? {},
    itemCount,
    examQuestionsCount,
    passageCount,
    lessonType,
    jlptLevel,
    description,
    createdBy,
    subjectId,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function lessonToRow(l: Lesson) {
  const meta = {
    createdBy: l.createdBy ?? null,
    subjectId: l.subjectId ?? null,
    itemCount: l.itemCount ?? null,
    examQuestionsCount: l.examQuestionsCount ?? null,
    passageCount: l.passageCount ?? null,
    lessonType: l.lessonType ?? null,
    jlptLevel: l.jlptLevel ?? null,
    description: l.description ?? null,
    userNotes: l.notes ?? '',
  };

  return {
    id: l.id,
    title: l.title,
    source: l.source,
    sheet_id: l.sheetId,
    meaning: l.meaning,
    connection_rule: l.connectionRule,
    notes: JSON.stringify(meta),
    distinction: l.distinction,
    examples: l.examples,
    exercises: l.exercises,
    answers: l.answers,
    sort_order: l.sortOrder,
    target_classes: l.targetClasses,
    category_id: l.categoryId,
    folder_id: l.folderId ?? null,
    created_by: l.createdBy ?? null,
    start_at: l.startAt,
    deadline: l.deadline,
    class_schedules: l.classSchedules ?? {},
    created_at: l.createdAt,
  };
}

export async function loadLessons(): Promise<Lesson[]> {
  if (supabase) {
    const { data } = await supabase.from('lessons').select('*').order('sort_order', { ascending: true });
    if (data && data.length > 0) return data.map(mapLessonRow);
    // Seed
    await supabase.from('lessons').insert(SEED_LESSONS.map(lessonToRow));
    return SEED_LESSONS;
  }
  const raw = localStorage.getItem(LS_LESSONS);
  if (!raw) {
    localStorage.setItem(LS_LESSONS, JSON.stringify(SEED_LESSONS));
    return SEED_LESSONS;
  }
  return JSON.parse(raw);
}

export async function saveLessons(lessons: Lesson[]): Promise<void> {
  if (supabase) {
    await supabase.from('lessons').delete().neq('id', '___none___');
    if (lessons.length > 0) await supabase.from('lessons').insert(lessons.map(lessonToRow));
    return;
  }
  localStorage.setItem(LS_LESSONS, JSON.stringify(lessons));
  dispatchDataChange('lessons');
}

export async function upsertLessons(lessons: Lesson[]): Promise<void> {
  if (supabase) {
    const rows = lessons.map(lessonToRow);
    const { error } = await supabase.from('lessons').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('Supabase upsertLessons error:', error);
      throw new Error(`Lỗi lưu bài học lên database: ${error.message}`);
    }
  }
  const current = await loadLessons();
  const map = new Map(current.map((l) => [l.id, l]));
  lessons.forEach((l) => map.set(l.id, l));
  const merged = Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  localStorage.setItem(LS_LESSONS, JSON.stringify(merged));
  dispatchDataChange('lessons');
}

export async function updateLesson(id: string, updates: Partial<Lesson>): Promise<void> {
  if (supabase) {
    let updatedNotesJson: string | undefined = undefined;
    const isMetaUpdated =
      updates.notes !== undefined ||
      updates.createdBy !== undefined ||
      updates.subjectId !== undefined ||
      updates.itemCount !== undefined ||
      updates.examQuestionsCount !== undefined ||
      updates.lessonType !== undefined ||
      updates.jlptLevel !== undefined ||
      updates.description !== undefined;

    if (isMetaUpdated) {
      const { data: existing } = await supabase.from('lessons').select('notes').eq('id', id).maybeSingle();
      let currentMeta: Record<string, unknown> = {};
      if (existing?.notes) {
        try {
          currentMeta = JSON.parse(existing.notes);
        } catch {
          currentMeta = { userNotes: existing.notes };
        }
      }
      if (updates.createdBy !== undefined) currentMeta.createdBy = updates.createdBy;
      if (updates.subjectId !== undefined) currentMeta.subjectId = updates.subjectId;
      if (updates.itemCount !== undefined) currentMeta.itemCount = updates.itemCount;
      if (updates.examQuestionsCount !== undefined) currentMeta.examQuestionsCount = updates.examQuestionsCount;
      if (updates.lessonType !== undefined) currentMeta.lessonType = updates.lessonType;
      if (updates.jlptLevel !== undefined) currentMeta.jlptLevel = updates.jlptLevel;
      if (updates.description !== undefined) currentMeta.description = updates.description;
      if (updates.notes !== undefined) currentMeta.userNotes = updates.notes;
      updatedNotesJson = JSON.stringify(currentMeta);
    }

    const row: Record<string, unknown> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.source !== undefined) row.source = updates.source;
    if (updates.sheetId !== undefined) row.sheet_id = updates.sheetId;
    if (updates.meaning !== undefined) row.meaning = updates.meaning;
    if (updates.connectionRule !== undefined) row.connection_rule = updates.connectionRule;
    if (updatedNotesJson !== undefined) row.notes = updatedNotesJson;
    if (updates.distinction !== undefined) row.distinction = updates.distinction;
    if (updates.examples !== undefined) row.examples = updates.examples;
    if (updates.exercises !== undefined) row.exercises = updates.exercises;
    if (updates.answers !== undefined) row.answers = updates.answers;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.targetClasses !== undefined) row.target_classes = updates.targetClasses;
    if (updates.categoryId !== undefined) row.category_id = updates.categoryId;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    if (updates.createdBy !== undefined) row.created_by = updates.createdBy;
    if (updates.startAt !== undefined) row.start_at = updates.startAt;
    if (updates.deadline !== undefined) row.deadline = updates.deadline;
    if (updates.classSchedules !== undefined) row.class_schedules = updates.classSchedules;

    const { error } = await supabase.from('lessons').update(row).eq('id', id);
    if (error) {
      console.error('Supabase updateLesson error:', error);
      throw new Error(`Lỗi cập nhật bài học: ${error.message}`);
    }
  }
  const current = await loadLessons();
  const next = current.map((l) => (l.id === id ? { ...l, ...updates } : l));
  localStorage.setItem(LS_LESSONS, JSON.stringify(next));
  dispatchDataChange('lessons');
}

export async function deleteLesson(id: string): Promise<void> {
  // Clean up associated child records in parallel / best effort
  try {
    await Promise.allSettled([
      deleteExamQuestionsByLesson(id),
      deleteReadingPassagesByLesson(id),
      supabase ? supabase.from('lesson_access_grants').delete().eq('lesson_id', id) : Promise.resolve(),
    ]);
  } catch {
    // ignore
  }

  if (supabase) {
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) {
      console.error('Supabase deleteLesson error:', error);
      throw new Error(`Lỗi xóa bài học: ${error.message}`);
    }
  }
  const current = await loadLessons();
  localStorage.setItem(LS_LESSONS, JSON.stringify(current.filter((l) => l.id !== id)));
  dispatchDataChange('lessons');
}

// ─── Lesson Categories ────────────────────────────────────────

function mapCategoryRow(r: Record<string, unknown>): LessonCategory {
  return {
    id: r.id as string,
    title: r.title as string,
    icon: (r.icon as LessonCategory['icon']) ?? 'BookOpen',
    teacherName: (r.teacher_name as string) ?? '',
    targetClasses: (r.target_classes as string[]) ?? [],
    sortOrder: (r.sort_order as number) ?? 0,
    defaultStartAt: (r.default_start_at as string | null) ?? null,
    defaultDeadline: (r.default_deadline as string | null) ?? null,
    classSchedules: (r.class_schedules as LessonCategory['classSchedules']) ?? {},
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function categoryToRow(c: LessonCategory) {
  return {
    id: c.id,
    title: c.title,
    icon: c.icon,
    teacher_name: c.teacherName,
    target_classes: c.targetClasses,
    sort_order: c.sortOrder,
    default_start_at: c.defaultStartAt,
    default_deadline: c.defaultDeadline,
    class_schedules: c.classSchedules ?? {},
    created_at: c.createdAt,
  };
}

export async function loadCategories(): Promise<LessonCategory[]> {
  try {
    if (supabase) {
      const { data } = await supabase.from('lesson_categories').select('*').order('sort_order', { ascending: true });
      if (data && data.length > 0) return data.map(mapCategoryRow);
      // Seed default categories
      const rows = SEED_CATEGORIES.map(categoryToRow);
      await supabase.from('lesson_categories').insert(rows);
      return SEED_CATEGORIES;
    }
    const raw = localStorage.getItem(LS_CATEGORIES);
    if (!raw) {
      localStorage.setItem(LS_CATEGORIES, JSON.stringify(SEED_CATEGORIES));
      return SEED_CATEGORIES;
    }
    return JSON.parse(raw) as LessonCategory[];
  } catch {
    return SEED_CATEGORIES;
  }
}

export async function createCategory(data: Omit<LessonCategory, 'id' | 'createdAt'>): Promise<LessonCategory> {
  const category: LessonCategory = { ...data, id: generateId('cat'), createdAt: new Date().toISOString() };
  if (supabase) {
    await supabase.from('lesson_categories').insert(categoryToRow(category));
  } else {
    const current = await loadCategories();
    localStorage.setItem(LS_CATEGORIES, JSON.stringify([...current, category]));
    dispatchDataChange('categories');
  }
  return category;
}

export async function updateCategory(id: string, updates: Partial<LessonCategory>): Promise<void> {
  try {
    if (supabase) {
      const row: Record<string, unknown> = {};
      if (updates.title !== undefined) row.title = updates.title;
      if (updates.icon !== undefined) row.icon = updates.icon;
      if (updates.teacherName !== undefined) row.teacher_name = updates.teacherName;
      if (updates.targetClasses !== undefined) row.target_classes = updates.targetClasses;
      if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
      if (updates.defaultStartAt !== undefined) row.default_start_at = updates.defaultStartAt;
      if (updates.defaultDeadline !== undefined) row.default_deadline = updates.defaultDeadline;
      if (updates.classSchedules !== undefined) row.class_schedules = updates.classSchedules;
      await supabase.from('lesson_categories').update(row).eq('id', id);
      return;
    }
    const current = await loadCategories();
    const next = current.map((c) => (c.id === id ? { ...c, ...updates } : c));
    localStorage.setItem(LS_CATEGORIES, JSON.stringify(next));
    dispatchDataChange('categories');
  } catch (e) {
    console.warn('updateCategory error', e);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    if (supabase) {
      await supabase.from('lesson_categories').delete().eq('id', id);
      // Unassign lessons from deleted category
      await supabase.from('lessons').update({ category_id: null }).eq('category_id', id);
      return;
    }
    const current = await loadCategories();
    localStorage.setItem(LS_CATEGORIES, JSON.stringify(current.filter((c) => c.id !== id)));
    dispatchDataChange('categories');
  } catch (e) {
    console.warn('deleteCategory error', e);
  }
}

// ─── Vocabulary Items ─────────────────────────────────────────

const LS_VOCAB = 'quizforms_vocabulary_items';

function mapVocabRow(r: Record<string, unknown>): VocabularyItem {
  let kanjiBreakdown: KanjiBreakdownItem[] = [];
  if (Array.isArray(r.kanji_breakdown)) {
    kanjiBreakdown = r.kanji_breakdown as KanjiBreakdownItem[];
  } else if (typeof r.kanji_breakdown === 'string') {
    try {
      const parsed = JSON.parse(r.kanji_breakdown);
      if (Array.isArray(parsed)) kanjiBreakdown = parsed;
    } catch {
      kanjiBreakdown = [];
    }
  }

  return {
    id: r.id as string,
    lessonId: r.lesson_id as string,
    vocabId: (r.vocab_id as string) ?? '',
    vocabulary: r.vocabulary as string,
    readingHiragana: (r.reading_hiragana as string) ?? '',
    readingRomaji: (r.reading_romaji as string) ?? '',
    onyomi: (r.onyomi as string) ?? '',
    kunyomi: (r.kunyomi as string) ?? '',
    meaningVi: (r.meaning_vi as string) ?? '',
    hanViet: (r.han_viet as string) ?? '',
    kanjiBreakdown,
    kanjiMemoryHint: (r.kanji_memory_hint as string) ?? '',
    jlptLevel: (r.jlpt_level as string) ?? '',
    wordType: (r.word_type as string) ?? '',
    tags: (r.tags as string) ?? '',
    relatedWords: (r.related_words as string[]) ?? [],
    audioText: (r.audio_text as string) ?? '',
    exampleJp1: (r.example_jp_1 as string) ?? '',
    exampleReading1: (r.example_reading_1 as string) ?? '',
    exampleVi1: (r.example_vi_1 as string) ?? '',
    exampleJp2: (r.example_jp_2 as string) ?? '',
    exampleReading2: (r.example_reading_2 as string) ?? '',
    exampleVi2: (r.example_vi_2 as string) ?? '',
    active: (r.active as boolean) ?? true,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function vocabToRow(v: VocabularyItem) {
  return {
    id: v.id,
    lesson_id: v.lessonId,
    vocab_id: v.vocabId,
    vocabulary: v.vocabulary,
    reading_hiragana: v.readingHiragana,
    reading_romaji: v.readingRomaji,
    onyomi: v.onyomi,
    kunyomi: v.kunyomi,
    meaning_vi: v.meaningVi,
    han_viet: v.hanViet || null,
    kanji_breakdown: v.kanjiBreakdown && v.kanjiBreakdown.length > 0 ? v.kanjiBreakdown : null,
    kanji_memory_hint: v.kanjiMemoryHint || null,
    jlpt_level: v.jlptLevel,
    word_type: v.wordType,
    tags: v.tags,
    related_words: v.relatedWords,
    audio_text: v.audioText,
    example_jp_1: v.exampleJp1,
    example_reading_1: v.exampleReading1,
    example_vi_1: v.exampleVi1,
    example_jp_2: v.exampleJp2,
    example_reading_2: v.exampleReading2,
    example_vi_2: v.exampleVi2,
    active: v.active,
    sort_order: v.sortOrder,
  };
}

export async function loadVocabItems(lessonId: string): Promise<VocabularyItem[]> {
  if (supabase) {
    const { data } = await supabase
      .from('vocabulary_items')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true });
    if (data) return data.map(mapVocabRow);
    return [];
  }
  const raw = localStorage.getItem(LS_VOCAB);
  if (!raw) return [];
  const all = JSON.parse(raw) as VocabularyItem[];
  return all.filter((v) => v.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadAllVocabItems(): Promise<VocabularyItem[]> {
  if (supabase) {
    const { data } = await supabase
      .from('vocabulary_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (data) return data.map(mapVocabRow);
    return [];
  }
  const raw = localStorage.getItem(LS_VOCAB);
  return raw ? JSON.parse(raw) as VocabularyItem[] : [];
}

export async function upsertVocabItems(items: VocabularyItem[]): Promise<void> {
  if (supabase) {
    const rows = items.map(vocabToRow);
    const { error } = await supabase.from('vocabulary_items').upsert(rows, { onConflict: 'id' });
    if (error) {
      // Fallback nếu schema cache database chưa có các cột mở rộng (han_viet, kanji_breakdown, kanji_memory_hint)
      if (
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        String(error.message).includes('does not exist') ||
        String(error.message).includes('column')
      ) {
        console.warn('Fallback upsertVocabItems without extended columns:', error.message);
        const safeRows = rows.map((r) => {
          const copy: Record<string, unknown> = { ...r };
          delete copy.han_viet;
          delete copy.kanji_breakdown;
          delete copy.kanji_memory_hint;
          return copy;
        });
        const fallbackRes = await supabase.from('vocabulary_items').upsert(safeRows, { onConflict: 'id' });
        if (fallbackRes.error) {
          throw new Error(`Lưu từ vựng thất bại: ${fallbackRes.error.message}`);
        }
        return;
      }
      throw new Error(`Lưu từ vựng thất bại: ${error.message}`);
    }
    return;
  }
  const raw = localStorage.getItem(LS_VOCAB);
  const current = raw ? JSON.parse(raw) as VocabularyItem[] : [];
  const map = new Map(current.map((v) => [v.id, v]));
  items.forEach((v) => map.set(v.id, v));
  localStorage.setItem(LS_VOCAB, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('vocab');
}

export async function deleteVocabItemsByLesson(lessonId: string): Promise<void> {
  if (supabase) {
    await supabase.from('vocabulary_items').delete().eq('lesson_id', lessonId);
    return;
  }
  const raw = localStorage.getItem(LS_VOCAB);
  const current = raw ? JSON.parse(raw) as VocabularyItem[] : [];
  localStorage.setItem(LS_VOCAB, JSON.stringify(current.filter((v) => v.lessonId !== lessonId)));
  dispatchDataChange('vocab');
}

export async function updateVocabItem(id: string, updates: Partial<VocabularyItem>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.vocabulary !== undefined) row.vocabulary = updates.vocabulary;
    if (updates.readingHiragana !== undefined) row.reading_hiragana = updates.readingHiragana;
    if (updates.readingRomaji !== undefined) row.reading_romaji = updates.readingRomaji;
    if (updates.onyomi !== undefined) row.onyomi = updates.onyomi;
    if (updates.kunyomi !== undefined) row.kunyomi = updates.kunyomi;
    if (updates.meaningVi !== undefined) row.meaning_vi = updates.meaningVi;
    if (updates.jlptLevel !== undefined) row.jlpt_level = updates.jlptLevel;
    if (updates.wordType !== undefined) row.word_type = updates.wordType;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.relatedWords !== undefined) row.related_words = updates.relatedWords;
    if (updates.audioText !== undefined) row.audio_text = updates.audioText;
    if (updates.hanViet !== undefined) row.han_viet = updates.hanViet || null;
    if (updates.kanjiBreakdown !== undefined) {
      row.kanji_breakdown = updates.kanjiBreakdown && updates.kanjiBreakdown.length > 0 ? updates.kanjiBreakdown : null;
    }
    if (updates.kanjiMemoryHint !== undefined) row.kanji_memory_hint = updates.kanjiMemoryHint || null;
    if (updates.exampleJp1 !== undefined) row.example_jp_1 = updates.exampleJp1;
    if (updates.exampleReading1 !== undefined) row.example_reading_1 = updates.exampleReading1;
    if (updates.exampleVi1 !== undefined) row.example_vi_1 = updates.exampleVi1;
    if (updates.exampleJp2 !== undefined) row.example_jp_2 = updates.exampleJp2;
    if (updates.exampleReading2 !== undefined) row.example_reading_2 = updates.exampleReading2;
    if (updates.exampleVi2 !== undefined) row.example_vi_2 = updates.exampleVi2;
    if (updates.active !== undefined) row.active = updates.active;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

    const { error, count } = await supabase
      .from('vocabulary_items')
      .update(row, { count: 'exact' })
      .eq('id', id);

    if (error) {
      // Fallback nếu schema cache database chưa có các cột mở rộng
      if (
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        String(error.message).includes('does not exist') ||
        String(error.message).includes('column')
      ) {
        console.warn('Fallback updateVocabItem without extended columns for item:', id);
        const safeRow = { ...row };
        delete safeRow.han_viet;
        delete safeRow.kanji_breakdown;
        delete safeRow.kanji_memory_hint;
        const fallbackRes = await supabase
          .from('vocabulary_items')
          .update(safeRow, { count: 'exact' })
          .eq('id', id);

        if (fallbackRes.error) {
          throw new Error(`Cập nhật từ vựng thất bại: ${fallbackRes.error.message}`);
        }
        return;
      }

      console.error('Supabase updateVocabItem error:', error);
      throw new Error(`Cập nhật từ vựng thất bại: ${error.message}`);
    }
    if (count === 0) {
      throw new Error(`Không tìm thấy bản ghi từ vựng có ID ${id} để cập nhật.`);
    }
    return;
  }
  const raw = localStorage.getItem(LS_VOCAB);
  const current = raw ? JSON.parse(raw) as VocabularyItem[] : [];
  const next = current.map((v) => (v.id === id ? { ...v, ...updates } : v));
  localStorage.setItem(LS_VOCAB, JSON.stringify(next));
  dispatchDataChange('vocab');
}

// ─── Grammar Items (Inside a Grammar Lesson) ───────────────────

const LS_GRAMMAR_ITEMS = 'quizforms_grammar_items';

function parseJsonArraySafe<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      return [];
    }
  }
  return [];
}

function mapGrammarItemRow(r: Record<string, unknown>): GrammarItem {
  const examples = parseJsonArraySafe<GrammarItemExample>(r.examples);
  if (examples.length === 0 && (r.example_jp || r.example_vi)) {
    examples.push({
      stt: 1,
      japanese: String(r.example_jp ?? ''),
      vietnamese: String(r.example_vi ?? ''),
      analysis: String(r.example_analysis ?? ''),
      vocabulary: '',
      vocabulary_furigana: '',
      note: String(r.notes ?? ''),
    });
  }

  const exercises = parseJsonArraySafe<GrammarItemExercise>(r.exercises);
  const answers = parseJsonArraySafe<GrammarItemAnswer>(r.answers);

  const connectionRule = String(r.connection_rule ?? r.structure ?? '');
  const caution = String(r.caution ?? r.explanation ?? '');
  const distinction = r.distinction ? String(r.distinction) : undefined;
  const source = r.source ? String(r.source) : undefined;
  const itemCode = String(r.item_code ?? r.item_id ?? '');

  return {
    id: String(r.id ?? ''),
    lessonId: String(r.lesson_id ?? ''),
    itemCode,
    itemId: itemCode,
    grammarPattern: String(r.grammar_pattern ?? r.title ?? ''),
    source,
    meaning: String(r.meaning ?? ''),
    connectionRule,
    caution,
    distinction,
    examples,
    exercises,
    answers,
    jlptLevel: r.jlpt_level ? String(r.jlpt_level) : undefined,
    tags: r.tags ? String(r.tags) : undefined,
    sortOrder: Number(r.sort_order ?? 0),
    active: r.active !== false,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),

    // backward compatibility
    structure: connectionRule,
    explanation: caution,
    exampleJp: r.example_jp ? String(r.example_jp) : (examples[0]?.japanese ?? ''),
    exampleVi: r.example_vi ? String(r.example_vi) : (examples[0]?.vietnamese ?? ''),
    exampleAnalysis: r.example_analysis ? String(r.example_analysis) : (examples[0]?.analysis ?? ''),
    notes: r.notes ? String(r.notes) : (examples[0]?.note ?? ''),
  };
}

function grammarItemToRow(g: GrammarItem): Record<string, unknown> {
  const connectionRule = g.connectionRule || g.structure || '';
  const caution = g.caution || g.explanation || '';
  const exampleJp = g.examples?.[0]?.japanese || g.exampleJp || '';
  const exampleVi = g.examples?.[0]?.vietnamese || g.exampleVi || '';
  const exampleAnalysis = g.examples?.[0]?.analysis || g.exampleAnalysis || '';
  const notes = g.examples?.[0]?.note || g.notes || '';

  return {
    id: g.id,
    lesson_id: g.lessonId,
    item_code: g.itemCode || g.itemId || '',
    item_id: g.itemCode || g.itemId || '',
    grammar_pattern: g.grammarPattern,
    source: g.source ?? '',
    meaning: g.meaning,
    connection_rule: connectionRule,
    caution,
    distinction: g.distinction ?? '',
    examples: g.examples ?? [],
    exercises: g.exercises ?? [],
    answers: g.answers ?? [],
    jlpt_level: g.jlptLevel ?? '',
    tags: g.tags ?? '',
    sort_order: g.sortOrder,
    active: g.active !== false,
    created_at: g.createdAt || new Date().toISOString(),
    updated_at: g.updatedAt || new Date().toISOString(),

    // backward compatibility table columns
    structure: connectionRule,
    explanation: caution,
    example_jp: exampleJp,
    example_vi: exampleVi,
    example_analysis: exampleAnalysis,
    notes,
  };
}

export async function loadGrammarItems(lessonId: string): Promise<GrammarItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('grammar_items')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('sort_order', { ascending: true });
      if (!error && data && data.length > 0) return data.map(mapGrammarItemRow);
    } catch {
      // ignore
    }

    // Fallback: check if grammar items are stored directly inside lesson.examples
    try {
      const { data: lData, error: lError } = await supabase
        .from('lessons')
        .select('examples')
        .eq('id', lessonId)
        .maybeSingle();
      if (!lError && lData?.examples && Array.isArray(lData.examples) && lData.examples.length > 0) {
        const first = lData.examples[0] as Record<string, unknown>;
        if (first && (first.grammarPattern || first.meaning || first.itemCode || first.itemId)) {
          return lData.examples.map((rawItem: unknown, idx: number) => {
            const item = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
            const exArr = Array.isArray(item.examples) ? (item.examples as Record<string, unknown>[]) : [];
            const ex0 = exArr[0] && typeof exArr[0] === 'object' ? exArr[0] : null;
            return {
              id: (item.id as string) || `gi-${lessonId}-${idx + 1}`,
              lessonId: (item.lessonId as string) || lessonId,
              itemCode: (item.itemCode as string) || (item.itemId as string) || `N2-${String(idx + 1).padStart(3, '0')}`,
              itemId: (item.itemId as string) || (item.itemCode as string) || `N2-${String(idx + 1).padStart(3, '0')}`,
              grammarPattern: (item.grammarPattern as string) || (item.title as string) || '',
              source: (item.source as string) || '',
              meaning: (item.meaning as string) || '',
              connectionRule: (item.connectionRule as string) || (item.structure as string) || '',
              caution: (item.caution as string) || (item.explanation as string) || '',
              distinction: (item.distinction as string) || '',
              examples: Array.isArray(item.examples) ? (item.examples as GrammarItem['examples']) : [],
              exercises: Array.isArray(item.exercises) ? (item.exercises as GrammarItem['exercises']) : [],
              answers: Array.isArray(item.answers) ? (item.answers as GrammarItem['answers']) : [],
              jlptLevel: (item.jlptLevel as string) || 'N2',
              tags: (item.tags as string) || '',
              sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx + 1,
              active: item.active !== false,
              createdAt: (item.createdAt as string) || new Date().toISOString(),
              updatedAt: (item.updatedAt as string) || new Date().toISOString(),
              structure: (item.structure as string) || (item.connectionRule as string) || '',
              explanation: (item.explanation as string) || (item.caution as string) || '',
              exampleJp: (item.exampleJp as string) || (ex0 ? String(ex0.japanese ?? '') : ''),
              exampleVi: (item.exampleVi as string) || (ex0 ? String(ex0.vietnamese ?? '') : ''),
              exampleAnalysis: (item.exampleAnalysis as string) || (ex0 ? String(ex0.analysis ?? '') : ''),
              notes: (item.notes as string) || (ex0 ? String(ex0.note ?? '') : ''),
            };
          });
        }
      }
    } catch {
      // ignore
    }
  }
  const raw = localStorage.getItem(LS_GRAMMAR_ITEMS);
  if (raw) {
    try {
      const all = JSON.parse(raw) as GrammarItem[];
      const filtered = all.filter((g) => g.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
      if (filtered.length > 0) return filtered;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function loadAllGrammarItems(): Promise<GrammarItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('grammar_items')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!error && data) return data.map(mapGrammarItemRow);
    } catch {
      // ignore
    }
  }
  const raw = localStorage.getItem(LS_GRAMMAR_ITEMS);
  return raw ? (JSON.parse(raw) as GrammarItem[]) : [];
}

export async function upsertGrammarItems(items: GrammarItem[]): Promise<void> {
  const raw = localStorage.getItem(LS_GRAMMAR_ITEMS);
  const current = raw ? (JSON.parse(raw) as GrammarItem[]) : [];
  const map = new Map(current.map((g) => [g.id, g]));
  items.forEach((g) => map.set(g.id, g));
  localStorage.setItem(LS_GRAMMAR_ITEMS, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('grammar_items');

  if (supabase) {
    try {
      const rows = items.map(grammarItemToRow);
      await supabase.from('grammar_items').upsert(rows, { onConflict: 'id' });
    } catch (err) {
      console.warn('Supabase upsertGrammarItems note:', err);
    }
    // Also save in lesson.examples to guarantee Supabase persistence even without grammar_items table
    try {
      const grouped = new Map<string, GrammarItem[]>();
      for (const item of items) {
        if (!grouped.has(item.lessonId)) {
          grouped.set(item.lessonId, []);
        }
        grouped.get(item.lessonId)!.push(item);
      }
      for (const [lId, lItems] of grouped.entries()) {
        await supabase.from('lessons').update({ examples: lItems }).eq('id', lId);
      }
    } catch (err) {
      console.warn('Supabase update lesson examples note:', err);
    }
  }
}

export async function deleteGrammarItemsByLesson(lessonId: string): Promise<void> {
  const raw = localStorage.getItem(LS_GRAMMAR_ITEMS);
  const current = raw ? (JSON.parse(raw) as GrammarItem[]) : [];
  localStorage.setItem(LS_GRAMMAR_ITEMS, JSON.stringify(current.filter((g) => g.lessonId !== lessonId)));
  dispatchDataChange('grammar_items');

  if (supabase) {
    try {
      await supabase.from('grammar_items').delete().eq('lesson_id', lessonId);
    } catch (err) {
      console.warn('Supabase deleteGrammarItemsByLesson note:', err);
    }
    try {
      await supabase.from('lessons').update({ examples: [] }).eq('id', lessonId);
    } catch (err) {
      console.warn('Supabase clear lesson examples note:', err);
    }
  }
}

export async function updateGrammarItem(id: string, updates: Partial<GrammarItem>): Promise<void> {
  const raw = localStorage.getItem(LS_GRAMMAR_ITEMS);
  const current = raw ? (JSON.parse(raw) as GrammarItem[]) : [];
  const next = current.map((g) => (g.id === id ? { ...g, ...updates } : g));
  localStorage.setItem(LS_GRAMMAR_ITEMS, JSON.stringify(next));
  dispatchDataChange('grammar_items');

  if (supabase) {
    try {
      const row: Record<string, unknown> = {};
      if (updates.grammarPattern !== undefined) row.grammar_pattern = updates.grammarPattern;
      if (updates.meaning !== undefined) row.meaning = updates.meaning;
      if (updates.structure !== undefined) row.structure = updates.structure;
      if (updates.explanation !== undefined) row.explanation = updates.explanation;
      if (updates.distinction !== undefined) row.distinction = updates.distinction;
      if (updates.exampleJp !== undefined) row.example_jp = updates.exampleJp;
      if (updates.exampleVi !== undefined) row.example_vi = updates.exampleVi;
      if (updates.exampleAnalysis !== undefined) row.example_analysis = updates.exampleAnalysis;
      if (updates.notes !== undefined) row.notes = updates.notes;
      if (updates.jlptLevel !== undefined) row.jlpt_level = updates.jlptLevel;
      if (updates.tags !== undefined) row.tags = updates.tags;
      if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
      if (updates.active !== undefined) row.active = updates.active;
      await supabase.from('grammar_items').update(row).eq('id', id);
    } catch (err) {
      console.warn('Supabase updateGrammarItem note:', err);
    }
  }
}

// ─── Vocab Progress (localStorage, per user+lesson+item) ────────

const LS_VOCAB_PROGRESS = 'quizforms_vocab_progress';

type ProgressMap = Record<string, VocabProgress>;

function getProgressKey(userId: string, lessonId: string, itemId: string): string {
  return `${userId}::${lessonId}::${itemId}`;
}

export function loadVocabProgress(userId: string, lessonId: string): Record<string, VocabProgress> {
  try {
    const raw = localStorage.getItem(LS_VOCAB_PROGRESS);
    if (!raw) return {};
    const all = JSON.parse(raw) as ProgressMap;
    const result: Record<string, VocabProgress> = {};
    const prefix = `${userId}::${lessonId}::`;
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        const itemId = key.slice(prefix.length);
        result[itemId] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveVocabProgress(
  userId: string,
  lessonId: string,
  itemId: string,
  progress: VocabProgress
): void {
  try {
    const raw = localStorage.getItem(LS_VOCAB_PROGRESS);
    const all = raw ? JSON.parse(raw) as ProgressMap : {};
    all[getProgressKey(userId, lessonId, itemId)] = progress;
    localStorage.setItem(LS_VOCAB_PROGRESS, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function getVocabProgressEntry(
  userId: string,
  lessonId: string,
  itemId: string
): VocabProgress | null {
  try {
    const raw = localStorage.getItem(LS_VOCAB_PROGRESS);
    if (!raw) return null;
    const all = JSON.parse(raw) as ProgressMap;
    return all[getProgressKey(userId, lessonId, itemId)] ?? null;
  } catch {
    return null;
  }
}

// ─── Grammar Progress (localStorage, per user+lesson) ────────────

const LS_GRAMMAR_PROGRESS = 'quizforms_grammar_progress';

type GrammarProgressMap = Record<string, GrammarProgress>;

function getGrammarProgressKey(userId: string, lessonId: string): string {
  return `${userId}::${lessonId}`;
}

export function loadGrammarProgress(userId: string): Record<string, GrammarProgress> {
  try {
    const raw = localStorage.getItem(LS_GRAMMAR_PROGRESS);
    if (!raw) return {};
    const all = JSON.parse(raw) as GrammarProgressMap;
    const result: Record<string, GrammarProgress> = {};
    const prefix = `${userId}::`;
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        const lessonId = key.slice(prefix.length);
        result[lessonId] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveGrammarProgress(
  userId: string,
  lessonId: string,
  progress: GrammarProgress
): void {
  try {
    const raw = localStorage.getItem(LS_GRAMMAR_PROGRESS);
    const all = raw ? JSON.parse(raw) as GrammarProgressMap : {};
    all[getGrammarProgressKey(userId, lessonId)] = progress;
    localStorage.setItem(LS_GRAMMAR_PROGRESS, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function getGrammarProgressEntry(
  userId: string,
  lessonId: string
): GrammarProgress | null {
  try {
    const raw = localStorage.getItem(LS_GRAMMAR_PROGRESS);
    if (!raw) return null;
    const all = JSON.parse(raw) as GrammarProgressMap;
    return all[getGrammarProgressKey(userId, lessonId)] ?? null;
  } catch {
    return null;
  }
}

export function getMasteryStatusColor(status: MasteryStatus): string {
  switch (status) {
    case 'forgot': return 'bg-red-100 text-red-700 border-red-200';
    case 'hard': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'almost': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'mastered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default: return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}

export function getMasteryStatusLabel(status: MasteryStatus): string {
  switch (status) {
    case 'forgot': return 'Quên';
    case 'hard': return 'Khó';
    case 'almost': return 'Gần nhớ';
    case 'mastered': return 'Đã nhớ';
    default: return 'Chưa học';
  }
}

// ─── Grammar Exam Practice Questions (ExamQuestion) ───────────

// ─── Reading Exam Passages ─────────────────────────────────────

export const LS_READING_PASSAGES = 'quizforms_reading_exam_passages';

function mapReadingPassageRow(r: Record<string, unknown>): ReadingExamPassage {
  return {
    id: r.id as string,
    lessonId: (r.lesson_id as string) ?? (r.lessonId as string),
    passageKey: (r.passage_key as string) ?? (r.passageKey as string) ?? '',
    passageTitle: (r.passage_title as string) ?? (r.passageTitle as string) ?? undefined,
    passageJa: (r.passage_ja as string) ?? (r.passageJa as string) ?? '',
    passageVi: (r.passage_vi as string) ?? (r.passageVi as string) ?? '',
    sortOrder: Number((r.sort_order as number) ?? (r.sortOrder as number) ?? 0),
    createdAt: (r.created_at as string) ?? (r.createdAt as string),
    updatedAt: (r.updated_at as string) ?? (r.updatedAt as string),
  };
}

function readingPassageToRow(p: ReadingExamPassage): Record<string, unknown> {
  return {
    id: p.id,
    lesson_id: p.lessonId,
    passage_key: p.passageKey,
    passage_title: p.passageTitle || null,
    passage_ja: p.passageJa,
    passage_vi: p.passageVi,
    sort_order: p.sortOrder,
  };
}

export async function loadReadingPassages(lessonId?: string): Promise<ReadingExamPassage[]> {
  if (supabase) {
    try {
      let query = supabase.from('reading_exam_passages').select('*').order('sort_order', { ascending: true });
      if (lessonId) {
        query = query.eq('lesson_id', lessonId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map(mapReadingPassageRow);
      }
    } catch {
      // fallback to lessons.notes / localStorage
    }

    // Fallback: check lessons.notes for readingPassages
    if (lessonId) {
      try {
        const { data: lessonRow, error: lErr } = await supabase
          .from('lessons')
          .select('notes')
          .eq('id', lessonId)
          .maybeSingle();
        if (!lErr && lessonRow?.notes) {
          const parsedNotes = JSON.parse(lessonRow.notes);
          if (Array.isArray(parsedNotes.readingPassages) && parsedNotes.readingPassages.length > 0) {
            return parsedNotes.readingPassages;
          }
        }
      } catch {
        // ignore
      }
    }
  }
  const raw = localStorage.getItem(LS_READING_PASSAGES);
  if (raw) {
    try {
      const all = JSON.parse(raw) as ReadingExamPassage[];
      let localPassages = all;
      if (lessonId) {
        localPassages = all.filter((p) => p.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
      } else {
        localPassages = all.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      // Auto-sync local passages to Supabase lessons.notes if missing remotely
      if (localPassages.length > 0 && lessonId && supabase) {
        (async () => {
          try {
            const { data: lessonRow } = await supabase
              .from('lessons')
              .select('notes')
              .eq('id', lessonId)
              .maybeSingle();
            let currentNotesObj: Record<string, unknown> = {};
            if (lessonRow?.notes) {
              try { currentNotesObj = JSON.parse(lessonRow.notes); } catch { /* ignore */ }
            }
            if (!currentNotesObj.readingPassages || !Array.isArray(currentNotesObj.readingPassages) || currentNotesObj.readingPassages.length === 0) {
              currentNotesObj.readingPassages = localPassages;
              await supabase
                .from('lessons')
                .update({ notes: JSON.stringify(currentNotesObj) })
                .eq('id', lessonId);
            }
          } catch {
            // ignore
          }
        })();
      }

      return localPassages;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function upsertReadingPassages(passages: ReadingExamPassage[]): Promise<void> {
  const raw = localStorage.getItem(LS_READING_PASSAGES);
  const current = raw ? (JSON.parse(raw) as ReadingExamPassage[]) : [];
  const map = new Map(current.map((p) => [p.id, p]));
  passages.forEach((p) => map.set(p.id, p));
  localStorage.setItem(LS_READING_PASSAGES, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('reading_exam_passages');

  if (supabase) {
    try {
      const rows = passages.map(readingPassageToRow);
      await supabase.from('reading_exam_passages').upsert(rows, { onConflict: 'id' });
    } catch (err) {
      console.warn('Supabase upsertReadingPassages note:', err);
    }

    // Also persist passages inside lessons.notes so that devices without reading_exam_passages table can access them
    const lessonIds = Array.from(new Set(passages.map((p) => p.lessonId).filter(Boolean)));
    for (const lid of lessonIds) {
      try {
        const pList = passages.filter((p) => p.lessonId === lid);
        const { data: lessonRow } = await supabase.from('lessons').select('notes').eq('id', lid).maybeSingle();
        let notesObj: Record<string, unknown> = {};
        if (lessonRow?.notes) {
          try { notesObj = JSON.parse(lessonRow.notes); } catch { /* ignore */ }
        }
        notesObj.readingPassages = pList;
        await supabase.from('lessons').update({ notes: JSON.stringify(notesObj) }).eq('id', lid);
      } catch (lErr) {
        console.warn('Supabase update lessons.notes with passages notice:', lErr);
      }
    }
  }
}

export async function deleteReadingPassagesByLesson(lessonId: string): Promise<void> {
  const raw = localStorage.getItem(LS_READING_PASSAGES);
  const current = raw ? (JSON.parse(raw) as ReadingExamPassage[]) : [];
  localStorage.setItem(LS_READING_PASSAGES, JSON.stringify(current.filter((p) => p.lessonId !== lessonId)));
  dispatchDataChange('reading_exam_passages');

  if (supabase) {
    try {
      await supabase.from('reading_exam_passages').delete().eq('lesson_id', lessonId);
    } catch (err) {
      console.warn('Supabase deleteReadingPassagesByLesson note:', err);
    }
  }
}

export const LS_EXAM_QUESTIONS = 'quizforms_exam_questions';
export const LS_EXAM_QUESTION_PROGRESS = 'quizforms_exam_question_progress';

function mapExamQuestionRow(r: Record<string, unknown>): ExamQuestion {
  let optionDetails: VocabExamOptionDetails | undefined = undefined;
  let passageId = (r.passage_id as string) ?? (r.passageId as string) ?? undefined;
  let topic = (r.topic as string) ?? undefined;
  let kanjiVocabulary = (r.kanji_vocabulary as string) ?? (r.kanjiVocabulary as string) ?? undefined;
  let grammarStructures = (r.grammar_structures as string) ?? (r.grammarStructures as string) ?? undefined;

  if (r.option_details && typeof r.option_details === 'object') {
    optionDetails = r.option_details as VocabExamOptionDetails;
  } else if (r.optionDetails && typeof r.optionDetails === 'object') {
    optionDetails = r.optionDetails as VocabExamOptionDetails;
  }

  const packedRaw = (typeof r.vocabulary_han_viet === 'string' && r.vocabulary_han_viet.startsWith('{'))
    ? r.vocabulary_han_viet
    : (typeof r.vocabularyHanViet === 'string' && r.vocabularyHanViet.startsWith('{'))
    ? r.vocabularyHanViet
    : null;

  if (packedRaw) {
    try {
      const parsed = JSON.parse(packedRaw) as Record<string, unknown>;
      if (parsed.optionDetails) optionDetails = parsed.optionDetails as VocabExamOptionDetails;
      else if (parsed.A && parsed.B) optionDetails = parsed as unknown as VocabExamOptionDetails;
      if (parsed.passageId && !passageId) passageId = parsed.passageId as string;
      if (parsed.topic && !topic) topic = parsed.topic as string;
      if (parsed.kanjiVocabulary && !kanjiVocabulary) kanjiVocabulary = parsed.kanjiVocabulary as string;
      if (parsed.grammarStructures && !grammarStructures) grammarStructures = parsed.grammarStructures as string;
    } catch {
      // ignore
    }
  }

  const rawCorrect = (r.correct_answer as string | null) ?? (r.correctAnswer as string | null);
  const correctAnswer = (rawCorrect === 'A' || rawCorrect === 'B' || rawCorrect === 'C' || rawCorrect === 'D') ? rawCorrect : null;

  return {
    id: r.id as string,
    lessonId: (r.lesson_id as string) ?? (r.lessonId as string),
    questionNo: Number((r.question_no as number) ?? (r.questionNo as number) ?? 0),
    questionType: ((r.question_type as ExamQuestionType) ?? (r.questionType as ExamQuestionType) ?? 'multiple_choice'),
    questionText: (r.question_text as string) ?? (r.questionText as string) ?? '',
    optionA: (r.option_a as string) ?? (r.optionA as string) ?? '',
    optionB: (r.option_b as string) ?? (r.optionB as string) ?? '',
    optionC: (r.option_c as string) ?? (r.optionC as string) ?? '',
    optionD: (r.option_d as string) ?? (r.optionD as string) ?? '',
    correctAnswer,
    timeSeconds: Number((r.time_seconds as number) ?? (r.timeSeconds as number) ?? 30),
    answerExplanation: (r.answer_explanation as string) ?? (r.answerExplanation as string) ?? '',
    vocabularyHanViet: (r.vocabulary_han_viet as string) ?? (r.vocabularyHanViet as string) ?? '',
    optionDetails,
    passageId,
    topic,
    kanjiVocabulary,
    grammarStructures,
    sortOrder: Number((r.sort_order as number) ?? (r.sortOrder as number) ?? 0),
    active: r.active !== undefined ? Boolean(r.active) : true,
    createdAt: (r.created_at as string) ?? (r.createdAt as string),
    updatedAt: (r.updated_at as string) ?? (r.updatedAt as string),
  };
}

function examQuestionToRow(q: ExamQuestion): Record<string, unknown> {
  const packedMeta: Record<string, unknown> = {};
  if (q.optionDetails) packedMeta.optionDetails = q.optionDetails;
  if (q.passageId) packedMeta.passageId = q.passageId;
  if (q.topic) packedMeta.topic = q.topic;
  if (q.kanjiVocabulary) packedMeta.kanjiVocabulary = q.kanjiVocabulary;
  if (q.grammarStructures) packedMeta.grammarStructures = q.grammarStructures;

  let vocabHanVietStr: string = '';
  if (Object.keys(packedMeta).length > 0) {
    vocabHanVietStr = JSON.stringify(packedMeta);
  } else if (q.vocabularyHanViet) {
    vocabHanVietStr = q.vocabularyHanViet;
  }

  return {
    id: q.id,
    lesson_id: q.lessonId,
    question_no: q.questionNo,
    question_type: q.questionType,
    question_text: q.questionText,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    correct_answer: q.correctAnswer,
    time_seconds: q.timeSeconds,
    answer_explanation: q.answerExplanation,
    vocabulary_han_viet: vocabHanVietStr || '',
    sort_order: q.sortOrder,
    active: q.active,
  };
}

export async function loadExamQuestions(lessonId?: string): Promise<ExamQuestion[]> {
  let supabaseQuestions: ExamQuestion[] = [];
  let supabaseSuccess = false;

  if (supabase) {
    try {
      let query = supabase.from('exam_questions').select('*').order('sort_order', { ascending: true });
      if (lessonId) {
        query = query.eq('lesson_id', lessonId);
      }
      const { data, error } = await query;
      if (!error && data) {
        supabaseSuccess = true;
        if (data.length > 0) {
          supabaseQuestions = data.map(mapExamQuestionRow);
          return supabaseQuestions;
        }
      }
    } catch {
      // fallback to localStorage
    }
  }

  const raw = localStorage.getItem(LS_EXAM_QUESTIONS);
  if (raw) {
    try {
      const all = JSON.parse(raw) as ExamQuestion[];
      let localQuestions = all;
      if (lessonId) {
        localQuestions = all.filter((q) => q.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
      } else {
        localQuestions = all.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      // Auto-sync: if local questions exist but Supabase has 0 rows, sync them up so other devices (mobile) can see them!
      if (localQuestions.length > 0 && supabase && (supabaseSuccess || supabaseQuestions.length === 0)) {
        const rows = localQuestions.map(examQuestionToRow);
        (async () => {
          try {
            const { error } = await supabase.from('exam_questions').upsert(rows, { onConflict: 'id' });
            if (error) console.warn('Auto-sync exam questions note:', error);
          } catch {
            // ignore
          }
        })();
      }

      return localQuestions;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function upsertExamQuestions(questions: ExamQuestion[]): Promise<void> {
  const raw = localStorage.getItem(LS_EXAM_QUESTIONS);
  const current = raw ? (JSON.parse(raw) as ExamQuestion[]) : [];
  const map = new Map(current.map((q) => [q.id, q]));
  questions.forEach((q) => map.set(q.id, q));
  localStorage.setItem(LS_EXAM_QUESTIONS, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('exam_questions');

  if (supabase) {
    try {
      const rows = questions.map(examQuestionToRow);
      const { error } = await supabase.from('exam_questions').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('Supabase upsertExamQuestions error:', error);
      }
    } catch (err) {
      console.warn('Supabase upsertExamQuestions note:', err);
    }
  }
}

export async function deleteExamQuestionsByLesson(lessonId: string): Promise<void> {
  const raw = localStorage.getItem(LS_EXAM_QUESTIONS);
  const current = raw ? (JSON.parse(raw) as ExamQuestion[]) : [];
  localStorage.setItem(LS_EXAM_QUESTIONS, JSON.stringify(current.filter((q) => q.lessonId !== lessonId)));
  dispatchDataChange('exam_questions');

  if (supabase) {
    try {
      await supabase.from('exam_questions').delete().eq('lesson_id', lessonId);
    } catch (err) {
      console.warn('Supabase deleteExamQuestionsByLesson note:', err);
    }
  }
}

export async function loadExamQuestionProgress(
  userId: string,
  lessonId: string
): Promise<Record<string, ExamQuestionProgress>> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('exam_question_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId);
      if (!error && data && data.length > 0) {
        const result: Record<string, ExamQuestionProgress> = {};
        for (const r of data) {
          result[r.question_id] = {
            userId: r.user_id,
            lessonId: r.lesson_id,
            questionId: r.question_id,
            selectedOption: r.selected_option,
            isCorrect: Boolean(r.is_correct),
            timeSpent: Number(r.time_spent || 0),
            completedAt: r.completed_at,
          };
        }
        return result;
      }
    } catch {
      // fallback
    }
  }
  try {
    const raw = localStorage.getItem(LS_EXAM_QUESTION_PROGRESS);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, ExamQuestionProgress>;
    const prefix = `${userId}::${lessonId}::`;
    const result: Record<string, ExamQuestionProgress> = {};
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        result[val.questionId] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function saveExamQuestionProgress(progress: ExamQuestionProgress): Promise<void> {
  const key = `${progress.userId}::${progress.lessonId}::${progress.questionId}`;
  try {
    const raw = localStorage.getItem(LS_EXAM_QUESTION_PROGRESS);
    const all = raw ? (JSON.parse(raw) as Record<string, ExamQuestionProgress>) : {};
    all[key] = progress;
    localStorage.setItem(LS_EXAM_QUESTION_PROGRESS, JSON.stringify(all));
  } catch {
    // ignore
  }

  if (supabase) {
    try {
      await supabase.from('exam_question_progress').upsert({
        user_id: progress.userId,
        lesson_id: progress.lessonId,
        question_id: progress.questionId,
        selected_option: progress.selectedOption,
        is_correct: progress.isCorrect,
        time_spent: progress.timeSpent,
        completed_at: progress.completedAt || new Date().toISOString(),
      }, { onConflict: 'user_id,question_id' });
    } catch (err) {
      console.warn('Supabase saveExamQuestionProgress note:', err);
    }
  }
}

export async function resetExamQuestionProgress(userId: string, lessonId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(LS_EXAM_QUESTION_PROGRESS);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, ExamQuestionProgress>;
      const prefix = `${userId}::${lessonId}::`;
      const next: Record<string, ExamQuestionProgress> = {};
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith(prefix)) {
          next[k] = v;
        }
      }
      localStorage.setItem(LS_EXAM_QUESTION_PROGRESS, JSON.stringify(next));
    }
  } catch {
    // ignore
  }

  if (supabase) {
    try {
      await supabase
        .from('exam_question_progress')
        .delete()
        .eq('user_id', userId)
        .eq('lesson_id', lessonId);
    } catch (err) {
      console.warn('Supabase resetExamQuestionProgress note:', err);
    }
  }
}

// ─── Flashcard Settings (localStorage, per user) ────────────────

const LS_FLASHCARD_SETTINGS = 'quizforms_flashcard_settings';

const DEFAULT_FLASHCARD_SETTINGS: FlashcardSettings = {
  fontSize: 'medium',
  showHiragana: true,
  audioEnabled: true,
  flipAnimation: true,
};

export function loadFlashcardSettings(userId: string): FlashcardSettings {
  try {
    const raw = localStorage.getItem(LS_FLASHCARD_SETTINGS);
    if (!raw) return DEFAULT_FLASHCARD_SETTINGS;
    const all = JSON.parse(raw) as Record<string, FlashcardSettings>;
    return all[userId] ?? DEFAULT_FLASHCARD_SETTINGS;
  } catch {
    return DEFAULT_FLASHCARD_SETTINGS;
  }
}

export function saveFlashcardSettings(userId: string, settings: FlashcardSettings): void {
  try {
    const raw = localStorage.getItem(LS_FLASHCARD_SETTINGS);
    const all = raw ? JSON.parse(raw) as Record<string, FlashcardSettings> : {};
    all[userId] = settings;
    localStorage.setItem(LS_FLASHCARD_SETTINGS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// ─── Listening Lessons ─────────────────────────────────────────

const LS_LISTENING_PROGRESS = 'quizforms_listening_progress';

function mapListeningLessonRow(r: Record<string, unknown>): ListeningLesson {
  return {
    id: r.id as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? '',
    level: (r.level as ListeningLesson['level']) ?? 'N5',
    category: (r.category as string) ?? '',
    description: (r.description as string) ?? '',
    audioSourceType: (r.audio_source_type as ListeningLesson['audioSourceType']) ?? 'URL',
    audioSource: r.audio_source as string,
    audioFileName: (r.audio_file_name as string) ?? '',
    durationSeconds: (r.duration_seconds as number) ?? 0,
    transcript: (r.transcript as string) ?? '',
    teacherName: (r.teacher_name as string) ?? '',
    classScope: (r.class_scope as string[]) ?? [],
    status: (r.status as ListeningLesson['status']) ?? 'DRAFT',
    folderId: (r.folder_id as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function listeningLessonToRow(l: ListeningLesson) {
  return {
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    level: l.level,
    category: l.category,
    description: l.description,
    audio_source_type: l.audioSourceType,
    audio_source: l.audioSource,
    audio_file_name: l.audioFileName,
    duration_seconds: l.durationSeconds,
    transcript: l.transcript,
    teacher_name: l.teacherName,
    class_scope: l.classScope,
    status: l.status,
    folder_id: l.folderId ?? null,
    sort_order: l.sortOrder,
    created_at: l.createdAt,
  };
}

function mapListeningQuestionRow(r: Record<string, unknown>): ListeningQuestionFull {
  return {
    id: r.id as string,
    lessonId: r.lesson_id as string,
    questionNo: (r.question_no as number) ?? 0,
    startTimeSec: (r.start_time_sec as number | null) ?? null,
    endTimeSec: (r.end_time_sec as number | null) ?? null,
    questionText: r.question_text as string,
    questionTranslationVi: (r.question_translation_vi as string) ?? '',
    optionA: (r.option_a as string) ?? '',
    optionB: (r.option_b as string) ?? '',
    optionC: (r.option_c as string) ?? '',
    optionD: (r.option_d as string) ?? '',
    correctAnswer: (r.correct_answer as ListeningAnswerKey) ?? 'A',
    explanationVi: (r.explanation_vi as string) ?? '',
    explanationJa: (r.explanation_ja as string) ?? '',
    transcriptSegment: (r.transcript_segment as string) ?? '',
    difficulty: (r.difficulty as ListeningQuestionFull['difficulty']) ?? 'NORMAL',
    points: (r.points as number) ?? 1,
    allowReplay: (r.allow_replay as boolean) ?? true,
    showExplanation: (r.show_explanation as ListeningQuestionFull['showExplanation']) ?? 'AFTER_SUBMIT',
    imageUrl: (r.image_url as string) ?? '',
    tags: (r.tags as string) ?? '',
  };
}

function listeningQuestionToRow(q: ListeningQuestionFull) {
  return {
    id: q.id,
    lesson_id: q.lessonId,
    question_no: q.questionNo,
    start_time_sec: q.startTimeSec,
    end_time_sec: q.endTimeSec,
    question_text: q.questionText,
    question_translation_vi: q.questionTranslationVi,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    correct_answer: q.correctAnswer,
    explanation_vi: q.explanationVi,
    explanation_ja: q.explanationJa,
    transcript_segment: q.transcriptSegment,
    difficulty: q.difficulty,
    points: q.points,
    allow_replay: q.allowReplay,
    show_explanation: q.showExplanation,
    image_url: q.imageUrl,
    tags: q.tags,
  };
}

export async function loadListeningLessons(): Promise<ListeningLesson[]> {
  if (supabase) {
    const { data } = await supabase.from('listening_lessons').select('*').order('sort_order', { ascending: true });
    if (data) return data.map(mapListeningLessonRow);
    return [];
  }
  const raw = localStorage.getItem('quizforms_listening_lessons');
  return raw ? JSON.parse(raw) as ListeningLesson[] : [];
}

export async function upsertListeningLessons(lessons: ListeningLesson[]): Promise<void> {
  if (supabase) {
    const rows = lessons.map(listeningLessonToRow);
    await supabase.from('listening_lessons').upsert(rows, { onConflict: 'id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_listening_lessons');
  const current = raw ? JSON.parse(raw) as ListeningLesson[] : [];
  const map = new Map(current.map((l) => [l.id, l]));
  lessons.forEach((l) => map.set(l.id, l));
  localStorage.setItem('quizforms_listening_lessons', JSON.stringify(Array.from(map.values())));
  dispatchDataChange('listening');
}

export async function updateListeningLesson(id: string, updates: Partial<ListeningLesson>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.subtitle !== undefined) row.subtitle = updates.subtitle;
    if (updates.level !== undefined) row.level = updates.level;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.audioSourceType !== undefined) row.audio_source_type = updates.audioSourceType;
    if (updates.audioSource !== undefined) row.audio_source = updates.audioSource;
    if (updates.audioFileName !== undefined) row.audio_file_name = updates.audioFileName;
    if (updates.durationSeconds !== undefined) row.duration_seconds = updates.durationSeconds;
    if (updates.transcript !== undefined) row.transcript = updates.transcript;
    if (updates.teacherName !== undefined) row.teacher_name = updates.teacherName;
    if (updates.classScope !== undefined) row.class_scope = updates.classScope;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    await supabase.from('listening_lessons').update(row).eq('id', id);
    return;
  }
  const all = await loadListeningLessons();
  const next = all.map((l) => (l.id === id ? { ...l, ...updates } : l));
  localStorage.setItem('quizforms_listening_lessons', JSON.stringify(next));
  dispatchDataChange('listening');
}

export async function deleteListeningLesson(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('listening_lessons').delete().eq('id', id);
    return;
  }
  const all = await loadListeningLessons();
  localStorage.setItem('quizforms_listening_lessons', JSON.stringify(all.filter((l) => l.id !== id)));
  dispatchDataChange('listening');
}

// Safe fetch (no answers) — uses SECURITY DEFINER function
export async function getListeningQuestionsSafe(lessonId: string): Promise<ListeningQuestion[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_listening_questions', { p_lesson_id: lessonId });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      lessonId: r.lesson_id as string,
      questionNo: (r.question_no as number) ?? 0,
      startTimeSec: (r.start_time_sec as number | null) ?? null,
      endTimeSec: (r.end_time_sec as number | null) ?? null,
      questionText: r.question_text as string,
      questionTranslationVi: (r.question_translation_vi as string) ?? '',
      optionA: (r.option_a as string) ?? '',
      optionB: (r.option_b as string) ?? '',
      optionC: (r.option_c as string) ?? '',
      optionD: (r.option_d as string) ?? '',
      difficulty: (r.difficulty as ListeningQuestion['difficulty']) ?? 'NORMAL',
      points: (r.points as number) ?? 1,
      allowReplay: (r.allow_replay as boolean) ?? true,
      showExplanation: (r.show_explanation as ListeningQuestion['showExplanation']) ?? 'AFTER_SUBMIT',
      imageUrl: (r.image_url as string) ?? '',
      tags: (r.tags as string) ?? '',
    }));
  }
  // localStorage mode: read directly, strip answers
  const raw = localStorage.getItem('quizforms_listening_questions');
  const all = raw ? JSON.parse(raw) as ListeningQuestionFull[] : [];
  return all
    .filter((q) => q.lessonId === lessonId)
    .sort((a, b) => a.questionNo - b.questionNo)
    .map((q) => {
      const { correctAnswer: _ca, explanationVi: _ev, explanationJa: _ej, transcriptSegment: _ts, ...safe } = q;
      void _ca; void _ev; void _ej; void _ts;
      return safe;
    });
}

export async function getListeningQuestionsAdmin(lessonId: string): Promise<ListeningQuestionFull[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_listening_questions_admin', { p_lesson_id: lessonId });
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        throw new Error('Bạn không có quyền quản trị để truy cập dữ liệu này.');
      }
      throw error;
    }
    return (data ?? []).map(mapListeningQuestionRow);
  }
  const raw = localStorage.getItem('quizforms_listening_questions');
  const all = raw ? JSON.parse(raw) as ListeningQuestionFull[] : [];
  return all.filter((q) => q.lessonId === lessonId).sort((a, b) => a.questionNo - b.questionNo);
}

export async function upsertListeningQuestions(questions: ListeningQuestionFull[]): Promise<void> {
  if (supabase) {
    const rows = questions.map(listeningQuestionToRow);
    await supabase.from('listening_questions').upsert(rows, { onConflict: 'id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_listening_questions');
  const current = raw ? JSON.parse(raw) as ListeningQuestionFull[] : [];
  const map = new Map(current.map((q) => [q.id, q]));
  questions.forEach((q) => map.set(q.id, q));
  localStorage.setItem('quizforms_listening_questions', JSON.stringify(Array.from(map.values())));
  dispatchDataChange('listening');
}

export async function deleteListeningQuestionsByLesson(lessonId: string): Promise<void> {
  if (supabase) {
    await supabase.from('listening_questions').delete().eq('lesson_id', lessonId);
    return;
  }
  const raw = localStorage.getItem('quizforms_listening_questions');
  const current = raw ? JSON.parse(raw) as ListeningQuestionFull[] : [];
  localStorage.setItem('quizforms_listening_questions', JSON.stringify(current.filter((q) => q.lessonId !== lessonId)));
  dispatchDataChange('listening');
}

// Server-side graded submission; returns full review only after submit
export async function submitListeningAttempt(
  lessonId: string,
  userId: string,
  username: string,
  answers: Record<string, string>
): Promise<ListeningAttemptResult> {
  if (supabase) {
    const { data, error } = await supabase.rpc('submit_listening_attempt', {
      p_lesson_id: lessonId,
      p_user_id: userId,
      p_username: username,
      p_answers: answers,
    });
    if (error) throw error;
    return data as ListeningAttemptResult;
  }
  // localStorage mode: grade locally
  const raw = localStorage.getItem('quizforms_listening_questions');
  const all = raw ? JSON.parse(raw) as ListeningQuestionFull[] : [];
  const qs = all.filter((q) => q.lessonId === lessonId).sort((a, b) => a.questionNo - b.questionNo);
  let score = 0; let total = 0; let correct = 0;
  const details: ListeningAttemptReviewDetail[] = qs.map((q) => {
    total += q.points;
    const chosen = answers[q.id] ?? null;
    const ok = chosen === q.correctAnswer;
    if (ok) { correct += 1; score += q.points; }
    return {
      questionId: q.id, questionNo: q.questionNo, chosen, correct: q.correctAnswer,
      isCorrect: ok, points: q.points, earned: ok ? q.points : 0,
      explanationVi: q.explanationVi, explanationJa: q.explanationJa,
      transcriptSegment: q.transcriptSegment,
      startTimeSec: q.startTimeSec, endTimeSec: q.endTimeSec,
    };
  });
  const attempt: ListeningAttempt = {
    id: generateId('att'), lessonId, userId, username, answers,
    score, totalPoints: total, correctCount: correct, questionCount: qs.length,
    createdAt: new Date().toISOString(),
  };
  const aRaw = localStorage.getItem('quizforms_listening_attempts');
  const attempts = aRaw ? JSON.parse(aRaw) as ListeningAttempt[] : [];
  attempts.unshift(attempt);
  localStorage.setItem('quizforms_listening_attempts', JSON.stringify(attempts));
  dispatchDataChange('listening');
  return {
    attemptId: attempt.id, score, totalPoints: total, correctCount: correct,
    questionCount: qs.length, details,
  };
}

export async function loadListeningAttempts(lessonId: string | null = null): Promise<ListeningAttempt[]> {
  if (supabase) {
    let query = supabase.from('listening_attempts').select('*').order('created_at', { ascending: false });
    if (lessonId) query = query.eq('lesson_id', lessonId);
    const { data } = await query;
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      lessonId: r.lesson_id as string,
      userId: r.user_id as string,
      username: (r.username as string) ?? '',
      answers: (r.answers as Record<string, string>) ?? {},
      score: Number(r.score) || 0,
      totalPoints: Number(r.total_points) || 0,
      correctCount: (r.correct_count as number) ?? 0,
      questionCount: (r.question_count as number) ?? 0,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
    }));
  }
  const raw = localStorage.getItem('quizforms_listening_attempts');
  const all = raw ? JSON.parse(raw) as ListeningAttempt[] : [];
  return lessonId ? all.filter((a) => a.lessonId === lessonId) : all;
}

export function uploadListeningAudio(file: File): Promise<{ path: string; publicUrl: string }> {
  return new Promise((resolve, reject) => {
    const sb = supabase;
    if (!sb) {
      reject(new Error('Chế độ Local không hỗ trợ upload file âm thanh'));
      return;
    }
    const okTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/wave'];
    if (!okTypes.includes(file.type) && !/\.(mp3|m4a|wav)$/i.test(file.name)) {
      reject(new Error('Chỉ hỗ trợ file MP3, M4A hoặc WAV'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error('File quá lớn (tối đa 20MB)'));
      return;
    }
    const path = `audio/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    sb.storage
      .from('listening-audio')
      .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
      .then(({ data, error }) => {
        if (error) { reject(new Error('Lỗi khi tải file lên: ' + error.message)); return; }
        if (!data) { reject(new Error('Không nhận được kết quả upload')); return; }
        const pub = sb.storage.from('listening-audio').getPublicUrl(data.path);
        resolve({ path: data.path, publicUrl: pub.data.publicUrl });
      });
  });
}

export function getListeningAudioUrl(source: string, sourceType: ListeningSourceType): string {
  if (sourceType === 'URL') return source;
  if (!supabase) return '';
  const { data } = supabase.storage.from('listening-audio').getPublicUrl(source);
  return data.publicUrl;
}

export interface ListeningProgress {
  attempts: number;
  lastScore: number | null;
  lastTotalPoints: number | null;
  lastAttemptAt: string | null;
  done: boolean;
}

export function loadListeningProgressMap(): Record<string, Record<string, ListeningProgress>> {
  try {
    const raw = localStorage.getItem(LS_LISTENING_PROGRESS);
    return raw ? JSON.parse(raw) as Record<string, Record<string, ListeningProgress>> : {};
  } catch {
    return {};
  }
}

export function saveListeningProgressEntry(userId: string, lessonId: string, entry: ListeningProgress): void {
  try {
    const raw = localStorage.getItem(LS_LISTENING_PROGRESS);
    const all = raw ? JSON.parse(raw) as Record<string, Record<string, ListeningProgress>> : {};
    const userMap = all[userId] ?? {};
    userMap[lessonId] = entry;
    all[userId] = userMap;
    localStorage.setItem(LS_LISTENING_PROGRESS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// ─── Reading Lessons ───────────────────────────────────────────

function mapReadingLessonRow(r: Record<string, unknown>): ReadingLesson {
  return {
    id: r.id as string,
    courseId: (r.course_id as string) ?? '',
    lessonNo: (r.lesson_no as number) ?? 0,
    titleJa: (r.title_ja as string) ?? '',
    titleVi: (r.title_vi as string) ?? '',
    level: (r.level as ReadingLesson['level']) ?? 'N5',
    category: (r.category as string) ?? '',
    readingTextJa: (r.reading_text_ja as string) ?? '',
    translationVi: (r.translation_vi as string) ?? '',
    imageUrl: (r.image_url as string) ?? '',
    estimatedMinutes: (r.estimated_minutes as number) ?? 5,
    displayOrder: (r.display_order as number) ?? 0,
    status: (r.status as ReadingLesson['status']) ?? 'draft',
    folderId: (r.folder_id as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function readingLessonToRow(l: ReadingLesson) {
  return {
    id: l.id,
    course_id: l.courseId,
    lesson_no: l.lessonNo,
    title_ja: l.titleJa,
    title_vi: l.titleVi,
    level: l.level,
    category: l.category,
    reading_text_ja: l.readingTextJa,
    translation_vi: l.translationVi,
    image_url: l.imageUrl,
    estimated_minutes: l.estimatedMinutes,
    display_order: l.displayOrder,
    status: l.status,
    folder_id: l.folderId ?? null,
    created_at: l.createdAt,
  };
}

export async function loadReadingLessons(): Promise<ReadingLesson[]> {
  if (supabase) {
    const { data } = await supabase.from('reading_lessons').select('*').order('display_order', { ascending: true });
    if (data) return data.map(mapReadingLessonRow);
    return [];
  }
  const raw = localStorage.getItem('quizforms_reading_lessons');
  return raw ? JSON.parse(raw) as ReadingLesson[] : [];
}

export async function upsertReadingLessons(lessons: ReadingLesson[]): Promise<void> {
  if (supabase) {
    const rows = lessons.map(readingLessonToRow);
    await supabase.from('reading_lessons').upsert(rows, { onConflict: 'id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_reading_lessons');
  const current = raw ? JSON.parse(raw) as ReadingLesson[] : [];
  const map = new Map(current.map((l) => [l.id, l]));
  lessons.forEach((l) => map.set(l.id, l));
  localStorage.setItem('quizforms_reading_lessons', JSON.stringify(Array.from(map.values())));
  dispatchDataChange('reading');
}

export async function updateReadingLesson(id: string, updates: Partial<ReadingLesson>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.titleJa !== undefined) row.title_ja = updates.titleJa;
    if (updates.titleVi !== undefined) row.title_vi = updates.titleVi;
    if (updates.level !== undefined) row.level = updates.level;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.readingTextJa !== undefined) row.reading_text_ja = updates.readingTextJa;
    if (updates.translationVi !== undefined) row.translation_vi = updates.translationVi;
    if (updates.imageUrl !== undefined) row.image_url = updates.imageUrl;
    if (updates.estimatedMinutes !== undefined) row.estimated_minutes = updates.estimatedMinutes;
    if (updates.displayOrder !== undefined) row.display_order = updates.displayOrder;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    await supabase.from('reading_lessons').update(row).eq('id', id);
    return;
  }
  const all = await loadReadingLessons();
  const next = all.map((l) => (l.id === id ? { ...l, ...updates } : l));
  localStorage.setItem('quizforms_reading_lessons', JSON.stringify(next));
  dispatchDataChange('reading');
}

export async function deleteReadingLesson(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('reading_lessons').delete().eq('id', id);
    return;
  }
  const all = await loadReadingLessons();
  localStorage.setItem('quizforms_reading_lessons', JSON.stringify(all.filter((l) => l.id !== id)));
  dispatchDataChange('reading');
}

function mapReadingQuestionFullRow(r: Record<string, unknown>): ReadingQuestionFull {
  return {
    id: r.id as string,
    readingId: r.reading_id as string,
    questionNo: (r.question_no as number) ?? 0,
    questionType: (r.question_type as ReadingQuestionFull['questionType']) ?? 'single_choice',
    questionTextVi: (r.question_text_vi as string) ?? '',
    optionA: (r.option_a as string) ?? '',
    optionB: (r.option_b as string) ?? '',
    optionC: (r.option_c as string) ?? '',
    optionD: (r.option_d as string) ?? '',
    correctAnswer: (r.correct_answer as string) ?? 'A',
    explanationVi: (r.explanation_vi as string) ?? '',
    evidenceJa: (r.evidence_ja as string) ?? '',
    points: (r.points as number) ?? 1,
    displayOrder: (r.display_order as number) ?? 0,
  };
}

function readingQuestionToRow(q: ReadingQuestionFull) {
  return {
    id: q.id,
    reading_id: q.readingId,
    question_no: q.questionNo,
    question_type: q.questionType,
    question_text_vi: q.questionTextVi,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    correct_answer: q.correctAnswer,
    explanation_vi: q.explanationVi,
    evidence_ja: q.evidenceJa,
    points: q.points,
    display_order: q.displayOrder,
  };
}

// Student fetch — server-side function strips answers
export async function getReadingQuestionsSafe(readingId: string): Promise<ReadingQuestionSafe[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_reading_questions', { p_reading_id: readingId });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      readingId: r.reading_id as string,
      questionNo: (r.question_no as number) ?? 0,
      questionType: (r.question_type as ReadingQuestionSafe['questionType']) ?? 'single_choice',
      questionTextVi: (r.question_text_vi as string) ?? '',
      optionA: (r.option_a as string) ?? '',
      optionB: (r.option_b as string) ?? '',
      optionC: (r.option_c as string) ?? '',
      optionD: (r.option_d as string) ?? '',
      points: (r.points as number) ?? 1,
      displayOrder: (r.display_order as number) ?? 0,
    }));
  }
  const raw = localStorage.getItem('quizforms_reading_questions');
  const all = raw ? JSON.parse(raw) as ReadingQuestionFull[] : [];
  return all
    .filter((q) => q.readingId === readingId)
    .sort((a, b) => a.questionNo - b.questionNo)
    .map((q) => {
      const { correctAnswer: _ca, explanationVi: _ev, evidenceJa: _ej, ...safe } = q;
      void _ca; void _ev; void _ej;
      return safe;
    });
}

export async function getReadingQuestionsAdmin(readingId: string): Promise<ReadingQuestionFull[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_reading_questions_admin', { p_reading_id: readingId });
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        throw new Error('Bạn không có quyền quản trị để truy cập dữ liệu này.');
      }
      throw error;
    }
    return (data ?? []).map(mapReadingQuestionFullRow);
  }
  const raw = localStorage.getItem('quizforms_reading_questions');
  const all = raw ? JSON.parse(raw) as ReadingQuestionFull[] : [];
  return all.filter((q) => q.readingId === readingId).sort((a, b) => a.questionNo - b.questionNo);
}

export async function upsertReadingQuestions(questions: ReadingQuestionFull[]): Promise<void> {
  if (supabase) {
    const rows = questions.map(readingQuestionToRow);
    await supabase.from('reading_questions').upsert(rows, { onConflict: 'id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_reading_questions');
  const current = raw ? JSON.parse(raw) as ReadingQuestionFull[] : [];
  const map = new Map(current.map((q) => [q.id, q]));
  questions.forEach((q) => map.set(q.id, q));
  localStorage.setItem('quizforms_reading_questions', JSON.stringify(Array.from(map.values())));
  dispatchDataChange('reading');
}

export async function loadReadingGrammar(readingId: string): Promise<ReadingGrammar[]> {
  if (supabase) {
    const { data } = await supabase
      .from('reading_grammar')
      .select('*')
      .eq('reading_id', readingId)
      .order('grammar_no', { ascending: true });
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      readingId: r.reading_id as string,
      grammarNo: (r.grammar_no as number) ?? 0,
      pattern: (r.pattern as string) ?? '',
      meaningVi: (r.meaning_vi as string) ?? '',
      formation: (r.formation as string) ?? '',
      exampleJa: (r.example_ja as string) ?? '',
      exampleVi: (r.example_vi as string) ?? '',
      noteVi: (r.note_vi as string) ?? '',
      displayOrder: (r.display_order as number) ?? 0,
    }));
  }
  const raw = localStorage.getItem('quizforms_reading_grammar');
  const all = raw ? JSON.parse(raw) as ReadingGrammar[] : [];
  return all.filter((g) => g.readingId === readingId).sort((a, b) => a.grammarNo - b.grammarNo);
}

export async function upsertReadingGrammar(items: ReadingGrammar[]): Promise<void> {
  if (supabase) {
    const rows = items.map((g) => ({
      id: g.id,
      reading_id: g.readingId,
      grammar_no: g.grammarNo,
      pattern: g.pattern,
      meaning_vi: g.meaningVi,
      formation: g.formation,
      example_ja: g.exampleJa,
      example_vi: g.exampleVi,
      note_vi: g.noteVi,
      display_order: g.displayOrder,
    }));
    await supabase.from('reading_grammar').upsert(rows, { onConflict: 'id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_reading_grammar');
  const current = raw ? JSON.parse(raw) as ReadingGrammar[] : [];
  const map = new Map(current.map((g) => [g.id, g]));
  items.forEach((g) => map.set(g.id, g));
  localStorage.setItem('quizforms_reading_grammar', JSON.stringify(Array.from(map.values())));
  dispatchDataChange('reading');
}

// Server-side graded submission
export async function submitReadingAttempt(
  readingId: string,
  userId: string,
  answers: Record<string, string>
): Promise<ReadingResult> {
  if (supabase) {
    const { data, error } = await supabase.rpc('submit_reading_attempt', {
      p_reading_id: readingId,
      p_user_id: userId,
      p_answers: answers,
    });
    if (error) throw error;
    return data as ReadingResult;
  }
  // localStorage mode: grade locally
  const raw = localStorage.getItem('quizforms_reading_questions');
  const all = raw ? JSON.parse(raw) as ReadingQuestionFull[] : [];
  const qs = all.filter((q) => q.readingId === readingId).sort((a, b) => a.questionNo - b.questionNo);
  let score = 0; let total = 0; let correct = 0;
  const details: ReadingAnswerDetail[] = qs.map((q) => {
    total += q.points;
    const chosen = answers[q.id] ?? null;
    const normalize = (s: string) => s.toUpperCase().trim().split('').sort().join('');
    const ok = chosen !== null && normalize(chosen) === normalize(q.correctAnswer);
    if (ok) { correct += 1; score += q.points; }
    return {
      questionId: q.id, questionNo: q.questionNo, chosen, correct: q.correctAnswer,
      isCorrect: ok, points: q.points, earned: ok ? q.points : 0,
      explanationVi: q.explanationVi, evidenceJa: q.evidenceJa,
    };
  });
  saveReadingProgressRecord(userId, readingId, {
    answers, score, totalPoints: total, correctCount: correct, questionCount: qs.length,
    completed: true, readingScrollPosition: 0, uiState: {}, result: null, updatedAt: '',
  });
  return { score, totalPoints: total, correctCount: correct, questionCount: qs.length, details };
}

// ─── Reading Progress ──────────────────────────────────────────

export async function loadReadingProgress(userId: string, readingId: string): Promise<ReadingProgressRecord | null> {
  if (supabase) {
    const { data } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('reading_id', readingId)
      .maybeSingle();
    if (!data) return null;
    return {
      answers: (data.answers as Record<string, string>) ?? {},
      score: Number(data.score) || 0,
      totalPoints: Number(data.total_points) || 0,
      correctCount: (data.correct_count as number) ?? 0,
      questionCount: (data.question_count as number) ?? 0,
      completed: (data.completed as boolean) ?? false,
      readingScrollPosition: Number(data.reading_scroll_position) || 0,
      uiState: (data.ui_state as ReadingUiState) ?? {},
      result: (data.result_json as ReadingResult) ?? null,
      updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
    };
  }
  const raw = localStorage.getItem('quizforms_reading_progress');
  const all = raw ? JSON.parse(raw) as Record<string, Record<string, ReadingProgressRecord>> : {};
  return all[userId]?.[readingId] ?? null;
}

export async function saveReadingProgressRecord(
  userId: string,
  readingId: string,
  record: ReadingProgressRecord
): Promise<void> {
  const row = {
    user_id: userId,
    reading_id: readingId,
    answers: record.answers,
    score: record.score,
    total_points: record.totalPoints,
    correct_count: record.correctCount,
    question_count: record.questionCount,
    completed: record.completed,
    reading_scroll_position: record.readingScrollPosition,
    ui_state: record.uiState,
    result_json: record.result,
    updated_at: new Date().toISOString(),
  };
  if (supabase) {
    await supabase.from('reading_progress').upsert(row, { onConflict: 'user_id,reading_id' });
    return;
  }
  const raw = localStorage.getItem('quizforms_reading_progress');
  const all = raw ? JSON.parse(raw) as Record<string, Record<string, ReadingProgressRecord>> : {};
  const userMap = all[userId] ?? {};
  userMap[readingId] = { ...record, updatedAt: row.updated_at };
  all[userId] = userMap;
  localStorage.setItem('quizforms_reading_progress', JSON.stringify(all));
  dispatchDataChange('reading');
}

// Atomic Excel import via SECURITY DEFINER function (Supabase mode only)
export async function importReadingDataAtomic(
  lessons: ReadingLesson[],
  questions: ReadingQuestionFull[],
  grammar: ReadingGrammar[]
): Promise<{ created: { lessons: number; questions: number; grammar: number }; updated: { lessons: number; questions: number; grammar: number } }> {
  const sb = supabase;
  if (!sb) throw new Error('Chế độ Local không hỗ trợ import nguyên tử');
  const lessonPayload = lessons.map((l) => ({
    id: l.id, courseId: l.courseId, lessonNo: l.lessonNo, titleJa: l.titleJa,
    titleVi: l.titleVi, level: l.level, category: l.category,
    readingTextJa: l.readingTextJa, translationVi: l.translationVi,
    imageUrl: l.imageUrl, estimatedMinutes: l.estimatedMinutes,
    displayOrder: l.displayOrder, status: l.status,
  }));
  const questionPayload = questions.map((q) => ({
    id: q.id, readingId: q.readingId, questionNo: q.questionNo, questionType: q.questionType,
    questionTextVi: q.questionTextVi, optionA: q.optionA, optionB: q.optionB,
    optionC: q.optionC, optionD: q.optionD, correctAnswer: q.correctAnswer,
    explanationVi: q.explanationVi, evidenceJa: q.evidenceJa, points: q.points,
    displayOrder: q.displayOrder,
  }));
  const grammarPayload = grammar.map((g) => ({
    id: g.id, readingId: g.readingId, grammarNo: g.grammarNo, pattern: g.pattern,
    meaningVi: g.meaningVi, formation: g.formation, exampleJa: g.exampleJa,
    exampleVi: g.exampleVi, noteVi: g.noteVi, displayOrder: g.displayOrder,
  }));
  const { data, error } = await sb.rpc('import_reading_data', {
    p_lessons: lessonPayload,
    p_questions: questionPayload,
    p_grammar: grammarPayload,
  });
  if (error) throw error;
  return data as { created: { lessons: number; questions: number; grammar: number }; updated: { lessons: number; questions: number; grammar: number } };
}

// ─── Exam Folders (Windows Explorer hierarchy) ────────────────

const LS_FOLDERS = 'quizforms_exam_folders';

function mapFolderRow(r: Record<string, unknown>): ExamFolder {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    color: (r.color as ExamFolder['color']) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

function folderToRow(f: ExamFolder) {
  return {
    id: f.id,
    parent_id: f.parentId,
    name: f.name,
    description: f.description,
    color: f.color,
    sort_order: f.sortOrder,
    created_by: f.createdBy,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
    archived_at: f.archivedAt,
  };
}

export async function loadExamFolders(includeArchived = false): Promise<ExamFolder[]> {
  if (supabase) {
    const { data } = await supabase.from('exam_folders').select('*').order('sort_order', { ascending: true });
    const folders = (data ?? []).map(mapFolderRow);
    return includeArchived ? folders : folders.filter((f) => !f.archivedAt);
  }
  const raw = localStorage.getItem(LS_FOLDERS);
  const all = raw ? (JSON.parse(raw) as ExamFolder[]) : [];
  return includeArchived ? all : all.filter((f) => !f.archivedAt);
}

export async function createExamFolder(data: Omit<ExamFolder, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>): Promise<ExamFolder> {
  const folder: ExamFolder = {
    ...data,
    id: generateId('folder'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };
  if (supabase) {
    await supabase.from('exam_folders').insert(folderToRow(folder));
  } else {
    const current = await loadExamFolders(true);
    localStorage.setItem(LS_FOLDERS, JSON.stringify([...current, folder]));
    dispatchDataChange('folders');
  }
  return folder;
}

export async function updateExamFolder(id: string, updates: Partial<ExamFolder>): Promise<void> {
  const withTimestamp = { ...updates, updatedAt: new Date().toISOString() };
  if (supabase) {
    const row: Record<string, unknown> = { updated_at: withTimestamp.updatedAt };
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.color !== undefined) row.color = updates.color;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.parentId !== undefined) row.parent_id = updates.parentId;
    if (updates.archivedAt !== undefined) row.archived_at = updates.archivedAt;
    await supabase.from('exam_folders').update(row).eq('id', id);
    return;
  }
  const current = await loadExamFolders(true);
  const next = current.map((f) => (f.id === id ? { ...f, ...withTimestamp } : f));
  localStorage.setItem(LS_FOLDERS, JSON.stringify(next));
  dispatchDataChange('folders');
}

export async function deleteExamFolder(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('exam_folders').delete().eq('id', id);
    return;
  }
  const current = await loadExamFolders(true);
  localStorage.setItem(LS_FOLDERS, JSON.stringify(current.filter((f) => f.id !== id)));
  dispatchDataChange('folders');
}

export async function moveExamToFolder(examId: string, folderId: string | null): Promise<void> {
  await updateExam(examId, { folderId });
}

// ─── Practice folders (Luyện tập) ─────────────────────────────

const LS_PRACTICE_FOLDERS = 'quizforms_practice_folders';

function practiceFolderToRow(f: PracticeFolder) {
  return {
    id: f.id,
    parent_id: f.parentId,
    name: f.name,
    description: f.description,
    color: f.color,
    sort_order: f.sortOrder,
    created_by: f.createdBy,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
    archived_at: f.archivedAt,
  };
}

function mapPracticeFolderRow(r: Record<string, unknown>): PracticeFolder {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    color: (r.color as PracticeFolder['color']) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

export async function loadPracticeFolders(includeArchived = false): Promise<PracticeFolder[]> {
  if (supabase) {
    const { data } = await supabase.from('practice_folders').select('*').order('sort_order', { ascending: true });
    const folders = (data ?? []).map(mapPracticeFolderRow);
    return includeArchived ? folders : folders.filter((f) => !f.archivedAt);
  }
  const raw = localStorage.getItem(LS_PRACTICE_FOLDERS);
  const all = raw ? (JSON.parse(raw) as PracticeFolder[]) : [];
  return includeArchived ? all : all.filter((f) => !f.archivedAt);
}

export async function createPracticeFolder(data: Omit<PracticeFolder, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>): Promise<PracticeFolder> {
  const folder: PracticeFolder = {
    ...data,
    id: generateId('pfolder'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };
  if (supabase) {
    await supabase.from('practice_folders').insert(practiceFolderToRow(folder));
  } else {
    const current = await loadPracticeFolders(true);
    localStorage.setItem(LS_PRACTICE_FOLDERS, JSON.stringify([...current, folder]));
    dispatchDataChange('practice');
  }
  return folder;
}

export async function updatePracticeFolder(id: string, updates: Partial<PracticeFolder>): Promise<void> {
  const withTimestamp = { ...updates, updatedAt: new Date().toISOString() };
  if (supabase) {
    const row: Record<string, unknown> = { updated_at: withTimestamp.updatedAt };
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.color !== undefined) row.color = updates.color;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.parentId !== undefined) row.parent_id = updates.parentId;
    if (updates.archivedAt !== undefined) row.archived_at = updates.archivedAt;
    await supabase.from('practice_folders').update(row).eq('id', id);
    return;
  }
  const current = await loadPracticeFolders(true);
  const next = current.map((f) => (f.id === id ? { ...f, ...withTimestamp } : f));
  localStorage.setItem(LS_PRACTICE_FOLDERS, JSON.stringify(next));
  dispatchDataChange('practice');
}

export async function deletePracticeFolder(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('practice_folders').delete().eq('id', id);
    return;
  }
  const current = await loadPracticeFolders(true);
  localStorage.setItem(LS_PRACTICE_FOLDERS, JSON.stringify(current.filter((f) => f.id !== id)));
  dispatchDataChange('practice');
}

export async function movePracticeToFolder(practiceId: string, folderId: string | null): Promise<void> {
  await updatePractice(practiceId, { folderId });
}

/** Question count per practice (practice_questions is not directly readable). */
export async function getPracticeQuestionCounts(): Promise<Map<string, number>> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_practice_question_counts');
    if (error) return new Map();
    const map = new Map<string, number>();
    (data ?? []).forEach((r: { practice_id: string; question_count: number }) => {
      map.set(r.practice_id, Number(r.question_count));
    });
    return map;
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const all = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  const map = new Map<string, number>();
  all.forEach((q) => map.set(q.practiceId, (map.get(q.practiceId) ?? 0) + 1));
  return map;
}

// ─── Practice (Luyện tập) ──────────────────────────────────────

const LS_PRACTICES = 'quizforms_practices';
const LS_PRACTICE_QUESTIONS = 'quizforms_practice_questions';
const LS_PRACTICE_ATTEMPTS = 'quizforms_practice_attempts';
const LS_PRACTICE_PROGRESS = 'quizforms_practice_progress';

function mapPracticeRow(r: Record<string, unknown>): Practice {
  return {
    id: r.id as string,
    title: r.title as string,
    category: (r.category as Practice['category']) ?? 'vocabulary',
    level: (r.level as Practice['level']) ?? 'N5',
    linkedLessonId: (r.linked_lesson_id as string | null) ?? null,
    passage: (r.passage as string) ?? '',
    audioSourceType: (r.audio_source_type as Practice['audioSourceType']) ?? 'URL',
    audioSource: (r.audio_source as string) ?? '',
    audioFileName: (r.audio_file_name as string) ?? '',
    teacherName: (r.teacher_name as string) ?? '',
    targetClasses: (r.target_classes as string[]) ?? [],
    startAt: (r.start_at as string | null) ?? null,
    deadline: (r.deadline as string | null) ?? null,
    classSchedules: (r.class_schedules as Practice['classSchedules']) ?? {},
    allowAiTutor: (r.allow_ai_tutor as boolean | null) ?? true,
    status: (r.status as Practice['status']) ?? 'DRAFT',
    sortOrder: (r.sort_order as number) ?? 0,
    folderId: (r.folder_id as string | null) ?? null,
    archivedAt: (r.archived_at as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function practiceToRow(p: Practice) {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    level: p.level,
    linked_lesson_id: p.linkedLessonId,
    passage: p.passage,
    audio_source_type: p.audioSourceType,
    audio_source: p.audioSource,
    audio_file_name: p.audioFileName,
    teacher_name: p.teacherName,
    target_classes: p.targetClasses,
    start_at: p.startAt,
    deadline: p.deadline,
    class_schedules: p.classSchedules,
    allow_ai_tutor: p.allowAiTutor,
    status: p.status,
    sort_order: p.sortOrder,
    folder_id: p.folderId,
    archived_at: p.archivedAt,
  };
}

export async function loadPractices(): Promise<Practice[]> {
  if (supabase) {
    const { data } = await supabase.from('practices').select('*').order('sort_order', { ascending: true });
    if (data) return data.map(mapPracticeRow);
    return [];
  }
  const raw = localStorage.getItem(LS_PRACTICES);
  return raw ? (JSON.parse(raw) as Practice[]).sort((a, b) => a.sortOrder - b.sortOrder) : [];
}

export async function upsertPractices(practices: Practice[]): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('practices').upsert(practices.map(practiceToRow), { onConflict: 'id' });
    if (error) throw error;
    return;
  }
  const raw = localStorage.getItem(LS_PRACTICES);
  const current = raw ? JSON.parse(raw) as Practice[] : [];
  const map = new Map(current.map((p) => [p.id, p]));
  practices.forEach((p) => map.set(p.id, p));
  localStorage.setItem(LS_PRACTICES, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('practice');
}

export async function updatePractice(id: string, updates: Partial<Practice>): Promise<void> {
  if (supabase) {
    const row: Record<string, unknown> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.level !== undefined) row.level = updates.level;
    if (updates.linkedLessonId !== undefined) row.linked_lesson_id = updates.linkedLessonId;
    if (updates.passage !== undefined) row.passage = updates.passage;
    if (updates.audioSourceType !== undefined) row.audio_source_type = updates.audioSourceType;
    if (updates.audioSource !== undefined) row.audio_source = updates.audioSource;
    if (updates.audioFileName !== undefined) row.audio_file_name = updates.audioFileName;
    if (updates.teacherName !== undefined) row.teacher_name = updates.teacherName;
    if (updates.targetClasses !== undefined) row.target_classes = updates.targetClasses;
    if (updates.startAt !== undefined) row.start_at = updates.startAt;
    if (updates.deadline !== undefined) row.deadline = updates.deadline;
    if (updates.classSchedules !== undefined) row.class_schedules = updates.classSchedules;
    if (updates.allowAiTutor !== undefined) row.allow_ai_tutor = updates.allowAiTutor;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.folderId !== undefined) row.folder_id = updates.folderId;
    if (updates.archivedAt !== undefined) row.archived_at = updates.archivedAt;
    const { error } = await supabase.from('practices').update(row).eq('id', id);
    if (error) throw error;
    return;
  }
  const all = await loadPractices();
  const next = all.map((p) => (p.id === id ? { ...p, ...updates } : p));
  localStorage.setItem(LS_PRACTICES, JSON.stringify(next));
  dispatchDataChange('practice');
}

export async function deletePractice(id: string): Promise<void> {
  if (supabase) {
    await supabase.from('practices').delete().eq('id', id);
    return;
  }
  const all = await loadPractices();
  localStorage.setItem(LS_PRACTICES, JSON.stringify(all.filter((p) => p.id !== id)));
  const qRaw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  if (qRaw) {
    const qs = JSON.parse(qRaw) as PracticeQuestionFull[];
    localStorage.setItem(LS_PRACTICE_QUESTIONS, JSON.stringify(qs.filter((q) => q.practiceId !== id)));
  }
  dispatchDataChange('practice');
}

function mapPracticeQuestionRow(r: Record<string, unknown>): PracticeQuestionFull {
  return {
    id: r.id as string,
    practiceId: r.practice_id as string,
    questionNo: (r.question_no as number) ?? 0,
    questionType: (r.question_type as PracticeQuestionFull['questionType']) ?? 'single_choice',
    questionText: r.question_text as string,
    optionA: (r.option_a as string) ?? '',
    optionB: (r.option_b as string) ?? '',
    optionC: (r.option_c as string) ?? '',
    optionD: (r.option_d as string) ?? '',
    hint: (r.hint as string) ?? '',
    imageUrl: (r.image_url as string) ?? '',
    points: (r.points as number) ?? 1,
    correctAnswer: (r.correct_answer as string) ?? 'A',
    explanation: (r.explanation as string) ?? '',
    difficulty: (r.difficulty as PracticeQuestionFull['difficulty']) ?? 'medium',
    questionCategory: (r.question_category as string) ?? '',
    tags: (r.tags as string) ?? '',
  };
}

function practiceQuestionToRow(q: PracticeQuestionFull) {
  return {
    id: q.id,
    practice_id: q.practiceId,
    question_no: q.questionNo,
    question_type: q.questionType,
    question_text: q.questionText,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    hint: q.hint,
    image_url: q.imageUrl,
    correct_answer: q.correctAnswer,
    explanation: q.explanation,
    difficulty: q.difficulty,
    question_category: q.questionCategory,
    tags: q.tags,
    points: q.points,
  };
}

// Safe fetch (no answers) — SECURITY DEFINER function, PUBLISHED only
export async function getPracticeQuestionsSafe(practiceId: string): Promise<PracticeQuestion[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_practice_questions', { p_practice_id: practiceId });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      practiceId: r.practice_id as string,
      questionNo: (r.question_no as number) ?? 0,
      questionType: (r.question_type as PracticeQuestion['questionType']) ?? 'single_choice',
      questionText: r.question_text as string,
      optionA: (r.option_a as string) ?? '',
      optionB: (r.option_b as string) ?? '',
      optionC: (r.option_c as string) ?? '',
      optionD: (r.option_d as string) ?? '',
      hint: (r.hint as string) ?? '',
      imageUrl: (r.image_url as string) ?? '',
      points: (r.points as number) ?? 1,
    }));
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const all = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  return all
    .filter((q) => q.practiceId === practiceId)
    .sort((a, b) => a.questionNo - b.questionNo)
    .map((q) => {
      const { correctAnswer: _ca, explanation: _ex, ...safe } = q;
      void _ca; void _ex;
      return safe;
    });
}

export async function getPracticeQuestionsAdmin(practiceId: string): Promise<PracticeQuestionFull[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_practice_questions_admin', { p_practice_id: practiceId });
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        throw new Error('Bạn không có quyền quản trị để truy cập dữ liệu này.');
      }
      throw error;
    }
    return (data ?? []).map(mapPracticeQuestionRow);
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const all = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  return all.filter((q) => q.practiceId === practiceId).sort((a, b) => a.questionNo - b.questionNo);
}

export async function upsertPracticeQuestions(questions: PracticeQuestionFull[]): Promise<void> {
  if (questions.length === 0) return;
  if (supabase) {
    // practice_questions has no SELECT policy (answers must stay hidden), so
    // .upsert() fails: merge-duplicates reads existing rows first (42501).
    // Split into INSERT for new IDs and UPDATE for existing IDs instead.
    const { data: existing, error: eExist } = await supabase
      .rpc('get_practice_questions_admin', { p_practice_id: questions[0].practiceId });
    if (eExist) throw eExist;
    const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
    const toInsert = questions.filter((q) => !existingIds.has(q.id)).map(practiceQuestionToRow);
    const toUpdate = questions.filter((q) => existingIds.has(q.id)).map(practiceQuestionToRow);
    if (toInsert.length > 0) {
      const { error } = await supabase.from('practice_questions').insert(toInsert);
      if (error) throw error;
    }
    for (const row of toUpdate) {
      const { error } = await supabase.from('practice_questions').update(row).eq('id', row.id);
      if (error) throw error;
    }
    return;
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const current = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  const map = new Map(current.map((q) => [q.id, q]));
  questions.forEach((q) => map.set(q.id, q));
  localStorage.setItem(LS_PRACTICE_QUESTIONS, JSON.stringify(Array.from(map.values())));
  dispatchDataChange('practice');
}

export async function deletePracticeQuestionsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (supabase) {
    const { error } = await supabase.from('practice_questions').delete().in('id', ids);
    if (error) throw error;
    return;
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const current = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  const set = new Set(ids);
  localStorage.setItem(LS_PRACTICE_QUESTIONS, JSON.stringify(current.filter((q) => !set.has(q.id))));
  dispatchDataChange('practice');
}

export async function deletePracticeQuestionsByPractice(practiceId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('practice_questions').delete().eq('practice_id', practiceId);
    if (error) throw error;
    return;
  }
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const current = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  localStorage.setItem(LS_PRACTICE_QUESTIONS, JSON.stringify(current.filter((q) => q.practiceId !== practiceId)));
  dispatchDataChange('practice');
}

// Server-side graded submission; returns full review only after submit
export async function submitPracticeAttempt(
  practiceId: string,
  userId: string,
  username: string,
  answers: Record<string, string>
): Promise<PracticeAttemptResult> {
  if (supabase) {
    const { data, error } = await supabase.rpc('submit_practice_attempt', {
      p_practice_id: practiceId,
      p_user_id: userId,
      p_username: username,
      p_answers: answers,
    });
    if (error) throw error;
    return data as unknown as PracticeAttemptResult;
  }
  // localStorage mode: grade locally
  const raw = localStorage.getItem(LS_PRACTICE_QUESTIONS);
  const all = raw ? JSON.parse(raw) as PracticeQuestionFull[] : [];
  const qs = all.filter((q) => q.practiceId === practiceId).sort((a, b) => a.questionNo - b.questionNo);
  let score = 0; let total = 0; let correct = 0;
  const normalize = (s: string) => s.toUpperCase().split('').filter((c) => 'ABCD'.includes(c)).sort().join('');
  const details: PracticeAnswerDetail[] = qs.map((q) => {
    total += q.points;
    const chosen = answers[q.id] ?? null;
    const ok = q.questionType === 'short_answer'
      ? chosen !== null && chosen.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
      : chosen !== null && normalize(chosen) === normalize(q.correctAnswer);
    if (ok) { correct += 1; score += q.points; }
    return {
      questionId: q.id, questionNo: q.questionNo, chosen, correct: q.correctAnswer,
      isCorrect: ok, points: q.points, earned: ok ? q.points : 0,
      explanation: q.explanation,
    };
  });
  const attempt: PracticeAttempt = {
    id: generateId('patt'), practiceId, userId, username, answers,
    score, totalPoints: total, correctCount: correct, questionCount: qs.length,
    createdAt: new Date().toISOString(),
  };
  const aRaw = localStorage.getItem(LS_PRACTICE_ATTEMPTS);
  const attempts = aRaw ? JSON.parse(aRaw) as PracticeAttempt[] : [];
  attempts.unshift(attempt);
  localStorage.setItem(LS_PRACTICE_ATTEMPTS, JSON.stringify(attempts));
  dispatchDataChange('practice');
  return {
    attemptId: attempt.id, score, totalPoints: total, correctCount: correct,
    questionCount: qs.length, details,
  };
}

export async function loadPracticeAttempts(practiceId: string | null = null): Promise<PracticeAttempt[]> {
  if (supabase) {
    let query = supabase.from('practice_attempts').select('*').order('created_at', { ascending: false });
    if (practiceId) query = query.eq('practice_id', practiceId);
    const { data } = await query;
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      practiceId: r.practice_id as string,
      userId: r.user_id as string,
      username: (r.username as string) ?? '',
      answers: (r.answers as Record<string, string>) ?? {},
      score: Number(r.score) || 0,
      totalPoints: Number(r.total_points) || 0,
      correctCount: (r.correct_count as number) ?? 0,
      questionCount: (r.question_count as number) ?? 0,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
    }));
  }
  const raw = localStorage.getItem(LS_PRACTICE_ATTEMPTS);
  const all = raw ? JSON.parse(raw) as PracticeAttempt[] : [];
  return practiceId ? all.filter((a) => a.practiceId === practiceId) : all;
}

export function getPracticeAudioUrl(source: string, sourceType: ListeningSourceType): string {
  if (sourceType === 'URL') return source;
  if (!supabase) return '';
  const { data } = supabase.storage.from('listening-audio').getPublicUrl(source);
  return data.publicUrl;
}

// Progress is per-user, stored per practice — separate from exam/listening progress
export function loadPracticeProgressMap(): Record<string, Record<string, PracticeProgress>> {
  try {
    const raw = localStorage.getItem(LS_PRACTICE_PROGRESS);
    return raw ? JSON.parse(raw) as Record<string, Record<string, PracticeProgress>> : {};
  } catch {
    return {};
  }
}

export function savePracticeProgressEntry(userId: string, practiceId: string, entry: PracticeProgress): void {
  try {
    const raw = localStorage.getItem(LS_PRACTICE_PROGRESS);
    const all = raw ? JSON.parse(raw) as Record<string, Record<string, PracticeProgress>> : {};
    const userMap = all[userId] ?? {};
    userMap[practiceId] = entry;
    all[userId] = userMap;
    localStorage.setItem(LS_PRACTICE_PROGRESS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Effective practice window for a user's class: class override → practice default. */
export function getEffectivePracticeSchedule(
  practice: Practice,
  user: Pick<User, 'role' | 'assignedClasses'>
): { startAt: string | null; deadline: string | null } {
  if (user.role !== 'student' || user.assignedClasses.length === 0) {
    return { startAt: practice.startAt, deadline: practice.deadline };
  }
  for (const cls of user.assignedClasses) {
    const override = (practice.classSchedules ?? {})[cls];
    if (override && (override.startAt || override.deadline)) {
      return {
        startAt: override.startAt ?? practice.startAt,
        deadline: override.deadline ?? practice.deadline,
      };
    }
  }
  return { startAt: practice.startAt, deadline: practice.deadline };
}

export function practiceVisibleForUser(
  practice: Practice,
  user: User,
  effectiveFolderAccessMap?: Map<string, { canView: boolean; canManage: boolean; canEdit: boolean }>
): boolean {
  if (user.role === 'admin' || user.role === 'teacher') return true;
  if (practice.status !== 'PUBLISHED') return false;

  // 1. Folder ACL check
  if (effectiveFolderAccessMap && practice.folderId) {
    const access = effectiveFolderAccessMap.get(practice.folderId);
    if (access !== undefined) {
      return access.canView;
    }
  }

  // 2. Legacy fallback
  const tc = practice.targetClasses;
  if (!tc || tc.length === 0 || tc.includes('Tất cả')) return true;
  return tc.some((cls) => user.assignedClasses.includes(cls));
}
