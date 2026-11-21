# Security reports

While the repository is private, report security issues directly to the repository owner using the project's existing private channel. Include affected versions, impact, and a minimal description using synthetic data. Keep keys, session cookies, and identifying user data out of reports.

Before opening the project, designate a monitored security address or enable GitHub private vulnerability reporting and update this file with the chosen channel. Record supported release versions when the first version is published.

Run `python3 scripts/secret-audit.py` to review source history and local backup refs. The output identifies locations without printing secrets. The [release checklist](RELEASE.md) records the existing publication blockers.
