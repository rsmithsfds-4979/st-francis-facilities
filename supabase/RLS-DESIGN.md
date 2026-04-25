# RLS design — closing C2 and H1

Working document. Review and push back; nothing here is migrated yet. Numbers in parentheses cite `supabase/audit-policies.csv` rows or `js/app.js` lines.

The goal is to replace the current "any authenticated user can do anything" posture (rows 2–11, 16–21, 26–29 of the policies CSV) with role-aware policies that match the client's `PERMS` map at `js/app.js:2125-2158`, and to make the dept_head building scope a server-enforced rule rather than a client convention.

## 1. Helper functions

Building on `is_admin(uid uuid DEFAULT auth.uid())` already shipped in `20260425000001_fix_profile_role_self_promotion.sql:30-41`. The three you proposed are right-shaped; I'd add a fourth.

| Function | Returns | Lang | Volatility | Security | What it does | Used by |
|---|---|---|---|---|---|---|
| `is_admin(uid)` *(exists)* | `boolean` | sql | STABLE | DEFINER | True if `uid`'s profile row has `role='admin'`. | trigger `profiles_guard_privileged_columns`; every admin-gated policy |
| `current_user_role()` | `text` | sql | STABLE | DEFINER | Returns the caller's `profiles.role`, or NULL if no row exists. | every role-gated policy (most tables) |
| `user_assigned_buildings(uid uuid DEFAULT auth.uid())` | `uuid[]` | sql | STABLE | DEFINER | Parses the caller's `profiles.assigned_building_ids` and returns it as a `uuid[]`. Empty array if not set. | `can_access_building`; possibly the client (via RPC) for nav |
| `can_access_building(building_id uuid)` | `boolean` | sql | STABLE | DEFINER | Encapsulates the access rule: admins → true; non-dept_heads → true; dept_heads → `building_id = ANY(user_assigned_buildings())`. | every building-scoped table policy |

All `STABLE` (returns same result within a statement, allows planner caching) and `SECURITY DEFINER` (bypasses RLS on the `profiles` lookup so we don't recurse through the policy stack). All set `search_path = public, pg_temp` for definer-safety, same as `is_admin`.

**Pushback / additions:**

- `current_user_role()` should return NULL (rather than `'viewer'`) for unknown users so `current_user_role() IN (...)` evaluates false and policies fail closed. Document the contract in the function header.
- I'd add **`can_edit_module(module text)`** as a fifth helper if we want to mirror the client's `canEdit()` exactly. **Pushback against my own suggestion:** this would duplicate the role→module map in two places (client `PERMS` + DB function). Better to bake the role list directly into each policy (`current_user_role() IN ('admin','manager','facilities')`) so each policy is self-documenting and there's no central map drifting from reality. **Recommendation: skip `can_edit_module`.**
- `is_authenticated()` would just wrap `auth.uid() IS NOT NULL`. Trivial; not worth a function. Skip.

## 2. Policy patterns

Four canonical shapes. Apply by composition: most tables get pattern A; building-scoped tables get B; tables with `created_by`/`updated_by` columns get D layered on top.

### Pattern A — Read-by-role, write-by-role

For module tables that aren't building-scoped. Reads usually open to most authenticated users (the client's nav already hides the page); writes restricted to the explicit role list.

```sql
-- Example: vendor_invoices (finance + facilities + manager + admin can write;
-- viewer can NOT read per Q6/Q8)
CREATE POLICY vendor_invoices_select ON public.vendor_invoices
  FOR SELECT TO authenticated
  USING (current_user_role() IN
    ('admin','manager','facilities','finance'));

CREATE POLICY vendor_invoices_insert ON public.vendor_invoices
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN
    ('admin','manager','facilities','finance'));

CREATE POLICY vendor_invoices_update ON public.vendor_invoices
  FOR UPDATE TO authenticated
  USING (current_user_role() IN
    ('admin','manager','facilities','finance'))
  WITH CHECK (current_user_role() IN
    ('admin','manager','facilities','finance'));

CREATE POLICY vendor_invoices_delete ON public.vendor_invoices
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','manager'));
```

Note: separate policies per command (SELECT/INSERT/UPDATE/DELETE) instead of the existing "ALL" pattern. This makes each policy self-documenting and lets DELETE be more restrictive than UPDATE without contortions.

### Pattern B — Building-scoped read+write

For tables with a `building_id` column where dept_heads should only see/touch their assigned buildings. Layered on top of A: the role check stays, plus the building check.

