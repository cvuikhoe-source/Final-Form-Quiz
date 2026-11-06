-- ==============================================================================
-- Migration / Audit Script: Vocabulary Duplicate Prevention & Unique Index
-- Table: public.vocabulary_items
-- Target Database: QuizForms Production (ecqhgdpxlrnnfgswxbro)
-- Note: DO NOT run automatically. Kept for review before applying.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PHẦN 1: QUERY AUDIT TRÙNG LẶP TRONG DỮ LIỆU HIỆN TẠI
-- Chạy query này trước khi áp dụng Unique Index để phát hiện các bản ghi trùng lặp:
-- ------------------------------------------------------------------------------
/*
SELECT 
  lesson_id,
  TRIM(vocabulary) AS norm_vocabulary,
  TRIM(reading_hiragana) AS norm_reading_hiragana,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY created_at ASC) AS item_ids,
  ARRAY_AGG(vocab_id ORDER BY created_at ASC) AS vocab_ids,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM public.vocabulary_items
GROUP BY 
  lesson_id,
  TRIM(vocabulary),
  TRIM(reading_hiragana)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
*/

-- ------------------------------------------------------------------------------
-- PHẦN 2: TẠO FUNCTION CHUẨN HÓA KHÓA TỪ VỰNG (IMMUTABLE) NẾU CẦN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_normalize_vocab_key(p_text text)
RETURNS text AS $$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_text, '')), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------------
-- PHẦN 3: TẠO UNIQUE INDEX CÓ ĐIỀU KIỆN TRÊN BẢNG VOCABULARY_ITEMS
-- Đảm bảo trong cùng 1 bài học (lesson_id), không thể tạo 2 bản ghi có cùng
-- vocabulary và reading_hiragana (đã chuẩn hóa khoảng trắng).
-- Chỉ áp dụng khi bảng không còn bản ghi trùng lặp chưa xử lý.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count int;
BEGIN
  -- Kiểm tra xem hiện có bản ghi trùng lặp nào không
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT lesson_id, TRIM(vocabulary), TRIM(reading_hiragana)
    FROM public.vocabulary_items
    GROUP BY lesson_id, TRIM(vocabulary), TRIM(reading_hiragana)
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'BẢNG vocabulary_items HIỆN ĐANG CÓ % NHÓM BẢN GHI TRÙNG LẶP. CHƯA THỂ TẠO UNIQUE INDEX TỰ ĐỘNG.', v_dup_count;
  ELSE
    -- Tạo Unique Index nếu không có bản ghi trùng
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'vocabulary_items' 
        AND indexname = 'idx_unique_vocabulary_lesson_vocab_reading'
    ) THEN
      CREATE UNIQUE INDEX idx_unique_vocabulary_lesson_vocab_reading
        ON public.vocabulary_items (
          lesson_id,
          (public.fn_normalize_vocab_key(vocabulary)),
          (public.fn_normalize_vocab_key(reading_hiragana))
        );
      RAISE NOTICE 'ĐÃ TẠO THÀNH CÔNG UNIQUE INDEX idx_unique_vocabulary_lesson_vocab_reading.';
    END IF;
  END IF;
END $$;

