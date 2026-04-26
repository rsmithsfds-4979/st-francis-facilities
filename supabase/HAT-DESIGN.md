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
and so future contributors (or future you) can see what foundational
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

Who wears this hat: Worn by the IT Director. Designed so a
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
  another hat — the IT Director also wears Facility Manager, so this is
  solved by hat switching rather than by surfacing operations data here.
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

ACCOUNTANT HAT
══════════════

Philosophy: Outside-reviewer hat in the current St. Francis context.
Accounting itself happens in QuickBooks Desktop, not in this app. The
Accountant's role here is read-only visibility into facility spending
for context when reconciling books. Thin by design — a parish accounting
hat in a facilities-leaning parish management app should not pretend to
be a full accounting tool. Real accounting work belongs in the
accounting system.

v1 SHIPPING NOTE: Most of this hat's substantive surfaces depend on
facility expense tracking, which does not yet exist. Accountant hat
ships meaningfully only when that foundation is built. Until then, the
hat is documented in this file but has minimal real UI. This is not a
failure mode; it is honest scoping per ARCHITECTURAL COMMITMENTS.

Who wears this hat: Currently an outside accountant who comes in every
2 weeks to do bookkeeping. Situation is in flux — Business Manager
intends to take over daily bookkeeping. This design reflects the current
state and is likely to be revised when that organizational change
resolves. A SaaS variant for parishes with internal staff accountants
would be a different design (data entry, approval workflow involvement,
deeper integration) and is not captured here.

HOME SCREEN
───────────
v1 ships one section. Second section is documented but deferred per
ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN — will not appear in
the UI until underlying state-tracking exists.

- Recent facility spending — Summary of facility-related expenses since
  last review (default: last 14 days, matching the every-2-weeks review
  cadence). Total spend, count of transactions, top vendors, top
  categories. Glance-and-go. Ships when facility expense tracking
  exists; until then, this section is not rendered (per NO UI THEATRE).
- Pending items needing attention — DEFERRED, not built in v1. Requires
  state machines on facility expense tracking, vendor records, and
  invoice processing — none of which exist yet. Section is documented
  in this design as the intended future surface; will be built when
  underlying state-tracking exists. No empty-state placeholder shipped
  — per NO UI THEATRE, sections without real backing data are not in
  the UI.

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
v1 ships one button. Second button is documented but deferred — per
NO UI THEATRE, a button that does not actually export is not in the UI.
The action ships when facility expense tracking exists and an export
format is designed.

- View facility expenses — Jump to facility expense list with default
  filter set to current review period. Ships when facility expense
  tracking exists; not rendered until then.
- Export for QuickBooks — DEFERRED, not built in v1. Intended as the
  second quick action when facility expense tracking exists and an
  export format is designed. Format TBD; depends on what expense
  tracking captures and what QuickBooks Desktop can ingest.

NAV ITEMS (sidebar)
───────────────────
v1 nav is intentionally thin. Most nav items depend on data that does
not yet exist and are deferred per ARCHITECTURAL COMMITMENTS.

- Home
- Facility expenses — DEFERRED until facility expense tracking exists.
  When built: read-only list of facility-related spending, filterable
  by date, vendor, category, project. Drill-down to individual work
  order, contractor invoice, or vendor record.
- Project approvals — Read-only view of approved projects and their
  associated spending. Contextual reference; Accountant is not in the
  approval chain. Ships when project approval workflow ships (cross-hat
  dependency, see below).
- Reports — DEFERRED. Pre-canned reports useful for accounting context
  (spend by category, spend by vendor, project-vs-budget where budgets
  exist). Depends on facility expense tracking and project records
  being substantive.

NOTES
─────
- This hat's design follows ARCHITECTURAL COMMITMENTS / STATE-DRIVEN
  DESIGN. Surfaces that require state machines (Pending items, vendor
  flags, invoice processing) are deferred until the underlying
  state-tracking exists. Per NO UI THEATRE, deferred surfaces are not
  in the v1 UI — not as empty states, not as "coming soon" stubs. They
  are documented in this file and built later when foundations exist.
- This hat is a placeholder shaped by current organizational
  uncertainty. The Business Manager intends to take over daily
  bookkeeping. If that happens, the outside accountant may not need a
  login to this app at all — they would work entirely from QuickBooks.
  If it does not happen, this design is roughly right but should be
  revisited based on actual usage patterns.
- This hat is intentionally thin. Accounting work happens in QuickBooks
  Desktop. This app provides facility-spending visibility for context,
  not full accounting functionality. Resist the urge to expand this hat
  into a general-ledger replacement — that is a different product.
- Accountant is not in the project approval workflow. The chain is
  Facility Manager recommends → Business Manager approves → Pastor
  approves → Diocese gate at ≥$35K. Accountant sees approved projects
  after the fact for context, but does not approve.
