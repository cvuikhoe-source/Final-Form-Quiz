/*
# Add folder management to practice module (Luyện tập)

Gives practices the same folder tree management as exams: nested folders,
colors, archive/restore, and moving practices between folders. Mirrors the
exam_folders structure exactly.

1. New Tables
- `practice_folders` — one row per folder: id (text), parent_id (nullable,
  self-reference for multi-level nesting), name, description, color
  (blue/green/orange/purple/rose/slate), sort_order, created_by, created_at,
  updated_at, archived_at (null = active).

2. Modified Tables
- `practices` — new columns:
  - `folder_id` (text, references practice_folders.id ON DELETE SET NULL):
    which folder the practice lives in; NULL = Trang chủ.
  - `archived_at` (timestamptz, nullable): soft archive so practices can be
    hidden and restored, matching the exams philosophy.

3. New Functions
- `get_practice_question_counts()` — SECURITY DEFINER; returns question count
  per practice for teacher cards (practice_questions has no direct SELECT
  policy, so this is the safe counting endpoint).

4. Security
- RLS enabled on practice_folders with full anon+authenticated CRUD (shared
  teaching content, consistent with exam_folders).
*/

CREATE TABLE IF NOT EXISTS practice_folders (
  id text PRIMARY KEY,
  parent_id text REFERENCES practice_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE practice_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_practice_folders" ON practice_folders;
CREATE POLICY "anon_read_practice_folders" ON practice_folders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_practice_folders" ON practice_folders;
CREATE POLICY "anon_insert_practice_folders" ON practice_folders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_practice_folders" ON practice_folders;
CREATE POLICY "anon_update_practice_folders" ON practice_folders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_practice_folders" ON practice_folders;
CREATE POLICY "anon_delete_practice_folders" ON practice_folders FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE practices ADD COLUMN IF NOT EXISTS folder_id text
  REFERENCES practice_folders(id) ON DELETE SET NULL;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_practices_folder ON practices(folder_id);

-- Question count per practice for teacher cards (no answers exposed)
CREATE OR REPLACE FUNCTION get_practice_question_counts()
RETURNS TABLE (practice_id text, question_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT practice_id, count(*) FROM practice_questions GROUP BY practice_id;
$$;

GRANT EXECUTE ON FUNCTION get_practice_question_counts() TO anon, authenticated;
