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
