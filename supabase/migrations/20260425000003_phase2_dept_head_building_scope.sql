-- Phase 2 RLS migration: dept_head building scope (audit finding H1).
-- Single atomic migration: schema change + data backfill + sync triggers +
-- helpers + policy updates. ~12 tables touched.
--
-- DEPENDENCIES: this migration calls is_admin() from C1
-- (20260425000001_fix_profile_role_self_promotion.sql) and replaces policies
-- created in phase 1 (20260425000002_phase1_role_gated_rls.sql). Apply both
-- of those first; otherwise CREATE FUNCTION is_admin lookups inside
-- can_access_building() will reference a function that does not exist, and
-- the DROP POLICY statements in section 6 will silently no-op (IF EXISTS).
--
-- SAFETY: current data state (verified by user) is 2 users (admin+janitor),
-- 0 dept_heads, all profiles.assigned_building_ids = '[]'::jsonb,
-- 74 rows across 7 building-scoped text-keyed tables, all building text
-- values match real building names except 'All Buildings' sentinel in
-- pm_schedule. No NULL building text values that mask other buildings.
-- Empty/sentinel/NULL → building_id stays NULL (parish-wide semantics).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles.assigned_building_ids: jsonb → uuid[]
--    Safe because every current row holds '[]'::jsonb. The helper handles NULL
--    defensively even though the audit shows none. Adds NOT NULL + DEFAULT
--    so future inserts can't omit the column.
--
--    Two Postgres quirks shape this section:
--    (1) Subqueries are not allowed directly inside ALTER COLUMN ... USING
--        transform expressions (errcode 0A000). The conversion is wrapped in
--        a one-shot helper function — subqueries are fine in a function body
--        — and the helper is dropped at the end of this section since nothing
--        else needs it.
--    (2) The existing column default ('[]'::jsonb) cannot be cast to uuid[]
--        during the TYPE change (errcode 42804) — Postgres tries to cast the
--        default expression alongside the column data, and the auto-cast
--        fails. DROP DEFAULT first; SET DEFAULT '{}'::uuid[] after.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._jsonb_to_uuid_array(j jsonb)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN j IS NULL THEN '{}'::uuid[]
    ELSE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(j) AS value)
  END;
$$;

ALTER TABLE public.profiles ALTER COLUMN assigned_building_ids DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN assigned_building_ids TYPE uuid[]
    USING public._jsonb_to_uuid_array(assigned_building_ids);

ALTER TABLE public.profiles
  ALTER COLUMN assigned_building_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN assigned_building_ids SET NOT NULL;

DROP FUNCTION public._jsonb_to_uuid_array(jsonb);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add building_id uuid REFERENCES buildings(id) ON DELETE SET NULL
--    to 8 tables. Nullable. Existing `building` text column kept during the
--    transition (sync trigger keeps them aligned).
--    rooms, utility_readings, supply_requests already have building_id.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.work_orders     ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.pm_schedule     ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.assets          ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_invoices ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.quotes          ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.projects        ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.service_history ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill building_id from building text via name lookup.
--    UPDATE...FROM join pattern (no correlated subqueries).
--    'All Buildings', '', NULL building text → row excluded by the join,
--    building_id stays NULL (parish-wide semantics).
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.work_orders wo
   SET building_id = b.id
  FROM public.buildings b
 WHERE wo.building = b.name
   AND wo.building IS NOT NULL
   AND wo.building <> ''
   AND wo.building <> 'All Buildings';

UPDATE public.pm_schedule pm
   SET building_id = b.id
  FROM public.buildings b
 WHERE pm.building = b.name
   AND pm.building IS NOT NULL
   AND pm.building <> ''
   AND pm.building <> 'All Buildings';
-- pm_schedule is the table that legitimately uses 'All Buildings' sentinel;
-- those rows are excluded from the join and stay with building_id = NULL.

UPDATE public.assets a
   SET building_id = b.id
  FROM public.buildings b
 WHERE a.building = b.name
   AND a.building IS NOT NULL
   AND a.building <> ''
   AND a.building <> 'All Buildings';

