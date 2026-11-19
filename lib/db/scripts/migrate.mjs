import pg from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(72810381)');
 await client.query('CREATE TABLE IF NOT EXISTS focus_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for (const name of ['0001_focus_city', '0002_city_slots', '0003_threadline_foundation', '0004_threadline_terminal_times', '0005_threadline_block_edits', '0006_threadline_action_plans', '0007_threadline_gemini_quota']) {
 const exists=await client.query('SELECT 1 FROM focus_migrations WHERE name=$1',[name]);
 if(!exists.rowCount){await client.query(await readFile(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));await client.query('INSERT INTO focus_migrations(name) VALUES($1)',[name]);}
 }
 await client.query('COMMIT');console.log('Focus City migrations ready');
} catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();await pool.end();}
