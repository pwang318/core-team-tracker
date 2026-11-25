'use strict';
// Browser end-to-end tests for the CORE execution module (desktop, iPhone, Android),
// run against the real migration in a local Postgres via mock-supabase.cjs.
// Synthetic borrowers and keys only. See scripts/e2e/README.md.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const XLSX = require('xlsx');
const { Client } = require('pg');
const L = require('../../core/core-logic.js');

const ROOT = path.resolve(__dirname, '../..');
const PG = process.env.PGURL;
const MOCK = 'http://127.0.0.1:' + (process.env.MOCK_PORT || 54321);
const SITE_PORT = Number(process.env.SITE_PORT || 8089);
const XLSX_JS = require.resolve('xlsx/dist/xlsx.full.min.js');
const BASELINE = process.env.BASELINE_HTML;
const OUT = process.env.E2E_OUT || '/tmp/core-e2e';
const ONLY = process.env.ONLY || '';
const KEYS = { team: 'e2e-team-key-0123456789abcdef', manager: 'e2e-mgr-key-0123456789abcdef0', leader: 'e2e-lead-key-0123456789abcdef' };
fs.mkdirSync(OUT, { recursive: true });

const results = []; let failures = 0;
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['PASS', name, Date.now() - t]); console.log('PASS', name); }
  catch (e) { failures++; results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 3).join('\n    ')); }
}
function serve() {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      if (p === '/baseline.html' && BASELINE) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(BASELINE)); }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      const ct = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct }); res.end(fs.readFileSync(f));
    }).listen(SITE_PORT, () => r(s));
  });
}
const failNetwork = { on: false };
async function wire(context) {
  // Playwright runs the most recently registered matching route first, so the catch-all goes first.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort());
  await context.route(/uclucbdkjqyqdvifyptx\.supabase\.co/, async route => {
    if (failNetwork.on && /rpc\/core_api_save_task/.test(route.request().url())) return route.abort('failed');
    const u = new URL(route.request().url());
    const resp = await fetch(MOCK + u.pathname + u.search, { method: route.request().method(), headers: route.request().headers(), body: ['GET', 'HEAD'].includes(route.request().method()) ? undefined : route.request().postData() });
    const body = Buffer.from(await resp.arrayBuffer());
    await route.fulfill({ status: resp.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body });
  });
  await context.route(/xlsx(\.full)?\.min\.js/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(XLSX_JS) }));
}
function track(page) {
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.message() === 'Manager passcode' ? KEYS.manager : 'Verified in Encompass and documented for review') : undefined));
  return errs;
}
const coreErrors = errs => errs.filter(e => /core-app|core-logic|CoreApp|CoreLogic/.test(e));
const today = L.todayIso();
const ctxOpts = { timezoneId: 'America/New_York' };

function xlsxFile(name, header, rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Table');
  const f = path.join(OUT, name); XLSX.writeFile(wb, f); return f;
}
const PIPE_H = ['Loan Team Member Name - Loan Partner 2', 'Est Closing Date', 'Borrower Name', 'Last Finished Milestone', 'Loan Number', 'Loan Purpose', 'Loan Type', 'Loan Amount', 'Loan Processor', 'Referral Source Name', 'Buyers Agent Contact Name', 'Buyers Agent Email', 'Buyers Agent Phone', 'Closing Disclosure - CD Date Issued', 'Last Finished Milestone Date'];
function pipeRow(lp2, close, borrower, loan, purpose, agent) { return [lp2, close, borrower, 'Approval', loan, purpose, 'Conventional', 300000, 'Fictional Processor', 'Fictional Realtor', agent || 'None None', agent ? 'agent@example.test' : 'none@none.com', agent ? '555-0100' : '000-000-0000', ' ', today + ' 09:00:00']; }
const lastWeek = L.addDays(today, -7);
const pipeLastWeek = xlsxFile('pipeline_last_week.xlsx', PIPE_H, [
  pipeRow('Gavin Dill', L.addDays(today, 20), 'Testcase, Overdue', '99100000001', 'Purchase', 'Agent Alpha'),
  pipeRow('Gavin Dill', L.addDays(today, -30), 'Testcase, Fundedgavin', '99100000006', 'Purchase', 'Agent Echo')
]);
const pipeThisWeek = xlsxFile('pipeline_this_week.xlsx', PIPE_H, [
  pipeRow('Gavin Dill', L.addDays(today, 20), 'Testcase, Overdue', '99100000001', 'Purchase', 'Agent Alpha'),
  pipeRow('Gavin Dill', L.addDays(today, 3), 'Testcase, Closingsoon', '99100000002', 'Purchase', 'Agent Bravo'),
  pipeRow('Gavin Dill', L.addDays(today, 30), 'Testcase, Refi', '99100000003', 'No Cash-Out Refi', ''),
  pipeRow('Karen De La Riva', L.addDays(today, 15), 'Testcase, Karenone', '99100000004', 'Purchase', 'Agent Charlie'),
  pipeRow('', L.addDays(today, 25), 'Testcase, Nolp', '99100000005', 'Purchase', 'Agent Delta'),
  pipeRow('Gavin Dill', L.addDays(today, 3), 'Testcase, Closingsoon', '99100000002', 'Purchase', 'Agent Bravo')
]);
const FUND_H = ['Loan Number', 'Borrower Name', 'Messages', 'Last Finished Milestone', 'Loan Officer', 'Subject Property Address', 'Subject Property City', 'Subject Property State', 'Est Closing Date', 'Loan Type', 'Buyers Agent Name', 'Closed Date', 'Loan Processor', 'Referral Source Name'];
function fundRow(loan, name, ms, closed) { return [loan, name, ' ', ms, 'Fictional LO', '1 Test St', 'Columbus', 'OH', closed, 'Conventional', 'Fictional Realty', closed ? closed + ' 00:00:00' : ' ', 'Fictional Processor', ' ']; }
const fundedFile = xlsxFile('funded_units_synthetic.xlsx', FUND_H, [
  fundRow('99100000006', 'Testcase, Fundedgavin', 'Funding', L.addDays(today, -30)),
  fundRow('99200000001', 'Testcase, Unmatched', 'Funding', L.addDays(today, -33)),
  fundRow('99200000002', 'Testcase, Oldloan', 'Funding', '2026-01-31'),
  fundRow('99200000003', 'Testcase, Completionms', 'Completion', L.addDays(today, -40)),
  fundRow('99200000004', 'Testcase, Recent', 'Funding', L.addDays(today, -2)),
  fundRow('99200000005', 'Testcase, Nodate', 'Funding', '')
]);
const wrongFile = xlsxFile('not_a_report.xlsx', ['Agent', 'Level'], [['Someone', 'A']]);

