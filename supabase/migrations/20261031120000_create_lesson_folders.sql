-- Migration: Create lesson_folders and add folder_id to lessons, listening_lessons, reading_lessons
-- Created at: 2026-10-31 12:00:00 (Local time)
--
-- DESCRIPTION:
--   1. Creates public.lesson_folders table to support multi-level folders inside each lesson category:
--      - cat-grammar (Ngữ pháp)
--      - cat-vocab (Từ vựng)
--      - cat-listening (Nghe)
--      - cat-reading (Đọc)
--      Enforces strict CHECK constraint on category_id.
--   2. Enforces ON DELETE RESTRICT on parent_id to prevent orphaned child folders.
--   3. Adds folder_id (nullable, ON DELETE RESTRICT) to public.lessons, public.listening_lessons, and public.reading_lessons
--      to guarantee folders containing lessons cannot be accidentally deleted without reassigning or archiving.
--   4. Creates partial unique indexes preventing duplicate active folder names within the same parent and category.
--   5. Implements strict RLS: ONLY SELECT is granted to anon/authenticated (read-only for student/public browsing).
--      REVOKES all direct INSERT/UPDATE/DELETE permissions from both anon and authenticated roles.
--      All write operations MUST go through backend Edge Functions (manage-lesson-folders).
--   6. Implements database BEFORE INSERT OR UPDATE trigger to:
--      - Automatically maintain updated_at = now()
--      - Validate parent_id existence
--      - Prevent self-parenting (NEW.parent_id <> NEW.id)
--      - Prevent cross-category nesting (parent.category_id = NEW.category_id)
--      - Prevent nesting under archived parent folders
--
-- ROLLBACK SCRIPT (Strict ordered teardown - do not run now):
--   ALTER TABLE public.reading_lessons DROP COLUMN IF EXISTS folder_id;
--   ALTER TABLE public.listening_lessons DROP COLUMN IF EXISTS folder_id;
--   ALTER TABLE public.lessons DROP COLUMN IF EXISTS folder_id;
--   DROP TRIGGER IF EXISTS trg_validate_lesson_folder_parent ON public.lesson_folders;
--   DROP FUNCTION IF EXISTS public.validate_lesson_folder_parent();
--   DROP INDEX IF EXISTS public.idx_lesson_folders_uniq_child_name;
--   DROP INDEX IF EXISTS public.idx_lesson_folders_uniq_root_name;
--   DROP INDEX IF EXISTS public.idx_reading_lessons_folder;
--   DROP INDEX IF EXISTS public.idx_listening_lessons_folder;
--   DROP INDEX IF EXISTS public.idx_lessons_folder;
--   DROP INDEX IF EXISTS public.idx_lesson_folders_archived;
--   DROP INDEX IF EXISTS public.idx_lesson_folders_cat_parent;
--   DROP INDEX IF EXISTS public.idx_lesson_folders_parent;
--   DROP INDEX IF EXISTS public.idx_lesson_folders_category;
--   DROP TABLE IF EXISTS public.lesson_folders;

-- 1. Create lesson_folders table with CHECK constraint on category_id
CREATE TABLE IF NOT EXISTS public.lesson_folders (
  id text PRIMARY KEY,
  category_id text NOT NULL CHECK (category_id IN ('cat-grammar', 'cat-vocab', 'cat-listening', 'cat-reading')),
  parent_id text REFERENCES public.lesson_folders(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- 2. Enable RLS (Strict Security Model)
-- Chỉ cho phép SELECT cho anon/authenticated để đọc cây thư mục hiển thị bài học.
-- Tuyệt đối KHÔNG cấp quyền INSERT, UPDATE, DELETE cho anon hay authenticated trực tiếp.
-- Mọi thao tác ghi (tạo, sửa, xóa, di chuyển, lưu trữ) bắt buộc phải đi qua Edge Function có xác thực JWT (admin/teacher).
ALTER TABLE public.lesson_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_lesson_folders" ON public.lesson_folders;
DROP POLICY IF EXISTS "anon_read_lesson_folders" ON public.lesson_folders;
CREATE POLICY "read_lesson_folders" ON public.lesson_folders FOR SELECT
  TO anon, authenticated USING (true);

-- Explicitly revoke write permissions from both anon and authenticated roles
REVOKE INSERT, UPDATE, DELETE ON public.lesson_folders FROM anon, authenticated;

-- 3. Add folder_id to lesson tables (nullable, ON DELETE RESTRICT)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS folder_id text REFERENCES public.lesson_folders(id) ON DELETE RESTRICT;

ALTER TABLE public.listening_lessons
  ADD COLUMN IF NOT EXISTS folder_id text REFERENCES public.lesson_folders(id) ON DELETE RESTRICT;

ALTER TABLE public.reading_lessons
  ADD COLUMN IF NOT EXISTS folder_id text REFERENCES public.lesson_folders(id) ON DELETE RESTRICT;

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_lesson_folders_category
  ON public.lesson_folders(category_id);

CREATE INDEX IF NOT EXISTS idx_lesson_folders_parent
  ON public.lesson_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_lesson_folders_cat_parent
  ON public.lesson_folders(category_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_lesson_folders_archived
  ON public.lesson_folders(archived_at);

CREATE INDEX IF NOT EXISTS idx_lessons_folder
  ON public.lessons(folder_id);

CREATE INDEX IF NOT EXISTS idx_listening_lessons_folder
  ON public.listening_lessons(folder_id);

CREATE INDEX IF NOT EXISTS idx_reading_lessons_folder
  ON public.reading_lessons(folder_id);

-- 5. Partial unique indexes to prevent duplicate active folder names within same parent & category
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_folders_uniq_root_name
  ON public.lesson_folders(category_id, lower(trim(name)))
  WHERE parent_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_folders_uniq_child_name
  ON public.lesson_folders(category_id, parent_id, lower(trim(name)))
  WHERE parent_id IS NOT NULL AND archived_at IS NULL;

-- 6. Trigger validation: maintain updated_at = now() and enforce parent/category consistency
CREATE OR REPLACE FUNCTION public.validate_lesson_folder_parent()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_category text;
  v_parent_archived timestamptz;
BEGIN
  -- Automatically update updated_at timestamp on any row update
  NEW.updated_at := now();

  IF NEW.parent_id IS NOT NULL THEN
    -- Prevent self-parenting
    IF NEW.id IS NOT NULL AND NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Thư mục không thể làm cha của chính nó (id = %)', NEW.id;
    END IF;

    -- Check parent folder exists and fetch its attributes
    SELECT category_id, archived_at
      INTO v_parent_category, v_parent_archived
      FROM public.lesson_folders
     WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Thư mục cha không tồn tại (parent_id = %)', NEW.parent_id;
    END IF;

    -- Prevent cross-category nesting
    IF v_parent_category <> NEW.category_id THEN
      RAISE EXCEPTION 'Thư mục cha thuộc danh mục "%", không khớp với danh mục "%"', v_parent_category, NEW.category_id;
    END IF;

    -- Prevent nesting under archived parent
    IF v_parent_archived IS NOT NULL THEN
      RAISE EXCEPTION 'Không thể tạo hoặc di chuyển thư mục con vào thư mục đã lưu trữ (parent_id = %)', NEW.parent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_lesson_folder_parent ON public.lesson_folders;
CREATE TRIGGER trg_validate_lesson_folder_parent
  BEFORE INSERT OR UPDATE
  ON public.lesson_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lesson_folder_parent();