UPDATE public.vendor_invoices vi
   SET building_id = b.id
  FROM public.buildings b
 WHERE vi.building = b.name
   AND vi.building IS NOT NULL
   AND vi.building <> ''
   AND vi.building <> 'All Buildings';

UPDATE public.quotes q
   SET building_id = b.id
  FROM public.buildings b
 WHERE q.building = b.name
   AND q.building IS NOT NULL
   AND q.building <> ''
   AND q.building <> 'All Buildings';

UPDATE public.projects p
   SET building_id = b.id
  FROM public.buildings b
 WHERE p.building = b.name
   AND p.building IS NOT NULL
   AND p.building <> ''
   AND p.building <> 'All Buildings';

UPDATE public.service_history sh
   SET building_id = b.id
  FROM public.buildings b
 WHERE sh.building = b.name
   AND sh.building IS NOT NULL
   AND sh.building <> ''
   AND sh.building <> 'All Buildings';

UPDATE public.calendar_events ce
   SET building_id = b.id
  FROM public.buildings b
 WHERE ce.building = b.name
   AND ce.building IS NOT NULL
   AND ce.building <> ''
   AND ce.building <> 'All Buildings';
-- calendar_events has 0 rows currently; this UPDATE affects nothing today.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Sync trigger: keep building_id aligned with building text on
--    INSERT and on UPDATE OF building. The "OF building" clause means the
--    trigger fires on UPDATE only when the building column appears in the
--    SET list — avoids unnecessary work on every UPDATE.
--    Function is SECURITY INVOKER (default); it only does a lookup against
--    public.buildings which is readable to all authenticated users via its
--    own RLS policy.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_building_id_from_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.building IS NULL OR NEW.building = '' OR NEW.building = 'All Buildings' THEN
    NEW.building_id := NULL;
  ELSE
    NEW.building_id := (SELECT id FROM public.buildings WHERE name = NEW.building);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_sync_building_id     ON public.work_orders;
DROP TRIGGER IF EXISTS pm_schedule_sync_building_id     ON public.pm_schedule;
DROP TRIGGER IF EXISTS assets_sync_building_id          ON public.assets;
DROP TRIGGER IF EXISTS vendor_invoices_sync_building_id ON public.vendor_invoices;
DROP TRIGGER IF EXISTS quotes_sync_building_id          ON public.quotes;
DROP TRIGGER IF EXISTS projects_sync_building_id        ON public.projects;
DROP TRIGGER IF EXISTS service_history_sync_building_id ON public.service_history;
DROP TRIGGER IF EXISTS calendar_events_sync_building_id ON public.calendar_events;

CREATE TRIGGER work_orders_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER pm_schedule_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.pm_schedule
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER assets_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER vendor_invoices_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER quotes_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER projects_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER service_history_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.service_history
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();
CREATE TRIGGER calendar_events_sync_building_id
  BEFORE INSERT OR UPDATE OF building ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_building_id_from_text();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Helper functions
-- ────────────────────────────────────────────────────────────────────────────

-- Returns the caller's assigned_building_ids, or '{}'::uuid[] if no profile
-- row exists. COALESCE handles the no-profile case; the column itself is now
-- NOT NULL so the inner SELECT cannot return NULL when a row exists.
CREATE OR REPLACE FUNCTION public.user_assigned_buildings(uid uuid DEFAULT auth.uid())
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT assigned_building_ids FROM public.profiles WHERE id = uid),
    '{}'::uuid[]
  );
$$;

