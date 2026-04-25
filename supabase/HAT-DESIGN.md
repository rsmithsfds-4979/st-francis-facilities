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
