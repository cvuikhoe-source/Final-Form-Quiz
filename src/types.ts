export type ExamStatus = 'open' | 'upcoming' | 'closed';
export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: Role;
  assignedClasses: string[];
  allowedSubjects: string[];
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  deadline: string;
  status: ExamStatus;
  formsUrl: string;
  targetClasses: string[];
  /** Per-class deadline overrides: { "MVTC-N3": ISO string }. Classes not listed use `deadline`. */
  classDeadlines: Record<string, string>;
  folderId: string | null;
  createdAt: string;
}

export interface CompletionRecord {
  id: string;
  examId: string;
  userId: string;
  completedAt: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  studentName: string;
  studentUsername: string;
  className: string;
  examTitle: string;
  score: number;
  status: 'submitted' | 'graded';
  submittedAt: string | null;
  createdAt: string;
}

// ─── Lesson Categories ────────────────────────────────────────

export type LessonCategoryIcon = 'BookOpen' | 'Languages' | 'Headphones' | 'PenTool' | 'FileText' | 'ClipboardList';

export interface LessonCategory {
  id: string;
  title: string;
  icon: LessonCategoryIcon;
  teacherName: string;
  targetClasses: string[];
  sortOrder: number;
  /** Default learning window for lessons in this category (null = no limit). */
  defaultStartAt: string | null;
  defaultDeadline: string | null;
  /** Per-class overrides: { "MVTC-N3": { startAt, deadline } }. */
  classSchedules: Record<string, { startAt: string | null; deadline: string | null }>;
  createdAt: string;
}

// ─── Grammar Lessons ──────────────────────────────────────────

export interface LessonExample {
  stt: number;
  japanese: string;
  vietnamese: string;
  analysis: string;
  vocabulary: string;
  note: string;
}

export type ExerciseType = 'multiple_choice' | 'conjugation' | 'arrange' | 'translate';

export interface LessonExercise {
  stt: number;
  type: ExerciseType;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  hint: string;
}

export interface LessonAnswer {
  stt: number;
  answer: string;
  fullSentence: string;
  explanation: string;
  commonErrors: string;
  selfAssess: string;
}

export interface Lesson {
  id: string;
  title: string;
  source: string;
  sheetId: string;
  meaning: string;
  connectionRule: string;
  notes: string;
  distinction: string;
  examples: LessonExample[];
  exercises: LessonExercise[];
  answers: LessonAnswer[];
  sortOrder: number;
  targetClasses: string[];
  categoryId: string | null;
  /** Lesson-specific learning window (null = inherit from category). */
  startAt: string | null;
  deadline: string | null;
  /** Per-class overrides for this lesson: { "MVTC": { startAt, deadline } }. */
  classSchedules: Record<string, { startAt: string | null; deadline: string | null }>;
  createdAt: string;
}

// ─── Vocabulary Items ─────────────────────────────────────────

export type MasteryStatus = 'new' | 'forgot' | 'hard' | 'almost' | 'mastered';

