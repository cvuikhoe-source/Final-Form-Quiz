/*
# Reading lessons feature (Bài học Đọc)

Adds reading-comprehension lessons: Japanese reading text with Vietnamese
translation, an illustration flip-card, questions, grammar notes, and
per-user progress. Follows the same security model as the listening
feature: correct answers/explanations are never readable from the data
API before submission — grading happens server-side.

1. New Tables
- `reading_lessons` — one row per reading (course, lesson_no, Japanese
  title/text, Vietnamese title/translation, image URL, estimated minutes,
  display order, status draft/published/archived).
- `reading_questions` — questions (single_choice / multiple_choice /
  true_false) with options, correct answer, explanation, Japanese evidence
  quote, points. NO SELECT policy: answers reachable only via functions.
- `reading_grammar` — grammar notes (pattern, meaning, formation, example,
  translation, note). Not sensitive; full CRUD.
- `reading_progress` — per (user_id, reading_id): answers, score, completed,
  scroll position, UI state (accordion/flip), last graded result JSON for
  restoring the review after reload, updated_at.

2. Security
- RLS enabled on all four tables; anon+authenticated CRUD consistent with
  the app's own user system (no Supabase Auth).
- reading_questions has NO SELECT policy on purpose.
- `get_reading_questions(p_reading_id)` — SECURITY DEFINER, returns question
  data WITHOUT correct_answer/explanation/evidence, only for published
  readings (the student-facing fetch).
- `get_reading_questions_admin(p_reading_id)` — full rows for the editor.
- `submit_reading_attempt(p_reading_id, p_user_id, p_answers)` — SECURITY
  DEFINER server-side grading: validates the reading is published and the
  payload shape, grades all questions (single/multiple/true-false via
  letter-set comparison), upserts reading_progress with completed=true and
  result_json, returns the full review only after submission.
- `import_reading_data(p_lessons, p_questions, p_grammar)` — SECURITY
  DEFINER atomic Excel import: validates levels, statuses, question types,
  answers, duplicate ids and references inside one PL/pgSQL block, upserts
  by id, and reports created/updated counts. A failure leaves no partial
  data.
*/

CREATE TABLE IF NOT EXISTS reading_lessons (
  id text PRIMARY KEY,
  course_id text NOT NULL DEFAULT '',
  lesson_no int NOT NULL DEFAULT 0,
  title_ja text NOT NULL,
  title_vi text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'N5' CHECK (level IN ('N5','N4','N3','N2','N1')),
  category text NOT NULL DEFAULT '',
  reading_text_ja text NOT NULL,
  translation_vi text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  estimated_minutes int NOT NULL DEFAULT 5,
  display_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_questions (
  id text PRIMARY KEY,
  reading_id text NOT NULL REFERENCES reading_lessons(id) ON DELETE CASCADE,
  question_no int NOT NULL DEFAULT 0,
  question_type text NOT NULL DEFAULT 'single_choice' CHECK (question_type IN ('single_choice','multiple_choice','true_false')),
  question_text_vi text NOT NULL,
  option_a text NOT NULL DEFAULT '',
  option_b text NOT NULL DEFAULT '',
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_answer text NOT NULL,
  explanation_vi text NOT NULL DEFAULT '',
  evidence_ja text NOT NULL DEFAULT '',
  points int NOT NULL DEFAULT 1 CHECK (points >= 0 AND points <= 100),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reading_id, question_no)
);

