// Edge Function: admin-create-user
// Description: Securely creates a Supabase Auth user and corresponding app_users profile
// restricted strictly to callers with 'admin' role.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

function generateAppUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

  // 2. Authorize caller — verify 'admin' role in public.app_users
  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

  if (callerProfileError || !callerProfile || callerProfile.role !== 'admin' || callerProfile.auth_user_id !== callerAuthId) {
    return errorResponse('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403);
  }

  // 3. Parse and validate input body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Dữ liệu yêu cầu không đúng định dạng JSON.', 400);
  }

  const rawUsername = body.username;
  const rawPassword = body.password;
  const rawFullName = body.fullName;
  const rawRole = body.role;
  const rawAssignedClasses = body.assignedClasses;
  const rawAllowedSubjects = body.allowedSubjects;

  // Validate username
  if (typeof rawUsername !== 'string') {
    return errorResponse('INVALID_INPUT', 'Tên đăng nhập không hợp lệ.', 400);
  }
  const normalizedUsername = rawUsername.trim().toLowerCase();
  if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
    return errorResponse('INVALID_INPUT', 'Tên đăng nhập phải có từ 3 đến 50 ký tự.', 400);
  }
  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    return errorResponse('INVALID_INPUT', 'Tên đăng nhập chỉ được chứa chữ cái viết thường, số, dấu chấm, gạch dưới hoặc gạch ngang.', 400);
  }

  // Validate password (8 - 128 chars, do NOT trim)
  if (typeof rawPassword !== 'string' || rawPassword.length < 8 || rawPassword.length > 128) {
    return errorResponse('INVALID_INPUT', 'Mật khẩu phải có độ dài từ 8 đến 128 ký tự.', 400);
  }
  const password = rawPassword;

  // Validate fullName
  if (typeof rawFullName !== 'string') {
    return errorResponse('INVALID_INPUT', 'Họ và tên không hợp lệ.', 400);
  }
  const normalizedFullName = rawFullName.trim();
  if (!normalizedFullName || normalizedFullName.length > 120) {
    return errorResponse('INVALID_INPUT', 'Họ và tên không được để trống và tối đa 120 ký tự.', 400);
  }

  // Validate role — only 'teacher' or 'student'
  if (rawRole !== 'teacher' && rawRole !== 'student') {
    return errorResponse('INVALID_INPUT', 'Vai trò chỉ có thể là Giáo viên (teacher) hoặc Học sinh (student).', 400);
  }
  const role: 'teacher' | 'student' = rawRole;

  // Sanitize assignedClasses
  let assignedClasses: string[] = [];
  if (Array.isArray(rawAssignedClasses)) {
    const classSet = new Set<string>();
    for (const item of rawAssignedClasses) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed && trimmed.length <= 50) classSet.add(trimmed);
      }
    }
    assignedClasses = Array.from(classSet).slice(0, 50);
  }

  // Sanitize allowedSubjects
  let allowedSubjects: string[] = [];
  if (Array.isArray(rawAllowedSubjects)) {
    const subjectSet = new Set<string>();
    for (const item of rawAllowedSubjects) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed && trimmed.length <= 50) subjectSet.add(trimmed);
      }
    }
    allowedSubjects = Array.from(subjectSet).slice(0, 50);
  }

  // 4. Check duplicate username in app_users
  const { data: existingUser, error: checkUserError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, auth_user_id')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (checkUserError) {
    return errorResponse('INTERNAL_ERROR', 'Không thể kiểm tra tên đăng nhập. Vui lòng thử lại.', 500);
  }
  if (existingUser) {
    return errorResponse('USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại.', 409);
  }

  // 5. Create Supabase Auth user
  const internalEmail = `${normalizedUsername}@quizforms.internal`;

  const { data: authCreated, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username: normalizedUsername,
      full_name: normalizedFullName,
    },
  });

  if (createAuthError || !authCreated?.user) {
    const errMsg = createAuthError?.message?.toLowerCase() ?? '';
    if (errMsg.includes('already registered') || errMsg.includes('email already exists') || errMsg.includes('already taken')) {
      return errorResponse('USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại trong hệ thống xác thực.', 409);
    }
    return errorResponse('AUTH_CREATE_FAILED', 'Không thể tạo tài khoản xác thực. Vui lòng thử lại.', 500);
  }

  const authUserId = authCreated.user.id;
  const appUserId = generateAppUserId();

  // 6. Insert profile into public.app_users
  const { data: insertedProfile, error: profileInsertError } = await supabaseAdmin
    .from('app_users')
    .insert({
      id: appUserId,
      username: normalizedUsername,
      password: null,
      full_name: normalizedFullName,
      role,
      assigned_classes: assignedClasses,
      allowed_subjects: allowedSubjects,
      auth_user_id: authUserId,
      created_at: new Date().toISOString(),
    })
    .select('id, username, full_name, role, assigned_classes, allowed_subjects, auth_user_id')
    .single();

  // 7. Compensating rollback if profile creation fails
  if (profileInsertError || !insertedProfile) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return errorResponse('PROFILE_CREATE_FAILED', 'Không thể khởi tạo hồ sơ người dùng. Thao tác đã được hoàn tác.', 500);
    } catch {
      console.error('CRITICAL: Rollback failed for auth user:', authUserId, normalizedUsername);
      return errorResponse('INTERNAL_ERROR', 'Lỗi hệ thống khi khởi tạo hồ sơ người dùng. Vui lòng liên hệ quản trị viên.', 500);
    }
  }

  // 8. Return standard success response
  return json({
    success: true,
    user: {
      id: insertedProfile.id,
      username: insertedProfile.username,
      fullName: insertedProfile.full_name,
      role: insertedProfile.role,
      assignedClasses: insertedProfile.assigned_classes ?? [],
      allowedSubjects: insertedProfile.allowed_subjects ?? [],
    },
  }, 201);
});

