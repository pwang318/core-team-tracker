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
assert(html.length > 100000, 'Tracker file unexpectedly truncated');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Tracker static checks passed: ${checked} JavaScript blocks, ${ids.length} unique page IDs, core sections present.`);
}
