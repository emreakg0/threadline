-- Compatibility expansion only: a queued job can end without ever starting work.
-- Do not invent a processing start timestamp to satisfy the old timing constraint.
-- Existing rows/columns/events are untouched. Rollback: retain this permissive check
-- with reverted application code. Restoring the old check would reject valid new
-- unstarted terminal runs; do not rewrite their history to force a down migration.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE threadline_runs ADD CONSTRAINT threadline_runs_terminal_times CHECK (
 completed_at IS NULL OR
 (started_at IS NOT NULL AND completed_at >= started_at) OR
 (started_at IS NULL AND status IN ('failed','cancelled','interrupted') AND completed_at >= created_at)
) NOT VALID;
ALTER TABLE threadline_runs VALIDATE CONSTRAINT threadline_runs_terminal_times;
ALTER TABLE threadline_runs DROP CONSTRAINT threadline_runs_check;
