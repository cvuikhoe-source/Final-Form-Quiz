import type { Lesson, GrammarProgress, MasteryStatus } from '@/types';

export type GrammarStudyGroup =
  | 'all'
  | 'unlearned'
  | 'forgot'
  | 'hard'
  | 'almost'
  | 'mastered'
  | 'due';

export interface GrammarStudyGroupMetadata {
  id: GrammarStudyGroup;
  label: string;
  description: string;
  shortcutKey: string;
  statusKey?: MasteryStatus;
  badgeClass: string;
  cardBorderClass: string;
  cardBgClass: string;
  accentColor: string;
}

export const GRAMMAR_STUDY_GROUP_CONFIGS: Record<GrammarStudyGroup, GrammarStudyGroupMetadata> = {
  all: {
    id: 'all',
    label: 'Tất cả',
    description: 'Toàn bộ mẫu ngữ pháp trong danh sách',
    shortcutKey: '1',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
    cardBorderClass: 'border-slate-300 hover:border-indigo-400 dark:border-slate-700',
    cardBgClass: 'bg-white hover:bg-slate-50/80 dark:bg-slate-850 dark:hover:bg-slate-800',
    accentColor: 'text-indigo-500',
  },
  unlearned: {
    id: 'unlearned',
    label: 'Chưa học',
    description: 'Mẫu ngữ pháp mới chưa từng đánh giá',
    shortcutKey: '2',
    statusKey: 'new',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    cardBorderClass: 'border-slate-200 hover:border-slate-400 dark:border-slate-700',
    cardBgClass: 'bg-white hover:bg-slate-50/80 dark:bg-slate-850 dark:hover:bg-slate-800',
    accentColor: 'text-slate-400',
  },
  forgot: {
    id: 'forgot',
    label: 'Quên',
    description: 'Ngữ pháp đánh giá quên, cần học lại',
    shortcutKey: '3',
    statusKey: 'forgot',
    badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900',
    cardBorderClass: 'border-red-200 hover:border-red-400 dark:border-red-900/60',
    cardBgClass: 'bg-white hover:bg-red-50/30 dark:bg-slate-850 dark:hover:bg-red-950/20',
    accentColor: 'text-red-500',
  },
  hard: {
    id: 'hard',
    label: 'Khó',
    description: 'Mẫu ngữ pháp cảm thấy khó nhớ hoặc dễ nhầm',
    shortcutKey: '4',
    statusKey: 'hard',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900',
    cardBorderClass: 'border-orange-200 hover:border-orange-400 dark:border-orange-900/60',
    cardBgClass: 'bg-white hover:bg-orange-50/30 dark:bg-slate-850 dark:hover:bg-orange-950/20',
    accentColor: 'text-orange-500',
  },
  almost: {
    id: 'almost',
    label: 'Gần nhớ',
    description: 'Đã nắm được ý nghĩa, cần củng cố cách kết hợp',
    shortcutKey: '5',
    statusKey: 'almost',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900',
    cardBorderClass: 'border-blue-200 hover:border-blue-400 dark:border-blue-900/60',
    cardBgClass: 'bg-white hover:bg-blue-50/30 dark:bg-slate-850 dark:hover:bg-blue-950/20',
    accentColor: 'text-blue-500',
  },
  mastered: {
    id: 'mastered',
    label: 'Đã nhớ',
    description: 'Mẫu ngữ pháp đã thuộc lòng và sử dụng thành thạo',
    shortcutKey: '6',
    statusKey: 'mastered',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
    cardBorderClass: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-900/60',
    cardBgClass: 'bg-white hover:bg-emerald-50/30 dark:bg-slate-850 dark:hover:bg-emerald-950/20',
    accentColor: 'text-emerald-500',
  },
  due: {
    id: 'due',
    label: 'Cần ôn hôm nay',
    description: 'Mẫu ngữ pháp đến hạn ôn tập ngắt quãng',
    shortcutKey: '7',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
    cardBorderClass: 'border-amber-200 hover:border-amber-400 dark:border-amber-900/60',
    cardBgClass: 'bg-white hover:bg-amber-50/30 dark:bg-slate-850 dark:hover:bg-amber-950/20',
    accentColor: 'text-amber-500',
  },
};

export const GRAMMAR_STUDY_GROUP_KEYS: GrammarStudyGroup[] = [
  'all',
  'unlearned',
  'forgot',
  'hard',
  'almost',
  'mastered',
  'due',
];

/**
 * Tính toán mốc thời gian ôn tập tiếp theo cho ngữ pháp (Spaced Repetition Schedule)
 */
export function calculateGrammarNextReviewAt(
  status: MasteryStatus,
  reviewCount = 1,
  baseDate: Date = new Date()
): string | null {
  if (status === 'new') return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  let intervalDays = 1;

  switch (status) {
    case 'forgot':
      intervalDays = 1;
      break;
    case 'hard':
      intervalDays = 2;
      break;
    case 'almost':
      intervalDays = 4;
      break;
    case 'mastered':
      intervalDays = Math.min(60, 7 * Math.max(1, reviewCount));
      break;
  }

  const nextDate = new Date(baseDate.getTime() + intervalDays * msPerDay);
  return nextDate.toISOString();
}

