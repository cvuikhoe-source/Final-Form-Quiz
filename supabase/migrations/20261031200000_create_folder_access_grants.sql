-- Migration: Create folder_access_grants table and polymorphic integrity triggers
-- Created at: 2026-10-31 20:00:00 (Local time)
-- Reviewed at: 2026-11-01 01:15:00 (Local time) - Hardened search_path & execution safety
--
-- DESCRIPTION:
--   1. Creates public.folder_access_grants to manage Access Control Lists (ACL)
--      at the folder level for lesson, practice, and exam folders.
--   2. Adds inherit_permissions boolean to lesson_folders, practice_folders, and exam_folders.
--   3. Implements polymorphic folder integrity trigger to ensure folder_id exists
--      in the corresponding table based on folder_type.
--   4. Implements class and user principal validation triggers to reject invalid principals.
--   5. Implements atomic owner grant creation triggers on folder insert (lesson, practice, exam).
--   6. Implements cascading cleanup triggers on lesson_folders, practice_folders, and exam_folders
--      to purge grants when a folder is deleted without leaving orphans.
--   7. Enforces strict RLS: REVOKES INSERT, UPDATE, DELETE from anon and authenticated.
--      All mutations MUST be performed via Edge Function manage-folder-access.
--   8. Hardens SECURITY DEFINER functions with SET search_path = public.
--
-- ROLLBACK SCRIPT (Strict ordered teardown - do not run unless rolling back):
--   DROP TRIGGER IF EXISTS trg_auto_owner_lesson_folders ON public.lesson_folders;
--   DROP TRIGGER IF EXISTS trg_auto_owner_practice_folders ON public.practice_folders;
--   DROP TRIGGER IF EXISTS trg_auto_owner_exam_folders ON public.exam_folders;
--   DROP FUNCTION IF EXISTS public.handle_auto_create_folder_owner_grant();
--   DROP TRIGGER IF EXISTS trg_cleanup_lesson_folder_grants ON public.lesson_folders;
--   DROP FUNCTION IF EXISTS public.handle_cleanup_lesson_folder_grants();
--   DROP TRIGGER IF EXISTS trg_cleanup_practice_folder_grants ON public.practice_folders;
--   DROP FUNCTION IF EXISTS public.handle_cleanup_practice_folder_grants();
--   DROP TRIGGER IF EXISTS trg_cleanup_exam_folder_grants ON public.exam_folders;
--   DROP FUNCTION IF EXISTS public.handle_cleanup_exam_folder_grants();
--   DROP TRIGGER IF EXISTS trg_folder_access_grant_integrity ON public.folder_access_grants;
--   DROP FUNCTION IF EXISTS public.check_folder_access_grant_integrity();
--   DROP TRIGGER IF EXISTS trg_folder_access_grants_updated_at ON public.folder_access_grants;
--   DROP FUNCTION IF EXISTS public.handle_folder_access_grants_updated_at();
--   DROP TABLE IF EXISTS public.folder_access_grants;
--   ALTER TABLE public.lesson_folders DROP COLUMN IF EXISTS inherit_permissions;
--   ALTER TABLE public.practice_folders DROP COLUMN IF EXISTS inherit_permissions;
--   ALTER TABLE public.exam_folders DROP COLUMN IF EXISTS inherit_permissions;

-- 1. Add inherit_permissions column to existing folder tables
ALTER TABLE public.lesson_folders
  ADD COLUMN IF NOT EXISTS inherit_permissions boolean NOT NULL DEFAULT true;

ALTER TABLE public.practice_folders
  ADD COLUMN IF NOT EXISTS inherit_permissions boolean NOT NULL DEFAULT true;

ALTER TABLE public.exam_folders
  ADD COLUMN IF NOT EXISTS inherit_permissions boolean NOT NULL DEFAULT true;

