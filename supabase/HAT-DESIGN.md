HAT DESIGNS
═══════════

Captured per-hat across working sessions. Each entry is the verbatim design
output from a session, preserved as-is so future maintainers see the original
intent before any implementation decisions edited it down. New hats append
below the previous one with the same shape.

Format per hat: name underlined with ═, top-line philosophy + default views,
section names underlined with ─, sub-content as bullet lists. Sections in
order: HOME SCREEN, QUICK ACTIONS, NAV ITEMS, NOTES.

═══════════════════════════════════════════════════════════════════════════

ARCHITECTURAL COMMITMENTS
═════════════════════════

Principles that shape how features in this app are designed and built.
Captured here so they apply consistently across all hats and all features,
and so future contributors (or future Rick) can see what foundational
decisions were made and why.

STATE-DRIVEN DESIGN
───────────────────
All workflow data uses explicit state machines, not heuristic queries.

- Workflow tables (project approvals, work orders, invoices, vendor
  records, volunteer commitments, sacrament prep, funeral coordination,
  etc.) include explicit status columns with defined transitions.
- "Needs my attention" surfaces, pending-item lists, approval queues, and
  similar coordination UI query state columns directly. They do not
  approximate state with heuristic queries like "rows created in the last
  30 days where flag X is true."
- Features that require state are not built until the underlying state
  machines exist. UI does not display fake or approximated state.

Rationale: This app supports multiple hats coordinating on overlapping
work (project approvals, funeral coordination, sacrament prep, event
coordination, etc.). Coordination depends on shared, accurate state.
Half-baked SaaS happens when features ship faster than foundations,
producing UI that looks complete but leaks under real coordination load.
State-driven design is a deliberate choice to avoid that.

Implications:

- More upfront design work — every workflow needs its state machine
  designed before its UI is built.
- Real-time state follows naturally from state-driven design. Page loads
  query current state from Postgres; no separate sync layer required for
  v1. Supabase Realtime subscriptions are an option for live updates
  without page refresh, deferred until needed.
