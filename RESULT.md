# Threadline standalone transition

Threadline opens at `/`. Signed-out visitors see the Threadline Google sign-in
page. Signed-in visitors land on Brain Dump, including when the existing OAuth
callback redirects to `/`.

**Tasks** is available in the sidebar and command palette. It reuses the
existing project controls, task list, editor, and authenticated API. Users can
create projects, filter tasks, create and edit tasks, and complete or reopen
them. Action Plan links open the corresponding task editor inside Threadline.
Previously shared task links also open Tasks.

The 3D City and the City/List switch are out of the user-facing navigation.
The legacy components and packages remain in the repository. Database tables,
migrations, task ownership, and Google OAuth routes retain their existing
contracts. Live Gemini remains disabled.

## Verification

- Chromium exercised signed-out and signed-in root entry, mobile navigation
  at 320 px, project and task creation, editing, completion, and draft
  preservation. It also exercised Action Plan conversion, new and legacy task
  links, reload persistence, and the existing Capture, Review and replay flows.
- Inspected desktop sign-in, linked task editing, and the mobile Tasks screen.
  The narrow workspace navigation uses two rows to keep labels legible.
- Workspace typecheck, frontend tests, frontend and API production builds,
  PostgreSQL integration suites, frontend security tests, dependency audit,
  scoped code review, staged review, and secret audit passed.

## Limits and next decision

Google redirect and state handling were tested locally with isolated fixtures.
Interactive consent with a real Google account was outside this check.
No deployment was performed. Stop for owner review. Legacy City source and
dependency cleanup remain deferred.
