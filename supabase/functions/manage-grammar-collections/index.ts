// Edge Function: manage-grammar-collections
// Description: Securely handles all write and management operations for grammar_collections
// and grammar_collection_items (Parent–Child model).
// Strictly verifies caller permissions using app_users profile on the server.
// - Admin: Full access across all collections and classes.
// - Teacher: Restricted to assigned_classes and cat-grammar. Cannot expand target_classes or bundle lessons outside their classes.
// - Student: Read-only access filtered by their enrolled classes. Mutation operations return 403 Forbidden.

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

// ─── PERMISSION HELPERS FOR TEACHER ────────────────────────────

function isTeacherAllowedForGrammar(profile: { allowed_subjects?: string[] }): boolean {
  const allowed = Array.isArray(profile.allowed_subjects) ? profile.allowed_subjects : [];
  if (allowed.length === 0) return true; // Empty array means all subjects
  const normalized = allowed.map((s) => String(s).trim().toLowerCase());
  return normalized.some((s) => s.includes('nhật') || s.includes('ngoại ngữ') || s.includes('ngữ pháp') || s.includes('tiếng'));
}

function isTeacherAllowedForTargetClasses(
  teacherProfile: { assigned_classes?: string[] },
  targetClasses: string[]
): boolean {
  const teacherClasses = Array.isArray(teacherProfile.assigned_classes) ? teacherProfile.assigned_classes : [];
  if (teacherClasses.includes('Tất cả')) return true;
  // If targetClasses is empty, it means global access - only teachers with 'Tất cả' can do this
  if (targetClasses.length === 0) return false;
  // Every specified target class must be inside teacher's assigned classes
  return targetClasses.every((c) => teacherClasses.includes(c));
}

function canTeacherAccessCollection(
  teacherProfile: { id: string; assigned_classes?: string[] },
  collection: { created_by?: string | null; target_classes?: string[] }
): boolean {
  if (collection.created_by && collection.created_by === teacherProfile.id) return true;
  const teacherClasses = Array.isArray(teacherProfile.assigned_classes) ? teacherProfile.assigned_classes : [];
  if (teacherClasses.includes('Tất cả')) return true;
  const targets = Array.isArray(collection.target_classes) ? collection.target_classes : [];
  if (targets.length === 0) return false;
  return targets.some((c) => teacherClasses.includes(c));
}