- Existing hat designs (Volunteer, Admin) implicitly assume this
  commitment. Sections deferred in those designs (e.g., Volunteer's
  "open opportunities," Admin's "needs my attention") are deferred
  specifically because the underlying state does not yet exist. They
  will be built when state-tracking exists, not before.

NO UI THEATRE
─────────────
If a screen displays information, the information must be real and
current.

- No mock data shipped to production.
- No placeholder states that look like working features.
- No "coming soon" stubs that look indistinguishable from real UI.
- If a feature is not ready, it is not in the UI. It does not appear as a
  disabled element, a stubbed page, or a fake widget.

Rationale: Half-baked SaaS dies in the gap between what a UI implies
works and what actually works. Users lose trust when they cannot tell
which parts of an app are real. This commitment forces honest incremental
shipping — build foundations, ship surfaces on top, do not fake surfaces
while foundations are missing.

═══════════════════════════════════════════════════════════════════════════

JANITOR HAT
═══════════

Philosophy: B — general dashboard with janitor-specific overlays.
Default calendar view: Day (toggles for Week and Month).
Default "recently completed" view: Today (toggle for This Week).

HOME SCREEN
───────────
- Welcome header (janitor's name)
- Today's weather
- My work orders for today (each row has its own "Mark complete" action)
- Recently completed work (default: today; toggle: this week)
- Parish calendar (default: day view; toggles: week, month; scrollable forward/back; all parish events)
- Reorder supplies section
- Language toggle: English / Spanish

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
- Request supplies
- Report an issue (creates a work order routed to facility manager)
- Time off request    [aspirational — feature does not exist yet]
- Message supervisor

NAV ITEMS (sidebar)
───────────────────
- Home
- My Work Orders (full list)
- Supplies (read + request)
- Time Off [aspirational]
- Messages

NOTES
─────
- "Mark complete" lives on each work order row, not as a global home action.
- All work orders shown are filtered by RLS to assigned_to = me.
- Calendar shows all parish events (no facility-relevance filter).
- profiles.language already exists; toggle writes to it and persists.
- Time off and Messages: feature wishlist. Hat design includes them; build later.
- Future bigger-parish consideration: Supply Coordinator hat will subset which
  janitors can write supply_requests vs. read-only.

═══════════════════════════════════════════════════════════════════════════

OFFICE MANAGER HAT
══════════════════

Philosophy: B (general dashboard with office-specific overlays)
Default calendar view: Day (toggles for Week and Month)

HOME SCREEN
───────────
- Welcome header (office manager's name)
- Today's weather
- Open phone messages / inquiries (things to follow up on)
- Pending sacrament prep items (scheduled events with prep tasks)
- Today's clergy calendars (Pastor + Parochial Vicar + Deacon, unified view)
- Parish calendar (today's events; toggles for week/month)
- Language toggle: English / Spanish

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
- Take a message
- Add to clergy calendar (picker: Pastor / Parochial Vicar / Deacon)
- Find a parishioner
- Schedule a sacrament (picker: which sacrament)

NAV ITEMS (sidebar)
───────────────────
- Home
- Messages
- Sacrament Scheduling
  - Baptisms
  - Weddings
  - Funerals
  - First Communion
  - Confirmation
  - Confessions / Reconciliation
  - Anointing of the Sick
- Clergy Calendar (unified, with per-clergy filter)
- Parish Calendar
- Parishioner Directory
- Office Supplies

NOTES
─────
- Mass Intentions is a real workflow that doesn't exist in the system yet. Future feature. When built, will get its own nav item under Sacrament Scheduling or alongside it. Captured as planned feature.
- Communications work (designing flyers, posting bulletins, electronic message board) happens largely outside the system. Office Manager hat doesn't include a Communications nav item for now. If a future communications-tracking feature lands, the Communications hat (separate) would own it.
- Clergy calendar requires a notion of "clergy" as a category in the data model. Currently the system likely has a single calendar per user or similar. Future feature: clergy categorization + unified-view filter.
- New parishioner registration is reachable via Parishioner Directory → "+ Add" — not a home quick action.
- Reserve a room is a cross-hat feature reachable from the Parish Calendar or as a global utility — not a home quick action for this hat.
- Office Supplies is an occasional action (not daily) — nav item only.

═══════════════════════════════════════════════════════════════════════════

VOLUNTEER HAT
═════════════

Philosophy: Recipient-shaped at the core (volunteers receive coordination,
they don't initiate it), with coordinator capabilities layered in for
people who lead a ministry or facilitate a group. Layering is driven by
membership data (ministry_memberships, group_memberships), not by
separate hats.

Who wears this hat: Parishioners who help with parish activities — funeral
receptions, lectoring, RE classroom helpers, festival volunteers, ministry
members, small group participants. Some staff also wear this hat in
addition to their staff hat (e.g., a staff member who serves as a lector
wears both Office Manager and Volunteer).

HOME SCREEN
───────────
Three sections, conditionally shown based on the person's memberships.
A pure volunteer with no leadership role sees only (1) plus a friendly
empty state.

- My commitments (always shown) — Upcoming things this person is signed up
  for, soonest first. Each entry shows date, time, what it is, where, and
  who to contact. Empty state when no commitments.
- Ministries I lead (shown when person leads ≥1 ministry) — For each
  ministry led: upcoming events needing coordination, roster snapshot,
  anything flagged "can't make it" by an assigned volunteer.
- Groups I'm in (shown when person is a member of ≥1 group) — For each
  group: next meeting, member list, recent activity. Facilitator tools
  surface here when the person facilitates the group.

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
Adaptive set, capped at 4 visible. The system picks the most relevant
based on the person's memberships and current commitments. A pure
volunteer with no leadership role sees 2 actions; a ministry leader who
also facilitates a group could see all 4.

- Update contact info (always available) — Phone, email, preferred contact
  method.
- I can't make it (when person has upcoming commitments) — Flag a specific
  commitment as a problem so the coordinator knows to find a replacement.
- Recruit volunteers (when person leads a ministry) — Post an ask for an
  upcoming event needing helpers.
- Mark attendance (when person leads a ministry with a recent event) —
  Record who showed up.
- Message my group (when person facilitates a group) — Send a group-wide
  message.

NAV ITEMS (sidebar)
───────────────────
Adaptive. A pure volunteer sees 2 nav items; a ministry leader sees 3 or 4.

- Home (always)
- My profile / contact info (always)
- Ministries I lead (when applicable) — Deeper coordination views per
  ministry.
- My groups (when applicable) — Group pages.

NOTES
─────
- Volunteer hat is the only parishioner-facing hat in the current set; all
  others are staff-facing. The architectural question of whether parishioners
  should have a separate portal was raised and deferred — staying with
  one-app-many-hats for now.
- Staff who also volunteer wear this hat in addition to their staff hat via
  active_hat switching. When in Volunteer mode they see this thin view; when
  in their staff hat they see staff coordination.
- Adaptive home screen and quick actions are a precedent established here.
  First hat where the visible UI morphs based on the person's data rather
  than being fixed. Future design question: should other hats borrow this
  pattern (e.g., should a staff member who also volunteers see a "your
  volunteer commitments" card on their staff home screen)? Defer until at
  least one staff hat is built.
- "I can't make it" action implies a notification path back to the recruiting
  coordinator. Until the coordination layer exists, store who-to-notify on
  each commitment record.
- Open opportunities to sign up for deferred to v2 — requires the coordination
  layer to exist (someone has to post opportunities first).
- Availability windows (general "I'm available these times") deferred — only
  matters if something queries it. Not needed for v1.

DATA MODEL DEPENDENCIES
───────────────────────
These do not exist yet and need to be designed before the coordinator
capabilities can be built.

- ministry_memberships table or equivalent: (person_id, ministry_id, role)
  where role distinguishes member from leader.
- group_memberships table or equivalent, same shape.
- A commitments (or volunteer_assignments) table tying a person to a
  specific event/task with a contact-coordinator field.

Schema design deferred until the coordination layer is being built. RLS
will need review at that time.

CROSS-HAT WORKFLOW DEPENDENCIES
───────────────────────────────
The Volunteer hat receives coordination from workflows that span multiple
hats. These need to be designed in lockstep when the participating hats
are designed.

- Funeral coordination — Office Manager intake → Liturgical Director
  (readings, music) → Pastor (family meeting, presider) → Facility Manager
  (reception space) → Communications (announcements) → Volunteer
  recruitment and notification.
- Wedding coordination — Similar shape, different participants.
- Event/festival coordination — Multiple ministries recruiting volunteers
  in parallel.
- Sacramental prep — RE Director / RE Admin coordinate volunteers for prep
  sessions.

Same architectural pattern as the project approval workflow (Pastor /
Business Manager / Facility Manager): cross-hat process that should be
designed across hats, not owned by one.

═══════════════════════════════════════════════════════════════════════════

ADMIN HAT
═════════

Philosophy: System hat, not operations hat. Admin runs the app that
supports the parish, not the parish itself. Used deliberately for
specific tasks — user management, integration configuration, system
checks — rather than continuously monitored. Log in, do the task, log
out.

Who wears this hat: Currently Rick Smith (IT Director). Designed so a
successor or backup can step in cold and be functional on day one. In a
multi-tenant SaaS future this hat splits into Parish Admin (manages one
parish's users and config) and Platform Admin (manages the platform
across parishes). Decision to design for St. Francis only with SaaS
optionality preserved was made deliberately during HAT-DESIGN session.

HOME SCREEN
───────────
Two sections. Both shown on landing. Backup-admin test: someone stepping
in cold should land here and within 30 seconds know whether anything is
broken and what's happened recently.

- System status at a glance — Read-only summary. Active user count,
  integration status (e.g., Google Calendar: connected, last sync
  timestamp), recent error count, last successful login. Glance-and-go,
  not a deep diagnostic surface.
- Recent activity — Last 10-20 most-recent writes across the system,
  drawn from per-row created_at/updated_at attribution on the existing
  18 attributed tables. Who did what, when. Quick "did anything weird
  happen since I was last here" view. Deep audit search lives in nav.

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
Three buttons. Reflects deliberate task-oriented use, not monitoring.
Padding to four was considered and rejected — three honest actions
beats four with one filler.

- Manage users — Create user, assign hats, deactivate, edit profile.
- Manage integrations — Add or edit API keys, view integration status,
  configure (today: Google Calendar only).
- View audit trail — Jump to audit-search nav with focus on the search
  box. Used when something looks wrong and warrants investigation.

NAV ITEMS (sidebar)
───────────────────
- Home
- Users — Full user list with search, filter, edit, deactivate. User
  detail page hosts account-level controls (force password reset,
  deactivate, unlock, change email).
- Hats and permissions — View all hats, see who has which.
- Audit trail — Search across the existing per-row attribution columns
  on attributed tables. Filter by user, action type (insert/update),
  date range, table.
- System — Diagnostic dashboard, error log, integration runtime status.
- Settings — App-level configuration. v1 contents: Integrations section
  (API keys, third-party service config). More sections will be added
  here as system-level features grow. Name stays "Settings" rather than
  renaming per-content.

NOTES
─────
- Admin is a system hat, not an operations hat. Does not show
  parish-operational data on the home screen. If Admin needs operational
  context (e.g., is there an event tonight), the answer is to switch to
  another hat — Rick also wears Facility Manager, so this is solved by
  hat switching rather than by surfacing operations data here.
- A lot of admin work happens in the Supabase dashboard, not in this app:
  migrations, RLS policy review, raw diagnostic SQL, schema changes. The
  Admin hat in this app handles user-facing admin tasks (accounts, hats,
  integration config, audit review). Database-level work stays in the
  dashboard. This boundary is documented explicitly so a successor knows
  where to do what.
- Future system-level features (additional API keys, third-party
  integration credentials, webhook configurations, feature flags,
  app-wide settings) belong under this hat. Pattern: Settings nav item
  configures them, System nav item monitors them. Settings is
  intentionally in the nav today even though it's lightly populated —
  it's the designated home for system config as those features get added.
- When system-level features that store credentials are built (API keys,
  OAuth tokens, SMTP passwords), credentials must use Supabase vault or
  equivalent secret storage, not plain columns. The Admin UI for managing
  credentials should allow replacement but never display existing values.
  Not design work for v1, flagged for future implementation.
- Password resets are handled by Supabase's self-service flow (user clicks
  "forgot password" on login page, receives email, sets new password).
  Admin is not in that loop for normal cases. Admin intervention for
  password/account issues lives one click deep on the user detail page
  (force reset, deactivate, unlock, change email) — too rare to warrant
  a quick action.
- "Recent activity" and "Audit trail" use per-row attribution columns
  rather than a central audit_log table. This captures inserts and
  updates on attributed tables but does not capture logins, reads, or
  deletes. If those event types become needed (or if UNION query
  performance becomes a problem at scale), a dedicated audit_log table
  is the upgrade path. Defer until needed.
- Audit-trail view in this hat is for reading, not bulk export or
  analysis. Bulk analysis goes to the dashboard.
- "Needs my attention" home section was considered for v1 and deferred —
  most candidate items (suspicious-account flagging, hat-assignment
  requests as a workflow, audit anomalies) don't exist yet. Section can
  be added later when those features ship.
- Successor test for the home screen: a backup admin should land here and
  within 30 seconds know whether anything is broken and what's happened
  recently. The two home sections are designed to pass that test.

DATA MODEL DEPENDENCIES
───────────────────────
Admin reads existing tables; doesn't introduce new ones in v1.

- profiles (existing) — read for user list, hat assignments.
- Per-row attribution columns on 18 tables (existing, added in security
  phase 3) — created_by, updated_by, created_at, updated_at. Read via
  UNION views for "Recent activity" and "Audit trail" surfaces. No
  central audit_log table exists; design uses what's there.

No new tables required for v1. Future features (credential storage,
suspicious-account flagging, hat-assignment workflow) will need new
tables or columns when built. Defer until needed.

CROSS-HAT WORKFLOW DEPENDENCIES
───────────────────────────────
None. Admin operates on the system, not on parish workflows. No lockstep
design needed with other hats.

═══════════════════════════════════════════════════════════════════════════

PLANNED FEATURES
════════════════

Cross-cutting feature wishlist that informs hat design but doesn't fit
inside any single hat. Each entry: name, problem, future shape, ambition
levels, hat ownership.

Communications workflow — multi-channel publishing
──────────────────────────────────────────────────
Problem: St. Francis publishes announcements to three channels — weekly
bulletin, electronic message board, parish website. Currently lacks
coordination; items frequently get published to one channel and missed on
others.

Future shape: announcement objects as a single source of truth, with
publishing status per channel.

Three levels of ambition:
- Basic tracking with manual checkboxes.
- Coordination dashboard surfacing gaps.
- Automated publishing where channels derive from tagged announcement records.

Hat ownership: primarily Communications hat; visible to Office Manager.

Time off requests
─────────────────
Feature does not exist yet.

Hat ownership: Janitor.

Mass Intentions
───────────────
Logging stipend-paid masses, assigning to specific masses on calendar.

Hat ownership: Office Manager.

Clergy categorization in data model + unified clergy calendar view
──────────────────────────────────────────────────────────────────
Pastor/Parochial Vicar/Deacon as a category.

Hat ownership: Office Manager.

Per-sacrament prep checklists
─────────────────────────────
Each sacrament sub-item may need its own prep workflow.

Hat ownership: Office Manager.

Project approval workflow
─────────────────────────
Facility Manager recommends → Business Manager approves → Pastor approves
→ Diocese gate at ≥$35K.

Hat ownership: Pastor / Business Manager / Facility Manager.

═══════════════════════════════════════════════════════════════════════════

DESIGN PROCESS NOTES
════════════════════

Cross-session observations about how upcoming hat designs should be
sequenced or coordinated. Each entry is a planning concern, not a runtime
feature.

Project approval workflow design dependency
───────────────────────────────────────────
Pastor, Business Manager, and Facility Manager hats all participate in
the project approval workflow (FM recommends → BM approves → Pastor
approves → Diocese gate at ≥$35K). Each hat's "pending my approval" home
surface and any approval-related quick actions need to be designed in
lockstep across the three to avoid inconsistent handoff semantics.
Recommended approach for next session(s): design these three hats as a
connected cluster, or design Pastor solo with explicit placeholders for
the approval surface that get reconciled when BM and FM are designed.
