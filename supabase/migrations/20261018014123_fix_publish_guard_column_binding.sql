-- Fix the publish-guard policies: the unqualified `id` inside the EXISTS
-- subquery bound to practice_questions.id instead of the practices row's id,
-- so the "has at least one question" check never passed and every save of a
-- PUBLISHED practice failed with RLS error 42501.

DROP POLICY IF EXISTS "anon_insert_practices" ON practices;
CREATE POLICY "anon_insert_practices" ON practices FOR INSERT
  TO anon, authenticated
  WITH CHECK (status <> 'PUBLISHED' OR EXISTS (
    SELECT 1 FROM practice_questions q WHERE q.practice_id = practices.id
  ));

DROP POLICY IF EXISTS "anon_update_practices" ON practices;
CREATE POLICY "anon_update_practices" ON practices FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (status <> 'PUBLISHED' OR EXISTS (
    SELECT 1 FROM practice_questions q WHERE q.practice_id = practices.id
  ));