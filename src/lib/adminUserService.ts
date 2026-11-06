import { supabase } from '@/lib/supabase';
import type { User } from '@/types';

export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  role: 'teacher' | 'student';
  assignedClasses: string[];
  allowedSubjects: string[];
}

export interface CreateUserResponse {
  success: boolean;
  user?: User;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Invokes the 'admin-create-user' Edge Function using the currently logged-in Admin's JWT.
 * Creates both a Supabase Auth user and a public.app_users profile in a single transactional step.
 */
export async function adminCreateUser(input: CreateUserInput): Promise<CreateUserResponse> {
  if (!supabase) {
    return {
      success: false,
      error: {
        code: 'CLIENT_NOT_CONFIGURED',
        message: 'Dịch vụ kết nối cơ sở dữ liệu chưa sẵn sàng.',
      },
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (sessionError || !accessToken) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Phiên làm việc quản trị đã hết hạn. Vui lòng đăng nhập lại.',
      },
    };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke('admin-create-user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        username: input.username.trim().toLowerCase(),
        password: input.password,
        fullName: input.fullName.trim(),
        role: input.role,
        assignedClasses: input.assignedClasses,
        allowedSubjects: input.allowedSubjects,
      },
    });

    if (error) {
      let serverError: { code?: string; message?: string } | null = null;
      let status = 0;

      // Extract Response object from FunctionsHttpError context or invoke response
      const res: Response | undefined = (error && 'context' in error && error.context instanceof Response)
        ? error.context
        : (response instanceof Response ? response : undefined);

      if (res) {
        status = res.status;
        try {
          const errBody = await res.json();
          if (errBody?.error) serverError = errBody.error;
        } catch {
          // Response body was not JSON or already read
        }
      }

      // Map status codes if serverError didn't provide specific message
      let message = serverError?.message;
      const code = serverError?.code ?? (status ? `HTTP_${status}` : 'INVOKE_FAILED');

      if (!message) {
        if (status === 400) message = 'Dữ liệu yêu cầu không hợp lệ.';
        else if (status === 401) message = 'Phiên làm việc quản trị đã hết hạn hoặc không hợp lệ.';
        else if (status === 403) message = 'Bạn không có quyền thực hiện thao tác này.';
        else if (status === 409) message = 'Tên đăng nhập đã tồn tại trong hệ thống.';
        else if (status >= 500) message = 'Máy chủ gặp sự cố khi tạo tài khoản. Vui lòng thử lại sau.';
        else message = error.message || 'Không thể tạo tài khoản người dùng.';
      }

      return {
        success: false,
        error: { code, message: message || error.message || 'Không thể tạo tài khoản người dùng.' },
      };
    }

    if (!data?.success || !data?.user) {
      return {
        success: false,
        error: {
          code: data?.error?.code ?? 'UNKNOWN_ERROR',
          message: data?.error?.message ?? 'Tạo tài khoản không thành công.',
        },
      };
    }

    const createdProfile: User = {
      id: data.user.id,
      username: data.user.username,
      fullName: data.user.fullName,
      role: data.user.role,
      assignedClasses: data.user.assignedClasses ?? [],
      allowedSubjects: data.user.allowedSubjects ?? [],
    };

    return {
      success: true,
      user: createdProfile,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối mạng khi tạo tài khoản.',
      },
    };
  }
}