- Day-to-day repair spending (small, no contractor, no signature
  needed) and project-level spending (contractor involved, signed
  agreement) both flow into the books. Accountant views should show
  both, distinguished where useful. Spending split confirmed during
  HAT-DESIGN session — Business Manager approves project spending;
  day-to-day repairs do not require approval. Trigger for approval is
  qualitative (contractor + signature), not a strict dollar threshold
  on the low end.
- A SaaS variant of this hat for parishes with internal staff
  accountants is a known different design. Staff accountants would do
  data entry, may be in approval chains, and would integrate more
  deeply with the parish's accounting system. Not captured here.
  Documented for SaaS-future reference.
- Successor test: an outside accountant or a future internal accountant
  should be able to land on this home screen, when it exists, and
  within 60 seconds know what has been spent recently and whether
  anything needs their attention before they start reconciling. v1 home
  — when it ships — will pass this test for the "what has been spent"
  half; the "needs attention" half ships when state-tracking exists.

DATA MODEL DEPENDENCIES
───────────────────────
This hat reads facility expense data that does not currently exist in
the app. Most of this hat's value is contingent on building that
tracking first. Per ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN,
the dependent tables must include explicit state machines, not just
data columns.

- profiles (existing) — read for vendor and contractor records if those
  are stored in profiles, or via separate vendor/contractor tables if
  those exist. Schema TBD.
- Facility expense tracking (does not exist) — work order costs, vendor
  invoices, contractor payments, parts purchases. Needs schema design
  and implementation before this hat has substantive data to display.
  Must include state columns (e.g., invoice status: received / approved
  / paid / void; vendor record status: new / active / deactivated /
  needs_review).
- Project records (partially exist) — approved projects with cost
  fields. Read-only access for the Project Approvals nav item. Project
  state machine designed in lockstep with project approval workflow.

No new tables required for this hat itself; this hat depends on tables
that other features will introduce.

CROSS-HAT WORKFLOW DEPENDENCIES
───────────────────────────────
- Business Manager evolving role — if BM takes over daily bookkeeping,
  this hat's purpose changes significantly. Design must be revisited in
  lockstep with BM hat design and the resolution of the bookkeeping
  organizational question.
- Project approval workflow — this hat reads from the workflow but does
  not participate. Designed in lockstep with Pastor, Business Manager,
  and Facility Manager hats around the project approval chain.
- Facility expense tracking feature — this hat is largely empty until
  that feature exists. Design coordination needed when expense tracking
  is built. Per STATE-DRIVEN DESIGN, expense tracking schema must
  include state machines from the start, not bolted on later.

═══════════════════════════════════════════════════════════════════════════

DIRECTOR OF MUSIC HAT
═════════════════════

Philosophy: Combined music + liturgy role at St. Francis. The Director
of Music plans liturgies, schedules ministers, plays at Mass, and meets
with families for sacramental events. At larger parishes this role
could split into Music Director (music specifically) and Liturgical
Director (broader liturgy planning); at St. Francis it is one person
wearing one hat. The original 14-hat sketch listed "Music Director" and
"Liturgical Director" separately; this hat consolidates both into the
actual parish title — Director of Music. A separate Liturgical Director
hat is not designed; it would be a future split if/when the parish
grows.

v1 SHIPPING NOTE: This is a foundation-dependent hat. Most substantive
surfaces depend on the Liturgical calendar feature, the Pastor
directives feature, minister scheduling tables, and the family-meeting
coordination workflow — none of which exist yet. The hat is documented
in this file but ships meaningfully only as those foundations are
built. Per ARCHITECTURAL COMMITMENTS, deferred surfaces are not in the
v1 UI. This is honest scoping for the busiest non-existent hat in the
design.

Who wears this hat: At St. Francis, the Director of Music. One person,
combined music + liturgy responsibility. Plays organ/piano at Masses
personally; coordinates substitutes when unable to play. Meets with
families for funerals and weddings to plan music, readings, and
liturgical elements. Coordinates with Pastor on liturgy planning;
executes liturgy plans the Pastor directs (typically during staff
meetings — see Pastor directives planned feature).

HOME SCREEN
───────────
Three sections planned. v1 ships none of them — all three depend on
foundations that do not yet exist. Per ARCHITECTURAL COMMITMENTS / NO
UI THEATRE, sections without real backing data are not in the UI.

- Upcoming liturgies — Next 7-14 days of Masses, special liturgies,
  and sacramental events. For each: minister assignments, music
  selections, readings, any pending decisions. DEFERRED until the
  Liturgical calendar feature and minister scheduling tables exist.
- Pastor directives assigned to me — Outstanding directives the Pastor
  has assigned to the Director of Music. State machine tracks proposed
  / accepted / in-progress / complete / missed. This section is the
  direct fix for the "missed events because nothing is written down"
  problem. DEFERRED until Pastor directives feature is built (basic
  ambition level).