-- Returns true if the caller may access a row with the given building_id.
-- Bypass cases: NULL building_id (parish-wide), admin, any non-dept_head role.
-- Otherwise dept_heads must have the building in their assigned list.
-- Using `<>` (not `IS DISTINCT FROM`) so NULL role evaluates fail-closed:
-- NULL <> 'dept_head' → NULL → treated as false → falls through to the
-- ANY(...) check which returns false for unknown users. The per-table policy's
-- role-list check filters NULL roles before this function is called anyway.
CREATE OR REPLACE FUNCTION public.can_access_building(building_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    building_id IS NULL
    OR public.is_admin()
    OR public.current_user_role() <> 'dept_head'
    OR building_id = ANY(public.user_assigned_buildings());
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Policy updates: drop each phase-1 Pattern A policy on a building-scoped
--    table and recreate it with `AND can_access_building(building_id)` in
--    USING (SELECT/UPDATE/DELETE) and WITH CHECK (INSERT/UPDATE).
--    Role lists unchanged from phase 1.
--
--    service_history is treated the same way for consistency: the admin-only
--    ALL policy gets the can_access_building() clause appended. This is a
--    no-op today (admin bypasses the check via is_admin() short-circuit) but
--    means service_history is explicitly building-scoped — no future
--    maintainer needs to remember it's an exception when access widens.
--
--    Skipped: wo_comments, asset_service_log — deferred per design decision
--    (parent-row inheritance pattern, separate phase 2.x).
-- ────────────────────────────────────────────────────────────────────────────

-- work_orders
DROP POLICY work_orders_select ON public.work_orders;
DROP POLICY work_orders_insert ON public.work_orders;
DROP POLICY work_orders_update ON public.work_orders;

CREATE POLICY work_orders_select ON public.work_orders
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','janitor','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY work_orders_insert ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor')
              AND public.can_access_building(building_id));
CREATE POLICY work_orders_update ON public.work_orders
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','dept_head','janitor')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor')
              AND public.can_access_building(building_id));

-- pm_schedule
DROP POLICY pm_schedule_select ON public.pm_schedule;
DROP POLICY pm_schedule_insert ON public.pm_schedule;
DROP POLICY pm_schedule_update ON public.pm_schedule;

CREATE POLICY pm_schedule_select ON public.pm_schedule
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY pm_schedule_insert ON public.pm_schedule
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));
CREATE POLICY pm_schedule_update ON public.pm_schedule
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));

-- assets
DROP POLICY assets_select ON public.assets;
DROP POLICY assets_insert ON public.assets;
DROP POLICY assets_update ON public.assets;

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY assets_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));
CREATE POLICY assets_update ON public.assets
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));

-- rooms (already had building_id; just adding the scope clause)
DROP POLICY rooms_select ON public.rooms;
DROP POLICY rooms_insert ON public.rooms;
DROP POLICY rooms_update ON public.rooms;

CREATE POLICY rooms_select ON public.rooms
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));
CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));

-- vendor_invoices
DROP POLICY vendor_invoices_select ON public.vendor_invoices;
DROP POLICY vendor_invoices_insert ON public.vendor_invoices;
DROP POLICY vendor_invoices_update ON public.vendor_invoices;

CREATE POLICY vendor_invoices_select ON public.vendor_invoices
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance')
         AND public.can_access_building(building_id));
CREATE POLICY vendor_invoices_insert ON public.vendor_invoices
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));
CREATE POLICY vendor_invoices_update ON public.vendor_invoices
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));

-- quotes
DROP POLICY quotes_select ON public.quotes;
DROP POLICY quotes_insert ON public.quotes;
DROP POLICY quotes_update ON public.quotes;

CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance')
         AND public.can_access_building(building_id));
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));

-- utility_readings (already had building_id)
DROP POLICY utility_readings_select ON public.utility_readings;
DROP POLICY utility_readings_insert ON public.utility_readings;
DROP POLICY utility_readings_update ON public.utility_readings;

CREATE POLICY utility_readings_select ON public.utility_readings
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id));
CREATE POLICY utility_readings_insert ON public.utility_readings
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));
CREATE POLICY utility_readings_update ON public.utility_readings
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));

-- supply_requests (already had building_id; 4 policies including self-update split)
DROP POLICY supply_requests_select               ON public.supply_requests;
DROP POLICY supply_requests_insert               ON public.supply_requests;
DROP POLICY supply_requests_update_staff         ON public.supply_requests;
DROP POLICY supply_requests_update_janitor_self  ON public.supply_requests;

