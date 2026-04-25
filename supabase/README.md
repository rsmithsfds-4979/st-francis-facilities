# supabase/

- `migrations/` — SQL migrations applied to the hosted project. Reviewed in PR, run manually via the dashboard SQL editor (no CI yet).
- `audit-*.csv` — point-in-time RLS snapshots exported from the dashboard SQL editor. These are the **schema-of-record for security review** until a full schema dump is in the repo.

A complete `schema.sql` from `supabase db dump` is deferred pending Docker Desktop install (the CLI dump command requires it). The audit CSVs cover the structural surface — RLS policies, triggers, constraints, helper functions — that the in-flight security work depends on.