- Upcoming family meetings — Funerals, weddings, baptisms requiring a
  family meeting with the Director of Music. Date, family contact,
  what needs to be planned, current state. DEFERRED until family
  meeting coordination workflow exists (cross-hat, designed in
  lockstep with Office Manager and Pastor).

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
v1 ships none. All planned actions depend on foundations not yet built.
Per NO UI THEATRE, quick actions whose underlying data does not exist
are not in the UI.

- Schedule ministers for upcoming Mass — Open the scheduling surface
  for the next Mass needing assignments. DEFERRED until minister
  scheduling tables exist.
- Find a sub — Mark a Mass as needing a substitute musician;
  notification path to known subs. DEFERRED until minister scheduling
  and sub-coordination data exist.
- Plan an upcoming liturgy — Open liturgy planning for a specific Mass
  or event (readings, music, special prayers). DEFERRED until liturgy
  planning surfaces exist.
- Log family meeting outcomes — After meeting with a family, capture
  music/readings/liturgical selections. DEFERRED until family meeting
  coordination workflow exists.

NAV ITEMS (sidebar)
───────────────────
v1 nav is intentionally thin until foundations exist.

- Home
- Liturgical calendar — DEFERRED until Liturgical calendar feature
  exists. When built: read-only view of the parish liturgical year
  with feasts, Holy Days, special seasons, and any parish-specific
  events. Director of Music reads heavily; does not own the data
  (Office Manager does).
