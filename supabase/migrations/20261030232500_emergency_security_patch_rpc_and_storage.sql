-- Migration: Emergency security patch for RPC and Storage permissions
-- Date: 2026-10-30
-- Description:
--   1. Revoke EXECUTE from anon role on admin RPC functions that expose answers/solutions:
--      - get_listening_questions_admin(text)
--      - get_reading_questions_admin(text)
--      - get_practice_questions_admin(text)
--   2. Revoke destructive permissions (UPDATE, DELETE) from anon role on storage bucket 'listening-audio'.
--      Preserve SELECT (public read) and INSERT (teacher audio upload).
--
-- Safety:
--   - Uses standard REVOKE statements (idempotent in PostgreSQL).
--   - Re-creates storage policies conditionally and cleanly.
--   - Does NOT touch tables, business logic, or Supabase Auth.

-- ── 1. Revoke EXECUTE from anon on admin query RPCs ───────────

REVOKE EXECUTE ON FUNCTION public.get_listening_questions_admin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_listening_questions_admin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_reading_questions_admin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_reading_questions_admin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_practice_questions_admin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_practice_questions_admin(text) TO authenticated;

-- ── 2. Harden Storage policies on bucket 'listening-audio' ────
-- Drop dangerous update and delete policies that allowed anonymous tampering.

DROP POLICY IF EXISTS "anon_update_listening_audio" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_listening_audio" ON storage.objects;

-- Only authenticated users may update or delete files in listening-audio
CREATE POLICY "authenticated_update_listening_audio" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'listening-audio')
  WITH CHECK (bucket_id = 'listening-audio');

CREATE POLICY "authenticated_delete_listening_audio" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'listening-audio');

