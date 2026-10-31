import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Exam, User, CompletionRecord, ExamResult, Lesson, LessonCategory, ViewMode, VocabularyItem, ListeningLesson, ReadingLesson } from '@/types';
import {
  loadExams, createExam, batchCreateExams, updateExam, deleteExam,
  loadUsers, createUser, updateUser, deleteUser,
  loadSession, saveSession,
  loadCompletions, saveCompletions,
  loadResults,
  loadLessons, upsertLessons, updateLesson,
  loadCategories, createCategory, updateCategory, deleteCategory,
  generateId, isExamCompletedByUser,
  onDataChange, subscribeToExams, subscribeToResults,
  upsertVocabItems,
  loadListeningProgressMap, saveListeningProgressEntry,
} from '@/storage';
import { BottomNav } from '@/components/BottomNav';
import { LoginScreen } from '@/components/LoginScreen';
import { StudentView } from '@/components/StudentView';
import { AdminView } from '@/components/AdminView';
import { UserManagementView } from '@/components/UserManagementView';
import { StatsView } from '@/components/StatsView';
import { HistoryView } from '@/components/HistoryView';
import { ProfileView } from '@/components/ProfileView';
import { TakeExamView } from '@/components/TakeExamView';
import { LessonListView } from '@/components/LessonListView';
import { PracticeView } from '@/components/PracticeView';
import { PracticeAdminView } from '@/components/PracticeAdminView';
import { LessonDetailView } from '@/components/LessonDetailView';
import { LessonImportModal } from '@/components/LessonImportModal';
import { VocabLessonDetailView } from '@/components/VocabLessonDetailView';
import { VocabImportModal } from '@/components/VocabImportModal';
import { ListeningListView } from '@/components/ListeningListView';
import { ListeningStudyView } from '@/components/ListeningStudyView';
import { ReadingListView } from '@/components/ReadingListView';
import { ReadingStudyView } from '@/components/ReadingStudyView';
import { loadReadingLessons } from '@/storage';
import { supabase } from '@/lib/supabase';
import { ToastContainer, toast } from '@/components/Toast';
import { ThemeToggle, LanguageToggle } from '@/components/SettingsSwitchers';
import { useLanguage } from '@/context/LanguageContext';
import { GraduationCap } from 'lucide-react';

const LS_LESSON_DONE = 'quizforms_lesson_done';

function loadLessonDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_LESSON_DONE) ?? '[]')); } catch { return new Set(); }
}
function saveLessonDone(ids: Set<string>) {
  localStorage.setItem(LS_LESSON_DONE, JSON.stringify(Array.from(ids)));
}

