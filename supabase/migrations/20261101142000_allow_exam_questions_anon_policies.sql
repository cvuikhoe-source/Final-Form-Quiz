-- Migration: Align exam_questions and exam_question_progress RLS policies with app architecture

GRANT ALL ON public.exam_questions TO anon, authenticated;
GRANT ALL ON public.exam_question_progress TO anon, authenticated;

-- Policies for exam_questions
DROP POLICY IF EXISTS "admin_teacher_mutate_exam_questions" ON public.exam_questions;
DROP POLICY IF EXISTS "anon_all_exam_questions" ON public.exam_questions;

CREATE POLICY "anon_all_exam_questions" ON public.exam_questions
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for exam_question_progress
DROP POLICY IF EXISTS "users_read_own_progress" ON public.exam_question_progress;
DROP POLICY IF EXISTS "users_upsert_own_progress" ON public.exam_question_progress;
DROP POLICY IF EXISTS "anon_all_exam_question_progress" ON public.exam_question_progress;

CREATE POLICY "anon_all_exam_question_progress" ON public.exam_question_progress
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

