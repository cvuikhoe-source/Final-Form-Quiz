// Edge Function: manage-lesson-access
// Description: Securely manages Access Control Lists (ACL) for individual Lessons.
// Strictly verifies caller permissions using app_users profile on the server:
// - Admin: Superuser with full control over all lessons and permissions.
// - Owner: Full control over their lesson, can grant/revoke manager, editor, viewer.
// - Manager: Can manage content and grant viewer permissions to classes/students within assigned_classes.
// - Editor: Can only edit lesson content. Cannot grant permissions.
// - Viewer: Read-only access.
// - Student: Strictly forbidden from grant management operations.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return json({
    success: false,
    error: { code, message },
  }, status);
}

interface CallerProfile {
  id: string;
  username: string;
  role: string;
  assigned_classes?: string[];
}

interface GrantRow {
  id: string;
  lesson_id: string;
  principal_type: 'user' | 'class';
  principal_id: string;
  permission: 'owner' | 'manager' | 'editor' | 'viewer';
  granted_by: string;
  created_at: string;
  updated_at: string;
}

const PERM_RANK: Record<string, number> = {
  none: 0,
  viewer: 1,
  editor: 2,
  manager: 3,
  owner: 4,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Chỉ chấp nhận phương thức POST.', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('INTERNAL_ERROR', 'Cấu hình máy chủ chưa hoàn tất.', 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // 1. Authenticate caller via JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Yêu cầu đăng nhập để thực hiện thao tác.', 401);
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return errorResponse('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401);
  }

  const authUserId = authData.user.id;

  // 2. Fetch caller's internal app profile
  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes')
    .or(`id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
    .maybeSingle();

  if (profileErr || !callerProfile) {
    return errorResponse('FORBIDDEN', 'Không tìm thấy hồ sơ người dùng trong hệ thống.', 403);
  }

  const caller: CallerProfile = {
    id: callerProfile.id,
    username: callerProfile.username,
    role: callerProfile.role,
    assigned_classes: callerProfile.assigned_classes || [],
  };

  // Parse request body
  let body: {
    action: 'grant' | 'revoke' | 'list-grants';
    lessonId?: string;
    grantId?: string;
    principalType?: 'user' | 'class';
    principalId?: string;
    permission?: 'owner' | 'manager' | 'editor' | 'viewer';
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Định dạng dữ liệu JSON không hợp lệ.', 400);
  }

  const { action, lessonId } = body;

  if (!action || !['grant', 'revoke', 'list-grants'].includes(action)) {
    return errorResponse('BAD_REQUEST', 'Hành động không hợp lệ.', 400);
  }

  // 3. Resolve caller permissions on the lesson
  async function resolveCallerLessonAccess(targetLessonId: string) {
    if (caller.role === 'admin') {
      return { canManage: true, canEdit: true, canView: true, isOwner: true, permission: 'owner' as const };
    }

    // Check lesson existence and created_by
    const { data: lesson, error: lErr } = await supabaseAdmin
      .from('lessons')
      .select('id, created_by')
      .eq('id', targetLessonId)
      .maybeSingle();

    if (lErr || !lesson) {
      return null;
    }

    if (lesson.created_by === caller.id) {
      return { canManage: true, canEdit: true, canView: true, isOwner: true, permission: 'owner' as const };
    }

    // Check explicit user grant
    const { data: userGrants } = await supabaseAdmin
      .from('lesson_access_grants')
      .select('permission')
      .eq('lesson_id', targetLessonId)
      .eq('principal_type', 'user')
      .eq('principal_id', caller.id);

    let maxPerm = 'none';
    for (const g of userGrants || []) {
      if ((PERM_RANK[g.permission] || 0) > (PERM_RANK[maxPerm] || 0)) {
        maxPerm = g.permission;
      }
    }

    const isOwner = maxPerm === 'owner';
    const canManage = isOwner || maxPerm === 'manager';
    const canEdit = canManage || maxPerm === 'editor';
    const canView = canEdit || maxPerm === 'viewer';

    return { canManage, canEdit, canView, isOwner, permission: maxPerm };
  }

  // ─── ACTION: LIST-GRANTS ─────────────────────────────────────
  if (action === 'list-grants') {
    if (!lessonId) {
      return errorResponse('BAD_REQUEST', 'Thiếu lessonId.', 400);
    }

    if (caller.role === 'student') {
      return errorResponse('FORBIDDEN', 'Học sinh không có quyền xem cấu hình phân quyền.', 403);
    }

    const access = await resolveCallerLessonAccess(lessonId);
    if (!access || !access.canView) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền truy cập bài học này.', 403);
    }

    const { data: grants, error: gErr } = await supabaseAdmin
      .from('lesson_access_grants')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true });

    if (gErr) {
      return errorResponse('INTERNAL_ERROR', 'Lỗi khi tải danh sách quyền: ' + gErr.message, 500);
    }

    return json({
      success: true,
      data: {
        lessonId,
        grants: grants || [],
        callerPermission: access.permission,
        canManage: access.canManage,
      },
    });
  }

  // ─── ACTION: GRANT ───────────────────────────────────────────
  if (action === 'grant') {
    const { principalType, principalId, permission } = body;
    if (!lessonId || !principalType || !principalId || !permission) {
      return errorResponse('BAD_REQUEST', 'Thiếu thông tin bắt buộc (lessonId, principalType, principalId, permission).', 400);
    }

    if (caller.role === 'student') {
      return errorResponse('FORBIDDEN', 'Học sinh không được phép phân quyền.', 403);
    }

    const access = await resolveCallerLessonAccess(lessonId);
    if (!access || !access.canManage) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý phân quyền trên bài học này.', 403);
    }

    // Teacher specific restrictions
    if (caller.role === 'teacher') {
      // Teacher cannot grant owner
      if (permission === 'owner') {
        return errorResponse('FORBIDDEN', 'Chỉ Quản trị viên mới có quyền chỉ định Owner.', 403);
      }

      // Teacher cannot grant to another teacher
      if (principalType === 'user') {
        const { data: targetUser } = await supabaseAdmin
          .from('app_users')
          .select('id, role, assigned_classes')
          .eq('id', principalId)
          .maybeSingle();

        if (!targetUser) {
          return errorResponse('NOT_FOUND', 'Người dùng mục tiêu không tồn tại.', 404);
        }

        if (targetUser.role === 'teacher' || targetUser.role === 'admin') {
          return errorResponse('FORBIDDEN', 'Giáo viên không được phép cấp quyền cho Giáo viên khác hoặc Admin.', 403);
        }

        // Must be a student in teacher's assigned classes
        const studentClasses = targetUser.assigned_classes || [];
        const teacherClasses = caller.assigned_classes || [];
        const hasOverlap = studentClasses.some((c: string) => teacherClasses.includes(c));

        if (!hasOverlap) {
          return errorResponse('FORBIDDEN', 'Học sinh không thuộc lớp bạn phụ trách.', 403);
        }
      }

      // If granting to class: class must be in teacher's assigned classes
      if (principalType === 'class') {
        const teacherClasses = caller.assigned_classes || [];
        if (!teacherClasses.includes(principalId)) {
          return errorResponse('FORBIDDEN', 'Lớp học không thuộc phạm vi bạn phụ trách.', 403);
        }
      }
    }

    // Upsert grant
    const grantId = `lag-${crypto.randomUUID().slice(0, 16)}`;
    const { data: upserted, error: upErr } = await supabaseAdmin
      .from('lesson_access_grants')
      .upsert({
        id: grantId,
        lesson_id: lessonId,
        principal_type: principalType,
        principal_id: principalId,
        permission,
        granted_by: caller.id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'lesson_id,principal_type,principal_id',
      })
      .select('*')
      .single();

    if (upErr) {
      return errorResponse('DATABASE_ERROR', 'Lỗi khi lưu quyền bài học: ' + upErr.message, 500);
    }

    return json({
      success: true,
      data: upserted,
      message: 'Cấp quyền bài học thành công.',
    });
  }

  // ─── ACTION: REVOKE ──────────────────────────────────────────
  if (action === 'revoke') {
    const { grantId, principalType, principalId } = body;

    let targetGrant: GrantRow | null = null;
    if (grantId) {
      const { data } = await supabaseAdmin
        .from('lesson_access_grants')
        .select('*')
        .eq('id', grantId)
        .maybeSingle();
      targetGrant = data;
    } else if (lessonId && principalType && principalId) {
      const { data } = await supabaseAdmin
        .from('lesson_access_grants')
        .select('*')
        .eq('lesson_id', lessonId)
        .eq('principal_type', principalType)
        .eq('principal_id', principalId)
        .maybeSingle();
      targetGrant = data;
    }

    if (!targetGrant) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy bản ghi quyền để thu hồi.', 404);
    }

    const access = await resolveCallerLessonAccess(targetGrant.lesson_id);
    if (!access || !access.canManage) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền thu hồi quyền trên bài học này.', 403);
    }

    // Prevent revoking owner via normal revoke
    if (targetGrant.permission === 'owner') {
      return errorResponse('FORBIDDEN', 'Không thể thu hồi quyền Owner trực tiếp.', 403);
    }

    // Teacher scope check
    if (caller.role === 'teacher') {
      if (targetGrant.principal_type === 'class') {
        if (!caller.assigned_classes?.includes(targetGrant.principal_id)) {
          return errorResponse('FORBIDDEN', 'Không thể thu hồi quyền lớp ngoài phạm vi phụ trách.', 403);
        }
      } else if (targetGrant.principal_type === 'user') {
        const { data: targetUser } = await supabaseAdmin
          .from('app_users')
          .select('id, role, assigned_classes')
          .eq('id', targetGrant.principal_id)
          .maybeSingle();

        if (targetUser?.role === 'teacher' || targetUser?.role === 'admin') {
          return errorResponse('FORBIDDEN', 'Giáo viên không thể thu hồi quyền của Giáo viên khác hoặc Admin.', 403);
        }

        const studentClasses = targetUser?.assigned_classes || [];
        const teacherClasses = caller.assigned_classes || [];
        const hasOverlap = studentClasses.some((c: string) => teacherClasses.includes(c));
        if (!hasOverlap) {
          return errorResponse('FORBIDDEN', 'Học sinh không thuộc lớp bạn phụ trách.', 403);
        }
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from('lesson_access_grants')
      .delete()
      .eq('id', targetGrant.id);

    if (delErr) {
      return errorResponse('DATABASE_ERROR', 'Lỗi khi thu hồi quyền: ' + delErr.message, 500);
    }

    return json({
      success: true,
      data: { revokedGrantId: targetGrant.id },
      message: 'Thu hồi quyền thành công.',
    });
  }

  return errorResponse('BAD_REQUEST', 'Hành động không được hỗ trợ.', 400);
});

