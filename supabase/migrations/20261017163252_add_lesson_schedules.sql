/*
# Add learning-time schedules to lesson categories and lessons

1. Modified Tables
- `lesson_categories`
  - `default_start_at` (timestamptz, nullable) — default learning start time for all lessons in the category
  - `default_deadline` (timestamptz, nullable) — default learning deadline for all lessons in the category
  - `class_schedules` (jsonb, not null, default '{}') — per-class overrides:
    { "MVTC-N3": { "startAt": ISO, "deadline": ISO } }
- `lessons`
  - `start_at` (timestamptz, nullable) — lesson-specific learning start
  - `deadline` (timestamptz, nullable) — lesson-specific learning deadline
  - `class_schedules` (jsonb, not null, default '{}') — per-class overrides for this lesson:
    { "MVTC": { "startAt": ISO, "deadline": ISO } }

2. Security
- No policy changes; new columns are read/written through existing table policies.

3. Effective schedule resolution (in app code)
  start = lesson.classSchedules[cls].startAt ?? lesson.startAt ?? category.classSchedules[cls].startAt ?? category.defaultStartAt
  deadline = lesson.classSchedules[cls].deadline ?? lesson.deadline ?? category.classSchedules[cls].deadline ?? category.defaultDeadline
- null at the end of the chain means "no time limit" for that field.
- Existing rows get NULL/'{}' so old lessons keep working unchanged.
*/
ALTER TABLE lesson_categories
  ADD COLUMN IF NOT EXISTS default_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS default_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS class_schedules jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS class_schedules jsonb NOT NULL DEFAULT '{}'::jsonb;
