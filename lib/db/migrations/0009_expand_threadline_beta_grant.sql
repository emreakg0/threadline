SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Expand the ceiling in place and retain the grant and all recorded usage.
ALTER TABLE threadline_beta_grant
  DROP CONSTRAINT threadline_beta_grant_request_limit_check,
  ADD CONSTRAINT threadline_beta_grant_request_limit_check
    CHECK (request_limit BETWEEN 1 AND 100);
