# CORE end-to-end tests

Runs the real tracker in Chrome against a local Postgres that has the CORE
migration applied, through `mock-supabase.cjs` (a small stand-in for the Supabase
REST endpoint that executes every call as the `anon` role, so key checks,
triggers and validation are the real database code). All data is synthetic.

```bash
# 1. disposable database
createdb e2e && psql -d e2e -v ON_ERROR_STOP=1 -f scripts/e2e/seed.sql
# 2. local API stand-in (needs: npm i pg)
PGURL=postgres://localhost/e2e node scripts/e2e/mock-supabase.cjs 54321 &
# 3. browser tests (needs: npm i playwright xlsx pg; Chrome installed)
PGURL=postgres://localhost/e2e ONLY=main node scripts/e2e/core-e2e.cjs
# 4. regression against the previous production index.html
git show backup-pre-core-20261124:index.html > /tmp/baseline.html
PGURL=postgres://localhost/e2e ONLY=regression BASELINE_HTML=/tmp/baseline.html node scripts/e2e/core-e2e.cjs
```

Screenshots and `results.json` are written to `/tmp/core-e2e`.
