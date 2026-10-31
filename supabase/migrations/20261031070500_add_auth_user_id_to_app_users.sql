-- Migration: Add auth_user_id to public.app_users for Dual-ID Mapping
-- Timestamp: 2026-10-31
-- Description:
--   1. Adds nullable column auth_user_id (uuid) to public.app_users if not exists.
--   2. Creates a partial unique index on auth_user_id where auth_user_id IS NOT NULL.
--   3. Preserves all existing columns, constraints, RLS policies, and data intact.
--   4. Does not add a foreign key constraint to auth.users in this step.

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS auth_user_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_auth_user_id
ON public.app_users(auth_user_id)
WHERE auth_user_id IS NOT NULL;

