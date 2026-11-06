import { useState, useMemo, useEffect } from 'react';
import type { User, Role } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { loadClasses, addClass, loadSubjects, addSubject, updateSubject, removeSubject, normalizeSubjectName, checkSubjectUsage, getSubjectMeta } from '@/storage';
import { adminCreateUser, adminResetUserPassword } from '@/lib/adminUserService';
import { toast } from './Toast';
import { ClassBadge } from './shared';
import { UserExcelImportModal } from './UserExcelImportModal';
import { Edit2, Trash2, Search, X, UserPlus, Inbox, GraduationCap, KeyRound, PlusCircle, Check, BookOpen, AlertTriangle, Shield, Users as UsersIcon, Loader2, FileSpreadsheet } from 'lucide-react';

interface UserManagementViewProps {
  users: User[];
  currentUser: User;
  onCreate: (user: Omit<User, 'id'>) => void;
  onUserCreated?: (user: User) => void;
  onUpdate: (id: string, updates: Partial<User>) => Promise<void> | void;
  onDelete: (id: string) => void;
}

export function UserManagementView({ users, currentUser, onCreate, onUserCreated, onUpdate, onDelete }: UserManagementViewProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<User | null>(null);

  const isAdmin = currentUser.role === 'admin';

  const filtered = useMemo(() => {
    return users.filter((u) => {
      // 1. Không hiển thị chính tài khoản đang đăng nhập trong danh sách quản lý
      if (u.id === currentUser.id) return false;

      if (!isAdmin) {
        // 2. Giáo viên chỉ nhìn thấy Học sinh
        if (u.role !== 'student') return false;

        // 3. Học sinh phải thuộc ít nhất một lớp mà Giáo viên phụ trách
        const teacherClasses = currentUser.assignedClasses ?? [];
        const studentClasses = u.assignedClasses ?? [];
        if (teacherClasses.length === 0 || studentClasses.length === 0) return false;

        const hasCommonClass = studentClasses.some((cls) => teacherClasses.includes(cls));
        if (!hasCommonClass) return false;
      }

      const matchesSearch =
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === 'all' || u.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, search, filterRole, currentUser, isAdmin]);

  const roleLabel = (role: Role) => role === 'admin' ? t('profile.role.admin') : role === 'teacher' ? t('profile.role.teacher') : t('profile.role.student');
  const roleColor = (role: Role) => role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'teacher' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  const shouldShowPasswordButton = (target: User): boolean => {
    // 1. Cannot reset own password via this admin function
    if (target.id === currentUser.id) return false;

    // 2. Admin caller: can reset Teacher and Student, but not other Admins
    if (currentUser.role === 'admin') {
      return target.role !== 'admin';
    }

    // 3. Teacher caller: always display for all Students; hide for Admin and other Teachers
    if (currentUser.role === 'teacher') {
      return target.role === 'student';
    }

    return false;
  };

  const handlePasswordClick = (user: User) => {
    // 1. Prevent self-reset
    if (user.id === currentUser.id) {
      toast('Không thể đặt lại mật khẩu của tài khoản đang đăng nhập bằng chức năng này.', 'error');
      return;
    }

    // 2. Admin caller checks
    if (currentUser.role === 'admin') {
      if (user.role === 'admin') {
        toast('Bạn không được phép đặt lại mật khẩu cho tài khoản quản trị viên khác.', 'error');
        return;
      }
    }

    // 3. Teacher caller checks
    if (currentUser.role === 'teacher') {
      if (user.role !== 'student') {
        toast('Bạn không được phép đặt lại mật khẩu cho loại tài khoản này.', 'error');
        return;
      }

      const teacherClasses = currentUser.assignedClasses ?? [];
      const studentClasses = user.assignedClasses ?? [];
      const hasCommonClass =
        teacherClasses.length > 0 &&
        studentClasses.length > 0 &&
        studentClasses.some((cls) => teacherClasses.includes(cls));

      if (!hasCommonClass) {
        toast('Bạn chỉ có thể đặt lại mật khẩu cho học sinh thuộc lớp được phân công.', 'error');
        return;
      }
    }

    // 4. Dispatch to Auth modal or legacy reset
    const isAuthUser = Boolean(user.authUserId || user.role === 'admin' || user.role === 'teacher' || !user.password);
    if (isAuthUser) {
      setResetPasswordTarget(user);
      return;
    }

    // Legacy user reset
    const np = prompt(`[Tài khoản legacy] Nhập mật khẩu mới cho ${user.fullName}:`);
    if (np && np.trim()) {
      onUpdate(user.id, { password: np.trim() });
      toast(t('users.toastPasswordReset'), 'success');
    }
  };

  const handleCreatedSuccess = (newUser: User) => {
    if (onUserCreated) {
      onUserCreated(newUser);
    } else {
      onCreate(newUser);
    }
  };

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('users.title')}</h2>
          <p className="text-sm text-slate-500">{t('users.count', { count: filtered.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExcelImport(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all active:scale-[0.98] hover:bg-slate-50"
          >
            <FileSpreadsheet size={18} className="text-emerald-600" /> Nhập Excel
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-blue-700">
            <UserPlus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-3 flex gap-2">
          {([
            { v: 'all', l: t('common.all') },
            { v: 'teacher', l: t('users.filterTeacher') },
            { v: 'student', l: t('users.filterStudent') },
          ] as { v: Role | 'all'; l: string }[]).map((opt) => (
            <button key={opt.v} onClick={() => setFilterRole(opt.v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${filterRole === opt.v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {opt.l}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {filtered.map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : user.role === 'teacher' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    {user.role === 'admin' ? <Shield size={20} /> : user.role === 'teacher' ? <UsersIcon size={20} /> : <GraduationCap size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{user.fullName}</p>
                    <p className="text-xs text-slate-400">@{user.username}</p>
                  </div>
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${roleColor(user.role)}`}>{roleLabel(user.role)}</span>
              </div>

              {(user.role === 'student' || user.role === 'teacher') && (
                <div className="mb-3 space-y-1.5">
                  <div><ClassBadge classes={user.assignedClasses} /></div>
                  {user.allowedSubjects && user.allowedSubjects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {user.allowedSubjects.map((s) => {
                        const meta = getSubjectMeta(s);
                        return <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.text}`}>{s}</span>;
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setEditingUser(user)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Edit2 size={14} /> {t('common.edit')}
                </button>
                {shouldShowPasswordButton(user) && (
                  <button onClick={() => handlePasswordClick(user)}
                    className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                    <KeyRound size={14} /> {t('users.password')}
                  </button>
                )}
                <button onClick={() => setDeleteTarget(user)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={48} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('users.empty')}</p>
        </div>
      )}

      {showCreate && (
        <UserCreateModal
          isAdmin={isAdmin}
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreatedSuccess}
          existingUsernames={users.map((u) => u.username.toLowerCase())}
        />
      )}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          isAdmin={isAdmin}
          onClose={() => setEditingUser(null)}
          onSave={async (updates) => {
            await onUpdate(editingUser.id, updates);
            setEditingUser(null);
            toast(t('users.toastUpdated'), 'success');
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal student={deleteTarget} onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); toast(t('users.toastDeleted'), 'info'); }} />
      )}
      {resetPasswordTarget && (
        <UserResetPasswordModal
          user={resetPasswordTarget}
          onClose={() => setResetPasswordTarget(null)}
          onSuccess={() => setResetPasswordTarget(null)}
        />
      )}
      {showExcelImport && (
        <UserExcelImportModal
          currentUser={currentUser}
          existingUsers={users}
          onClose={() => setShowExcelImport(false)}
          onSuccess={(newUsers) => {
            newUsers.forEach((u) => {
              if (onUserCreated) {
                onUserCreated(u);
              } else {
                onCreate(u);
              }
            });
          }}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({ student, onCancel, onConfirm }: { student: User; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in px-5" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100"><AlertTriangle size={24} className="text-red-600" /></div>
        <h3 className="text-base font-bold text-slate-800">{t('users.deleteTitle')}</h3>
        <p className="mt-1.5 text-sm text-slate-500">{t('users.deleteBody', { name: student.fullName, username: student.username })}</p>
        <p className="mt-1 text-xs text-slate-400">{t('users.deleteIrreversible')}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-red-700">{t('common.delete')}</button>
        </div>
      </div>
    </div>
  );
}

interface SubjectSelectorProps {
  role: Role;
  subjects: string[];
  allowedSubjects: string[];
  isAdmin: boolean;
  submitting: boolean;
  onToggleSubject: (sub: string) => void;
  onSubjectsChange: (updated: string[]) => void;
  onSubjectAutoSelect?: (sub: string) => void;
  onSubjectRenamed?: (oldName: string, newName: string) => void;
  onSubjectDeleted?: (deleted: string) => void;
}

function SubjectSelector({
  role,
  subjects,
  allowedSubjects,
  isAdmin,
  submitting,
  onToggleSubject,
  onSubjectsChange,
  onSubjectAutoSelect,
  onSubjectRenamed,
  onSubjectDeleted,
}: SubjectSelectorProps) {
  const { t } = useLanguage();
  const [showSubjectInput, setShowSubjectInput] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectError, setSubjectError] = useState('');

  const [renamingSubject, setRenamingSubject] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingLoading, setRenamingLoading] = useState(false);
  const [renameError, setRenameError] = useState('');

  const handleAddSubject = async () => {
    const trimmed = newSubject.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setSubjectError('Tên môn học không được để trống.');
      return;
    }

    const normalized = normalizeSubjectName(trimmed);
    const isDuplicate = subjects.some((s) => normalizeSubjectName(s) === normalized);
    if (isDuplicate) {
      setSubjectError('Môn học này đã tồn tại.');
      toast('Môn học này đã tồn tại.', 'error');
      return;
    }

    if (addingSubject) return;
    setAddingSubject(true);
    setSubjectError('');

    try {
      const updated = await addSubject(trimmed);
      onSubjectsChange(updated);
      if (onSubjectAutoSelect) {
        onSubjectAutoSelect(trimmed);
      }
      setNewSubject('');
      setShowSubjectInput(false);
      toast(`Đã thêm môn học "${trimmed}".`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi thêm môn học.';
      setSubjectError(msg);
      toast(msg, 'error');
    } finally {
      setAddingSubject(false);
    }
  };

  const handleSaveRename = async () => {
    if (!renamingSubject) return;
    const cleanNew = renameValue.trim().replace(/\s+/g, ' ');
    if (!cleanNew) {
      setRenameError('Tên môn học không được để trống.');
      return;
    }

    const normalizedNew = normalizeSubjectName(cleanNew);
    const normalizedOld = normalizeSubjectName(renamingSubject);

    if (normalizedNew !== normalizedOld) {
      const isDuplicate = subjects.some((s) => normalizeSubjectName(s) === normalizedNew);
      if (isDuplicate) {
        setRenameError('Môn học này đã tồn tại.');
        toast('Môn học này đã tồn tại.', 'error');
        return;
      }
    }

    if (renamingLoading) return;
    setRenamingLoading(true);
    setRenameError('');

    try {
      const updated = await updateSubject(renamingSubject, cleanNew);
      onSubjectsChange(updated);
      if (onSubjectRenamed) {
        onSubjectRenamed(renamingSubject, cleanNew);
      }
      setRenamingSubject(null);
      setRenameValue('');
      toast(`Đã đổi tên môn thành "${cleanNew}".`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi đổi tên môn học.';
      setRenameError(msg);
      toast(msg, 'error');
    } finally {
      setRenamingLoading(false);
    }
  };

  const handleDeleteSubject = async (sub: string) => {
    try {
      const usage = await checkSubjectUsage(sub);
      if (usage.inUse) {
        toast(
          `Không thể xóa môn "${sub}": Hiện có ${usage.userCount} tài khoản đang được gán môn này. Vui lòng gỡ liên kết trước khi xóa.`,
          'error'
        );
        return;
      }

      if (!window.confirm(`Bạn có chắc chắn muốn xóa môn học "${sub}"?`)) {
        return;
      }

      const updated = await removeSubject(sub);
      onSubjectsChange(updated);
      if (onSubjectDeleted) {
        onSubjectDeleted(sub);
      }
      toast(`Đã xóa môn học "${sub}".`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa môn học.';
      toast(msg, 'error');
    }
  };

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <BookOpen size={15} /> {role === 'teacher' ? 'Môn học được phép' : t('users.subjectsLabel')}
      </label>
      <p className="mb-2 text-xs text-slate-400">
        {role === 'teacher' ? 'Chọn các môn học giáo viên được phép giảng dạy và quản lý' : t('users.subjectsHint')}
      </p>

      {subjects.length === 0 ? (
        <p className="py-1 text-xs italic text-slate-400">Chưa có môn học nào.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {subjects.map((sub) => {
            const active = allowedSubjects.includes(sub);
            const isEditing = renamingSubject === sub;

            if (isEditing) {
              return (
                <div key={sub} className="flex items-center gap-1 rounded-lg border border-blue-400 bg-white p-1 shadow-sm">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => {
                      setRenameValue(e.target.value);
                      setRenameError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename();
                      if (e.key === 'Escape') setRenamingSubject(null);
                    }}
                    className="w-24 rounded border border-slate-200 px-2 py-0.5 text-xs outline-none focus:border-blue-500 sm:w-32"
                    autoFocus
                    disabled={renamingLoading}
                  />
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    disabled={renamingLoading}
                    className="rounded bg-blue-600 p-1 text-white hover:bg-blue-700 disabled:opacity-50"
                    title="Lưu"
                  >
                    {renamingLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingSubject(null)}
                    disabled={renamingLoading}
                    className="rounded bg-slate-100 p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                    title="Hủy"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={sub}
                className={`inline-flex items-center rounded-lg border transition-all ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleSubject(sub)}
                  disabled={submitting}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sub}
                </button>
                {isAdmin && (
                  <div className="flex items-center border-l border-slate-200/80 pl-0.5 pr-1">
                    <button
                      type="button"
                      title="Đổi tên môn học"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingSubject(sub);
                        setRenameValue(sub);
                        setRenameError('');
                      }}
                      disabled={submitting}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-blue-600 active:scale-95"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      type="button"
                      title="Xóa môn học"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSubject(sub);
                      }}
                      disabled={submitting}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600 active:scale-95"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {renameError && (
        <p className="mt-1 text-xs font-medium text-rose-500">{renameError}</p>
      )}

      {isAdmin && (
        <>
          {showSubjectInput ? (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => {
                    setNewSubject(e.target.value);
                    setSubjectError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSubject()}
                  placeholder="Nhập tên môn học mới..."
                  disabled={addingSubject || submitting}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddSubject}
                  disabled={addingSubject || submitting}
                  className="flex min-w-[40px] items-center justify-center rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-50"
                  title="Thêm"
                >
                  {addingSubject ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubjectInput(false);
                    setNewSubject('');
                    setSubjectError('');
                  }}
                  disabled={addingSubject || submitting}
                  className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                  title="Hủy"
                >
                  <X size={18} />
                </button>
              </div>
              {subjectError && (
                <p className="pl-1 text-xs font-medium text-rose-500">{subjectError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowSubjectInput(true);
                setSubjectError('');
              }}
              disabled={submitting}
              className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <PlusCircle size={14} /> Thêm môn học mới
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface UserCreateModalProps {
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: (newUser: User) => void;
  existingUsernames: string[];
}

function UserCreateModal({ isAdmin, onClose, onSuccess, existingUsernames }: UserCreateModalProps) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [allowedSubjects, setAllowedSubjects] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newClass, setNewClass] = useState('');
  const [showClassInput, setShowClassInput] = useState(false);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadSubjects().then(setSubjects);
  }, []);

  const toggleClass = (cls: string) => setAssignedClasses((prev) => prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]);
  const toggleSubject = (sub: string) => setAllowedSubjects((prev) => prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]);

  const handleAddClass = async () => {
    const trimmed = newClass.trim();
    if (!trimmed) return;
    const updated = await addClass(trimmed);
    setClasses(updated);
    setAssignedClasses((prev) => [...prev, trimmed]);
    setNewClass('');
    setShowClassInput(false);
    toast(t('users.classAdded', { name: trimmed }), 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const newErrors: Record<string, string> = {};
    const trimmedFullName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();

    if (!trimmedFullName) {
      newErrors.fullName = t('users.errNameRequired');
    } else if (trimmedFullName.length > 120) {
      newErrors.fullName = 'Họ và tên tối đa 120 ký tự.';
    }

    if (!normalizedUsername) {
      newErrors.username = t('users.errUsernameRequired');
    } else if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      newErrors.username = 'Tên đăng nhập phải có từ 3 đến 50 ký tự.';
    } else if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      newErrors.username = 'Chỉ dùng chữ cái viết thường, số, dấu chấm (.), gạch dưới (_) hoặc gạch ngang (-).';
    } else if (existingUsernames.includes(normalizedUsername)) {
      newErrors.username = t('users.errUsernameExists');
    }

    if (!password) {
      newErrors.password = t('users.errPasswordRequired');
    } else if (password.length < 8 || password.length > 128) {
      newErrors.password = 'Mật khẩu phải có độ dài từ 8 đến 128 ký tự.';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const result = await adminCreateUser({
        fullName: trimmedFullName,
        username: normalizedUsername,
        password,
        role,
        assignedClasses,
        allowedSubjects,
      });

      if (!result.success || !result.user) {
        const errorMsg = result.error?.message ?? 'Tạo tài khoản không thành công.';
        setErrors({ general: errorMsg });
        toast(errorMsg, 'error');
        setSubmitting(false);
        return;
      }

      // Success
      setPassword('');
      setConfirmPassword('');
      toast(`Tạo tài khoản ${result.user.fullName} thành công!`, 'success');
      onSuccess(result.user);
      onClose();
    } catch {
      const errorMsg = 'Lỗi hệ thống khi tạo tài khoản. Vui lòng thử lại.';
      setErrors({ general: errorMsg });
      toast(errorMsg, 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{t('users.formTitleAdd')}</h3>
          <button onClick={onClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.fullNameLabel')}</label>
            <input type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setErrors((prev) => ({ ...prev, fullName: '', general: '' })); }}
              placeholder={t('users.fullNamePlaceholder')} disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.fullName ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.usernameLabel')}</label>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setErrors((prev) => ({ ...prev, username: '', general: '' })); }}
              placeholder={t('users.usernamePlaceholder')} autoComplete="off" disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.username ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.passwordLabel')}</label>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: '', general: '' })); }}
              placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.password ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Xác nhận mật khẩu</label>
            <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: '', general: '' })); }}
              placeholder="Nhập lại mật khẩu" autoComplete="new-password" disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.confirmPassword ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
          </div>

          {/* Role selection — teacher or student only */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.roleLabel')}</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRole('student')} disabled={submitting}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'student' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                {t('profile.role.student')}
              </button>
              {isAdmin && (
                <button type="button" onClick={() => setRole('teacher')} disabled={submitting}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'teacher' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                  {t('users.filterTeacher')}
                </button>
              )}
            </div>
          </div>

          {(role === 'student' || role === 'teacher') && (
            <>
              <SubjectSelector
                role={role}
                subjects={subjects}
                allowedSubjects={allowedSubjects}
                isAdmin={isAdmin}
                submitting={submitting}
                onToggleSubject={toggleSubject}
                onSubjectsChange={setSubjects}
                onSubjectAutoSelect={(sub) => setAllowedSubjects((prev) => [...prev, sub])}
                onSubjectRenamed={(oldName, newName) => {
                  setAllowedSubjects((prev) => prev.map((s) => (s === oldName ? newName : s)));
                }}
                onSubjectDeleted={(deleted) => {
                  setAllowedSubjects((prev) => prev.filter((s) => s !== deleted));
                }}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {role === 'teacher' ? 'Lớp được phân công' : t('users.classesLabel')}
                </label>
                <p className="mb-2 text-xs text-slate-400">
                  {role === 'teacher' ? 'Chọn các lớp giáo viên được phân công phụ trách' : t('users.classesHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => (
                    <button type="button" key={cls} onClick={() => toggleClass(cls)} disabled={submitting}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${assignedClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {cls}
                    </button>
                  ))}
                </div>
                {showClassInput ? (
                  <div className="mt-2 flex gap-1.5">
                    <input type="text" value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                      placeholder={t('users.newClassPlaceholder')} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" autoFocus />
                    <button type="button" onClick={handleAddClass} className="rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700"><Check size={18} /></button>
                    <button type="button" onClick={() => { setShowClassInput(false); setNewClass(''); }} className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowClassInput(true)} disabled={submitting}
                    className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50">
                    <PlusCircle size={14} /> {t('users.addClass')}
                  </button>
                )}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50">
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang tạo tài khoản...</span>
                </>
              ) : (
                <span>{t('common.add')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface UserEditModalProps {
  user: User;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (updates: Partial<User>) => Promise<void> | void;
}

function UserEditModal({ user, isAdmin, onClose, onSave }: UserEditModalProps) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<Role>(user.role);
  const [assignedClasses, setAssignedClasses] = useState<string[]>(() =>
    Array.isArray(user.assignedClasses) ? [...user.assignedClasses] : []
  );
  const [allowedSubjects, setAllowedSubjects] = useState<string[]>(() =>
    Array.isArray(user.allowedSubjects) ? [...user.allowedSubjects] : []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newClass, setNewClass] = useState('');
  const [showClassInput, setShowClassInput] = useState(false);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadSubjects().then(setSubjects);
  }, []);

  const toggleClass = (cls: string) => {
    setAssignedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleSubject = (sub: string) => {
    setAllowedSubjects((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const handleAddClass = async () => {
    const trimmed = newClass.trim();
    if (!trimmed) return;
    const updated = await addClass(trimmed);
    setClasses(updated);
    setAssignedClasses((prev) => [...prev, trimmed]);
    setNewClass('');
    setShowClassInput(false);
    toast(t('users.classAdded', { name: trimmed }), 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = t('users.errNameRequired');
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await onSave({
        fullName: fullName.trim(),
        role,
        assignedClasses: role === 'admin' ? [] : assignedClasses,
        allowedSubjects: role === 'admin' ? [] : allowedSubjects,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi khi lưu thay đổi người dùng.';
      setErrors({ general: errorMsg });
      toast(errorMsg, 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={submitting ? undefined : onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{t('users.formTitleEdit')}</h3>
          <button onClick={onClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.fullNameLabel')}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('users.fullNamePlaceholder')}
              disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.fullName ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`}
            />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.usernameLabel')}</label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-500 outline-none cursor-not-allowed"
            />
          </div>

          {/* Role selection in Edit */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.roleLabel')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('student')}
                disabled={submitting}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'student' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {t('profile.role.student')}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setRole('teacher')}
                  disabled={submitting}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'teacher' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  {t('users.filterTeacher')}
                </button>
              )}
              {isAdmin && user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  disabled={submitting}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'admin' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  {t('users.roleAdmin')}
                </button>
              )}
            </div>
          </div>

          {(role === 'student' || role === 'teacher') && (
            <>
              <SubjectSelector
                role={role}
                subjects={subjects}
                allowedSubjects={allowedSubjects}
                isAdmin={isAdmin}
                submitting={submitting}
                onToggleSubject={toggleSubject}
                onSubjectsChange={setSubjects}
                onSubjectAutoSelect={(sub) => setAllowedSubjects((prev) => [...prev, sub])}
                onSubjectRenamed={(oldName, newName) => {
                  setAllowedSubjects((prev) => prev.map((s) => (s === oldName ? newName : s)));
                }}
                onSubjectDeleted={(deleted) => {
                  setAllowedSubjects((prev) => prev.filter((s) => s !== deleted));
                }}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {role === 'teacher' ? 'Lớp được phân công' : t('users.classesLabel')}
                </label>
                <p className="mb-2 text-xs text-slate-400">
                  {role === 'teacher' ? 'Chọn các lớp giáo viên được phân công phụ trách' : t('users.classesHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => (
                    <button
                      type="button"
                      key={cls}
                      onClick={() => toggleClass(cls)}
                      disabled={submitting}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${assignedClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
                {showClassInput ? (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      value={newClass}
                      onChange={(e) => setNewClass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                      placeholder={t('users.newClassPlaceholder')}
                      disabled={submitting}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddClass}
                      disabled={submitting}
                      className="rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowClassInput(false); setNewClass(''); }}
                      disabled={submitting}
                      className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowClassInput(true)}
                    disabled={submitting}
                    className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <PlusCircle size={14} /> {t('users.addClass')}
                  </button>
                )}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>{t('users.saveChanges')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface UserResetPasswordModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

function UserResetPasswordModal({ user, onClose, onSuccess }: UserResetPasswordModalProps) {
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleClose = () => {
    if (submitting) return;
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const newErrors: Record<string, string> = {};

    if (!newPassword) {
      newErrors.newPassword = 'Vui lòng nhập mật khẩu mới.';
    } else if (newPassword.length < 8 || newPassword.length > 128) {
      newErrors.newPassword = 'Mật khẩu phải có độ dài từ 8 đến 128 ký tự.';
    }

    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const res = await adminResetUserPassword({
        appUserId: user.id,
        newPassword,
      });

      if (!res.success) {
        const errorMsg = res.error?.message ?? 'Không thể đặt lại mật khẩu. Vui lòng thử lại.';
        setErrors({ general: errorMsg });
        toast(errorMsg, 'error');
        setSubmitting(false);
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      toast('Đã cập nhật mật khẩu thành công.', 'success');
      onSuccess();
    } catch {
      const errorMsg = 'Lỗi kết nối khi đặt lại mật khẩu. Vui lòng thử lại.';
      setErrors({ general: errorMsg });
      toast(errorMsg, 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in px-5" onClick={handleClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Đặt lại mật khẩu</h3>
              <p className="text-xs text-slate-400">{user.fullName} (@{user.username})</p>
            </div>
          </div>
          <button onClick={handleClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu mới</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setErrors((prev) => ({ ...prev, newPassword: '', general: '' })); }}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
              disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.newPassword ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`}
            />
            {errors.newPassword && <p className="mt-1 text-xs text-red-500">{errors.newPassword}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: '', general: '' })); }}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              disabled={submitting}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.confirmPassword ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`}
            />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <span>Cập nhật mật khẩu</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
