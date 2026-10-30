/*
# Create core tables for QuizForms exam management app

This migration creates the complete schema for a mobile web app that manages
Microsoft Forms exams. The app uses its own username/password login (stored in
the app_users table), NOT Supabase Auth. All policies use anon+authenticated
since the frontend talks via the anon key.

## New Tables
1. app_users — accounts (admin / teacher / student) with username+password
2. subjects — custom subject catalog (Toán, Văn, etc.)
3. classes — custom class catalog (user-created, no defaults)
4. exams — exam definitions linked to Microsoft Forms
5. exam_results — scores imported from Microsoft Forms Excel exports

## Security
- RLS enabled on all tables
- TO anon, authenticated on all policies (no Supabase Auth; app manages its own users)
*/

-- ─── app_users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  assigned_classes text[] NOT NULL DEFAULT '{}',
  allowed_subjects text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_app_users" ON app_users;
CREATE POLICY "anon_read_app_users" ON app_users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_app_users" ON app_users;
CREATE POLICY "anon_insert_app_users" ON app_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_app_users" ON app_users;
CREATE POLICY "anon_update_app_users" ON app_users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_app_users" ON app_users;
CREATE POLICY "anon_delete_app_users" ON app_users FOR DELETE
  TO anon, authenticated USING (true);

-- ─── subjects ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_subjects" ON subjects;
CREATE POLICY "anon_read_subjects" ON subjects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_subjects" ON subjects;
CREATE POLICY "anon_insert_subjects" ON subjects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_subjects" ON subjects;
CREATE POLICY "anon_update_subjects" ON subjects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_subjects" ON subjects;
CREATE POLICY "anon_delete_subjects" ON subjects FOR DELETE
  TO anon, authenticated USING (true);

-- ─── classes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_classes" ON classes;
CREATE POLICY "anon_read_classes" ON classes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_classes" ON classes;
CREATE POLICY "anon_insert_classes" ON classes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_classes" ON classes;
CREATE POLICY "anon_update_classes" ON classes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_classes" ON classes;
CREATE POLICY "anon_delete_classes" ON classes FOR DELETE
  TO anon, authenticated USING (true);

-- ─── exams ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  title text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL DEFAULT '',
  duration_minutes int NOT NULL DEFAULT 15,
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upcoming', 'closed')),
  forms_url text NOT NULL,
  target_classes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_exams" ON exams;
CREATE POLICY "anon_read_exams" ON exams FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exams" ON exams;
CREATE POLICY "anon_insert_exems" ON exams;
CREATE POLICY "anon_insert_exams" ON exams FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exams" ON exams;
CREATE POLICY "anon_update_exams" ON exams FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exams" ON exams;
CREATE POLICY "anon_delete_exams" ON exams FOR DELETE
  TO anon, authenticated USING (true);

-- ─── exam_results ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_results (
  id text PRIMARY KEY,
  exam_id text NOT NULL,
  student_name text NOT NULL,
  student_username text NOT NULL DEFAULT '',
  class_name text NOT NULL DEFAULT '',
  exam_title text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_exam_results" ON exam_results;
CREATE POLICY "anon_read_exam_results" ON exam_results FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exam_results" ON exam_results;
CREATE POLICY "anon_insert_exam_results" ON exam_results FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exam_results" ON exam_results;
CREATE POLICY "anon_update_exam_results" ON exam_results FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exam_results" ON exam_results;
CREATE POLICY "anon_delete_exam_results" ON exam_results FOR DELETE
  TO anon, authenticated USING (true);

-- Enable realtime for exams and exam_results
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'exams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exams;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'exam_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exam_results;
  END IF;
END $$;
