SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE threadline_plan_actions (
 block_id uuid PRIMARY KEY,
 document_id uuid NOT NULL,
 user_id text NOT NULL,
 source_revision_id uuid NOT NULL,
 proposal jsonb CHECK (proposal IS NULL OR jsonb_typeof(proposal) = 'object'),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 1200),
 category text NOT NULL DEFAULT '' CHECK (length(category) <= 100),
 project_id uuid REFERENCES focus_projects(id),
 priority text CHECK (priority IN ('low', 'medium', 'high')),
 schedule text NOT NULL DEFAULT 'unscheduled' CHECK (schedule IN ('unresolved', 'unscheduled', 'scheduled')),
 due_date date,
 CHECK ((schedule = 'scheduled') = (due_date IS NOT NULL)),
 FOREIGN KEY (block_id, document_id, user_id) REFERENCES threadline_knowledge_blocks(id, document_id, user_id),
 FOREIGN KEY (source_revision_id, document_id, user_id) REFERENCES threadline_source_revisions(id, document_id, user_id)
);

-- Keep a durable conversion receipt even if the owner deletes the task.
ALTER TABLE threadline_action_task_links
 ALTER COLUMN task_id DROP NOT NULL,
 DROP CONSTRAINT threadline_action_task_links_task_id_fkey,
 ADD CONSTRAINT threadline_action_task_links_task_id_fkey
 FOREIGN KEY (task_id) REFERENCES focus_tasks(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION threadline_check_task_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.task_id IS NULL AND TG_OP = 'UPDATE' AND OLD.task_id IS NOT NULL
    AND OLD.block_id = NEW.block_id AND OLD.user_id = NEW.user_id THEN
  RETURN NEW;
 END IF;
 PERFORM 1 FROM focus_tasks WHERE id = NEW.task_id AND user_id = NEW.user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task owner mismatch' USING ERRCODE = '23503'; END IF;
 PERFORM 1 FROM threadline_knowledge_blocks WHERE id = NEW.block_id AND user_id = NEW.user_id AND kind = 'action' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expected action block' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
