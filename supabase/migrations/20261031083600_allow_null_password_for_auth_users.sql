-- Migration: Allow NULL password for Auth-backed users in public.app_users
-- Timestamp: 2026-10-31
-- Description:
--   New Auth-backed users keep passwords only in Supabase Auth.
--   This legacy column remains temporarily for unmigrated users.
--   Remove the column only after the legacy migration is fully completed.

ALTER TABLE public.app_users
ALTER COLUMN password DROP NOT NULL;

