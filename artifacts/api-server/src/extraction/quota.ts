import type { Client } from "./lifecycle";

export const projectDaily = 240;
export const userDaily = 20;
export const projectQueue = 40;
export const userQueue = 4;
export const minimumSpacingSeconds = 6;
export const requestsPerMinute = 10;
export const tokensPerMinute = 180_000;

const pacificDay =
  "date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Los_Angeles')";
export const pacificMidnight = `(${pacificDay} AT TIME ZONE 'America/Los_Angeles')`;
export const nextPacificMidnight = `((${pacificDay} + interval '1 day') AT TIME ZONE 'America/Los_Angeles')`;

export async function geminiUsage(c: Client, user: string) {
  const result = await c.query<{
    daily: number;
    user_daily: number;
    rpm: number;
    tpm: number;
    spaced: boolean;
    blocked: boolean;
  }>(
    `
    WITH cutoff AS (SELECT ${pacificMidnight} AS day, statement_timestamp() AS at)
    SELECT count(*) FILTER (WHERE started_at >= day)::int AS daily,
           count(*) FILTER (WHERE started_at >= day AND user_id=$1)::int AS user_daily,
           count(*) FILTER (WHERE started_at > at - interval '60 seconds')::int AS rpm,
           COALESCE(sum(reserved_tokens) FILTER (WHERE started_at > at - interval '60 seconds'), 0)::int AS tpm,
           COALESCE(max(started_at) <= at - $2 * interval '1 second', true) AS spaced,
           EXISTS (SELECT 1 FROM threadline_runs WHERE provider_blocked_until > statement_timestamp()) AS blocked
    FROM cutoff LEFT JOIN threadline_execution_steps
      ON reserved_tokens IS NOT NULL AND started_at >= LEAST(day, at - interval '60 seconds')
    GROUP BY at
  `,
    [user, minimumSpacingSeconds],
  );
  return result.rows[0];
}
