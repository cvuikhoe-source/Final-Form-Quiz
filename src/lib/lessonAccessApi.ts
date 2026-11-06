import { supabase } from './supabase';
import type { LessonAccessGrant, LessonPermission, LessonPrincipalType } from '../types';

const LS_LESSON_GRANTS = 'quizforms_lesson_access_grants';

export function getLocalLessonGrants(): LessonAccessGrant[] {
  try {
    const raw = localStorage.getItem(LS_LESSON_GRANTS);
    return raw ? (JSON.parse(raw) as LessonAccessGrant[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalLessonGrants(grants: LessonAccessGrant[]): void {
  try {
    localStorage.setItem(LS_LESSON_GRANTS, JSON.stringify(grants));
  } catch (err) {
    console.error('Failed to save local lesson grants:', err);
  }
}

function mapGrantRow(row: Record<string, unknown>): LessonAccessGrant {
  return {
    id: (row.id as string) || `lag-${Math.random().toString(36).substring(2, 9)}`,
    lessonId: (row.lessonId || row.lesson_id) as string,
    principalType: (row.principalType || row.principal_type) as LessonPrincipalType,
    principalId: (row.principalId || row.principal_id) as string,
    permission: (row.permission as LessonPermission) || 'viewer',
    grantedBy: (row.grantedBy || row.granted_by) as string,
    createdAt: (row.createdAt || row.created_at) as string || new Date().toISOString(),
    updatedAt: (row.updatedAt || row.updated_at) as string || new Date().toISOString(),
  };
}

/**
 * Loads all grants for a specific lesson.
 */
export async function loadLessonGrants(lessonId: string): Promise<LessonAccessGrant[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('lesson_access_grants')
        .select('*')
        .eq('lesson_id', lessonId);

      if (!error && data) {
        const mapped = data.map(mapGrantRow);
        // Merge with local cache
        const local = getLocalLessonGrants().filter((g) => g.lessonId !== lessonId);
        saveLocalLessonGrants([...local, ...mapped]);
        return mapped;
      }
    } catch {
      // Supabase unavailable or table not created yet, fall back to local
    }
  }

  return getLocalLessonGrants().filter((g) => g.lessonId === lessonId);
}

/**
 * Loads all lesson grants in the entire system.
 */
export async function loadAllLessonGrants(): Promise<LessonAccessGrant[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('lesson_access_grants')
        .select('*');

      if (!error && data) {
        const mapped = data.map(mapGrantRow);
        saveLocalLessonGrants(mapped);
        return mapped;
      }
    } catch {
      // Supabase unavailable, fall back to local
    }
  }

  return getLocalLessonGrants();
}

/**
 * Checks if the backend Lesson ACL table / functions are ready.
 */
export async function checkLessonAclBackendStatus(): Promise<{ ready: boolean; reason?: string }> {
  if (!supabase) return { ready: false, reason: 'Chưa kết nối Supabase' };
  try {
    const { error } = await supabase.from('lesson_access_grants').select('id').limit(1);
    if (error) {
      return {
        ready: false,
        reason: `Bảng 'lesson_access_grants' chưa được cài đặt trên Supabase (${error.message}).`,
      };
    }
    return { ready: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ready: false,
      reason: `Không thể kết nối bảng 'lesson_access_grants': ${msg}`,
    };
  }
}

/**
 * Grants or updates access on a lesson for a user or class.
 */
