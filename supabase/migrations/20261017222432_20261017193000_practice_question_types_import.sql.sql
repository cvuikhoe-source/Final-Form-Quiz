/*
# Extend practice questions for Excel import (question types, multi-answer, hints)

Prepares the practice module for bulk Excel import. All changes are additive —
no data is modified or removed.

1. Modified Tables
- `practice_questions` — new columns:
  - `question_type` (text, default 'single_choice'): single_choice /
    multiple_choice / true_false / short_answer.
  - `hint` (text): optional student hint shown while practicing.
  - `difficulty` (text, default 'medium'): easy / medium / hard.
  - `question_category` (text): free-form grouping from the Excel `category` column.
  - `tags` (text): comma-separated tags.
  - `image_url` (text): optional image shown with the question.
  - `correct_answer` check constraint relaxed: previously restricted to a
    single letter A–D; now also allows comma-separated letter sets for
    multiple_choice ('A,C') and plain text for short_answer. The constraint
    is dropped — validation happens in the app and in the grading function.
    No existing rows are changed.

2. Security
- `get_practice_questions(p_practice_id)` — replaced (drop + recreate) to also
  return question_type, hint and image_url (still NO correct answers or
  explanations).
- `submit_practice_attempt(...)` — grading updated: multiple_choice compares
  chosen letters and correct letters as sets ('A,C' = 'C,A'); short_answer
  compares normalized text (case-insensitive). Everything else unchanged.
*/

ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'single_choice'
  CHECK (question_type IN ('single_choice','multiple_choice','true_false','short_answer'));
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS hint text NOT NULL DEFAULT '';
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium'
  CHECK (difficulty IN ('easy','medium','hard'));
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS question_category text NOT NULL DEFAULT '';
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS tags text NOT NULL DEFAULT '';
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

-- Relax correct_answer: was CHECK (correct_answer IN ('A','B','C','D')).
-- Now app/RPC validate: letter set for choice types, text for short_answer.
ALTER TABLE practice_questions DROP CONSTRAINT IF EXISTS practice_questions_correct_answer_check;

-- ── Student question fetch: include type/hint/image (still no answers) ──

DROP FUNCTION IF EXISTS get_practice_questions(text);

CREATE FUNCTION get_practice_questions(p_practice_id text)
RETURNS TABLE (
  id text,
  practice_id text,
  question_no int,
  question_type text,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  hint text,
  image_url text,
  points int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.practice_id, q.question_no, q.question_type, q.question_text,
         q.option_a, q.option_b, q.option_c, q.option_d,
         q.hint, q.image_url, q.points
  FROM practice_questions q
  JOIN practices p ON p.id = q.practice_id
  WHERE q.practice_id = p_practice_id AND p.status = 'PUBLISHED'
  ORDER BY q.question_no;
$$;

GRANT EXECUTE ON FUNCTION get_practice_questions(text) TO anon, authenticated;

-- ── Server-side grading: multi-answer + short answer support ──────

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
  v_is_correct boolean;
  v_letter text;
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
    v_is_correct := false;

    IF v_q.question_type = 'short_answer' THEN
      IF v_chosen IS NOT NULL AND length(v_chosen) > 500 THEN
        RAISE EXCEPTION 'INVALID_ANSWERS';
      END IF;
      v_is_correct := (v_chosen IS NOT NULL AND lower(v_chosen) = lower(trim(v_q.correct_answer)));
    ELSE
      IF v_chosen IS NOT NULL THEN
        FOREACH v_letter IN ARRAY string_to_array(upper(v_chosen), '') LOOP
          IF v_letter NOT IN ('A','B','C','D') THEN
            RAISE EXCEPTION 'INVALID_ANSWERS';
          END IF;
        END LOOP;
        v_is_correct := (
          SELECT string_agg(l, '' ORDER BY l) FROM unnest(string_to_array(upper(v_chosen), '')) l
        ) = (
          SELECT string_agg(l, '' ORDER BY l) FROM unnest(string_to_array(upper(v_q.correct_answer), '')) l
        );
      END IF;
    END IF;

    IF v_is_correct THEN
      v_correct := v_correct + 1;
      v_earned := v_earned + v_q.points;
    END IF;

    v_details := v_details || jsonb_build_object(
      'questionId', v_q.id,
      'questionNo', v_q.question_no,
      'chosen', v_chosen,
      'correct', v_q.correct_answer,
      'isCorrect', v_is_correct,
      'points', v_q.points,
      'earned', (CASE WHEN v_is_correct THEN v_q.points ELSE 0 END),
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
