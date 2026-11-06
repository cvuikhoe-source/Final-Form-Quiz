// Edge Function: manage-folder-access
// Description: Securely manages Access Control Lists (ACL) for folders across Lesson, Practice, and Exam modules.
// Strictly verifies caller permissions using app_users profile on the server:
// - Admin: Superuser with full control over all folders and permissions.
// - Owner: Full control over their folder, can grant/revoke manager, editor, viewer, and transfer ownership.
// - Manager: Can manage content and grant viewer permissions to classes/students within assigned_classes.
// - Editor: Can only create/edit content within the folder. Cannot grant permissions.
// - Viewer: Read-only access.
// - Student: Strictly forbidden from write operations. Can only receive 'viewer'.

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

// ─── PERMISSION & FOLDER HELPERS ───────────────────────────────

type FolderType = 'lesson' | 'practice' | 'exam';

function getFolderTableName(folderType: FolderType): string {
  switch (folderType) {
    case 'lesson': return 'lesson_folders';
    case 'practice': return 'practice_folders';
    case 'exam': return 'exam_folders';
    default: return 'lesson_folders';
  }
}

interface CallerProfile {
  id: string;
  username: string;
  role: string;
  assigned_classes?: string[];
  allowed_subjects?: string[];
}

interface BaseFolder {
  id: string;
  parent_id?: string | null;
  created_by?: string | null;
  inherit_permissions?: boolean;
  name?: string;
}

interface GrantRow {
  id: string;
  folder_type: FolderType;
  folder_id: string;
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

// ─── MAIN HANDLER ──────────────────────────────────────────────

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