/**
 * Kiểm tra xem bài ngữ pháp có đến hạn ôn tập (Due) hay chưa
 */
export function isGrammarDue(
  progress: GrammarProgress | undefined,
  now: Date = new Date()
): boolean {
  if (!progress || progress.masteryStatus === 'new') return false;
  if (!progress.nextReviewAt) return false;
  return new Date(progress.nextReviewAt).getTime() <= now.getTime();
}

/**
 * Lọc danh sách Lesson theo nhóm học được chọn
 */
export function filterGrammarByStudyGroup(
  lessons: Lesson[],
  progressMap: Record<string, GrammarProgress>,
  group: GrammarStudyGroup,
  now: Date = new Date()
): Lesson[] {
  return lessons.filter((lesson) => {
    const p = progressMap[lesson.id];
    const status = p?.masteryStatus ?? 'new';

    switch (group) {
      case 'all':
        return true;
      case 'unlearned':
        return !p || status === 'new';
      case 'forgot':
        return status === 'forgot';
      case 'hard':
        return status === 'hard';
      case 'almost':
        return status === 'almost';
      case 'mastered':
        return status === 'mastered';
      case 'due':
        return isGrammarDue(p, now);
      default:
        return true;
    }
  });
}

/**
 * Tính số lượng bài ngữ pháp cho từng nhóm học
 */
export function countGrammarByStudyGroup(
  lessons: Lesson[],
  progressMap: Record<string, GrammarProgress>,
  now: Date = new Date()
): Record<GrammarStudyGroup, number> {
  const counts: Record<GrammarStudyGroup, number> = {
    all: lessons.length,
    unlearned: 0,
    forgot: 0,
    hard: 0,
    almost: 0,
    mastered: 0,
    due: 0,
  };

  for (const lesson of lessons) {
    const p = progressMap[lesson.id];
    const status = p?.masteryStatus ?? 'new';

    if (!p || status === 'new') {
      counts.unlearned++;
    } else if (status === 'forgot') {
      counts.forgot++;
    } else if (status === 'hard') {
      counts.hard++;
    } else if (status === 'almost') {
      counts.almost++;
    } else if (status === 'mastered') {
      counts.mastered++;
    }

    if (isGrammarDue(p, now)) {
      counts.due++;
    }
  }

  return counts;
}

/**
 * Xác định xem bài ngữ pháp có cần loại khỏi phiên học hiện tại sau khi đánh giá hay không
 */
export function shouldRemoveGrammarFromSession(
  group: GrammarStudyGroup,
  newStatus: MasteryStatus,
  newNextReviewAt?: string | null,
  now: Date = new Date()
): boolean {
  if (group === 'all') {
    return false;
  }

  if (group === 'unlearned') {
    return newStatus !== 'new';
  }

  if (group === 'due') {
    if (!newNextReviewAt) return true;
    return new Date(newNextReviewAt).getTime() > now.getTime();
  }

  return newStatus !== group;
}

/**
 * Xây dựng danh sách sessionLessons cho phiên học Ngữ pháp
 */
export function buildGrammarStudySession(
  lessons: Lesson[],
  progressMap: Record<string, GrammarProgress>,
  group: GrammarStudyGroup,
  now: Date = new Date()
): Lesson[] {
  return filterGrammarByStudyGroup(lessons, progressMap, group, now);
}

export interface GrammarSessionEvaluationRecord {
  lessonId: string;
  previousStatus: MasteryStatus;
  newStatus: MasteryStatus;
}

export interface GrammarSessionSummary {
  totalLearned: number;
  toMastered: number;
  toAlmost: number;
  toHard: number;
  toForgot: number;
}

/**
 * Tổng hợp kết quả phiên học Ngữ pháp khi hoàn thành
 */
export function summarizeCompletedGrammarSession(
  _initialLessons: Lesson[],
  history: GrammarSessionEvaluationRecord[]
): GrammarSessionSummary {
  const summary: GrammarSessionSummary = {
    totalLearned: new Set(history.map((h) => h.lessonId)).size,
    toMastered: 0,
    toAlmost: 0,
    toHard: 0,
    toForgot: 0,
  };

  const lastEvaluationByLesson = new Map<string, MasteryStatus>();
  for (const h of history) {
    lastEvaluationByLesson.set(h.lessonId, h.newStatus);
  }

  for (const status of lastEvaluationByLesson.values()) {
    if (status === 'mastered') summary.toMastered++;
    else if (status === 'almost') summary.toAlmost++;
    else if (status === 'hard') summary.toHard++;
    else if (status === 'forgot') summary.toForgot++;
  }

  return summary;
}

export function getGrammarStudyGroupLabel(group: GrammarStudyGroup): string {
  return GRAMMAR_STUDY_GROUP_CONFIGS[group]?.label ?? group;
}

export function getGrammarStudyGroupDescription(group: GrammarStudyGroup): string {
  return GRAMMAR_STUDY_GROUP_CONFIGS[group]?.description ?? '';
}