async function db(sql, args) { const c = new Client({ connectionString: PG }); await c.connect(); try { return (await c.query(sql, args)).rows; } finally { await c.end(); } }
async function openLp(page, lp) {
  // The tracker routes to Team Snapshot shortly after load; retry so a late boot route can't win the race.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(lp => { const b = [...document.querySelectorAll('.ct-nav-btn[data-lp]')].find(x => x.dataset.lp === lp); window.lpv2Route('lp', b); }, lp);
    try { await page.waitForSelector('#core-today .cx-head', { timeout: 4000 }); await page.waitForTimeout(300); if (await page.isVisible('#core-today .cx-head')) return; } catch (e) {}
  }
  await page.waitForSelector('#core-today .cx-head', { timeout: 5000 });
}
async function nav(page, route) {
  for (let i = 0; i < 4; i++) {
    await page.evaluate(r => document.querySelector('.ct-nav-btn[data-route="' + r + '"]').click(), route);
    await page.waitForTimeout(600);
    if (await page.evaluate(r => (document.getElementById('view-' + r) || {}).classList && document.getElementById('view-' + r).classList.contains('active'), route)) return;
  }
}
async function noHorizontalOverflow(page) {
  const w = await page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? { sw: v.scrollWidth, cw: v.clientWidth, vw: window.innerWidth } : null; });
  assert.ok(w && w.sw <= w.vw + 2, 'horizontal overflow: ' + JSON.stringify(w));
}
async function fillTuesday(page, opts) {
  opts = opts || {};
  await page.selectOption('#cx-bo', 'conversation');
  for (const c of await page.$$('.cx-overlay [data-check]')) if (!(await c.isChecked()) && (await c.getAttribute('data-check')) !== 'rate_drop_na') await c.check();
  await page.fill('#cx-bn', 'Reviewed approval conditions and the appraisal timeline with the borrower');
  if (await page.$('#cx-su')) await page.fill('#cx-su', 'Approval received; appraisal at value; on track for closing');
  await page.check('.cx-overlay input[name="referral_requested"]');
  if (await page.$('#cx-rr input[type="radio"]')) await page.check('#cx-rr input[value="' + (opts.referral || 'asked_no_referral') + '"]');
  else await page.selectOption('#cx-rr', opts.referral || 'asked_no_referral');
  if (await page.$('#cx-agent') && opts.agent !== 'no_buyer_agent') {
    await page.check('#cx-agent input[value="' + (opts.agent || 'spoke') + '"]');
    if (await page.$('#cx-agent-notes:not(.cx-hide)')) {
      await page.click('#cx-agent-notes summary');
      await page.fill('#cx-an', 'Told the buyer agent appraisal is at value and CTC is expected');
    }
  }
  await page.fill('#cx-na', 'Confirm clear to close with processor');
  await page.fill('#cx-nd', L.addDays(today, 1));
}
async function openTask(page, id) {
  await page.evaluate(id => document.querySelector('[data-open-task="' + id + '"]').click(), id);
  await page.waitForSelector('.cx-overlay[data-task="' + id + '"] form', { timeout: 8000 });
}
const taskId = async (loan, type) => (await db('select id from core_tasks where loan_number=$1 and task_type=$2 order by due_date desc limit 1', [loan, type]))[0].id;

