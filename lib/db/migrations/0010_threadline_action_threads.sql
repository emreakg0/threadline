SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Bind an immutable proposal to the exact owner, source and schema of its run.
CREATE UNIQUE INDEX threadline_runs_thread_origin
 ON threadline_runs (id, user_id, source_revision_id, schema_version);
CREATE UNIQUE INDEX threadline_runs_unique_action_thread
 ON threadline_runs (user_id, source_revision_id, provider, model, pipeline_version)
 WHERE schema_version = 3;

CREATE TABLE threadline_action_threads (
 id uuid PRIMARY KEY,
 user_id text NOT NULL,
 source_revision_id uuid NOT NULL,
 schema_version integer NOT NULL DEFAULT 3 CHECK (schema_version = 3),
 plan_status text NOT NULL CHECK (plan_status IN ('planned','simple','needs_clarification')),
 entry_node_id text,
 context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 FOREIGN KEY (id, user_id, source_revision_id, schema_version)
  REFERENCES threadline_runs (id, user_id, source_revision_id, schema_version) ON DELETE CASCADE,
 CHECK ((entry_node_id IS NULL) = (plan_status = 'needs_clarification'))
);
CREATE INDEX threadline_action_threads_history ON threadline_action_threads (user_id, created_at DESC, id DESC);

CREATE TABLE threadline_action_thread_nodes (
 thread_id uuid NOT NULL,
 user_id text NOT NULL,
 id text NOT NULL CHECK (length(id) <= 48 AND id ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
 position integer NOT NULL CHECK (position BETWEEN 0 AND 10),
 kind text NOT NULL CHECK (kind IN ('action','decision')),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
 completion_criterion text NOT NULL CHECK (length(btrim(completion_criterion)) BETWEEN 1 AND 240),
 provenance text NOT NULL CHECK (provenance = 'ai_strategy'),
 PRIMARY KEY (thread_id, user_id, id),
 UNIQUE (thread_id, position),
 FOREIGN KEY (thread_id, user_id) REFERENCES threadline_action_threads (id, user_id) ON DELETE CASCADE
);
ALTER TABLE threadline_action_threads ADD CONSTRAINT threadline_action_threads_entry_fk
 FOREIGN KEY (id, user_id, entry_node_id)
 REFERENCES threadline_action_thread_nodes (thread_id, user_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE threadline_action_thread_edges (
 thread_id uuid NOT NULL,
 user_id text NOT NULL,
 from_node_id text NOT NULL,
 to_node_id text NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 0 AND 23),
 kind text NOT NULL CHECK (kind IN ('next','outcome','retry')),
 outcome text,
 max_traversals integer,
 PRIMARY KEY (thread_id, user_id, from_node_id, to_node_id),
 UNIQUE (thread_id, position),
 FOREIGN KEY (thread_id, user_id) REFERENCES threadline_action_threads (id, user_id) ON DELETE CASCADE,
 FOREIGN KEY (thread_id, user_id, from_node_id) REFERENCES threadline_action_thread_nodes (thread_id, user_id, id),
 FOREIGN KEY (thread_id, user_id, to_node_id) REFERENCES threadline_action_thread_nodes (thread_id, user_id, id),
 CHECK (from_node_id <> to_node_id),
 CHECK ((kind = 'outcome') = (outcome IS NOT NULL)),
 CHECK (outcome IS NULL OR length(btrim(outcome)) BETWEEN 1 AND 120),
 CHECK ((kind = 'retry') = (max_traversals IS NOT NULL)),
 CHECK (max_traversals IS NULL OR max_traversals BETWEEN 1 AND 3)
);

-- Progress is a single active path. Each version has one durable transition.
CREATE TABLE threadline_action_thread_progress (
 thread_id uuid PRIMARY KEY,
 user_id text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','completed')),
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
 active_node_id text,
 reviewed_at timestamptz,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (thread_id, user_id),
 FOREIGN KEY (thread_id, user_id) REFERENCES threadline_action_threads (id, user_id) ON DELETE CASCADE,
 FOREIGN KEY (thread_id, user_id, active_node_id) REFERENCES threadline_action_thread_nodes (thread_id, user_id, id),
 CHECK ((state = 'approved') = (active_node_id IS NOT NULL)),
 CHECK ((state = 'pending') = (reviewed_at IS NULL)),
 CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE threadline_action_thread_transitions (
 thread_id uuid NOT NULL,
 user_id text NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[a-zA-Z0-9_-]{8,100}$'),
 operation text NOT NULL CHECK (operation IN ('approve','reject','complete','decide','block','retry')),
 node_id text,
 to_node_id text,
 note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (thread_id, user_id, version),
 UNIQUE (thread_id, user_id, idempotency_key),
 FOREIGN KEY (thread_id, user_id) REFERENCES threadline_action_thread_progress (thread_id, user_id) ON DELETE CASCADE,
 FOREIGN KEY (thread_id, user_id, node_id) REFERENCES threadline_action_thread_nodes (thread_id, user_id, id),
 FOREIGN KEY (thread_id, user_id, node_id, to_node_id)
  REFERENCES threadline_action_thread_edges (thread_id, user_id, from_node_id, to_node_id),
 CHECK ((operation IN ('approve','reject')) = (node_id IS NULL)),
 CHECK (to_node_id IS NULL OR operation IN ('complete','decide','retry')),
 CHECK (operation NOT IN ('decide','retry') OR to_node_id IS NOT NULL),
 CHECK ((operation = 'block') = (note IS NOT NULL)),
 CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 500)
);
CREATE INDEX threadline_action_thread_retry_counts
 ON threadline_action_thread_transitions (thread_id, user_id, node_id, to_node_id) WHERE operation = 'retry';

CREATE TRIGGER threadline_action_thread_immutable BEFORE UPDATE ON threadline_action_threads
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();
CREATE TRIGGER threadline_action_thread_node_immutable BEFORE UPDATE ON threadline_action_thread_nodes
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();
CREATE TRIGGER threadline_action_thread_edge_immutable BEFORE UPDATE ON threadline_action_thread_edges
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();
CREATE TRIGGER threadline_action_thread_transition_immutable BEFORE UPDATE ON threadline_action_thread_transitions
 FOR EACH ROW EXECUTE FUNCTION threadline_reject_update();
