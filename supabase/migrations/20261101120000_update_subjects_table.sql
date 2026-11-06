-- Migration: Update subjects table with normalized_name, audit fields, unique constraint, and RLS
-- File: supabase/migrations/20261101120000_update_subjects_table.sql

-- 1. Ensure columns exist
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES public.app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Populate normalized_name for any existing rows
UPDATE public.subjects
SET normalized_name = lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
WHERE normalized_name IS NULL;

-- 3. Create unique index on normalized_name
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_normalized_name
  ON public.subjects(normalized_name);

-- 4. Create trigger to keep normalized_name updated automatically
CREATE OR REPLACE FUNCTION public.handle_subject_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name := trim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  NEW.normalized_name := lower(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subject_normalized_name ON public.subjects;
CREATE TRIGGER trg_subject_normalized_name
  BEFORE INSERT OR UPDATE ON public.subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_subject_normalized_name();

-- 5. Strict RLS Policies
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_subjects" ON public.subjects;
DROP POLICY IF EXISTS "read_subjects_all" ON public.subjects;
CREATE POLICY "read_subjects_all" ON public.subjects
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_insert_subjects" ON public.subjects;
DROP POLICY IF EXISTS "admin_insert_subjects" ON public.subjects;
CREATE POLICY "admin_insert_subjects" ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "anon_update_subjects" ON public.subjects;
DROP POLICY IF EXISTS "admin_update_subjects" ON public.subjects;
CREATE POLICY "admin_update_subjects" ON public.subjects
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "anon_delete_subjects" ON public.subjects;
DROP POLICY IF EXISTS "admin_delete_subjects" ON public.subjects;
CREATE POLICY "admin_delete_subjects" ON public.subjects
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'admin'
    )
  );