export interface ResetPasswordInput {
  appUserId: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    username: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Invokes the 'admin-reset-password' Edge Function using the currently logged-in Admin's JWT.
 * Securely updates the password directly in Supabase Auth without touching app_users.password.
 */
export async function adminResetUserPassword(input: ResetPasswordInput): Promise<ResetPasswordResponse> {
  if (!supabase) {
    return {
      success: false,
      error: {
        code: 'CLIENT_NOT_CONFIGURED',
        message: 'Dịch vụ kết nối cơ sở dữ liệu chưa sẵn sàng.',
      },
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (sessionError || !accessToken) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Phiên làm việc quản trị đã hết hạn. Vui lòng đăng nhập lại.',
      },
    };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke('admin-reset-password', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        appUserId: input.appUserId.trim(),
        newPassword: input.newPassword,
      },
    });

    if (error) {
      let serverError: { code?: string; message?: string } | null = null;
      let status = 0;

      const res: Response | undefined = (error && 'context' in error && error.context instanceof Response)
        ? error.context
        : (response instanceof Response ? response : undefined);

      if (res) {
        status = res.status;
        try {
          const errBody = await res.json();
          if (errBody?.error) serverError = errBody.error;
        } catch {
          // Response body was not JSON or already read
        }
      }

      let message = serverError?.message;
      const code = serverError?.code ?? (status ? `HTTP_${status}` : 'INVOKE_FAILED');

      if (!message) {
        if (serverError?.code === 'TARGET_ROLE_NOT_ALLOWED') {
          message = 'Bạn không được phép đặt lại mật khẩu cho loại tài khoản này.';
        } else if (serverError?.code === 'STUDENT_OUTSIDE_ASSIGNED_CLASSES') {
          message = 'Bạn chỉ có thể đặt lại mật khẩu cho học sinh thuộc lớp được phân công.';
        } else if (serverError?.code === 'SELF_PASSWORD_RESET_NOT_ALLOWED') {
          message = 'Không thể đặt lại mật khẩu của tài khoản đang đăng nhập bằng chức năng quản trị này.';
        } else if (status === 400) {
          message = 'Dữ liệu yêu cầu không hợp lệ.';
        } else if (status === 401) {
          message = 'Phiên làm việc quản trị đã hết hạn hoặc không hợp lệ.';
        } else if (status === 403) {
          message = 'Bạn không có quyền thực hiện thao tác này.';
        } else if (status === 404) {
          message = 'Không tìm thấy tài khoản người dùng.';
        } else if (status === 409) {
          message = 'Không thể đặt lại mật khẩu cho tài khoản này.';
        } else if (status >= 500) {
          message = 'Máy chủ gặp sự cố khi đặt lại mật khẩu. Vui lòng thử lại sau.';
        } else {
          message = error.message || 'Không thể cập nhật mật khẩu người dùng.';
        }
      }

      return {
        success: false,
        error: { code, message: message || error.message || 'Không thể cập nhật mật khẩu người dùng.' },
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: {
          code: data?.error?.code ?? 'UNKNOWN_ERROR',
          message: data?.error?.message ?? 'Đặt lại mật khẩu không thành công.',
        },
      };
    }

    return {
      success: true,
      message: data.message ?? 'Đã cập nhật mật khẩu thành công.',
      user: data.user,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối mạng khi đặt lại mật khẩu.',
      },
    };
  }
}

export interface BatchImportUserInput {
  rowNumber: number;
  fullName: string;
  username: string;
  password: string;
  role: 'teacher' | 'student';
  assignedClasses: string[];
  allowedSubjects: string[];
}

export interface BatchImportUserResult {
  rowNumber: number;
  username: string;
  status: 'created' | 'failed';
  user?: User;
  error?: {
    code: string;
    message: string;
  };
}

