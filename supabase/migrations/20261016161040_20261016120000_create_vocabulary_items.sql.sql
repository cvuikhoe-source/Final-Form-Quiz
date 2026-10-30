/*
# Create vocabulary_items table for vocabulary flashcard lessons

This table stores individual vocabulary words that belong to vocabulary lessons.
Each vocabulary lesson (stored in the existing `lessons` table with categoryId = 'cat-vocab')
contains multiple vocabulary items in this table.

## New Tables
1. vocabulary_items
   - id (text, primary key) — unique identifier
   - lesson_id (text, not null) — references lessons.id (no FK constraint, soft reference)
   - vocab_id (text) — original ID from Excel import
   - vocabulary (text, not null) — Japanese word, e.g. 学校
   - reading_hiragana (text) — hiragana reading, e.g. がっこう
   - reading_romaji (text) — romaji reading
   - onyomi (text) — on'yomi reading
   - kunyomi (text) — kun'yomi reading
   - meaning_vi (text, not null) — Vietnamese meaning
   - jlpt_level (text) — JLPT level: N5, N4, N3, N2, N1
   - word_type (text) — part of speech: noun, verb, adjective, etc.
   - tags (text) — comma-separated tags
   - related_words (text[]) — array of related compound words
   - audio_text (text) — text to use for speech synthesis
   - example_jp_1 (text) — first example sentence in Japanese
   - example_reading_1 (text) — reading of first example
   - example_vi_1 (text) — Vietnamese translation of first example
   - example_jp_2 (text) — second example sentence in Japanese
   - example_reading_2 (text) — reading of second example
   - example_vi_2 (text) — Vietnamese translation of second example
   - active (boolean, default true) — whether this item is active
   - sort_order (int, default 0) — display order within lesson
   - created_at (timestamptz)

## Security
- RLS enabled on vocabulary_items
- TO anon, authenticated CRUD (no Supabase Auth; app manages its own users)
- All data is intentionally shared/public within the app
*/

CREATE TABLE IF NOT EXISTS vocabulary_items (
  id text PRIMARY KEY,
  lesson_id text NOT NULL,
  vocab_id text NOT NULL DEFAULT '',
  vocabulary text NOT NULL,
  reading_hiragana text NOT NULL DEFAULT '',
  reading_romaji text NOT NULL DEFAULT '',
  onyomi text NOT NULL DEFAULT '',
  kunyomi text NOT NULL DEFAULT '',
  meaning_vi text NOT NULL,
  jlpt_level text NOT NULL DEFAULT '',
  word_type text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  related_words text[] NOT NULL DEFAULT '{}',
  audio_text text NOT NULL DEFAULT '',
  example_jp_1 text NOT NULL DEFAULT '',
  example_reading_1 text NOT NULL DEFAULT '',
  example_vi_1 text NOT NULL DEFAULT '',
  example_jp_2 text NOT NULL DEFAULT '',
  example_reading_2 text NOT NULL DEFAULT '',
  example_vi_2 text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vocabulary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_vocabulary_items" ON vocabulary_items;
CREATE POLICY "anon_read_vocabulary_items" ON vocabulary_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vocabulary_items" ON vocabulary_items;
CREATE POLICY "anon_insert_vocabulary_items" ON vocabulary_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vocabulary_items" ON vocabulary_items;
CREATE POLICY "anon_update_vocabulary_items" ON vocabulary_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vocabulary_items" ON vocabulary_items;
CREATE POLICY "anon_delete_vocabulary_items" ON vocabulary_items FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vocabulary_items_lesson_id ON vocabulary_items(lesson_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vocabulary_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vocabulary_items;
  END IF;
END $$;
