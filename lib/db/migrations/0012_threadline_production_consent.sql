-- Nullable markers separate production consent and its single-use dispatch from
-- earlier development grants. Keep these columns when rolling back the app.
SET LOCAL lock_timeout = '2s';
ALTER TABLE threadline_runs
  ADD COLUMN production_consented_at timestamptz,
  ADD COLUMN production_dispatched_at timestamptz,
  ADD CONSTRAINT threadline_production_dispatch_consent CHECK (
    (production_consented_at IS NULL OR (provider='gemini' AND schema_version IN (2,3) AND consent_grant_id IS NULL))
    AND (production_dispatched_at IS NULL OR
      (production_consented_at IS NOT NULL AND production_dispatched_at >= production_consented_at))
  );
