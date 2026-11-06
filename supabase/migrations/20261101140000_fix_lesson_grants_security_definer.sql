-- Migration: Add SECURITY DEFINER to lesson access grant functions
-- Enables trigger trg_auto_owner_lesson to insert into lesson_access_grants safely

CREATE OR REPLACE FUNCTION public.check_lesson_access_grant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean := false;
BEGIN
  -- Verify lesson_id exists
  SELECT EXISTS(SELECT 1 FROM public.lessons WHERE id = NEW.lesson_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'lesson_id "%" không tồn tại trong bảng lessons.', NEW.lesson_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Validate principal_id existence
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

CREATE OR REPLACE FUNCTION public.handle_auto_create_lesson_owner_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

