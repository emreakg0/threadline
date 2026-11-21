import { pool } from "@workspace/db";
import { transaction, type Client } from "./lifecycle";
import { ExtractionError } from "./validation";

const threadEvaluationLimit = 3;

export async function requireThreadEvaluationCapacity(c: Client | typeof pool = pool, dispatch = false) {
  const { rows } = await c.query<{ count: number }>(
    `SELECT count(*)::int FROM threadline_runs
     WHERE provider='gemini' AND schema_version=3
       AND (beta_dispatched_at IS NOT NULL OR ($1 AND status IN ('queued','running')))`,
    [!dispatch],
  );
  // At dispatch the current run has already been stamped in this transaction.
  if (rows[0].count >= threadEvaluationLimit + (dispatch ? 1 : 0))
    throw new ExtractionError("THREAD_EVALUATION_LIMIT", 429);
}

export async function activeBetaGrant(
  user: string,
  { client = pool, allowExhausted = false }: { client?: Client | typeof pool; allowExhausted?: boolean } = {},
) {
  const { rows } = await client.query(
    `SELECT id, used >= request_limit AS exhausted FROM threadline_beta_grant
     WHERE user_id=$1 AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
    [user],
  );
  if (!rows.length) throw new ExtractionError("BETA_UNAVAILABLE", 403);
  if (rows[0].exhausted && !allowExhausted) throw new ExtractionError("BETA_LIMIT", 429);
  return rows[0].id as string;
}

export async function consumeBetaDispatch(
  runId: string,
  lease: string,
  sourceId: string,
) {
  await transaction(async (c) => {
    const run = await c.query(
      `UPDATE threadline_runs SET beta_dispatched_at=clock_timestamp()
       WHERE id=$1 AND lease_token=$2 AND source_revision_id=$3 AND provider='gemini'
       AND status='running' AND lease_expires_at>clock_timestamp()
       AND consent_grant_id IS NOT NULL AND beta_dispatched_at IS NULL
       RETURNING consent_grant_id,user_id,schema_version`,
      [runId, lease, sourceId],
    );
    if (!run.rowCount) throw new ExtractionError("BETA_UNAVAILABLE", 403);
    const { user_id, consent_grant_id, schema_version } = run.rows[0];
    const grant = await c.query(
      `UPDATE threadline_beta_grant SET used=used+1
       WHERE id=$1 AND user_id=$2 AND starts_at<=clock_timestamp()
       AND expires_at>clock_timestamp() AND used<request_limit`,
      [consent_grant_id, user_id],
    );
    if (!grant.rowCount) {
      const exhausted = await c.query(
        "SELECT 1 FROM threadline_beta_grant WHERE id=$1 AND user_id=$2 AND used=request_limit AND expires_at>clock_timestamp()",
        [consent_grant_id, user_id],
      );
      if (exhausted.rowCount) throw new ExtractionError("BETA_LIMIT", 429);
      throw new ExtractionError("BETA_UNAVAILABLE", 403);
    }
    // The singleton grant update serializes dispatch accounting. A limit
    // failure rolls back both the debit and this run's dispatch stamp.
    if (schema_version === 3) await requireThreadEvaluationCapacity(c, true);
  });
}
