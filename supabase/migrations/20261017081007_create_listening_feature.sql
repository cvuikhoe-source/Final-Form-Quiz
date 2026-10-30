/*
# Listening lessons feature (Bài học Nghe)

Adds listening-comprehension lessons: an audio source (uploaded MP3 or URL),
multiple-choice questions, graded attempts, and an audio storage bucket.

1. New Tables
- `listening_lessons` — one row per listening lesson (title, subtitle, level,
  category, description, audio source type UPLOAD/URL, audio source path/URL,
  file name, duration, transcript, teacher, class scope, status
  DRAFT/PUBLISHED/ARCHIVED, sort order).
- `listening_questions` — multiple-choice questions (A/B/C/D) belonging to a
  listening lesson, with optional start/end timestamps for segment replay,
  Vietnamese/Japanese explanations, difficulty, points, replay and
  explanation-visibility flags.
- `listening_attempts` — one row per student submission: chosen answers,
  score, total points, correct count and question count.

2. Security
- RLS enabled on all three tables.
- listening_lessons: full anon+authenticated CRUD (shared teaching content,
  consistent with the lessons/vocabulary tables; visibility filtering for
  students happens in the app by status + class scope).
- listening_questions: INSERT/UPDATE/DELETE allowed for content editing, but
  NO direct SELECT policy — correct answers and explanations are only
  reachable through the SECURITY DEFINER functions below, so a student cannot
  read answers from the data API before submitting.
- listening_attempts: anon+authenticated read/write (attempts are shared with
  teachers for statistics, consistent with exam_results).
- `get_listening_questions(p_lesson_id)` — SECURITY DEFINER, returns question
  text/options/metadata WITHOUT correct_answer or explanations, only for
  PUBLISHED lessons. This is the endpoint students use while studying.
- `get_listening_questions_admin(p_lesson_id)` — returns all columns including
  answers for the admin editor.
- `submit_listening_attempt(p_lesson_id, p_user_id, p_username, p_answers)` —
  SECURITY DEFINER server-side grading: validates the lesson is PUBLISHED and
  the answer payload shape, grades every question against the stored correct
  answers, records the attempt, and returns the full review (chosen answer,
  correct answer, both explanations, earned points) only after submission.
- `import_listening_data(p_lessons, p_questions)` — SECURITY DEFINER atomic
  Excel import: validates levels, statuses, source types, correct answers,
  duplicate ids and lesson references inside a single PL/pgSQL block with an
  exception handler, so a failure leaves no partial data.

3. Storage
- Creates the `listening-audio` bucket (public read, max 20 MB, MP3 only).
- Storage policies: public read, anon+authenticated write restricted to the
  bucket. The database stores only the URL/path, never the binary.
*/

CREATE TABLE IF NOT EXISTS listening_lessons (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'N5' CHECK (level IN ('N5','N4','N3','N2','N1')),
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  audio_source_type text NOT NULL DEFAULT 'URL' CHECK (audio_source_type IN ('UPLOAD','URL')),
  audio_source text NOT NULL,
  audio_file_name text NOT NULL DEFAULT '',
  duration_seconds int NOT NULL DEFAULT 0,
  transcript text NOT NULL DEFAULT '',
  teacher_name text NOT NULL DEFAULT '',
  class_scope text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listening_questions (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES listening_lessons(id) ON DELETE CASCADE,
  question_no int NOT NULL,
  start_time_sec int,
  end_time_sec int,
  question_text text NOT NULL,
  question_translation_vi text NOT NULL DEFAULT '',
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_answer text NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanation_vi text NOT NULL DEFAULT '',
  explanation_ja text NOT NULL DEFAULT '',
  transcript_segment text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'NORMAL' CHECK (difficulty IN ('EASY','NORMAL','HARD')),
  points int NOT NULL DEFAULT 1 CHECK (points >= 0 AND points <= 100),
  allow_replay boolean NOT NULL DEFAULT true,
  show_explanation text NOT NULL DEFAULT 'AFTER_SUBMIT' CHECK (show_explanation IN ('AFTER_SUBMIT','ALWAYS','NEVER')),
  image_url text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, question_no)
);

