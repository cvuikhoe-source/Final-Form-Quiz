import { useState } from 'react';
import type { User } from '@/types';
import { loadUsers, saveSession } from '@/storage';
import { supabase } from '@/lib/supabase';
import { toast } from './Toast';
import { useLanguage } from '@/context/LanguageContext';
import { ThemeToggle, LanguageToggle } from './SettingsSwitchers';
import { GraduationCap, Eye, EyeOff, LogIn, User as UserIcon, Lock, Loader2 } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSupabaseLogin = async (
    targetUser: 'admin' | 'teacher',
    rawPassword: string
  ) => {
    if (!supabase) {
      setError(t('login.connError'));
      toast(t('login.connError'), 'error');
      setSubmitting(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: `${targetUser}@quizforms.internal`,
      password: rawPassword,
    });

    if (authError || !authData.user) {
      setError(t('login.badCredentials'));
      toast(t('login.failed'), 'error');
      setSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('id, username, full_name, role, assigned_classes, allowed_subjects, auth_user_id')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.username !== targetUser ||
      profile.role !== targetUser ||
      profile.auth_user_id !== authData.user.id
    ) {
      await supabase.auth.signOut();
      setError('Không tìm thấy hồ sơ người dùng hợp lệ.');
      toast('Không tìm thấy hồ sơ người dùng hợp lệ.', 'error');
      setSubmitting(false);
      return;
    }

    const appUser: User = {
      id: profile.id,
      username: profile.username,
      password: '',
      fullName: profile.full_name,
      role: targetUser,
      assignedClasses: (profile.assigned_classes as string[]) ?? [],
      allowedSubjects: (profile.allowed_subjects as string[]) ?? [],
    };

    saveSession(appUser);
    toast(`Chào mừng ${appUser.fullName}!`, 'success');
    onLogin(appUser);
  };

  const handleLogin = async (uname: string, pwd: string) => {
    setSubmitting(true);
    const normalizedUsername = uname.trim().toLowerCase();

    if (normalizedUsername === 'admin') {
      await handleSupabaseLogin('admin', pwd);
      return;
    }

    if (normalizedUsername === 'teacher') {
      await handleSupabaseLogin('teacher', pwd);
      return;
    }

    try {
      const users = await loadUsers();
      const found = users.find((u) => u.username === uname.trim() && u.password === pwd);
      if (!found) {
        setError(t('login.badCredentials'));
        toast(t('login.failed'), 'error');
        setSubmitting(false);
        return;
      }
      saveSession(found);
      toast(`Chào mừng ${found.fullName}!`, 'success');
      onLogin(found);
    } catch {
      setError(t('login.connError'));
      toast(t('login.connError'), 'error');
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError(t('login.fillAll'));
      return;
    }
    handleLogin(username, password);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-800 px-5 safe-top">
      <div className="flex w-full justify-end pt-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center pt-8">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-md shadow-xl">
          <GraduationCap size={42} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">QuizForms</h1>
        <p className="mt-1 text-sm text-blue-200">{t('login.appTagline')}</p>
      </div>

      <div className="mb-8 rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="mb-1 text-lg font-bold text-slate-800 dark:text-slate-100">{t('login.heading')}</h2>
        <p className="mb-5 text-sm text-slate-400">{t('login.subheading')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.username')}</label>
            <div className="relative">
              <UserIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }}
                placeholder={t('login.usernamePlaceholder')} autoComplete="off"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.password')}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••" autoComplete="off"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">{error}</div>}

          <button type="submit" disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98] hover:bg-blue-700 disabled:opacity-60">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
