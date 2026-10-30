import { useState, useMemo, useEffect } from 'react';
import type { User, Role } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { loadClasses, addClass, loadSubjects, getSubjectMeta } from '@/storage';
import { toast } from './Toast';
import { ClassBadge } from './shared';
import { Edit2, Trash2, Search, X, UserPlus, Inbox, GraduationCap, KeyRound, PlusCircle, Check, BookOpen, AlertTriangle, Shield, Users as UsersIcon } from 'lucide-react';

interface UserManagementViewProps {
  users: User[];
  currentUser: User;
  onCreate: (user: Omit<User, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<User>) => void;
  onDelete: (id: string) => void;
}

export function UserManagementView({ users, currentUser, onCreate, onUpdate, onDelete }: UserManagementViewProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const isAdmin = currentUser.role === 'admin';

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (u.id === currentUser.id) return false;
      if (!isAdmin) {
        // Teachers can only see students
        if (u.role !== 'student') return false;
      }
      const matchesSearch = u.fullName.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === 'all' || u.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, search, filterRole, currentUser, isAdmin]);

  const roleLabel = (role: Role) => role === 'admin' ? t('profile.role.admin') : role === 'teacher' ? t('profile.role.teacher') : t('profile.role.student');
  const roleColor = (role: Role) => role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'teacher' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('users.title')}</h2>
          <p className="text-sm text-slate-500">{t('users.count', { count: filtered.length })}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-blue-700">
          <UserPlus size={18} /> {t('common.add')}
        </button>
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

              {user.role === 'student' && (
                <div className="mb-3 space-y-1.5">
                  <div><ClassBadge classes={user.assignedClasses} /></div>
                  {user.allowedSubjects.length > 0 && (
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
                <button onClick={() => { const np = prompt(t('users.resetPasswordPrompt', { name: user.fullName })); if (np && np.trim()) { onUpdate(user.id, { password: np.trim() }); toast(t('users.toastPasswordReset'), 'success'); } }}
                  className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                  <KeyRound size={14} /> {t('users.password')}
                </button>
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
        <UserFormModal isAdmin={isAdmin} onClose={() => setShowCreate(false)}
          onSave={(data) => { onCreate(data); setShowCreate(false); toast(t('users.toastCreated'), 'success'); }}
          existingUsernames={users.map((u) => u.username)} />
      )}
      {editingUser && (
        <UserFormModal user={editingUser} isAdmin={isAdmin} onClose={() => setEditingUser(null)}
          onSave={(data) => { onUpdate(editingUser.id, data); setEditingUser(null); toast(t('users.toastUpdated'), 'success'); }}
          existingUsernames={users.filter((u) => u.id !== editingUser.id).map((u) => u.username)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal student={deleteTarget} onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); toast(t('users.toastDeleted'), 'info'); }} />
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

interface UserFormModalProps {
  user?: User;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (data: Omit<User, 'id'>) => void;
  existingUsernames: string[];
}

function UserFormModal({ user, isAdmin, onClose, onSave, existingUsernames }: UserFormModalProps) {
  const { t } = useLanguage();
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState(user?.password ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'student');
  const [assignedClasses, setAssignedClasses] = useState<string[]>(user?.assignedClasses ?? []);
  const [allowedSubjects, setAllowedSubjects] = useState<string[]>(user?.allowedSubjects ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newClass, setNewClass] = useState('');
  const [showClassInput, setShowClassInput] = useState(false);

  useEffect(() => { loadClasses().then(setClasses); loadSubjects().then(setSubjects); }, []);

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

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!username.trim()) newErrors.username = t('users.errUsernameRequired');
    else if (existingUsernames.includes(username.trim())) newErrors.username = t('users.errUsernameExists');
    if (!password.trim()) newErrors.password = t('users.errPasswordRequired');
    if (!fullName.trim()) newErrors.fullName = t('users.errNameRequired');
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    onSave({ username: username.trim(), password: password.trim(), fullName: fullName.trim(), role, assignedClasses, allowedSubjects });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{user ? t('users.formTitleEdit') : t('users.formTitleAdd')}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.fullNameLabel')}</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('users.fullNamePlaceholder')}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.fullName ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.usernameLabel')}</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('users.usernamePlaceholder')}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.username ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.passwordLabel')}</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('users.passwordPlaceholder')}
              className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-all focus:ring-2 ${errors.password ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'}`} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
          </div>

          {/* Role selection — admin can create teacher+student, teacher can only create student */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.roleLabel')}</label>
            <div className="flex gap-2">
              <button onClick={() => setRole('student')}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'student' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                {t('profile.role.student')}
              </button>
              {isAdmin && (
                <button onClick={() => setRole('teacher')}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'teacher' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                  {t('users.filterTeacher')}
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setRole('admin')}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${role === 'admin' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                  {t('users.roleAdmin')}
                </button>
              )}
            </div>
          </div>

          {role === 'student' && (
            <>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><BookOpen size={15} /> {t('users.subjectsLabel')}</label>
                <p className="mb-2 text-xs text-slate-400">{t('users.subjectsHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((sub) => {
                    const meta = getSubjectMeta(sub);
                    const active = allowedSubjects.includes(sub);
                    return (
                      <button key={sub} onClick={() => toggleSubject(sub)}
                        className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${active ? `${meta.bg} ${meta.text} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('users.classesLabel')}</label>
                <p className="mb-2 text-xs text-slate-400">{t('users.classesHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => (
                    <button key={cls} onClick={() => toggleClass(cls)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${assignedClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {cls}
                    </button>
                  ))}
                </div>
                {showClassInput ? (
                  <div className="mt-2 flex gap-1.5">
                    <input type="text" value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                      placeholder={t('users.newClassPlaceholder')} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" autoFocus />
                    <button onClick={handleAddClass} className="rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700"><Check size={18} /></button>
                    <button onClick={() => { setShowClassInput(false); setNewClass(''); }} className="rounded-xl bg-slate-100 px-3 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowClassInput(true)} className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50">
                    <PlusCircle size={14} /> {t('users.addClass')}
                  </button>
                )}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700">{user ? t('users.saveChanges') : t('common.add')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
