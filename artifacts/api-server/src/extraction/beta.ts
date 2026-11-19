import { pool } from "@workspace/db";
import { transaction } from "./lifecycle";
import { ExtractionError } from "./validation";

export async function activeBetaGrant(user: string) {
  const { rows } = await pool.query(
    `SELECT id, used >= request_limit AS exhausted FROM threadline_beta_grant
     WHERE user_id=$1 AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
    [user],
  );
  if (!rows.length) throw new ExtractionError("BETA_UNAVAILABLE", 403);
  if (rows[0].exhausted) throw new ExtractionError("BETA_LIMIT", 429);
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
       RETURNING consent_grant_id,user_id`,
      [runId, lease, sourceId],
    );
    if (!run.rowCount) throw new ExtractionError("BETA_UNAVAILABLE", 403);
    const { user_id, consent_grant_id } = run.rows[0];
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
  });
}
