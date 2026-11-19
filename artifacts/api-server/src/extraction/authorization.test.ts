import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
console.log("Development authorization gates passed; zero provider requests.");
