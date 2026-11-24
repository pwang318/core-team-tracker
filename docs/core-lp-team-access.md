# CORE Team post-closing access

The existing Excel uploads and LP name picker remain the user-facing workflow. The new post-closing controls use the team access integration supplied by IT. The tracker does not prompt for credentials.

Provide `window.ctTeamAccess` before the tracker initializes. Each method returns a promise and rejects when the request fails.

| Browser method | Authorized operation |
| --- | --- |
| `loadPostClosingTasks(owner)` | Read `core_lp_post_closing_worklist` and filter by `verified_owner`. The selected owner is a filter. Identity and authorization come from the IT access integration. |
| `importFundedBatch(payload)` | Call `core_lp_import_funded_batch` as Mack. The payload includes `p_loans` and `p_source_reference`. The result supplies `imported`, `unchanged`, `needs_review`, and `outside_window`. |
| `recordPostClosingCall(payload)` | Call `core_lp_record_post_closing_call` as the authorized LP or Mack. Forward the request ID so a retried save remains idempotent. |

Use the authorized actor's Supabase identity so the database policies and role checks can run. Keep server credentials out of browser code. The worklist uses `loan_key` as a fallback display value. An authorized backend can supply a readable `label` where needed.

Before an integration test, apply the migrations on a disposable or staging database, set the actual test launch date in `core_lp_private.post_closing_rollout`, and link the test identities in `core_lp_members`. Use synthetic Excel exports for the first end-to-end checks.
