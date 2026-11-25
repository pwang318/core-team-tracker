/* CORE Team LP Tracker - execution logic (pure functions, no DOM, no network).
 * Shared by the browser module (core/core-app.js) and the Node test suite
 * (scripts/test-core-logic.cjs). Completion rules mirror the database
 * function public.core_task_completion_errors so the UI and the server agree.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoreLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LPS = ['Gavin', 'Karen', 'Osgood', 'Jordan', 'Said', 'Isaak'];
  var LP2S = ['Gavin', 'Karen', 'Osgood', 'Jordan', 'Said'];
  var TZ = 'America/New_York';

  // ---------------------------------------------------------------- dates
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoFromParts(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function todayIso(now) {
    var d = now || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
      return o.year + '-' + o.month + '-' + o.day;
    } catch (e) { return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  }
  function isoOfInstant(ts) {
    if (!ts) return null;
    var d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return null;
    return todayIso(d);
  }
  function parseIso(iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(iso, n) {
    var t = new Date(parseIso(iso) + n * 86400000);
    return isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function daysBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }
  function dow(iso) { return new Date(parseIso(iso)).getUTCDay(); } // 0=Sun
  function tuesdayOf(iso) { var d = dow(iso); var monday = addDays(iso, d === 0 ? -6 : 1 - d); return addDays(monday, 1); }
  /** Accepts Date, Excel serial number, ISO text, "M/D/YYYY", "YYYY-MM-DD hh:mm:ss". Returns ISO date or null. */
  function toIsoDate(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return isNaN(v) ? null : isoFromParts(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' && isFinite(v)) {
      if (v < 20000 || v > 80000) return null; // not a plausible Excel date serial
      var t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    var s = String(v).trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return validYmd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return validYmd(y, +m[1], +m[2]); }
    return null;
  }
  function validYmd(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCMonth() !== mo - 1) return null;
    return isoFromParts(y, mo, d);
  }
  function toIsoTimestamp(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
    var s = String(v).trim(); if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
    var d = toIsoDate(s); return d ? d + 'T00:00:00' : null;
  }
  function postCloseDue(closedIso) {
    if (!closedIso) return null;
    return { pc30: addDays(closedIso, 30), pc60: addDays(closedIso, 60), pc90: addDays(closedIso, 90) };
  }
  function quarterOf(iso) { var m = +String(iso).slice(5, 7); return Math.floor((m - 1) / 3) + 1; }
  function quarterRange(year, q) {
    var startM = (q - 1) * 3 + 1, endM = startM + 2;
    var end = addDays(isoFromParts(endM === 12 ? year + 1 : year, endM === 12 ? 1 : endM + 1, 1), -1);
    return { start: isoFromParts(year, startM, 1), end: end };
  }
  function monthRange(iso) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    return { start: isoFromParts(y, m, 1), end: addDays(isoFromParts(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1) };
  }

  // ---------------------------------------------------------------- names
  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function lpShort(name) {
    var n = clean(name).toLowerCase();
    if (!n) return null;
    if (n.indexOf(',') > 0) { var parts = n.split(','); n = clean(parts[1]) + ' ' + clean(parts[0]); }
    if (/^gavin( |$)/.test(n) || / ?dill$/.test(n) && /gavin/.test(n)) return 'Gavin';
    if (/^karen( |$)/.test(n) || /de la riva$/.test(n)) return 'Karen';
    if (/^osgood( |$)/.test(n) || /(^| )mcmahon$/.test(n)) return 'Osgood';
    if (/^jordan( |$)/.test(n) && !/holibaugh/.test(n)) return 'Jordan';
    if (/^said( |$)/.test(n) || /(^| )saleh$/.test(n)) return 'Said';
    if (/^isaak( |$)/.test(n)) return 'Isaak';
    return null;
  }
  function hasBuyerAgent(name) {
    var n = clean(name).toLowerCase();
    return !!n && !/^(none none|none|n\/?a|na|jane doe|john doe|-)$/.test(n);
  }
  function normKey(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // ---------------------------------------------------------------- imports
  function headerIndex(headers, patterns) {
    var hs = headers.map(function (h) { return clean(h).toLowerCase(); });
    for (var i = 0; i < patterns.length; i++) {
      for (var j = 0; j < hs.length; j++) if (patterns[i].test(hs[j])) return j;
    }
    return -1;
  }
  var PIPELINE_COLS = {
    lp2: [/loan partner 2/],
    loan_number: [/^loan number$/, /loan ?#|loan num/],
    borrower_name: [/^borrower name$/, /borrower/],
    est_closing_date: [/^est closing date$/, /est.*clos/],
    last_milestone: [/^last finished milestone$/],
    milestone_date: [/^last finished milestone date$/],
    loan_purpose: [/^loan purpose$/],
    loan_type: [/^loan type$/],
    loan_program: [/^loan program$/],
    loan_amount: [/^loan amount$/],
    buyer_agent_name: [/^buyers? agent contact name$/, /^buyers? agent name$/],
    buyer_agent_phone: [/^buyers? agent phone$/],
    buyer_agent_email: [/^buyers? agent email$/],
    referral_source_name: [/^referral source name$/],
    loan_processor: [/^loan processor$/],
    cd_issued_date: [/closing disclosure.*issued/]
  };
  var FUNDED_COLS = {
    loan_number: [/^loan number$/],
    lp2: [/^loan team member name\s*-\s*loan partner 2$/, /^loan partner 2$/, /^lp2$/],
    borrower_name: [/^borrower name$/],
    last_milestone: [/^last finished milestone$/],
    loan_officer: [/^loan officer$/],
    property_address: [/^subject property address$/],
    property_city: [/^subject property city$/],
    property_state: [/^subject property state$/],
    est_closing_date: [/^est closing date$/],
    loan_type: [/^loan type$/],
    buyer_agent_name: [/^buyers? agent name$/],
    closed_date: [/^closed date$/, /^funded date$/, /^funding date$/, /^closing date$/],
    loan_processor: [/^loan processor$/],
    referral_source_name: [/^referral source name$/]
  };
  function findHeaderRow(rows, required) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var r = rows[i] || [];
      var ok = required.every(function (pats) { return headerIndex(r, pats) >= 0; });
      if (ok) return i;
    }
    return -1;
  }
  function mapRows(rows, cols, required) {
    var hr = findHeaderRow(rows, required.map(function (k) { return cols[k]; }));
    if (hr < 0) return { error: 'Required columns not found: ' + required.join(', '), rows: [] };
    var headers = rows[hr], idx = {};
    Object.keys(cols).forEach(function (k) { idx[k] = headerIndex(headers, cols[k]); });
    var out = [];
    for (var i = hr + 1; i < rows.length; i++) {
      var r = rows[i] || [];
      if (!r.some(function (c) { return clean(c) !== ''; })) continue;
      var o = {};
      Object.keys(idx).forEach(function (k) { o[k] = idx[k] >= 0 ? r[idx[k]] : null; });
      out.push(o);
    }
    return { headerRow: hr, columns: idx, rows: out };
  }
  function normalizeLoanNumber(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v));
    return clean(v).replace(/\.0+$/, '');
  }
  function parsePipeline(rows) {
    var m = mapRows(rows, PIPELINE_COLS, ['lp2', 'loan_number', 'borrower_name']);
    if (m.error) return { error: m.error, rows: [], issues: [] };
    var issues = [], seen = {};
    var out = m.rows.map(function (r) {
      var o = {
        loan_number: normalizeLoanNumber(r.loan_number),
        borrower_name: clean(r.borrower_name),
        lp2: clean(r.lp2),
        lp_short: lpShort(r.lp2),
        est_closing_date: toIsoDate(r.est_closing_date),
        last_milestone: clean(r.last_milestone),
        milestone_date: toIsoTimestamp(r.milestone_date),
        loan_purpose: clean(r.loan_purpose),
        loan_type: clean(r.loan_type),
        loan_program: clean(r.loan_program),
        loan_amount: r.loan_amount === null || clean(r.loan_amount) === '' ? null : Number(String(r.loan_amount).replace(/[$,]/g, '')) || null,
        buyer_agent_name: hasBuyerAgent(r.buyer_agent_name) ? clean(r.buyer_agent_name) : '',
        buyer_agent_phone: /^0+[-0]*$/.test(clean(r.buyer_agent_phone)) ? '' : clean(r.buyer_agent_phone),
        buyer_agent_email: /^(none|na|n\/a)@/i.test(clean(r.buyer_agent_email)) || /^n\/?a$/i.test(clean(r.buyer_agent_email)) ? '' : clean(r.buyer_agent_email),
        referral_source_name: clean(r.referral_source_name),
        loan_processor: clean(r.loan_processor),
        cd_issued_date: toIsoDate(r.cd_issued_date)
      };
      if (!/^[0-9A-Za-z-]{4,30}$/.test(o.loan_number)) issues.push({ type: 'missing_loan_number', borrower: o.borrower_name });
      else if (seen[o.loan_number]) issues.push({ type: 'duplicate', loan_number: o.loan_number });
      if (o.loan_number) seen[o.loan_number] = true;
      if (!o.lp_short) issues.push({ type: 'unassigned', loan_number: o.loan_number, lp2: o.lp2 });
      return o;
    });
    return { rows: out, issues: issues, uniqueLoans: Object.keys(seen).length };
  }
  function parseFunded(rows) {
    var m = mapRows(rows, FUNDED_COLS, ['loan_number', 'borrower_name', 'last_milestone', 'closed_date']);
    if (m.error) return { error: m.error, rows: [], issues: [] };
    var issues = [], seen = {}, milestones = {};
    var out = m.rows.map(function (r) {
      var o = {
        loan_number: normalizeLoanNumber(r.loan_number),
        lp2: clean(r.lp2),
        borrower_name: clean(r.borrower_name),
        last_milestone: clean(r.last_milestone),
        closed_date: toIsoDate(r.closed_date),
        est_closing_date: toIsoDate(r.est_closing_date),
        loan_type: clean(r.loan_type),
        buyer_agent_name: clean(r.buyer_agent_name),
        referral_source_name: clean(r.referral_source_name),
        loan_officer: clean(r.loan_officer),
        loan_processor: clean(r.loan_processor),
        property_address: clean(r.property_address),
        property_city: clean(r.property_city),
        property_state: clean(r.property_state)
      };
      milestones[o.last_milestone || '(blank)'] = (milestones[o.last_milestone || '(blank)'] || 0) + 1;
      if (!/^[0-9A-Za-z-]{4,30}$/.test(o.loan_number)) issues.push({ type: 'missing_loan_number', borrower: o.borrower_name });
      else if (seen[o.loan_number]) issues.push({ type: 'duplicate', loan_number: o.loan_number });
      if (!o.closed_date) issues.push({ type: 'missing_closed_date', loan_number: o.loan_number });
      if (o.last_milestone.toLowerCase() !== 'funding') issues.push({ type: 'funding_exception', loan_number: o.loan_number, milestone: o.last_milestone });
      if (o.loan_number) seen[o.loan_number] = true;
      return o;
    });
    return { rows: out, issues: issues, uniqueLoans: Object.keys(seen).length, milestones: milestones };
  }

  // ---------------------------------------------------------------- scripts (Daniel / Ascend field script resource)
  var REFERRAL_7_DAYS = 'By the way, did you happen to run across anyone talking about refinancing or purchasing a home in the past 7 days?';
  var REFERRAL_12_MONTHS = 'By the way, did you happen to run across anyone talking about refinancing or purchasing a home in the next 12 months?';
  var TASK_TYPES = {
    tuesday: { label: 'Tuesday Update', group: 'tuesday', referral: 'CCR' },
    pc30: { label: '30-Day Call', group: 'post_closing', referral: 'PCR' },
    pc60: { label: '60-Day Call', group: 'post_closing', referral: 'PCR' },
    pc90: { label: '90-Day Call', group: 'post_closing', referral: 'PCR' },
    contract: { label: 'New Contract Call', group: 'journey', referral: 'CCR' },
    preclose: { label: 'Pre-Closing Review', group: 'journey', referral: 'CCR' }
  };
  var CHECKS = {
    tuesday: [
      ['update', 'Discussed the current loan status (meaningful update; on track for the closing date)'],
      ['requirements_timeline', 'Addressed questions, concerns, outstanding items and the closing timeline'],
      ['asked_assistance', '"Is there anything else I can help you with?"'],
      ['referral_ask', '"' + REFERRAL_7_DAYS + '"'],
      ['offered_again', '"Are you sure there is nothing else I can do for you?"']
    ],
    pc30: [
      ['settling', '"How is the house? Are you settling in?"'],
      ['first_statement', '"Have you received your first mortgage statement?"'],
      ['payment_servicing', '"Do you know what you need to do to make your first payment?" (payment and servicing information understood)'],
      ['questions_assistance', '"Do you have any questions about your mortgage?" / "Is there anything else I can do for you right now?"'],
      ['referral_ask', '"' + REFERRAL_12_MONTHS + '"'],
      ['offered_again', '"Are you sure there is nothing else I can do for you?"']
    ],
    pc60: [
      ['settling', '"How is the house? Are you settling in?"'],
      ['servicing_transfer', 'Confirmed any servicing transfer or payment concerns'],
      ['mortgage_questions', '"Any questions about your mortgage loan?"'],
      ['rate_drop_pledge', 'Reviewed the Five-Year Rate Drop Pledge using company-approved language'],
      ['referral_ask', '"' + REFERRAL_12_MONTHS + '"'],
      ['offered_again', '"Are you sure there is nothing else I can do for you?"']
    ],
    pc90: [
      ['homeowner_experience', '"How is the house?" (overall homeowner experience)'],
      ['homeowner_needs', 'Any additional homeowner or financing needs'],
      ['questions_concerns', '"Any questions about your mortgage?" (outstanding questions or concerns)'],
      ['future_assistance', '"Is there anything else I can help you with?" (future opportunities to help)'],
      ['referral_ask', '"Did you happen to run across anyone talking about refinancing or purchasing a home in the next 12 months?"'],
      ['offered_again', '"Are you sure there is nothing else I can do for you?"']
    ],
    contract: [
      ['promise_communication', 'Promise 1: Communication will be proactive (real-time text/email updates and a personal call every week)'],
      ['promise_no_surprises', 'Promise 2: No surprises. The terms reviewed will be the same or better at closing'],
      ['promise_on_time', 'Promise 3: Close on time (confirmed the contract closing date)'],
      ['request_text_realtor', 'Request 1: "Please send [Realtor] a quick text and let them know we are taking great care of you"'],
      ['request_no_secret', 'Request 2: "If you hear of anyone buying or refinancing, please don\'t keep me a secret"'],
      ['sales_anchor', 'Sales anchor: "A great time to refer a friend, family member or colleague is during our weekly update calls"']
    ],
    preclose: [
      ['closing_figures', 'Reviewed the actual Closing Disclosure: cash to close and payment versus what was expected'],
      ['promises_confirmed', '"I promised you I was going to close on time, communicate proactively, and make sure there would be no surprises. Did I meet those expectations?"'],
      ['concerns_addressed', 'Addressed any outstanding concerns'],
      ['future_referral_ask', '"Can I count on you to refer one client to me over the next 12 months?"'],
      ['postclose_expectations', 'Set expectations for the 30-, 60- and 90-day calls']
    ]
  };
  var SCRIPT_NOTES = {
    tuesday: 'Service first. Referral second. Call the borrower first, then the buyer agent. Final update before closing: warn the borrower there can be a final audit and a couple of last-minute items.',
    pc30: 'Service first, referral second. Ask the service questions before the past-client referral question.',
    pc60: 'Service first, referral second. Review the Five-Year Rate Drop Pledge only in company-approved language.',
    pc90: 'Service first, referral second. Ask the service questions before the past-client referral question.',
    contract: '"I\'m going to promise you 3 things that will happen during the course of the process, and I just simply ask for 2 things in return."',
    preclose: 'Review the actual Closing Disclosure before the referral conversation. Use borrower-specific approved values only. If the borrower has not referred anyone: "I can\'t help but notice that you haven\'t referred anyone to me during the process. And that\'s okay."'
  };
  var REFERRAL_RESPONSES = [
    ['asked_no_referral', 'Asked: no referral'],
    ['potential_opportunity', 'Potential referral opportunity'],
    ['named_introduction', 'Named introduction received'],
    ['own_financing', "Client's own financing opportunity"]
  ];
  var BORROWER_OUTCOMES = [
    ['conversation', 'Spoke with borrower (live conversation)'],
    ['voicemail', 'Left voicemail (attempt)'],
    ['text_sent', 'Sent text (attempt)'],
    ['email_sent', 'Sent email (attempt)'],
    ['no_answer', 'No answer (attempt)'],
    ['wrong_number', 'Wrong or disconnected number (attempt)']
  ];
  var AGENT_OUTCOMES = [
    ['spoke', 'Spoke with buyer agent'],
    ['update_sent', 'Update delivered by text or email'],
    ['attempted', 'Attempted, no response yet'],
    ['no_buyer_agent', 'No buyer agent on this loan']
  ];

  // ---------------------------------------------------------------- validation (mirrors SQL)
  function len(s) { return clean(s).length; }
  function validateTask(t, loan) {
    var e = [];
    t = t || {}; var checks = t.script_checks || {};
    if (t.borrower_outcome !== 'conversation') e.push('Borrower conversation required (voicemail, text or no answer is an attempt, not a completed conversation)');
    if (!t.conversation_at) e.push('Conversation date and time required');
    else if (new Date(t.conversation_at).getTime() > Date.now() + 5 * 60000) e.push('Conversation time cannot be in the future');
    if (len(t.borrower_notes) < 20) e.push('Borrower conversation notes required (20+ characters)');
    (CHECKS[t.task_type] || []).forEach(function (c) {
      var k = c[0];
      if (!(checks[k] === true || (k === 'rate_drop_pledge' && checks.rate_drop_na === true))) e.push('Conversation step not confirmed: ' + k);
    });
    if (!t.referral_requested) e.push('Explicit confirmation that the referral was requested is required');
    if (t.task_type !== 'contract' && !t.referral_response) e.push('Referral response required');
    if (t.referral_response === 'named_introduction') {
      if (len(t.referral_name) < 2) e.push('Named introduction requires the referral name');
      if (len(t.crm_reference) < 3) e.push('Named introduction requires the CRM (Velocify) reference');
    }
    if (t.concern_status === 'unresolved') e.push('Unresolved client concern: record service recovery instead of completing');
    if (t.concern_status === 'resolved' && len(t.concern_notes) < 10) e.push('Describe the concern and how it was resolved');
    if (len(t.next_action) < 3) e.push('Next action required');
    if (!t.next_action_date) e.push('Follow-up date required');
    if (t.task_type === 'tuesday') {
      if (len(t.service_update) < 15) e.push('Meaningful service update required (15+ characters)');
      if (!t.agent_outcome || t.agent_outcome === 'attempted') e.push('Buyer agent update required (an unanswered attempt does not complete it)');
      else if (t.agent_outcome === 'no_buyer_agent' && loan && hasBuyerAgent(loan.buyer_agent_name)) e.push('A buyer agent is on file for this loan; record the buyer agent contact');
      else if ((t.agent_outcome === 'spoke' || t.agent_outcome === 'update_sent') && len(t.agent_notes) < 10) e.push('Separate buyer agent notes required (10+ characters)');
    }
    return e;
  }
  function validateException(t) {
    var e = [];
    if (len(t.exception_reason) < 15) e.push('Exception requires the documented circumstance and recovery action (15+ characters)');
    if (!t.next_action_date) e.push('Exception requires a follow-up date');
    if (t.exception_kind === 'service_recovery' && len(t.concern_notes) < 10) e.push('Service recovery requires the documented client concern');
    return e;
  }
  var CHECK_LABEL = {};
  Object.keys(CHECKS).forEach(function (k) { CHECKS[k].forEach(function (c) { CHECK_LABEL[c[0]] = c[1]; }); });
  function friendlyError(msg) {
    return String(msg || '').replace(/^Conversation step not confirmed: (\w+)$/, function (_, k) {
      var l = CHECK_LABEL[k] || k; return 'Confirm step: ' + (l.length > 70 ? l.slice(0, 67) + '…' : l);
    });
  }

  // ---------------------------------------------------------------- classification
  var OPEN = { open: 1, attempted: 1 };
  function effectiveOwner(t) { return t.coverage_lp || t.owner_lp || null; }
  function resolvedOn(t) {
    if (t.status === 'completed') return isoOfInstant(t.completed_at);
    if (t.status === 'exception') return isoOfInstant(t.exception_at || t.updated_at);
    return null;
  }
  function bucket(t, today) {
    if (t.status === 'cancelled') return 'cancelled';
    if (t.status === 'needs_review') return 'needs_review';
    if (t.status === 'completed' || t.status === 'exception') return resolvedOn(t) === today ? 'resolved_today' : 'resolved';
    if (t.due_date < today) return 'overdue';
    if (t.due_date === today) return 'due_today';
    if (t.due_date <= addDays(today, 7)) return 'upcoming';
    return 'later';
  }
  function isIssue(t) { return t.status !== 'cancelled' && (t.concern_status === 'unresolved' || (t.escalated && t.status !== 'completed')); }
  function daySummary(tasks, today, filter) {
    var s = { required: [], completed: [], remaining: [], overdue: [], dueToday: [], upcoming: [], issues: [], attempted: [] };
    (tasks || []).forEach(function (t) {
      if (filter && !filter(t)) return;
      var b = bucket(t, today);
      if (isIssue(t)) s.issues.push(t);
      if (b === 'resolved_today' && t.due_date <= today) { s.required.push(t); s.completed.push(t); }
      else if (b === 'resolved_today') { s.completed.push(t); }
      else if (b === 'overdue' || b === 'due_today') {
        s.required.push(t); s.remaining.push(t);
        if (b === 'overdue') s.overdue.push(t); else s.dueToday.push(t);
        if (t.status === 'attempted') s.attempted.push(t);
      } else if (b === 'upcoming') s.upcoming.push(t);
    });
    var denom = s.required.length;
    s.pct = denom ? Math.round(100 * (s.completed.filter(function (t) { return t.due_date <= today; }).length) / denom) : null;
    s.complete = s.remaining.length === 0;
    return s;
  }

  // ---------------------------------------------------------------- management metrics
  function inRange(iso, r) { return !!iso && (!r || ((!r.start || iso >= r.start) && (!r.end || iso <= r.end))); }
  function referralMetrics(tasks, types, range, today) {
    var req = tasks.filter(function (t) {
      return types.indexOf(t.task_type) >= 0 && t.status !== 'cancelled' && t.status !== 'needs_review'
        && inRange(t.due_date, range) && t.due_date <= today;
    });
    var convo = req.filter(function (t) { return t.borrower_outcome === 'conversation'; });
    var asked = req.filter(function (t) { return t.referral_requested === true && t.borrower_outcome === 'conversation'; });
    var attempted = req.filter(function (t) { return t.status === 'attempted' || (t.borrower_outcome && t.borrower_outcome !== 'conversation'); });
    var completed = req.filter(function (t) { return t.status === 'completed'; });
    var outstanding = req.filter(function (t) { return OPEN[t.status]; });
    var missing = req.filter(function (t) { return !(t.referral_requested && t.borrower_outcome === 'conversation') && t.status !== 'exception'; });
    var named = uniqueReferrals(req);
    return {
      required: req, conversations: convo, asked: asked, attempted: attempted, completed: completed, outstanding: outstanding, missing: missing,
      exceptions: req.filter(function (t) { return t.status === 'exception'; }),
      askPerConversation: convo.length ? Math.round(100 * asked.length / convo.length) : null,
      askPerRequired: req.length ? Math.round(100 * asked.length / req.length) : null,
      named: named,
      namedFunded: named.filter(function (n) { return n.task.referral_status === 'funded'; }),
      conversionPct: named.length ? Math.round(100 * named.filter(function (n) { return n.task.referral_status === 'funded'; }).length / named.length) : null
    };
  }
  function uniqueReferrals(tasks) {
    var seen = {}, out = [];
    (tasks || []).forEach(function (t) {
      if (t.referral_response !== 'named_introduction' || !clean(t.referral_name)) return;
      var key = normKey(t.referral_name) + '|' + normKey(t.referral_contact || '');
      if (seen[key]) return; seen[key] = 1;
      out.push({ key: key, name: clean(t.referral_name), task: t });
    });
    return out;
  }
  function duplicateNotes(tasks) {
    var map = {};
    (tasks || []).forEach(function (t) {
      var n = normKey(t.borrower_notes);
      if (n.length < 20) return;
      var k = (t.owner_lp || '') + '|' + n;
      (map[k] = map[k] || []).push(t);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (g) {
      var loans = {}; g.forEach(function (t) { loans[t.loan_number] = 1; }); return Object.keys(loans).length > 1;
    });
  }

  // ---------------------------------------------------------------- 2027 plan
  var PLAN = {
    year: 2027,
    fundings: { annual: 400, stretch: 420, quarters: { 1: 80, 2: 120, 3: 120, 4: 80 } },
    fileStarts: 1800, relationshipLeads: 2200,
    q1: { leads: 550, starts: 450, fundings: 80, preapprovalToContract: 60, aLevel: 21, channel: 2, bLevel: 24 },
    sources: [
      ['realtor', 'Realtor referrals', 192], ['rockford', 'Rockford Homes', 60], ['current_client', 'Current-client referrals', 30],
      ['past_client', 'Past-client referrals', 30], ['returning_client', 'Returning past clients', 40],
      ['personal_friend', 'Personal-friend referrals', 33], ['advertising', 'Advertising', 15]
    ],
    conversion: [
      ['Referred lead to 1003', 80, '80%+'], ['File start to preapproval', 55, '55%'],
      ['Preapproval to contract', 65, '65% (Q1: 60%)'], ['Contract to funding', 75, '75%']
    ],
    referrals: { ccrMonthly: 10, pcrMonthly: 10, ccrAnnual: 120, pcrAnnual: 120, fundedEach: 30, modeledYield: 25, clientReferralGoal: 30 },
    relationships: { active: 200, aLevel: 25, channel: 5, bLevel: 35 }
  };
  function pace(actual, target, range, asOf) {
    if (actual === null || actual === undefined) return { status: 'unavailable' };
    var total = daysBetween(range.start, range.end) + 1;
    if (asOf < range.start) return { status: 'not_started', target: target, gap: target, requiredPerWeek: +(target / (total / 7)).toFixed(1) };
    var elapsed = Math.min(total, daysBetween(range.start, asOf) + 1);
    var expected = target * elapsed / total;
    var remainingDays = Math.max(0, total - elapsed);
    var gap = Math.max(0, target - actual);
    return {
      status: actual >= target ? 'met' : (actual >= expected * 0.95 ? 'on_pace' : 'behind'),
      actual: actual, target: target, expected: Math.round(expected * 10) / 10, gap: gap,
      pct: target ? Math.round(100 * actual / target) : null,
      requiredPerWeek: remainingDays > 0 ? +(gap / (remainingDays / 7)).toFixed(1) : (gap > 0 ? gap : 0)
    };
  }
  function tierFromCloses(n) {
    n = Number(n);
    if (!isFinite(n)) return null;
    if (n >= 10) return 'Channel';
    if (n >= 4) return 'A';
    if (n >= 2) return 'B';
    if (n >= 1) return 'C';
    return null;
  }

  /** Display outcome for a call (post-closing outcome vocabulary). */
  function outcomeLabel(t, today) {
    if (!t) return '';
    if (t.status === 'needs_review') return 'Needs Review';
    if (t.status === 'completed') return t.referral_response === 'named_introduction' ? 'Completed — referral received' : 'Completed — no referral received';
    if (t.status === 'exception' && t.exception_kind === 'service_recovery') return 'Client concern — resolution required';
    if (t.status === 'exception') return 'Exception — ' + (t.exception_kind === 'unreachable' ? 'borrower unreachable' : 'documented circumstance');
    if (t.concern_status === 'unresolved') return 'Client concern — resolution required';
    if (today && t.due_date > today) return 'Not yet due';
    if (t.status === 'attempted') return 'Attempted — follow-up required';
    return today && t.due_date < today ? 'Overdue' : 'Due';
  }
  /** Velocify cohort stage, identical to the existing LP Conversion view: 0 lead, 1 app, 2 preapproval, 3 contract, 4 funded. */
  function velocifyStage(r) {
    var st = String(r && r.status || '').toLowerCase().trim(), rank = 0;
    if (r && (r.converted_to_app === true || r.converted_to_app === 'true' || r.app_started_at || r.file_started_at || r.started_at)) rank = 1;
    if (!rank && /started|file started|application|app taken|approval|approved|preapproval|pre-approval|ready for pack out|rfpo|submittal|submitted|submission|processing|underwrit|conditional approval|conditions|clear to close|\bctc\b|closing|funding|funded|loan closed|closed/.test(st)) rank = 1;
    if (/pre[\s-]?approval|preapproved|approved|\bapproval\b|ready for pack out|\brfpo\b|submittal|submitted|processing|underwrit|conditional|contract|clear to close|\bctc\b|received by closer|docs signing|closing|funded|loan closed|\bclosed\b/.test(st)) rank = Math.max(rank, 2);
    if (/contract|submittal|submitted|processing|underwrit|conditional|clear to close|\bctc\b|received by closer|docs signing|closing|funded|loan closed|\bclosed\b/.test(st)) rank = Math.max(rank, 3);
    if (/\bfunded\b|loan closed|\bclosed\b|funding complete/.test(st)) rank = 4;
    return rank;
  }
  function velocifyFunnel(rows) {
    var seen = {}, o = { leads: 0, apps: 0, pre: 0, shopping: 0, contracts: 0, funded: 0 };
    (rows || []).forEach(function (r) {
      var k = r.lead_key || r.id; if (k && seen[k]) return; if (k) seen[k] = 1;
      var x = velocifyStage(r); o.leads++;
      if (x >= 1) o.apps++; if (x >= 2) o.pre++; if (x === 2) o.shopping++; if (x >= 3) o.contracts++; if (x >= 4) o.funded++;
    });
    function pct(a, b) { return b ? Math.round(100 * a / b) : null; }
    o.leadToApp = pct(o.apps, o.leads); o.appToPre = pct(o.pre, o.apps); o.preToContract = pct(o.contracts, o.pre); o.contractToFunded = pct(o.funded, o.contracts);
    return o;
  }
  function referralWatch(lastLead, date) {
    var lead = toIsoDate(lastLead);
    if (!lead || lead > date) return { status: 'unknown' };
    var threshold = addDays(lead, 90);
    var remaining = daysBetween(date, threshold);
    return { status: remaining <= 0 ? 'past' : remaining <= 14 ? 'approaching' : 'current', remaining: remaining, threshold: threshold };
  }
  function velocifySources(rows) {
    var categories = { relationship: [], advertising: [], unclassified: [] };
    var sourceByLead = new Map();
    (rows || []).forEach(function (row) {
      var source = clean(row.lead_source).toLowerCase();
      var category = /^(realtor|builder|past client|current client|personal friend) referral$/.test(source) ? 'relationship' :
        /^(advertising|paid advertising|paid search|paid social)$/.test(source) ? 'advertising' : 'unclassified';
      var key = row.lead_key || row.id;
      if (!key) { categories.unclassified.push(row); return; }
      var previous = sourceByLead.get(key);
      if (!previous) sourceByLead.set(key, { row: row, category: category });
      else if (previous.category !== category) previous.category = 'unclassified';
    });
    sourceByLead.forEach(function (entry) { categories[entry.category].push(entry.row); });
    return categories;
  }
  // Existing LP scorecard methodology (unchanged): weekly rows in lp_scorecards keyed by
  // person + Monday week_key; data holds <metric>_<Day> counts; goals per LP role.
  var SCORECARD = {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    lp1: [{ key: 'apps_1003', label: "1003's", goal: 10 }, { key: 'realtor_calls', label: 'Realtor calls', goal: 100 }, { key: 'meetings', label: 'Realtor meetings scheduled', goal: 10 }],
    // Fallback only: the browser uses the tracker's live LPSC_METRICS_MAP when it is present.
    lp2: [{ key: 'past_client_talks', label: "Meaningful past-client talk-to's", goal: 10 }, { key: 'apps_1003', label: "1003's", goal: 13 }, { key: 'pre_approvals', label: 'Pre-approvals', goal: 6 }, { key: 'contracts', label: 'Contracts', goal: 3 }]
  };
  function scorecardMetrics(lp) { return lp === 'Isaak' ? SCORECARD.lp1 : SCORECARD.lp2; }
  function weekMonday(iso) { var d = dow(iso); return addDays(iso, d === 0 ? -6 : 1 - d); }
  function scorecardSummary(lp, data, liveMetrics) {
    var metrics = (liveMetrics && liveMetrics.length) ? liveMetrics : scorecardMetrics(lp), entered = false;
    var rows = metrics.map(function (m) {
      var total = 0; SCORECARD.days.forEach(function (d) { var v = parseInt((data || {})[m.key + '_' + d], 10); if (v) { total += v; } if ((data || {})[m.key + '_' + d] !== undefined && (data || {})[m.key + '_' + d] !== '') entered = true; });
      return { key: m.key, label: m.label, goal: m.goal, total: total };
    });
    var total = rows.reduce(function (a, r) { return a + r.total; }, 0), goal = rows.reduce(function (a, r) { return a + r.goal; }, 0);
    return { rows: rows, total: total, goal: goal, pct: goal ? Math.round(100 * total / goal) : null, entered: !!data && entered };
  }

  return {
    LPS: LPS, LP2S: LP2S, TZ: TZ, PLAN: PLAN, TASK_TYPES: TASK_TYPES, CHECKS: CHECKS, SCRIPT_NOTES: SCRIPT_NOTES,
    REFERRAL_7_DAYS: REFERRAL_7_DAYS, REFERRAL_12_MONTHS: REFERRAL_12_MONTHS,
    REFERRAL_RESPONSES: REFERRAL_RESPONSES, BORROWER_OUTCOMES: BORROWER_OUTCOMES, AGENT_OUTCOMES: AGENT_OUTCOMES,
    todayIso: todayIso, isoOfInstant: isoOfInstant, addDays: addDays, daysBetween: daysBetween, tuesdayOf: tuesdayOf,
    toIsoDate: toIsoDate, toIsoTimestamp: toIsoTimestamp, postCloseDue: postCloseDue, quarterOf: quarterOf,
    quarterRange: quarterRange, monthRange: monthRange, dow: dow,
    clean: clean, lpShort: lpShort, hasBuyerAgent: hasBuyerAgent, normKey: normKey,
    parsePipeline: parsePipeline, parseFunded: parseFunded,
    validateTask: validateTask, validateException: validateException, friendlyError: friendlyError,
    effectiveOwner: effectiveOwner, bucket: bucket, isIssue: isIssue, daySummary: daySummary, resolvedOn: resolvedOn,
    referralMetrics: referralMetrics, uniqueReferrals: uniqueReferrals, duplicateNotes: duplicateNotes,
    pace: pace, tierFromCloses: tierFromCloses, inRange: inRange, outcomeLabel: outcomeLabel,
    velocifyStage: velocifyStage, velocifyFunnel: velocifyFunnel, velocifySources: velocifySources, referralWatch: referralWatch, SCORECARD: SCORECARD, scorecardMetrics: scorecardMetrics,
    scorecardSummary: scorecardSummary, weekMonday: weekMonday
  };
});