(async () => {
  const site = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const base = 'http://127.0.0.1:' + SITE_PORT;
  const errM = [], errG = [], errD = [];

  if (!ONLY || ONLY === 'main') {
  // ------------------------------------------------------------ anonymous / invalid access
  const ctxA = await browser.newContext({ ...ctxOpts, viewport: { width: 1366, height: 900 } }); await wire(ctxA);
  const pa = await ctxA.newPage(); const errA = track(pa);
  await step('Page loads with the CORE module, new navigation and no module errors', async () => {
    await pa.goto(base + '/index.html', { waitUntil: 'load' });
    await pa.waitForFunction(() => window.CoreApp && document.querySelector('.ct-nav-btn[data-route="core-command"]'), null, { timeout: 15000 });
    for (const r of ['core-plan', 'core-scorecard']) assert.equal(await pa.locator('.ct-nav-btn[data-route="' + r + '"]').count(), 1, r);
    assert.deepEqual(coreErrors(errA), []);
  });
  await step('Borrower data is not reachable anonymously (tables, RPC without key)', async () => {
    let r = await fetch(MOCK + '/rest/v1/core_tasks?select=*'); let j = await r.json();
    assert.ok(r.status >= 400 && /permission denied/.test(j.message), 'table read must be denied: ' + r.status);
    r = await fetch(MOCK + '/rest/v1/rpc/core_api_load', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_key: 'guess-guess-guess-guess' }) }); j = await r.json();
    assert.ok(r.status >= 400 && /not valid/.test(j.message), 'invalid key must be rejected');
  });
  await step('LP page without the team link shows only the access card and scorecard; no borrower names', async () => {
    await openLp(pa, 'Gavin');
    await pa.waitForSelector('#core-today form[data-cx="access"]');
    await pa.waitForSelector('#core-scorecard-card');
    assert.doesNotMatch(await pa.textContent('body'), /Testcase/);
  });
  await step('Wrong team key shows a clear error and is not stored', async () => {
    await pa.fill('#cx-key', 'definitely-not-the-key-123456'); await pa.click('#core-today form[data-cx="access"] button');
    await pa.waitForSelector('#core-today .cx-err');
    assert.equal(await pa.evaluate(() => localStorage.getItem('core.teamKey.v1')), null);
  });
  await ctxA.close();

  // ------------------------------------------------------------ Mack (manager link)
  const ctxM = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 950 }, acceptDownloads: true }); await wire(ctxM);
  const pm = await ctxM.newPage(); errM.push(...[]); const eM = track(pm);
  await step('Mack opens the shared team link (key removed from the address bar), Command Center is view-only', async () => {
    await pm.goto(base + '/index.html#team=' + KEYS.team);
    await pm.waitForFunction(() => window.CoreApp && window.CoreApp.state.tier === 'team', null, { timeout: 15000 });
    assert.doesNotMatch(pm.url(), /team=/);
    await nav(pm, 'core-command');
    await pm.waitForSelector('#view-core-command .cx-tabs');
    await pm.click('#view-core-command [data-tab="data"]');
    assert.equal(await pm.locator('input[data-imp]').count(), 0, 'no imports without the manager passcode');
  });
  await step('Manager sign-in with the passcode unlocks manager actions (checked by the server)', async () => {
    await pm.click('[data-cx="mgr-on"]');
    await pm.waitForFunction(() => window.CoreApp.state.tier === 'manager', null, { timeout: 15000 });
    await pm.waitForSelector('#view-core-command [data-tab="data"]');
  });
  async function importFile(kind, file, date) {
    await pm.click('#view-core-command [data-tab="data"]');
    if (date) await pm.fill('[data-imp-date]', date);
    await pm.setInputFiles('input[data-imp="' + kind + '"]', file);
    await pm.waitForSelector('[data-preview="' + kind + '"] [data-run-import], [data-preview="' + kind + '"] .cx-err', { timeout: 15000 });
    if (await pm.$('[data-preview="' + kind + '"] > .cx-err')) return pm.textContent('[data-preview="' + kind + '"]');
    await pm.click('[data-preview="' + kind + '"] [data-run-import]');
    await pm.waitForSelector('[data-preview="' + kind + '"] [data-import-result] .cx-ok, [data-preview="' + kind + '"] [data-import-result] .cx-err', { timeout: 20000 });
    await pm.waitForFunction(() => !window.CoreApp.state.loading, null, { timeout: 15000 });
    return pm.textContent('[data-preview="' + kind + '"] [data-import-result]');
  }
  await step('Malformed report is rejected before import', async () => {
    assert.match(await importFile('pipeline', wrongFile, today), /does not match/);
    assert.equal((await db('select count(*)::int n from core_import_runs'))[0].n, 0);
  });
  await step('Pipeline import (last week) creates Tuesday work', async () => {
    assert.match(await importFile('pipeline', pipeLastWeek, lastWeek), /imported: 2 loans/i);
  });
  await step('Pipeline import (this week): duplicates and missing LP2 flagged, not guessed', async () => {
    await pm.click('#view-core-command [data-tab="data"]');
    await pm.fill('[data-imp-date]', today);
    await pm.setInputFiles('input[data-imp="pipeline"]', pipeThisWeek);
    await pm.waitForSelector('[data-preview="pipeline"] [data-run-import]');
    const prev = await pm.textContent('[data-preview="pipeline"]');
    assert.match(prev, /5 unique loans/); assert.match(prev, /1 duplicate/); assert.match(prev, /1 unassigned/);
    await pm.click('[data-preview="pipeline"] [data-run-import]');
    await pm.waitForSelector('[data-preview="pipeline"] [data-import-result] .cx-ok', { timeout: 20000 });
    const rows = await db("select task_key, owner_lp from core_tasks where task_type='tuesday' order by task_key");
    assert.equal(rows.length, 7);
    assert.equal(rows.find(r => r.task_key.startsWith('TUE:99100000005')).owner_lp, null);
  });
  await step('Re-importing the same pipeline file creates no duplicate tasks', async () => {
    const before = (await db('select count(*)::int n from core_tasks'))[0].n;
    assert.match(await importFile('pipeline', pipeThisWeek, today), /0 tasks created/);
    assert.equal((await db('select count(*)::int n from core_tasks'))[0].n, before);
  });
  await step('Funded Units: validated, 30/60/90 from actual closed dates, review queue for exceptions', async () => {
    const t = await importFile('funded', fundedFile);
    assert.match(t, /imported: 5 loans/i); assert.match(t, /sent to review/);
    const pc = await db("select task_key, due_date::text d, status, owner_lp from core_tasks where task_type like 'pc%' order by task_key");
    const g = k => pc.find(r => r.task_key === k);
    assert.equal(g('PC30:99100000006').d, today); assert.equal(g('PC30:99100000006').owner_lp, 'Gavin');
    assert.equal(g('PC60:99200000004').d, L.addDays(L.addDays(today, -2), 60));
    assert.equal(g('PC30:99200000002').status, 'needs_review');
    assert.equal(g('PC30:99200000001').owner_lp, null);
    assert.equal(pc.filter(r => r.task_key.includes('99200000003')).length, 0);
    assert.equal(pc.filter(r => r.task_key.includes('99200000005')).length, 0, 'missing closed date creates nothing');
    assert.equal((await db("select status from core_tasks where task_key like 'TUE:99100000006:%'"))[0].status, 'cancelled');
  });
  await step('Re-importing Funded Units is idempotent', async () => { assert.match(await importFile('funded', fundedFile), /0 tasks created/); });
  await step('Freshness shows the latest successful imports', async () => {
    assert.doesNotMatch(await pm.textContent('#view-core-command .cx-head .cx-sub'), /not imported/);
  });
  await step('Every Command Center overview tile opens its records', async () => {
    await pm.click('#view-core-command [data-tab="overview"]');
    const keys = await pm.$$eval('#view-core-command .cx-tile[data-tile]', bs => bs.map(b => b.getAttribute('data-tile')));
    assert.ok(keys.length >= 11, 'tiles: ' + keys.length);
    for (const k of keys) {
      await pm.click('#view-core-command [data-tab="overview"]');
      await pm.click('#view-core-command .cx-tile[data-tile="' + k + '"]');
      const on = await pm.$eval('#view-core-command .cx-tab.on', b => b.dataset.tab);
      assert.ok(['records', 'unassigned', 'scorecards'].includes(on), k + ' opened ' + on);
    }
  });
  await step('Activity totals match the underlying records', async () => {
    await pm.click('#view-core-command [data-tab="overview"]');
    const cells = await pm.$$eval('#view-core-command table.cx-t [data-rec]', bs => bs.map(b => ({ k: b.dataset.rec, v: b.textContent })));
    assert.ok(cells.length >= 100, 'clickable cells ' + cells.length);
    for (const c of cells.filter(c => /^\d+$/.test(c.v)).slice(0, 40)) {
      await pm.click('#view-core-command [data-tab="overview"]');
      await pm.click('#view-core-command [data-rec="' + c.k + '"]');
      const shown = Number((await pm.textContent('#view-core-command .cx-card .cx-note')).match(/(\d+) records/)[1]);
      assert.equal(shown, Number(c.v), c.k);
    }
  });
  await step('Assignment review queue: assign an unassigned borrower; open calls move', async () => {
    await pm.click('#view-core-command [data-tab="unassigned"]');
    await pm.check('[data-sel-loan="99200000001"]');
    await pm.selectOption('[data-assign-lp]', 'Gavin');
    await pm.click('[data-assign-go]');
    await pm.waitForFunction(() => !document.querySelector('[data-sel-loan="99200000001"]'), null, { timeout: 15000 });
    const r = await db("select owner_lp from core_tasks where loan_number='99200000001'");
    assert.ok(r.length === 3 && r.every(x => x.owner_lp === 'Gavin'));
    assert.equal((await db("select actor from core_task_events where event_type='assignment' limit 1"))[0].actor, 'Mack');
  });
  await step('Funding review: Mack verifies a non-Funding milestone; calls scheduled', async () => {
    await pm.click('#view-core-command [data-tab="funding"]');
    await pm.click('[data-fund="99200000003|1"]');
    await pm.waitForFunction(() => !document.querySelector('[data-fund="99200000003|1"]'), null, { timeout: 15000 });
    assert.equal((await db("select count(*)::int n from core_tasks where loan_number='99200000003'"))[0].n, 3);
  });
  await step('Coverage: Osgood covers Karen today', async () => {
    await pm.click('#view-core-command [data-tab="coverage"]');
    await pm.selectOption('form[data-cx="coverage"] [name="from_lp"]', 'Karen');
    await pm.selectOption('form[data-cx="coverage"] [name="to_lp"]', 'Osgood');
    await pm.click('form[data-cx="coverage"] button[type=submit]');
    await pm.waitForSelector('[data-endcov]', { timeout: 10000 });
  });
  await step('Reassign one record to temporary coverage', async () => {
    const id = await taskId('99200000004', 'pc60');
    await pm.evaluate(id => { const S = window.CoreApp.state; S.records = { title: 'One record', tasks: S.tasks.filter(t => t.id === id) }; S.cmdTab = 'records'; window.CoreApp.open('core-command'); }, id);
    await openTask(pm, id);
    await pm.selectOption('[data-mgr="coverage"]', 'Said');
    await pm.click('[data-cx="mgr-assign"]');
    await pm.waitForFunction(id => (window.CoreApp.state.tasks.find(t => t.id === id) || {}).coverage_lp === 'Said', id, { timeout: 8000 });
    await pm.keyboard.press('Escape');
    assert.equal((await db('select coverage_lp from core_tasks where id=$1', [id]))[0].coverage_lp, 'Said');
  });
  await step('Excel exports: activity workbook and scorecards', async () => {
    let [dl] = await Promise.all([pm.waitForEvent('download', { timeout: 15000 }), pm.click('[data-cx="export"]')]);
    let f = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f);
    let wb = XLSX.readFile(f); assert.deepEqual(wb.SheetNames, ['Team Summary', 'Activity', 'Unassigned', 'Corrective Actions']);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Team Summary']).length, 6);
    await pm.click('#view-core-command [data-tab="scorecards"]');
    await pm.waitForSelector('[data-cx="export-sc"]');
    [dl] = await Promise.all([pm.waitForEvent('download', { timeout: 15000 }), pm.click('[data-cx="export-sc"]')]);
    f = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f);
    wb = XLSX.readFile(f); assert.ok(XLSX.utils.sheet_to_json(wb.Sheets.Scorecards).some(r => r.LP === 'Gavin'));
  });
  await step('Scorecards tab: submitted vs missing and team trend from existing scorecard data', async () => {
    const t = await pm.textContent('#view-core-command');
    assert.match(t, /Missing/); assert.match(t, /of 6 entered/);
    assert.match(t, /7\/32 · 22%/, 'Gavin current week 7 of 32 (live scorecard goals)');
  });
  await pm.screenshot({ path: path.join(OUT, 'desktop-command-center.png') });

  // ------------------------------------------------------------ Gavin (team link) on a second device
  const ctxG = await browser.newContext({ ...ctxOpts, viewport: { width: 1366, height: 900 } }); await wire(ctxG);
  const pg = await ctxG.newPage(); const eG = track(pg);
  await step('Gavin opens the team link and selects his name', async () => {
    await pg.goto(base + '/index.html#team=' + KEYS.team); await pg.waitForFunction(() => window.CoreApp && window.CoreApp.state.tier === 'team', null, { timeout: 15000 });
    await openLp(pg, 'Gavin');
    await pg.waitForSelector('#core-today .cx-tiles', { timeout: 15000 });
  });
  await step('Homepage tiles: Tuesday counts, 30/60/90, overdue and scorecard status', async () => {
    const txt = await pg.textContent('#core-today');
    assert.match(txt, /Total assigned\s*4/); assert.match(txt, /Overdue\s*1/);
    assert.match(txt, /30-day calls\s*2/);
    assert.match(txt, /60-day calls\s*Complete/); assert.match(txt, /Entered this week/);
  });
  await step('Every LP tile opens the correct filtered worklist', async () => {
    for (const k of ['tue-assigned', 'tue-completed', 'tue-remaining', 'tue-overdue', 'tue-ccr', 'tue-intros', 'pc30', 'pc60', 'pc90', 'pc-overdue']) {
      await pg.click('#core-today .cx-tile[data-tile="' + k + '"]');
      await pg.waitForSelector('#core-worklist');
      const n = await pg.locator('#core-worklist [data-open-task]').count();
      const v = await pg.$eval('#core-today .cx-tile[data-tile="' + k + '"] .t-val', e => e.textContent);
      if (/^pc\d/.test(k)) assert.ok(n >= (/^\d+$/.test(v) ? Number(v) : 0), k);
      else if (/^\d+$/.test(v)) assert.equal(n, Number(v), k); else assert.equal(n, 0, k);
      await pg.click('#core-worklist [data-tile=""]');
    }
  });
  await step("Complete Today's Tuesday Updates is unavailable while updates remain", async () => { assert.equal(await pg.isDisabled('[data-cx="signoff-tuesday"]'), true); });
  await step('Multiple attempts are logged; none completes the update', async () => {
    const id = await taskId('99100000002', 'tuesday');
    await openTask(pg, id);
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true);
    await pg.selectOption('#cx-bo', 'voicemail'); await pg.click('[data-cx="log-attempt"]');
    await pg.waitForFunction(id => (window.CoreApp.state.tasks.find(t => t.id === id) || {}).status === 'attempted', id, { timeout: 8000 });
    await pg.waitForSelector('.cx-overlay form #cx-bo');
    await pg.selectOption('#cx-bo', 'text_sent'); await pg.click('[data-cx="log-attempt"]');
    await pg.waitForFunction(id => (window.CoreApp.state.tasks.find(t => t.id === id) || {}).borrower_outcome === 'text_sent', id, { timeout: 8000 });
    await pg.waitForTimeout(500);
    const ev = await db("select channel, actor from core_task_events where task_id=$1 and event_type='attempt' order by occurred_at", [id]);
    assert.deepEqual(ev.map(e => e.channel), ['voicemail', 'text_sent']); assert.ok(ev.every(e => e.actor === 'Gavin'));
    assert.equal((await db('select status from core_tasks where id=$1', [id]))[0].status, 'attempted');
  });
  await step('Voicemail only and missing CCR cannot complete; named introduction needs a CRM reference', async () => {
    await pg.waitForSelector('.cx-overlay form #cx-bo');
    await fillTuesday(pg);
    await pg.selectOption('#cx-bo', 'voicemail');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true);
    assert.match(await pg.textContent('#cx-reqs'), /Borrower conversation required/);
    await pg.selectOption('#cx-bo', 'conversation');
    await pg.uncheck('.cx-overlay input[name="referral_requested"]');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true);
    assert.match(await pg.textContent('#cx-reqs'), /referral was requested/);
    await pg.check('.cx-overlay input[name="referral_requested"]');
    await pg.selectOption('#cx-rr', 'named_introduction'); await pg.fill('#cx-rn', 'Fictional Friend');
    await pg.fill('#cx-ft', 'Called Fictional Friend; 1003 set for Thursday');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true, 'follow-through alone is not a CRM reference');
    assert.match(await pg.textContent('#cx-reqs'), /CRM/);
    await pg.fill('#cx-crm', 'VEL-55501');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), false);
  });
  await step('Failed save is reported and nothing is marked complete', async () => {
    failNetwork.on = true;
    try {
      await pg.click('[data-cx="complete"]');
      await pg.waitForSelector('.cx-toast.bad', { timeout: 8000 });
      assert.match(await pg.textContent('.cx-toast.bad'), /Nothing was saved/);
      assert.equal(await pg.textContent('#cx-save-state'), 'Not saved');
    } finally { failNetwork.on = false; }
    assert.equal((await db("select status from core_tasks where loan_number='99100000002' and task_type='tuesday'"))[0].status, 'attempted');
  });
  await step('Complete Tuesday Update: server-confirmed, locked, referral recorded', async () => {
    const id = await pg.$eval('.cx-overlay', o => o.dataset.task);
    await pg.click('[data-cx="complete"]');
    await pg.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
    const r = (await db('select status, completed_by, referral_response, crm_reference from core_tasks where id=$1', [id]))[0];
    assert.deepEqual(r, { status: 'completed', completed_by: 'Gavin', referral_response: 'named_introduction', crm_reference: 'VEL-55501' });
    await pg.click('#core-today .cx-tile[data-tile="tue-completed"]');
    await openTask(pg, id);
    assert.equal(await pg.locator('[data-cx="complete"]').count(), 0); assert.match(await pg.textContent('.cx-overlay'), /Completed — referral received/);
    await pg.keyboard.press('Escape');
    await pg.click('#core-worklist [data-tile=""]');
  });
  await step('Server rejects a forged completion that bypasses the CCR ask', async () => {
    const res = await pg.evaluate(async () => {
      const t = window.CoreApp.state.tasks.find(t => t.loan_number === '99100000003' && t.task_type === 'tuesday');
      try { await window.CoreApp._rpc('core_api_save_task', { p_id: t.id, p_version: t.row_version, p_patch: { status: 'completed', borrower_outcome: 'conversation', conversation_at: new Date().toISOString(), borrower_notes: 'x'.repeat(30) } }); return 'accepted'; }
      catch (e) { return e.message; }
    });
    assert.match(res, /CORE_VALIDATION/);
  });
  await step('Refi without a buyer agent and the overdue update both complete', async () => {
    await openTask(pg, await taskId('99100000003', 'tuesday'));
    await fillTuesday(pg, { agent: 'no_buyer_agent' });
    await pg.click('[data-cx="complete"]'); await pg.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
    for (const t of await db("select id from core_tasks where loan_number='99100000001' and task_type='tuesday' order by due_date")) {
      await openTask(pg, t.id); await fillTuesday(pg);
      await pg.click('[data-cx="complete"]'); await pg.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
    }
  });
  await step('Client concern on pre-closing: escalated for resolution, not completed', async () => {
    const pre = await taskId('99100000002', 'preclose');
    await openTask(pg, pre);
    await pg.selectOption('#cx-bo', 'conversation'); await pg.selectOption('#cx-cs', 'unresolved');
    await pg.fill('#cx-cn', 'Borrower upset that cash to close increased by $400');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true);
    await pg.click('[data-cx="show-exception"]');
    await pg.fill('#cx-er', 'Escalated to Mack; callback scheduled after the fee review');
    await pg.fill('#cx-nd', L.addDays(today, 1));
    await pg.click('[data-cx="save-exception"]');
    await pg.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
    const r = (await db('select status, concern_status, escalated, referral_requested from core_tasks where id=$1', [pre]))[0];
    assert.deepEqual(r, { status: 'exception', concern_status: 'unresolved', escalated: true, referral_requested: false });
  });
  await step("Complete Today's Tuesday Updates succeeds once every update is complete", async () => {
    await pg.waitForFunction(() => !document.querySelector('[data-cx="signoff-tuesday"]').disabled, null, { timeout: 8000 });
    await pg.click('[data-cx="signoff-tuesday"]');
    await pg.waitForFunction(() => /completed/.test(document.querySelector('[data-cx="signoff-tuesday"]').textContent), null, { timeout: 8000 });
    assert.equal((await db("select count(*)::int n from core_day_signoffs where lp='Gavin' and work_date=$1", [today]))[0].n, 1);
  });
  await step('30-day call: PCR ask required; completes; 60-day untouched', async () => {
    const id = await taskId('99100000006', 'pc30');
    await openTask(pg, id);
    assert.equal(await pg.locator('#cx-agent').count(), 0);
    await pg.selectOption('#cx-bo', 'conversation');
    const boxes = await pg.$$('.cx-overlay [data-check]'); assert.equal(boxes.length, 6);
    for (const c of boxes) await c.check();
    await pg.fill('#cx-bn', 'First statement received; autopay set up; no servicing questions');
    await pg.selectOption('#cx-rr', 'asked_no_referral');
    await pg.fill('#cx-na', '60-day call'); await pg.fill('#cx-nd', L.addDays(today, 30));
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), true, 'PCR not requested');
    await pg.check('.cx-overlay input[name="referral_requested"]');
    assert.equal(await pg.isDisabled('[data-cx="complete"]'), false);
    await pg.click('[data-cx="complete"]'); await pg.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
    assert.equal((await db('select status from core_tasks where id=$1', [id]))[0].status, 'completed');
    assert.equal((await db("select status from core_tasks where task_key='PC60:99100000006'"))[0].status, 'open');
  });
  await step('Stale edit from another device is rejected, not overwritten', async () => {
    const id = await taskId('99200000001', 'pc30');
    await openTask(pg, id);
    await db("update core_tasks set borrower_notes='Changed on another device by Gavin phone' where id=$1", [id]);
    await pg.fill('#cx-bn', 'Desktop edit that should not silently overwrite');
    await pg.click('[data-cx="save"]');
    await pg.waitForSelector('.cx-toast.bad', { timeout: 8000 });
    assert.match(await pg.textContent('.cx-toast.bad'), /changed on another device/);
    assert.equal((await db('select borrower_notes from core_tasks where id=$1', [id]))[0].borrower_notes, 'Changed on another device by Gavin phone');
    await pg.evaluate(() => { const o = document.querySelector('.cx-overlay'); if (o) o.__dirty = false; }); await pg.keyboard.press('Escape');
  });
  await step('Data persists across refresh; only the team key is kept on the device', async () => {
    await pg.reload(); await pg.waitForFunction(() => window.CoreApp && window.CoreApp.state.loadedAt, null, { timeout: 15000 });
    await openLp(pg, 'Gavin'); await pg.waitForSelector('#core-today .cx-tiles');
    assert.match(await pg.textContent('#core-today'), /Tuesday Updates completed/);
    const ls = await pg.evaluate(() => Object.keys(localStorage).filter(k => /^core\./.test(k)));
    assert.ok(ls.every(k => k === 'core.teamKey.v1' || k === 'core.supporting.open'), JSON.stringify(ls));
  });
  await pg.screenshot({ path: path.join(OUT, 'desktop-lp-today.png'), fullPage: true });
  await step('Existing scorecard: complete, save, edit and persist for Karen', async () => {
    await openLp(pg, 'Karen');
    await pg.waitForSelector('#core-scorecard-card');
    assert.match(await pg.textContent('#core-scorecard-card'), /Due this week/);
    await pg.click('#core-scorecard-card [data-cx="scorecard"]');
    await pg.waitForSelector('#view-scorecards.active #lpsc-edit-body input[data-key]', { timeout: 15000 });
    const cell = () => pg.locator('#lpsc-edit-body input[data-key="past_client_talks"][data-day="Mon"]:visible').first();
    await cell().fill('3');
    await pg.evaluate(() => lpscSaveEdit());
    await pg.waitForFunction(() => /Saved/.test(document.getElementById('lpsc-save-msg').textContent), null, { timeout: 10000 });
    let row = (await db("select data from lp_scorecards where person='Karen'"))[0];
    assert.equal(row.data.past_client_talks_Mon, 3);
    await pg.waitForTimeout(800);
    await cell().fill('5'); await pg.evaluate(() => lpscSaveEdit());
    await pg.waitForFunction(() => /Saved/.test(document.getElementById('lpsc-save-msg').textContent), null, { timeout: 10000 });
    row = (await db("select data from lp_scorecards where person='Karen'"))[0];
    assert.equal(row.data.past_client_talks_Mon, 5, 'edit persisted');
    await openLp(pg, 'Karen'); await pg.evaluate(() => { window.CoreApp.state.scorecards = null; return window.CoreApp.reload(); });
    await pg.waitForFunction(() => /Entered this week/.test((document.querySelector('#core-scorecard-card') || {}).textContent || ''), null, { timeout: 10000 });
  });
  await step('Cross-device: Mack sees Gavin\'s completions and the CCR introduction', async () => {
    await pm.evaluate(() => window.CoreApp.reload());
    await pm.click('#view-core-command [data-tab="overview"]');
    assert.equal(await pm.$eval('#view-core-command .cx-tile[data-tile="rec:tue-intros"] .t-val', e => e.textContent), '1');
  });
  await step('Corrective action: Mack assigns, Gavin resolves on his homepage, Mack verifies', async () => {
    await pm.click('#view-core-command [data-tab="corrections"]');
    await pm.click('[data-newcorr]');
    await pm.selectOption('.cx-modal [name="lp"]', 'Gavin');
    await pm.fill('.cx-modal [name="issue"]', 'Referral ask not documented on pre-closing call');
    await pm.click('.cx-modal button[type=submit]'); await pm.waitForSelector('.cx-modal', { state: 'detached' });
    await openLp(pg, 'Gavin'); await pg.evaluate(() => window.CoreApp.reload());
    await pg.waitForSelector('[data-resolve-corr]', { timeout: 8000 });
    await pg.click('[data-resolve-corr]');
    await pg.waitForFunction(() => !document.querySelector('[data-resolve-corr]'), null, { timeout: 8000 });
    await pm.evaluate(() => window.CoreApp.reload()); await pm.click('#view-core-command [data-tab="corrections"]');
    await pm.click('[data-verify]');
    await pm.waitForFunction(() => /verified/.test(document.querySelector('#view-core-command').textContent), null, { timeout: 8000 });
    const c = (await db('select resolved_by, verified_by from core_corrections'))[0];
    assert.deepEqual(c, { resolved_by: 'Gavin', verified_by: 'Mack' });
  });
  await step('Client concern is visible to Mack', async () => {
    await pm.click('#view-core-command [data-tab="overview"]');
    await pm.click('#view-core-command .cx-tile[data-tile="rec:concerns"]');
    assert.match(await pm.textContent('#view-core-command'), /Testcase, Closingsoon/);
  });
  await step('Needs Review historical calls are closed in bulk by Mack', async () => {
    await pm.click('#view-core-command [data-tab="overview"]');
    await pm.click('#view-core-command .cx-tile[data-tile="rec:review"]');
    await pm.click('#view-core-command [data-selall]'); await pm.click('[data-bulk-review]');
    await pm.waitForFunction(() => window.CoreApp.state.tasks.every(t => t.status !== 'needs_review'), null, { timeout: 8000 });
    assert.equal((await db("select count(*)::int n from core_tasks where status='needs_review'"))[0].n, 0);
  });
  await step('Production tab: Velocify funnel and funding source classification', async () => {
    await pm.selectOption('[data-cx="period"]', 'year');
    await pm.click('#view-core-command [data-tab="production"]');
    await pm.waitForFunction(() => /Leads received\s*\d/.test(document.querySelector('#view-core-command').textContent), null, { timeout: 10000 });
    await pm.click('#view-core-command .cx-tile[data-tile="rec:prod-funded"]');
    await pm.selectOption('select[data-src-loan="99200000004"]', 'past_client');
    await pm.waitForFunction(() => /Funding source saved/.test((document.querySelector('.cx-toast') || {}).textContent || ''), null, { timeout: 8000 });
    assert.equal((await db("select funding_source_category c from core_loans where loan_number='99200000004'"))[0].c, 'past_client');
  });
  errM.push(...eM); errG.push(...eG);

  // ------------------------------------------------------------ Daniel (leader link)
  const ctxD = await browser.newContext({ ...ctxOpts, viewport: { width: 1280, height: 900 } }); await wire(ctxD);
  const pd = await ctxD.newPage(); const eD = track(pd);
  await step('Daniel: 2027 targets, Not started / Data unavailable instead of zeros, drill-down', async () => {
    await pd.goto(base + '/index.html#team=' + KEYS.team); await pd.waitForFunction(() => window.CoreApp && window.CoreApp.state.tier === 'team', null, { timeout: 15000 });
    await nav(pd, 'core-plan');
    await pd.waitForFunction(() => /A-level incl\. Channel/.test(document.querySelector('#view-core-plan').textContent), null, { timeout: 20000 });
    const t = await pd.textContent('#view-core-plan');
    for (const s of ['Realtor referrals', 'Rockford Homes', 'Current-client referrals', 'Past-client referrals', 'Returning past clients', 'Personal-friend referrals', 'Advertising']) assert.match(t, new RegExp(s));
    assert.match(t, /stretch 420/); assert.match(t, /Target 2200/); assert.match(t, /Target 1800/);
    if (today < '2027-01-01') { assert.match(t, /Funded loans\s*Not started/); assert.doesNotMatch(t, /Funded loans\s*0\b/); }
    assert.match(t, /A-level incl\. Channel/); assert.match(t, /Scorecards this week/);
    assert.doesNotMatch(t, /NaN|undefined/);
    await pd.click('[data-per="quarter"]'); assert.match(await pd.textContent('#view-core-plan'), /Target 80/);
    await pd.click('[data-per="month"]'); assert.doesNotMatch(await pd.textContent('#view-core-plan'), /NaN|undefined/);
    await pd.click('[data-per="year"]');
    await pd.click('[data-plan-rec="plan-ccr"]');
    await pd.waitForSelector('#view-core-command.active');
    assert.match(await pd.textContent('#view-core-command'), /CCR introductions/);
  });
  await step('Without the manager passcode the Command Center is read-only (UI and server)', async () => {
    await pd.click('#view-core-command [data-tab="data"]'); assert.equal(await pd.locator('input[data-imp]').count(), 0);
    await pd.click('#view-core-command [data-tab="unassigned"]'); assert.equal(await pd.locator('[data-assign-go]').count(), 0);
    const r = await pd.evaluate(async () => { try { await window.CoreApp._rpc('core_assign_loans', { p_loans: ['99100000005'], p_lp: 'Karen' }); return 'ok'; } catch (e) { return e.message; } });
    assert.match(r, /CORE_FORBIDDEN/);
  });
  await nav(pd, 'core-plan'); await pd.waitForTimeout(500);
  await pd.screenshot({ path: path.join(OUT, 'desktop-2027-plan.png'), fullPage: true });
  errD.push(...eD);

  // ------------------------------------------------------------ mobile parity
  for (const [label, dev] of [['iPhone', devices['iPhone 13']], ['Android', devices['Pixel 7']]]) {
    const ctx = await browser.newContext({ ...dev, ...ctxOpts }); await wire(ctx);
    const p = await ctx.newPage(); const errs = track(p);
    await step(label + ': covering LP opens Karen\'s borrowers from the team link', async () => {
      await p.goto(base + '/index.html#team=' + KEYS.team); await p.waitForFunction(() => window.CoreApp && window.CoreApp.state.loadedAt, null, { timeout: 15000 });
      await openLp(p, 'Karen'); await p.waitForSelector('#core-today .cx-tiles', { timeout: 15000 });
      await noHorizontalOverflow(p);
      const box = await p.$eval('#core-today .cx-tile', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      assert.ok(box.w >= 140 && box.h >= 80, 'tile tap target ' + JSON.stringify(box));
      assert.ok(await p.$eval('#core-today .cx-tile .t-label', e => parseFloat(getComputedStyle(e).fontSize)) >= 12, 'readable labels');
    });
    if (label === 'iPhone') await step(label + ': tile → worklist → drawer → complete a Tuesday Update', async () => {
      await p.tap('#core-today .cx-tile[data-tile="tue-remaining"]');
      await p.waitForSelector('#core-worklist [data-open-task]');
      await p.locator('#core-worklist [data-open-task]', { hasText: 'Tuesday Update' }).first().tap();
      await p.waitForSelector('.cx-overlay form');
      assert.ok(await p.$eval('.cx-drawer', e => e.getBoundingClientRect().width) >= 380);
      await fillTuesday(p);
      await p.tap('[data-cx="complete"]'); await p.waitForSelector('.cx-overlay', { state: 'detached', timeout: 10000 });
      const r = (await db("select status, owner_lp, completed_by from core_tasks where loan_number='99100000004' and task_type='tuesday'"))[0];
      assert.deepEqual(r, { status: 'completed', owner_lp: 'Karen', completed_by: 'Karen' });
    });
    await step(label + ': Command Center, scorecards and 2027 Plan render without overflow', async () => {
      await p.evaluate(k => { localStorage.setItem('core.mgrKey.v1', k); }, KEYS.manager);
      await p.reload(); await p.waitForFunction(() => window.CoreApp && window.CoreApp.state.tier === 'manager', null, { timeout: 15000 });
      await nav(p, 'core-command'); await p.waitForSelector('#view-core-command .cx-tabs');
      await noHorizontalOverflow(p);
      await p.tap('#view-core-command .cx-tile[data-tile="rec:tue-req"]'); await p.waitForSelector('#view-core-command table.cx-t');
      await p.tap('#view-core-command [data-tab="scorecards"]'); await p.waitForSelector('[data-cx="export-sc"]');
      await noHorizontalOverflow(p);
      await nav(p, 'core-plan'); await p.waitForSelector('#view-core-plan .cx-tiles');
      await noHorizontalOverflow(p);
      await p.screenshot({ path: path.join(OUT, label.toLowerCase() + '-plan.png') });
      await openLp(p, 'Karen'); await p.waitForSelector('#core-today .cx-tiles');
      await p.screenshot({ path: path.join(OUT, label.toLowerCase() + '-lp-today.png'), fullPage: true });
    });
    await step(label + ': no CORE runtime errors', async () => { assert.deepEqual(coreErrors(errs), []); });
    await ctx.close();
  }

  await step('No CORE module runtime errors in desktop sessions', async () => {
    fs.writeFileSync(path.join(OUT, 'page-errors.txt'), [].concat(errM, errG, errD).join('\n'));
    assert.deepEqual(coreErrors([].concat(errM, errG, errD)), []);
  });
  }

  // ------------------------------------------------------------ regression vs. the current production file
  if (BASELINE && (!ONLY || ONLY === 'regression')) {
    const routes = ['snapshot', 'portfolio', 'facetime', 'leads', 'lp-conversion', 'partner-growth', 'agent-health', 'co-marketing', 'file-integrity', 'income', 'data-hub', 'standard', 'admin'];
    async function runRoutes(url) {
      const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 1366, height: 900 } }); await wire(ctx);
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
      await p.goto(url); await p.waitForTimeout(2500);
      const out = {};
      for (const r of routes) {
        await p.evaluate(r => { const b = document.querySelector('.ct-nav-btn[data-route="' + r + '"]'); if (b) window.lpv2Route(r, b); }, r);
        await p.waitForTimeout(300);
        out[r] = await p.evaluate(() => (document.querySelector('.view.active') || {}).id || null);
      }
      for (const lp of L.LPS) {
        await p.evaluate(lp => { const b = [...document.querySelectorAll('.ct-nav-btn[data-lp]')].find(x => x.dataset.lp === lp); window.lpv2Route('lp', b); }, lp);
        await p.waitForTimeout(500);
        out['lp-' + lp] = await p.evaluate(() => ({ view: (document.querySelector('.view.active') || {}).id, ids: ['lp-hero-name', 'lp-facetime-focus', 'lp-rm-flags-for-you-list', 'lp-rm-responses', 'lp-call-list'].map(i => !!document.getElementById(i)) }));
        await p.evaluate(lp => window.lpv4OpenMyScorecard(lp), lp); await p.waitForTimeout(600);
        out['sc-' + lp] = await p.evaluate(() => ({ view: (document.querySelector('.view.active') || {}).id, edit: getComputedStyle(document.getElementById('lpsc-edit-wrap')).display !== 'none', inputs: document.querySelectorAll('#lpsc-edit-body input[data-key]').length }));
      }
      await ctx.close();
      return { out, errs: [...new Set(errs)] };
    }
    const before = await runRoutes(base + '/baseline.html');
    const after = await runRoutes(base + '/index.html');
    fs.writeFileSync(path.join(OUT, 'regression.json'), JSON.stringify({ before, after }, null, 1));
    await step('Regression: every existing route, LP page and scorecard behaves as before', async () => { assert.deepEqual(after.out, before.out); });
    await step('Regression: no new page errors compared with the current production file', async () => {
      assert.deepEqual(after.errs.filter(e => !before.errs.includes(e)), []);
    });
  }

  await browser.close(); site.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + results.filter(r => r[0] === 'PASS').length + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
