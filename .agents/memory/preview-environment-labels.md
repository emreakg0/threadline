---
name: Runtime authorization configuration
description: Distinguishing service deployment settings and keeping administrative authorization out of tracked configuration.
---

Do not interpret `REPLIT_ENVIRONMENT=production` as proof that the API is deployed
production: this workspace's development workflow also carries that label.

**Why:** A development-only authorization guard incorrectly kept the owner beta
closed despite valid development configuration. Safe startup diagnostics showed
the platform label was production while the service's NODE_ENV was not.

**How to apply:** Deny a service with NODE_ENV=production and confirm safe gate
status in the actual managed workflow rather than assuming an agent shell has
the same environment.

Keep beta approval values and key fingerprints in Replit Secrets or secure
Git-ignored, deployment-excluded runtime configuration, never non-secret
configuration variables.

**Why:** Replit's non-secret configuration tools persisted the approval and
activation flag into the tracked `.replit` file. The old credential-pattern
audit did not detect a key fingerprint or approval, so a checkpoint retained them.

**How to apply:** Do not use non-secret environment-variable setters for sensitive
administrative authorization. Check storage behavior and staged files explicitly;
scan index and history for approval values and key fingerprints as well as raw
credentials. Preserve existing budgets and expiry when relocating configuration.
