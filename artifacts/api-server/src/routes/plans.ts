import { Router, type ErrorRequestHandler } from "express";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { transaction, type Client } from "../extraction/lifecycle";

const router = Router();
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  !/[\0\uD800-\uDFFF]/u.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const version = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 2147483647;
const priorities = ["low", "medium", "high"];
const schedules = ["unresolved", "unscheduled", "scheduled"];
const states = ["needs_review", "confirmed", "dismissed"];
const date = (value: unknown) => {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
class PlanError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

router.param("document", (_req, _res, next, id) =>
  next(uuid(id) ? undefined : new PlanError(400, "Invalid document ID")),
);
router.param("action", (_req, _res, next, id) =>
  next(uuid(id) ? undefined : new PlanError(400, "Invalid action ID")),
);

const evidence = `COALESCE((
  SELECT json_agg(json_build_object('id',e.id,'quote',e.quote,'start',e.start_offset,'end',e.end_offset) ORDER BY e.start_offset,e.id)
  FROM threadline_block_evidence e
  WHERE e.block_id=b.id AND e.document_id=b.document_id AND e.user_id=b.user_id
),'[]') AS evidence`;

router.get("/:document", async (req, res) => {
  const scope = [req.params.document, res.locals.userId];
  const [document, actions, summary] = await Promise.all([
    pool.query(
      "SELECT id,title,archived_at FROM threadline_documents WHERE id=$1 AND user_id=$2",
      scope,
    ),
    pool.query(
      `SELECT b.id,b.content AS title,b.review_state AS state,b.version,b.uncertainty_reason,
        p.proposal,p.description,p.category,p.project_id,p.priority,p.schedule,to_char(p.due_date,'YYYY-MM-DD') AS due_date,
        s.revision,r.id AS run_id,r.provider,l.id IS NOT NULL AS converted,
        CASE WHEN t.id IS NOT NULL THEN (to_jsonb(t) - 'user_id') || jsonb_build_object('due_date',to_char(t.due_date,'YYYY-MM-DD')) END AS task,
        ${evidence}
      FROM threadline_plan_actions p
      JOIN threadline_knowledge_blocks b ON b.id=p.block_id AND b.user_id=p.user_id AND b.document_id=p.document_id
      JOIN threadline_source_revisions s ON s.id=p.source_revision_id AND s.user_id=p.user_id AND s.document_id=p.document_id
      LEFT JOIN threadline_runs r ON r.id=b.originating_run_id AND r.user_id=b.user_id AND r.document_id=b.document_id
      LEFT JOIN threadline_action_task_links l ON l.block_id=b.id AND l.user_id=b.user_id
      LEFT JOIN focus_tasks t ON t.id=l.task_id AND t.user_id=b.user_id
      WHERE b.document_id=$1 AND b.user_id=$2
      ORDER BY b.created_at,b.position,b.id`,
      scope,
    ),
    pool.query(
      `SELECT b.content,b.uncertainty_reason,b.review_state,r.provider,s.revision,r.id AS run_id,${evidence}
       FROM threadline_knowledge_blocks b
       JOIN threadline_runs r ON r.id=b.originating_run_id AND r.user_id=b.user_id AND r.document_id=b.document_id
       JOIN threadline_source_revisions s ON s.id=r.source_revision_id AND s.user_id=r.user_id AND s.document_id=r.document_id
       WHERE b.document_id=$1 AND b.user_id=$2 AND b.kind='summary' AND r.schema_version=2
       ORDER BY b.created_at DESC,b.id LIMIT 1`,
      scope,
    ),
  ]);
  if (!document.rowCount) throw new PlanError(404, "Brain dump not found.");
  res.json({
    document: document.rows[0],
    actions: actions.rows,
    summary: summary.rows[0] ?? null,
  });
});

async function lockDocument(client: Client, scope: [string, string]) {
  const row = (
    await client.query(
      "SELECT archived_at FROM threadline_documents WHERE id=$1 AND user_id=$2 FOR UPDATE",
      scope,
    )
  ).rows[0];
  if (!row) throw new PlanError(404, "Brain dump not found.");
  return row;
}
function requireActive(document: { archived_at: unknown }) {
  if (document.archived_at)
    throw new PlanError(
      409,
      "Restore this brain dump before changing its plan.",
    );
}
async function lockAction(client: Client, scope: [string, string, string]) {
  const row = (
    await client.query(
      `SELECT b.content,b.version,b.review_state,p.description,p.project_id,p.priority,to_char(p.due_date,'YYYY-MM-DD') AS due_date,p.schedule
     FROM threadline_knowledge_blocks b JOIN threadline_plan_actions p ON b.id=p.block_id
     WHERE b.document_id=$1 AND b.user_id=$2 AND b.id=$3 FOR UPDATE OF b`,
      scope,
    )
  ).rows[0];
  if (!row) throw new PlanError(404, "Action not found.");
  return row;
}

router.post("/:document", async (req, res) => {
  const body: unknown = req.body;
  if (
    !record(body) ||
    Object.keys(body).length !== 2 ||
    !uuid(body.id) ||
    !text(body.title, 300) ||
    !body.title.trim()
  )
    throw new PlanError(400, "Enter an action title of 1–300 characters.");
  const scope: [string, string] = [req.params.document, res.locals.userId];
  const title = body.title.trim();
  const id = body.id;
  const created = await transaction(async (client) => {
    requireActive(await lockDocument(client, scope));
    const previous = await client.query(
      `SELECT 1 FROM threadline_plan_actions p JOIN threadline_knowledge_blocks b ON b.id=p.block_id
       WHERE p.document_id=$1 AND p.user_id=$2 AND p.block_id=$3 AND p.proposal IS NULL AND b.content=$4`,
      [...scope, id, title],
    );
    if (previous.rowCount) return false;
    const source = (
      await client.query(
        "SELECT id FROM threadline_source_revisions WHERE document_id=$1 AND user_id=$2 ORDER BY revision DESC LIMIT 1",
        scope,
      )
    ).rows[0];
    if (!source) throw new PlanError(409, "Save a source revision first.");
    const inserted = await client.query(
      `INSERT INTO threadline_knowledge_blocks(id,document_id,user_id,kind,position,content)
       VALUES($3,$1,$2,'action',0,$4) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [...scope, id, title],
    );
    if (!inserted.rowCount)
      throw new PlanError(
        409,
        "Action ID already used. Refresh before retrying.",
      );
    await client.query(
      "INSERT INTO threadline_plan_actions(block_id,document_id,user_id,source_revision_id) VALUES ($3,$1,$2,$4)",
      [...scope, id, source.id],
    );
    return true;
  });
  res.status(created ? 201 : 200).json({ id });
});

router.patch("/:document/:action", async (req, res) => {
  const body: unknown = req.body;
  if (
    !record(body) ||
    Object.keys(body).length !== 9 ||
    !version(body.version) ||
    !text(body.title, 300) ||
    !body.title.trim() ||
    !text(body.description, 1200) ||
    !text(body.category, 100) ||
    !(body.project_id === null || uuid(body.project_id)) ||
    !(
      body.priority === null ||
      priorities.some((value) => value === body.priority)
    ) ||
    !schedules.some((value) => value === body.schedule) ||
    !(body.schedule === "scheduled"
      ? date(body.due_date)
      : body.due_date === null) ||
    !states.some((value) => value === body.state)
  )
    throw new PlanError(
      400,
      "Enter valid action details and choose a real calendar date when scheduling.",
    );
  if (
    body.state === "confirmed" &&
    (!body.project_id || !body.priority || body.schedule === "unresolved")
  )
    throw new PlanError(
      400,
      "Choose a project, priority, and scheduling decision before approval.",
    );
  const scope: [string, string] = [req.params.document, res.locals.userId];
  const title = body.title.trim();
  const category = body.category.trim();
  const id = req.params.action;
  await transaction(async (client) => {
    requireActive(await lockDocument(client, scope));
    const action = await lockAction(client, [...scope, id]);
    if (action.version !== body.version)
      throw new PlanError(
        409,
        "This action changed elsewhere. Reload it before saving.",
      );
    if (
      (
        await client.query(
          "SELECT 1 FROM threadline_action_task_links WHERE block_id=$1 AND user_id=$2",
          [id, scope[1]],
        )
      ).rowCount
    )
      throw new PlanError(
        409,
        "This action has already been converted. Manage the linked task.",
      );
    if (
      body.project_id &&
      !(
        await client.query(
          "SELECT 1 FROM focus_projects WHERE id=$1 AND user_id=$2 FOR KEY SHARE",
          [body.project_id, scope[1]],
        )
      ).rowCount
    )
      throw new PlanError(404, "Project not found.");
    await client.query(
      `UPDATE threadline_knowledge_blocks SET content=$3,review_state=$4,updated_at=now(),edited_at=now(),version=version+1
       WHERE id=$1 AND user_id=$2`,
      [id, scope[1], title, body.state],
    );
    await client.query(
      `UPDATE threadline_plan_actions SET description=$3,category=$4,project_id=$5,priority=$6,schedule=$7,due_date=$8
       WHERE block_id=$1 AND user_id=$2`,
      [
        id,
        scope[1],
        body.description,
        category,
        body.project_id,
        body.priority,
        body.schedule,
        body.due_date,
      ],
    );
  });
  res.sendStatus(204);
});

router.post("/:document/:action/convert", async (req, res) => {
  const body: unknown = req.body;
  if (
    !record(body) ||
    Object.keys(body).length !== 2 ||
    !version(body.version) ||
    body.confirm !== true
  )
    throw new PlanError(
      400,
      "Confirm task creation with the approved action version.",
    );
  const scope: [string, string] = [req.params.document, res.locals.userId];
  const id = req.params.action;
  const result = await transaction(async (client) => {
    const document = await lockDocument(client, scope);
    const action = await lockAction(client, [...scope, id]);
    const receipt = (
      await client.query(
        "SELECT task_id FROM threadline_action_task_links WHERE block_id=$1 AND user_id=$2",
        [id, scope[1]],
      )
    ).rows[0];
    if (receipt) return { task_id: receipt.task_id, created: false };
    requireActive(document);
    if (action.version !== body.version)
      throw new PlanError(
        409,
        "This action changed elsewhere. Reload before creating a task.",
      );
    if (
      action.review_state !== "confirmed" ||
      !action.project_id ||
      !action.priority ||
      action.schedule === "unresolved"
    )
      throw new PlanError(
        409,
        "Approve the action and resolve scheduling before creating a task.",
      );
    const task = (
      await client.query(
        `INSERT INTO focus_tasks(id,user_id,project_id,title,description,priority,due_date)
       SELECT $1,$2,id,$4,$5,$6,$7 FROM focus_projects WHERE id=$3 AND user_id=$2 RETURNING id`,
        [
          randomUUID(),
          scope[1],
          action.project_id,
          action.content,
          action.description,
          action.priority,
          action.due_date,
        ],
      )
    ).rows[0];
    if (!task) throw new PlanError(404, "Project not found.");
    await client.query(
      "INSERT INTO threadline_action_task_links(id,user_id,block_id,task_id) VALUES ($1,$2,$3,$4)",
      [randomUUID(), scope[1], id, task.id],
    );
    return { task_id: task.id, created: true };
  });
  res.status(result.created ? 201 : 200).json(result);
});

const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof PlanError)
    res.status(error.status).json({ error: error.message });
  else next(error);
};
router.use(errors);
export default router;
