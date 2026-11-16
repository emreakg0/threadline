// Child-process fixture only. Never imported by the application entrypoint.
import { processOne } from "./worker";
import { pool } from "@workspace/db";
const wait = process.env.EXTRACTION_TEST_WAIT === "1";
await processOne(
  {
    mode: "mock",
    generate: async () => {
      process.send?.({ entered: true });
      if (wait) await new Promise(() => {});
      return JSON.stringify({
        schema_version: 1,
        blocks: [
          {
            kind: "note",
            content: "🧵 Note",
            uncertainty_reason: null,
            evidence: [{ quote: "🧵 Note", start: 0, end: 6 }],
          },
        ],
      });
    },
  },
  process.env.EXTRACTION_TEST_RUN,
);
await pool.end();
