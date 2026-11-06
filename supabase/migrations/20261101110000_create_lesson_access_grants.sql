-- Migration: Create lesson_access_grants table and Lesson ACL integrity triggers
-- Created at: 2026-11-01 11:00:00 (Local time)
--
-- DESCRIPTION:
--   1. Adds created_by column to public.lessons if not present.
--   2. Creates public.lesson_access_grants table to manage Access Control Lists (ACL)
--      at the individual Lesson level (replacing legacy Folder ACL).
--   3. Implements lesson, class, and user principal validation triggers to reject invalid principals.
--   4. Implements atomic owner grant creation trigger on lesson insert.
--   5. Enforces strict RLS: REVOKES direct INSERT, UPDATE, DELETE from anon and authenticated.
--      All mutations MUST be performed via Edge Function manage-lesson-access or admin client.
--
-- ROLLBACK SCRIPT (Strict ordered teardown):
--   DROP TRIGGER IF EXISTS trg_auto_owner_lesson ON public.lessons;
--   DROP FUNCTION IF EXISTS public.handle_auto_create_lesson_owner_grant();
--   DROP TRIGGER IF EXISTS trg_lesson_access_grant_integrity ON public.lesson_access_grants;
--   DROP FUNCTION IF EXISTS public.check_lesson_access_grant_integrity();
--   DROP TRIGGER IF EXISTS trg_lesson_access_grants_updated_at ON public.lesson_access_grants;
--   DROP FUNCTION IF EXISTS public.handle_lesson_access_grants_updated_at();
--   DROP TABLE IF EXISTS public.lesson_access_grants;
--   ALTER TABLE public.lessons DROP COLUMN IF EXISTS created_by;

-- 1. Ensure created_by exists on lessons table
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS created_by text;

-- 2. Create lesson_access_grants table
CREATE TABLE IF NOT EXISTS public.lesson_access_grants (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'class')),
  principal_id text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('owner', 'manager', 'editor', 'viewer')),
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lesson_access_grant UNIQUE (lesson_id, principal_type, principal_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_lesson_grants_lesson_id
  ON public.lesson_access_grants (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_grants_principal
  ON public.lesson_access_grants (principal_type, principal_id);

CREATE INDEX IF NOT EXISTS idx_lesson_grants_permission
  ON public.lesson_access_grants (permission);

CREATE INDEX IF NOT EXISTS idx_lesson_grants_granted_by
  ON public.lesson_access_grants (granted_by);

CREATE INDEX IF NOT EXISTS idx_lesson_grants_compound
  ON public.lesson_access_grants (lesson_id, permission);

-- 4. Trigger for automatic updated_at maintenance
CREATE OR REPLACE FUNCTION public.handle_lesson_access_grants_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_access_grants_updated_at ON public.lesson_access_grants;
CREATE TRIGGER trg_lesson_access_grants_updated_at
  BEFORE UPDATE ON public.lesson_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lesson_access_grants_updated_at();

-- 5. Lesson and principal integrity validation trigger
CREATE OR REPLACE FUNCTION public.check_lesson_access_grant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean := false;
BEGIN
  -- 5a. Verify lesson_id exists
  SELECT EXISTS(SELECT 1 FROM public.lessons WHERE id = NEW.lesson_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'lesson_id "%" không tồn tại trong bảng lessons.', NEW.lesson_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 5b. Validate principal_id existence
  IF NEW.principal_type = 'class' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.classes
      WHERE name = NEW.principal_id OR id::text = NEW.principal_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'principal_id "%" cho principal_type "class" không tồn tại trong bảng classes.', NEW.principal_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.principal_type = 'user' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.app_users WHERE id = NEW.principal_id
      UNION
      SELECT 1 FROM auth.users WHERE id::text = NEW.principal_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'principal_id "%" cho principal_type "user" không tồn tại trong app_users/auth.users.', NEW.principal_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_access_grant_integrity ON public.lesson_access_grants;
CREATE TRIGGER trg_lesson_access_grant_integrity
  BEFORE INSERT OR UPDATE ON public.lesson_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lesson_access_grant_integrity();

-- 6. Automatic Owner Grant on Lesson Creation
CREATE OR REPLACE FUNCTION public.handle_auto_create_lesson_owner_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grant_id text;
BEGIN
  IF NEW.created_by IS NOT NULL AND NEW.created_by <> '' THEN
    v_grant_id := 'lag-' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
    INSERT INTO public.lesson_access_grants (
      id,
      lesson_id,
      principal_type,
      principal_id,
      permission,
      granted_by
    ) VALUES (
      v_grant_id,
      NEW.id,
      'user',
      NEW.created_by,
      'owner',
      NEW.created_by
    )
    ON CONFLICT (lesson_id, principal_type, principal_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_owner_lesson ON public.lessons;
CREATE TRIGGER trg_auto_owner_lesson
  AFTER INSERT ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_create_lesson_owner_grant();

-- 7. Row Level Security (RLS)
ALTER TABLE public.lesson_access_grants ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.lesson_access_grants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_access_grants FROM authenticated;

DROP POLICY IF EXISTS p_lesson_access_grants_select ON public.lesson_access_grants;
CREATE POLICY p_lesson_access_grants_select ON public.lesson_access_grants
  FOR SELECT
  TO authenticated, anon
  USING (true);