```sql
-- Example: work_orders (most roles read; janitor + dept_head + facilities + ... write;
-- dept_head limited to their buildings)
CREATE POLICY work_orders_select ON public.work_orders
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN
      ('admin','manager','facilities','finance','dept_head','janitor','viewer')
    AND can_access_building(building_id)
  );

CREATE POLICY work_orders_insert ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN
      ('admin','manager','facilities','dept_head','janitor')
    AND can_access_building(building_id)
  );

-- UPDATE / DELETE follow the same shape.
```

`can_access_building()` is a no-op for non-dept_heads (returns true), so the same policy works uniformly for every role.

### Pattern C — Catalog: read-all, admin-write-only

For Settings-page-managed lookup tables. Settings is admin-only on the client (`js/app.js:2200-2202`), so writes should be admin-gated server-side too; reads stay open because every role's page builds dropdowns from these.

```sql
-- Example: room_types
CREATE POLICY room_types_select ON public.room_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY room_types_write ON public.room_types
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

`FOR ALL` is fine here because there's only one role (admin) on the write side — the per-command split adds no clarity.

### Pattern D — Audit-trail integrity (composable)

Layered onto any pattern that writes to a table with `created_by`/`updated_by` columns. Prevents forgery of attribution (H2 from the audit). Implemented as a `WITH CHECK` clause on INSERT/UPDATE, **not** a separate policy — it composes with whatever role-gating policy is in play.

```sql
-- Pattern: every INSERT must set created_by = auth.uid(); every UPDATE must
-- set updated_by = auth.uid(). Admins are exempt (so they can fix attribution
-- after the fact, e.g. on imports).
WITH CHECK (
  current_user_role() IN ('admin','manager','facilities','finance')
  AND (is_admin() OR created_by = auth.uid())   -- on INSERT
);
```

Because Postgres only exposes `NEW` to RLS WITH CHECK (not OLD), enforcing "you can't change `created_by` on UPDATE" requires a BEFORE UPDATE trigger — same pattern as `profiles_guard_privileged_columns`. I'd defer that trigger to its own phase (see §4).

### Pattern E — Self-or-admin (already shipped, profiles only)

Only used by `profiles`. Documented for completeness; not a template for other tables.

## 3. Per-table classification

Using the canonical client list **plus the four plumbing tables** (`app_settings`, `wo_comments`, `asset_service_log`, `service_history`) now that §6 has resolved their treatment. **Two table-name corrections** vs your prompt: the client's `pm_tasks` is the DB's `pm_schedule`, and `invoices` is `vendor_invoices` — verified in `js/app.js` against the audit CSV.

`canEdit` columns derive from `js/app.js:2131-2158`. **Bldg** = building-scoped (has a `building_id` column the client filters by). **Audit** = has `created_by`/`updated_by` columns (inferred from `stamp(d, true)` call sites).

| Table | Pattern | Read by | Write by | Bldg | Audit | Notes |
|---|---|---|---|---|---|---|
| `profiles` | E (shipped) | all auth | self (non-priv cols), admin (any) | — | — | Done. |
| `contacts` | A | admin, manager, facilities, finance, dept_head, viewer | admin, manager, facilities | no | yes | Parish-wide, not building-scoped (Q3). |
| `contact_roles` | C (catalog) | all auth | admin only | no | yes | Settings page. |
| `work_orders` | B | admin, manager, facilities, finance, dept_head, janitor, viewer | admin, manager, facilities, dept_head, janitor | yes | yes | finance reads only — see "Where the audit suggests..." below (Q2). |
| `pm_schedule` | B | admin, manager, facilities, finance, viewer | admin, manager, facilities | yes | yes | dept_head + janitor have no nav for it. |
| `assets` | B | admin, manager, facilities, finance, viewer | admin, manager, facilities | yes | yes | |
| `buildings` | B | admin, manager, facilities, finance, dept_head, viewer | admin, manager, facilities | yes (self) | yes | The row IS the building — `can_access_building(id)` rather than `(building_id)`. |
| `rooms` | B | inherits buildings | admin, manager, facilities | yes | yes | Scope via `(SELECT building_id FROM rooms WHERE id = NEW.id)` or denormalize a building_id column. |
| `supplies` | A | admin, manager, facilities, finance, viewer | admin, manager, facilities | no | yes | Parish-wide. |
| `supply_requests` | A* | admin, manager, facilities, janitor | admin, manager, facilities, janitor (self-only on UPDATE) | no | yes | Q4: janitors SELECT all, INSERT with `requested_by=auth.uid()`, UPDATE only their own pending. Viewer dropped (Q8 framing — see verification note). *A with self-vs-other UPDATE split — needs two UPDATE policies. |
| `quotes` | A | admin, manager, facilities, finance | admin, manager, facilities, finance | yes (loose) | yes | Viewer dropped (Q6). No building scope, no per-user grants (Q5 forward note). |
| `vendor_invoices` | A | admin, manager, facilities, finance | admin, manager, facilities, finance | yes (loose) | yes | Viewer dropped (Q6). No building scope, no per-user grants (Q5 forward note). |
| `projects` | A | admin, manager, facilities, finance, dept_head, viewer | admin, manager, facilities, finance | yes (loose) | yes | dept_head sees parish report only — read access at the table level can stay open since reports filter client-side. |
| `categories` | C (catalog) | all auth | admin only | no | yes | Settings. |
| `room_types` | C (catalog) | all auth | admin only | no | yes | Settings. |
| `supply_categories` | C (catalog) | all auth | admin only | no | yes | Settings. |
| `budgets` | A | admin, manager, finance | admin, manager, finance | no | yes | Viewer dropped (Q6). |
| `utility_readings` | B | admin, manager, facilities | admin, manager, facilities | yes | yes | |
| `calendar_events` | A | admin, manager, facilities, finance, dept_head, viewer | admin, manager (Q7) | no | yes | Q7 forward note: hats era will need atomic write permissions for Music Director, Liturgical Director, Office Manager. |
| `wo_comments` | A → B in P2 | admin, manager, facilities, finance, dept_head, janitor, viewer | admin, manager, facilities, dept_head, janitor | no in P1, yes in P2 | yes | Q1: SELECT mirrors work_orders read list (all 7 roles); INSERT/UPDATE matches the work_orders write list. No DELETE in P1. Phase 2 denormalizes `building_id` onto the table to enable Pattern B. |
| `app_settings` | C (catalog) | all auth | admin only | no | no | Q1: every page reads weather/gcal config; Settings page writes. |
| `asset_service_log` | dead schema — admin only | admin only | admin only | n/a | n/a | Q1: no client refs, no triggers, zero rows. Locked admin-only pending separate cleanup decision. |
| `service_history` | dead schema — admin only | admin only | admin only | n/a | n/a | Q1: same as above. |

### Where the audit suggests the client's intent is wrong (or missing)

- **`viewer` is being narrowed** (Q6 + Q8). The original audit observation was "viewer reads almost everything," which the client's `PERMS.viewer.nav` literally specifies but is broader than the role's intended use. Per Q8, viewer is now defined as a forward-looking read-only operational role: contacts, work_orders, pm_schedule, assets, buildings, rooms, supplies, calendar_events, projects. **Excluded from reads: budgets, vendor_invoices, quotes, supply_requests, financial reports.** Auditors / council members who need financial reads are deferred to dedicated hats. Narrow defaults are safer for the "I don't know what role to assign" fallback case.
- **`finance` writes `work_orders`: read-only intent confirmed** (Q2). Rationale: finance-the-function reviews; operations-the-function executes. People who do both jobs are assigned `manager`, not `finance`. The hat layer will eventually let one person wear both hats while preserving the floor.
- **`dept_head` has narrower edits than nav suggests.** Dept_head nav includes `buildings` and `contacts` but `canEdit` only includes `workorders`. Server intent: dept_head reads buildings+contacts, writes only work_orders.
- **None of the building-scoped tables enforce dept_head scope today.** All-or-nothing reads — a dept_head browsing the API directly sees every building's data. Tightening reads (not just writes) is the right move; dept_head browsing the UI won't notice the difference because the client already filters. Deferred to phase 2.

### Verification note on Q6/Q8

You explicitly listed three viewer-read drops in Q6 (quotes, vendor_invoices, budgets), then asked me to verify nothing else needed updating. **One additional drop fell out of the Q8 allow list:** `supply_requests` was previously in viewer's read list (my prior §3) but is not in Q8's nine permitted reads. I dropped it on the same principle — narrow defaults — and noted the change in the table above. If you intended viewer to retain read access to supply_requests, say so and I'll restore it; otherwise this is the only delta beyond the three you named.

## 4. Migration phasing — pushback on your 2-phase split

You proposed: Phase 1 = write restrictions per role; Phase 2 = DELETE + audit-trail + dept_head scope. **I'd argue for three phases instead.** Two reasons:

1. **DELETE belongs with INSERT/UPDATE in phase 1.** They share helpers, share the role list, and split per-command policies fall out of the same template. Splitting DELETE into phase 2 means writing two policies for every table and revisiting them a week later. Bundle them.
2. **dept_head building scope (H1) and audit-trail forgery (H2) are different bugs with different shapes.** H1 needs a schema decision (jsonb→uuid[]) and one new helper. H2 needs a BEFORE UPDATE trigger per audited table. Mixing them means one phase-2 migration touches every audited table for one purpose AND every dept_head-relevant table for another. Easier to reason about as separate phases.

**Proposed three-phase split:**

| Phase | Scope | Tables touched | Closes |
|---|---|---|---|
| 1 | Replace "Authenticated access" with role-based SELECT/INSERT/UPDATE/DELETE policies on every table. Add `current_user_role()` helper. No schema changes. | All 22 tables. | C2 |
| 2 | Add dept_head building scope. Migrate `profiles.assigned_building_ids` from jsonb→uuid[]. Add `user_assigned_buildings()` and `can_access_building()` helpers. Replace pattern A with pattern B on building-scoped tables. Denormalize `building_id` onto `wo_comments` to enable Pattern B (Q1). | ~10 tables (work_orders, pm_schedule, assets, rooms, buildings, vendor_invoices, quotes, utility_readings, wo_comments, asset_service_log) | H1 |
| 3 | Audit-trail forgery prevention. Add `WITH CHECK (created_by = auth.uid())` on INSERT, BEFORE UPDATE trigger preventing changes to created_by/created_at on every audited table. | Every table with `created_by`/`updated_by` (~17). | H2 |

Each phase is one migration file, one PR, one round of dashboard verification. Phase 1 is the highest priority because it closes the wide-open universal write hole; phase 2 and 3 are defense-in-depth on top of that.

## 5. `assigned_building_ids` data type — migrate to uuid[] in phase 2

Three options:

| Option | Pros | Cons |
|---|---|---|
| Keep jsonb permanently; helper parses | Zero schema change | `user_assigned_buildings()` does the parse on every call. Function inlining is disabled by SECURITY DEFINER, so this runs once per row evaluation. Slow on large building counts. Also: no FK enforcement possible, no GIN index. |
| Migrate to uuid[] now (before phase 2) | Cleanest. Makes phase 2 SQL trivial. | Touches profiles in a new migration before phase 1 ships, slight phase ordering churn. |
| **Migrate to uuid[] as the first step of phase 2** | Same end state as option 2. Keeps phase 1 zero-schema-change, lowest risk. The only consumer of `assigned_building_ids` is dept_head scope, which is exactly what phase 2 introduces — they belong together. | Slightly more work in phase 2 than option 2. |

**Recommendation: option 3.** The data type migration is one statement (`ALTER TABLE profiles ALTER COLUMN assigned_building_ids TYPE uuid[] USING (...)`), and the only client touch-point is `normalizeIdArray()` at `app.js:2102` — which already handles both shapes since Supabase's REST layer returns both as JSON arrays. No client change needed.

## 6. Open questions — answered

I can't decide these from the audit + client code alone. Each could change the policy shape for a table.

### 1. app_settings, wo_comments, asset_service_log, service_history

None appear in `PERMS` — they're plumbing tables the client uses without a dedicated nav entry. My read:
- `app_settings` — admin-only writes (Settings page); all-auth reads (every page reads weather/gcal config). Pattern C.
- `wo_comments` — readable+writable by anyone who can read+write the parent `work_orders` row. Pattern B via the parent's `building_id` (requires a JOIN or trigger). Need confirmation.
- `asset_service_log` — looks like an automatic log written by PM completion; probably mirrors `pm_schedule` permissions (Pattern B). Need confirmation of who writes what.
- `service_history` — possibly derived/static; need to know whether the client writes to it directly or only reads.
- **Question:** confirm the four mappings above, and tell me if any of these tables are written by triggers/server jobs (in which case the policies need to allow definer functions).

**Answer:**
- `app_settings` — confirmed Pattern C (all-auth read, admin-only write).
- `wo_comments` — Pattern A in phase 1 (inherits work_orders role list, no building scope yet); DELETE restricted to admin/manager. Phase 2 denormalizes `building_id` onto the row to enable Pattern B (avoids a JOIN in every policy evaluation).
- `asset_service_log` and `service_history` — confirmed dead schema. No client refs, no triggers, zero rows. Lock all four CRUD operations to admin only. Recommend a separate cleanup PR to either repurpose or drop the tables; phase 1 just keeps them safe.

### 2. finance on work_orders — read-only?

Client nav shows finance has work orders visible (`PERMS.finance.nav` at `app.js:2142`), but `canEdit` excludes them. **Confirm: finance can read but not write/delete work_orders.**

**Answer:** Confirmed read-only. Rationale: finance-the-function reviews; operations-the-function executes. People who do both jobs are assigned `manager`, not `finance`. The hat layer will eventually let one person wear both hats while preserving the floor.

### 3. contacts building scope

Dept_heads have `contacts` in their nav but contacts are global parish-wide (vendors, contractors, staff, volunteers — not tied to a building). **Confirm: contacts are NOT building-scoped, even for dept_heads.**

**Answer:** Confirmed. Pattern A; no building scope in any phase.

### 4. supply_requests — janitor scope

Janitors can INSERT supply requests (`PERMS.janitor.canEdit:['workorders','supply-requests']`). Two questions: (a) can janitors UPDATE their own pending request (e.g. cancel), or only INSERT? (b) should they only see *their own* requests, or all pending requests? Currently the client filters by `requested_by`; the server doesn't.

**Answer:** Phase 1 rules:
- All janitors can SELECT all rows (visibility into peer requests, useful for coordination).
- Janitors INSERT new requests with `requested_by = auth.uid()` (server-enforced via `WITH CHECK`).
- Janitors UPDATE only their own pending requests (self-row-ownership policy split).
- Forward note: at larger scale, parishes will want a Supply Coordinator hat to split coordinators from general janitors. This is deferred to the hat era and not pre-empted by adding a sub-role now.

### 5. quotes / vendor_invoices building scope for dept_heads

Both have a `building_id` column. The client doesn't restrict reads by building for dept_heads on these tables (dept_head's nav doesn't include them anyway). **Decision needed:** if a dept_head somehow queries these via API directly, should they be limited to their assigned buildings, or get nothing because the role isn't supposed to see them at all? My default: nothing — exclude via role check, no need for building check.

**Answer:** Role-check only, no building scope, no per-user grants. **Forward note for the doc:** phase 1–3 RLS uses no per-user overrides. Flexibility for individual exceptions arrives via hats and atomic permissions, not via a side-table grant mechanism. (Recorded in the §3 row notes.)

### 6. budgets — viewer access

Not in any role's `canEdit` except admin/manager/finance. Is `viewer` supposed to see budgets? Finance dashboard at `app.js:1581` calls `renderFinance()` which probably reads budgets — and finance is in viewer's nav (`PERMS.viewer.nav` at `app.js:2154-2156`). **Confirm: viewer reads budgets.**

**Answer:** No. Drop viewer from reads on `budgets`, `vendor_invoices`, and `quotes`. (See Q8 for the framing.) §3 updated; verification note above flags `supply_requests` as one additional drop that fell out of Q8's allow list.

### 7. calendar_events write access

`PERMS` doesn't list `calendar_events` in any role's `canEdit`, but `index.html:161` shows a "+ Add Event" button on the Calendar page (visible to admin, manager, facilities, finance, viewer per the calendar nav at `PERMS.*.nav`). **Confirm:** who writes calendar events? Admin + manager only? Same as projects? Same as everyone with the nav?

**Answer:** Writes restricted to admin + manager only. Forward note: this table will likely need expansion via atomic permissions when hats arrive — Music Director, Liturgical Director, and Office Manager all have legitimate calendar-write needs that don't fit the existing role list. Recorded in §3.

### 8. viewer role definition

`viewer` currently has read access to almost the entire dataset. If "viewer" is the role given to people who shouldn't have full operational access (e.g., council members, auditors), the read scope is broader than typical for that label. Worth a sanity check before locking it into RLS.

**Answer:** Currently zero real humans hold `viewer` (the one row in the audit was a typo of an admin email, never used). Treating `viewer` as forward-looking: a narrowly-defined role for read-only operational staff.
- **Reads:** contacts, work_orders, pm_schedule, assets, buildings, rooms, supplies, calendar_events, projects.
- **Does NOT read:** budgets, vendor_invoices, quotes, financial reports, supply_requests *(see verification note in §3)*.
- Rationale: narrow defaults are safer for the "I don't know what role to assign" fallback case. Auditor / council member access (which needs financial reads) is deferred to dedicated hats.

---

Once you've signed off on the phase split, the next migration is phase 1: `current_user_role()` helper + per-command role policies on every table.
