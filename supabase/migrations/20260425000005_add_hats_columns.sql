-- Hats refactor — Step 1: data plumbing only.
-- Adds two columns to profiles. No behavior change today; nothing reads
-- these columns yet. Sets up the structure so hat assignment becomes
-- possible in future commits.
--
-- profiles.hats jsonb: list of hats a user can wear (JSON array of string
--   keys like "janitor", "office_manager"). jsonb (not text[]) because hat
--   keys are strings, and the shape leaves room for per-user overrides
--   later (e.g., a hat with a custom home screen).
-- profiles.active_hat text: the user's currently-selected hat for this
--   session. NULL when the user has no hats or hasn't picked one. The
--   UI is responsible for ensuring the value is one of the keys in the
--   user's hats array — no DB-level membership constraint (Postgres can't
--   express "text in jsonb array" without a trigger, and the failure mode
--   for a stale value is mild — UI falls back to a default).
--
-- DEPENDENCIES: none. Strictly additive on the profiles table.
-- C1's profiles_guard_privileged_columns trigger continues to fire on
-- UPDATE but does NOT protect these new columns — see the TODO before
-- COMMIT below. Today, hats and active_hat are both writable by anyone
-- who passes the existing profiles UPDATE policy (self for their own row,
-- admin for any row).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN hats jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN active_hat text NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_hats_is_array
  CHECK (jsonb_typeof(hats) = 'array');

-- TODO (BLOCKING — must precede any code that reads `hats` for user-facing
--       behavior, especially anything that gates UI or permissions on it):
--
-- Extend the C1 trigger profiles_guard_privileged_columns to block non-admin
-- changes to `hats` (admin-only, same shape as the existing protection on
-- `role` and `assigned_building_ids`). Leave `active_hat` self-writable —
-- it's pure UX state (which hat the user is wearing right now), set by the
-- hat-switcher dropdown.
--
-- Without that extension, any user can grant themselves any hat by running
-- db.from('profiles').update({hats:['admin','any_hat_we_invent']}).eq('id',
-- (await db.auth.getUser()).data.user.id) from the browser console. This is
-- the same shape as the C1 self-promotion-to-admin bug, closed in
-- 20260425000001 — and the next migration in the hat sequence MUST close
-- the equivalent for `hats` before any production code starts reading it.

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification — run separately in the dashboard SQL editor after applying.
--
-- (a) hats column exists, jsonb, NOT NULL, default '[]'::jsonb.
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='profiles'
--    AND column_name='hats';
--
-- Expected: data_type='jsonb', is_nullable='NO',
--           column_default contains "'[]'::jsonb".
--
-- (b) active_hat column exists, text, nullable.
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='profiles'
--    AND column_name='active_hat';
--
-- Expected: data_type='text', is_nullable='YES'.
--
-- (c) CHECK constraint on hats exists and is validated.
--
-- SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--  WHERE conrelid='public.profiles'::regclass
--    AND conname='profiles_hats_is_array';
--
-- Expected: one row, convalidated=true, definition contains
--   "jsonb_typeof(hats) = 'array'".
