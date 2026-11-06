import type { User, Lesson, LessonAccessGrant, EffectiveLessonAccess, LessonPermission } from '../types';

export const LESSON_PERM_RANK: Record<LessonPermission | 'none', number> = {
  none: 0,
  viewer: 1,
  editor: 2,
  manager: 3,
  owner: 4,
};

/**
 * Resolves effective permission for a single user on a specific lesson.
 *
 * Rules:
 * 1. Admin: Always Owner with full permissions.
 * 2. Creator (lesson.createdBy === user.id): Owner with full permissions.
 * 3. Direct user grant on lesson.
 * 4. Class grant on lesson (matching user.assignedClasses).
 * 5. Strongest permission wins.
 * 6. Folder does NOT grant permission.
 */
export function resolveUserLessonAccess(
  user: User,
  lesson: Lesson,
  grants: LessonAccessGrant[]
): EffectiveLessonAccess {
  // 1. Admin is superuser
  if (user.role === 'admin') {
    return {
      lessonId: lesson.id,
      permission: 'owner',
      canView: true,
      canEdit: true,
      canManage: true,
      isOwner: true,
    };
  }

  // 1b. Student Visibility Rules:
  // - If lesson has NO subject: Student MUST NOT see it (both UI and query/access resolver).
  // - If lesson has a subject: Student must have that subject in allowedSubjects (if student has allowedSubjects specified).
  if (user.role === 'student') {
    if (!lesson.subjectId) {
      return {
        lessonId: lesson.id,
        permission: 'none',
        canView: false,
        canEdit: false,
        canManage: false,
        isOwner: false,
      };
    }
    if (user.allowedSubjects && user.allowedSubjects.length > 0) {
      const subMatch = user.allowedSubjects.some(
        (s) =>
          s === lesson.subjectId ||
          (lesson.subjectName && s.toLowerCase() === lesson.subjectName.toLowerCase())
      );
      if (!subMatch) {
        return {
          lessonId: lesson.id,
          permission: 'none',
          canView: false,
          canEdit: false,
          canManage: false,
          isOwner: false,
        };
      }
    }
  }

  // 2. Creator is owner
  if (lesson.createdBy && lesson.createdBy === user.id) {
    return {
      lessonId: lesson.id,
      permission: 'owner',
      canView: true,
      canEdit: true,
      canManage: true,
      isOwner: true,
    };
  }

  // 3. Find grants for this lesson
  const lessonGrants = grants.filter((g) => g.lessonId === lesson.id);

  let maxPerm: LessonPermission | 'none' = 'none';

  for (const g of lessonGrants) {
    let matches = false;
    if (g.principalType === 'user' && g.principalId === user.id) {
      matches = true;
    } else if (g.principalType === 'class' && user.assignedClasses?.includes(g.principalId)) {
      matches = true;
    }

    if (matches && LESSON_PERM_RANK[g.permission] > LESSON_PERM_RANK[maxPerm]) {
      maxPerm = g.permission;
    }
  }

  // 4. Legacy fallback: if lesson has targetClasses/classScope and NO grants exist in system yet
  // If targetClasses has entries matching user's class, grant viewer
  if (maxPerm === 'none' && lessonGrants.length === 0) {
    const classList = lesson.targetClasses || [];
    if (classList.length > 0 && user.assignedClasses?.some((c) => classList.includes(c))) {
      maxPerm = 'viewer';
    }
  }

  const isOwner = maxPerm === 'owner';
  const canManage = isOwner || maxPerm === 'manager';
  const canEdit = canManage || maxPerm === 'editor';
  const canView = canEdit || maxPerm === 'viewer';

  return {
    lessonId: lesson.id,
    permission: maxPerm,
    canView,
    canEdit,
    canManage,
    isOwner,
  };
}

/**
 * Resolves effective access map for multiple lessons at once.
 */
export function resolveAllLessonsAccess(
  user: User,
  lessons: Lesson[],
  allGrants: LessonAccessGrant[]
): Map<string, EffectiveLessonAccess> {
  const map = new Map<string, EffectiveLessonAccess>();
  for (const lesson of lessons) {
    map.set(lesson.id, resolveUserLessonAccess(user, lesson, allGrants));
  }
  return map;
}

/**
 * Filters the list of lessons so that:
 * - Admin sees all lessons.
 * - Teacher sees lessons they created OR lessons granted to them.
 * - Student sees lessons granted to them or their class.
 */
export function filterLessonsForUser(
  user: User,
  lessons: Lesson[],
  allGrants: LessonAccessGrant[]
): Lesson[] {
  if (user.role === 'admin') return lessons;

  const accessMap = resolveAllLessonsAccess(user, lessons, allGrants);
  return lessons.filter((lesson) => {
    const access = accessMap.get(lesson.id);
    return access?.canView ?? false;
  });
}

/**
 * Validates whether current user has scope to grant access to a class.
 */
export function canUserGrantToClass(currentUser: User, className: string): boolean {
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'teacher') {
    return currentUser.assignedClasses?.includes(className) ?? false;
  }
  return false;
}

/**
 * Validates whether current user has scope to grant access to a target student.
 */
export function canUserGrantToStudent(currentUser: User, targetStudent: User): boolean {
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'teacher') {
    if (targetStudent.role !== 'student') return false;
    const teacherClasses = currentUser.assignedClasses || [];
    const studentClasses = targetStudent.assignedClasses || [];
    return studentClasses.some((c) => teacherClasses.includes(c));
  }
  return false;
}

