import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveAccess, MODEL } from "./gemini";

// No provider transport or real credentials are used by this gate-only test.
globalThis.fetch = async () => {
  throw new Error("Network access is forbidden in authorization checks");
};
process.env.GEMINI_API_KEY = "synthetic-authorization-fixture";
process.env.NODE_ENV = "development";
process.env.REPLIT_ENVIRONMENT = "development";
const now = Date.now();
const approval = {
  project: "threadline-gemini",
  model: MODEL,
  keySha256: createHash("sha256")
    .update("synthetic-authorization-fixture")
    .digest("hex"),
  startsAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
};
const configure = (override: Record<string, unknown> = {}) => {
  process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL = JSON.stringify({
    ...approval,
    ...override,
  });
};
const denied = (code: string) => assert.throws(() => liveAccess(), { code });

delete process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED;
configure();
denied("LIVE_DISABLED");
process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "true";
assert.equal(liveAccess(), "synthetic-authorization-fixture");
for (const override of [
  { project: "another-project" },
  { model: "another-model" },
  { keySha256: "0".repeat(64) },
  { startsAt: new Date(now + 60000).toISOString() },
  { startsAt: "invalid" },
  { expiresAt: new Date(now - 1).toISOString() },
  { expiresAt: new Date(now + 86400000).toISOString() },
  { expiresAt: "invalid" },
  { sourceRevisionId: 42 },
]) {
  configure(override);
  denied("FREE_TIER_UNVERIFIED");
}
for (const raw of ["{", "null", "[]", "true"]) {
  process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL = raw;
  denied("FREE_TIER_UNVERIFIED");
}
configure({ sourceRevisionId: "one-source" });
denied("SOURCE_NOT_AUTHORIZED");
assert.equal(liveAccess("one-source"), "synthetic-authorization-fixture");
configure();
process.env.NODE_ENV = "production";
denied("LIVE_DISABLED");
process.env.NODE_ENV = "development";
// Replit's development workflow can also have this platform label.
process.env.REPLIT_ENVIRONMENT = "production";
assert.equal(liveAccess(), "synthetic-authorization-fixture");
process.env.REPLIT_ENVIRONMENT = "development";
process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "false";
denied("LIVE_DISABLED");
process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "true";
delete process.env.GEMINI_API_KEY;
denied("FREE_TIER_UNVERIFIED");

// Extend the existing gate-only test: no real runtime file or provider is accessed.
const originalDirectory = process.cwd();
const privateDirectory = mkdtempSync(join(tmpdir(), "threadline-authorization-"));
try {
  process.chdir(privateDirectory);
  mkdirSync(".local", { mode: 0o700 });
  const file = ".local/threadline-gemini-authorization.json";
  delete process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL;
  delete process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED;
  process.env.GEMINI_API_KEY = "synthetic-authorization-fixture";
  denied("LIVE_DISABLED");
  const privateConfig = (value: unknown = { liveAuthorized: true, approval }) => {
    rmSync(file, { force: true });
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  };
  privateConfig();
  assert.equal(liveAccess(), "synthetic-authorization-fixture");
  assert.throws(() => liveAccess(undefined, 3), { code: "THREAD_LIVE_DISABLED" });
  // A partial Secrets override cannot silently inherit approval from the file.
  process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "true";
  denied("FREE_TIER_UNVERIFIED");
  process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "false";
  denied("LIVE_DISABLED");
  delete process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED;
  chmodSync(file, 0o644);
  denied("LIVE_DISABLED");
  privateConfig({ liveAuthorized: "true", approval });
  denied("LIVE_DISABLED");
  privateConfig({
    liveAuthorized: true,
    approval: { ...approval, expiresAt: "invalid" },
  });
  denied("FREE_TIER_UNVERIFIED");
  privateConfig();
  process.env.NODE_ENV = "production";
  denied("LIVE_DISABLED");
  process.env.NODE_ENV = "development";
  const threadConfig = { liveAuthorized: true, schemaVersion: 3, approval };
  privateConfig(threadConfig);
  denied("LIVE_DISABLED");
  assert.equal(liveAccess(undefined, 3), "synthetic-authorization-fixture");
  for (const environment of ["production", "test", ""]) {
    process.env.NODE_ENV = environment;
    assert.throws(() => liveAccess(undefined, 3), { code: "THREAD_LIVE_DISABLED" });
  }
  process.env.NODE_ENV = "development";
  privateConfig({ ...threadConfig, approval: { ...approval, expiresAt: new Date(now - 1).toISOString() } });
  assert.throws(() => liveAccess(undefined, 3), { code: "FREE_TIER_UNVERIFIED" });
  privateConfig({ ...threadConfig, approval: { ...approval, sourceRevisionId: "one-source" } });
  assert.throws(() => liveAccess("another-source", 3), { code: "SOURCE_NOT_AUTHORIZED" });
  assert.equal(liveAccess("one-source", 3), "synthetic-authorization-fixture");
  privateConfig({ ...threadConfig, liveAuthorized: false });
  assert.throws(() => liveAccess(undefined, 3), { code: "THREAD_LIVE_DISABLED" });
  denied("LIVE_DISABLED");
  privateConfig(threadConfig);
  process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED = "false";
  assert.throws(() => liveAccess(undefined, 3), { code: "THREAD_LIVE_DISABLED" });
  delete process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED;
  privateConfig();
  linkSync(file, ".local/linked.json");
  denied("LIVE_DISABLED");
  rmSync(file);
  symlinkSync("linked.json", file);
  denied("LIVE_DISABLED");
  rmSync(file);
  writeFileSync(file, "{", { mode: 0o600 });
  denied("LIVE_DISABLED");
} finally {
  process.chdir(originalDirectory);
  rmSync(privateDirectory, { recursive: true, force: true });
}
console.log("Development authorization gates passed; zero provider requests.");
