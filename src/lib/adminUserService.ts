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
