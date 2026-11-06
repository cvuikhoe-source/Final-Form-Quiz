-- Migration: Create grammar_items table for individual grammar patterns inside a grammar lesson
-- Matching the architectural pattern of public.vocabulary_items
--
-- Created at: 2026-11-01 10:00:00 (Local time)
--
-- DESCRIPTION:
--   1. Stores individual grammar items belonging to a parent lesson (type = grammar).
--   2. One lesson (e.g. "Ngữ pháp N2") contains multiple grammar items (e.g. 140 items).
--   3. Avoids creating 140 individual lesson rows for 140 grammar patterns.

CREATE TABLE IF NOT EXISTS public.grammar_items (
  id text PRIMARY KEY,
  lesson_id text NOT NULL,
  item_code text NOT NULL DEFAULT '',
  item_id text NOT NULL DEFAULT '',
  grammar_pattern text NOT NULL,
  source text NOT NULL DEFAULT '',
  meaning text NOT NULL DEFAULT '',
  connection_rule text NOT NULL DEFAULT '',
  structure text NOT NULL DEFAULT '',
  caution text NOT NULL DEFAULT '',
  explanation text NOT NULL DEFAULT '',
  distinction text NOT NULL DEFAULT '',
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  example_jp text NOT NULL DEFAULT '',
  example_vi text NOT NULL DEFAULT '',
  example_analysis text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  jlpt_level text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grammar_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_grammar_items" ON public.grammar_items;
CREATE POLICY "anon_read_grammar_items" ON public.grammar_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_grammar_items" ON public.grammar_items;
CREATE POLICY "anon_insert_grammar_items" ON public.grammar_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_grammar_items" ON public.grammar_items;
CREATE POLICY "anon_update_grammar_items" ON public.grammar_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_grammar_items" ON public.grammar_items;
CREATE POLICY "anon_delete_grammar_items" ON public.grammar_items FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_grammar_items_lesson_id ON public.grammar_items(lesson_id);
CREATE INDEX IF NOT EXISTS idx_grammar_items_jlpt ON public.grammar_items(jlpt_level);

