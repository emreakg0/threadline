import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const schema = `threadline_test_${randomUUID().replaceAll('-', '')}`;
const uuid = () => randomUUID();
const a = `test-${uuid()}`, b = `test-${uuid()}`;
const doc = uuid(), otherDoc = uuid(), revision = uuid(), run = uuid(), block = uuid();
async function rejects(sql, values, code) {
 await client.query('SAVEPOINT expected_failure');
 try { await assert.rejects(client.query(sql, values), error => error.code === code); }
 finally { await client.query('ROLLBACK TO SAVEPOINT expected_failure'); }
}
try {
 await client.query(`CREATE SCHEMA ${schema}`);
 await client.query(`SET search_path TO ${schema}`);
 // Populate the old schema first to exercise an upgrade, not only a fresh install.
 await client.query('BEGIN');
 await client.query('CREATE TABLE focus_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for (const name of ['0001_focus_city', '0002_city_slots']) {
  await client.query(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  await client.query('INSERT INTO focus_migrations(name) VALUES ($1)', [name]);
 }
 await client.query('INSERT INTO focus_users VALUES ($1,$1,$1),($2,$2,$2)', [a,b]);
 const project = uuid(), task = uuid();
 await client.query('INSERT INTO focus_projects(id,user_id,name) VALUES ($1,$2,$3)',[project,a,'Original project']);
 await client.query('INSERT INTO focus_tasks(id,user_id,project_id,title) VALUES ($1,$2,$3,$4)',[task,a,project,'Original task']);
 const original = (await client.query('SELECT * FROM focus_tasks WHERE id=$1',[task])).rows[0];
 const legacyTables = ['focus_users','focus_projects','focus_tasks','focus_sessions','focus_oauth_states','focus_city_counters'];
 async function snapshot() {
  const rows = [];
  for (const name of legacyTables) rows.push((await client.query(`SELECT * FROM ${name} ORDER BY 1`)).rows);
  return rows;
 }
 const before = await snapshot();
 await client.query('COMMIT');
 // Exercise the real runner twice, scoped exclusively to this disposable schema.
 for (let i = 0; i < 2; i++) {
  const result = spawnSync(process.execPath, [new URL('./migrate.mjs', import.meta.url).pathname], {
   env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` }, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, 'Isolated migration runner failed (details suppressed)');
 }
 assert.equal((await client.query('SELECT count(*)::int AS n FROM focus_migrations')).rows[0].n, 6);
 await client.query('BEGIN');
 assert.deepEqual(await snapshot(), before, 'Migration must preserve all legacy fixture records');
 await client.query('INSERT INTO threadline_documents(id,user_id,title) VALUES ($1,$2,$3),($4,$5,$3)',[doc,a,'Notes',otherDoc,b]);
 await rejects('INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES ($1,$2,$3,1,$4)',[uuid(),b,doc,'source'],'23503');
 await client.query('INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES ($1,$2,$3,1,$4)',[revision,a,doc,'Call Sam']);
 await rejects('UPDATE threadline_source_revisions SET source_text=$1 WHERE id=$2',['changed',revision],'23514');
 const insertRun = 'INSERT INTO threadline_runs(id,user_id,document_id,source_revision_id,idempotency_key,pipeline_version,schema_version) VALUES ($1,$2,$3,$4,$5,$6,1)';
 await client.query(insertRun,[run,a,doc,revision,'capture-1','v1']);
 await rejects(insertRun,[uuid(),a,doc,revision,'capture-1','v1'],'23505');
 await client.query('INSERT INTO threadline_knowledge_blocks(id,user_id,document_id,originating_run_id,kind,position,content) VALUES ($1,$2,$3,$4,$5,0,$6)',[block,a,doc,run,'action','Call Sam']);
 await rejects('INSERT INTO threadline_block_evidence(id,user_id,block_id,document_id,source_revision_id,quote,start_offset,end_offset) VALUES ($1,$2,$3,$4,$5,$6,2,1)',[uuid(),a,block,doc,revision,'Call Sam'],'23514');
 const event = uuid();
 await client.query("INSERT INTO threadline_execution_events(id,user_id,run_id,sequence,event_type) VALUES ($1,$2,$3,1,'queued')",[event,a,run]);
 await rejects("INSERT INTO threadline_execution_events(id,user_id,run_id,sequence,event_type) VALUES ($1,$2,$3,1,'started')",[uuid(),a,run],'23505');
 await rejects('UPDATE threadline_execution_events SET sequence=2 WHERE id=$1',[event],'23514');
 await rejects("INSERT INTO threadline_relationships(id,user_id,source_document_id,target_document_id,kind,origin,state) VALUES ($1,$2,$3,$4,'related','manual','confirmed')",[uuid(),a,doc,otherDoc],'23503');
 const foreignTask = uuid(), foreignProject = uuid();
 await client.query('INSERT INTO focus_projects(id,user_id,name) VALUES ($1,$2,$3)',[foreignProject,b,'Other owner']);
 await client.query('INSERT INTO focus_tasks(id,user_id,project_id,title) VALUES ($1,$2,$3,$4)',[foreignTask,b,foreignProject,'Other task']);
 await rejects('INSERT INTO threadline_action_task_links(id,user_id,block_id,task_id) VALUES ($1,$2,$3,$4)',[uuid(),a,block,foreignTask],'23503');
 await client.query('INSERT INTO threadline_action_task_links(id,user_id,block_id,task_id) VALUES ($1,$2,$3,$4)',[uuid(),a,block,task]);
 await rejects('INSERT INTO threadline_action_task_links(id,user_id,block_id,task_id) VALUES ($1,$2,$3,$4)',[uuid(),a,block,task],'23505');
 assert.deepEqual((await client.query('SELECT * FROM focus_tasks WHERE id=$1',[task])).rows[0], original);
 await client.query('ROLLBACK');
 console.log('PASS: isolated runner/re-run, ownership, immutable source/events, idempotency, evidence bounds, event order, duplicate conversion, legacy task preservation');
} finally {
 await client.query('ROLLBACK');
 // Only the randomly named schema created by this test is removed.
 await client.query(`DROP SCHEMA ${schema} CASCADE`);
 client.release(); await pool.end();
}
