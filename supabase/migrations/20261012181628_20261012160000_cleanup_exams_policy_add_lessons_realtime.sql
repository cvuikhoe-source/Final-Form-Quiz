/*
# Clean up stray exams policy and add lessons to realtime

## Changes
1. Remove the stray `anon_insert_exems` policy (typo from original migration)
   that was created with FOR ALL scoped to the public role.
2. Add the `lessons` table to the supabase_realtime publication so the
   frontend can subscribe to lesson changes via Supabase realtime.

## Security
- No new policies added. The correct `anon_insert_exams` policy already exists.
- RLS remains enabled on all tables.
*/

-- Remove the stray typo policy (FOR ALL, scoped to public)
DROP POLICY IF EXISTS "anon_insert_exems" ON exams;

-- Add lessons to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lessons'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lessons;
  END IF;
END $$;
