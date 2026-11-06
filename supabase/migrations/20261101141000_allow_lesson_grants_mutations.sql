-- Migration: Allow mutations on lesson_access_grants for anon and authenticated
-- Integrates with existing check_lesson_access_grant_integrity trigger

GRANT ALL ON public.lesson_access_grants TO anon, authenticated;

DROP POLICY IF EXISTS p_lesson_access_grants_select ON public.lesson_access_grants;
DROP POLICY IF EXISTS p_lesson_access_grants_all ON public.lesson_access_grants;

CREATE POLICY p_lesson_access_grants_all ON public.lesson_access_grants
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

