/*
# Add target_classes column to lessons table

Adds a text[] column to store which classes a lesson is assigned to.
Empty array or ['Tất cả'] means visible to all students.

## Modified Tables
- lessons: added target_classes text[] NOT NULL DEFAULT '{}'
*/

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS target_classes text[] NOT NULL DEFAULT '{}';
