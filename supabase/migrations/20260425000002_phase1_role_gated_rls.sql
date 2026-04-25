-- Phase 1 RLS migration: replace "Authenticated access" with role-based policies.
-- Closes audit finding C2 (universal write access on every table).
--
-- DEPENDENCY: this migration calls is_admin(), which was created in
-- 20260425000001_fix_profile_role_self_promotion.sql. Apply that migration
-- first; otherwise the Pattern C and dead-schema policies in section 3 / 6
-- will fail with "function public.is_admin() does not exist".
--
-- Scope: all 22 public tables EXCEPT profiles (already migrated in C1).
-- No schema changes.
-- DELETE is intentionally denied on most tables: Postgres denies operations
-- with no matching policy, so omitting a DELETE policy is the secure default.
-- Explicit DELETE only on contacts (people leave) and calendar_events
-- (events get cancelled). Pattern C catalog tables and dead-schema tables
-- use FOR ALL admin policies which cover DELETE for admin only.
--
-- Phase 2 will layer building scope on top via can_access_building().
-- Phase 3 will add audit-trail trigger guards against created_by forgery.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. current_user_role() helper
--    Returns the caller's profiles.role, or NULL if no profile row exists.
--    NULL semantics: every `current_user_role() IN (...)` evaluates to NULL,
--    which RLS treats as false → policies fail closed for unknown users.
--    SECURITY DEFINER bypasses RLS on the lookup so we don't recurse.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Drop the existing wide-open policies (24 total).
--    profiles policies are NOT dropped — they were updated in the C1 migration.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated access" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated access" ON public.asset_service_log;
DROP POLICY IF EXISTS "Authenticated access" ON public.assets;
DROP POLICY IF EXISTS "Authenticated access" ON public.budgets;
DROP POLICY IF EXISTS "Authenticated access" ON public.buildings;
DROP POLICY IF EXISTS "Authenticated access" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated access" ON public.categories;
DROP POLICY IF EXISTS "Authenticated access" ON public.contact_roles;
DROP POLICY IF EXISTS "Authenticated access" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated access" ON public.pm_schedule;
DROP POLICY IF EXISTS "Authenticated access" ON public.projects;
DROP POLICY IF EXISTS "Authenticated access" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated access" ON public.room_types;
DROP POLICY IF EXISTS "Authenticated access" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated access" ON public.service_history;
DROP POLICY IF EXISTS "Authenticated access" ON public.supplies;
DROP POLICY IF EXISTS "Authenticated access" ON public.utility_readings;
DROP POLICY IF EXISTS "Authenticated access" ON public.vendor_invoices;
DROP POLICY IF EXISTS "Authenticated access" ON public.wo_comments;
DROP POLICY IF EXISTS "Authenticated access" ON public.work_orders;
DROP POLICY IF EXISTS "supply_categories read"  ON public.supply_categories;
DROP POLICY IF EXISTS "supply_categories write" ON public.supply_categories;
DROP POLICY IF EXISTS "supply_requests read"    ON public.supply_requests;
DROP POLICY IF EXISTS "supply_requests write"   ON public.supply_requests;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Pattern C — catalog tables (10 policies on 5 tables).
--    Read: all authenticated. Write (incl. DELETE): admin only.
--    Calls is_admin() from C1 migration.
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY contact_roles_select ON public.contact_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contact_roles_admin_write ON public.contact_roles
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_admin_write ON public.categories
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY room_types_select ON public.room_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY room_types_admin_write ON public.room_types
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY supply_categories_select ON public.supply_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY supply_categories_admin_write ON public.supply_categories
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Pattern A — role-gated module data (44 policies on 14 tables).
--    No DELETE policy on most tables (Postgres denies by default).
--    Explicit DELETE only on contacts and calendar_events.
-- ────────────────────────────────────────────────────────────────────────────

-- contacts (4 policies — has DELETE; people leave the parish)
CREATE POLICY contacts_select ON public.contacts
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer'));
CREATE POLICY contacts_insert ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY contacts_update ON public.contacts
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY contacts_delete ON public.contacts
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','manager'));

