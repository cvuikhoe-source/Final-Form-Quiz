import * as XLSX from 'xlsx';

export interface ParsedUserRow {
  rowNumber: number;
  fullName: string;
  username: string;
  password: string; // Tạm giữ trong memory để gửi tới Edge Function, xóa ngay sau khi xong
  role: 'teacher' | 'student';
  assignedClasses: string[];
  allowedSubjects: string[];
  errors: string[];
  status: 'valid' | 'invalid';
}

export interface ImportResultRow {
  rowNumber: number;
  username: string;
  fullName: string;
  role: 'teacher' | 'student';
  status: 'created' | 'failed';
  message: string;
}

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

/**
 * Tạo và tải xuống file Excel mẫu (.xlsx)
 */
export function downloadUserExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Users
  const userHeaders = [
    'full_name',
    'username',
    'password',
    'role',
    'assigned_classes',
    'allowed_subjects',
  ];

  const sampleData = [
    userHeaders,
    ['Nguyễn Văn Mẫu', 'hs_mau01', 'Mau123456', 'student', '10A1', 'Toán;Lý'],
    ['Giáo viên Mẫu', 'gv_mau01', 'Mau123456', 'teacher', '10A1;10A2', 'Toán'],
  ];

  const wsUsers = XLSX.utils.aoa_to_sheet(sampleData);
  // Đặt độ rộng cột phù hợp
  wsUsers['!cols'] = [
    { wch: 25 }, // full_name
    { wch: 18 }, // username
    { wch: 18 }, // password
    { wch: 12 }, // role
    { wch: 25 }, // assigned_classes
    { wch: 25 }, // allowed_subjects
  ];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Users');

  // Sheet 2: Instructions
  const instructionsData = [
    ['HƯỚNG DẪN ĐIỀN DỮ LIỆU TÀI KHOẢN QUIZFORMS'],
    [''],
    ['Cột', 'Quy định', 'Ví dụ'],
    ['full_name', 'Họ và tên người dùng, tối đa 120 ký tự, không được để trống.', 'Nguyễn Văn An'],
    ['username', 'Tên đăng nhập (3-50 ký tự), chỉ gồm chữ thường a-z, 0-9, dấu chấm, gạch dưới, gạch ngang. Không chứa dấu @.', 'hs_10a1_an'],
    ['password', 'Mật khẩu khởi tạo ban đầu, độ dài từ 8 đến 128 ký tự.', 'Password123'],
    ['role', 'Vai trò người dùng: chỉ chấp nhận "student" hoặc "teacher". (Admin không được phép tạo từ file Excel).', 'student hoặc teacher'],
    ['assigned_classes', 'Danh sách lớp được phân công. Nhiều lớp cách nhau bởi dấu chấm phẩy (;). Tên lớp phải tồn tại trong hệ thống.', '10A1;10A2'],
    ['allowed_subjects', 'Danh sách môn học được phép. Nhiều môn cách nhau bởi dấu chấm phẩy (;). Tên môn phải tồn tại trong hệ thống.', 'Toán;Tiếng Anh'],
    [''],
    ['LƯU Ý QUAN TRỌNG:'],
    ['1. Hãy xóa 2 dòng mẫu trong sheet "Users" trước khi điền dữ liệu thật.'],
    ['2. Giáo viên chỉ được phép nhập học sinh (student) thuộc các lớp mà mình được phân công.'],
    ['3. Tên đăng nhập trong cùng file không được trùng nhau.'],
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 20 }, { wch: 80 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  XLSX.writeFile(wb, 'QuizForms_Mau_Nhap_Tai_Khoan.xlsx');
}

/**
 * Xuất file Excel báo cáo kết quả import
 */