function App() {
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<LessonCategory[]>([]);
  const [lessonDone, setLessonDone] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [showLessonImport, setShowLessonImport] = useState(false);
  const [showVocabImport, setShowVocabImport] = useState(false);
  const [vocabImportCategoryId, setVocabImportCategoryId] = useState<string>('');
  const [activeListening, setActiveListening] = useState<ListeningLesson | null>(null);
  const [listeningListOpen, setListeningListOpen] = useState(false);
  const [readingLessons, setReadingLessons] = useState<ReadingLesson[]>([]);
  const [activeReading, setActiveReading] = useState<ReadingLesson | null>(null);
  const [readingListOpen, setReadingListOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('lessons');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [prevExamCount, setPrevExamCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [e, u, c, r, l, cats] = await Promise.all([
        loadExams(), loadUsers(), loadCompletions(), loadResults(), loadLessons(), loadCategories(),
      ]);
      setExams(e);
      setUsers(u);
      setCompletions(c);
      setResults(r);
      setLessons(l);
      setCategories(cats);
      setLessonDone(loadLessonDone());
      loadReadingLessons().then(setReadingLessons).catch(() => {});
      setCurrentUser(loadSession());
      setLoading(false);
    })();
  }, []);

  useEffect(() => { setPrevExamCount(exams.length); }, [exams.length]);

  useEffect(() => {
    if (!currentUser) return;
    const reloadExams = async () => {
      const latest = await loadExams();
      if (currentUser.role === 'student' && latest.length > prevExamCount) {
        toast(t('toast.newExam'), 'success');
      }
      setExams(latest);
    };
    const reloadResults = async () => { setResults(await loadResults()); };
    const unsubExams = subscribeToExams(reloadExams);
    const unsubResults = subscribeToResults(reloadResults);
    const unsubLocal = onDataChange((type) => {
      if (type === 'exams') reloadExams();
      if (type === 'results') reloadResults();
    });
    return () => { unsubExams(); unsubResults(); unsubLocal(); };
  }, [currentUser, prevExamCount]);

  // ─── Auth ──────────────────────────────────────────────────
  const handleLogin = useCallback((user: User) => { setCurrentUser(user); setView('lessons'); }, []);
  const handleLogout = useCallback(() => {
    if (supabase && (currentUser?.role === 'admin' || currentUser?.role === 'teacher')) {
      supabase.auth.signOut().catch(() => {});
    }
    saveSession(null); setCurrentUser(null); setActiveExam(null); setActiveLesson(null); setActiveListening(null); setListeningListOpen(false); setActiveReading(null); setReadingListOpen(false); setView('lessons');
  }, [currentUser]);

  // ─── Exams CRUD ────────────────────────────────────────────
  const handleCreateExam = useCallback(async (data: Omit<Exam, 'id' | 'createdAt'>) => {
    const exam = await createExam(data); setExams((prev) => [exam, ...prev]);
  }, []);
  const handleBatchCreate = useCallback(async (items: Omit<Exam, 'id' | 'createdAt'>[]) => {
    const newExams = await batchCreateExams(items); setExams((prev) => [...newExams, ...prev]);
  }, []);
  const handleUpdateExam = useCallback(async (id: string, updates: Partial<Exam>) => {
    await updateExam(id, updates); setExams((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }, []);
  const handleDeleteExam = useCallback(async (id: string) => {
    await deleteExam(id);
    setExams((prev) => prev.filter((e) => e.id !== id));
    const next = completions.filter((c) => c.examId !== id);
    setCompletions(next); await saveCompletions(next);
  }, [completions]);

  // ─── Users CRUD ────────────────────────────────────────────
  const handleCreateUser = useCallback(async (data: Omit<User, 'id'>) => {
    const user = await createUser(data); setUsers((prev) => [...prev, user]);
  }, []);
  const handleUpdateUser = useCallback(async (id: string, updates: Partial<User>) => {
    await updateUser(id, updates);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
    if (currentUser?.id === id) { const updated = { ...currentUser, ...updates }; setCurrentUser(updated); saveSession(updated); }
  }, [currentUser]);
  const handleDeleteUser = useCallback(async (id: string) => {
    await deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    const next = completions.filter((c) => c.userId !== id);
    setCompletions(next); await saveCompletions(next);
  }, [completions]);

  // ─── Completions ───────────────────────────────────────────
  const handleMarkCompleted = useCallback(async (examId: string) => {
    if (!currentUser || isExamCompletedByUser(examId, currentUser.id, completions)) return;
    const record: CompletionRecord = { id: generateId('comp'), examId, userId: currentUser.id, completedAt: new Date().toISOString() };
    const next = [...completions, record]; setCompletions(next); await saveCompletions(next);
  }, [completions, currentUser]);

  // ─── Results ───────────────────────────────────────────────
  const handleResultsChanged = useCallback(async () => { setResults(await loadResults()); }, []);

  // ─── Lessons ───────────────────────────────────────────────
  const handleUpdateLesson = useCallback(async (id: string, updates: Partial<Lesson>) => {
    await updateLesson(id, updates);
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }, []);

  const handleCreateCategory = useCallback(async (data: Omit<LessonCategory, 'id' | 'createdAt'>) => {
    const cat = await createCategory(data);
    setCategories((prev) => [...prev, cat]);
  }, []);

  const handleUpdateCategory = useCallback(async (id: string, updates: Partial<LessonCategory>) => {
    await updateCategory(id, updates);
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const handleDeleteCategory = useCallback(async (id: string) => {
    await deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setLessons((prev) => prev.map((l) => (l.categoryId === id ? { ...l, categoryId: null } : l)));
  }, []);

  const handleImportLessons = useCallback(async (imported: Lesson[]) => {
    await upsertLessons(imported);
    const latest = await loadLessons();
    setLessons(latest);
    toast(t('toast.importedLessons', { n: imported.length }), 'success');
  }, [t]);

  const handleImportVocab = useCallback(async (importedLessons: Lesson[], vocabItems: VocabularyItem[]) => {
    await upsertLessons(importedLessons);
    await upsertVocabItems(vocabItems);
    const latest = await loadLessons();
    setLessons(latest);
    toast(t('toast.importVocab', { lessons: importedLessons.length, vocab: vocabItems.length }), 'success');
  }, [t]);

  const handleMarkLessonDone = useCallback((id: string) => {
    setLessonDone((prev) => {
      const next = new Set(prev); next.add(id); saveLessonDone(next); return next;
    });
    toast(t('toast.lessonDone'), 'success');
  }, [t]);

  const handleListeningSubmitted = useCallback((lessonId: string, score: number, total: number) => {
    if (!currentUser) return;
    const prev = loadListeningProgressMap()[currentUser.id]?.[lessonId];
    saveListeningProgressEntry(currentUser.id, lessonId, {
      attempts: (prev?.attempts ?? 0) + 1,
      lastScore: score,
      lastTotalPoints: total,
      lastAttemptAt: new Date().toISOString(),
      done: true,
    });
    setLessonDone((prev) => {
      const next = new Set(prev); next.add(lessonId); saveLessonDone(next); return next;
    });
    toast(t('toast.listeningDone', { score, total }), 'success');
  }, [currentUser, t]);

  const handleReadingLessonsChanged = useCallback(async () => {
    setReadingLessons(await loadReadingLessons());
  }, []);

  const handleReadingCompleted = useCallback((lessonId: string) => {
    setLessonDone((prev) => {
      const next = new Set(prev); next.add(lessonId); saveLessonDone(next); return next;
    });
    toast(t('toast.readingDone'), 'success');
  }, [t]);

  // ─── Lesson navigation siblings ────────────────────────────
  const siblingLessons = useMemo(() => {
    if (!activeLesson) return [];
    return lessons
      .filter((l) => l.categoryId === activeLesson.categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [activeLesson, lessons]);

  // ─── Reading navigation siblings ──────────────────────────
  const readingSiblings = useMemo(() => {
    return readingLessons
      .filter((l) => l.status === 'published' || currentUser?.role !== 'student')
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [readingLessons, currentUser]);

  // ─── Take exam ─────────────────────────────────────────────
  const handleStartExam = useCallback((exam: Exam) => { setActiveExam(exam); }, []);
  const handleCloseExam = useCallback(() => { setActiveExam(null); }, []);

  // ─── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
          <GraduationCap size={28} className="text-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (<><LoginScreen onLogin={handleLogin} /><ToastContainer /></>);
  }

  if (activeExam) {
    const currentExam = exams.find((e) => e.id === activeExam.id) ?? activeExam;
    return (
      <><TakeExamView exam={currentExam} completed={isExamCompletedByUser(currentExam.id, currentUser.id, completions)}
        onClose={handleCloseExam} onComplete={handleMarkCompleted} /><ToastContainer /></>
    );
  }

  const role = currentUser.role;
  const canManageExams = role === 'admin' || role === 'teacher';

  const titles: Record<string, string> = {
    exams: canManageExams ? t('header.manageExams') : t('header.myExams'),
    users: t('header.users'),
    students: t('nav.students'),
    stats: t('nav.stats'),
    history: t('nav.history'),
    lessons: t('nav.lessons'),
    practice: t('nav.practice'),
    profile: role === 'student' ? t('nav.profile') : t('header.account'),
  };

  return (
    <div className="min-h-screen bg-slate-50 transition-colors duration-200">
      {/* Mobile header */}
      <header className="sticky top-0 z-20 glass border-b border-slate-200/80 safe-top md:hidden">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md">
            <GraduationCap size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-slate-800">{titles[view] || 'QuizForms'}</h1>
            <p className="text-xs text-slate-400">{currentUser.fullName}</p>
          </div>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-10 hidden border-b border-slate-200/80 bg-white/95 backdrop-blur md:block">
        <div className="ml-60 flex items-center justify-between px-8 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{titles[view] || 'QuizForms'}</h1>
            <p className="text-sm text-slate-400">{currentUser.fullName}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-0 pb-24 pt-0 md:ml-60 md:max-w-6xl md:px-8 md:pb-8 md:pt-6">
        {/* Listening list + study views */}
        {view === 'lessons' && listeningListOpen ? (
          activeListening ? (
            <ListeningStudyView
              lesson={activeListening}
              currentUser={currentUser}
              onBack={() => setActiveListening(null)}
              onSubmitted={(score, total) => handleListeningSubmitted(activeListening.id, score, total)}
            />
          ) : (
            <ListeningListView
              currentUser={currentUser}
              onOpen={setActiveListening}
              onBack={() => setListeningListOpen(false)}
            />
          )
        ) : view === 'lessons' && readingListOpen ? (
          activeReading ? (
            <ReadingStudyView
              lesson={activeReading}
              currentUser={currentUser}
              onBack={() => setActiveReading(null)}
              onNavigate={setActiveReading}
              prevLesson={readingSiblings[readingSiblings.findIndex((l) => l.id === activeReading.id) - 1] ?? null}
              nextLesson={readingSiblings[readingSiblings.findIndex((l) => l.id === activeReading.id) + 1] ?? null}
              onCompleted={handleReadingCompleted}
            />
          ) : (
            <ReadingListView
              currentUser={currentUser}
              completedIds={lessonDone}
              onOpen={setActiveReading}
              onBack={() => { setReadingListOpen(false); handleReadingLessonsChanged(); }}
            />
          )
        ) : view === 'lessons' && activeLesson ? (
          activeLesson.categoryId === 'cat-vocab' ? (
            <VocabLessonDetailView
              lesson={activeLesson}
              currentUser={currentUser}
              canManage={canManageExams}
              completed={lessonDone.has(activeLesson.id)}
              onBack={() => setActiveLesson(null)}
              onMarkDone={handleMarkLessonDone}
            />
          ) : (
            <LessonDetailView
              lesson={activeLesson}
              completed={lessonDone.has(activeLesson.id)}
              siblingLessons={siblingLessons}
              onBack={() => setActiveLesson(null)}
              onMarkDone={handleMarkLessonDone}
              onNavigate={setActiveLesson}
            />
          )
        ) : view === 'practice' ? (
          canManageExams ? (
            <PracticeAdminView user={currentUser} />
          ) : (
            <PracticeView user={currentUser} />
          )
        ) : view === 'lessons' ? (
          <LessonListView
            lessons={lessons}
            categories={categories}
            completedIds={lessonDone}
            currentUser={currentUser}
            canManage={canManageExams}
            onOpen={setActiveLesson}
            onImport={() => setShowLessonImport(true)}
            onVocabImport={(catId: string) => { setVocabImportCategoryId(catId); setShowVocabImport(true); }}
            onUpdateLesson={handleUpdateLesson}
            onCreateCategory={handleCreateCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onOpenListening={() => setListeningListOpen(true)}
            onOpenReading={() => setReadingListOpen(true)}
          />
        ) : canManageExams ? (
          <>
            {view === 'exams' && <AdminView exams={exams} currentUserId={currentUser.id} onCreate={handleCreateExam} onBatchCreate={handleBatchCreate} onUpdate={handleUpdateExam} onDelete={handleDeleteExam} />}
            {(view === 'users' || view === 'students') && <UserManagementView users={users} currentUser={currentUser} onCreate={handleCreateUser} onUpdate={handleUpdateUser} onDelete={handleDeleteUser} />}
            {view === 'stats' && <StatsView exams={exams} users={users} completions={completions} results={results} onResultsChanged={handleResultsChanged} />}
            {view === 'profile' && <ProfileView user={currentUser} onLogout={handleLogout} />}
          </>
        ) : (
          <>
            {view === 'exams' && <StudentView exams={exams} user={currentUser} completions={completions} results={results} onStart={handleStartExam} onMarkCompleted={handleMarkCompleted} />}
            {view === 'history' && <HistoryView exams={exams} user={currentUser} completions={completions} results={results} />}
            {view === 'profile' && <ProfileView user={currentUser} onLogout={handleLogout} />}
          </>
        )}
      </main>

      <BottomNav role={currentUser.role} current={view} onChange={(v) => { setActiveLesson(null); setActiveListening(null); setListeningListOpen(false); setActiveReading(null); setReadingListOpen(false); setView(v); }} />
      <ToastContainer />

      {showLessonImport && (
        <LessonImportModal
          onClose={() => setShowLessonImport(false)}
          onImport={handleImportLessons}
          categories={categories}
        />
      )}

      {showVocabImport && (
        <VocabImportModal
          onClose={() => setShowVocabImport(false)}
          onImport={handleImportVocab}
          categories={categories}
          targetCategoryId={vocabImportCategoryId}
        />
      )}
    </div>
  );
}

export default App;