  // 1. Authenticate caller via Bearer JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return errorResponse('UNAUTHORIZED', 'Yêu cầu xác thực không hợp lệ.', 401);
  }
  const token = match[1].trim();

  const { data: callerAuth, error: callerAuthError } = await supabaseAdmin.auth.getUser(token);
  if (callerAuthError || !callerAuth?.user) {
    return errorResponse('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401);
  }
  const callerAuthId = callerAuth.user.id;

  // 2. Authorize caller profile strictly from database (do NOT trust frontend role)
  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes, allowed_subjects, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle<CallerProfile>();

  if (profileErr || !callerProfile) {
    return errorResponse('FORBIDDEN', 'Không tìm thấy hồ sơ người dùng hợp lệ.', 403);
  }

  // 3. Parse request payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Dữ liệu yêu cầu không đúng định dạng JSON.', 400);
  }

  const action = String(body.action ?? '').trim();
  const folderType = (String(body.folderType ?? 'lesson').trim().toLowerCase()) as FolderType;

  if (!['lesson', 'practice', 'exam'].includes(folderType)) {
    return errorResponse('INVALID_PARAM', 'Loại thư mục không hợp lệ (lesson | practice | exam).', 400);
  }

  const folderTable = getFolderTableName(folderType);
  const now = new Date().toISOString();

  // Helper: Load folder and verify it exists
  async function loadFolder(folderId: string): Promise<BaseFolder | null> {
    const { data } = await supabaseAdmin
      .from(folderTable)
      .select('id, parent_id, created_by, inherit_permissions, name')
      .eq('id', folderId)
      .maybeSingle<BaseFolder>();
    return data;
  }

  // Helper: Get effective permission for caller on a folder
  async function getCallerEffectivePermission(folderId: string): Promise<{ permission: string; isOwner: boolean; canManage: boolean }> {
    if (callerProfile.role === 'admin') {
      return { permission: 'owner', isOwner: true, canManage: true };
    }

    // Direct grants
    const { data: directGrants } = await supabaseAdmin
      .from('folder_access_grants')
      .select('*')
      .eq('folder_type', folderType)
      .eq('folder_id', folderId);

    let bestRank = 0;
    let bestPerm = 'none';

    for (const g of directGrants || []) {
      if (g.principal_type === 'user' && g.principal_id === callerProfile.id) {
        const r = PERM_RANK[g.permission] ?? 0;
        if (r > bestRank) { bestRank = r; bestPerm = g.permission; }
      } else if (g.principal_type === 'class' && Array.isArray(callerProfile.assigned_classes) && callerProfile.assigned_classes.includes(g.principal_id)) {
        const r = PERM_RANK[g.permission] ?? 0;
        if (r > bestRank) { bestRank = r; bestPerm = g.permission; }
      }
    }

    // Check folder creator
    const folder = await loadFolder(folderId);
    if (folder?.created_by && folder.created_by === callerProfile.id) {
      if (PERM_RANK['owner'] > bestRank) { bestRank = PERM_RANK['owner']; bestPerm = 'owner'; }
    }

    if (bestPerm === 'owner' || bestPerm === 'manager') {
      return { permission: bestPerm, isOwner: bestPerm === 'owner', canManage: true };
    }

    // Check ancestor inheritance if enabled
    let ptr = folder;
    while (ptr && ptr.parent_id && ptr.inherit_permissions !== false) {
      const parent = await loadFolder(ptr.parent_id);
      if (!parent) break;

      const { data: parentGrants } = await supabaseAdmin
        .from('folder_access_grants')
        .select('*')
        .eq('folder_type', folderType)
        .eq('folder_id', parent.id);

      for (const g of parentGrants || []) {
        if (g.principal_type === 'user' && g.principal_id === callerProfile.id) {
          const r = PERM_RANK[g.permission] ?? 0;
          if (r > bestRank) { bestRank = r; bestPerm = g.permission; }
        } else if (g.principal_type === 'class' && Array.isArray(callerProfile.assigned_classes) && callerProfile.assigned_classes.includes(g.principal_id)) {
          const r = PERM_RANK[g.permission] ?? 0;
          if (r > bestRank) { bestRank = r; bestPerm = g.permission; }
        }
      }

      if (parent.created_by && parent.created_by === callerProfile.id) {
        if (PERM_RANK['owner'] > bestRank) { bestRank = PERM_RANK['owner']; bestPerm = 'owner'; }
      }

      ptr = parent;
    }

    return {
      permission: bestPerm,
      isOwner: bestPerm === 'owner',
      canManage: bestPerm === 'owner' || bestPerm === 'manager',
    };
  }

  // ─── ACTION: LIST GRANTS ─────────────────────────────────────
  if (action === 'list_grants') {
    const folderId = String(body.folderId ?? '').trim();
    if (!folderId) return errorResponse('MISSING_PARAM', 'Thiếu folderId.', 400);

    const folder = await loadFolder(folderId);
    if (!folder) return errorResponse('NOT_FOUND', 'Thư mục không tồn tại.', 404);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (!callerAccess.canManage) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền xem danh sách phân quyền của thư mục này.', 403);
    }

    // Direct grants on folder
    const { data: directGrants, error: gErr } = await supabaseAdmin
      .from('folder_access_grants')
      .select('*')
      .eq('folder_type', folderType)
      .eq('folder_id', folderId)
      .order('created_at', { ascending: true });

    if (gErr) return errorResponse('DB_ERROR', gErr.message, 500);

    // Collect ancestor inherited grants
    const inheritedGrants: (GrantRow & { inheritedFromFolderId: string; inheritedFromFolderName: string })[] = [];
    let ptr = folder;
    while (ptr && ptr.parent_id && ptr.inherit_permissions !== false) {
      const parent = await loadFolder(ptr.parent_id);
      if (!parent) break;

      const { data: pGrants } = await supabaseAdmin
        .from('folder_access_grants')
        .select('*')
        .eq('folder_type', folderType)
        .eq('folder_id', parent.id);

      for (const pg of pGrants || []) {
        inheritedGrants.push({
          ...pg,
          inheritedFromFolderId: parent.id,
          inheritedFromFolderName: parent.name || 'Thư mục cha',
        });
      }
      ptr = parent;
    }

    // Enrich user principals with usernames / full_names
    const userPrincipalIds = new Set<string>();
    for (const g of directGrants || []) {
      if (g.principal_type === 'user') userPrincipalIds.add(g.principal_id);
      userPrincipalIds.add(g.granted_by);
    }
    for (const g of inheritedGrants) {
      if (g.principal_type === 'user') userPrincipalIds.add(g.principal_id);
      userPrincipalIds.add(g.granted_by);
    }
    if (folder.created_by) userPrincipalIds.add(folder.created_by);

    const userMap: Record<string, { id: string; username: string; full_name: string; role: string }> = {};
    if (userPrincipalIds.size > 0) {
      const { data: usersData } = await supabaseAdmin
        .from('app_users')
        .select('id, username, full_name, role')
        .in('id', Array.from(userPrincipalIds));
      for (const u of usersData || []) {
        userMap[u.id] = u;
      }
    }

    return json({
      success: true,
      folder,
      callerAccess,
      directGrants: directGrants || [],
      inheritedGrants,
      userMap,
    });
  }

  // ─── ACTION: GRANT TEACHER ───────────────────────────────────
  if (action === 'grant_teacher') {
    const folderId = String(body.folderId ?? '').trim();
    const teacherUserId = String(body.teacherUserId ?? '').trim();
    const permission = String(body.permission ?? 'editor').trim().toLowerCase();

    if (!folderId || !teacherUserId) {
      return errorResponse('MISSING_PARAM', 'Thiếu folderId hoặc teacherUserId.', 400);
    }

    if (!['manager', 'editor', 'viewer'].includes(permission)) {
      return errorResponse('INVALID_PARAM', 'Quyền cấp cho giáo viên chỉ có thể là manager, editor, hoặc viewer.', 400);
    }

    const folder = await loadFolder(folderId);
    if (!folder) return errorResponse('NOT_FOUND', 'Thư mục không tồn tại.', 404);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (callerProfile.role !== 'admin' && !callerAccess.isOwner) {
      return errorResponse('FORBIDDEN', 'Chỉ Admin hoặc Chủ sở hữu thư mục mới có quyền cấp quyền cho Giáo viên khác.', 403);
    }

    // Verify target user is a teacher
    const { data: targetUser } = await supabaseAdmin
      .from('app_users')
      .select('id, username, role, allowed_subjects')
      .eq('id', teacherUserId)
      .maybeSingle<CallerProfile>();

    if (!targetUser || (targetUser.role !== 'teacher' && targetUser.role !== 'admin')) {
      return errorResponse('INVALID_PRINCIPAL', 'Người dùng được cấp quyền phải là Giáo viên.', 400);
    }

    // Upsert grant
    const newGrantId = `fag_${crypto.randomUUID()}`;
    const { data: savedGrant, error: upsertErr } = await supabaseAdmin
      .from('folder_access_grants')
      .upsert({
        id: newGrantId,
        folder_type: folderType,
        folder_id: folderId,
        principal_type: 'user',
        principal_id: teacherUserId,
        permission,
        granted_by: callerProfile.id,
        updated_at: now,
      }, { onConflict: 'folder_type,folder_id,principal_type,principal_id' })
      .select('*')
      .single();

    if (upsertErr) return errorResponse('DB_ERROR', upsertErr.message, 500);
    return json({ success: true, grant: savedGrant });
  }

  // ─── ACTION: REVOKE TEACHER ──────────────────────────────────
  if (action === 'revoke_teacher') {
    const folderId = String(body.folderId ?? '').trim();
    const teacherUserId = String(body.teacherUserId ?? '').trim();

    if (!folderId || !teacherUserId) return errorResponse('MISSING_PARAM', 'Thiếu thông tin thu hồi.', 400);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (callerProfile.role !== 'admin' && !callerAccess.isOwner) {
      return errorResponse('FORBIDDEN', 'Chỉ Admin hoặc Chủ sở hữu thư mục mới có quyền thu hồi quyền của Giáo viên.', 403);
    }

    const { error: delErr } = await supabaseAdmin
      .from('folder_access_grants')
      .delete()
      .eq('folder_type', folderType)
      .eq('folder_id', folderId)
      .eq('principal_type', 'user')
      .eq('principal_id', teacherUserId);

    if (delErr) return errorResponse('DB_ERROR', delErr.message, 500);
    return json({ success: true, folderId, teacherUserId });
  }

  // ─── ACTION: GRANT CLASS ─────────────────────────────────────
  if (action === 'grant_class') {
    const folderId = String(body.folderId ?? '').trim();
    const className = String(body.className ?? '').trim();

    if (!folderId || !className) return errorResponse('MISSING_PARAM', 'Thiếu folderId hoặc className.', 400);

    const folder = await loadFolder(folderId);
    if (!folder) return errorResponse('NOT_FOUND', 'Thư mục không tồn tại.', 404);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (!callerAccess.canManage) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý thư mục này.', 403);
    }

    // Teacher can only grant classes within their assigned_classes
    if (callerProfile.role === 'teacher') {
      const teacherClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      if (!teacherClasses.includes('Tất cả') && !teacherClasses.includes(className)) {
        return errorResponse('FORBIDDEN_CLASS', `Lớp "${className}" nằm ngoài phạm vi phụ trách của bạn.`, 403);
      }
    }

    // Verify class exists in public.classes or is 'Tất cả'
    if (className !== 'Tất cả') {
      const { data: classRow, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('name')
        .eq('name', className)
        .maybeSingle();

      if (classErr || !classRow) {
        return errorResponse('INVALID_CLASS', `Lớp "${className}" không tồn tại trong hệ thống.`, 400);
      }
    }

    const newGrantId = `fag_${crypto.randomUUID()}`;
    const { data: savedGrant, error: upsertErr } = await supabaseAdmin
      .from('folder_access_grants')
      .upsert({
        id: newGrantId,
        folder_type: folderType,
        folder_id: folderId,
        principal_type: 'class',
        principal_id: className,
        permission: 'viewer', // Classes strictly receive viewer
        granted_by: callerProfile.id,
        updated_at: now,
      }, { onConflict: 'folder_type,folder_id,principal_type,principal_id' })
      .select('*')
      .single();

    if (upsertErr) return errorResponse('DB_ERROR', upsertErr.message, 500);
    return json({ success: true, grant: savedGrant });
  }

  // ─── ACTION: REVOKE CLASS ────────────────────────────────────
  if (action === 'revoke_class') {
    const folderId = String(body.folderId ?? '').trim();
    const className = String(body.className ?? '').trim();

    if (!folderId || !className) return errorResponse('MISSING_PARAM', 'Thiếu thông tin.', 400);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (!callerAccess.canManage) return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý thư mục này.', 403);

    if (callerProfile.role === 'teacher') {
      const teacherClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      if (!teacherClasses.includes('Tất cả') && !teacherClasses.includes(className)) {
        return errorResponse('FORBIDDEN_CLASS', `Lớp "${className}" nằm ngoài phạm vi phụ trách của bạn.`, 403);
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from('folder_access_grants')
      .delete()
      .eq('folder_type', folderType)
      .eq('folder_id', folderId)
      .eq('principal_type', 'class')
      .eq('principal_id', className);

    if (delErr) return errorResponse('DB_ERROR', delErr.message, 500);
    return json({ success: true, folderId, className });
  }

  // ─── ACTION: GRANT STUDENT ───────────────────────────────────
  if (action === 'grant_student') {
    const folderId = String(body.folderId ?? '').trim();
    const studentUserId = String(body.studentUserId ?? '').trim();

    if (!folderId || !studentUserId) return errorResponse('MISSING_PARAM', 'Thiếu thông tin.', 400);

    const folder = await loadFolder(folderId);
    if (!folder) return errorResponse('NOT_FOUND', 'Thư mục không tồn tại.', 404);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (!callerAccess.canManage) return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý thư mục này.', 403);

    // Verify target is a student
    const { data: studentUser } = await supabaseAdmin
      .from('app_users')
      .select('id, username, role, assigned_classes')
      .eq('id', studentUserId)
      .maybeSingle<CallerProfile>();

    if (!studentUser || studentUser.role !== 'student') {
      return errorResponse('INVALID_PRINCIPAL', 'Học sinh không hợp lệ.', 400);
    }

    // Teacher check
    if (callerProfile.role === 'teacher') {
      const teacherClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      const sClasses = Array.isArray(studentUser.assigned_classes) ? studentUser.assigned_classes : [];
      const overlaps = teacherClasses.includes('Tất cả') || sClasses.some((c) => teacherClasses.includes(c));
      if (!overlaps) {
        return errorResponse('FORBIDDEN_STUDENT', 'Học sinh này không thuộc lớp nào bạn phụ trách.', 403);
      }
    }

    const newGrantId = `fag_${crypto.randomUUID()}`;
    const { data: savedGrant, error: upsertErr } = await supabaseAdmin
      .from('folder_access_grants')
      .upsert({
        id: newGrantId,
        folder_type: folderType,
        folder_id: folderId,
        principal_type: 'user',
        principal_id: studentUserId,
        permission: 'viewer', // Students strictly receive viewer
        granted_by: callerProfile.id,
        updated_at: now,
      }, { onConflict: 'folder_type,folder_id,principal_type,principal_id' })
      .select('*')
      .single();

    if (upsertErr) return errorResponse('DB_ERROR', upsertErr.message, 500);
    return json({ success: true, grant: savedGrant });
  }

  // ─── ACTION: REVOKE STUDENT ──────────────────────────────────
  if (action === 'revoke_student') {
    const folderId = String(body.folderId ?? '').trim();
    const studentUserId = String(body.studentUserId ?? '').trim();

    if (!folderId || !studentUserId) return errorResponse('MISSING_PARAM', 'Thiếu thông tin.', 400);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (!callerAccess.canManage) return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý thư mục này.', 403);

    const { error: delErr } = await supabaseAdmin
      .from('folder_access_grants')
      .delete()
      .eq('folder_type', folderType)
      .eq('folder_id', folderId)
      .eq('principal_type', 'user')
      .eq('principal_id', studentUserId);

    if (delErr) return errorResponse('DB_ERROR', delErr.message, 500);
    return json({ success: true, folderId, studentUserId });
  }

  // ─── ACTION: TRANSFER OWNERSHIP ──────────────────────────────
  if (action === 'transfer_ownership') {
    const folderId = String(body.folderId ?? '').trim();
    const newOwnerUserId = String(body.newOwnerUserId ?? '').trim();

    if (!folderId || !newOwnerUserId) return errorResponse('MISSING_PARAM', 'Thiếu thông tin chuyển quyền.', 400);

    const folder = await loadFolder(folderId);
    if (!folder) return errorResponse('NOT_FOUND', 'Thư mục không tồn tại.', 404);

    const callerAccess = await getCallerEffectivePermission(folderId);
    if (callerProfile.role !== 'admin' && !callerAccess.isOwner) {
      return errorResponse('FORBIDDEN', 'Chỉ Admin hoặc Chủ sở hữu hiện tại mới có thể chuyển quyền sở hữu.', 403);
    }

    const { data: newOwner } = await supabaseAdmin
      .from('app_users')
      .select('id, username, role')
      .eq('id', newOwnerUserId)
      .maybeSingle<CallerProfile>();

    if (!newOwner || (newOwner.role !== 'teacher' && newOwner.role !== 'admin')) {
      return errorResponse('INVALID_PRINCIPAL', 'Chủ sở hữu mới phải là Giáo viên hoặc Quản trị viên.', 400);
    }

    // Update folder created_by
    await supabaseAdmin
      .from(folderTable)
      .update({ created_by: newOwnerUserId, updated_at: now })
      .eq('id', folderId);

    // Upsert owner grant for new owner
    const newGrantId = `fag_${crypto.randomUUID()}`;
    await supabaseAdmin
      .from('folder_access_grants')
      .upsert({
        id: newGrantId,
        folder_type: folderType,
        folder_id: folderId,
        principal_type: 'user',
        principal_id: newOwnerUserId,
        permission: 'owner',
        granted_by: callerProfile.id,
        updated_at: now,
      }, { onConflict: 'folder_type,folder_id,principal_type,principal_id' });

    // Downgrade previous owner to manager grant if caller was owner
    if (callerProfile.role !== 'admin' && callerProfile.id !== newOwnerUserId) {
      await supabaseAdmin
        .from('folder_access_grants')
        .upsert({
          id: `fag_${crypto.randomUUID()}`,
          folder_type: folderType,
          folder_id: folderId,
          principal_type: 'user',
          principal_id: callerProfile.id,
          permission: 'manager',
          granted_by: newOwnerUserId,
          updated_at: now,
        }, { onConflict: 'folder_type,folder_id,principal_type,principal_id' });
    }

    return json({ success: true, folderId, newOwnerUserId });
  }

  // ─── ACTION: LIST AVAILABLE PRINCIPALS ────────────────────────
  if (action === 'list_available_principals') {
    // Returns teachers, classes, and students the caller is permitted to grant
    const { data: allTeachers } = await supabaseAdmin
      .from('app_users')
      .select('id, username, full_name, role, allowed_subjects')
      .in('role', ['teacher', 'admin'])
      .order('full_name', { ascending: true });

    let classes: string[] = [];
    if (callerProfile.role === 'admin') {
      const { data: dbClasses } = await supabaseAdmin
        .from('classes')
        .select('name')
        .order('name', { ascending: true });
      classes = (dbClasses || []).map((c) => c.name);
    } else {
      classes = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
    }

    // Query students within caller scope
    const { data: allStudents } = await supabaseAdmin
      .from('app_users')
      .select('id, username, full_name, role, assigned_classes')
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    let allowedStudents: Array<{ id: string; username: string; full_name: string; role: string; assigned_classes?: string[] }> = [];
    if (callerProfile.role === 'admin') {
      allowedStudents = allStudents || [];
    } else {
      const teacherClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      if (teacherClasses.includes('Tất cả')) {
        allowedStudents = allStudents || [];
      } else {
        allowedStudents = (allStudents || []).filter((s) => {
          const sClasses = Array.isArray(s.assigned_classes) ? s.assigned_classes : [];
          return sClasses.some((c) => teacherClasses.includes(c));
        });
      }
    }

    return json({
      success: true,
      teachers: allTeachers || [],
      classes,
      students: allowedStudents,
    });
  }

  return errorResponse('UNKNOWN_ACTION', `Hành động '${action}' không được hỗ trợ.`, 400);
});
