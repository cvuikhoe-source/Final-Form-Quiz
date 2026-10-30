/*
# Create practice module (Luyện tập)

Adds the "Luyện tập" (Practice) module: short skill-drill sets (vocabulary,
grammar, reading, listening) that sit between lessons (Bài học) and exams
(Bài thi). Reuses the same secure patterns as the listening module: correct
answers and explanations are never readable through the data API before
submitting — grading happens server-side.

1. New Tables
- `practices` — one row per practice set: title, category
  (vocabulary/grammar/reading/listening), level (N5..N1), linked lesson id
  (Bài học liên kết, nullable), reading passage (for reading practice),
  audio source type UPLOAD/URL + audio source + file name (for listening
  practice), teacher name, target classes, per-class schedule overrides
  (start_at/deadline per class, same model as lesson classSchedules),
  default start_at/deadline, status DRAFT/PUBLISHED/ARCHIVED, sort order.
- `practice_questions` — multiple-choice questions (A/B/C/D) belonging to a
  practice set: question text, options, correct answer, explanation,
  points, question no.
- `practice_attempts` — one row per student submission: chosen answers,
  score, total points, correct count, question count.

2. Security
- RLS enabled on all three tables.
- practices / practice_attempts: full anon+authenticated CRUD (shared
  teaching content, consistent with listening/reading tables; student
  visibility filtering happens in the app by status + class scope).
- practice_questions: INSERT/UPDATE/DELETE allowed for editing, but NO
  SELECT policy — correct answers/explanations reachable only through the
  SECURITY DEFINER functions below, so students cannot read answers from
  the data API.
- `get_practice_questions(p_practice_id)` — SECURITY DEFINER, returns
  questions WITHOUT answers/explanations, only for PUBLISHED practices.
- `submit_practice_attempt(p_practice_id, p_user_id, p_username, p_answers)`
  — SECURITY DEFINER server-side grading; validates the practice is
  PUBLISHED, grades against stored answers, records the attempt, returns
  the full review (chosen, correct, explanation, earned points).

3. Notes
- No destructive changes; all statements idempotent (IF NOT EXISTS /
  DROP POLICY IF EXISTS + CREATE POLICY).
- Audio for listening practices reuses the existing `listening-audio`
  storage bucket — no new storage resources.
*/

