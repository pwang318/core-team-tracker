# CORE execution module: deploy, operate, roll back

Release date: 2026-11-24. Scope: CORE Team LP Tracker only. Amanda's RM Tracker
(`amanda-tracker`) and the Director Tracker (`DirectorRM`) are separate
repositories and are not touched.

## What shipped

| Area | Where |
|---|---|
| LP homepage: Tuesday Updates, 30/60/90 calls, My Scorecard, client concerns | `core/core-app.js` (injected at the top of each LP page) |
| Mack's Production Command Center | Nav: TEAM → Command Center |
| Daniel's 2027 Plan dashboard | Nav: TEAM → 2027 Plan |
| Completion rules (CCR/PCR), shared logic | `core/core-logic.js` (mirrored by the database) |
| Database (additive, `core_*` only) | `supabase/migrations/20261124_core_execution.sql` |
| Rollback | `supabase/migrations/20261124_core_execution_rollback.sql` |

`index.html` changes by one line (added by the `install-core-execution` workflow, or directly): it loads the two module files after the
existing scripts. The existing scorecard, Face Time, leads, portfolio,
co-marketing, income, data hub, Production Manager and admin views are unchanged.

## Access model

* Everyone uses one shared team link: `https://pwang318.github.io/core-team-tracker/#team=<team key>`.
  The key is read from the link, kept on that device, and removed from the address bar.
  People keep selecting their name in the menu; the name is recorded on every call
  (attribution, not authentication).
* Borrower tables (`core_*`) have row-level security on, no policies, and no table
  privileges for the public browser key. The browser reaches them only through
  `core_api_*` functions that check the key (stored only as a SHA-256 hash).
* Manager actions (imports, assignment, coverage, bulk review, verifying corrective
  actions, funding review) need Mack's passcode, entered once per device under
  Command Center → Manager sign-in. The database enforces this, not the browser.
* Without the link, the tracker shows no borrower data.

## Database setup (Supabase SQL editor, project uclucbdkjqyqdvifyptx)

1. For a new database, apply `supabase/migrations/20261124_core_execution.sql`,
   then `supabase/migrations/20261124194049_core_funded_lp2_rollout.sql`.
   If CORE is already installed, apply only the rollout migration. It replaces
   the importer and scheduler in place and preserves existing records.
2. Set the keys (values are hashed; keep the originals somewhere safe):

```sql
select public.core_set_access_key('team',    '<team key>',        'Shared team link');
select public.core_set_access_key('manager', '<Mack passcode>',   'Production Manager');
select public.core_set_access_key('leader',   '<Director passcode>','Director');
```

3. Set the actual post-closing launch date before the first funded import (default `2026-11-24`):

```sql
update public.core_settings set value = '"2026-11-24"' where key = 'launch_date';
```

## First imports (Mack, Command Center → Imports and data)

1. Weekly pipeline report (Encompass Tuesday Updates workbook, sheet with
   "Loan Team Member Name - Loan Partner 2"). The LP2 column is the verified owner.
2. Funded Units report with Encompass LP2. Loans with the Funding milestone
   get calls from the actual Closed Date. Pre-launch loans get only 30- and
   60-day calls due on or after launch. Loans closed from launch onward get
   all three calls. Other milestones go to Funding review. Missing or
   conflicting ownership on scheduled work goes to Assignment review.

Re-importing the same file creates no duplicate tasks; a corrected Closed Date
reschedules only calls that have not happened yet.

## Tests

| Suite | Command | Result at release |
|---|---|---|
| Static tracker checks (existing, extended) | `node scripts/verify-tracker.cjs` | pass |
| Logic unit tests | `node scripts/test-core-logic.cjs` | 26 pass |
| Database tests (local Postgres, synthetic data) | `psql -v ON_ERROR_STOP=1 -f scripts/sql/test-core-execution.sql` | 63 assertions pass + rejection checks |
| Browser end-to-end (desktop, iPhone 13, Pixel 7) | see `scripts/e2e/README.md` | 52 pass |
| Regression vs. previous production `index.html` | same, `ONLY=regression` | routes, LP pages, scorecards identical; no new page errors |

## Rollback

* Website: `git revert` the release commit, or reset `main` to the tag
  `backup-pre-core-20261124` and push. GitHub Pages republishes automatically.
* Rollout-only database rollback: restore the two function definitions from the base CORE migration. Existing task and loan rows should be kept.
* Full database removal (only if needed): back up the `core_*` tables, then run
  `supabase/migrations/20261124_core_execution_rollback.sql`. It removes only
  `core_*` objects. Reverting the website alone is enough to hide the module.
