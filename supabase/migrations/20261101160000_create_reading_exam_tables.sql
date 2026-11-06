-- Migration: Create reading exam passages table and extend exam_questions
-- File: supabase/migrations/20261101160000_create_reading_exam_tables.sql

-- 1. Create reading_exam_passages table
CREATE TABLE IF NOT EXISTS public.reading_exam_passages (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  passage_key text NOT NULL,
  passage_title text NOT NULL DEFAULT '',
  passage_ja text NOT NULL,
  passage_vi text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for reading_exam_passages
CREATE INDEX IF NOT EXISTS idx_reading_exam_passages_lesson_id ON public.reading_exam_passages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_reading_exam_passages_lesson_sort ON public.reading_exam_passages(lesson_id, sort_order);

-- Enable RLS on reading_exam_passages
ALTER TABLE public.reading_exam_passages ENABLE ROW LEVEL SECURITY;

-- Reading passages RLS Policies
DROP POLICY IF EXISTS "reading_passages_select_all" ON public.reading_exam_passages;
CREATE POLICY "reading_passages_select_all"
  ON public.reading_exam_passages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "reading_passages_all_operations" ON public.reading_exam_passages;
CREATE POLICY "reading_passages_all_operations"
  ON public.reading_exam_passages FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Extend exam_questions for reading exams
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS passage_id text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS kanji_vocabulary text,
  ADD COLUMN IF NOT EXISTS grammar_structures text;

CREATE INDEX IF NOT EXISTS idx_exam_questions_passage_id ON public.exam_questions(passage_id);

-- 3. Extend lessons table for passage count
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS passage_count integer DEFAULT 0;

