-- Phase 3 RLS migration: audit-trail integrity (audit finding H2).
-- Two BEFORE INSERT OR UPDATE trigger functions + 18 trigger attachments.
-- No schema changes, no policy changes — pure trigger-layer enforcement.
--
-- DEPENDENCIES: this migration calls is_admin() from C1
-- (20260425000001_fix_profile_role_self_promotion.sql). Apply it first;
-- otherwise the trigger functions will fail at runtime when an INSERT or
-- UPDATE fires the trigger and the admin-exempt check can't resolve.
--
-- SHAPES: 18 protected tables fall into two column shapes.
--   CUc-  (11 tables, has created_by + updated_by + created_at, no updated_at):
--     assets, buildings, categories, contact_roles, contacts, room_types,
--     rooms, utility_readings, vendor_invoices, wo_comments, work_orders.
--   CUcu  (7 tables, has all four):
--     budgets, calendar_events, projects, quotes, supplies,
--     supply_categories, supply_requests.
--
-- SKIPPED: app_settings, asset_service_log, pm_schedule, profiles. No _by
-- columns to protect (or already covered by C1's trigger for profiles).
--
-- BEHAVIOR (both functions):
--   Admin: exempt — return NEW unchanged.
--   INSERT: NULL _by columns auto-fill to auth.uid(); non-NULL mismatches
--           against auth.uid() raise errcode 42501.
--   UPDATE: created_by and created_at are immutable (raise 42501 on change);
--           updated_by is silently overwritten to auth.uid() (no reject).
-- CUcu adds: UPDATE silently overwrites updated_at := now().
--
-- NOT TOUCHED: supply_requests.requested_by — business data, intentionally
-- settable by staff filing on a janitor's behalf. Phase 3 only protects
-- the dedicated audit columns (created_by/updated_by/created_at/updated_at).
--
-- Two functions instead of one parameterized: the duplication is small
-- (one extra line in cucu) and TG_TABLE_NAME branching would obscure the
-- intent at the call site.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. guard_audit_columns_cuc — for tables WITHOUT updated_at.
--    SECURITY INVOKER (default): runs as the calling user. The is_admin()
--    call inside is SECURITY DEFINER, which is where RLS on profiles is
--    bypassed for the role lookup.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_audit_columns_cuc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- created_by: auto-fill if NULL, reject mismatch.
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    ELSIF NEW.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'permission denied: created_by must equal auth.uid() (got %, caller is %)',
        NEW.created_by, auth.uid()
        USING ERRCODE = '42501';
    END IF;

    -- updated_by: same treatment.
    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := auth.uid();
    ELSIF NEW.updated_by <> auth.uid() THEN
      RAISE EXCEPTION 'permission denied: updated_by must equal auth.uid() (got %, caller is %)',
        NEW.updated_by, auth.uid()
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- created_by is immutable.
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'permission denied: created_by is immutable'
        USING ERRCODE = '42501';
    END IF;

    -- created_at is immutable.
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'permission denied: created_at is immutable'
        USING ERRCODE = '42501';
    END IF;

    -- updated_by always overwritten — silent, no reject. Cleaner than making
    -- every client coordinate the exact-uid-match the rejection would require.
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. guard_audit_columns_cucu — for tables WITH updated_at.
--    Identical to cuc plus one extra line in the UPDATE branch.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_audit_columns_cucu()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    ELSIF NEW.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'permission denied: created_by must equal auth.uid() (got %, caller is %)',
        NEW.created_by, auth.uid()
        USING ERRCODE = '42501';
    END IF;

    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := auth.uid();
    ELSIF NEW.updated_by <> auth.uid() THEN
      RAISE EXCEPTION 'permission denied: updated_by must equal auth.uid() (got %, caller is %)',
        NEW.updated_by, auth.uid()
        USING ERRCODE = '42501';
    END IF;
    -- updated_at on INSERT: leave alone, column default (now()) handles it.
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'permission denied: created_by is immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'permission denied: created_at is immutable'
        USING ERRCODE = '42501';
    END IF;

    NEW.updated_by := auth.uid();
    NEW.updated_at := now();   -- the only diff vs. cuc: server clock wins.
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Attach triggers. 11 CUc- tables + 7 CUcu tables = 18 triggers.
--    Naming: <table>_guard_audit_columns. BEFORE INSERT OR UPDATE FOR EACH ROW.
-- ────────────────────────────────────────────────────────────────────────────

-- CUc- tables (11)
DROP TRIGGER IF EXISTS assets_guard_audit_columns           ON public.assets;
DROP TRIGGER IF EXISTS buildings_guard_audit_columns        ON public.buildings;
DROP TRIGGER IF EXISTS categories_guard_audit_columns       ON public.categories;
DROP TRIGGER IF EXISTS contact_roles_guard_audit_columns    ON public.contact_roles;
DROP TRIGGER IF EXISTS contacts_guard_audit_columns         ON public.contacts;
DROP TRIGGER IF EXISTS room_types_guard_audit_columns       ON public.room_types;
DROP TRIGGER IF EXISTS rooms_guard_audit_columns            ON public.rooms;
DROP TRIGGER IF EXISTS utility_readings_guard_audit_columns ON public.utility_readings;
DROP TRIGGER IF EXISTS vendor_invoices_guard_audit_columns  ON public.vendor_invoices;
DROP TRIGGER IF EXISTS wo_comments_guard_audit_columns      ON public.wo_comments;
DROP TRIGGER IF EXISTS work_orders_guard_audit_columns      ON public.work_orders;

CREATE TRIGGER assets_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER buildings_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER categories_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER contact_roles_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER contacts_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER room_types_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER rooms_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER utility_readings_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.utility_readings
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER vendor_invoices_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER wo_comments_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.wo_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();
CREATE TRIGGER work_orders_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cuc();

-- CUcu tables (7)
DROP TRIGGER IF EXISTS budgets_guard_audit_columns           ON public.budgets;
DROP TRIGGER IF EXISTS calendar_events_guard_audit_columns   ON public.calendar_events;
DROP TRIGGER IF EXISTS projects_guard_audit_columns          ON public.projects;
DROP TRIGGER IF EXISTS quotes_guard_audit_columns            ON public.quotes;
DROP TRIGGER IF EXISTS supplies_guard_audit_columns          ON public.supplies;
DROP TRIGGER IF EXISTS supply_categories_guard_audit_columns ON public.supply_categories;
DROP TRIGGER IF EXISTS supply_requests_guard_audit_columns   ON public.supply_requests;

CREATE TRIGGER budgets_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER calendar_events_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER projects_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER quotes_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER supplies_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.supplies
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER supply_categories_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.supply_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();
CREATE TRIGGER supply_requests_guard_audit_columns
  BEFORE INSERT OR UPDATE ON public.supply_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_columns_cucu();

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification — run separately in the dashboard SQL editor after applying.
-- The migration itself does not execute these.
--
-- (a) Both trigger functions exist with the right signature.
--
-- SELECT n.nspname, p.proname,
--        pg_get_function_arguments(p.oid) AS args,
--        pg_get_function_result(p.oid)    AS returns
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('guard_audit_columns_cuc','guard_audit_columns_cucu')
--   ORDER BY p.proname;
--
-- Expected: 2 rows, both args='', both returns='trigger'.
--
-- (b) All 18 triggers attached, mapped to the right function.
--
-- SELECT c.relname AS tablename, t.tgname AS trigger,
--        p.proname AS function, pg_get_triggerdef(t.oid) AS definition
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_proc  p ON p.oid = t.tgfoid
--   WHERE c.relnamespace = 'public'::regnamespace
--     AND t.tgname LIKE '%_guard_audit_columns'
--     AND NOT t.tgisinternal
--   ORDER BY p.proname, c.relname;
--
-- Expected: 18 rows.
--   guard_audit_columns_cuc  (11): assets, buildings, categories, contact_roles,
--     contacts, room_types, rooms, utility_readings, vendor_invoices,
--     wo_comments, work_orders.
--   guard_audit_columns_cucu (7):  budgets, calendar_events, projects, quotes,
--     supplies, supply_categories, supply_requests.
--   Each pg_get_triggerdef contains "BEFORE INSERT OR UPDATE ON public.<table>".
--
-- (c) Manual: client-side forgery test as the existing janitor user.
--     Goal: confirm the four behaviors documented in §1/§2 of this file.
--     Done in the browser console as a non-admin (admin is exempt and won't
--     exercise the rejection paths).
--
--     Sign into the app as the janitor. In devtools console:
--
--       const me = (await db.auth.getUser()).data.user.id;
--       const someoneElse = '<ANY_OTHER_PROFILE_UUID>';
--
--     Run each test, observe the result:
--
--     1. Forged created_by on INSERT — expect rejection.
--        const r = await db.from('work_orders').insert({
--          issue:'phase3 test', building:'Church',
--          created_by: someoneElse
--        });
--        // Expected: r.error.code === '42501',
--        //           message contains "created_by must equal"
--
--     2. NULL created_by on INSERT — expect auto-fill to me.
--        const r = await db.from('work_orders').insert({
--          issue:'phase3 autofill test', building:'Church'
--        }).select();
--        // Expected: r.data[0].created_by === me  AND  r.data[0].updated_by === me
--        // Cleanup: await db.from('work_orders').delete().eq('id', r.data[0].id);
--        //   Will silently no-op — work_orders has no DELETE policy (phase 1
--        //   design). Delete from dashboard SQL editor with
--        //   DELETE FROM work_orders WHERE id='<id>' after the test, or just
--        //   leave the row (it's labeled 'phase3 autofill test').
--
--     3. Forged created_by on UPDATE — expect rejection.
--        const woId = '<existing work order id the janitor can edit>';
--        const r = await db.from('work_orders').update({ created_by: someoneElse })
--                                              .eq('id', woId);
--        // Expected: r.error.code === '42501',
--        //           message contains "created_by is immutable"
--
--     4. Forged updated_by on UPDATE — expect silent overwrite to me.
--        const r = await db.from('work_orders').update({
--          notes:'phase3 updated_by test', updated_by: someoneElse
--        }).eq('id', woId).select();
--        // Expected: r.data[0].updated_by === me
--        //           (NOT someoneElse — overwritten by the trigger)
--
--     Note: tables where the janitor lacks RLS write access (assets, quotes,
--     vendor_invoices, etc.) would reject at RLS with the same errcode 42501,
--     masking the trigger rejection. work_orders and supply_requests are safe
--     choices — the janitor has UPDATE permission on both per phase 1.
