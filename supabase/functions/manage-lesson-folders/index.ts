// Edge Function: manage-lesson-folders
// Description: Securely handles all write operations (create, rename, move, archive, restore, delete, moveLesson)
// for lesson_folders and lesson folder assignments.
// Strictly enforces Teacher Folder Ownership:
// - Teacher who creates a folder becomes its default owner (created_by = callerProfile.id).
// - Teacher has full management rights (rename, child folders, move, archive, restore, delete when empty)
//   ONLY over folders they own (created_by === callerProfile.id).
// - Teacher cannot manage or mutate folders belonging to other teachers.
// - Admin maintains full access over all folders.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const VALID_CATEGORIES = new Set(['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading']);

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

// ─── PERMISSION & SUBJECT-CATEGORY MAPPING HELPERS ─────────────

const SUBJECT_CATEGORY_MAP: Record<string, string[]> = {
  // Bao quát tiếng Nhật / ngoại ngữ
  'tiếng nhật': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'tieng nhat': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'ngoại ngữ': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'ngoai ngu': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],
  'japanese': ['cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading'],

  // Từng kỹ năng chuyên sâu
  'ngữ pháp': ['cat-grammar'],
  'ngu phap': ['cat-grammar'],
  'grammar': ['cat-grammar'],

  'từ vựng': ['cat-vocab'],
  'tu vung': ['cat-vocab'],
  'vocab': ['cat-vocab'],
  'vocabulary': ['cat-vocab'],

  'nghe': ['cat-listening'],
  'nghe hiểu': ['cat-listening'],
  'nghe hieu': ['cat-listening'],
  'listening': ['cat-listening'],

  'đọc': ['cat-reading'],
  'đọc hiểu': ['cat-reading'],
  'doc': ['cat-reading'],
  'doc hieu': ['cat-reading'],
  'reading': ['cat-reading'],
};

function normalizeSubjectName(text: string): string {
  return text.normalize('NFC').trim().toLowerCase();
}

function isTeacherAllowedForLessonCategory(
  teacherProfile: { allowed_subjects?: string[] },
  categoryId: string
): boolean {
  if (!VALID_CATEGORIES.has(categoryId)) return false;
  const allowed = Array.isArray(teacherProfile.allowed_subjects) ? teacherProfile.allowed_subjects : [];
  // Nếu teacher chưa cấu hình giới hạn môn (mảng rỗng) -> mặc định được phép phụ trách các bài học tiếng Nhật
  if (allowed.length === 0) return true;

  for (const rawSub of allowed) {
    const sub = normalizeSubjectName(rawSub);
    const directCategories = SUBJECT_CATEGORY_MAP[sub];
    if (directCategories && directCategories.includes(categoryId)) {
      return true;
    }
    // So sánh chuỗi con mềm dẻo
    if (sub.includes('nhật') || sub.includes('ngoại ngữ') || sub.includes('japanese')) {
      return true;
    }
    if ((sub.includes('ngữ pháp') || sub.includes('grammar')) && categoryId === 'cat-grammar') {
      return true;
    }
    if ((sub.includes('từ vựng') || sub.includes('vocab')) && categoryId === 'cat-vocab') {
      return true;
    }
    if ((sub.includes('nghe') || sub.includes('listening')) && categoryId === 'cat-listening') {
      return true;
    }
    if ((sub.includes('đọc') || sub.includes('reading')) && categoryId === 'cat-reading') {
      return true;
    }
  }

  return false;
}

function isTeacherFolderOwner(
  callerProfile: { id: string },
  folder: { created_by?: string | null }
): boolean {
  return Boolean(folder.created_by && folder.created_by === callerProfile.id);
}

async function isTeacherFolderOwnerOrManager(
  supabaseAdmin: ReturnType<typeof createClient>,
  callerProfile: { id: string },
  folder: { id?: string; created_by?: string | null }
): Promise<boolean> {
  if (folder.created_by && folder.created_by === callerProfile.id) return true;
  if (!folder.id) return false;
  try {
    const { data: grants } = await supabaseAdmin
      .from('folder_access_grants')
      .select('permission')
      .eq('folder_type', 'lesson')
      .eq('folder_id', folder.id)
      .eq('principal_type', 'user')
      .eq('principal_id', callerProfile.id)
      .in('permission', ['owner', 'manager']);
    return Boolean(grants && grants.length > 0);
  } catch {
    return false;
  }
}

