// Edge Function: import-users
// Description: Batch import Teacher/Student accounts into Supabase Auth & public.app_users
// Permissions:
//   - Admin: can import Teacher and Student
//   - Teacher: can only import Student belonging to teacher's assigned classes
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

interface UserInputItem {
  rowNumber?: number;
  fullName: unknown;
  username: unknown;
  password: unknown;
  role: unknown;
  assignedClasses: unknown;
  allowedSubjects: unknown;
}

interface ImportRowResult {
  rowNumber: number;
  username: string;
  status: 'created' | 'failed';
  user?: {
    id: string;
    username: string;
    fullName: string;
    role: 'teacher' | 'student';
    assignedClasses: string[];
    allowedSubjects: string[];
  };
  error?: {
    code: string;
    message: string;
  };
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
    .select('id, username, role, assigned_classes, auth_user_id')
    .eq('auth_user_id', callerAuthId)
    .maybeSingle();

  if (callerProfileError || !callerProfile) {
    return errorResponse('FORBIDDEN', 'Không tìm thấy hồ sơ người dùng hợp lệ.', 403);
  }

  const callerRole = callerProfile.role;
  if (callerRole !== 'admin' && callerRole !== 'teacher') {
    return errorResponse('FORBIDDEN', 'Chỉ Quản trị viên và Giáo viên mới có quyền nhập tài khoản.', 403);
  }

  const callerAssignedClasses = (callerProfile.assigned_classes as string[]) ?? [];

