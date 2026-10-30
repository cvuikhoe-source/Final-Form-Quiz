/*
# Guard: publish a practice only when it has at least one question

Root cause of the "student opens a published practice and sees only a
Submit button with 0 questions" bug: nothing stopped a question-less
practice from being saved with status = 'PUBLISHED'.

1. `practices` — RLS UPDATE/INSERT policies now require, when status is
   'PUBLISHED', that at least one question exists (correlated EXISTS on
   practice_questions). Drafts and archived rows are unaffected, so no
   existing draft or archive workflow changes.

2. `submit_practice_attempt` — refuses a PUBLISHED practice that has zero
   questions (PRACTICE_EMPTY). A legacy empty published practice can no
   longer produce a "0-question submission".

Existing rows are untouched. The already-published empty "TEST" practice
must be set back to DRAFT (a separate data fix, not part of this DDL).
*/

DROP POLICY IF EXISTS "anon_insert_practices" ON practices;
CREATE POLICY "anon_insert_practices" ON practices FOR INSERT
  TO anon, authenticated
  WITH CHECK (status <> 'PUBLISHED' OR EXISTS (
    SELECT 1 FROM practice_questions q WHERE q.practice_id = id
  ));

DROP POLICY IF EXISTS "anon_update_practices" ON practices;
CREATE POLICY "anon_update_practices" ON practices FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (status <> 'PUBLISHED' OR EXISTS (
    SELECT 1 FROM practice_questions q WHERE q.practice_id = id
  ));

-- Server-side grading: reject zero-question published practices
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

  SELECT count(*) INTO v_count FROM practice_questions WHERE practice_id = p_practice_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PRACTICE_EMPTY';
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