function hasTeacherAssignedClasses(callerProfile: { assigned_classes?: string[] }): boolean {
  const classes = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
  return classes.length > 0;
}

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

  // 2. Authorize caller profile strictly from database
  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes, allowed_subjects, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

  if (profileErr || !callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'teacher')) {
    return errorResponse('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác quản lý thư mục bài học.', 403);
  }

  // 3. Parse input body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Dữ liệu yêu cầu không đúng định dạng JSON.', 400);
  }

  const action = String(body.action ?? '').trim();
  const now = new Date().toISOString();

  // ─── ACTION: CREATE FOLDER ────────────────────────────────────
  if (action === 'create') {
    const categoryId = String(body.categoryId ?? '').trim();
    const parentId = body.parentId ? String(body.parentId).trim() : null;
    const name = String(body.name ?? '').trim().normalize('NFC');
    const description = body.description ? String(body.description).trim() : null;
    const color = body.color ? String(body.color).trim() : null;
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

    if (!categoryId || !name) {
      return errorResponse('INVALID_INPUT', 'Thiếu danh mục hoặc tên thư mục.', 400);
    }

    if (!VALID_CATEGORIES.has(categoryId)) {
      return errorResponse('INVALID_CATEGORY', 'Danh mục bài học không hợp lệ.', 400);
    }

    // Teacher validations
    if (callerProfile.role === 'teacher') {
      // 1. Môn học phù hợp category
      if (!isTeacherAllowedForLessonCategory(callerProfile, categoryId)) {
        return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phân công phụ trách môn học này.', 403);
      }
      // 2. Có ít nhất một lớp được phân công
      if (!hasTeacherAssignedClasses(callerProfile)) {
        return errorResponse('FORBIDDEN_CLASSES', 'Bạn chưa được phân công lớp học nào để tạo thư mục.', 403);
      }
    }

    // Validate parent if provided
    if (parentId) {
      const { data: parent, error: pErr } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, category_id, created_by, archived_at')
        .eq('id', parentId)
        .maybeSingle();

      if (pErr || !parent) {
        return errorResponse('PARENT_NOT_FOUND', 'Thư mục cha không tồn tại.', 404);
      }
      if (parent.category_id !== categoryId) {
        return errorResponse('CATEGORY_MISMATCH', 'Thư mục cha không thuộc cùng danh mục bài học.', 400);
      }
      if (parent.archived_at) {
        return errorResponse('PARENT_ARCHIVED', 'Không thể tạo thư mục con bên trong thư mục đã lưu trữ.', 400);
      }

      // Teacher chỉ được tạo folder con bên trong folder do chính mình sở hữu
      if (callerProfile.role === 'teacher' && !isTeacherFolderOwner(callerProfile, parent)) {
        return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
      }
    }

    const folderId = `lfolder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Server-side ownership: Always set created_by to callerProfile.id
    const newFolder = {
      id: folderId,
      category_id: categoryId,
      parent_id: parentId,
      name,
      description,
      color,
      sort_order: sortOrder,
      created_by: callerProfile.id,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };

    const { error: insertErr } = await supabaseAdmin.from('lesson_folders').insert(newFolder);
    if (insertErr) {
      if (insertErr.code === '23505') {
        return errorResponse('DUPLICATE_NAME', `Đã tồn tại thư mục tên "${name}" trong cùng cấp.`, 409);
      }
      return errorResponse('DB_ERROR', insertErr.message || 'Lỗi khi lưu thư mục vào cơ sở dữ liệu.', 500);
    }

    // Auto-create owner grant in folder_access_grants
    try {
      await supabaseAdmin.from('folder_access_grants').insert({
        id: `fag_${crypto.randomUUID()}`,
        folder_type: 'lesson',
        folder_id: folderId,
        principal_type: 'user',
        principal_id: callerProfile.id,
        permission: 'owner',
        granted_by: callerProfile.id,
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Safe fallback if folder_access_grants table is not yet created
    }

    return json({
      success: true,
      folder: {
        id: newFolder.id,
        categoryId: newFolder.category_id,
        parentId: newFolder.parent_id,
        name: newFolder.name,
        description: newFolder.description,
        color: newFolder.color,
        sortOrder: newFolder.sort_order,
        createdBy: newFolder.created_by,
        createdAt: newFolder.created_at,
        updatedAt: newFolder.updated_at,
        archivedAt: newFolder.archived_at,
      },
    });
  }

  // ─── ACTION: RENAME / RECOLOR ─────────────────────────────────
  if (action === 'rename') {
    const id = String(body.id ?? '').trim();
    const name = String(body.name ?? '').trim().normalize('NFC');
    const color = body.color !== undefined ? (body.color ? String(body.color).trim() : null) : undefined;
    const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined;

    if (!id || !name) {
      return errorResponse('INVALID_INPUT', 'Mã thư mục và tên mới không được để trống.', 400);
    }

    // Teacher permission and ownership check
    if (callerProfile.role === 'teacher') {
      const { data: f } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, category_id, created_by')
        .eq('id', id)
        .maybeSingle();

      if (!f) {
        return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục.', 404);
      }
      if (!isTeacherFolderOwner(callerProfile, f)) {
        return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
      }
      if (!isTeacherAllowedForLessonCategory(callerProfile, f.category_id)) {
        return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép chỉnh sửa thư mục này.', 403);
      }
    }

    const updatePayload: Record<string, unknown> = { name, updated_at: now };
    if (color !== undefined) updatePayload.color = color;
    if (description !== undefined) updatePayload.description = description;

    const { data, error: upErr } = await supabaseAdmin
      .from('lesson_folders')
      .update(updatePayload)
      .eq('id', id)
      .select('id');

    if (upErr) {
      if (upErr.code === '23505') {
        return errorResponse('DUPLICATE_NAME', `Đã tồn tại thư mục tên "${name}" trong cùng cấp.`, 409);
      }
      return errorResponse('DB_ERROR', upErr.message, 500);
    }
    if (!data || data.length === 0) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục cần cập nhật.', 404);
    }

    return json({ success: true });
  }

  // ─── ACTION: MOVE FOLDER ──────────────────────────────────────
  if (action === 'moveFolder') {
    const id = String(body.id ?? '').trim();
    const newParentId = body.newParentId ? String(body.newParentId).trim() : null;

    if (!id) return errorResponse('INVALID_INPUT', 'Thiếu mã thư mục.', 400);
    if (id === newParentId) {
      return errorResponse('INVALID_PARENT', 'Thư mục không thể làm cha của chính nó.', 400);
    }

    // Lấy thông tin folder cần di chuyển
    const { data: targetFolder, error: tfErr } = await supabaseAdmin
      .from('lesson_folders')
      .select('id, category_id, parent_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (tfErr || !targetFolder) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục cần di chuyển.', 404);
    }

    // Teacher ownership & category check on moving folder
    if (callerProfile.role === 'teacher') {
      const isOwnerOrManager = await isTeacherFolderOwnerOrManager(supabaseAdmin, callerProfile, targetFolder);
      if (!isOwnerOrManager) {
        return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
      }
      if (!isTeacherAllowedForLessonCategory(callerProfile, targetFolder.category_id)) {
        return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép thao tác trên danh mục này.', 403);
      }
    }

    if (newParentId) {
      // Tải tất cả folders trong cùng category để kiểm tra anti-cycle và validate parent
      const { data: allFolders, error: afErr } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, parent_id, category_id, created_by, archived_at')
        .eq('category_id', targetFolder.category_id);

      if (afErr || !allFolders) {
        return errorResponse('DB_ERROR', 'Không thể kiểm tra cấu trúc thư mục.', 500);
      }

      const parentFolder = allFolders.find((f) => f.id === newParentId);
      if (!parentFolder) {
        return errorResponse('PARENT_NOT_FOUND', 'Thư mục cha đích không tồn tại hoặc khác danh mục.', 404);
      }
      if (parentFolder.archived_at) {
        return errorResponse('PARENT_ARCHIVED', 'Không thể di chuyển vào thư mục đã lưu trữ.', 400);
      }

      // Teacher must also be owner/manager of destination parent folder
      if (callerProfile.role === 'teacher') {
        const canManageParent = await isTeacherFolderOwnerOrManager(supabaseAdmin, callerProfile, parentFolder);
        if (!canManageParent) {
          return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục cha đích.', 403);
        }
      }

      // Thu thập descendant ids của id để chặn cycle
      const childrenMap = new Map<string, string[]>();
      for (const f of allFolders) {
        const p = f.parent_id ?? '';
        if (!childrenMap.has(p)) childrenMap.set(p, []);
        childrenMap.get(p)!.push(f.id);
      }
      const descendants = new Set<string>();
      const stack = [id];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const kid of childrenMap.get(cur) ?? []) {
          if (!descendants.has(kid)) {
            descendants.add(kid);
            stack.push(kid);
          }
        }
      }

      if (descendants.has(newParentId)) {
        return errorResponse('CYCLE_DETECTED', 'Không thể di chuyển thư mục vào thư mục con của chính nó.', 400);
      }
    }

    const { data, error: moveErr } = await supabaseAdmin
      .from('lesson_folders')
      .update({ parent_id: newParentId, updated_at: now })
      .eq('id', id)
      .select('id');

    if (moveErr) {
      if (moveErr.code === '23505') {
        return errorResponse('DUPLICATE_NAME', 'Đã tồn tại thư mục cùng tên trong vị trí đích.', 409);
      }
      return errorResponse('DB_ERROR', moveErr.message, 500);
    }
    if (!data || data.length === 0) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục để di chuyển.', 404);
    }

    return json({ success: true });
  }

  // ─── ACTION: ARCHIVE / RESTORE ────────────────────────────────
  if (action === 'archive' || action === 'restore') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('INVALID_INPUT', 'Thiếu mã thư mục.', 400);

    const { data: f } = await supabaseAdmin
      .from('lesson_folders')
      .select('id, category_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (!f) return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục.', 404);

    if (callerProfile.role === 'teacher') {
      if (!isTeacherFolderOwner(callerProfile, f)) {
        return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
      }
      if (!isTeacherAllowedForLessonCategory(callerProfile, f.category_id)) {
        return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép thao tác trên thư mục này.', 403);
      }
    }

    const isArchive = action === 'archive';
    const { data, error: archErr } = await supabaseAdmin
      .from('lesson_folders')
      .update({ archived_at: isArchive ? now : null, updated_at: now })
      .eq('id', id)
      .select('id');

    if (archErr) return errorResponse('DB_ERROR', archErr.message, 500);
    if (!data || data.length === 0) return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục.', 404);

    return json({ success: true });
  }

  // ─── ACTION: DELETE PERMANENTLY ───────────────────────────────
  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('INVALID_INPUT', 'Thiếu mã thư mục.', 400);

    const { data: f } = await supabaseAdmin
      .from('lesson_folders')
      .select('id, category_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (!f) return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục để xóa.', 404);

    if (callerProfile.role === 'teacher') {
      if (!isTeacherFolderOwner(callerProfile, f)) {
        return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
      }
      if (!isTeacherAllowedForLessonCategory(callerProfile, f.category_id)) {
        return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép xóa thư mục này.', 403);
      }
    }

    // 1. Server check: Thư mục con
    const { data: childFolders } = await supabaseAdmin
      .from('lesson_folders')
      .select('id')
      .eq('parent_id', id);

    if (childFolders && childFolders.length > 0) {
      return errorResponse('FOLDER_NOT_EMPTY', 'Không thể xóa thư mục vì vẫn còn thư mục con bên trong.', 400);
    }

    // 2. Server check: Bài học trong lessons, listening_lessons, reading_lessons
    const [lRes, listRes, readRes] = await Promise.all([
      supabaseAdmin.from('lessons').select('id').eq('folder_id', id).limit(1),
      supabaseAdmin.from('listening_lessons').select('id').eq('folder_id', id).limit(1),
      supabaseAdmin.from('reading_lessons').select('id').eq('folder_id', id).limit(1),
    ]);

    if ((lRes.data && lRes.data.length > 0) ||
        (listRes.data && listRes.data.length > 0) ||
        (readRes.data && readRes.data.length > 0)) {
      return errorResponse('FOLDER_NOT_EMPTY', 'Không thể xóa thư mục vì vẫn còn bài học bên trong.', 400);
    }

    const { data, error: delErr } = await supabaseAdmin
      .from('lesson_folders')
      .delete()
      .eq('id', id)
      .select('id');

    if (delErr) return errorResponse('DB_ERROR', delErr.message, 500);
    if (!data || data.length === 0) return errorResponse('NOT_FOUND', 'Không tìm thấy thư mục để xóa.', 404);

    return json({ success: true });
  }

  // ─── ACTION: MOVE LESSON TO FOLDER ────────────────────────────
  if (action === 'moveLesson') {
    const lessonType = String(body.lessonType ?? '').trim();
    const lessonId = String(body.lessonId ?? '').trim();
    const targetFolderId = body.targetFolderId ? String(body.targetFolderId).trim() : null;

    if (!lessonId || !lessonType) {
      return errorResponse('INVALID_INPUT', 'Thiếu thông tin bài học.', 400);
    }

    if (targetFolderId !== null) {
      const { data: folder, error: fErr } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, category_id, created_by, archived_at')
        .eq('id', targetFolderId)
        .maybeSingle();

      if (fErr || !folder) {
        return errorResponse('FOLDER_NOT_FOUND', 'Thư mục đích không tồn tại.', 404);
      }
      if (folder.archived_at) {
        return errorResponse('FOLDER_ARCHIVED', 'Không thể di chuyển bài học vào thư mục đã lưu trữ.', 400);
      }

      // Teacher ownership check: Teacher must own the target folder
      if (callerProfile.role === 'teacher') {
        if (!isTeacherFolderOwner(callerProfile, folder)) {
          return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
        }
        if (!isTeacherAllowedForLessonCategory(callerProfile, folder.category_id)) {
          return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép thao tác trên danh mục này.', 403);
        }
      }

      // Kiểm tra category tương ứng
      const cat = folder.category_id;
      const isCompatible =
        (cat === 'cat-grammar' && (lessonType === 'grammar' || lessonType === 'grammar_exam')) ||
        (cat === 'cat-vocab' && (lessonType === 'vocab' || lessonType === 'vocabulary_exam')) ||
        (cat === 'cat-listening' && lessonType === 'listening') ||
        (cat === 'cat-reading' && (lessonType === 'reading' || lessonType === 'reading_exam'));

      if (!isCompatible) {
        return errorResponse('TYPE_MISMATCH', `Không thể chuyển bài học loại "${lessonType}" vào thư mục danh mục "${cat}".`, 400);
      }
    }

    // Thực hiện cập nhật folder_id trên bảng tương ứng
    let updateQuery;
    if (lessonType === 'grammar' || lessonType === 'vocab' || lessonType === 'grammar_exam' || lessonType === 'vocabulary_exam' || lessonType === 'reading_exam') {
      updateQuery = supabaseAdmin.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId).select('id');
    } else if (lessonType === 'listening') {
      updateQuery = supabaseAdmin.from('listening_lessons').update({ folder_id: targetFolderId }).eq('id', lessonId).select('id');
    } else if (lessonType === 'reading') {
      // Check whether lesson exists in lessons table first (e.g. reading exam lessons)
      const { data: inLessons } = await supabaseAdmin.from('lessons').select('id').eq('id', lessonId).maybeSingle();
      if (inLessons) {
        updateQuery = supabaseAdmin.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId).select('id');
      } else {
        updateQuery = supabaseAdmin.from('reading_lessons').update({ folder_id: targetFolderId }).eq('id', lessonId).select('id');
      }
    } else {
      updateQuery = supabaseAdmin.from('lessons').update({ folder_id: targetFolderId }).eq('id', lessonId).select('id');
    }

    const { data, error: upErr } = await updateQuery;
    if (upErr) return errorResponse('DB_ERROR', upErr.message, 500);
    if (!data || data.length === 0) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học để di chuyển.', 404);

    return json({ success: true });
  }

  // ─── ACTION: BULK MOVE LESSONS TO FOLDER ──────────────────────
  if (action === 'bulkMoveLessons') {
    const lessonType = String(body.lessonType ?? '').trim();
    const rawLessonIds = body.lessonIds;
    const targetFolderId = body.targetFolderId ? String(body.targetFolderId).trim() : null;

    if (!Array.isArray(rawLessonIds) || rawLessonIds.length === 0 || !lessonType) {
      return errorResponse('INVALID_INPUT', 'Thiếu danh sách bài học hoặc loại bài học.', 400);
    }

    const lessonIds = Array.from(new Set(rawLessonIds.map(String).map((s) => s.trim()).filter(Boolean)));
    if (lessonIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'Danh sách bài học trống.', 400);
    }

    // 1. Kiểm tra folder đích nếu targetFolderId !== null
    if (targetFolderId !== null) {
      const { data: folder, error: fErr } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, category_id, created_by, archived_at')
        .eq('id', targetFolderId)
        .maybeSingle();

      if (fErr || !folder) {
        return errorResponse('FOLDER_NOT_FOUND', 'Thư mục đích không tồn tại.', 404);
      }
      if (folder.archived_at) {
        return errorResponse('FOLDER_ARCHIVED', 'Không thể di chuyển bài học vào thư mục đã lưu trữ.', 400);
      }

      // Teacher ownership check: Teacher must own the target folder
      if (callerProfile.role === 'teacher') {
        if (!isTeacherFolderOwner(callerProfile, folder)) {
          return errorResponse('FOLDER_NOT_OWNED', 'Bạn không có quyền quản lý thư mục do giáo viên khác tạo.', 403);
        }
        if (!isTeacherAllowedForLessonCategory(callerProfile, folder.category_id)) {
          return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép thao tác trên danh mục này.', 403);
        }
      }

      // Kiểm tra category tương ứng
      const cat = folder.category_id;
      const isCompatible =
        (cat === 'cat-grammar' && (lessonType === 'grammar' || lessonType === 'grammar_exam')) ||
        (cat === 'cat-vocab' && (lessonType === 'vocab' || lessonType === 'vocabulary_exam')) ||
        (cat === 'cat-listening' && lessonType === 'listening') ||
        (cat === 'cat-reading' && (lessonType === 'reading' || lessonType === 'reading_exam'));

      if (!isCompatible) {
        return errorResponse('TYPE_MISMATCH', `Không thể chuyển bài học loại "${lessonType}" vào thư mục danh mục "${cat}".`, 400);
      }
    } else {
      // targetFolderId === null (chuyển về Trang chủ)
      if (callerProfile.role === 'teacher') {
        const cat =
          lessonType === 'grammar' || lessonType === 'grammar_exam' ? 'cat-grammar' :
          lessonType === 'vocab' || lessonType === 'vocabulary_exam' ? 'cat-vocab' :
          lessonType === 'listening' ? 'cat-listening' :
          lessonType === 'reading' || lessonType === 'reading_exam' ? 'cat-reading' : '';
        if (!cat || !isTeacherAllowedForLessonCategory(callerProfile, cat)) {
          return errorResponse('FORBIDDEN_CATEGORY', 'Bạn không được phép thao tác trên danh mục bài học này.', 403);
        }
      }
    }

    // 2. Xác định bảng tương ứng
    let tableName = 'lessons';
    if (['grammar', 'vocab', 'grammar_exam', 'vocabulary_exam', 'reading_exam'].includes(lessonType)) {
      tableName = 'lessons';
    } else if (lessonType === 'listening') {
      tableName = 'listening_lessons';
    } else if (lessonType === 'reading') {
      tableName = 'reading_lessons';
    }

    // 3. Truy vấn các bài học hiện có để kiểm tra tồn tại và phân loại
    const { data: existingRows, error: exErr } = await supabaseAdmin
      .from(tableName)
      .select('id, folder_id')
      .in('id', lessonIds);

    if (exErr) {
      return errorResponse('DB_ERROR', exErr.message, 500);
    }

    const foundIds = new Set((existingRows || []).map((r) => r.id));
    const failed: Array<{ id: string; reason: string }> = [];
    const validIdsToUpdate: string[] = [];

    for (const id of lessonIds) {
      if (!foundIds.has(id)) {
        failed.push({ id, reason: 'Bài học không tồn tại trong hệ thống.' });
      } else {
        validIdsToUpdate.push(id);
      }
    }

    // 4. Cập nhật folder_id cho các bài học hợp lệ
    let updatedIds: string[] = [];
    if (validIdsToUpdate.length > 0) {
      const { data: updateRes, error: upErr } = await supabaseAdmin
        .from(tableName)
        .update({ folder_id: targetFolderId })
        .in('id', validIdsToUpdate)
        .select('id');

      if (upErr) {
        return errorResponse('DB_ERROR', upErr.message, 500);
      }
      updatedIds = (updateRes || []).map((r) => r.id);
    }

    return json({
      success: true,
      targetFolderId,
      totalRequested: lessonIds.length,
      updatedCount: updatedIds.length,
      updatedIds,
      failed,
    });
  }

  return errorResponse('INVALID_ACTION', 'Thao tác không được hỗ trợ.', 400);
});