function isLessonWithinTeacherScope(
  teacherProfile: { assigned_classes?: string[] },
  lesson: { target_classes?: string[] }
): boolean {
  const teacherClasses = Array.isArray(teacherProfile.assigned_classes) ? teacherProfile.assigned_classes : [];
  if (teacherClasses.includes('Tất cả')) return true;
  const targets = Array.isArray(lesson.target_classes) ? lesson.target_classes : [];
  // If lesson is assigned to specific classes, at least one must overlap with teacher's classes
  if (targets.length > 0) {
    return targets.some((c) => teacherClasses.includes(c));
  }
  // Public lesson
  return true;
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

  // 2. Authorize caller profile strictly from database (do NOT trust frontend role)
  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes, allowed_subjects, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

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
  const isReadAction = action === 'list_collections' || action === 'get_collection' || action === 'list_eligible_lessons';

  // Student is strictly forbidden from all write actions
  if (!isReadAction && callerProfile.role === 'student') {
    return errorResponse('FORBIDDEN', 'Học viên không có quyền thực hiện thao tác quản lý bài học tổng hợp.', 403);
  }

  // Only admin and teacher can perform writes
  if (!isReadAction && callerProfile.role !== 'admin' && callerProfile.role !== 'teacher') {
    return errorResponse('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403);
  }

  // If teacher, check subject authorization
  if (callerProfile.role === 'teacher' && !isTeacherAllowedForGrammar(callerProfile)) {
    return errorResponse('FORBIDDEN_SUBJECT', 'Bạn không được phân công phụ trách bộ môn Ngữ pháp.', 403);
  }

  const now = new Date().toISOString();

  // ─── ACTION: LIST COLLECTIONS ─────────────────────────────────
  if (action === 'list_collections') {
    const includeArchived = Boolean(body.includeArchived);
    let query = supabaseAdmin
      .from('grammar_collections')
      .select('id, title, description, jlpt_level, folder_id, target_classes, created_by, sort_order, is_active, created_at, updated_at, archived_at');

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data: collections, error: listErr } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (listErr) {
      return errorResponse('DB_ERROR', `Lỗi khi tải danh sách bài tổng hợp: ${listErr.message}`, 500);
    }

    let visible = collections || [];

    // Filter by student classes if student
    if (callerProfile.role === 'student') {
      const studentClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      visible = visible.filter((col) => {
        if (!col.is_active) return false;
        const targets = Array.isArray(col.target_classes) ? col.target_classes : [];
        if (targets.length === 0 || targets.includes('Tất cả')) return true;
        return targets.some((c: string) => studentClasses.includes(c));
      });
    } else if (callerProfile.role === 'teacher') {
      // Filter by teacher classes if teacher
      visible = visible.filter((col) => canTeacherAccessCollection(callerProfile, col));
    }

    // Attach item counts
    const collectionIds = visible.map((c) => c.id);
    const countMap: Record<string, number> = {};
    if (collectionIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('grammar_collection_items')
        .select('collection_id')
        .in('collection_id', collectionIds);
      if (items) {
        for (const item of items) {
          countMap[item.collection_id] = (countMap[item.collection_id] ?? 0) + 1;
        }
      }
    }

    const enriched = visible.map((c) => ({
      ...c,
      itemCount: countMap[c.id] ?? 0,
    }));

    return json({ success: true, collections: enriched });
  }

  // ─── ACTION: GET COLLECTION WITH ITEMS ────────────────────────
  if (action === 'get_collection') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('MISSING_PARAM', 'Thiếu mã bài học tổng hợp (id).', 400);

    const { data: collection, error: colErr } = await supabaseAdmin
      .from('grammar_collections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (colErr || !collection) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);
    }

    // Role scope checks
    if (callerProfile.role === 'student') {
      const studentClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
      const targets = Array.isArray(collection.target_classes) ? collection.target_classes : [];
      const isPublic = targets.length === 0 || targets.includes('Tất cả');
      const isEnrolled = targets.some((c: string) => studentClasses.includes(c));
      if (!isPublic && !isEnrolled) {
        return errorResponse('FORBIDDEN', 'Bạn không thuộc lớp được chỉ định cho bài học này.', 403);
      }
    } else if (callerProfile.role === 'teacher') {
      if (!canTeacherAccessCollection(callerProfile, collection)) {
        return errorResponse('FORBIDDEN', 'Bài học tổng hợp này nằm ngoài phạm vi lớp được phân công của bạn.', 403);
      }
    }

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('id, collection_id, lesson_id, sort_order, created_at')
      .eq('collection_id', id)
      .order('sort_order', { ascending: true });

    if (itemsErr) {
      return errorResponse('DB_ERROR', `Lỗi khi tải các mục của bài học: ${itemsErr.message}`, 500);
    }

    const lessonIds = (items || []).map((i) => i.lesson_id);
    let lessons: Record<string, unknown>[] = [];
    if (lessonIds.length > 0) {
      const { data: lessonsData } = await supabaseAdmin
        .from('lessons')
        .select('*')
        .in('id', lessonIds);
      lessons = lessonsData || [];
    }

    return json({ success: true, collection, items: items || [], lessons });
  }

  // ─── ACTION: CREATE COLLECTION ────────────────────────────────
  if (action === 'create_collection') {
    const title = String(body.title ?? '').trim();
    if (!title) return errorResponse('INVALID_TITLE', 'Tên bài học tổng hợp không được để trống.', 400);

    const description = String(body.description ?? '').trim();
    const jlptLevel = String(body.jlptLevel ?? '').trim().toUpperCase();
    const folderId = body.folderId ? String(body.folderId).trim() : null;
    let targetClasses = Array.isArray(body.targetClasses) ? body.targetClasses.map(String) : [];
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

    // Teacher class restrictions: cannot expand target_classes
    if (callerProfile.role === 'teacher') {
      if (targetClasses.length === 0) {
        const teacherClasses = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
        if (!teacherClasses.includes('Tất cả')) {
          targetClasses = [...teacherClasses];
        }
      } else if (!isTeacherAllowedForTargetClasses(callerProfile, targetClasses)) {
        return errorResponse('FORBIDDEN_CLASSES', 'Giáo viên không được tự ý gán bài học cho các lớp ngoài phạm vi phụ trách.', 403);
      }
    }

    // Validate folder belongs to cat-grammar if folderId provided
    if (folderId) {
      const { data: folder } = await supabaseAdmin
        .from('lesson_folders')
        .select('id, category_id, archived_at')
        .eq('id', folderId)
        .maybeSingle();

      if (!folder || folder.category_id !== 'cat-grammar' || folder.archived_at) {
        return errorResponse('INVALID_FOLDER', 'Thư mục được chọn không hợp lệ hoặc không thuộc danh mục Ngữ pháp.', 400);
      }
    }

    const newId = `gc_${crypto.randomUUID()}`;
    const newRecord = {
      id: newId,
      title,
      description,
      jlpt_level: jlptLevel,
      folder_id: folderId,
      target_classes: targetClasses,
      created_by: callerProfile.id,
      sort_order: sortOrder,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('grammar_collections')
      .insert(newRecord)
      .select('*')
      .single();

    if (insertErr) {
      return errorResponse('DB_ERROR', `Không thể tạo bài học tổng hợp: ${insertErr.message}`, 500);
    }

    return json({ success: true, collection: created });
  }

  // ─── ACTION: UPDATE COLLECTION ────────────────────────────────
  if (action === 'update_collection') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('MISSING_PARAM', 'Thiếu id bài học tổng hợp.', 400);

    const { data: existingCol, error: exErr } = await supabaseAdmin
      .from('grammar_collections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (exErr || !existingCol) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);
    }

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, existingCol)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền chỉnh sửa bài học tổng hợp này.', 403);
    }

    const patch: Record<string, unknown> = { updated_at: now };
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return errorResponse('INVALID_TITLE', 'Tên bài học không được để trống.', 400);
      patch.title = t;
    }
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.jlptLevel !== undefined) patch.jlpt_level = String(body.jlptLevel).trim().toUpperCase();
    if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);

    if (body.targetClasses !== undefined) {
      const nextTargets = Array.isArray(body.targetClasses) ? body.targetClasses.map(String) : [];
      if (callerProfile.role === 'teacher' && !isTeacherAllowedForTargetClasses(callerProfile, nextTargets)) {
        return errorResponse('FORBIDDEN_CLASSES', 'Giáo viên không thể mở rộng phạm vi lớp học ngoài danh sách được phân công.', 403);
      }
      patch.target_classes = nextTargets;
    }

    if (body.folderId !== undefined) {
      const fId = body.folderId ? String(body.folderId).trim() : null;
      if (fId) {
        const { data: folder } = await supabaseAdmin
          .from('lesson_folders')
          .select('id, category_id, archived_at')
          .eq('id', fId)
          .maybeSingle();

        if (!folder || folder.category_id !== 'cat-grammar' || folder.archived_at) {
          return errorResponse('INVALID_FOLDER', 'Thư mục được chọn không thuộc Ngữ pháp.', 400);
        }
      }
      patch.folder_id = fId;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('grammar_collections')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return errorResponse('DB_ERROR', `Lỗi khi cập nhật bài học tổng hợp: ${updateErr.message}`, 500);
    }

    return json({ success: true, collection: updated });
  }

  // ─── ACTION: ADD ITEMS TO COLLECTION ──────────────────────────
  if (action === 'add_items') {
    const collectionId = String(body.collectionId ?? '').trim();
    if (!collectionId) return errorResponse('MISSING_PARAM', 'Thiếu collectionId.', 400);

    const lessonIds = Array.isArray(body.lessonIds) ? body.lessonIds.map(String) : [];
    if (lessonIds.length === 0) return errorResponse('MISSING_PARAM', 'Danh sách lessonIds không được rỗng.', 400);

    // 1. Verify collection exists and active
    const { data: collection, error: colErr } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, archived_at, created_by, target_classes')
      .eq('id', collectionId)
      .maybeSingle();

    if (colErr || !collection || collection.archived_at) {
      return errorResponse('INVALID_COLLECTION', 'Bài học tổng hợp không tồn tại hoặc đã lưu trữ.', 400);
    }

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý bài học tổng hợp này.', 403);
    }

    // 2. Query lessons to verify category_id === 'cat-grammar'
    const { data: lessons, error: lessonsErr } = await supabaseAdmin
      .from('lessons')
      .select('id, title, category_id, target_classes')
      .in('id', lessonIds);

    if (lessonsErr) {
      return errorResponse('DB_ERROR', `Lỗi kiểm tra bài học: ${lessonsErr.message}`, 500);
    }

    const validLessonsMap = new Map((lessons || []).map((l) => [l.id, l]));

    // Check teacher scope on lessons
    if (callerProfile.role === 'teacher') {
      for (const lid of lessonIds) {
        const l = validLessonsMap.get(lid);
        if (!l) continue;
        if (!isLessonWithinTeacherScope(callerProfile, l)) {
          return errorResponse('FORBIDDEN_LESSON_SCOPE', `Bài học "${l.title}" nằm ngoài phạm vi phụ trách của bạn.`, 403);
        }
      }
    }

    // 3. Query existing items for these lessons to enforce v1 constraint (1 lesson belongs to at most 1 collection)
    const { data: existingItems } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('id, collection_id, lesson_id')
      .in('lesson_id', lessonIds);

    const itemLessonMap = new Map((existingItems || []).map((i) => [i.lesson_id, i.collection_id]));

    // Query max sort_order currently in this collection
    const { data: maxItemRow } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('sort_order')
      .eq('collection_id', collectionId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSortOrder = (typeof maxItemRow?.sort_order === 'number' ? maxItemRow.sort_order : 0) + 1;

    const added: string[] = [];
    const skipped: string[] = [];
    const conflicts: { lessonId: string; existingCollectionId: string }[] = [];
    const rowsToInsert: { id: string; collection_id: string; lesson_id: string; sort_order: number; created_at: string }[] = [];

    for (const lid of lessonIds) {
      const lesson = validLessonsMap.get(lid);
      if (!lesson || lesson.category_id !== 'cat-grammar') {
        skipped.push(lid);
        continue;
      }

      const existingColl = itemLessonMap.get(lid);
      if (existingColl) {
        conflicts.push({ lessonId: lid, existingCollectionId: existingColl });
        continue;
      }

      rowsToInsert.push({
        id: `gci_${crypto.randomUUID()}`,
        collection_id: collectionId,
        lesson_id: lid,
        sort_order: nextSortOrder++,
        created_at: now,
      });
      added.push(lid);
      itemLessonMap.set(lid, collectionId); // prevent intra-batch duplicates
    }

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('grammar_collection_items')
        .insert(rowsToInsert);

      if (insertErr) {
        return errorResponse('DB_ERROR', `Lỗi khi lưu liên kết bài học: ${insertErr.message}`, 500);
      }
    }

    return json({
      success: true,
      added,
      skipped,
      conflicts,
      totalAdded: added.length,
    });
  }

  // ─── ACTION: REMOVE ITEMS FROM COLLECTION ─────────────────────
  if (action === 'remove_items') {
    const collectionId = String(body.collectionId ?? '').trim();
    const lessonIds = Array.isArray(body.lessonIds) ? body.lessonIds.map(String) : [];

    if (!collectionId || lessonIds.length === 0) {
      return errorResponse('MISSING_PARAM', 'Thiếu collectionId hoặc lessonIds.', 400);
    }

    const { data: collection } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, created_by, target_classes')
      .eq('id', collectionId)
      .maybeSingle();

    if (!collection) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý bài học tổng hợp này.', 403);
    }

    const { error: delErr } = await supabaseAdmin
      .from('grammar_collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .in('lesson_id', lessonIds);

    if (delErr) {
      return errorResponse('DB_ERROR', `Lỗi khi tách bài khỏi bài tổng hợp: ${delErr.message}`, 500);
    }

    return json({ success: true, removedCount: lessonIds.length });
  }

  // ─── ACTION: MOVE ITEMS TO ANOTHER COLLECTION ─────────────────
  if (action === 'move_items') {
    const fromCollectionId = String(body.fromCollectionId ?? '').trim();
    const toCollectionId = String(body.toCollectionId ?? '').trim();
    const lessonIds = Array.isArray(body.lessonIds) ? body.lessonIds.map(String) : [];

    if (!fromCollectionId || !toCollectionId || lessonIds.length === 0) {
      return errorResponse('MISSING_PARAM', 'Thiếu thông tin chuyển bài học.', 400);
    }

    const { data: cols } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, created_by, target_classes')
      .in('id', [fromCollectionId, toCollectionId]);

    const fromCol = cols?.find((c) => c.id === fromCollectionId);
    const toCol = cols?.find((c) => c.id === toCollectionId);

    if (!fromCol || !toCol) {
      return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp nguồn hoặc đích.', 404);
    }

    if (callerProfile.role === 'teacher') {
      if (!canTeacherAccessCollection(callerProfile, fromCol) || !canTeacherAccessCollection(callerProfile, toCol)) {
        return errorResponse('FORBIDDEN', 'Bạn không có quyền chuyển bài giữa các bài học tổng hợp này.', 403);
      }
    }

    // Remove from old collection
    await supabaseAdmin
      .from('grammar_collection_items')
      .delete()
      .eq('collection_id', fromCollectionId)
      .in('lesson_id', lessonIds);

    // Get max sort_order in toCollection
    const { data: toMaxRow } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('sort_order')
      .eq('collection_id', toCollectionId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSort = (typeof toMaxRow?.sort_order === 'number' ? toMaxRow.sort_order : 0) + 1;
    const newItems = lessonIds.map((lid) => ({
      id: `gci_${crypto.randomUUID()}`,
      collection_id: toCollectionId,
      lesson_id: lid,
      sort_order: nextSort++,
      created_at: now,
    }));

    const { error: insErr } = await supabaseAdmin
      .from('grammar_collection_items')
      .insert(newItems);

    if (insErr) {
      return errorResponse('DB_ERROR', `Lỗi khi chuyển bài sang bài tổng hợp mới: ${insErr.message}`, 500);
    }

    return json({ success: true, movedCount: lessonIds.length });
  }

  // ─── ACTION: REORDER ITEMS ────────────────────────────────────
  if (action === 'reorder_items') {
    const collectionId = String(body.collectionId ?? '').trim();
    const lessonIdsInOrder = Array.isArray(body.lessonIdsInOrder) ? body.lessonIdsInOrder.map(String) : [];

    if (!collectionId || lessonIdsInOrder.length === 0) {
      return errorResponse('MISSING_PARAM', 'Thiếu collectionId hoặc thứ tự bài học.', 400);
    }

    const { data: collection } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, created_by, target_classes')
      .eq('id', collectionId)
      .maybeSingle();

    if (!collection) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền quản lý bài học tổng hợp này.', 403);
    }

    // Update sort_order for each item
    for (let i = 0; i < lessonIdsInOrder.length; i++) {
      const lid = lessonIdsInOrder[i];
      await supabaseAdmin
        .from('grammar_collection_items')
        .update({ sort_order: i + 1 })
        .eq('collection_id', collectionId)
        .eq('lesson_id', lid);
    }

    return json({ success: true, reorderedCount: lessonIdsInOrder.length });
  }

  // ─── ACTION: ARCHIVE COLLECTION ───────────────────────────────
  if (action === 'archive_collection') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('MISSING_PARAM', 'Thiếu id bài học tổng hợp.', 400);

    const { data: collection } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, created_by, target_classes')
      .eq('id', id)
      .maybeSingle();

    if (!collection) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền lưu trữ bài học tổng hợp này.', 403);
    }

    const { error: archErr } = await supabaseAdmin
      .from('grammar_collections')
      .update({ archived_at: now, updated_at: now })
      .eq('id', id);

    if (archErr) return errorResponse('DB_ERROR', archErr.message, 500);
    return json({ success: true, id, archivedAt: now });
  }

  // ─── ACTION: RESTORE COLLECTION ───────────────────────────────
  if (action === 'restore_collection') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('MISSING_PARAM', 'Thiếu id bài học tổng hợp.', 400);

    const { data: collection } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, title, created_by, target_classes, archived_at')
      .eq('id', id)
      .maybeSingle();

    if (!collection) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp cần khôi phục.', 404);

    if (!collection.archived_at) {
      return json({ success: true, id, message: 'Bài học tổng hợp đang ở trạng thái hoạt động.' });
    }

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền khôi phục bài học tổng hợp này.', 403);
    }

    // Check duplicate title among active collections
    const { data: duplicateActive } = await supabaseAdmin
      .from('grammar_collections')
      .select('id')
      .is('archived_at', null)
      .ilike('title', collection.title.trim())
      .neq('id', id)
      .limit(1);

    if (duplicateActive && duplicateActive.length > 0) {
      return errorResponse(
        'DUPLICATE_TITLE',
        `Đã tồn tại bài học tổng hợp đang hoạt động có tên "${collection.title}". Vui lòng đổi tên bài học trước khi khôi phục.`,
        409
      );
    }

    // Restore collection (child lessons are untouched and remain intact)
    const { error: restErr } = await supabaseAdmin
      .from('grammar_collections')
      .update({ archived_at: null, updated_at: now })
      .eq('id', id);

    if (restErr) return errorResponse('DB_ERROR', restErr.message, 500);
    return json({ success: true, id });
  }

  // ─── ACTION: DELETE COLLECTION IF EMPTY ───────────────────────
  if (action === 'delete_collection_if_empty') {
    const id = String(body.id ?? '').trim();
    if (!id) return errorResponse('MISSING_PARAM', 'Thiếu id bài học tổng hợp.', 400);

    const { data: collection } = await supabaseAdmin
      .from('grammar_collections')
      .select('id, created_by, target_classes')
      .eq('id', id)
      .maybeSingle();

    if (!collection) return errorResponse('NOT_FOUND', 'Không tìm thấy bài học tổng hợp.', 404);

    if (callerProfile.role === 'teacher' && !canTeacherAccessCollection(callerProfile, collection)) {
      return errorResponse('FORBIDDEN', 'Bạn không có quyền xóa bài học tổng hợp này.', 403);
    }

    // Verify empty
    const { data: items } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('id')
      .eq('collection_id', id)
      .limit(1);

    if (items && items.length > 0) {
      return errorResponse(
        'COLLECTION_NOT_EMPTY',
        'Bài học tổng hợp vẫn còn chứa các mục ngữ pháp con. Vui lòng tách hết các mục trước khi xóa bài học.',
        400
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from('grammar_collections')
      .delete()
      .eq('id', id);

    if (delErr) return errorResponse('DB_ERROR', delErr.message, 500);
    return json({ success: true, id });
  }

  // ─── ACTION: LIST ELIGIBLE LESSONS ────────────────────────────
  if (action === 'list_eligible_lessons') {
    // Returns all lessons in cat-grammar that are not yet assigned to any collection
    const query = supabaseAdmin
      .from('lessons')
      .select('id, title, meaning, source, sort_order, target_classes')
      .eq('category_id', 'cat-grammar')
      .order('sort_order', { ascending: true });

    const { data: allGrammar } = await query;

    const { data: allItems } = await supabaseAdmin
      .from('grammar_collection_items')
      .select('lesson_id, collection_id');

    const assignedIds = new Set((allItems || []).map((i) => i.lesson_id));
    let eligible = (allGrammar || []).filter((l) => !assignedIds.has(l.id));

    // If teacher, filter by teacher's classes
    if (callerProfile.role === 'teacher') {
      eligible = eligible.filter((l) => isLessonWithinTeacherScope(callerProfile, l));
    }

    return json({ success: true, eligibleLessons: eligible });
  }

  return errorResponse('UNKNOWN_ACTION', `Hành động '${action}' không được hỗ trợ.`, 400);
});
