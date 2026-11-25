'use strict';
// Unit tests for core/core-logic.js. Synthetic data only (no borrower data in the repo).
const assert = require('node:assert/strict');
const L = require('../core/core-logic.js');
let n = 0;
function t(name, fn) { fn(); n++; }

t('30/60/90 across month-end, leap and year-end', () => {
  assert.deepEqual(L.postCloseDue('2026-01-31'), { pc30: '2026-03-02', pc60: '2026-04-01', pc90: '2026-05-01' });
  assert.deepEqual(L.postCloseDue('2026-12-31'), { pc30: '2027-01-30', pc60: '2027-03-01', pc90: '2027-03-31' });
  assert.deepEqual(L.postCloseDue('2027-12-15'), { pc30: '2028-01-14', pc60: '2028-02-13', pc90: '2028-03-14' });
  assert.equal(L.postCloseDue('2028-01-30').pc30, '2028-02-29', 'leap day');
  assert.equal(L.postCloseDue('2026-10-31').pc30, '2026-11-30');
  assert.equal(L.postCloseDue(null), null);
});
t('Tuesday of week (Mon-Sun weeks)', () => {
  assert.equal(L.tuesdayOf('2026-11-24'), '2026-11-24');
  assert.equal(L.tuesdayOf('2026-11-23'), '2026-11-24');
  assert.equal(L.tuesdayOf('2026-11-29'), '2026-11-24', 'Sunday belongs to the week that started Monday');
  assert.equal(L.tuesdayOf('2026-12-30'), '2026-12-29');
  assert.equal(L.tuesdayOf('2027-01-01'), '2026-12-29', 'year boundary');
});
t('date parsing', () => {
  assert.equal(L.toIsoDate('2026-11-23 00:00:00'), '2026-11-23');
  assert.equal(L.toIsoDate('11/5/2026'), '2026-11-05');
  assert.equal(L.toIsoDate(46350), '2026-11-24');
  assert.equal(L.toIsoDate(' '), null);
  assert.equal(L.toIsoDate('2026-02-30'), null);
  assert.equal(L.toIsoDate(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(L.toIsoTimestamp('2026-11-18 11:23:14'), '2026-11-18T11:23:14');
});
t('today in Eastern time', () => {
  assert.equal(L.todayIso(new Date('2026-11-25T03:30:00Z')), '2026-11-24', '10:30pm ET is still the 24th');
  assert.equal(L.todayIso(new Date('2027-01-01T04:59:00Z')), '2026-12-31');
});
t('LP name mapping never guesses', () => {
  assert.equal(L.lpShort('Osgood Mcmahon'), 'Osgood');
  assert.equal(L.lpShort('Karen De La Riva'), 'Karen');
  assert.equal(L.lpShort('Dill, Gavin'), 'Gavin');
  assert.equal(L.lpShort('Said Saleh'), 'Said');
  assert.equal(L.lpShort('Jordan Johnston'), 'Jordan');
  assert.equal(L.lpShort('Jordan Holibaugh'), null, 'Realtor named Jordan is not the LP');
  assert.equal(L.lpShort('Jessica Deubner'), null, 'Loan Processor is not LP2');
  assert.equal(L.lpShort(''), null);
});
t('buyer agent placeholders', () => {
  for (const v of ['None None', 'N/A', 'NA', 'Jane Doe', '', null]) assert.equal(L.hasBuyerAgent(v), false, String(v));
  assert.equal(L.hasBuyerAgent('Kishma James'), true);
});

const pipeHeader = ['Loan Team Member Name - Loan Partner 1', 'Loan Team Member Name - Loan Partner 2', 'Est Closing Date', 'Borrower Name', 'Last Finished Milestone', 'Loan Number', 'Loan Purpose', 'Loan Amount', 'Loan Processor', 'Buyers Agent Contact Name', 'Buyers Agent Email', 'Buyers Agent Phone', 'Last Finished Milestone Date'];
t('pipeline parsing maps LP2 (not processor) and flags issues', () => {
  const r = L.parsePipeline([pipeHeader,
    ['Isaak X', 'Gavin Dill', '2026-11-27 00:00:00', 'Test, Alpha', 'Approval', 90000000001, 'Purchase', '330000', 'Jessica Deubner', 'Agent One', 'none@none.com', '000-000-0000', '2026-11-18 10:00:00'],
    ['', 'Unknown Person', '2026-12-01', 'Test, Bravo', 'Submittal', '90000000002', 'Purchase', '', 'Joseph MacQuarrie', 'None None', '', '', ''],
    ['', 'Gavin Dill', '2026-11-27', 'Test, Alpha', 'Approval', '90000000001', 'Purchase', '', '', '', '', '', ''],
    [null, null, null, null]
  ]);
  assert.equal(r.rows.length, 3);
  assert.equal(r.uniqueLoans, 2);
  assert.equal(r.rows[0].lp_short, 'Gavin');
  assert.equal(r.rows[0].loan_number, '90000000001');
  assert.equal(r.rows[0].buyer_agent_email, '', 'none@none.com placeholder dropped');
  assert.equal(r.rows[0].buyer_agent_phone, '', '000 phone placeholder dropped');
  assert.equal(r.rows[1].buyer_agent_name, '');
  assert.ok(r.issues.some(i => i.type === 'unassigned' && i.loan_number === '90000000002'));
  assert.ok(r.issues.some(i => i.type === 'duplicate'));
});
t('pipeline parsing rejects wrong report', () => {
  assert.ok(L.parsePipeline([['Agent', 'Level'], ['x', 'A']]).error);
});
t('funded parsing reconciles non-Funding milestones', () => {
  const r = L.parseFunded([
    ['Loan Number', 'Borrower Name', 'Messages', 'Last Finished Milestone', 'Loan Officer', 'Subject Property Address', 'Subject Property City', 'Subject Property State', 'Est Closing Date', 'Loan Type', 'Buyers Agent Name', 'Closed Date', 'Loan Processor', 'Referral Source Name'],
    ['91000000001', 'Test, Echo', '1', 'Funding', 'LO', '1 Main', 'Columbus', 'OH', '2026-01-02', 'FHA', 'Big Realty', '2026-01-02 00:00:00', 'P', ''],
    ['91000000002', 'Test, Golf', '', 'Completion', 'LO', '', '', '', '', '', '', '2026-06-09 00:00:00', '', ''],
    ['91000000003', 'Test, Hotel', '', 'Funding', 'LO', '', '', '', '', '', '', '', '', '']
  ]);
  assert.deepEqual(r.milestones, { Funding: 2, Completion: 1 });
  assert.ok(r.issues.some(i => i.type === 'funding_exception' && i.loan_number === '91000000002'));
  assert.ok(r.issues.some(i => i.type === 'missing_closed_date' && i.loan_number === '91000000003'));
  assert.equal(r.rows[0].closed_date, '2026-01-02');
});

const base = { task_type: 'tuesday', borrower_outcome: 'conversation', conversation_at: new Date(Date.now() - 60000).toISOString(),
  borrower_notes: 'Reviewed approval conditions and appraisal timing', service_update: 'Approval in; appraisal at value; on track',
  script_checks: { update: true, requirements_timeline: true, asked_assistance: true, referral_ask: true, offered_again: true },
  referral_requested: true, referral_response: 'asked_no_referral', agent_outcome: 'spoke', agent_notes: 'Told agent CTC expected Wednesday',
  next_action: 'Confirm CTC', next_action_date: '2026-11-25', concern_status: 'none' };
t('Tuesday validation: complete record passes', () => assert.deepEqual(L.validateTask(base, { buyer_agent_name: 'Agent One' }), []));
t('Tuesday validation: attempts are not conversations', () => {
  for (const o of ['voicemail', 'text_sent', 'no_answer']) assert.ok(L.validateTask({ ...base, borrower_outcome: o })[0].includes('Borrower conversation required'));
});
t('Tuesday validation: referral ask mandatory even with own financing', () => {
  const e = L.validateTask({ ...base, referral_response: 'own_financing', script_checks: { ...base.script_checks, referral_ask: false } });
  assert.ok(e.some(x => x.includes('referral_ask')));
  assert.ok(L.validateTask({ ...base, referral_requested: false }).some(x => x.includes('referral was requested')));
});
t('Named introduction requires a CRM reference', () => {
  const nt = { ...base, referral_response: 'named_introduction', referral_name: 'Pat Example' };
  assert.ok(L.validateTask(nt).some(x => x.includes('CRM')));
  assert.ok(L.validateTask({ ...nt, followthrough_note: 'Called Pat, 1003 set Thursday' }).some(x => x.includes('CRM')), 'follow-through alone is not enough');
  assert.deepEqual(L.validateTask({ ...nt, crm_reference: 'VEL-123' }), []);
});
t('Tuesday validation: buyer agent rules', () => {
  assert.ok(L.validateTask({ ...base, agent_outcome: 'attempted' }).some(x => x.includes('Buyer agent update')));
  assert.ok(L.validateTask({ ...base, agent_outcome: 'no_buyer_agent' }, { buyer_agent_name: 'Agent One' }).some(x => x.includes('on file')));
  assert.deepEqual(L.validateTask({ ...base, agent_outcome: 'no_buyer_agent', agent_notes: '' }, { buyer_agent_name: 'None None' }), []);
  assert.ok(L.validateTask({ ...base, agent_notes: 'short' }).some(x => x.includes('buyer agent notes')));
});
t('Unresolved concern blocks completion; exception path validates', () => {
  assert.ok(L.validateTask({ ...base, concern_status: 'unresolved', concern_notes: 'Unhappy with fees' }).some(x => x.includes('service recovery')));
  assert.equal(L.validateException({ exception_kind: 'service_recovery', exception_reason: 'Escalated to Mack, callback set', next_action_date: '2026-11-25', concern_notes: '' }).length, 1);
  assert.deepEqual(L.validateException({ exception_kind: 'service_recovery', exception_reason: 'Escalated to Mack, callback set', next_action_date: '2026-11-25', concern_notes: 'Unhappy with fee change' }), []);
});
t('Post-closing validation per call type', () => {
  const pc = { ...base, task_type: 'pc60', service_update: '', agent_outcome: null, agent_notes: '', referral_response: 'potential_opportunity',
    script_checks: { settling: true, servicing_transfer: true, mortgage_questions: true, rate_drop_na: true, referral_ask: true, offered_again: true } };
  assert.deepEqual(L.validateTask(pc), [], 'rate drop pledge N/A accepted, no buyer agent needed after closing');
  assert.ok(L.validateTask({ ...pc, referral_response: null }).some(x => x.includes('Referral response')));
  assert.ok(L.validateTask({ ...pc, task_type: 'pc30' }).some(x => x.includes('first_statement')));
  assert.ok(L.validateTask({ ...pc, task_type: 'pc90' }).some(x => x.includes('homeowner_experience')));
  assert.ok(L.validateTask({ ...pc, referral_requested: false }).some(x => x.includes('referral was requested')), 'PCR ask mandatory');
  assert.deepEqual(L.CHECKS.pc30.map(c => c[0]), ['settling', 'first_statement', 'payment_servicing', 'questions_assistance', 'referral_ask', 'offered_again']);
});
t('Day summary: carry-forward, completion and Complete state', () => {
  const today = '2026-11-24';
  const tasks = [
    { id: 1, task_type: 'tuesday', due_date: '2026-11-17', status: 'open' },
    { id: 2, task_type: 'tuesday', due_date: '2026-11-24', status: 'attempted' },
    { id: 3, task_type: 'tuesday', due_date: '2026-11-24', status: 'completed', completed_at: '2026-11-24T15:00:00Z' },
    { id: 4, task_type: 'pc30', due_date: '2026-11-28', status: 'open' },
    { id: 5, task_type: 'pc30', due_date: '2026-03-02', status: 'needs_review' },
    { id: 6, task_type: 'pc60', due_date: '2026-12-20', status: 'open' },
    { id: 7, task_type: 'tuesday', due_date: '2026-11-24', status: 'exception', exception_at: '2026-11-24T16:00:00Z', concern_status: 'unresolved' }
  ];
  const s = L.daySummary(tasks, today);
  assert.equal(s.overdue.length, 1, 'last week carried forward as overdue');
  assert.equal(s.remaining.length, 2);
  assert.equal(s.completed.length, 2);
  assert.equal(s.required.length, 4);
  assert.equal(s.pct, 50);
  assert.equal(s.upcoming.length, 1);
  assert.equal(s.issues.length, 1);
  assert.equal(s.attempted.length, 1);
  assert.equal(s.complete, false);
  const done = L.daySummary(tasks.filter(x => x.id === 3), today);
  assert.equal(done.complete, true); assert.equal(done.pct, 100);
  assert.equal(L.daySummary([], today).pct, null, 'no work is not a misleading 0%');
});
t('Late-night completion counts on the Eastern date', () => {
  const s = L.daySummary([{ task_type: 'tuesday', due_date: '2026-11-24', status: 'completed', completed_at: '2026-11-25T02:30:00Z' }], '2026-11-24');
  assert.equal(s.completed.length, 1);
});
t('Referral metrics keep compliance separate from production', () => {
  const today = '2026-11-30';
  const ts = [
    { task_type: 'tuesday', due_date: '2026-11-24', status: 'completed', borrower_outcome: 'conversation', referral_requested: true, referral_response: 'named_introduction', referral_name: 'Pat Example', referral_status: 'funded' },
    { task_type: 'tuesday', due_date: '2026-11-24', status: 'completed', borrower_outcome: 'conversation', referral_requested: true, referral_response: 'named_introduction', referral_name: ' pat  example ' },
    { task_type: 'tuesday', due_date: '2026-11-24', status: 'attempted', borrower_outcome: 'voicemail', referral_requested: false },
    { task_type: 'tuesday', due_date: '2026-11-24', status: 'open' },
    { task_type: 'tuesday', due_date: '2026-12-01', status: 'open' },
    { task_type: 'pc30', due_date: '2026-11-24', status: 'completed', borrower_outcome: 'conversation', referral_requested: true, referral_response: 'asked_no_referral' }
  ];
  const m = L.referralMetrics(ts, ['tuesday'], { start: '2026-11-01', end: '2026-11-30' }, today);
  assert.equal(m.required.length, 4, 'future work not yet required');
  assert.equal(m.askPerConversation, 100);
  assert.equal(m.askPerRequired, 50);
  assert.equal(m.named.length, 1, 'same person introduced twice counts once');
  assert.equal(m.conversionPct, 100);
  assert.equal(m.missing.length, 2);
  assert.equal(m.attempted.length, 1);
});
t('Duplicate-note detection across different loans', () => {
  const g = L.duplicateNotes([
    { owner_lp: 'Gavin', loan_number: 'A', borrower_notes: 'Gave update everything on track for closing' },
    { owner_lp: 'Gavin', loan_number: 'B', borrower_notes: 'gave update, everything on track for closing' },
    { owner_lp: 'Gavin', loan_number: 'C', borrower_notes: 'Unique note about appraisal and HOA docs' }
  ]);
  assert.equal(g.length, 1); assert.equal(g[0].length, 2);
});
t('2027 plan targets match the business plan', () => {
  const P = L.PLAN;
  assert.equal(P.fundings.annual, 400); assert.equal(P.fundings.stretch, 420);
  assert.equal(Object.values(P.fundings.quarters).reduce((a, b) => a + b, 0), 400);
  assert.equal(P.sources.reduce((a, s) => a + s[2], 0), 400);
  assert.equal(P.fileStarts, 1800); assert.equal(P.relationshipLeads, 2200);
  assert.deepEqual([P.q1.leads, P.q1.starts, P.q1.fundings], [550, 450, 80]);
  assert.deepEqual([P.referrals.ccrMonthly, P.referrals.pcrMonthly, P.referrals.ccrAnnual, P.referrals.pcrAnnual], [10, 10, 120, 120]);
  assert.equal(P.referrals.modeledYield, 25); assert.equal(P.referrals.clientReferralGoal, 30);
  assert.deepEqual(P.relationships, { active: 200, aLevel: 25, channel: 5, bLevel: 35 });
});
t('Pace math', () => {
  const q1 = L.quarterRange(2027, 1);
  assert.deepEqual(q1, { start: '2027-01-01', end: '2027-03-31' });
  assert.deepEqual(L.quarterRange(2027, 4), { start: '2027-10-01', end: '2027-12-31' });
  assert.equal(L.pace(0, 80, q1, '2026-11-24').status, 'not_started');
  const mid = L.pace(40, 80, q1, '2027-02-14');
  assert.equal(mid.status, 'on_pace');
  assert.equal(L.pace(10, 80, q1, '2027-02-14').status, 'behind');
  assert.equal(L.pace(null, 80, q1, '2027-02-14').status, 'unavailable');
  assert.equal(L.pace(80, 80, q1, '2027-03-31').status, 'met');
});
t('Tier formula (Channel 10+, A 4-9, B 2-3)', () => {
  assert.deepEqual([12, 10, 9, 4, 3, 2, 1, 0].map(L.tierFromCloses), ['Channel', 'Channel', 'A', 'A', 'B', 'B', 'C', null]);
});
t('Post-closing outcome vocabulary', () => {
  const d = '2026-11-24';
  assert.equal(L.outcomeLabel({ status: 'completed', referral_response: 'named_introduction' }, d), 'Completed — referral received');
  assert.equal(L.outcomeLabel({ status: 'completed', referral_response: 'asked_no_referral' }, d), 'Completed — no referral received');
  assert.equal(L.outcomeLabel({ status: 'attempted', due_date: d }, d), 'Attempted — follow-up required');
  assert.equal(L.outcomeLabel({ status: 'exception', exception_kind: 'service_recovery' }, d), 'Client concern — resolution required');
  assert.equal(L.outcomeLabel({ status: 'needs_review' }, d), 'Needs Review');
  assert.equal(L.outcomeLabel({ status: 'open', due_date: '2026-12-01' }, d), 'Not yet due');
});
t('Velocify funnel matches the existing LP Conversion stage rules and dedupes leads', () => {
  const f = L.velocifyFunnel([
    { lead_key: 'a', status: 'New' }, { lead_key: 'b', status: 'Started' }, { lead_key: 'c', status: 'Pre-Approved' },
    { lead_key: 'd', status: 'Under Contract' }, { lead_key: 'e', status: 'New' }, { lead_key: 'e', status: 'Funded' }
  ]);
  assert.deepEqual([f.leads, f.apps, f.pre, f.shopping, f.contracts, f.funded], [5, 4, 3, 1, 2, 1]);
  assert.equal(f.leadToApp, 80); assert.equal(f.contractToFunded, 50);
  assert.equal(L.velocifyFunnel([]).leadToApp, null, 'no data is not 0%');
  const relationship = L.velocifySources([
    { lead_key: 'x', lead_source: 'Realtor Referral', status: 'New' },
    { lead_key: 'x', lead_source: 'Realtor Referral', status: 'Under Contract' }
  ]).relationship;
  assert.equal(relationship.length, 1);
  assert.equal(L.velocifyFunnel(relationship).contracts, 1);

});
t('Tuesday attempts return on the scheduled date without counting as complete', () => {
  const call = {task_type:'tuesday',status:'attempted',borrower_outcome:'voicemail',due_date:'2026-11-24',next_action_date:'2026-11-26'};
  assert.equal(L.tuesdayFollowupScheduled(call,'2026-11-25'),true);
  assert.equal(L.bucket(call,'2026-11-25'),'upcoming');
  assert.equal(L.daySummary([call],'2026-11-25').remaining.length,0);
  assert.equal(L.daySummary([call],'2026-11-25').completed.length,0);
  assert.equal(L.bucket(call,'2026-11-26'),'due_today');
  assert.equal(L.bucket(call,'2026-11-27'),'overdue');
  assert.equal(L.bucket({...call,next_action_date:null},'2026-11-25'),'overdue');
  assert.equal(L.bucket({...call,task_type:'pc60'},'2026-11-25'),'overdue');
  assert.equal(L.bucket({...call,borrower_outcome:'conversation'},'2026-11-25'),'overdue');
});
t('Scorecard summary uses the existing metrics, goals and totals', () => {
  const s = L.scorecardSummary('Gavin', { past_client_talks_Mon: 3, past_client_talks_Tue: 2, apps_1003_Wed: 4, contracts_Fri: 1 });
  assert.equal(s.goal, 32); assert.equal(s.total, 10); assert.equal(s.pct, 31);
  assert.deepEqual(s.rows.map(r => r.key), ['past_client_talks', 'apps_1003', 'pre_approvals', 'contracts']);
  const live = L.scorecardSummary('Gavin', { x_Mon: 2 }, [{ key: 'x', label: 'X', goal: 4 }]);
  assert.equal(live.pct, 50, 'live tracker metrics take precedence');
  assert.equal(L.scorecardSummary('Isaak', {}).goal, 120);
  assert.equal(L.weekMonday('2026-11-29'), '2026-11-23'); assert.equal(L.weekMonday('2026-11-23'), '2026-11-23');
});
console.log('Core logic tests passed: ' + n);
