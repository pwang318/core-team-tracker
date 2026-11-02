# LP Coaching and Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Production Manager coaching easy to scan and role-relevant, and place Amanda's RM relationship-health snapshot on Team Snapshot.

**Architecture:** Update the existing single-file LP tracker in `index.html`. Keep the existing shared Supabase/Power BI sources and realtime plus 60-second fallback; reorganize only the presentation and coaching copy.

**Tech Stack:** Static HTML, CSS, JavaScript, GitHub Pages, existing Supabase REST/Realtime data.

**Spec:** `docs/superpowers/specs/2026-11-02-lp-coaching-and-snapshot-design.md`

## Global Constraints

- Preserve LPs' separately owned Leads scorecard goal and entry.
- Preserve the RM's existing active-agent scoring formula and 100-lead monthly floor.
- Keep WTD/MTD/YTD selection per LP and keep the latest Tuesday plan distinctly labeled.
- Treat missing, stale, or unattributed information as a data limitation, not zero or confirmed underperformance.
- Use role/responsibility data already present; do not coach the RM from the LP panel.
- Do not add a persisted commitment workflow or new data source.
- Do not add or run a test suite; verify the rendered/source behavior manually and confirm Pages deployment status.

## Review Focus

- Missing scorecard data remains “not submitted,” never zero.
- Stale or unattributed Velocify records are qualified and must be checked before performance conclusions.
- Deadline-sensitive Tuesday updates outrank lower-risk coaching signals.
- Multiple simultaneous issues collapse to one clear top priority and one actionable next step.
- Narrow screens keep cards readable and expandable.

---

### Task 1: Reorganize Production Manager coaching and relocate RM snapshot

**Files:**
- Modify: `index.html` — `pmCoachingContent(stats, velRows)`, coaching styles, `updateRelationshipSnapshot()`, and its view observers.

**Interfaces:**
- Consumes existing per-LP stats and Velocify rows used by `pmCoachingContent(stats, velRows)`.
- Consumes existing RM snapshot state from `window.ctV72MonthlyDetail`, `window.ctV72WeeklyDetail`, and shared Power BI/activity refresh functions.
- Preserves `pmSetCoachingPeriod(lp, period)`, `pmOpenLpDetail(lp)`, and `pmCopyCoaching(lp)`.

- [ ] **Step 1: Make the collapsed LP card scannable.** Show LP name, period, Tuesday completion, scorecard state, and the single highest-priority verified signal. Put supporting evidence and the coaching discussion/action inside an expandable section; keep WTD/MTD/YTD controls and record review/copy actions available.
- [ ] **Step 2: Make coaching specific and role-appropriate.** Prioritize closing-sensitive Tuesday updates, then open Tuesday updates, missing scorecards, then stale lead follow-up. Use available LP responsibilities to generate one direct conversation prompt and one measurable next step with a suggested check-in date. Keep data-quality caveats visible; remove repeated generic bullets.
- [ ] **Step 3: Add a compact Production Manager summary.** Show counts of LPs needing review, open Tuesday updates, closing-sensitive updates, and missing scorecards above a responsive grid of LP cards. Ensure the expanded details are one-column on narrow screens.
- [ ] **Step 4: Put RM relationship health on Team Snapshot.** Render the existing RM summary in the Amanda/RM area of `view-snapshot`, near `ct-amanda-snapshot` / `ct-amanda-snapshot-anchor`; remove its insertion from `view-production-manager`. Keep one copy only and preserve shared active-agent count, month-to-date referrals, 100 floor, dynamic goal, pace, activity, and source timestamp.
- [ ] **Step 5: Keep refreshes view-aware.** Trigger RM summary refresh while Team Snapshot is active; retain shared realtime subscriptions and the 60-second fallback. Do not add a second source of truth.
- [ ] **Step 6: Manually inspect the source and UI.** Confirm the Production Manager scan is compact, expanded coaching is readable, Snapshot contains the RM overview, and no duplicate RM panel remains in Production Manager. Confirm the LP Leads scorecard and RM formula are unchanged.
- [ ] **Step 7: Deploy.** Update `pwang318/core-team-tracker` on `main`, then confirm the GitHub Pages build/deployment succeeds for the new commit.

**Acceptance:** Production Manager presents a short prioritized coaching view; details expand per LP. Team Snapshot is the only location for RM relationship health. LP Leads scorecard, RM formula, source semantics, and period controls are unchanged.
