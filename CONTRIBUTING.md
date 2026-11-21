# Contributing

Read [AGENTS.md](AGENTS.md) before working in this workspace. Use the pinned toolchain and frozen lockfile. Keep migrations additive and validate upgrades in a disposable database.

Use synthetic notes and mock or intercepted provider responses in tests. Include regressions for changes to sessions, ownership, quotas, and immutable source history. Keep API credentials and approval data in the secret store.

Run the focused check first, then the relevant checks in [README.md](README.md). Include a description of user-visible changes, verification, and migration instructions when submitting a patch. Follow [SECURITY.md](SECURITY.md) for sensitive reports.
