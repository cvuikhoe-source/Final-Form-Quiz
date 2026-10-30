/*
# Add per-class deadlines to exams

1. Modified Tables
- `exams` — added `class_deadlines` (jsonb, not null, default '{}').
  Maps class name -> ISO deadline string, e.g. {"MVTC-N3": "2026-12-25T15:00:00.000Z"}.
  Classes missing from the map use the exam's existing `deadline` (default deadline).
  Existing exams get '{}' so they keep working with the default deadline only — no data changed.

2. Security
- No policy changes; the column is read/written through the existing `exams` policies.

3. Notes
- Effective deadline for a student = class_deadlines[student's class] ?? exam.deadline.
- Exam status stays per-exam ('open'/'upcoming'/'closed'); per-class expiry is computed
  by comparing now() against the effective deadline.
*/
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_deadlines jsonb NOT NULL DEFAULT '{}'::jsonb;
