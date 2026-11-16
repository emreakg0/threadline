-- Additive foundation: no legacy data updates, renames, or backfills.
-- Rollback: revert application/runner use and retain these tables. Dropping them
-- after writes would destroy knowledge/history and requires separate authorization.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE threadline_collections (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id)
);

CREATE TABLE threadline_documents (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
 collection_id uuid,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (collection_id, user_id) REFERENCES threadline_collections(id, user_id)
);

CREATE TABLE threadline_source_revisions (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 document_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 source_text text NOT NULL CHECK (length(btrim(source_text)) BETWEEN 1 AND 100000),
 timezone text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (document_id, user_id) REFERENCES threadline_documents(id, user_id),
 UNIQUE (document_id, revision),
 UNIQUE (id, document_id, user_id)
);

CREATE TABLE threadline_runs (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 source_revision_id uuid NOT NULL,
 document_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','interrupted','cancelled')),
 pipeline_version text NOT NULL,
 schema_version integer NOT NULL CHECK (schema_version > 0),
 provider text, model text, prompt_version text,
 retry_of uuid,
 started_at timestamptz, completed_at timestamptz,
 lease_token uuid, lease_expires_at timestamptz, heartbeat_at timestamptz,
 error_code text,
 CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (source_revision_id, document_id, user_id) REFERENCES threadline_source_revisions(id, document_id, user_id),
 FOREIGN KEY (retry_of, user_id) REFERENCES threadline_runs(id, user_id),
 CHECK (retry_of IS DISTINCT FROM id),
 UNIQUE (user_id, idempotency_key),
 UNIQUE (id, document_id, user_id)
);

CREATE TABLE threadline_knowledge_blocks (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 document_id uuid NOT NULL,
 originating_run_id uuid,
 kind text NOT NULL CHECK (kind IN ('summary','action','fact','decision','question','deadline','note')),
 position integer NOT NULL CHECK (position >= 0),
 content text NOT NULL CHECK (length(btrim(content)) > 0),
 review_state text NOT NULL DEFAULT 'needs_review' CHECK (review_state IN ('needs_review','confirmed','dismissed')),
 uncertainty_reason text,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (document_id, user_id) REFERENCES threadline_documents(id, user_id),
 FOREIGN KEY (originating_run_id, document_id, user_id) REFERENCES threadline_runs(id, document_id, user_id),
 UNIQUE (id, document_id, user_id)
);

CREATE TABLE threadline_block_evidence (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 block_id uuid NOT NULL, document_id uuid NOT NULL, source_revision_id uuid NOT NULL,
 quote text NOT NULL CHECK (length(quote) > 0),
 start_offset integer NOT NULL CHECK (start_offset >= 0),
 end_offset integer NOT NULL CHECK (end_offset > start_offset),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (block_id, document_id, user_id) REFERENCES threadline_knowledge_blocks(id, document_id, user_id),
 FOREIGN KEY (source_revision_id, document_id, user_id) REFERENCES threadline_source_revisions(id, document_id, user_id)
);

CREATE TABLE threadline_tags (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 UNIQUE (user_id, name)
);

CREATE TABLE threadline_document_tags (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 document_id uuid NOT NULL, tag_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (document_id, user_id) REFERENCES threadline_documents(id, user_id),
 FOREIGN KEY (tag_id, user_id) REFERENCES threadline_tags(id, user_id),
 UNIQUE (document_id, tag_id)
);

CREATE TABLE threadline_relationships (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 source_document_id uuid NOT NULL, target_document_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('related','supports','contradicts','references')),
 origin text NOT NULL CHECK (origin IN ('manual','model')),
 state text NOT NULL CHECK (state IN ('suggested','confirmed','rejected')),
 originating_run_id uuid, evidence_summary text,
 CHECK (source_document_id <> target_document_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (source_document_id, user_id) REFERENCES threadline_documents(id, user_id),
 FOREIGN KEY (target_document_id, user_id) REFERENCES threadline_documents(id, user_id),
 FOREIGN KEY (originating_run_id, user_id) REFERENCES threadline_runs(id, user_id),
 UNIQUE (source_document_id, target_document_id, kind)
);

CREATE TABLE threadline_execution_steps (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 run_id uuid NOT NULL, step_key text NOT NULL CHECK (length(step_key) BETWEEN 1 AND 100),
 attempt integer NOT NULL CHECK (attempt > 0),
 status text NOT NULL CHECK (status IN ('running','succeeded','failed','interrupted','cancelled')),
 started_at timestamptz NOT NULL, completed_at timestamptz,
 duration_ms bigint CHECK (duration_ms >= 0),
 input_summary text, output_summary text, error_code text, error_summary text, recovery_action text,
 CHECK (completed_at IS NULL OR completed_at >= started_at),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (run_id, user_id) REFERENCES threadline_runs(id, user_id),
 UNIQUE (run_id, step_key, attempt),
 UNIQUE (id, run_id, user_id)
);

CREATE TABLE threadline_execution_events (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 run_id uuid NOT NULL, step_id uuid,
 sequence bigint NOT NULL CHECK (sequence > 0),
 event_type text NOT NULL CHECK (event_type IN ('queued','started','step_started','step_completed','step_failed','retry_scheduled','interrupted','recovered','completed','failed','cancelled')),
 observed_at timestamptz NOT NULL DEFAULT now(),
 payload_version integer NOT NULL DEFAULT 1 CHECK (payload_version > 0),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (run_id, user_id) REFERENCES threadline_runs(id, user_id),
 FOREIGN KEY (step_id, run_id, user_id) REFERENCES threadline_execution_steps(id, run_id, user_id),
 UNIQUE (run_id, sequence)
);

CREATE TABLE threadline_action_task_links (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES focus_users(id),
 block_id uuid NOT NULL UNIQUE, task_id uuid NOT NULL UNIQUE REFERENCES focus_tasks(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (block_id, user_id) REFERENCES threadline_knowledge_blocks(id, user_id)
);

-- Existing tasks have no composite owner key. Validate without altering legacy tables.
CREATE FUNCTION threadline_check_task_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM focus_tasks WHERE id = NEW.task_id AND user_id = NEW.user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task owner mismatch' USING ERRCODE = '23503'; END IF;
 PERFORM 1 FROM threadline_knowledge_blocks WHERE id = NEW.block_id AND user_id = NEW.user_id AND kind = 'action' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expected action block' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER threadline_task_link_guard BEFORE INSERT OR UPDATE ON threadline_action_task_links
 FOR EACH ROW EXECUTE FUNCTION threadline_check_task_link();

-- Preserve recorded inputs/events against accidental editing; explicit deletion remains
-- possible for future owner-scoped erasure. This is not an anti-tamper audit system.
CREATE FUNCTION threadline_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recorded source/events cannot be updated' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER threadline_source_immutable BEFORE UPDATE ON threadline_source_revisions
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();
CREATE TRIGGER threadline_event_immutable BEFORE UPDATE ON threadline_execution_events
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();

CREATE INDEX threadline_documents_recent ON threadline_documents(user_id, updated_at DESC, id);
CREATE INDEX threadline_runs_history ON threadline_runs(user_id, created_at DESC, id);
CREATE INDEX threadline_runs_claim ON threadline_runs(status, lease_expires_at, created_at);
CREATE INDEX threadline_blocks_document ON threadline_knowledge_blocks(document_id, position, id);
CREATE INDEX threadline_relationships_backlinks ON threadline_relationships(user_id, target_document_id, state);
