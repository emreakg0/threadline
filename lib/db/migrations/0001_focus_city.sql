CREATE TABLE IF NOT EXISTS focus_users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
CREATE TABLE IF NOT EXISTS focus_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES focus_users(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS focus_oauth_states (state_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS focus_projects (id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES focus_users(id), name text NOT NULL, color text NOT NULL DEFAULT '#79efc4', inbox boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX IF NOT EXISTS focus_one_inbox ON focus_projects(user_id) WHERE inbox;
CREATE TABLE IF NOT EXISTS focus_tasks (id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES focus_users(id), project_id uuid NOT NULL REFERENCES focus_projects(id), title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')), priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')), due_date date, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
