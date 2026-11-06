// Edge Function: list-visible-users
// Description: Returns the list of users visible to the authenticated caller based on strict RBAC rules.
// - Admin callers: can see all Teachers and Students (excluding caller profile).
// - Teacher callers: can ONLY see Students assigned to at least one class the Teacher is assigned to.
// - Student callers: 403 Forbidden.
// Sensitive fields (e.g. password) are strictly omitted.

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

  // 2. Authorize caller — verify profile in public.app_users
  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, full_name, role, assigned_classes, allowed_subjects, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

  if (callerProfileError || !callerProfile || callerProfile.auth_user_id !== callerAuthId) {
    return errorResponse('PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ người dùng hợp lệ.', 403);
  }

  // 3. Disallow Student or unknown roles from listing users
  if (callerProfile.role !== 'admin' && callerProfile.role !== 'teacher') {
    return errorResponse('FORBIDDEN', 'Bạn không có quyền truy cập danh sách người dùng.', 403);
  }

  // 4. Admin caller: see all Teachers and Students
  if (callerProfile.role === 'admin') {
    const { data: rawUsers, error: queryError } = await supabaseAdmin
      .from('app_users')
      .select('id, username, full_name, role, assigned_classes, allowed_subjects, auth_user_id')
      .in('role', ['teacher', 'student'])
      .neq('id', callerProfile.id)
      .order('role', { ascending: false }) // 'teacher' then 'student'
      .order('created_at', { ascending: true });

    if (queryError) {
      return errorResponse('INTERNAL_ERROR', 'Không thể truy vấn danh sách người dùng.', 500);
    }

    const users = (rawUsers ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      role: u.role,
      assignedClasses: Array.isArray(u.assigned_classes) ? u.assigned_classes : [],
      allowedSubjects: Array.isArray(u.allowed_subjects) ? u.allowed_subjects : [],
      authUserId: u.auth_user_id ?? undefined,
    }));

    return json({
      success: true,
      users,
    });
  }

  // 5. Teacher caller: strictly see ONLY students sharing at least one assigned class
  const callerClasses: string[] = Array.isArray(callerProfile.assigned_classes)
    ? callerProfile.assigned_classes
    : [];

  // If teacher has no assigned classes, return empty list immediately
  if (callerClasses.length === 0) {
    return json({
      success: true,
      users: [],
    });
  }

  // Query student accounts from database
  const { data: rawStudents, error: queryError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, full_name, role, assigned_classes, allowed_subjects, auth_user_id')
    .eq('role', 'student')
    .overlaps('assigned_classes', callerClasses)
    .order('created_at', { ascending: true });

  if (queryError) {
    return errorResponse('INTERNAL_ERROR', 'Không thể truy vấn danh sách người dùng.', 500);
  }

  const callerClassesNormalized = new Set(
    callerClasses.map((c) => String(c).trim().normalize('NFC').toLocaleLowerCase('vi-VN'))
  );

  // Server-side strict filter guarantee: student must share at least one assigned class
  const filteredStudents = (rawStudents ?? []).filter((s) => {
    if (!Array.isArray(s.assigned_classes) || s.assigned_classes.length === 0) {
      return false;
    }
    return s.assigned_classes.some((cls: unknown) =>
      callerClassesNormalized.has(String(cls).trim().normalize('NFC').toLocaleLowerCase('vi-VN'))
    );
  });

  const users = filteredStudents.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    assignedClasses: Array.isArray(u.assigned_classes) ? u.assigned_classes : [],
    allowedSubjects: Array.isArray(u.allowed_subjects) ? u.allowed_subjects : [],
    authUserId: u.auth_user_id ?? undefined,
  }));

  return json({
    success: true,
    users,
  });
});

