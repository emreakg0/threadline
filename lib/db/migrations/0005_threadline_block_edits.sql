SET LOCAL lock_timeout = '3s';
ALTER TABLE threadline_knowledge_blocks ADD COLUMN edited_at timestamptz;