export function exportUserImportResults(results: ImportResultRow[]): void {
  const wb = XLSX.utils.book_new();

  const headers = ['row_number', 'username', 'full_name', 'role', 'status', 'message'];
  const rows = results.map((r) => [
    r.rowNumber,
    r.username,
    r.fullName,
    r.role,
    r.status === 'created' ? 'Thành công' : 'Thất bại',
    r.message,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 18 },
    { wch: 25 },
    { wch: 12 },
    { wch: 15 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Results');

  XLSX.writeFile(wb, `QuizForms_Ket_Qua_Import_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const normalizeLookupValue = (value: string): string =>
  value.trim().normalize('NFC').toLocaleLowerCase('vi-VN');

export interface ValidationContext {
  callerRole: 'admin' | 'teacher';
  callerAssignedClasses: string[];
  validClasses: string[];
  validSubjects: string[];
  existingUsernames: Set<string>;
}

/**
 * Đọc file ArrayBuffer từ input và validate từng dòng
 */
export function parseAndValidateUserExcel(
  buffer: ArrayBuffer,
  ctx: ValidationContext
): { rows: ParsedUserRow[]; globalError?: string } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch {
    return { rows: [], globalError: 'Không thể đọc file Excel. Định dạng file có thể bị hỏng.' };
  }

  // Tìm sheet Users hoặc sheet đầu tiên không phải Instructions
  const sheetName = wb.SheetNames.includes('Users')
    ? 'Users'
    : wb.SheetNames.find((s) => s.toLowerCase() !== 'instructions') ?? wb.SheetNames[0];

  if (!sheetName) {
    return { rows: [], globalError: 'File Excel không có sheet nào hợp lệ.' };
  }

  const ws = wb.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (!rawData || rawData.length === 0) {
    return { rows: [], globalError: 'Sheet dữ liệu đang để trống.' };
  }

  // 1. Kiểm tra header
  const headerRow = rawData[0].map((c) => String(c).trim().toLowerCase().replace(/\s+/g, '_'));
  const requiredHeaders = [
    'full_name',
    'username',
    'password',
    'role',
    'assigned_classes',
    'allowed_subjects',
  ];

  const colIndices: Record<string, number> = {};
  for (const field of requiredHeaders) {
    const idx = headerRow.indexOf(field);
    if (idx === -1) {
      return {
        rows: [],
        globalError: `File Excel thiếu cột bắt buộc: "${field}". Vui lòng dùng đúng file mẫu.`,
      };
    }
    colIndices[field] = idx;
  }

  // Chuẩn hóa map lookup cho Classes và Subjects để so sánh an toàn
  const classLookup = new Map<string, string>();
  for (const c of ctx.validClasses) {
    const raw = typeof c === 'string' ? c : (c && typeof c === 'object' && 'name' in c) ? String((c as { name: unknown }).name) : '';
    const trimmed = raw.trim();
    const key = normalizeLookupValue(trimmed);
    if (key && !classLookup.has(key)) {
      classLookup.set(key, trimmed);
    }
  }

  const subjectLookup = new Map<string, string>();
  for (const s of ctx.validSubjects) {
    const raw = typeof s === 'string' ? s : (s && typeof s === 'object' && 'name' in s) ? String((s as { name: unknown }).name) : '';
    const trimmed = raw.trim();
    const key = normalizeLookupValue(trimmed);
    if (key && !subjectLookup.has(key)) {
      subjectLookup.set(key, trimmed);
    }
  }

  const parsedRows: ParsedUserRow[] = [];
  const fileUsernames = new Map<string, number>(); // username -> rowNumber đầu tiên xuất hiện

  // 2. Duyệt từng dòng dữ liệu (từ dòng index 1, tức dòng 2 trong Excel)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNumber = i + 1;

    // Kiểm tra dòng trống hoàn toàn
    const isAllEmpty = row.every((c) => String(c ?? '').trim() === '');
    if (isAllEmpty) continue;

    // Giới hạn tối đa 500 dòng
    if (parsedRows.length >= 500) {
      break;
    }

    const fullNameRaw = String(row[colIndices['full_name']] ?? '').trim();
    const usernameRaw = String(row[colIndices['username']] ?? '').trim();
    const passwordRaw = String(row[colIndices['password']] ?? ''); // Không trim mật khẩu
    const roleRaw = String(row[colIndices['role']] ?? '').trim().toLowerCase();
    const assignedClassesRaw = String(row[colIndices['assigned_classes']] ?? '').trim();
    const allowedSubjectsRaw = String(row[colIndices['allowed_subjects']] ?? '').trim();

    const normalizedUsername = usernameRaw.toLowerCase();

    // CHỈ BỎ QUA CHÍNH XÁC HAI USERNAME MẪU: hs_mau01 và gv_mau01
    if (normalizedUsername === 'hs_mau01' || normalizedUsername === 'gv_mau01') {
      continue;
    }

    const errors: string[] = [];

    // Họ và tên
    if (!fullNameRaw) {
      errors.push('Thiếu họ và tên.');
    } else if (fullNameRaw.length > 120) {
      errors.push('Họ và tên không được vượt quá 120 ký tự.');
    }

    // Username
    if (!normalizedUsername) {
      errors.push('Thiếu tên đăng nhập.');
    } else if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      errors.push('Tên đăng nhập phải từ 3 đến 50 ký tự.');
    } else if (normalizedUsername.includes('@')) {
      errors.push('Tên đăng nhập không được chứa ký tự @.');
    } else if (!USERNAME_REGEX.test(normalizedUsername)) {
      errors.push('Tên đăng nhập chỉ chứa chữ cái thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    } else if (fileUsernames.has(normalizedUsername)) {
      errors.push(`Tên đăng nhập bị trùng với dòng ${fileUsernames.get(normalizedUsername)} trong file.`);
    } else if (ctx.existingUsernames.has(normalizedUsername)) {
      errors.push('Tên đăng nhập đã tồn tại trong hệ thống.');
    } else {
      fileUsernames.set(normalizedUsername, rowNumber);
    }

    // Password
    if (!passwordRaw) {
      errors.push('Thiếu mật khẩu.');
    } else if (passwordRaw.length < 8) {
      errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
    } else if (passwordRaw.length > 128) {
      errors.push('Mật khẩu không được vượt quá 128 ký tự.');
    }

    // Role
    let role: 'teacher' | 'student' = 'student';
    if (roleRaw !== 'student' && roleRaw !== 'teacher') {
      errors.push('Vai trò chỉ được là "student" hoặc "teacher".');
    } else {
      role = roleRaw;
    }

    // Phân quyền theo người gọi (Caller permission)
    if (ctx.callerRole === 'teacher') {
      if (role !== 'student') {
        errors.push('Giáo viên chỉ được phép nhập tài khoản học sinh (student).');
      }
    }

    // Parse classes bằng dấu ;
    const rawClasses = assignedClassesRaw
      ? Array.from(new Set(assignedClassesRaw.split(';').map((s) => s.trim()).filter(Boolean)))
      : [];

    const validAssignedClasses: string[] = [];
    for (const rawCls of rawClasses) {
      const matched = classLookup.get(normalizeLookupValue(rawCls));
      if (!matched) {
        errors.push(`Lớp "${rawCls}" không tồn tại trong hệ thống.`);
      } else {
        validAssignedClasses.push(matched);
      }
    }

    // Kiểm tra Teacher chỉ import học sinh thuộc lớp phụ trách
    if (ctx.callerRole === 'teacher') {
      if (rawClasses.length === 0) {
        errors.push('Học sinh phải thuộc ít nhất một lớp mà bạn được phân công.');
      } else {
        const callerClassesNormalized = new Set(
          ctx.callerAssignedClasses.map(normalizeLookupValue)
        );
        const notAssigned = rawClasses.filter(
          (cls) => !callerClassesNormalized.has(normalizeLookupValue(cls))
        );
        if (notAssigned.length > 0) {
          errors.push(`Lớp "${notAssigned.join(', ')}" không thuộc phạm vi bạn được phân công.`);
        }
      }
    }

    // Parse subjects bằng dấu ;
    const rawSubjects = allowedSubjectsRaw
      ? Array.from(new Set(allowedSubjectsRaw.split(';').map((s) => s.trim()).filter(Boolean)))
      : [];

    const validAllowedSubjects: string[] = [];
    for (const rawSub of rawSubjects) {
      const matched = subjectLookup.get(normalizeLookupValue(rawSub));
      if (!matched) {
        errors.push(`Môn "${rawSub}" không tồn tại trong hệ thống.`);
      } else {
        validAllowedSubjects.push(matched);
      }
    }

    parsedRows.push({
      rowNumber,
      fullName: fullNameRaw,
      username: normalizedUsername,
      password: passwordRaw,
      role,
      assignedClasses: validAssignedClasses.length > 0 ? validAssignedClasses : rawClasses,
      allowedSubjects: validAllowedSubjects.length > 0 ? validAllowedSubjects : rawSubjects,
      errors,
      status: errors.length === 0 ? 'valid' : 'invalid',
    });
  }

  return { rows: parsedRows };
}

