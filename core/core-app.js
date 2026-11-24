/* CORE Team LP Tracker - execution module.
 * LP homepage (Tuesday Updates, 30/60/90 calls, My Scorecard), Mack's Production
 * Command Center and Daniel's 2027 Plan dashboard.
 *
 * Access: a private team link (#team=<key>) unlocks borrower data. The key is checked
 * by the database on every call (core_api_* functions); the tables themselves are not
 * readable with the public browser key. Selecting a name in the menu is attribution only.
 * The shared server is authoritative: no borrower data is cached in the browser; only the
 * team key is remembered on the device. Saves report success only after the server
 * returns the committed record.
 */
(function () {
  'use strict';
  var L = window.CoreLogic;
  if (!L) { console.error('CORE module: core-logic.js did not load'); return; }

  var SB_URL = window.SB_URL || 'https://uclucbdkjqyqdvifyptx.supabase.co';
  var SB_KEY = window.SB_KEY || '';
  var KEY_STORE = 'core.teamKey.v1', MGR_STORE = 'core.mgrKey.v1';
  var LPS = L.LPS;
  var TIER_NAME = { team: 'Loan Partner', manager: 'Mack', leader: 'Daniel', admin: 'Director' };

  // ================================================================ utilities
  function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function today() { return L.todayIso(); }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: p[0] !== today().slice(0, 4) ? 'numeric' : undefined, timeZone: 'UTC' });
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts); if (isNaN(d)) return '—';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: L.TZ });
  }
  function relDays(iso) {
    var n = L.daysBetween(today(), iso);
    if (n === 0) return 'Due today'; if (n === 1) return 'Tomorrow'; if (n === -1) return '1 day overdue';
    return n < 0 ? Math.abs(n) + ' days overdue' : 'In ' + n + ' days';
  }
  function localInputNow() { var d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function toLocalInput(ts) { if (!ts) return ''; var d = new Date(ts); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function fromLocalInput(v) { if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d.toISOString(); }
  function toast(msg, bad) {
    $all('.cx-toast').forEach(function (t) { t.remove(); });
    var t = document.createElement('div'); t.className = 'cx-toast' + (bad ? ' bad' : ''); t.setAttribute('role', bad ? 'alert' : 'status');
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 8000 : 3500);
  }
  function friendlyServerError(err) {
    var m = String((err && (err.message || err)) || 'Unknown error');
    var v = m.match(/CORE_(?:VALIDATION|FORBIDDEN|CONFLICT):\s*(.*)$/);
    if (v) return v[1].split(' | ').map(L.friendlyError).join('; ');
    if (/Failed to fetch|NetworkError|Load failed|did not respond/i.test(m)) return 'Could not reach the shared server. Nothing was saved. Check the connection and try again.';
    return m;
  }
  function typeLabel(t) { return (L.TASK_TYPES[t] || {}).label || t; }
  function borrowerOf(task) { var l = S.loans[task.loan_number]; return (l && l.borrower_name) || 'Loan ' + task.loan_number; }
  function owner(task) { return L.effectiveOwner(task); }
  function lpLabel(lp) { return lp || 'Unassigned'; }
  function sortWork(a, b) { return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : borrowerOf(a).localeCompare(borrowerOf(b)); }
  function opts(list, val, blank) {
    return (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function isOpen(t) { return t.status === 'open' || t.status === 'attempted'; }
  function pctOf(a, b) { return b ? Math.round(100 * a / b) : null; }

  // ================================================================ team access + API
  function readHashKey() {
    var h = String(location.hash || '').replace(/^#/, ''); if (!h) return null;
    var p = new URLSearchParams(h), k = p.get('team');
    if (!k) return null;
    p.delete('team');
    var rest = p.toString();
    try { history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : '')); } catch (e) {}
    return k.trim();
  }
  var teamKey = null;
  try { teamKey = readHashKey() || localStorage.getItem(KEY_STORE) || null; if (teamKey) localStorage.setItem(KEY_STORE, teamKey); } catch (e) { teamKey = teamKey || null; }
  var mgrKey = null;
  try { mgrKey = localStorage.getItem(MGR_STORE) || null; } catch (e) {}
  function setKey(k) { teamKey = k || null; try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {} }
  function setMgrKey(k) { mgrKey = k || null; try { if (k) localStorage.setItem(MGR_STORE, k); else localStorage.removeItem(MGR_STORE); } catch (e) {} }
  function activeKey() { return mgrKey || teamKey; }
  function forgetDevice() { setKey(null); setMgrKey(null); S.tier = null; S.tasks = []; S.loans = {}; S.loadedAt = null; S.error = null; renderAll(); }

  function rpc(fn, args, timeoutMs) {
    var ctl = new AbortController(); var timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 30000);
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', signal: ctl.signal,
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
          if (!r.ok) { var err = new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
          return j;
        });
      })
      .catch(function (e) { if (e && e.name === 'AbortError') throw new Error('Failed to fetch: the shared server did not respond in time'); throw e; })
      .finally(function () { clearTimeout(timer); });
  }
  function anonGet(path) {
    return fetch(SB_URL + '/rest/v1/' + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function actor() {
    var lp = currentLpPage();
    if (S.tier === 'team') return lp || lastLp || 'Team';
    return TIER_NAME[S.tier] || 'Team';
  }
  function api(fn, args) { return rpc(fn, Object.assign({ p_key: activeKey() }, args || {})); }
  function apiAct(fn, args) { return rpc(fn, Object.assign({ p_key: activeKey(), p_actor: actor() }, args || {})); }

  // ================================================================ state
  var S = { tier: null, tasks: [], loans: {}, coverage: [], corrections: [], signoffs: [], imports: [], loadedAt: null, loading: null, error: null,
    lpFilter: null, cmdTab: 'overview', tuesdayStatus: 'open', cmdPeriod: 'week', records: null, planPeriod: 'year', ext: null, scorecards: null, _rec: {} };
  function isManager() { return S.tier === 'manager' || S.tier === 'admin'; }
  function canWrite() { return S.tier === 'team' || isManager(); }
  function hasImport(kind) { return S.imports.some(function (r) { return r.kind === kind; }); }

  function loadAll() {
    if (!activeKey()) { S.tier = null; renderAll(); return Promise.resolve(); }
    if (S.loading) return S.loading;
    S.loading = api('core_api_load').then(function (d) {
      S.tier = d.tier; S.tasks = d.tasks || []; S.loans = {};
      (d.loans || []).forEach(function (l) { S.loans[l.loan_number] = l; });
      S.coverage = d.coverage || []; S.corrections = d.corrections || []; S.signoffs = d.signoffs || []; S.imports = d.imports || [];
      S.loadedAt = new Date(); S.error = null;
    }).catch(function (e) {
      S.error = friendlyServerError(e);
      if (/not valid|access link required/i.test(String(e.message))) {
        if (mgrKey) { setMgrKey(null); S.error = 'The manager passcode has changed. Sign in again for manager actions.'; S.loading = null; return loadAll(); }
        setKey(null); S.tier = null;
      }
    }).then(function () { return loadScorecards(); }).then(function () { S.loading = null; renderAll(); }, function () { S.loading = null; renderAll(); });
    return S.loading;
  }
  // Existing LP scorecards: lp_scorecards table and methodology are unchanged.
  function loadScorecards(force) {
    if (!force && S.scorecards && Date.now() - S.scorecards.at < 60000) return Promise.resolve(S.scorecards);
    var from = L.addDays(L.weekMonday(today()), -7 * 11);
    return anonGet('lp_scorecards?select=person,week_key,data&week_key=gte.' + from + '&order=week_key.desc&limit=2000')
      .then(function (rows) { S.scorecards = { at: Date.now(), rows: Array.isArray(rows) ? rows : [], ok: Array.isArray(rows) }; })
      .catch(function () { S.scorecards = { at: Date.now(), rows: [], ok: false }; })
      .then(function () { markScorecardNav(); return S.scorecards; });
  }
  // The tracker's own scorecard definition (LPSC_METRICS_MAP) is the source of truth for metrics and goals.
  function liveMetrics(lp) { try { return (typeof LPSC_METRICS_MAP !== 'undefined' && LPSC_METRICS_MAP[lp]) || null; } catch (e) { return null; } }
  function scorecardFor(lp, week) {
    if (!S.scorecards || !S.scorecards.ok) return null;
    return S.scorecards.rows.find(function (r) { return r.person === lp && String(r.week_key).slice(0, 10) === week; }) || false;
  }
  function markScorecardNav() {
    var wk = L.weekMonday(today());
    $all('.ct-nav-btn[data-lp]').forEach(function (b) {
      var due = scorecardFor(b.dataset.lp, wk) === false, dot = b.querySelector('.cx-due-dot');
      if (due && !dot) { dot = document.createElement('span'); dot.className = 'cx-due-dot'; dot.title = 'Scorecard not entered this week'; dot.setAttribute('aria-label', 'Scorecard due'); b.appendChild(dot); }
      if (!due && dot) dot.remove();
    });
  }
  function upsertTaskLocal(row) {
    var i = S.tasks.findIndex(function (t) { return t.id === row.id; });
    if (row.status === 'cancelled') { if (i >= 0) S.tasks.splice(i, 1); return; }
    if (i >= 0) S.tasks[i] = row; else S.tasks.push(row);
  }

  // ================================================================ shell: styles, nav, views
  var lastLp = null;
  function installClientCallScripts() {
    var anchor = $('#scriptsModal #scriptNoResults');
    if (!anchor || $('#scriptsModal [data-script-cat="core-client-calls"]')) return;
    var category = document.createElement('details');
    category.className = 'script-cat cx cx-supporting';
    category.dataset.scriptCat = 'core-client-calls';
    category.style.marginBottom = '10px';
    category.innerHTML = '<summary>CORE Team client calls</summary><div class="script-cat-body" style="padding:14px">' +
      ['contract', 'tuesday', 'preclose', 'pc30', 'pc60', 'pc90'].map(function (type) {
        var task = L.TASK_TYPES[type];
        return '<details class="cx-card" data-core-script="' + type + '" style="margin-bottom:8px;padding:10px 14px">' +
          '<summary style="cursor:pointer"><b>' + esc(task.label) + '</b> · ' + esc(task.referral) + '</summary>' +
          '<p class="cx-note">' + esc(L.SCRIPT_NOTES[type]) + '</p><ol>' +
          L.CHECKS[type].map(function (check) { return '<li>' + esc(check[1]) + '</li>'; }).join('') +
          '</ol></details>';
      }).join('') + '<p class="cx-note">Monthly post-closing call block: first Thursday at 1 p.m.</p></div>';
    anchor.after(category);
  }

  function injectShell() {
    installClientCallScripts();
    if (!$('link[data-core-css]')) {
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = './core/core-app.css?v=20261124b'; link.setAttribute('data-core-css', '1');
      document.head.appendChild(link);
    }
    var sections = $all('.ct-nav-section');
    var label = function (s) { return ((s.querySelector('.ct-nav-label') || {}).textContent || ''); };
    var team = sections.find(function (s) { return /TEAM/.test(label(s)); });
    if (team && !$('[data-route="core-command"]')) {
      var b1 = navBtn('core-command', '◆', 'Command Center'), b2 = navBtn('core-plan', '◇', 'Daniel’s 2027 Plan');
      var pm = team.querySelector('[data-route="production-manager"]');
      team.insertBefore(b1, pm || null); team.insertBefore(b2, b1.nextSibling);
    }
    var lpSec = sections.find(function (s) { return /LOAN PARTNERS/.test(label(s)); });
    if (lpSec && !$('[data-route="core-scorecard"]')) {
      var sc = document.createElement('button'); sc.type = 'button'; sc.className = 'who-btn ct-nav-btn'; sc.dataset.route = 'core-scorecard';
      sc.innerHTML = '<span class="ct-nav-icon">▣</span><span>My Scorecard</span>';
      sc.addEventListener('click', function () { openMyScorecard(currentLpPage() || lastLp); });
      lpSec.appendChild(sc);
    }
    var anchor = $all('.view')[0];
    ['core-command', 'core-plan'].forEach(function (id) {
      if (!document.getElementById('view-' + id)) {
        var v = document.createElement('div'); v.className = 'view cx cx-view'; v.id = 'view-' + id;
        (anchor && anchor.parentNode || document.body).appendChild(v);
      }
    });
    var host = $('#view-lp'), page = host && host.querySelector('.ct-lp-page');
    if (page && !$('#core-today')) {
      var head = page.querySelector('.ct-page-head');
      var tdy = document.createElement('section'); tdy.id = 'core-today'; tdy.className = 'cx';
      page.insertBefore(tdy, head ? head.nextSibling : page.firstChild);
      var det = document.createElement('details'); det.id = 'core-supporting'; det.className = 'cx cx-supporting';
      det.innerHTML = '<summary><span>Other daily priorities</span><span class="cx-sub">Work order, lead and preapproval follow-ups, new builds, Face Time, scorecard detail and team handoffs</span></summary>';
      $all(':scope > section.ct-card', page).forEach(function (n) { det.appendChild(n); });
      page.insertBefore(det, tdy.nextSibling);
      try { det.open = localStorage.getItem('core.supporting.open') === '1'; } catch (e) {}
      det.addEventListener('toggle', function () { try { localStorage.setItem('core.supporting.open', det.open ? '1' : '0'); } catch (e) {} });
    }
    if (host && !host.__coreObs) {
      host.__coreObs = new MutationObserver(function () { if (host.classList.contains('active')) setTimeout(renderToday, 0); });
      host.__coreObs.observe(host, { attributes: true, attributeFilter: ['class'] });
      setInterval(function () { var lp = currentLpPage(); if (lp && lp !== renderedLp) renderToday(); }, 400);
    }
  }
  function navBtn(route, icon, text) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'who-btn ct-nav-btn'; b.dataset.route = route;
    b.innerHTML = '<span class="ct-nav-icon">' + icon + '</span><span>' + esc(text) + '</span>';
    b.addEventListener('click', function () { openView(route, b); });
    return b;
  }
  function openMyScorecard(lp) {
    if (lp && typeof window.lpv4OpenMyScorecard === 'function') { window.lpv4OpenMyScorecard(lp); return; }
    if (typeof window.openScorecardsView === 'function') window.openScorecardsView();
  }
  function openView(id, btn) {
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    $all('.ct-nav-btn,.who-btn').forEach(function (b) { b.classList.remove('active'); });
    var v = document.getElementById('view-' + id); if (v) v.classList.add('active');
    var b = btn || $('.ct-nav-btn[data-route="' + id + '"]'); if (b) b.classList.add('active');
    try { window.scrollTo(0, 0); } catch (e) {}
    if (id === 'core-command') renderCommand(); else renderPlan();
    if (activeKey() && (!S.loadedAt || Date.now() - S.loadedAt > 30000)) loadAll();
  }
  function currentLpPage() {
    var v = $('#view-lp');
    return (v && v.classList.contains('active') && typeof window.currentUser === 'string' && LPS.indexOf(window.currentUser) >= 0) ? window.currentUser : null;
  }
  function renderAll() {
    if ($('#view-lp') && $('#view-lp').classList.contains('active')) renderToday();
    if ($('#view-core-command') && $('#view-core-command').classList.contains('active')) renderCommand();
    if ($('#view-core-plan') && $('#view-core-plan').classList.contains('active')) renderPlan();
    if ($('#view-production-manager.active')) renderCoaching();
    var d = $('.cx-overlay[data-task]'); if (d && !d.__dirty) renderDrawer(d.dataset.task);
  }

  // ================================================================ team access card
  function accessCard(purpose) {
    return '<div class="cx-card cx-signin"><div class="cx-kicker">Private team access</div><h3 style="margin-top:4px">' + esc(purpose) + '</h3>' +
      (S.error ? '<div class="cx-err" style="margin-top:12px">' + esc(S.error) + '</div>' : '') +
      '<p class="cx-note" style="margin-top:8px">Open the CORE team link, or paste it here once on this device. Borrower information is never shown without it.</p>' +
      '<form data-cx="access"><label class="cx-f" for="cx-key">Team link or access key</label><input id="cx-key" type="password" autocomplete="off" spellcheck="false" required>' +
      '<div class="cx-row" style="margin-top:14px"><button class="cx-btn primary" type="submit">Unlock</button></div></form></div>';
  }
  function bindAccess(root) {
    var f = root.querySelector('form[data-cx="access"]');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = f.querySelector('#cx-key').value.trim(), m = v.match(/[#&]team=([^&\s]+)/);
      var k = m ? decodeURIComponent(m[1]) : v;
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Checking…';
      rpc('core_api_session', { p_key: k }).then(function () { setKey(k); S.error = null; return loadAll(); })
        .catch(function (err) { S.error = friendlyServerError(err); renderAll(); });
    });
    $all('[data-cx="forget"]', root).forEach(function (b) { b.addEventListener('click', function () { if (window.confirm('Remove the team access link from this device?')) forgetDevice(); }); });
    $all('[data-open-task]', root).forEach(function (b) { b.addEventListener('click', function (e) { if (e.target.closest('input')) return; openDrawer(b.getAttribute('data-open-task')); }); });
    $all('[data-cx="refresh"]', root).forEach(function (b) { b.addEventListener('click', function () { S.scorecards = null; S.ext = null; loadAll(); }); });
    $all('[data-cx="mgr-off"]', root).forEach(function (b) { b.addEventListener('click', function () { setMgrKey(null); toast('Manager actions turned off on this device.'); loadAll(); }); });
  }
  function syncLine() {
    return '<span class="cx-pill-role">' + (S.loading ? 'Syncing…' : S.loadedAt ? 'Synced ' + esc(fmtTime(S.loadedAt)) : '') +
      (isManager() ? ' · Manager actions on · <button type="button" class="cx-link" data-cx="mgr-off">Manager sign-out</button>' : '') +
      ' · <button type="button" class="cx-link" data-cx="refresh">Refresh</button> · <button type="button" class="cx-link" data-cx="forget">Forget this device</button></span>';
  }
  function managerSignIn() {
    var code = window.prompt('Manager passcode'); if (!code) return;
    rpc('core_api_session', { p_key: code.trim() }).then(function (r) {
      if (!r || (r.tier !== 'manager' && r.tier !== 'admin')) throw new Error('CORE_FORBIDDEN: That passcode does not unlock manager actions.');
      setMgrKey(code.trim()); toast('Manager actions unlocked on this device.'); S.loadedAt = null; return loadAll();
    }).catch(function (e) { toast(friendlyServerError(e), true); });
  }

  // ================================================================ LP homepage
  function tileHtml(key, label, value, foot, cls, on) {
    return '<button type="button" class="cx-tile ' + (cls || '') + (on ? ' on' : '') + '" data-tile="' + esc(key) + '"><span class="t-label">' + esc(label) + '</span><span class="t-val">' + value + '</span><span class="t-foot">' + (foot || '') + '</span></button>';
  }
  function countOrComplete(n, ready) { return !ready ? 'No data' : n === 0 ? 'Complete' : String(n); }
  function stateCls(n, ready, alertWhenAny) { return !ready ? 'is-na' : n === 0 ? 'is-complete' : alertWhenAny ? 'is-alert' : ''; }
  function itemHtml(t) {
    var b = L.bucket(t, today()), loan = S.loans[t.loan_number] || {}, out = L.outcomeLabel(t, today());
    var cls = t.status === 'completed' ? 'chip-done' : t.status === 'needs_review' ? 'chip-purple' : (t.status === 'exception' || t.status === 'attempted') ? 'chip-attempt' : b === 'overdue' ? 'chip-overdue' : 'chip-open';
    var text = t.status === 'open' ? relDays(t.due_date) : out;
    var issue = L.isIssue(t) && t.status !== 'exception' ? '<span class="cx-chip chip-overdue">Client concern</span>' : '';
    var meta = [typeLabel(t.task_type), 'Due ' + fmtDate(t.due_date)];
    if (['tuesday', 'contract', 'preclose'].includes(t.task_type)) {
      if (loan.loan_type) meta.push(loan.loan_type);
      if (t.loan_number) meta.push('Loan ending ' + String(t.loan_number).slice(-4));
    }
    if (t.task_type === 'tuesday' && loan.est_closing_date) meta.push('Closing ' + fmtDate(loan.est_closing_date));
    if (/^pc/.test(t.task_type) && loan.closed_date) meta.push('Closed ' + fmtDate(loan.closed_date));
    if (t.coverage_lp) meta.push('Covering for ' + lpLabel(t.owner_lp));
    return '<button type="button" class="cx-item" data-open-task="' + esc(t.id) + '"><span class="i-name">' + esc(borrowerOf(t)) + '</span>' +
      '<span class="i-meta">' + esc(meta.join(' · ')) + '</span><span class="i-right"><span class="cx-chip ' + cls + '">' + esc(text) + '</span>' + issue + '</span></button>';
  }
  function listHtml(tasks, emptyText) {
    if (!tasks.length) return '<div class="cx-empty">' + esc(emptyText || 'Nothing here.') + '</div>';
    return '<div class="cx-list">' + tasks.slice().sort(sortWork).map(itemHtml).join('') + '</div>';
  }
  function lpBuckets(lp) {
    var t0 = today(), tue = L.tuesdayOf(t0), mine = S.tasks.filter(function (t) { return owner(t) === lp; });
    var tueAssigned = mine.filter(function (t) {
      if (t.task_type !== 'tuesday' || t.status === 'needs_review') return false;
      var res = L.resolvedOn(t);
      return t.plan_week === tue || (isOpen(t) && t.due_date <= t0) || (t.due_date < tue && res && res >= L.addDays(tue, -1));
    });
    var pcDue = function (type) { return mine.filter(function (t) { return t.task_type === type && isOpen(t) && t.due_date <= t0; }); };
    var pcSoon = function (type) { return mine.filter(function (t) { return t.task_type === type && isOpen(t) && t.due_date > t0 && t.due_date <= L.addDays(t0, 7); }); };
    return {
      'tue-assigned': tueAssigned,
      'tue-completed': tueAssigned.filter(function (t) { return t.status === 'completed'; }),
      'tue-remaining': tueAssigned.filter(isOpen),
      'tue-overdue': tueAssigned.filter(function (t) { return isOpen(t) && t.due_date < t0; }),
      'tue-ccr': tueAssigned.filter(function (t) { return t.borrower_outcome === 'conversation' && t.referral_requested; }),
      'tue-intros': tueAssigned.filter(function (t) { return t.referral_response === 'named_introduction'; }),
      pc30: pcDue('pc30'), pc60: pcDue('pc60'), pc90: pcDue('pc90'), soon30: pcSoon('pc30'), soon60: pcSoon('pc60'), soon90: pcSoon('pc90'),
      'pc-overdue': mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && t.due_date < t0; }),
      issues: mine.filter(L.isIssue),
      journey: mine.filter(function (t) { return (t.task_type === 'contract' || t.task_type === 'preclose') && isOpen(t) && t.due_date <= L.addDays(t0, 7); }),
      day: L.daySummary(mine, t0)
    };
  }
  function renderCoaching() {
    var host = $('#core-coaching');
    if (!host) return;
    if (!activeKey() || !S.tier || !S.loadedAt || S.error) {
      host.innerHTML = '<div class="cx-empty" role="status">' + (S.error ? 'Live coaching totals are unavailable. Refresh to retry.' :
        S.loading || activeKey() ? 'Loading live coaching totals…' : 'Open your shared CORE team link to see live coaching totals.') + '</div>';
      return;
    }
    var t0 = today(), closeBy = L.addDays(t0, 7), week = L.weekMonday(t0);
    var rows = LPS.map(function (lp) {
      var b = lpBuckets(lp);
      var closing = b['tue-remaining'].filter(function (task) {
        var loan = S.loans[task.loan_number];
        return loan && loan.est_closing_date && loan.est_closing_date <= closeBy;
      }).length;
      var due = b.pc30.length + b.pc60.length + b.pc90.length;
      var missing = scorecardFor(lp, week);
      var priority = [
        [b.issues.length, 'Resolve client concerns'],
        [closing, 'Update borrowers closing within 7 days or past closing'],
        [b['tue-overdue'].length + b['pc-overdue'].length, 'Clear overdue calls'],
        [b['tue-remaining'].length, 'Finish Tuesday updates'],
        [due, 'Complete due post-closing calls'],
        [missing === false ? 1 : 0, 'Enter this week’s scorecard']
      ];
      var rank = priority.findIndex(function (item) { return item[0] > 0; });
      return { lp: lp, rank: rank < 0 ? priority.length : rank, action: rank < 0 ? 'No urgent action' : priority[rank][1],
        count: rank < 0 ? 0 : priority[rank][0], open: b['tue-remaining'].length, post: due,
        scorecard: missing === null ? 'Unavailable' : missing === false ? 'Missing' : 'Entered' };
    }).sort(function (a, b) { return a.rank - b.rank || b.count - a.count; });
    host.innerHTML = '<div class="cx-card"><div class="cx-head"><h2>Who to coach today</h2></div>' +
      '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>LP</th><th>Start here</th><th>Tuesday open</th><th>Post-closing due</th><th>Scorecard</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><td><button type="button" class="cx-link" data-coach-lp="' + esc(row.lp) + '">' + esc(row.lp) + '</button></td>' +
          '<td><b>' + esc(row.action) + '</b>' + (row.count && row.rank < 5 ? ' · ' + row.count : '') + '</td><td>' +
          row.open + '</td><td>' + row.post + '</td><td>' + esc(row.scorecard) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $all('[data-coach-lp]', host).forEach(function (button) {
      button.addEventListener('click', function () {
        var link = $('.ct-nav-btn[data-lp="' + button.dataset.coachLp + '"]');
        if (link) link.click();
      });
    });
  }

  var TILE_TITLES = { 'tue-assigned': 'Tuesday Updates assigned', 'tue-completed': 'Tuesday Updates completed', 'tue-remaining': 'Tuesday Updates remaining', 'tue-overdue': 'Overdue Tuesday Updates',
    'tue-ccr': 'CCR requests completed', 'tue-intros': 'CCR introductions received', pc30: '30-day calls', pc60: '60-day calls', pc90: '90-day calls', 'pc-overdue': 'Overdue post-closing calls' };

  var publicLpSummary = null, publicLpLoading = null, publicLpFetchedAt = 0, publicLpTile = null;
  function publicLpCard(lp) {
    if (!publicLpLoading && Date.now() - publicLpFetchedAt > 60000) {
      publicLpLoading = rpc('core_api_lp_public_schedule', {})
        .then(function (rows) { publicLpSummary = rows; })
        .catch(function () { publicLpSummary = null; })
        .finally(function () {
          publicLpFetchedAt = Date.now();
          publicLpLoading = null;
          renderToday();
        });
    }
    var counts = publicLpSummary && publicLpSummary.find(function (row) { return row.lp === lp; });
    if (!counts) return '<div class="cx-empty" role="status">' + (publicLpLoading ? 'Loading dashboard…' : 'Dashboard totals are temporarily unavailable.') + '</div>';
    var tiles = [
      ['tuesday', 'Tuesday updates', counts.tuesday_open], ['pc30', '30-day calls due', counts.pc30_due],
      ['pc60', '60-day calls due', counts.pc60_due], ['pc90', '90-day calls due', counts.pc90_due]
    ];
    var selected = publicLpTile && publicLpTile.lp === lp ? publicLpTile.key : null;
    var active = tiles.find(function (item) { return item[0] === selected; });
    var schedule = (counts.schedule || []).filter(function (row) { return row.task_type === selected; });
    return '<div class="cx-card"><h3>Workload summary</h3><div class="cx-tiles" style="margin-top:14px">' +
      tiles.map(function (item) {
        return '<button type="button" class="cx-tile" data-public-tile="' + item[0] + '" aria-expanded="' + (selected === item[0]) + '" aria-controls="core-public-detail"><span class="t-label">' + item[1] + '</span><span class="t-val">' + esc(item[2]) + '</span><span class="t-foot">View schedule</span></button>';
      }).join('') + '</div><div id="core-public-detail"' + (active ? '' : ' hidden') + '>' +
      (active ? '<h3 style="margin-top:14px">' + active[1] + '</h3>' +
        (selected === 'tuesday' ? '<blockquote class="cx-script" style="margin:8px 0">CCR script · ' + esc(L.REFERRAL_7_DAYS) + '</blockquote>' : '<p class="cx-sub">Due and upcoming in the next 7 days</p>') +
        (schedule.length ? '<div class="cx-list">' + schedule.map(function (row) {
          return '<div class="cx-item"><span class="i-name">' + esc(fmtDate(row.due_date)) + '</span><span class="i-meta">' +
            (row.status === 'attempted' ? 'Attempted' : 'Open') + '</span><span class="i-right">' + esc(row.total) + '</span></div>';
        }).join('') + '</div>' : '<div class="cx-empty">No open work in this period.</div>') +
        '<p class="cx-note" style="margin-top:10px">Open your shared team link for borrower records and call logging.</p>' : '') + '</div></div>';
  }

  var renderedLp = null;
  function renderToday() {
    var host = $('#core-today'); if (!host) return;
    var lp = currentLpPage();
    renderedLp = lp;
    if (!lp) { host.innerHTML = ''; return; }
    lastLp = lp;
    var privateView = !!(activeKey() && S.tier);
    var supporting = $('#core-supporting');
    if (supporting) supporting.hidden = !privateView;
    if (!privateView) {
      host.innerHTML = '<div class="cx-stack"><div class="cx-head"><h2>' + esc(lp) + ' · LP Dashboard</h2></div>' + publicLpCard(lp) + '</div>';
      $all('[data-public-tile]', host).forEach(function (button) {
        button.addEventListener('click', function () {
          var key = button.dataset.publicTile;
          publicLpTile = button.getAttribute('aria-expanded') === 'true' ? null : { lp: lp, key: key };
          renderToday();
          $('[data-public-tile="' + key + '"]', host).focus();
        });
      });
      return;
    }
    var t0 = today(), B = lpBuckets(lp), loaded = !!S.loadedAt && !S.error;
    var tr = hasImport('pipeline') && loaded, pr = hasImport('funded_units') && loaded;
    var f = S.lpFilter && S.lpFilter.lp === lp ? S.lpFilter.key : null;
    var signed = S.signoffs.find(function (s) { return s.lp === lp && s.work_date === t0 && s.task_group === 'tuesday'; });
    var att = B['tue-remaining'].filter(function (t) { return t.status === 'attempted'; }).length;
    var tue = '<div class="cx-card"><div class="cx-head"><div><div class="cx-kicker">Primary workflow</div><h3>Tuesday Updates</h3><div class="cx-sub">Borrower first, then the buyer agent. Service first, referral second.</div></div></div>' +
      '<div class="cx-tiles" style="margin-top:14px">' +
      tileHtml('tue-assigned', 'Total assigned', tr ? String(B['tue-assigned'].length) : 'No data', tr ? 'This week plus carried forward' : 'Pipeline report not imported yet', tr ? '' : 'is-na', f === 'tue-assigned') +
      tileHtml('tue-completed', 'Completed', tr ? String(B['tue-completed'].length) : 'No data', 'Conversation and CCR documented', tr ? '' : 'is-na', f === 'tue-completed') +
      tileHtml('tue-remaining', 'Remaining', countOrComplete(B['tue-remaining'].length, tr), tr && att ? att + ' attempted, not yet reached' : '', stateCls(B['tue-remaining'].length, tr), f === 'tue-remaining') +
      tileHtml('tue-overdue', 'Overdue', countOrComplete(B['tue-overdue'].length, tr), tr && B['tue-overdue'].length ? 'Carried forward until completed' : '', stateCls(B['tue-overdue'].length, tr, true), f === 'tue-overdue') +
      tileHtml('tue-ccr', 'CCR requests completed', tr ? String(B['tue-ccr'].length) : 'No data', tr ? 'of ' + B['tue-assigned'].length + ' assigned' : '', tr ? '' : 'is-na', f === 'tue-ccr') +
      tileHtml('tue-intros', 'CCR introductions', tr ? String(B['tue-intros'].length) : 'No data', 'Named introductions received', tr ? '' : 'is-na', f === 'tue-intros') +
      '</div>' + (f && f.indexOf('tue-') === 0 ? worklistHtml(f, B) : (tr && B['tue-remaining'].length ? '<div style="margin-top:14px">' + listHtml(B['tue-remaining']) + '</div>' : '')) +
      '<div class="cx-row" style="margin-top:14px"><button type="button" class="cx-btn accent" data-cx="signoff-tuesday"' + (!tr || B['tue-remaining'].length || signed || !canWrite() ? ' disabled' : '') + '>' + (signed ? '✓ Tuesday Updates completed ' + esc(fmtTime(signed.signed_off_at)) : "Complete Today's Tuesday Updates") + '</button>' +
      (tr && B['tue-remaining'].length && !signed ? '<span class="cx-note">' + B['tue-remaining'].length + ' assigned ' + (B['tue-remaining'].length === 1 ? 'update is' : 'updates are') + ' not complete yet.</span>' : '') + '</div></div>';
    var pc = '<div class="cx-card"><div class="cx-head"><div><div class="cx-kicker">Primary workflow</div><h3>Post-Closing Calls</h3><div class="cx-sub">30, 60 and 90 days after closing. Service questions before the past-client referral ask.</div></div></div>' +
      '<div class="cx-tiles" style="margin-top:14px">' +
      ['pc30', 'pc60', 'pc90'].map(function (k) {
        var n = B[k].length, soon = B['soon' + k.slice(2)].length;
        return tileHtml(k, k.slice(2) + '-day calls', countOrComplete(n, pr), pr ? (n ? 'Due now' : 'None due') + (soon ? ' · ' + soon + ' in next 7 days' : '') : 'Funded Units not imported yet', stateCls(n, pr), f === k);
      }).join('') +
      tileHtml('pc-overdue', 'Overdue calls', countOrComplete(B['pc-overdue'].length, pr), pr && B['pc-overdue'].length ? 'Carried forward until completed' : '', stateCls(B['pc-overdue'].length, pr, true), f === 'pc-overdue') +
      '</div>' + (f && f.indexOf('pc') === 0 ? worklistHtml(f, B) : (function () { var due = B.pc30.concat(B.pc60, B.pc90); return pr && due.length ? '<div style="margin-top:14px">' + listHtml(due) + '</div>' : ''; })()) + '</div>';
    var issues = B.issues.length ? '<div class="cx-card"><div class="cx-head"><h3>Client concerns</h3><span class="cx-chip chip-overdue">' + B.issues.length + '</span></div><div style="margin-top:12px">' + listHtml(B.issues) + '</div></div>' : '';
    var journey = B.journey.length ? '<div class="cx-card"><div class="cx-head"><div><div class="cx-kicker">Client journey</div><h3>New contract and pre-closing calls</h3></div></div><div style="margin-top:12px">' + listHtml(B.journey) + '</div></div>' : '';
    var d = B.day;
    host.innerHTML = '<div class="cx-stack">' +
      '<div class="cx-head"><div><div class="cx-kicker">' + esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: L.TZ })) + '</div><h2>' + esc(lp) + '\'s day</h2>' +
      '<div class="cx-sub">' + (!loaded ? 'Waiting for shared data…' : d.required.length ? d.completed.filter(function (t) { return t.due_date <= t0; }).length + ' of ' + d.required.length + ' required calls done today (' + d.pct + '%)' + (d.remaining.length ? ' · ' + d.remaining.length + ' to go' : ' · all done') : 'No required calls due today') + '</div></div>' + syncLine() + '</div>' +
      (S.error ? '<div class="cx-err">' + esc(S.error) + '</div>' : '') + tue + pc + issues + journey + correctionsCard(lp) + scorecardCard(lp) + '</div>';
    bindAccess(host); bindScorecard(host, lp);
    $all('[data-resolve-corr]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var note = window.prompt('How was this corrected? (required)'); if (!note || note.trim().length < 10) { if (note !== null) toast('Describe the correction in at least 10 characters.', true); return; }
        apiAct('core_api_correction', { p_action: 'resolve', p: { id: b.getAttribute('data-resolve-corr'), resolution_note: note.trim() } })
          .then(function () { toast('Marked resolved. Mack will verify it.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
      });
    });
    $all('[data-tile]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-tile');
        S.lpFilter = k && !(S.lpFilter && S.lpFilter.key === k && S.lpFilter.lp === lp) ? { lp: lp, key: k } : null;
        renderToday();
        var wl = $('#core-worklist'); if (wl && wl.scrollIntoView) wl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    var so = $('[data-cx="signoff-tuesday"]', host);
    if (so) so.addEventListener('click', function () {
      so.disabled = true; so.textContent = 'Saving…';
      apiAct('core_api_signoff', { p_lp: lp, p_date: t0, p_group: 'tuesday' }).then(function (row) {
        if (!row || row.lp !== lp) throw new Error('The sign-off could not be confirmed by the shared server.');
        S.signoffs = S.signoffs.filter(function (s) { return !(s.lp === lp && s.work_date === t0 && s.task_group === 'tuesday'); }).concat([row]);
        toast("Today's Tuesday Updates are complete. Saved to the shared server."); renderToday();
      }).catch(function (e) { toast(friendlyServerError(e), true); loadAll(); });
    });
  }
  function correctionsCard(lp) {
    var open = S.corrections.filter(function (c) { return c.lp === lp && (c.status === 'open' || c.status === 'reopened'); });
    if (!open.length) return '';
    return '<div class="cx-card"><div class="cx-head"><h3>Corrective actions from Mack</h3><span class="cx-chip chip-attempt">' + open.length + '</span></div><div class="cx-list" style="margin-top:12px">' + open.map(function (c) {
      return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(c.issue) + '</span><span class="i-meta">Due ' + esc(fmtDate(c.due_date)) + (c.expected_behavior ? ' · Expected: ' + esc(c.expected_behavior) : '') + '</span><span class="i-right">' +
        (c.task_id ? '<button type="button" class="cx-btn sm" data-open-task="' + esc(c.task_id) + '">Record</button>' : '') + (canWrite() ? '<button type="button" class="cx-btn sm" data-resolve-corr="' + esc(c.id) + '">Mark resolved</button>' : '') + '</span></div>';
    }).join('') + '</div></div>';
  }
  function scorecardCard(lp) {
    var wk = L.weekMonday(today()), row = scorecardFor(lp, wk), sum = row ? L.scorecardSummary(lp, row.data, liveMetrics(lp)) : null;
    var chip = row === null ? '<span class="cx-chip">' + (S.scorecards ? 'Status unavailable' : 'Loading…') + '</span>' : row ? '<span class="cx-chip chip-done">Entered this week</span>' : '<span class="cx-chip chip-overdue">Due this week</span>';
    return '<div class="cx-card" id="core-scorecard-card"><div class="cx-head"><div><div class="cx-kicker">My Scorecard</div><h3>Week of ' + esc(fmtDate(wk)) + '</h3><div class="cx-sub">' +
      (sum ? sum.total + ' of ' + sum.goal + ' weekly goal (' + sum.pct + '%) · ' + sum.rows.map(function (r) { return esc(r.label) + ' ' + r.total + '/' + r.goal; }).join(' · ') : row === false ? 'Not entered yet. The scorecard week closes ' + esc(fmtDate(L.addDays(wk, 6))) + '.' : 'Scorecard status could not be loaded; open the scorecard to check.') +
      '</div></div><div class="cx-row">' + chip + '<button type="button" class="cx-btn primary" data-cx="scorecard">' + (row ? 'Edit my scorecard' : 'Complete my scorecard') + '</button></div></div></div>';
  }
  function bindScorecard(host, lp) { var b = $('[data-cx="scorecard"]', host); if (b) b.addEventListener('click', function () { openMyScorecard(lp); }); }
  function worklistHtml(k, B) {
    var list = B[k] || [], isPcN = /^pc\d/.test(k);
    if (isPcN) list = list.concat(B['soon' + k.slice(2)] || []);
    return '<div class="cx-card" id="core-worklist" style="margin-top:12px"><div class="cx-head"><h3>' + esc(TILE_TITLES[k] || '') + (isPcN ? ' due now and next 7 days' : '') + '</h3><button type="button" class="cx-btn sm ghost" data-tile="">Close</button></div><div style="margin-top:12px">' + listHtml(list, 'Nothing in this list.') + '</div></div>';
  }

  // ================================================================ task drawer
  var drawerEvents = {};
  function openDrawer(id) {
    closeDrawer();
    var ov = document.createElement('div'); ov.className = 'cx-overlay cx'; ov.dataset.task = id; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="cx-drawer"></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) tryClose(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', escClose);
    renderDrawer(id); refreshEvents(id);
  }
  function escClose(e) { if (e.key === 'Escape') tryClose(); }
  function tryClose() {
    var ov = $('.cx-overlay[data-task]');
    if (ov && ov.__dirty && !window.confirm('Discard unsaved changes?')) return;
    closeDrawer();
  }
  function closeDrawer() { $all('.cx-overlay').forEach(function (o) { o.remove(); }); document.removeEventListener('keydown', escClose); }
  function historyHtml(id) {
    var ev = drawerEvents[id];
    if (!ev) return '<div class="cx-note">Loading history…</div>';
    if (ev === 'error') return '<div class="cx-err">History could not be loaded.</div>';
    if (!ev.length) return '<div class="cx-note">No recorded activity yet.</div>';
    return '<div class="cx-list">' + ev.map(function (e) {
      return '<div class="cx-note" style="border-left:3px solid var(--cx-purple-line);padding:4px 10px"><b>' + esc(fmtTime(e.occurred_at)) + '</b> · ' +
        esc([e.event_type, e.party, e.channel].filter(Boolean).join(' · ').replace(/_/g, ' ')) + (e.detail ? '<br>' + esc(e.detail) : '') + '<br><span class="cx-small">' + esc(e.actor || '') + '</span></div>';
    }).join('') + '</div>';
  }
  function refreshEvents(id) {
    return api('core_api_events', { p_task: id }).then(function (rows) { drawerEvents[id] = rows || []; })
      .catch(function () { drawerEvents[id] = 'error'; })
      .then(function () { var h = $('#cx-history'); if (h) h.innerHTML = historyHtml(id); });
  }
  function canEdit(t) {
    if (isManager()) return t.status !== 'cancelled' && t.status !== 'completed';
    if (S.tier !== 'team') return false;
    return !(t.status === 'completed' || t.status === 'cancelled' || t.status === 'needs_review');
  }
  var PC60_NEXT_CALL = 'Make the 90-day follow-up call';
  function renderDrawer(id) {
    var ov = $('.cx-overlay[data-task="' + id + '"]'); if (!ov) return;
    var t = S.tasks.find(function (x) { return x.id === id; });
    var box = ov.querySelector('.cx-drawer');
    if (!t) { box.innerHTML = '<div class="cx-err">This record is no longer available.</div><button class="cx-btn" type="button" data-cx="close">Close</button>'; box.querySelector('[data-cx="close"]').onclick = closeDrawer; return; }
    var loan = S.loans[t.loan_number] || {}, editable = canEdit(t), ck = t.script_checks || {}, type = t.task_type;
    var isTue = type === 'tuesday', isPc = /^pc/.test(type), dis = editable ? '' : ' disabled';
    var selectedNextAction = t.next_action === PC60_NEXT_CALL ? PC60_NEXT_CALL : t.next_action ? 'other' : '';
    var checks = (L.CHECKS[type] || []).filter(function (c) { return !isTue || c[0] !== 'referral_ask'; }).map(function (c) {
      return '<label class="cx-check' + (ck[c[0]] ? ' done' : '') + '"><input type="checkbox" data-check="' + c[0] + '"' + (ck[c[0]] ? ' checked' : '') + dis + '><span>' + esc(c[1]) + '</span></label>';
    }).join('') + (type === 'pc60' ? '<label class="cx-check' + (ck.rate_drop_na ? ' done' : '') + '"><input type="checkbox" data-check="rate_drop_na"' + (ck.rate_drop_na ? ' checked' : '') + dis + '><span>The Five-Year Rate Drop Pledge does not apply to this loan</span></label>' : '');
    var referralAsked = t.referral_requested || (isTue && ck.referral_ask);
    var agentPresent = L.hasBuyerAgent(loan.buyer_agent_name), out = L.outcomeLabel(t, today());
    var chipCls = t.status === 'completed' ? 'chip-done' : (t.status === 'attempted' || t.status === 'exception') ? 'chip-attempt' : L.bucket(t, today()) === 'overdue' ? 'chip-overdue' : 'chip-open';
    box.innerHTML =
      '<div class="cx-head"><div><div class="cx-kicker">' + esc(typeLabel(type)) + ' · Due ' + esc(fmtDate(t.due_date)) + '</div><h2>' + esc(borrowerOf(t)) + '</h2>' +
      '<div class="cx-sub">Loan ' + esc(t.loan_number) + ' · ' + esc(lpLabel(t.owner_lp)) + (t.coverage_lp ? ' (covered by ' + esc(t.coverage_lp) + ')' : '') + '</div></div>' +
      '<div class="cx-row"><span class="cx-chip ' + chipCls + '">' + esc(out) + '</span><button type="button" class="cx-btn sm" data-cx="close">Close</button></div></div>' +
      '<div class="cx-card" style="margin-top:14px;padding:14px"><div class="cx-split cx-small">' +
      '<div><b>Milestone</b><br>' + esc(loan.last_milestone || '—') + '</div>' +
      '<div><b>' + (isPc ? 'Closed' : 'Est. closing') + '</b><br>' + esc(fmtDate(isPc ? loan.closed_date : loan.est_closing_date)) + '</div>' +
      '<div><b>Buyer agent</b><br>' + (agentPresent ? esc(loan.buyer_agent_name) + (loan.buyer_agent_phone ? ' · <a href="tel:' + esc(loan.buyer_agent_phone) + '">' + esc(loan.buyer_agent_phone) + '</a>' : '') + (loan.buyer_agent_email ? '<br><a href="mailto:' + esc(loan.buyer_agent_email) + '">' + esc(loan.buyer_agent_email) + '</a>' : '') : 'None on file') + '</div>' +
      '<div><b>Loan</b><br>' + esc([loan.loan_purpose, loan.loan_type].filter(Boolean).join(' · ') || '—') + '</div></div></div>' +
      (t.status === 'needs_review' ? '<div class="cx-warn" style="margin-top:12px">Needs Review: due before launch with no reliable completion evidence. Not counted against the LP. ' + esc(t.review_note || '') + '</div>' : '') +
      (t.status === 'completed' ? '<div class="cx-complete-banner" style="margin-top:12px">✓ ' + esc(out) + ' · ' + esc(fmtTime(t.completed_at)) + ' by ' + esc(t.completed_by || '') + '. Completed records are locked.</div>' : '') +
      '<form data-cx="task" novalidate>' +
      '<h3 style="margin-top:18px">' + (isTue ? 'Step 1 · Borrower call' : 'Borrower call') + '</h3>' +
      (isTue ? '' : '<div class="cx-script" style="margin-top:8px">' + esc(L.SCRIPT_NOTES[type] || '') + '</div>') +
      '<label class="cx-f" for="cx-bo">Borrower contact outcome</label><select id="cx-bo" name="borrower_outcome"' + dis + '>' + opts(L.BORROWER_OUTCOMES, t.borrower_outcome, 'Select outcome') + '</select>' +
      '<div id="cx-attempt-row" class="cx-row" style="margin-top:8px"></div>' +
      (isTue ? '<label class="cx-f" for="cx-bn">Borrower update notes</label><textarea id="cx-bn" name="borrower_notes" placeholder="Summarize the loan status, what you discussed, and any borrower questions."' + dis + '>' +
        esc([t.service_update, t.borrower_notes].filter(function (note, i, notes) { return note && notes.indexOf(note) === i; }).join('\n\n')) + '</textarea>' : '') +
      (isTue ? '<details id="cx-borrower-details" class="cx-card" style="margin-top:12px;padding:14px"><summary style="cursor:pointer"><b>Conversation notes and required steps</b></summary><p class="cx-note">' + esc(L.SCRIPT_NOTES[type]) + '</p>' : '') +
      '<label class="cx-f" for="cx-cat">Conversation date and time</label><input id="cx-cat" type="datetime-local" name="conversation_at" value="' + esc(toLocalInput(t.conversation_at)) + '"' + dis + '>' +
      '<div style="margin-top:12px"><div class="cx-f" style="margin:0 0 4px">Conversation steps</div>' + checks + '</div>' +
      (isTue ? '' : '<label class="cx-f" for="cx-bn">Borrower conversation notes</label><textarea id="cx-bn" name="borrower_notes" placeholder="What was discussed, in your own words"' + dis + '>' + esc(t.borrower_notes || '') + '</textarea>') +
      (isTue ? '</details>' : '') +
      '<h3 style="margin-top:18px">' + (type === 'contract' ? 'Referral expectation' : (L.TASK_TYPES[type].referral === 'CCR' ? 'Current-client referral (CCR)' : 'Past-client referral (PCR)')) + '</h3>' +
      (isTue ? '<blockquote id="cx-ccr-script" class="cx-script" style="margin:8px 0 0">' + esc(L.REFERRAL_7_DAYS) + '</blockquote>' : '') +
      '<label class="cx-check' + (referralAsked ? ' done' : '') + '" style="margin-top:8px"><input type="checkbox" name="referral_requested"' + (isTue ? ' data-check="referral_ask"' : '') + (referralAsked ? ' checked' : '') + dis + '><span><b>I asked the referral question on this call.</b></span></label>' +
      '<label class="cx-f" for="cx-rr">Client response</label><select id="cx-rr" name="referral_response"' + dis + '>' + opts(L.REFERRAL_RESPONSES, t.referral_response, 'Select response') + '</select>' +
      '<div id="cx-named"' + (t.referral_response === 'named_introduction' ? '' : ' class="cx-hide"') + '><div class="cx-split"><div><label class="cx-f" for="cx-rn">Referral name</label><input id="cx-rn" type="text" name="referral_name" value="' + esc(t.referral_name || '') + '"' + dis + '></div>' +
      '<div><label class="cx-f" for="cx-rc">Referral phone or email</label><input id="cx-rc" type="text" name="referral_contact" value="' + esc(t.referral_contact || '') + '"' + dis + '></div></div>' +
      '<div class="cx-split"><div><label class="cx-f" for="cx-crm">CRM (Velocify) reference · required</label><input id="cx-crm" type="text" name="crm_reference" value="' + esc(t.crm_reference || '') + '"' + dis + '></div>' +
      '<div><label class="cx-f" for="cx-rs">Referral status</label><select id="cx-rs" name="referral_status"' + dis + '>' + opts([['open', 'Open'], ['in_process', 'Application in process'], ['funded', 'Funded'], ['lost', 'Did not proceed']], t.referral_status, 'Select') + '</select></div></div>' +
      '<label class="cx-f" for="cx-ft">Follow-through notes</label><textarea id="cx-ft" name="followthrough_note"' + dis + '>' + esc(t.followthrough_note || '') + '</textarea></div>' +
      (isTue ? '<details class="cx-card" style="margin-top:12px;padding:14px"' + (t.concern_status && t.concern_status !== 'none' ? ' open' : '') + '><summary style="cursor:pointer"><b>Client concern</b></summary>' : '<h3 style="margin-top:18px">Client experience</h3>') +
      '<label class="cx-f" for="cx-cs">Any concern raised?</label><select id="cx-cs" name="concern_status"' + dis + '>' + opts([['none', 'No concern'], ['resolved', 'Concern raised and resolved on this call'], ['unresolved', 'Unresolved concern: resolution required']], t.concern_status || 'none') + '</select>' +
      '<div id="cx-concern"' + ((t.concern_status || 'none') === 'none' ? ' class="cx-hide"' : '') + '><label class="cx-f" for="cx-cn">Concern details and what was done</label><textarea id="cx-cn" name="concern_notes"' + dis + '>' + esc(t.concern_notes || '') + '</textarea>' +
      '<label class="cx-check" style="margin-top:8px"><input type="checkbox" name="escalated"' + (t.escalated ? ' checked' : '') + dis + '><span>Escalate to the Production Manager</span></label></div>' +
      (isTue ? '</details><section id="cx-agent-section" class="cx-card" style="margin-top:12px;padding:14px"><h3>Step 2 · Buyer agent update</h3>' +
        '<div id="cx-agent-help" class="cx-note" style="margin-top:8px">' + (agentPresent ? 'Update ' + esc(loan.buyer_agent_name) + ' after the borrower call.' : 'No buyer agent is on file for this loan.') + '</div>' +
        '<fieldset id="cx-agent" aria-describedby="cx-agent-help" style="border:0;padding:0;margin:0"><label class="cx-f" for="cx-ao">Buyer agent contact outcome</label><select id="cx-ao" name="agent_outcome"' + dis + '>' + opts(L.AGENT_OUTCOMES, t.agent_outcome || (editable && !agentPresent ? 'no_buyer_agent' : null), 'Select outcome') + '</select>' +
        '<div id="cx-agent-notes"' + (t.agent_notes || ['spoke', 'update_sent'].includes(t.agent_outcome) ? '' : ' class="cx-hide"') + '><label class="cx-f" for="cx-an">Buyer agent notes</label><textarea id="cx-an" name="agent_notes"' + dis + '>' + esc(t.agent_notes || '') + '</textarea></div></fieldset></section>' : '') +
      '<details id="cx-follow-up" class="cx-card" style="margin-top:12px;padding:14px"' + (t.next_action || t.next_action_date ? ' open' : '') + '><summary style="cursor:pointer"><b>Follow-up</b></summary><div class="cx-split"><div>' +
      (type === 'pc60' ? '<label class="cx-f" for="cx-na-choice">Next action</label><select id="cx-na-choice"' + dis + '>' +
        opts([[PC60_NEXT_CALL, PC60_NEXT_CALL], ['other', 'Other next action']], selectedNextAction, 'Select next action') + '</select>' +
        '<div id="cx-na-other"' + (selectedNextAction === 'other' ? '' : ' class="cx-hide"') + '><label class="cx-f" for="cx-na">Describe the next action</label><input id="cx-na" type="text" name="next_action" value="' + esc(selectedNextAction === 'other' ? t.next_action : '') + '"' + dis + '></div>'
        : '<label class="cx-f" for="cx-na">Next action</label><input id="cx-na" type="text" name="next_action" value="' + esc(t.next_action || '') + '"' + dis + '>') + '</div>' +
      '<div><label class="cx-f" for="cx-nd">Follow-up date</label><input id="cx-nd" type="date" name="next_action_date" value="' + esc(t.next_action_date || '') + '"' + dis + '></div></div></details>' +
      (editable ? '<details id="cx-reqs" class="cx-card" style="margin-top:12px;padding:14px"><summary style="cursor:pointer"></summary><div style="margin-top:8px"></div></details>' : '') +
      '<div id="cx-exception" class="cx-card cx-hide" style="margin-top:14px;padding:14px"><h3>Client concern or exception</h3><p class="cx-note">Use when a concern needs resolution or the required conversation could not happen. It is not counted as completed.</p>' +
      '<label class="cx-f" for="cx-ek">Type</label><select id="cx-ek" name="exception_kind">' + opts([['service_recovery', 'Client concern: resolution required'], ['unreachable', 'Borrower unreachable after attempts'], ['other', 'Other documented circumstance']], t.exception_kind || 'service_recovery') + '</select>' +
      '<label class="cx-f" for="cx-er">Circumstance and recovery action</label><textarea id="cx-er" name="exception_reason">' + esc(t.exception_reason || '') + '</textarea>' +
      '<div class="cx-row" style="margin-top:10px"><button type="button" class="cx-btn primary" data-cx="save-exception">Save</button><button type="button" class="cx-btn ghost" data-cx="cancel-exception">Cancel</button></div></div>' +
      (isManager() ? managerBlock(t) : '') +
      (isTue ? '<details class="cx-card" style="margin-top:12px;padding:14px"><summary style="cursor:pointer"><b>Activity history</b></summary>' : '<h3 style="margin-top:22px">Conversation and activity history</h3>') + '<div id="cx-history" style="margin-top:8px">' + historyHtml(id) + '</div>' + (isTue ? '</details>' : '') +
      '<div class="cx-drawer-foot"><span id="cx-save-state" class="cx-note" aria-live="polite"></span>' +
      (editable ? '<button type="button" class="cx-btn" data-cx="save">Save progress</button><button type="button" class="cx-btn accent" data-cx="complete">Complete ' + esc(typeLabel(type)) + '</button><button type="button" class="cx-btn ghost" data-cx="show-exception">Concern or exception</button>' : '') +
      '<button type="button" class="cx-btn ghost" data-cx="close">Close</button></div></form>';
    wireDrawer(ov, t, editable);
  }
  function managerBlock(t) {
    return '<div class="cx-card" style="margin-top:16px;padding:14px;border-color:var(--cx-purple-line)"><div class="cx-kicker">Production Manager</div>' +
      '<div class="cx-split"><div><label class="cx-f" for="cx-own">Owner (verified)</label><select id="cx-own" data-mgr="owner">' + opts(LPS.map(function (x) { return [x, x]; }), t.owner_lp, 'Unassigned') + '</select></div>' +
      '<div><label class="cx-f" for="cx-cov">Temporary coverage</label><select id="cx-cov" data-mgr="coverage">' + opts(LPS.map(function (x) { return [x, x]; }), t.coverage_lp, 'No coverage') + '</select></div></div>' +
      '<div class="cx-row" style="margin-top:10px"><button type="button" class="cx-btn sm" data-cx="mgr-assign">Save owner and coverage</button>' +
      (t.status === 'completed' || t.status === 'exception' ? '<button type="button" class="cx-btn sm" data-cx="mgr-reopen">Reopen</button>' : '') +
      (t.status === 'needs_review' ? '<button type="button" class="cx-btn sm" data-cx="mgr-reviewed">Close as reviewed</button><button type="button" class="cx-btn sm" data-cx="mgr-activate">Make it due today</button>' : '') +
      (!t.escalated && t.status !== 'completed' ? '<button type="button" class="cx-btn sm" data-cx="mgr-escalate">Escalate</button>' : '') +
      '<button type="button" class="cx-btn sm" data-cx="mgr-correction">Assign corrective action</button></div></div>';
  }
  var PATCH_FIELDS = ['borrower_outcome', 'borrower_notes', 'service_update', 'referral_response', 'referral_name', 'referral_contact', 'crm_reference', 'followthrough_note', 'referral_status', 'concern_status', 'concern_notes', 'agent_outcome', 'agent_notes', 'next_action', 'next_action_date'];
  function collect(form, t) {
    var p = {};
    PATCH_FIELDS.forEach(function (n) { var el = form.querySelector('[name="' + n + '"]'); if (el) p[n] = el.value === '' ? null : el.value; });
    if (t.task_type === 'tuesday') {
      var notes = form.querySelector('[name="borrower_notes"]');
      if (notes.value === notes.defaultValue && t.borrower_notes && t.service_update) {
        p.borrower_notes = t.borrower_notes;
        p.service_update = t.service_update;
      } else {
        p.service_update = p.borrower_notes;
      }
    }
    var nextChoice = $('#cx-na-choice', form);
    if (nextChoice && nextChoice.value !== 'other') p.next_action = nextChoice.value || null;
    var ca = form.querySelector('[name="conversation_at"]'); if (ca) p.conversation_at = fromLocalInput(ca.value);
    var rq = form.querySelector('[name="referral_requested"]'); if (rq) p.referral_requested = rq.checked;
    var es = form.querySelector('[name="escalated"]'); if (es) p.escalated = es.checked;
    var checks = Object.assign({}, t.script_checks || {});
    $all('[data-check]', form).forEach(function (c) { checks[c.getAttribute('data-check')] = c.checked; });
    p.script_checks = checks;
    if (!p.concern_status) p.concern_status = 'none';
    return p;
  }
  function wireDrawer(ov, t, editable) {
    var form = ov.querySelector('form[data-cx="task"]'), loan = S.loans[t.loan_number] || {};
    $all('[data-cx="close"]', ov).forEach(function (b) { b.addEventListener('click', tryClose); });
    var state = $('#cx-save-state', ov);
    function setState(txt, bad) { if (state) { state.textContent = txt; state.style.color = bad ? 'var(--cx-bad)' : ''; } }
    function valid() { return L.validateTask(Object.assign({}, t, collect(form, t)), loan); }
    var compact = t.task_type === 'tuesday', saving = false;
    function refreshReqs() {
      if (!editable) return;
      var p = Object.assign({}, t, collect(form, t)), errs = L.validateTask(p, loan), box = $('#cx-reqs', ov);
      var checklist = errs;
      if (compact) {
        var needsNotes = /^Borrower conversation notes required|^Meaningful service update required/;
        if (errs.some(function (e) { return needsNotes.test(e); })) {
          checklist = errs.filter(function (e) { return !needsNotes.test(e); }).concat('Enter borrower update notes (20+ characters)');
        }
        var stepCount = errs.filter(function (e) { return e.startsWith('Conversation step not confirmed:'); }).length;
        if (stepCount) checklist = checklist.filter(function (e) { return !e.startsWith('Conversation step not confirmed:'); }).concat('Confirm ' + stepCount + ' conversation ' + (stepCount === 1 ? 'step' : 'steps'));
      }
      box.querySelector('summary').textContent = errs.length ? 'Completion checklist (' + checklist.length + ' remaining)' : 'Ready to complete';
      box.querySelector('div').innerHTML = errs.length ? '<ul class="cx-req">' + checklist.map(function (e) { return '<li>' + esc(L.friendlyError(e)) + '</li>'; }).join('') + '</ul>'
        : '<div class="cx-ok">✓ Every required conversation and referral step is documented.</div>';
      var cb = $('[data-cx="complete"]', ov); if (cb) cb.disabled = saving || (!compact && errs.length > 0);
      var bo = p.borrower_outcome, ar = $('#cx-attempt-row', ov);
      if (ar) ar.innerHTML = bo && bo !== 'conversation' ? '<button type="button" class="cx-btn sm" data-cx="log-attempt">Log this attempt</button><span class="cx-note">Attempts are saved with the time. They do not complete the call.</span>' : '';
      var la = $('[data-cx="log-attempt"]', ov); if (la) la.onclick = function () { logAttempt(bo); };
      var named = $('#cx-named', ov); if (named) named.classList.toggle('cx-hide', p.referral_response !== 'named_introduction');
      var cc = $('#cx-concern', ov); if (cc) cc.classList.toggle('cx-hide', (p.concern_status || 'none') === 'none');
      var agentNotes = $('#cx-agent-notes', ov);
      if (agentNotes) agentNotes.classList.toggle('cx-hide', !p.agent_notes && !['spoke', 'update_sent'].includes(p.agent_outcome));
      var ag = $('#cx-agent', ov);
      if (ag && L.hasBuyerAgent(loan.buyer_agent_name)) {
        ag.disabled = bo !== 'conversation';
        $('#cx-agent-help', ov).textContent = ag.disabled
          ? 'Select Spoke with borrower in the borrower conversation above to enable these fields.'
          : 'Update ' + loan.buyer_agent_name + ' after the borrower call.';
      }
      $all('.cx-check', ov).forEach(function (l) { var i = l.querySelector('input'); if (i) l.classList.toggle('done', i.checked); });
    }
    if (editable) {
      form.addEventListener('input', function () { ov.__dirty = true; setState('Unsaved changes'); refreshReqs(); });
      form.addEventListener('change', function (e) {
        ov.__dirty = true; setState('Unsaved changes');
        if (e.target.id === 'cx-na-choice') $('#cx-na-other', form).classList.toggle('cx-hide', e.target.value !== 'other');
        if (e.target.name === 'borrower_outcome' && e.target.value === 'conversation') { var ca = form.querySelector('[name="conversation_at"]'); if (ca && !ca.value) ca.value = localInputNow(); }
        refreshReqs();
      });
    }
    refreshReqs();
    function busy(on) { saving = on; $all('.cx-drawer-foot .cx-btn', ov).forEach(function (b) { if (b.dataset.cx !== 'close') b.disabled = on || (!compact && b.dataset.cx === 'complete' && valid().length > 0); }); }
    function save(extra, okMsg) {
      var p = Object.assign(collect(form, t), extra || {});
      if (!(extra && extra.status) && p.borrower_outcome && p.borrower_outcome !== 'conversation' && t.status === 'open') p.status = 'attempted';
      var prev = Object.assign({}, t);
      setState('Saving…'); busy(true);
      return saveTask(t, p).then(function (row) {
        var evs = [];
        if (p.borrower_outcome && p.borrower_outcome !== prev.borrower_outcome) evs.push({ event_type: p.borrower_outcome === 'conversation' ? 'conversation' : 'attempt', party: 'borrower', channel: p.borrower_outcome, occurred_at: p.borrower_outcome === 'conversation' && p.conversation_at ? p.conversation_at : new Date().toISOString(), detail: p.borrower_outcome === 'conversation' ? (p.borrower_notes || '').slice(0, 500) : null });
        if (p.agent_outcome && p.agent_outcome !== prev.agent_outcome) evs.push({ event_type: p.agent_outcome === 'no_buyer_agent' ? 'status' : p.agent_outcome === 'attempted' ? 'attempt' : 'conversation', party: 'buyer_agent', channel: p.agent_outcome, detail: (p.agent_notes || '').slice(0, 500) });
        if (p.status && p.status !== prev.status) evs.push({ event_type: 'status', party: 'system', channel: p.status, detail: p.status === 'exception' ? p.exception_reason : null });
        if (p.escalated && !prev.escalated) evs.push({ event_type: 'escalation', party: 'borrower', detail: p.concern_notes });
        return logEvents(row, evs).then(function () { ov.__dirty = false; setState('Saved'); toast(okMsg || 'Saved to the shared server.'); return row; });
      }).catch(function (e) {
        setState('Not saved', true); busy(false); toast(friendlyServerError(e), true);
        if (/another device/.test(String(e.message))) { ov.__dirty = false; renderDrawer(t.id); }
        throw e;
      });
    }
    function logAttempt(channel) {
      setState('Saving attempt…'); busy(true);
      saveTask(t, { status: t.status === 'open' ? 'attempted' : t.status, borrower_outcome: channel })
        .then(function (row) { return logEvents(row, [{ event_type: 'attempt', party: 'borrower', channel: channel, detail: ((form.querySelector('[name="borrower_notes"]') || {}).value || '').slice(0, 500) || null }]); })
        .then(function () { ov.__dirty = false; toast('Attempt saved. The call stays open until you reach the borrower.'); renderDrawer(t.id); refreshEvents(t.id); renderAll(); })
        .catch(function (e) { setState('Not saved', true); busy(false); toast(friendlyServerError(e), true); });
    }
    var on = function (sel, fn) { var b = $('[data-cx="' + sel + '"]', ov); if (b) b.addEventListener('click', fn); };
    on('save', function () { save(null).then(function () { renderDrawer(t.id); refreshEvents(t.id); renderAll(); }).catch(function () {}); });
    on('complete', function () {
      var errs = valid();
      if (errs.length) {
        if (compact) {
          var checklist = $('#cx-reqs', ov);
          checklist.open = true;
          if (errs.some(function (e) { return /^Conversation /.test(e); })) $('#cx-borrower-details', ov).open = true;
          if (errs.some(function (e) { return /^(Next action|Follow-up date)/.test(e); })) $('#cx-follow-up', ov).open = true;
          $('summary', checklist).focus();
        } else toast('Not complete yet: ' + L.friendlyError(errs[0]), true);
        return;
      }
      save({ status: 'completed' }, typeLabel(t.task_type) + ' completed. Saved to the shared server.').then(function () { closeDrawer(); renderAll(); }).catch(function () {});
    });
    on('show-exception', function () { var x = $('#cx-exception', ov); x.classList.remove('cx-hide'); if (x.scrollIntoView) x.scrollIntoView({ behavior: 'smooth' }); });
    on('cancel-exception', function () { $('#cx-exception', ov).classList.add('cx-hide'); });
    on('save-exception', function () {
      var kind = form.querySelector('[name="exception_kind"]').value, reason = form.querySelector('[name="exception_reason"]').value;
      var errs = L.validateException(Object.assign({}, t, collect(form, t), { exception_kind: kind, exception_reason: reason }));
      if (errs.length) { toast(errs[0], true); return; }
      var extra = { status: 'exception', exception_kind: kind, exception_reason: reason };
      if (kind === 'service_recovery') { extra.concern_status = 'unresolved'; extra.escalated = true; }
      save(extra, kind === 'service_recovery' ? 'Client concern saved and escalated to Mack.' : 'Exception saved.').then(function () { closeDrawer(); renderAll(); }).catch(function () {});
    });
    on('mgr-assign', function () {
      var own = $('[data-mgr="owner"]', ov).value || null, cov = $('[data-mgr="coverage"]', ov).value || null, chain = Promise.resolve();
      if (own !== (t.owner_lp || null)) chain = chain.then(function () { return apiAct('core_assign_loans', { p_loans: [t.loan_number], p_lp: own, p_note: 'From record' }); });
      chain.then(function () { return cov !== (t.coverage_lp || null) ? apiAct('core_api_bulk_tasks', { p_ids: [t.id], p_patch: { coverage_lp: cov } }) : null; })
        .then(function () { toast('Ownership saved.'); return loadAll(); }).then(function () { renderDrawer(t.id); })
        .catch(function (e) { toast(friendlyServerError(e), true); });
    });
    on('mgr-reopen', function () { apiAct('core_api_bulk_tasks', { p_ids: [t.id], p_patch: { status: 'open' } }).then(function () { return logEvents(t, [{ event_type: 'status', party: 'manager', channel: 'reopened' }]); }).then(function () { toast('Reopened.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); }); });
    on('mgr-escalate', function () { saveTask(t, { escalated: true }).then(function (row) { return logEvents(row, [{ event_type: 'escalation', party: 'manager', detail: 'Escalated by Production Manager' }]); }).then(function () { toast('Escalated.'); renderDrawer(t.id); renderAll(); }).catch(function (e) { toast(friendlyServerError(e), true); }); });
    on('mgr-reviewed', function () {
      var note = window.prompt('Review note (required): what was found for this historical call?'); if (!note || note.trim().length < 5) return;
      apiAct('core_api_bulk_tasks', { p_ids: [t.id], p_patch: { status: 'cancelled', review_note: 'Reviewed: ' + note.trim() } }).then(function () { toast('Closed as reviewed.'); closeDrawer(); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
    });
    on('mgr-activate', function () { saveTask(t, { status: 'open', due_date: today(), review_note: 'Activated by manager ' + today() }).then(function () { toast('Moved to today.'); renderDrawer(t.id); renderAll(); }).catch(function (e) { toast(friendlyServerError(e), true); }); });
    on('mgr-correction', function () { openCorrectionForm({ lp: owner(t) || t.owner_lp, task_id: t.id, loan_number: t.loan_number, issue: '' }); });
  }
  /** Save through the key-checked API with optimistic concurrency; the returned row is the committed server state. */
  function saveTask(t, patch) {
    return apiAct('core_api_save_task', { p_id: t.id, p_version: t.row_version, p_patch: patch }).then(function (row) {
      if (!row || row.id !== t.id) throw new Error('The save could not be confirmed by the shared server. Please retry.');
      Object.keys(patch).forEach(function (k) {
        if (k === 'script_checks' || k === 'conversation_at') return;
        var a = patch[k], b = row[k];
        if (!(a === b || (a == null && b == null) || String(a) === String(b))) throw new Error('The save could not be confirmed for ' + k + '. Please retry.');
      });
      upsertTaskLocal(row); Object.assign(t, row);
      return row;
    }).catch(function (e) {
      if (/another device/.test(String(e.message))) return loadAll().then(function () { throw e; });
      throw e;
    });
  }
  function logEvents(row, evs) {
    if (!evs.length) return Promise.resolve();
    return apiAct('core_api_log_events', { p_events: evs.map(function (e) { return Object.assign({ task_id: row.id }, e); }) })
      .catch(function (e) { toast('The call was saved, but its history entry failed: ' + friendlyServerError(e), true); });
  }

  // ================================================================ corrective actions form
  function openCorrectionForm(seed) {
    var ov = document.createElement('div'); ov.className = 'cx-overlay cx'; ov.style.alignItems = 'center'; ov.style.justifyContent = 'center';
    ov.innerHTML = '<div class="cx-modal"><h3>Assign corrective action</h3><form data-cx="corr">' +
      '<label class="cx-f">Loan Partner</label><select name="lp" required>' + opts(LPS.map(function (x) { return [x, x]; }), seed.lp, 'Select') + '</select>' +
      '<label class="cx-f">What was missed</label><textarea name="issue" required>' + esc(seed.issue || '') + '</textarea>' +
      '<label class="cx-f">Expected behavior</label><textarea name="expected_behavior"></textarea>' +
      '<label class="cx-f">Follow-up deadline</label><input type="date" name="due_date" value="' + L.addDays(today(), 2) + '" required>' +
      '<div class="cx-row" style="margin-top:14px"><button class="cx-btn primary" type="submit">Assign</button><button class="cx-btn ghost" type="button" data-cx="x">Cancel</button></div></form></div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-cx="x"]').onclick = function () { ov.remove(); };
    ov.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target;
      var body = { lp: f.lp.value, issue: f.issue.value.trim(), expected_behavior: f.expected_behavior.value.trim(), due_date: f.due_date.value, task_id: seed.task_id || '', loan_number: seed.loan_number || '' };
      if (!body.lp || body.issue.length < 5 || !body.due_date) { toast('Loan Partner, issue and deadline are required.', true); return; }
      apiAct('core_api_correction', { p_action: 'create', p: body }).then(function (row) {
        if (!row || !row.id) throw new Error('The corrective action could not be confirmed.');
        S.corrections.push(row); ov.remove(); toast('Corrective action assigned to ' + body.lp + '.'); renderAll();
      }).catch(function (err) { toast(friendlyServerError(err), true); });
    });
  }

  // ================================================================ Command Center (Mack)
  var PERIODS = { week: 'This week', recent30: 'Last 30 days', recent60: 'Last 60 days' };
  function periodRange(key) {
    var t = today();
    if (key === 'recent30' || key === 'recent60') return { start: L.addDays(t, key === 'recent30' ? -29 : -59), end: t };
    var mon = L.weekMonday(t);
    return { start: mon, end: L.addDays(mon, 6) };
  }
  function unassignedActiveLoans() {
    var openLoanNumbers = new Set(S.tasks.filter(isOpen).map(function (task) { return task.loan_number; }));
    return Object.values(S.loans).filter(function (loan) {
      return loan.ownership_status !== 'verified' &&
        (loan.pipeline_status === 'active' || (loan.funding_verified && openLoanNumbers.has(loan.loan_number)));
    });
  }
  function renderCommand() {
    var host = $('#view-core-command'); if (!host) return;
    if (!activeKey() || !S.tier) {
      host.innerHTML = '<div class="cx-stack"><h2>Command Center</h2><div class="cx-empty">' +
        (S.loading ? 'Loading team data…' : 'Open Command Center from your shared CORE team link.') + '</div></div>';
      return;
    }
    var tabs = [['overview', 'Call overview'], ['tuesday', 'Tuesday worklist'], ['records', 'Call records'], ['data', 'Weekly imports']];
    var more = [['scorecards', 'Scorecards'], ['production', 'Production metrics'], ['unassigned', 'Assign loans'], ['funding', 'Funding review'], ['coverage', 'Coverage'], ['corrections', 'Corrective actions']];
    var p = S.cmdPeriod;
    host.innerHTML = '<div class="cx-stack"><div class="cx-head"><div><h2>Command Center</h2><div class="cx-sub">' + freshnessLine() + '</div></div>' +
      '<div class="cx-row"><select data-cx="period" aria-label="Period" style="width:auto">' + opts(Object.keys(PERIODS).map(function (k) { return [k, PERIODS[k]]; }), p) + '</select>' +
      '<button type="button" class="cx-btn" data-cx="export">Export to Excel</button></div></div>' + syncLine() +
      (S.error ? '<div class="cx-err">' + esc(S.error) + '</div>' : '') +
      '<div class="cx-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="cx-tab' + (S.cmdTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
      '<label class="cx-f">More manager tools <select data-cx="manager-tool" aria-label="More manager tools">' + opts(more, S.cmdTab, 'Choose a tool') + '</select></label>' +
      '<div id="cx-cmd-body">' + (S.loadedAt ? commandBody(S.cmdTab, p) : '<div class="cx-empty">Loading shared data…</div>') + '</div></div>';
    bindAccess(host);
    $all('[data-tab]', host).forEach(function (b) { b.addEventListener('click', function () { S.cmdTab = b.dataset.tab; renderCommand(); }); });
    $('[data-cx="manager-tool"]', host).addEventListener('change', function (event) { if (event.target.value) { S.cmdTab = event.target.value; renderCommand(); } });
    $all('[data-tuesday-status]', host).forEach(function (b) { b.addEventListener('click', function () {
      S.tuesdayStatus = b.dataset.tuesdayStatus;
      renderCommand();
      $('[data-tuesday-status="' + S.tuesdayStatus + '"]', host).focus();
    }); });
    var ps = $('[data-cx="period"]', host); if (ps) ps.addEventListener('change', function () { S.cmdPeriod = ps.value; renderCommand(); });
    var ex = $('[data-cx="export"]', host); if (ex) ex.addEventListener('click', function () { exportWorkbook(p); });
    wireCommandBody(host);
    if (S.cmdTab === 'production' && !S.ext) loadExternal();
  }
  function freshnessLine() {
    var pl = S.imports.find(function (r) { return r.kind === 'pipeline'; }), fu = S.imports.find(function (r) { return r.kind === 'funded_units'; });
    var f = function (r, days) { return !r ? ' <b style="color:var(--cx-bad)">not imported</b>' : (L.daysBetween(L.isoOfInstant(r.imported_at), today()) > days ? ' <b style="color:var(--cx-warn)">' + esc(fmtTime(r.imported_at)) + ' (stale)</b>' : ' ' + esc(fmtTime(r.imported_at))); };
    return 'Pipeline report:' + f(pl, 7) + ' · Funded Units:' + f(fu, 14);
  }
  function reg(key, title, tasks, loans) { S._rec[key] = { title: title, tasks: tasks, loans: loans }; return key; }
  function numCell(n, key) { return '<button type="button" class="cx-link" data-rec="' + key + '">' + n + '</button>'; }
  function pctCell(a, b, key) { var v = pctOf(a, b); return v === null ? '<span class="cx-muted">—</span>' : numCell(v + '%', key); }
  function teamStats(range) {
    var t0 = today(), wk = L.weekMonday(t0);
    return LPS.map(function (lp) {
      var mine = S.tasks.filter(function (t) { return owner(t) === lp; });
      return { lp: lp, mine: mine,
        tue: L.referralMetrics(mine, ['tuesday'], range, t0), pc: L.referralMetrics(mine, ['pc30', 'pc60', 'pc90'], range, t0),
        day: L.daySummary(mine, t0), sc: scorecardFor(lp, wk),
        cover: S.coverage.filter(function (c) { return c.start_date <= t0 && c.end_date >= t0 && (c.from_lp === lp || c.to_lp === lp); }),
        overdue: mine.filter(function (t) { return isOpen(t) && t.due_date < t0; }),
        upcoming: mine.filter(function (t) { return isOpen(t) && t.due_date > t0 && t.due_date <= L.addDays(t0, 7); }),
        concerns: mine.filter(L.isIssue),
        corr: S.corrections.filter(function (c) { return c.lp === lp && c.status !== 'verified'; }),
        dupes: L.duplicateNotes(mine.filter(function (t) { return L.inRange(t.due_date, range); })) };
    });
  }
  function commandBody(tab, period) {
    var range = periodRange(period); S._rec = {};
    if (tab === 'overview') return overviewBody(range, period);
    if (tab === 'tuesday') return tuesdayWorklist();
    if (tab === 'records') return recordsBody();
    if (tab === 'scorecards') return scorecardsBody();
    if (tab === 'production') return productionBody(range, period);
    if (tab === 'unassigned') return unassignedBody();
    if (tab === 'funding') return fundingBody();
    if (tab === 'coverage') return coverageBody();
    if (tab === 'corrections') return correctionsBody();
    if (tab === 'data') return dataBody();
    return '';
  }
  function tuesdayWorklist() {
    var completed = S.tuesdayStatus === 'completed';
    var sections = LPS.map(function (lp) {
      var tasks = lpBuckets(lp)[completed ? 'tue-completed' : 'tue-remaining'];
      return tasks.length ? '<section class="cx-card"><h3>' + esc(lp) + ' · ' + tasks.length + '</h3>' + listHtml(tasks) + '</section>' : '';
    }).join('');
    return '<div class="cx-stack"><div class="cx-head"><h3>Tuesday updates</h3><div class="cx-row">' +
      [['open', 'Still open'], ['completed', 'Completed']].map(function (option) {
        var selected = option[0] === S.tuesdayStatus;
        return '<button type="button" class="cx-btn' + (selected ? ' primary' : '') + '" data-tuesday-status="' + option[0] + '" aria-pressed="' + selected + '">' + option[1] + '</button>';
      }).join('') + '</div></div>' +
      (sections || '<div class="cx-empty">' + (completed ? 'No completed updates this week.' : 'No open updates for the loan partners.') + '</div>') + '</div>';
  }
  function openTuesdayWorklist() {
    S.cmdTab = 'tuesday';
    S.tuesdayStatus = 'open';
    openView('core-command');
  }
  function overviewBody(range, period) {
    var t0 = today(), rows = teamStats(range);
    var tue = L.referralMetrics(S.tasks, ['tuesday'], range, t0);
    var team = L.daySummary(S.tasks, t0, function (t) { return !!owner(t); });
    var unLoans = unassignedActiveLoans();
    var concerns = S.tasks.filter(L.isIssue), review = S.tasks.filter(function (t) { return t.status === 'needs_review' && t.due_date >= L.addDays(t0, -59); });
    var overdueAll = S.tasks.filter(function (t) { return owner(t) && isOpen(t) && t.due_date < t0; });
    var wk = L.weekMonday(t0), missingSc = S.scorecards && S.scorecards.ok ? LPS.filter(function (lp) { return !scorecardFor(lp, wk); }) : null;
    var tueOd = tue.outstanding.filter(function (t) { return t.due_date < t0; });
    var tiles =
      tileHtml('rec:' + reg('team-req', 'Team required work today', team.required), 'Team execution today', team.pct === null ? 'No calls due' : team.pct + '%', team.completed.length + ' done · ' + team.remaining.length + ' outstanding', 'hero') +
      tileHtml('rec:' + reg('overdue', 'All overdue work', overdueAll), 'Overdue', countOrComplete(overdueAll.length, true), 'Carried forward', stateCls(overdueAll.length, true, true)) +
      tileHtml('rec:' + reg('concerns', 'Client concerns and escalations', concerns), 'Client concerns', countOrComplete(concerns.length, true), 'Unresolved or escalated', stateCls(concerns.length, true, true)) +
      tileHtml('tab:scorecards', 'Missing scorecards', missingSc === null ? 'No data' : countOrComplete(missingSc.length, true), missingSc === null ? 'Scorecards could not be read' : missingSc.length ? esc(missingSc.join(', ')) : 'All entered this week', missingSc === null ? 'is-na' : stateCls(missingSc.length, true, true)) +
      tileHtml('tab:unassigned', 'Unassigned borrowers', countOrComplete(unLoans.length, true), 'Need verified ownership', stateCls(unLoans.length, true, true)) +
      tileHtml('rec:' + reg('review', 'Historical records requiring review', review), 'Needs Review', String(review.length), 'Historical, not delinquent');
    var daily = '<div class="cx-card"><div class="cx-head"><h3>Daily team overview</h3><span class="cx-note">Every number opens its records</span></div><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>LP</th><th class="cx-num">Due today</th><th class="cx-num">Completed</th><th class="cx-num">Outstanding</th><th class="cx-num">Overdue</th><th class="cx-num">Concerns</th><th class="cx-num">Next 7 days</th><th>Scorecard</th><th>Coverage</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var k = r.lp;
        return '<tr><td><b>' + esc(k) + '</b></td><td class="cx-num">' + numCell(r.day.required.length, reg(k + '-req', k + ' · required today', r.day.required)) + '</td><td class="cx-num">' + numCell(r.day.completed.length, reg(k + '-done', k + ' · completed today', r.day.completed)) + '</td>' +
          '<td class="cx-num">' + numCell(r.day.remaining.length, reg(k + '-rem', k + ' · outstanding', r.day.remaining)) + '</td><td class="cx-num">' + numCell(r.overdue.length, reg(k + '-od', k + ' · overdue', r.overdue)) + '</td>' +
          '<td class="cx-num">' + numCell(r.concerns.length, reg(k + '-cc', k + ' · client concerns', r.concerns)) + '</td><td class="cx-num">' + numCell(r.upcoming.length, reg(k + '-up', k + ' · next 7 days', r.upcoming)) + '</td>' +
          '<td>' + (r.sc === null ? '<span class="cx-muted">Unavailable</span>' : r.sc ? '<span class="cx-chip chip-done">Entered</span>' : '<span class="cx-chip chip-overdue">Missing</span>') + '</td>' +
          '<td class="cx-small">' + (r.cover.length ? r.cover.map(function (c) { return esc(c.from_lp + ' → ' + c.to_lp); }).join('<br>') : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var tueTbl = '<div class="cx-card"><div class="cx-head"><h3>Tuesday Update accountability · ' + esc(PERIODS[period]) + '</h3></div><div class="cx-tiles" style="margin-top:12px">' +
      tileHtml('rec:' + reg('tue-req', 'Tuesday Updates assigned', tue.required), 'Assigned', String(tue.required.length), PERIODS[period]) +
      tileHtml('rec:' + reg('tue-done', 'Tuesday Updates completed', tue.completed), 'Completed', String(tue.completed.length), pctOf(tue.completed.length, tue.required.length) === null ? '—' : pctOf(tue.completed.length, tue.required.length) + '% of assigned') +
      tileHtml('rec:' + reg('tue-missing', 'Missing CCR requests', tue.missing), 'Missing CCR requests', countOrComplete(tue.missing.length, true), 'No documented ask', stateCls(tue.missing.length, true, true)) +
      tileHtml('rec:' + reg('tue-intros', 'CCR introductions', tue.named.map(function (n) { return n.task; })), 'CCR introductions', String(tue.named.length), 'Unique named') +
      tileHtml('rec:' + reg('tue-od', 'Overdue Tuesday Updates', tueOd), 'Overdue', countOrComplete(tueOd.length, true), 'Carried forward', stateCls(tueOd.length, true, true)) +
      '</div><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>LP</th><th class="cx-num">Assigned</th><th class="cx-num">Completed</th><th class="cx-num">Completion</th><th class="cx-num">Attempted only</th><th class="cx-num">Outstanding</th><th class="cx-num">CCR ÷ conversations</th><th class="cx-num">CCR ÷ assigned</th><th class="cx-num">Introductions</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var k = r.lp, att = r.tue.attempted.filter(function (t) { return t.status !== 'completed'; });
        return '<tr><td><b>' + esc(k) + '</b></td><td class="cx-num">' + numCell(r.tue.required.length, reg(k + '-tr', k + ' · Tuesday assigned', r.tue.required)) + '</td><td class="cx-num">' + numCell(r.tue.completed.length, reg(k + '-tc', k + ' · Tuesday completed', r.tue.completed)) + '</td>' +
          '<td class="cx-num">' + pctCell(r.tue.completed.length, r.tue.required.length, reg(k + '-tp', k + ' · Tuesday assigned', r.tue.required)) + '</td><td class="cx-num">' + numCell(att.length, reg(k + '-ta', k + ' · attempted only', att)) + '</td>' +
          '<td class="cx-num">' + numCell(r.tue.outstanding.length, reg(k + '-to', k + ' · outstanding', r.tue.outstanding)) + '</td><td class="cx-num">' + pctCell(r.tue.asked.length, r.tue.conversations.length, reg(k + '-cc1', k + ' · Tuesday conversations', r.tue.conversations)) + '</td>' +
          '<td class="cx-num">' + pctCell(r.tue.asked.length, r.tue.required.length, reg(k + '-cc2', k + ' · Tuesday assigned', r.tue.required)) + '</td><td class="cx-num">' + numCell(r.tue.named.length, reg(k + '-ti', k + ' · CCR introductions', r.tue.named.map(function (n) { return n.task; }))) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var pcTbl = '<div class="cx-card"><div class="cx-head"><h3>Post-closing accountability · ' + esc(PERIODS[period]) + '</h3><button type="button" class="cx-link" data-tab-go="unassigned">' + unLoans.length + ' unassigned borrowers</button></div><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>LP</th><th class="cx-num">30-day</th><th class="cx-num">60-day</th><th class="cx-num">90-day</th><th class="cx-num">Completion</th><th class="cx-num">Overdue</th><th class="cx-num">Attempted</th><th class="cx-num">PCR requests</th><th class="cx-num">PCR introductions</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var k = r.lp, by = function (ty) { return r.pc.required.filter(function (t) { return t.task_type === ty; }); };
        var od = r.mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && t.due_date < t0; }), att = r.pc.attempted.filter(function (t) { return t.status !== 'completed'; });
        return '<tr><td><b>' + esc(k) + '</b></td>' + ['pc30', 'pc60', 'pc90'].map(function (ty) { return '<td class="cx-num">' + numCell(by(ty).length, reg(k + '-' + ty, k + ' · ' + typeLabel(ty) + 's', by(ty))) + '</td>'; }).join('') +
          '<td class="cx-num">' + pctCell(r.pc.completed.length, r.pc.required.length, reg(k + '-pcd', k + ' · post-closing completed', r.pc.completed)) + '</td><td class="cx-num">' + numCell(od.length, reg(k + '-pco', k + ' · overdue calls', od)) + '</td>' +
          '<td class="cx-num">' + numCell(att.length, reg(k + '-pca', k + ' · attempted calls', att)) + '</td><td class="cx-num">' + numCell(r.pc.asked.length, reg(k + '-pcr', k + ' · PCR requests', r.pc.asked)) + '</td><td class="cx-num">' + numCell(r.pc.named.length, reg(k + '-pci', k + ' · PCR introductions', r.pc.named.map(function (n) { return n.task; }))) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="cx-note" style="margin-top:8px">Calls due in the period. An attempted call is never counted as completed. Historical calls without evidence sit in Needs Review and are excluded.</p></div>';
    return '<div class="cx-stack"><div class="cx-tiles">' + tiles + '</div>' + daily + tueTbl + pcTbl + coachingCard(rows) + '</div>';
  }
  function coachingCard(rows) {
    var items = [], t0 = today();
    rows.forEach(function (r) {
      var lp = r.lp;
      if (r.tue.required.length >= 3 && pctOf(r.tue.asked.length, r.tue.required.length) < 80) items.push([lp, 'CCR ask documented on ' + pctOf(r.tue.asked.length, r.tue.required.length) + '% of assigned Tuesday Updates.', 'Role-play the 7-day referral question; recheck next Tuesday.', r.tue.missing]);
      var att = r.tue.attempted.filter(function (t) { return t.status !== 'completed'; });
      if (att.length >= 3) items.push([lp, att.length + ' Tuesday Updates reached only voicemail or text.', 'Agree a second call window and text to schedule a time.', att]);
      var pcO = r.mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && t.due_date < t0; });
      if (pcO.length) items.push([lp, pcO.length + ' post-closing calls overdue.', 'Block a weekly post-closing call hour and clear the oldest first.', pcO]);
      if (r.dupes.length) items.push([lp, r.dupes.length + ' set(s) of identical notes across different borrowers.', 'Review together; notes must describe the actual conversation.', [].concat.apply([], r.dupes)]);
      if (r.sc === false) items.push([lp, 'Scorecard not entered this week.', 'Enter this week\'s scorecard before the week closes.', []]);
      var late = r.corr.filter(function (c) { return c.status !== 'resolved' && c.due_date < t0; });
      if (late.length) items.push([lp, late.length + ' corrective action(s) past due.', 'Review in the next 1:1 and set a new verification date.', []]);
    });
    items.forEach(function (it, i) { S._rec['coach-' + i] = { title: it[0] + ' · ' + it[1], tasks: it[3] }; });
    return '<div class="cx-card"><h3>Areas requiring coaching</h3><div class="cx-list" style="margin-top:12px">' + (items.length ? items.map(function (it, i) {
      return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(it[0]) + ' · ' + esc(it[1]) + '</span><span class="i-meta">Next step: ' + esc(it[2]) + '</span><span class="i-right">' + (it[3].length ? '<button type="button" class="cx-btn sm" data-rec="coach-' + i + '">Records</button>' : '') + (isManager() ? '<button type="button" class="cx-btn sm" data-corr="' + esc(it[0]) + '|' + esc(it[1]) + '">Assign corrective action</button>' : '') + '</span></div>';
    }).join('') : '<div class="cx-empty">No coaching flags from verified data in this period.</div>') + '</div></div>';
  }
  function scorecardsBody() {
    if (!S.scorecards) { loadScorecards(true).then(renderCommand); return '<div class="cx-empty">Loading scorecards…</div>'; }
    if (!S.scorecards.ok) return '<div class="cx-err">Scorecards could not be loaded from the shared server. Nothing is shown as zero.</div>';
    var weeks = []; for (var i = 0; i < 8; i++) weeks.push(L.addDays(L.weekMonday(today()), -7 * i));
    var team = weeks.map(function (w) { var tot = 0, goal = 0, n = 0; LPS.forEach(function (lp) { var r = scorecardFor(lp, w); if (r) { var s = L.scorecardSummary(lp, r.data, liveMetrics(lp)); tot += s.total; goal += s.goal; n++; } }); return { tot: tot, goal: goal, n: n }; });
    return '<div class="cx-card"><div class="cx-head"><div><h3>LP scorecards</h3><div class="cx-note">Existing scorecard methodology: weekly totals against each role\'s goals. Select a cell to open that LP\'s scorecard.</div></div><button type="button" class="cx-btn sm" data-cx="export-sc">Export scorecards</button></div>' +
      '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>LP</th>' + weeks.map(function (w) { return '<th class="cx-num">' + esc(fmtDate(w)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      LPS.map(function (lp) {
        return '<tr><td><b>' + esc(lp) + '</b></td>' + weeks.map(function (w) {
          var r = scorecardFor(lp, w);
          if (!r) return '<td class="cx-num"><button type="button" class="cx-link" style="color:var(--cx-bad)" data-sc="' + lp + '">Missing</button></td>';
          var s = L.scorecardSummary(lp, r.data, liveMetrics(lp));
          return '<td class="cx-num"><button type="button" class="cx-link" data-sc="' + lp + '">' + s.total + '/' + s.goal + ' · ' + s.pct + '%</button></td>';
        }).join('') + '</tr>';
      }).join('') +
      '<tr><td><b>Team</b></td>' + team.map(function (x) { return '<td class="cx-num"><b>' + (x.n ? pctOf(x.tot, x.goal) + '%' : '—') + '</b><br><span class="cx-small">' + x.n + ' of 6 entered</span></td>'; }).join('') + '</tr>' +
      '</tbody></table></div></div>';
  }
  function fundedIn(range) { return Object.keys(S.loans).map(function (k) { return S.loans[k]; }).filter(function (l) { return l.funding_verified && L.inRange(l.closed_date, range); }); }
  function productionBody(range, period) {
    var t0 = today(), y = +t0.slice(0, 4), q = L.quarterOf(t0);
    var ext = S.ext, vel = ext && ext.leadsAll ? ext.leadsAll.filter(function (l) { return L.inRange(L.toIsoDate(l.date_added), range); }) : null;
    var f = vel ? L.velocifyFunnel(vel) : null;
    var active = Object.keys(S.loans).map(function (k) { return S.loans[k]; }).filter(function (l) { return l.pipeline_status === 'active'; });
    var funded = fundedIn(range), qr = L.quarterRange(y, q), qFunded = fundedIn(qr);
    var target = y === L.PLAN.year ? L.PLAN.fundings.quarters[q] : null, pace = target ? L.pace(qFunded.length, target, qr, t0) : null;
    var hasFunded = hasImport('funded_units');
    var followups = S.tasks.filter(function (t) { return t.next_action_date && t.next_action_date <= t0 && (t.status === 'completed' || t.status === 'exception') && t.next_action_date >= L.addDays(t0, -14); });
    S._rec['prod-active'] = { title: 'Active pipeline loans', loans: active };
    S._rec['prod-funded'] = { title: 'Funded loans · ' + PERIODS[period], loans: funded };
    S._rec['prod-follow'] = { title: 'Client follow-ups due', tasks: followups };
    var cv = function (label, val, tgt) { return '<tr><td>' + label + '</td><td class="cx-num">' + (val === null || val === undefined ? '<span class="cx-muted">Data unavailable</span>' : val + '%') + '</td><td class="cx-num">' + tgt + '</td></tr>'; };
    var bottleneck = null;
    if (f) [['Lead to application', f.leadToApp, 80], ['Application to preapproval', f.appToPre, 55], ['Preapproval to contract', f.preToContract, 65], ['Contract to funded', f.contractToFunded, 75]].forEach(function (s) { if (s[1] !== null && (!bottleneck || (s[2] - s[1]) > (bottleneck[2] - bottleneck[1]))) bottleneck = s; });
    var velTile = function (label, val, foot) { return '<div class="cx-tile' + (val === null ? ' is-na' : '') + '" style="cursor:default"><span class="t-label">' + esc(label) + '</span><span class="t-val">' + (val === null ? 'Data unavailable' : val) + '</span><span class="t-foot">' + foot + '</span></div>'; };
    return '<div class="cx-stack"><div class="cx-card"><div class="cx-head"><h3>Production · ' + esc(PERIODS[period]) + '</h3><span class="cx-note">Leads through contracts: Velocify current-status cohort (same rules as LP Conversion). Funded: Encompass Funded Units.</span></div>' +
      (!ext ? '<div class="cx-empty" style="margin-top:12px">Loading Velocify…</div>' : '') +
      '<div class="cx-tiles" style="margin-top:12px">' +
      velTile('Leads received', f ? f.leads : null, 'Unique Velocify leads') + velTile('Applications started', f ? f.apps : null, f && f.leadToApp !== null ? f.leadToApp + '% of leads' : '') +
      velTile('Preapprovals', f ? f.pre : null, f && f.appToPre !== null ? f.appToPre + '% of applications' : '') + velTile('Active shopping', f ? f.shopping : null, 'Preapproved, no contract yet') +
      velTile('Contracts', f ? f.contracts : null, f && f.preToContract !== null ? f.preToContract + '% of preapprovals' : '') +
      tileHtml('rec:prod-funded', 'Funded loans', hasFunded ? String(funded.length) : 'Data unavailable', target ? 'Q' + q + ' ' + qFunded.length + ' of ' + target + (pace.status === 'behind' ? ' · need ' + pace.requiredPerWeek + '/wk' : '') : 'Funded Units report', hasFunded ? '' : 'is-na') +
      tileHtml('rec:prod-active', 'Active pipeline', String(active.length), 'From the pipeline report') +
      tileHtml('rec:prod-follow', 'Client follow-ups due', String(followups.length), 'Next actions due from finished calls') +
      '</div><div class="cx-split" style="margin-top:14px"><div><table class="cx-t"><thead><tr><th>Conversion</th><th class="cx-num">Actual</th><th class="cx-num">Plan</th></tr></thead><tbody>' +
      cv('Lead to application', f ? f.leadToApp : null, '80%+') + cv('Application to preapproval', f ? f.appToPre : null, '55%') + cv('Preapproval to contract', f ? f.preToContract : null, '65% (Q1 60%)') + cv('Contract to funded', f ? f.contractToFunded : null, '75%') +
      '</tbody></table></div><div class="cx-small"><b>Pipeline bottleneck</b><br>' + (bottleneck ? esc(bottleneck[0]) + ' is furthest below plan: ' + bottleneck[1] + '% against ' + bottleneck[2] + '%.' : 'Not enough Velocify data in this period.') +
      '<p class="cx-note">Cohort rates use each lead\'s current status, so recent leads have not had time to fund. They are actual ratios, not projections.</p></div></div></div>' + referralCard(range) + '</div>';
  }
  function referralCard(range) {
    var t0 = today(), c = L.referralMetrics(S.tasks, ['tuesday', 'contract', 'preclose'], range, t0), p = L.referralMetrics(S.tasks, ['pc30', 'pc60', 'pc90'], range, t0);
    S._rec['ref-ccr'] = { title: 'Current-client named introductions', tasks: c.named.map(function (n) { return n.task; }) };
    S._rec['ref-pcr'] = { title: 'Past-client named introductions', tasks: p.named.map(function (n) { return n.task; }) };
    var crm = function (m) { var s = {}; m.named.forEach(function (n) { if (n.task.crm_reference) s[L.normKey(n.task.crm_reference)] = 1; }); return Object.keys(s).length; };
    var row = function (label, m, key) {
      var apps = m.named.filter(function (n) { return n.task.referral_status === 'in_process' || n.task.referral_status === 'funded'; }).length;
      return '<tr><td>' + label + '</td><td class="cx-num">' + m.asked.length + '</td><td class="cx-num"><button type="button" class="cx-link" data-rec="' + key + '">' + m.named.length + '</button></td><td class="cx-num">' + crm(m) + '</td><td class="cx-num">' + apps + '</td><td class="cx-num">' + m.namedFunded.length + '</td><td class="cx-num">' + (m.conversionPct === null ? '—' : m.conversionPct + '%') + '</td></tr>';
    };
    return '<div class="cx-card"><div class="cx-head"><h3>Referral production</h3><span class="cx-note">Requests are activity; introductions and fundings are production</span></div><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th></th><th class="cx-num">Requests</th><th class="cx-num">Named introductions</th><th class="cx-num">Unique CRM leads</th><th class="cx-num">Applications</th><th class="cx-num">Funded</th><th class="cx-num">Intro → funded</th></tr></thead><tbody>' +
      row('Current-client (CCR)', c, 'ref-ccr') + row('Past-client (PCR)', p, 'ref-pcr') + '</tbody></table></div>' +
      '<p class="cx-note" style="margin-top:8px">A returning past client financing their own loan is recorded as "Client\'s own financing opportunity", never as a PCR introduction. Applications and fundings come from the referral status the LP updates.</p></div>';
  }
  function recordsBody() {
    var r = S.records;
    if (!r) return '<div class="cx-empty">Open any metric to see its records here.</div>';
    if (r.loans) {
      var ls = r.loans.slice().sort(function (a, b) { return String(b.closed_date || b.est_closing_date || '').localeCompare(String(a.closed_date || a.est_closing_date || '')); });
      return '<div class="cx-card"><div class="cx-head"><div><h3>' + esc(r.title) + '</h3><div class="cx-note">' + ls.length + ' loans' + (isManager() ? ' · Funding source feeds the 2027 source breakdown' : '') + '</div></div></div>' + (ls.length ? loansTable(ls, false, isManager()) : '<div class="cx-empty" style="margin-top:12px">No loans.</div>') + '</div>';
    }
    var ts = (r.tasks || []).slice().sort(sortWork), t0 = today();
    var head = '<div class="cx-head"><div><h3>' + esc(r.title) + '</h3><div class="cx-note">' + ts.length + ' records</div></div>' +
      (isManager() && ts.length ? '<div class="cx-row"><select data-bulk="owner" style="width:auto">' + opts(LPS.map(function (x) { return [x, x]; }), '', 'Assign owner…') + '</select><select data-bulk="coverage" style="width:auto">' + opts([['__none', 'Remove coverage']].concat(LPS.map(function (x) { return [x, 'Cover: ' + x]; })), '', 'Coverage…') + '</select>' +
        '<button type="button" class="cx-btn sm" data-bulk-go="1">Apply to selected</button><button type="button" class="cx-btn sm" data-bulk-review="1">Close selected Needs Review</button></div>' : '') + '</div>';
    if (!ts.length) return '<div class="cx-card">' + head + '<div class="cx-empty" style="margin-top:12px">No records.</div></div>';
    return '<div class="cx-card">' + head + '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr>' + (isManager() ? '<th><input type="checkbox" data-selall aria-label="Select all"></th>' : '') + '<th>Borrower</th><th class="cx-hide-sm">Loan</th><th>Type</th><th>Owner</th><th>Due</th><th>Outcome</th><th class="cx-hide-sm">Referral</th><th class="cx-hide-sm">Agent</th><th class="cx-hide-sm">Next action</th></tr></thead><tbody>' +
      ts.map(function (t) {
        return '<tr class="click" data-open-task="' + esc(t.id) + '">' + (isManager() ? '<td><input type="checkbox" data-sel="' + esc(t.id) + '" aria-label="Select"></td>' : '') + '<td><b>' + esc(borrowerOf(t)) + '</b></td><td class="cx-hide-sm">' + esc(t.loan_number) + '</td><td>' + esc(typeLabel(t.task_type)) + '</td><td>' + esc(lpLabel(t.owner_lp)) + (t.coverage_lp ? ' → ' + esc(t.coverage_lp) : '') + '</td><td>' + esc(fmtDate(t.due_date)) + '</td><td>' + esc(L.outcomeLabel(t, t0)) + '</td>' +
          '<td class="cx-hide-sm">' + (t.referral_requested ? 'Asked · ' : 'Not asked · ') + esc((L.REFERRAL_RESPONSES.find(function (x) { return x[0] === t.referral_response; }) || [0, '—'])[1]) + (t.referral_name ? ': ' + esc(t.referral_name) : '') + '</td><td class="cx-hide-sm">' + esc(((L.AGENT_OUTCOMES.find(function (x) { return x[0] === t.agent_outcome; }) || [0, '—'])[1])) + '</td><td class="cx-hide-sm">' + esc(t.next_action || '') + (t.next_action_date ? ' · ' + esc(fmtDate(t.next_action_date)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  var SOURCE_OPTS = L.PLAN.sources.map(function (s) { return [s[0], s[1]]; }).concat([['other', 'Other']]);
  function loansTable(loans, selectable, classify) {
    return '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr>' + (selectable ? '<th><input type="checkbox" data-selall aria-label="Select all"></th>' : '') + '<th>Borrower</th><th>Loan</th><th>Status</th><th>Milestone</th><th>Closing</th><th class="cx-hide-sm">Buyer agent</th><th class="cx-hide-sm">Referral source</th><th>Owner</th>' + (classify ? '<th>Funding source</th>' : '') + '</tr></thead><tbody>' +
      loans.map(function (l) {
        return '<tr>' + (selectable ? '<td><input type="checkbox" data-sel-loan="' + esc(l.loan_number) + '" aria-label="Select"></td>' : '') + '<td><b>' + esc(l.borrower_name || '—') + '</b></td><td>' + esc(l.loan_number) + '</td><td>' + esc(String(l.pipeline_status).replace('_', ' ')) + '</td><td>' + esc(l.last_milestone || '—') + '</td><td>' + esc(fmtDate(l.closed_date || l.est_closing_date)) + '</td><td class="cx-hide-sm">' + esc(l.buyer_agent_name || '—') + '</td><td class="cx-hide-sm">' + esc(l.referral_source_name || '—') + '</td><td>' + esc(l.lp_owner || (l.ownership_status === 'conflict' ? 'Conflict' : 'Unassigned')) + '</td>' +
          (classify ? '<td><select data-src-loan="' + esc(l.loan_number) + '" data-ver="' + l.row_version + '" style="min-width:150px">' + opts(SOURCE_OPTS, l.funding_source_category, 'Not classified') + '</select></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function unassignedBody() {
    var loans = unassignedActiveLoans()
      .sort(function (a, b) { return String(b.closed_date || b.est_closing_date || '').localeCompare(String(a.closed_date || a.est_closing_date || '')); });
    return '<div class="cx-card"><div class="cx-head"><div><h3>Assignment review queue</h3><div class="cx-note">Verify LP2 in Encompass, then assign the loan. This queue shows active pipeline and funded loans with open calls.</div></div>' +
      (isManager() && loans.length ? '<div class="cx-row"><select data-assign-lp style="width:auto">' + opts(LPS.map(function (x) { return [x, x]; }), '', 'Assign selected to…') + '</select><button type="button" class="cx-btn primary sm" data-assign-go="1">Assign</button></div>' : '') + '</div>' +
      (loans.length ? loansTable(loans, isManager()) : '<div class="cx-complete-banner" style="margin-top:12px">✓ No active loans need an owner.</div>') + '</div>';
  }
  function fundingBody() {
    var ex = Object.keys(S.loans).map(function (k) { return S.loans[k]; }).filter(function (l) { return l.pipeline_status === 'funding_exception'; });
    return '<div class="cx-card"><h3>Funding review</h3><div class="cx-note">Loans in the Funded Units report whose last milestone is not Funding. They get no post-closing calls until verified.</div>' +
      (ex.length ? '<div class="cx-list" style="margin-top:12px">' + ex.map(function (l) {
        return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(l.borrower_name || l.loan_number) + ' · ' + esc(l.loan_number) + '</span><span class="i-meta">' + esc(l.funding_note || '') + ' · Closed ' + esc(fmtDate(l.closed_date)) + '</span><span class="i-right">' +
          (isManager() ? '<button type="button" class="cx-btn sm" data-fund="' + esc(l.loan_number) + '|1">Verified funded</button><button type="button" class="cx-btn sm danger" data-fund="' + esc(l.loan_number) + '|0">Not funded</button>' : '') + '</span></div>';
      }).join('') + '</div>' : '<div class="cx-complete-banner" style="margin-top:12px">✓ Complete. Nothing to review.</div>') + '</div>';
  }
  function coverageBody() {
    var t0 = today(), load = LPS.map(function (lp) { return [lp, S.tasks.filter(function (t) { return owner(t) === lp && isOpen(t) && t.due_date <= L.addDays(t0, 7); }).length]; });
    return '<div class="cx-card"><h3>Workload and out-of-office coverage</h3><div class="cx-note">During coverage, the covering LP sees and works the absent LP\'s calls. Ownership does not change.</div>' +
      '<div class="cx-row" style="margin-top:10px">' + load.map(function (x) { return '<span class="cx-chip">' + esc(x[0]) + ' · ' + x[1] + ' open next 7 days</span>'; }).join('') + '</div>' +
      (isManager() ? '<form data-cx="coverage" class="cx-row" style="margin-top:12px;align-items:flex-end"><div><label class="cx-f">Out</label><select name="from_lp" required>' + opts(LPS.map(function (x) { return [x, x]; }), '', 'Select') + '</select></div><div><label class="cx-f">Covered by</label><select name="to_lp" required>' + opts(LPS.map(function (x) { return [x, x]; }), '', 'Select') + '</select></div><div><label class="cx-f">From</label><input type="date" name="start_date" value="' + t0 + '" required></div><div><label class="cx-f">Through</label><input type="date" name="end_date" value="' + t0 + '" required></div><div class="cx-grow"><label class="cx-f">Reason</label><input type="text" name="reason"></div><button class="cx-btn primary" type="submit">Add coverage</button></form>' : '') +
      '<div class="cx-list" style="margin-top:12px">' + (S.coverage.length ? S.coverage.map(function (c) {
        var live = c.start_date <= t0 && c.end_date >= t0;
        return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(c.from_lp) + ' → ' + esc(c.to_lp) + '</span><span class="i-meta">' + esc(fmtDate(c.start_date)) + ' – ' + esc(fmtDate(c.end_date)) + (c.reason ? ' · ' + esc(c.reason) : '') + '</span><span class="i-right">' + (live ? '<span class="cx-chip chip-purple">Active today</span>' : '<span class="cx-chip">Scheduled</span>') + (isManager() ? '<button type="button" class="cx-btn sm" data-endcov="' + esc(c.id) + '">End</button>' : '') + '</span></div>';
      }).join('') : '<div class="cx-empty">No coverage scheduled.</div>') + '</div></div>';
  }
  function correctionsBody() {
    var list = S.corrections.slice().sort(function (a, b) { return (a.status === 'verified') - (b.status === 'verified') || String(a.due_date).localeCompare(String(b.due_date)); });
    return '<div class="cx-card"><div class="cx-head"><h3>Corrective actions</h3>' + (isManager() ? '<button type="button" class="cx-btn primary sm" data-newcorr="1">Assign corrective action</button>' : '') + '</div><div class="cx-list" style="margin-top:12px">' + (list.length ? list.map(function (c) {
      var late = c.status !== 'verified' && c.status !== 'resolved' && c.due_date < today();
      return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(c.lp) + ' · ' + esc(c.issue) + '</span><span class="i-meta">Due ' + esc(fmtDate(c.due_date)) + (c.expected_behavior ? ' · Expected: ' + esc(c.expected_behavior) : '') + (c.resolution_note ? ' · Resolution: ' + esc(c.resolution_note) : '') + '</span><span class="i-right"><span class="cx-chip ' + (c.status === 'verified' ? 'chip-done' : late ? 'chip-overdue' : 'chip-open') + '">' + esc(late ? 'Past due' : c.status) + '</span>' +
        (isManager() && c.status === 'resolved' ? '<button type="button" class="cx-btn sm" data-verify="' + esc(c.id) + '">Verify</button><button type="button" class="cx-btn sm" data-reopen-corr="' + esc(c.id) + '">Reopen</button>' : '') +
        (c.task_id ? '<button type="button" class="cx-btn sm" data-open-task="' + esc(c.task_id) + '">Record</button>' : '') + '</span></div>';
    }).join('') : '<div class="cx-empty">No corrective actions assigned.</div>') + '</div></div>';
  }
  function dataBody() {
    var cutoff = L.addDays(today(), -59);
    var recentImports = S.imports.filter(function (report) { return L.isoOfInstant(report.imported_at) >= cutoff; });
    return '<div class="cx-stack">' +
      (isManager() ? '<div class="cx-split"><div class="cx-card"><h3>Weekly pipeline report</h3><p class="cx-note">Encompass Tuesday Updates report with the "Loan Partner 2" column. Creates the week\'s Tuesday Updates, new contract calls and pre-closing reviews. Re-importing the same file creates nothing new.</p><label class="cx-f">Report date</label><input type="date" data-imp-date value="' + today() + '"><label class="cx-f">File</label><input type="file" accept=".xlsx,.xls" data-imp="pipeline"><div data-preview="pipeline" style="margin-top:10px">' + importMsg('pipeline') + '</div></div>' +
        '<div class="cx-card"><h3>Funded Units report</h3><p class="cx-note">Uses the Funding milestone, actual Closed Date, and Encompass LP2. Pre-launch loans get 30- or 60-day calls still due at launch. Loans closed from launch onward get all three calls.</p><label class="cx-f">File</label><input type="file" accept=".xlsx,.xls" data-imp="funded"><div data-preview="funded" style="margin-top:10px">' + importMsg('funded') + '</div></div></div>' : '<p class="cx-note">Mack can enable uploads from Production Manager.</p>') +
      '<div class="cx-card"><h3>Import history · last 60 days</h3><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>When</th><th>Report</th><th>File</th><th class="cx-num">Rows</th><th class="cx-num">Unique</th><th class="cx-num">Duplicates</th><th class="cx-num">New loans</th><th class="cx-num">Calls created</th><th>Sent to review</th><th>By</th></tr></thead><tbody>' +
      (recentImports.length ? recentImports.map(function (r) {
        var counts = {}; (r.exceptions || []).forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + (e.count || 1); });
        return '<tr><td>' + esc(fmtTime(r.imported_at)) + '</td><td>' + esc(r.kind === 'pipeline' ? 'Pipeline' : 'Funded Units') + '</td><td>' + esc(r.file_name || '') + '</td><td class="cx-num">' + r.source_rows + '</td><td class="cx-num">' + r.accepted_rows + '</td><td class="cx-num">' + r.duplicate_rows + '</td><td class="cx-num">' + r.loans_inserted + '</td><td class="cx-num">' + r.tasks_created + '</td><td>' + esc(Object.keys(counts).map(function (k) { return k.replace(/_/g, ' ') + ' ' + counts[k]; }).join(', ') || 'None') + '</td><td>' + esc(r.imported_by || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="10" class="cx-muted">No imports in the last 60 days.</td></tr>') + '</tbody></table></div></div></div>';
  }
  var importMsgs = {};
  function importMsg(kind) { return importMsgs[kind] ? '<div class="cx-card" style="padding:12px"><div data-import-result>' + importMsgs[kind] + '</div></div>' : ''; }
  function selected(host, attr) { return $all('[' + attr + ']', host).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute(attr); }); }
  function openRec(key) {
    var r = S._rec && S._rec[key]; if (!r) return;
    S.records = r.loans ? { title: r.title, loans: r.loans } : { title: r.title, tasks: r.tasks || [] };
    S.cmdTab = 'records';
    if (!$('#view-core-command').classList.contains('active')) openView('core-command'); else renderCommand();
  }
  function wireCommandBody(host) {
    $all('[data-tile]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-tile');
        if (k.indexOf('tab:') === 0) { S.cmdTab = k.slice(4); renderCommand(); return; }
        if (k.indexOf('rec:') === 0) openRec(k.slice(4));
      });
    });
    $all('[data-tab-go]', host).forEach(function (b) { b.addEventListener('click', function () { S.cmdTab = b.dataset.tabGo; renderCommand(); }); });
    $all('[data-rec]', host).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); openRec(b.getAttribute('data-rec')); }); });
    $all('[data-sc]', host).forEach(function (b) { b.addEventListener('click', function () { openMyScorecard(b.dataset.sc); }); });
    var esb = $('[data-cx="export-sc"]', host); if (esb) esb.addEventListener('click', exportScorecards);
    $all('[data-selall]', host).forEach(function (c) { c.addEventListener('click', function (e) { e.stopPropagation(); $all('[data-sel],[data-sel-loan]', host).forEach(function (x) { x.checked = c.checked; }); }); });
    $all('[data-sel],[data-sel-loan]', host).forEach(function (c) { c.addEventListener('click', function (e) { e.stopPropagation(); }); });
    $all('[data-corr]', host).forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-corr').split('|'); openCorrectionForm({ lp: p[0], issue: p.slice(1).join('|') }); }); });
    var nc = $('[data-newcorr]', host); if (nc) nc.addEventListener('click', function () { openCorrectionForm({}); });
    var bg = $('[data-bulk-go]', host);
    if (bg) bg.addEventListener('click', function () {
      var ids = selected(host, 'data-sel'); if (!ids.length) { toast('Select records first.', true); return; }
      var own = $('[data-bulk="owner"]', host).value, cov = $('[data-bulk="coverage"]', host).value;
      var tasks = S.tasks.filter(function (t) { return ids.indexOf(t.id) >= 0; }), chain = Promise.resolve();
      if (own) { var loans = Array.from(new Set(tasks.map(function (t) { return t.loan_number; }))); chain = chain.then(function () { return apiAct('core_assign_loans', { p_loans: loans, p_lp: own, p_note: 'Bulk assignment' }); }); }
      if (cov) chain = chain.then(function () { return apiAct('core_api_bulk_tasks', { p_ids: ids, p_patch: { coverage_lp: cov === '__none' ? null : cov } }); });
      chain.then(function () { toast('Updated ' + ids.length + ' records.'); S.records = null; S.cmdTab = 'overview'; return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
    });
    var br = $('[data-bulk-review]', host);
    if (br) br.addEventListener('click', function () {
      var ids = selected(host, 'data-sel').filter(function (id) { var t = S.tasks.find(function (x) { return x.id === id; }); return t && t.status === 'needs_review'; });
      if (!ids.length) { toast('Select Needs Review records first.', true); return; }
      var note = window.prompt('Review note for ' + ids.length + ' historical calls (required):', 'Historical call reviewed; no reliable completion evidence before launch');
      if (!note || note.trim().length < 5) return;
      apiAct('core_api_bulk_tasks', { p_ids: ids, p_patch: { status: 'cancelled', review_note: 'Reviewed: ' + note.trim() } })
        .then(function (n) { toast('Closed ' + n + ' reviewed records.'); S.records = null; S.cmdTab = 'overview'; return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
    });
    var ag = $('[data-assign-go]', host);
    if (ag) ag.addEventListener('click', function () {
      var loans = selected(host, 'data-sel-loan'), lp = $('[data-assign-lp]', host).value;
      if (!loans.length || !lp) { toast('Select borrowers and a Loan Partner.', true); return; }
      ag.disabled = true;
      apiAct('core_assign_loans', { p_loans: loans, p_lp: lp, p_note: 'Verified by Production Manager' })
        .then(function (n) { toast('Assigned ' + n + ' borrower' + (n === 1 ? '' : 's') + ' to ' + lp + '.'); return loadAll(); }).catch(function (e) { ag.disabled = false; toast(friendlyServerError(e), true); });
    });
    $all('[data-fund]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-fund').split('|'), funded = p[1] === '1';
        var note = window.prompt(funded ? 'How was funding verified? (required)' : 'Why is this loan not funded? (required)'); if (!note || note.trim().length < 5) return;
        apiAct('core_resolve_funding', { p_loan: p[0], p_funded: funded, p_note: note.trim() }).then(function (r) { toast(funded ? 'Verified funded; ' + ((r && r.tasks_created) || 0) + ' calls scheduled.' : 'Marked not funded.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
      });
    });
    var cf = $('form[data-cx="coverage"]', host);
    if (cf) cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = { from_lp: cf.from_lp.value, to_lp: cf.to_lp.value, start_date: cf.start_date.value, end_date: cf.end_date.value, reason: cf.reason.value || '' };
      if (!body.from_lp || !body.to_lp || body.from_lp === body.to_lp || body.end_date < body.start_date) { toast('Choose two different LPs and a valid date range.', true); return; }
      apiAct('core_api_coverage', { p_action: 'add', p: body }).then(function () { toast('Coverage saved.'); return loadAll(); }).catch(function (err) { toast(friendlyServerError(err), true); });
    });
    $all('[data-endcov]', host).forEach(function (b) { b.addEventListener('click', function () { apiAct('core_api_coverage', { p_action: 'end', p: { id: b.getAttribute('data-endcov') } }).then(function () { toast('Coverage ended.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); }); }); });
    var corrAct = function (attr, action, ask) {
      $all('[' + attr + ']', host).forEach(function (b) {
        b.addEventListener('click', function () {
          var note = ask ? window.prompt(ask) : ''; if (ask && !note) return;
          var p = { id: b.getAttribute(attr) }; if (action === 'verify') p.verification_note = note;
          apiAct('core_api_correction', { p_action: action, p: p }).then(function () { toast('Corrective action updated.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
        });
      });
    };
    corrAct('data-verify', 'verify', 'Verification note (what did you check?)'); corrAct('data-reopen-corr', 'reopen');
    $all('select[data-src-loan]', host).forEach(function (sel) {
      sel.addEventListener('change', function () {
        var ln = sel.getAttribute('data-src-loan'), v = sel.value || '';
        apiAct('core_api_loan_source', { p_loan: ln, p_category: v, p_version: +sel.getAttribute('data-ver') })
          .then(function (row) { if (!row || (row.funding_source_category || '') !== v) throw new Error('Not confirmed by the server.'); S.loans[ln] = row; sel.setAttribute('data-ver', row.row_version); toast('Funding source saved.'); })
          .catch(function (e) { toast(friendlyServerError(e), true); sel.value = (S.loans[ln] || {}).funding_source_category || ''; });
      });
    });
    $all('input[data-imp]', host).forEach(function (inp) { inp.addEventListener('change', function () { previewImport(inp, host); }); });
  }

  // ================================================================ imports and exports
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = function () { res(window.XLSX); }; s.onerror = function () { rej(new Error('The Excel library could not load.')); }; document.head.appendChild(s);
    });
  }
  function previewImport(inp, host) {
    var kind = inp.getAttribute('data-imp'), box = $('[data-preview="' + kind + '"]', host), file = inp.files && inp.files[0];
    if (!file) return;
    box.innerHTML = '<div class="cx-note">Reading ' + esc(file.name) + '…</div>';
    loadXlsx().then(function (X) { return file.arrayBuffer().then(function (buf) { return X.read(buf, { type: 'array', cellDates: true }); }); }).then(function (wb) {
      var X = window.XLSX, sheets = wb.SheetNames, best = null;
      var parse = function (name) { var rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }); return kind === 'pipeline' ? L.parsePipeline(rows) : L.parseFunded(rows); };
      for (var i = 0; i < sheets.length && !best; i++) { var p0 = parse(sheets[i]); if (!p0.error) best = { sheet: sheets[i], parsed: p0 }; }
      if (!best) { box.innerHTML = '<div class="cx-err">This file does not match the ' + (kind === 'pipeline' ? 'pipeline report: no "Loan Partner 2" column' : 'Funded Units report: Loan Number, Borrower Name, Last Finished Milestone and Closed Date are required') + '. Nothing was imported.</div>'; return; }
      var draw = function () {
        var p = best.parsed, counts = {}; p.issues.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
        var lpCounts = {}; if (kind === 'pipeline') p.rows.forEach(function (r) { var k = r.lp_short || 'Unassigned'; lpCounts[k] = (lpCounts[k] || 0) + 1; });
        box.innerHTML = '<div class="cx-card" style="padding:12px"><b>' + esc(file.name) + '</b> · sheet "' + esc(best.sheet) + '"<br><span class="cx-small">' + p.rows.length + ' rows · ' + p.uniqueLoans + ' unique loans · ' +
          (kind === 'funded' ? esc(Object.keys(p.milestones).map(function (m) { return m + ' ' + p.milestones[m]; }).join(', ')) : esc(Object.keys(lpCounts).map(function (k) { return k + ' ' + lpCounts[k]; }).join(', '))) + '</span>' +
          (Object.keys(counts).length ? '<div class="cx-warn" style="margin-top:8px">' + esc(Object.keys(counts).map(function (k) { return counts[k] + ' ' + k.replace(/_/g, ' '); }).join(' · ')) + '. These go to review; nothing is guessed.</div>' : '') +
          (sheets.length > 1 ? '<label class="cx-f">Sheet</label><select data-sheet>' + opts(sheets.map(function (s) { return [s, s]; }), best.sheet) + '</select>' : '') +
          '<div class="cx-row" style="margin-top:10px"><button type="button" class="cx-btn primary" data-run-import>Import ' + p.uniqueLoans + ' loans</button></div><div data-import-result></div></div>';
        var sel = $('[data-sheet]', box);
        if (sel) sel.addEventListener('change', function () { var pp = parse(sel.value); if (pp.error) { toast(pp.error, true); sel.value = best.sheet; return; } best = { sheet: sel.value, parsed: pp }; draw(); });
        $('[data-run-import]', box).addEventListener('click', function (e) {
          var btn = e.target; btn.disabled = true; btn.textContent = 'Importing…';
          var rows = best.parsed.rows.map(function (r) { var o = Object.assign({}, r); delete o.lp_short; return o; });
          var call = kind === 'pipeline' ? apiAct('core_import_pipeline', { p_rows: rows, p_file: file.name + ' [' + best.sheet + ']', p_plan_date: ($('[data-imp-date]', host) || {}).value || today() })
            : apiAct('core_import_funded', { p_rows: rows, p_file: file.name + ' [' + best.sheet + ']' });
          importMsgs[kind] = null;
          call.then(function (r) {
            importMsgs[kind] = '<div class="cx-ok" style="margin-top:8px">✓ ' + esc(file.name) + ' imported: ' + r.accepted + ' loans (' + r.loans_inserted + ' new, ' + r.loans_updated + ' updated), ' + r.tasks_created + ' tasks created' + (r.tasks_rescheduled ? ', ' + r.tasks_rescheduled + ' rescheduled' : '') + ', ' + r.duplicates + ' duplicate rows ignored, ' + (r.exceptions || []).length + ' sent to review.</div>';
            return loadAll();
          }).catch(function (err) { importMsgs[kind] = '<div class="cx-err" style="margin-top:8px">Import failed; nothing was changed. ' + esc(friendlyServerError(err)) + '</div>'; renderAll(); });
        });
      };
      draw();
    }).catch(function (e) { box.innerHTML = '<div class="cx-err">' + esc(e.message) + '</div>'; });
  }
  function exportWorkbook(period) {
    loadXlsx().then(function (X) {
      var range = periodRange(period), rows = teamStats(range), wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.map(function (r) {
        return { 'Loan Partner': r.lp, Period: PERIODS[period], 'Tuesday assigned': r.tue.required.length, 'Tuesday completed': r.tue.completed.length, 'Attempted only': r.tue.attempted.filter(function (t) { return t.status !== 'completed'; }).length, 'Tuesday outstanding': r.tue.outstanding.length,
          'CCR requests': r.tue.asked.length, 'CCR introductions': r.tue.named.length, 'Post-closing due': r.pc.required.length, 'Post-closing completed': r.pc.completed.length, 'PCR requests': r.pc.asked.length, 'PCR introductions': r.pc.named.length,
          Overdue: r.overdue.length, 'Client concerns': r.concerns.length, 'Scorecard this week': r.sc === null ? 'Unavailable' : r.sc ? 'Entered' : 'Missing', 'Open corrective actions': r.corr.length };
      })), 'Team Summary');
      var taskRows = S.tasks.filter(function (t) { return L.inRange(t.due_date, range); }).map(function (t) {
        return { Borrower: borrowerOf(t), 'Loan Number': t.loan_number, Type: typeLabel(t.task_type), Owner: t.owner_lp || 'Unassigned', Coverage: t.coverage_lp || '', Due: t.due_date, Outcome: L.outcomeLabel(t, today()), 'Borrower contact': t.borrower_outcome || '', 'Conversation at': t.conversation_at || '',
          'Referral asked': t.referral_requested ? 'Yes' : 'No', 'Client response': t.referral_response || '', 'Referral name': t.referral_name || '', 'CRM reference': t.crm_reference || '', 'Buyer agent': t.agent_outcome || '', Concern: t.concern_status, Escalated: t.escalated ? 'Yes' : 'No', 'Next action': t.next_action || '', 'Follow-up': t.next_action_date || '', 'Completed at': t.completed_at || '', 'Completed by': t.completed_by || '' };
      });
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(taskRows.length ? taskRows : [{ Note: 'No records in period' }]), 'Activity');
      var un = Object.keys(S.loans).map(function (k) { return S.loans[k]; }).filter(function (l) { return l.ownership_status !== 'verified'; }).map(function (l) { return { Borrower: l.borrower_name, 'Loan Number': l.loan_number, Status: l.pipeline_status, Milestone: l.last_milestone, Closed: l.closed_date || '', 'Est closing': l.est_closing_date || '' }; });
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(un.length ? un : [{ Note: 'None' }]), 'Unassigned');
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(S.corrections.length ? S.corrections.map(function (c) { return { LP: c.lp, Issue: c.issue, Expected: c.expected_behavior || '', Due: c.due_date, Status: c.status, Resolution: c.resolution_note || '', 'Verified by': c.verified_by || '' }; }) : [{ Note: 'None' }]), 'Corrective Actions');
      X.writeFile(wb, 'CORE_Activity_' + period + '_' + today() + '.xlsx');
      toast('Excel export downloaded.');
    }).catch(function (e) { toast(e.message, true); });
  }
  function exportScorecards() {
    loadXlsx().then(function (X) {
      var rows = (S.scorecards && S.scorecards.rows || []).map(function (r) { var s = L.scorecardSummary(r.person, r.data, liveMetrics(r.person)), o = { LP: r.person, 'Week of': String(r.week_key).slice(0, 10) }; s.rows.forEach(function (m) { o[m.label] = m.total; o[m.label + ' goal'] = m.goal; }); o.Total = s.total; o.Goal = s.goal; o['% of goal'] = s.pct; return o; });
      var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No scorecards' }]), 'Scorecards');
      X.writeFile(wb, 'CORE_Scorecards_' + today() + '.xlsx'); toast('Scorecard export downloaded.');
    }).catch(function (e) { toast(e.message, true); });
  }

  // ================================================================ Daniel: 2027 plan
  function loadExternal() {
    if (S.ext && Date.now() - S.ext.at < 5 * 60000) return Promise.resolve(S.ext);
    if (S._extLoading) return S._extLoading;
    var y0 = +today().slice(0, 4);
    S._extLoading = Promise.all([
      anonGet('agent_profiles?select=agent_name,closes_past_year,latest_lead_date,latest_close_date,relationship_status,powerbi_last_seen_at').catch(function () { return null; }),
      anonGet('velocify_leads?select=lead_key,date_added,status&date_added=gte.' + Math.min(y0, L.PLAN.year) + '-01-01&limit=20000').catch(function () { return null; }),
      anonGet('powerbi_import_log?select=imported_at&order=imported_at.desc&limit=1').catch(function () { return null; }),
      anonGet('velocify_leads?select=created_at&order=created_at.desc&limit=1').catch(function () { return null; })
    ]).then(function (r) { S.ext = { at: Date.now(), profiles: r[0], leadsAll: r[1], pbi: r[2] && r[2][0], vel: r[3] && r[3][0] }; S._extLoading = null; renderAll(); return S.ext; });
    return S._extLoading;
  }
  function planTile(label, value, foot, cls, rec) {
    return rec ? '<button type="button" data-plan-rec="' + rec + '" class="cx-tile ' + (cls || '') + '"><span class="t-label">' + esc(label) + '</span><span class="t-val">' + value + '</span><span class="t-foot">' + foot + '</span></button>'
      : '<div style="cursor:default" class="cx-tile ' + (cls || '') + '"><span class="t-label">' + esc(label) + '</span><span class="t-val">' + value + '</span><span class="t-foot">' + foot + '</span></div>';
  }
  function paceFoot(p, unit) {
    if (!p || p.status === 'unavailable') return 'Data unavailable';
    if (p.status === 'not_started') return 'Target ' + p.target + ' · starts Jan 1, 2027 · needs ' + p.requiredPerWeek + ' ' + unit + '/week';
    return p.pct + '% of ' + p.target + ' · ' + p.gap + ' remaining' + (p.gap ? ' · need ' + p.requiredPerWeek + '/week' : '') + (p.status === 'behind' ? ' · behind pace' : p.status === 'on_pace' ? ' · on pace' : ' · met');
  }
  function renderPlan() {
    var host = $('#view-core-plan'); if (!host) return;
    var P = L.PLAN, t0 = today(), y = P.year;
    if (!S.ext) loadExternal();
    if (!S.scorecards) loadScorecards().then(function () { renderAll(); });
    var signed = !!S.tier, per = S.planPeriod || 'year';
    var curQ = t0.slice(0, 4) === String(y) ? L.quarterOf(t0) : 1;
    var range = per === 'year' ? { start: y + '-01-01', end: y + '-12-31' } : per === 'quarter' ? L.quarterRange(y, curQ) : (t0.slice(0, 4) === String(y) ? L.monthRange(t0) : { start: y + '-01-01', end: y + '-01-31' });
    var started = t0 >= range.start, asOf = t0 < range.end ? t0 : range.end;
    var fundTarget = per === 'year' ? P.fundings.annual : per === 'quarter' ? P.fundings.quarters[curQ] : Math.round(P.fundings.quarters[curQ] / 3);
    var funded = signed && hasImport('funded_units') ? fundedIn(range) : null;
    var fp = L.pace(funded ? funded.length : null, fundTarget, range, t0);
    var vel = S.ext && S.ext.leadsAll ? S.ext.leadsAll.filter(function (l) { return L.inRange(L.toIsoDate(l.date_added), range); }) : null;
    var fun = vel ? L.velocifyFunnel(vel) : null;
    var leadTarget = per === 'year' ? P.relationshipLeads : per === 'quarter' ? (curQ === 1 ? P.q1.leads : Math.round(P.relationshipLeads / 4)) : Math.round(P.relationshipLeads / 12);
    var startTarget = per === 'year' ? P.fileStarts : per === 'quarter' ? (curQ === 1 ? P.q1.starts : Math.round(P.fileStarts / 4)) : Math.round(P.fileStarts / 12);
    var ccr = signed ? L.referralMetrics(S.tasks, ['tuesday', 'contract', 'preclose'], range, asOf) : null;
    var pcr = signed ? L.referralMetrics(S.tasks, ['pc30', 'pc60', 'pc90'], range, asOf) : null;
    var refTarget = per === 'year' ? 120 : per === 'quarter' ? 30 : 10, refFunded = per === 'year' ? 30 : per === 'quarter' ? 7.5 : null;
    var periodLabel = per === 'year' ? y + ' plan year' : per === 'quarter' ? 'Q' + curQ + ' ' + y : (started ? new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'January ' + y);
    var ns = function (v) { return v === null ? 'Data unavailable' : started ? String(v) : 'Not started'; };
    var nsCls = function (avail, extra) { return (!avail || !started ? 'is-na ' : '') + (extra || ''); };
    if (signed) { S._rec['plan-funded'] = { title: 'Funded loans · ' + periodLabel, loans: funded || [] }; S._rec['plan-ccr'] = { title: 'CCR introductions · ' + periodLabel, tasks: ccr.named.map(function (n) { return n.task; }) }; S._rec['plan-pcr'] = { title: 'PCR introductions · ' + periodLabel, tasks: pcr.named.map(function (n) { return n.task; }) }; }
    var prof = S.ext && S.ext.profiles, rel = null;
    if (prof) {
      var act = prof.filter(function (p) { return String(p.relationship_status || 'active').toLowerCase() !== 'inactive'; }), tiers = { Channel: 0, A: 0, B: 0 }, cutoff = L.addDays(t0, -90);
      act.forEach(function (p) { var tr = L.tierFromCloses(p.closes_past_year); if (tiers[tr] !== undefined) tiers[tr]++; });
      rel = { tiers: tiers, rolling: act.filter(function (p) { return (L.toIsoDate(p.latest_lead_date) || '') >= cutoff || (L.toIsoDate(p.latest_close_date) || '') >= cutoff; }).length };
    }
    var sourceRows = P.sources.map(function (s) {
      var target = per === 'year' ? s[2] : Math.round(s[2] * (per === 'quarter' ? (P.fundings.quarters[curQ] / 400) : 1 / 12));
      var a = funded ? funded.filter(function (l) { return l.funding_source_category === s[0]; }).length : null;
      return '<tr><td>' + esc(s[1]) + '</td><td class="cx-num">' + target + '</td><td class="cx-num">' + (a === null ? '<span class="cx-muted">Data unavailable</span>' : started ? a : '<span class="cx-muted">Not started</span>') + '</td></tr>';
    }).join('');
    var unclassified = funded ? funded.filter(function (l) { return !l.funding_source_category; }).length : 0;
    var wk = L.weekMonday(t0), sc = S.scorecards && S.scorecards.ok ? LPS.map(function (lp) { return scorecardFor(lp, wk); }) : null;
    var cvRow = function (label, val, tgt, note) { return '<tr><td>' + esc(label) + '</td><td class="cx-num">' + esc(tgt) + '</td><td class="cx-num">' + (val === null || val === undefined ? '<span class="cx-muted">Data unavailable</span>' : !started ? '<span class="cx-muted">Not started</span>' : val + '%') + '</td><td class="cx-small cx-muted">' + esc(note || '') + '</td></tr>'; };
    var bott = [];
    if (fun && started) [['Lead to application', fun.leadToApp, 80], ['Application to preapproval', fun.appToPre, 55], ['Preapproval to contract', fun.preToContract, per === 'quarter' && curQ === 1 ? 60 : 65], ['Contract to funded', fun.contractToFunded, 75]].forEach(function (s) { if (s[1] !== null && s[1] < s[2]) bott.push(s[0] + ': ' + s[1] + '% against ' + s[2] + '% plan'); });
    if (signed) {
      var od = S.tasks.filter(function (t) { return owner(t) && isOpen(t) && t.due_date < t0; }).length; if (od) bott.push(od + ' overdue client calls across the team');
      var un = unassignedActiveLoans().length; if (un) bott.push(un + ' active loans need an LP owner');
    }
    if (sc && sc.some(function (x) { return !x; })) bott.push(sc.filter(function (x) { return !x; }).length + ' LP scorecards not entered this week');
    host.innerHTML = '<div class="cx-stack"><div class="cx-head"><div><div class="cx-kicker">Leadership</div><h2>2027 Business Plan</h2><div class="cx-sub">' + esc(periodLabel) + ' · Targets from the final CORE Team 2027 Business Plan</div></div>' +
      '<div class="cx-tabs">' + [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].map(function (p) { return '<button type="button" class="cx-tab' + (per === p[0] ? ' on' : '') + '" data-per="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
      (S.tier ? syncLine() : accessCard('Unlock funded loans, referrals and team execution')) +
      (t0 < y + '-01-01' ? '<div class="cx-warn">The 2027 plan year begins January 1, 2027. Until then, actuals read "Not started" and required pace shows what each week will need.</div>' : '') +
      '<div class="cx-tiles">' +
      planTile('Funded loans', ns(funded ? funded.length : null), paceFoot(fp, 'fundings') + (per === 'year' ? ' · stretch ' + P.fundings.stretch : ''), nsCls(!!funded, 'hero'), signed ? 'plan-funded' : null) +
      planTile('Unique relationship leads', fun ? ns(fun.leads) : 'Data unavailable', 'Target ' + leadTarget + (fun ? ' · Velocify unique leads, all sources; relationship vs. advertising split needs reconciliation' : ''), nsCls(!!fun)) +
      planTile('Application starts', fun ? ns(fun.apps) : 'Data unavailable', 'Target ' + startTarget + ' · Velocify application conversions; Encompass file starts are not connected', nsCls(!!fun)) +
      planTile('CCR introductions', ns(ccr ? ccr.named.length : null), 'Target ' + refTarget + ' unique' + (refFunded ? ' · ' + refFunded + ' funded' : '') + (ccr ? ' · ' + ccr.asked.length + ' requests' : ''), nsCls(!!ccr), signed ? 'plan-ccr' : null) +
      planTile('PCR introductions', ns(pcr ? pcr.named.length : null), 'Target ' + refTarget + ' unique' + (refFunded ? ' · ' + refFunded + ' funded' : '') + (pcr ? ' · ' + pcr.asked.length + ' requests' : ''), nsCls(!!pcr), signed ? 'plan-pcr' : null) +
      '</div>' +
      '<details class="cx-supporting"><summary>Funding sources and conversion</summary>' +
      '<div class="cx-split"><div class="cx-card"><h3>Funding by source · ' + esc(periodLabel) + '</h3><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>Source</th><th class="cx-num">Target</th><th class="cx-num">Actual</th></tr></thead><tbody>' + sourceRows +
      '<tr><td><b>Committed total</b></td><td class="cx-num"><b>' + fundTarget + '</b></td><td class="cx-num"><b>' + (funded === null ? '—' : started ? funded.length : '—') + '</b></td></tr></tbody></table></div>' +
      (funded && unclassified && started ? '<div class="cx-warn" style="margin-top:8px">Needs reconciliation: ' + unclassified + ' funded loans have no source category yet.</div>' : '') +
      '<p class="cx-note" style="margin-top:8px">Returning past clients (own financing) and past-client referrals (introducing someone else) are separate sources.</p></div>' +
      '<div class="cx-card"><h3>Conversion funnel</h3><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>Stage</th><th class="cx-num">Plan</th><th class="cx-num">Actual</th><th>Source</th></tr></thead><tbody>' +
      cvRow('Referred lead to 1003', fun ? fun.leadToApp : null, '80%+', 'Velocify cohort') + cvRow('Application start to preapproval', fun ? fun.appToPre : null, '55%', 'Velocify cohort') +
      cvRow('Preapproval to contract', fun ? fun.preToContract : null, per === 'quarter' && curQ === 1 ? '60% (Q1)' : '65%', 'Velocify cohort') + cvRow('Contract to funding', fun ? fun.contractToFunded : null, '75%', 'Velocify cohort') +
      cvRow('Referral introduction to funding', ccr && (ccr.named.length + pcr.named.length) ? Math.round(100 * (ccr.namedFunded.length + pcr.namedFunded.length) / (ccr.named.length + pcr.named.length)) : null, '25% modeled', 'LP referral status') +
      '</tbody></table></div><p class="cx-note" style="margin-top:8px">Cohort rates use each lead\'s current Velocify status (actual, not projected). Daniel\'s goal of 30%+ of clients generating referrals is a separate measure from the 25% modeled yield.</p></div></div></details>' +
      '<details class="cx-supporting"><summary>Relationships, issues and data sources</summary><div class="cx-split"><div class="cx-card"><h3>Realtor relationships</h3>' + (rel ? '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>Measure</th><th class="cx-num">Now</th><th class="cx-num">Q1</th><th class="cx-num">Year-end</th><th class="cx-num">Remaining</th></tr></thead><tbody>' +
        '<tr><td>A-level incl. Channel</td><td class="cx-num">' + (rel.tiers.A + rel.tiers.Channel) + '</td><td class="cx-num">21</td><td class="cx-num">25</td><td class="cx-num">' + Math.max(0, 25 - rel.tiers.A - rel.tiers.Channel) + '</td></tr>' +
        '<tr><td>Channel within A</td><td class="cx-num">' + rel.tiers.Channel + '</td><td class="cx-num">2</td><td class="cx-num">5</td><td class="cx-num">' + Math.max(0, 5 - rel.tiers.Channel) + '</td></tr>' +
        '<tr><td>B-level</td><td class="cx-num">' + rel.tiers.B + '</td><td class="cx-num">24</td><td class="cx-num">35</td><td class="cx-num">' + Math.max(0, 35 - rel.tiers.B) + '</td></tr>' +
        '<tr><td>Active relationships (lead or close in 90 days)</td><td class="cx-num">' + rel.rolling + '</td><td class="cx-num">—</td><td class="cx-num">200</td><td class="cx-num">' + Math.max(0, 200 - rel.rolling) + '</td></tr></tbody></table></div><p class="cx-note" style="margin-top:8px">Rolling 12-month closings from shared Power BI profiles: Channel 10+, A 4–9, B 2–3. Channel counts once within A.</p>'
        : '<div class="cx-empty" style="margin-top:12px">' + (!S.ext ? 'Loading Power BI profiles…' : 'Data unavailable: Power BI profiles could not be read.') + '</div>') + '</div>' +
      '<div class="cx-card"><h3>Key operational bottlenecks</h3><div class="cx-list cx-small" style="margin-top:12px">' + (bott.length ? bott.map(function (b) { return '<div>• ' + esc(b) + '</div>'; }).join('') : '<div class="cx-muted">' + (signed ? 'None flagged from verified data.' : 'Unlock to see team bottlenecks.') + '</div>') + '</div>' +
      '<h3 style="margin-top:16px">Data freshness</h3><div class="cx-list cx-small" style="margin-top:8px">' +
      '<div>Pipeline report: ' + (signed ? freshImport('pipeline') : 'Locked') + '</div><div>Funded Units: ' + (signed ? freshImport('funded_units') : 'Locked') + '</div>' +
      '<div>Power BI profiles: ' + (S.ext && S.ext.pbi ? esc(fmtTime(S.ext.pbi.imported_at)) : 'Unavailable') + '</div><div>Velocify: ' + (S.ext && S.ext.vel ? 'latest lead ' + esc(fmtTime(S.ext.vel.created_at)) : 'Unavailable') + '</div></div></div></div></details></div>';
    bindAccess(host);
    $all('[data-per]', host).forEach(function (b) { b.addEventListener('click', function () { S.planPeriod = b.dataset.per; renderPlan(); }); });
    $all('[data-plan-rec]', host).forEach(function (b) { b.addEventListener('click', function () { openRec(b.dataset.planRec); }); });
  }
  function freshImport(kind) {
    var r = S.imports.find(function (x) { return x.kind === kind; });
    return r ? esc(fmtTime(r.imported_at)) + ' · ' + r.accepted_rows + ' loans' : '<b style="color:var(--cx-bad)">Not imported</b>';
  }

  // ================================================================ boot
  function boot() {
    try { injectShell(); } catch (e) { console.error('CORE module shell', e); }
    if (new URLSearchParams(location.search).get('view') === 'tuesday') openTuesdayWorklist();
    if (activeKey()) loadAll(); else { loadScorecards(); renderAll(); }
    setInterval(function () { if (!document.hidden && activeKey() && S.tier && !$('.cx-overlay')) loadAll(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && activeKey() && S.loadedAt && Date.now() - S.loadedAt > 20000 && !$('.cx-overlay')) loadAll(); });
    window.addEventListener('hashchange', function () { var k = readHashKey(); if (k) { setKey(k); loadAll(); } });
    window.addEventListener('storage', function (e) { if (e.key === KEY_STORE) { teamKey = e.newValue; loadAll(); } });
  }
  window.CoreApp = { open: openView, openTuesdayWorklist: openTuesdayWorklist, renderCoaching: renderCoaching, managerSignIn: managerSignIn, openImports: function () { S.cmdTab = 'data'; openView('core-command'); }, reload: loadAll, state: S, renderToday: renderToday, _rpc: function (fn, args) { return apiAct(fn, args); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
