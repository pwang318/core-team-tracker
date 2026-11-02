# LP coaching and Snapshot design

Date: 2026-11-02
Status: Proposed; awaiting user approval before implementation.

## Intent

Make the Production Manager view easier to scan and make LP coaching useful in a real 1:1. Put Amanda's RM relationship-health snapshot on Team Snapshot, where users expect an at-a-glance team/RM summary.

## Goals

- Show each LP's strongest verified coaching signal, one role-appropriate conversation prompt, and one measurable next action to revisit.
- Keep missing, stale, or unattributed data distinct from confirmed performance gaps.
- Organize the Production Manager area into a short portfolio summary and a compact, expandable set of LP cards instead of long narrative lists.
- Move RM relationship health from Production Manager to the existing Team Snapshot anchor.
- Preserve per-LP WTD/MTD/YTD selection and keep the latest Tuesday plan clearly labeled separately.

## Non-goals and constraints

- Do not change any LP's separately owned Leads scorecard goal or entry.
- Do not change the RM's existing active-agent scoring calculation or the 100-lead monthly floor.
- Do not create a new saved commitment database or extra reporting workflow in this first pass.
- Do not infer poor LP performance from missing scorecards, missing lead attribution, or stale source records.
- Use only role/responsibility information already available in the tracker; if it cannot identify LP1 versus LP2, phrase guidance for the shared LP responsibilities.

## Approaches

1. **Focused coaching cards (recommended):** Put a compact needs-attention summary at the top of Production Manager. Each LP card shows key counts and the highest-priority verified issue; expand it for evidence, an LP-specific discussion prompt, and one measurable action with a proposed check-in date. This keeps the view organized without adding data-entry burden.
2. **Saved coaching commitments:** Add manager notes, agreed actions, owners, due dates, and completion status to a persistent coaching workflow. This offers stronger follow-through but adds a new data model and more upkeep, so it is deferred unless requested.

## Proposed layout and behavior

- Production Manager: summary counts for missing scorecards, open Tuesday updates, deadline-sensitive updates, and LPs needing follow-up; compact two-column cards that expand to show evidence and coaching detail. On small screens, use one column.
- Each card's collapsed view: LP name, reporting period, Tuesday completion, scorecard status, and one highest-priority next step.
- Expanded card: verified win (when supported), data-quality note, one question for the coaching conversation, one specific measurable action, and suggested recheck date. Avoid repeat boilerplate.
- Team Snapshot: render RM relationship health in the existing Amanda/RM snapshot area; remove its duplicate from Production Manager. Keep common Power BI source, timestamp, active-agent denominator, current-month referrals, goal/pace, and weekly RM activity together.
- Refresh behavior: use the existing shared sources and realtime/60-second refresh paths; do not add a competing data source.

## Acceptance checks

- Production Manager can be scanned quickly without reading every coaching bullet.
- Every generated opportunity cites a source-backed condition and gives a concrete, LP-controllable next step.
- Missing or stale data is labeled clearly and never presented as zero or confirmed underperformance.
- RM relationship-health content appears on Team Snapshot, not Production Manager.
- LP Leads scorecard and RM score formula remain unchanged.
