'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let checked = 0;
const errors = [];
for (const [index, script] of scripts.entries()) {
  if (/\bsrc\s*=/.test(script[1])) continue;
  if (/\btype\s*=\s*["'](?:application\/json|text\/plain)/i.test(script[1])) continue;
  const id = /\bid\s*=\s*["']([^"']+)/i.exec(script[1])?.[1] ?? 'unnamed';
  try { new vm.Script(script[2], { filename: `inline-script-${index}-${id}.js` }); checked++; }
  catch (error) { errors.push(`Script ${index} (${id}): ${error.message}`); }
}
const staticMarkup = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const ids = [...staticMarkup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) errors.push('Duplicate static HTML IDs: ' + [...new Set(duplicates)].join(', '));
for (const id of ['view-lp', 'view-facetime', 'view-data-hub', 'view-snapshot', 'view-production-manager', 'v56Summary', 'v56Rows']) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id=\'${id}\'`)) errors.push('Required tracker ID missing: ' + id);
}
// Business rule regression: co-marketing aliases identify the same agent, and
// leads shared by multiple roster aliases must count exactly once.
const rosterFn = html.match(/function coMktLeadsForRoster\(roster\)\{[\s\S]*?\n\}/)?.[0];
assert(rosterFn, 'Co-marketing roster calculator missing');
const billingContext = {
  coMktLeadKeysByName: {
    'AGENT A': new Set(['L1', 'L2']),
    'A ALIAS': new Set(['L2', 'L3']),
    'AGENT B': new Set(['L3', 'L4']),
  },
  coMktClosedCounts: {'AGENT A': 2, 'A ALIAS': 1, 'AGENT B': 1},
};
vm.runInNewContext(rosterFn, billingContext);
const billing = billingContext.coMktLeadsForRoster([
  {name:'Agent A', alias:'A Alias', spend:250},
  {name:'Agent B', spend:250}
]);
assert.equal(billing.total, 4, 'Lead keys must be counted once across aliases and team members');
assert.equal(billing.perAgent[0].leads, 3, 'Unique referrals under both names must be retained');
assert.equal(billing.perAgent[1].leads, 1, 'Shared lead must not be double-counted');
assert.equal(billing.closed, 3, 'Aliases must not double-count closings');
assert(html.includes('co_marketing_partners?status=eq.active&select=partner_name,agent_roster'), 'Verified billing roster must feed co-marketing flags');
assert(html.includes('Edit partner spend · expand only when needed'), 'Co-marketing quick spend table should not dominate the default view');
assert(html.includes('Blank allocations do not mean $0 spent.'), 'Co-marketing should distinguish partner billing from unallocated agent spend');
const paceFn = html.match(/function coMktPaceMetrics\(spend,leads,asOf\)\{[\s\S]*?\n\}/)?.[0];
assert(paceFn, 'Co-marketing pacing calculator missing');
const paceContext={};
vm.runInNewContext(paceFn,paceContext);
const onNov5=new Date('2026-11-05T12:00:00');
const missingSpend=paceContext.coMktPaceMetrics(0,0,onNov5);
assert.equal(missingSpend.status,'Spend not entered','Missing spend must not be flagged as low performance');
const oneThousand=paceContext.coMktPaceMetrics(1000,3,onNov5);
assert.equal(oneThousand.expected,4,'$1,000 must expect four leads per month');
assert.equal(oneThousand.minimum,4,'80% goal must round up to four whole leads');
assert.equal(oneThousand.fullPct,75,'Three out of four is 75% full-month attainment');
assert.equal(oneThousand.status,'On track MTD','November 5 should use elapsed-month pacing');
assert.equal(paceContext.coMktPaceMetrics(1000,4,onNov5).status,'Monthly goal met','Four leads must satisfy monthly goal');
assert.equal(paceContext.coMktPaceMetrics(1000,0,onNov5).status,'Behind MTD pace','Zero leads should be behind pace');
assert(html.includes('if(lp==="Isaak")return [];'), 'LP1 must not receive realtor FaceTime tasks');
assert(html.includes('id="lp-source-freshness"'), 'Team snapshot must show Power BI and Velocify freshness');
assert(html.includes("if(owner!==lp)return false;"), 'Tuesday exports must match completions only to their actual LP owner');
assert(html.includes("meta(a.notes,'TUE_PLAN_LANE')==='LP_TXN'"), 'LP Tuesday export must not include RM listing-agent plan rows');

assert(html.includes("if(cls==='NEW_BUILD'&&((closing&&closing<todayIso)||"), 'LP new-build queue must exclude closed files');
assert(html.includes("meta(p.notes,'TXN_LOAN_STATUS')"), 'Manager new-build queue must honor loan status');
assert(html.includes('Ownership conflict — review'), 'Conflicting LP lead ownership must not be silently assigned');
assert(html.includes('id="lp-pb-reconciliation"'), 'Power BI Data Hub must reconcile source rows with unique agent profiles');
assert(html.includes('id="lp-velocify-dup-audit"'), 'Data Hub must expose Velocify duplicates and attribution issues');
assert(html.includes('source records are retained pending Velocify confirmation'), 'Do not silently erase contested Velocify rows');
const uniqueFn = html.match(/function ctUniqueVelocifyReferralRows\(rows\)\{[\s\S]*?\n\}/)?.[0];
assert(uniqueFn, 'Velocify lead deduplication missing');
const leadContext = {
  ctIsLeadAppConverted(v){return String(v.status||'').toLowerCase()==='started';},
  ctIsLeadResolved(v){return /bad lead|do not qualify/i.test(String(v.status||''));}
};
vm.runInNewContext(uniqueFn,leadContext);
const leadResult=leadContext.ctUniqueVelocifyReferralRows([
  {lead_key:'same',lp_user:'Said',status:'Started',created_at:'2026-11-02T00:00:00Z'},
  {lead_key:'same',lp_user:'Jordan',status:'Started',created_at:'2026-11-02T00:00:00Z'},
  {lead_key:'bad-conflict',lp_user:'Said',status:'Started',created_at:'2026-11-02T00:00:00Z'},
  {lead_key:'bad-conflict',lp_user:'Said',status:'Bad Lead / Fake Data',created_at:'2026-11-02T00:00:00Z'}
]);
assert.equal(leadResult.length,2,'Duplicate lead keys must count once');
assert.equal(leadResult[0].lp_user,'Ownership conflict — review','Conflicting LP owner must be flagged');
assert.equal(leadResult[1].status,'Started','An undated bad-lead duplicate cannot erase proof an application started');


assert(html.includes('active_partner_rows:acknowledged?importRaw:rows.length,score_partner_rows:scorePartners'),'LP must use source count only for explicitly acknowledged import exceptions');
assert(html.includes("if(!live.verified){const tiers=live.source_levels||{};host.innerHTML="),'LP scorecard must show raw counts but withhold weighted results on unmatched Power BI imports');
assert(html.includes('profile_rows:rows.length'),'LP must expose matched profile count separately from import rows');assert(html.includes('verified:importRaw===rows.length'),'Withhold certification while roster rows remain unmatched');
assert(html.includes('acknowledged_excluded_rows:acknowledged?4:0'),'Approved November 9 source exclusions must remain explicit');
assert(html.includes('var total=live&&(live.verified||live.acknowledged_excluded_rows===4)?Number(live.active_partner_rows):null;'),'LP summary may show explicitly acknowledged source roster, never a browser or managed count');
assert(html.includes("(total===null?'—':total)"),'LP summary must visibly withhold unverified active count');
assert(html.length > 100000, 'Tracker file unexpectedly truncated');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Tracker static checks passed: ${checked} JavaScript blocks, ${ids.length} unique page IDs, core sections present.`);
}