- Minister scheduling — DEFERRED until minister scheduling tables
  exist. When built: schedule and reschedule lectors, EMs, altar
  servers, choir, musicians for specific Masses. Sub coordination.
  Recurring assignments (e.g., "Smith family on the 1st Sunday of the
  month").
- Liturgy planning — DEFERRED. When built: per-Mass and per-event
  planning of readings, music, special prayers, environment. Reads
  from Liturgical calendar; writes plans tied to specific dates.
- Family meetings — DEFERRED until family meeting coordination
  workflow exists. When built: list of upcoming and recent family
  meetings, with planning state and outcomes captured.
- Mass intentions — Read-only view of intentions assigned to upcoming
  Masses. Director of Music does not own this data (Office Manager
  does, with Business Manager as backup), but reads it for context
  when planning Masses.

NOTES
─────
- This hat consolidates Music Director and Liturgical Director from
  the original 14-hat sketch into the actual parish role at St.
  Francis. The original separate Liturgical Director hat is not
  designed — at parishes where the role splits, a future Liturgical
  Director hat could be designed by extracting the non-music surfaces
  from this one.
- The Director of Music plays at Mass personally. This means their
  schedule has dual nature: "I'm playing at this Mass" and "I need a
  sub for this Mass." Sub coordination is a real workflow, not a side
  note. When minister scheduling is designed, the Director of Music's
  own playing schedule and their need-a-sub flow must both be
  first-class concerns.
- The "missed events" problem (events forgotten because Pastor
  directives are verbal-only) is the direct motivation for the Pastor
  directives planned feature. The "Pastor directives assigned to me"
  home section is the surface where this hat benefits from that
  feature most. Without state-driven directives, this hat is missing
  the single biggest workflow it needs.
- The Pastor directs liturgy planning. Director of Music executes what
  the Pastor has directed; does not act autonomously on major
  liturgical decisions. The hat's home screen is therefore organized
  around "what has the Pastor asked me to do" (directives) and "what
  is coming up that needs prep" (liturgies, family meetings), rather
  than "what shall I autonomously plan." This is a design consequence
  of how the role actually works at St. Francis.
- Funeral and wedding workflow: Office Manager sets the date →
  Director of Music meets with family (music, readings, liturgical
  selections) → Pastor meets with family (always for funerals;
  sometimes for weddings). This is a sequenced cross-hat workflow.
  Captured in CROSS-HAT WORKFLOW DEPENDENCIES below; full design
  deferred until lockstep design with Office Manager and Pastor.
- Per-sacrament prep checklists (a separate planned feature) will
  surface here when built — Director of Music's checklist items for
  each sacrament prep type. Today, prep is informal.
- Mass intentions are owned by Office Manager (with Business Manager
  backup). Director of Music reads but does not write.
- Successor test: if this hat were fully built, a new Director of
  Music joining the parish should be able to land on this home screen
  and within their first week understand: what's coming up
  liturgically, what the Pastor has asked them to do, what ministers
  are assigned (and where gaps are), what family meetings are pending.
  That test cannot pass in v1; it is the bar for the hat being "built"
  rather than just "designed."

DATA MODEL DEPENDENCIES
───────────────────────
This hat is foundation-heavy. Most of its substantive data does not
yet exist. Per ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN, all
workflow tables built to support this hat must include explicit state
machines.

- profiles (existing) — read for minister and musician records, family
  contact info.
- Liturgical calendar (does not exist; planned feature) — read for
  feasts, Holy Days, seasons, parish-specific liturgical events.
  Reference data, not workflow data.
- Pastor directives (does not exist; planned feature) — workflow data
  with explicit state. Read for "directives assigned to me" surfaces;
  writes via state transitions (accepting, completing).
- Minister scheduling tables (do not exist) — assignment of specific
  ministers to specific Masses. Must include state (proposed,
  confirmed, declined, sub-needed, sub-confirmed). Recurring
  assignments. Sub coordination data.
- Liturgy planning records (do not exist) — readings, music, special
  prayers per Mass or event. State (draft, finalized).
- Family meeting records (do not exist; cross-hat with Office Manager
  and Pastor) — funeral/wedding/baptism family meetings, selections
  made, state of planning.
- Mass intentions table (does not exist; planned feature, owned by
  Office Manager) — read-only access from this hat.

CROSS-HAT WORKFLOW DEPENDENCIES
───────────────────────────────
This hat participates in multiple cross-hat workflows. Each must be
designed in lockstep with the participating hats; not designed in
isolation here.

- Funeral coordination workflow — Office Manager intake → Director of
  Music family meeting (music, readings, selections) → Pastor family
  meeting → Facility Manager (reception space if needed) →
  Communications (announcements) → Volunteer recruitment (reception
  volunteers, ushers). Same pattern noted in Volunteer hat. Designed
  in lockstep with all participating hats.
- Wedding coordination workflow — similar shape; Pastor meeting may
  or may not happen depending on circumstances.
- Baptism prep workflow — Director of Music meets with families;
  Pastor performs sacrament. Designed in lockstep with Pastor and
  per-sacrament prep checklists feature.
- Pastor directives workflow — Pastor creates directives; Director of
  Music receives, accepts, executes, completes. Designed in lockstep
  with Pastor hat. State machine for directives is the primary
  workflow this hat depends on.
- Liturgy planning at the Pastor's direction — Pastor directs during
  staff meetings; Director of Music plans. Workflow lives partly in
  directives, partly in liturgy planning records. Designed in
  lockstep with Pastor hat.
- Mass intentions assignment — Office Manager assigns intentions to
  specific Masses; Director of Music reads for liturgy planning
  context. Light cross-hat dependency; primarily Office Manager's
  workflow.

═══════════════════════════════════════════════════════════════════════════

COMMUNICATIONS HAT
══════════════════

Philosophy: Coordinate parish-wide communications across channels to
prevent the failure modes the parish currently experiences — items
published to some channels and missed on others, duplicate emails,
unauthorized announcements going out without leadership awareness, and
content that staff first learn about when parishioners ask them. The
hat is per-channel-scoped: a person wears Communications for the
specific channel(s) they manage, with cross-channel coordination
visibility and triage authority for everyone wearing the hat. Multiple
people wear this hat today, each scoped to their channels.

v1 SHIPPING NOTE: This hat depends on the Communications workflow
planned feature (announcement objects with state machine, request
intake, channel-specific queues, coordination dashboard) being built.
The PLANNED FEATURES entry for that workflow will be updated after
this hat is committed to reflect the fuller design captured here.
Until the workflow ships, the hat is documented but not active. Per
ARCHITECTURAL COMMITMENTS, deferred surfaces are not in the v1 UI.

Who wears this hat: At St. Francis, three roles wear Communications,
each scoped to the channel(s) they manage:

- IT Director — wears Communications for the parish website.
- Office Manager — wears Communications for social media and the
  electronic message board.
- RE Admin — wears Communications for the weekly bulletin and the
  email newsletter.

The hat is layered onto a primary hat via active_hat switching.
Channel ownership is data, not a separate hat — same precedent as
Volunteer, where ministry/group leadership is data-driven and the
home screen adapts.

Email newsletter has a known shared-ownership problem at St. Francis:
RE Admin owns it, but Office Manager sometimes sends independently,
producing duplicate parishioner emails. The Communications workflow
is intended to surface and prevent this; the design assumes RE Admin
is primary owner and Office Manager's independent sends are a
behavior pattern the workflow will replace.

HOME SCREEN
───────────
Three sections, conditionally shown based on the channels the person
manages and their hat-level role.

- My channel queue — Announcements assigned to channels I manage, by
  status: pending publication (scheduled), needs-my-attention (drafts
  assigned to me, conflicts to resolve), recently published. Per
  channel: separate sub-list. A Communications hat wearer who manages
  two channels sees two sub-lists. DEFERRED until Communications
  workflow ships.
- Triage queue — All open communication requests across the parish
  awaiting Communications review. Visible to all Communications hat
  wearers regardless of channel scope (cross-channel coordination is
  everyone's responsibility). For each request: requester, what they
  want announced, suggested channels, current status, age. Triage
  actions: edit content, adjust channel mix, approve and schedule,
  reject with reason, combine with related request, return to
  requester for revision. DEFERRED until Communications workflow
  ships.
- Recent cross-channel activity — Last 14 days of announcements
  published, by channel. Surfaces "what went out where" for
  situational awareness across Communications hat wearers. DEFERRED
  until Communications workflow ships.

QUICK ACTIONS (primary buttons on home)
───────────────────────────────────────
Adaptive set, capped at 4 visible. The system picks based on the
person's channel scope and current queue state.

- Triage next request — Open the oldest untriaged communication
  request. Most common Communications hat task. DEFERRED until
  Communications workflow ships.
- Publish next scheduled item — For the channel I manage, mark the
  next scheduled announcement as published. DEFERRED.
- Create announcement directly — For routine items that don't need
  triage (e.g., recurring Mass-time reminders), Communications hat
  wearers can create an announcement bypassing the request stage.
  This is a Communications-only capability; non-Communications staff
  must use the request workflow. DEFERRED.
- Search announcements — Find a past or pending announcement by
  topic, requester, or channel. DEFERRED.

NAV ITEMS (sidebar)
───────────────────
- Home
- Triage queue — Full triage surface for all open requests. Same data
  as home, with filtering by channel, requester, age, status.
- My channels — Per-channel publication queues and history. Adaptive
  list based on which channels the person manages.
- All announcements — Searchable archive of all announcements across
  all channels. Read-only history for context.
- Communication requests — All requests (open, closed, rejected) with
  full state history. Audit trail for "who requested what, who
  approved or rejected, when did it publish."

NOTES
─────
- The triage step exists primarily as a parish-wide visibility
  mechanism, not as editorial polish. The core problem is that staff
  are surprised by what gets published — they learn about
  announcements when parishioners mention them. The triage queue
  surfaces pending publications to leadership-level hats (read-only)
  and to all Communications hat wearers (with action authority),
  building the shared awareness that is currently missing.
- The triage queue also makes "the Pastor said it was okay"
  auditable. When a parishioner submits a request claiming Pastor
  approval, the request shows the actual requester. The Pastor sees
  the request on his home screen (read-only with reject authority);
  if he never approved it, he can reject. Verbal claims become
  checkable records.
- Pastor has reject authority on the queue — not approval, not edit,
  just reject with reason. Communications hat wearers do the
  approval/edit work. This separation matters: Pastor is not
  expected to manage communications; he is expected to be able to
  intervene when something is wrong.
- Leadership-level read-only viewers of the triage queue: Pastor
  (with reject), Parochial Vicar, Business Manager, Director of
  Music, RE Director. Other hats (Deacon, Youth Minister, Facility
  Manager, Janitor, Volunteer, Admin, Accountant) do not see the
  queue — it is not relevant to their work and adds noise without
  value.
- Anyone with a staff hat can create a communication request. The
  request becomes an announcement object only after Communications
  triage. This is the two-stage workflow: anyone can request;
  Communications triages and publishes. Requesters see their own
  requests' status on their primary hat's home screen ("my
  outstanding communication requests") regardless of which hat that
  is.
- Communications hat wearers can create announcements directly,
  bypassing the request stage, for routine items. This is a
  capability of the hat, not a permission specific to certain
  people. Acceptable use: recurring reminders, time-sensitive items
  with no editorial concern. Misuse risk: bypass becomes the norm
  and the visibility benefit is lost. Operational discipline matters
  more than UI enforcement.
- Per-channel scoping works the same way as Volunteer's per-ministry
  scoping. Channel ownership is data on the user record (or on a
  channel_managers table); the hat's home screen and quick actions
  adapt to what channels the person manages. A future Communications
  Director hat wearer who manages all channels would see all
  per-channel queues; today nobody does.
- Email newsletter shared ownership is a known data-quality problem
  the workflow is designed to address. Before the workflow ships,
  the parish will continue having occasional duplicate emails. The
  workflow does not solve the problem by adding restrictions; it
  solves it by making "Office Manager is about to send an email"
  visible to RE Admin (and vice versa) so they coordinate.
- Channel manager assignments are managed by Admin via the "Hats and
  permissions" nav item. Personnel changes (e.g., IT Director hands
  off website management to Office Manager) are reflected in the
  channel_managers table; the Communications hat home screen adapts
  automatically based on that data. Reassignment is intentionally an
  Admin function — same surface that manages hat assignments — to
  keep authority changes auditable. Self-service handoff or Pastor
  override could be added later if needed; Admin-only is the v1
  model.
- Successor test: a new Communications hat wearer joining the parish
  (e.g., a Communications Director if the role is ever created)
  should land on this home screen and within their first week
  understand: what's pending across all channels, what recently went
  out, who requests communications and how often, where coordination
  gaps are happening. That test is the bar for the hat being "built"
  rather than just designed.

DATA MODEL DEPENDENCIES
───────────────────────
This hat depends on the Communications workflow infrastructure being
built. Per ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN, all
workflow tables include explicit state machines.

- profiles (existing) — read for requester names, channel manager
  identification.
- communication_requests (does not exist) — created by any staff
  hat. State: submitted / under-review / approved-as-announcement /
  rejected / returned-to-requester. Tracks who requested, what was
  requested, suggested channels, audience.
- announcements (does not exist) — created from approved requests
  (or directly by Communications hat). State: draft / scheduled /
  published / archived. Per-channel publishing status.
- channel_publications (does not exist) — link table tying an
  announcement to specific channels with per-channel state
  (scheduled / published / failed / not-applicable). Allows the same
  announcement to track independent state on bulletin vs. email vs.
  social.
- channel_managers (does not exist) — link table identifying which
  staff member manages which channels. Drives the adaptive home
  screen and triage authority. Reference data, not workflow data.
- Pastor directives (does not exist; planned feature) — light
  cross-reference. A Pastor directive might say "announce X" which
  could optionally generate a communication request automatically.
  Cross-feature coordination, not strict dependency.

CROSS-HAT WORKFLOW DEPENDENCIES
───────────────────────────────
- Communication request lifecycle — any staff hat creates a request;
  Communications triages; channels publish; requester tracks status
  on their home screen. State machine spans creation through
  publication. Designed in lockstep with all hats that can create
  requests (effectively all staff hats).
- Pastor reject authority — Pastor sees triage queue read-only with
  reject capability. Designed in lockstep with Pastor hat.
- Leadership-level visibility — Parochial Vicar, Business Manager,
  Director of Music, RE Director see triage queue read-only.
  Designed in lockstep with each of those hats; the visibility
  surface is the same per hat, just rendered on their home screen.
- Funeral and wedding workflows — funerals and weddings often
  trigger announcements (death notice, wedding announcement,
  reception volunteer recruitment). The funeral coordination
  workflow generates communication requests automatically when
  appropriate. Designed in lockstep with Office Manager (intake),
  Director of Music (family meeting), and Pastor (family meeting).
- Pastor directives generating requests — when the Pastor creates a
  directive that requires public announcement (e.g., "announce the
  parish picnic"), the directive system can optionally generate a
  communication request to the Communications hat. Light coupling;
  designed in lockstep with Pastor directives feature when that
  ships.

═══════════════════════════════════════════════════════════════════════════

PLANNED FEATURES
════════════════

Cross-cutting feature wishlist that informs hat design but doesn't fit
inside any single hat. Each entry: name, problem, future shape, ambition
levels, hat ownership.

Communications workflow — multi-channel publishing with triage
──────────────────────────────────────────────────────────────
Problem: St. Francis publishes announcements to five channels — parish
website, social media, electronic message board, weekly bulletin, and
email newsletter — each managed by different roles (IT Director, Office
Manager, Office Manager, RE Admin, RE Admin respectively). Currently
lacks coordination across channels and across requesters. Three
specific failure modes occur today:

- Items published to one channel and missed on others (e.g., bulletin
  announcement never makes it to social media or website).
- Duplicate publications (e.g., RE Admin and Office Manager both send
  overlapping email newsletters; parishioners receive the same message
  twice).
- Surprise publications — staff first learn about announcements when
  parishioners ask them, because requests routed through informal
  one-on-one conversations rather than a coordinated intake. Some of
  these are unauthorized: parishioners occasionally try to slip
  content through by claiming Pastor approval that wasn't given.

Future shape: A two-stage state-driven workflow. Anyone with a staff
hat creates a "communication request" describing what should be
announced and which channels are appropriate. Communications hat
wearers (per-channel-scoped: IT Director for website, Office Manager
for social/message board, RE Admin for bulletin/newsletter) see all
open requests in a triage queue. Triage actions: edit content, adjust
channel mix, approve and convert to announcement (which then enters
channel-specific publishing queues), reject with reason, return to
requester for revision, or combine with related requests. Approved
announcements track per-channel publishing state independently
(scheduled / published / failed / not-applicable).

Visibility layer: leadership-level hats (Pastor, Parochial Vicar,
Business Manager, Director of Music, RE Director) see the triage
queue read-only for parish-wide situational awareness — the fix for
"staff are surprised by what gets published." Pastor specifically
has reject authority — not approval, not edit, just reject — to
intervene when a request is unauthorized. Other hats (Deacon, Youth
Minister, Facility Manager, Janitor, Volunteer, Admin, Accountant)
do not see the triage queue. Requesters see their own requests'
status on their primary hat's home screen regardless of which hat
that is.

Three levels of ambition:

- Basic: communication_requests and announcements tables with
  explicit state, triage queue surface, per-channel publishing
  state, Pastor reject authority, leadership-level read-only
  visibility, requester status on home screens. This is the v1
  shipping target — minimum viable that fixes all three failure
  modes by making pending publications visible.
- Coordinated: notifications when triage backlog grows, channel
  manager workload balancing, recurring announcement templates
  (Mass times, weekly events) that auto-create scheduled
  announcements without per-instance triage.
- Integrated: external publishing automation where approved
  announcements push directly to channel platforms (website CMS,
  social media APIs, email service, bulletin layout). Substantially
  reduces channel manager publishing workload but introduces
  dependencies on external service integrations — design and
  reliability concerns.

Hat ownership: Communications hat is per-channel-scoped — three
roles wear it today (IT Director, Office Manager, RE Admin) each
covering different channels. Pastor has reject authority on the
triage queue. Leadership-level hats have read-only triage
visibility. Anyone with a staff hat can create requests. Channel
manager assignments are managed by Admin via the "Hats and
permissions" surface; reassignment is intentionally an Admin
function (not self-service) to keep authority changes auditable.

Time off requests
─────────────────
Feature does not exist yet.

Hat ownership: Janitor.

Mass Intentions
───────────────
Logging stipend-paid masses, assigning to specific masses on calendar.

Hat ownership: Office Manager (primary), Business Manager (backup when Office Manager is out).

Clergy categorization in data model + unified clergy calendar view
──────────────────────────────────────────────────────────────────
Pastor/Parochial Vicar/Deacon as a category.

Hat ownership: Office Manager.

Per-sacrament prep checklists
─────────────────────────────
Problem: Sacramental preparation at St. Francis is informal — different
sacraments are prepped by different staff, and there is no shared
record of what prep needs to happen, who is doing what, or whether
prep is complete before the sacrament is scheduled. Without a checklist
artifact, prep state lives in the heads of the people involved.

Future shape: Per-sacrament checklists with explicit items and
completion state. Each sacrament has its own checklist template
because the prep work differs substantially across sacraments. The
checklist surfaces in the home screen of the relevant prep owner(s)
for each sacrament.

Three levels of ambition:

- Basic: a checklist template per sacrament with items and state
  (not-started / in-progress / complete). Surfaces on relevant hat
  home screens. Manual progression.
- Coordinated: prep checklists tie into the family meeting workflow
  (e.g., baptism family meeting with Director of Music auto-creates
  the music-selection checklist item). Prep state visible to all
  hats involved in that sacrament's workflow.
- Integrated: family-facing surface where families see their own
  prep progress (what's done, what's pending). Notifications when
  prep is overdue relative to scheduled sacrament date.

Hat ownership: Varies per sacrament.

- Baptism — Office Manager (intake/scheduling), Director of Music
  (family meeting for music/readings), Pastor or Deacon (celebrant).
- First Reconciliation / First Communion / Confirmation — RE
  Director (program oversight, curriculum), RE Admin (scheduling,
  individual student tracking, family communication), Pastor
  (celebrant).
- RCIA — RE Director (program oversight), Pastor (instruction and
  sacraments).
- Marriage — Office Manager (intake/scheduling), Director of Music
  (family meeting for music), Pastor (marriage prep program,
  celebrant).
- Anointing of the Sick — Pastor or Deacon (administered as needed,
  often without scheduled prep), Office Manager (logging if
  scheduled).
- Funerals — Office Manager (intake), Director of Music (family
  meeting for music/readings), Pastor (family meeting and
  celebrant).

The broader sacramental coordination workflows (multi-hat sequencing
for baptism, marriage, funerals, etc.) are captured in the relevant
hats' CROSS-HAT WORKFLOW DEPENDENCIES sections. This PLANNED FEATURES
entry covers the prep-checklist artifact specifically; the
coordination flow is a separate (but related) design concern.

Project approval workflow
─────────────────────────
Facility Manager recommends → Business Manager approves → Pastor approves
→ Diocese gate at ≥$35K.

Hat ownership: Pastor / Business Manager / Facility Manager.

Liturgical calendar
───────────────────
Problem: Catholic parishes operate on a complex annual liturgical
calendar that combines fixed dates (Christmas, Immaculate Conception),
movable feasts whose dates shift each year (Easter, Ascension,
Pentecost, Holy Week), and US-specific Holy Day of Obligation rules
including obligation-lifting when certain feasts fall on a Saturday.
Today this knowledge lives in staff heads (primarily Director of Music,
Pastor, Office Manager). When something is forgotten or miscommunicated,
events are missed. The app currently has no shared system of record for
the liturgical year.

Future shape: A liturgical calendar service or table that knows fixed
feasts, calculates movable feasts per year, encodes US Holy Days of
Obligation with conditional rules (e.g., obligation lifted if feast
falls on Saturday), and supports parish-level overrides. Other features
(Mass scheduling, minister scheduling, communications, sacrament prep,
Pastor directives) read from this calendar rather than each
re-implementing date logic.

Three levels of ambition:
- Basic: a static table seeded each year with that year's dates;
  manually maintained by Admin or Office Manager. Low effort, prone to
  drift if nobody remembers to update it.
- Calculated: programmatic calculation of movable feasts (Easter
  computus, dependent feasts) so the calendar populates automatically
  for any given year. Holy Day obligation rules encoded as data.
- Integrated: calendar drives downstream features automatically. New
  parishioner-facing surfaces (e.g., upcoming Holy Days widget) read
  from the same source. Diocesan or USCCB feed integration if such
  feeds become available.

Hat ownership: Office Manager owns day-to-day calendar maintenance;
Admin owns the underlying data structure and any seeding scripts.
Director of Music, Pastor, Communications, and Office Manager all read
from it. Per ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN: the
liturgical calendar is reference data, not workflow data, so it does
not need state machines itself — but features that use it (Pastor
directives tracked against Holy Days, sacrament prep scheduled around
liturgical seasons) do.

Pastor directives — written record of liturgical and operational planning
─────────────────────────────────────────────────────────────────────────
Problem: At St. Francis, the Pastor directs liturgical and operational
planning verbally during staff meetings. Nothing is written down. The
parish has missed events as a direct result — someone forgets they were
asked to handle something, or the assignment is unclear, or the
deadline drifts. This is the core failure mode the app is intended to
address.

Future shape: A directive object created by the Pastor (or by Office
Manager / staff member with Pastor as creator) that captures: what
needs to happen, who is responsible, when it is due, current state.
Directives can be created ad hoc or generated from staff meetings. Each
directive is assigned to one or more hats and surfaces on the
assignees' home screens via "needs my attention" surfaces. State
machine tracks the directive lifecycle (proposed / accepted /
in-progress / complete / missed). Missed directives are visible — the
problem ("nothing is written down, things get missed") becomes
diagnosable rather than invisible.

Three levels of ambition:
- Basic: a simple directives table with assignment, due date, and
  status. Manual entry by whoever was at the meeting. Visible to the
  assigned hat on their home screen. Most of the value of this feature
  is in the basic level — even a written list of who-owes-what-by-when
  is a major improvement over verbal-only.
- Coordinated: directives can be created from a "staff meeting" context
  with multiple directives captured at once. Notifications to
  assignees. Recurring directives (e.g., "plan Holy Week" every year,
  due 60 days before Holy Thursday) tied to the liturgical calendar.
- Integrated: directives feed into other planning surfaces
  automatically. Pastor's home screen shows a dashboard of all
  outstanding directives across hats. Diocese-required deadlines
  (sacramental records, financial reports) surface as standing
  directives.

Hat ownership: Pastor creates directives (primary owner); any assigned
hat sees their own directives on their home screen. Office Manager may
create directives on the Pastor's behalf when capturing staff-meeting
outcomes. Per ARCHITECTURAL COMMITMENTS / STATE-DRIVEN DESIGN:
directives are workflow data with explicit state. The directives table
is the canonical example of why this app commits to state-driven design
— without state, "needs my attention" surfaces are heuristic and
unreliable, which is exactly the failure mode this feature exists to
fix.

Cross-feature dependency: Pastor directives benefit substantially from
the Liturgical calendar feature being built first (so recurring
liturgical-year directives can be tied to dates). Basic ambition level
of directives can ship without the calendar; coordinated and integrated
levels depend on it.

Project rename — broader scope than "facilities"
────────────────────────────────────────────────
Problem: The project is named st-francis-facilities, reflecting its
original scope as a facilities management tool. The actual scope has
expanded substantially — this app is now a parish management system
that fills gaps Ministry Platform (the parish's existing church
management system) does not address. The current name misleads
future contributors about what the app does.

Future shape: Rename the GitHub repo, the local working directory,
and any path references in code or documentation to a name reflecting
the broader scope. Naming is TBD; candidates worth considering
include something parish-management-flavored that does not lock in
"facilities."

Hat ownership: Admin handles the rename mechanically. Not hat-design
work.

Recommended timing: Defer until hat design is substantially complete.
Execute as a focused plumbing session before substantial new feature
work begins — rename touches multiple files and is best done all at
once, not interleaved with design or feature commits. Roughly an
hour of careful work: rename folder, update GitHub remote, search
and replace any path references in code/docs, verify nothing broke,
push.

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

Clergy hat design dependency
────────────────────────────
Pastor, Parochial Vicar, and Deacon are three distinct hats with
overlapping but non-equivalent surfaces (e.g., directives — only Pastor
creates them; sacramental coordination — Deacon has unique
responsibilities; liturgy participation — all three but in different
roles). They share enough that designing one in isolation risks
misallocating surfaces between them; they differ enough that
consolidating them into one hat would erase distinctions that matter
for actual parish work. The Clergy categorization PLANNED FEATURES
entry treats Pastor/Parochial Vicar/Deacon as a data category for
unified clergy calendar; this is separate from but related to their
status as hats. Recommended approach for next session(s): design
these three hats as a connected cluster, with Pastor as the primary
and PV / Deacon as scoped variants. The clergy lockstep design is
its own concern inside the broader Pastor + Business Manager +
Facility Manager approval-workflow lockstep, since Pastor is in both
clusters.
