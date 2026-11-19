# Threadline GitHub backup and recovery

Private source repository: https://github.com/emreakg0/threadline

`origin` is the GitHub repository. `main` is the project branch. The existing `gitsafe-backup` remote is retained. Existing Git history, including recovery checkpoint `1a3834e`, is preserved. Repository creation is a source backup, not an application deployment.

## Completed milestones

1. Read AGENTS.md, PROJECT_STATUS.md and DEVELOPMENT_LOG.md; inspect code and Git state.
2. Implement and run applicable tests/builds. Update project status, append the development log and record the exact next task.
3. Review `git diff` and `git status --short`. Stage intended files explicitly, then review `git diff --cached` and run `git diff --cached --check`.
4. Run `python3 scripts/secret-audit.py`. It scans reachable Git blobs and current tracked files for credential patterns and values of sensitive environment settings; output shows locations/categories only. Also inspect file content for sensitive user data, which pattern checks cannot reliably identify. Ignoring a file does not untrack an already committed file.
5. Confirm privacy using `gh repo view emreakg0/threadline --json isPrivate`. Commit with a meaningful message and push using `git push origin main`.
6. Verify that `git rev-parse HEAD` equals the hash from `git ls-remote origin refs/heads/main`, and confirm a clean working tree. Report failures; never force-push.

Future Codex sessions are authorized to commit and push completed milestones automatically. This instruction does not create a background scheduler: local changes become a GitHub backup after a successful push.

## Recover on another machine

Authenticate GitHub CLI privately, then:

```sh
gh repo clone emreakg0/threadline
cd threadline
git status
```

If Git HTTPS authentication is not configured on the new machine, run `gh auth setup-git` after signing in. This workspace uses a repository-local GitHub helper calling `gh auth git-credential`; no token is stored in the remote URL.

Read the three project memory files before continuing. Follow README.md and FOCUS_CITY_SETUP.md to install with the pinned pnpm lockfile, privately restore runtime configuration and apply additive migrations to the intended database. Do not print credentials or put them in the repository.

This repository contains frontend/backend source, database schema migrations, tests, dependency manifests/lockfile and development documentation. It intentionally excludes node_modules, builds, local environments, OAuth credentials, tokens, database dumps and user data. Live PostgreSQL backup/restore needs a separately authorized private backup destination and retention policy; Git does not back up the live database or secret configuration.

## If a secret is found

Stop before pushing and report the affected path/category without revealing its value. Adding a gitignore rule or deleting the current file does not remove historical copies. Do not rewrite published history or force-push without permission; arrange credential rotation and an approved cleanup.
