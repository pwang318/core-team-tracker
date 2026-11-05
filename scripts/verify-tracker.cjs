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
assert(html.includes('if(lp==="Isaak")return [];'), 'LP1 must not receive realtor FaceTime tasks');
assert(html.includes('id="lp-source-freshness"'), 'Team snapshot must show Power BI and Velocify freshness');
assert(html.includes("if(owner!==lp)return false;"), 'Tuesday exports must match completions only to their actual LP owner');
assert(html.includes("meta(a.notes,'TUE_PLAN_LANE')==='LP_TXN'"), 'LP Tuesday export must not include RM listing-agent plan rows');

assert(html.length > 100000, 'Tracker file unexpectedly truncated');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Tracker static checks passed: ${checked} JavaScript blocks, ${ids.length} unique page IDs, core sections present.`);
}