export interface VocabularyItem {
  id: string;
  lessonId: string;
  vocabId: string;
  vocabulary: string;
  readingHiragana: string;
  readingRomaji: string;
  onyomi: string;
  kunyomi: string;
  meaningVi: string;
  jlptLevel: string;
  wordType: string;
  tags: string;
  relatedWords: string[];
  audioText: string;
  exampleJp1: string;
  exampleReading1: string;
  exampleVi1: string;
  exampleJp2: string;
  exampleReading2: string;
  exampleVi2: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface VocabProgress {
  masteryStatus: MasteryStatus;
  reviewCount: number;
  lastReviewedAt: string | null;
  viewedBack: boolean;
}

export interface FlashcardSettings {
  fontSize: 'small' | 'medium' | 'large';
  showHiragana: boolean;
  audioEnabled: boolean;
  flipAnimation: boolean;
}

// ─── Listening Lessons ─────────────────────────────────────────

export type ListeningLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type ListeningStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ListeningSourceType = 'UPLOAD' | 'URL';
export type ListeningDifficulty = 'EASY' | 'NORMAL' | 'HARD';
export type ListeningShowExplanation = 'AFTER_SUBMIT' | 'ALWAYS' | 'NEVER';

export interface ListeningLesson {
  id: string;
  title: string;
  subtitle: string;
  level: ListeningLevel;
  category: string;
  description: string;
  audioSourceType: ListeningSourceType;
  audioSource: string;
  audioFileName: string;
  durationSeconds: number;
  transcript: string;
  teacherName: string;
  classScope: string[];
  status: ListeningStatus;
  sortOrder: number;
  createdAt: string;
}

export interface ListeningQuestionBase {
  id: string;
  lessonId: string;
  questionNo: number;
  startTimeSec: number | null;
  endTimeSec: number | null;
  questionText: string;
  questionTranslationVi: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  difficulty: ListeningDifficulty;
  points: number;
  allowReplay: boolean;
  showExplanation: ListeningShowExplanation;
  imageUrl: string;
  tags: string;
}

export type ListeningQuestion = ListeningQuestionBase;

export interface ListeningQuestionFull extends ListeningQuestionBase {
  correctAnswer: ListeningAnswerKey;
  explanationVi: string;
  explanationJa: string;
  transcriptSegment: string;
}

export type ListeningAnswerKey = 'A' | 'B' | 'C' | 'D';

export interface ListeningAttemptReviewDetail {
  questionId: string;
  questionNo: number;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
  points: number;
  earned: number;
  explanationVi: string;
  explanationJa: string;
  transcriptSegment: string;
  startTimeSec: number | null;
  endTimeSec: number | null;
}

export interface ListeningAttemptResult {
  attemptId: string;
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  details: ListeningAttemptReviewDetail[];
}

export interface ListeningProgress {
  attempts: number;
  lastScore: number | null;
  lastTotalPoints: number | null;
  lastAttemptAt: string | null;
  done: boolean;
}

export interface ListeningAttempt {
  id: string;
  lessonId: string;
  userId: string;
  username: string;
  answers: Record<string, string>;
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  createdAt: string;
}

// ─── Reading Lessons ───────────────────────────────────────────

export type ReadingLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type ReadingStatus = 'draft' | 'published' | 'archived';
export type ReadingQuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export interface ReadingLesson {
  id: string;
  courseId: string;
  lessonNo: number;
  titleJa: string;
  titleVi: string;
  level: ReadingLevel;
  category: string;
  readingTextJa: string;
  translationVi: string;
  imageUrl: string;
  estimatedMinutes: number;
  displayOrder: number;
  status: ReadingStatus;
  createdAt: string;
}

export interface ReadingQuestionSafe {
  id: string;
  readingId: string;
  questionNo: number;
  questionType: ReadingQuestionType;
  questionTextVi: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  points: number;
  displayOrder: number;
}

export interface ReadingQuestionFull extends ReadingQuestionSafe {
  correctAnswer: string;
  explanationVi: string;
  evidenceJa: string;
}

export interface ReadingGrammar {
  id: string;
  readingId: string;
  grammarNo: number;
  pattern: string;
  meaningVi: string;
  formation: string;
  exampleJa: string;
  exampleVi: string;
  noteVi: string;
  displayOrder: number;
}

export interface ReadingAnswerDetail {
  questionId: string;
  questionNo: number;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
  points: number;
  earned: number;
  explanationVi: string;
  evidenceJa: string;
}

export interface ReadingResult {
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  details: ReadingAnswerDetail[];
}

export interface ReadingUiState {
  questionExpanded?: boolean;
  grammarExpanded?: boolean;
  answerExpanded?: boolean;
  translationFlipped?: boolean;
}

export interface ReadingProgressRecord {
  answers: Record<string, string>;
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  completed: boolean;
  readingScrollPosition: number;
  uiState: ReadingUiState;
  result: ReadingResult | null;
  updatedAt: string;
}

// ─── Practice (Luyện tập) ──────────────────────────────────────

export type PracticeCategory = 'vocabulary' | 'grammar' | 'reading' | 'listening';
export type PracticeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Practice {
  id: string;
  title: string;
  category: PracticeCategory;
  level: ListeningLevel;
  linkedLessonId: string | null;
  passage: string;
  audioSourceType: ListeningSourceType;
  audioSource: string;
  audioFileName: string;
  teacherName: string;
  targetClasses: string[];
  startAt: string | null;
  deadline: string | null;
  /** Per-class overrides: { "MVTC-N3": { startAt, deadline } }. */
  classSchedules: Record<string, { startAt: string | null; deadline: string | null }>;
  allowAiTutor: boolean;
  status: PracticeStatus;
  sortOrder: number;
  folderId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export type PracticeQuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer';
export type PracticeDifficulty = 'easy' | 'medium' | 'hard';

export interface PracticeQuestion {
  id: string;
  practiceId: string;
  questionNo: number;
  questionType: PracticeQuestionType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  hint: string;
  imageUrl: string;
  points: number;
}

export interface PracticeQuestionFull extends PracticeQuestion {
  /** Letter(s) 'A'..'D' (comma-separated for multiple_choice) or answer text for short_answer. */
  correctAnswer: string;
  explanation: string;
  difficulty: PracticeDifficulty;
  questionCategory: string;
  tags: string;
}

export interface PracticeAnswerDetail {
  questionId: string;
  questionNo: number;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
  points: number;
  earned: number;
  explanation: string;
}

export interface PracticeAttemptResult {
  attemptId: string;
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  details: PracticeAnswerDetail[];
}

export interface PracticeAttempt {
  id: string;
  practiceId: string;
  userId: string;
  username: string;
  answers: Record<string, string>;
  score: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  createdAt: string;
}

export interface PracticeProgress {
  attempts: number;
  lastScore: number | null;
  lastTotalPoints: number | null;
  lastAttemptAt: string | null;
  done: boolean;
}

// ─── Exam Explorer Folders ────────────────────────────────────

export type FolderColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'slate';

export interface ExamFolder {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: FolderColor | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** Practice (Luyện tập) folder — same shape as ExamFolder. */
export type PracticeFolder = ExamFolder;

export type AdminViewMode = 'exams' | 'users' | 'stats' | 'lessons' | 'practice' | 'listening' | 'reading' | 'profile';
export type TeacherViewMode = 'exams' | 'students' | 'stats' | 'lessons' | 'practice' | 'listening' | 'reading' | 'profile';
export type StudentViewMode = 'exams' | 'history' | 'lessons' | 'practice' | 'listening' | 'reading' | 'profile';
export type ViewMode = AdminViewMode | TeacherViewMode | StudentViewMode;
