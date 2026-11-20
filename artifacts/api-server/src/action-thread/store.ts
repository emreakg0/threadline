import { pool } from "@workspace/db";
import type { Claim } from "../extraction/claims";
import type { Client } from "../extraction/lifecycle";
import type { ActionThread } from "./contract";

export async function persistActionThread(c: Client, run: Claim, graph: ActionThread) {
  const { schema_version, status, entry_node_id, nodes, edges, ...context } = graph;
  const scope = [run.id, run.user_id];
  await c.query(
    `INSERT INTO threadline_action_threads(id,user_id,source_revision_id,schema_version,plan_status,entry_node_id,context)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [...scope, run.source_revision_id, schema_version, status, entry_node_id, context],
  );
  for (const [position, node] of nodes.entries()) {
    await c.query(
      `INSERT INTO threadline_action_thread_nodes
       (thread_id,user_id,id,position,kind,title,description,completion_criterion,provenance)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [...scope, node.id, position, node.kind, node.title, node.description, node.completion_criterion, node.provenance],
    );
  }
  for (const [position, edge] of edges.entries()) {
    await c.query(
      `INSERT INTO threadline_action_thread_edges
       (thread_id,user_id,from_node_id,to_node_id,position,kind,outcome,max_traversals)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [...scope, edge.from, edge.to, position, edge.kind, edge.outcome, edge.max_traversals],
    );
  }
  await c.query(
    "INSERT INTO threadline_action_thread_progress(thread_id,user_id) VALUES($1,$2)",
    scope,
  );
}

export async function getActionThread(user: string, id: string) {
  const result = await pool.query(
    `SELECT t.id, t.source_revision_id, t.created_at, r.document_id, r.provider,
       t.context || jsonb_build_object(
         'schema_version',t.schema_version,'status',t.plan_status,'entry_node_id',t.entry_node_id,
         'nodes',COALESCE((SELECT jsonb_agg(
           to_jsonb(n) - ARRAY['thread_id','user_id','position']::text[] ORDER BY n.position)
           FROM threadline_action_thread_nodes n WHERE n.thread_id=t.id AND n.user_id=t.user_id),'[]'),
         'edges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'from',e.from_node_id,'to',e.to_node_id,'kind',e.kind,'outcome',e.outcome,'max_traversals',e.max_traversals)
           ORDER BY e.position) FROM threadline_action_thread_edges e
           WHERE e.thread_id=t.id AND e.user_id=t.user_id),'[]')) AS graph,
       p.state, p.version
     FROM threadline_action_threads t
     JOIN threadline_runs r USING (id,user_id)
     JOIN threadline_action_thread_progress p ON p.thread_id=t.id AND p.user_id=t.user_id
     WHERE t.id=$1 AND t.user_id=$2`,
    [id, user],
  );
  return result.rows[0] ?? null;
}

export async function listActionThreads(user: string, offset: number) {
  const { rows } = await pool.query(
    `SELECT t.id,t.source_revision_id,t.created_at,t.plan_status,t.schema_version,
       t.context->'goal' AS goal,p.state,p.version
     FROM threadline_action_threads t
     JOIN threadline_action_thread_progress p ON p.thread_id=t.id AND p.user_id=t.user_id
     WHERE t.user_id=$1 ORDER BY t.created_at DESC,t.id DESC LIMIT 51 OFFSET $2`,
    [user, offset],
  );
  return { threads: rows.slice(0, 50), next_offset: rows.length > 50 ? offset + 50 : null };
}
