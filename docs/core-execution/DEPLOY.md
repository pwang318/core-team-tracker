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

* **Open LP access (2026-11-25):** the plain link `https://pwang318.github.io/core-team-tracker/`
  gives every LP their full call list with nothing to enter
  (`supabase/migrations/20261125190000_core_open_lp_access.sql`). Old `#team=` links still work.
  The original shared-team-link model is described below for reference.
* Previously, everyone used one shared team link: `https://pwang318.github.io/core-team-tracker/#team=<team key>`.
  The key is read from the link, kept on that device, and removed from the address bar.
  People keep selecting their name in the menu; the name is recorded on every call
  (attribution, not authentication).
* Borrower tables (`core_*`) have row-level security on, no policies, and no table
  privileges for the public browser key. The browser reaches them only through
  `core_api_*` functions that check the key (stored only as a SHA-256 hash).
* Manager actions (imports, assignment, coverage, bulk review, verifying corrective
  actions, funding review) need Mack's passcode, entered once per device under
  Command Center → Manager sign-in. The database enforces this, not the browser.
* With open LP access on, anyone with the URL can see LP call lists (borrower names, closing dates).

## Database setup (Supabase SQL editor, project uclucbdkjqyqdvifyptx)

1. Run `supabase/migrations/20261124_core_execution.sql`. It is idempotent and
   creates only `core_*` objects.
2. Set the keys (values are hashed; keep the originals somewhere safe):

```sql
select public.core_set_access_key('team',    '<team key>',        'Shared team link');
select public.core_set_access_key('manager', '<Mack passcode>',   'Production Manager');
select public.core_set_access_key('admin',   '<Director passcode>','Director');
```

3. Optional: change the date before which unlogged post-closing calls count as
   Needs Review (default `2026-11-24`):

```sql
update public.core_settings set value = '"2026-11-24"' where key = 'launch_date';
```

## First imports (Mack, Command Center → Imports and data)

1. Weekly pipeline report (Encompass Tuesday Updates workbook, sheet with
   "Loan Team Member Name - Loan Partner 2"). The LP2 column is the verified owner.
2. Funded Units report. A Funding milestone and a valid Closed Date set
   call eligibility. The Encompass LP2 column provides ownership when it
   matches the tracker roster. Conflicts, unknown owners, and funding
   exceptions go to review.
3. Apply `20261124203000_core_postclose_launch.sql` followed by
   `20261124203100_core_funded_lp2.sql` after the base migration.
   Loans closed on or after the launch date get all three milestones.
   Pre-launch closings get 30- and 60-day calls whose due dates are on or
   after launch. The launch migration cancels untouched pre-launch 90-day
   tasks from the initial import and retains their audit history.

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
* Database (only if needed): back up the `core_*` tables, then run
  `supabase/migrations/20261124_core_execution_rollback.sql`. It removes only
  `core_*` objects. Reverting the website alone is enough to hide the module.