export interface BatchImportResponse {
  success: boolean;
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  results: BatchImportUserResult[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Gọi Edge Function import-users để nhập hàng loạt tài khoản.
 * Không ghi log password ra console.
 */
export async function adminImportUsersBatch(
  users: BatchImportUserInput[]
): Promise<BatchImportResponse> {
  if (!supabase) {
    return {
      success: false,
      summary: { total: users.length, created: 0, failed: users.length },
      results: [],
      error: {
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Hệ thống chưa kết nối cơ sở dữ liệu Supabase.',
      },
    };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke('import-users', {
      body: {
        users: users.map((u) => ({
          rowNumber: u.rowNumber,
          fullName: u.fullName,
          username: u.username,
          password: u.password,
          role: u.role,
          assignedClasses: u.assignedClasses,
          allowedSubjects: u.allowedSubjects,
        })),
      },
    });

    if (error) {
      let serverError: { code?: string; message?: string } | null = null;
      let status = 0;

      const res: Response | undefined =
        error && 'context' in error && error.context instanceof Response
          ? error.context
          : response instanceof Response
          ? response
          : undefined;

      if (res) {
        status = res.status;
        try {
          const errBody = await res.json();
          if (errBody?.error) serverError = errBody.error;
        } catch {
          // ignore
        }
      }

      let message = serverError?.message;
      const code = serverError?.code ?? (status ? `HTTP_${status}` : 'INVOKE_FAILED');

      if (!message) {
        if (status === 400) message = 'Dữ liệu danh sách import không hợp lệ.';
        else if (status === 401) message = 'Phiên làm việc đã hết hạn hoặc không hợp lệ.';
        else if (status === 403) message = 'Bạn không có quyền nhập danh sách tài khoản này.';
        else if (status === 413) message = 'Danh sách tài khoản quá lớn (tối đa 500 dòng).';
        else if (status >= 500) message = 'Máy chủ gặp sự cố khi nhập tài khoản. Vui lòng thử lại sau.';
        else message = error.message || 'Không thể nhập danh sách tài khoản.';
      }

      return {
        success: false,
        summary: { total: users.length, created: 0, failed: users.length },
        results: [],
        error: { code, message: message || error.message || 'Không thể nhập danh sách tài khoản.' },
      };
    }

    if (!data?.success) {
      return {
        success: false,
        summary: data?.summary ?? { total: users.length, created: 0, failed: users.length },
        results: data?.results ?? [],
        error: {
          code: data?.error?.code ?? 'UNKNOWN_ERROR',
          message: data?.error?.message ?? 'Nhập tài khoản không thành công.',
        },
      };
    }

    return {
      success: true,
      summary: data.summary,
      results: data.results,
    };
  } catch (err) {
    return {
      success: false,
      summary: { total: users.length, created: 0, failed: users.length },
      results: [],
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối khi gửi yêu cầu nhập tài khoản.',
      },
    };
  }
}

export interface FetchVisibleUsersResponse {
  success: boolean;
  users: User[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Invokes the 'list-visible-users' Edge Function using the authenticated caller's JWT.
 * Returns only the users that the caller (Admin or Teacher) is strictly authorized to view.
 */
export async function fetchVisibleUsers(): Promise<FetchVisibleUsersResponse> {
  if (!supabase) {
    return {
      success: false,
      users: [],
      error: {
        code: 'CLIENT_NOT_CONFIGURED',
        message: 'Dịch vụ kết nối cơ sở dữ liệu chưa sẵn sàng.',
      },
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (sessionError || !accessToken) {
    return {
      success: false,
      users: [],
      error: {
        code: 'UNAUTHORIZED',
        message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
      },
    };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke('list-visible-users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {},
    });

    if (error) {
      let serverError: { code?: string; message?: string } | null = null;
      let status = 0;

      const res: Response | undefined = (error && 'context' in error && error.context instanceof Response)
        ? error.context
        : (response instanceof Response ? response : undefined);

      if (res) {
        status = res.status;
        try {
          const errBody = await res.json();
          if (errBody?.error) serverError = errBody.error;
        } catch {
          // ignore
        }
      }

      let message = serverError?.message;
      const code = serverError?.code ?? (status ? `HTTP_${status}` : 'INVOKE_FAILED');

      if (!message) {
        if (status === 401) message = 'Phiên làm việc đã hết hạn hoặc không hợp lệ.';
        else if (status === 403) message = 'Bạn không có quyền truy cập danh sách người dùng.';
        else if (status >= 500) message = 'Máy chủ gặp sự cố khi tải danh sách người dùng.';
        else message = error.message || 'Không thể tải danh sách người dùng.';
      }

      return {
        success: false,
        users: [],
        error: { code, message: message || error.message || 'Không thể tải danh sách người dùng.' },
      };
    }

    if (!data?.success || !Array.isArray(data?.users)) {
      return {
        success: false,
        users: [],
        error: {
          code: data?.error?.code ?? 'UNKNOWN_ERROR',
          message: data?.error?.message ?? 'Không thể tải danh sách người dùng.',
        },
      };
    }

    const users: User[] = data.users.map((u: Record<string, unknown>) => ({
      id: String(u.id ?? ''),
      username: String(u.username ?? ''),
      fullName: String(u.fullName ?? ''),
      role: (u.role as 'admin' | 'teacher' | 'student') ?? 'student',
      assignedClasses: Array.isArray(u.assignedClasses) ? (u.assignedClasses as string[]) : [],
      allowedSubjects: Array.isArray(u.allowedSubjects) ? (u.allowedSubjects as string[]) : [],
      authUserId: typeof u.authUserId === 'string' ? u.authUserId : undefined,
    }));

    return {
      success: true,
      users,
    };
  } catch (err) {
    return {
      success: false,
      users: [],
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối khi tải danh sách người dùng.',
      },
    };
  }
}
