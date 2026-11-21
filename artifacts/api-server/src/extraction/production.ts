import { createHash } from "node:crypto";
import { ExtractionError } from "./validation";

export const productionMode = () => process.env.NODE_ENV === "production";

function maxFromEnvironment(name: string, max: number) {
  const raw = process.env[name];
  const value = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new ExtractionError("PRODUCTION_AI_UNCONFIGURED", 503);
  return value;
}

// This gate uses a production-only key and an operator-approved cohort of Google
// subjects. The operator verifies provider terms, project quota and billing in
// the console before enabling it. No request can change the cohort or limits.
export function productionPolicy(user?: string) {
  if (!productionMode() || process.env.THREADLINE_PRODUCTION_AI_APPROVED !== "true")
    throw new ExtractionError("PRODUCTION_AI_DISABLED", 503);
  const key = process.env.THREADLINE_PRODUCTION_GEMINI_API_KEY;
  const fingerprint = process.env.THREADLINE_PRODUCTION_GEMINI_KEY_SHA256;
  const cohort = process.env.THREADLINE_PRODUCTION_AI_SUBJECTS?.split(",").map((id) => id.trim());
  if (!key || key !== key.trim() || key === process.env.GEMINI_API_KEY ||
      createHash("sha256").update(key).digest("hex") !== fingerprint ||
      !cohort?.length || cohort.length > 100 || cohort.some((id) => !/^\d{1,64}$/.test(id)))
    throw new ExtractionError("PRODUCTION_AI_UNCONFIGURED", 503);
  if (!user || !cohort.includes(user)) throw new ExtractionError("PRODUCTION_AI_COHORT", 403);
  const projectDaily = maxFromEnvironment("THREADLINE_PRODUCTION_AI_DAILY", 240);
  return {
    key,
    projectDaily,
    userDaily: Math.min(2, projectDaily),
    projectQueue: Math.min(8, projectDaily),
    userQueue: 1,
    requestsPerMinute: maxFromEnvironment("THREADLINE_PRODUCTION_AI_RPM", 10),
    tokensPerMinute: maxFromEnvironment("THREADLINE_PRODUCTION_AI_TPM", 180000),
  };
}
