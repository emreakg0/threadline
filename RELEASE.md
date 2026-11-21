# Threadline release checklist

## Decision

**No-go for a public or open-source launch.** The candidate passed local checks. The hosted OAuth flow, production uptime and recovery, live v3 acceptance, privacy operations, and public repository review remain launch gates. The manual workspace and read-only demo are available with production AI disabled.

## Production environment variable names

Required for a working hosted workspace

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `APP_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Required only after separate production AI approval

- `THREADLINE_PRODUCTION_AI_APPROVED`
- `THREADLINE_PRODUCTION_GEMINI_API_KEY`
- `THREADLINE_PRODUCTION_GEMINI_KEY_SHA256`
- `THREADLINE_PRODUCTION_AI_SUBJECTS`
- `THREADLINE_PRODUCTION_AI_DAILY`
- `THREADLINE_PRODUCTION_AI_RPM`
- `THREADLINE_PRODUCTION_AI_TPM`

Use `pnpm build:release` and `pnpm start:release`. Express serves the built frontend and same-origin API. Set the stable HTTPS origin in the secret store even when TLS terminates at a host proxy. Use an independent production database, Google OAuth client, and Gemini project. The deployment ignore file excludes local approvals, environment files, and the Git object store. Inspect the actual upload manifest and runtime secret names before proceeding.

## Google Auth Platform setup

1. In Google Cloud Console, select a dedicated production project. Open **Google Auth Platform → Branding**. Set the Threadline name, monitored support email, developer contact email, and owned authorized domain. Add the HTTPS homepage, `/privacy`, and `/terms` URLs. Verify domain ownership as Google requests.
2. Under **Audience**, choose **External** for users outside your organization. Keep it in **Testing** during the hosted smoke test and add only the approved testers. Review publishing status and complete required brand verification before public sign-in.
3. Under **Data Access**, keep only `openid`, email and profile. Threadline uses the authorization-code flow with PKCE, plus verified Google UserInfo. It requests neither offline access nor Google Drive privileges.
4. Under **Clients**, create a production **Web application** client. Add exactly `https://<owned-host>/api/auth/google/callback` as the authorized redirect URI. This implementation uses a server redirect and has no Google JavaScript client. Store the client ID and secret in hosting secrets.
5. On the final origin, verify fresh sign-in, denial, state expiration, logout, session expiration, blocked cross-origin writes, and owner isolation with two test accounts. Confirm `HttpOnly`, `Secure`, `SameSite=Lax`, and seven-day session expiration. Redact callback query strings in edge access logs.

[Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server) · [Google branding and verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

## Gemini approval and bounded live acceptance

Production requires explicit operator opt-in and a separate key bound to its SHA-256 fingerprint. Configure only verified Google subject IDs for an eligible pilot cohort. Configure project daily, RPM and TPM ceilings at or below the active project limits in AI Studio. The code caps per-user usage at two daily reservations and one queued job, the project queue at eight jobs, and dispatch at one global lease with six-second spacing. PostgreSQL serializes reservations and marks each consented dispatch once. Quota is conservative and includes failed or unused reservations. No extra allowance comes from additional keys in the same Google project. Keep the production project dedicated to this app and prevent parallel deployments from using the same key with separate databases.

Check the current provider terms and pricing, account region, and active tier before enabling. The published terms require an eligible professional use, restrict access by minors and across regions, and require paid service when providing the Gemini client in the EEA, Switzerland, or UK. Unpaid inputs and outputs may be used to improve products and reviewed by humans. The pilot needs operator verification of age, use, and eligible location before the subject is approved. No unrestricted public AI access or paid tier is approved. Manual planning is the path for ineligible accounts, sensitive content, or exhausted quota. [Gemini terms](https://ai.google.dev/gemini-api/terms) · [Project rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

The configured Gemini 3.5 Flash-Lite model lists structured output support. The REST request uses JSON MIME type and a shallow object/array schema, with nullable types, required properties, and closed object fields. The adapter enforces the response ceiling, rejects incomplete candidates, and applies local shape, graph and source grounding validation before commit. Offline fixtures cover the wire request and representative responses. The recorded 5xx leaves actual v3 schema acceptance unverified. [Model capabilities](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite) · [REST generateContent](https://ai.google.dev/api/generate-content) · [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

After separate approval, use the existing **development** owner authorization. Check that the grant and key-bound approval are current and positively verify remaining capacity under the existing three-dispatch evaluation cap. If expired, obtain an explicitly approved renewal. Submit one approved synthetic revision through the real consent flow. Capture only timestamp, run status, numeric HTTP status on failure, finish reason when available, and pass/fail outcomes in the private test record. Accept only if Gemini returns a complete graph which passes validation, persists atomically, and replays in How It Works. Stop on a failure, timeout or unclear dispatch. A later attempt requires explicit approval, a fresh revision, and remaining allowance. Leave production AI disabled while assessing results.

## Hosting and privacy sign-off

- Confirm the hosting plan before activating a worker. Replit Autoscale can sleep while the queue is idle. Use an approved always-on worker/host for production AI and verify it services jobs with zero browser traffic. [Replit deployment types](https://docs.replit.com/features/publishing/deployment-types)
- Provision a dedicated PostgreSQL instance with verified TLS, limited access, a backup schedule and tested restore. Run `node lib/db/scripts/migrate.mjs` once against the approved production database before starting. Verify `/api/healthz` and `/api/readyz`, then re-run the migrator to confirm no changes. Verify rollback of application code while leaving additive columns intact.
- Exercise the built landing page, demo and legal URLs in desktop and mobile browsers at the final HTTPS origin. Check CSP, private API `no-store` headers, edge HSTS, auth, direct links, restart behavior, and two-account access boundaries. Verify provider-off manual planning from a saved brain dump. Monitor queue age, failures, cooldowns, readiness and worker restarts without logging source or authorization data.
- Configure edge rate limits for sign-in and API requests, and test peak load. The application bounds OAuth state issuance and enforces AI admission and dispatch limits. It does not currently implement general per-IP throttling.
- Finalize the Privacy Policy and Terms with the responsible operator, support/contact information, hosting region, retention and a verified data access/export/deletion process covering the database, logs and backups. The app shows actual behavior including immutable revisions and archiving. Self-service account export/deletion is unavailable. Set periodic deletion schedules for expired sessions and operational logs, and rehearse a support request privately.
- Keep the production AI switch off until operator approval, quota confirmation, hosted worker verification and v3 live acceptance. To disable running production instances, turn off the switch and reload the runtime configuration. Verify all replicas show AI unavailable. A request already sent cannot be recalled.

## Open-source publication checklist

- [ ] Review every ref intended for publication, tags, archived branches, backup refs and retained historical blobs. The local scan found the documented development approval metadata in an older backup blob outside current `main` history. One non-noreply author address also appears across local refs/reflogs. Obtain identity approval or use a clean export reviewed for private notes and metadata.
- [ ] Review historical configuration, internal operating notes and any issue contents before a public export. Keep the private backup remote and ref namespace separate. Search for prior exposure. Rotate any credentials found in a publication candidate or exposed in an untrusted location before release. A key fingerprint and authorization metadata alone do not establish plaintext exposure. If publishing affected history, obtain separate authorization for cleanup or carry forward a sanitized snapshot.
- [ ] Confirm contributor and template rights, copyrighted assets, and the proposed MIT text with the owner. Preserve required dependency notices in artifacts. Publish only after final source and distribution-license review.
- [ ] Verify sample config is blank for secrets and cohort IDs. Keep archives, database dumps, local approvals, personal test data, and operational messages outside the release. Re-run the credential audit, package audit, manual privacy review, and the tested launch checklist on the exact source to be published.