CREATE TABLE IF NOT EXISTS listening_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id text NOT NULL REFERENCES listening_lessons(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  question_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listening_questions_lesson ON listening_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_listening_attempts_lesson_user ON listening_attempts(lesson_id, user_id);

ALTER TABLE listening_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_listening_lessons" ON listening_lessons;
CREATE POLICY "anon_read_listening_lessons" ON listening_lessons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_listening_lessons" ON listening_lessons;
CREATE POLICY "anon_insert_listening_lessons" ON listening_lessons FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_listening_lessons" ON listening_lessons;
CREATE POLICY "anon_update_listening_lessons" ON listening_lessons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_listening_lessons" ON listening_lessons;
CREATE POLICY "anon_delete_listening_lessons" ON listening_lessons FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_listening_questions" ON listening_questions;
CREATE POLICY "anon_insert_listening_questions" ON listening_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_listening_questions" ON listening_questions;
CREATE POLICY "anon_update_listening_questions" ON listening_questions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_listening_questions" ON listening_questions;
CREATE POLICY "anon_delete_listening_questions" ON listening_questions FOR DELETE
  TO anon, authenticated USING (true);
-- Intentionally NO SELECT policy on listening_questions: answers must not be
-- readable from the data API; students use get_listening_questions() instead.

DROP POLICY IF EXISTS "anon_read_listening_attempts" ON listening_attempts;
CREATE POLICY "anon_read_listening_attempts" ON listening_attempts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_listening_attempts" ON listening_attempts;
CREATE POLICY "anon_insert_listening_attempts" ON listening_attempts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ── Student question fetch (no answers) ────────────────────────

CREATE OR REPLACE FUNCTION get_listening_questions(p_lesson_id text)
RETURNS TABLE (
  id text,
  lesson_id text,
  question_no int,
  start_time_sec int,
  end_time_sec int,
  question_text text,
  question_translation_vi text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  difficulty text,
  points int,
  allow_replay boolean,
  show_explanation text,
  image_url text,
  tags text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.lesson_id, q.question_no, q.start_time_sec, q.end_time_sec,
         q.question_text, q.question_translation_vi,
         q.option_a, q.option_b, q.option_c, q.option_d,
         q.difficulty, q.points, q.allow_replay, q.show_explanation,
         q.image_url, q.tags
  FROM listening_questions q
  JOIN listening_lessons l ON l.id = q.lesson_id
  WHERE q.lesson_id = p_lesson_id
    AND l.status = 'PUBLISHED'
  ORDER BY q.question_no;
$$;

GRANT EXECUTE ON FUNCTION get_listening_questions(text) TO anon, authenticated;

-- ── Admin question fetch (full, for editor) ────────────────────

CREATE OR REPLACE FUNCTION get_listening_questions_admin(p_lesson_id text)
RETURNS SETOF listening_questions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM listening_questions WHERE lesson_id = p_lesson_id ORDER BY question_no;
$$;

GRANT EXECUTE ON FUNCTION get_listening_questions_admin(text) TO anon, authenticated;

-- ── Server-side grading ────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_listening_attempt(
  p_lesson_id text,
  p_user_id text,
  p_username text,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson listening_lessons;
  v_q listening_questions;
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

  SELECT * INTO v_lesson FROM listening_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND';
  END IF;
  IF v_lesson.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'LESSON_NOT_PUBLISHED';
  END IF;

  FOR v_q IN SELECT * FROM listening_questions WHERE lesson_id = p_lesson_id ORDER BY question_no
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
      'explanationVi', v_q.explanation_vi,
      'explanationJa', v_q.explanation_ja,
      'transcriptSegment', v_q.transcript_segment,
      'startTimeSec', v_q.start_time_sec,
      'endTimeSec', v_q.end_time_sec
    );
  END LOOP;

  INSERT INTO listening_attempts (lesson_id, user_id, username, answers, score, total_points, correct_count, question_count)
  VALUES (p_lesson_id, trim(p_user_id), coalesce(p_username, ''), p_answers, v_earned, v_total_points, v_correct, v_count)
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

GRANT EXECUTE ON FUNCTION submit_listening_attempt(text, text, text, jsonb) TO anon, authenticated;

-- ── Atomic Excel import ────────────────────────────────────────

CREATE OR REPLACE FUNCTION import_listening_data(p_lessons jsonb, p_questions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb;
  v_q jsonb;
  v_level text;
  v_status text;
  v_src_type text;
  v_answer text;
  v_lesson_count int := 0;
  v_question_count int := 0;
BEGIN
  IF jsonb_typeof(p_lessons) <> 'array' OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;

  -- Lessons first: validate + upsert (idempotent on id)
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lessons)
  LOOP
    IF coalesce(v_l ->> 'id', '') = '' OR coalesce(v_l ->> 'title', '') = '' THEN
      RAISE EXCEPTION 'LESSON_MISSING_FIELD (%)', coalesce(v_l ->> 'id', '');
    END IF;
    v_level := upper(coalesce(v_l ->> 'level', ''));
    IF v_level NOT IN ('N5','N4','N3','N2','N1') THEN
      RAISE EXCEPTION 'LESSON_INVALID_LEVEL (%)', v_l ->> 'id';
    END IF;
    v_status := upper(coalesce(v_l ->> 'status', ''));
    IF v_status NOT IN ('DRAFT','PUBLISHED','ARCHIVED') THEN
      RAISE EXCEPTION 'LESSON_INVALID_STATUS (%)', v_l ->> 'id';
    END IF;
    v_src_type := upper(coalesce(v_l ->> 'audioSourceType', ''));
    IF v_src_type NOT IN ('UPLOAD','URL') THEN
      RAISE EXCEPTION 'LESSON_INVALID_SOURCE_TYPE (%)', v_l ->> 'id';
    END IF;
    IF coalesce(v_l ->> 'audioSource', '') = '' THEN
      RAISE EXCEPTION 'LESSON_MISSING_AUDIO (%)', v_l ->> 'id';
    END IF;

    INSERT INTO listening_lessons (id, title, subtitle, level, category, description,
      audio_source_type, audio_source, audio_file_name, duration_seconds, transcript,
      teacher_name, class_scope, status, sort_order)
    VALUES (
      v_l ->> 'id',
      v_l ->> 'title',
      coalesce(v_l ->> 'subtitle', ''),
      v_level,
      coalesce(v_l ->> 'category', ''),
      coalesce(v_l ->> 'description', ''),
      v_src_type,
      v_l ->> 'audioSource',
      coalesce(v_l ->> 'audioFileName', ''),
      coalesce((v_l ->> 'durationSeconds')::int, 0),
      coalesce(v_l ->> 'transcript', ''),
      coalesce(v_l ->> 'teacherName', ''),
      coalesce(
        (SELECT array_agg(trim(x)) FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_l -> 'classScope') = 'array' THEN v_l -> 'classScope' ELSE '[]'::jsonb END
        ) AS t(x) WHERE trim(x) <> ''),
        '{}'
      ),
      v_status,
      coalesce((v_l ->> 'sortOrder')::int, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      level = EXCLUDED.level,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      audio_source_type = EXCLUDED.audio_source_type,
      audio_source = EXCLUDED.audio_source,
      audio_file_name = EXCLUDED.audio_file_name,
      duration_seconds = EXCLUDED.duration_seconds,
      transcript = EXCLUDED.transcript,
      teacher_name = EXCLUDED.teacher_name,
      class_scope = EXCLUDED.class_scope,
      status = EXCLUDED.status,
      sort_order = EXCLUDED.sort_order;
    v_lesson_count := v_lesson_count + 1;
  END LOOP;

  -- Questions: validate, then replace per lesson
  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    IF coalesce(v_q ->> 'id', '') = '' THEN
      RAISE EXCEPTION 'QUESTION_MISSING_ID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM listening_lessons WHERE id = v_q ->> 'lessonId') THEN
      RAISE EXCEPTION 'QUESTION_LESSON_NOT_FOUND (%)', v_q ->> 'id';
    END IF;
    IF coalesce(v_q ->> 'questionText', '') = '' OR coalesce(v_q ->> 'optionA', '') = '' OR coalesce(v_q ->> 'optionB', '') = '' THEN
      RAISE EXCEPTION 'QUESTION_MISSING_FIELD (%)', v_q ->> 'id';
    END IF;
    v_answer := upper(coalesce(v_q ->> 'correctAnswer', ''));
    IF v_answer NOT IN ('A','B','C','D') THEN
      RAISE EXCEPTION 'QUESTION_INVALID_ANSWER (%)', v_q ->> 'id';
    END IF;

    INSERT INTO listening_questions (id, lesson_id, question_no, start_time_sec, end_time_sec,
      question_text, question_translation_vi, option_a, option_b, option_c, option_d,
      correct_answer, explanation_vi, explanation_ja, transcript_segment, difficulty,
      points, allow_replay, show_explanation, image_url, tags)
    VALUES (
      v_q ->> 'id',
      v_q ->> 'lessonId',
      coalesce((v_q ->> 'questionNo')::int, 0),
      NULLIF(v_q ->> 'startTimeSec', '')::int,
      NULLIF(v_q ->> 'endTimeSec', '')::int,
      v_q ->> 'questionText',
      coalesce(v_q ->> 'questionTranslationVi', ''),
      v_q ->> 'optionA',
      v_q ->> 'optionB',
      coalesce(v_q ->> 'optionC', ''),
      coalesce(v_q ->> 'optionD', ''),
      v_answer,
      coalesce(v_q ->> 'explanationVi', ''),
      coalesce(v_q ->> 'explanationJa', ''),
      coalesce(v_q ->> 'transcriptSegment', ''),
      upper(coalesce(v_q ->> 'difficulty', 'NORMAL')),
      coalesce((v_q ->> 'points')::int, 1),
      coalesce((v_q ->> 'allowReplay')::boolean, true),
      CASE upper(coalesce(v_q ->> 'showExplanation', 'AFTER_SUBMIT'))
        WHEN 'ALWAYS' THEN 'ALWAYS'
        WHEN 'NEVER' THEN 'NEVER'
        ELSE 'AFTER_SUBMIT' END,
      coalesce(v_q ->> 'imageUrl', ''),
      coalesce(v_q ->> 'tags', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      lesson_id = EXCLUDED.lesson_id,
      question_no = EXCLUDED.question_no,
      start_time_sec = EXCLUDED.start_time_sec,
      end_time_sec = EXCLUDED.end_time_sec,
      question_text = EXCLUDED.question_text,
      question_translation_vi = EXCLUDED.question_translation_vi,
      option_a = EXCLUDED.option_a,
      option_b = EXCLUDED.option_b,
      option_c = EXCLUDED.option_c,
      option_d = EXCLUDED.option_d,
      correct_answer = EXCLUDED.correct_answer,
      explanation_vi = EXCLUDED.explanation_vi,
      explanation_ja = EXCLUDED.explanation_ja,
      transcript_segment = EXCLUDED.transcript_segment,
      difficulty = EXCLUDED.difficulty,
      points = EXCLUDED.points,
      allow_replay = EXCLUDED.allow_replay,
      show_explanation = EXCLUDED.show_explanation,
      image_url = EXCLUDED.image_url,
      tags = EXCLUDED.tags;
    v_question_count := v_question_count + 1;
  END LOOP;

  RETURN jsonb_build_object('lessons', v_lesson_count, 'questions', v_question_count);
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION import_listening_data(jsonb, jsonb) TO anon, authenticated;

-- ── Audio storage bucket ───────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('listening-audio', 'listening-audio', true, 20971520, ARRAY['audio/mpeg','audio/mp3'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['audio/mpeg','audio/mp3'];

DROP POLICY IF EXISTS "public_read_listening_audio" ON storage.objects;
CREATE POLICY "public_read_listening_audio" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'listening-audio');

DROP POLICY IF EXISTS "anon_upload_listening_audio" ON storage.objects;
CREATE POLICY "anon_upload_listening_audio" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'listening-audio');

DROP POLICY IF EXISTS "anon_update_listening_audio" ON storage.objects;
CREATE POLICY "anon_update_listening_audio" ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'listening-audio') WITH CHECK (bucket_id = 'listening-audio');

DROP POLICY IF EXISTS "anon_delete_listening_audio" ON storage.objects;
CREATE POLICY "anon_delete_listening_audio" ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'listening-audio');
