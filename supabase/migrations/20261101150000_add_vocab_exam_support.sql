-- Migration: Add vocabulary exam support columns to exam_questions
-- File: supabase/migrations/20261101150000_add_vocab_exam_support.sql

-- 1. Add optional jsonb column for structured option details (A, B, C, D details)
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS option_details jsonb,
  ADD COLUMN IF NOT EXISTS exam_type text DEFAULT 'grammar';

-- 2. Index for filtering exam questions by exam_type if specified
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_type ON public.exam_questions(exam_type);

