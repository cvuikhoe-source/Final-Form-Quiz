-- Root cause: practice_questions deliberately has NO SELECT policy (students
-- must not read answers). Inside the publish-guard policy on practices, the
-- EXISTS subquery runs with RLS applied → anon sees zero question rows → the
-- guard is always false → every save/publish of a PUBLISHED practice fails
-- with 42501 ("Lưu thất bại").
--
-- Fix: wrap the existence check in a SECURITY DEFINER function (bypasses RLS,
-- exposes only a boolean — no answer data), and reference it from the policies.

CREATE OR REPLACE FUNCTION practice_has_questions(p_practice_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM practice_questions WHERE practice_id = p_practice_id);
$$;

REVOKE EXECUTE ON FUNCTION practice_has_questions(text) FROM public;
GRANT EXECUTE ON FUNCTION practice_has_questions(text) TO anon, authenticated;

DROP POLICY IF EXISTS "anon_insert_practices" ON practices;
CREATE POLICY "anon_insert_practices" ON practices FOR INSERT
  TO anon, authenticated
  WITH CHECK (status <> 'PUBLISHED' OR practice_has_questions(id));

DROP POLICY IF EXISTS "anon_update_practices" ON practices;
CREATE POLICY "anon_update_practices" ON practices FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (status <> 'PUBLISHED' OR practice_has_questions(id));