-- 2. Create folder_access_grants table
CREATE TABLE IF NOT EXISTS public.folder_access_grants (
  id text PRIMARY KEY,
  folder_type text NOT NULL CHECK (folder_type IN ('lesson', 'practice', 'exam')),
  folder_id text NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'class')),
  principal_id text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('owner', 'manager', 'editor', 'viewer')),
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_folder_access_grant UNIQUE (folder_type, folder_id, principal_type, principal_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_folder_grants_type_folder
  ON public.folder_access_grants (folder_type, folder_id);

CREATE INDEX IF NOT EXISTS idx_folder_grants_principal
  ON public.folder_access_grants (principal_type, principal_id);

CREATE INDEX IF NOT EXISTS idx_folder_grants_permission
  ON public.folder_access_grants (permission);

CREATE INDEX IF NOT EXISTS idx_folder_grants_granted_by
  ON public.folder_access_grants (granted_by);

CREATE INDEX IF NOT EXISTS idx_folder_grants_compound
  ON public.folder_access_grants (folder_type, folder_id, permission);

-- 4. Trigger for automatic updated_at maintenance
CREATE OR REPLACE FUNCTION public.handle_folder_access_grants_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folder_access_grants_updated_at ON public.folder_access_grants;
CREATE TRIGGER trg_folder_access_grants_updated_at
  BEFORE UPDATE ON public.folder_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_folder_access_grants_updated_at();

-- 5. Polymorphic folder and principal integrity validation trigger
CREATE OR REPLACE FUNCTION public.check_folder_access_grant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Verify folder existence based on folder_type
  IF NEW.folder_type = 'lesson' THEN
    IF NOT EXISTS (SELECT 1 FROM public.lesson_folders WHERE id = NEW.folder_id) THEN
      RAISE EXCEPTION 'Thư mục bài học (%) không tồn tại.', NEW.folder_id;
    END IF;
  ELSIF NEW.folder_type = 'practice' THEN
    IF NOT EXISTS (SELECT 1 FROM public.practice_folders WHERE id = NEW.folder_id) THEN
      RAISE EXCEPTION 'Thư mục luyện tập (%) không tồn tại.', NEW.folder_id;
    END IF;
  ELSIF NEW.folder_type = 'exam' THEN
    IF NOT EXISTS (SELECT 1 FROM public.exam_folders WHERE id = NEW.folder_id) THEN
      RAISE EXCEPTION 'Thư mục bài thi (%) không tồn tại.', NEW.folder_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Loại thư mục không hợp lệ: %', NEW.folder_type;
  END IF;

  -- Verify principal user existence if principal_type = 'user'
  IF NEW.principal_type = 'user' THEN
    IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = NEW.principal_id) THEN
      RAISE EXCEPTION 'Người dùng (%) không tồn tại trong hệ thống.', NEW.principal_id;
    END IF;
  END IF;

  -- Verify principal class existence if principal_type = 'class'
  IF NEW.principal_type = 'class' AND NEW.principal_id != 'Tất cả' THEN
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE name = NEW.principal_id OR id = NEW.principal_id) THEN
      RAISE EXCEPTION 'Lớp học (%) không tồn tại trong hệ thống.', NEW.principal_id;
    END IF;
  END IF;

  -- Verify granter user existence
  IF NEW.granted_by != 'system' THEN
    IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = NEW.granted_by) THEN
      RAISE EXCEPTION 'Người cấp quyền (%) không tồn tại trong hệ thống.', NEW.granted_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folder_access_grant_integrity ON public.folder_access_grants;
CREATE TRIGGER trg_folder_access_grant_integrity
  BEFORE INSERT OR UPDATE ON public.folder_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.check_folder_access_grant_integrity();

-- 6. Atomic Owner Grant creation triggers upon folder creation
CREATE OR REPLACE FUNCTION public.handle_auto_create_folder_owner_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator_id text;
  v_folder_type text;
