-- Expand the event vocabulary while preserving all existing trace records.
-- The expanded constraint can remain in place if application code is reverted.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE threadline_execution_events ADD CONSTRAINT threadline_execution_events_kind CHECK (
 event_type IN ('queued','started','step_started','step_completed','step_failed','retry_scheduled',
 'interrupted','recovered','completed','failed','cancelled','alternative_selected')
) NOT VALID;
ALTER TABLE threadline_execution_events VALIDATE CONSTRAINT threadline_execution_events_kind;
ALTER TABLE threadline_execution_events DROP CONSTRAINT threadline_execution_events_event_type_check;
