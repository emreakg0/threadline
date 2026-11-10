# Supply-chain configuration audit — 2026-11-10

## Actual installation and CI paths

- Installed: Node v24.22.1, pnpm 10.26.1, npm 11.19.1, Semgrep 1.179.0. No package-manager upgrade or switch was made.
- This is a pnpm workspace with one committed pnpm-lock.yaml (format 9); no package-lock.json, npm-shrinkwrap.json or yarn.lock. Registry packages have integrity-pinned resolutions; reviewed source references contain only internal workspace links, no Git/direct tarball resolutions. Existing registry aliases such as npm:tsx remain compatible.
- README/replit.md and scripts/post-merge.sh use `pnpm install --frozen-lockfile`. Replit postMerge invokes that script; deployment metadata only prunes the store after builds. No repository GitHub Actions or npm-install CI workflow exists. No CI/hosting settings were enabled or changed.
- package.json now pins pnpm 10.26.1 and Node 24, with strict pnpm version and engine checks. Its preinstall hook rejects other installers/versions and competing locks WITHOUT deleting files. This replaces a hook which removed package-lock.json/yarn.lock. Lifecycle hooks can be bypassed and run after resolution; they are not an isolation boundary.

## Findings and disposition

| Reported rule | Evidence before change | Disposition |
| --- | --- | --- |
| npm-missing-minimum-release-age | .npmrc lacked npm's control; no npm installation workflow exists. | Operationally inapplicable to the supported installer, but valid fallback hardening: installed npm supports `min-release-age=7` (days), now configured and behavior-tested. No unsupported pnpm-style npm key was added. |
| pnpm-block-exotic-sub-dependencies | Missing; installed 10.26.1 supports it (introduced 10.26.0), default false. | Fixed with `blockExoticSubdeps: true`. Local fixture proves an HTTP tarball subdependency is rejected. |
| pnpm-minimum-release-age | Already 1440 minutes, with blanket @replit/* and stripe-replit-sync exceptions. | Not a missing-control false positive: the actual rule requires at least 10080 minutes. Raised to 10080 (seven days), removed unjustified blanket exemptions. |
| pnpm-trust-policy | Missing; installed 10.26.1 supports `no-downgrade`. | Fixed with `trustPolicy: no-downgrade`; no trust exclusions. Local registry fixture proves a provenance downgrade is rejected. |

No blanket Semgrep suppressions were added. The user report labeled the findings High; the public rules retrieved for this audit mark severity MEDIUM and metadata impact HIGH. That presentation difference does not change the fixes. The hosted original scan artifact could not be retrieved because GitHub code scanning is not enabled; the four named public rules were fetched at a fixed revision and all four baseline findings reproduced locally.

## Supported configuration

pnpm-workspace.yaml holds `minimumReleaseAge: 10080`, `minimumReleaseAgeExclude: []`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`, `trustPolicyExclude: []`, `engineStrict: true` and `packageManagerStrictVersion: true`. Existing peer behavior is preserved; strictPeerDependencies moved from .npmrc to YAML. The existing dependency build-script allowlist remains in place.

.npmrc holds npm's `min-release-age=7`; its unit is DAYS, while pnpm's YAML unit is MINUTES. Version-specific settings were confirmed in installed implementations and targeted `config get` output, not merely written into config. Newer controls such as trustPolicyIgnoreAfter (10.27+) and trustLockfile were deliberately not added to 10.26.1. No existing dependency versions, integrity hashes or lockfile content changed.

## Urgent security-patch exceptions

No active release-age or trust exceptions are required. If cooldown blocks a necessary fix:

1. Review the advisory, affected range, publisher/provenance, release source and distributed artifact; assess waiting risk against intake risk.
2. Pin the patched version and add only `package-name@exact.version` to minimumReleaseAgeExclude. Record advisory, reason, reviewed evidence, owner and removal date here. An age exception does not disable trust checks or exempt the package's dependencies.
3. If trust itself is blocked, investigate first; an exact-version trustPolicyExclude requires its own documented justification. Never use trustPolicyIgnoreAfter on this unsupported version or disable trust globally.
4. Run the policy fixtures, frozen install, dependency audit and applicable tests/builds. Remove the age exception after seven days. Adjust the test's expected active exception inventory intentionally if an exception is added.

The supported installer is pnpm. npm's fallback exceptions match package names rather than exact versions; do not use npm to bypass the pnpm review process.

## Verification and reproduction

- `pnpm config get minimumReleaseAge` => 10080; blockExoticSubdeps => true; trustPolicy => no-downgrade. npm config get min-release-age => 7; no unknown-setting warnings from the revised .npmrc.
- `CI=true pnpm install --frozen-lockfile`: PASS, all nine workspace projects, preinstall guard PASS; lockfile unchanged.
- `python3 scripts/test-supply-chain.py` / `pnpm test:supply-chain`: PASS against a temporary loopback registry, with isolated manifests, locks and stores: young version rejected; exact urgent exception accepted; same exception does not allow another version; trust downgrade rejected; exotic transitive tarball rejected; npm fallback rejects young release. No external fixture packages or live credentials used. Initial test harness needed pnpm's actual NO_MATURE_MATCHING_VERSION code and HTTP HEAD support; those test issues were corrected.
- Separate isolated guard checks: pinned pnpm accepted, npm/older pnpm rejected, competing lock preserved unchanged.
- Workspace typecheck, city layout/camera tests, frontend exposure regression and two-account API integration: PASS.
- `PORT=21715 BASE_PATH=/ pnpm build`: PASS, including frontend, backend and mockup production builds. Existing large 3D chunk advisory remains.
- `pnpm audit`: zero known advisories. This reports the registry's known issues at review time, not proof of safety.
- Semgrep: four upstream rules pinned to semgrep/semgrep-rules revision `16b9e6d45f10649f6a531ec4838ed9924372c3bc`; BEFORE = 4 findings, AFTER = 0 findings, no scan errors. Metrics/version checks disabled; no source upload or authenticated hosted scan invoked. Scanned .npmrc and pnpm-workspace.yaml with no exclusions/suppressions. Temporary JSON reports: /tmp/focus-city-semgrep-before.json and /tmp/focus-city-semgrep-after.json.

To reproduce Semgrep, download the following files from the fixed revision of https://github.com/semgrep/semgrep-rules, then invoke `semgrep scan --metrics=off --disable-version-check` with a separate `--config PATH` for each and targets `.npmrc pnpm-workspace.yaml`:

- package_managers/npm/npm-missing-minimum-release-age.yaml
- package_managers/pnpm/pnpm-block-exotic-sub-dependencies.yaml
- package_managers/pnpm/pnpm-missing-minimum-release-age.yaml
- package_managers/pnpm/pnpm-trust-policy.yaml

## Remaining risks and limits

- pnpm 10.26.1 skips resolution on an up-to-date frozen lockfile. Installed source explicitly skips exotic checks when resolvedVia is missing for existing locked entries. A successful cached/frozen install alone is not evidence that every historical locked package was re-admitted; source/integrity review and fresh local-registry rejection tests address different aspects. Review all lockfile changes.
- Trust policy compares publisher/provenance evidence across publication time; it neither requires every package to have provenance nor proves code is safe. Age checks rely on registry timestamps and can be overridden by CLI/environment flags. Direct exotic sources remain possible; none are present here.
- A seven-day window cannot detect older malicious releases, and approved dependency build scripts can execute code. Preserve least-privilege install environments and the existing script allowlist.
- Platform-specific dependency exclusions for Replit Linux remain unchanged; other operating systems require separate install/build validation. No original hosted Semgrep artifact or future external CI environment was verified. Private-repository status is not a replacement for these controls.
- Production rate limiting, stricter input/date validation, TLS/access/CSP review and live OAuth consent remain tracked in SECURITY_REVIEW.md. No deployment, paid service, history rewrite, secret exposure or user-data deletion occurred.

## Primary references

- pnpm 10 versioned settings: https://github.com/pnpm/pnpm.io/blob/main/versioned_docs/version-10.x/settings.md
- pnpm 10.26 exotic-source control: https://pnpm.io/blog/releases/10.26
- npm 11 release-age units and exception semantics: https://docs.npmjs.com/cli/v11/using-npm/config/#min-release-age
- Exact public rules: https://github.com/semgrep/semgrep-rules/tree/16b9e6d45f10649f6a531ec4838ed9924372c3bc/package_managers
