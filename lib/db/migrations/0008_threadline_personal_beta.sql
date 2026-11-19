SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- No grant is seeded. Only an administrator may provision or revoke the singleton.
CREATE TABLE threadline_beta_grant (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES focus_users(id),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '7 days'),
  request_limit integer NOT NULL CHECK (request_limit BETWEEN 1 AND 20),
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND request_limit)
);
-- Retain consent provenance when the administrative grant is deleted.
ALTER TABLE threadline_runs ADD COLUMN consent_grant_id uuid,
  ADD COLUMN beta_dispatched_at timestamptz;
