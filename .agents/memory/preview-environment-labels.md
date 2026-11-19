---
name: Preview environment labels
description: Distinguishing the hosting-platform label from a service's production configuration.
---

Do not interpret `REPLIT_ENVIRONMENT=production` as proof that the API is deployed
production: this workspace's development workflow also carries that label.

**Why:** A development-only authorization guard incorrectly kept the owner beta
closed despite valid development configuration. Safe startup diagnostics showed
the platform label was production while the service's NODE_ENV was not.

**How to apply:** Keep administrative authorization scoped to development using
the environment configuration tools, deny a service with NODE_ENV=production,
and confirm safe gate status in the actual managed workflow rather than assuming
an agent shell has the same environment.