-- work_orders (3 policies — no DELETE)
-- finance reads but does not write (Q2 — separation of review vs. execute).
CREATE POLICY work_orders_select ON public.work_orders
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','janitor','viewer'));
CREATE POLICY work_orders_insert ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'));
CREATE POLICY work_orders_update ON public.work_orders
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'));

-- pm_schedule (3 policies — no DELETE)
CREATE POLICY pm_schedule_select ON public.pm_schedule
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','viewer'));
CREATE POLICY pm_schedule_insert ON public.pm_schedule
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY pm_schedule_update ON public.pm_schedule
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- assets (3 policies — no DELETE)
CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','viewer'));
CREATE POLICY assets_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY assets_update ON public.assets
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- supplies (3 policies — no DELETE)
CREATE POLICY supplies_select ON public.supplies
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','viewer'));
CREATE POLICY supplies_insert ON public.supplies
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY supplies_update ON public.supplies
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- quotes (3 policies — no DELETE; viewer dropped per Q6)
CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance'));
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));

-- vendor_invoices (3 policies — no DELETE; viewer dropped per Q6)
CREATE POLICY vendor_invoices_select ON public.vendor_invoices
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance'));
CREATE POLICY vendor_invoices_insert ON public.vendor_invoices
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));
CREATE POLICY vendor_invoices_update ON public.vendor_invoices
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));

-- projects (3 policies — no DELETE)
CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer'));
CREATE POLICY projects_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));
CREATE POLICY projects_update ON public.projects
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','finance'));

-- buildings (3 policies — no DELETE)
CREATE POLICY buildings_select ON public.buildings
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer'));
CREATE POLICY buildings_insert ON public.buildings
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY buildings_update ON public.buildings
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- rooms (3 policies — no DELETE)
CREATE POLICY rooms_select ON public.rooms
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer'));
CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- utility_readings (3 policies — no DELETE)
CREATE POLICY utility_readings_select ON public.utility_readings
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY utility_readings_insert ON public.utility_readings
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));
CREATE POLICY utility_readings_update ON public.utility_readings
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- calendar_events (4 policies — has DELETE; events get cancelled)
-- Writes restricted to admin + manager (Q7). Hat era will need atomic
-- write permissions for Music / Liturgical / Office Director roles.
CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','viewer'));
CREATE POLICY calendar_events_insert ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager'));
CREATE POLICY calendar_events_update ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));
CREATE POLICY calendar_events_delete ON public.calendar_events
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','manager'));

-- wo_comments (3 policies — no DELETE)
-- SELECT mirrors work_orders SELECT: anyone who can read a WO can read its
-- comments. INSERT/UPDATE matches work_orders write list (finance + viewer
-- excluded — they review WOs but don't comment on them).
-- Phase 2 will denormalize building_id onto this table to enable Pattern B.
CREATE POLICY wo_comments_select ON public.wo_comments
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','finance','dept_head','janitor','viewer'));
CREATE POLICY wo_comments_insert ON public.wo_comments
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'));
CREATE POLICY wo_comments_update ON public.wo_comments
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities','dept_head','janitor'));

-- budgets (3 policies — no DELETE; viewer dropped per Q6)
CREATE POLICY budgets_select ON public.budgets
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY budgets_insert ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin','manager','finance'));
CREATE POLICY budgets_update ON public.budgets
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','finance'))
  WITH CHECK (current_user_role() IN ('admin','manager','finance'));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. supply_requests (4 policies — Pattern A* with self-vs-other UPDATE split).
--    Janitors UPDATE only their own pending requests; cancel = UPDATE status.
--    Staff (admin/manager/facilities) UPDATE any request. No DELETE.
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY supply_requests_select ON public.supply_requests
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities','janitor'));

-- INSERT: janitors must self-attribute (requested_by = auth.uid()); staff are
-- intentionally allowed to attribute requests to ANY user without that check.
-- This supports the legitimate workflow where a facility manager files a
-- request on a janitor's behalf (e.g., janitor calls in a need verbally).
-- Audit-trail forgery prevention (preventing staff from impersonating a
-- specific user) lands uniformly in phase 3 via per-table BEFORE INSERT/UPDATE
-- triggers — not as a one-off carve-out here.
CREATE POLICY supply_requests_insert ON public.supply_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN ('admin','manager','facilities')
    OR (current_user_role() = 'janitor' AND requested_by = auth.uid())
  );