CREATE POLICY supply_requests_select ON public.supply_requests
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','janitor')
         AND public.can_access_building(building_id));
CREATE POLICY supply_requests_insert ON public.supply_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (current_user_role() IN ('admin','manager','facilities')
     OR (current_user_role() = 'janitor' AND requested_by = auth.uid()))
    AND public.can_access_building(building_id)
  );
CREATE POLICY supply_requests_update_staff ON public.supply_requests
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(building_id));
CREATE POLICY supply_requests_update_janitor_self ON public.supply_requests
  FOR UPDATE TO authenticated
  USING (current_user_role() = 'janitor'
         AND requested_by = auth.uid()
         AND status = 'pending'
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() = 'janitor'
              AND requested_by = auth.uid()
              AND public.can_access_building(building_id));

-- projects
DROP POLICY projects_select ON public.projects;
DROP POLICY projects_insert ON public.projects;
DROP POLICY projects_update ON public.projects;

CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY projects_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));
CREATE POLICY projects_update ON public.projects
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance')
              AND public.can_access_building(building_id));

-- calendar_events (4 policies including DELETE)
DROP POLICY calendar_events_select ON public.calendar_events;
DROP POLICY calendar_events_insert ON public.calendar_events;
DROP POLICY calendar_events_update ON public.calendar_events;
DROP POLICY calendar_events_delete ON public.calendar_events;

CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer')
         AND public.can_access_building(building_id));
CREATE POLICY calendar_events_insert ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager')
              AND public.can_access_building(building_id));
CREATE POLICY calendar_events_update ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager')
         AND public.can_access_building(building_id))
  WITH CHECK (current_user_role() IN ('admin','manager')
              AND public.can_access_building(building_id));
CREATE POLICY calendar_events_delete ON public.calendar_events
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','manager')
         AND public.can_access_building(building_id));

-- service_history — admin-only ALL gets the scope clause for consistency.
-- No-op today (admin short-circuits is_admin()) but explicit for the future.
DROP POLICY service_history_admin_all ON public.service_history;

CREATE POLICY service_history_admin_all ON public.service_history
  FOR ALL TO authenticated
  USING (is_admin() AND public.can_access_building(building_id))
  WITH CHECK (is_admin() AND public.can_access_building(building_id));

-- buildings — the row IS the building, so use can_access_building(id), not (building_id)
DROP POLICY buildings_select ON public.buildings;
DROP POLICY buildings_insert ON public.buildings;
DROP POLICY buildings_update ON public.buildings;

CREATE POLICY buildings_select ON public.buildings
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer')
         AND public.can_access_building(id));