BEGIN
  IF TG_TABLE_NAME = 'lesson_folders' THEN
    v_folder_type := 'lesson';
  ELSIF TG_TABLE_NAME = 'practice_folders' THEN
    v_folder_type := 'practice';
  ELSIF TG_TABLE_NAME = 'exam_folders' THEN
    v_folder_type := 'exam';
  ELSE
    RETURN NEW;
  END IF;

  v_creator_id := NEW.created_by;

  -- Verify creator exists in app_users
  IF v_creator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = v_creator_id) THEN
    v_creator_id := NULL;
  END IF;

  -- If created_by is not set or invalid, infer from current authenticated session
  IF v_creator_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_creator_id FROM public.app_users WHERE auth_user_id = auth.uid();
  END IF;

  -- Automatically insert owner grant in the same transaction
  IF v_creator_id IS NOT NULL THEN
    INSERT INTO public.folder_access_grants (
      id, folder_type, folder_id, principal_type, principal_id, permission, granted_by, created_at, updated_at
    ) VALUES (
      'fag_' || gen_random_uuid()::text,
      v_folder_type,
      NEW.id,
      'user',
      v_creator_id,
      'owner',
      v_creator_id,
      now(),
      now()
    )
    ON CONFLICT (folder_type, folder_id, principal_type, principal_id)
    DO UPDATE SET permission = 'owner', updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_owner_lesson_folders ON public.lesson_folders;
CREATE TRIGGER trg_auto_owner_lesson_folders
  AFTER INSERT ON public.lesson_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_create_folder_owner_grant();

DROP TRIGGER IF EXISTS trg_auto_owner_practice_folders ON public.practice_folders;
CREATE TRIGGER trg_auto_owner_practice_folders
  AFTER INSERT ON public.practice_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_create_folder_owner_grant();

DROP TRIGGER IF EXISTS trg_auto_owner_exam_folders ON public.exam_folders;
CREATE TRIGGER trg_auto_owner_exam_folders
  AFTER INSERT ON public.exam_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_create_folder_owner_grant();

-- 7. Cascading cleanup triggers on folder deletion
CREATE OR REPLACE FUNCTION public.handle_cleanup_lesson_folder_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.folder_access_grants
  WHERE folder_type = 'lesson' AND folder_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_lesson_folder_grants ON public.lesson_folders;
CREATE TRIGGER trg_cleanup_lesson_folder_grants
  AFTER DELETE ON public.lesson_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_cleanup_lesson_folder_grants();

CREATE OR REPLACE FUNCTION public.handle_cleanup_practice_folder_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.folder_access_grants
  WHERE folder_type = 'practice' AND folder_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_practice_folder_grants ON public.practice_folders;
CREATE TRIGGER trg_cleanup_practice_folder_grants
  AFTER DELETE ON public.practice_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_cleanup_practice_folder_grants();

CREATE OR REPLACE FUNCTION public.handle_cleanup_exam_folder_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.folder_access_grants
  WHERE folder_type = 'exam' AND folder_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_exam_folder_grants ON public.exam_folders;
CREATE TRIGGER trg_cleanup_exam_folder_grants
  AFTER DELETE ON public.exam_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_cleanup_exam_folder_grants();

-- 8. Strict RLS Security Model
ALTER TABLE public.folder_access_grants ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke write permissions from anon and authenticated roles
REVOKE INSERT, UPDATE, DELETE ON public.folder_access_grants FROM anon, authenticated;

-- Read policies:
-- Anon is strictly forbidden from reading ACL grants
DROP POLICY IF EXISTS "anon_read_folder_access_grants" ON public.folder_access_grants;
CREATE POLICY "anon_read_folder_access_grants" ON public.folder_access_grants FOR SELECT
  TO anon USING (false);

-- Authenticated users can read grants if:
-- 1. User is admin or teacher (needs to see folder permissions for management)
-- 2. Grant is assigned directly to the user (principal_type = 'user' AND principal_id = user.id)
-- 3. Grant is assigned to one of the user's classes (principal_type = 'class' AND principal_id = ANY(user.assigned_classes))
DROP POLICY IF EXISTS "authenticated_read_folder_access_grants" ON public.folder_access_grants;
CREATE POLICY "authenticated_read_folder_access_grants" ON public.folder_access_grants FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
      AND (
        u.role IN ('admin', 'teacher')
        OR (folder_access_grants.principal_type = 'user' AND folder_access_grants.principal_id = u.id)
        OR (folder_access_grants.principal_type = 'class' AND u.assigned_classes IS NOT NULL AND folder_access_grants.principal_id = ANY(u.assigned_classes))
      )
    )
  );

-- 9. Add to Realtime Publication if available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'folder_access_grants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE folder_access_grants;
  END IF;
END $$;
