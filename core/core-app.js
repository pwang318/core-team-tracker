/* CORE Team LP Tracker - execution module.
 * LP homepage (Tuesday Updates, 30/60/90 calls, My Scorecard), Mack's Production
 * Production Command (Mack, with early warnings) and Daniel's 2027 Plan dashboard.
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
  function borrowerOf(task) { var l = S.loans[task.loan_number]; return (l && l.borrower_name) || 'Borrower name unavailable'; }
  function owner(task) { return L.effectiveOwner(task); }
  function lpLabel(lp) { return lp || 'Unassigned'; }
  function sortWork(a, b) { return String(L.workDueDate(a) || '').localeCompare(String(L.workDueDate(b) || '')) || borrowerOf(a).localeCompare(borrowerOf(b)); }
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
  // Open LP access (2026-11-25): the plain tracker link gives every LP their full call list.
  // No team link or code is needed. Mack's / the Director's passcodes still unlock manager actions.
  // If the database has not been switched to open access yet, fall back to the public summary.
  var OPEN_KEY = 'core-open-team-access', openDenied = false;
  function activeKey() { return mgrKey || teamKey || (openDenied ? null : OPEN_KEY); }
  function forgetDevice() { setKey(null); setMgrKey(null); clearCallAccess(); S.error = null; renderAll(); loadAll(); }

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

  function clearCallAccess() {
    Object.assign(S, { tier: null, tasks: [], loans: {}, coverage: [], corrections: [], signoffs: [], imports: [],
      records: null, _rec: {}, loadedAt: null });
    if ($('.cx-overlay[data-task]')) closeDrawer();
  }

  function loadAll() {
    var key = activeKey();
    if (S.loading) return S.loading;
    if (!key) { clearCallAccess(); renderAll(); return Promise.resolve(); }
    S.loading = rpc('core_api_load', { p_key: key }).then(function (d) {
      if (key !== activeKey()) return;
      if (!d || !Object.prototype.hasOwnProperty.call(TIER_NAME, d.tier) || !Array.isArray(d.tasks) || !Array.isArray(d.loans)) {
        throw new Error('The shared server returned incomplete call data.');
      }
      // A refresh may have read a row before a save finished on this device.
      var localTasks = new Map(S.tasks.map(function (task) { return [task.id, task]; }));
      S.tier = d.tier;
      S.tasks = d.tasks.map(function (task) {
        var local = localTasks.get(task.id);
        return local && Number(local.row_version) > Number(task.row_version) ? local : task;
      });
      S.loans = {};
      d.loans.forEach(function (loan) { S.loans[loan.loan_number] = loan; });
      S.coverage = d.coverage || []; S.corrections = d.corrections || []; S.signoffs = d.signoffs || []; S.imports = d.imports || [];
      S.loadedAt = new Date(); S.error = null;
    }).catch(function (e) {
      if (key !== activeKey()) return;
      S.error = friendlyServerError(e);
      if (/CORE_FORBIDDEN:.*(?:not valid|access link required)/i.test(String(e.message))) {
        clearCallAccess();
        if (key === OPEN_KEY) { openDenied = true; S.error = null; }
        else if (mgrKey) setMgrKey(null);
        else setKey(null);
      }
    }).then(function () { return loadScorecards(); }).finally(function () {
      S.loading = null;
      if (key !== activeKey()) return loadAll();
      renderAll();
    });
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
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = './core/core-app.css?v=20261125e'; link.setAttribute('data-core-css', '1');
      document.head.appendChild(link);
    }
    var sections = $all('.ct-nav-section');
    var label = function (s) { return ((s.querySelector('.ct-nav-label') || {}).textContent || ''); };
    var team = sections.find(function (s) { return /TEAM/.test(label(s)); });
    if (team && !$('[data-route="core-command"]')) {
      var b1 = navBtn('core-command', '◆', 'Production Command'), b2 = navBtn('core-plan', '◇', 'Growth & Execution Plan');
      var pm = team.querySelector('[data-route="production-manager"]');
      team.insertBefore(b1, pm || null); team.insertBefore(b2, b1.nextSibling);
      // Production Manager now lives inside Production Command as the "LP coaching & leads" tab.
      if (pm) pm.style.display = 'none';
    }
    if (!$('#cx-merged-nav-css')) {
      var css = document.createElement('style'); css.id = 'cx-merged-nav-css';
      css.textContent = '.ct-nav-btn[data-route="production-manager"]{display:none!important}';
      document.head.appendChild(css);
    }
    var pmView = $('#view-production-manager');
    if (pmView && !$('[data-pm-merged]', pmView)) {
      var bar = document.createElement('div'); bar.className = 'cx'; bar.setAttribute('data-pm-merged', '1');
      bar.innerHTML = '<div class="cx-stack" style="margin:6px 0 10px"><h2 style="margin:0">Production Command</h2><div class="cx-tabs" role="tablist">' +
        '<button type="button" class="cx-tab" data-pm-go="overview">Early warnings</button><button type="button" class="cx-tab" data-pm-go="tuesday">Tuesday worklist</button>' +
        '<button type="button" class="cx-tab on" aria-selected="true">LP coaching &amp; leads</button></div></div>';
      pmView.insertBefore(bar, pmView.firstChild);
      $all('[data-pm-go]', bar).forEach(function (b) { b.addEventListener('click', function () { S.cmdTab = b.dataset.pmGo; openView('core-command'); }); });
      var h1 = pmView.querySelector('.ct-page-head h1'); if (h1) h1.textContent = 'LP coaching & leads';
      var eb = pmView.querySelector('.ct-page-head .ct-eyebrow'); if (eb) eb.textContent = 'PRODUCTION COMMAND';
      var sub = pmView.querySelector('.ct-page-head .ct-page-sub'); if (sub) sub.textContent = 'Coaching cards, overdue Velocify leads, new-build check-ins and scorecards for each LP.';
      var live = pmView.querySelector('.ct-page-head button[onclick*="openTuesdayWorklist"]'); if (live) live.style.display = 'none';
      // Old Tuesday-plan reports (pre-tracker snapshot records) are retired from view; the live
      // early warnings and coaching cards replace them. Lead and new-build exceptions stay.
      var legacy = $('#pm-dashboard', pmView); legacy = legacy && legacy.closest('details'); if (legacy) legacy.style.display = 'none';
      var exc = $('#pm-current-exceptions', pmView); exc = exc && exc.closest('details');
      if (exc) { exc.open = true; var es = exc.querySelector('summary b'); if (es) es.textContent = 'Overdue Velocify leads and new-build work'; }
      $all('.ct-page-head ~ div', pmView).forEach(function (d) { if (/Coaching suggestions use current tracker records/.test(d.textContent)) { var sp = d.querySelector('span'); if (sp) sp.textContent = 'Coaching uses live tracker, scorecard and Velocify data.'; } });
    }
    var lpSec = sections.find(function (s) { return /LOAN PARTNERS/.test(label(s)); });
    if (lpSec && !$('[data-dot-legend]', lpSec)) {
      var legend = document.createElement('div'); legend.setAttribute('data-dot-legend', '1');
      legend.style.cssText = 'font-size:10.5px;color:#7a8b97;padding:2px 14px 6px;display:flex;align-items:center;gap:6px';
      legend.innerHTML = '<span class="cx-due-dot" style="margin-left:0"></span><span>= scorecard not entered this week</span>';
      var lbl = lpSec.querySelector('.ct-nav-label'); if (lbl) lbl.after(legend); else lpSec.insertBefore(legend, lpSec.firstChild);
    }
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
      var supporting = document.createElement('section');
      supporting.id = 'core-supporting'; supporting.hidden = true;
      $all(':scope > section.ct-card', page).forEach(function (n) { supporting.appendChild(n); });
      page.insertBefore(supporting, tdy.nextSibling);
    }
    if (host && !host.__coreObs) {
      host.__coreObs = new MutationObserver(function () {
        if (host.classList.contains('active')) setTimeout(renderToday, 0);
        else { lpPanel = null; S.lpFilter = null; }
      });
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
  function openScorecardFromWork(lp) {
    openMyScorecard(lp);
    var view = $('#view-scorecards.active');
    var original = view && $('#lp-scorecard-back', view);
    if (!original) return;
    var back = document.createElement('button');
    back.type = 'button'; back.className = original.className;
    back.textContent = '← Back to Your Work';
    original.hidden = true;
    original.after(back);
    var observer = new MutationObserver(function () {
      if (view.classList.contains('active')) return;
      observer.disconnect(); back.remove(); original.hidden = false;
    });
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    back.addEventListener('click', function () {
      var lpButton = $('.ct-nav-btn[data-route="lp"][data-lp="' + lp + '"]');
      if (lpButton) lpButton.click();
      var grid = $('[data-lp-jump="core-scorecard-card"]');
      if (grid) grid.focus();
    });
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
  function renderPortfolioChanges(host) {
    var key = activeKey(), tier = S.tier;
    var allowed = key && ['manager','leader','admin'].includes(tier);
    var date = today(), since = L.addDays(date, -6);
    function sameAccess() { return activeKey() === key && S.tier === tier; }
    host.portfolioChangesAccess = sameAccess;
    function present(risk, overdue) {
      host.innerHTML = '<ul>' +
        '<li>' + esc(risk) + '</li><li>' + Number(host.dataset.portfolioChanges) + ' partners entered the 90-day referral warning window</li>' +
        '<li>' + esc(overdue) + '</li></ul>';
    }
    if (!allowed) {
      present('Closing-risk changes require leadership access.', 'Overdue commitments require leadership access.');
      return;
    }
    present('Loading closing-risk changes…', 'Loading newly overdue commitments…');
    Promise.allSettled([
      apiAct('core_api_forecast_reviews', { p_action: 'list', p: {} }),
      apiAct('core_api_weekly_actions', { p_action: 'list', p: {} })
    ]).then(function (results) {
      if (!host.isConnected || host.portfolioChangesAccess !== sameAccess || !sameAccess()) return;
      var risks = results[0].value, actions = results[1].value;
      var riskCount = Array.isArray(risks) ? risks.filter(function (row) {
        return row.status === 'at_risk' && L.inRange(L.isoOfInstant(row.status_since), { start: since, end: date });
      }).length : null;
      var overdueCount = Array.isArray(actions) ? actions.filter(function (row) {
        return !row.completed_at && row.due_date < date && row.due_date >= L.addDays(since, -1);
      }).length : null;
      present(riskCount === null ? 'Closing-risk changes unavailable.' : riskCount + ' active closings newly flagged at risk',
        overdueCount === null ? 'Overdue commitments unavailable.' : overdueCount + ' open commitments became overdue');
    });
  }
  function renderAll() {
    var portfolioChanges = $('[data-portfolio-changes]');
    if (portfolioChanges && portfolioChanges.portfolioChangesAccess && !portfolioChanges.portfolioChangesAccess()) renderPortfolioChanges(portfolioChanges);
    var weeklyActions = $('[data-weekly-actions]');
    if (weeklyActions && weeklyActions.weeklyActionsAccess && !weeklyActions.weeklyActionsAccess()) renderWeeklyActions(weeklyActions);
    if ($('#view-lp') && $('#view-lp').classList.contains('active')) renderToday();
    if ($('#view-core-command') && $('#view-core-command').classList.contains('active')) renderCommand();
    if ($('#view-core-plan') && $('#view-core-plan').classList.contains('active')) renderPlan();
    if ($('#view-production-manager.active')) renderCoaching();
    var d = $('.cx-overlay[data-task]'); if (d && !d.__dirty) renderDrawer(d.dataset.task);
  }

  function bindAccess(root) {
    $all('[data-cx="forget"]', root).forEach(function (b) { b.addEventListener('click', function () { if (window.confirm('Remove the team access link from this device?')) forgetDevice(); }); });
    $all('[data-open-task]', root).forEach(function (b) { b.addEventListener('click', function (e) { if (e.target.closest('input')) return; openDrawer(b.getAttribute('data-open-task')); }); });
    $all('[data-cx="refresh"]', root).forEach(function (b) { b.addEventListener('click', function () { S.scorecards = null; S.ext = null; loadAll(); }); });
    $all('[data-cx="mgr-off"]', root).forEach(function (b) { b.addEventListener('click', function () { setMgrKey(null); toast('Manager actions turned off on this device.'); loadAll(); }); });
  }
  function syncLine() {
    return '<span class="cx-pill-role">' + (S.loading ? 'Syncing…' : S.loadedAt ? 'Synced ' + esc(fmtTime(S.loadedAt)) : '') +
      (isManager() ? ' · Manager actions on · <button type="button" class="cx-link" data-cx="mgr-off">Manager sign-out</button>' : '') +
      ' · <button type="button" class="cx-link" data-cx="refresh">Refresh</button></span>';
  }
  function managerSignIn() {
    var code = window.prompt('Manager passcode'); if (!code) return;
    return rpc('core_api_session', { p_key: code.trim() }).then(function (r) {
      if (!r || (r.tier !== 'manager' && r.tier !== 'admin')) throw new Error('CORE_FORBIDDEN: That passcode does not unlock manager actions.');
      setMgrKey(code.trim()); toast('Manager actions unlocked on this device.'); S.loadedAt = null; return loadAll();
    }).catch(function (e) { toast(friendlyServerError(e), true); });
  }

  function renderWeeklyActions(host) {
    var key = activeKey();
    var tier = S.tier;
    var writable = tier === 'manager' || tier === 'admin';
    function sameAccess() { return activeKey() === key && S.tier === tier; }
    function current() { return host.isConnected && host.weeklyActionsAccess === sameAccess && sameAccess(); }
    host.weeklyActionsAccess = sameAccess;
    if (!key || !['manager', 'leader', 'admin'].includes(tier)) {
      host.innerHTML = '<h3>Shared weekly actions</h3><p class="cx-note">Use manager access to record and review shared commitments.</p><button type="button" class="cx-btn">Manager sign-in</button>';
      $('button', host).onclick = function () {
        var signIn = managerSignIn();
        if (signIn) signIn.then(function () { if (current()) renderWeeklyActions(host); });
      };
      return;
    }
    function editAction(row) {
      return '<details><summary>Edit owner or due date</summary><form data-edit-action="' + esc(row.id) + '" data-version="' + row.edit_history.length + '" class="cx-row">' +
        '<label>Owner <input name="owner_name" required maxlength="80" value="' + esc(row.owner_name) + '"></label>' +
        '<label>Due date <input name="due_date" type="date" required value="' + esc(row.due_date) + '"></label>' +
        '<button class="cx-btn">Save changes</button></form></details>';
    }
    function editHistory(row) {
      return row.edit_history.length ? '<details><summary>Change history</summary><ul>' +
        row.edit_history.slice().reverse().map(function (entry) {
          return '<li>' + esc(fmtTime(entry.at) + ' · ' + entry.actor + ' · ' +
            entry.previous_owner + ' (' + fmtDate(entry.previous_due_date) + ') → ' +
            entry.owner + ' (' + fmtDate(entry.due_date) + ')') + '</li>';
        }).join('') + '</ul></details>' : '';
    }
    function actionRow(row) {
      row.edit_history = row.edit_history || [];
      return '<article class="cx-card"><h3>' + esc(row.next_action) + '</h3><p class="cx-note">' +
        esc(row.area + ' · ' + row.owner_name + ' · Due ' + fmtDate(row.due_date)) +
        (!row.completed_at && row.due_date < today() ? ' · Overdue' : '') +
        '</p><p><b>Success measure</b> ' + esc(row.success_measure) + '</p>' +
        (row.completed_at ? '<p><b>Result</b> ' + esc(row.result) + '</p>' :
          writable ? '<form data-complete-action="' + esc(row.id) + '" class="cx-row"><label>Result <input required name="result" maxlength="500"></label><button class="cx-btn">Mark complete</button></form>' + editAction(row) : '') + editHistory(row) + '</article>';
    }
    function bindSave(form, mode, extra) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = $('button', form);
        if (button.disabled) return;
        var fields = Object.assign(Object.fromEntries(new FormData(form)), extra);
        if (Object.values(fields).some(function (value) { return !String(value).trim(); })) {
          toast('Complete each field before saving.', true); return;
        }
        if (!current()) { renderWeeklyActions(host); return; }
        button.disabled = true;
        apiAct('core_api_weekly_actions', { p_action: mode, p: fields }).then(function (result) {
          if (!result || result.id !== fields.id) throw new Error('The server did not confirm the action.');
          if (current()) {
            renderWeeklyActions(host);
            var changes = $('[data-portfolio-changes]');
            if (changes) renderPortfolioChanges(changes);
          }
        }).catch(function (error) {
          if (current()) { button.disabled = false; toast(friendlyServerError(error), true); }
        });
      });
    }
    host.innerHTML = '<h3>Shared weekly actions</h3><p class="cx-note" role="status">Loading commitments…</p>';
    apiAct('core_api_weekly_actions', { p_action: 'list', p: {} }).then(function (rows) {
      if (!current()) return;
      var open = rows.filter(function (row) { return !row.completed_at; });
      var completed = rows.filter(function (row) { return row.completed_at; });
      host.innerHTML = '<h3>Shared weekly actions</h3><p class="cx-note">Review open commitments first. Add one priority per area and record the result when it’s done.</p>' +
        (open.length ? open.map(actionRow).join('') : '<p>No open commitments.</p>') +
        (writable ? '<details><summary>Add a commitment</summary><form data-add-action class="cx-stack">' +
          '<label class="cx-f">Area <select name="area"><option>Production</option><option>Relationships</option><option>Leadership</option></select></label>' +
          '<label class="cx-f">Owner <input name="owner_name" required maxlength="80"></label>' +
          '<label class="cx-f">Next action <input name="next_action" required maxlength="500"></label>' +
          '<label class="cx-f">Due date <input type="date" name="due_date" required></label>' +
          '<label class="cx-f">Success measure <input name="success_measure" required maxlength="500"></label>' +
          '<button class="cx-btn primary">Save commitment</button></form></details>' : '') +
        (completed.length ? '<details><summary>Recently completed (' + completed.length + ')</summary>' + completed.map(actionRow).join('') + '</details>' : '');
      var add = $('[data-add-action]', host);
      if (add) bindSave(add, 'create', { id: crypto.randomUUID() });
      $all('[data-edit-action]', host).forEach(function (form) {
        bindSave(form, 'edit', { id: form.dataset.editAction, version: form.dataset.version });
      });
      $all('[data-complete-action]', host).forEach(function (form) { bindSave(form, 'complete', { id: form.dataset.completeAction }); });
    }).catch(function (error) {
      if (!current()) return;
      host.innerHTML = '<h3>Shared weekly actions</h3><p class="cx-note">' + esc(friendlyServerError(error)) + '</p><button type="button" class="cx-btn">Retry</button>';
      $('button', host).onclick = function () { renderWeeklyActions(host); };
    });
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
    var saved = t.status === 'open' && (t.borrower_notes || t.service_update || t.agent_outcome || t.referral_response)
      ? '<span class="cx-chip chip-attempt">Progress saved</span>' : '';
    var issue = L.isIssue(t) && t.status !== 'exception' ? '<span class="cx-chip chip-overdue">Client concern</span>' : '';
    var due = L.workDueDate(t);
    var meta = [typeLabel(t.task_type), (due !== t.due_date ? 'Follow up ' : 'Due ') + fmtDate(due)];
    if (['tuesday', 'contract', 'preclose'].includes(t.task_type)) {
      if (loan.loan_type) meta.push(loan.loan_type);
    }
    if (t.task_type === 'tuesday' && loan.est_closing_date) meta.push('Closing ' + fmtDate(loan.est_closing_date));
    if (/^pc/.test(t.task_type) && loan.closed_date) meta.push('Closed ' + fmtDate(loan.closed_date));
    if (t.coverage_lp) meta.push('Covering for ' + lpLabel(t.owner_lp));
    return '<button type="button" class="cx-item" data-open-task="' + esc(t.id) + '"><span class="i-name">' + esc(borrowerOf(t)) + '</span>' +
      '<span class="i-meta">' + esc(meta.join(' · ')) + '</span><span class="i-right"><span class="cx-chip ' + cls + '">' + esc(text) + '</span>' + saved + issue + '</span></button>';
  }
  function listHtml(tasks, emptyText) {
    if (!tasks.length) return '<div class="cx-empty">' + esc(emptyText || 'Nothing here.') + '</div>';
    return '<div class="cx-list">' + tasks.slice().sort(sortWork).map(itemHtml).join('') + '</div>';
  }
  function lpBuckets(lp) {
    var t0 = today(), tue = L.tuesdayOf(t0), mine = L.currentTuesdayWork(S.tasks, t0).filter(function (t) { return owner(t) === lp; });
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
      'tue-remaining': tueAssigned.filter(function (t) { return isOpen(t) && !L.tuesdayFollowupScheduled(t, t0); }),
      'tue-scheduled': tueAssigned.filter(function (t) { return L.tuesdayFollowupScheduled(t, t0); }),
      'tue-overdue': tueAssigned.filter(function (t) { return isOpen(t) && L.workDueDate(t) < t0; }),
      'tue-ccr': tueAssigned.filter(function (t) { return t.borrower_outcome === 'conversation' && t.referral_requested; }),
      'tue-intros': tueAssigned.filter(function (t) { return t.referral_response === 'named_introduction'; }),
      pc30: pcDue('pc30'), pc60: pcDue('pc60'), pc90: pcDue('pc90'), soon30: pcSoon('pc30'), soon60: pcSoon('pc60'), soon90: pcSoon('pc90'),
      'pc-overdue': mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && L.workDueDate(t) < t0; }),
      issues: mine.filter(L.isIssue),
      journey: mine.filter(function (t) { return (t.task_type === 'contract' || t.task_type === 'preclose') && isOpen(t) && t.due_date <= L.addDays(t0, 7); }),
      day: L.daySummary(mine, t0)
    };
  }
  // LP coaching (Production Command → LP coaching & leads). Live tracker data only:
  // Tuesday calls, CCR asks, overdue and post-closing calls, copied notes, scorecards,
  // stale Velocify leads and quiet borrowers. Each LP gets one focus, a conversation
  // starter, and a copy-ready coaching note.
  function coachingFor(lp, w, stats) {
    var t0 = today(), wk = L.weekMonday(t0), b = lpBuckets(lp), dow = new Date(t0 + 'T12:00:00').getDay();
    var st = stats.find(function (r) { return r.lp === lp; }) || {};
    var closeBy = L.addDays(t0, 7);
    var closing = b['tue-remaining'].filter(function (t) { var l = S.loans[t.loan_number]; return l && l.est_closing_date && l.est_closing_date <= closeBy; });
    var overdue = b['tue-overdue'].concat(b['pc-overdue'].filter(function (t) { return b['tue-overdue'].indexOf(t) < 0; }));
    var conv = st.tue ? st.tue.conversations.length : 0, asked = st.tue ? st.tue.asked.length : 0, askPct = conv ? Math.round(100 * asked / conv) : null;
    var dupes = st.dupes || [], stale = w.leads.filter(function (x) { return x.lp === lp && !x.task; }), quiet = w.quiet.filter(function (x) { return x.lp === lp; });
    var row = scorecardFor(lp, wk), sc = row ? L.scorecardSummary(lp, row.data, liveMetrics(lp)) : null;
    var expected = Math.min(100, Math.max(0, (dow === 0 ? 5 : dow === 6 ? 5 : dow) * 20));
    var items = [];
    var push = function (level, n, focus, prompt, tasks) { if (n) items.push({ level: level, n: n, focus: focus, prompt: prompt, tasks: tasks || [] }); };
    push(3, b.issues.length, b.issues.length + ' open client concern' + (b.issues.length === 1 ? '' : 's'), 'Walk me through the concern. What is the fix, and when will the client hear back?', b.issues);
    push(3, closing.length, closing.length + ' borrower' + (closing.length === 1 ? '' : 's') + ' closing within 7 days still to call', 'Which of these closings is most at risk? Let\'s call that one first, today.', closing);
    push(3, overdue.length, overdue.length + ' overdue call' + (overdue.length === 1 ? '' : 's'), 'What is blocking these? Do you need coverage for part of the list?', overdue);
    push(2, dupes.length, dupes.length + ' set' + (dupes.length === 1 ? '' : 's') + ' of identical notes on different borrowers', 'Let\'s look at these notes together. Each one should describe that borrower\'s actual call.', [].concat.apply([], dupes));
    if (askPct !== null && conv >= 3 && askPct < 80) push(2, 1, 'Referral question asked on ' + askPct + '% of live calls', 'Let\'s role-play the 7-day CCR question so it feels natural at the end of every call.');
    push(2, stale.length, stale.length + ' Velocify lead' + (stale.length === 1 ? '' : 's') + ' with no activity for 5+ days', 'Which of these leads can you reach today? The referral partner is waiting to hear.');
    push(1, quiet.length, quiet.length + ' borrower' + (quiet.length === 1 ? '' : 's') + ' gone quiet', 'Try a different time of day and text first to set up the call.', quiet.map(function (q) { return q.task; }).filter(Boolean));
    if (S.scorecards && S.scorecards.ok && !row && dow !== 1) push(1, 1, 'Scorecard not entered this week', 'Take two minutes now to enter this week\'s scorecard.');
    else if (sc && sc.pct !== null && dow >= 3 && dow <= 5 && sc.pct < expected * 0.6) push(1, 1, 'Scorecard at ' + sc.pct + '% of the weekly goal', 'Which goal is furthest behind? Pick one action today that moves it.');
    items.sort(function (a, b2) { return b2.level - a.level || b2.n - a.n; });
    var level = items.length ? items[0].level : 0;
    var lp1 = lp === 'Isaak';
    var metrics = [
      ['Tuesday this week', hasImport('pipeline') ? b['tue-completed'].length + ' / ' + b['tue-assigned'].length + (b['tue-assigned'].length ? ' · ' + pctOf(b['tue-completed'].length, b['tue-assigned'].length) + '%' : '') : '—'],
      ['Referral question asked', askPct === null ? 'No live calls yet' : askPct + '% of live calls'],
      ['Overdue calls', String(overdue.length)],
      ['Scorecard', !S.scorecards || !S.scorecards.ok ? 'Unavailable' : !row ? 'Not entered' : sc.total + ' / ' + sc.goal + ' · ' + sc.pct + '%'],
      ['Stale leads', S.staleLeads && S.staleLeads.ok ? String(stale.length) : '—']
    ].filter(function (m) { return !lp1 || (m[0] !== 'Tuesday this week' && m[0] !== 'Referral question asked'); });
    var note = items.length ? 'Hi ' + lp + ', quick coaching check-in: ' + items.slice(0, 3).map(function (i) { return i.focus.charAt(0).toLowerCase() + i.focus.slice(1); }).join('; ') + '. ' + items[0].prompt + ' Let me know how I can help.' :
      'Hi ' + lp + ', nice work this week. Your calls and notes are current. Keep it up!';
    return { lp: lp, level: level, items: items, metrics: metrics, note: note, role: lp === 'Isaak' ? 'LP1 · front-end conversion' : 'LP2 · client + transaction execution' };
  }
  function renderCoaching() {
    var host = $('#core-coaching');
    if (!host) return;
    if (!activeKey() || !S.tier || !S.loadedAt || S.error) {
      host.innerHTML = '<div class="cx-empty" role="status">' + (S.error ? 'Live coaching is unavailable. Refresh to retry.' :
        S.loading || activeKey() ? 'Loading live coaching…' : 'Live coaching is unavailable in this view.') + '</div>';
      return;
    }
    if (!S.staleLeads && !S._staleLoading) loadStaleLeads();
    if (!S.scorecards) loadScorecards().then(renderCoaching);
    var w = earlyWarnings(), stats = teamStats(periodRange('week'));
    var cards = LPS.map(function (lp) { return coachingFor(lp, w, stats); })
      .sort(function (a, b) { return b.level - a.level || b.items.length - a.items.length; });
    var colors = ['#2E8B57', '#1E83A8', '#C98A14', '#B84A42'], labels = ['On track', 'Watch', 'Coach this week', 'Coach today'];
    S._coachNotes = {}; S._rec = S._rec || {};
    var need = cards.filter(function (c) { return c.level >= 2; });
    host.innerHTML = '<div class="cx-card"><div class="cx-head"><div><div class="cx-kicker">Live data · ' + esc(fmtDate(today())) + '</div><h2 style="margin:2px 0">LP coaching</h2>' +
      '<div class="cx-sub">' + (need.length ? 'Coach first: <b>' + esc(need.map(function (c) { return c.lp; }).join(', ')) + '</b>.' : 'No one needs urgent coaching right now.') +
      ' Each card shows one focus, a question to open the conversation, and a note you can send.</div></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px;margin-top:14px">' + cards.map(function (c) {
        S._coachNotes[c.lp] = c.note;
        var top = c.items[0];
        if (top && top.tasks.length) S._rec['coach-' + c.lp] = { title: c.lp + ' · ' + top.focus, tasks: top.tasks };
        return '<section class="cx-card" style="border-top:4px solid ' + colors[c.level] + ';padding:14px">' +
          '<div class="cx-head"><div><h3 style="margin:0">' + esc(c.lp) + '</h3><div class="cx-sub">' + esc(c.role) + '</div></div>' +
          '<span class="cx-chip" style="background:' + colors[c.level] + ';color:#fff">' + labels[c.level] + '</span></div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:10px 0">' + c.metrics.map(function (m) {
            return '<div style="background:var(--cx-soft,#F3F6F9);border-radius:8px;padding:7px 9px"><div class="cx-small cx-muted">' + esc(m[0]) + '</div><b>' + esc(m[1]) + '</b></div>';
          }).join('') + '</div>' +
          (top ? '<div style="border-left:3px solid ' + colors[c.level] + ';padding:6px 10px;margin:6px 0"><b>Focus:</b> ' + esc(top.focus) + '</div>' +
            '<div style="border-left:3px solid #9fb3c2;padding:6px 10px;margin:6px 0"><b>Ask:</b> “' + esc(top.prompt) + '”</div>' +
            (c.items.length > 1 ? '<details style="margin:4px 0"><summary class="cx-note" style="cursor:pointer">' + (c.items.length - 1) + ' more to watch</summary><ul style="margin:6px 0 0 18px">' + c.items.slice(1).map(function (i) { return '<li>' + esc(i.focus) + '</li>'; }).join('') + '</ul></details>' : '')
            : '<div style="padding:6px 0">Nothing flagged. Recognize the good work.</div>') +
          '<div class="cx-row" style="gap:6px;margin-top:10px;flex-wrap:wrap">' +
          (top && top.tasks.length ? '<button type="button" class="cx-btn sm" data-rec="coach-' + esc(c.lp) + '">Open ' + top.tasks.length + ' call' + (top.tasks.length === 1 ? '' : 's') + '</button>' : '') +
          '<button type="button" class="cx-btn sm accent" data-coach-copy="' + esc(c.lp) + '">Copy coaching note</button>' +
          '<button type="button" class="cx-btn sm" data-coach-lp="' + esc(c.lp) + '">Open ' + esc(c.lp) + '’s dashboard</button>' +
          '<button type="button" class="cx-btn sm" data-coach-sc="' + esc(c.lp) + '">Scorecard</button></div></section>';
      }).join('') + '</div></div>';
    $all('[data-coach-lp]', host).forEach(function (button) {
      button.addEventListener('click', function () { var link = $('.ct-nav-btn[data-lp="' + button.dataset.coachLp + '"]'); if (link) link.click(); });
    });
    $all('[data-coach-sc]', host).forEach(function (button) { button.addEventListener('click', function () { openMyScorecard(button.dataset.coachSc); }); });
    $all('[data-rec]', host).forEach(function (button) { button.addEventListener('click', function () { openRec(button.getAttribute('data-rec')); }); });
    $all('[data-coach-copy]', host).forEach(function (button) {
      button.addEventListener('click', function () {
        var text = S._coachNotes[button.dataset.coachCopy] || '';
        var done = function () { toast('Coaching note copied. Paste it to ' + button.dataset.coachCopy + ' in Teams.'); button.textContent = 'Copied ✓'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this note:', text); });
        else window.prompt('Copy this note:', text);
      });
    });
  }

  var TILE_TITLES = { 'tue-assigned': 'Tuesday Updates assigned', 'tue-completed': 'Tuesday Updates completed', 'tue-remaining': 'Tuesday Updates remaining', 'tue-overdue': 'Overdue Tuesday Updates', 'tue-scheduled': 'Scheduled Tuesday follow-ups',
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
    var selected = publicLpTile && publicLpTile.lp === lp ? publicLpTile.key : Number(counts.tuesday_open) > 0 ? 'tuesday' : null;
    var active = tiles.find(function (item) { return item[0] === selected; });
    var schedule = (counts.schedule || []).filter(function (row) { return row.task_type === selected; });
    return '<div class="cx-card"><h3>Workload summary</h3><div class="cx-tiles" style="margin-top:14px">' +
      tiles.map(function (item) {
        return '<button type="button" class="cx-tile" data-public-tile="' + item[0] + '" aria-expanded="' + (selected === item[0]) + '" aria-controls="core-public-detail"><span class="t-label">' + item[1] + '</span><span class="t-val">' + (item[2] == null ? 'Unavailable' : esc(item[2])) + '</span><span class="t-foot">View schedule</span></button>';
      }).join('') + '</div><div id="core-public-detail"' + (active ? '' : ' hidden') + '>' +
      (active ? '<h3 style="margin-top:14px">' + active[1] + '</h3>' +
        (selected === 'tuesday' ? '<blockquote class="cx-script" style="margin:8px 0">CCR script · ' + esc(L.REFERRAL_7_DAYS) + '</blockquote>' : '<p class="cx-sub">Due and upcoming in the next 7 days</p>') +
        (schedule.length ? '<p class="cx-sub">This public schedule shows call counts by date. Individual calls and outcome logging require team access.</p><ul>' + schedule.map(function (row) {
          var total = Number(row.total);
          var status = row.status === 'attempted' ? ' attempted' : ' outstanding';
          return '<li><strong>' + esc(fmtDate(row.due_date)) + '</strong> · ' + esc(row.total) +
            (total === 1 ? ' call' : ' calls') + status + '</li>';
        }).join('') + '</ul>' : '<div class="cx-empty">No schedule entries for this period.</div>') : '') + '</div></div>';
  }

  var renderedLp = null, lpPanel = null;
  function lpShortcut(id, label, status) {
    return '<button type="button" class="cx-tile" data-lp-jump="' + id + '"><span class="t-label">' +
      esc(label) + '</span><strong>' + esc(status) + '</strong></button>';
  }
  function builderStatus(lp) {
    var work = $('#core-lp-builder');
    return work && work.dataset.lp === lp ? work.dataset.status : 'Loading…';
  }
  function builderIdle(status) { return /^(no plan|none|nothing|0 )/i.test(String(status || '').trim()); }
  function refreshBuilderTile() {
    var tile = $('[data-lp-jump="core-lp-builder"] strong');
    if (tile) { var st = builderStatus(currentLpPage()); tile.textContent = st; tile.closest('[data-lp-jump]').style.display = builderIdle(st) ? 'none' : ''; }
  }
  function renderToday() {
    var host = $('#core-today'); if (!host) return;
    var lp = currentLpPage();
    if (lp !== renderedLp) { lpPanel = null; S.lpFilter = null; }
    renderedLp = lp;
    if (!lp) { host.innerHTML = ''; return; }
    lastLp = lp;
    var privateView = !!(activeKey() && S.tier);
    var supporting = $('#core-supporting');
    var panel = privateView ? lpPanel : null;
    if (!privateView) { lpPanel = null; S.lpFilter = null; }
    if (supporting) {
      supporting.hidden = panel !== 'core-lp-builder' && panel !== 'core-supporting';
      supporting.classList.toggle('is-builder', panel === 'core-lp-builder');
    }
    if (!privateView && activeKey()) {
      host.innerHTML = '<div class="cx-stack"><h2>' + esc(lp) + ' · LP Dashboard</h2><div class="cx-card" role="status">' +
        (S.loading ? 'Loading your call worklist…' : 'Could not load your call worklist. <button type="button" class="cx-btn" data-cx="refresh">Retry</button>') + '</div></div>';
      bindAccess(host);
      return;
    }
    if (!privateView) {
      host.innerHTML = '<div class="cx-stack"><div class="cx-head"><h2>' + esc(lp) + ' · LP Dashboard</h2></div>' + publicLpCard(lp) + '</div>';
      $all('[data-public-tile]', host).forEach(function (button) {
        button.addEventListener('click', function () {
          var key = button.dataset.publicTile;
          publicLpTile = { lp: lp, key: button.getAttribute('aria-expanded') === 'true' ? null : key };
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
    var tue = panel === 'core-lp-tuesday' ? '<div class="cx-card" id="core-lp-tuesday" tabindex="-1"><div class="cx-head"><div><div class="cx-kicker">Primary workflow</div><h3>Tuesday Updates</h3><div class="cx-sub">Borrower first, then the buyer agent. Service first, referral second.</div></div></div>' +
      (tr ? (f && f.indexOf('tue-') === 0 ? worklistHtml(f, B) : '<h4>Still to call · ' + B['tue-remaining'].length + '</h4>' + listHtml(B['tue-remaining'], 'No calls remaining in this list.')) : '<div class="cx-empty">Pipeline data unavailable.</div>') +
      '<details' + (f ? ' open' : '') + '><summary>Tuesday counts and filters</summary>' +
      '<div class="cx-tiles" style="margin-top:14px">' +
      tileHtml('tue-assigned', 'Total assigned', tr ? String(B['tue-assigned'].length) : 'No data', tr ? 'This week plus carried forward' : (S.error ? 'Live pipeline data unavailable' : 'Pipeline report not imported yet'), tr ? '' : 'is-na', f === 'tue-assigned') +
      tileHtml('tue-completed', 'Completed', tr ? String(B['tue-completed'].length) : 'No data', 'Conversation and CCR documented', tr ? '' : 'is-na', f === 'tue-completed') +
      tileHtml('tue-remaining', 'Still to call', tr ? String(B['tue-remaining'].length) : 'No data', tr && att ? att + ' attempted, not yet reached' : '', stateCls(B['tue-remaining'].length, tr), f === 'tue-remaining') +
      tileHtml('tue-scheduled', 'Follow-up scheduled', tr ? String(B['tue-scheduled'].length) : 'No data', '', tr ? '' : 'is-na', f === 'tue-scheduled') +
      tileHtml('tue-overdue', 'Overdue', countOrComplete(B['tue-overdue'].length, tr), tr && B['tue-overdue'].length ? 'Carried forward until completed' : '', stateCls(B['tue-overdue'].length, tr, true), f === 'tue-overdue') +
      tileHtml('tue-ccr', 'CCR requests completed', tr ? String(B['tue-ccr'].length) : 'No data', tr ? 'of ' + B['tue-assigned'].length + ' assigned' : '', tr ? '' : 'is-na', f === 'tue-ccr') +
      tileHtml('tue-intros', 'CCR introductions', tr ? String(B['tue-intros'].length) : 'No data', 'Named introductions received', tr ? '' : 'is-na', f === 'tue-intros') +
      '</div></details>' +
      '<div class="cx-row" style="margin-top:14px">' +
      (tr && B['tue-scheduled'].length ? '<span class="cx-note">' + B['tue-scheduled'].length + ' scheduled for a later date.</span>' : '') + '</div></div>' : '';
    var pc = panel === 'core-lp-postclosing' ? '<div class="cx-card" id="core-lp-postclosing" tabindex="-1"><div class="cx-head"><div><div class="cx-kicker">Primary workflow</div><h3>Post-Closing Calls</h3><div class="cx-sub">30, 60 and 90 days after closing. Service questions before the past-client referral ask.</div></div></div>' +
      '<div class="cx-tiles" style="margin-top:14px">' +
      ['pc30', 'pc60', 'pc90'].map(function (k) {
        var n = B[k].length, soon = B['soon' + k.slice(2)].length;
        return tileHtml(k, k.slice(2) + '-day calls', countOrComplete(n, pr), pr ? (n ? 'Due now' : 'None due') + (soon ? ' · ' + soon + ' in next 7 days' : '') : (S.error ? 'Live funded data unavailable' : 'Funded Units not imported yet'), stateCls(n, pr), f === k);
      }).join('') +
      tileHtml('pc-overdue', 'Overdue calls', countOrComplete(B['pc-overdue'].length, pr), pr && B['pc-overdue'].length ? 'Carried forward until completed' : '', stateCls(B['pc-overdue'].length, pr, true), f === 'pc-overdue') +
      '</div>' + (pr && f && f.indexOf('pc') === 0 ? worklistHtml(f, B) : (function () { var due = B.pc30.concat(B.pc60, B.pc90); return pr && due.length ? '<div style="margin-top:14px">' + listHtml(due) + '</div>' : ''; })()) + '</div>' : '';
    var issues = panel === 'core-supporting' && B.issues.length ? '<div class="cx-card" id="core-lp-concerns" tabindex="-1"><div class="cx-head"><h3>Client concerns</h3><span class="cx-chip chip-overdue">' + B.issues.length + '</span></div><div style="margin-top:12px">' + listHtml(B.issues) + '</div></div>' : '';
    var journey = panel === 'core-lp-journey' ? '<div class="cx-card" id="core-lp-journey" tabindex="-1"><div class="cx-head"><div><div class="cx-kicker">Client journey</div><h3>New contract and pre-closing calls</h3></div></div><div style="margin-top:12px">' + listHtml(B.journey, tr ? 'No calls due.' : 'Pipeline data unavailable.') + '</div></div>' : '';
    var due = B.pc30.length + B.pc60.length + B.pc90.length;
    var corrections = panel === 'core-supporting' ? correctionsCard(lp) : '';
    var otherOpen = B.issues.length || S.corrections.some(function (c) { return c.lp === lp && (c.status === 'open' || c.status === 'reopened'); });
    // One list of every call due today, most urgent first, then shortcuts only for areas with work.
    var seenCall = {}, todayCalls = [].concat(B.issues, B['tue-remaining'], B.pc30, B.pc60, B.pc90, B.journey.filter(function (t) { return t.due_date <= t0; }))
      .filter(function (t) { if (seenCall[t.id]) return false; seenCall[t.id] = 1; return true; });
    var urgency = function (t) {
      var l = S.loans[t.loan_number] || {}, close = ['tuesday', 'contract', 'preclose'].indexOf(t.task_type) >= 0 ? l.est_closing_date : null;
      return (L.isIssue(t) ? '0' : close && close <= L.addDays(t0, 7) ? '1' + close : L.workDueDate(t) < t0 ? '2' + L.workDueDate(t) : '3' + L.workDueDate(t)) + borrowerOf(t);
    };
    todayCalls.sort(function (a, b) { return urgency(a).localeCompare(urgency(b)); });
    var callList = '<section class="cx-card"><div class="cx-head"><div><h3 style="margin:0">Today\'s calls · ' + todayCalls.length + '</h3><div class="cx-sub">Most urgent first: client concerns, then closings in the next 7 days, then overdue calls.</div></div></div>' +
      (todayCalls.length ? '<div class="cx-list" style="margin-top:10px">' + todayCalls.map(itemHtml).join('') + '</div>' : '<div class="cx-empty" style="margin-top:10px">' + (loaded ? 'You\'re all caught up. No calls due today.' : 'Loading your calls…') + '</div>') + '</section>';
    var bStatus = builderStatus(lp);
    var tiles = [
      (B['tue-remaining'].length || B['tue-scheduled'].length) && lpShortcut('core-lp-tuesday', 'Tuesday updates', tr ? B['tue-remaining'].length + ' to call · ' + B['tue-scheduled'].length + ' scheduled' : 'Unavailable'),
      lpShortcut('core-lp-builder', 'Builder follow-ups', bStatus).replace('<button ', builderIdle(bStatus) ? '<button style="display:none" ' : '<button '),
      (due || B['pc-overdue'].length) && lpShortcut('core-lp-postclosing', '30/60/90-day calls', pr ? due + ' due' : 'Unavailable'),
      B.journey.length && lpShortcut('core-lp-journey', 'Contract & pre-closing', tr ? B.journey.length + ' due' : 'Unavailable'),
      otherOpen && lpShortcut('core-supporting', 'Concerns & actions', 'Review'),
      lpShortcut('core-scorecard-card', 'My scorecard', 'Open scorecard')
    ].filter(Boolean).join('');
    var shortcuts = callList + '<h4 style="margin:6px 0 0">Your lists</h4><nav aria-label="Your work" class="cx-tiles cx-lp-shortcuts">' + tiles + '</nav>' +
      (otherOpen ? '' : '<p class="cx-note" style="margin:0">Face Time and RM handoffs: <button type="button" class="cx-link" data-lp-jump="core-supporting">open</button></p>');
    var panels = { 'core-lp-tuesday': tue, 'core-lp-postclosing': pc, 'core-lp-journey': journey, 'core-supporting': issues + corrections };
    var d = B.day;
    host.innerHTML = '<div class="cx-stack">' +
      '<div class="cx-head"><div><div class="cx-kicker">' + esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: L.TZ })) + '</div><h2>' + esc(lp) + ' · Your Work</h2>' +
      '<div class="cx-sub">' + (!loaded ? 'Waiting for shared data…' : d.required.length ? d.completed.filter(function (t) { return t.due_date <= t0; }).length + ' of ' + d.required.length + ' required calls done today (' + d.pct + '%)' + (d.remaining.length ? ' · ' + d.remaining.length + ' to go' : ' · all done') : 'No required calls due today') + '</div></div>' + syncLine() + '</div>' +
      (S.error ? '<div class="cx-err">' + esc(S.error) + '</div>' : '') + (panel ? '<button type="button" class="cx-btn" data-lp-back>← Back to Your Work</button>' + (panels[panel] || '') : shortcuts) + '</div>';
    bindAccess(host);
    var back = $('[data-lp-back]', host);
    if (back) back.addEventListener('click', function () {
      lpPanel = null; S.lpFilter = null;
      renderToday();
      var tile = $('[data-lp-jump="' + panel + '"]', host);
      if (tile) tile.focus({ preventScroll: true });
      if (host.scrollIntoView) host.scrollIntoView({ block: 'start' });
    });
    $all('[data-lp-jump]', host).forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.lpJump;
        if (id === 'core-scorecard-card') { openScorecardFromWork(lp); return; }
        lpPanel = id;
        S.lpFilter = id === 'core-lp-tuesday' ? { lp: lp, key: 'tue-remaining' } : null;
        renderToday();
        $('[data-lp-back]', host).focus({ preventScroll: true });
        if (host.scrollIntoView) host.scrollIntoView({ block: 'start' });
      });
    });
    $all('[data-resolve-corr]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var note = window.prompt('How was this corrected? (required)'); if (!note || note.trim().length < 10) { if (note !== null) toast('Describe the correction in at least 10 characters.', true); return; }
        apiAct('core_api_correction', { p_action: 'resolve', p: { id: b.getAttribute('data-resolve-corr'), resolution_note: note.trim() } })
          .then(function () { toast('Marked resolved. Mack will verify it.'); return loadAll(); }).catch(function (e) { toast(friendlyServerError(e), true); });
      });
    });
    $all('[data-tile]', host).forEach(function (b) {
      var k = b.getAttribute('data-tile');
      b.disabled = k.indexOf('tue-') === 0 ? !tr : !pr;
      b.addEventListener('click', function () {
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
    return '<div class="cx-card" id="core-lp-corrections" tabindex="-1"><div class="cx-head"><h3>Corrective actions from Mack</h3><span class="cx-chip chip-attempt">' + open.length + '</span></div><div class="cx-list" style="margin-top:12px">' + open.map(function (c) {
      return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(c.issue) + '</span><span class="i-meta">Due ' + esc(fmtDate(c.due_date)) + (c.expected_behavior ? ' · Expected: ' + esc(c.expected_behavior) : '') + '</span><span class="i-right">' +
        (c.task_id ? '<button type="button" class="cx-btn sm" data-open-task="' + esc(c.task_id) + '">Record</button>' : '') + (canWrite() ? '<button type="button" class="cx-btn sm" data-resolve-corr="' + esc(c.id) + '">Mark resolved</button>' : '') + '</span></div>';
    }).join('') + '</div></div>';
  }
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
  var NEXT_ACTION_BY_CALL = {
    tuesday: 'Make the next Tuesday update',
    contract: 'Make the first Tuesday update',
    preclose: 'Confirm closing with the borrower',
    pc30: 'Make the 60-day follow-up call',
    pc60: 'Make the 90-day follow-up call',
    pc90: 'Schedule a future client check-in'
  };
  function borrowerOutcomeOptions(task) {
    if (task.task_type !== 'tuesday') return opts(L.BORROWER_OUTCOMES, task.borrower_outcome, 'Select outcome');
    var confirmed = L.tuesdayUpdateTextConfirmed(task);
    var selected = task.borrower_outcome === 'conversation' ? 'conversation' : null;
    return (confirmed ? '<option value="text_sent" selected hidden>Update text sent (saved)</option>' : '') + opts([
      ['conversation', 'Talked with borrower'],
      ['vm_update', 'Left vmail / sent text update']
    ], confirmed ? null : selected, confirmed ? undefined : 'Select outcome');
  }
  function renderDrawer(id) {
    var ov = $('.cx-overlay[data-task="' + id + '"]'); if (!ov) return;
    var t = S.tasks.find(function (x) { return x.id === id; });
    var box = ov.querySelector('.cx-drawer');
    if (!t) { box.innerHTML = '<div class="cx-err">This record is no longer available.</div><button class="cx-btn" type="button" data-cx="close">Close</button>'; box.querySelector('[data-cx="close"]').onclick = closeDrawer; return; }
    var loan = S.loans[t.loan_number] || {}, editable = canEdit(t), ck = t.script_checks || {}, type = t.task_type;
    var isTue = type === 'tuesday', isPc = /^pc/.test(type), simple = true, dis = editable ? '' : ' disabled';
    var isJourney = type === 'contract' || type === 'preclose';
    var outcomeButtons = isTue ? [['conversation', 'Talked with borrower'], ['vm_update', 'Left vmail / sent text update']] : [['conversation', isPc ? 'Talked with client' : 'Talked with borrower'], ['voicemail', 'Left vmail / sent text']];
    var refItem = (L.CHECKS[type] || []).find(function (c) { return /referral_ask|request_no_secret/.test(c[0]); });
    var refScript = isTue ? L.REFERRAL_7_DAYS : isPc ? L.REFERRAL_12_MONTHS : refItem ? refItem[1].replace(/^Request 2: /, '').replace(/^"|"$/g, '') : '';
    var guide = !isTue ? '<details style="margin-top:8px"><summary class="cx-note" style="cursor:pointer">Call guide: what to cover</summary><p class="cx-note" style="margin:6px 0">' + esc(L.SCRIPT_NOTES[type] || '') + '</p><ul style="margin:4px 0 0 18px">' +
      (L.CHECKS[type] || []).filter(function (c) { return !/referral_ask|request_no_secret/.test(c[0]); }).map(function (c) { return '<li>' + esc(c[1]) + '</li>'; }).join('') + '</ul></details>' : '';
    var nextActions = [NEXT_ACTION_BY_CALL[type], 'Send the information we discussed', 'Follow up on a borrower concern', 'Call the borrower back'];
    var selectedNextAction = nextActions.includes(t.next_action) ? t.next_action : t.next_action ? 'other' : '';
    var checks = (L.CHECKS[type] || []).filter(function (c) { return !isTue || c[0] !== 'referral_ask'; }).map(function (c) {
      return '<label class="cx-check' + (ck[c[0]] ? ' done' : '') + '"><input type="checkbox" data-check="' + c[0] + '"' + (ck[c[0]] ? ' checked' : '') + dis + '><span>' + esc(c[1]) + '</span></label>';
    }).join('') + (type === 'pc60' ? '<label class="cx-check' + (ck.rate_drop_na ? ' done' : '') + '"><input type="checkbox" data-check="rate_drop_na"' + (ck.rate_drop_na ? ' checked' : '') + dis + '><span>The Five-Year Rate Drop Pledge does not apply to this loan</span></label>' : '');
    var referralAsked = t.referral_requested || (isTue && ck.referral_ask);
    var agentPresent = L.hasBuyerAgent(loan.buyer_agent_name), out = L.outcomeLabel(t, today());
    var chipCls = t.status === 'completed' ? 'chip-done' : (t.status === 'attempted' || t.status === 'exception') ? 'chip-attempt' : L.bucket(t, today()) === 'overdue' ? 'chip-overdue' : 'chip-open';
    box.innerHTML =
      '<div class="cx-head"><div><div class="cx-kicker">' + esc(typeLabel(type)) + ' · Due ' + esc(fmtDate(t.due_date)) + '</div><h2>' + esc(borrowerOf(t)) + '</h2>' +
      '<div class="cx-sub">' + esc(lpLabel(t.owner_lp)) + (t.coverage_lp ? ' (covered by ' + esc(t.coverage_lp) + ')' : '') + '</div></div>' +
      '<div class="cx-row"><span class="cx-chip ' + chipCls + '">' + esc(out) + '</span><button type="button" class="cx-btn sm" data-cx="close">Close</button></div></div>' +
      '<div class="cx-card" style="margin-top:14px;padding:14px"><div class="cx-split cx-small">' +
      '<div><b>Milestone</b><br>' + esc(loan.last_milestone || '—') + '</div>' +
      '<div><b>' + (isPc ? 'Closed' : 'Est. closing') + '</b><br>' + esc(fmtDate(isPc ? loan.closed_date : loan.est_closing_date)) + '</div>' +
      '<div><b>Buyer agent</b><br>' + (!agentPresent || L.isBrokerageName(loan.buyer_agent_name) ? (agentPresent ? 'Not on file<br><span class="cx-note">Brokerage: ' + esc(loan.buyer_agent_name) + '</span>' : 'None on file') +
        (editable || canWrite() ? '<br><button type="button" class="cx-link" data-agent-add>+ Add buyer agent</button><div data-agent-form class="cx-hide" style="margin-top:6px"><input type="text" data-agent-f="name" placeholder="Agent name" style="width:100%;margin-bottom:4px"><input type="text" data-agent-f="phone" placeholder="Phone (optional)" style="width:100%;margin-bottom:4px"><input type="text" data-agent-f="email" placeholder="Email (optional)" style="width:100%;margin-bottom:4px"><button type="button" class="cx-btn sm" data-agent-save>Save agent</button></div>' : '') : agentPresent ? esc(loan.buyer_agent_name) + (loan.buyer_agent_phone ? ' · <a href="tel:' + esc(loan.buyer_agent_phone) + '">' + esc(loan.buyer_agent_phone) + '</a>' : '') + (loan.buyer_agent_email ? '<br><a href="mailto:' + esc(loan.buyer_agent_email) + '">' + esc(loan.buyer_agent_email) + '</a>' : '') : 'None on file') + '</div>' +
      '<div><b>Loan</b><br>' + esc([loan.loan_purpose, loan.loan_type].filter(Boolean).join(' · ') || '—') + '</div></div></div>' +
      (t.status === 'needs_review' ? '<div class="cx-warn" style="margin-top:12px">Needs Review: due before launch with no reliable completion evidence. Not counted against the LP. ' + esc(t.review_note || '') + '</div>' : '') +
      (t.status === 'completed' ? '<div class="cx-complete-banner" style="margin-top:12px">✓ ' + esc(out) + ' · ' + esc(fmtTime(t.completed_at)) + ' by ' + esc(t.completed_by || '') + '. Completed records are locked.</div>' : '') +
      (!editable && isTue && t.status !== 'completed' ? '<p class="cx-note">This record is read-only. Ask Mack to check its status or your team access if it still needs an update.</p>' : '') +
      '<form data-cx="task" novalidate>' +
      '<h3 style="margin-top:18px">' + (isTue ? 'Step 1 · Borrower call' : isPc ? 'Client call' : type === 'contract' ? 'New contract call' : 'Pre-closing call') + '</h3>' +
      (simple ? guide : '<div class="cx-script" style="margin-top:8px">' + esc(L.SCRIPT_NOTES[type] || '') + '</div>') +
      '<label class="cx-f" for="cx-bo">' + (simple ? 'How did the call go?' : 'Borrower contact outcome') + '</label><select id="cx-bo" name="borrower_outcome"' + (simple ? ' class="cx-hide" aria-hidden="true" tabindex="-1"' : '') + dis + '>' + borrowerOutcomeOptions(t) + '</select>' +
      (simple ? '<div id="cx-bo-btns" class="cx-row" role="group" aria-label="How did the call go?" style="gap:8px;margin-top:6px">' + outcomeButtons.map(function (o) {
        return '<button type="button" class="cx-check" data-bo="' + o[0] + '" aria-pressed="false" style="flex:1;min-width:150px;justify-content:center;padding:12px;font-weight:700"' + dis + '>' + esc(o[1]) + '</button>';
      }).join('') + '</div>' + (isTue && L.tuesdayUpdateTextConfirmed(t) ? '<p class="cx-note" style="margin-top:6px">Update text already sent. Click <b>Done</b> to finish this week\'s update.</p>' : '') : '') +
      '<div id="cx-attempt-row" class="cx-row" style="margin-top:8px"></div>' +
      (isTue ? '<label class="cx-f" for="cx-bn">Update notes</label><textarea id="cx-bn" name="borrower_notes" rows="2" placeholder="e.g. Appraisal in, on track to close 12/12"' + dis + '>' +
        esc([t.service_update, t.borrower_notes].filter(function (note, i, notes) { return note && notes.indexOf(note) === i; }).join('\n\n')) + '</textarea>' :
        !isTue ? '<label class="cx-f" for="cx-bn">Call notes</label><textarea id="cx-bn" name="borrower_notes" rows="2" placeholder="' + (isPc ? 'e.g. Settled in, first payment set up, no questions' : type === 'contract' ? 'e.g. Reviewed the 3 promises, closing 12/20 confirmed' : 'e.g. Reviewed CD, cash to close matched, no concerns') + '"' + dis + '>' + esc(t.borrower_notes || '') + '</textarea>' : '') +
      (simple ? '<input id="cx-cat" type="hidden" name="conversation_at" value="' + esc(toLocalInput(t.conversation_at)) + '">' :
      '<label class="cx-f" for="cx-cat">Conversation date and time</label><input id="cx-cat" type="datetime-local" name="conversation_at" value="' + esc(toLocalInput(t.conversation_at)) + '"' + dis + '>' +
      '<div style="margin-top:12px"><div class="cx-f" style="margin:0 0 4px">Conversation steps</div>' + checks + '</div>' +
      '<label class="cx-f" for="cx-bn">Borrower conversation notes</label><textarea id="cx-bn" name="borrower_notes" placeholder="What was discussed, in your own words"' + dis + '>' + esc(t.borrower_notes || '') + '</textarea>') +
      (simple ? '<p id="cx-ccr-note" class="cx-note cx-hide" style="margin-top:10px">' + (isPc ? 'No referral (PCR) question on this one. It appears when you pick <b>Talked with client</b>.' : 'No referral question on this one. It appears when you pick <b>Talked with borrower</b>.') + '</p><section id="cx-tuesday-ccr">' : '') + '<h3 style="margin-top:18px">' + (isTue ? 'Ask for a referral (CCR)' : isPc ? 'Ask for a referral (PCR)' : isJourney ? 'Ask for a referral (CCR)' : type === 'contract' ? 'Referral expectation' : (L.TASK_TYPES[type].referral === 'CCR' ? 'Current-client referral (CCR)' : 'Past-client referral (PCR)')) + '</h3>' +
      (simple ? '<blockquote id="cx-ccr-script" class="cx-script" style="margin:8px 0 0">' + esc(refScript) + '</blockquote>' : '') +
      (simple ? '' : '<label class="cx-check' + (referralAsked ? ' done' : '') + '" style="margin-top:8px"><input type="checkbox" name="referral_requested"' + (referralAsked ? ' checked' : '') + dis + '><span><b>I asked the referral question on this call.</b></span></label>') +
      (simple ? '<fieldset id="cx-rr" class="cx-row" style="border:0;padding:0;margin:10px 0 0;min-width:0;gap:8px"' + dis + '><legend class="cx-f">Their answer</legend>' +
        [['asked_no_referral', 'No referral']].concat(['potential_opportunity', 'own_financing'].includes(t.referral_response) ? [L.REFERRAL_RESPONSES.find(function (r) { return r[0] === t.referral_response; })] : [], [['named_introduction', 'Got a referral']]).map(function (r) {
          return '<label class="cx-check" style="flex:1;min-width:130px;justify-content:center;padding:12px;font-weight:700"><input type="radio" name="referral_response" value="' + esc(r[0]) + '"' + (r[0] === t.referral_response ? ' checked' : '') + '><span>' + esc(r[1]) + '</span></label>';
        }).join('') + '</fieldset>' :
      '<label class="cx-f" for="cx-rr">Client response</label><select id="cx-rr" name="referral_response"' + dis + '>' + opts(L.REFERRAL_RESPONSES, t.referral_response, 'Select response') + '</select>') +
      '<div id="cx-named"' + (t.referral_response === 'named_introduction' ? '' : ' class="cx-hide"') + '><div class="cx-split"><div><label class="cx-f" for="cx-rn">Referral name</label><input id="cx-rn" type="text" name="referral_name" value="' + esc(t.referral_name || '') + '"' + dis + '></div>' +
      '<div><label class="cx-f" for="cx-rc">Referral phone or email</label><input id="cx-rc" type="text" name="referral_contact" value="' + esc(t.referral_contact || '') + '"' + dis + '></div></div>' +
      '<div class="cx-split' + (simple ? ' cx-hide' : '') + '"><div><label class="cx-f" for="cx-crm">CRM (Velocify) reference · required</label><input id="cx-crm" type="text" name="crm_reference" value="' + esc(t.crm_reference || '') + '"' + dis + '></div>' +
      '<div><label class="cx-f" for="cx-rs">Referral status</label><select id="cx-rs" name="referral_status"' + dis + '>' + opts([['open', 'Open'], ['in_process', 'Application in process'], ['funded', 'Funded'], ['lost', 'Did not proceed']], t.referral_status, 'Select') + '</select></div></div>' +
      '<label class="cx-f' + (simple ? ' cx-hide' : '') + '" for="cx-ft">Follow-through notes</label><textarea id="cx-ft" name="followthrough_note"' + (simple ? ' class="cx-hide"' : '') + dis + '>' + esc(t.followthrough_note || '') + '</textarea></div>' +
      (simple ? '</section>' : '') + (simple ? '<details style="margin-top:12px"' + (t.concern_status && t.concern_status !== 'none' ? ' open' : '') + '><summary class="cx-note" style="cursor:pointer">Client had a concern?</summary>' : '<h3 style="margin-top:18px">Client experience</h3>') +
      '<label class="cx-f" for="cx-cs">Any concern raised?</label><select id="cx-cs" name="concern_status"' + dis + '>' + opts([['none', 'No concern'], ['resolved', 'Concern raised and resolved on this call'], ['unresolved', 'Unresolved concern: resolution required']], t.concern_status || 'none') + '</select>' +
      '<div id="cx-concern"' + ((t.concern_status || 'none') === 'none' ? ' class="cx-hide"' : '') + '><label class="cx-f" for="cx-cn">Concern details and what was done</label><textarea id="cx-cn" name="concern_notes"' + dis + '>' + esc(t.concern_notes || '') + '</textarea>' +
      '<label class="cx-check" style="margin-top:8px"><input type="checkbox" name="escalated"' + (t.escalated ? ' checked' : '') + dis + '><span>Escalate to the Production Manager</span></label></div>' +
      (simple ? '</details>' : '') + (isTue && agentPresent ? '<section id="cx-agent-section" class="cx-card" style="margin-top:12px;padding:14px"><h3>Step 2 · Update the buyer agent</h3>' +
        '<div id="cx-agent-help" class="cx-note" style="margin-top:8px">Let <b>' + esc(loan.buyer_agent_name) + '</b> know where the loan stands. Talking with them or sending the update finishes this step. If you couldn\'t reach them, pick the last option and this call stays on your list.</div>' +
        '<fieldset id="cx-agent" aria-describedby="cx-agent-help" style="border:0;padding:0;margin:8px 0 0;min-width:0"' + dis + '><legend class="cx-f">How did you update ' + esc(loan.buyer_agent_name) + '?</legend>' +
        L.AGENT_OUTCOMES.filter(function (outcome) { return outcome[0] !== 'no_buyer_agent'; }).map(function (outcome) {
          return '<label class="cx-check"><input type="radio" name="agent_outcome" value="' + esc(outcome[0]) + '"' + (outcome[0] === t.agent_outcome ? ' checked' : '') + '><span>' + esc(outcome[1]) + '</span></label>';
        }).join('') + '</fieldset>' +
        '<details id="cx-agent-notes"' + (t.agent_notes || ['spoke', 'update_sent'].includes(t.agent_outcome) ? '' : ' class="cx-hide"') + '><summary>Optional buyer-agent notes</summary><label class="cx-f" for="cx-an">Buyer-agent notes</label><textarea id="cx-an" name="agent_notes"' + dis + '>' + esc(t.agent_notes || '') + '</textarea></details></section>' : isTue ? '<p class="cx-note">No buyer-agent update required. No agent is on file.</p><input type="hidden" name="agent_outcome" value="' + esc(t.agent_outcome || (editable ? 'no_buyer_agent' : '')) + '">' : '') +
      '<details id="cx-follow-up" class="cx-card' + (!isTue ? ' cx-hide' : '') + '" style="margin-top:12px;padding:14px"' + (t.next_action || t.next_action_date ? ' open' : '') + '><summary style="cursor:pointer"><b>' + (isTue ? 'Try again on' : 'Follow-up') + '</b></summary><div class="cx-split"><div' + (isTue ? ' class="cx-hide"' : '') + '>' +
      '<label class="cx-f" for="cx-na-choice">Next action</label><select id="cx-na-choice"' + dis + '>' +
      opts(nextActions.map(function (action) { return [action, action]; }).concat([['other', 'Other next action']]), selectedNextAction, 'Select next action') + '</select>' +
      '<div id="cx-na-other"' + (selectedNextAction === 'other' ? '' : ' class="cx-hide"') + '><label class="cx-f" for="cx-na">Describe the next action</label><input id="cx-na" type="text" name="next_action" value="' + esc(selectedNextAction === 'other' ? t.next_action : '') + '"' + dis + '></div></div>' +

      '<div><label class="cx-f" for="cx-nd">' + (isTue ? 'Next attempt date' : 'Follow-up date') + '</label><input id="cx-nd" type="date" name="next_action_date" value="' + esc(t.next_action_date || '') + '"' + dis + '></div></div></details>' +
      (editable && !simple ? '<details id="cx-reqs" class="cx-card" style="margin-top:12px;padding:14px"><summary style="cursor:pointer"></summary><div style="margin-top:8px"></div></details>' : '') +
      '<div id="cx-exception" class="cx-card cx-hide" style="margin-top:14px;padding:14px"><h3>Client concern or exception</h3><p class="cx-note">Use when a concern needs resolution or the required conversation could not happen. It is not counted as completed.</p>' +
      '<label class="cx-f" for="cx-ek">Type</label><select id="cx-ek" name="exception_kind">' + opts([['service_recovery', 'Client concern: resolution required'], ['unreachable', 'Borrower unreachable after attempts'], ['other', 'Other documented circumstance']], t.exception_kind || 'service_recovery') + '</select>' +
      '<label class="cx-f" for="cx-er">Circumstance and recovery action</label><textarea id="cx-er" name="exception_reason">' + esc(t.exception_reason || '') + '</textarea>' +
      '<div class="cx-row" style="margin-top:10px"><button type="button" class="cx-btn primary" data-cx="save-exception">Save</button><button type="button" class="cx-btn ghost" data-cx="cancel-exception">Cancel</button></div></div>' +
      (isManager() ? managerBlock(t) : '') +
      (simple ? '' : '<h3 style="margin-top:22px">Conversation and activity history</h3><div id="cx-history" style="margin-top:8px">' + historyHtml(id) + '</div>') +
      '<div class="cx-drawer-foot"><span id="cx-save-state" class="cx-note" aria-live="polite"></span>' +
      (editable && simple ? '<span id="cx-complete-hint" class="cx-note" role="status" tabindex="-1"></span>' : '') +
      (editable ? '<button type="button" class="cx-btn" data-cx="save">' + (simple ? 'Save' : 'Save progress') + '</button><button type="button" class="cx-btn accent" data-cx="complete">' + (simple ? 'Done' : 'Complete ' + esc(typeLabel(type))) + '</button><button type="button" class="cx-btn ghost" data-cx="show-exception">Concern or exception</button>' : '') +
      (simple ? '' : '<button type="button" class="cx-btn ghost" data-cx="close">Close</button>') + '</div></form>';
    wireDrawer(ov, t, editable);
    var addAgent = $('[data-agent-add]', ov), agentForm = $('[data-agent-form]', ov);
    if (addAgent && agentForm) {
      addAgent.addEventListener('click', function () { agentForm.classList.remove('cx-hide'); addAgent.classList.add('cx-hide'); $('[data-agent-f="name"]', agentForm).focus(); });
      $('[data-agent-save]', agentForm).addEventListener('click', function () {
        var v = function (k) { return ($('[data-agent-f="' + k + '"]', agentForm).value || '').trim(); };
        if (v('name').length < 2) { toast('Enter the buyer agent\'s name.', true); return; }
        apiAct('core_api_loan_agent', { p_loan: t.loan_number, p_name: v('name'), p_phone: v('phone'), p_email: v('email') })
          .then(function (row) { if (row && row.loan_number) S.loans[row.loan_number] = row; toast('Buyer agent saved on this loan.'); renderDrawer(t.id); renderAll(); })
          .catch(function (e) { toast(friendlyServerError(e), true); });
      });
    }
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
    PATCH_FIELDS.forEach(function (n) { var el = form.querySelector('[name="' + n + '"]:not([type="radio"]), [name="' + n + '"]:checked');
      if (el || n === 'agent_outcome' && t.task_type === 'tuesday') p[n] = el && el.value || null; });
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
    p.next_action = p.next_action_date ? (t.next_action && t.next_action.length >= 3 ? t.next_action : 'Call the borrower back') : null;
    var ca = form.querySelector('[name="conversation_at"]'); if (ca) p.conversation_at = fromLocalInput(ca.value);
    var rq = form.querySelector('[name="referral_requested"]');
    p.referral_requested = p.borrower_outcome === 'conversation' && !!p.referral_response;
    var es = form.querySelector('[name="escalated"]'); if (es) p.escalated = es.checked;
    var checks = Object.assign({}, t.script_checks || {});
    $all('[data-check]', form).forEach(function (c) { checks[c.getAttribute('data-check')] = c.checked; });
    checks.referral_ask = p.referral_requested;
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
    var compact = t.task_type === 'tuesday', simple = true, saving = false;
    var followUpDate = $('#cx-nd', ov), suggestedDate = '', dateEdited = false;
    function updateTextSelected() {
      return ['vm_update', 'no_answer_update'].includes($('#cx-bo', ov).value);
    }
    function suggestAttemptDate() {
      return; // Tuesday: a texted update now completes the week's update, so no retry date is suggested.
      if (!compact || !followUpDate) return;
      if (dateEdited) return;
      if (!updateTextSelected()) {
        if (suggestedDate) followUpDate.value = t.next_action_date || '';
        suggestedDate = '';
        return;
      }
      var date = today();
      var urgent = L.isIssue(Object.assign({}, t, collect(form, t)));
      suggestedDate = L.suggestTuesdayRetry(date, loan.est_closing_date, urgent);
      followUpDate.value = suggestedDate;
    }
    function refreshReqs() {
      if (!editable) return;
      suggestAttemptDate();
      var p = Object.assign({}, t, collect(form, t)), errs = L.validateTask(p, loan), box = $('#cx-reqs', ov);
      if (box) {
        box.querySelector('summary').textContent = errs.length ? 'Completion checklist (' + errs.length + ' remaining)' : 'Ready to complete';
        box.querySelector('div').innerHTML = errs.length ? '<ul class="cx-req">' + errs.map(function (e) { return '<li>' + esc(L.friendlyError(e)) + '</li>'; }).join('') + '</ul>'
          : '<div class="cx-ok">✓ Every required conversation and referral step is documented.</div>';
      }
      var cb = $('[data-cx="complete"]', ov); if (cb) cb.disabled = saving || (!simple && errs.length > 0);
      if (simple) {
        var textUpdate = updateTextSelected();
        var attempted = textUpdate || ['voicemail', 'text_sent'].includes(p.borrower_outcome);
        var texted = compact && (textUpdate || L.tuesdayUpdateTextConfirmed(t));
        $('#cx-tuesday-ccr', ov).classList.toggle('cx-hide', attempted);
        $('#cx-ccr-note', ov).classList.toggle('cx-hide', !attempted);
        var hint = $('#cx-complete-hint', ov);
        if (hint.textContent) hint.textContent = !attempted && errs.length ? L.friendlyError(errs[0]) : '';
        cb.classList.toggle('cx-hide', attempted && !texted);
        $('[data-cx="save"]', ov).classList.toggle('cx-hide', !!texted);
        $('[data-cx="save"]', ov).textContent = !compact && attempted ? 'Save attempt' : 'Save';
      }
      var bo = p.borrower_outcome, ar = $('#cx-attempt-row', ov);
      if (ar) {
        ar.innerHTML = !simple && bo && bo !== 'conversation' ? '<button type="button" class="cx-btn sm" data-cx="log-attempt">Log this attempt</button><span class="cx-note">Attempts are saved with the time.</span>' : '';
        if (false && compact && updateTextSelected() && p.next_action_date) {
          ar.textContent = 'Follow-up ' + fmtDate(p.next_action_date);
          var changeDate = document.createElement('button');
          changeDate.type = 'button'; changeDate.className = 'cx-btn sm'; changeDate.textContent = 'Change date';
          changeDate.onclick = function () { $('#cx-follow-up', ov).open = true; followUpDate.focus(); };
          ar.appendChild(changeDate);
        }
        if (compact && !bo) ar.textContent = 'Call first. If they don’t answer, leave a voicemail and text them the update, then pick Left vmail / sent text update and click Done.';
        if (simple && !compact && !bo) ar.textContent = 'Call first. If they don’t answer, leave a voicemail or send a text, then pick Left vmail / sent text and save. The call stays on your list until you talk with them.';
      }
      var followUp = $('#cx-follow-up', ov);
      if (compact && followUp) followUp.classList.add('cx-hide');
      var exBtn = $('[data-cx="show-exception"]', ov);
      if (simple && exBtn) exBtn.classList.toggle('cx-hide', p.concern_status !== 'unresolved');
      var la = $('[data-cx="log-attempt"]', ov); if (la) la.onclick = function () { logAttempt(bo); };
      var named = $('#cx-named', ov); if (named) named.classList.toggle('cx-hide', p.referral_response !== 'named_introduction');
      var cc = $('#cx-concern', ov); if (cc) cc.classList.toggle('cx-hide', (p.concern_status || 'none') === 'none');
      var agentNotes = $('#cx-agent-notes', ov);
      if (agentNotes) agentNotes.classList.toggle('cx-hide', !p.agent_notes && !['spoke', 'update_sent'].includes(p.agent_outcome));
      $all('.cx-check', ov).forEach(function (l) { var i = l.querySelector('input'); if (i) l.classList.toggle('done', i.checked); });
    }
    function clearMissing() { $all('.cx-missing', ov).forEach(function (el) { el.classList.remove('cx-missing'); el.style.removeProperty('box-shadow'); el.style.removeProperty('border-color'); }); }
    if (editable) {
      form.addEventListener('input', clearMissing); form.addEventListener('change', clearMissing);
      form.addEventListener('input', function (e) { if (e.target === followUpDate) dateEdited = true; ov.__dirty = true; setState('Unsaved changes'); refreshReqs(); });
      form.addEventListener('change', function (e) {
        if (e.target === followUpDate) dateEdited = true;
        ov.__dirty = true; setState('Unsaved changes');
        if (e.target.id === 'cx-na-choice') $('#cx-na-other', form).classList.toggle('cx-hide', e.target.value !== 'other');
        if (e.target.name === 'borrower_outcome' && e.target.value === 'conversation') { var ca = form.querySelector('[name="conversation_at"]'); if (ca && !ca.value) ca.value = localInputNow(); }
        refreshReqs();
      });
    }
    if (simple && editable && $('#cx-bo', ov).value === 'conversation' && !$('#cx-cat', ov).value) $('#cx-cat', ov).value = localInputNow();
    function syncOutcomeButtons() {
      var v = $('#cx-bo', ov) ? $('#cx-bo', ov).value : '';
      $all('[data-bo]', ov).forEach(function (b) { var on = b.dataset.bo === v; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('done', on); b.style.background = on ? 'var(--cx-purple-soft, #EEEBFB)' : ''; b.style.borderColor = on ? 'var(--cx-purple, #6B4FD8)' : ''; });
    }
    $all('[data-bo]', ov).forEach(function (b) {
      b.addEventListener('click', function () {
        var sel = $('#cx-bo', ov); if (!sel || b.disabled) return;
        sel.value = b.dataset.bo; sel.dispatchEvent(new Event('change', { bubbles: true })); syncOutcomeButtons();
      });
    });
    syncOutcomeButtons();
    refreshReqs();
    function busy(on) { saving = on; $all('.cx-drawer-foot .cx-btn', ov).forEach(function (b) { if (b.dataset.cx !== 'close') b.disabled = on || (!simple && b.dataset.cx === 'complete' && valid().length > 0); }); }
    function applyTextDelivery(patch) {
      if (!compact) return null;
      if (!updateTextSelected()) {
        if (patch.borrower_outcome !== t.borrower_outcome && t.script_checks && t.script_checks.update_text_sent) {
          patch.script_checks = Object.assign({}, patch.script_checks || t.script_checks, { update_text_sent: false });
        }
        return null;
      }
      var channel = $('#cx-bo', ov).value === 'vm_update' || t.borrower_outcome === 'voicemail' ? 'voicemail' : 'no_answer';
      patch.borrower_outcome = 'text_sent';
      patch.script_checks = Object.assign({}, patch.script_checks || t.script_checks, { update_text_sent: true });
      return { event_type: 'attempt', party: 'borrower', channel: channel };
    }
    function attemptMessage(row) {
      if (!compact) return 'Attempt saved. The call stays open until you reach the borrower.';
      if (L.tuesdayFollowupScheduled(row, today())) return 'Update text recorded. Follow-up scheduled for ' + fmtDate(row.next_action_date) + '.';
      if (L.tuesdayUpdateTextConfirmed(row)) return 'Update text recorded. Review the follow-up date.';
      return 'Attempt saved. Send the follow-up text, then choose the matching outcome to clear this update from Still to call.';
    }
    function save(extra, okMsg) {
      var p = Object.assign(collect(form, t), extra || {});
      if (!(extra && extra.status) && p.borrower_outcome && p.borrower_outcome !== 'conversation' && t.status === 'open') p.status = 'attempted';
      var callBeforeText = applyTextDelivery(p);
      var prev = Object.assign({}, t);
      setState('Saving…'); busy(true);
      return saveTask(t, p).then(function (row) {
        var evs = callBeforeText ? [callBeforeText] : [];
        if (p.borrower_outcome && (callBeforeText || p.borrower_outcome !== prev.borrower_outcome)) evs.push({ event_type: p.borrower_outcome === 'conversation' ? 'conversation' : 'attempt', party: 'borrower', channel: p.borrower_outcome, occurred_at: p.borrower_outcome === 'conversation' && p.conversation_at ? p.conversation_at : new Date().toISOString(), detail: callBeforeText ? 'Borrower loan update sent by text.' : p.borrower_outcome === 'conversation' ? (p.borrower_notes || '').slice(0, 500) : null });
        if (p.agent_outcome && p.agent_outcome !== prev.agent_outcome) evs.push({ event_type: p.agent_outcome === 'no_buyer_agent' ? 'status' : p.agent_outcome === 'attempted' ? 'attempt' : 'conversation', party: 'buyer_agent', channel: p.agent_outcome, detail: (p.agent_notes || '').slice(0, 500) });
        if (p.status && p.status !== prev.status) evs.push({ event_type: 'status', party: 'system', channel: p.status, detail: p.status === 'exception' ? p.exception_reason : null });
        if (p.escalated && !prev.escalated) evs.push({ event_type: 'escalation', party: 'borrower', detail: p.concern_notes });
        return logEvents(row, evs).then(function () { ov.__dirty = false; setState('Saved'); toast(okMsg || (row.status === 'attempted' && row.borrower_outcome !== 'conversation' ? attemptMessage(row) : 'Progress saved. Complete the call when all required items are entered.')); return row; });
      }).catch(function (e) {
        setState('Not saved', true); busy(false); toast(friendlyServerError(e), true);
        if (/another device/.test(String(e.message))) { ov.__dirty = false; renderDrawer(t.id); }
        throw e;
      });
    }
    function logAttempt(channel) {
      setState('Saving attempt…'); busy(true);
      var patch = { status: t.status === 'open' ? 'attempted' : t.status, borrower_outcome: channel };
      var events = [{ event_type: 'attempt', party: 'borrower', channel: channel,
        detail: ((form.querySelector('[name="borrower_notes"]') || {}).value || '').slice(0, 500) || null }];
      saveTask(t, patch)
        .then(function (row) { return logEvents(row, events).then(function () { return row; }); })
        .then(function (row) { ov.__dirty = false; toast(attemptMessage(row)); renderDrawer(t.id); refreshEvents(t.id); renderAll(); })
        .catch(function (e) { setState('Not saved', true); busy(false); toast(friendlyServerError(e), true); });
    }
    var on = function (sel, fn) { var b = $('[data-cx="' + sel + '"]', ov); if (b) b.addEventListener('click', fn); };
    on('save', function () {
      var agentOnly = compact && !$('#cx-bo', ov).value && !!$('#cx-agent input:checked', ov);
      if (simple && !$('#cx-bo', ov).value && !agentOnly) {
        toast('Choose a borrower or buyer-agent outcome before saving.', true);
        $('#cx-bo', ov).focus();
        return;
      }
      var patch = agentOnly ? { borrower_outcome: t.borrower_outcome || null } : null;
      save(patch, agentOnly ? 'Buyer-agent update saved.' : null).then(function () { renderDrawer(t.id); refreshEvents(t.id); renderAll(); }).catch(function () {});
    });
    on('complete', function () {
      var cat = $('#cx-cat', ov);
      if (simple && cat && !cat.value && $('#cx-bo', ov).value === 'conversation') cat.value = localInputNow();
      var errs = valid();
      if (errs.length) {
        if (simple) {
          var hint = $('#cx-complete-hint', ov);
          hint.textContent = L.friendlyError(errs[0]);
          if (errs.some(function (e) { return /^(Next action|Follow-up date)/.test(e); })) $('#cx-follow-up', ov).open = true;
          var agentChoice = errs[0] === 'Buyer agent update required' && $('#cx-agent input', ov);
          var field = /^(Update|Call) notes/.test(errs[0]) ? $('#cx-bn', ov) : /^Referral response/.test(errs[0]) ? $('#cx-rr input', ov) :
            /referral name/.test(errs[0]) ? $('#cx-rn', ov) : agentChoice;
          clearMissing();
          if (field) {
            var mark = field.matches('textarea, input[type="text"]') ? field : field.closest('fieldset') || field;
            mark.classList.add('cx-missing'); mark.style.setProperty('box-shadow', '0 0 0 3px #C0392B', 'important'); mark.style.setProperty('border-color', '#C0392B', 'important');
            hint.style.color = '#C0392B'; hint.style.fontWeight = '700';
            if (mark.scrollIntoView) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
            if (field === $('#cx-bn', ov)) field.placeholder = 'Type a quick update here to finish (e.g. Approved, on track to close)';
            field.focus();
          } else hint.focus();
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

  // ================================================================ Early warnings (Production Command + Daniel's verdict)
  // Catch fallout before it happens: every warning names the borrower or LP, why it matters,
  // and gives a one-click action (open the record, or copy a ready-to-send note to the LP).
  var ATTEMPT_OUTCOMES = ['voicemail', 'text_sent', 'no_answer', 'email_sent', 'wrong_number'];
  function leadLp(r) {
    var s = String(r && (r.lp_user || r.lp) || '').toLowerCase().trim();
    if (s.indexOf('dill') >= 0 || s === 'gavin') return 'Gavin';
    if (s.indexOf('de la riva') >= 0 || s === 'karen') return 'Karen';
    if (s.indexOf('mcmahon') >= 0 || s === 'osgood') return 'Osgood';
    if (s.indexOf('johnston') >= 0 || s === 'jordan') return 'Jordan';
    if (s.indexOf('saleh') >= 0 || s === 'said') return 'Said';
    if (s.indexOf('isaak') >= 0 || s.indexOf('caldwell') >= 0) return 'Isaak';
    return null;
  }
  // Same rule as the Production Manager overdue-lead export: added in the last 60 days,
  // no recorded action for 5+ days, and not yet applied, nurtured, scheduled or closed out.
  function isStaleLead(r) {
    var s = String(r && r.status || '').toLowerCase().replace(/\s+/g, ' ').trim();
    var applied = false;
    try { applied = typeof window.ctIsLeadAppConverted === 'function' && window.ctIsLeadAppConverted(r); } catch (e) {}
    applied = applied || /started|application|approval|pre.?approval|processing|underwriting|submitt|clear to close|ctc|closing|fund|closed/.test(s);
    var attempt = s.match(/\bcontact\s*attempt\s*(\d+)\b/), outreachDone = false;
    try { outreachDone = typeof window.ctInitialOutreachComplete === 'function' && window.ctInitialOutreachComplete(r); } catch (e) {}
    if (applied || outreachDone || (attempt && Number(attempt[1]) >= 5) ||
      /nurture|\bscheduled\b|withdrawn|dead|lost|do not contact|duplicate|invalid|not interested|bad lead|fake data/.test(s)) return false;
    var added = L.toIsoDate(r.date_added), last = L.toIsoDate(r.last_action_date || r.last_update);
    if (!added || !last || !leadLp(r)) return false;
    var t0 = today();
    return L.daysBetween(added, t0) <= 60 && L.daysBetween(last, t0) >= 5;
  }
  function loadStaleLeads(force) {
    if (!force && S.staleLeads && Date.now() - S.staleLeads.at < 5 * 60000) return Promise.resolve(S.staleLeads);
    if (S._staleLoading) return S._staleLoading;
    S._staleLoading = anonGet('velocify_leads?select=*&date_added=gte.' + L.addDays(today(), -60) + '&order=date_added.desc&limit=5000')
      .then(function (rows) { S.staleLeads = { at: Date.now(), ok: Array.isArray(rows), rows: (rows || []).filter(isStaleLead) }; })
      .catch(function () { S.staleLeads = { at: Date.now(), ok: false, rows: [] }; })
      .then(function () { S._staleLoading = null; renderAll(); return S.staleLeads; });
    return S._staleLoading;
  }
  function firstName(name) { var n = String(name || '').trim(); if (n.indexOf(',') > 0) n = n.split(',')[1].trim() + ' ' + n.split(',')[0].trim(); return n || 'the borrower'; }
  function earlyWarnings() {
    var t0 = today(), wk = L.weekMonday(t0), soon = L.addDays(t0, 7), dow = new Date(t0 + 'T12:00:00').getDay();
    var out = { ready: !!S.loadedAt && !S.error && hasImport('pipeline'), closing: [], quiet: [], behind: [], leads: [] };
    if (!out.ready) return out;
    var byLoan = {};
    S.tasks.forEach(function (t) { (byLoan[t.loan_number] = byLoan[t.loan_number] || []).push(t); });
    var flagged = {};
    // 1. Closing soon with no contact this week, closing date passed, or an open client concern.
    S.tasks.filter(function (t) { return L.isIssue(t) && t.status !== 'completed'; }).forEach(function (t) {
      var b = borrowerOf(t), lp = owner(t) || 'Unassigned';
      flagged[t.loan_number] = 1;
      out.closing.push({ sev: 3, sort: '0', lp: lp, who: b, task: t, why: 'Open client concern' + (t.escalated ? ' · escalated' : ''),
        note: 'Hi ' + lp + ', ' + firstName(b) + ' has an open client concern. What is the plan to resolve it today? Please update the tracker once it is handled.' });
    });
    Object.keys(S.loans).forEach(function (ln) {
      var loan = S.loans[ln], tasks = byLoan[ln] || [];
      if (loan.pipeline_status !== 'active' || loan.funding_verified || flagged[ln]) return;
      var open = tasks.filter(isOpen).sort(sortWork), lp = (open[0] && owner(open[0])) || loan.lp_owner || 'Unassigned';
      var b = loan.borrower_name || 'Borrower name unavailable', close = loan.est_closing_date;
      var talks = tasks.filter(function (t) { return t.borrower_outcome === 'conversation' && t.conversation_at; })
        .map(function (t) { return L.isoOfInstant(t.conversation_at); }).sort();
      var lastTalk = talks.length ? talks[talks.length - 1] : null;
      if (close && close < t0) {
        flagged[ln] = 1;
        out.closing.push({ sev: 2, sort: '1' + close, lp: lp, who: b, task: open[0] || null, loan: loan,
          why: 'Closing date ' + fmtDate(close) + ' passed · not showing funded',
          note: 'Hi ' + lp + ', ' + firstName(b) + '\'s closing date (' + fmtDate(close) + ') has passed but the loan is not showing funded. Can you confirm the new closing date and update the borrower and buyer agent today?' });
        return;
      }
      if (close && close <= soon && !(lastTalk && lastTalk >= wk)) {
        flagged[ln] = 1;
        var days = L.daysBetween(t0, close);
        out.closing.push({ sev: 2, sort: '2' + close, lp: lp, who: b, task: open[0] || null, loan: loan,
          why: 'Closes ' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days') + ' (' + fmtDate(close) + ') · borrower not reached this week',
          note: 'Hi ' + lp + ', ' + firstName(b) + ' closes ' + fmtDate(close) + ' and has not been reached this week. Please call today and log it in the tracker so nothing slips before closing.' });
        return;
      }
      // 2. Borrower gone quiet: 2+ unanswered weeks, or no live conversation in 14+ days on a file we have been calling.
      // Counts open attempts and texted-update completions: neither is a live conversation.
      var misses = tasks.filter(function (t) { return t.status !== 'cancelled' && ATTEMPT_OUTCOMES.indexOf(t.borrower_outcome) >= 0; }).length;
      var firstDue = tasks.map(function (t) { return t.due_date; }).filter(Boolean).sort()[0];
      var silentFor = lastTalk ? L.daysBetween(lastTalk, t0) : firstDue ? L.daysBetween(firstDue, t0) : 0;
      if ((misses >= 2 && silentFor >= 7) || ((open.length || misses) && silentFor >= 14)) {
        out.quiet.push({ sev: 1, sort: String(1000 - silentFor).padStart(4, '0'), lp: lp, who: b, task: open[0] || null, loan: loan,
          why: (misses >= 2 ? misses + ' calls with only a voicemail or text · ' : '') + (lastTalk ? 'last live conversation ' + silentFor + ' days ago' : 'no live conversation logged yet'),
          note: 'Hi ' + lp + ', we have not had a live conversation with ' + firstName(b) + (lastTalk ? ' since ' + fmtDate(lastTalk) : ' yet') + '. Can you try a different time of day, and text to set up a quick call?' });
      }
    });
    // 3. LP falling behind: overdue calls carried forward, missing scorecard, late corrective actions.
    teamStats(periodRange('week')).forEach(function (r) {
      var reasons = [], tasks = r.overdue.slice();
      if (r.overdue.length) reasons.push(r.overdue.length + ' overdue call' + (r.overdue.length === 1 ? '' : 's'));
      var pcLate = r.mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && L.workDueDate(t) < t0 && r.overdue.indexOf(t) < 0; });
      if (pcLate.length) { reasons.push(pcLate.length + ' post-closing call' + (pcLate.length === 1 ? '' : 's') + ' overdue'); tasks = tasks.concat(pcLate); }
      if (r.sc === false && (dow >= 3 || dow === 0)) reasons.push('scorecard not entered this week');
      var late = r.corr.filter(function (c) { return c.status !== 'resolved' && c.due_date < t0; });
      if (late.length) reasons.push(late.length + ' corrective action' + (late.length === 1 ? '' : 's') + ' past due');
      if (!reasons.length) return;
      out.behind.push({ sev: r.overdue.length + pcLate.length + (r.sc === false ? 1 : 0) + late.length, sort: String(999 - tasks.length).padStart(3, '0'), lp: r.lp, who: r.lp, tasks: tasks,
        why: reasons.join(' · '),
        note: 'Hi ' + r.lp + ', quick check-in from the tracker: ' + reasons.join(', ') + '. Can you get these cleared today? Let me know if you need coverage or help.' });
    });
    // 4. Leads and buyer agents going cold.
    if (S.staleLeads && S.staleLeads.ok) S.staleLeads.rows.forEach(function (r) {
      var lp = leadLp(r), last = L.toIsoDate(r.last_action_date || r.last_update), idle = L.daysBetween(last, t0);
      var buyer = r.buyer_name || r.borrower_name || r.customer_name || 'Buyer name unavailable', partner = r.referral_partner_name || '';
      out.leads.push({ sev: 1, sort: String(999 - idle).padStart(3, '0'), lp: lp, who: buyer, lead: true,
        why: 'Velocify lead · no activity for ' + idle + ' days' + (partner ? ' · referred by ' + partner : '') + ' · ' + (r.status || 'status not recorded'),
        note: 'Hi ' + lp + ', ' + buyer + (partner ? ' (referred by ' + partner + ')' : '') + ' has had no Velocify activity for ' + idle + ' days. Can you reach out today and update the status? The referral partner will be waiting to hear.' });
    });
    L.currentTuesdayWork(S.tasks, t0).forEach(function (t) {
      var loan = S.loans[t.loan_number] || {};
      if (t.task_type !== 'tuesday' || t.status === 'completed' || t.status === 'cancelled' || L.workDueDate(t) > t0) return;
      if (!L.hasBuyerAgent(loan.buyer_agent_name) || ['spoke', 'update_sent'].indexOf(t.agent_outcome) >= 0 || flagged[t.loan_number]) return;
      flagged[t.loan_number] = 1;
      var lp = owner(t) || 'Unassigned';
      out.leads.push({ sev: 1, sort: '000', lp: lp, who: loan.buyer_agent_name, task: t,
        why: 'Buyer agent · no Tuesday update yet on ' + borrowerOf(t),
        note: 'Hi ' + lp + ', ' + loan.buyer_agent_name + ' has not had a Tuesday update on ' + firstName(borrowerOf(t)) + ' this week. Can you send them a quick status today? Agents who stay informed keep sending us buyers.' });
    });
    ['closing', 'quiet', 'behind', 'leads'].forEach(function (k) { out[k].sort(function (a, b) { return (b.sev - a.sev) || String(a.sort).localeCompare(String(b.sort)); }); });
    return out;
  }
  var WARN_GROUPS = [
    ['closing', 'Closing soon or client at risk', 'Fix today. These can delay or lose a closing.', 'var(--cx-bad, #B84A42)'],
    ['quiet', 'Borrowers gone quiet', 'Reach them before a small issue becomes a surprise at closing.', '#C98A14'],
    ['behind', 'LPs falling behind', 'Step in early. Offer coverage or a 10-minute check-in.', '#7A5AC8'],
    ['leads', 'Leads and buyer agents going cold', 'A referral partner is waiting. Silence costs future referrals.', '#1E83A8']
  ];
  function warningsHtml(w, limit) {
    if (!w.ready) return '<div class="cx-empty">Early warnings need the current pipeline report. Check Tools and reporting.</div>';
    limit = limit || 5;
    var total = WARN_GROUPS.reduce(function (n, g) { return n + w[g[0]].length; }, 0);
    var head = '<div class="cx-card" style="border-left:5px solid ' + (w.closing.length ? 'var(--cx-bad, #B84A42)' : total ? '#C98A14' : '#2E8B57') + '">' +
      '<div class="cx-kicker">Early warnings · ' + esc(fmtDate(today())) + '</div><h3 style="margin:4px 0 6px">' +
      (!total ? 'Nothing at risk right now' : total + ' item' + (total === 1 ? '' : 's') + ' could slip if nobody acts') + '</h3>' +
      '<div class="cx-row" style="gap:8px;flex-wrap:wrap">' + WARN_GROUPS.map(function (g) {
        var n = w[g[0]].length;
        return '<button type="button" class="cx-btn sm" data-warn-jump="' + g[0] + '" style="border-color:' + (n ? g[3] : '#cfdbe3') + ';color:' + (n ? g[3] : '#6d8190') + '"><b>' + n + '</b>&nbsp;' + esc(g[1]) + '</button>';
      }).join('') + '</div>' +
      (S.staleLeads && !S.staleLeads.ok ? '<p class="cx-note" style="margin-top:8px">Velocify leads could not be read, so stale leads are not shown.</p>' : !S.staleLeads ? '<p class="cx-note" style="margin-top:8px">Checking Velocify for stale leads…</p>' : '') +
      '<p class="cx-note" style="margin-top:8px">Each item has a ready-to-send note. Click <b>Copy note</b> and paste it to the LP in Teams.</p></div>';
    S._warn = {};
    var groups = WARN_GROUPS.map(function (g) {
      var items = w[g[0]];
      if (!items.length) return '';
      var rows = items.map(function (it, i) {
        var id = g[0] + '-' + i; S._warn[id] = it;
        var open = it.task ? '<button type="button" class="cx-btn sm" data-open-task="' + esc(it.task.id) + '">Open call</button>' :
          it.tasks && it.tasks.length ? '<button type="button" class="cx-btn sm" data-rec="' + reg('warn-' + id, it.lp + ' · overdue work', it.tasks) + '">Open ' + it.tasks.length + ' call' + (it.tasks.length === 1 ? '' : 's') + '</button>' :
          it.loan ? '<button type="button" class="cx-btn sm" data-rec="' + reg('warn-' + id, it.who, [], [it.loan]) + '">Open loan</button>' : '';
        return '<div class="cx-item" style="cursor:default;align-items:center;' + (i >= limit ? 'display:none' : '') + '" data-warn-row="' + g[0] + '">' +
          '<span class="i-name">' + esc(it.who) + (it.lp && it.lp !== it.who ? ' <span class="cx-muted" style="font-weight:400">· ' + esc(it.lp) + '</span>' : '') + '</span>' +
          '<span class="i-meta">' + esc(it.why) + '</span>' +
          '<span class="i-right" style="gap:6px">' + open + '<button type="button" class="cx-btn sm accent" data-warn-copy="' + id + '">Copy note</button></span></div>';
      }).join('');
      return '<section class="cx-card" id="warn-' + g[0] + '" style="border-top:4px solid ' + g[3] + '"><div class="cx-head"><div><h3>' + esc(g[1]) + ' · ' + items.length + '</h3><div class="cx-sub">' + esc(g[2]) + '</div></div></div>' +
        '<div class="cx-list" style="margin-top:10px">' + rows + '</div>' +
        (items.length > limit ? '<button type="button" class="cx-link" data-warn-more="' + g[0] + '" style="margin-top:8px">Show all ' + items.length + '</button>' : '') + '</section>';
    }).join('');
    return head + groups;
  }
  function wireWarnings(host) {
    $all('[data-warn-copy]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var it = S._warn && S._warn[b.dataset.warnCopy]; if (!it) return;
        var done = function () { toast('Note copied. Paste it to ' + it.lp + ' in Teams.'); b.textContent = 'Copied ✓'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(it.note).then(done, function () { window.prompt('Copy this note:', it.note); });
        else window.prompt('Copy this note:', it.note);
      });
    });
    $all('[data-warn-more]', host).forEach(function (b) {
      b.addEventListener('click', function () { $all('[data-warn-row="' + b.dataset.warnMore + '"]', host).forEach(function (r) { r.style.display = ''; }); b.remove(); });
    });
    $all('[data-warn-jump]', host).forEach(function (b) {
      b.addEventListener('click', function () { var s = $('#warn-' + b.dataset.warnJump, host); if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    });
  }

  // ================================================================ Production Command (Mack)
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
  function openCoaching() {
    var pmBtn = $('.ct-nav-btn[data-route="production-manager"]');
    if (typeof window.pmOpenView === 'function') window.pmOpenView(pmBtn);
    else if (pmBtn) pmBtn.click();
    var cmd = $('.ct-nav-btn[data-route="core-command"]');
    if (cmd && $('#view-production-manager.active')) { $all('.ct-nav-btn,.who-btn').forEach(function (b) { b.classList.remove('active'); }); cmd.classList.add('active'); }
  }
  function renderCommand() {
    var host = $('#view-core-command'); if (!host) return;
    if (!S.staleLeads && !S._staleLoading) loadStaleLeads();
    if (!activeKey() || !S.tier) {
      host.innerHTML = '<div class="cx-stack"><h2>Production Command</h2><div class="cx-empty">' +
        (activeKey() ? (S.loading ? 'Loading team data…' : 'Could not load team data. <button type="button" class="cx-btn" data-cx="refresh">Retry</button>') + '</div>' :
          'Select a loan partner in the tracker navigation to view their schedule.</div>') + '</div>';
      bindAccess(host);
      return;
    }
    var tabs = [['overview', 'Early warnings'], ['tuesday', 'Tuesday worklist'], ['coaching', 'LP coaching & leads']];
    var more = [['records', 'Call records'], ['data', 'Weekly imports'], ['scorecards', 'Scorecards'], ['production', 'Production metrics'], ['unassigned', 'Assign loans'], ['funding', 'Funding review'], ['coverage', 'Coverage'], ['corrections', 'Corrective actions']];
    var p = S.cmdPeriod;
    var toolsOpen = !!($('[data-command-tools]', host) || {}).open || more.some(function (tool) { return tool[0] === S.cmdTab; });
    var numbersOpen = !!($('[data-command-breakdown]', host) || {}).open;
    host.innerHTML = '<div class="cx-stack"><div><h2 style="margin:0">Production Command</h2><div class="cx-sub">Catch problems before they turn into fallout. Start with Early warnings every morning.</div></div>' +
      (S.error ? '<div class="cx-err">' + esc(S.error) + '</div>' : '') +
      '<div class="cx-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="cx-tab' + (S.cmdTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
      '<details class="cx-supporting" data-command-tools' + (toolsOpen ? ' open' : '') + '><summary>Tools and reporting</summary>' +
      '<div class="cx-row"><select data-cx="manager-tool" aria-label="Manager tool">' + opts(more, S.cmdTab, 'Choose a tool') + '</select>' +
      '<select data-cx="period" aria-label="Period" style="width:auto">' + opts(Object.keys(PERIODS).map(function (k) { return [k, PERIODS[k]]; }), p) + '</select>' +
      '<button type="button" class="cx-btn" data-cx="export">Export to Excel</button><button type="button" class="cx-btn" data-execution-plan>Growth &amp; Execution Plan</button></div>' +
      '<p class="cx-note">' + freshnessLine() + '</p>' + syncLine() + '</details>' +
      '<div id="cx-cmd-body">' + (S.loadedAt ? commandBody(S.cmdTab, p) : '<div class="cx-empty">Loading shared data…</div>') + '</div></div>';
    var breakdown = $('[data-command-breakdown]', host);
    if (breakdown) breakdown.open = numbersOpen;
    bindAccess(host);
    $('[data-execution-plan]', host).addEventListener('click', function () { openView('core-plan'); });
    $all('[data-tab]', host).forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.tab === 'coaching') { openCoaching(); return; } S.cmdTab = b.dataset.tab; renderCommand(); }); });
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
      var current = L.currentTuesdayWork(S.tasks, t0).filter(function (t) { return owner(t) === lp; });
      return { lp: lp, mine: mine,
        tue: L.referralMetrics(mine, ['tuesday'], range, t0), pc: L.referralMetrics(mine, ['pc30', 'pc60', 'pc90'], range, t0),
        day: L.daySummary(current, t0), sc: scorecardFor(lp, wk),
        cover: S.coverage.filter(function (c) { return c.start_date <= t0 && c.end_date >= t0 && (c.from_lp === lp || c.to_lp === lp); }),
        overdue: current.filter(function (t) { return isOpen(t) && L.workDueDate(t) < t0; }),
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
    if (!hasImport('pipeline') || S.error) return '<div class="cx-empty">Live Tuesday updates are unavailable. Check the pipeline report under Tools and reporting.</div>';
    var view = { open: ['tue-remaining', 'No Tuesday updates to call.'], scheduled: ['tue-scheduled', 'No Tuesday follow-ups scheduled.'],
      completed: ['tue-completed', 'No completed updates this week.'] }[S.tuesdayStatus];
    var sections = LPS.map(function (lp) {
      var tasks = lpBuckets(lp)[view[0]];
      return tasks.length ? '<section class="cx-card"><h3>' + esc(lp) + ' · ' + tasks.length + '</h3>' + listHtml(tasks) + '</section>' : '';
    }).join('');
    return '<div class="cx-stack"><div class="cx-head"><h3>Tuesday updates</h3><div class="cx-row">' +
      [['open', 'Still to call'], ['scheduled', 'Follow-up scheduled'], ['completed', 'Completed']].map(function (option) {
        var selected = option[0] === S.tuesdayStatus;
        return '<button type="button" class="cx-btn' + (selected ? ' primary' : '') + '" data-tuesday-status="' + option[0] + '" aria-pressed="' + selected + '">' + option[1] + '</button>';
      }).join('') + '</div></div>' +
      (sections || '<div class="cx-empty">' + esc(view[1]) + '</div>') + '</div>';
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
    var overdueAll = L.currentTuesdayWork(S.tasks, t0).filter(function (t) { return owner(t) && isOpen(t) && L.workDueDate(t) < t0; });
    var wk = L.weekMonday(t0), missingSc = S.scorecards && S.scorecards.ok ? LPS.filter(function (lp) { return !scorecardFor(lp, wk); }) : null;
    var tueOd = tue.outstanding.filter(function (t) { return L.workDueDate(t) < t0; });
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
        var od = r.mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && L.workDueDate(t) < t0; }), att = r.pc.attempted.filter(function (t) { return t.status !== 'completed'; });
        return '<tr><td><b>' + esc(k) + '</b></td>' + ['pc30', 'pc60', 'pc90'].map(function (ty) { return '<td class="cx-num">' + numCell(by(ty).length, reg(k + '-' + ty, k + ' · ' + typeLabel(ty) + 's', by(ty))) + '</td>'; }).join('') +
          '<td class="cx-num">' + pctCell(r.pc.completed.length, r.pc.required.length, reg(k + '-pcd', k + ' · post-closing completed', r.pc.completed)) + '</td><td class="cx-num">' + numCell(od.length, reg(k + '-pco', k + ' · overdue calls', od)) + '</td>' +
          '<td class="cx-num">' + numCell(att.length, reg(k + '-pca', k + ' · attempted calls', att)) + '</td><td class="cx-num">' + numCell(r.pc.asked.length, reg(k + '-pcr', k + ' · PCR requests', r.pc.asked)) + '</td><td class="cx-num">' + numCell(r.pc.named.length, reg(k + '-pci', k + ' · PCR introductions', r.pc.named.map(function (n) { return n.task; }))) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="cx-note" style="margin-top:8px">Calls due in the period. An attempted call is never counted as completed. Historical calls without evidence sit in Needs Review and are excluded.</p></div>';
    return '<div class="cx-stack">' + (S.error || !hasImport('pipeline') || !hasImport('funded_units') ? '<p class="cx-note">Some reports are missing or stale. Check Tools and reporting.</p>' : '') +
      warningsHtml(earlyWarnings()) +
      '<details class="cx-supporting" data-command-breakdown><summary>Team numbers and coaching flags</summary><div class="cx-tiles">' + tiles + '</div>' +
      daily + tueTbl + pcTbl + coachingCard(rows) + '</details></div>';
  }
  function coachingCard(rows) {
    var items = [], t0 = today();
    rows.forEach(function (r) {
      var lp = r.lp;
      if (r.tue.required.length >= 3 && pctOf(r.tue.asked.length, r.tue.required.length) < 80) items.push([lp, 'CCR ask documented on ' + pctOf(r.tue.asked.length, r.tue.required.length) + '% of assigned Tuesday Updates.', 'Role-play the 7-day referral question; recheck next Tuesday.', r.tue.missing]);
      var att = r.tue.attempted.filter(function (t) { return t.status !== 'completed'; });
      if (att.length >= 3) items.push([lp, att.length + ' Tuesday Updates reached only voicemail or text.', 'Agree a second call window and text to schedule a time.', att]);
      var pcO = r.mine.filter(function (t) { return /^pc/.test(t.task_type) && isOpen(t) && L.workDueDate(t) < t0; });
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
    return '<div class="cx-card">' + head + '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr>' + (isManager() ? '<th><input type="checkbox" data-selall aria-label="Select all"></th>' : '') + '<th>Borrower</th><th>Type</th><th>Owner</th><th>Due</th><th>Outcome</th><th class="cx-hide-sm">Referral</th><th class="cx-hide-sm">Agent</th><th class="cx-hide-sm">Next action</th></tr></thead><tbody>' +
      ts.map(function (t) {
        return '<tr class="click" data-open-task="' + esc(t.id) + '">' + (isManager() ? '<td><input type="checkbox" data-sel="' + esc(t.id) + '" aria-label="Select"></td>' : '') + '<td><b>' + esc(borrowerOf(t)) + '</b></td><td>' + esc(typeLabel(t.task_type)) + '</td><td>' + esc(lpLabel(t.owner_lp)) + (t.coverage_lp ? ' → ' + esc(t.coverage_lp) : '') + '</td><td>' + esc(fmtDate(t.due_date)) + '</td><td>' + esc(L.outcomeLabel(t, t0)) + '</td>' +
          '<td class="cx-hide-sm">' + (t.referral_requested ? 'Asked · ' : 'Not asked · ') + esc((L.REFERRAL_RESPONSES.find(function (x) { return x[0] === t.referral_response; }) || [0, '—'])[1]) + (t.referral_name ? ': ' + esc(t.referral_name) : '') + '</td><td class="cx-hide-sm">' + esc(((L.AGENT_OUTCOMES.find(function (x) { return x[0] === t.agent_outcome; }) || [0, '—'])[1])) + '</td><td class="cx-hide-sm">' + esc(t.next_action || '') + (t.next_action_date ? ' · ' + esc(fmtDate(t.next_action_date)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  var SOURCE_OPTS = L.PLAN.sources.map(function (s) { return [s[0], s[1]]; }).concat([['other', 'Other']]);
  function loansTable(loans, selectable, classify) {
    return '<div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr>' + (selectable ? '<th><input type="checkbox" data-selall aria-label="Select all"></th>' : '') + '<th>Borrower</th><th>Status</th><th>Milestone</th><th>Closing</th><th class="cx-hide-sm">Buyer agent</th><th class="cx-hide-sm">Referral source</th><th>Owner</th>' + (classify ? '<th>Funding source</th>' : '') + '</tr></thead><tbody>' +
      loans.map(function (l) {
        return '<tr>' + (selectable ? '<td><input type="checkbox" data-sel-loan="' + esc(l.loan_number) + '" aria-label="Select"></td>' : '') + '<td><b>' + esc(l.borrower_name || '—') + '</b></td><td>' + esc(String(l.pipeline_status).replace('_', ' ')) + '</td><td>' + esc(l.last_milestone || '—') + '</td><td>' + esc(fmtDate(l.closed_date || l.est_closing_date)) + '</td><td class="cx-hide-sm">' + esc(l.buyer_agent_name || '—') + '</td><td class="cx-hide-sm">' + esc(l.referral_source_name || '—') + '</td><td>' + esc(l.lp_owner || (l.ownership_status === 'conflict' ? 'Conflict' : 'Unassigned')) + '</td>' +
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
        return '<div class="cx-item" style="cursor:default"><span class="i-name">' + esc(l.borrower_name || 'Borrower name unavailable') + '</span><span class="i-meta">' + esc(l.funding_note || '') + ' · Closed ' + esc(fmtDate(l.closed_date)) + '</span><span class="i-right">' +
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
    wireWarnings(host);
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
        return { Borrower: borrowerOf(t), Type: typeLabel(t.task_type), Owner: t.owner_lp || 'Unassigned', Coverage: t.coverage_lp || '', Due: t.due_date, Outcome: L.outcomeLabel(t, today()), 'Borrower contact': t.borrower_outcome || '', 'Conversation at': t.conversation_at || '',
          'Referral asked': t.referral_requested ? 'Yes' : 'No', 'Client response': t.referral_response || '', 'Referral name': t.referral_name || '', 'CRM reference': t.crm_reference || '', 'Buyer agent': t.agent_outcome || '', Concern: t.concern_status, Escalated: t.escalated ? 'Yes' : 'No', 'Next action': t.next_action || '', 'Follow-up': t.next_action_date || '', 'Completed at': t.completed_at || '', 'Completed by': t.completed_by || '' };
      });
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(taskRows.length ? taskRows : [{ Note: 'No records in period' }]), 'Activity');
      var un = Object.keys(S.loans).map(function (k) { return S.loans[k]; }).filter(function (l) { return l.ownership_status !== 'verified'; }).map(function (l) { return { Borrower: l.borrower_name, Status: l.pipeline_status, Milestone: l.last_milestone, Closed: l.closed_date || '', 'Est closing': l.est_closing_date || '' }; });
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
  function loadVelocifyCohort(since) {
    var query = 'velocify_leads?select=lead_key,date_added,status,lead_source&date_added=gte.' + since + '&order=lead_key.asc&limit=1000';
    var rows = [];
    function page(offset) {
      return anonGet(query + '&offset=' + offset).then(function (batch) {
        rows = rows.concat(batch);
        return batch.length === 1000 ? page(offset + batch.length) : rows;
      });
    }
    return page(0);
  }
  function loadExternal() {
    if (S.ext && Date.now() - S.ext.at < 5 * 60000) return Promise.resolve(S.ext);
    if (S._extLoading) return S._extLoading;
    var y0 = +today().slice(0, 4);
    S._extLoading = Promise.all([
      anonGet('agent_profiles?select=agent_name,closes_past_year,latest_lead_date,latest_close_date,relationship_status,powerbi_last_seen_at').catch(function () { return null; }),
      loadVelocifyCohort([Math.min(y0, L.PLAN.year) + '-01-01', L.addDays(today(), -29)].sort()[0]).catch(function () { return null; }),
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
  function executionThisWeek(date) {
    var available = S.tier && S.loadedAt && !S.error;
    var counts = available ? LPS.map(lpBuckets) : [];
    var tuesday = available && hasImport('pipeline') ? counts.reduce(function (n, b) { return n + b['tue-remaining'].length; }, 0) : null;
    var postClosing = available && hasImport('funded_units') ? counts.reduce(function (n, b) { return n + b.pc30.length + b.pc60.length + b.pc90.length; }, 0) : null;
    var scorecards = available ? LPS.map(function (lp) { return scorecardFor(lp, L.weekMonday(date)); }) : [];
    var missing = scorecards.length && scorecards.every(function (row) { return row !== null; }) ? scorecards.filter(function (row) { return row === false; }).length : null;
    return '<section class="cx-card"><div class="cx-head"><div><h3>Start this week</h3><div class="cx-sub">Week of ' + esc(fmtDate(L.weekMonday(date))) + ' · Current team work</div></div></div>' +
      '<div class="cx-tiles" style="margin-top:12px">' +
      lpShortcut('execution-tuesday', 'Tuesday updates', tuesday === null ? 'Unavailable' : tuesday + ' open') +
      lpShortcut('execution-calls', '30/60/90-day calls', postClosing === null ? 'Unavailable' : postClosing + ' due now') +
      lpShortcut('execution-coaching', 'Weekly scorecards & coaching', missing === null ? 'Unavailable' : missing + ' scorecards missing') +
      '</div></section>';
  }
  var forecastReviews = null;
  var forecastLabels = { on_track: 'On track', at_risk: 'At risk', confirm_date: 'Date needs confirmation' };
  function loadForecastReviews(force) {
    var key = activeKey();
    if (!key || !['manager','leader','admin'].includes(S.tier)) { forecastReviews = null; return; }
    if (!force && forecastReviews && forecastReviews.key === key &&
        (forecastReviews.loading || Date.now() - forecastReviews.at < 60000)) return;
    var run = { key: key, loading: true, at: Date.now(), rows: null };
    forecastReviews = run;
    apiAct('core_api_forecast_reviews', { p_action: 'list', p: {} }).then(function (rows) {
      if (forecastReviews === run && activeKey() === key) run.rows = rows;
    }).catch(function () { /* The forecast labels unavailable review data. */ }).finally(function () {
      run.loading = false;
      if (forecastReviews === run && activeKey() === key && $('#view-core-plan.active')) renderPlan();
    });
  }
  function forecastReviewSection(scheduled, actual, target) {
    if (!['manager','leader','admin'].includes(S.tier)) return '';
    var data = forecastReviews;
    if (!data || !data.rows) return '<p class="cx-note">' + (data && data.loading ? 'Loading closing reviews…' :
      'Closing reviews unavailable. <button class="cx-btn sm" type="button" data-forecast-retry>Retry</button>') + '</p>';
    var reviews = new Map(data.rows.map(function (row) { return [row.loan_number, row]; }));
    function status(loan) {
      var review = reviews.get(loan.loan_number);
      return review && review.estimated_date === loan.est_closing_date ? review.status : '';
    }
    var onTrack = scheduled.filter(function (loan) { return status(loan) === 'on_track'; }).length;
    var atRisk = scheduled.filter(function (loan) { return status(loan) === 'at_risk'; }).length;
    var total = actual + onTrack, gap = Math.max(0, target - total);
    var writable = S.tier !== 'leader';
    return '<p><b>Funded plus on track</b> ' + total + ' / ' + target + ' · ' + gap + ' to goal · ' +
      atRisk + ' at risk · ' + (scheduled.length - onTrack - atRisk) + ' to confirm</p>' +
      (scheduled.length ? '<details data-forecast-list><summary>Review closing risk</summary><div class="cx-scroll"><table class="cx-t"><thead><tr><th>Loan</th><th>Estimated closing</th><th>Review</th></tr></thead><tbody>' +
        scheduled.map(function (loan) {
          var value = status(loan);
          return '<tr><td>' + esc(loan.borrower_name || 'Borrower name unavailable') + '</td><td>' + esc(fmtDate(loan.est_closing_date)) + '</td><td>' +
            (writable ? '<form class="cx-row" data-forecast-loan="' + esc(loan.loan_number) + '" data-date="' + esc(loan.est_closing_date) + '">' +
              '<select required aria-label="Closing risk for ' + esc(loan.borrower_name || 'Borrower name unavailable') + '">' +
              opts(Object.keys(forecastLabels).map(function (label) { return [label, forecastLabels[label]]; }), value, 'Unreviewed') +
              '</select><button type="submit" class="cx-btn sm">Save</button></form>' : esc(forecastLabels[value] || 'Unreviewed')) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>' : '');
  }
  function fundingForecast(range, date, actual, target) {
    if (!S.tier || !S.loadedAt || S.error || !hasImport('pipeline') || actual === null) {
      return '<section class="cx-card"><h3>Funding forecast</h3><p class="cx-note">Requires current pipeline and verified funding data.</p></section>';
    }
    var loans = Object.values(S.loans).filter(function (loan) {
      return loan.pipeline_status === 'active' && !loan.funding_verified;
    });
    var scheduled = loans.filter(function (loan) {
      return L.inRange(loan.est_closing_date, range) && loan.est_closing_date >= date;
    }).sort(function (a, b) { return a.est_closing_date.localeCompare(b.est_closing_date); });
    var past = date <= range.end ? loans.filter(function (loan) {
      return loan.est_closing_date && loan.est_closing_date < date;
    }) : [];
    var forecast = actual + scheduled.length, gap = Math.max(0, target - forecast);
    S._rec['forecast-scheduled'] = { title: 'Scheduled closings in the forecast', loans: scheduled };
    S._rec['forecast-past'] = { title: 'Active loans with past estimated closing dates', loans: past };
    return '<section class="cx-card"><h3>Funding forecast</h3><div class="cx-sub">Through ' + esc(fmtDate(range.end)) + '</div>' +
      '<div class="cx-tiles" style="margin-top:12px">' +
      planTile('Verified funded', String(actual), 'Recorded through today') +
      planTile('Scheduled to close', String(scheduled.length), 'Open pipeline loans with an estimated date in this period', '', 'forecast-scheduled') +
      planTile('If all scheduled loans fund', forecast + ' / ' + target, gap ? gap + ' more fundings needed' : 'Scheduled volume covers the target') +
      '</div><p class="cx-note">Daniel reviews the gap at the weekly meeting. Mack confirms closing dates and gives each blocker an owner and due date.</p>' +
      forecastReviewSection(scheduled, actual, target) +
      (past.length ? '<button type="button" class="cx-btn" data-plan-rec="forecast-past">Review ' + past.length + ' past closing dates</button>' : '') + '</section>';
  }
  // Daniel's first question: are we on track? One verdict, then the top three risks with owners.
  function planVerdict(c) {
    var P = L.PLAN, t0 = c.t0, w = c.signed ? earlyWarnings() : { ready: false, closing: [], quiet: [], behind: [], leads: [] };
    if (!S.staleLeads && !S._staleLoading) loadStaleLeads();
    var status = 'unknown', headline = '', detail = '';
    var weekly = function (n, days) { return Math.round(10 * n / (days / 7)) / 10; };
    var funded90 = c.signed && hasImport('funded_units') ? fundedIn({ start: L.addDays(t0, -89), end: t0 }).length : null;
    var rate = funded90 === null ? null : weekly(funded90, 90);
    if (c.fp.status === 'not_started') {
      var q1Need = +(P.fundings.quarters[1] / 13).toFixed(1);
      if (rate === null) { status = 'unknown'; headline = 'The 2027 plan starts January 1'; detail = 'Import the Funded Units report to compare the team\'s current pace with what Q1 needs (' + q1Need + ' fundings a week).'; }
      else {
        status = rate >= q1Need * 0.95 ? 'on' : rate >= q1Need * 0.8 ? 'risk' : 'behind';
        headline = status === 'on' ? 'On track to start 2027 at plan pace' : status === 'risk' ? 'At risk: slightly below the pace 2027 needs' : 'Behind: current pace is well below what 2027 needs';
        detail = 'The team funded ' + funded90 + ' loans in the last 90 days (' + rate + ' a week). Q1 2027 needs ' + P.fundings.quarters[1] + ' fundings, about ' + q1Need + ' a week, starting January 1.';
      }
    } else if (c.fp.status === 'unavailable') {
      status = 'unknown'; headline = 'Funding data unavailable'; detail = 'Import the Funded Units report to see whether the team is on track.';
    } else {
      var scheduled = Object.values(S.loans).filter(function (l) { return l.pipeline_status === 'active' && !l.funding_verified && L.inRange(l.est_closing_date, c.range) && l.est_closing_date >= t0; }).length;
      var forecast = (c.funded ? c.funded.length : 0) + scheduled;
      status = c.fp.status === 'met' || (c.fp.status === 'on_pace' && forecast >= c.fundTarget) ? 'on' : (c.fp.status === 'on_pace' || forecast >= c.fundTarget * 0.9) ? 'risk' : 'behind';
      headline = status === 'on' ? 'On track' : status === 'risk' ? 'At risk' : 'Behind plan';
      detail = (c.funded ? c.funded.length : 0) + ' of ' + c.fundTarget + ' funded so far' + (c.fp.gap ? '. The team needs ' + c.fp.requiredPerWeek + ' fundings a week from here' : '') +
        '. ' + scheduled + ' more loans are scheduled to close in this period, so if they all fund the team lands at ' + forecast + ' of ' + c.fundTarget + '.';
    }
    var risks = [];
    var add = function (score, text, ownerName, action, label) { if (score > 0) risks.push({ score: score, text: text, owner: ownerName, action: action, label: label }); };
    if (status === 'behind' || status === 'risk') add(status === 'behind' ? 40 : 20, 'Funding pace: ' + (rate !== null && c.fp.status === 'not_started' ? 'running ' + rate + ' a week' : 'need ' + (c.fp.requiredPerWeek || '—') + ' a week') + '. Review closing blockers and the forecast weekly.', 'Daniel', 'forecast', 'Open funding forecast');
    if (w.closing.length) add(30 + w.closing.length, w.closing.length + ' loan' + (w.closing.length === 1 ? '' : 's') + ' closing soon or at risk with no contact this week (or an open client concern).', 'Mack + LPs', 'warn', 'Open early warnings');
    if (c.gap) add(15 + (c.gap[2] - c.gap[1]), c.gap[0] + ' conversion is ' + c.gap[1] + '% against a ' + c.gap[2] + '% plan. ' + c.gap[3], 'Mack', 'coaching', 'Open LP coaching');
    if (w.behind.length) add(10 + 3 * w.behind.length, w.behind.length + ' LP' + (w.behind.length === 1 ? ' is' : 's are') + ' behind (' + w.behind.map(function (x) { return x.lp; }).join(', ') + '): overdue calls or missing scorecards.', 'Mack', 'warn', 'Open early warnings');
    if (w.leads.length) add(8 + w.leads.length, w.leads.length + ' leads or buyer agents going cold with no follow-up.', 'LPs (Mack checks)', 'warn', 'Open early warnings');
    if (w.quiet.length) add(6 + w.quiet.length, w.quiet.length + ' borrower' + (w.quiet.length === 1 ? ' has' : 's have') + ' gone quiet, with no live conversation recently.', 'LPs', 'warn', 'Open early warnings');
    if (c.un) add(10 + c.un, c.un + ' active loans have no LP owner.', 'Mack', 'unassigned', 'Assign owners');
    risks.sort(function (a, b) { return b.score - a.score; });
    var top = risks.slice(0, 3), colors = { on: '#2E8B57', risk: '#C98A14', behind: '#B84A42', unknown: '#6d8190' };
    var badge = { on: 'ON TRACK', risk: 'AT RISK', behind: 'BEHIND', unknown: 'NO VERDICT YET' }[status];
    S._planRisks = top;
    return { status: status, html: '<section class="cx-card" style="border-left:6px solid ' + colors[status] + '">' +
      '<div class="cx-kicker">Are we on track?</div><div class="cx-row" style="align-items:center;gap:10px;margin:6px 0"><span class="cx-chip" style="background:' + colors[status] + ';color:#fff;font-weight:800">' + badge + '</span><h3 style="margin:0">' + esc(headline) + '</h3></div>' +
      '<p style="margin:4px 0 12px">' + esc(detail) + '</p>' +
      '<h4 style="margin:10px 0 6px">Top risks this week</h4>' +
      (top.length ? '<ol class="cx-list" style="padding-left:0;list-style:none;margin:0">' + top.map(function (r, i) {
        return '<li class="cx-item" style="cursor:default;align-items:center"><span class="i-name">' + (i + 1) + '. ' + esc(r.text) + '</span><span class="i-meta">Owner: <b>' + esc(r.owner) + '</b></span><span class="i-right"><button type="button" class="cx-btn sm" data-plan-risk="' + i + '">' + esc(r.label) + '</button></span></li>';
      }).join('') + '</ol>' : '<div class="cx-empty">No major risks flagged from current data.</div>') +
      '<p class="cx-note" style="margin-top:10px">Details below: funding forecast, goals, conversion and relationships.</p></section>' };
  }
  function wirePlanVerdict(host) {
    $all('[data-plan-risk]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var r = (S._planRisks || [])[+b.dataset.planRisk]; if (!r) return;
        if (r.action === 'forecast') { var f = $('[data-plan-forecast]', host); if (f) { f.open = true; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
        if (r.action === 'coaching') { openCoaching(); return; }
        S.cmdTab = r.action === 'unassigned' ? 'unassigned' : 'overview';
        openView('core-command');
      });
    });
  }
  function renderPlan() {
    var host = $('#view-core-plan'); if (!host) return;
    var P = L.PLAN, t0 = today(), y = P.year;
    loadForecastReviews(false);
    var reviewsOpen = !!($('[data-forecast-list]', host) || {}).open;
    var planDetailsOpen = !!($('[data-plan-details]', host) || {}).open;
    var forecastOpen = !!($('[data-plan-forecast]', host) || {}).open;
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
    var sources = vel ? L.velocifySources(vel) : null;
    var relationshipFunnel = sources ? L.velocifyFunnel(sources.relationship) : null;
    var recentStart = L.addDays(t0, -29);
    var recentLeads = S.ext && S.ext.leadsAll ? S.ext.leadsAll.filter(function (lead) {
      return L.inRange(L.toIsoDate(lead.date_added), { start: recentStart, end: t0 });
    }) : null;
    var baseline = recentLeads && recentLeads.length ? L.velocifySources(recentLeads) : null;
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
    var od = 0, un = 0;
    if (signed) {
      od = L.currentTuesdayWork(S.tasks, t0).filter(function (t) { return owner(t) && isOpen(t) && L.workDueDate(t) < t0; }).length; if (od) bott.push(od + ' overdue client calls across the team');
      un = unassignedActiveLoans().length; if (un) bott.push(un + ' active loans need an LP owner');
    }
    if (sc && sc.some(function (x) { return !x; })) bott.push(sc.filter(function (x) { return !x; }).length + ' LP scorecards not entered this week');
    var stages = started && fun ? [
      ['Relationship lead to 1003', relationshipFunnel.leadToApp, 80, 'Review relationship leads without an application and assign each a next contact date.'],
      ['Application to preapproval', fun.appToPre, 55, 'Review applications awaiting preapproval and assign owners for missing items.'],
      ['Preapproval to contract', fun.preToContract, curQ === 1 && per !== 'year' ? 60 : 65, 'Review preapproved buyers and assign one concrete follow-up per buyer.'],
      ['Contract to funding', fun.contractToFunded, 75, 'Review open contracts and assign next actions for closing blockers.']
    ] : [];
    var gap = stages.filter(function (stage) { return stage[1] !== null && stage[1] < stage[2]; })
      .sort(function (a, b) { return (b[2] - b[1]) - (a[2] - a[1]); })[0];
    var verdict = planVerdict({ per: per, range: range, t0: t0, fp: fp, fundTarget: fundTarget, funded: funded, gap: gap, od: od, un: un, sc: sc, signed: signed, curQ: curQ });
    var weeklyFocus = verdict.html;
    host.innerHTML = '<div class="cx-stack"><div class="cx-head"><div><div class="cx-kicker">Leadership</div><h2>Growth &amp; Execution Plan</h2><div class="cx-sub">' + esc(periodLabel) + ' · Targets from the final CORE Team 2027 Business Plan</div></div>' +
      '<div class="cx-tabs">' + [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].map(function (p) { return '<button type="button" class="cx-tab' + (per === p[0] ? ' on' : '') + '" data-per="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
      (S.tier ? syncLine() : '') +
      weeklyFocus +
      '<details class="cx-supporting" data-plan-forecast' + (forecastOpen ? ' open' : '') + '><summary>Funding forecast</summary>' +
      fundingForecast(range, t0, funded ? funded.filter(function (loan) { return loan.closed_date <= t0; }).length : null, fundTarget) + '</details>' +
      '<details class="cx-supporting" data-plan-details' + (planDetailsOpen ? ' open' : '') + '><summary>Goals, worklists, and reporting</summary>' + executionThisWeek(t0) +
      (baseline ? '<p class="cx-note">Velocify · last 30 days · ' + baseline.relationship.length + ' relationship leads · ' +
        baseline.advertising.length + ' recorded advertising leads · ' + baseline.unclassified.length + ' need source review</p>' : '') +
      (t0 < y + '-01-01' ? '<p class="cx-note">2027 target reporting starts January 1.</p>' : '') +
      '<div class="cx-tiles">' +
      planTile('Funded loans', ns(funded ? funded.length : null), paceFoot(fp, 'fundings') + (per === 'year' ? ' · stretch ' + P.fundings.stretch : ''), nsCls(!!funded, 'hero'), signed ? 'plan-funded' : null) +
      planTile('Unique relationship leads', sources ? ns(sources.relationship.length) : 'Data unavailable', 'Target ' + leadTarget + ' · Classified Velocify leads', nsCls(!!sources)) +
      planTile('Advertising leads', sources ? ns(sources.advertising.length) : 'Data unavailable', 'Recorded advertising sources' + (sources && started ? ' · ' + sources.unclassified.length + ' leads need source review' : ''), nsCls(!!sources)) +
      planTile('Encompass file starts', 'Source needed', 'Target ' + startTarget + ' · Needs an Encompass export with loan number and file-start date', 'is-na') +
      planTile('CCR introductions', ns(ccr ? ccr.named.length : null), 'Target ' + refTarget + ' unique' + (refFunded ? ' · ' + refFunded + ' funded' : '') + (ccr ? ' · ' + ccr.asked.length + ' requests' : ''), nsCls(!!ccr), signed ? 'plan-ccr' : null) +
      planTile('PCR introductions', ns(pcr ? pcr.named.length : null), 'Target ' + refTarget + ' unique' + (refFunded ? ' · ' + refFunded + ' funded' : '') + (pcr ? ' · ' + pcr.asked.length + ' requests' : ''), nsCls(!!pcr), signed ? 'plan-pcr' : null) +
      '</div>' +
      '<details class="cx-supporting"><summary>Funding sources and conversion</summary>' +
      '<div class="cx-split"><div class="cx-card"><h3>Funding by source · ' + esc(periodLabel) + '</h3><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>Source</th><th class="cx-num">Target</th><th class="cx-num">Actual</th></tr></thead><tbody>' + sourceRows +
      '<tr><td><b>Committed total</b></td><td class="cx-num"><b>' + fundTarget + '</b></td><td class="cx-num"><b>' + (funded === null ? '—' : started ? funded.length : '—') + '</b></td></tr></tbody></table></div>' +
      (funded && unclassified && started ? '<div class="cx-warn" style="margin-top:8px">Needs reconciliation: ' + unclassified + ' funded loans have no source category yet.</div>' : '') +
      '<p class="cx-note" style="margin-top:8px">Returning past clients (own financing) and past-client referrals (introducing someone else) are separate sources.</p></div>' +
      '<div class="cx-card"><h3>Conversion funnel</h3><div class="cx-scroll" style="margin-top:12px"><table class="cx-t"><thead><tr><th>Stage</th><th class="cx-num">Plan</th><th class="cx-num">Actual</th><th>Source</th></tr></thead><tbody>' +
      cvRow('Relationship lead to 1003', relationshipFunnel ? relationshipFunnel.leadToApp : null, '80%+', 'Velocify relationship cohort') + cvRow('Application start to preapproval', fun ? fun.appToPre : null, '55%', 'Velocify cohort') +
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
      '<div>Power BI profiles: ' + (S.ext && S.ext.pbi ? esc(fmtTime(S.ext.pbi.imported_at)) : 'Unavailable') + '</div><div>Velocify: ' + (S.ext && S.ext.vel ? 'latest lead ' + esc(fmtTime(S.ext.vel.created_at)) : 'Unavailable') + '</div></div></div></div></details></details></div>';
    bindAccess(host);
    wirePlanVerdict(host);
    $('[data-lp-jump="execution-tuesday"]', host).addEventListener('click', openTuesdayWorklist);
    $('[data-lp-jump="execution-calls"]', host).addEventListener('click', function () { S.cmdTab = 'overview'; S.cmdPeriod = 'week'; openView('core-command'); });
    $('[data-lp-jump="execution-coaching"]', host).addEventListener('click', openCoaching);
    $all('[data-per]', host).forEach(function (b) { b.addEventListener('click', function () { S.planPeriod = b.dataset.per; renderPlan(); }); });
    var reviewList = $('[data-forecast-list]', host);
    if (reviewList) reviewList.open = reviewsOpen;
    var retryReviews = $('[data-forecast-retry]', host);
    if (retryReviews) retryReviews.onclick = function () { loadForecastReviews(true); renderPlan(); };
    $all('[data-forecast-loan]', host).forEach(function (form) {
      form.onsubmit = function (event) {
        event.preventDefault();
        var status = $('select', form).value, button = $('button', form);
        if (!forecastLabels[status] || button.disabled) return;
        button.disabled = true;
        var key = activeKey();
        apiAct('core_api_forecast_reviews', { p_action: 'save', p: {
          loan_number: form.dataset.forecastLoan, estimated_date: form.dataset.date, status: status
        }}).then(function () {
          if (key === activeKey()) loadForecastReviews(true);
        }).catch(function (error) {
          button.disabled = false;
          toast(friendlyServerError(error), true);
        });
      };
    });
    $all('[data-plan-rec]', host).forEach(function (b) { b.addEventListener('click', function () { openRec(b.dataset.planRec); }); });
  }
  function freshImport(kind) {
    var r = S.imports.find(function (x) { return x.kind === kind; });
    return r ? esc(fmtTime(r.imported_at)) + ' · ' + r.accepted_rows + ' loans' : '<b style="color:var(--cx-bad)">Not imported</b>';
  }

  // ================================================================ boot
  function boot() {
    try { injectShell(); } catch (e) { console.error('CORE module shell', e); }
    var view = new URLSearchParams(location.search).get('view');
    if (view === 'tuesday') openTuesdayWorklist();
    if (view === 'snapshot' && typeof window.lpv2Route === 'function') {
      var snapshotButton = $('.ct-nav-btn[data-route="snapshot"]');
      if (snapshotButton) window.lpv2Route('snapshot', snapshotButton);
    }
    if (activeKey()) loadAll(); else { loadScorecards(); renderAll(); }
    setInterval(function () { if (!document.hidden && activeKey() && S.tier && !$('.cx-overlay')) loadAll(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && activeKey() && S.loadedAt && Date.now() - S.loadedAt > 20000 && !$('.cx-overlay')) loadAll(); });
    window.addEventListener('hashchange', function () { var k = readHashKey(); if (k) { setKey(k); loadAll(); } });
    window.addEventListener('storage', function (e) { if (e.key === KEY_STORE) { teamKey = e.newValue; loadAll(); } });
  }
  window.CoreApp = { open: openView, openTuesdayWorklist: openTuesdayWorklist, renderCoaching: renderCoaching, managerSignIn: managerSignIn, openImports: function () { S.cmdTab = 'data'; openView('core-command'); }, reload: loadAll, state: S, renderToday: renderToday, refreshBuilderTile: refreshBuilderTile, renderWeeklyActions: renderWeeklyActions, renderPortfolioChanges: renderPortfolioChanges, _rpc: function (fn, args) { return apiAct(fn, args); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
