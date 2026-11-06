-- Migration: Create exam_questions and exam_question_progress tables
-- File: supabase/migrations/20261101130000_create_exam_questions.sql

-- 1. Create exam_questions table
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_no integer NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice',
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer text NOT NULL,
  time_seconds integer NOT NULL DEFAULT 60,
  answer_explanation text NOT NULL DEFAULT '',
  vocabulary_han_viet text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exam_questions_lesson_no UNIQUE (lesson_id, question_no)
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_lesson ON public.exam_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_sort ON public.exam_questions(lesson_id, sort_order);

-- 2. Create exam_question_progress table
CREATE TABLE IF NOT EXISTS public.exam_question_progress (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  selected_option text,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exam_question_progress UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_progress_user_lesson ON public.exam_question_progress(user_id, lesson_id);

-- 3. Enable RLS
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_question_progress ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for exam_questions
DROP POLICY IF EXISTS "read_exam_questions" ON public.exam_questions;
CREATE POLICY "read_exam_questions" ON public.exam_questions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_teacher_mutate_exam_questions" ON public.exam_questions;
CREATE POLICY "admin_teacher_mutate_exam_questions" ON public.exam_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'teacher')
    )
  );

-- 5. RLS Policies for exam_question_progress
DROP POLICY IF EXISTS "users_read_own_progress" ON public.exam_question_progress;
CREATE POLICY "users_read_own_progress" ON public.exam_question_progress
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'teacher')
    )
  );

DROP POLICY IF EXISTS "users_upsert_own_progress" ON public.exam_question_progress;
CREATE POLICY "users_upsert_own_progress" ON public.exam_question_progress
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