  // 3. Parse input body
  let body: { users?: UserInputItem[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Dữ liệu yêu cầu không đúng định dạng JSON.', 400);
  }

  const usersList = body.users;
  if (!Array.isArray(usersList) || usersList.length === 0) {
    return errorResponse('INVALID_INPUT', 'Danh sách người dùng cần nhập không được rỗng.', 400);
  }

  if (usersList.length > 500) {
    return errorResponse('PAYLOAD_TOO_LARGE', 'Mỗi lần nhập tối đa 500 tài khoản.', 413);
  }

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let failedCount = 0;

  // 4. Process each row sequentially or with small batches to avoid overloading Auth API
  for (let i = 0; i < usersList.length; i++) {
    const item = usersList[i];
    const rowNumber = typeof item.rowNumber === 'number' ? item.rowNumber : i + 2;

    const rawFullName = typeof item.fullName === 'string' ? item.fullName.trim() : '';
    const rawUsername = typeof item.username === 'string' ? item.username.trim().toLowerCase() : '';
    const rawPassword = typeof item.password === 'string' ? item.password : '';
    const rawRole = typeof item.role === 'string' ? item.role.trim().toLowerCase() : '';
    const assignedClasses = Array.isArray(item.assignedClasses)
      ? Array.from(new Set(item.assignedClasses.map((c) => String(c).trim()).filter(Boolean)))
      : [];
    const allowedSubjects = Array.isArray(item.allowedSubjects)
      ? Array.from(new Set(item.allowedSubjects.map((s) => String(s).trim()).filter(Boolean)))
      : [];

    // Validate fields
    if (!rawFullName || rawFullName.length > 120) {
      results.push({
        rowNumber,
        username: rawUsername || `row_${rowNumber}`,
        status: 'failed',
        error: { code: 'INVALID_NAME', message: 'Họ tên không được để trống và tối đa 120 ký tự.' },
      });
      failedCount++;
      continue;
    }

    if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 50 || rawUsername.includes('@') || !/^[a-z0-9._-]+$/.test(rawUsername)) {
      results.push({
        rowNumber,
        username: rawUsername || `row_${rowNumber}`,
        status: 'failed',
        error: { code: 'INVALID_USERNAME', message: 'Tên đăng nhập 3-50 ký tự, chỉ gồm a-z, 0-9, dấu chấm, gạch dưới, gạch ngang.' },
      });
      failedCount++;
      continue;
    }

    if (!rawPassword || rawPassword.length < 8 || rawPassword.length > 128) {
      results.push({
        rowNumber,
        username: rawUsername,
        status: 'failed',
        error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu phải từ 8 đến 128 ký tự.' },
      });
      failedCount++;
      continue;
    }

    if (rawRole !== 'student' && rawRole !== 'teacher') {
      results.push({
        rowNumber,
        username: rawUsername,
        status: 'failed',
        error: { code: 'INVALID_ROLE', message: 'Vai trò chỉ được là "student" hoặc "teacher".' },
      });
      failedCount++;
      continue;
    }

    // Role & permission check based on caller
    if (callerRole === 'teacher') {
      if (rawRole !== 'student') {
        results.push({
          rowNumber,
          username: rawUsername,
          status: 'failed',
          error: { code: 'FORBIDDEN_ROLE', message: 'Giáo viên chỉ được phép nhập tài khoản học sinh.' },
        });
        failedCount++;
        continue;
      }

      if (assignedClasses.length === 0) {
        results.push({
          rowNumber,
          username: rawUsername,
          status: 'failed',
          error: { code: 'CLASS_REQUIRED', message: 'Học sinh phải thuộc ít nhất một lớp được phân công cho giáo viên.' },
        });
        failedCount++;
        continue;
      }

      const notInTeacherClasses = assignedClasses.filter((cls) => !callerAssignedClasses.includes(cls));
      if (notInTeacherClasses.length > 0) {
        results.push({
          rowNumber,
          username: rawUsername,
          status: 'failed',
          error: { code: 'OUTSIDE_ASSIGNED_CLASSES', message: `Lớp "${notInTeacherClasses.join(', ')}" không thuộc phân công của bạn.` },
        });
        failedCount++;
        continue;
      }
    }

    // Check duplicate username in public.app_users
    const { data: existingAppUser } = await supabaseAdmin
      .from('app_users')
      .select('id')
      .eq('username', rawUsername)
      .maybeSingle();

    if (existingAppUser) {
      results.push({
        rowNumber,
        username: rawUsername,
        status: 'failed',
        error: { code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã tồn tại trong hệ thống.' },
      });
      failedCount++;
      continue;
    }

    // 5. Create Supabase Auth user
    const internalEmail = `${rawUsername}@quizforms.internal`;
    const { data: authCreated, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: rawPassword,
      email_confirm: true,
      user_metadata: {
        full_name: rawFullName,
        username: rawUsername,
        role: rawRole,
      },
    });

    if (authCreateError || !authCreated?.user) {
      const authMsg = authCreateError?.message ?? 'Không thể khởi tạo tài khoản Auth.';
      results.push({
        rowNumber,
        username: rawUsername,
        status: 'failed',
        error: { code: 'AUTH_CREATE_FAILED', message: authMsg },
      });
      failedCount++;
      continue;
    }

    const newAuthUserId = authCreated.user.id;
    const newAppUserId = generateAppUserId();

    // 6. Insert into public.app_users (password is null for Auth-backed user)
    const { error: profileInsertError } = await supabaseAdmin.from('app_users').insert({
      id: newAppUserId,
      username: rawUsername,
      password: null,
      full_name: rawFullName,
      role: rawRole,
      assigned_classes: assignedClasses,
      allowed_subjects: allowedSubjects,
      auth_user_id: newAuthUserId,
    });

    if (profileInsertError) {
      // Rollback: delete Auth user if app_users insertion fails
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId).catch(() => {});

      results.push({
        rowNumber,
        username: rawUsername,
        status: 'failed',
        error: { code: 'PROFILE_INSERT_FAILED', message: 'Lỗi ghi hồ sơ người dùng, đã hoàn tác tài khoản.' },
      });
      failedCount++;
      continue;
    }

    // Success for this row
    results.push({
      rowNumber,
      username: rawUsername,
      status: 'created',
      user: {
        id: newAppUserId,
        username: rawUsername,
        fullName: rawFullName,
        role: rawRole as 'teacher' | 'student',
        assignedClasses,
        allowedSubjects,
      },
    });
    createdCount++;
  }

  return json({
    success: true,
    summary: {
      total: usersList.length,
      created: createdCount,
      failed: failedCount,
    },
    results,
  });
});

