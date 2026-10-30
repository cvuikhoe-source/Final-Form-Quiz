/*
# Create lessons table for Grammar Lessons module

Stores structured grammar lessons parsed from teacher-uploaded Excel files.
Each lesson has 4 structured sections matching the Excel template layout.

## New Tables
1. lessons — grammar lesson metadata + all 4 section data stored as JSONB

## Security
- RLS enabled; TO anon, authenticated (no Supabase Auth; app manages its own users)
*/

CREATE TABLE IF NOT EXISTS lessons (
  id text PRIMARY KEY,
  title text NOT NULL,
  source text NOT NULL DEFAULT '',
  sheet_id text NOT NULL DEFAULT '',
  meaning text NOT NULL DEFAULT '',
  connection_rule text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  distinction text NOT NULL DEFAULT '',
  examples jsonb NOT NULL DEFAULT '[]',
  exercises jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_lessons" ON lessons;
CREATE POLICY "anon_read_lessons" ON lessons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lessons" ON lessons;
CREATE POLICY "anon_insert_lessons" ON lessons FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lessons" ON lessons;
CREATE POLICY "anon_update_lessons" ON lessons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lessons" ON lessons;
CREATE POLICY "anon_delete_lessons" ON lessons FOR DELETE
  TO anon, authenticated USING (true);
