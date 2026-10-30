import type { User } from '@/types';
import { GraduationCap, LogOut, Shield, BookOpen, Users, Hash, Award } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';

interface ProfileViewProps {
  user: User;
  onLogout: () => void;
}

export function ProfileView({ user, onLogout }: ProfileViewProps) {
  const { t } = useLanguage();
  const roleLabel = user.role === 'admin' ? t('profile.role.admin') : user.role === 'teacher' ? t('profile.role.teacher') : t('profile.role.student');
  const roleIcon = user.role === 'admin' ? <Shield size={36} /> : user.role === 'teacher' ? <Users size={36} /> : <GraduationCap size={36} />;
  const roleBadgeColor = user.role === 'admin' ? 'bg-purple-100 text-purple-700' : user.role === 'teacher' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg">
        <div className="p-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
            {roleIcon}
          </div>
          <h2 className="text-xl font-bold">{user.fullName}</h2>
          <p className="mt-1 text-sm text-blue-200">@{user.username}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            {roleLabel}
          </div>
        </div>
      </div>

      <div className="mb-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">{t('profile.accountInfo')}</h3>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Hash size={18} /></div>
            <div className="flex-1">
              <p className="text-xs text-slate-400">{t('profile.username')}</p>
              <p className="text-sm font-semibold text-slate-800">{user.username}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${roleBadgeColor}`}>
              {user.role === 'admin' ? <Shield size={18} /> : user.role === 'teacher' ? <Users size={18} /> : <GraduationCap size={18} />}
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-400">{t('profile.role')}</p>
              <p className="text-sm font-semibold text-slate-800">{roleLabel}</p>
            </div>
          </div>
        </div>

        {user.role === 'student' && (
          <>
            {user.assignedClasses.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><BookOpen size={18} /></div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{t('profile.assignedClasses')}</p>
                    <p className="text-sm font-semibold text-slate-800">{user.assignedClasses.join(', ')}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {user.assignedClasses.map((cls) => (
                    <span key={cls} className="rounded-lg bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">{cls}</span>
                  ))}
                </div>
              </div>
            )}

            {user.allowedSubjects.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><Award size={18} /></div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{t('profile.allowedSubjects')}</p>
                    <p className="text-sm font-semibold text-slate-800">{user.allowedSubjects.join(', ')}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {(user.role === 'admin' || user.role === 'teacher') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><Shield size={18} /></div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">{t('profile.permissions')}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {user.role === 'admin' ? t('profile.perm.admin' as TranslationKey) : t('profile.perm.teacher')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <button onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 text-sm font-semibold text-red-600 transition-all active:scale-[0.98] hover:bg-red-100">
        <LogOut size={18} /> {t('profile.logout')}
      </button>
    </div>
  );
}
