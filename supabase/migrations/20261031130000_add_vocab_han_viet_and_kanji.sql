-- ==============================================================================
-- Migration: Add Sino-Vietnamese (han_viet) and Kanji Breakdown fields
-- Table: public.vocabulary_items
-- Target Database: QuizForms Production (ecqhgdpxlrnnfgswxbro)
-- Note: DO NOT run automatically. Kept for review before applying.
-- ==============================================================================

ALTER TABLE public.vocabulary_items
  ADD COLUMN IF NOT EXISTS han_viet text NULL,
  ADD COLUMN IF NOT EXISTS kanji_breakdown jsonb NULL,
  ADD COLUMN IF NOT EXISTS kanji_memory_hint text NULL;

COMMENT ON COLUMN public.vocabulary_items.han_viet IS
  'Sino-Vietnamese reading (Âm Hán Việt) of the full vocabulary word, e.g. "ĐẶC SẮC" for "特色".';

COMMENT ON COLUMN public.vocabulary_items.kanji_breakdown IS
  'JSON array of objects analyzing individual kanji characters in the word: [{"kanji": "特", "hanViet": "ĐẶC", "meaningVi": "Đặc biệt, riêng biệt", "onyomi": "トク", "kunyomi": ""}, ...]';

COMMENT ON COLUMN public.vocabulary_items.kanji_memory_hint IS
  'Mnemonic association or memory tips to help students remember the kanji composition and meaning.';