CREATE POLICY supply_requests_update_staff ON public.supply_requests
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin','manager','facilities'))
  WITH CHECK (current_user_role() IN ('admin','manager','facilities'));

-- USING checks the OLD row (must be janitor's own pending);
-- WITH CHECK checks the NEW row (cannot reassign requested_by). Status is
-- intentionally NOT in WITH CHECK so a janitor can update pending → cancelled.
CREATE POLICY supply_requests_update_janitor_self ON public.supply_requests
  FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'janitor'
    AND requested_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    current_user_role() = 'janitor'
    AND requested_by = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Dead schema tables (2 policies on 2 tables).
--    Locked admin-only pending separate cleanup decision (Q1).
--    Calls is_admin() from C1 migration.
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY asset_service_log_admin_all ON public.asset_service_log
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY service_history_admin_all ON public.service_history
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification — run separately in the dashboard SQL editor after applying.
-- The migration itself does not execute these.
--
-- Behavioral runtime tests are intentionally NOT included here. SET LOCAL ROLE
-- + SET LOCAL "request.jwt.claims" only behaves correctly if the editor's
-- session role has membership in `authenticated` AND the GUC name matches
-- exactly what auth.uid() reads. If either drifts, the queries silently run
-- as superuser, bypass RLS, and falsely report "passing" — masking a broken
-- migration. The (a)-(c) checks below are pure catalog inspection and cannot
-- be fooled this way; the (d) manual step covers behavior end-to-end via
-- the actual client.
-- ────────────────────────────────────────────────────────────────────────────
--
-- (a) Old "wide-open" policies should all be gone. Expect zero rows.
--
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND policyname IN ('Authenticated access',
--                        'supply_categories read', 'supply_categories write',
--                        'supply_requests read', 'supply_requests write')
--   ORDER BY tablename, policyname;
--
-- Expected: 0 rows.
--
-- (b) New policies present, per-table count. Expected totals:
--     contacts=4, calendar_events=4, supply_requests=4,
--     all other Pattern A tables=3 (work_orders, pm_schedule, assets, supplies,
--       quotes, vendor_invoices, projects, buildings, rooms, utility_readings,
--       wo_comments, budgets),
--     Pattern C tables=2 (contact_roles, categories, room_types,
--       supply_categories, app_settings),
--     dead-schema=1 (asset_service_log, service_history),
--     profiles=3 (untouched from C1 migration).
--     Sum = 60 new + 3 profiles = 63.
--
-- SELECT tablename, COUNT(*) AS policy_count
--   FROM pg_policies WHERE schemaname = 'public'
--   GROUP BY tablename ORDER BY tablename;
--
-- (c) Helper function exists.
--
-- SELECT n.nspname, p.proname,
--        pg_get_function_arguments(p.oid) AS args,
--        pg_get_function_result(p.oid) AS returns
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'current_user_role';
--
-- Expected: one row, args='', returns='text'.
--
-- (d) Manual: client-side test.
--     After (a)-(c) pass, log into the app as the existing viewer profile
--     (the typo'd email row, never used by a real human) and walk through:
--       SHOULD show data: Dashboard, Calendar, Work Orders, PM Schedule,
--         Assets, Buildings, Rooms, Supplies, Projects, Contacts.
--       SHOULD be empty / restricted: Financial Dashboard,
--         Vendor Invoices, Vendor Quotes, Supply Requests, Budgets.
--     Then log in as the admin account and walk through the Settings page;
--     confirm Categories / Room Types / Supply Categories / Contact Roles
--     are all editable (Pattern C admin write check).
--     If any operational page is empty when it shouldn't be, or any
--     restricted page shows data, investigate before declaring phase 1 done.
