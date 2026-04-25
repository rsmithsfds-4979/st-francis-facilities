-- Fix C1 from RLS audit: any authenticated user can UPDATE their own profiles
-- row including the role column, allowing self-promotion to admin.
--
-- Postgres RLS cannot reference OLD, so column-level protection lives in a
-- BEFORE UPDATE trigger paired with a permissive row-level policy.
--
-- Note on missing INSERT / DELETE policies on profiles (intentional):
--   INSERT — new profile rows are created exclusively by the handle_new_user
--     trigger on auth.users (SECURITY DEFINER, bypasses RLS). Direct INSERTs
--     from the client should fail, and we want them to.
--   DELETE — deactivation is done by removing the auth.users row (which
--     cascades) or by neutering the profile (role='viewer', cleared buildings).
--     Hard-deleting profile rows would orphan attribution columns on contacts,
--     work_orders, pm_schedule, etc., and lose audit history.

BEGIN;

-- 1. Pin profiles.role to the seven values from app.js:2128 (ROLE_LIST).
--    NULL still allowed: column is nullable and userRole() falls back to 'viewer'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_valid
  CHECK (role IS NULL OR role IN
    ('admin','manager','facilities','finance','dept_head','janitor','viewer'));

-- 2. is_admin() — caller-role helper used by the trigger and by every future
--    admin-gated policy as we work through C2/H1. SECURITY DEFINER bypasses
--    RLS on the lookup so we don't recurse through the same policy stack.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

-- 3. Trigger function: block non-admin changes to role / assigned_building_ids.
--    Volatile (default) — trigger functions should not be marked STABLE.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'permission denied: only admins may change profiles.role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.assigned_building_ids IS DISTINCT FROM OLD.assigned_building_ids THEN
    RAISE EXCEPTION 'permission denied: only admins may change profiles.assigned_building_ids'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_privileged_columns();

-- 4. Replace the combined "Self or admin write" policy with two narrower ones.
--    Permissive policies OR together: a row passes if either matches. Column
--    enforcement is delegated to the trigger.
DROP POLICY IF EXISTS "Self or admin write" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification queries — run separately in the dashboard SQL editor after
-- applying. The migration itself does not execute these.
--
-- (a) UPDATE policies on profiles. Expect three rows total: the existing
--     SELECT policy plus the two new UPDATE policies; the old combined
--     "Self or admin write" should be gone.
--
-- SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname='public' AND tablename='profiles'
--   ORDER BY policyname;
--
-- Expected:
--   "Admins can update any profile"   UPDATE
--   "Authenticated read profiles"     SELECT
--   "Users can update own profile"    UPDATE
--
-- (b) Trigger present and wired BEFORE UPDATE. Expect one row.
--
-- SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
--   FROM pg_trigger
--   WHERE tgrelid = 'public.profiles'::regclass
--     AND tgname = 'profiles_guard_privileged_columns'
--     AND NOT tgisinternal;
--
-- Expected: one row; tgenabled='O' (enabled in origin); definition contains
--   "BEFORE UPDATE ON public.profiles".
--
-- (c) CHECK constraint present and validated. Expect one row.
--
-- SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass
--     AND conname = 'profiles_role_valid';
--
-- Expected: one row; convalidated=true; definition lists the seven role values.