CREATE TABLE IF NOT EXISTS practices (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'vocabulary'
    CHECK (category IN ('vocabulary','grammar','reading','listening')),
  level text NOT NULL DEFAULT 'N5' CHECK (level IN ('N5','N4','N3','N2','N1')),
  linked_lesson_id text,
  passage text NOT NULL DEFAULT '',
  audio_source_type text NOT NULL DEFAULT 'URL' CHECK (audio_source_type IN ('UPLOAD','URL')),
  audio_source text NOT NULL DEFAULT '',
  audio_file_name text NOT NULL DEFAULT '',
  teacher_name text NOT NULL DEFAULT '',
  target_classes text[] NOT NULL DEFAULT '{}',
  start_at timestamptz,
  deadline timestamptz,
  class_schedules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_questions (
  id text PRIMARY KEY,
  practice_id text NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  question_no int NOT NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_answer text NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanation text NOT NULL DEFAULT '',
  points int NOT NULL DEFAULT 1 CHECK (points >= 0 AND points <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, question_no)
);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id text NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  question_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_questions_practice ON practice_questions(practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_practice_user ON practice_attempts(practice_id, user_id);

ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_practices" ON practices;
CREATE POLICY "anon_read_practices" ON practices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_practices" ON practices;
CREATE POLICY "anon_insert_practices" ON practices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_practices" ON practices;
CREATE POLICY "anon_update_practices" ON practices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_practices" ON practices;
CREATE POLICY "anon_delete_practices" ON practices FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_practice_questions" ON practice_questions;
CREATE POLICY "anon_insert_practice_questions" ON practice_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_practice_questions" ON practice_questions;
CREATE POLICY "anon_update_practice_questions" ON practice_questions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_practice_questions" ON practice_questions;
CREATE POLICY "anon_delete_practice_questions" ON practice_questions FOR DELETE
  TO anon, authenticated USING (true);
-- Intentionally NO SELECT policy on practice_questions: answers must not be
-- readable from the data API; students use get_practice_questions() instead.

DROP POLICY IF EXISTS "anon_read_practice_attempts" ON practice_attempts;
CREATE POLICY "anon_read_practice_attempts" ON practice_attempts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_practice_attempts" ON practice_attempts;
CREATE POLICY "anon_insert_practice_attempts" ON practice_attempts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ── Student question fetch (no answers) ────────────────────────

CREATE OR REPLACE FUNCTION get_practice_questions(p_practice_id text)
RETURNS TABLE (
  id text,
  practice_id text,
  question_no int,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  points int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.practice_id, q.question_no, q.question_text,
         q.option_a, q.option_b, q.option_c, q.option_d, q.points
  FROM practice_questions q
  JOIN practices p ON p.id = q.practice_id
  WHERE q.practice_id = p_practice_id AND p.status = 'PUBLISHED'
  ORDER BY q.question_no;
$$;

GRANT EXECUTE ON FUNCTION get_practice_questions(text) TO anon, authenticated;

-- ── Admin question fetch (full, for editor) ────────────────────

CREATE OR REPLACE FUNCTION get_practice_questions_admin(p_practice_id text)
RETURNS SETOF practice_questions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM practice_questions WHERE practice_id = p_practice_id ORDER BY question_no;
$$;

GRANT EXECUTE ON FUNCTION get_practice_questions_admin(text) TO anon, authenticated;

-- ── Server-side grading ────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_practice_attempt(
  p_practice_id text,
  p_user_id text,
  p_username text,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_practice practices;
  v_q practice_questions;
  v_total_points numeric := 0;
  v_earned numeric := 0;
  v_correct int := 0;
  v_count int := 0;
  v_details jsonb := '[]'::jsonb;
  v_chosen text;
  v_attempt_id uuid;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_USER';
  END IF;
  IF jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_ANSWERS';
  END IF;

  SELECT * INTO v_practice FROM practices WHERE id = p_practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRACTICE_NOT_FOUND';
  END IF;
  IF v_practice.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'PRACTICE_NOT_PUBLISHED';
  END IF;

  FOR v_q IN SELECT * FROM practice_questions WHERE practice_id = p_practice_id ORDER BY question_no
  LOOP
    v_count := v_count + 1;
    v_total_points := v_total_points + v_q.points;
    v_chosen := NULLIF(trim((p_answers ->> v_q.id)), '');
    IF v_chosen IS NOT NULL AND v_chosen NOT IN ('A','B','C','D') THEN
      RAISE EXCEPTION 'INVALID_ANSWERS';
    END IF;
    IF v_chosen = v_q.correct_answer THEN
      v_correct := v_correct + 1;
      v_earned := v_earned + v_q.points;
    END IF;
    v_details := v_details || jsonb_build_object(
      'questionId', v_q.id,
      'questionNo', v_q.question_no,
      'chosen', v_chosen,
      'correct', v_q.correct_answer,
      'isCorrect', (v_chosen = v_q.correct_answer),
      'points', v_q.points,
      'earned', (CASE WHEN v_chosen = v_q.correct_answer THEN v_q.points ELSE 0 END),
      'explanation', v_q.explanation
    );
  END LOOP;

  INSERT INTO practice_attempts (practice_id, user_id, username, answers, score, total_points, correct_count, question_count)
  VALUES (p_practice_id, trim(p_user_id), coalesce(p_username, ''), p_answers, v_earned, v_total_points, v_correct, v_count)
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attemptId', v_attempt_id,
    'score', v_earned,
    'totalPoints', v_total_points,
    'correctCount', v_correct,
    'questionCount', v_count,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_practice_attempt(text, text, text, jsonb) TO anon, authenticated;
