-- Migration: Create grammar_collections and grammar_collection_items tables
-- Created at: 2026-10-31 17:00:00 (Local time)
--
-- DESCRIPTION:
--   1. Creates public.grammar_collections to group individual grammar patterns (Parent–Child model).
--   2. Creates public.grammar_collection_items as a junction table linking collections and lessons.
--   3. Enforces UNIQUE(lesson_id) in version 1 so each grammar lesson can belong to at most ONE collection.
--   4. Enforces ON DELETE CASCADE on collection_id, ON DELETE RESTRICT on lesson_id.
--   5. Enforces folder_id to reference public.lesson_folders(id) with ON DELETE RESTRICT.
--   6. Implements strict RLS: REVOKES INSERT, UPDATE, DELETE from anon/authenticated roles.
--      All mutations MUST be performed via Edge Function manage-grammar-collections.
--   7. Implements trigger on grammar_collections to maintain updated_at = now().
--
-- ROLLBACK SCRIPT (Strict ordered teardown - do not run unless rolling back):
--   DROP TRIGGER IF EXISTS trg_grammar_collections_updated_at ON public.grammar_collections;
--   DROP FUNCTION IF EXISTS public.handle_grammar_collections_updated_at();
--   DROP TABLE IF EXISTS public.grammar_collection_items;
--   DROP TABLE IF EXISTS public.grammar_collections;

-- 1. Create grammar_collections table
CREATE TABLE IF NOT EXISTS public.grammar_collections (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  jlpt_level text DEFAULT '',
  folder_id text REFERENCES public.lesson_folders(id) ON DELETE RESTRICT,
  target_classes text[] NOT NULL DEFAULT '{}',
  created_by text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- 2. Create grammar_collection_items table
CREATE TABLE IF NOT EXISTS public.grammar_collection_items (
  id text PRIMARY KEY,
  collection_id text NOT NULL REFERENCES public.grammar_collections(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_grammar_collection_lesson UNIQUE (collection_id, lesson_id),
  -- In version 1: each lesson belongs to at most ONE collection
  CONSTRAINT uq_grammar_collection_item_lesson UNIQUE (lesson_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_grammar_collections_folder ON public.grammar_collections(folder_id);
CREATE INDEX IF NOT EXISTS idx_grammar_collections_jlpt ON public.grammar_collections(jlpt_level);
CREATE INDEX IF NOT EXISTS idx_grammar_collections_archived ON public.grammar_collections(archived_at);
CREATE INDEX IF NOT EXISTS idx_grammar_collections_sort ON public.grammar_collections(sort_order);

CREATE INDEX IF NOT EXISTS idx_grammar_collection_items_collection ON public.grammar_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_grammar_collection_items_lesson ON public.grammar_collection_items(lesson_id);
CREATE INDEX IF NOT EXISTS idx_grammar_collection_items_coll_sort ON public.grammar_collection_items(collection_id, sort_order);

-- 4. Trigger for automatic updated_at maintenance
CREATE OR REPLACE FUNCTION public.handle_grammar_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grammar_collections_updated_at ON public.grammar_collections;
CREATE TRIGGER trg_grammar_collections_updated_at
  BEFORE UPDATE ON public.grammar_collections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_grammar_collections_updated_at();

-- 5. Strict RLS Security Model
ALTER TABLE public.grammar_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grammar_collection_items ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke write permissions from anon and authenticated roles
REVOKE INSERT, UPDATE, DELETE ON public.grammar_collections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.grammar_collection_items FROM anon, authenticated;

-- Read policies:
-- Anon can ONLY read non-archived collections that are public (target_classes = '{}' or contains 'Tất cả')
DROP POLICY IF EXISTS "anon_read_grammar_collections" ON public.grammar_collections;
DROP POLICY IF EXISTS "read_grammar_collections" ON public.grammar_collections;
CREATE POLICY "anon_read_grammar_collections" ON public.grammar_collections FOR SELECT
  TO anon USING (
    archived_at IS NULL
    AND (target_classes = '{}' OR 'Tất cả' = ANY(target_classes))
  );

-- Authenticated users can read non-archived collections if:
-- 1. Collection is public (target_classes is empty or contains 'Tất cả')
-- 2. User is teacher or admin (from app_users)
-- 3. User's assigned classes overlap with target_classes
DROP POLICY IF EXISTS "authenticated_read_grammar_collections" ON public.grammar_collections;
CREATE POLICY "authenticated_read_grammar_collections" ON public.grammar_collections FOR SELECT
  TO authenticated USING (
    archived_at IS NULL
    AND (
      target_classes = '{}'
      OR 'Tất cả' = ANY(target_classes)
      OR EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.auth_user_id = auth.uid()
        AND (
          u.role IN ('admin', 'teacher')
          OR (u.assigned_classes IS NOT NULL AND u.assigned_classes && grammar_collections.target_classes)
        )
      )
    )
  );

DROP POLICY IF EXISTS "read_grammar_collection_items" ON public.grammar_collection_items;
CREATE POLICY "read_grammar_collection_items" ON public.grammar_collection_items FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.grammar_collections c
      WHERE c.id = grammar_collection_items.collection_id
    )
  );

-- 6. Add to Realtime Publication if available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'grammar_collections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE grammar_collections;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'grammar_collection_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE grammar_collection_items;
  END IF;
END $$;

