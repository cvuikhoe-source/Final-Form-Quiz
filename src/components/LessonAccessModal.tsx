import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Shield, Users, School, GraduationCap, Plus, Trash2,
  Check, AlertTriangle, Loader2, Search, BookOpen, Edit2
} from 'lucide-react';
import type { Lesson, User, LessonAccessGrant, LessonPermission } from '../types';
import {
  loadLessonGrants,
  grantLessonAccess,
  revokeLessonAccess,
  checkLessonAclBackendStatus,
} from '../lib/lessonAccessApi';
import {
  resolveUserLessonAccess,
} from '../lib/lessonAccessService';
import { loadUsers, loadClasses, loadSubjectItems, updateLesson, type SubjectItem } from '../storage';

interface LessonAccessModalProps {
  lesson: Lesson;
  currentUser: User;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LessonAccessModal({
  lesson,
  currentUser,
  onClose,
  onSuccess,
}: LessonAccessModalProps) {
  const [tab, setTab] = useState<'teachers' | 'classes' | 'students'>('teachers');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [grants, setGrants] = useState<LessonAccessGrant[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);

  // Subject management state
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(lesson.subjectId ?? null);
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [selectedNewSubjectId, setSelectedNewSubjectId] = useState<string>('');
  const [savingSubject, setSavingSubject] = useState(false);

  // Backend ACL readiness
  const [aclBackendReady, setAclBackendReady] = useState<boolean | null>(null);
  const [aclBackendReason, setAclBackendReason] = useState<string | null>(null);

  // Form states
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedTeacherPerm, setSelectedTeacherPerm] = useState<'manager' | 'editor' | 'viewer'>('editor');
  const [selectedClass, setSelectedClass] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedGrants, fetchedUsers, fetchedClasses, fetchedSubjects, aclStatus] = await Promise.all([
        loadLessonGrants(lesson.id),
        loadUsers(),
        loadClasses(),
        loadSubjectItems(),
        checkLessonAclBackendStatus(),
      ]);
      setGrants(fetchedGrants);
      setAllUsers(fetchedUsers);
      setAllClasses(fetchedClasses);
      setAvailableSubjects(fetchedSubjects);
      setAclBackendReady(aclStatus.ready);
      setAclBackendReason(aclStatus.reason ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu phân quyền';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [lesson.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Resolved caller permission
  const callerAccess = useMemo(() => {
    return resolveUserLessonAccess(currentUser, { ...lesson, subjectId: currentSubjectId }, grants);
  }, [currentUser, lesson, currentSubjectId, grants]);

  const isAdmin = currentUser.role === 'admin';
  const canManage = callerAccess.canManage;

  // Split users by role
  const userMap = useMemo(() => {
    return new Map<string, User>(allUsers.map((u) => [u.id, u]));
  }, [allUsers]);

  const availableTeachers = useMemo(() => {
    return allUsers.filter((u) => u.role === 'teacher' || u.role === 'admin');
  }, [allUsers]);

  // Selectable subjects for current user
  const selectableSubjects = useMemo(() => {
    if (isAdmin) return availableSubjects;
    if (currentUser.role === 'teacher' && currentUser.allowedSubjects?.length > 0) {
      return availableSubjects.filter((s) =>
        currentUser.allowedSubjects.some((as) => as === s.id || as.toLowerCase() === s.name.toLowerCase())
      );
    }
    return availableSubjects;
  }, [availableSubjects, isAdmin, currentUser]);

  const currentSubjectObj = useMemo(() => {
    if (!currentSubjectId) return null;
    return availableSubjects.find(
      (s) => s.id === currentSubjectId || s.name.toLowerCase() === currentSubjectId.toLowerCase()
    );
  }, [availableSubjects, currentSubjectId]);

  // Handle saving subject change
  const handleSaveSubject = async () => {
    if (!selectedNewSubjectId) return;
    setSavingSubject(true);
    setError(null);
    try {
      await updateLesson(lesson.id, { subjectId: selectedNewSubjectId });
      setCurrentSubjectId(selectedNewSubjectId);
      setIsEditingSubject(false);
      setSuccessMsg('Đã cập nhật môn học cho bài học thành công.');
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật môn học';
      setError(msg);
    } finally {
      setSavingSubject(false);
    }
  };

  // Filter allowed classes for caller
  const visibleClasses = useMemo(() => {
    if (isAdmin) return allClasses;
    return allClasses.filter((c) => currentUser.assignedClasses?.includes(c));
  }, [isAdmin, allClasses, currentUser.assignedClasses]);

  // Filter allowed students for caller
  const visibleStudents = useMemo(() => {
    if (isAdmin) {
      return allUsers.filter((u) => u.role === 'student');
    }
    const teacherClasses = currentUser.assignedClasses || [];
    return allUsers.filter(
      (u) => u.role === 'student' && u.assignedClasses?.some((c) => teacherClasses.includes(c))
    );
  }, [isAdmin, allUsers, currentUser.assignedClasses]);

  // Direct grants categorized
  const teacherGrants = useMemo(() => {
    return grants.filter((g) => {
      if (g.principalType !== 'user') return false;
      const targetUser = userMap.get(g.principalId);
      return targetUser?.role === 'teacher' || targetUser?.role === 'admin' || g.permission === 'owner';
    });
  }, [grants, userMap]);

  const classGrants = useMemo(() => {
    return grants.filter((g) => g.principalType === 'class');
  }, [grants]);

  const studentGrants = useMemo(() => {
    return grants.filter((g) => {
      if (g.principalType !== 'user') return false;
      const targetUser = userMap.get(g.principalId);
      return targetUser?.role === 'student' && g.permission !== 'owner';
    });
  }, [grants, userMap]);

  // Handle granting access
  const handleGrant = async (
    principalType: 'user' | 'class',
    principalId: string,
    permission: LessonPermission
  ) => {
    if ((principalType === 'class' || (principalType === 'user' && userMap.get(principalId)?.role === 'student')) && !currentSubjectId) {
      setError('Phải gán môn học trước khi cấp bài học cho Lớp học hoặc Học sinh.');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await grantLessonAccess({
        lessonId: lesson.id,
        principalType,
        principalId,
        permission,
        grantedBy: currentUser.id,
      });
      setSuccessMsg('Cấp quyền thành công.');
      await loadData();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cấp quyền';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle revoking access
  const handleRevoke = async (params: {
    grantId?: string;
    principalType?: 'user' | 'class';
    principalId?: string;
  }) => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await revokeLessonAccess({
        grantId: params.grantId,
        lessonId: lesson.id,
        principalType: params.principalType,
        principalId: params.principalId,
      });
      setSuccessMsg('Đã thu hồi quyền thành công.');
      await loadData();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi thu hồi quyền';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex w-full max-w-2xl max-h-[90dvh] flex-col rounded-2xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-xs">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 line-clamp-1">
                Quản lý quyền bài học
              </h2>
              <p className="text-xs text-slate-500 line-clamp-1">
                Bài học: <strong className="text-slate-800">{lesson.title}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Backend ACL Not Ready Banner */}
        {aclBackendReady === false && (
          <div className="mx-6 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lưu ý về Backend Lesson ACL trên Supabase:</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {aclBackendReason || "Bảng 'lesson_access_grants' chưa sẵn sàng trên Supabase. Thao tác phân quyền cần migration này được triển khai trên backend."}
              </p>
            </div>
          </div>
        )}

        {/* Subject Information & Selector */}
        <div className="mx-6 mt-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-600 shrink-0" />
              <span className="text-xs font-bold text-slate-700">Môn học của bài học:</span>
              {currentSubjectObj ? (
                <span className="rounded-lg bg-indigo-100 text-indigo-800 px-2.5 py-0.5 text-xs font-bold border border-indigo-200">
                  {currentSubjectObj.name}
                </span>
              ) : currentSubjectId ? (
                <span className="rounded-lg bg-indigo-100 text-indigo-800 px-2.5 py-0.5 text-xs font-bold border border-indigo-200">
                  {currentSubjectId}
                </span>
              ) : (
                <span className="rounded-lg bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-bold border border-amber-200 flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-600" /> Chưa gán môn học
                </span>
              )}
            </div>

            {canManage && !isEditingSubject && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNewSubjectId(currentSubjectId ?? (selectableSubjects[0]?.id ?? ''));
                  setIsEditingSubject(true);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
              >
                <Edit2 size={12} />
                <span>{currentSubjectId ? 'Đổi môn học' : 'Gán môn học'}</span>
              </button>
            )}
          </div>

          {!currentSubjectId && !isEditingSubject && (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50/80 p-2 rounded-lg border border-amber-200/60">
              ⚠️ <strong>Cảnh báo:</strong> Bài học chưa được gán môn học. Học sinh sẽ <strong>không thể nhìn thấy</strong> bài học này và bạn không thể cấp bài học cho Lớp học hoặc Học sinh.
            </p>
          )}

          {isEditingSubject && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
              <select
                value={selectedNewSubjectId}
                onChange={(e) => setSelectedNewSubjectId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
              >
                <option value="">-- Chọn môn học --</option>
                {selectableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedNewSubjectId || savingSubject}
                onClick={handleSaveSubject}
                className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {savingSubject ? 'Đang lưu...' : 'Lưu môn học'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingSubject(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 px-6 bg-white gap-2 mt-2">
          <button
            type="button"
            onClick={() => setTab('teachers')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold transition-all ${
              tab === 'teachers'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={16} />
            <span>Giáo viên ({teacherGrants.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('classes')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold transition-all ${
              tab === 'classes'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <School size={16} />
            <span>Lớp học ({classGrants.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('students')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold transition-all ${
              tab === 'students'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap size={16} />
            <span>Học sinh ({studentGrants.length})</span>
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700 border border-emerald-200">
            <Check size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 size={28} className="animate-spin text-indigo-600" />
              <span className="text-xs">Đang tải danh sách phân quyền...</span>
            </div>
          ) : (
            <>
              {/* ─── TAB 1: TEACHERS ─── */}
              {tab === 'teachers' && (
                <div className="space-y-4">
                  {isAdmin ? (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                        Cấp quyền cho Giáo viên mới
                      </h4>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <select
                          value={selectedTeacherId}
                          onChange={(e) => setSelectedTeacherId(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                        >
                          <option value="">-- Chọn Giáo viên --</option>
                          {availableTeachers
                            .filter((t) => !teacherGrants.some((g) => g.principalId === t.id))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.fullName} ({t.username}) - {t.role}
                              </option>
                            ))}
                        </select>

                        <select
                          value={selectedTeacherPerm}
                          onChange={(e) => setSelectedTeacherPerm(e.target.value as 'manager' | 'editor' | 'viewer')}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                        >
                          <option value="manager">Quản lý (Manager)</option>
                          <option value="editor">Chỉnh sửa (Editor)</option>
                          <option value="viewer">Chỉ xem (Viewer)</option>
                        </select>

                        <button
                          type="button"
                          disabled={!selectedTeacherId || actionLoading}
                          onClick={() => {
                            if (selectedTeacherId) {
                              handleGrant('user', selectedTeacherId, selectedTeacherPerm);
                              setSelectedTeacherId('');
                            }
                          }}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-all"
                        >
                          <Plus size={15} />
                          <span>Cấp quyền</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800">
                      <strong>Lưu ý:</strong> Chỉ Quản trị viên mới có quyền cấp hoặc sửa quyền đối với Giáo viên khác.
                    </div>
                  )}

                  {/* List of current teacher grants */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      Danh sách Giáo viên có quyền ({teacherGrants.length})
                    </h4>
                    {teacherGrants.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Chưa có giáo viên nào được phân quyền riêng.</p>
                    ) : (
                      teacherGrants.map((g) => {
                        const user = userMap.get(g.principalId);
                        const isCreator = lesson.createdBy === g.principalId;
                        return (
                          <div
                            key={g.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 font-bold text-xs text-slate-700">
                                {user?.fullName?.charAt(0) || 'G'}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {user?.fullName || g.principalId}
                                  {isCreator && (
                                    <span className="ml-2 rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-extrabold">
                                      Tác giả (Creator)
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {user?.username} • Vai trò: {user?.role || 'teacher'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                g.permission === 'owner'
                                  ? 'bg-rose-100 text-rose-700'
                                  : g.permission === 'manager'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : g.permission === 'editor'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {g.permission === 'owner'
                                  ? 'Owner'
                                  : g.permission === 'manager'
                                  ? 'Manager'
                                  : g.permission === 'editor'
                                  ? 'Editor'
                                  : 'Viewer'}
                              </span>

                              {isAdmin && g.permission !== 'owner' && (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleRevoke({ grantId: g.id })}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                  title="Thu hồi quyền"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ─── TAB 2: CLASSES ─── */}
              {tab === 'classes' && (
                <div className="space-y-4">
                  {!currentSubjectId && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span><strong>Chưa có môn học:</strong> Phải gán môn học trước khi cấp bài học cho Lớp học.</span>
                    </div>
                  )}

                  {canManage && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                        Cấp quyền truy cập cho Lớp học
                      </h4>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedClass}
                          onChange={(e) => setSelectedClass(e.target.value)}
                          disabled={!currentSubjectId}
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        >
                          <option value="">-- Chọn Lớp học --</option>
                          {visibleClasses
                            .filter((c) => !classGrants.some((g) => g.principalId === c))
                            .map((cls) => (
                              <option key={cls} value={cls}>
                                {cls}
                              </option>
                            ))}
                        </select>

                        <button
                          type="button"
                          disabled={!selectedClass || !currentSubjectId || actionLoading}
                          onClick={() => {
                            if (selectedClass) {
                              handleGrant('class', selectedClass, 'viewer');
                              setSelectedClass('');
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <Plus size={15} />
                          <span>Cấp cho lớp</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of class grants */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      Danh sách Lớp học được cấp quyền ({classGrants.length})
                    </h4>
                    {classGrants.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Chưa có lớp học nào được cấp quyền truy cập bài học này.</p>
                    ) : (
                      classGrants.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700 font-bold text-xs">
                              <School size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                Lớp {g.principalId}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Quyền: Xem bài học (Viewer)
                              </p>
                            </div>
                          </div>

                          {canManage && (isAdmin || currentUser.assignedClasses?.includes(g.principalId)) && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleRevoke({ grantId: g.id })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              title="Thu hồi quyền của lớp"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ─── TAB 3: STUDENTS ─── */}
              {tab === 'students' && (
                <div className="space-y-4">
                  {!currentSubjectId && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span><strong>Chưa có môn học:</strong> Phải gán môn học trước khi cấp bài học cho Học sinh.</span>
                    </div>
                  )}

                  {/* Search and add student */}
                  {canManage && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          disabled={!currentSubjectId}
                          placeholder={!currentSubjectId ? "Vui lòng gán môn học trước..." : "Tìm học sinh theo tên hoặc mã để cấp quyền..."}
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      {studentSearch.trim() && currentSubjectId && (
                        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 divide-y divide-slate-100 shadow-xs">
                          {visibleStudents
                            .filter(
                              (s) =>
                                (s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
                                  s.username.toLowerCase().includes(studentSearch.toLowerCase())) &&
                                !studentGrants.some((g) => g.principalId === s.id)
                            )
                            .map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between py-2 px-2 hover:bg-slate-50 rounded-lg"
                              >
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{s.fullName}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {s.username} • Lớp: {s.assignedClasses?.join(', ') || 'Chưa gán'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    handleGrant('user', s.id, 'viewer');
                                    setStudentSearch('');
                                  }}
                                  className="flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                                >
                                  <Plus size={13} />
                                  <span>Cấp quyền</span>
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* List of granted students */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      Học sinh được cấp quyền riêng ({studentGrants.length})
                    </h4>
                    {studentGrants.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Chưa có học sinh nào được cấp quyền riêng.</p>
                    ) : (
                      studentGrants.map((g) => {
                        const student = userMap.get(g.principalId);
                        const canRevokeThis =
                          isAdmin ||
                          (currentUser.role === 'teacher' &&
                            student?.assignedClasses?.some((c) => currentUser.assignedClasses?.includes(c)));

                        return (
                          <div
                            key={g.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold text-xs">
                                <GraduationCap size={16} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {student?.fullName || g.principalId}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {student?.username} • Lớp: {student?.assignedClasses?.join(', ') || 'Trống'}
                                </p>
                              </div>
                            </div>

                            {canRevokeThis && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleRevoke({ grantId: g.id })}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                title="Thu hồi quyền học sinh"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: Single close button placed bottom-right */}
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[80px] rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs active:scale-[0.98]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
