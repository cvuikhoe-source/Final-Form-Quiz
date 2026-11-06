// Edge Function: admin-reset-password
// Description: Securely resets password in Supabase Auth for an Auth-backed user.
// Admin can reset password for Teachers and Students.
// Teachers can only reset password for Students belonging to their assigned classes.
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

  // 2. Authorize caller — verify profile in public.app_users (admin or teacher)
  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

  if (
    callerProfileError ||
    !callerProfile ||
    callerProfile.auth_user_id !== callerAuthId ||
    (callerProfile.role !== 'admin' && callerProfile.role !== 'teacher')
  ) {
    return errorResponse('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403);
  }

  // 3. Parse and validate input body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Dữ liệu yêu cầu không đúng định dạng JSON.', 400);
  }

  const rawAppUserId = body.appUserId;
  const rawNewPassword = body.newPassword;

  // Validate appUserId
  if (typeof rawAppUserId !== 'string') {
    return errorResponse('INVALID_INPUT', 'Mã tài khoản không hợp lệ.', 400);
  }
  const appUserId = rawAppUserId.trim();
  if (!appUserId || appUserId.length > 100) {
    return errorResponse('INVALID_INPUT', 'Mã tài khoản không hợp lệ.', 400);
  }

  // Validate newPassword (8 to 128 chars, do NOT trim)
  if (typeof rawNewPassword !== 'string' || rawNewPassword.length < 8 || rawNewPassword.length > 128) {
    return errorResponse('INVALID_INPUT', 'Mật khẩu mới phải có độ dài từ 8 đến 128 ký tự.', 400);
  }
  const newPassword = rawNewPassword;

  // 4. Query target user from public.app_users
  const { data: targetUser, error: targetUserError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, role, assigned_classes, auth_user_id')
    .eq('id', appUserId)
    .maybeSingle();

  if (targetUserError) {
    return errorResponse('INTERNAL_ERROR', 'Không thể truy vấn thông tin người dùng.', 500);
  }

  if (!targetUser) {
    return errorResponse('USER_NOT_FOUND', 'Không tìm thấy tài khoản người dùng.', 404);
  }

  if (!targetUser.auth_user_id) {
    return errorResponse('LEGACY_USER', 'Tài khoản này chưa được chuyển sang Supabase Auth.', 409);
  }

  // Prevent self-password-reset via this administrative function
  if (targetUser.auth_user_id === callerAuthId) {
    return errorResponse(
      'SELF_PASSWORD_RESET_NOT_ALLOWED',
      'Không thể đặt lại mật khẩu của tài khoản đang đăng nhập bằng chức năng quản trị này.',
      409
    );
  }

  // 5. Enforce authorization rules
  if (callerProfile.role === 'admin') {
    // Admin can reset Teacher or Student, but cannot reset other Admins
    if (targetUser.role === 'admin') {
      return errorResponse('TARGET_ROLE_NOT_ALLOWED', 'Bạn không được phép đặt lại mật khẩu cho loại tài khoản này.', 403);
    }
  } else if (callerProfile.role === 'teacher') {
    // Teacher can ONLY reset Student accounts
    if (targetUser.role !== 'student') {
      return errorResponse('TARGET_ROLE_NOT_ALLOWED', 'Bạn không được phép đặt lại mật khẩu cho loại tài khoản này.', 403);
    }

    // Teacher must share at least one assigned class with the student
    const teacherClasses: string[] = Array.isArray(callerProfile.assigned_classes) ? callerProfile.assigned_classes : [];
    const studentClasses: string[] = Array.isArray(targetUser.assigned_classes) ? targetUser.assigned_classes : [];

    if (teacherClasses.length === 0 || studentClasses.length === 0) {
      return errorResponse('STUDENT_OUTSIDE_ASSIGNED_CLASSES', 'Bạn chỉ có thể đặt lại mật khẩu cho học sinh thuộc lớp được phân công.', 403);
    }

    const sharesClass = studentClasses.some((cls) => teacherClasses.includes(cls));
    if (!sharesClass) {
      return errorResponse('STUDENT_OUTSIDE_ASSIGNED_CLASSES', 'Bạn chỉ có thể đặt lại mật khẩu cho học sinh thuộc lớp được phân công.', 403);
    }
  }

  // 6. Update password in Supabase Auth
  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUser.auth_user_id,
    {
      password: newPassword,
    }
  );

  if (updateAuthError) {
    return errorResponse('AUTH_PASSWORD_UPDATE_FAILED', 'Không thể cập nhật mật khẩu. Vui lòng thử lại.', 500);
  }

  // 7. Standard success response
  return json({
    success: true,
    message: 'Đã cập nhật mật khẩu thành công.',
    user: {
      id: targetUser.id,
      username: targetUser.username,
    },
  }, 200);
});