export async function grantLessonAccess(params: {
  lessonId: string;
  principalType: LessonPrincipalType;
  principalId: string;
  permission: LessonPermission;
  grantedBy: string;
}): Promise<LessonAccessGrant> {
  const newGrant: LessonAccessGrant = {
    id: `lag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    lessonId: params.lessonId,
    principalType: params.principalType,
    principalId: params.principalId,
    permission: params.permission,
    grantedBy: params.grantedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Try Supabase Edge Function first if available
  if (supabase) {
    let backendErrorMsg = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const { data, error } = await supabase.functions.invoke('manage-lesson-access', {
          body: {
            action: 'grant',
            lessonId: params.lessonId,
            principalType: params.principalType,
            principalId: params.principalId,
            permission: params.permission,
          },
        });

        if (!error && data?.success && data?.data) {
          const mapped = mapGrantRow(data.data);
          const local = getLocalLessonGrants().filter(
            (g) => !(g.lessonId === params.lessonId && g.principalType === params.principalType && g.principalId === params.principalId)
          );
          saveLocalLessonGrants([...local, mapped]);
          return mapped;
        }
        if (error) {
          backendErrorMsg = error.message;
        }
      }
    } catch (e: unknown) {
      backendErrorMsg = e instanceof Error ? e.message : String(e);
    }

    // Try direct DB upsert
    try {
      const { data, error } = await supabase
        .from('lesson_access_grants')
        .upsert({
          id: newGrant.id,
          lesson_id: newGrant.lessonId,
          principal_type: newGrant.principalType,
          principal_id: newGrant.principalId,
          permission: newGrant.permission,
          granted_by: newGrant.grantedBy,
          updated_at: newGrant.updatedAt,
        }, {
          onConflict: 'lesson_id,principal_type,principal_id',
        })
        .select('*')
        .single();

      if (!error && data) {
        const mapped = mapGrantRow(data);
        const local = getLocalLessonGrants().filter(
          (g) => !(g.lessonId === params.lessonId && g.principalType === params.principalType && g.principalId === params.principalId)
        );
        saveLocalLessonGrants([...local, mapped]);
        return mapped;
      }
      if (error) {
        backendErrorMsg = error.message;
      }
    } catch (dbErr: unknown) {
      backendErrorMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    }

    // Supabase is configured but backend ACL table is not deployed
    // DO NOT silently fake success with LocalStorage!
    throw new Error(
      `Tính năng phân quyền Lesson ACL chưa sẵn sàng trên Supabase backend (bảng lesson_access_grants chưa được tạo). Chi tiết: ${backendErrorMsg}`
    );
  }

  // Update local (only when offline or supabase not configured)
  const current = getLocalLessonGrants().filter(
    (g) => !(g.lessonId === params.lessonId && g.principalType === params.principalType && g.principalId === params.principalId)
  );
  saveLocalLessonGrants([...current, newGrant]);
  return newGrant;
}

/**
 * Revokes a grant by ID or by (lessonId, principalType, principalId).
 */
export async function revokeLessonAccess(params: {
  grantId?: string;
  lessonId?: string;
  principalType?: LessonPrincipalType;
  principalId?: string;
}): Promise<void> {
  // Try Edge Function
  if (supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        await supabase.functions.invoke('manage-lesson-access', {
          body: {
            action: 'revoke',
            grantId: params.grantId,
            lessonId: params.lessonId,
            principalType: params.principalType,
            principalId: params.principalId,
          },
        });
      }
    } catch {
      // fallback
    }

    // Try direct DB delete
    try {
      if (params.grantId) {
        await supabase.from('lesson_access_grants').delete().eq('id', params.grantId);
      } else if (params.lessonId && params.principalType && params.principalId) {
        await supabase
          .from('lesson_access_grants')
          .delete()
          .eq('lesson_id', params.lessonId)
          .eq('principal_type', params.principalType)
          .eq('principal_id', params.principalId);
      }
    } catch {
      // fallback
    }
  }

  // Local storage cleanup
  const current = getLocalLessonGrants();
  const next = current.filter((g) => {
    if (params.grantId && g.id === params.grantId) return false;
    if (
      params.lessonId &&
      params.principalType &&
      params.principalId &&
      g.lessonId === params.lessonId &&
      g.principalType === params.principalType &&
      g.principalId === params.principalId
    ) {
      return false;
    }
    return true;
  });
  saveLocalLessonGrants(next);
}
