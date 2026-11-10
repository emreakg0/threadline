ALTER TABLE focus_projects ADD COLUMN city_slot integer;
ALTER TABLE focus_tasks ADD COLUMN city_slot integer;
WITH ranked AS (SELECT id, (row_number() OVER(PARTITION BY user_id ORDER BY id)-1)::integer AS slot FROM focus_projects) UPDATE focus_projects p SET city_slot=r.slot FROM ranked r WHERE p.id=r.id;
WITH ranked AS (SELECT id, (row_number() OVER(PARTITION BY project_id ORDER BY created_at,id)-1)::integer AS slot FROM focus_tasks) UPDATE focus_tasks t SET city_slot=r.slot FROM ranked r WHERE t.id=r.id;
ALTER TABLE focus_projects ALTER COLUMN city_slot SET NOT NULL;
ALTER TABLE focus_tasks ALTER COLUMN city_slot SET NOT NULL;
CREATE UNIQUE INDEX focus_project_slots ON focus_projects(user_id,city_slot);
CREATE UNIQUE INDEX focus_task_slots ON focus_tasks(project_id,city_slot);
CREATE TABLE focus_city_counters (scope text PRIMARY KEY, next_slot integer NOT NULL);
INSERT INTO focus_city_counters SELECT 'user:'||user_id,max(city_slot)+1 FROM focus_projects GROUP BY user_id;
INSERT INTO focus_city_counters SELECT 'project:'||project_id,max(city_slot)+1 FROM focus_tasks GROUP BY project_id;
CREATE FUNCTION focus_assign_city_slot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key text;
BEGIN
 IF TG_TABLE_NAME='focus_projects' THEN key := 'user:'||NEW.user_id; ELSE key := 'project:'||NEW.project_id; END IF;
 INSERT INTO focus_city_counters(scope,next_slot) VALUES(key,1) ON CONFLICT(scope) DO UPDATE SET next_slot=focus_city_counters.next_slot+1 RETURNING next_slot-1 INTO NEW.city_slot;
 RETURN NEW;
END $$;
CREATE TRIGGER focus_project_city_slot BEFORE INSERT ON focus_projects FOR EACH ROW EXECUTE FUNCTION focus_assign_city_slot();
CREATE TRIGGER focus_task_city_slot BEFORE INSERT ON focus_tasks FOR EACH ROW EXECUTE FUNCTION focus_assign_city_slot();
