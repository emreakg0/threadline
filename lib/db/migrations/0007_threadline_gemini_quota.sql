ALTER TABLE threadline_execution_steps
  ADD COLUMN reserved_tokens integer CHECK (reserved_tokens > 0);

ALTER TABLE threadline_runs
  ADD COLUMN provider_blocked_until timestamptz;

CREATE INDEX threadline_gemini_reservations
  ON threadline_execution_steps (started_at)
  WHERE reserved_tokens IS NOT NULL;

CREATE INDEX threadline_gemini_cooldowns
  ON threadline_runs (provider_blocked_until)
  WHERE provider_blocked_until IS NOT NULL;

CREATE UNIQUE INDEX threadline_gemini_planning_revision
  ON threadline_runs (user_id, source_revision_id, model, pipeline_version)
  WHERE provider = 'gemini' AND model = 'gemini-3.5-flash-lite' AND schema_version = 2;