CREATE POLICY buildings_insert ON public.buildings
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(id));
CREATE POLICY buildings_update ON public.buildings
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities')
         AND public.can_access_building(id))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities')
              AND public.can_access_building(id));

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification — run separately in the dashboard SQL editor after applying.
-- The migration itself does not execute these.
--
-- (a) Column type check: assigned_building_ids should now be uuid[] (Postgres
--     reports it as data_type='ARRAY', udt_name='_uuid'). NOT NULL, default '{}'.
--
-- SELECT column_name, data_type, udt_name, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles'
--     AND column_name='assigned_building_ids';
--
-- Expected: ARRAY / _uuid / NO / '{}'::uuid[]
--
-- (b) building_id column present on the 8 newly-extended tables.
--
-- SELECT table_name, column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='building_id'
--     AND table_name IN ('work_orders','pm_schedule','assets','vendor_invoices',
--                        'quotes','projects','service_history','calendar_events')
--   ORDER BY table_name;
--
-- Expected: 8 rows, all data_type='uuid', all is_nullable='YES'.
--
-- (c) Helper functions exist with expected signatures.
--
-- SELECT n.nspname, p.proname,
--        pg_get_function_arguments(p.oid) AS args,
--        pg_get_function_result(p.oid) AS returns
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public'
--     AND p.proname IN ('user_assigned_buildings','can_access_building')
--   ORDER BY p.proname;
--
-- Expected: 2 rows.
--   can_access_building(building_id uuid) returns boolean
--   user_assigned_buildings(uid uuid DEFAULT auth.uid()) returns uuid[]
--
-- (d) Sync triggers attached to all 8 tables.
--
-- SELECT c.relname AS tablename, t.tgname AS trigger
--   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--   WHERE c.relnamespace='public'::regnamespace
--     AND t.tgname LIKE '%_sync_building_id'
--     AND NOT t.tgisinternal
--   ORDER BY c.relname;
--
-- Expected: 8 rows (work_orders, pm_schedule, assets, vendor_invoices, quotes,
--   projects, service_history, calendar_events).
--
-- (e) Backfill data integrity: every row with a real building name should have
--     a non-NULL building_id. Empty/NULL/'All Buildings' rows stay NULL.
--
-- SELECT 'work_orders'::text     AS tbl, COUNT(*)::int AS unbackfilled FROM public.work_orders     WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'pm_schedule',     COUNT(*)::int FROM public.pm_schedule     WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'assets',          COUNT(*)::int FROM public.assets          WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'vendor_invoices', COUNT(*)::int FROM public.vendor_invoices WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'quotes',          COUNT(*)::int FROM public.quotes          WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'projects',        COUNT(*)::int FROM public.projects        WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'service_history', COUNT(*)::int FROM public.service_history WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- UNION ALL SELECT 'calendar_events', COUNT(*)::int FROM public.calendar_events WHERE building IS NOT NULL AND building NOT IN ('','All Buildings') AND building_id IS NULL
-- ORDER BY tbl;
--
-- Expected: unbackfilled = 0 for every row.
--
-- (f) Manual: dept_head scope test. Two committing transactions: setup,
--     then teardown. The C1 trigger blocks role/building changes by anyone
--     who isn't already admin, so we must DISABLE it across the change and
--     re-enable on the way out. ALTER TABLE DISABLE/ENABLE TRIGGER is
--     transactional, so a transaction abort would un-disable cleanly — but
--     the SETUP block is committed deliberately so the test data persists
--     long enough to switch to the browser. TEARDOWN must be run before
--     leaving or the test user is permanently demoted.
--
--     Prep: gather UUIDs.
--       SELECT id, name FROM public.buildings WHERE name = 'Rectory';
--       SELECT id, email, role FROM public.profiles WHERE role <> 'admin' LIMIT 1;
--       Record the test user's CURRENT role for teardown.
--
--     SETUP — demote test user to dept_head + assign Rectory only.
--
--     BEGIN;
--       ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_privileged_columns;
--       UPDATE public.profiles
--          SET role = 'dept_head',
--              assigned_building_ids = ARRAY[
--                (SELECT id FROM public.buildings WHERE name = 'Rectory')
--              ]
--        WHERE id = '<TEST_UID>';
--       ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_privileged_columns;
--       SELECT role, assigned_building_ids FROM public.profiles WHERE id = '<TEST_UID>';
--     COMMIT;
--
--     Then sign in to the app as that user. Verify:
--       - Buildings page shows only Rectory.
--       - Work Orders page shows only Rectory work orders.
--       - PM Schedule shows Rectory PMs plus 'All Buildings' parish-wide PMs.
--       - Other building-scoped pages (Assets, Rooms) show only Rectory items.
--       - Pages that don't include dept_head in the role list (Vendor Invoices,
--         Quotes, Budgets, Supplies) are empty or hidden — that's the role
--         filter, not the building filter.
--
--     TEARDOWN — restore original role. RUN BEFORE LEAVING.
--
--     BEGIN;
--       ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_privileged_columns;
--       UPDATE public.profiles
--          SET role = '<ORIGINAL_ROLE>',
--              assigned_building_ids = '{}'::uuid[]
--        WHERE id = '<TEST_UID>';
--       ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_privileged_columns;
--       SELECT role, assigned_building_ids FROM public.profiles WHERE id = '<TEST_UID>';
--     COMMIT;
--
--     Skipping teardown leaves the test user as a Rectory-only dept_head
--     forever. Confirm the SELECT after teardown shows the original role.