CREATE TABLE IF NOT EXISTS reading_grammar (
  id text PRIMARY KEY,
  reading_id text NOT NULL REFERENCES reading_lessons(id) ON DELETE CASCADE,
  grammar_no int NOT NULL DEFAULT 0,
  pattern text NOT NULL,
  meaning_vi text NOT NULL DEFAULT '',
  formation text NOT NULL DEFAULT '',
  example_ja text NOT NULL DEFAULT '',
  example_vi text NOT NULL DEFAULT '',
  note_vi text NOT NULL DEFAULT '',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id text NOT NULL,
  reading_id text NOT NULL REFERENCES reading_lessons(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  question_count int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  reading_scroll_position numeric NOT NULL DEFAULT 0,
  ui_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reading_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_questions_lesson ON reading_questions(reading_id);
CREATE INDEX IF NOT EXISTS idx_reading_grammar_lesson ON reading_grammar(reading_id);

ALTER TABLE reading_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_grammar ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_reading_lessons" ON reading_lessons;
CREATE POLICY "anon_read_reading_lessons" ON reading_lessons FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reading_lessons" ON reading_lessons;
CREATE POLICY "anon_insert_reading_lessons" ON reading_lessons FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reading_lessons" ON reading_lessons;
CREATE POLICY "anon_update_reading_lessons" ON reading_lessons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reading_lessons" ON reading_lessons;
CREATE POLICY "anon_delete_reading_lessons" ON reading_lessons FOR DELETE
  TO anon, authenticated USING (true);

-- Questions: write-only via data API; reads go through the functions below.
DROP POLICY IF EXISTS "anon_insert_reading_questions" ON reading_questions;
CREATE POLICY "anon_insert_reading_questions" ON reading_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reading_questions" ON reading_questions;
CREATE POLICY "anon_update_reading_questions" ON reading_questions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reading_questions" ON reading_questions;
CREATE POLICY "anon_delete_reading_questions" ON reading_questions FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_read_reading_grammar" ON reading_grammar;
CREATE POLICY "anon_read_reading_grammar" ON reading_grammar FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reading_grammar" ON reading_grammar;
CREATE POLICY "anon_insert_reading_grammar" ON reading_grammar FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reading_grammar" ON reading_grammar;
CREATE POLICY "anon_update_reading_grammar" ON reading_grammar FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reading_grammar" ON reading_grammar;
CREATE POLICY "anon_delete_reading_grammar" ON reading_grammar FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_read_reading_progress" ON reading_progress;
CREATE POLICY "anon_read_reading_progress" ON reading_progress FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reading_progress" ON reading_progress;
CREATE POLICY "anon_insert_reading_progress" ON reading_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reading_progress" ON reading_progress;
CREATE POLICY "anon_update_reading_progress" ON reading_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reading_progress" ON reading_progress;
CREATE POLICY "anon_delete_reading_progress" ON reading_progress FOR DELETE
  TO anon, authenticated USING (true);

-- ── Student question fetch (no answers) ────────────────────────

CREATE OR REPLACE FUNCTION get_reading_questions(p_reading_id text)
RETURNS TABLE (
  id text,
  reading_id text,
  question_no int,
  question_type text,
  question_text_vi text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  points int,
  display_order int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.reading_id, q.question_no, q.question_type,
         q.question_text_vi, q.option_a, q.option_b, q.option_c, q.option_d,
         q.points, q.display_order
  FROM reading_questions q
  JOIN reading_lessons l ON l.id = q.reading_id
  WHERE q.reading_id = p_reading_id AND l.status = 'published'
  ORDER BY q.question_no;
$$;

GRANT EXECUTE ON FUNCTION get_reading_questions(text) TO anon, authenticated;

-- ── Admin question fetch (full) ────────────────────────────────

CREATE OR REPLACE FUNCTION get_reading_questions_admin(p_reading_id text)
RETURNS SETOF reading_questions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM reading_questions WHERE reading_id = p_reading_id ORDER BY question_no;
$$;

GRANT EXECUTE ON FUNCTION get_reading_questions_admin(text) TO anon, authenticated;

-- ── Server-side grading ────────────────────────────────────────

-- Letter-set comparison: "BD" equals "DB" (order-insensitive, for
-- multiple_choice); single letters and true/false work the same way.
CREATE OR REPLACE FUNCTION reading_answer_matches(p_correct text, p_chosen text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (SELECT string_agg(c, '' ORDER BY c) FROM unnest(string_to_array(upper(trim(p_correct)), NULL)) AS t(c))
       = (SELECT string_agg(c, '' ORDER BY c) FROM unnest(string_to_array(upper(trim(p_chosen)), NULL)) AS t(c));
$$;

CREATE OR REPLACE FUNCTION submit_reading_attempt(
  p_reading_id text,
  p_user_id text,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson reading_lessons;
  v_q reading_questions;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_correct int := 0;
  v_count int := 0;
  v_details jsonb := '[]'::jsonb;
  v_chosen text;
  v_ok boolean;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_USER';
  END IF;
  IF jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_ANSWERS';
  END IF;

  SELECT * INTO v_lesson FROM reading_lessons WHERE id = p_reading_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'READING_NOT_FOUND';
  END IF;
  IF v_lesson.status <> 'published' THEN
    RAISE EXCEPTION 'READING_NOT_PUBLISHED';
  END IF;

  FOR v_q IN SELECT * FROM reading_questions WHERE reading_id = p_reading_id ORDER BY question_no
  LOOP
    v_count := v_count + 1;
    v_total := v_total + v_q.points;
    v_chosen := NULLIF(trim(coalesce(p_answers ->> v_q.id, '')), '');
    IF v_chosen IS NOT NULL AND upper(v_chosen) ~ '[^A-D]' THEN
      RAISE EXCEPTION 'INVALID_ANSWERS';
    END IF;
    v_ok := v_chosen IS NOT NULL AND reading_answer_matches(v_q.correct_answer, v_chosen);
    IF v_ok THEN
      v_correct := v_correct + 1;
      v_earned := v_earned + v_q.points;
    END IF;
    v_details := v_details || jsonb_build_object(
      'questionId', v_q.id,
      'questionNo', v_q.question_no,
      'chosen', v_chosen,
      'correct', v_q.correct_answer,
      'isCorrect', v_ok,
      'points', v_q.points,
      'earned', (CASE WHEN v_ok THEN v_q.points ELSE 0 END),
      'explanationVi', v_q.explanation_vi,
      'evidenceJa', v_q.evidence_ja
    );
  END LOOP;

  INSERT INTO reading_progress (user_id, reading_id, answers, score, total_points,
    correct_count, question_count, completed, result_json, updated_at)
  VALUES (trim(p_user_id), p_reading_id, p_answers, v_earned, v_total,
    v_correct, v_count, true,
    jsonb_build_object(
      'score', v_earned, 'totalPoints', v_total,
      'correctCount', v_correct, 'questionCount', v_count, 'details', v_details),
    now())
  ON CONFLICT (user_id, reading_id) DO UPDATE SET
    answers = EXCLUDED.answers,
    score = EXCLUDED.score,
    total_points = EXCLUDED.total_points,
    correct_count = EXCLUDED.correct_count,
    question_count = EXCLUDED.question_count,
    completed = true,
    result_json = EXCLUDED.result_json,
    updated_at = now();

  RETURN jsonb_build_object(
    'score', v_earned,
    'totalPoints', v_total,
    'correctCount', v_correct,
    'questionCount', v_count,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_reading_attempt(text, text, jsonb) TO anon, authenticated;

-- ── Atomic Excel import ────────────────────────────────────────

CREATE OR REPLACE FUNCTION import_reading_data(p_lessons jsonb, p_questions jsonb, p_grammar jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_r jsonb;
  v_q jsonb;
  v_g jsonb;
  v_level text;
  v_status text;
  v_qtype text;
  v_created jsonb := jsonb_build_object('lessons', 0, 'questions', 0, 'grammar', 0);
  v_updated jsonb := jsonb_build_object('lessons', 0, 'questions', 0, 'grammar', 0);
BEGIN
  IF jsonb_typeof(p_lessons) <> 'array' OR jsonb_typeof(p_questions) <> 'array'
     OR jsonb_typeof(p_grammar) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;

  FOR v_r IN SELECT * FROM jsonb_array_elements(p_lessons)
  LOOP
    IF coalesce(v_r ->> 'id', '') = '' THEN
      RAISE EXCEPTION 'READING_MISSING_ID';
    END IF;
    IF coalesce(v_r ->> 'titleJa', '') = '' OR coalesce(v_r ->> 'readingTextJa', '') = '' THEN
      RAISE EXCEPTION 'READING_MISSING_FIELD (%)', v_r ->> 'id';
    END IF;
    v_level := lower(coalesce(v_r ->> 'level', ''));
    IF v_level NOT IN ('n5','n4','n3','n2','n1') THEN
      RAISE EXCEPTION 'READING_INVALID_LEVEL (%)', v_r ->> 'id';
    END IF;
    v_status := lower(coalesce(v_r ->> 'status', ''));
    IF v_status NOT IN ('draft','published','archived') THEN
      RAISE EXCEPTION 'READING_INVALID_STATUS (%)', v_r ->> 'id';
    END IF;

    IF EXISTS (SELECT 1 FROM reading_lessons WHERE id = v_r ->> 'id') THEN
      v_updated := jsonb_set(v_updated, '{lessons}', to_jsonb((v_updated ->> 'lessons')::int + 1));
    ELSE
      v_created := jsonb_set(v_created, '{lessons}', to_jsonb((v_created ->> 'lessons')::int + 1));
    END IF;

    INSERT INTO reading_lessons (id, course_id, lesson_no, title_ja, title_vi, level,
      category, reading_text_ja, translation_vi, image_url, estimated_minutes,
      display_order, status)
    VALUES (
      v_r ->> 'id',
      coalesce(v_r ->> 'courseId', ''),
      coalesce((v_r ->> 'lessonNo')::int, 0),
      v_r ->> 'titleJa',
      coalesce(v_r ->> 'titleVi', ''),
      upper(v_level),
      coalesce(v_r ->> 'category', ''),
      v_r ->> 'readingTextJa',
      coalesce(v_r ->> 'translationVi', ''),
      coalesce(v_r ->> 'imageUrl', ''),
      coalesce((v_r ->> 'estimatedMinutes')::int, 5),
      coalesce((v_r ->> 'displayOrder')::int, 0),
      v_status
    )
    ON CONFLICT (id) DO UPDATE SET
      course_id = EXCLUDED.course_id,
      lesson_no = EXCLUDED.lesson_no,
      title_ja = EXCLUDED.title_ja,
      title_vi = EXCLUDED.title_vi,
      level = EXCLUDED.level,
      category = EXCLUDED.category,
      reading_text_ja = EXCLUDED.reading_text_ja,
      translation_vi = EXCLUDED.translation_vi,
      image_url = EXCLUDED.image_url,
      estimated_minutes = EXCLUDED.estimated_minutes,
      display_order = EXCLUDED.display_order,
      status = EXCLUDED.status;
  END LOOP;

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    IF coalesce(v_q ->> 'id', '') = '' THEN
      RAISE EXCEPTION 'QUESTION_MISSING_ID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM reading_lessons WHERE id = v_q ->> 'readingId') THEN
      RAISE EXCEPTION 'QUESTION_READING_NOT_FOUND (%)', v_q ->> 'id';
    END IF;
    IF coalesce(v_q ->> 'questionTextVi', '') = '' THEN
      RAISE EXCEPTION 'QUESTION_MISSING_FIELD (%)', v_q ->> 'id';
    END IF;
    v_qtype := lower(coalesce(v_q ->> 'questionType', 'single_choice'));
    IF v_qtype NOT IN ('single_choice','multiple_choice','true_false') THEN
      RAISE EXCEPTION 'QUESTION_INVALID_TYPE (%)', v_q ->> 'id';
    END IF;
    IF coalesce(v_q ->> 'correctAnswer', '') = ''
       OR upper(v_q ->> 'correctAnswer') ~ '[^A-D]' THEN
      RAISE EXCEPTION 'QUESTION_INVALID_ANSWER (%)', v_q ->> 'id';
    END IF;

    IF EXISTS (SELECT 1 FROM reading_questions WHERE id = v_q ->> 'id') THEN
      v_updated := jsonb_set(v_updated, '{questions}', to_jsonb((v_updated ->> 'questions')::int + 1));
    ELSE
      v_created := jsonb_set(v_created, '{questions}', to_jsonb((v_created ->> 'questions')::int + 1));
    END IF;

    INSERT INTO reading_questions (id, reading_id, question_no, question_type,
      question_text_vi, option_a, option_b, option_c, option_d, correct_answer,
      explanation_vi, evidence_ja, points, display_order)
    VALUES (
      v_q ->> 'id',
      v_q ->> 'readingId',
      coalesce((v_q ->> 'questionNo')::int, 0),
      v_qtype,
      v_q ->> 'questionTextVi',
      coalesce(v_q ->> 'optionA', ''),
      coalesce(v_q ->> 'optionB', ''),
      coalesce(v_q ->> 'optionC', ''),
      coalesce(v_q ->> 'optionD', ''),
      upper(v_q ->> 'correctAnswer'),
      coalesce(v_q ->> 'explanationVi', ''),
      coalesce(v_q ->> 'evidenceJa', ''),
      coalesce((v_q ->> 'points')::int, 1),
      coalesce((v_q ->> 'displayOrder')::int, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      reading_id = EXCLUDED.reading_id,
      question_no = EXCLUDED.question_no,
      question_type = EXCLUDED.question_type,
      question_text_vi = EXCLUDED.question_text_vi,
      option_a = EXCLUDED.option_a,
      option_b = EXCLUDED.option_b,
      option_c = EXCLUDED.option_c,
      option_d = EXCLUDED.option_d,
      correct_answer = EXCLUDED.correct_answer,
      explanation_vi = EXCLUDED.explanation_vi,
      evidence_ja = EXCLUDED.evidence_ja,
      points = EXCLUDED.points,
      display_order = EXCLUDED.display_order;
  END LOOP;

  FOR v_g IN SELECT * FROM jsonb_array_elements(p_grammar)
  LOOP
    IF coalesce(v_g ->> 'id', '') = '' THEN
      RAISE EXCEPTION 'GRAMMAR_MISSING_ID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM reading_lessons WHERE id = v_g ->> 'readingId') THEN
      RAISE EXCEPTION 'GRAMMAR_READING_NOT_FOUND (%)', v_g ->> 'id';
    END IF;
    IF coalesce(v_g ->> 'pattern', '') = '' THEN
      RAISE EXCEPTION 'GRAMMAR_MISSING_FIELD (%)', v_g ->> 'id';
    END IF;

    IF EXISTS (SELECT 1 FROM reading_grammar WHERE id = v_g ->> 'id') THEN
      v_updated := jsonb_set(v_updated, '{grammar}', to_jsonb((v_updated ->> 'grammar')::int + 1));
    ELSE
      v_created := jsonb_set(v_created, '{grammar}', to_jsonb((v_created ->> 'grammar')::int + 1));
    END IF;

    INSERT INTO reading_grammar (id, reading_id, grammar_no, pattern, meaning_vi,
      formation, example_ja, example_vi, note_vi, display_order)
    VALUES (
      v_g ->> 'id',
      v_g ->> 'readingId',
      coalesce((v_g ->> 'grammarNo')::int, 0),
      v_g ->> 'pattern',
      coalesce(v_g ->> 'meaningVi', ''),
      coalesce(v_g ->> 'formation', ''),
      coalesce(v_g ->> 'exampleJa', ''),
      coalesce(v_g ->> 'exampleVi', ''),
      coalesce(v_g ->> 'noteVi', ''),
      coalesce((v_g ->> 'displayOrder')::int, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      reading_id = EXCLUDED.reading_id,
      grammar_no = EXCLUDED.grammar_no,
      pattern = EXCLUDED.pattern,
      meaning_vi = EXCLUDED.meaning_vi,
      formation = EXCLUDED.formation,
      example_ja = EXCLUDED.example_ja,
      example_vi = EXCLUDED.example_vi,
      note_vi = EXCLUDED.note_vi,
      display_order = EXCLUDED.display_order;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION import_reading_data(jsonb, jsonb, jsonb) TO anon, authenticated;
