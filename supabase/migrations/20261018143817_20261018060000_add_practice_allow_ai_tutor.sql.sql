/*
# Add AI Tutor permission flag to practices

1. New columns
- `practices.allow_ai_tutor` (boolean, NOT NULL, default true): teacher-controlled
  switch that controls whether students may open and use the AI Tutor assistant
  while taking this practice.

2. Modified tables
- `practices`: adds the new boolean column. No existing data is changed or
  deleted; existing practices default to enabled (true) so current behavior is
  preserved unless a teacher explicitly disables it.

3. Security
- No RLS policy changes. The column is readable by the same roles that already
  SELECT from `practices`. The Edge Function that serves AI Tutor requests MUST
  re-check this flag server-side before responding (UI hiding alone is not
  enough), which is implemented in the ai-tutor edge function.

4. Important notes
- Idempotent: uses ADD COLUMN IF NOT EXISTS, safe to re-run.
- No destructive operations.
*/

ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS allow_ai_tutor boolean NOT NULL DEFAULT true;
