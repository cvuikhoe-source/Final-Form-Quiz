/*
# Create lesson_categories table and add category_id to lessons

This migration introduces a 2-tier lesson hierarchy:
  Tier 1: Lesson Categories (e.g. "Bài học Ngữ pháp", "Bài học Từ vựng", "Bài học Nghe")
  Tier 2: Individual lessons belonging to a category

## New Tables
1. lesson_categories
   - id (text, primary key)
   - title (text, not null) — display name, e.g. "Bài học Ngữ pháp"
   - icon (text) — lucide icon name for display
   - teacher_name (text) — teacher responsible for this category
   - target_classes (text[]) — which classes can see this category; empty = all
   - sort_order (int) — display order
   - created_at (timestamptz)

## Modified Tables
- lessons: added category_id (text, nullable) — foreign key to lesson_categories.id

## Security
- RLS enabled on lesson_categories
- TO anon, authenticated CRUD (no Supabase Auth; app manages its own users)
*/

CREATE TABLE IF NOT EXISTS lesson_categories (
  id text PRIMARY KEY,
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'BookOpen',
  teacher_name text NOT NULL DEFAULT '',
  target_classes text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lesson_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_lesson_categories" ON lesson_categories;
CREATE POLICY "anon_read_lesson_categories" ON lesson_categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lesson_categories" ON lesson_categories;
CREATE POLICY "anon_insert_lesson_categories" ON lesson_categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lesson_categories" ON lesson_categories;
CREATE POLICY "anon_update_lesson_categories" ON lesson_categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lesson_categories" ON lesson_categories;
CREATE POLICY "anon_delete_lesson_categories" ON lesson_categories FOR DELETE
  TO anon, authenticated USING (true);

-- Add category_id to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS category_id text;

-- Add realtime for lesson_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lesson_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lesson_categories;
  END IF;
END $$;
